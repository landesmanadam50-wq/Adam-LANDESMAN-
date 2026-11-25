import assert from "node:assert/strict";
import { test } from "node:test";
import { createEmptyTask } from "./tasks.ts";
import type { ScheduledPlanEntry } from "./dailyPlan.ts";
import { resolveFreeTimeWindowAt, resolveFreeTimeWindowKey, resolveFreeTimeWindows, resolveFreeTimeWindowsAfter } from "./freeTimeWindow.ts";

const NOW = "2026-11-25T08:00:00.000Z";

function entry(taskId: string, overrides: Partial<ScheduledPlanEntry> = {}): ScheduledPlanEntry {
  return {
    task: createEmptyTask(taskId, taskId, "להתחיל", NOW),
    occurrenceDateLocal: "2026-11-25",
    origin: "oneoff",
    scheduledTime: null,
    expectedDurationMinutes: null,
    timeIsManual: true,
    isModifiedForToday: false,
    isCompletedToday: false,
    effectiveStartTime: null,
    effectiveEndTime: null,
    hasConflict: false,
    ...overrides,
  };
}

test("resolveFreeTimeWindows: empty schedule yields one whole-day window", () => {
  const windows = resolveFreeTimeWindows([]);
  assert.equal(windows.length, 1);
  assert.deepEqual(windows[0], { startMinutes: 0, endMinutes: null, precedingTaskId: null, followingTaskId: null, durationMinutes: null });
});

test("resolveFreeTimeWindows: single entry yields only a leading and a trailing window", () => {
  const scheduled = [entry("t1", { effectiveStartTime: "10:00", effectiveEndTime: "10:30" })];
  const windows = resolveFreeTimeWindows(scheduled);
  assert.equal(windows.length, 2);
  assert.deepEqual(windows[0], { startMinutes: 0, endMinutes: 600, precedingTaskId: null, followingTaskId: "t1", durationMinutes: 600 });
  assert.deepEqual(windows[1], { startMinutes: 630, endMinutes: null, precedingTaskId: "t1", followingTaskId: null, durationMinutes: null });
});

test("resolveFreeTimeWindows: back-to-back entries produce a zero-duration middle window, filtered out by minDurationMinutes and never claimed by resolveFreeTimeWindowAt", () => {
  const scheduled = [
    entry("t1", { effectiveStartTime: "10:00", effectiveEndTime: "10:30" }),
    entry("t2", { effectiveStartTime: "10:30", effectiveEndTime: "11:00" }),
  ];
  const windows = resolveFreeTimeWindows(scheduled);
  const middle = windows.find((w) => w.precedingTaskId === "t1" && w.followingTaskId === "t2");
  assert.ok(middle);
  assert.equal(middle!.durationMinutes, 0);

  const after = resolveFreeTimeWindowsAfter(windows, 0, 1);
  assert.ok(!after.some((w) => w.precedingTaskId === "t1" && w.followingTaskId === "t2"));

  assert.equal(resolveFreeTimeWindowAt(windows, 630), null);
});

test("resolveFreeTimeWindows: an entry with an unresolved effectiveStartTime is skipped for window-boundary purposes", () => {
  const scheduled = [
    entry("t1", { effectiveStartTime: null, effectiveEndTime: null }),
    entry("t2", { effectiveStartTime: "12:00", effectiveEndTime: "12:30" }),
  ];
  const windows = resolveFreeTimeWindows(scheduled);
  assert.equal(windows.length, 2);
  assert.deepEqual(windows[0], { startMinutes: 0, endMinutes: 720, precedingTaskId: null, followingTaskId: "t2", durationMinutes: 720 });
  assert.deepEqual(windows[1], { startMinutes: 750, endMinutes: null, precedingTaskId: "t2", followingTaskId: null, durationMinutes: null });
});

test("resolveFreeTimeWindows: excludeTaskId removes that entry from the candidates, exactly like resolveCurrentTaskState's own filtering (the early-finish case)", () => {
  const scheduled = [
    entry("t1", { effectiveStartTime: "10:00", effectiveEndTime: "10:30" }),
    entry("t2", { effectiveStartTime: "10:30", effectiveEndTime: "11:00" }),
  ];
  const windows = resolveFreeTimeWindows(scheduled, "t1");
  assert.equal(windows.length, 2);
  assert.deepEqual(windows[0], { startMinutes: 0, endMinutes: 630, precedingTaskId: null, followingTaskId: "t2", durationMinutes: 630 });
});

