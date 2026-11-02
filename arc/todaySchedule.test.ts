import test from "node:test";
import assert from "node:assert/strict";

import { archiveTask, createEmptyTask, startTask, postponeTask, completeTask, type Task } from "./tasks.ts";
import { buildTodaySections } from "./todaySchedule.ts";
import type { TaskOccurrenceCompletion } from "./taskOccurrence.ts";

// Fixed reference "now": Monday 2026-01-05, 12:00 local.
const NOW = new Date(2026, 0, 5, 12, 0, 0);
const TODAY = "2026-01-05";
const YESTERDAY = "2026-01-04";
const TOMORROW = "2026-01-06";

function task(overrides: Partial<Task> = {}): Task {
  const base = createEmptyTask(overrides.id ?? `t-${Math.random()}`, "כותרת", "פעולה ראשונה", "2026-01-01T00:00:00.000Z");
  return { ...base, ...overrides };
}

test("a one-time task scheduled today with a future time is laterToday (no currentOrNext candidate yet)", () => {
  const t = task({ scheduledDate: TODAY, scheduledTime: "18:00" });
  const sections = buildTodaySections([t], [], NOW);
  assert.equal(sections.currentOrNext?.task.id, t.id, "the only eligible task today is promoted to currentOrNext");
  assert.deepEqual(sections.laterToday, []);
});

test("a one-time task scheduled today with a past time is overdue, and becomes currentOrNext when alone", () => {
  const t = task({ scheduledDate: TODAY, scheduledTime: "08:00" });
  const sections = buildTodaySections([t], [], NOW);
  assert.equal(sections.currentOrNext?.task.id, t.id);
  assert.deepEqual(sections.overdue, []);
});

test("a one-time task scheduled yesterday is overdue regardless of time", () => {
  const t = task({ scheduledDate: YESTERDAY, scheduledTime: "08:00" });
  const sections = buildTodaySections([t], [], NOW);
  assert.equal(sections.currentOrNext?.task.id, t.id);
});

test("a one-time task scheduled tomorrow never appears on today's screen", () => {
  const t = task({ scheduledDate: TOMORROW });
  const sections = buildTodaySections([t], [], NOW);
  assert.equal(sections.currentOrNext, null);
  assert.deepEqual(sections.overdue, []);
  assert.deepEqual(sections.laterToday, []);
  assert.deepEqual(sections.unscheduled, []);
});

test("a one-time task with no scheduledDate is unscheduled", () => {
  const t = task({ scheduledDate: null });
  const sections = buildTodaySections([t], [], NOW);
  assert.equal(sections.unscheduled.length, 1);
  assert.equal(sections.unscheduled[0].task.id, t.id);
  assert.equal(sections.currentOrNext, null, "unscheduled tasks are never promoted to currentOrNext");
});

test("a one-time task completed today is completedToday; completed on an earlier day disappears from today entirely", () => {
  const completedToday = completeTask(task({ id: "a" }), new Date(2026, 0, 5, 9, 0).toISOString());
  const completedYesterday = completeTask(task({ id: "b" }), new Date(2026, 0, 4, 9, 0).toISOString());
  const sections = buildTodaySections([completedToday, completedYesterday], [], NOW);
  assert.deepEqual(sections.completedToday.map((e) => e.task.id), ["a"]);
});

test("an ACTIVE task is always promoted to currentOrNext, even over an earlier-timed overdue task", () => {
  const overdueTask = task({ id: "overdue", scheduledDate: TODAY, scheduledTime: "07:00" });
  const activeTask = startTask(task({ id: "active", scheduledDate: TODAY, scheduledTime: "20:00" }), NOW.toISOString());
  const sections = buildTodaySections([overdueTask, activeTask], [], NOW);
  assert.equal(sections.currentOrNext?.task.id, "active");
  assert.equal(sections.overdue.length, 1);
  assert.equal(sections.overdue[0].task.id, "overdue");
});

test("overdue tasks are preferred over laterToday tasks for currentOrNext when nothing is active", () => {
  const laterTask = task({ id: "later", scheduledDate: TODAY, scheduledTime: "20:00" });
  const overdueTask = task({ id: "overdue", scheduledDate: TODAY, scheduledTime: "07:00" });
  const sections = buildTodaySections([laterTask, overdueTask], [], NOW);
  assert.equal(sections.currentOrNext?.task.id, "overdue");
  assert.equal(sections.laterToday.length, 1);
  assert.equal(sections.laterToday[0].task.id, "later");
});

