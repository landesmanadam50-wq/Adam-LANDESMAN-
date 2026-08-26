import test from "node:test";
import assert from "node:assert/strict";
import type { SessionLogEntry } from "./sessionLog.ts";
import { computeWeeklyStats, getIsoWeekKey } from "./weeklyStats.ts";

function entry(finishedAt: string, overrides: Partial<SessionLogEntry> = {}): SessionLogEntry {
  return {
    id: finishedAt,
    startedAt: finishedAt,
    finishedAt,
    success: false,
    fall: false,
    ...overrides,
  };
}

test("getIsoWeekKey is stable within the same ISO week", () => {
  const monday = getIsoWeekKey(new Date("2026-08-24T10:00:00Z"));
  const sunday = getIsoWeekKey(new Date("2026-08-30T23:00:00Z"));
  assert.equal(monday, sunday);
});

test("getIsoWeekKey differs across a week boundary", () => {
  const thisWeek = getIsoWeekKey(new Date("2026-08-24T10:00:00Z"));
  const nextWeek = getIsoWeekKey(new Date("2026-08-31T10:00:00Z"));
  assert.notEqual(thisWeek, nextWeek);
});

test("computeWeeklyStats groups sessions, successes, and falls per week", () => {
  const entries = [
    entry("2026-08-24T09:00:00Z", { success: true }),
    entry("2026-08-25T09:00:00Z", { fall: true }),
    entry("2026-08-26T09:00:00Z", { success: true, fall: true }),
  ];
  const stats = computeWeeklyStats(entries);
  assert.equal(stats.length, 1);
  assert.equal(stats[0].sessions, 3);
  assert.equal(stats[0].successes, 2);
  assert.equal(stats[0].falls, 2);
});

test("computeWeeklyStats returns newest week first", () => {
  const entries = [entry("2026-08-10T09:00:00Z"), entry("2026-08-24T09:00:00Z")];
  const stats = computeWeeklyStats(entries);
  assert.ok(stats[0].weekKey > stats[1].weekKey);
});

test("computeWeeklyStats returns an empty array for no entries", () => {
  assert.deepEqual(computeWeeklyStats([]), []);
});
