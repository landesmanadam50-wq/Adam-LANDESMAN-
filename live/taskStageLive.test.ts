import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/taskStageLive.test.ts
 *
 * Unified Task Stages task: source-text regression guard for
 * live/ActiveTaskScreen.tsx's own stage-aware timer/✓-completion
 * wiring -- not callable from a plain `node --test` run (React Native
 * component, same convention as every other screen test). The pure
 * stage/progress model is exercised directly in arc/taskStage.test.ts
 * and arc/taskStageProgress.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/ActiveTaskScreen.tsx");

// --- performStart: first stage's own duration, fresh progress ---

test("performStart starts the FIRST configured stage's own duration (never the whole task's total at once) and creates a fresh TaskStageProgress for it -- a legacy (no stages) task falls back to task.expectedDurationMinutes exactly as before", () => {
  const fnIndex = screen.indexOf("async function performStart()");
  // Window widened (9900 -> 10700 -> 11000): Action-Based Tasks task's
  // own recomputeTaskMemoryReminderNotification call/comment, then
  // ARCHI -- Replan Time task's own recomputeReplanTimeNotification
  // call/comment, both inserted near the top of performStart, pushed
  // every later line further from the anchor.
  const fnBody = screen.slice(fnIndex, fnIndex + 11000);
  assert.ok(fnBody.includes("const staged = hasConfiguredActionStages(task.actionStages);"));
  assert.ok(fnBody.includes("const firstStage = staged ? resolveFirstActionStage(task.actionStages!) : null;"));
  // Smart To-Do List task, section 6, and ARCHI -- To-Do Bank +
  // Duration/Split Selection task, section 3/4: the duration
  // calculation also checks pendingSplitSegment/isTodoSplit now, but
  // still falls back to task.expectedDurationMinutes ?? 25 for every
  // ordinary (non-split, non-staged) task exactly as before. firstStage
  // still takes priority over both.
  assert.ok(
    fnBody.includes(
      "const durationMinutes = firstStage\n      ? firstStage.durationMinutes\n      : pendingSplitSegment\n      ? pendingSplitSegment.durationMinutes\n      : isTodoSplit\n      ? splitMinutes\n      : task.expectedDurationMinutes ?? 25;"
    )
  );
  assert.ok(fnBody.includes("const freshStageProgress = firstStage ? createTaskStageProgress(task.id, firstStage.id) : null;"));
  assert.ok(fnBody.includes("await saveTaskStageProgress(freshStageProgress);"));
});

// --- handleCompleteStage: idempotency, advance vs. final completion ---

test("handleCompleteStage guards against a second call before state catches up (completingStage) AND against re-completing an already-completed active stage -- 'repeated taps cannot complete multiple stages accidentally'", () => {
  const fnIndex = screen.indexOf("async function handleCompleteStage()");
  const fnBody = screen.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("if (!task || !timerRun || !stageProgress || completingStage) return;"));
  assert.ok(fnBody.includes("if (isStageCompleted(stageProgress, stageProgress.activeStageId)) return;"));
});

test("handleCompleteStage never requires the timer to reach zero -- it checks no remaining-time condition at all, only stage completion state", () => {
  const fnIndex = screen.indexOf("async function handleCompleteStage()");
  const fnBody = screen.slice(fnIndex, fnIndex + 2000);
  assert.ok(!fnBody.includes("remainingSeconds <= 0"));
  assert.ok(!fnBody.includes("status.complete"));
});

test("when there IS a next stage, handleCompleteStage advances progress and starts that stage's own fresh TaskTimerRun -- the SAME single slot (saveTaskTimerRun), never a second/competing timer", () => {
  const fnIndex = screen.indexOf("async function handleCompleteStage()");
  const fnBody = screen.slice(fnIndex, fnIndex + 2000);
  assert.ok(fnBody.includes("const nextStage = resolveNextActionStage(stages, stageProgress.activeStageId);"));
  assert.ok(fnBody.includes("const advancedProgress = advanceStageProgress(completedProgress, nextStage.id);"));
  assert.ok(fnBody.includes("const nextRun = createTaskTimerRun(task.id, generateTaskTimerRunId(), nextStage.durationMinutes, new Date().toISOString());"));
  assert.ok(fnBody.includes("await saveTaskTimerRun(nextRunWithNotification);"));
  assert.ok(fnBody.includes("await updateFloatingTimerOverlay(nextRunWithNotification, task, advancedProgress, nextScheduledTaskForOverlay);"));
});

test("completing the trigger or small action never marks the whole task complete -- only when nextStage is null (the main action was just completed) does this delegate to the EXISTING handleComplete(), never a second/competing completion path", () => {
  const fnIndex = screen.indexOf("async function handleCompleteStage()");
  const fnBody = screen.slice(fnIndex, fnIndex + 2000);
  assert.ok(fnBody.includes("if (!nextStage) {"));
  assert.ok(fnBody.includes("await handleComplete();"));
  // Must never call completeTask/upsertTask with a "completed" status directly from this function -- that stays entirely inside handleComplete.
  const finalBranchIndex = fnBody.indexOf("if (!nextStage) {");
  const finalBranchBody = fnBody.slice(finalBranchIndex, finalBranchIndex + 200);
  assert.ok(!finalBranchBody.includes("completeTask("));
});

