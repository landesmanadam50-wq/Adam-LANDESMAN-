import test from "node:test";
import assert from "node:assert/strict";

import {
  arcLinkPracticeSchedule,
  countCompletionsThisWeek,
  deleteArcLinkFromList,
  deleteRoutineTriggerFromList,
  deleteWeeklyActionFromList,
  describeTrigger,
  resolveRoutineTrigger,
  resolveWeeklyAction,
  upsertArcLinkInList,
  upsertRoutineTriggerInList,
  upsertWeeklyActionInList,
} from "./routineLinks.ts";
import type { ArcLink, RoutineTrigger, WeeklyAction } from "./routineLinks.ts";

function trigger(overrides: Partial<RoutineTrigger> = {}): RoutineTrigger {
  return { id: "trig-1", type: "time", text: "בשעה 10:00", time: "10:00", createdAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

function weeklyAction(overrides: Partial<WeeklyAction> = {}): WeeklyAction {
  return {
    id: "wa-1",
    name: "פעילות גופנית",
    days: [0, 2, 4],
    times: ["18:00"],
    durationMinutes: 10,
    triggerId: "trig-1",
    weeklyTarget: 3,
    completedDates: [],
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function arcLink(overrides: Partial<ArcLink> = {}): ArcLink {
  return {
    id: "link-1",
    protocolId: "arcbuild-1",
    protocolType: "arc",
    weeklyActionId: "wa-1",
    triggerId: "trig-1",
    mode: "with_archi",
    practiceDays: [0, 2],
    practiceTime: "09:00",
    weeklyTarget: 4,
    completedPracticeDates: [],
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// List CRUD -- editing/deleting one entity never touches another
// ---------------------------------------------------------------------------

test("upsertRoutineTriggerInList updates the matching trigger in place by id, never touching another trigger", () => {
  const list = [trigger({ id: "a", text: "טריגר א" }), trigger({ id: "b", text: "טריגר ב" })];
  const updated = upsertRoutineTriggerInList(list, trigger({ id: "a", text: "טריגר א מעודכן" }));
  assert.equal(updated.find((t) => t.id === "a")!.text, "טריגר א מעודכן");
  assert.equal(updated.find((t) => t.id === "b")!.text, "טריגר ב");
  assert.equal(updated.length, 2);
});

test("upsertRoutineTriggerInList appends a new trigger when the id doesn't match any existing one", () => {
  const list = [trigger({ id: "a" })];
  const updated = upsertRoutineTriggerInList(list, trigger({ id: "c" }));
  assert.equal(updated.length, 2);
});

test("deleteRoutineTriggerFromList removes exactly the matching trigger, a no-op for an unknown id", () => {
  const list = [trigger({ id: "a" }), trigger({ id: "b" })];
  assert.equal(deleteRoutineTriggerFromList(list, "a").length, 1);
  assert.equal(deleteRoutineTriggerFromList(list, "nope").length, 2);
});

test("upsertWeeklyActionInList / deleteWeeklyActionFromList mirror the same by-id-only guarantee", () => {
  const list = [weeklyAction({ id: "a", name: "פעולה א" }), weeklyAction({ id: "b", name: "פעולה ב" })];
  const updated = upsertWeeklyActionInList(list, weeklyAction({ id: "a", name: "פעולה א מעודכנת" }));
  assert.equal(updated.find((w) => w.id === "a")!.name, "פעולה א מעודכנת");
  assert.equal(updated.find((w) => w.id === "b")!.name, "פעולה ב");
  assert.equal(deleteWeeklyActionFromList(list, "a").length, 1);
});

test("upsertArcLinkInList / deleteArcLinkFromList mirror the same by-id-only guarantee -- an ARC Link and a Mini ARC Link never collide", () => {
  const list = [arcLink({ id: "a", protocolType: "arc" }), arcLink({ id: "b", protocolType: "mini_arc" })];
  const updated = upsertArcLinkInList(list, arcLink({ id: "a", enabled: false }));
  assert.equal(updated.find((l) => l.id === "a")!.enabled, false);
  assert.equal(updated.find((l) => l.id === "b")!.enabled, true);
  assert.equal(deleteArcLinkFromList(list, "a").length, 1);
});

// ---------------------------------------------------------------------------
// Lookup / describe -- safe for a deleted/missing reference
// ---------------------------------------------------------------------------

test("resolveRoutineTrigger / resolveWeeklyAction return null (never throw) for a missing or deleted reference", () => {
  assert.equal(resolveRoutineTrigger(null, []), null);
  assert.equal(resolveRoutineTrigger("gone", [trigger({ id: "a" })]), null);
  assert.equal(resolveRoutineTrigger("a", [trigger({ id: "a" })])!.id, "a");
  assert.equal(resolveWeeklyAction(undefined, []), null);
  assert.equal(resolveWeeklyAction("gone", [weeklyAction({ id: "a" })]), null);
});

test("describeTrigger never renders 'undefined'/'null' and safely falls back for a missing trigger", () => {
  assert.equal(describeTrigger(null), "לא הוגדר טריגר");
  assert.equal(describeTrigger(trigger({ text: "   " })), "לא הוגדר טריגר");
  assert.equal(describeTrigger(trigger({ text: "אחרי ארוחת הערב" })), "אחרי ארוחת הערב");
});

// ---------------------------------------------------------------------------
// Weekly completion counting -- reuses data/weeklyStats.ts's ISO week key
// ---------------------------------------------------------------------------

test("countCompletionsThisWeek counts only dates in the same ISO week as `now`", () => {
  const now = new Date("2026-03-11T12:00:00.000Z"); // Wednesday
  const dates = [
    "2026-03-09", // Monday, same week
    "2026-03-11", // Wednesday, same week
    "2026-03-08", // previous Sunday, different ISO week
    "2026-03-16", // next Monday, different week
  ];
  assert.equal(countCompletionsThisWeek(dates, now), 2);
});

test("countCompletionsThisWeek safely ignores malformed date entries rather than throwing", () => {
  const now = new Date("2026-03-11T12:00:00.000Z");
  assert.equal(countCompletionsThisWeek(["not-a-date", "", "2026-03-11"], now), 1);
});

test("countCompletionsThisWeek returns 0 for an empty list", () => {
  assert.equal(countCompletionsThisWeek([]), 0);
});

// ---------------------------------------------------------------------------
// arcLinkPracticeSchedule -- adapts to arc/routines.ts's own {hour, minute,
// recurrenceDays} shape; null when no practice time is configured
// ---------------------------------------------------------------------------

test("arcLinkPracticeSchedule returns null when practiceTime or practiceDays is missing/empty -- the practice schedule is optional", () => {
  assert.equal(arcLinkPracticeSchedule({ practiceDays: [], practiceTime: "09:00" }), null);
  assert.equal(arcLinkPracticeSchedule({ practiceDays: [1], practiceTime: null }), null);
});

test("arcLinkPracticeSchedule parses a valid 'HH:MM' practiceTime into {hour, minute, recurrenceDays}", () => {
  const schedule = arcLinkPracticeSchedule({ practiceDays: [1, 3], practiceTime: "09:05" });
  assert.deepEqual(schedule, { hour: 9, minute: 5, recurrenceDays: [1, 3] });
});

test("arcLinkPracticeSchedule returns null (never NaN/garbage) for a malformed practiceTime string", () => {
  assert.equal(arcLinkPracticeSchedule({ practiceDays: [1], practiceTime: "not-a-time" }), null);
  assert.equal(arcLinkPracticeSchedule({ practiceDays: [1], practiceTime: "25:00" }), null);
  assert.equal(arcLinkPracticeSchedule({ practiceDays: [1], practiceTime: "10:70" }), null);
});
