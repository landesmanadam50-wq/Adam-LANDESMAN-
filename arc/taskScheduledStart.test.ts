import test from "node:test";
import assert from "node:assert/strict";

import { resolveNextArcWindowOccurrence, resolveNextTaskStartOccurrence } from "./taskScheduledStart.ts";
import { createEmptyTask, startTask } from "./tasks.ts";
import type { Task } from "./tasks.ts";
import { buildTaskOccurrenceOverride, markTaskOccurrenceRemoved } from "./taskOccurrenceOverride.ts";

const NOW = new Date("2026-01-07T09:00:00"); // a Wednesday, local time

function plannedTask(overrides: Partial<Task> = {}): Task {
  return { ...createEmptyTask("t1", "לכתוב דוח", "לפתוח את המחשב", NOW.toISOString()), ...overrides };
}

test("returns null for a task with no scheduledTime at all", () => {
  assert.equal(resolveNextTaskStartOccurrence(plannedTask(), NOW), null);
});

test("a one-time task: returns the exact scheduled moment when it's still in the future", () => {
  const task = plannedTask({ scheduledDate: "2026-01-07", scheduledTime: "10:00" });
  const next = resolveNextTaskStartOccurrence(task, NOW);
  assert.ok(next);
  assert.equal(next!.getHours(), 10);
  assert.equal(next!.getMinutes(), 0);
});

test("a one-time task: returns null once its own scheduled moment has already passed", () => {
  const task = plannedTask({ scheduledDate: "2026-01-07", scheduledTime: "08:00" });
  assert.equal(resolveNextTaskStartOccurrence(task, NOW), null);
});

// Critical-bug fix ("שעון מעורר אוטומטי לכל משימה"): a one-time task
// with a time but no explicit date used to be invisible to the whole
// scheduling engine -- no alarm, no error. Defaulting to TODAY is what
// makes an already-saved task like this (not just a newly-created one,
// which arc/taskDraft.ts's buildTaskFromDraft now prevents at the
// source) actually get an alarm on the next sync.
test("a one-time task with a scheduledTime but NO scheduledDate defaults to TODAY -- still in the future today", () => {
  const task = plannedTask({ scheduledDate: null, scheduledTime: "10:00" });
  const next = resolveNextTaskStartOccurrence(task, NOW);
  assert.ok(next);
  assert.equal(next!.getDate(), NOW.getDate());
  assert.equal(next!.getHours(), 10);
  assert.equal(next!.getMinutes(), 0);
});

test("a one-time task with a scheduledTime but NO scheduledDate, whose time today has already passed, returns null -- never silently assumed for a future day (there is no recurrence to fall forward to)", () => {
  const task = plannedTask({ scheduledDate: null, scheduledTime: "08:00" });
  assert.equal(resolveNextTaskStartOccurrence(task, NOW), null);
});

test("a recurring task: finds today's occurrence when today is a recurrence day and the time hasn't passed", () => {
  const task = plannedTask({ recurrence: { kind: "recurring", daysOfWeek: [NOW.getDay()] }, scheduledTime: "10:00" });
  const next = resolveNextTaskStartOccurrence(task, NOW);
  assert.ok(next);
  assert.equal(next!.getDate(), NOW.getDate());
  assert.equal(next!.getHours(), 10);
});

test("a recurring task: skips to the next qualifying day when today's time already passed, or today isn't a recurrence day", () => {
  const todayAlreadyPassed = plannedTask({ recurrence: { kind: "recurring", daysOfWeek: [NOW.getDay()] }, scheduledTime: "08:00" });
  const next1 = resolveNextTaskStartOccurrence(todayAlreadyPassed, NOW);
  assert.ok(next1);
  assert.notEqual(next1!.getDate(), NOW.getDate());

  const notToday = plannedTask({ recurrence: { kind: "recurring", daysOfWeek: [(NOW.getDay() + 2) % 7] }, scheduledTime: "10:00" });
  const next2 = resolveNextTaskStartOccurrence(notToday, NOW);
  assert.ok(next2);
  assert.notEqual(next2!.getDay(), NOW.getDay());
});