test("laterToday and overdue sort chronologically by time, time-less tasks sort last, and the earliest-timed laterToday task is promoted to currentOrNext when nothing is overdue", () => {
  const noon = task({ id: "noon", scheduledDate: TODAY, scheduledTime: "12:30" });
  const evening = task({ id: "evening", scheduledDate: TODAY, scheduledTime: "21:00" });
  const noTime = task({ id: "no-time", scheduledDate: TODAY, scheduledTime: null });
  const sections = buildTodaySections([evening, noTime, noon], [], NOW);
  assert.equal(sections.currentOrNext?.task.id, "noon");
  assert.deepEqual(sections.laterToday.map((e) => e.task.id), ["evening", "no-time"]);
});

test("an archived task never appears on today's screen, even if it would otherwise be overdue", () => {
  const archived = archiveTask(task({ scheduledDate: YESTERDAY }), NOW.toISOString());
  const sections = buildTodaySections([archived], [], NOW);
  assert.equal(sections.currentOrNext, null);
  assert.deepEqual(sections.overdue, []);
});

test("a recurring task not scheduled on today's weekday never appears", () => {
  const notToday = task({ recurrence: { kind: "recurring", daysOfWeek: [2] } }); // Tuesday only; NOW is Monday
  const sections = buildTodaySections([notToday], [], NOW);
  assert.equal(sections.currentOrNext, null);
  assert.deepEqual(sections.overdue, []);
  assert.deepEqual(sections.laterToday, []);
});

test("a recurring task scheduled today behaves like a one-time task for today's bucketing", () => {
  const recurring = task({ recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: "08:00" }); // Monday, past time
  const sections = buildTodaySections([recurring], [], NOW);
  assert.equal(sections.currentOrNext?.task.id, recurring.id);
});

test("a recurring task whose TODAY occurrence is already completed is completedToday, never overdue", () => {
  const recurring = task({ id: "rec", recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: "08:00" });
  const completions: TaskOccurrenceCompletion[] = [{ taskId: "rec", occurrenceDateLocal: TODAY, completedAt: NOW.toISOString() }];
  const sections = buildTodaySections([recurring], completions, NOW);
  assert.equal(sections.completedToday.length, 1);
  assert.equal(sections.completedToday[0].task.id, "rec");
  assert.equal(sections.currentOrNext, null);
});

test("completing a recurring task's occurrence never marks a DIFFERENT day's occurrence complete (it would simply reappear tomorrow)", () => {
  const recurring = task({ id: "rec", recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: "08:00" });
  const completions: TaskOccurrenceCompletion[] = [{ taskId: "rec", occurrenceDateLocal: YESTERDAY, completedAt: "irrelevant" }];
  const sections = buildTodaySections([recurring], completions, NOW);
  assert.equal(sections.currentOrNext?.task.id, "rec", "yesterday's completion must not suppress today's occurrence");
});

test("a postponed task with no returnAt is unscheduled -- the spec's explicit 'move to unscheduled' outcome", () => {
  const postponed = postponeTask(task(), "practical", null, NOW.toISOString());
  const sections = buildTodaySections([postponed], [], NOW);
  assert.equal(sections.unscheduled.length, 1);
});

test("a postponed task with a past returnAt today is overdue (a return reminder due now)", () => {
  const postponed = postponeTask(task(), "practical", new Date(2026, 0, 5, 9, 0).toISOString(), NOW.toISOString());
  const sections = buildTodaySections([postponed], [], NOW);
  assert.equal(sections.currentOrNext?.task.id, postponed.id);
});

test("a postponed task returning on a future day never appears on today's screen", () => {
  const postponed = postponeTask(task(), "practical", new Date(2026, 0, 10, 9, 0).toISOString(), NOW.toISOString());
  const sections = buildTodaySections([postponed], [], NOW);
  assert.equal(sections.currentOrNext, null);
  assert.deepEqual(sections.overdue, []);
  assert.deepEqual(sections.unscheduled, []);
});

test("unscheduled tasks sort oldest-created first (stable FIFO), and are never silently dropped", () => {
  const second = task({ id: "second", scheduledDate: null, createdAt: "2026-01-02T00:00:00.000Z" });
  const first = task({ id: "first", scheduledDate: null, createdAt: "2026-01-01T00:00:00.000Z" });
  const sections = buildTodaySections([second, first], [], NOW);
  assert.deepEqual(sections.unscheduled.map((e) => e.task.id), ["first", "second"]);
});

test("completedToday sorts most-recently-completed first", () => {
  const earlier = completeTask(task({ id: "earlier" }), new Date(2026, 0, 5, 8, 0).toISOString());
  const later = completeTask(task({ id: "later" }), new Date(2026, 0, 5, 11, 0).toISOString());
  const sections = buildTodaySections([earlier, later], [], NOW);
  assert.deepEqual(sections.completedToday.map((e) => e.task.id), ["later", "earlier"]);
});
