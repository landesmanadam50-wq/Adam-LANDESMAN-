/**
 * arc/personalDevelopmentRouteActionOnly.ts
 *
 * Adaptive ARC architecture task (unified PD/ARC Goal), stage-based entry
 * task: Stage 4's own controller -- independent action, per the approved
 * design decision ("give the trainee a simple way to mark the configured
 * beneficial action as done without running the full protocol. Record it
 * against that route"). NOT a bare mark-as-done toggle: it still presents
 * the real resolved Beneficial Action, starts/restores its real
 * wall-clock timer when one is configured, survives backgrounding/restart
 * (via the SAME arc/frozenCombinedActionRecovery.ts snapshot machinery
 * Full/Mini/Route Link already use, unmodified), requires an explicit
 * "ביצעתי את הפעולה" confirmation, and writes the completion idempotently
 * against the same frozen session id -- timer expiry alone or merely
 * opening the screen never counts (mirrors
 * arc/combinedLiveSession.ts's/arc/personalDevelopmentRouteLink.ts's own
 * "only an explicit confirmActionCompleted mints a completion" rule
 * exactly).
 *
 * Reuses resolveCombinedFactorPlan (arc/combinedFactorPlan.ts) for the
 * SAME primary-factor/State-decision resolution and action-outcome
 * resolution Full/Mini/Route Link already go through, and
 * resolvePrimaryOutcome/buildActionRoleProgress (arc/combinedLiveSession.ts)
 * for the SAME real action role(s) -- never a second, divergent resolver.
 * Structurally omits every other step: no recognition, no State
 * regulation/encoding review, no Presence -- "omits the Full protocol"
 * per the approved decision, never even Route Link's own short rehearsal.
 * Never offers a skip control, for the same reason
 * arc/personalDevelopmentRouteLink.ts never does (see that module's own
 * header doc) -- Stage 4 also requires "required_completed" or
 * "optional_completed" to count toward advancement.
 *
 * Pure logic only -- no storage import, no data/ import, no React. See
 * live/PersonalDevelopmentRouteActionOnlyScreen.tsx for the LIVE screen.
 */

