import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/taskContinuationLoopScreen.test.ts
 *
 * ARCHI -- Adaptive Task Execution & Emotional Persistence task,
 * sections 6-12: source-text regression guard for
 * live/ActiveTaskScreen.tsx's new Task LIVE continuation loop --
 * natural timer-end behavior reversal, the yes/no menu, in-loop
 * breaks/ARC, task shrinking, finish/hard-stop/user-stop, and
 * never-losing-worked-time.
 */
function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const screen = readSource("live/ActiveTaskScreen.tsx");

test("imports every continuation-loop primitive from the exact Phase 1 module -- never a second, parallel state machine", () => {
  assert.match(screen, /from ["']\.\.\/arc\/taskContinuationLoop\.ts["']/);
  for (const fn of ["enterArc", "enterBreak", "endTaskContinuationLoop", "exitArcBackToLoop", "exitBreak", "recordSegmentEnd", "resolveLoopHardStopMinutes", "startNextSegment", "startTaskContinuationLoop"]) {
    assert.ok(screen.includes(fn), `missing import/use of ${fn}`);
  }
  assert.ok(screen.includes('import { suggestNextSegmentMinutes } from "../arc/taskContinuationSuggestion.ts";'));
});

test("section 7 (behavior reversal): a configured-stages or mid-split task still falls through to the real handleComplete() on natural timer end, but every OTHER (plain) task enters the continuation loop instead", () => {
  const effectIndex = screen.indexOf("if (!ended || autoCompletedForRunId.current === timerRun.runId) return;");
  assert.ok(effectIndex !== -1);
  const effectBody = screen.slice(effectIndex, effectIndex + 1100);
  assert.ok(effectBody.includes('const stageActive = !!(stageProgress && task && stageProgress.taskId === task.id);'));
  assert.ok(effectBody.includes('const splitActive = !!(task && task.isTodoItem && splitProgress && splitProgress.taskId === task.id);'));
  assert.ok(effectBody.includes("if (task && !stageActive && !splitActive && continuationHandledForRunId.current !== timerRun.runId) {"));
  assert.ok(effectBody.includes("void handleTimerNaturalEndForContinuationLoop(statusNow.elapsedSeconds);"));
  assert.ok(effectBody.includes("autoCompletedForRunId.current = timerRun.runId;"));
  assert.ok(effectBody.includes("handleComplete();"));
});

test("the just-ended segment's REAL elapsed seconds are recorded into the loop (never lost, section 12), resuming an existing loop (by taskId OR activeTaskId -- covers the shrunk-child case) rather than always starting a fresh one", () => {
  const fnIndex = screen.indexOf("async function handleTimerNaturalEndForContinuationLoop");
  const fnBody = screen.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("existing && existing.phase !== \"ended\" && (existing.taskId === task.id || existing.activeTaskId === task.id) ? existing : startTaskContinuationLoop(task.id, nowIso)"));
  assert.ok(fnBody.includes("recordSegmentEnd(base, elapsedSeconds, nowIso)"));
  assert.ok(fnBody.includes("await saveTaskContinuationLoop(loop);"));
  assert.ok(fnBody.includes("await clearEndedTimer();"));
});

test("the loop is loaded on every reload()/focus (section 11: survives app close/reopen), and an 'arc' phase is auto-exited back to the menu on return -- the ARC-context-passing fallback", () => {
  assert.ok(screen.includes("loadTaskContinuationLoop().then((loop) => {"));
  assert.ok(screen.includes('if (loop.phase === "arc") {'));
  assert.ok(screen.includes("const exited = exitArcBackToLoop(loop, new Date().toISOString());"));
});

test("every 'yes' continuation option funnels through ONE startLoopSegment call, clamped against the real free time via resolveLoopHardStopMinutes -- never exceeding the next scheduled task's own start", () => {
  const fnIndex = screen.indexOf("async function startLoopSegment");
  const fnBody = screen.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("await resolveContinuationFreeMinutes(continuationLoop)"));
  assert.ok(fnBody.includes("Math.max(1, Math.min(requestedMinutes, freeMinutes))"));
  assert.ok(fnBody.includes("startNextSegment(continuationLoop, continuationLoop.activeTaskId, nowIso)"));
  assert.ok(fnBody.includes('createTaskTimerRun(continuationLoop.activeTaskId, generateTaskTimerRunId(), clamped, nowIso)'));
  assert.ok(screen.includes("async function handleContinuationContinueSame()"));
  assert.ok(screen.includes("async function handleContinuationSuggestedShorter()"));
  assert.ok(screen.includes("async function handleContinuationAnotherSegment()"));
  assert.ok(screen.includes("async function handleContinuationCustomDuration()"));
  assert.ok(screen.includes("suggestNextSegmentMinutes(lastLoopSegmentMinutes(continuationLoop))"));
});

