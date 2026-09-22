/**
 * arc/combinedFullPlan.ts
 *
 * Adaptive ARC architecture task, Phase 14B-3: derives the Full step
 * sequence from a ResolvedCombinedFactorPlan (arc/combinedFactorPlan.ts)
 * -- never re-resolves a factor/State/action decision itself, and never
 * reachable until that plan is fully resolved (the type system already
 * enforces this: there is no "in-progress" ResolvedCombinedFactorPlan).
 *
 * Adaptive ARC architecture task, Phase 14B-4: split into two explicit,
 * independently callable halves -- buildFullAwarenessSteps (recognition +
 * the "afterAwareness" checkpoint, derivable from an UnresolvedCombinedFactorContext
 * alone, i.e. BEFORE a primary factor is even known) and
 * buildFullStepsAfterPrimaryResolution (everything from urge preventive
 * stopping onward, requiring a genuinely resolved plan). This exists
 * because a LIVE controller must render Awareness recognition/ratings to
 * even RESOLVE the primary factor (arc/factorRating.ts's
 * resolveBaselinePrimaryFactor needs real ratings) -- i.e. Awareness must
 * render before a ResolvedCombinedFactorPlan can exist at all for a
 * multi-factor route. The controller therefore renders
 * buildFullAwarenessSteps's output FIRST (exactly once, from the
 * UnresolvedCombinedFactorContext already returned by
 * arc/combinedFactorPlan.ts's own "needs_primary_factor"/"needs_state_decision"
 * results, or equivalently from a "resolved" plan's own factors/presence),
 * then -- once the plan is resolved -- renders
 * buildFullStepsAfterPrimaryResolution's output, with NO index arithmetic,
 * no re-deriving/skipping an assumed prefix, and no risk of the two ever
 * drifting apart, since buildFullCombinedSteps below is now defined as
 * nothing more than their concatenation (see
 * arc/combinedFullPlan.test.ts's own regression coverage).
 *
 * Exact order (approved architecture, supersedes WIP commit 60d70d7's
 * own unconditional "shared_regulation" ordering):
 *   1. Recognition, every selected factor (RECOGNITION_CATEGORY_ORDER).
 *   2. "afterAwareness" checkpoint.
 *   [Primary-factor resolution/tie choice happens HERE, chronologically
 *   -- but it is a planner-stage boundary (see arc/combinedFactorPlan.ts's
 *   own "needs_primary_factor"), never a rendered step in this sequence,
 *   since by construction a ResolvedCombinedFactorPlan already has
 *   primaryFactorId fixed before buildFullStepsAfterPrimaryResolution is
 *   ever called.]
 *   3. Urge preventive stopping, when relevant.
 *   4. Shared Stay.
 *   5. Shared Acceptance.
 *   6. "afterStayAcceptance" checkpoint.
 *   7. Only when State participates: State Regulation anchor, then
 *      "afterStateRegulation" checkpoint.
 *   8. Factor-specific interventions (PROCESSING_CATEGORY_ORDER).
 *   9. Cognitive reassessment, only when Thought and/or Belief selected.
 *   10. Presence (embedded or full), mutually exclusive -- supplied by
 *       the caller as `finalPresenceMode` (arc/combinedRoute.ts's own
 *       resolvePresenceRoute/resolveFinalPresenceMode, reused unmodified
 *       -- this deriver never recomputes that decision itself).
 *   11. Only when State participates AND the route has a configured
 *       PersonalDevelopmentRouteGoalConnection (arc/personalDevelopmentRouteConfig.ts):
 *       Goal Connection, immediately before Encoding -- the approved
 *       "Acceptance -> Regulation -> Goal Connection -> Encoding"
 *       refinement (Adaptive ARC architecture task, unified PD/ARC Goal,
 *       Phase 7). Full-only: Mini's own paired Regulation/Encoding step
 *       (arc/combinedMiniPlan.ts) is explicitly documented as having "no
 *       checkpoint or rating of any kind between them," and Mini has no
 *       "Acceptance" step at all to anchor this ordering against -- so
 *       this insertion is scoped to Full, never silently extended to
 *       Mini. `goalConnection === null` (the route has none configured)
 *       omits this step exactly like every other optional block here,
 *       never rendering placeholder/invented content.
 *   12. Only when State participates: State desired-state Encoding, then
 *       the separate desired-state rating (never merged into a factor
 *       checkpoint -- a distinct step kind by construction).
 *   13. Resolved action(s) -- State action first, primary-factor action
 *       second, ONE step only for a shared/legacy-fallback outcome (see
 *       arc/combinedFactorPlan.ts's own resolveCombinedActionKinds).
 *   14. Terminal boundary.
 *
 * A no-State route (plan.stateIncluded === false) omits steps 7, 11, and
 * 12 entirely -- no fabricated "afterStateRegulation" checkpoint, no
 * State Regulation/Goal Connection/Encoding, no desired-state rating, no
 * State action. Factor interventions, the Presence decision, and the
 * primary-factor action are always preserved regardless.
 *
 * Pure logic only -- nothing in this repository calls anything below yet.
 */