test("a recurring task with no recurrence days produces no alarm", () => {
  const task = plannedTask({ recurrence: { kind: "recurring", daysOfWeek: [] }, scheduledTime: "10:00" });
  assert.equal(resolveNextTaskStartOccurrence(task, NOW), null);
});

test("only a 'planned' task ever produces an alarm -- active/paused/postponed/completed/archived never do, even with a perfectly valid future schedule", () => {
  const base = { scheduledDate: "2026-01-07", scheduledTime: "10:00" };
  const active = startTask(plannedTask(base), NOW.toISOString());
  assert.equal(resolveNextTaskStartOccurrence(active, NOW), null);

  for (const status of ["active", "paused", "postponed", "completed", "archived"] as const) {
    const task = plannedTask({ ...base, status });
    assert.equal(resolveNextTaskStartOccurrence(task, NOW), null, `status ${status} must never produce a start alarm`);
  }
});

// --- ARC alarm task, requirement 1.א: the before-task ARC window's own alarm time ---

test("resolveNextArcWindowOccurrence returns null when the task has no arcWindowMinutesBefore configured, even with a perfectly valid future schedule", () => {
  const task = plannedTask({ scheduledDate: "2026-01-07", scheduledTime: "10:00", arcWindowMinutesBefore: null });
  assert.equal(resolveNextArcWindowOccurrence(task, NOW), null);
});

test("resolveNextArcWindowOccurrence returns the task's own clock time MINUS arcWindowMinutesBefore, for a one-time task", () => {
  const task = plannedTask({ scheduledDate: "2026-01-07", scheduledTime: "10:00", arcWindowMinutesBefore: 10 });
  const next = resolveNextArcWindowOccurrence(task, NOW);
  assert.ok(next);
  assert.equal(next!.getHours(), 9);
  assert.equal(next!.getMinutes(), 50);
});

test("resolveNextArcWindowOccurrence advances to the task's NEXT occurrence when the ARC window itself has already slipped by, even though the task's own start time is still ahead -- never fires late for the window that just passed", () => {
  // NOW is 09:00. Task is at 09:05, window is 10 minutes before -> 08:55, already passed, even though the task itself (09:05) is still in the future.
  const task = plannedTask({ recurrence: { kind: "recurring", daysOfWeek: [NOW.getDay()] }, scheduledTime: "09:05", arcWindowMinutesBefore: 10 });
  const next = resolveNextArcWindowOccurrence(task, NOW);
  assert.ok(next);
  assert.notEqual(next!.getDate(), NOW.getDate(), "must skip to the next qualifying day, never fire late for today's already-passed window");
});

// --- Flexible Daily Routine task, critical integration fix: the alarm's own
// fire time must follow today's effective (overridden) occurrence, never the
// Fixed Weekly Routine template's raw scheduledTime/daysOfWeek alone. ---

const EARLY_MORNING = new Date("2026-01-07T08:00:00"); // same Wednesday, well before either candidate time below

test("integration fix, requirement 1: a recurring task template at 09:00, with TODAY retimed to 11:00 via override, fires at 11:00 today -- never 09:00", () => {
  const template = plannedTask({ recurrence: { kind: "recurring", daysOfWeek: [EARLY_MORNING.getDay()] }, scheduledTime: "09:00", expectedDurationMinutes: 60 });
  const todayLocal = "2026-01-07";
  const override = buildTaskOccurrenceOverride(template, todayLocal, null, { scheduledTime: "11:00", expectedDurationMinutes: 20 }, EARLY_MORNING.toISOString());
  const next = resolveNextTaskStartOccurrence(template, EARLY_MORNING, [override]);
  assert.ok(next);
  assert.equal(next!.getDate(), EARLY_MORNING.getDate(), "still today");
  assert.equal(next!.getHours(), 11);
  assert.equal(next!.getMinutes(), 0);
});

