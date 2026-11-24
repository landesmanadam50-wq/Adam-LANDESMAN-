import test from "node:test";
import assert from "node:assert/strict";

import { computeTopUpPlan, needsTopUp, triggerIdForTime, TOPUP_THRESHOLD_HOURS } from "./reminderRollingSchedule.ts";
import { createFixedTimesSchedule } from "./arcReminderSchedule.ts";

const NOW = new Date(2026, 1, 2, 7, 0, 0); // Monday 07:00
const NOW_ISO = "2026-02-02T07:00:00.000Z";

test("computeTopUpPlan schedules every upcoming slot within the rolling window when nothing is scheduled yet", () => {
  const schedule = createFixedTimesSchedule(["08:00"], [], NOW_ISO);
  const plan = computeTopUpPlan("rem-1", [], schedule, NOW);
  assert.ok(plan.toSchedule.length >= 3); // 72h window -> at least today/tomorrow/day-after's 08:00
  assert.deepEqual(plan.toCancel, []);
  for (const slot of plan.toSchedule) assert.equal(slot.id, triggerIdForTime("rem-1", slot.time));
});

test("computeTopUpPlan is idempotent -- re-running with its own previous output as 'already scheduled' produces nothing new to schedule and nothing to cancel", () => {
  const schedule = createFixedTimesSchedule(["08:00"], [], NOW_ISO);
  const first = computeTopUpPlan("rem-1", [], schedule, NOW);
  const alreadyScheduledIds = first.toSchedule.map((slot) => slot.id);
  const second = computeTopUpPlan("rem-1", alreadyScheduledIds, schedule, NOW);
  assert.deepEqual(second.toSchedule, []);
  assert.deepEqual(second.toCancel, []);
});

test("computeTopUpPlan cancels a previously-scheduled slot that no longer falls inside the rolling window for the (possibly edited) schedule", () => {
  const schedule = createFixedTimesSchedule(["08:00"], [], NOW_ISO);
  const staleId = "rem-1:2020-01-01T08:00:00.000Z"; // long past, never produced by the current schedule/window
  const plan = computeTopUpPlan("rem-1", [staleId], schedule, NOW);
  assert.ok(plan.toCancel.includes(staleId));
});

test("needsTopUp is true when nothing is scheduled yet, or when the furthest scheduled trigger is within TOPUP_THRESHOLD_HOURS, false otherwise", () => {
  assert.equal(needsTopUp(null, NOW), true);
  assert.equal(needsTopUp(new Date(NOW.getTime() + (TOPUP_THRESHOLD_HOURS - 1) * 60 * 60 * 1000), NOW), true);
  assert.equal(needsTopUp(new Date(NOW.getTime() + (TOPUP_THRESHOLD_HOURS + 1) * 60 * 60 * 1000), NOW), false);
});

test("triggerIdForTime is deterministic -- same reminderId/time always produces the same id", () => {
  const time = new Date(2026, 1, 2, 8, 0, 0);
  assert.equal(triggerIdForTime("rem-1", time), triggerIdForTime("rem-1", time));
  assert.notEqual(triggerIdForTime("rem-1", time), triggerIdForTime("rem-2", time));
});
