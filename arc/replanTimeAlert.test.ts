import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyTask } from "./tasks.ts";
import { createTaskTimerRun } from "./taskTimer.ts";
import { resolveReplanTimeAlert } from "./replanTimeAlert.ts";
import { resolveTaskNotStartedAlert } from "./taskNotStartedAlert.ts";
import type { ScheduledPlanEntry } from "./dailyPlan.ts";

const NOW_ISO = "2026-11-25T08:00:00.000Z";

/** Mirrors arc/taskNotStartedAlert.test.ts's own `entry` helper exactly -- same ScheduledPlanEntry shape, same convention. */
function entry(taskId: string, effectiveStartTime: string | null, effectiveEndTime: string | null, taskOverrides: Partial<ReturnType<typeof createEmptyTask>> = {}): ScheduledPlanEntry {
  return {
    task: { ...createEmptyTask(taskId, taskId, "a", NOW_ISO), ...taskOverrides },
    occurrenceDateLocal: "2026-11-25",
    origin: "oneoff",
    scheduledTime: effectiveStartTime,
    expectedDurationMinutes: 30,
    timeIsManual: true,
    isModifiedForToday: false,
    isCompletedToday: false,
    effectiveStartTime,
    effectiveEndTime,
    hasConflict: false,
  };
}

const NOW = new Date(2026, 10, 25, 9, 0, 0); // 09:00

test("required (section 4, 'one unperformed-and-overdue task is enough'): a task whose FULL allocated window (start AND end) has already elapsed, with nothing started, qualifies for Replan Time -- the whole point of this new predicate", () => {
  const alert = resolveReplanTimeAlert([entry("t1", "06:00", "07:00")], NOW, null);
  assert.equal(alert?.task.id, "t1");
});

test("a task whose window merely STARTED but hasn't elapsed yet never qualifies for Replan Time -- that's the existing task-not-started alert's own job, not this one's", () => {
  const alert = resolveReplanTimeAlert([entry("t1", "08:00", "11:00")], NOW, null);
  assert.equal(alert, null);
});

test("a task whose start time hasn't arrived yet never qualifies", () => {
  const alert = resolveReplanTimeAlert([entry("t1", "10:00", "11:00")], NOW, null);
  assert.equal(alert, null);
});

test("required (section 4, 'never while the user is performing an active task'): a task that's genuinely already running (a real matching TaskTimerRun still within its own real elapsed time), even past its ORIGINALLY scheduled window, never qualifies", () => {
  const run = createTaskTimerRun("t1", "run-1", 120, NOW_ISO);
  const alert = resolveReplanTimeAlert([entry("t1", "06:00", "07:00", { status: "active" })], NOW, run);
  assert.equal(alert, null);
});

test("an activeRun belonging to a DIFFERENT task never suppresses this task's own overdue alert", () => {
  const run = createTaskTimerRun("some-other-task", "run-1", 30, NOW_ISO);
  const alert = resolveReplanTimeAlert([entry("t1", "06:00", "07:00")], NOW, run);
  assert.equal(alert?.task.id, "t1");
});

test("an already-completed-today entry never qualifies", () => {
  const e = { ...entry("t1", "06:00", "07:00"), isCompletedToday: true };
  const alert = resolveReplanTimeAlert([e], NOW, null);
  assert.equal(alert, null);
});

test("picks the EARLIEST overdue entry when several qualify, via resolveCurrentTaskState's own overdue[0] -- never a second, independently-sorted scan", () => {
  const alert = resolveReplanTimeAlert([entry("t2", "05:00", "06:00"), entry("t1", "06:00", "07:00")], NOW, null);
  assert.equal(alert?.task.id, "t2");
});

test("required: the task-not-started alert's own `current` pick and this one's `overdue` pick are mutually exclusive for the exact same single-entry schedule, by construction -- the two notifications never compete over one task at one moment", () => {
  const stillOpen = [entry("t1", "08:00", "11:00")];
  assert.equal(resolveTaskNotStartedAlert(stillOpen, NOW, null)?.task.id, "t1");
  assert.equal(resolveReplanTimeAlert(stillOpen, NOW, null), null);

  const fullyElapsed = [entry("t1", "06:00", "07:00")];
  assert.equal(resolveTaskNotStartedAlert(fullyElapsed, NOW, null), null);
  assert.equal(resolveReplanTimeAlert(fullyElapsed, NOW, null)?.task.id, "t1");
});
