/**
 * arc/combinedLiveSessionFacts.ts
 *
 * Adaptive ARC architecture task, Phase 14B-4: the in-memory terminal
 * facts a completed combined Personal Development LIVE session produces
 * -- a pure, read-only PROJECTION of arc/combinedLiveSession.ts's own
 * CombinedLiveSessionState, never a second source of truth. Rewritten
 * from scratch -- WIP commit 60d70d7's own arc/combinedLiveSessionFacts.ts
 * is REJECTED (its shape -- practicedStage/projection/
 * latestHighestInterferingFactorIds -- is superseded entirely by the
 * exact shape approved for this phase, below); only its
 * "createEmpty*Facts" constructor-function convention is carried
 * forward.
 *
 * Nothing here persists anything -- no storage import, no data/ import.
 * Phase 15 is the only future consumer of this object; this module's own
 * job ends at producing it.
 */

import type { CombinedFactorMode } from "./combinedFactorPlan.ts";
import type { CombinedLiveSessionState } from "./combinedLiveSession.ts";
import { resolvePrimaryOutcome } from "./combinedLiveSession.ts";
import { deriveCompletedInterferenceTypes } from "./combinedRoute.ts";
import type { InterferenceCategory } from "./interferenceItem.ts";
import type { ActionResolutionOutcome } from "./factorAction.ts";
import type { FactorRating } from "./factorRating.ts";
import { resolveStateInclusion } from "./stateInclusion.ts";
import type { FinalPresenceMode } from "./combinedRoute.ts";

export type CombinedLiveSessionCadence = "reactive" | "proactive";

export interface CombinedLiveSessionFacts {
  sessionId: string;
  routeConfigId: string;
  mode: CombinedFactorMode;
  cadence: CombinedLiveSessionCadence;
  /** Every item id configured on the route (arc/personalDevelopmentRouteConfig.ts's own interferenceItemIds) -- regardless of whether it ultimately resolved for this session. */
  configuredItemIds: string[];
  /** The resolved, enabled, actually-in-play item ids for THIS session (ResolvedCombinedFactorPlan.factors) -- a subset of configuredItemIds, null-safe empty array before the plan resolves. */
  selectedItemIds: string[];
  /** Item ids actually recognized/intervened on -- every selected factor's own recognition+intervention step is unconditionally reached by construction (arc/combinedFullPlan.ts's/arc/combinedMiniPlan.ts's own "secondary interventions remain" guarantee), so this equals selectedItemIds once the plan has resolved. */
  practicedItemIds: string[];
  completedTypes: InterferenceCategory[];
  primaryFactorId: string | null;
  /** The one resolved StateProfile actually used this session, or null when no State participated -- re-derived from the route's own StateInclusionPolicy + the LIVE decide_in_live answer, never a field the merged planner itself stores (ResolvedCombinedFactorPlan deliberately carries only the boolean stateIncluded + the resolved action text -- see that module's own doc). */
  stateProfileId: string | null;
  stateIncluded: boolean;
  /** The decide_in_live answer specifically, when the route's policy required one; null when the policy was "linked"/"none" (no LIVE decision was ever needed) or the decision has not yet been answered. */
  stateInclusionDecision: boolean | null;
  presenceSelectedForSession: boolean;
  /** Full: the real resolved FinalPresenceMode ("skipped"/"embedded"/"full"). Mini: "embedded" when its own compact presence_intervention step ran (Mini has no separate full/optional concept -- see arc/combinedMiniPlan.ts's own header doc), "skipped" otherwise. */
  presenceMode: FinalPresenceMode | null;
  /** Full only (cognitive_reassessment) -- always null for Mini, which has no such step. */
  reassessmentAnswer: "not_stuck" | "still_stuck" | null;
  /** Mini: always [] (Mini contains zero ratings of any kind, by construction). */
  factorRatingHistory: FactorRating[];
  /** Mini: always null. */
  desiredStateRating: number | null;
  /**
   * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 6
   * correction: resolved directly from the session's own already-resolved
   * plan (via resolvePrimaryOutcome) whenever a plan exists, rather than
   * only from CombinedLiveSessionState.actionOutcomeKind (which the
   * controller itself only ever WRITES once confirmActionCompleted first
   * runs) -- null only when no plan has resolved yet (awareness/
   * primary_choice/state_decision). This is what makes a frozen snapshot
   * captured the moment an action role's own timer begins (see
   * arc/frozenCombinedActionRecovery.ts) already carry a valid
   * actionOutcomeKind, well before that action is ever confirmed.
   */
  actionOutcomeKind: ActionResolutionOutcome["kind"] | null;
  stateActionReached: boolean;
  stateActionCompleted: boolean;
  factorActionReached: boolean;
  factorActionCompleted: boolean;
  sharedActionCompleted: boolean;
  terminalCompleted: boolean;
}

