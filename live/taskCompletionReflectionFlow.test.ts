import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/taskCompletionReflectionFlow.test.ts
 *
 * "Fix Task Completion Navigation and Reflection Flow" task: source-text
 * regression guard for the 8 scenarios the spec itself enumerates. The
 * actual bug: pressing "המשימה הסתיימה" left the end-of-timer prompt
 * block (ARC/Rest/"המשימה הבאה") AND the complete/next/skip button row
 * visible and tappable, because (1) handleComplete never cleared the
 * ended timer run, so `timerEnded` stayed true forever, (2) a recurring
 * task's own Task.status deliberately never becomes "completed" (so it
 * never blocks future occurrences' alarms), which meant the SEPARATE
 * button-row ternary also never hid itself for recurring tasks, and
 * (3) `router.push` (not `replace`) left the stale screen reachable via
 * Back. The fix: a new `taskCompleting` flag independently gates both
 * blocks regardless of task.status/recurrence, the ended timer run is
 * cleared via the existing clearEndedTimer() (reused, never duplicated),
 * and all 3 reflect-navigation call sites use `replace`.
 *
 * Follow-up hardening (duplicate-completion reliability review): the
 * ORIGINAL guard checked/set the `taskCompleting` useState value itself.
 * That's correct for gating the RENDER (hiding stale buttons), but a
 * `useState` setter's new value is only visible starting the next
 * render -- it is not a synchronous write. Two taps on "השלמת משימה"
 * that both fire before React has re-rendered even once would both
 * still read the OLD `taskCompleting` (false) and both proceed, each
 * independently appending its own task_completed journal entry /
 * TaskOccurrenceCompletion record -- confirmed by inspection that
 * neither data/storage.ts's appendTaskJournalEntry nor
 * appendTaskOccurrenceCompletion has any dedupe of its own (both are
 * unconditional push-and-save). So the actual idempotency guard is now
 * a plain `useRef` (`taskCompletingRef`), whose mutation is visible to
 * every synchronous caller immediately, with no render in between --
 * `taskCompleting` (state) still exists, purely to drive the render.
 * The same reasoning applies to `finishIdentityInsight` (own
 * `identityInsightFinishingRef`, guarding appendArcInsight/
 * appendArcBelief) and to SessionReflectionScreen's own `finish()`
 * (own `finishingRef`, guarding its "session_reflection" journal entry
 * and saveNewTaskReflection, neither of which is idempotent either).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/ActiveTaskScreen.tsx");
const reflectionScreen = readSource("live/SessionReflectionScreen.tsx");
const rewardScreen = readSource("live/PostTaskRewardScreen.tsx");
const postTaskRewards = readSource("arc/postTaskRewards.ts");

function sliceFn(source: string, fnStart: string, windowSize: number): string {
  const fnIndex = source.indexOf(fnStart);
  assert.ok(fnIndex !== -1, `expected to find "${fnStart}"`);
  return source.slice(fnIndex, fnIndex + windowSize);
}

// --- 1. Immediate reflection navigation after task completion ---------

test("scenario 1: handleComplete's REAL idempotency guard is the taskCompletingRef mutable ref (not the taskCompleting useState), checked and set as the very first statements, before any await -- a useState setter's new value would not even be visible to a second synchronous call before the next render, so only a ref is actually synchronous here", () => {
  // ARC Reminders task: widened -- the ref/state writes themselves are
  // unchanged, but the new soundAlreadyPlayedForThisRun/todoSplitSession
  // reads between setTaskCompleting(true) and the first real await
  // (loadTodoSplitSession()) pushed that first await further out.
  const fnBody = sliceFn(screen, "async function handleComplete()", 2300);
  const guardIndex = fnBody.indexOf("if (!task || taskCompletingRef.current) return;");
  const refSetIndex = fnBody.indexOf("taskCompletingRef.current = true;");
  const stateSetIndex = fnBody.indexOf("setTaskCompleting(true);");
  const firstAwaitIndex = fnBody.indexOf("await ");
  assert.ok(guardIndex !== -1 && refSetIndex !== -1 && stateSetIndex !== -1 && firstAwaitIndex !== -1);
  assert.ok(guardIndex < refSetIndex, "the double-tap guard must run before setting the ref");
  assert.ok(refSetIndex < stateSetIndex, "the ref must be set before the (render-only) state is set");
  assert.ok(stateSetIndex < firstAwaitIndex, "both the ref and the state must be set before the function's first await");
});

