import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/productivityUpgrade.test.ts
 *
 * Productivity & Personal Development upgrade task: source-text
 * regression guard for requirements 3 (clear end-of-timer sound,
 * played exactly once), 4 (pausing the task's own work timer during
 * ARC -- already separately covered by live/newArcLiveScreen.test.ts),
 * and 5 (auto-advance to the next task on completion, showing its
 * schedule). Requirement 1 (chronological ordering) needed no new
 * code -- arc/todaySchedule.test.ts already proves it exhaustively.
 * Requirement 2's own wiring is covered by data/taskScheduledStart.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/ActiveTaskScreen.tsx");
const rewardScreen = readSource("live/PostTaskRewardScreen.tsx");

test("requirement 3: the foreground completion sound is gated by a ref keyed on the run's own id -- never replayed on a later re-render while the end-of-timer prompt stays on screen", () => {
  assert.match(screen, /import\s*\{\s*playTimerCompletionSound\s*\}\s*from\s*["']\.\.\/data\/timerSound\.ts["']/);
  const effectIndex = screen.indexOf("if (!timerRun || restRun) return;\n    const statusNow = getTaskTimerStatus(timerRun, Date.now());");
  assert.ok(effectIndex !== -1, "the sound-guard effect must exist");
  const effectBody = screen.slice(effectIndex, effectIndex + 400);
  assert.ok(effectBody.includes("soundPlayedForRunId.current !== timerRun.runId"));
  assert.ok(effectBody.includes("soundPlayedForRunId.current = timerRun.runId"));
  assert.ok(effectBody.includes("playTimerCompletionSound()"));
});

test("requirement 3: the sound effect is skipped entirely while a rest run is active, so it can never fire for the main timer's own already-ended run while resting", () => {
  const effectIndex = screen.indexOf("if (!timerRun || restRun) return;");
  assert.ok(effectIndex !== -1);
});

// Alarm-timer integration task, requirement 6: "at completion, the
// appropriate reflection appears, then automatic transition to the
// next task" -- the "what's next" lookup itself moved from
// ActiveTaskScreen's own (now-removed) advanceToNextTask, through
// live/SessionReflectionScreen.tsx (Psychology/Smiling/Positive-
// Reinforcement task: that screen no longer performs the redirect
// itself -- see live/postponementAndReflection.test.ts), into
// live/PostTaskRewardScreen.tsx's own advanceToNextTask, which is what
// actually runs once the trainee finishes/skips the shared post-
// completion smiling/imagery/reward screen.
test("requirement 5/6: PostTaskRewardScreen looks up the next task via the SAME arc/todaySchedule.ts resolveNextTaskEntry Today's own dashboard uses -- never a second, competing 'what's next' calculation", () => {
  assert.match(rewardScreen, /import\s*\{\s*resolveNextTaskEntry\s*\}\s*from\s*["']\.\.\/arc\/todaySchedule\.ts["']/);
  const fnIndex = rewardScreen.indexOf("async function advanceToNextTask");
  const fnBody = rewardScreen.slice(fnIndex, fnIndex + 1400);
  assert.ok(fnBody.includes("resolveNextTaskEntry(allTasks, completions, taskId, new Date(), overrides)"));
  assert.ok(fnBody.includes('router.replace({ pathname, params: { id: next.task.id } })'));
});

test("requirement 5/6: handleComplete navigates to the reflection screen after marking the task complete, UNLESS Part I's identity-insight prompt is pending for this exact task -- then the reflection screen waits for that prompt to finish, never skipped outright", () => {
  const fnIndex = screen.indexOf("async function handleComplete()");
  const fnBody = screen.slice(fnIndex, fnIndex + 8000);
  assert.ok(fnBody.includes("completeTask(task, now)"));
  // Task Completion Navigation fix: `replace`, not `push` -- once
  // completed, Back must never return to the now-stale Task LIVE screen.
  assert.ok(fnBody.includes('router.replace({ pathname: "/tasks/[id]/reflect", params: { id: task.id } })'));
  assert.ok(fnBody.includes("if (pendingTaskId === task.id) {"));
  assert.ok(fnBody.includes("setShowIdentityInsightPrompt(true)"));
  const finishFnIndex = screen.indexOf("async function finishIdentityInsight");
  const finishFnBody = screen.slice(finishFnIndex, finishFnIndex + 1250);
  assert.ok(
    finishFnBody.includes('router.replace({ pathname: "/tasks/[id]/reflect", params: { id: task.id } })'),
    "both skip and continue must still eventually reach the reflection screen -- the prompt only delays it, never drops it"
  );
});

test("requirement 5: advanceToNextTask never auto-starts the next task's timer -- it only navigates to its plain screen (or that task's own ARC window), with no autoStart param", () => {
  const fnIndex = rewardScreen.indexOf("async function advanceToNextTask");
  const fnBody = rewardScreen.slice(fnIndex, fnIndex + 500);
  assert.ok(!fnBody.includes("autoStart"), "the next task's timer must only start when the trainee explicitly starts it");
});

test("requirement 5: a 'planned' task not yet due shows how long until it starts, using the exact same clock reading arc/todaySchedule.ts's own bucketing uses", () => {
  assert.ok(screen.includes('task.status === "planned" ? resolveTaskClockTime(task, todayLocalDateString(new Date(now))) : null'));
  assert.ok(screen.includes("secondsUntilStart !== null && secondsUntilStart > 0"));
  assert.ok(screen.includes("מתחיל בעוד"));
});