test("handleCompleteStage never calls any reward/reinforcement function itself (recordSilentTaskCompletionReward, resolveContinuousRoutineOutcome) -- those stay entirely inside the one shared handleComplete(), so completing the main stage can never double-award a smile or a duplicate completion record", () => {
  const fnIndex = screen.indexOf("async function handleCompleteStage()");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(!fnBody.includes("recordSilentTaskCompletionReward("));
  assert.ok(!fnBody.includes("resolveContinuousRoutineOutcome("));
});

test("handleCompleteStage cancels the current stage's own timer-end alarm before advancing or completing -- the SAME cancelTaskTimerEndAlarm every other end-of-run path already uses", () => {
  const fnIndex = screen.indexOf("async function handleCompleteStage()");
  const fnBody = screen.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("await cancelTaskTimerEndAlarm(timerRun.notificationId);"));
});

// --- The ✓ button: Task LIVE screen + deep link from the floating overlay ---

test("a ✓ button is rendered in the active-timer block, calling handleCompleteStage, ONLY when a stage is actually active -- a legacy task's screen never shows it", () => {
  assert.match(screen, /\{activeStage && \(\s*<Pressable style=\{\[styles\.primaryButton, completingStage && styles\.disabledButton\]\} onPress=\{handleCompleteStage\} disabled=\{completingStage\}>/);
});

test("the floating overlay's own ✓ button deep-links here with completeStage=1, consumed by the SAME auto-action effect that already handles needArc=1 and autoStart -- checked before the generic 'timer already running' early-return, since this action is only meaningful while a timer IS running", () => {
  const effectIndex = screen.indexOf("if (autoActionConsumed.current) return;");
  const effectBody = screen.slice(effectIndex, effectIndex + 4400);
  const completeStageIndex = effectBody.indexOf("if (completeStage) {");
  const timerRunningIndex = effectBody.indexOf("if (timerRun || restRun) {");
  assert.ok(completeStageIndex !== -1 && timerRunningIndex !== -1 && completeStageIndex < timerRunningIndex);
  assert.ok(effectBody.slice(completeStageIndex, completeStageIndex + 150).includes("handleCompleteStage();"));
});

test("completeStage is accepted as a prop, defaulting to false, so every pre-existing call site (no deep link) is unaffected", () => {
  assert.match(screen, /completeStage = false,/);
  assert.match(screen, /completeStage\?: boolean;/);
});

// --- Current action / next action / overall progress display ---

test("the top-of-screen action label shows the ACTIVE STAGE's own description (never task.currentAction) once stages are active, with the pre-existing label/value shown unchanged for a legacy task", () => {
  assert.ok(screen.includes('{activeStage ? "הפעולה הנוכחית" : "הפעולה הראשונה"}'));
  assert.ok(screen.includes("{activeStage ? activeStage.description : task.currentAction ?? task.firstAction}"));
});

test("the next stage's own description is shown in a distinct hint line, and overall progress is the completed/total MINUTES readout -- both only rendered once a stage is active", () => {
  assert.ok(screen.includes("{nextStageAfterActive && <Text style={styles.hint}>{`הפעולה הבאה: ${nextStageAfterActive.description}`}</Text>}"));
  assert.ok(screen.includes("התקדמות במשימה: ${completedStageMinutes} מתוך ${totalStageMinutes} דקות"));
});

// --- Clearing stage progress alongside the timer run ---

// ARC Reminders task, requirement 5/8: superseded -- the whole
// end-of-timer choice UI (ARC/Rest/"המשימה הבאה", including the
// 'start_arc' end-choice and its own rest-starting choice, which used
// to use a local `minutes` const) is gone entirely. clearEndedTimer is
// now the ONLY remaining place that resets stageProgress to null -- the
// standalone "break" calendar entry's own rest timer (performStart,
// using its own `restMinutes` const) is a different, pre-existing path
// that was never part of the end-of-timer prompt and never touched
// stageProgress either.
test("ARC Reminders task, requirement 5/8 (superseded): the 'start_arc' end-choice and the end-of-timer rest-starting choice no longer exist -- clearEndedTimer is now the ONLY place that resets stageProgress to null", () => {
  assert.ok(!screen.includes('if (choice === "start_arc")'));
  const clearIndex = screen.indexOf("async function clearEndedTimer()");
  assert.ok(screen.slice(clearIndex, clearIndex + 500).includes("setStageProgress(null);"));
  const occurrences = screen.split("setStageProgress(null);").length - 1;
  assert.equal(occurrences, 1, "clearEndedTimer must be the only remaining call site now that the end-of-timer choice UI is gone");
});

// --- Floating overlay stays in sync with the full screen's own stage state ---

test("entering ARC from ANY stage (handleNeedArc) only ever pauses the current timer run -- it never touches TaskStageProgress, so returning from ARC resumes at exactly the same active stage, regardless of which stage was active when ARC was entered", () => {
  const fnIndex = screen.indexOf("async function handleNeedArc()");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(!fnBody.includes("setStageProgress"));
  assert.ok(!fnBody.includes("saveTaskStageProgress"));
  assert.ok(fnBody.includes("await handlePause();"));
});

test("reload() loads the persisted TaskStageProgress alongside the TaskTimerRun, scoped to this exact task, and restores it into the overlay payload -- a process restart mid-stage resumes at the correct active stage in BOTH places", () => {
  const reloadIndex = screen.indexOf("const reload = useCallback");
  const reloadBody = screen.slice(reloadIndex, reloadIndex + 4900);
  assert.ok(reloadBody.includes("loadTaskStageProgress()"));
  assert.ok(reloadBody.includes('setStageProgress(taskMatch && loadedStageProgress && loadedStageProgress.taskId === taskId ? loadedStageProgress : null);'));
});
