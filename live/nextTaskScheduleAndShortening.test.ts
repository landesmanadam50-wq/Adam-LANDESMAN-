import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/nextTaskScheduleAndShortening.test.ts
 *
 * Lock-Screen Timer, Next-Task Schedule and Smart Alarm Conflict
 * Management task: source-text regression guard for
 * live/ActiveTaskScreen.tsx's own UI wiring (requirements 2+4) -- the
 * "next scheduled task" display on both the pre-start (Task Details)
 * and active (Task LIVE) renders, and the shorten/reschedule/adjust/
 * continue contextual section. No React Native component test
 * renderer exists in this codebase, so this checks the real source
 * text, matching every other screen test's own convention. The
 * underlying PURE logic (resolveNextScheduledTaskAfter,
 * isScheduledPlanEntryOverdue, isAnotherTaskActive,
 * shortenTaskTimerRun) has its own genuine unit tests in
 * arc/dailyPlan.test.ts and arc/taskTimer.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/ActiveTaskScreen.tsx");

test("imports the one shared next-scheduled-task resolver (data/dailyPlan.ts) and the shared conflict/shorten primitives -- never a second, re-derived algorithm", () => {
  assert.ok(screen.includes('import { resolveNextScheduledTaskDisplay } from "../data/dailyPlan.ts";'));
  assert.match(screen, /import\s*\{[\s\S]*?shortenTaskTimerRun[\s\S]*?\}\s*from\s*["']\.\.\/arc\/taskTimer\.ts["']/);
});

test("requirement 2: refreshNextScheduledTask resolves via resolveNextScheduledTaskDisplay, excluding THIS task's own id -- never showing itself as its own next task", () => {
  const fnIndex = screen.indexOf("const refreshNextScheduledTask = useCallback");
  const fnBody = screen.slice(fnIndex, fnIndex + 250);
  assert.ok(fnBody.includes("const next = await resolveNextScheduledTaskDisplay(taskId, new Date());"));
  assert.ok(fnBody.includes("setNextScheduledTask(next);"));
});

test("requirement 2: reload() refreshes the next-scheduled-task on every focus, never only once at mount", () => {
  const reloadIndex = screen.indexOf("const reload = useCallback");
  const reloadBody = screen.slice(reloadIndex, reloadIndex + 5600);
  assert.ok(reloadBody.includes("refreshNextScheduledTask();"));
});

test("test 4 (Task LIVE) + test 5 (Task Details): the next-task line is rendered on BOTH the pre-start block and the active-timer block, each showing the title + effective start time, or the empty-state 'אין משימה נוספת מתוכננת' when none exists -- never modifies the schedule merely by displaying it", () => {
  const preStartIndex = screen.indexOf("{!showIdentityInsightPrompt && !timerRun && !restRun && !timerEnded && (");
  const preStartBlock = screen.slice(preStartIndex, preStartIndex + 1200);
  assert.ok(preStartBlock.includes("nextScheduledTask ? ("));
  assert.ok(preStartBlock.includes("המשימה הבאה: ${nextScheduledTask.task.title}"));
  assert.ok(preStartBlock.includes("אין משימה נוספת מתוכננת"));

  const activeBlockIndex = screen.indexOf("{!timerEnded && !restRun && timerRun && !timerRunEnded && status && (");
  const activeBlock = screen.slice(activeBlockIndex, activeBlockIndex + 1200);
  assert.ok(activeBlock.includes("nextScheduledTask ? ("));
  assert.ok(activeBlock.includes("המשימה הבאה: ${nextScheduledTask.task.title}"));
  assert.ok(activeBlock.includes("אין משימה נוספת מתוכננת"));

  assert.ok(!preStartBlock.includes("saveTaskOccurrenceOverrides") && !activeBlock.includes("saveTaskOccurrenceOverrides"), "merely rendering the next-task line must never itself write any override/alarm state");
});

test("requirement 2 ('clearly indicate overdue'): both renders append the '(באיחור)' marker only when nextTaskIsOverdue, derived from the one shared nextStartMinutes/nowMinutes comparison, never a second re-derivation", () => {
  assert.ok(screen.includes("const nextStartMinutes = nextScheduledTask?.effectiveStartTime ? parseClockTimeToMinutes(nextScheduledTask.effectiveStartTime) : null;"));
  assert.ok(screen.includes("const nextTaskIsOverdue = nextStartMinutes !== null && nowMinutes > nextStartMinutes;"));
  const occurrences = screen.split('{nextTaskIsOverdue ? " (באיחור)" : ""}').length - 1;
  assert.equal(occurrences, 2, "both the pre-start and active renders must show the overdue marker");
});

test("requirement 1: every showFloatingTimerOverlay/updateFloatingTimerOverlay call site threads the next-scheduled-task payload through -- the lock-screen notification must stay in sync with the SAME resolved next task the on-screen UI shows, never a separately-computed one", () => {
  const callSites = screen.match(/(?:show|update)FloatingTimerOverlay\([^)]*\)/g) ?? [];
  assert.ok(callSites.length >= 8, "expected at least 8 overlay call sites");
  for (const call of callSites) {
    assert.ok(
      call.includes("nextScheduledTaskForOverlay") || call.includes("nextScheduledTaskForOverlayRef.current"),
      `every overlay call site must pass the next-scheduled-task payload: ${call}`
    );
  }
});

// --- Task Shortening/Rescheduling UI (requirement 4 / section 5) ---

test("showAdjustSection is true only while a real (non-rest, non-ended) task timer is active, a next task exists with a known effective time, it hasn't been explicitly dismissed for THIS next task, AND the active task's time has reached/is projected to reach the next task's own start -- never shown merely because a next task exists", () => {
  assert.ok(screen.includes("!restRun &&\n    timerRun !== null &&\n    !timerRunEnded &&\n    nextScheduledTask !== null &&\n    nextStartMinutes !== null &&\n    dismissedAdjustSectionForTaskId !== nextScheduledTask.task.id &&\n    (nowMinutes >= nextStartMinutes || (activeExpectedEndMinutes !== null && activeExpectedEndMinutes >= nextStartMinutes));"));
});

test("option A (shorten current task): shortenTaskTimerRun reduces durationMinutes by the chosen amount, re-arms the timer-end alarm for the new remaining time, and asks for explicit confirmation first when the new end time has ALREADY passed -- never auto-completing the task itself", () => {
  const fnIndex = screen.indexOf("async function handleShortenCurrentTask");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("const newDuration = Math.max(0, timerRun.durationMinutes - minutesToRemove);"));
  assert.ok(fnBody.includes("if (status.elapsedSeconds >= newDuration * 60) {"));
  assert.ok(fnBody.includes("const confirmed = await confirmAsync("));
  assert.ok(fnBody.includes("if (!confirmed) return;"));
  assert.ok(fnBody.includes("await cancelTaskTimerEndAlarm(timerRun.notificationId);"));
  assert.ok(fnBody.includes("const shortened = shortenTaskTimerRun(timerRun, newDuration);"));
  assert.ok(fnBody.includes("const notificationId = await scheduleTaskTimerNotification(shortened, task);"));
  assert.ok(fnBody.includes("await saveTaskTimerRun(shortenedWithNotification);"));
  assert.ok(!fnBody.includes("completeTask(") && !fnBody.includes("handleComplete()"), "shortening must never itself mark the task complete");
});

