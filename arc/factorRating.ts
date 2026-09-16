/**
 * arc/factorRating.ts
 *
 * Adaptive ARC architecture task, Phase 14B: the pure multi-factor,
 * three-checkpoint rating model for reactive Full combined LIVE
 * practice only (never Mini/Link/Action-only/shortened flows -- those
 * gain no rating logic from this module at all, and nothing here is
 * imported by any of them).
 *
 * Reuses arc/ratings.ts's own canonical 1-10 integer scale verbatim
 * (assertArcRating) -- this is the same single scale already used
 * app-wide (presenceRating/sensationIntensity/desiredStateRating), never
 * a second, parallel scale.
 *
 * "Factor" = one selected InterferenceItem (its own stable id, tracked
 * across all three checkpoints) OR, only when explicitly selected for
 * THIS session (never merely because BUILD's presenceEnabled is true),
 * the fixed Presence dimension (PRESENCE_FACTOR_ID). Two selected items
 * of the same category are two independent factors, never merged.
 */

import { assertArcRating } from "./ratings.ts";
import type { InterferenceCategory, InterferenceItem } from "./interferenceItem.ts";

export type RatingCheckpoint = "afterAwareness" | "afterStayAcceptance" | "afterRegulation";
export const RATING_CHECKPOINT_ORDER: RatingCheckpoint[] = ["afterAwareness", "afterStayAcceptance", "afterRegulation"];

export type FactorType = InterferenceCategory | "presence";

/** Interference categories only -- Presence never competes for baseline/latest-highest primary-factor status (see this module's own resolvers below). */
export const INTERFERING_FACTOR_TYPES: readonly FactorType[] = ["thought", "belief", "emotion", "urge"];

export type ImprovementDirection = "lower_is_better" | "higher_is_better";

/** Presence: higher is better (more present). Every interfering factor (Emotion/Urge/Thought/Belief intensity or believability/strength): lower is better. Never reversed, never merged. */
export function resolveImprovementDirection(factorType: FactorType): ImprovementDirection {
  return factorType === "presence" ? "higher_is_better" : "lower_is_better";
}

export const PRESENCE_FACTOR_ID = "presence";

export interface RateableFactor {
  factorId: string;
  factorType: FactorType;
  /** User-facing label for the tie-break screen and any other display -- never relies on the caller re-deriving a label from a bare technical id. */
  label: string;
}

/** Every selected InterferenceItem is its own factor (by category); Presence is included only when explicitly selected for this session (see arc/combinedLiveSession.ts's own presenceSelectedForSession -- never derived from BUILD's presenceEnabled here). */
export function resolveRateableFactors(activeItems: InterferenceItem[], presenceSelectedForSession: boolean): RateableFactor[] {
  const factors: RateableFactor[] = activeItems.map((item) => ({ factorId: item.id, factorType: item.category, label: item.name }));
  if (presenceSelectedForSession) {
    factors.push({ factorId: PRESENCE_FACTOR_ID, factorType: "presence", label: "נוכחות" });
  }
  return factors;
}

// ---------------------------------------------------------------------------
// The five exact required Hebrew questions -- same wording/scale at all three checkpoints.
// ---------------------------------------------------------------------------

export function getFactorRatingQuestion(factorType: FactorType): string {
  switch (factorType) {
    case "emotion":
      return "מה עוצמת הרגש או התחושה כרגע?";
    case "urge":
      return "מה עוצמת הדחף כרגע?";
    case "thought":
      return "עד כמה המחשבה מרגישה אמינה או משפיעה כרגע?";
    case "belief":
      return "עד כמה האמונה המפריעה מרגישה חזקה כרגע?";
    case "presence":
      return "מה רמת הנוכחות שלך כרגע?";
  }
}

// ---------------------------------------------------------------------------
// FactorRating -- one stored rating
// ---------------------------------------------------------------------------

export interface FactorRating {
  factorId: string;
  factorType: FactorType;
  checkpoint: RatingCheckpoint;
  value: number;
  scale: "1-10";
  meaning: ImprovementDirection;
}

/** Validates via arc/ratings.ts's own assertArcRating (1-10 integer) -- throws on an invalid value, exactly like every other rating entry point in this codebase; the UI is expected to only ever offer the fixed 1-10 button row. */
export function createFactorRating(factorId: string, factorType: FactorType, checkpoint: RatingCheckpoint, value: number): FactorRating {
  assertArcRating(value, "FactorRating.value");
  return { factorId, factorType, checkpoint, value, scale: "1-10", meaning: resolveImprovementDirection(factorType) };
}

/** True once every required factor for `checkpoint` has a rating -- never advance a checkpoint after only the first factor was rated. */
export function isCheckpointComplete(ratings: FactorRating[], checkpoint: RatingCheckpoint, requiredFactors: RateableFactor[]): boolean {
  const ratedIds = new Set(ratings.filter((r) => r.checkpoint === checkpoint).map((r) => r.factorId));
  return requiredFactors.every((factor) => ratedIds.has(factor.factorId));
}