test("scenario 1: taskCompletingRef is declared with useRef (not useState) -- its whole purpose is a write that's visible to a synchronous second call with no render in between", () => {
  assert.match(screen, /const taskCompletingRef = useRef\(false\);/);
});

// ARC Reminders task, requirement 8: superseded -- the one-time
// (non-continuous, non-pending-identity-insight) path no longer
// force-navigates to reflect at all. It records the reward/sound and
// recomputes the one transition notification, staying on screen
// instead -- see live/activeTaskScreen.test.ts's own dedicated test for
// the full assertion on this exact path.
test("scenario 1 (superseded by ARC Reminders requirement 8): handleComplete's one-time path never force-navigates to the reflection route any more -- it records the reward/sound and recomputes the transition notification, staying on screen", () => {
  const fnBody = sliceFn(screen, "async function handleComplete()", 12100);
  assert.ok(!fnBody.includes('router.replace({ pathname: "/tasks/[id]/reflect", params: { id: task.id } });'));
  assert.ok(fnBody.includes("await recordSilentTaskCompletionReward(task.id, new Date());"));
  assert.ok(fnBody.includes("await recomputeTaskTransitionNotification(task.id);"));
});

// --- 2. Removal of obsolete buttons after completion -------------------

// ARC Reminders task, requirement 5/8: superseded -- the end-of-timer
// prompt block (ARC/Rest/"המשימה הבאה" choices) and the `!taskCompleting`
// gate that used to hide it are both gone. The natural timer-reaching-0
// case now auto-triggers handleComplete itself (the autoCompletedForRunId
// effect), per the user's own clarification that both completion paths
// (manual tap and timer-end) converge on one automatic behavior -- so
// there is no longer a separate choice UI to gate at all. See
// live/activeTaskScreen.test.ts's own dedicated test for the auto-trigger
// effect itself.
test("scenario 2 (superseded by ARC Reminders requirement 5/8): the end-of-timer prompt block (ARC/Rest/'המשימה הבאה' choices) no longer exists -- the natural timer-reaching-0 case auto-triggers handleComplete via the autoCompletedForRunId effect instead of rendering a choice UI to gate", () => {
  assert.ok(!screen.includes("{timerEnded && !taskCompleting && ("));
  assert.ok(!screen.includes('if (choice === "start_arc") {'));
  assert.match(screen, /const autoCompletedForRunId = useRef<string \| null>\(null\);/);
});

test("scenario 2: the complete/next/skip button row and the 'המשימה הושלמה' label are mutually exclusive, and the label is shown whenever EITHER task.status is completed OR taskCompleting is true -- the second condition is what hides the row for a RECURRING task, whose own Task.status deliberately stays 'planned'. Part 12.4: the completed state now also shows a combined '😄 מעולה · המשימה הבאה' action reusing handleNextTask, never duplicating the Complete/Skip buttons it replaces.", () => {
  const index = screen.indexOf('{!showIdentityInsightPrompt && (task.status === "completed" || taskCompleting) ? (');
  assert.ok(index !== -1);
  const elseIndex = screen.indexOf(") : !showIdentityInsightPrompt && (", index);
  assert.ok(elseIndex !== -1);
  const completedBlock = screen.slice(index, elseIndex);
  assert.ok(completedBlock.includes("styles.completedLabel"));
  assert.ok(completedBlock.includes("😄 מעולה · המשימה הבאה"));
  assert.ok(completedBlock.includes("onPress={handleNextTask}"));
  assert.ok(!completedBlock.includes("onPress={handleComplete}"), "the completed state never re-shows the Complete button");
  assert.ok(!completedBlock.includes("onPress={handleSkipTask}"), "the completed state never re-shows the Skip button");
  const notCompletedBlock = screen.slice(elseIndex, elseIndex + 1000);
  assert.ok(notCompletedBlock.includes("onPress={handleComplete}"));
  assert.ok(notCompletedBlock.includes("onPress={handleNextTask}"));
  assert.ok(notCompletedBlock.includes("onPress={handleSkipTask}"));
});

