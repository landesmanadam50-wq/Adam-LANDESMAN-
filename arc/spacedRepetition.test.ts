import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_REVIEW_INTERVAL_LADDER_DAYS,
  createArcReviewScheduleCore,
  isReviewDueOrOverdue,
  isScheduleDueOrOverdue,
  normalizeArcReviewScheduleCore,
  pauseArcReviewSchedule,
  postponeArcReview,
  recordArcReview,
  resolveEffectiveDueDate,
  resolveNextReviewDate,
  resolveNextReviewIntervalDays,
  resolveReviewDueState,
  resolveScheduleDueState,
  restoreAutomaticArcReviewSchedule,
  resumeArcReviewSchedule,
  setArcReviewIntervalLadder,
  setArcReviewScheduleMode,
} from "./spacedRepetition.ts";

const NOW = "2026-01-10T09:00:00.000Z";
const LATER = "2026-01-11T09:00:00.000Z";

test("resolveNextReviewIntervalDays: forgot always resets to the ladder's first step", () => {
  assert.equal(resolveNextReviewIntervalDays(14, "forgot"), DEFAULT_REVIEW_INTERVAL_LADDER_DAYS[0]);
  assert.equal(resolveNextReviewIntervalDays(1, "forgot"), DEFAULT_REVIEW_INTERVAL_LADDER_DAYS[0]);
});

test("resolveNextReviewIntervalDays: good advances exactly one ladder step", () => {
  assert.equal(resolveNextReviewIntervalDays(1, "good"), 3);
  assert.equal(resolveNextReviewIntervalDays(3, "good"), 7);
  assert.equal(resolveNextReviewIntervalDays(7, "good"), 14);
  assert.equal(resolveNextReviewIntervalDays(14, "good"), 30);
});

test("resolveNextReviewIntervalDays: easy advances two ladder steps", () => {
  assert.equal(resolveNextReviewIntervalDays(1, "easy"), 7);
  assert.equal(resolveNextReviewIntervalDays(3, "easy"), 14);
});

test("resolveNextReviewIntervalDays: hard repeats at the current ladder step", () => {
  assert.equal(resolveNextReviewIntervalDays(1, "hard"), 1);
  assert.equal(resolveNextReviewIntervalDays(3, "hard"), 3);
});

test("resolveNextReviewIntervalDays: past the ladder's end, good/easy/hard keep growing rather than stalling", () => {
  assert.equal(resolveNextReviewIntervalDays(30, "good"), 60);
  assert.ok(resolveNextReviewIntervalDays(30, "easy") > 60);
  assert.ok(resolveNextReviewIntervalDays(30, "hard") > 30);
});

test("resolveNextReviewIntervalDays: never mutates the ladder array passed in", () => {
  const ladder = [...DEFAULT_REVIEW_INTERVAL_LADDER_DAYS];
  resolveNextReviewIntervalDays(3, "good", ladder);
  assert.deepEqual(ladder, DEFAULT_REVIEW_INTERVAL_LADDER_DAYS);
});

test("resolveNextReviewDate adds exactly intervalDays calendar days", () => {
  const next = resolveNextReviewDate(new Date("2026-01-10T09:00:00.000Z"), 3);
  assert.equal(next.toISOString().slice(0, 10), "2026-01-13");
});

test("resolveReviewDueState: compares calendar dates only, ignoring time-of-day", () => {
  const now = new Date("2026-01-10T23:00:00.000Z");
  assert.equal(resolveReviewDueState("2026-01-09T01:00:00.000Z", now), "overdue");
  assert.equal(resolveReviewDueState("2026-01-10T01:00:00.000Z", now), "due_today");
  assert.equal(resolveReviewDueState("2026-01-11T01:00:00.000Z", now), "upcoming");
});

test("isReviewDueOrOverdue is true for overdue and due_today, false for upcoming", () => {
  const now = new Date("2026-01-10T12:00:00.000Z");
  assert.equal(isReviewDueOrOverdue("2026-01-09T12:00:00.000Z", now), true);
  assert.equal(isReviewDueOrOverdue("2026-01-10T12:00:00.000Z", now), true);
  assert.equal(isReviewDueOrOverdue("2026-01-11T12:00:00.000Z", now), false);
});

test("createArcReviewScheduleCore starts automatic/active with the first ladder step and no history", () => {
  const schedule = createArcReviewScheduleCore(NOW);
  assert.equal(schedule.mode, "automatic");
  assert.equal(schedule.status, "active");
  assert.equal(schedule.intervalDays, 1);
  assert.equal(schedule.lastReviewedAt, null);
  assert.equal(schedule.manualDueOverrideAt, null);
  assert.deepEqual(schedule.intervalLadderDays, DEFAULT_REVIEW_INTERVAL_LADDER_DAYS);
});

