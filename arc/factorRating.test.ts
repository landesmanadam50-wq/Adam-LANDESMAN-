import test from "node:test";
import assert from "node:assert/strict";

import {
  BASELINE_TIE_QUESTION,
  PRESENCE_FACTOR_ID,
  computeAllFactorRatingChanges,
  computeFactorRatingChange,
  createFactorRating,
  getFactorRatingQuestion,
  isCheckpointComplete,
  resolveBaselinePrimaryFactor,
  resolveLatestHighestInterferingFactorIds,
  resolveNextUnratedFactor,
  resolveRateableFactors,
} from "./factorRating.ts";
import type { FactorRating, RateableFactor } from "./factorRating.ts";
import { createEmptyEmotionInterferenceItem, createEmptyThoughtInterferenceItem, createEmptyUrgeInterferenceItem } from "./interferenceItem.ts";
import type { InterferenceItem } from "./interferenceItem.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function thought(id: string): InterferenceItem {
  return createEmptyThoughtInterferenceItem(id, `מחשבה ${id}`, null, NOW);
}
function emotion(id: string): InterferenceItem {
  return createEmptyEmotionInterferenceItem(id, `רגש ${id}`, null, NOW);
}
function urge(id: string): InterferenceItem {
  return createEmptyUrgeInterferenceItem(id, `דחף ${id}`, null, NOW);
}

// ---------------------------------------------------------------------------
// Rateable factors / questions
// ---------------------------------------------------------------------------

test("resolveRateableFactors: one factor per selected item, Presence excluded unless explicitly selected for the session", () => {
  const factors = resolveRateableFactors([thought("t1"), emotion("e1")], false);
  assert.deepEqual(
    factors.map((f) => f.factorId),
    ["t1", "e1"]
  );
  assert.equal(factors.some((f) => f.factorType === "presence"), false);
});

test("resolveRateableFactors: Presence included only when presenceSelectedForSession is true", () => {
  const factors = resolveRateableFactors([thought("t1")], true);
  assert.ok(factors.some((f) => f.factorId === PRESENCE_FACTOR_ID && f.factorType === "presence"));
});

test("resolveRateableFactors: two same-category items remain separate factors by stable id", () => {
  const factors = resolveRateableFactors([thought("t1"), thought("t2")], false);
  assert.deepEqual(
    factors.map((f) => f.factorId),
    ["t1", "t2"]
  );
});

test("getFactorRatingQuestion: exact five Hebrew questions", () => {
  assert.equal(getFactorRatingQuestion("emotion"), "מה עוצמת הרגש או התחושה כרגע?");
  assert.equal(getFactorRatingQuestion("urge"), "מה עוצמת הדחף כרגע?");
  assert.equal(getFactorRatingQuestion("thought"), "עד כמה המחשבה מרגישה אמינה או משפיעה כרגע?");
  assert.equal(getFactorRatingQuestion("belief"), "עד כמה האמונה המפריעה מרגישה חזקה כרגע?");
  assert.equal(getFactorRatingQuestion("presence"), "מה רמת הנוכחות שלך כרגע?");
});

test("createFactorRating: rejects an out-of-range value via arc/ratings.ts's own assertArcRating", () => {
  assert.throws(() => createFactorRating("t1", "thought", "afterAwareness", 11));
  assert.throws(() => createFactorRating("t1", "thought", "afterAwareness", 0));
});

test("createFactorRating: stores scale/meaning alongside the value", () => {
  const rating = createFactorRating("t1", "thought", "afterAwareness", 7);
  assert.equal(rating.scale, "1-10");
  assert.equal(rating.meaning, "lower_is_better");
  const presenceRating = createFactorRating(PRESENCE_FACTOR_ID, "presence", "afterAwareness", 7);
  assert.equal(presenceRating.meaning, "higher_is_better");
});

// ---------------------------------------------------------------------------
// Checkpoint completeness
// ---------------------------------------------------------------------------

test("isCheckpointComplete: false after only the first of several factors was rated", () => {
  const factors: RateableFactor[] = [
    { factorId: "t1", factorType: "thought", label: "t1" },
    { factorId: "e1", factorType: "emotion", label: "e1" },
  ];
  const ratings: FactorRating[] = [createFactorRating("t1", "thought", "afterAwareness", 5)];
  assert.equal(isCheckpointComplete(ratings, "afterAwareness", factors), false);
});

test("isCheckpointComplete: true once every required factor has a rating at that checkpoint", () => {
  const factors: RateableFactor[] = [
    { factorId: "t1", factorType: "thought", label: "t1" },
    { factorId: "e1", factorType: "emotion", label: "e1" },
  ];
  const ratings: FactorRating[] = [createFactorRating("t1", "thought", "afterAwareness", 5), createFactorRating("e1", "emotion", "afterAwareness", 6)];
  assert.equal(isCheckpointComplete(ratings, "afterAwareness", factors), true);
});

