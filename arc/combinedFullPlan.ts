/**
 * arc/combinedFullPlan.ts
 *
 * Adaptive ARC architecture task, Phase 14B-3: derives the Full step
 * sequence from a ResolvedCombinedFactorPlan (arc/combinedFactorPlan.ts)
 * -- never re-resolves a factor/State/action decision itself, and never
 * reachable until that plan is fully resolved (the type system already
 * enforces this: there is no "in-progress" ResolvedCombinedFactorPlan).
 *
 * Exact order (approved architecture, supersedes WIP commit 60d70d7's
 * own unconditional "shared_regulation" ordering):
 *   1. Recognition, every selected factor (RECOGNITION_CATEGORY_ORDER).
 *   2. "afterAwareness" checkpoint.
 *   [Primary-factor resolution/tie choice happens HERE, chronologically
 *   -- but it is a planner-stage boundary (see arc/combinedFactorPlan.ts's
 *   own "needs_primary_factor"), never a rendered step in this sequence,
 *   since by construction a ResolvedCombinedFactorPlan already has
 *   primaryFactorId fixed before this function is ever called.]
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
 *   11. Only when State participates: State desired-state Encoding, then
 *       the separate desired-state rating (never merged into a factor
 *       checkpoint -- a distinct step kind by construction).
 *   12. Resolved action(s) -- State action first, primary-factor action
 *       second, ONE step only for a shared/legacy-fallback outcome (see
 *       arc/combinedFactorPlan.ts's own resolveCombinedActionKinds).
 *   13. Terminal boundary.
 *
 * A no-State route (plan.stateIncluded === false) omits steps 7 and 11
 * entirely -- no fabricated "afterStateRegulation" checkpoint, no State
 * Regulation/Encoding, no desired-state rating, no State action. Factor
 * interventions, the Presence decision, and the primary-factor action
 * are always preserved regardless.
 *
 * Pure logic only -- nothing in this repository calls anything below yet.
 */

import type { InterferenceCategory } from "./interferenceItem.ts";
import type { ResolvedCombinedFactorPlan } from "./combinedFactorPlan.ts";
import { resolveCombinedActionKinds } from "./combinedFactorPlan.ts";
import type { FinalPresenceMode } from "./combinedRoute.ts";

export type FullCombinedStepKind =
  | "recognition"
  | "rating_checkpoint"
  | "urge_preventive_stopping"
  | "shared_stay"
  | "shared_acceptance"
  | "state_regulation_anchor"
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
  /** The factor this step concerns -- null for every session-level step (rating_checkpoint, shared_stay, shared_acceptance, the State block, cognitive_reassessment, presence, either action step, terminal_boundary). */
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

export function buildFullCombinedSteps(plan: ResolvedCombinedFactorPlan, finalPresenceMode: FinalPresenceMode): FullCombinedStep[] {
  const steps: FullCombinedStep[] = [];
  const byCategory = (category: InterferenceCategory) => plan.factors.filter((factor) => factor.category === category);
  const hasFactors = plan.factors.length > 0;

  for (const category of RECOGNITION_CATEGORY_ORDER) {
    for (const factor of byCategory(category)) steps.push(factorStep("recognition", factor.itemId, factor.category));
  }
  if (hasFactors) steps.push(checkpointStep("afterAwareness"));

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
    steps.push(sessionStep("state_desired_state_encoding"));
    steps.push(sessionStep("desired_state_rating"));
  }

  for (const actionKind of resolveCombinedActionKinds(plan)) steps.push(sessionStep(actionKind));

  steps.push(sessionStep("terminal_boundary"));

  return steps;
}
