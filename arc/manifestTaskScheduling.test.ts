import test from "node:test";
import assert from "node:assert/strict";

import {
  findFreeSlotAcrossPeriods,
  findFreeSlotInPeriod,
  isMinuteRangeFree,
  resolveManifestTaskSchedule,
  resolveOccupiedIntervalsForDate,
  type OccupiedInterval,
} from "./manifestTaskScheduling.ts";
import { createEmptyDailyRoutineTemplate, type RoutinePeriodTemplate } from "./dailyRoutine.ts";
import { createEmptyTask, type Task } from "./tasks.ts";
import { ROUTINE_PERIOD_IDS, type RoutinePeriodId } from "./tasks.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function makeTask(overrides: Partial<Task> = {}): Task {
  return { ...createEmptyTask(`task-${Math.random()}`, "כותרת", "פעולה", NOW), ...overrides };
}

function makePeriod(overrides: Partial<RoutinePeriodTemplate> = {}): RoutinePeriodTemplate {
  return { id: "morning", startTime: "07:00", endTime: "12:00", tasks: [], routineMode: "spaced", ...overrides };
}

// --- resolveOccupiedIntervalsForDate ---

test("resolveOccupiedIntervalsForDate includes a one-time task scheduled on that exact date, and excludes one scheduled on a different date", () => {
  const onDate = makeTask({ scheduledDate: "2026-11-12", scheduledTime: "10:00", expectedDurationMinutes: 30 });
  const otherDate = makeTask({ scheduledDate: "2026-11-13", scheduledTime: "10:00" });
  const intervals = resolveOccupiedIntervalsForDate([onDate, otherDate], [], "2026-11-12");
  assert.deepEqual(intervals, [{ startMinutes: 600, endMinutes: 630 }]);
});

test("resolveOccupiedIntervalsForDate includes a recurring task only on a matching weekday, and only when that occurrence isn't already completed", () => {
  const recurring = makeTask({ id: "r1", recurrence: { kind: "recurring", daysOfWeek: [2] }, scheduledTime: "09:00", expectedDurationMinutes: 15 });
  const tuesday = resolveOccupiedIntervalsForDate([recurring], [], "2026-11-10"); // Tuesday
  assert.deepEqual(tuesday, [{ startMinutes: 540, endMinutes: 555 }]);

  const wednesday = resolveOccupiedIntervalsForDate([recurring], [], "2026-11-11");
  assert.deepEqual(wednesday, [], "wrong weekday -- never occupies");

  const completedTuesday = resolveOccupiedIntervalsForDate([recurring], [{ taskId: "r1", occurrenceDateLocal: "2026-11-10", completedAt: NOW }], "2026-11-10");
  assert.deepEqual(completedTuesday, [], "already-completed occurrence frees the slot");
});

test("resolveOccupiedIntervalsForDate excludes archived/completed/postponed tasks, and respects excludeTaskId", () => {
  const archived = makeTask({ scheduledDate: "2026-11-12", scheduledTime: "08:00", status: "archived" });
  const completed = makeTask({ scheduledDate: "2026-11-12", scheduledTime: "09:00", status: "completed" });
  const postponed = makeTask({ scheduledDate: "2026-11-12", scheduledTime: "10:00", status: "postponed" });
  const excluded = makeTask({ id: "exclude-me", scheduledDate: "2026-11-12", scheduledTime: "11:00" });
  assert.deepEqual(resolveOccupiedIntervalsForDate([archived, completed, postponed], [], "2026-11-12"), []);
  assert.deepEqual(resolveOccupiedIntervalsForDate([excluded], [], "2026-11-12", "exclude-me"), []);
});

test("resolveOccupiedIntervalsForDate's interval includes the task's own breakAfter duration, and intervals come back sorted chronologically", () => {
  const withBreak = makeTask({ scheduledDate: "2026-11-12", scheduledTime: "09:00", expectedDurationMinutes: 30, breakAfter: { kind: "regular", durationMinutes: 10, plannedArcId: null } });
  const earlier = makeTask({ scheduledDate: "2026-11-12", scheduledTime: "07:00", expectedDurationMinutes: 10 });
  const intervals = resolveOccupiedIntervalsForDate([withBreak, earlier], [], "2026-11-12");
  assert.deepEqual(intervals, [
    { startMinutes: 420, endMinutes: 430 },
    { startMinutes: 540, endMinutes: 580 },
  ]);
});

// --- isMinuteRangeFree / findFreeSlotInPeriod / findFreeSlotAcrossPeriods ---

test("isMinuteRangeFree: adjacent (touching, non-overlapping) ranges count as free; any real overlap does not", () => {
  const intervals: OccupiedInterval[] = [{ startMinutes: 60, endMinutes: 90 }];
  assert.equal(isMinuteRangeFree(intervals, 90, 120), true, "starting exactly when the busy interval ends is free");
  assert.equal(isMinuteRangeFree(intervals, 30, 60), true, "ending exactly when the busy interval starts is free");
  assert.equal(isMinuteRangeFree(intervals, 80, 100), false);
});

