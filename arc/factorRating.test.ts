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
  resolveImprovementDirection,
  resolveLatestHighestInterferingFactorIds,
  resolveNextUnratedFactor,
  resolveRateableFactors,
} from "./factorRating.ts";
import type { FactorRating, RateableFactor } from "./factorRating.ts";
import { createEmptyThoughtInterferenceItem, createEmptyUrgeInterferenceItem } from "./interferenceItem.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function rating(factorId: string, factorType: FactorRating["factorType"], checkpoint: FactorRating["checkpoint"], value: number): FactorRating {
  return createFactorRating(factorId, factorType, checkpoint, value);
}

// --- Questions ---

test("getFactorRatingQuestion returns the exact five required Hebrew questions", () => {
  assert.equal(getFactorRatingQuestion("emotion"), "מה עוצמת הרגש או התחושה כרגע?");
  assert.equal(getFactorRatingQuestion("urge"), "מה עוצמת הדחף כרגע?");
  assert.equal(getFactorRatingQuestion("thought"), "עד כמה המחשבה מרגישה אמינה או משפיעה כרגע?");
  assert.equal(getFactorRatingQuestion("belief"), "עד כמה האמונה המפריעה מרגישה חזקה כרגע?");
  assert.equal(getFactorRatingQuestion("presence"), "מה רמת הנוכחות שלך כרגע?");
});

// --- Direction ---

test("resolveImprovementDirection: Presence higher is better, every interfering factor lower is better", () => {
  assert.equal(resolveImprovementDirection("presence"), "higher_is_better");
  for (const type of ["thought", "belief", "emotion", "urge"] as const) {
    assert.equal(resolveImprovementDirection(type), "lower_is_better");
  }
});

// --- resolveRateableFactors ---

test("resolveRateableFactors includes Presence only when explicitly selected for this session", () => {
  const items = [createEmptyThoughtInterferenceItem("t1", "מחשבה", null, NOW)];
  const withoutPresence = resolveRateableFactors(items, false);
  assert.equal(withoutPresence.some((f) => f.factorId === PRESENCE_FACTOR_ID), false);
  const withPresence = resolveRateableFactors(items, true);
  assert.equal(withPresence.some((f) => f.factorId === PRESENCE_FACTOR_ID), true);
});

// --- createFactorRating / assertArcRating reuse ---

test("createFactorRating rejects an out-of-range value via arc/ratings.ts's own assertArcRating", () => {
  assert.throws(() => createFactorRating("t1", "thought", "afterAwareness", 11));
  assert.throws(() => createFactorRating("t1", "thought", "afterAwareness", 0));
});

// --- checkpoint completeness ---

test("isCheckpointComplete/resolveNextUnratedFactor never advance after only the first factor was rated", () => {
  const factors: RateableFactor[] = [
    { factorId: "t1", factorType: "thought", label: "מחשבה" },
    { factorId: "u1", factorType: "urge", label: "דחף" },
  ];
  const ratings = [rating("t1", "thought", "afterAwareness", 5)];
  assert.equal(isCheckpointComplete(ratings, "afterAwareness", factors), false);
  assert.equal(resolveNextUnratedFactor(ratings, "afterAwareness", factors)?.factorId, "u1");

  const complete = [...ratings, rating("u1", "urge", "afterAwareness", 6)];
  assert.equal(isCheckpointComplete(complete, "afterAwareness", factors), true);
  assert.equal(resolveNextUnratedFactor(complete, "afterAwareness", factors), null);
});

// --- Baseline primary factor / tie ---

test("resolveBaselinePrimaryFactor: none when no afterAwareness ratings exist", () => {
  assert.deepEqual(resolveBaselinePrimaryFactor([]), { kind: "none" });
});

test("resolveBaselinePrimaryFactor: unique winner", () => {
  const ratings = [rating("t1", "thought", "afterAwareness", 8), rating("u1", "urge", "afterAwareness", 4)];
  assert.deepEqual(resolveBaselinePrimaryFactor(ratings), { kind: "unique", factorId: "t1" });
});

test("resolveBaselinePrimaryFactor: a tie emits the exact required Hebrew question", () => {
  const ratings = [rating("t1", "thought", "afterAwareness", 7), rating("u1", "urge", "afterAwareness", 7)];
  const result = resolveBaselinePrimaryFactor(ratings);
  assert.equal(result.kind, "tie");
  if (result.kind === "tie") {
    assert.deepEqual(result.factorIds.sort(), ["t1", "u1"]);
    assert.equal(result.question, BASELINE_TIE_QUESTION);
  }
});

test("resolveBaselinePrimaryFactor never lets Presence compete for primary-interfering-factor status", () => {
  const ratings = [rating("t1", "thought", "afterAwareness", 5), rating(PRESENCE_FACTOR_ID, "presence", "afterAwareness", 9)];
  assert.deepEqual(resolveBaselinePrimaryFactor(ratings), { kind: "unique", factorId: "t1" });
});

