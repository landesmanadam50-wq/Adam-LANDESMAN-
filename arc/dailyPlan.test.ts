import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyTask } from "./tasks.ts";
import type { Task } from "./tasks.ts";
import { createTaskOccurrenceCompletion } from "./taskOccurrence.ts";
import { buildTaskOccurrenceOverride, markTaskOccurrenceRemoved } from "./taskOccurrenceOverride.ts";
import {
  applyScheduleMode,
  isDailyScheduleSuitable,
  isScheduledPlanEntryOverdue,
  MIN_SUITABLE_DAILY_TASK_COUNT,
  reorderDailyPlanEntry,
  resolveAutoScheduleWriteBacks,
  resolveDailyPlan,
  resolveNextActionableTask,
  resolveNextScheduledTaskAfter,
} from "./dailyPlan.ts";
import type { DailyPlanEntry } from "./dailyPlan.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const MONDAY_LOCAL = "2026-01-05";
const MONDAY = new Date("2026-01-05T00:00:00");

function recurringTask(id: string, title: string, overrides: Partial<Task> = {}): Task {
  return { ...createEmptyTask(id, title, "להתחיל", NOW), recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: "09:00", expectedDurationMinutes: 30, ...overrides };
}

function oneOffTask(id: string, title: string, overrides: Partial<Task> = {}): Task {
  return { ...createEmptyTask(id, title, "להתחיל", NOW), scheduledDate: MONDAY_LOCAL, ...overrides };
}

test("resolveDailyPlan includes a recurring task scheduled on this weekday, with origin 'weekly' and isModifiedForToday=false when no override exists", () => {
  const task = recurringTask("t1", "ריצה");
  const plan = resolveDailyPlan([task], [], [], MONDAY_LOCAL, MONDAY);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].origin, "weekly");
  assert.equal(plan[0].isModifiedForToday, false);
  assert.equal(plan[0].scheduledTime, "09:00");
});

test("resolveDailyPlan excludes a recurring task on a weekday it doesn't recur on", () => {
  const task = recurringTask("t1", "ריצה", { recurrence: { kind: "recurring", daysOfWeek: [2] } }); // Tuesday only
  const plan = resolveDailyPlan([task], [], [], MONDAY_LOCAL, MONDAY);
  assert.equal(plan.length, 0);
});

test("resolveDailyPlan excludes a recurring task removed for this specific date, without needing to touch the task itself", () => {
  const task = recurringTask("t1", "ריצה");
  const removal = markTaskOccurrenceRemoved(task, MONDAY_LOCAL, [], NOW);
  const plan = resolveDailyPlan([task], [removal], [], MONDAY_LOCAL, MONDAY);
  assert.equal(plan.length, 0);

  // The SAME task is still visible on a different Monday -- removal is per-date only.
  const nextMondayLocal = "2026-01-12";
  const nextMonday = new Date("2026-01-12T00:00:00");
  const planNextWeek = resolveDailyPlan([task], [removal], [], nextMondayLocal, nextMonday);
  assert.equal(planNextWeek.length, 1, "removing one Monday's occurrence must never remove any other Monday's");
});

test("resolveDailyPlan reflects a per-date retime/reduration override, and marks isModifiedForToday=true", () => {
  const task = recurringTask("t1", "ריצה");
  const override = buildTaskOccurrenceOverride(task, MONDAY_LOCAL, null, { scheduledTime: "18:00", expectedDurationMinutes: 60 }, NOW);
  const plan = resolveDailyPlan([task], [override], [], MONDAY_LOCAL, MONDAY);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].scheduledTime, "18:00");
  assert.equal(plan[0].expectedDurationMinutes, 60);
  assert.equal(plan[0].isModifiedForToday, true);
});

test("resolveDailyPlan includes a one-time task scheduled exactly on this date, with origin 'oneoff', and excludes it from any other date", () => {
  const task = oneOffTask("t2", "פגישה");
  const plan = resolveDailyPlan([task], [], [], MONDAY_LOCAL, MONDAY);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].origin, "oneoff");
  assert.equal(plan[0].isModifiedForToday, false);

  const planOtherDate = resolveDailyPlan([task], [], [], "2026-01-06", new Date("2026-01-06T00:00:00"));
  assert.equal(planOtherDate.length, 0);
});