function resolveSessionStateProfileId(state: CombinedLiveSessionState): string | null {
  if (!state.resolvedPlan?.stateIncluded) return null;
  const inclusion = resolveStateInclusion(state.snapshot.config.stateInclusionPolicy, state.snapshot.config.stateProfileId);
  if (inclusion.kind === "linked") return inclusion.stateProfileId;
  if (inclusion.kind === "decide_in_live") return inclusion.candidateStateProfileId;
  return null;
}

function resolvePresenceModeForFacts(state: CombinedLiveSessionState): FinalPresenceMode | null {
  if (state.mode === "full") return state.presenceMode;
  if (!state.resolvedPlan) return null;
  return state.resolvedPlan.presence !== null ? "embedded" : "skipped";
}

function findActionRole(state: CombinedLiveSessionState, role: "state" | "factor" | "shared") {
  return state.actionRoleProgress.find((entry) => entry.role === role) ?? null;
}

/**
 * Pure projection -- callable at any point, but only meaningful for
 * Phase 15's own future purposes once state.terminalCompleted is true
 * (this phase never persists it either way). Never fabricates a rating
 * or a completed action that has not genuinely occurred.
 */
export function toCombinedLiveSessionFacts(state: CombinedLiveSessionState, cadence: CombinedLiveSessionCadence = "reactive"): CombinedLiveSessionFacts {
  const practicedItems = state.snapshot.items.filter((item) => state.practicedItemIds.includes(item.id));
  const stateAction = findActionRole(state, "state");
  const factorAction = findActionRole(state, "factor");
  const sharedAction = findActionRole(state, "shared");

  return {
    sessionId: state.sessionId,
    routeConfigId: state.routeConfigId,
    mode: state.mode,
    cadence,
    configuredItemIds: state.snapshot.config.interferenceItemIds,
    selectedItemIds: state.resolvedPlan ? state.resolvedPlan.factors.map((factor) => factor.itemId) : [],
    practicedItemIds: state.practicedItemIds,
    completedTypes: deriveCompletedInterferenceTypes(practicedItems),
    primaryFactorId: state.primaryFactorId,
    stateProfileId: resolveSessionStateProfileId(state),
    stateIncluded: state.resolvedPlan?.stateIncluded ?? false,
    stateInclusionDecision: state.stateDecisionAnswer,
    presenceSelectedForSession: state.presenceSelectedForSession,
    presenceMode: resolvePresenceModeForFacts(state),
    reassessmentAnswer: state.mode === "full" ? state.reassessmentAnswer : null,
    factorRatingHistory: state.mode === "mini" ? [] : state.factorRatingHistory,
    desiredStateRating: state.mode === "mini" ? null : state.desiredStateRating,
    actionOutcomeKind: state.resolvedPlan ? (resolvePrimaryOutcome(state.resolvedPlan)?.kind ?? null) : state.actionOutcomeKind,
    stateActionReached: stateAction?.reached ?? false,
    stateActionCompleted: stateAction?.completed ?? false,
    factorActionReached: factorAction?.reached ?? false,
    factorActionCompleted: factorAction?.completed ?? false,
    sharedActionCompleted: sharedAction?.completed ?? false,
    terminalCompleted: state.terminalCompleted,
  };
}