// --- 3. Correct reflection and reward sequence --------------------------

// ARC Reminders task, requirement 8: superseded -- handleComplete's
// one-time path and finishIdentityInsight no longer reach reflect at
// all. Only the continuous-routine summary branch inside handleComplete
// still does (window widened to 10700 to actually include it -- it sits
// at offset 10402, past the old 9500-char window).
test("scenario 3 (superseded by ARC Reminders requirement 8): only the continuous-routine summary branch inside handleComplete still reaches the reflection route -- the one-time path and finishIdentityInsight both recompute the transition notification instead, so there's never a second/duplicated reflection screen for an ordinary completion", () => {
  const completeBody = sliceFn(screen, "async function handleComplete()", 12100);
  const finishBody = sliceFn(screen, "async function finishIdentityInsight", 1450);
  const occurrences = [completeBody, finishBody].filter((body) =>
    body.includes('pathname: "/tasks/[id]/reflect"')
  );
  assert.equal(occurrences.length, 1, "only the continuous-routine summary branch inside handleComplete may still route to reflect");
  assert.ok(completeBody.includes("await recomputeTaskTransitionNotification(task.id);"));
  assert.ok(finishBody.includes("await recomputeTaskTransitionNotification(task.id);"));
});

test("scenario 3: finishIdentityInsight is itself guarded by its own synchronous ref (identityInsightFinishingRef), checked and set before clearPendingIdentityInsightTaskId/appendArcInsight -- a rapid double-tap on 'המשך למשימה הבאה' must never persist two ArcInsight/ArcBelief records for the same prompt", () => {
  const fnBody = sliceFn(screen, "async function finishIdentityInsight", 300);
  const guardIndex = fnBody.indexOf("if (!task || identityInsightFinishingRef.current) return;");
  const refSetIndex = fnBody.indexOf("identityInsightFinishingRef.current = true;");
  assert.ok(guardIndex !== -1 && refSetIndex !== -1);
  assert.ok(guardIndex < refSetIndex);
  assert.ok(refSetIndex < fnBody.indexOf("await clearPendingIdentityInsightTaskId();"), "the ref must be set before the first await");
});

test("scenario 3: the reflection screen's own save/skip both delegate to the SAME existing post-task-reward (smiles) screen -- goToPostTaskReward -- never a duplicated reward screen", () => {
  assert.ok(reflectionScreen.indexOf("function goToPostTaskReward()") !== -1);
  assert.ok(reflectionScreen.includes("onPress={finish}"), "the save button's finish() must itself call goToPostTaskReward");
  const finishFnIndex = reflectionScreen.indexOf("async function finish()");
  const finishFnBody = reflectionScreen.slice(finishFnIndex, finishFnIndex + 900);
  assert.ok(finishFnBody.includes("goToPostTaskReward();"));
  assert.ok(reflectionScreen.includes("onPress={goToPostTaskReward}"), "the skip link must also reach the same post-task-reward step");
});

test("scenario 3: SessionReflectionScreen's own finish() is guarded by a synchronous ref (finishingRef), since saveNewTaskReflection does not dedupe on its own -- a rapid double-tap on 'שמירה' must never create two reflection records for the same completion", () => {
  const finishFnIndex = reflectionScreen.indexOf("async function finish()");
  const finishFnBody = reflectionScreen.slice(finishFnIndex, finishFnIndex + 250);
  const guardIndex = finishFnBody.indexOf("if (finishingRef.current) return;");
  const refSetIndex = finishFnBody.indexOf("finishingRef.current = true;");
  assert.ok(guardIndex !== -1 && refSetIndex !== -1);
  assert.ok(guardIndex < refSetIndex);
  assert.ok(refSetIndex < finishFnBody.indexOf("await saveNewTaskReflection("), "the ref must be set before the first await");
});

