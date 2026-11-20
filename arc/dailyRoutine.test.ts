import test from "node:test";
import assert from "node:assert/strict";

import {
  addTaskToTemplate,
  computeOneOffInsertionTime,
  createEmptyDailyRoutineTemplate,
  formatMinutesToClockTime,
  generateDailyRoutineSchedule,
  generatePeriodSchedule,
  generateRoutineTaskTemplateId,
  moveTaskBetweenPeriods,
  moveTaskWithinPeriod,
  normalizeDailyRoutineTemplate,
  normalizeRoutinePeriodTemplate,
  parseClockTimeToMinutes,
  removeTaskFromTemplate,
  resolveNextContinuousTaskInPeriod,
  setBreakAfterTask,
  setPeriodRoutineMode,
  updatePeriodTimes,
  updateTaskInTemplate,
  type RoutineTaskTemplate,
} from "./dailyRoutine.ts";
import { createEmptyTask } from "./tasks.ts";
import type { Task } from "./tasks.ts";
import { createTaskOccurrenceCompletion } from "./taskOccurrence.ts";

function task(id: string, title: string, durationMinutes: number, breakAfter: RoutineTaskTemplate["breakAfter"] = null): RoutineTaskTemplate {
  return { id, title, durationMinutes, breakAfter };
}

function routineTask(id: string, periodId: Task["routinePeriodId"], overrides: Partial<Task> = {}): Task {
  const base = createEmptyTask(id, id, id, "2026-01-01T00:00:00.000Z");
  return { ...base, routinePeriodId: periodId, recurrence: { kind: "recurring", daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }, scheduledTime: "08:00", ...overrides };
}

test("createEmptyDailyRoutineTemplate seeds all four periods with defaults and no tasks", () => {
  const template = createEmptyDailyRoutineTemplate("2026-01-01T00:00:00.000Z");
  assert.deepEqual(Object.keys(template.periods).sort(), ["afternoon", "evening", "morning", "noon"]);
  for (const period of Object.values(template.periods)) {
    assert.equal(period.tasks.length, 0);
    assert.ok(parseClockTimeToMinutes(period.startTime) !== null);
    assert.ok(parseClockTimeToMinutes(period.endTime) !== null);
  }
});

test("parseClockTimeToMinutes accepts valid HH:MM and rejects partial/invalid input", () => {
  assert.equal(parseClockTimeToMinutes("07:30"), 450);
  assert.equal(parseClockTimeToMinutes("23:59"), 1439);
  assert.equal(parseClockTimeToMinutes("00:00"), 0);
  assert.equal(parseClockTimeToMinutes("20:"), null, "a partial still-being-typed value must never parse");
  assert.equal(parseClockTimeToMinutes("24:00"), null);
  assert.equal(parseClockTimeToMinutes("9:5"), null);
  assert.equal(parseClockTimeToMinutes(""), null);
});

test("formatMinutesToClockTime pads and wraps past midnight", () => {
  assert.equal(formatMinutesToClockTime(90), "01:30");
  assert.equal(formatMinutesToClockTime(0), "00:00");
  assert.equal(formatMinutesToClockTime(24 * 60 + 15), "00:15");
});

test("generateRoutineTaskTemplateId produces distinct ids", () => {
  const a = generateRoutineTaskTemplateId();
  const b = generateRoutineTaskTemplateId();
  assert.notEqual(a, b);
  assert.match(a, /^routine-task-/);
});

test("generatePeriodSchedule places tasks sequentially starting at the period's own startTime", () => {
  const period = {
    id: "morning" as const, routineMode: "spaced" as const,
    startTime: "07:00",
    endTime: "12:00",
    tasks: [task("t1", "Shower", 20), task("t2", "Breakfast", 30)],
  };
  const result = generatePeriodSchedule(period);
  assert.equal(result.slots.length, 2);
  assert.equal(result.slots[0].startTime, "07:00");
  assert.equal(result.slots[1].startTime, "07:20");
  assert.equal(result.conflict, null);
});