import type { InterferenceItem } from "./interferenceItem.ts";
import type { PersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import type { StateProfile } from "./stateProfile.ts";
import type { PresenceArc } from "./types.ts";
import type { CombinedFactorPlanInvalidReason, ResolvedCombinedFactorPlan } from "./combinedFactorPlan.ts";
import { resolveCombinedFactorPlan } from "./combinedFactorPlan.ts";
import { buildActionRoleProgress, resolvePrimaryOutcome } from "./combinedLiveSession.ts";
import type { ActionRoleProgress } from "./combinedLiveSession.ts";
import type { ActionResolutionOutcome } from "./factorAction.ts";
import type { CombinedLiveSessionFacts } from "./combinedLiveSessionFacts.ts";
import { deriveCompletedInterferenceTypes } from "./combinedRoute.ts";
import { resolveStateInclusion } from "./stateInclusion.ts";
import type { PersonalDevelopmentRouteStage } from "./personalDevelopmentRouteProgress.ts";
import { generateTimerRunId } from "./actionTimer.ts";

export interface ActionOnlySnapshot {
  config: PersonalDevelopmentRouteConfig;
  items: InterferenceItem[];
  stateProfiles: StateProfile[];
  presenceArcs: PresenceArc[];
  startedAt: string;
}

export interface CreateActionOnlySessionInput {
  config: PersonalDevelopmentRouteConfig;
  items: InterferenceItem[];
  stateProfiles: StateProfile[];
  presenceArcs: PresenceArc[];
  startedAt: string;
  stageAtStart: PersonalDevelopmentRouteStage;
  generateSessionId?: () => string;
}

export type ActionOnlyPhase = "invalid" | "primary_choice" | "state_decision" | "action" | "complete";

export interface ActionOnlyState {
  sessionId: string;
  routeConfigId: string;
  mode: "action_only";
  cadence: "reactive";
  snapshot: ActionOnlySnapshot;
  stageAtStart: PersonalDevelopmentRouteStage;
  phase: ActionOnlyPhase;
  invalidReason: CombinedFactorPlanInvalidReason | null;
  primaryFactorId: string | null;
  pendingPrimaryFactorCandidates: string[] | null;
  pendingPrimaryFactorQuestion: string | null;
  stateDecisionAnswer: boolean | null;
  pendingStateDecisionCandidateId: string | null;
  resolvedPlan: ResolvedCombinedFactorPlan | null;
  actionRoleProgress: ActionRoleProgress[];
  actionOutcomeKind: ActionResolutionOutcome["kind"] | null;
  practicedItemIds: string[];
  terminalCompleted: boolean;
}

function emptyState(input: CreateActionOnlySessionInput): ActionOnlyState {
  return {
    sessionId: (input.generateSessionId ?? generateTimerRunId)(),
    routeConfigId: input.config.id,
    mode: "action_only",
    cadence: "reactive",
    snapshot: {
      config: { ...input.config, interferenceItemIds: [...input.config.interferenceItemIds], itemRelationships: { ...input.config.itemRelationships } },
      items: [...input.items],
      stateProfiles: [...input.stateProfiles],
      presenceArcs: [...input.presenceArcs],
      startedAt: input.startedAt,
    },
    stageAtStart: input.stageAtStart,
    phase: "invalid",
    invalidReason: null,
    primaryFactorId: null,
    pendingPrimaryFactorCandidates: null,
    pendingPrimaryFactorQuestion: null,
    stateDecisionAnswer: null,
    pendingStateDecisionCandidateId: null,
    resolvedPlan: null,
    actionRoleProgress: [],
    actionOutcomeKind: null,
    practicedItemIds: [],
    terminalCompleted: false,
  };
}

function resolvePlan(state: ActionOnlyState): ReturnType<typeof resolveCombinedFactorPlan> {
  return resolveCombinedFactorPlan({
    mode: "action_only",
    config: state.snapshot.config,
    items: state.snapshot.items,
    stateProfiles: state.snapshot.stateProfiles,
    presenceArcs: state.snapshot.presenceArcs,
    primaryFactorId: state.primaryFactorId,
    stateDecisionAnswer: state.stateDecisionAnswer,
  });
}

function resolveDecisionsAndAdvance(state: ActionOnlyState): ActionOnlyState {
  const result = resolvePlan(state);
  if (result.kind === "invalid") {
    return { ...state, phase: "invalid", invalidReason: result.reason };
  }
  if (result.kind === "needs_primary_factor") {
    return { ...state, phase: "primary_choice", pendingPrimaryFactorCandidates: result.candidates, pendingPrimaryFactorQuestion: result.question };
  }
  if (result.kind === "needs_state_decision") {
    return { ...state, phase: "state_decision", pendingStateDecisionCandidateId: result.candidateStateProfileId };
  }

  const plan = result.plan;
  const beneficialActionPolicy = state.snapshot.config.beneficialActionPolicy;
  const actionRoleProgress = buildActionRoleProgress(plan, beneficialActionPolicy);
  const practicedItemIds = plan.primaryFactorId ? [plan.primaryFactorId] : [];

  // No real action role means there is nothing left for this mode to do --
  // "action_only" with beneficialActionPolicy "none" is unreachable in
  // practice (Stage 4 is never offered to such a route -- see
  // arc/personalDevelopmentRouteProgress.ts's own MAX_STAGE_WITHOUT_BENEFICIAL_ACTION),
  // but this still resolves defensively rather than crashing on an empty array.
  if (actionRoleProgress.length === 0) {
    return { ...state, primaryFactorId: plan.primaryFactorId, resolvedPlan: plan, actionRoleProgress, practicedItemIds, phase: "invalid", invalidReason: "action_outcome_unavailable" };
  }

  return {
    ...state,
    primaryFactorId: plan.primaryFactorId,
    pendingPrimaryFactorCandidates: null,
    pendingPrimaryFactorQuestion: null,
    pendingStateDecisionCandidateId: null,
    resolvedPlan: plan,
    actionRoleProgress,
    practicedItemIds,
    phase: "action",
  };
}

export function createActionOnlySession(input: CreateActionOnlySessionInput): ActionOnlyState {
  return resolveDecisionsAndAdvance(emptyState(input));
}

export function chooseActionOnlyPrimaryFactor(state: ActionOnlyState, factorId: string): ActionOnlyState {
  if (state.phase !== "primary_choice") return state;
  if (state.pendingPrimaryFactorCandidates && !state.pendingPrimaryFactorCandidates.includes(factorId)) return state;
  return resolveDecisionsAndAdvance({ ...state, primaryFactorId: factorId, pendingPrimaryFactorCandidates: null, pendingPrimaryFactorQuestion: null });
}

export function answerActionOnlyStateDecision(state: ActionOnlyState, yes: boolean): ActionOnlyState {
  if (state.phase !== "state_decision") return state;
  return resolveDecisionsAndAdvance({ ...state, stateDecisionAnswer: yes, pendingStateDecisionCandidateId: null });
}

/** The one role currently awaiting confirmation, or null once every role this outcome needs has been confirmed. Mirrors arc/frozenCombinedActionRecovery.ts's own resolveNextUnconfirmedActionRole exactly, over the live (never-frozen) actionRoleProgress array. */
export function resolveCurrentActionOnlyRole(state: ActionOnlyState): ActionRoleProgress | null {
  if (state.phase !== "action") return null;
  return state.actionRoleProgress.find((entry) => !entry.completed) ?? null;
}

export function markActionOnlyActionReached(state: ActionOnlyState): ActionOnlyState {
  if (state.phase !== "action") return state;
  const role = resolveCurrentActionOnlyRole(state);
  if (!role) return state;
  const actionRoleProgress = state.actionRoleProgress.map((entry) => (entry.role === role.role ? { ...entry, reached: true } : entry));
  return { ...state, actionRoleProgress };
}

/**
 * The ONLY event that marks a real, factual completion -- idempotent.
 * Confirming one role in a two-role (state_then_factor) outcome chains
 * straight to the next unconfirmed role; terminalCompleted flips true
 * only once every role is confirmed. There is deliberately no
 * "skipActionOnlyActionCompleted" -- see this module's own header doc.
 */
export function confirmActionOnlyActionCompleted(state: ActionOnlyState): ActionOnlyState {
  if (state.phase !== "action") return state;
  const role = resolveCurrentActionOnlyRole(state);
  if (!role) return state; // idempotent -- already every role confirmed
  const actionRoleProgress = state.actionRoleProgress.map((entry) => (entry.role === role.role ? { ...entry, reached: true, completed: true } : entry));
  const outcome = state.resolvedPlan ? resolvePrimaryOutcome(state.resolvedPlan) : null;
  const allConfirmed = actionRoleProgress.every((entry) => entry.completed);
  return { ...state, actionRoleProgress, actionOutcomeKind: outcome?.kind ?? state.actionOutcomeKind, phase: allConfirmed ? "complete" : "action", terminalCompleted: allConfirmed };
}

function resolveSessionStateProfileId(state: ActionOnlyState): string | null {
  if (!state.resolvedPlan?.stateIncluded) return null;
  const inclusion = resolveStateInclusion(state.snapshot.config.stateInclusionPolicy, state.snapshot.config.stateProfileId);
  if (inclusion.kind === "linked") return inclusion.stateProfileId;
  if (inclusion.kind === "decide_in_live") return inclusion.candidateStateProfileId;
  return null;
}

function findActionRole(state: ActionOnlyState, role: "state" | "factor" | "shared") {
  return state.actionRoleProgress.find((entry) => entry.role === role) ?? null;
}

export function toActionOnlySessionFacts(state: ActionOnlyState): CombinedLiveSessionFacts {
  const practicedItems = state.snapshot.items.filter((item) => state.practicedItemIds.includes(item.id));
  const stateAction = findActionRole(state, "state");
  const factorAction = findActionRole(state, "factor");
  const sharedAction = findActionRole(state, "shared");

  return {
    sessionId: state.sessionId,
    routeConfigId: state.routeConfigId,
    mode: "action_only",
    cadence: "reactive",
    configuredItemIds: state.snapshot.config.interferenceItemIds,
    selectedItemIds: state.resolvedPlan ? state.resolvedPlan.factors.map((factor) => factor.itemId) : [],
    practicedItemIds: state.practicedItemIds,
    completedTypes: deriveCompletedInterferenceTypes(practicedItems),
    primaryFactorId: state.primaryFactorId,
    stateProfileId: resolveSessionStateProfileId(state),
    stateIncluded: state.resolvedPlan?.stateIncluded ?? false,
    stateInclusionDecision: state.stateDecisionAnswer,
    presenceSelectedForSession: false,
    presenceMode: null,
    reassessmentAnswer: null,
    factorRatingHistory: [],
    desiredStateRating: null,
    actionOutcomeKind: state.resolvedPlan ? (resolvePrimaryOutcome(state.resolvedPlan)?.kind ?? null) : state.actionOutcomeKind,
    stateActionReached: stateAction?.reached ?? false,
    stateActionCompleted: stateAction?.completed ?? false,
    factorActionReached: factorAction?.reached ?? false,
    factorActionCompleted: factorAction?.completed ?? false,
    sharedActionCompleted: sharedAction?.completed ?? false,
    beneficialActionPolicy: state.snapshot.config.beneficialActionPolicy,
    stateActionSkipped: false,
    factorActionSkipped: false,
    sharedActionSkipped: false,
    terminalCompleted: state.terminalCompleted,
    stageAtStart: state.stageAtStart,
  };
}