test("scenario 3: the smiles/positive-reinforcement reward is recorded exactly once per PostTaskRewardScreen instance, guarded by a ref against React re-invoking the effect", () => {
  const fnIndex = rewardScreen.indexOf("useEffect(() => {\n    if (processedRef.current) return;");
  assert.ok(fnIndex !== -1, "the reward-recording effect must guard itself with processedRef before doing anything else");
  const body = rewardScreen.slice(fnIndex, fnIndex + 200);
  assert.ok(body.includes("processedRef.current = true;"));
});

// --- 4. Prevention of duplicate completion ------------------------------

test("scenario 4: a second call to handleComplete while taskCompletingRef is already true (a rapid double-tap -- i.e. BEFORE any render could have made the taskCompleting state visible) returns immediately, before marking the occurrence complete a second time or opening reflection twice", () => {
  const fnBody = sliceFn(screen, "async function handleComplete()", 1700);
  assert.ok(fnBody.includes("if (!task || taskCompletingRef.current) return;"));
});

test("scenario 4: the smiles reward itself is independently idempotent at the data layer (recordTaskCompletion checks processedCompletionIds for the same taskId+date eventId), so even reaching PostTaskRewardScreen twice for the same completion can never double-award", () => {
  assert.match(rewardScreen, /resolveTaskCompletionEventId\(taskId, today\)/);
  const fnIndex = postTaskRewards.indexOf("export function recordTaskCompletion(");
  assert.ok(fnIndex !== -1);
  const fnBody = postTaskRewards.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("rolled.processedCompletionIds.includes(completionEventId)"), "a repeated eventId must be recognized and short-circuited, never re-rewarded");
});

// --- 5. Correct recurring-task occurrence completion --------------------

test("scenario 5: completing a RECURRING task records only today's own TaskOccurrenceCompletion and returns Task.status to 'planned' (never 'completed'), so future occurrences' own alarms are never permanently disarmed -- taskCompleting (not task.status) is what hides this screen's own controls for that same completion, and taskCompletingRef is what guarantees appendTaskOccurrenceCompletion below runs at most once per completion", () => {
  // ARC Reminders task: widened -- upstream additions (soundAlreadyPlayedForThisRun,
  // todoSplitSession reads) pushed this branch's own real offset to ~5747.
  const fnBody = sliceFn(screen, "async function handleComplete()", 6300);
  // Smart To-Do List task, section 6: this is now an `else if` (a new
  // To-Do split-progress branch comes first), but every recurring
  // (non-split) task's own behavior is unchanged.
  assert.ok(fnBody.includes('} else if (task.recurrence.kind === "recurring") {'));
  assert.ok(fnBody.includes("appendTaskOccurrenceCompletion(createTaskOccurrenceCompletion(task.id, new Date(now)));"));
  assert.ok(
    fnBody.includes('completedTask = { ...task, status: "planned", postponementReason: null, returnAt: null, notificationId: null, notificationScheduledFor: null, updatedAt: now };')
  );
});

test("scenario 5: a one-time task's own single completion is unaffected -- it still goes through the pre-existing completeTask helper and ends up 'completed'", () => {
  // ARC Reminders task: widened -- same upstream additions as the
  // recurring-branch test above; actual offset measured at ~6020.
  const fnBody = sliceFn(screen, "async function handleComplete()", 6300);
  assert.ok(fnBody.includes("completedTask = { ...completeTask(task, now), notificationId: null, notificationScheduledFor: null };"));
});

// --- 6. Proper handling of ARC, Rest and Continue (BEFORE completion) ---