test("generatePeriodSchedule accounts for breakAfter duration between tasks", () => {
  const period = {
    id: "morning" as const, routineMode: "spaced" as const,
    startTime: "07:00",
    endTime: "12:00",
    tasks: [task("t1", "Shower", 20, { kind: "regular" as const, durationMinutes: 10, plannedArcId: null }), task("t2", "Breakfast", 30)],
  };
  const result = generatePeriodSchedule(period);
  assert.equal(result.slots[0].startTime, "07:00");
  assert.equal(result.slots[1].startTime, "07:30", "second task starts after the 20-minute task PLUS its 10-minute break");
});

test("generatePeriodSchedule never drops a task when the period overflows -- reports a conflict instead", () => {
  const period = {
    id: "noon" as const, routineMode: "spaced" as const,
    startTime: "12:00",
    endTime: "12:30", // only 30 minutes available
    tasks: [task("t1", "A", 20), task("t2", "B", 20)], // needs 40
  };
  const result = generatePeriodSchedule(period);
  assert.equal(result.slots.length, 2, "both tasks must still get a computed slot");
  assert.equal(result.slots[1].startTime, "12:20");
  assert.ok(result.conflict);
  assert.equal(result.conflict?.neededMinutes, 40);
  assert.equal(result.conflict?.availableMinutes, 30);
  assert.equal(result.conflict?.overflowMinutes, 10);
});

test("generatePeriodSchedule with zero tasks has no conflict even when endTime equals startTime", () => {
  const period = { id: "evening" as const, routineMode: "spaced" as const, startTime: "19:00", endTime: "19:00", tasks: [] };
  const result = generatePeriodSchedule(period);
  assert.equal(result.slots.length, 0);
  assert.equal(result.conflict, null);
});

test("generateDailyRoutineSchedule covers every period in order and collects only the real conflicts", () => {
  const template = createEmptyDailyRoutineTemplate("2026-01-01T00:00:00.000Z");
  const withTasks = addTaskToTemplate(template, "morning", 0, task("t1", "Shower", 20), "2026-01-01T00:00:00.000Z");
  const generated = generateDailyRoutineSchedule(withTasks);
  assert.equal(generated.periods.length, 4);
  assert.deepEqual(generated.periods.map((p) => p.periodId), ["morning", "noon", "afternoon", "evening"]);
  assert.equal(generated.conflicts.length, 0);
  assert.equal(generated.periods[0].slots.length, 1);
});

test("addTaskToTemplate inserts at the requested position without touching other periods", () => {
  const now = "2026-01-01T00:00:00.000Z";
  let template = createEmptyDailyRoutineTemplate(now);
  template = addTaskToTemplate(template, "morning", 0, task("t1", "First", 10), now);
  template = addTaskToTemplate(template, "morning", 0, task("t2", "Second", 10), now);
  assert.deepEqual(template.periods.morning.tasks.map((t) => t.id), ["t2", "t1"]);
  assert.equal(template.periods.noon.tasks.length, 0);
});

test("removeTaskFromTemplate removes only the named task, leaving the rest untouched", () => {
  const now = "2026-01-01T00:00:00.000Z";
  let template = createEmptyDailyRoutineTemplate(now);
  template = addTaskToTemplate(template, "morning", 0, task("t1", "A", 10), now);
  template = addTaskToTemplate(template, "morning", 1, task("t2", "B", 10), now);
  template = removeTaskFromTemplate(template, "morning", "t1", now);
  assert.deepEqual(template.periods.morning.tasks.map((t) => t.id), ["t2"]);
});

test("updateTaskInTemplate patches only title/duration of the named task", () => {
  const now = "2026-01-01T00:00:00.000Z";
  let template = createEmptyDailyRoutineTemplate(now);
  template = addTaskToTemplate(template, "morning", 0, task("t1", "A", 10), now);
  template = updateTaskInTemplate(template, "morning", "t1", { title: "Renamed", durationMinutes: 25 }, now);
  assert.equal(template.periods.morning.tasks[0].title, "Renamed");
  assert.equal(template.periods.morning.tasks[0].durationMinutes, 25);
});