test("resolveDailyPlan excludes an unscheduled one-time task (null scheduledDate) entirely -- that belongs only to the existing Today screen's unscheduled bucket", () => {
  const task = createEmptyTask("t3", "לא מתוזמן", "להתחיל", NOW);
  const plan = resolveDailyPlan([task], [], [], MONDAY_LOCAL, MONDAY);
  assert.equal(plan.length, 0);
});

test("resolveDailyPlan excludes an archived task regardless of recurrence or scheduledDate", () => {
  const task = recurringTask("t1", "ריצה", { status: "archived" });
  const plan = resolveDailyPlan([task], [], [], MONDAY_LOCAL, MONDAY);
  assert.equal(plan.length, 0);
});

test("resolveDailyPlan marks isCompletedToday from TaskOccurrenceCompletion for a weekly-origin task, and from status/completedAt for a one-off task", () => {
  const recurring = recurringTask("t1", "ריצה");
  const completion = createTaskOccurrenceCompletion("t1", new Date(`${MONDAY_LOCAL}T12:00:00`));
  const planWithCompletion = resolveDailyPlan([recurring], [], [completion], MONDAY_LOCAL, MONDAY);
  assert.equal(planWithCompletion[0].isCompletedToday, true);

  const oneOff = oneOffTask("t2", "פגישה", { status: "completed" });
  const planOneOff = resolveDailyPlan([oneOff], [], [], MONDAY_LOCAL, MONDAY);
  assert.equal(planOneOff[0].isCompletedToday, true);
});

test("resolveDailyPlan sorts by manual order first, then scheduled time, with unordered/untimed entries pushed last and stable by creation order", () => {
  const early = recurringTask("t1", "מוקדם", { scheduledTime: "07:00", createdAt: "2026-01-01T00:00:00.000Z" });
  const late = recurringTask("t2", "מאוחר", { scheduledTime: "20:00", createdAt: "2026-01-01T00:00:01.000Z" });
  const manuallyFirst = recurringTask("t3", "ידני", { scheduledTime: "23:00", order: 1, createdAt: "2026-01-01T00:00:02.000Z" });
  const untimed = recurringTask("t4", "בלי זמן", { scheduledTime: null, createdAt: "2026-01-01T00:00:03.000Z" });

  const plan = resolveDailyPlan([late, untimed, early, manuallyFirst], [], [], MONDAY_LOCAL, MONDAY);
  assert.deepEqual(plan.map((entry) => entry.task.id), ["t3", "t1", "t2", "t4"]);
});

test("resolveDailyPlan applies a per-date `order` override to change this date's sequence without touching the template's own order", () => {
  const task = recurringTask("t1", "ריצה", { order: 5 });
  const override = buildTaskOccurrenceOverride(task, MONDAY_LOCAL, null, { order: 1 }, NOW);
  const plan = resolveDailyPlan([task], [override], [], MONDAY_LOCAL, MONDAY);
  assert.equal(plan[0].task.order, 1, "the effective order for THIS date reflects the override");
  assert.equal(task.order, 5, "the underlying task record is never mutated by resolving the plan");
});

test("reorderDailyPlanEntry swaps an entry with its neighbor, returning each entry's own origin so the caller knows which storage path (override vs plain task) to persist through, and normalizes the whole day even when every order started null", () => {
  const weekly = recurringTask("w1", "שבועי");
  const oneOff = oneOffTask("o1", "חד פעמי");
  const plan = resolveDailyPlan([weekly, oneOff], [], [], MONDAY_LOCAL, MONDAY).sort((a, b) => b.task.id.localeCompare(a.task.id));
  const result = reorderDailyPlanEntry(plan, "o1", "up")!;
  // Results are returned in the plan's own original order (w1, o1) -- only each entry's own `order` value reflects the swap.
  assert.deepEqual(
    result.map((r) => [r.taskId, r.origin]),
    [["w1", "weekly"], ["o1", "oneoff"]]
  );
  assert.deepEqual(result.map((r) => r.order), [1, 0], "o1 moved into position 0, w1 took position 1");
});

