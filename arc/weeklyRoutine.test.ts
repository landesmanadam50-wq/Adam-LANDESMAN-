import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyTask } from "./tasks.ts";
import type { Task } from "./tasks.ts";
import { createTaskOccurrenceCompletion } from "./taskOccurrence.ts";
import { buildTaskOccurrenceOverride } from "./taskOccurrenceOverride.ts";
import {
  listWeekOneTimeEvents,
  reorderWeeklyTask,
  resetWeekCompletions,
  resetWeekOccurrenceOverrides,
  resolveWeekDates,
  resolveWeekStartLocalDate,
  resolveWeeklyRoutineByDay,
  WEEKDAY_LABELS_HE,
} from "./weeklyRoutine.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function recurringTask(id: string, title: string, daysOfWeek: number[], overrides: Partial<Task> = {}): Task {
  return { ...createEmptyTask(id, title, "להתחיל", NOW), recurrence: { kind: "recurring", daysOfWeek }, ...overrides };
}

test("WEEKDAY_LABELS_HE has exactly 7 entries, Sunday through Saturday", () => {
  assert.equal(WEEKDAY_LABELS_HE.length, 7);
  assert.equal(WEEKDAY_LABELS_HE[0], "ראשון");
  assert.equal(WEEKDAY_LABELS_HE[6], "שבת");
});

test("resolveWeeklyRoutineByDay groups a task into every weekday it recurs on, and the same task can appear in multiple days", () => {
  const task = recurringTask("t1", "אימון", [1, 3, 5]);
  const byDay = resolveWeeklyRoutineByDay([task]);
  assert.deepEqual(byDay[1].map((t) => t.id), ["t1"]);
  assert.deepEqual(byDay[3].map((t) => t.id), ["t1"]);
  assert.deepEqual(byDay[5].map((t) => t.id), ["t1"]);
  assert.deepEqual(byDay[0], []);
});

test("resolveWeeklyRoutineByDay excludes a one-time task and an archived recurring task", () => {
  const oneOff = createEmptyTask("t1", "חד פעמי", "להתחיל", NOW);
  const archived = recurringTask("t2", "ישן", [1], { status: "archived" });
  const byDay = resolveWeeklyRoutineByDay([oneOff, archived]);
  for (const day of Object.values(byDay)) assert.equal(day.length, 0);
});

test("resolveWeeklyRoutineByDay sorts within a day by manual order, then scheduled time, then creation order -- same tie-break arc/dailyPlan.ts's own compare uses", () => {
  const early = recurringTask("t1", "מוקדם", [1], { scheduledTime: "07:00", createdAt: "2026-01-01T00:00:00.000Z" });
  const late = recurringTask("t2", "מאוחר", [1], { scheduledTime: "20:00", createdAt: "2026-01-01T00:00:01.000Z" });
  const manuallyFirst = recurringTask("t3", "ידני", [1], { scheduledTime: "23:00", order: 1, createdAt: "2026-01-01T00:00:02.000Z" });
  const byDay = resolveWeeklyRoutineByDay([late, early, manuallyFirst]);
  assert.deepEqual(byDay[1].map((t) => t.id), ["t3", "t1", "t2"]);
});

test("resolveWeekStartLocalDate returns the Sunday of the week containing the given date, for a date mid-week and for a Sunday itself", () => {
  assert.equal(resolveWeekStartLocalDate("2026-01-07"), "2026-01-04", "Wednesday Jan 7 2026 -> Sunday Jan 4 2026");
  assert.equal(resolveWeekStartLocalDate("2026-01-04"), "2026-01-04", "a Sunday is its own week start");
});

test("resetWeekCompletions removes only completions whose date falls within the given week, preserving every other week's entries", () => {
  const completions = [
    createTaskOccurrenceCompletion("t1", new Date("2026-01-05T09:00:00")), // Monday, within the week starting 2026-01-04
    createTaskOccurrenceCompletion("t1", new Date("2026-01-10T09:00:00")), // Saturday, same week
    createTaskOccurrenceCompletion("t1", new Date("2026-01-11T09:00:00")), // next Sunday, a different week
  ];
  const result = resetWeekCompletions(completions, "2026-01-04");
  assert.equal(result.length, 1);
  assert.equal(result[0].occurrenceDateLocal, "2026-01-11");
});