test("resolveNextUnratedFactor: returns the next factor still needing a rating, in order", () => {
  const factors: RateableFactor[] = [
    { factorId: "t1", factorType: "thought", label: "t1" },
    { factorId: "e1", factorType: "emotion", label: "e1" },
  ];
  const ratings: FactorRating[] = [createFactorRating("t1", "thought", "afterAwareness", 5)];
  assert.equal(resolveNextUnratedFactor(ratings, "afterAwareness", factors)?.factorId, "e1");
  const complete: FactorRating[] = [...ratings, createFactorRating("e1", "emotion", "afterAwareness", 6)];
  assert.equal(resolveNextUnratedFactor(complete, "afterAwareness", factors), null);
});

// ---------------------------------------------------------------------------
// Baseline primary factor -- resolved from afterAwareness only, never later
// ---------------------------------------------------------------------------

test("resolveBaselinePrimaryFactor: unique maximum at afterAwareness becomes primary automatically", () => {
  const ratings: FactorRating[] = [createFactorRating("t1", "thought", "afterAwareness", 8), createFactorRating("e1", "emotion", "afterAwareness", 5)];
  assert.deepEqual(resolveBaselinePrimaryFactor(ratings), { kind: "unique", factorId: "t1" });
});

test("resolveBaselinePrimaryFactor: a tie at afterAwareness produces the exact Hebrew tie question", () => {
  const ratings: FactorRating[] = [createFactorRating("t1", "thought", "afterAwareness", 8), createFactorRating("e1", "emotion", "afterAwareness", 8)];
  const result = resolveBaselinePrimaryFactor(ratings);
  assert.equal(result.kind, "tie");
  if (result.kind === "tie") {
    assert.deepEqual(result.factorIds.sort(), ["e1", "t1"]);
    assert.equal(result.question, BASELINE_TIE_QUESTION);
  }
});

test("resolveBaselinePrimaryFactor: Presence is excluded even when it has the single highest afterAwareness rating", () => {
  const ratings: FactorRating[] = [createFactorRating("t1", "thought", "afterAwareness", 3), createFactorRating(PRESENCE_FACTOR_ID, "presence", "afterAwareness", 9)];
  assert.deepEqual(resolveBaselinePrimaryFactor(ratings), { kind: "unique", factorId: "t1" });
});

test("resolveBaselinePrimaryFactor: no interfering factor rated at all -> none", () => {
  const ratings: FactorRating[] = [createFactorRating(PRESENCE_FACTOR_ID, "presence", "afterAwareness", 9)];
  assert.deepEqual(resolveBaselinePrimaryFactor(ratings), { kind: "none" });
});

test("resolveBaselinePrimaryFactor: later checkpoints never affect the baseline resolution (checkpoint 2/3 ratings ignored)", () => {
  const ratings: FactorRating[] = [
    createFactorRating("t1", "thought", "afterAwareness", 8),
    createFactorRating("e1", "emotion", "afterAwareness", 5),
    createFactorRating("t1", "thought", "afterStayAcceptance", 2),
    createFactorRating("e1", "emotion", "afterStayAcceptance", 9),
    createFactorRating("t1", "thought", "afterRegulation", 1),
    createFactorRating("e1", "emotion", "afterRegulation", 9),
  ];
  assert.deepEqual(resolveBaselinePrimaryFactor(ratings), { kind: "unique", factorId: "t1" }, "still t1, even though e1 is now far higher at later checkpoints");
});

// ---------------------------------------------------------------------------
// Latest-highest -- a separate report, array-shaped, never a replacement for baseline
// ---------------------------------------------------------------------------

test("resolveLatestHighestInterferingFactorIds: one id for a unique afterRegulation maximum", () => {
  const ratings: FactorRating[] = [createFactorRating("t1", "thought", "afterRegulation", 2), createFactorRating("e1", "emotion", "afterRegulation", 7)];
  assert.deepEqual(resolveLatestHighestInterferingFactorIds(ratings), ["e1"]);
});

test("resolveLatestHighestInterferingFactorIds: several ids for a checkpoint-3 tie, no question asked here", () => {
  const ratings: FactorRating[] = [createFactorRating("t1", "thought", "afterRegulation", 6), createFactorRating("e1", "emotion", "afterRegulation", 6)];
  assert.deepEqual(resolveLatestHighestInterferingFactorIds(ratings).sort(), ["e1", "t1"]);
});

test("resolveLatestHighestInterferingFactorIds: empty when no interfering factor was rated at afterRegulation", () => {
  assert.deepEqual(resolveLatestHighestInterferingFactorIds([]), []);
  const presenceOnly: FactorRating[] = [createFactorRating(PRESENCE_FACTOR_ID, "presence", "afterRegulation", 9)];
  assert.deepEqual(resolveLatestHighestInterferingFactorIds(presenceOnly), []);
});