test("reorderDailyPlanEntry returns null at the top/bottom edge of the day's plan, or for a taskId not present in it", () => {
  const weekly = recurringTask("w1", "שבועי");
  const plan = resolveDailyPlan([weekly], [], [], MONDAY_LOCAL, MONDAY);
  assert.equal(reorderDailyPlanEntry(plan, "w1", "up"), null);
  assert.equal(reorderDailyPlanEntry(plan, "w1", "down"), null);
  assert.equal(reorderDailyPlanEntry(plan, "missing", "up"), null);
});

// --- Weekly & Daily Routine Redesign task: applyScheduleMode -------------

function flexibleEntry(taskId: string, durationMinutes: number | null, order: number | null = null): DailyPlanEntry {
  return {
    task: { ...createEmptyTask(taskId, taskId, "להתחיל", NOW), order },
    occurrenceDateLocal: MONDAY_LOCAL,
    origin: "weekly",
    scheduledTime: null,
    expectedDurationMinutes: durationMinutes,
    timeIsManual: false,
    isModifiedForToday: false,
    isCompletedToday: false,
  };
}

function fixedEntry(taskId: string, scheduledTime: string, durationMinutes: number | null): DailyPlanEntry {
  return { ...flexibleEntry(taskId, durationMinutes), scheduledTime, timeIsManual: true };
}

// Required test 6: continuous scheduling.
test("applyScheduleMode (continuous): chains flexible entries back-to-back from the first fixed anchor, with zero gap", () => {
  const entries: DailyPlanEntry[] = [fixedEntry("t1", "09:00", 30), flexibleEntry("t2", 20), flexibleEntry("t3", 10)];
  const scheduled = applyScheduleMode(entries, { mode: "continuous" });
  assert.equal(scheduled[0].effectiveStartTime, "09:00");
  assert.equal(scheduled[1].effectiveStartTime, "09:30", "t2 starts exactly when t1 ends -- no gap");
  assert.equal(scheduled[2].effectiveStartTime, "09:50", "t3 starts exactly when t2 ends -- no gap");
});

// Required test 7/8: spaced scheduling, different gap durations.
test("applyScheduleMode (spaced): inserts the chosen gap after every entry, including a preset and a custom (non-preset) duration", () => {
  const entries: DailyPlanEntry[] = [fixedEntry("t1", "09:00", 30), flexibleEntry("t2", 20)];
  const spaced15 = applyScheduleMode(entries, { mode: "spaced", gapMinutes: 15 });
  assert.equal(spaced15[1].effectiveStartTime, "09:45", "09:00 + 30 duration + 15 gap");

  const spacedCustom = applyScheduleMode(entries, { mode: "spaced", gapMinutes: 7 });
  assert.equal(spacedCustom[1].effectiveStartTime, "09:37", "a custom, non-preset gap works identically to a preset one");
});

test("applyScheduleMode: a flexible entry with nothing earlier in the day to anchor from gets no effective time at all (never an invented 00:00)", () => {
  const entries: DailyPlanEntry[] = [flexibleEntry("t1", 30), fixedEntry("t2", "09:00", 20)];
  const scheduled = applyScheduleMode(entries, { mode: "continuous" });
  assert.equal(scheduled[0].effectiveStartTime, null);
  assert.equal(scheduled[1].effectiveStartTime, "09:00", "a later fixed entry is completely unaffected by an earlier entry having no anchor");
});

// "Preserve manually fixed task times unless the user explicitly approves changing them."
test("applyScheduleMode never moves a fixed (manual) entry's own time, even when the running cursor would overlap it", () => {
  const entries: DailyPlanEntry[] = [fixedEntry("t1", "09:00", 60), fixedEntry("t2", "09:30", 15)];
  const scheduled = applyScheduleMode(entries, { mode: "continuous" });
  assert.equal(scheduled[1].effectiveStartTime, "09:30", "t2's own fixed time must never be pushed later, even though t1 doesn't end until 10:00");
});

// "Detect and handle conflicts with fixed appointments."
test("applyScheduleMode flags hasConflict for a fixed entry whose own time is earlier than the cursor left by what came before it, and never for a flexible one", () => {
  const entries: DailyPlanEntry[] = [fixedEntry("t1", "09:00", 60), fixedEntry("t2", "09:30", 15), flexibleEntry("t3", 10)];
  const scheduled = applyScheduleMode(entries, { mode: "continuous" });
  assert.equal(scheduled[0].hasConflict, false);
  assert.equal(scheduled[1].hasConflict, true, "09:30 is earlier than t1's own end at 10:00");
  assert.equal(scheduled[2].hasConflict, false, "a flexible entry is always placed AT the cursor -- it can never itself conflict");
});