test("setBreakAfterTask converts a regular break into an ARC break and back", () => {
  const now = "2026-01-01T00:00:00.000Z";
  let template = createEmptyDailyRoutineTemplate(now);
  template = addTaskToTemplate(template, "morning", 0, task("t1", "A", 10, { kind: "regular", durationMinutes: 5, plannedArcId: null }), now);
  template = setBreakAfterTask(template, "morning", "t1", { kind: "arc", durationMinutes: 5, plannedArcId: "planned-1" }, now);
  assert.equal(template.periods.morning.tasks[0].breakAfter?.kind, "arc");
  assert.equal(template.periods.morning.tasks[0].breakAfter?.plannedArcId, "planned-1");
  template = setBreakAfterTask(template, "morning", "t1", { kind: "regular", durationMinutes: 5, plannedArcId: null }, now);
  assert.equal(template.periods.morning.tasks[0].breakAfter?.kind, "regular");
  assert.equal(template.periods.morning.tasks[0].breakAfter?.plannedArcId, null);
});

test("setBreakAfterTask with null removes the break entirely", () => {
  const now = "2026-01-01T00:00:00.000Z";
  let template = createEmptyDailyRoutineTemplate(now);
  template = addTaskToTemplate(template, "morning", 0, task("t1", "A", 10, { kind: "regular", durationMinutes: 5, plannedArcId: null }), now);
  template = setBreakAfterTask(template, "morning", "t1", null, now);
  assert.equal(template.periods.morning.tasks[0].breakAfter, null);
});

test("moveTaskWithinPeriod reorders tasks inside the same period", () => {
  const now = "2026-01-01T00:00:00.000Z";
  let template = createEmptyDailyRoutineTemplate(now);
  template = addTaskToTemplate(template, "morning", 0, task("t1", "A", 10), now);
  template = addTaskToTemplate(template, "morning", 1, task("t2", "B", 10), now);
  template = addTaskToTemplate(template, "morning", 2, task("t3", "C", 10), now);
  template = moveTaskWithinPeriod(template, "morning", "t3", 0, now);
  assert.deepEqual(template.periods.morning.tasks.map((t) => t.id), ["t3", "t1", "t2"]);
});

test("moveTaskWithinPeriod is a no-op when the task id does not exist in that period", () => {
  const now = "2026-01-01T00:00:00.000Z";
  let template = createEmptyDailyRoutineTemplate(now);
  template = addTaskToTemplate(template, "morning", 0, task("t1", "A", 10), now);
  const unchanged = moveTaskWithinPeriod(template, "morning", "does-not-exist", 0, now);
  assert.deepEqual(unchanged.periods.morning.tasks.map((t) => t.id), ["t1"]);
});

test("moveTaskBetweenPeriods removes from the source period and inserts into the destination at the requested index", () => {
  const now = "2026-01-01T00:00:00.000Z";
  let template = createEmptyDailyRoutineTemplate(now);
  template = addTaskToTemplate(template, "morning", 0, task("t1", "A", 10), now);
  template = addTaskToTemplate(template, "noon", 0, task("t2", "B", 10), now);
  template = moveTaskBetweenPeriods(template, "morning", "noon", "t1", 0, now);
  assert.deepEqual(template.periods.morning.tasks, []);
  assert.deepEqual(template.periods.noon.tasks.map((t) => t.id), ["t1", "t2"]);
});

test("moveTaskBetweenPeriods with the same source and destination behaves like moveTaskWithinPeriod", () => {
  const now = "2026-01-01T00:00:00.000Z";
  let template = createEmptyDailyRoutineTemplate(now);
  template = addTaskToTemplate(template, "morning", 0, task("t1", "A", 10), now);
  template = addTaskToTemplate(template, "morning", 1, task("t2", "B", 10), now);
  template = moveTaskBetweenPeriods(template, "morning", "morning", "t2", 0, now);
  assert.deepEqual(template.periods.morning.tasks.map((t) => t.id), ["t2", "t1"]);
});

test("moveTaskBetweenPeriods is a no-op when the task does not exist in the source period", () => {
  const now = "2026-01-01T00:00:00.000Z";
  const template = createEmptyDailyRoutineTemplate(now);
  const unchanged = moveTaskBetweenPeriods(template, "morning", "noon", "ghost", 0, now);
  assert.deepEqual(unchanged, template);
});

