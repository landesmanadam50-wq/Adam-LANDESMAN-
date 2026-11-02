import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyTask } from "./tasks.ts";
import {
  createTaskOccurrenceCompletion,
  isRecurringTaskScheduledOnDate,
  isTaskOccurrenceCompleted,
} from "./taskOccurrence.ts";

function recurringTask(daysOfWeek: number[]) {
  const task = createEmptyTask("t1", "title", "first action", "2026-01-01T00:00:00.000Z");
  return { ...task, recurrence: { kind: "recurring" as const, daysOfWeek } };
}

test("a one-time task is never 'scheduled on a date' via the recurring helper", () => {
  const task = createEmptyTask("t1", "title", "first action", "2026-01-01T00:00:00.000Z");
  assert.equal(isRecurringTaskScheduledOnDate(task, new Date("2026-01-05T09:00:00")), false);
});

test("a recurring task is scheduled only on its configured weekdays", () => {
  const mondayWednesday = recurringTask([1, 3]);
  // 2026-01-05 is a Monday
  assert.equal(isRecurringTaskScheduledOnDate(mondayWednesday, new Date("2026-01-05T09:00:00")), true);
  // 2026-01-06 is a Tuesday
  assert.equal(isRecurringTaskScheduledOnDate(mondayWednesday, new Date("2026-01-06T09:00:00")), false);
});

test("isTaskOccurrenceCompleted matches only the same task AND the same local date", () => {
  const completions = [{ taskId: "t1", occurrenceDateLocal: "2026-01-05", completedAt: "2026-01-05T10:00:00.000Z" }];
  assert.equal(isTaskOccurrenceCompleted("t1", "2026-01-05", completions), true);
  assert.equal(isTaskOccurrenceCompleted("t1", "2026-01-06", completions), false, "a different day must not read as completed");
  assert.equal(isTaskOccurrenceCompleted("t2", "2026-01-05", completions), false, "a different task must not read as completed");
});

test("createTaskOccurrenceCompletion stamps today's local date, not a UTC-shifted one", () => {
  const now = new Date(2026, 0, 5, 23, 30); // local Jan 5, late evening
  const entry = createTaskOccurrenceCompletion("t1", now);
  assert.equal(entry.taskId, "t1");
  assert.equal(entry.occurrenceDateLocal, "2026-01-05");
  assert.equal(entry.completedAt, now.toISOString());
});