// --- resolveLatestHighestInterferingFactorIds ---

test("resolveLatestHighestInterferingFactorIds is empty for a no-State route (afterStateRegulation never recorded)", () => {
  const ratings = [rating("t1", "thought", "afterAwareness", 8), rating("t1", "thought", "afterStayAcceptance", 6)];
  assert.deepEqual(resolveLatestHighestInterferingFactorIds(ratings), []);
});

test("resolveLatestHighestInterferingFactorIds reports the afterStateRegulation tie/winner when it exists", () => {
  const ratings = [rating("t1", "thought", "afterStateRegulation", 5), rating("u1", "urge", "afterStateRegulation", 5), rating("b1", "belief", "afterStateRegulation", 2)];
  assert.deepEqual(resolveLatestHighestInterferingFactorIds(ratings).sort(), ["t1", "u1"]);
});

// --- Change calculations: two-checkpoint (no-State) route ---

test("computeFactorRatingChange succeeds for a two-checkpoint (no-State) route -- never returns null merely because afterStateRegulation is absent", () => {
  const ratings = [rating("t1", "thought", "afterAwareness", 8), rating("t1", "thought", "afterStayAcceptance", 5)];
  const change = computeFactorRatingChange("t1", "thought", ratings);
  assert.notEqual(change, null);
  assert.equal(change!.rawChangeAfterStayAcceptance, -3);
  assert.equal(change!.statusAfterStayAcceptance, "improved");
  assert.equal(change!.rawChangeAfterStateRegulation, null, "no fabricated Regulation delta");
  assert.equal(change!.statusAfterStateRegulation, null);
  assert.equal(change!.rawTotalChange, -3, "total uses the latest checkpoint actually recorded (afterStayAcceptance)");
  assert.equal(change!.statusTotal, "improved");
});

test("computeFactorRatingChange returns null only when afterAwareness or afterStayAcceptance itself is missing (the two always-required checkpoints)", () => {
  assert.equal(computeFactorRatingChange("t1", "thought", [rating("t1", "thought", "afterAwareness", 8)]), null);
  assert.equal(computeFactorRatingChange("t1", "thought", []), null);
});

// --- Change calculations: three-checkpoint (with-State) route ---

test("computeFactorRatingChange calculates all three changes for a with-State (three-checkpoint) route", () => {
  const ratings = [rating("t1", "thought", "afterAwareness", 9), rating("t1", "thought", "afterStayAcceptance", 6), rating("t1", "thought", "afterStateRegulation", 3)];
  const change = computeFactorRatingChange("t1", "thought", ratings);
  assert.notEqual(change, null);
  assert.equal(change!.rawChangeAfterStayAcceptance, -3);
  assert.equal(change!.statusAfterStayAcceptance, "improved");
  assert.equal(change!.rawChangeAfterStateRegulation, -3);
  assert.equal(change!.statusAfterStateRegulation, "improved");
  assert.equal(change!.rawTotalChange, -6, "total from afterAwareness to afterStateRegulation");
  assert.equal(change!.statusTotal, "improved");
});

test("computeFactorRatingChange: Presence direction is inverted (higher is better) across both two- and three-checkpoint routes", () => {
  const twoCheckpoint = [rating(PRESENCE_FACTOR_ID, "presence", "afterAwareness", 3), rating(PRESENCE_FACTOR_ID, "presence", "afterStayAcceptance", 7)];
  const change2 = computeFactorRatingChange(PRESENCE_FACTOR_ID, "presence", twoCheckpoint);
  assert.equal(change2!.statusAfterStayAcceptance, "improved");

  const threeCheckpoint = [...twoCheckpoint, rating(PRESENCE_FACTOR_ID, "presence", "afterStateRegulation", 4)];
  const change3 = computeFactorRatingChange(PRESENCE_FACTOR_ID, "presence", threeCheckpoint);
  assert.equal(change3!.statusAfterStateRegulation, "worsened", "presence dropped from 7 to 4 -- worsened, even though the raw number decreased");
});

test("computeAllFactorRatingChanges skips any factor without at least the two always-required checkpoints", () => {
  const factors: RateableFactor[] = [
    { factorId: "t1", factorType: "thought", label: "מחשבה" },
    { factorId: "u1", factorType: "urge", label: "דחף" },
  ];
  const ratings = [rating("t1", "thought", "afterAwareness", 8), rating("t1", "thought", "afterStayAcceptance", 5)];
  const changes = computeAllFactorRatingChanges(factors, ratings);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].factorId, "t1");
});

// --- Reuse sanity ---

test("createEmptyUrgeInterferenceItem/createEmptyThoughtInterferenceItem remain usable to build RateableFactor labels (no drift from arc/interferenceItem.ts)", () => {
  const item = createEmptyUrgeInterferenceItem("u1", "דחף לעישון", null, NOW);
  const [factor] = resolveRateableFactors([item], false);
  assert.equal(factor.label, "דחף לעישון");
});