test("updatePeriodTimes changes only the named period's start/end", () => {
  const now = "2026-01-01T00:00:00.000Z";
  let template = createEmptyDailyRoutineTemplate(now);
  template = updatePeriodTimes(template, "evening", "18:00", "21:30", now);
  assert.equal(template.periods.evening.startTime, "18:00");
  assert.equal(template.periods.evening.endTime, "21:30");
  assert.equal(template.periods.morning.startTime, "07:00", "other periods must be untouched");
});

test("computeOneOffInsertionTime at position 0 with existing slots uses the first slot's own start time, never shifting it", () => {
  const period = { id: "morning" as const, routineMode: "spaced" as const, startTime: "07:00", endTime: "12:00", tasks: [task("t1", "A", 20), task("t2", "B", 20)] };
  const schedule = generatePeriodSchedule(period);
  assert.equal(computeOneOffInsertionTime(schedule, period.startTime, 0), "07:00");
});

test("computeOneOffInsertionTime at position 0 on an empty period falls back to the period's own startTime", () => {
  const period = { id: "morning" as const, routineMode: "spaced" as const, startTime: "07:00", endTime: "12:00", tasks: [] };
  const schedule = generatePeriodSchedule(period);
  assert.equal(computeOneOffInsertionTime(schedule, period.startTime, 0), "07:00");
});

test("computeOneOffInsertionTime after an existing slot (with its break) lands right after that slot ends", () => {
  const period = {
    id: "morning" as const, routineMode: "spaced" as const,
    startTime: "07:00",
    endTime: "12:00",
    tasks: [task("t1", "A", 20, { kind: "regular" as const, durationMinutes: 10, plannedArcId: null }), task("t2", "B", 20)],
  };
  const schedule = generatePeriodSchedule(period);
  assert.equal(computeOneOffInsertionTime(schedule, period.startTime, 1), "07:30", "right after t1's 20min + its 10min break");
});

test("computeOneOffInsertionTime at a position past the end lands after the last existing slot", () => {
  const period = { id: "morning" as const, routineMode: "spaced" as const, startTime: "07:00", endTime: "12:00", tasks: [task("t1", "A", 20), task("t2", "B", 20)] };
  const schedule = generatePeriodSchedule(period);
  assert.equal(computeOneOffInsertionTime(schedule, period.startTime, 99), "07:40");
});

test("every template-editing function bumps updatedAt and never mutates the input object", () => {
  const now = "2026-01-01T00:00:00.000Z";
  const original = createEmptyDailyRoutineTemplate(now);
  const snapshot = JSON.parse(JSON.stringify(original));
  const next = addTaskToTemplate(original, "morning", 0, task("t1", "A", 10), "2026-02-02T00:00:00.000Z");
  assert.deepEqual(original, snapshot, "the input template must not be mutated");
  assert.equal(next.updatedAt, "2026-02-02T00:00:00.000Z");
});

// --- Continuous vs. Spaced Routines ---

test("createEmptyDailyRoutineTemplate defaults every period to 'spaced' -- the exact pre-existing behavior", () => {
  const template = createEmptyDailyRoutineTemplate("2026-01-01T00:00:00.000Z");
  for (const period of Object.values(template.periods)) {
    assert.equal(period.routineMode, "spaced");
  }
});

test("normalizeRoutinePeriodTemplate backfills routineMode to 'spaced' for a period saved before this field existed, without touching an already-set value", () => {
  const legacy = { id: "morning" as const, startTime: "07:00", endTime: "12:00", tasks: [] } as unknown as Parameters<typeof normalizeRoutinePeriodTemplate>[0];
  assert.equal(normalizeRoutinePeriodTemplate(legacy).routineMode, "spaced");
  const alreadyContinuous = { ...legacy, routineMode: "continuous" as const };
  assert.equal(normalizeRoutinePeriodTemplate(alreadyContinuous).routineMode, "continuous");
});

