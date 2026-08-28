import test from "node:test";
import assert from "node:assert/strict";
import { computePilotProgress } from "./pilotProgress.ts";

const START = "2026-01-01T00:00:00Z";

test("day one of the pilot is week 1", () => {
  const progress = computePilotProgress(START, new Date("2026-01-01T12:00:00Z"), 8);
  assert.equal(progress.currentWeek, 1);
  assert.equal(progress.weeksRemaining, 8);
  assert.equal(progress.isComplete, false);
});

test("currentWeek advances one per elapsed week", () => {
  const progress = computePilotProgress(START, new Date("2026-01-15T00:00:00Z"), 8);
  assert.equal(progress.currentWeek, 3);
  assert.equal(progress.weeksRemaining, 6);
});

test("currentWeek is clamped to totalWeeks, not counted past the end", () => {
  const progress = computePilotProgress(START, new Date("2026-06-01T00:00:00Z"), 8);
  assert.equal(progress.currentWeek, 8);
  assert.equal(progress.totalWeeks, 8);
});

test("isComplete flips true once totalWeeks have elapsed", () => {
  const justUnder = computePilotProgress(START, new Date("2026-02-25T00:00:00Z"), 8);
  assert.equal(justUnder.isComplete, false);

  const justOver = computePilotProgress(START, new Date("2026-03-01T00:00:00Z"), 8);
  assert.equal(justOver.isComplete, true);
  assert.equal(justOver.weeksRemaining, 0);
});

test("totalWeeks is configurable per call, e.g. an 11-week pilot", () => {
  const progress = computePilotProgress(START, new Date("2026-02-01T00:00:00Z"), 11);
  assert.equal(progress.totalWeeks, 11);
  assert.equal(progress.isComplete, false);
});

test("defaults to PILOT_DURATION_WEEKS when totalWeeks is omitted", () => {
  const progress = computePilotProgress(START, new Date("2026-01-01T00:00:00Z"));
  assert.equal(progress.totalWeeks, 8);
});