/** The next factor still needing a rating at `checkpoint`, in `requiredFactors`' own order, or null once complete. */
export function resolveNextUnratedFactor(ratings: FactorRating[], checkpoint: RatingCheckpoint, requiredFactors: RateableFactor[]): RateableFactor | null {
  const ratedIds = new Set(ratings.filter((r) => r.checkpoint === checkpoint).map((r) => r.factorId));
  return requiredFactors.find((factor) => !ratedIds.has(factor.factorId)) ?? null;
}

// ---------------------------------------------------------------------------
// Baseline primary factor -- resolved ONLY from afterAwareness, fixed for
// the rest of the session (arc/combinedLiveSession.ts's own controller
// never replaces it from checkpoint 2/3 values).
// ---------------------------------------------------------------------------

export const BASELINE_TIE_QUESTION = "במה היית רוצה להתמקד קודם?";

export type BaselinePrimaryResolution =
  | { kind: "none" }
  | { kind: "unique"; factorId: string }
  | { kind: "tie"; factorIds: string[]; question: string };

/** Compares only Emotion/Urge/Thought/Belief afterAwareness ratings -- Presence is structurally excluded (see INTERFERING_FACTOR_TYPES) and can never become the baseline PRIMARY INTERFERING factor, even when also rated this session. */
export function resolveBaselinePrimaryFactor(ratings: FactorRating[]): BaselinePrimaryResolution {
  const baseline = ratings.filter((r) => r.checkpoint === "afterAwareness" && INTERFERING_FACTOR_TYPES.includes(r.factorType));
  if (baseline.length === 0) return { kind: "none" };
  const max = Math.max(...baseline.map((r) => r.value));
  const top = baseline.filter((r) => r.value === max);
  if (top.length === 1) return { kind: "unique", factorId: top[0].factorId };
  return { kind: "tie", factorIds: top.map((r) => r.factorId), question: BASELINE_TIE_QUESTION };
}

/**
 * Purely a separate, later REPORT -- never replaces baselinePrimaryFactorId,
 * never triggers a second tie-break question here (a future phase's own
 * routing rule may choose to ask one; this module never does). Returns
 * every id tied for highest at afterRegulation among interfering factors
 * only -- one id for a unique maximum, several for a tie, empty when no
 * interfering factor was rated at this checkpoint at all.
 */
export function resolveLatestHighestInterferingFactorIds(ratings: FactorRating[]): string[] {
  const latest = ratings.filter((r) => r.checkpoint === "afterRegulation" && INTERFERING_FACTOR_TYPES.includes(r.factorType));
  if (latest.length === 0) return [];
  const max = Math.max(...latest.map((r) => r.value));
  return latest.filter((r) => r.value === max).map((r) => r.factorId);
}

// ---------------------------------------------------------------------------
// Change calculations -- typed status, never a bare ambiguous boolean.
// ---------------------------------------------------------------------------

export type ChangeStatus = "improved" | "unchanged" | "worsened";

export interface FactorRatingChange {
  factorId: string;
  factorType: FactorType;
  rawChangeAfterStayAcceptance: number;
  rawChangeAfterRegulation: number;
  rawTotalChange: number;
  statusAfterStayAcceptance: ChangeStatus;
  statusAfterRegulation: ChangeStatus;
  statusTotal: ChangeStatus;
}

function resolveChangeStatus(rawChange: number, direction: ImprovementDirection): ChangeStatus {
  if (rawChange === 0) return "unchanged";
  if (direction === "higher_is_better") return rawChange > 0 ? "improved" : "worsened";
  return rawChange < 0 ? "improved" : "worsened";
}

/** null when this factor doesn't have a rating at all three checkpoints yet -- never computed from a partial set. */
export function computeFactorRatingChange(factorId: string, factorType: FactorType, ratings: FactorRating[]): FactorRatingChange | null {
  const valueAt = (checkpoint: RatingCheckpoint) => ratings.find((r) => r.factorId === factorId && r.checkpoint === checkpoint)?.value ?? null;
  const v1 = valueAt("afterAwareness");
  const v2 = valueAt("afterStayAcceptance");
  const v3 = valueAt("afterRegulation");
  if (v1 === null || v2 === null || v3 === null) return null;

  const direction = resolveImprovementDirection(factorType);
  const rawChangeAfterStayAcceptance = v2 - v1;
  const rawChangeAfterRegulation = v3 - v2;
  const rawTotalChange = v3 - v1;

  return {
    factorId,
    factorType,
    rawChangeAfterStayAcceptance,
    rawChangeAfterRegulation,
    rawTotalChange,
    statusAfterStayAcceptance: resolveChangeStatus(rawChangeAfterStayAcceptance, direction),
    statusAfterRegulation: resolveChangeStatus(rawChangeAfterRegulation, direction),
    statusTotal: resolveChangeStatus(rawTotalChange, direction),
  };
}

/** Convenience: computeFactorRatingChange for every rateable factor, skipping any without all three checkpoints. */
export function computeAllFactorRatingChanges(factors: RateableFactor[], ratings: FactorRating[]): FactorRatingChange[] {
  return factors.map((factor) => computeFactorRatingChange(factor.factorId, factor.factorType, ratings)).filter((change): change is FactorRatingChange => change !== null);
}
