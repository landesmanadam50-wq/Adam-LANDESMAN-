import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyTask } from "./tasks.ts";
import {
  buildTaskOccurrenceOverride,
  findTaskOccurrenceOverride,
  isRecurringOccurrenceVisibleOnDate,
  markTaskOccurrenceRemoved,
  resolveEffectiveOccurrence,
  upsertTaskOccurrenceOverride,
} from "./taskOccurrenceOverride.ts";
import type { TaskOccurrenceOverride } from "./taskOccurrenceOverride.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function fresh() {
  const task = createEmptyTask("t1", "כתיבה", "לפתוח מחשב", NOW);
  return { ...task, recurrence: { kind: "recurring" as const, daysOfWeek: [1, 3, 5] }, scheduledTime: "09:00", expectedDurationMinutes: 30 };
}

test("findTaskOccurrenceOverride matches by exact (taskId, date) pair only", () => {
  const overrides: TaskOccurrenceOverride[] = [
    { taskId: "t1", occurrenceDateLocal: "2026-01-05", removed: false, scheduledTime: "10:00", expectedDurationMinutes: 45, order: null, timeIsManual: true, updatedAt: NOW },
  ];
  assert.ok(findTaskOccurrenceOverride("t1", "2026-01-05", overrides));
  assert.equal(findTaskOccurrenceOverride("t1", "2026-01-06", overrides), null);
  assert.equal(findTaskOccurrenceOverride("t2", "2026-01-05", overrides), null);
});

test("upsertTaskOccurrenceOverride replaces an existing (taskId, date) entry rather than accumulating a second one", () => {
  const first: TaskOccurrenceOverride = {
    taskId: "t1",
    occurrenceDateLocal: "2026-01-05",
    removed: false,
    scheduledTime: "10:00",
    expectedDurationMinutes: 45,
    order: null,
    timeIsManual: true,
    updatedAt: NOW,
  };
  const second: TaskOccurrenceOverride = { ...first, scheduledTime: "11:00", updatedAt: "2026-01-02T00:00:00.000Z" };
  const result = upsertTaskOccurrenceOverride([first], second);
  assert.equal(result.length, 1);
  assert.equal(result[0].scheduledTime, "11:00");
});

test("buildTaskOccurrenceOverride snapshots the template's CURRENT values for every field the patch doesn't touch", () => {
  const task = fresh();
  const override = buildTaskOccurrenceOverride(task, "2026-01-05", null, { scheduledTime: "11:00" }, NOW);
  assert.equal(override.scheduledTime, "11:00", "the explicitly patched field wins");
  assert.equal(override.expectedDurationMinutes, 30, "every other field is snapshotted from the task, never left as a bare null");
  assert.equal(override.removed, false);
});

test("buildTaskOccurrenceOverride, applied a second time, carries forward the FIRST override's own values for fields the second edit doesn't touch -- never re-reads the (possibly since-changed) template", () => {
  const task = fresh();
  const firstOverride = buildTaskOccurrenceOverride(task, "2026-01-05", null, { scheduledTime: "11:00" }, NOW);
  // The template itself changes AFTER the first override was made.
  const laterTemplate = { ...task, expectedDurationMinutes: 60 };
  const secondOverride = buildTaskOccurrenceOverride(laterTemplate, "2026-01-05", firstOverride, { expectedDurationMinutes: 45 }, "2026-01-02T00:00:00.000Z");
  assert.equal(secondOverride.scheduledTime, "11:00", "the first override's own time survives, never reset by the second edit");
  assert.equal(secondOverride.expectedDurationMinutes, 45, "the second edit's own explicit change wins");
});

test("markTaskOccurrenceRemoved sets removed=true while preserving any existing override's time/duration, or the template's own values when there was no prior override", () => {
  const task = fresh();
  const removed = markTaskOccurrenceRemoved(task, "2026-01-05", [], NOW);
  assert.equal(removed.removed, true);
  assert.equal(removed.scheduledTime, "09:00");

  const existing = buildTaskOccurrenceOverride(task, "2026-01-05", null, { scheduledTime: "11:00" }, NOW);
  const removedAfterRetime = markTaskOccurrenceRemoved(task, "2026-01-05", [existing], "2026-01-02T00:00:00.000Z");
  assert.equal(removedAfterRetime.removed, true);
  assert.equal(removedAfterRetime.scheduledTime, "11:00", "the earlier retime is preserved even though this date is now removed");
});

test("resolveEffectiveOccurrence falls back to the template's own values with isOverridden=false when no override exists for this date", () => {
  const task = fresh();
  const effective = resolveEffectiveOccurrence(task, "2026-01-05", []);
  assert.deepEqual(effective, { removed: false, scheduledTime: "09:00", expectedDurationMinutes: 30, order: null, isOverridden: false, timeIsManual: true });
});

