/**
 * arc/combinedLiveSequence.ts
 *
 * Adaptive ARC architecture task, Phase 14B: the typed "Phase A fixed
 * prefix" composer for reactive Full combined LIVE practice --
 * recognition -> afterAwareness checkpoint -> Urge preventive stopping
 * -> shared Stay -> shared Acceptance -> afterStayAcceptance checkpoint
 * -> shared Regulation -> afterRegulation checkpoint -> category-specific
 * processing -> cognitive reassessment (when applicable).
 *
 * Single source of truth for step ORDER/CONTENT-SELECTION remains
 * arc/combinedRoute.ts's own buildCombinedRouteCoreSteps -- this module
 * NEVER re-derives its own category loop over activeItems. It only
 * RECLASSIFIES that one shared array (via an exhaustive switch over the
 * closed CombinedRouteStepKind union, so a future 11th kind fails to
 * compile here until classified) into three buckets -- recognition,
 * urge_preventive_stopping, processing -- and interleaves the checkpoint/
 * shared-stage markers at the two bucket boundaries this Full-LIVE
 * session needs. The relative per-category order WITHIN each bucket is
 * whatever buildCombinedRouteCoreSteps already produced -- never
 * reordered here.
 *
 * Phase B (the reassessment/Presence-decision-dependent tail) is NOT
 * built by this module -- arc/combinedRoute.ts's own individually
 * exported resolvePresenceRoute/resolveFinalPresenceMode are called
 * directly by arc/combinedLiveSession.ts's own controller once the
 * reassessment answer (and, if needed, the full_optional accept/decline)
 * are genuinely known. buildCombinedRoutePlan itself -- which requires
 * both of those as inputs before it can run at all -- is never called by
 * Phase 14B; its bundled, single-call shape does not fit a staged LIVE
 * session (see this module's own test suite for the cross-check proving
 * this module's own prefix never drifts from buildCombinedRouteCoreSteps'
 * own step set).
 */

import type { CombinedRouteStep, CombinedRouteStepKind } from "./combinedRoute.ts";
import { buildCombinedRouteCoreSteps } from "./combinedRoute.ts";
import type { InterferenceItem } from "./interferenceItem.ts";
import type { RatingCheckpoint } from "./factorRating.ts";

export type CombinedLiveSequenceStepKind = "recognition" | "rating_checkpoint" | "urge_preventive_stopping" | "shared_stay" | "shared_acceptance" | "shared_regulation" | "processing" | "cognitive_reassessment";

export interface CombinedLiveSequenceStep {
  kind: CombinedLiveSequenceStepKind;
  /** The item this step concerns -- null for session-level steps (rating_checkpoint/shared_stay/shared_acceptance/shared_regulation/cognitive_reassessment). */
  itemId: string | null;
  /** For "recognition"/"urge_preventive_stopping"/"processing", the underlying CombinedRouteStepKind this step renders (arc/combinedRouteStepCopy.ts's own content resolvers switch on this) -- null otherwise. */
  routeStepKind: CombinedRouteStepKind | null;
  /** Only set for "rating_checkpoint". */
  checkpoint: RatingCheckpoint | null;
}

type PrefixBucket = "recognition" | "preventive_stopping" | "processing";

/**
 * Exhaustive over CombinedRouteStepKind's ten core-step members --
 * throws (a defensive, never-actually-reached guard) for the four
 * session-level kinds buildCombinedRouteCoreSteps never emits
 * (cognitive_reassessment/presence_embedded/presence_full/
 * beneficial_action_boundary), so this module can never silently
 * misclassify one of those as a per-item bucket step.
 */
function classifyCoreStep(kind: CombinedRouteStepKind): PrefixBucket {
  switch (kind) {
    case "thought_recognition":
    case "belief_recognition":
    case "emotion_recognition":
    case "urge_recognition":
      return "recognition";
    case "urge_preventive_stopping":
      return "preventive_stopping";
    case "emotion_support":
    case "urge_support":
    case "belief_alternative":
    case "thought_alternative":
    case "thought_future_insight":
      return "processing";
    case "cognitive_reassessment":
    case "presence_embedded":
    case "presence_full":
    case "beneficial_action_boundary":
      throw new Error(`classifyCoreStep: "${kind}" is a session-level/tail step, never a core step -- buildCombinedRouteCoreSteps must never have emitted it here.`);
  }
}

function toSequenceStep(kind: CombinedLiveSequenceStepKind, coreStep: CombinedRouteStep): CombinedLiveSequenceStep {
  return { kind, itemId: coreStep.itemId, routeStepKind: coreStep.kind, checkpoint: null };
}

function checkpointStep(checkpoint: RatingCheckpoint): CombinedLiveSequenceStep {
  return { kind: "rating_checkpoint", itemId: null, routeStepKind: null, checkpoint };
}

function sharedStageStep(kind: "shared_stay" | "shared_acceptance" | "shared_regulation"): CombinedLiveSequenceStep {
  return { kind, itemId: null, routeStepKind: null, checkpoint: null };
}

/**
 * The whole Phase A fixed prefix for reactive Full combined LIVE
 * practice, given the already-resolved active items for this session.
 * `cognitiveWorkSelected` governs only whether the trailing
 * cognitive_reassessment marker is appended -- mirrors
 * arc/combinedRoute.ts's own buildCombinedRoutePlan rule exactly
 * (Thought and/or Belief selected).
 */
export function buildCombinedLiveSequencePrefix(activeItems: InterferenceItem[]): CombinedLiveSequenceStep[] {
  const coreSteps = buildCombinedRouteCoreSteps(activeItems);
  const cognitiveWorkSelected = activeItems.some((item) => item.category === "thought" || item.category === "belief");

  const recognitionSteps = coreSteps.filter((step) => classifyCoreStep(step.kind) === "recognition");
  const preventiveSteps = coreSteps.filter((step) => classifyCoreStep(step.kind) === "preventive_stopping");
  const processingSteps = coreSteps.filter((step) => classifyCoreStep(step.kind) === "processing");

  const sequence: CombinedLiveSequenceStep[] = [];
  for (const step of recognitionSteps) sequence.push(toSequenceStep("recognition", step));
  sequence.push(checkpointStep("afterAwareness"));
  for (const step of preventiveSteps) sequence.push(toSequenceStep("urge_preventive_stopping", step));
  sequence.push(sharedStageStep("shared_stay"));
  sequence.push(sharedStageStep("shared_acceptance"));
  sequence.push(checkpointStep("afterStayAcceptance"));
  sequence.push(sharedStageStep("shared_regulation"));
  sequence.push(checkpointStep("afterRegulation"));
  for (const step of processingSteps) sequence.push(toSequenceStep("processing", step));
  if (cognitiveWorkSelected) {
    sequence.push({ kind: "cognitive_reassessment", itemId: null, routeStepKind: "cognitive_reassessment", checkpoint: null });
  }

  return sequence;
}
