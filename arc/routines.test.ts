import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRoutineListItems,
  generateRoutineId,
  isRoutineCompletedForDate,
  resolveNextOccurrenceDate,
  resolveRoutineStatusToday,
  resolveTodayOccurrenceDate,
  sortRoutineListItems,
} from "./routines.ts";
import type { RoutineListItem } from "./routines.ts";
import type { RoutineOccurrenceCompletion, ScheduledRoutine } from "../data/storage.ts";

function makeRoutine(overrides: Partial<ScheduledRoutine> = {}): ScheduledRoutine {
  return {
    id: "routine-1",
    title: "מיקוד בוקר",
    hour: 8,
    minute: 0,
    recurrenceDays: [0, 1, 2, 3, 4, 5, 6],
    successFocusDurationMinutes: 10,
    notificationsEnabled: true,
    enabled: true,
    nextOccurrenceNotificationId: null,
    nextOccurrenceScheduledFor: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("resolveTodayOccurrenceDate returns today's scheduled moment when today is a recurrence day", () => {
  const now = new Date(2026, 0, 5, 10, 0); // local
  const routine = makeRoutine({ hour: 8, minute: 30, recurrenceDays: [now.getDay()] });
  const occurrence = resolveTodayOccurrenceDate(routine, now);
  assert.ok(occurrence);
  assert.equal(occurrence!.getFullYear(), 2026);
  assert.equal(occurrence!.getMonth(), 0);
  assert.equal(occurrence!.getDate(), 5);
  assert.equal(occurrence!.getHours(), 8);
  assert.equal(occurrence!.getMinutes(), 30);
});

test("resolveTodayOccurrenceDate returns null when today is not a recurrence day", () => {
  const now = new Date(2026, 0, 5, 10, 0);
  const otherDay = (now.getDay() + 1) % 7;
  const routine = makeRoutine({ recurrenceDays: [otherDay] });
  assert.equal(resolveTodayOccurrenceDate(routine, now), null);
});

test("resolveNextOccurrenceDate returns today's own moment when it is still ahead", () => {
  const now = new Date(2026, 0, 5, 6, 0);
  const routine = makeRoutine({ hour: 8, minute: 0, recurrenceDays: [now.getDay()] });
  const next = resolveNextOccurrenceDate(routine, now);
  assert.ok(next);
  assert.equal(next!.getDate(), 5);
  assert.equal(next!.getHours(), 8);
});

test("resolveNextOccurrenceDate skips today once its own time has already passed, landing on the SAME weekday next week -- never a bogus 'in a few hours' result", () => {
  const now = new Date(2026, 0, 5, 20, 0); // today 20:00
  const routine = makeRoutine({ hour: 8, minute: 0, recurrenceDays: [now.getDay()] }); // only today's weekday
  const next = resolveNextOccurrenceDate(routine, now);
  assert.ok(next);
  // Must be exactly 7 calendar days later, at the SAME configured clock time -- not "today + a few hours".
  assert.equal(next!.getDate(), 12);
  assert.equal(next!.getMonth(), 0);
  assert.equal(next!.getHours(), 8);
  assert.equal(next!.getMinutes(), 0);
  const diffDays = (next!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
  assert.ok(diffDays > 6 && diffDays < 7, `expected ~6.5 days, got ${diffDays}`);
});

test("resolveNextOccurrenceDate: 'tomorrow at the same time' is a real next-day date, never miscomputed as 'in one hour'", () => {
  const now = new Date(2026, 0, 5, 23, 30); // Monday-equivalent, 23:30
  const tomorrowDow = (now.getDay() + 1) % 7;
  const routine = makeRoutine({ hour: 0, minute: 0, recurrenceDays: [tomorrowDow] }); // only tomorrow's weekday
  const next = resolveNextOccurrenceDate(routine, now);
  assert.ok(next);
  assert.equal(next!.getDate(), 6); // the actual next calendar day
  assert.equal(next!.getHours(), 0);
  assert.equal(next!.getMinutes(), 0);
  const diffMinutes = (next!.getTime() - now.getTime()) / 60_000;
  assert.equal(diffMinutes, 30); // genuinely 30 minutes away, not "in one hour" or any other rounded guess
});

test("resolveNextOccurrenceDate picks the nearest of several recurrence days", () => {
  const now = new Date(2026, 0, 5, 12, 0); // Monday-equivalent
  const dow = now.getDay();
  const routine = makeRoutine({ hour: 9, minute: 0, recurrenceDays: [dow, (dow + 2) % 7] });
  const next = resolveNextOccurrenceDate(routine, now);
  assert.ok(next);
  assert.equal(next!.getDate(), 7); // 2 days later, since today's own 9:00 has already passed
});

test("resolveNextOccurrenceDate crosses a month boundary correctly", () => {
  const now = new Date(2026, 0, 31, 22, 0); // Jan 31, local
  const tomorrowDow = (now.getDay() + 1) % 7;
  const routine = makeRoutine({ hour: 8, minute: 0, recurrenceDays: [tomorrowDow] });
  const next = resolveNextOccurrenceDate(routine, now);
  assert.ok(next);
  assert.equal(next!.getMonth(), 1); // February
  assert.equal(next!.getDate(), 1);
});

test("resolveNextOccurrenceDate returns null when no recurrence day is configured", () => {
  const routine = makeRoutine({ recurrenceDays: [] });
  assert.equal(resolveNextOccurrenceDate(routine, new Date(2026, 0, 5, 12, 0)), null);
});

test("isRoutineCompletedForDate matches only the same routine and the same local date", () => {
  const completions: RoutineOccurrenceCompletion[] = [
    { routineId: "routine-1", occurrenceDateLocal: "2026-01-05", completedAt: "2026-01-05T09:00:00.000Z" },
  ];
  assert.equal(isRoutineCompletedForDate("routine-1", "2026-01-05", completions), true);
  assert.equal(isRoutineCompletedForDate("routine-2", "2026-01-05", completions), false);
  assert.equal(isRoutineCompletedForDate("routine-1", "2026-01-06", completions), false);
});

test("resolveRoutineStatusToday: disabled overrides everything else", () => {
  const now = new Date(2026, 0, 5, 12, 0);
  const routine = makeRoutine({ enabled: false, recurrenceDays: [now.getDay()], hour: 8 });
  assert.equal(resolveRoutineStatusToday(routine, [], now), "disabled");
});

test("resolveRoutineStatusToday: no occurrence today when today isn't a recurrence day", () => {
  const now = new Date(2026, 0, 5, 12, 0);
  const otherDay = (now.getDay() + 1) % 7;
  const routine = makeRoutine({ recurrenceDays: [otherDay] });
  assert.equal(resolveRoutineStatusToday(routine, [], now), "noOccurrenceToday");
});

test("resolveRoutineStatusToday: completed when today's occurrence has a matching completion", () => {
  const now = new Date(2026, 0, 5, 12, 0);
  const routine = makeRoutine({ recurrenceDays: [now.getDay()], hour: 8 });
  const completions: RoutineOccurrenceCompletion[] = [
    { routineId: routine.id, occurrenceDateLocal: "2026-01-05", completedAt: "2026-01-05T09:00:00.000Z" },
  ];
  assert.equal(resolveRoutineStatusToday(routine, completions, now), "completed");
});

test("resolveRoutineStatusToday: dueOrOverdue once the scheduled time has passed and it's not completed", () => {
  const now = new Date(2026, 0, 5, 12, 0);
  const routine = makeRoutine({ recurrenceDays: [now.getDay()], hour: 8 });
  assert.equal(resolveRoutineStatusToday(routine, [], now), "dueOrOverdue");
});

test("resolveRoutineStatusToday: upcoming when the scheduled time hasn't arrived yet", () => {
  const now = new Date(2026, 0, 5, 6, 0);
  const routine = makeRoutine({ recurrenceDays: [now.getDay()], hour: 8 });
  assert.equal(resolveRoutineStatusToday(routine, [], now), "upcoming");
});

test("sortRoutineListItems: today's routines sort chronologically ahead of non-today routines", () => {
  const now = new Date(2026, 0, 5, 6, 0);
  const todayDow = now.getDay();
  const otherDow = (now.getDay() + 2) % 7;
  const later = makeRoutine({ id: "later-today", hour: 20, minute: 0, recurrenceDays: [todayDow] });
  const earlier = makeRoutine({ id: "earlier-today", hour: 8, minute: 0, recurrenceDays: [todayDow] });
  const notToday = makeRoutine({ id: "not-today", hour: 8, minute: 0, recurrenceDays: [otherDow] });
  const items: RoutineListItem[] = buildRoutineListItems([later, notToday, earlier], [], now);
  const sorted = sortRoutineListItems(items);
  assert.deepEqual(
    sorted.map((item) => item.routine.id),
    ["earlier-today", "later-today", "not-today"]
  );
});

test("generateRoutineId produces distinct ids", () => {
  const ids = new Set(Array.from({ length: 20 }, () => generateRoutineId()));
  assert.equal(ids.size, 20);
});