test("in-loop break: enterBreak + a real 'rest'-kind TaskTimerRun, reusing the exact same createTaskTimerRun/playBreakStartSound pair every other rest entry point already uses -- never a second rest implementation", () => {
  const fnIndex = screen.indexOf("async function handleContinuationBreak");
  const fnBody = screen.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("enterBreak(continuationLoop, nowIso)"));
  assert.ok(fnBody.includes('createTaskTimerRun(continuationLoop.activeTaskId, generateTaskTimerRunId(), restMinutes, nowIso, "rest")'));
  assert.ok(fnBody.includes("await playBreakStartSound(await loadBreakSoundEnabled());"));
});

test("exiting an in-loop break ALWAYS returns to the SAME continuation menu (exitBreak), never losing task context -- reached both by a manual tap and automatically once the rest run ends naturally", () => {
  const fnIndex = screen.indexOf("async function handleExitLoopBreak");
  const fnBody = screen.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("await clearEndedTimer();"));
  assert.ok(fnBody.includes("exitBreak(continuationLoop, nowIso)"));
  const autoEffectIndex = screen.indexOf('continuationLoop.phase !== "break") return;');
  assert.ok(autoEffectIndex !== -1);
  const autoEffectBody = screen.slice(autoEffectIndex, autoEffectIndex + 400);
  assert.ok(autoEffectBody.includes("void handleExitLoopBreak();"));
  assert.ok(screen.includes("if (continuationLoop && continuationLoop.phase === \"break\") {\n                    await handleExitLoopBreak();"));
});

test("in-loop ARC: enterArc's own no-op-if-already-arc guard is relied on (never a second guard here), and the three ARC entry points (full/shortened/urge) all reuse the existing routing module -- never a second ARC chooser", () => {
  const fnIndex = screen.indexOf("async function handleContinuationArc");
  const fnBody = screen.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes('enterArc(continuationLoop, track === "urge" ? "full" : track, nowIso)'));
  assert.ok(fnBody.includes("await openFullArc(continuationLoop.activeTaskId);"));
  assert.ok(fnBody.includes("await openUrgeArc(continuationLoop.activeTaskId);"));
  assert.ok(fnBody.includes("await openShortenedArc(continuationLoop.activeTaskId);"));
  assert.ok(screen.includes('import { openFullArc, openShortenedArc, openUrgeArc } from "../data/emotionalCheckInRouting.ts";'));
});

test("in-loop task shrinking mirrors live/TaskAdaptationScreen.tsx's own idiom inline (buildAdaptedTaskDraft + clamp + upsertTask) -- the ORIGINAL task is never mutated, and the new child task's own id becomes the loop's activeTaskId before navigating there with autoStart=1", () => {
  const fnIndex = screen.indexOf("async function handleContinuationShrinkConfirm");
  const fnBody = screen.slice(fnIndex, fnIndex + 1000);
  assert.ok(fnBody.includes("buildAdaptedTaskDraft(task, clamped, continuationShrinkTextDraft.trim() || task.firstAction, nowIso)"));
  assert.ok(fnBody.includes("await upsertTask(draft);"));
  assert.ok(fnBody.includes("startNextSegment(continuationLoop, draft.id, nowIso)"));
  assert.ok(fnBody.includes('router.replace({ pathname: "/tasks/[id]", params: { id: draft.id, autoStart: "1" } });'));
  assert.ok(!fnBody.includes("upsertTask(task)"));
});

