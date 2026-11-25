import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyTask } from "./tasks.ts";
import { createTaskTimerRun } from "./taskTimer.ts";
import { resolveTaskNotStartedAlert } from "./taskNotStartedAlert.ts";
import type { ScheduledPlanEntry } from "./dailyPlan.ts";

const NOW_ISO = "2026-11-25T08:00:00.000Z";

/** effectiveEndTime defaults to an hour after effectiveStartTime so the window is still genuinely open at the tests' own NOW (09:00) -- without this, hasScheduledPlanEntryWindowElapsed treats a zero-duration entry as elapsed the instant its start time passes. */
function entry(taskId: string, effectiveStartTime: string | null, effectiveEndTime: string | null = "11:00", taskOverrides: Partial<ReturnType<typeof createEmptyTask>> = {}): ScheduledPlanEntry {
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

test("a task whose start time hasn't arrived yet never qualifies for the alert", () => {
  const alert = resolveTaskNotStartedAlert([entry("t1", "10:00", "11:00")], NOW, null);
  assert.equal(alert, null);
});

test("a task whose start time has arrived, with no activeRun at all, qualifies for the alert", () => {
  const alert = resolveTaskNotStartedAlert([entry("t1", "08:00")], NOW, null);
  assert.equal(alert?.task.id, "t1");
});

test("a task that's genuinely already running (a real matching TaskTimerRun) never qualifies -- 'get updated/removed if the user starts the task another way'", () => {
  const run = createTaskTimerRun("t1", "run-1", 30, NOW_ISO);
  const alert = resolveTaskNotStartedAlert([entry("t1", "08:00", "11:00", { status: "active" })], NOW, run);
  assert.equal(alert, null);
});

test("an activeRun belonging to a DIFFERENT task never suppresses this task's own alert", () => {
  const run = createTaskTimerRun("some-other-task", "run-1", 30, NOW_ISO);
  const alert = resolveTaskNotStartedAlert([entry("t1", "08:00")], NOW, run);
  assert.equal(alert?.task.id, "t1");
});

test("a 'rest' run (a break on some other task) never suppresses this task's own not-started alert", () => {
  const baseRun = createTaskTimerRun("t1", "run-1", 30, NOW_ISO);
  const restRun = { ...baseRun, kind: "rest" as const };
  const alert = resolveTaskNotStartedAlert([entry("t1", "08:00")], NOW, restRun);
  assert.equal(alert?.task.id, "t1", "a rest run for this exact task id must not be mistaken for 'the task itself is running'");
});

test("an already-completed-today entry never qualifies", () => {
  const e = { ...entry("t1", "08:00"), isCompletedToday: true };
  const alert = resolveTaskNotStartedAlert([e], NOW, null);
  assert.equal(alert, null);
});

test("uses the Flexible Daily Schedule's own resolveCurrentTaskState pipeline, not a second computation -- a second task whose window hasn't started is ignored even if listed", () => {
  const alert = resolveTaskNotStartedAlert([entry("t1", "08:00"), entry("t2", "12:00", "13:00")], NOW, null);
  assert.equal(alert?.task.id, "t1");
});

test("a task whose window has already fully ELAPSED (end time passed) is no longer 'current' -- it falls to the overdue bucket, which this specific alert deliberately does not surface (the transition/overdue mechanism owns that case)", () => {
  const alert = resolveTaskNotStartedAlert([entry("t1", "06:00", "07:00")], NOW, null);
  assert.equal(alert, null);
});
