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
  assert.match(screen, /import\s*\{[^}]*\bplayTimerCompletionSound\b[^}]*\}\s*from\s*["']\.\.\/data\/timerSound\.ts["']/);
  const effectIndex = screen.indexOf("if (!timerRun || restRun) return;\n    const statusNow = getTaskTimerStatus(timerRun, Date.now());");
  assert.ok(effectIndex !== -1, "the sound-guard effect must exist");
  // ARC Reminders task, requirement 9: widened -- the sound is now gated
  // by the new ArcTaskReminderSettings.completionSoundEnabled toggle
  // (loaded async, documented inline) instead of playing unconditionally.
  const effectBody = screen.slice(effectIndex, effectIndex + 1100);
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
test("requirement 5/6: PostTaskRewardScreen looks up the next task via the SAME data/dailyPlan.ts resolveMostUrgentScheduledTask every other sync-fixed screen uses (Task LIVE / To-Do List / Flexible Day sync fix) -- never a second, competing 'what's next' calculation", () => {
  assert.match(rewardScreen, /import\s*\{\s*resolveMostUrgentScheduledTask\s*\}\s*from\s*["']\.\.\/data\/dailyPlan\.ts["']/);
  const fnIndex = rewardScreen.indexOf("async function advanceToNextTask");
  const fnBody = rewardScreen.slice(fnIndex, fnIndex + 1400);
  assert.ok(fnBody.includes("resolveMostUrgentScheduledTask(taskId, new Date(), activeRun)"));
  assert.ok(fnBody.includes('router.replace({ pathname, params: { id: next.task.id } })'));
});

// ARC Reminders task, requirement 8: superseded -- handleComplete's
// non-continuous fallback no longer navigates to reflect at all (it
// records the reward/sound and recomputes the one transition
// notification, staying on screen instead -- see
// live/activeTaskScreen.test.ts's own dedicated test). Part I's
// identity-insight prompt still delays reaching that same "done" state
// exactly as before; it just no longer delays a reflect navigation,
// since there isn't one any more.
test("requirement 5/6 (superseded by ARC Reminders requirement 8): handleComplete marks the task complete and, when Part I's identity-insight prompt is pending for this exact task, shows that prompt FIRST -- finishIdentityInsight (skip or continue) then recomputes the transition notification, never force-navigating to reflect", () => {
  const fnIndex = screen.indexOf("async function handleComplete()");
  const fnBody = screen.slice(fnIndex, fnIndex + 12300);
  assert.ok(fnBody.includes("completeTask(task, now)"));
  assert.ok(fnBody.includes("if (pendingTaskId === task.id) {"));
  assert.ok(fnBody.includes("setShowIdentityInsightPrompt(true)"));
  assert.ok(fnBody.includes("await recomputeTaskTransitionNotification(task.id);"));
  const finishFnIndex = screen.indexOf("async function finishIdentityInsight");
  const finishFnBody = screen.slice(finishFnIndex, finishFnIndex + 1450);
  assert.ok(
    finishFnBody.includes("await recomputeTaskTransitionNotification(task.id);"),
    "both skip and continue must still reach the same 'done' state via the shared transition-notification recompute, never a force-navigated reflect screen"
  );
  assert.ok(!finishFnBody.includes('router.replace({ pathname: "/tasks/[id]/reflect"'));
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