test("normalizeDailyRoutineTemplate normalizes every period, leaving everything else about the template untouched", () => {
  const now = "2026-01-01T00:00:00.000Z";
  let template = createEmptyDailyRoutineTemplate(now);
  template = addTaskToTemplate(template, "morning", 0, task("t1", "A", 10), now);
  const legacyShaped = {
    ...template,
    periods: { ...template.periods, noon: { id: "noon", startTime: "12:00", endTime: "15:00", tasks: [] } } as unknown as typeof template.periods,
  };
  const normalized = normalizeDailyRoutineTemplate(legacyShaped);
  assert.equal(normalized.periods.noon.routineMode, "spaced");
  assert.equal(normalized.periods.morning.tasks.length, 1, "other periods' own data must be untouched");
});

test("setPeriodRoutineMode changes only the named period's mode, leaving every other period's mode untouched", () => {
  const now = "2026-01-01T00:00:00.000Z";
  let template = createEmptyDailyRoutineTemplate(now);
  template = setPeriodRoutineMode(template, "morning", "continuous", now);
  assert.equal(template.periods.morning.routineMode, "continuous");
  assert.equal(template.periods.noon.routineMode, "spaced");
});

test("setPeriodRoutineMode can switch back to spaced -- changing mode never touches the period's own tasks", () => {
  const now = "2026-01-01T00:00:00.000Z";
  let template = createEmptyDailyRoutineTemplate(now);
  template = addTaskToTemplate(template, "morning", 0, task("t1", "A", 10), now);
  template = setPeriodRoutineMode(template, "morning", "continuous", now);
  template = setPeriodRoutineMode(template, "morning", "spaced", now);
  assert.equal(template.periods.morning.routineMode, "spaced");
  assert.equal(template.periods.morning.tasks.length, 1, "switching modes must never lose task data");
});

test("resolveNextContinuousTaskInPeriod finds the next not-yet-completed task in the SAME period, sorted by scheduledTime, excluding the one just completed", () => {
  const now = new Date("2026-01-05T09:00:00");
  const t1 = routineTask("t1", "morning", { scheduledTime: "07:00" });
  const t2 = routineTask("t2", "morning", { scheduledTime: "08:00" });
  const t3 = routineTask("t3", "morning", { scheduledTime: "09:00" });
  const next = resolveNextContinuousTaskInPeriod([t1, t2, t3], [], "morning", "t1", now);
  assert.equal(next?.id, "t2");
});

test("resolveNextContinuousTaskInPeriod returns null once every task in the period is completed for today -- the 'last task' signal", () => {
  const now = new Date("2026-01-05T09:00:00");
  const t1 = routineTask("t1", "morning", { scheduledTime: "07:00" });
  const t2 = routineTask("t2", "morning", { scheduledTime: "08:00" });
  const completions = [createTaskOccurrenceCompletion("t2", now)];
  const next = resolveNextContinuousTaskInPeriod([t1, t2], completions, "morning", "t1", now);
  assert.equal(next, null);
});

test("resolveNextContinuousTaskInPeriod never crosses into a DIFFERENT period, even one scheduled earlier", () => {
  const now = new Date("2026-01-05T09:00:00");
  const t1 = routineTask("t1", "morning", { scheduledTime: "07:00" });
  const other = routineTask("other", "noon", { scheduledTime: "07:30" });
  const next = resolveNextContinuousTaskInPeriod([t1, other], [], "morning", "t1", now);
  assert.equal(next, null, "the noon task must never be picked up while resolving the morning period");
});

test("resolveNextContinuousTaskInPeriod skips an already-completed recurring occurrence for today, and skips an archived task entirely", () => {
  const now = new Date("2026-01-05T09:00:00");
  const completedToday = routineTask("t2", "morning", { scheduledTime: "08:00" });
  const archived = routineTask("t3", "morning", { scheduledTime: "08:30", status: "archived" });
  const completions = [createTaskOccurrenceCompletion("t2", now)];
  const next = resolveNextContinuousTaskInPeriod([completedToday, archived], completions, "morning", "t1", now);
  assert.equal(next, null);
});

test("resolveNextContinuousTaskInPeriod ignores a one-time task not scheduled for today", () => {
  const now = new Date("2026-01-05T09:00:00");
  const futureOneOff = routineTask("t2", "morning", { recurrence: { kind: "once" }, scheduledDate: "2026-01-06", scheduledTime: "08:00" });
  const next = resolveNextContinuousTaskInPeriod([futureOneOff], [], "morning", "t1", now);
  assert.equal(next, null);
});