test("latest-highest never overwrites baselinePrimaryFactorId -- both are independently derivable from the same rating history", () => {
  const ratings: FactorRating[] = [
    createFactorRating("t1", "thought", "afterAwareness", 8),
    createFactorRating("e1", "emotion", "afterAwareness", 3),
    createFactorRating("t1", "thought", "afterRegulation", 2),
    createFactorRating("e1", "emotion", "afterRegulation", 9),
  ];
  const baseline = resolveBaselinePrimaryFactor(ratings);
  const latest = resolveLatestHighestInterferingFactorIds(ratings);
  assert.deepEqual(baseline, { kind: "unique", factorId: "t1" });
  assert.deepEqual(latest, ["e1"]);
});

// ---------------------------------------------------------------------------
// Change calculations -- typed status, direction never reversed/merged
// ---------------------------------------------------------------------------

test("computeFactorRatingChange: interfering factor (lower is better) -- a decrease is improved", () => {
  const ratings: FactorRating[] = [
    createFactorRating("t1", "thought", "afterAwareness", 8),
    createFactorRating("t1", "thought", "afterStayAcceptance", 6),
    createFactorRating("t1", "thought", "afterRegulation", 3),
  ];
  const change = computeFactorRatingChange("t1", "thought", ratings);
  assert.equal(change?.rawChangeAfterStayAcceptance, -2);
  assert.equal(change?.rawChangeAfterRegulation, -3);
  assert.equal(change?.rawTotalChange, -5);
  assert.equal(change?.statusAfterStayAcceptance, "improved");
  assert.equal(change?.statusAfterRegulation, "improved");
  assert.equal(change?.statusTotal, "improved");
});

test("computeFactorRatingChange: interfering factor increase is worsened, never mislabeled improved", () => {
  const ratings: FactorRating[] = [
    createFactorRating("e1", "emotion", "afterAwareness", 3),
    createFactorRating("e1", "emotion", "afterStayAcceptance", 5),
    createFactorRating("e1", "emotion", "afterRegulation", 7),
  ];
  const change = computeFactorRatingChange("e1", "emotion", ratings);
  assert.equal(change?.statusTotal, "worsened");
});

test("computeFactorRatingChange: Presence (higher is better) -- an increase is improved, never reversed", () => {
  const ratings: FactorRating[] = [
    createFactorRating(PRESENCE_FACTOR_ID, "presence", "afterAwareness", 4),
    createFactorRating(PRESENCE_FACTOR_ID, "presence", "afterStayAcceptance", 6),
    createFactorRating(PRESENCE_FACTOR_ID, "presence", "afterRegulation", 8),
  ];
  const change = computeFactorRatingChange(PRESENCE_FACTOR_ID, "presence", ratings);
  assert.equal(change?.statusTotal, "improved");
  assert.equal(change?.rawTotalChange, 4);
});

test("computeFactorRatingChange: zero raw change is unchanged, never improved or worsened", () => {
  const ratings: FactorRating[] = [
    createFactorRating("u1", "urge", "afterAwareness", 5),
    createFactorRating("u1", "urge", "afterStayAcceptance", 5),
    createFactorRating("u1", "urge", "afterRegulation", 5),
  ];
  const change = computeFactorRatingChange("u1", "urge", ratings);
  assert.equal(change?.statusAfterStayAcceptance, "unchanged");
  assert.equal(change?.statusAfterRegulation, "unchanged");
  assert.equal(change?.statusTotal, "unchanged");
});

test("computeFactorRatingChange: returns null when the factor doesn't have all three checkpoints yet", () => {
  const ratings: FactorRating[] = [createFactorRating("t1", "thought", "afterAwareness", 8)];
  assert.equal(computeFactorRatingChange("t1", "thought", ratings), null);
});

test("computeAllFactorRatingChanges: skips factors without a complete set, includes the fixed primary + secondaries", () => {
  const factors: RateableFactor[] = [
    { factorId: "t1", factorType: "thought", label: "t1" },
    { factorId: "e1", factorType: "emotion", label: "e1" },
  ];
  const ratings: FactorRating[] = [
    createFactorRating("t1", "thought", "afterAwareness", 8),
    createFactorRating("t1", "thought", "afterStayAcceptance", 6),
    createFactorRating("t1", "thought", "afterRegulation", 3),
    createFactorRating("e1", "emotion", "afterAwareness", 5),
    // e1 never rated at afterStayAcceptance/afterRegulation -- incomplete, must be skipped.
  ];
  const changes = computeAllFactorRatingChanges(factors, ratings);
  assert.deepEqual(
    changes.map((c) => c.factorId),
    ["t1"]
  );
});