import type { InterferenceCategory } from "./interferenceItem.ts";
import type { ResolvedCombinedFactorPlan, UnresolvedCombinedFactorContext } from "./combinedFactorPlan.ts";
import { resolveCombinedActionKinds } from "./combinedFactorPlan.ts";
import type { FinalPresenceMode } from "./combinedRoute.ts";
import type { PersonalDevelopmentRouteGoalConnection } from "./personalDevelopmentRouteConfig.ts";

export type FullCombinedStepKind =
  | "recognition"
  | "rating_checkpoint"
  | "urge_preventive_stopping"
  | "shared_stay"
  | "shared_acceptance"
  | "state_regulation_anchor"
  | "goal_connection"
  | "state_desired_state_encoding"
  | "desired_state_rating"
  | "processing"
  | "cognitive_reassessment"
  | "presence"
  | "state_action"
  | "factor_action"
  | "terminal_boundary";

export type FullRatingCheckpoint = "afterAwareness" | "afterStayAcceptance" | "afterStateRegulation";

export interface FullCombinedStep {
  kind: FullCombinedStepKind;
  /** The factor this step concerns -- null for every session-level step (rating_checkpoint, shared_stay, shared_acceptance, the State block, goal_connection, cognitive_reassessment, presence, either action step, terminal_boundary). */
  itemId: string | null;
  category: InterferenceCategory | null;
  /** Only set for "rating_checkpoint". */
  checkpoint: FullRatingCheckpoint | null;
}

/** Recognition order -- unchanged from the merged arc/combinedRoute.ts's own INTERFERENCE_CATEGORY_ORDER convention. */
export const RECOGNITION_CATEGORY_ORDER: InterferenceCategory[] = ["thought", "belief", "emotion", "urge"];
/** Factor-specific intervention order -- the approved architecture's own explicit correction, deliberately different from recognition order. */
export const PROCESSING_CATEGORY_ORDER: InterferenceCategory[] = ["emotion", "urge", "belief", "thought"];

function factorStep(kind: FullCombinedStepKind, itemId: string, category: InterferenceCategory): FullCombinedStep {
  return { kind, itemId, category, checkpoint: null };
}

function sessionStep(kind: FullCombinedStepKind): FullCombinedStep {
  return { kind, itemId: null, category: null, checkpoint: null };
}

function checkpointStep(checkpoint: FullRatingCheckpoint): FullCombinedStep {
  return { kind: "rating_checkpoint", itemId: null, category: null, checkpoint };
}

/**
 * Adaptive ARC architecture task, Phase 14B-4: the Awareness prefix ALONE
 * -- recognition (RECOGNITION_CATEGORY_ORDER) for every factor in
 * `context.factors`, then exactly one "afterAwareness" checkpoint step
 * when at least one factor is present. Derivable from an
 * UnresolvedCombinedFactorContext (arc/combinedFactorPlan.ts's own
 * "needs_primary_factor"/"needs_state_decision" results already carry
 * one) -- i.e. callable BEFORE a primary factor or State decision is
 * known, which is exactly why a LIVE controller can render this once,
 * collect real ratings against it, resolve the primary factor from
 * those ratings, and only then obtain a genuinely resolved plan. A
 * "resolved" ResolvedCombinedFactorPlan's own {factors, presence} is
 * structurally the same shape, so this same function also serves the
 * single-factor auto-resolved case (called with `{factors: plan.factors,
 * presence: plan.presence}`) -- there is exactly one Awareness-building
 * code path, never two.
 */
