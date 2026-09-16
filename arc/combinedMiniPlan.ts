/**
 * arc/combinedMiniPlan.ts
 *
 * Adaptive ARC architecture task, Phase 14B-3: derives the combined Mini
 * step sequence from the exact same ResolvedCombinedFactorPlan
 * (arc/combinedFactorPlan.ts) arc/combinedFullPlan.ts consumes -- one
 * fast, fluid route, never several consecutive Mini protocols, and never
 * the unrelated legacy MiniArcBuild (arc/miniArc.ts, left completely
 * untouched and unreferenced here).
 *
 * MiniCombinedStepKind has NO rating-shaped member of any kind, by
 * construction -- Mini contains zero ratings (no factor rating, no
 * Presence score added by this planner, no desired-state rating, no
 * awareness/regulation/primary-factor scoring, no initial or final
 * scoring step), even with several factors, ARC State, Presence, or
 * Emotion selected. This is a structural guarantee: there is no way to
 * add a rating-shaped step without adding a new member to this file's
 * own closed union, which arc/combinedMiniPlan.test.ts asserts against
 * directly.
 *
 * Exact order (approved architecture):
 *   1. Primary-factor resolution, when >1 factor selected -- again a
 *      planner-stage boundary (arc/combinedFactorPlan.ts's own
 *      "needs_primary_factor"), never a rendered step here; with exactly
 *      one factor it is auto-resolved with zero steps. Because a
 *      ResolvedCombinedFactorPlan is unreachable until this is already
 *      fixed, the choice always precedes everything below by
 *      construction -- never after preventive stopping, never after any
 *      factor intervention has begun.
 *   2. One short combined recognition (a single step -- itemId/category
 *      null, since it covers every selected factor at once, never one
 *      recognition moment per factor the way Full does).
 *   3. Urge preventive stopping, when relevant.
 *   4. One short factor-specific intervention per selected factor
 *      (PROCESSING_CATEGORY_ORDER, mirroring Full's own canonical order
 *      for the same "ownership rules never contradict" reason).
 *   4b. Adaptive ARC architecture task, Phase 14B-4 (approved, narrowly
 *      additive correction): one compact "presence_intervention" step
 *      when Presence is configured and resolves for this route
 *      (`plan.presence !== null` -- the same unconditional signal Full
 *      uses to know Presence is available at all, never gated on
 *      Full-only concepts like cognitive-reassessment "still stuck",
 *      since Mini has no reassessment step to produce that answer from).
 *      This is Mini's own version of "one short unique intervention for
 *      every selected disturbing factor" extended to Presence -- NOT the
 *      full embedded/full Presence protocol (arc/combinedRoute.ts's own
 *      PresenceRouteDecision/FinalPresenceMode machinery is a Full-only
 *      concern, never consulted here). The renderer guides this single
 *      semantic step using arc/embeddedPresence.ts's existing four
 *      compact stages (visual field / body contact / natural breathing /
 *      present environment) -- reused content, never a second, new
 *      Presence protocol -- with no rating, no reassessment loop, and no
 *      entry into PresenceArc's own standalone action/tail sub-engine.
 *      Presence's own resolved action (plan.presence.actionOutcome)
 *      still only ever surfaces through resolveCombinedActionKinds' own
 *      existing primary/presence-fallback rule (step 6 below) -- adding
 *      this recognition/intervention step never changes which outcome
 *      becomes the rendered action.
 *   5. Only when State participates: State regulation anchor, then State
 *      desired-state encoding cue -- paired, no checkpoint or rating of
 *      any kind between them (unlike Full, which has the
 *      "afterStateRegulation" checkpoint there).
 *   6. Resolved action(s) -- same rule as Full (arc/combinedFactorPlan.ts's
 *      own resolveCombinedActionKinds).
 *   7. Neutral terminal boundary.
 *
 * No cognitive reassessment step exists here at all (no already-approved
 * Mini-specific requirement calls for one). A no-State route omits step
 * 5 and the State action entirely, preserving factor interventions and
 * the primary-factor action.
 *
 * Pure logic only -- nothing in this repository calls anything below yet.
 */

import type { InterferenceCategory } from "./interferenceItem.ts";
import type { ResolvedCombinedFactorPlan } from "./combinedFactorPlan.ts";
import { resolveCombinedActionKinds } from "./combinedFactorPlan.ts";
import { PROCESSING_CATEGORY_ORDER } from "./combinedFullPlan.ts";

export type MiniCombinedStepKind =
  | "combined_recognition"
  | "urge_preventive_stopping"
  | "factor_intervention"
  | "presence_intervention"
  | "state_regulation_anchor"
  | "state_desired_state_encoding"
  | "state_action"
  | "factor_action"
  | "terminal_boundary";

export interface MiniCombinedStep {
  kind: MiniCombinedStepKind;
  /** null for "combined_recognition" (covers every factor at once) and every session-level step (the State block, either action step, terminal_boundary). */
  itemId: string | null;
  category: InterferenceCategory | null;
}

function factorStep(kind: MiniCombinedStepKind, itemId: string, category: InterferenceCategory): MiniCombinedStep {
  return { kind, itemId, category };
}

function sessionStep(kind: MiniCombinedStepKind): MiniCombinedStep {
  return { kind, itemId: null, category: null };
}

export function buildMiniCombinedSteps(plan: ResolvedCombinedFactorPlan): MiniCombinedStep[] {
  const steps: MiniCombinedStep[] = [];
  const byCategory = (category: InterferenceCategory) => plan.factors.filter((factor) => factor.category === category);

  if (plan.factors.length > 0) steps.push(sessionStep("combined_recognition"));

  for (const factor of byCategory("urge")) {
    if (factor.preventiveStoppingRelevant) steps.push(factorStep("urge_preventive_stopping", factor.itemId, factor.category));
  }

  for (const category of PROCESSING_CATEGORY_ORDER) {
    for (const factor of byCategory(category)) steps.push(factorStep("factor_intervention", factor.itemId, factor.category));
  }

  if (plan.presence !== null) steps.push(sessionStep("presence_intervention"));

  if (plan.stateIncluded) {
    steps.push(sessionStep("state_regulation_anchor"));
    steps.push(sessionStep("state_desired_state_encoding"));
  }

  for (const actionKind of resolveCombinedActionKinds(plan)) steps.push(sessionStep(actionKind));

  steps.push(sessionStep("terminal_boundary"));

  return steps;
}