test("integration fix: without the override, the SAME template resolves to its own 09:00 -- confirming the override, not some other change, is what shifts the alarm", () => {
  const template = plannedTask({ recurrence: { kind: "recurring", daysOfWeek: [EARLY_MORNING.getDay()] }, scheduledTime: "09:00" });
  const next = resolveNextTaskStartOccurrence(template, EARLY_MORNING, []);
  assert.ok(next);
  assert.equal(next!.getHours(), 9);
});

test("integration fix, requirement 7: an override on ONE date never shifts the alarm for the template's other occurrences -- next week's same weekday still fires at the template's own 09:00", () => {
  const template = plannedTask({ recurrence: { kind: "recurring", daysOfWeek: [EARLY_MORNING.getDay()] }, scheduledTime: "09:00" });
  const todayLocal = "2026-01-07";
  const override = buildTaskOccurrenceOverride(template, todayLocal, null, { scheduledTime: "11:00" }, EARLY_MORNING.toISOString());
  // Simulate "today's 11:00 occurrence already happened" by asking from just after it.
  const afterTodaysOverriddenTime = new Date("2026-01-07T11:30:00");
  const next = resolveNextTaskStartOccurrence(template, afterTodaysOverriddenTime, [override]);
  assert.ok(next);
  assert.notEqual(next!.toDateString(), EARLY_MORNING.toDateString(), "must have rolled forward to a later day");
  assert.equal(next!.getHours(), 9, "the NEXT week's occurrence is unaffected by this week's one-date override");
});

test("integration fix, requirement 1 (removal): a recurring task's occurrence removed for TODAY produces no alarm for today at all -- the walk skips straight to the next qualifying, non-removed day", () => {
  const template = plannedTask({ recurrence: { kind: "recurring", daysOfWeek: [EARLY_MORNING.getDay()] }, scheduledTime: "09:00" });
  const todayLocal = "2026-01-07";
  const removal = markTaskOccurrenceRemoved(template, todayLocal, [], EARLY_MORNING.toISOString());
  const next = resolveNextTaskStartOccurrence(template, EARLY_MORNING, [removal]);
  assert.ok(next);
  assert.notEqual(next!.toDateString(), EARLY_MORNING.toDateString(), "today's removed occurrence must never produce an alarm");
});

test("integration fix: a before-task ARC window alarm also follows the effective occurrence's retimed value, shifted earlier by arcWindowMinutesBefore", () => {
  const template = plannedTask({ recurrence: { kind: "recurring", daysOfWeek: [EARLY_MORNING.getDay()] }, scheduledTime: "09:00", arcWindowMinutesBefore: 10 });
  const todayLocal = "2026-01-07";
  const override = buildTaskOccurrenceOverride(template, todayLocal, null, { scheduledTime: "11:00" }, EARLY_MORNING.toISOString());
  const next = resolveNextArcWindowOccurrence(template, EARLY_MORNING, [override]);
  assert.ok(next);
  assert.equal(next!.getHours(), 10);
  assert.equal(next!.getMinutes(), 50);
});

test("resolveNextArcWindowOccurrence: a recurring task finds today's own window when today qualifies and the window hasn't passed", () => {
  const task = plannedTask({ recurrence: { kind: "recurring", daysOfWeek: [NOW.getDay()] }, scheduledTime: "10:00", arcWindowMinutesBefore: 15 });
  const next = resolveNextArcWindowOccurrence(task, NOW);
  assert.ok(next);
  assert.equal(next!.getDate(), NOW.getDate());
  assert.equal(next!.getHours(), 9);
  assert.equal(next!.getMinutes(), 45);
});

test("resolveNextArcWindowOccurrence: never produces an occurrence for a task that isn't 'planned' -- the same guard disarms a linked ARC alarm exactly when the task's own alarm is disarmed (deleted/archived/started/postponed/completed)", () => {
  const base = { scheduledDate: "2026-01-07", scheduledTime: "10:00", arcWindowMinutesBefore: 10 };
  for (const status of ["active", "paused", "postponed", "completed", "archived"] as const) {
    const task = plannedTask({ ...base, status });
    assert.equal(resolveNextArcWindowOccurrence(task, NOW), null, `status ${status} must never produce an ARC window alarm`);
  }
});