export function buildFullAwarenessSteps(context: UnresolvedCombinedFactorContext): FullCombinedStep[] {
  const steps: FullCombinedStep[] = [];
  const byCategory = (category: InterferenceCategory) => context.factors.filter((factor) => factor.category === category);
  const hasFactors = context.factors.length > 0;

  for (const category of RECOGNITION_CATEGORY_ORDER) {
    for (const factor of byCategory(category)) steps.push(factorStep("recognition", factor.itemId, factor.category));
  }
  if (hasFactors) steps.push(checkpointStep("afterAwareness"));

  return steps;
}

/**
 * Adaptive ARC architecture task, Phase 14B-4: everything from urge
 * preventive stopping through terminal_boundary -- callable only once a
 * ResolvedCombinedFactorPlan genuinely exists (primaryFactorId and
 * stateIncluded already fixed). Never re-renders recognition or the
 * "afterAwareness" checkpoint -- those belong exclusively to
 * buildFullAwarenessSteps above, called once, earlier, by the controller.
 */
export function buildFullStepsAfterPrimaryResolution(
  plan: ResolvedCombinedFactorPlan,
  finalPresenceMode: FinalPresenceMode,
  /** Adaptive ARC architecture task (unified PD/ARC Goal), Phase 7: the route's own configured Goal Connection, or null -- see this module's own header doc, step 11. Defaults to null so every existing caller (arc/combinedLiveSession.ts's own buildFullCombinedSteps test convenience call included) is unaffected until it explicitly opts in. */
  goalConnection: PersonalDevelopmentRouteGoalConnection | null = null
): FullCombinedStep[] {
  const steps: FullCombinedStep[] = [];
  const byCategory = (category: InterferenceCategory) => plan.factors.filter((factor) => factor.category === category);
  const hasFactors = plan.factors.length > 0;

  for (const factor of byCategory("urge")) {
    if (factor.preventiveStoppingRelevant) steps.push(factorStep("urge_preventive_stopping", factor.itemId, factor.category));
  }

  if (hasFactors) {
    steps.push(sessionStep("shared_stay"));
    steps.push(sessionStep("shared_acceptance"));
    steps.push(checkpointStep("afterStayAcceptance"));
  }

  if (plan.stateIncluded) {
    steps.push(sessionStep("state_regulation_anchor"));
    if (hasFactors) steps.push(checkpointStep("afterStateRegulation"));
  }

  for (const category of PROCESSING_CATEGORY_ORDER) {
    for (const factor of byCategory(category)) steps.push(factorStep("processing", factor.itemId, factor.category));
  }

  const hasThought = byCategory("thought").length > 0;
  const hasBelief = byCategory("belief").length > 0;
  if (hasThought || hasBelief) steps.push(sessionStep("cognitive_reassessment"));

  if (finalPresenceMode === "embedded" || finalPresenceMode === "full") steps.push(sessionStep("presence"));

  if (plan.stateIncluded) {
    if (goalConnection !== null) steps.push(sessionStep("goal_connection"));
    steps.push(sessionStep("state_desired_state_encoding"));
    steps.push(sessionStep("desired_state_rating"));
  }

  for (const actionKind of resolveCombinedActionKinds(plan)) steps.push(sessionStep(actionKind));

  steps.push(sessionStep("terminal_boundary"));

  return steps;
}

/**
 * Adaptive ARC architecture task, Phase 14B-4: retained ONLY as the exact
 * concatenation of buildFullAwarenessSteps + buildFullStepsAfterPrimaryResolution
 * -- a convenience for any caller (tests included) that already has a
 * fully resolved plan and wants the whole Full sequence in one call. A
 * real LIVE controller never calls this directly; it calls the two
 * halves separately (see this module's own header doc) so Awareness is
 * rendered exactly once, never duplicated.
 */
export function buildFullCombinedSteps(
  plan: ResolvedCombinedFactorPlan,
  finalPresenceMode: FinalPresenceMode,
  goalConnection: PersonalDevelopmentRouteGoalConnection | null = null
): FullCombinedStep[] {
  return [...buildFullAwarenessSteps({ factors: plan.factors, presence: plan.presence }), ...buildFullStepsAfterPrimaryResolution(plan, finalPresenceMode, goalConnection)];
}