test("applyScheduleMode computes effectiveEndTime from the entry's own duration, and treats a null duration as zero minutes", () => {
  const entries: DailyPlanEntry[] = [fixedEntry("t1", "09:00", 30), flexibleEntry("t2", null)];
  const scheduled = applyScheduleMode(entries, { mode: "continuous" });
  assert.equal(scheduled[0].effectiveEndTime, "09:30");
  assert.equal(scheduled[1].effectiveStartTime, "09:30");
  assert.equal(scheduled[1].effectiveEndTime, "09:30", "a null duration occupies zero minutes, never treated as unknown/skipped");
});

// --- resolveAutoScheduleWriteBacks ---------------------------------------

test("resolveAutoScheduleWriteBacks only ever includes a flexible (timeIsManual=false) weekly-origin entry whose computed time actually differs from what's stored", () => {
  const entries: DailyPlanEntry[] = [fixedEntry("t1", "09:00", 30), flexibleEntry("t2", 20)];
  const scheduled = applyScheduleMode(entries, { mode: "continuous" });
  const writeBacks = resolveAutoScheduleWriteBacks(scheduled);
  assert.deepEqual(writeBacks, [{ taskId: "t2", occurrenceDateLocal: MONDAY_LOCAL, scheduledTime: "09:30" }]);
});

test("resolveAutoScheduleWriteBacks never includes a manual (fixed) entry, even though it also has an effective time", () => {
  const entries: DailyPlanEntry[] = [fixedEntry("t1", "09:00", 30), fixedEntry("t2", "10:00", 20)];
  const scheduled = applyScheduleMode(entries, { mode: "continuous" });
  assert.deepEqual(resolveAutoScheduleWriteBacks(scheduled), []);
});

test("resolveAutoScheduleWriteBacks never includes a oneoff entry -- a one-time task's computed time is never silently written back onto the Task record", () => {
  const entries: DailyPlanEntry[] = [fixedEntry("t1", "09:00", 30), { ...flexibleEntry("o1", 20), origin: "oneoff" }];
  const scheduled = applyScheduleMode(entries, { mode: "continuous" });
  assert.deepEqual(resolveAutoScheduleWriteBacks(scheduled), []);
});

test("resolveAutoScheduleWriteBacks never includes an entry with no effective time at all, and never re-writes an already-in-sync flexible entry", () => {
  const noAnchor: DailyPlanEntry[] = [flexibleEntry("t1", 30)];
  assert.deepEqual(resolveAutoScheduleWriteBacks(applyScheduleMode(noAnchor, { mode: "continuous" })), []);

  const alreadyInSync: DailyPlanEntry[] = [fixedEntry("t1", "09:00", 30), { ...flexibleEntry("t2", 20), scheduledTime: "09:30" }];
  assert.deepEqual(resolveAutoScheduleWriteBacks(applyScheduleMode(alreadyInSync, { mode: "continuous" })), [], "t2's stored time already matches what would be computed -- no redundant write");
});

// --- Unified Emotional Check-In and Task Postponement System: resolveNextActionableTask ---

test("required test: resolveNextActionableTask returns the FIRST entry in the resolved plan's own order that isn't already completed today", () => {
  const entries: DailyPlanEntry[] = [
    { ...flexibleEntry("t1", 20), isCompletedToday: true },
    flexibleEntry("t2", 10),
    flexibleEntry("t3", 15),
  ];
  const scheduled = applyScheduleMode(entries, { mode: "continuous" });
  const next = resolveNextActionableTask(scheduled);
  assert.ok(next);
  assert.equal(next!.task.id, "t2", "t1 is already completed today -- the first ACTIONABLE one is next");
});

test("required test: resolveNextActionableTask skips an archived task entry, even if not marked completed", () => {
  const archived = { ...flexibleEntry("t1", 20), task: { ...createEmptyTask("t1", "t1", "להתחיל", NOW), status: "archived" as const } };
  const entries: DailyPlanEntry[] = [archived, flexibleEntry("t2", 10)];
  const scheduled = applyScheduleMode(entries, { mode: "continuous" });
  const next = resolveNextActionableTask(scheduled);
  assert.equal(next?.task.id, "t2");
});

