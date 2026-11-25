import assert from "node:assert/strict";
import { test } from "node:test";
import { isFreeTimeWindowDismissed, pruneFreeTimeWindowDismissals, recordFreeTimeWindowDismissal, type FreeTimeWindowDismissal } from "./freeTimeWindowDismissal.ts";

const WINDOW = { precedingTaskId: "t1", followingTaskId: "t2" };

test("recordFreeTimeWindowDismissal: a first decline for a window appends a new entry", () => {
  const next = recordFreeTimeWindowDismissal([], "2026-11-25", WINDOW, "2026-11-25T08:00:00.000Z");
  assert.equal(next.length, 1);
  assert.deepEqual(next[0], { dateLocal: "2026-11-25", precedingTaskId: "t1", followingTaskId: "t2", dismissedAt: "2026-11-25T08:00:00.000Z" });
});

test("recordFreeTimeWindowDismissal: a second decline for the exact same window replaces its timestamp, never duplicates", () => {
  const first = recordFreeTimeWindowDismissal([], "2026-11-25", WINDOW, "2026-11-25T08:00:00.000Z");
  const second = recordFreeTimeWindowDismissal(first, "2026-11-25", WINDOW, "2026-11-25T09:00:00.000Z");
  assert.equal(second.length, 1);
  assert.equal(second[0].dismissedAt, "2026-11-25T09:00:00.000Z");
});

test("recordFreeTimeWindowDismissal: a different window on the same date is a distinct entry", () => {
  const first = recordFreeTimeWindowDismissal([], "2026-11-25", WINDOW, "2026-11-25T08:00:00.000Z");
  const second = recordFreeTimeWindowDismissal(first, "2026-11-25", { precedingTaskId: "t2", followingTaskId: "t3" }, "2026-11-25T08:05:00.000Z");
  assert.equal(second.length, 2);
});

test("isFreeTimeWindowDismissed: true for an exact (dateLocal, precedingTaskId, followingTaskId) match", () => {
  const dismissals = recordFreeTimeWindowDismissal([], "2026-11-25", WINDOW, "2026-11-25T08:00:00.000Z");
  assert.equal(isFreeTimeWindowDismissed(dismissals, "2026-11-25", WINDOW), true);
});

test("isFreeTimeWindowDismissed: false when the followingTaskId differs (a genuinely new window after a neighbor changed)", () => {
  const dismissals = recordFreeTimeWindowDismissal([], "2026-11-25", WINDOW, "2026-11-25T08:00:00.000Z");
  assert.equal(isFreeTimeWindowDismissed(dismissals, "2026-11-25", { precedingTaskId: "t1", followingTaskId: "t3" }), false);
});

test("isFreeTimeWindowDismissed: false when the precedingTaskId differs", () => {
  const dismissals = recordFreeTimeWindowDismissal([], "2026-11-25", WINDOW, "2026-11-25T08:00:00.000Z");
  assert.equal(isFreeTimeWindowDismissed(dismissals, "2026-11-25", { precedingTaskId: "t9", followingTaskId: "t2" }), false);
});

test("isFreeTimeWindowDismissed: false for the same window on a different date", () => {
  const dismissals = recordFreeTimeWindowDismissal([], "2026-11-25", WINDOW, "2026-11-25T08:00:00.000Z");
  assert.equal(isFreeTimeWindowDismissed(dismissals, "2026-11-26", WINDOW), false);
});

test("isFreeTimeWindowDismissed: matches the leading/trailing sentinel windows (null bounding ids) correctly", () => {
  const leading = { precedingTaskId: null, followingTaskId: "t1" };
  const dismissals = recordFreeTimeWindowDismissal([], "2026-11-25", leading, "2026-11-25T08:00:00.000Z");
  assert.equal(isFreeTimeWindowDismissed(dismissals, "2026-11-25", leading), true);
  assert.equal(isFreeTimeWindowDismissed(dismissals, "2026-11-25", { precedingTaskId: "t1", followingTaskId: null }), false);
});

test("pruneFreeTimeWindowDismissals: drops yesterday's entries, keeps today's", () => {
  const dismissals: FreeTimeWindowDismissal[] = [
    { dateLocal: "2026-11-24", precedingTaskId: "t1", followingTaskId: "t2", dismissedAt: "2026-11-24T08:00:00.000Z" },
    { dateLocal: "2026-11-25", precedingTaskId: "t3", followingTaskId: "t4", dismissedAt: "2026-11-25T08:00:00.000Z" },
  ];
  const pruned = pruneFreeTimeWindowDismissals(dismissals, "2026-11-25");
  assert.equal(pruned.length, 1);
  assert.equal(pruned[0].dateLocal, "2026-11-25");
});

test("pruneFreeTimeWindowDismissals: an empty list stays empty", () => {
  assert.deepEqual(pruneFreeTimeWindowDismissals([], "2026-11-25"), []);
});