// ARC Reminders task, requirement 5/8: superseded -- the three
// timer-end choices (ARC/Rest/"המשימה הבאה") and the `endChoice` state
// that drove them are gone entirely, along with the block that used to
// gate them on `!taskCompleting`. Per the user's own clarification, the
// natural timer-reaching-0 case now goes straight to the SAME automatic
// handleComplete() the manual button calls -- there is no longer an
// intermediate choice to make "before completion."
test("scenario 6 (superseded by ARC Reminders requirement 5/8): the three timer-end choices (ARC/Rest/'המשימה הבאה') and their endChoice state no longer exist -- the natural timer-end case goes straight to the same automatic handleComplete() the manual button calls, never an intermediate choice screen", () => {
  assert.ok(!screen.includes('if (choice === "start_arc") {'));
  assert.ok(!screen.includes("setEndChoice(choice)"));
  assert.ok(!screen.includes("const [endChoice, setEndChoice]"));
});

test("scenario 6 (superseded by ARC Reminders requirement 5/8): the auto-trigger effect that replaces the old choice UI calls handleComplete() itself exactly once per ended run, guarded by autoCompletedForRunId -- never a separate, non-finalizing path", () => {
  const effectIndex = screen.indexOf("if (ended && autoCompletedForRunId.current !== timerRun.runId) {");
  assert.ok(effectIndex !== -1);
  const effectBody = screen.slice(effectIndex, effectIndex + 150);
  assert.ok(effectBody.includes("autoCompletedForRunId.current = timerRun.runId;"));
  assert.ok(effectBody.includes("handleComplete();"));
});

// --- 7. Safe Back navigation ---------------------------------------------

// ARC Reminders task, requirement 8: superseded -- handleComplete's
// normal (one-time) line and finishIdentityInsight no longer navigate to
// reflect at all (see live/postponementAndReflection.test.ts's own
// dedicated test for the same count). Only the continuous-summary branch
// remains, and it still uses `replace`, so Back still can never reach a
// stale Task LIVE screen.
test("scenario 7 (superseded by ARC Reminders requirement 8): the one remaining reflect-navigation call site in ActiveTaskScreen.tsx (the continuous-summary branch) uses router.replace, never router.push -- so pressing Back after completion can never return to the now-stale Task LIVE screen", () => {
  assert.ok(!screen.includes('router.push({ pathname: "/tasks/[id]/reflect"'), "no push-based navigation to the reflect route must remain");
  const replaceCount = screen.split('router.replace({ pathname: "/tasks/[id]/reflect"').length - 1;
  assert.equal(replaceCount, 1, "only the continuous-summary branch still navigates to reflect; handleComplete's normal line and finishIdentityInsight no longer do");
});

// --- 8. Floating-overlay cleanup after completion ------------------------

test("scenario 8: handleComplete delegates to the shared clearEndedTimer() (reused from the rest timer's own 'סיום המנוחה' button), which cancels the end-of-timer alarm, clears the persisted TaskTimerRun, and switches the floating overlay to its IDLE state -- never a separate/duplicated cleanup sequence", () => {
  // ARC Reminders task: widened -- upstream additions pushed the real
  // offset of this call to ~3183.
  const fnBody = sliceFn(screen, "async function handleComplete()", 3400);
  assert.ok(fnBody.includes("await clearEndedTimer();"));
  const clearFnBody = sliceFn(screen, "async function clearEndedTimer()", 1200);
  assert.ok(clearFnBody.includes("await clearTaskTimerRun();"));
  assert.ok(clearFnBody.includes("setTimerRun(null);"));
  // ARCHI -- Unified Floating Overlay & Mini ARC Improvements task:
  // completion leaves "no active task" too, same as skip -- the panel
  // switches to IDLE (mood row + next task) instead of disappearing.
  assert.ok(clearFnBody.includes("await showIdleFloatingOverlayPanel(nextScheduledTaskForOverlay);"));
});

test("scenario 8: handleComplete no longer calls the floating-overlay bridge a second time on its own -- clearEndedTimer is the single, shared place that does it", () => {
  const fnBody = sliceFn(screen, "async function handleComplete()", 3000);
  const occurrences = fnBody.split("hideFloatingTimerOverlay()").length - 1 + (fnBody.split("showIdleFloatingOverlayPanel(").length - 1);
  assert.equal(occurrences, 0, "handleComplete must rely entirely on clearEndedTimer's own call, never a duplicated direct call");
});