test("resolveFreeTimeWindows: a completed entry is excluded, so its slot becomes free", () => {
  const scheduled = [
    entry("t1", { effectiveStartTime: "10:00", effectiveEndTime: "10:30", isCompletedToday: true }),
    entry("t2", { effectiveStartTime: "11:00", effectiveEndTime: "11:30" }),
  ];
  const windows = resolveFreeTimeWindows(scheduled);
  assert.equal(windows.length, 2);
  assert.equal(windows[0].followingTaskId, "t2");
});

test("resolveFreeTimeWindows: an archived entry is excluded from the candidates", () => {
  const scheduled = [entry("t1", { effectiveStartTime: "10:00", effectiveEndTime: "10:30", task: { ...entry("t1").task, status: "archived" } })];
  const windows = resolveFreeTimeWindows(scheduled);
  assert.equal(windows.length, 1);
  assert.deepEqual(windows[0], { startMinutes: 0, endMinutes: null, precedingTaskId: null, followingTaskId: null, durationMinutes: null });
});

test("resolveFreeTimeWindowAt: a minute inside a window's range returns that window", () => {
  const scheduled = [entry("t1", { effectiveStartTime: "10:00", effectiveEndTime: "10:30" })];
  const windows = resolveFreeTimeWindows(scheduled);
  const found = resolveFreeTimeWindowAt(windows, 300);
  assert.ok(found);
  assert.equal(found!.followingTaskId, "t1");
});

test("resolveFreeTimeWindowAt: an entry's own start minute belongs to the entry, never to the window before it", () => {
  const scheduled = [entry("t1", { effectiveStartTime: "10:00", effectiveEndTime: "10:30" })];
  const windows = resolveFreeTimeWindows(scheduled);
  assert.equal(resolveFreeTimeWindowAt(windows, 600), null);
});

test("resolveFreeTimeWindowAt: the open trailing window matches any minute at/after its start", () => {
  const scheduled = [entry("t1", { effectiveStartTime: "10:00", effectiveEndTime: "10:30" })];
  const windows = resolveFreeTimeWindows(scheduled);
  const found = resolveFreeTimeWindowAt(windows, 10_000);
  assert.ok(found);
  assert.equal(found!.precedingTaskId, "t1");
  assert.equal(found!.endMinutes, null);
});

test("resolveFreeTimeWindowsAfter: keeps only windows at/after afterMinutes, in order", () => {
  const scheduled = [
    entry("t1", { effectiveStartTime: "09:00", effectiveEndTime: "09:30" }),
    entry("t2", { effectiveStartTime: "12:00", effectiveEndTime: "12:30" }),
  ];
  const windows = resolveFreeTimeWindows(scheduled);
  const after = resolveFreeTimeWindowsAfter(windows, 600, null);
  assert.equal(after.length, 1);
  assert.equal(after[0].precedingTaskId, "t2");

  const afterEarlier = resolveFreeTimeWindowsAfter(windows, 500, null);
  assert.equal(afterEarlier.length, 2);
  assert.equal(afterEarlier[0].precedingTaskId, "t1");
  assert.equal(afterEarlier[1].precedingTaskId, "t2");
});

test("resolveFreeTimeWindowsAfter: an open-ended window (durationMinutes null) is always kept regardless of minDurationMinutes", () => {
  const scheduled = [entry("t1", { effectiveStartTime: "09:00", effectiveEndTime: "09:30" })];
  const windows = resolveFreeTimeWindows(scheduled);
  const after = resolveFreeTimeWindowsAfter(windows, 0, 10_000);
  assert.ok(after.some((w) => w.durationMinutes === null));
});

test("resolveFreeTimeWindowKey: stable across minute drift of the same two bounding tasks", () => {
  const keyA = resolveFreeTimeWindowKey("2026-11-25", { precedingTaskId: "t1", followingTaskId: "t2" });
  const keyB = resolveFreeTimeWindowKey("2026-11-25", { precedingTaskId: "t1", followingTaskId: "t2" });
  assert.equal(keyA, keyB);
});

test("resolveFreeTimeWindowKey: changes when a neighbor changes (a new task inserted into the gap)", () => {
  const before = resolveFreeTimeWindowKey("2026-11-25", { precedingTaskId: "t1", followingTaskId: "t2" });
  const after = resolveFreeTimeWindowKey("2026-11-25", { precedingTaskId: "t1", followingTaskId: "t3" });
  assert.notEqual(before, after);
});

test("resolveFreeTimeWindowKey: uses sentinels for the leading/trailing open-ended windows", () => {
  const leading = resolveFreeTimeWindowKey("2026-11-25", { precedingTaskId: null, followingTaskId: "t1" });
  const trailing = resolveFreeTimeWindowKey("2026-11-25", { precedingTaskId: "t1", followingTaskId: null });
  assert.ok(leading.includes("__start__"));
  assert.ok(trailing.includes("__end__"));
});