test("'סיום' (finish) ends the loop with reason 'completed' (tri-state: fully-completed), archives it to history BEFORE clearing the live slot, then calls the REAL handleComplete()", () => {
  const fnIndex = screen.indexOf("async function handleContinuationFinish");
  const fnBody = screen.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes('endTaskContinuationLoop(continuationLoop, "completed", nowIso)'));
  assert.ok(fnBody.includes("await appendTaskContinuationLoopHistoryEntry(ended);"));
  const historyIndex = fnBody.indexOf("appendTaskContinuationLoopHistoryEntry");
  const clearIndex = fnBody.indexOf("clearTaskContinuationLoop()");
  assert.ok(historyIndex !== -1 && clearIndex !== -1 && historyIndex < clearIndex, "history must be archived before the live slot is cleared");
  assert.ok(fnBody.includes("await handleComplete();"));
});

test("the no-next-task case's own manual end ('user_stopped' -- tri-state: user-stopped, never read as failure) never calls handleComplete -- the trainee explicitly stopped without finishing", () => {
  const fnIndex = screen.indexOf("async function handleContinuationUserStop");
  const fnBody = screen.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes('endTaskContinuationLoop(continuationLoop, "user_stopped", nowIso)'));
  assert.ok(!fnBody.includes("handleComplete()"));
});

test("the hard stop ('next_task_boundary' -- tri-state: partial) hands off to the EXISTING next-task mechanism (navigateToNextOrTasksList), the same one the in-screen 'המשימה הבאה' button already uses -- never a second navigation path, and never calls handleComplete (the task may stay incomplete)", () => {
  const fnIndex = screen.indexOf("async function handleContinuationHardStop");
  const fnBody = screen.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes('endTaskContinuationLoop(continuationLoop, "next_task_boundary", nowIso)'));
  assert.ok(fnBody.includes("await navigateToNextOrTasksList(activeTaskId);"));
  assert.ok(!fnBody.includes("handleComplete()"));
});

test("the hard-stop check runs only while the menu is idle (choosing_action) -- every segment-start is already clamped against the same free-time computation, so an active segment never itself runs past the boundary", () => {
  const effectIndex = screen.indexOf('if (!continuationLoop || continuationLoop.phase !== "choosing_action") return;');
  assert.ok(effectIndex !== -1);
  const effectBody = screen.slice(effectIndex, effectIndex + 500);
  assert.ok(effectBody.includes("resolveContinuationFreeMinutes(continuationLoop).then((freeMinutes) => {"));
  assert.ok(effectBody.includes("if (freeMinutes !== null && freeMinutes <= 0) {"));
  assert.ok(effectBody.includes("void handleContinuationHardStop();"));
});

test("the continuation menu itself is only rendered while the loop is idle (choosing_action) and no rest run is active -- never stacked with the plain timer block or the pre-start Start/Postpone block", () => {
  const menuIndex = screen.indexOf('{continuationLoop && continuationLoop.phase === "choosing_action" && !restRun && (');
  assert.ok(menuIndex !== -1);
  assert.ok(screen.includes("{!showIdentityInsightPrompt && !timerRun && !restRun && !timerEnded && !continuationLoop && ("));
  const menuBlock = screen.slice(menuIndex, menuIndex + 4600);
  assert.ok(menuBlock.includes("handleContinuationContinueSame"));
  assert.ok(menuBlock.includes("handleContinuationSuggestedShorter"));
  assert.ok(menuBlock.includes("handleContinuationAnotherSegment"));
  assert.ok(menuBlock.includes("handleContinuationBreak(minutes)"));
  assert.ok(menuBlock.includes('handleContinuationArc("full")'));
  assert.ok(menuBlock.includes('handleContinuationArc("shortened")'));
  assert.ok(menuBlock.includes('handleContinuationArc("urge")'));
  assert.ok(menuBlock.includes("handleContinuationFinish"));
  assert.ok(menuBlock.includes("setShowContinuationShrink(true)"));
  assert.ok(menuBlock.includes("handleContinuationShrinkConfirm"));
  assert.ok(menuBlock.includes("!nextScheduledTask && ("), "the manual end-session button only shows when there is no next scheduled task today");
  assert.ok(menuBlock.includes("handleContinuationUserStop"));
});

test("the ARCHI -- Adaptive Task Execution & Emotional Persistence task's own section-4 ARC-return redirect never fires for an ordinary visit -- it is gated strictly on a matching, still-awaiting pending record", () => {
  const effectIndex = screen.indexOf("loadSupportiveActionFlowPending().then((pending) => {");
  const effectBody = screen.slice(effectIndex, effectIndex + 300);
  assert.ok(effectBody.includes("pending.taskId === task.id && pending.awaitingArcReturn"));
});
