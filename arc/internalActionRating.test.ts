import test from "node:test";
import assert from "node:assert/strict";

import {
  INTERNAL_ACTION_RATING_MAX,
  INTERNAL_ACTION_RATING_MIN,
  assertInternalActionRating,
  computeInternalActionRanking,
  isValidInternalActionRating,
  normalizeInternalActionRating,
  recordInternalActionUsageRating,
  recordInternalActionUsageStart,
  resolveActionsForFeelingRankedForTask,
} from "./internalActionRating.ts";
import type { InternalActionUsage } from "./internalActionRating.ts";

const NOW = "2026-11-25T08:00:00.000Z";

test("the scale is explicitly 0-10, not arc/ratings.ts's 1-10", () => {
  assert.equal(INTERNAL_ACTION_RATING_MIN, 0);
  assert.equal(INTERNAL_ACTION_RATING_MAX, 10);
  assert.equal(isValidInternalActionRating(0), true);
  assert.equal(isValidInternalActionRating(10), true);
  assert.equal(isValidInternalActionRating(11), false);
  assert.equal(isValidInternalActionRating(-1), false);
  assert.equal(isValidInternalActionRating(5.5), false);
});

test("assertInternalActionRating throws on an out-of-range value, normalizeInternalActionRating clamps/rounds instead", () => {
  assert.throws(() => assertInternalActionRating(11, "rating"));
  assert.doesNotThrow(() => assertInternalActionRating(0, "rating"));
  assert.equal(normalizeInternalActionRating(-3), 0);
  assert.equal(normalizeInternalActionRating(13), 10);
  assert.equal(normalizeInternalActionRating(4.6), 5);
});

test("recordInternalActionUsageStart begins with effectivenessRating null and ratedAt null -- an abandoned, never-rated usage is distinguishable from a rated one", () => {
  const usage = recordInternalActionUsageStart("task-1", "feeling-1", "action-1", "fine", "none", NOW);
  assert.equal(usage.effectivenessRating, null);
  assert.equal(usage.ratedAt, null);
});

test("recordInternalActionUsageRating sets both fields and validates the rating", () => {
  const usage = recordInternalActionUsageStart("task-1", "feeling-1", "action-1", "fine", "none", NOW);
  const rated = recordInternalActionUsageRating(usage, 8, "2026-11-25T08:05:00.000Z");
  assert.equal(rated.effectivenessRating, 8);
  assert.equal(rated.ratedAt, "2026-11-25T08:05:00.000Z");
  assert.throws(() => recordInternalActionUsageRating(usage, 99, NOW));
});

function usage(overrides: Partial<InternalActionUsage>): InternalActionUsage {
  return {
    id: `u-${Math.random()}`,
    taskId: "task-1",
    feelingId: "feeling-1",
    actionId: "action-1",
    internalStateAtStart: "fine",
    arcTrackChosen: "none",
    effectivenessRating: null,
    startedAt: NOW,
    ratedAt: null,
    ...overrides,
  };
}

test("a never-rated action is NEVER scored as low -- it gets score:null, sorted after scored entries, but always present in the result", () => {
  const usages = [
    usage({ actionId: "rated-low", effectivenessRating: 2 }),
    usage({ actionId: "never-rated", effectivenessRating: null }),
  ];
  const ranking = computeInternalActionRanking("feeling-1", usages);
  const neverRated = ranking.find((r) => r.actionId === "never-rated");
  assert.equal(neverRated?.score, null);
  assert.equal(ranking[ranking.length - 1].actionId, "never-rated", "unrated entries sort last, never implied low");
});

test("weighting is NOT last-rating-only: a single lucky 10/1-try action must not outrank a consistent 8-average/20-try action", () => {
  const luckyOnce = [usage({ actionId: "lucky", effectivenessRating: 10 })];
  const consistent = Array.from({ length: 20 }, () => usage({ actionId: "consistent", effectivenessRating: 8 }));
  const ranking = computeInternalActionRanking("feeling-1", [...luckyOnce, ...consistent]);
  const luckyRank = ranking.findIndex((r) => r.actionId === "lucky");
  const consistentRank = ranking.findIndex((r) => r.actionId === "consistent");
  assert.ok(consistentRank < luckyRank, "the consistent, many-tried action must rank above the one-shot lucky action");
});

test("every action always stays selectable, even with a low average rating -- computeInternalActionRanking never excludes an entry, only orders it", () => {
  const usages = [usage({ actionId: "low", effectivenessRating: 1 }), usage({ actionId: "high", effectivenessRating: 9 })];
  const ranking = computeInternalActionRanking("feeling-1", usages);
  assert.equal(ranking.length, 2);
  assert.ok(ranking.some((r) => r.actionId === "low"));
});

test("resolveActionsForFeelingRankedForTask prioritizes actions effective for THIS task's own context before the feeling-wide ranking", () => {
  const usages = [
    // "proven-for-this-task" has a mediocre global rating, but it's the only one this exact task has tried.
    usage({ taskId: "task-1", actionId: "proven-for-this-task", effectivenessRating: 6 }),
    // "globally-great" has an excellent rating but only from OTHER tasks.
    usage({ taskId: "task-2", actionId: "globally-great", effectivenessRating: 10 }),
  ];
  const ordered = resolveActionsForFeelingRankedForTask("feeling-1", "task-1", ["globally-great", "proven-for-this-task"], usages);
  assert.equal(ordered[0], "proven-for-this-task", "this task's own proven action must come first, ahead of a globally-higher-rated but task-unproven one");
});

test("resolveActionsForFeelingRankedForTask still returns every action id even when none has any usage history", () => {
  const ordered = resolveActionsForFeelingRankedForTask("feeling-1", "task-1", ["a", "b", "c"], []);
  assert.deepEqual(new Set(ordered), new Set(["a", "b", "c"]));
});