test("required test: resolveNextActionableTask returns null when every entry is already completed, or the plan is empty -- 'no relevant task exists'", () => {
  assert.equal(resolveNextActionableTask([]), null);
  const allCompleted: DailyPlanEntry[] = [{ ...flexibleEntry("t1", 10), isCompletedToday: true }];
  assert.equal(resolveNextActionableTask(applyScheduleMode(allCompleted, { mode: "continuous" })), null);
});

// --- Lock-Screen Timer, Next-Task Schedule and Smart Alarm Conflict Management task ---

test("test 4/5: resolveNextScheduledTaskAfter excludes the currently-active task itself, even though it is otherwise the first actionable entry", () => {
  const entries: DailyPlanEntry[] = [flexibleEntry("t1", 20), flexibleEntry("t2", 10)];
  const scheduled = applyScheduleMode(entries, { mode: "continuous" });
  const next = resolveNextScheduledTaskAfter(scheduled, "t1");
  assert.equal(next?.task.id, "t2", "t1 is the one currently active -- it can never be reported as its own 'next task'");
});

test("resolveNextScheduledTaskAfter behaves exactly like resolveNextActionableTask when there is no active task (null)", () => {
  const entries: DailyPlanEntry[] = [{ ...flexibleEntry("t1", 20), isCompletedToday: true }, flexibleEntry("t2", 10)];
  const scheduled = applyScheduleMode(entries, { mode: "continuous" });
  assert.equal(resolveNextScheduledTaskAfter(scheduled, null)?.task.id, resolveNextActionableTask(scheduled)?.task.id);
});

test("resolveNextScheduledTaskAfter returns null when nothing else qualifies ('אין משימה נוספת מתוכננת') -- a single active task with nothing after it", () => {
  const scheduled = applyScheduleMode([flexibleEntry("t1", 20)], { mode: "continuous" });
  assert.equal(resolveNextScheduledTaskAfter(scheduled, "t1"), null);
});

test("isScheduledPlanEntryOverdue is true once the entry's own effective start time has already passed 'now', and false before it or when there is no effective time at all", () => {
  const [onTime] = applyScheduleMode([fixedEntry("t1", "09:00", 30)], { mode: "continuous" });
  assert.equal(isScheduledPlanEntryOverdue(onTime, new Date("2026-01-05T08:59:00")), false, "one minute before the scheduled time");
  assert.equal(isScheduledPlanEntryOverdue(onTime, new Date("2026-01-05T09:01:00")), true, "one minute after the scheduled time");

  const [noAnchor] = applyScheduleMode([flexibleEntry("t1", 30)], { mode: "continuous" });
  assert.equal(noAnchor.effectiveStartTime, null);
  assert.equal(isScheduledPlanEntryOverdue(noAnchor, new Date("2026-01-05T23:59:00")), false, "nothing to be late for without an effective time");
});

// --- Morning Flow Simplification task, section 3: "a suitable schedule" ---

test("isDailyScheduleSuitable requires at least MIN_SUITABLE_DAILY_TASK_COUNT (3) effectively-scheduled entries", () => {
  assert.equal(MIN_SUITABLE_DAILY_TASK_COUNT, 3);
  const two = applyScheduleMode([flexibleEntry("t1", 10), flexibleEntry("t2", 10)], { mode: "continuous" });
  assert.equal(isDailyScheduleSuitable(two), false);
  const three = applyScheduleMode([flexibleEntry("t1", 10), flexibleEntry("t2", 10), flexibleEntry("t3", 10)], { mode: "continuous" });
  assert.equal(isDailyScheduleSuitable(three), true);
  const four = applyScheduleMode([flexibleEntry("t1", 10), flexibleEntry("t2", 10), flexibleEntry("t3", 10), flexibleEntry("t4", 10)], { mode: "continuous" });
  assert.equal(isDailyScheduleSuitable(four), true);
});

test("isDailyScheduleSuitable is false for an empty plan", () => {
  assert.equal(isDailyScheduleSuitable([]), false);
});