test("findFreeSlotInPeriod returns the period's own startTime when nothing is occupied yet", () => {
  assert.equal(findFreeSlotInPeriod(makePeriod(), [], 30), 420); // 07:00
});

test("findFreeSlotInPeriod finds the gap AFTER an occupied interval when the period's own start is already taken", () => {
  const intervals: OccupiedInterval[] = [{ startMinutes: 420, endMinutes: 450 }]; // 07:00-07:30
  assert.equal(findFreeSlotInPeriod(makePeriod(), intervals, 30), 450);
});

test("findFreeSlotInPeriod returns null when the duration never fits before the period's own endTime", () => {
  const shortPeriod = makePeriod({ startTime: "07:00", endTime: "07:20" });
  assert.equal(findFreeSlotInPeriod(shortPeriod, [], 30), null);
});

test("findFreeSlotAcrossPeriods scans morning -> noon -> afternoon -> evening in that fixed order, skipping a fully-occupied period", () => {
  const periods = createEmptyDailyRoutineTemplate(NOW).periods;
  const intervals: OccupiedInterval[] = [{ startMinutes: 0, endMinutes: 24 * 60 }]; // occupies the entire day except nothing -- test morning full separately
  const morningFull: OccupiedInterval[] = [{ startMinutes: 7 * 60, endMinutes: 12 * 60 }]; // fills morning (07:00-12:00) exactly
  const slot = findFreeSlotAcrossPeriods(periods, morningFull, 30);
  assert.equal(slot?.periodId, "noon", "morning is fully occupied -- the next period in order must be chosen");
  assert.equal(findFreeSlotAcrossPeriods(periods, intervals, 30), null, "every period occupied all day -- no fit anywhere");
});

test("findFreeSlotAcrossPeriods never reorders ROUTINE_PERIOD_IDS itself", () => {
  assert.deepEqual(ROUTINE_PERIOD_IDS, ["morning", "noon", "afternoon", "evening"] as RoutinePeriodId[]);
});

// --- resolveManifestTaskSchedule ---

function emptyPeriods() {
  return createEmptyDailyRoutineTemplate(NOW).periods;
}

test("resolveManifestTaskSchedule with no preferred time/date at all auto-schedules directly into the very first fit found -- never presented as a conflict/alternative the trainee never asked to choose from", () => {
  const result = resolveManifestTaskSchedule(emptyPeriods(), () => [], { durationMinutes: 30, preferredDateLocal: null, preferredTime: null }, "2026-11-10");
  assert.deepEqual(result, { status: "scheduled", dateLocal: "2026-11-10", time: "07:00" });
});

test("resolveManifestTaskSchedule respects an explicit preferred time that IS free, rather than silently moving it", () => {
  const result = resolveManifestTaskSchedule(emptyPeriods(), () => [], { durationMinutes: 30, preferredDateLocal: "2026-11-10", preferredTime: "18:00" }, "2026-11-10");
  assert.deepEqual(result, { status: "scheduled", dateLocal: "2026-11-10", time: "18:00" });
});

test("resolveManifestTaskSchedule returns a conflict with alternative slots (never auto-moving the task) when the explicit preferred time is already busy", () => {
  const busyAt18 = (dateLocal: string): OccupiedInterval[] => (dateLocal === "2026-11-10" ? [{ startMinutes: 18 * 60, endMinutes: 18 * 60 + 60 }] : []);
  const result = resolveManifestTaskSchedule(emptyPeriods(), busyAt18, { durationMinutes: 30, preferredDateLocal: "2026-11-10", preferredTime: "18:00" }, "2026-11-10");
  assert.equal(result.status, "conflict");
  if (result.status === "conflict") {
    assert.match(result.reason, /18:00/);
    assert.ok(result.alternatives.length > 0);
    assert.ok(result.alternatives.length <= 3, "at most MAX_SCHEDULING_ALTERNATIVES alternatives");
    assert.equal(result.alternatives[0].dateLocal, "2026-11-10", "the FIRST alternative should still be on the preferred date if a slot exists there");
  }
});

test("resolveManifestTaskSchedule with a preferred date but no preferred time starts searching FROM that date, never an earlier one", () => {
  const result = resolveManifestTaskSchedule(emptyPeriods(), () => [], { durationMinutes: 30, preferredDateLocal: "2026-11-20", preferredTime: null }, "2026-11-10");
  assert.equal(result.status, "scheduled");
  if (result.status === "scheduled") assert.equal(result.dateLocal, "2026-11-20");
});

test("resolveManifestTaskSchedule reports a conflict with NO alternatives when nothing fits anywhere in the entire search horizon -- never silently displaces anything to make room", () => {
  const alwaysFull = (): OccupiedInterval[] => [
    { startMinutes: 0, endMinutes: 24 * 60 },
  ];
  const result = resolveManifestTaskSchedule(emptyPeriods(), alwaysFull, { durationMinutes: 30, preferredDateLocal: null, preferredTime: "08:00" }, "2026-11-10");
  assert.deepEqual(result, {
    status: "conflict",
    reason: "לא נמצא חלון פנוי בשגרה היומית בטווח החיפוש -- כל הזמנים תפוסים במשימות קיימות.",
    alternatives: [],
  });
});
