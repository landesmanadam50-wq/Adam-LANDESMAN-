import test from "node:test";
import assert from "node:assert/strict";

import { resolveNextPlannedArcAlarmOccurrence } from "./plannedArcAlarm.ts";
import { createPlannedArcFromSession } from "./plannedArc.ts";
import type { PlannedArc } from "./plannedArc.ts";
import { STANDALONE_ARC_TASK_ID, createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import { createEmptyTask } from "./tasks.ts";
import type { Task } from "./tasks.ts";

const NOW = new Date("2026-01-07T09:00:00"); // a Wednesday, local time
const NOW_ISO = NOW.toISOString();

function arcFixture(overrides: Partial<PlannedArc> = {}): PlannedArc {
  const session = createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW_ISO, "spontaneous");
  const base = createPlannedArcFromSession(session, "full", "p1", NOW_ISO);
  return { ...base, ...overrides };
}

function plannedTask(overrides: Partial<Task> = {}): Task {
  return { ...createEmptyTask("t1", "לכתוב דוח", "לפתוח את המחשב", NOW_ISO), ...overrides };
}

test("returns null whenever the alarm is disabled, regardless of how everything else is configured", () => {
  const item = arcFixture({ arcAlarmEnabled: false, arcAlarmTimingKind: "standalone", arcAlarmTime: "10:00", arcAlarmRecurrence: { kind: "once" } });
  assert.equal(resolveNextPlannedArcAlarmOccurrence(item, null, NOW), null);
});

// --- before_task ------------------------------------------------------

test("before_task with no linked task resolves to null -- there is nothing to compute a time from", () => {
  const item = arcFixture({ arcAlarmEnabled: true, arcAlarmTimingKind: "before_task", linkedTaskId: null });
  assert.equal(resolveNextPlannedArcAlarmOccurrence(item, null, NOW), null);
});

test("before_task delegates entirely to the linked task's own ARC window -- the task's scheduledTime/arcWindowMinutesBefore is the single source of truth, never a second calculation here", () => {
  const item = arcFixture({ arcAlarmEnabled: true, arcAlarmTimingKind: "before_task", linkedTaskId: "t1" });
  const task = plannedTask({ scheduledDate: "2026-01-07", scheduledTime: "10:00", arcWindowMinutesBefore: 10 });
  const next = resolveNextPlannedArcAlarmOccurrence(item, task, NOW);
  assert.ok(next);
  assert.equal(next!.getHours(), 9);
  assert.equal(next!.getMinutes(), 50);
});

test("before_task resolves to null once the linked task is archived/deleted-equivalent -- the same guard that disarms the task's own alarm disarms this one too, automatically", () => {
  const item = arcFixture({ arcAlarmEnabled: true, arcAlarmTimingKind: "before_task", linkedTaskId: "t1" });
  const archivedTask = plannedTask({ scheduledDate: "2026-01-07", scheduledTime: "10:00", arcWindowMinutesBefore: 10, status: "archived" });
  assert.equal(resolveNextPlannedArcAlarmOccurrence(item, archivedTask, NOW), null);
});

// --- standalone ---------------------------------------------------------

test("standalone with no time set resolves to null", () => {
  const item = arcFixture({ arcAlarmEnabled: true, arcAlarmTimingKind: "standalone", arcAlarmTime: null });
  assert.equal(resolveNextPlannedArcAlarmOccurrence(item, null, NOW), null);
});

test("standalone + once + explicit future date/time resolves to that exact moment", () => {
  const item = arcFixture({
    arcAlarmEnabled: true,
    arcAlarmTimingKind: "standalone",
    arcAlarmTime: "10:00",
    arcAlarmDate: "2026-01-07",
    arcAlarmRecurrence: { kind: "once" },
  });
  const next = resolveNextPlannedArcAlarmOccurrence(item, null, NOW);
  assert.ok(next);
  assert.equal(next!.getHours(), 10);
  assert.equal(next!.getDate(), 7);
});