test("resolveEffectiveOccurrence reads the override's own values with isOverridden=true once one exists for this date, and never affects any OTHER date", () => {
  const task = fresh();
  const override = buildTaskOccurrenceOverride(task, "2026-01-05", null, { scheduledTime: "11:00", expectedDurationMinutes: 45 }, NOW);
  const effective = resolveEffectiveOccurrence(task, "2026-01-05", [override]);
  assert.equal(effective.scheduledTime, "11:00");
  assert.equal(effective.expectedDurationMinutes, 45);
  assert.equal(effective.isOverridden, true);

  const otherDate = resolveEffectiveOccurrence(task, "2026-01-06", [override]);
  assert.equal(otherDate.scheduledTime, "09:00", "a different date is never affected by another date's own override");
  assert.equal(otherDate.isOverridden, false);
});

test("isRecurringOccurrenceVisibleOnDate is false when the weekday doesn't match, false when removed for this date, true otherwise", () => {
  const task = fresh(); // daysOfWeek: [1,3,5] (Mon/Wed/Fri)
  const monday = new Date("2026-01-05T00:00:00"); // a Monday
  const tuesday = new Date("2026-01-06T00:00:00");
  assert.equal(isRecurringOccurrenceVisibleOnDate(task, tuesday, "2026-01-06", []), false, "not scheduled on this weekday at all");
  assert.equal(isRecurringOccurrenceVisibleOnDate(task, monday, "2026-01-05", []), true, "scheduled, no override -- visible");

  const removed = markTaskOccurrenceRemoved(task, "2026-01-05", [], NOW);
  assert.equal(isRecurringOccurrenceVisibleOnDate(task, monday, "2026-01-05", [removed]), false, "removed for this one date");

  const nextMonday = new Date("2026-01-12T00:00:00");
  assert.equal(isRecurringOccurrenceVisibleOnDate(task, nextMonday, "2026-01-12", [removed]), true, "removing one Monday never removes any other Monday");
});

// --- Weekly & Daily Routine Redesign task: timeIsManual -------------------

test("buildTaskOccurrenceOverride defaults timeIsManual to true for any ordinary caller (a real trainee edit), even one that doesn't explicitly pass it", () => {
  const task = fresh();
  const override = buildTaskOccurrenceOverride(task, "2026-01-05", null, { scheduledTime: "11:00" }, NOW);
  assert.equal(override.timeIsManual, true);
});

test("buildTaskOccurrenceOverride only ever sets timeIsManual to false when the caller explicitly passes it alongside a new scheduledTime (the auto-scheduler's own write-back)", () => {
  const task = fresh();
  const auto = buildTaskOccurrenceOverride(task, "2026-01-05", null, { scheduledTime: "09:30", timeIsManual: false }, NOW);
  assert.equal(auto.timeIsManual, false);
});

test("buildTaskOccurrenceOverride preserves the EXISTING timeIsManual when the patch never touches scheduledTime at all (e.g. only reordering or marking removed)", () => {
  const task = fresh();
  const auto = buildTaskOccurrenceOverride(task, "2026-01-05", null, { scheduledTime: "09:30", timeIsManual: false }, NOW);
  const reordered = buildTaskOccurrenceOverride(task, "2026-01-05", auto, { order: 2 }, NOW);
  assert.equal(reordered.timeIsManual, false, "a reorder must never flip an auto-scheduled time into a manually-fixed one");

  const manual = buildTaskOccurrenceOverride(task, "2026-01-05", null, { scheduledTime: "10:00" }, NOW);
  const removed = markTaskOccurrenceRemoved(task, "2026-01-05", [manual], NOW);
  assert.equal(removed.timeIsManual, true, "markTaskOccurrenceRemoved must never change an existing manual flag either");
});

test("a NEW explicit retime (timeIsManual omitted) always resets timeIsManual back to true, even over a previously auto-scheduled entry -- the trainee's own edit always wins", () => {
  const task = fresh();
  const auto = buildTaskOccurrenceOverride(task, "2026-01-05", null, { scheduledTime: "09:30", timeIsManual: false }, NOW);
  const retimed = buildTaskOccurrenceOverride(task, "2026-01-05", auto, { scheduledTime: "10:15" }, NOW);
  assert.equal(retimed.timeIsManual, true);
});

test("resolveEffectiveOccurrence surfaces timeIsManual=true for a task with no override at all -- the template's own time is never something the auto-scheduler may overwrite", () => {
  const task = fresh();
  assert.equal(resolveEffectiveOccurrence(task, "2026-01-05", []).timeIsManual, true);
});

test("resolveEffectiveOccurrence surfaces the override's own timeIsManual once one exists", () => {
  const task = fresh();
  const auto = buildTaskOccurrenceOverride(task, "2026-01-05", null, { scheduledTime: "09:30", timeIsManual: false }, NOW);
  assert.equal(resolveEffectiveOccurrence(task, "2026-01-05", [auto]).timeIsManual, false);
});