test("resolveEffectiveDueDate prefers a manual override over nextDueAt -- section 6's own 'separate recommended date from actual appointment'", () => {
  const schedule = createArcReviewScheduleCore(NOW);
  assert.equal(resolveEffectiveDueDate(schedule), schedule.nextDueAt);
  const postponed = postponeArcReview(schedule, "2026-02-01T00:00:00.000Z", LATER);
  assert.equal(resolveEffectiveDueDate(postponed), "2026-02-01T00:00:00.000Z");
  assert.equal(postponed.nextDueAt, schedule.nextDueAt, "nextDueAt (the algorithm's own recommendation) must stay untouched by a postponement");
});

test("recordArcReview in automatic mode recomputes intervalDays/nextDueAt from the rating and clears any manual override", () => {
  const schedule = postponeArcReview(createArcReviewScheduleCore(NOW), "2026-03-01T00:00:00.000Z", NOW);
  const reviewed = recordArcReview(schedule, "good", LATER);
  assert.equal(reviewed.intervalDays, 3);
  assert.equal(reviewed.lastReviewedAt, LATER);
  assert.equal(reviewed.manualDueOverrideAt, null);
  assert.equal(reviewed.nextDueAt, resolveNextReviewDate(new Date(LATER), 3).toISOString());
});

test("recordArcReview in manual mode records lastReviewedAt and clears the override, but never touches intervalDays/nextDueAt -- the trainee owns the next date", () => {
  const manual = setArcReviewScheduleMode(createArcReviewScheduleCore(NOW), "manual", NOW);
  const reviewed = recordArcReview(manual, "easy", LATER);
  assert.equal(reviewed.lastReviewedAt, LATER);
  assert.equal(reviewed.manualDueOverrideAt, null);
  assert.equal(reviewed.intervalDays, manual.intervalDays);
  assert.equal(reviewed.nextDueAt, manual.nextDueAt);
});

test("restoreAutomaticArcReviewSchedule clears the override and switches mode back to automatic without touching nextDueAt", () => {
  const manual = setArcReviewScheduleMode(createArcReviewScheduleCore(NOW), "manual", NOW);
  const postponed = postponeArcReview(manual, "2026-04-01T00:00:00.000Z", NOW);
  const restored = restoreAutomaticArcReviewSchedule(postponed, LATER);
  assert.equal(restored.mode, "automatic");
  assert.equal(restored.manualDueOverrideAt, null);
  assert.equal(restored.nextDueAt, manual.nextDueAt);
});

test("setArcReviewIntervalLadder stores a trainee's own custom ladder as a fresh copy, never aliasing the array passed in", () => {
  const schedule = createArcReviewScheduleCore(NOW);
  const customLadder = [2, 5, 10];
  const updated = setArcReviewIntervalLadder(schedule, customLadder, LATER);
  customLadder.push(99);
  assert.deepEqual(updated.intervalLadderDays, [2, 5, 10]);
});

test("pauseArcReviewSchedule/resumeArcReviewSchedule toggle status, and isScheduleDueOrOverdue is always false while paused regardless of the due date", () => {
  const overdue = { ...createArcReviewScheduleCore(NOW), nextDueAt: "2020-01-01T00:00:00.000Z" };
  assert.equal(isScheduleDueOrOverdue(overdue, new Date(NOW)), true);
  const paused = pauseArcReviewSchedule(overdue, LATER);
  assert.equal(paused.status, "paused");
  assert.equal(isScheduleDueOrOverdue(paused, new Date(NOW)), false);
  const resumed = resumeArcReviewSchedule(paused, LATER);
  assert.equal(resumed.status, "active");
  assert.equal(isScheduleDueOrOverdue(resumed, new Date(NOW)), true);
});

test("resolveScheduleDueState respects a manual override when deciding due state", () => {
  const schedule = { ...createArcReviewScheduleCore(NOW), nextDueAt: "2099-01-01T00:00:00.000Z" };
  const postponedToOverdue = postponeArcReview(schedule, "2020-01-01T00:00:00.000Z", NOW);
  assert.equal(resolveScheduleDueState(postponedToOverdue, new Date(NOW)), "overdue");
});

test("normalizeArcReviewScheduleCore backfills every missing field defensively, never throwing on a partial/legacy record", () => {
  const legacy = {} as Record<string, unknown>;
  const normalized = normalizeArcReviewScheduleCore(legacy, NOW);
  assert.equal(normalized.mode, "automatic");
  assert.equal(normalized.status, "active");
  assert.deepEqual(normalized.intervalLadderDays, DEFAULT_REVIEW_INTERVAL_LADDER_DAYS);
  assert.equal(normalized.intervalDays, DEFAULT_REVIEW_INTERVAL_LADDER_DAYS[0]);
  assert.equal(normalized.lastReviewedAt, null);
  assert.equal(normalized.manualDueOverrideAt, null);
  assert.equal(normalized.nextDueAt, NOW);
  assert.equal(normalized.createdAt, NOW);
  assert.equal(normalized.updatedAt, NOW);
});