test("standalone + once + no explicit date defaults to today, same convention as a task's own one-time alarm", () => {
  const item = arcFixture({ arcAlarmEnabled: true, arcAlarmTimingKind: "standalone", arcAlarmTime: "10:00", arcAlarmDate: null, arcAlarmRecurrence: { kind: "once" } });
  const next = resolveNextPlannedArcAlarmOccurrence(item, null, NOW);
  assert.ok(next);
  assert.equal(next!.getDate(), NOW.getDate());
});

test("standalone + once + a time already past today resolves to null -- never silently pushed to tomorrow (there is no recurrence to fall forward to)", () => {
  const item = arcFixture({ arcAlarmEnabled: true, arcAlarmTimingKind: "standalone", arcAlarmTime: "08:00", arcAlarmDate: null, arcAlarmRecurrence: { kind: "once" } });
  assert.equal(resolveNextPlannedArcAlarmOccurrence(item, null, NOW), null);
});

test("standalone + recurring + daily (all 7 days selected) finds today's own occurrence when it hasn't passed yet", () => {
  const item = arcFixture({
    arcAlarmEnabled: true,
    arcAlarmTimingKind: "standalone",
    arcAlarmTime: "10:00",
    arcAlarmRecurrence: { kind: "recurring", daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
  });
  const next = resolveNextPlannedArcAlarmOccurrence(item, null, NOW);
  assert.ok(next);
  assert.equal(next!.getDate(), NOW.getDate());
});

test("standalone + recurring + chosen weekdays skips to the next qualifying day, reusing arc/routines.ts's own resolveNextOccurrenceDate -- the exact same day-of-week walk every ScheduledRoutine uses", () => {
  const notToday = arcFixture({
    arcAlarmEnabled: true,
    arcAlarmTimingKind: "standalone",
    arcAlarmTime: "10:00",
    arcAlarmRecurrence: { kind: "recurring", daysOfWeek: [(NOW.getDay() + 2) % 7] },
  });
  const next = resolveNextPlannedArcAlarmOccurrence(notToday, null, NOW);
  assert.ok(next);
  assert.notEqual(next!.getDay(), NOW.getDay());
});

test("standalone + recurring with no days selected resolves to null", () => {
  const item = arcFixture({ arcAlarmEnabled: true, arcAlarmTimingKind: "standalone", arcAlarmTime: "10:00", arcAlarmRecurrence: { kind: "recurring", daysOfWeek: [] } });
  assert.equal(resolveNextPlannedArcAlarmOccurrence(item, null, NOW), null);
});

test("a Mini ARC's own alarm resolves exactly the same way as a Full ARC's -- the alarm timing is independent of kind", () => {
  const miniItem = arcFixture({ kind: "mini", arcAlarmEnabled: true, arcAlarmTimingKind: "standalone", arcAlarmTime: "10:00", arcAlarmDate: "2026-01-07", arcAlarmRecurrence: { kind: "once" } });
  const next = resolveNextPlannedArcAlarmOccurrence(miniItem, null, NOW);
  assert.ok(next);
  assert.equal(next!.getHours(), 10);
});

test("a standalone-origin draft (no real task, STANDALONE_ARC_TASK_ID) can still have a perfectly valid standalone alarm -- standalone timing never required a linked task", () => {
  const session = createNewArcLiveSessionState(STANDALONE_ARC_TASK_ID, "", "", NOW_ISO, "spontaneous");
  const standaloneItem = { ...createPlannedArcFromSession(session, "full", "p3", NOW_ISO), arcAlarmEnabled: true, arcAlarmTimingKind: "standalone" as const, arcAlarmTime: "10:00", arcAlarmDate: "2026-01-07" };
  assert.equal(standaloneItem.linkedTaskId, null);
  const next = resolveNextPlannedArcAlarmOccurrence(standaloneItem, null, NOW);
  assert.ok(next);
});