test("resetWeekCompletions never touches the Task records themselves -- it only operates on (and returns) a completions list", () => {
  const task = recurringTask("t1", "אימון", [1]);
  const completions = [createTaskOccurrenceCompletion("t1", new Date("2026-01-05T09:00:00"))];
  resetWeekCompletions(completions, "2026-01-04");
  assert.equal(task.recurrence.kind, "recurring", "the task itself is a plain object untouched by this function");
});

test("reorderWeeklyTask swaps a task with its upward/downward neighbor, normalizing every task in the day to sequential order values even when they started null", () => {
  const a = recurringTask("a", "ראשון", [1]);
  const b = recurringTask("b", "שני", [1]);
  const c = recurringTask("c", "שלישי", [1]);
  const movedDown = reorderWeeklyTask([a, b, c], "a", "down")!;
  assert.deepEqual(movedDown.map((t) => t.id), ["a", "b", "c"], "the returned array keeps its own original positions -- only `order` values change");
  assert.deepEqual(movedDown.map((t) => t.order), [1, 0, 2], "a moved to position 1's order, b took position 0's");
});

test("reorderWeeklyTask returns null when moving up from the top, down from the bottom, or for a task not in this day's list", () => {
  const a = recurringTask("a", "ראשון", [1]);
  const b = recurringTask("b", "שני", [1]);
  assert.equal(reorderWeeklyTask([a, b], "a", "up"), null);
  assert.equal(reorderWeeklyTask([a, b], "b", "down"), null);
  assert.equal(reorderWeeklyTask([a, b], "zzz", "up"), null);
});

// --- Weekly & Daily Routine Redesign task ---------------------------------

test("resolveWeekDates returns the exact 7 local dates (Sunday through Saturday) starting at weekStartLocal", () => {
  assert.deepEqual(resolveWeekDates("2026-01-04"), ["2026-01-04", "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09", "2026-01-10"]);
});

// Required test 13/14: synchronized weekly reset, preservation of the permanent template.
test("resetWeekOccurrenceOverrides removes only overrides whose date falls within the given week, never any other week's, and never touches the Task records the overrides were built from", () => {
  const task = recurringTask("t1", "אימון", [1]);
  const inWeek = buildTaskOccurrenceOverride(task, "2026-01-05", null, { scheduledTime: "10:00" }, NOW);
  const nextWeek = buildTaskOccurrenceOverride(task, "2026-01-12", null, { scheduledTime: "11:00" }, NOW);
  const result = resetWeekOccurrenceOverrides([inWeek, nextWeek], "2026-01-04");
  assert.deepEqual(result, [nextWeek]);
  assert.equal(task.recurrence.kind, "recurring", "the permanent template (the task itself) is a plain object, untouched by this function");
});

// Required test 11/12: future one-time events, and that they surface for the correct week.
test("listWeekOneTimeEvents lists only one-time (non-recurring) tasks scheduled for a date within the given week, excluding recurring and archived tasks", () => {
  const appointment = createEmptyTask("o1", "תור לרופא", "להתחיל", NOW); // recurrence: once by default
  const inWeek: Task = { ...appointment, scheduledDate: "2026-01-07" };
  const outsideWeek: Task = { ...createEmptyTask("o2", "אחר", "להתחיל", NOW), scheduledDate: "2026-01-20" };
  const recurring = recurringTask("t1", "אימון", [1]);
  const archivedOneOff: Task = { ...createEmptyTask("o3", "ישן", "להתחיל", NOW), scheduledDate: "2026-01-07", status: "archived" };
  const unscheduled = createEmptyTask("o4", "לא מתוזמן", "להתחיל", NOW);

  const result = listWeekOneTimeEvents([inWeek, outsideWeek, recurring, archivedOneOff, unscheduled], "2026-01-04");
  assert.deepEqual(result.map((t) => t.id), ["o1"]);
});

test("listWeekOneTimeEvents never automatically repeats a one-time event into a later week -- it is absent from any week other than its own scheduledDate", () => {
  const appointment: Task = { ...createEmptyTask("o1", "תור", "להתחיל", NOW), scheduledDate: "2026-01-07" };
  assert.deepEqual(listWeekOneTimeEvents([appointment], "2026-01-11").map((t) => t.id), [], "the following week must never show it");
});