test("option B (reschedule the next task): a recurring task gets a TODAY-ONLY TaskOccurrenceOverride (the permanent template, `target`, is never written to for its scheduledTime) -- a one-time task's own record is edited directly since it has no separate template to protect; either way scheduleTaskAlarm cancels the obsolete alarm and arms the new one through its own single deterministic id", () => {
  const fnIndex = screen.indexOf("async function handleRescheduleNextTask");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes('if (target.recurrence.kind === "recurring") {'));
  assert.ok(fnBody.includes("const override = buildTaskOccurrenceOverride(target, todayLocal, existing, { scheduledTime: newTime }, nowDate.toISOString());"));
  assert.ok(fnBody.includes("await saveTaskOccurrenceOverrides(upsertTaskOccurrenceOverride(overrides, override));"));
  assert.ok(fnBody.includes("taskForAlarm = { ...target, scheduledTime: newTime };"));
  assert.ok(fnBody.includes("const rescheduled = await scheduleTaskAlarm(taskForAlarm, nowDate);"));
  assert.ok(fnBody.includes("await refreshNextScheduledTask();"));
});

test("option C (adjust the next task's planned duration): the exact same today-only override mechanism as option B, patching expectedDurationMinutes -- never touches the alarm, since a duration change alone never changes WHEN the next task's own alarm should fire", () => {
  const fnIndex = screen.indexOf("async function handleAdjustNextTaskDuration");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("{ expectedDurationMinutes: newDurationMinutes }"));
  assert.ok(fnBody.includes("await upsertTask({ ...target, expectedDurationMinutes: newDurationMinutes });"));
  assert.ok(!fnBody.includes("scheduleTaskAlarm("), "adjusting duration alone must never re-arm/re-schedule the alarm");
});

test("option D (continue unchanged): a pure dismissal -- touches no data, no alarm, no timer; never forces a postponement/shortening/completion", () => {
  const fnIndex = screen.indexOf("function handleDismissAdjustSection");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("setDismissedAdjustSectionForTaskId(nextScheduledTask.task.id);"));
  assert.ok(!fnBody.includes("await "), "dismissing must be a synchronous, data-free no-op");
});

test("the adjust section's own 4 options are each deterministic chip choices (never free-text minutes), matching this codebase's own established preset-chip convention", () => {
  assert.match(screen, /const SHORTEN_TASK_OPTIONS_MINUTES = \[5, 10, 15\];/);
  assert.match(screen, /const RESCHEDULE_NEXT_TASK_OPTIONS_MINUTES = \[15, 30, 60\];/);
  assert.match(screen, /const ADJUST_NEXT_DURATION_OPTIONS_MINUTES = \[15, 30, 45, 60\];/);
  assert.ok(screen.includes("onPress={() => handleShortenCurrentTask(minutes)}"));
  assert.ok(screen.includes("onPress={() => handleRescheduleNextTask(minutes)}"));
  assert.ok(screen.includes("onPress={() => handleAdjustNextTaskDuration(minutes)}"));
  assert.ok(screen.includes("onPress={handleDismissAdjustSection}"));
});
