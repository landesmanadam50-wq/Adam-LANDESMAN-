/**
 * arc/personalDevelopmentRouteLink.ts
 *
 * Adaptive ARC architecture task (unified PD/ARC Goal), stage-based entry
 * task: Stage 3's own real, route-specific ARC Link rehearsal -- sourced
 * from the route's StateProfile and selected interference items, per the
 * approved design decision. Deliberately NOT a relabeled
 * arc/combinedMiniPlan.ts: Mini practices EVERY selected factor (its own
 * "secondary interventions remain" guarantee) with a full recognition +
 * factor-intervention pass per factor, plus optional Presence; this
 * module rehearses ONLY the session's resolved PRIMARY factor -- a short,
 * focused review immediately before the real Beneficial Action, never a
 * second full pass over every configured factor. That is the one
 * deliberate structural difference from Mini/Full this module encodes,
 * flagged here rather than left implicit.
 *
 * Reuses arc/combinedFactorPlan.ts's resolveCombinedFactorPlan verbatim
 * for primary-factor/State-decision resolution and action-outcome
 * resolution (the SAME two LIVE-time decisions Full/Mini already resolve
 * through it -- never a second, divergent resolver), and
 * arc/combinedLiveSession.ts's own resolvePrimaryOutcome/
 * buildActionRoleProgress for the real action role(s) -- the SAME real,
 * timed, explicitly confirmed Beneficial Action Full/Mini's own "steps"
 * phase culminates in, never a separate "Link action." Recognition/State
 * copy is resolved through the SAME arc/combinedFactorPlanCopy.ts
 * functions Full/Mini already use (getRecognitionStepCopy,
 * getStateRegulationAnchorCopy, getStateDesiredStateEncodingCopy) --
 * reusing existing Link-adjacent content patterns while keeping the
 * combined route's own PersonalDevelopmentRouteConfig data model, per the
 * approved decision ("do not relabel Mini ARC as Link... reuse existing
 * Link patterns where they fit").
 *
 * Structurally excludes Presence entirely (no presence_intervention/
 * embedded/full Presence step of any kind) and never offers a skip
 * control for its action step(s) -- Route Link's real action always
 * requires isRequiredActionOutcomeValidForMode's own "required_completed"
 * or "optional_completed" outcome to count toward Stage 3 advancement
 * (arc/personalDevelopmentRouteProgress.ts), and a skippable action could
 * never satisfy that. A route capped at Stage 2 by beneficialActionPolicy
 * "none" (arc/personalDevelopmentRouteConfig.ts) never reaches this
 * module in practice (Stage 3 is never offered to it), but this module
 * still defensively honors that policy the same way Mini/Full do (an
 * empty action-role list), rather than assuming its caller already
 * filtered it out.
 *
 * Pure logic only -- no storage import, no data/ import, no React. See
 * live/PersonalDevelopmentRouteLinkScreen.tsx for the LIVE screen that
 * renders this session and handles the real wall-clock timer + restart
 * recovery (reusing arc/frozenCombinedActionRecovery.ts's existing
 * snapshot machinery, unmodified).
 */

import type { InterferenceCategory, InterferenceItem } from "./interferenceItem.ts";
import type { PersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import type { StateProfile } from "./stateProfile.ts";
import type { PresenceArc } from "./types.ts";
import type { CombinedFactorPlanInvalidReason, ResolvedCombinedFactorPlan } from "./combinedFactorPlan.ts";
import { resolveCombinedActionKinds, resolveCombinedFactorPlan } from "./combinedFactorPlan.ts";
import { buildActionRoleProgress, resolvePrimaryOutcome } from "./combinedLiveSession.ts";
import type { ActionRoleProgress } from "./combinedLiveSession.ts";
import type { ActionResolutionOutcome } from "./factorAction.ts";
import type { BeneficialActionPolicy } from "./personalDevelopmentRouteConfig.ts";
import type { CombinedLiveSessionFacts } from "./combinedLiveSessionFacts.ts";
import { deriveCompletedInterferenceTypes } from "./combinedRoute.ts";
import { resolveStateInclusion } from "./stateInclusion.ts";
import type { PersonalDevelopmentRouteStage } from "./personalDevelopmentRouteProgress.ts";
import { generateTimerRunId } from "./actionTimer.ts";

// ---------------------------------------------------------------------------
// Step spine
// ---------------------------------------------------------------------------

export type RouteLinkStepKind = "link_recognition" | "state_regulation_anchor" | "state_desired_state_encoding" | "state_action" | "factor_action" | "terminal_boundary";

export interface RouteLinkStep {
  kind: RouteLinkStepKind;
  /** Only set for "link_recognition" -- the session's own resolved primary factor. null for every session-level step. */
  itemId: string | null;
  category: InterferenceCategory | null;
}

/**
 * The full, ordered Stage 3 rehearsal spine: one recognition step for the
 * primary factor only (when one exists -- null for a Presence-only route,
 * which this module does not support at all, see this module's own
 * header doc), the State regulation-anchor/desired-state-encoding pair
 * when State participates (same pairing Mini uses, no checkpoint or
 * rating between them), the real resolved action role(s)
 * (resolveCombinedActionKinds, omitted entirely under beneficialActionPolicy
 * "none"), then the neutral terminal boundary.
 */
export function buildRouteLinkSteps(plan: ResolvedCombinedFactorPlan, beneficialActionPolicy: BeneficialActionPolicy): RouteLinkStep[] {
  const steps: RouteLinkStep[] = [];

  if (plan.primaryFactorId) {
    const primary = plan.factors.find((factor) => factor.itemId === plan.primaryFactorId);
    if (primary) steps.push({ kind: "link_recognition", itemId: primary.itemId, category: primary.category });
  }

  if (plan.stateIncluded) {
    steps.push({ kind: "state_regulation_anchor", itemId: null, category: null });
    steps.push({ kind: "state_desired_state_encoding", itemId: null, category: null });
  }

  if (beneficialActionPolicy !== "none") {
    for (const actionKind of resolveCombinedActionKinds(plan)) steps.push({ kind: actionKind, itemId: null, category: null });
  }

  steps.push({ kind: "terminal_boundary", itemId: null, category: null });
  return steps;
}

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

export interface RouteLinkSnapshot {
  config: PersonalDevelopmentRouteConfig;
  items: InterferenceItem[];
  stateProfiles: StateProfile[];
  presenceArcs: PresenceArc[];
  startedAt: string;
}

export interface CreateRouteLinkSessionInput {
  config: PersonalDevelopmentRouteConfig;
  items: InterferenceItem[];
  stateProfiles: StateProfile[];
  presenceArcs: PresenceArc[];
  startedAt: string;
  /** See arc/combinedLiveSession.ts's own CreateCombinedLiveSessionInput.stageAtStart doc -- frozen once, read only by toRouteLinkSessionFacts. */
  stageAtStart: PersonalDevelopmentRouteStage;
  generateSessionId?: () => string;
}

export type RouteLinkPhase = "invalid" | "primary_choice" | "state_decision" | "steps" | "complete";

export interface RouteLinkState {
  sessionId: string;
  routeConfigId: string;
  mode: "route_link";
  cadence: "reactive";
  snapshot: RouteLinkSnapshot;
  stageAtStart: PersonalDevelopmentRouteStage;
  phase: RouteLinkPhase;
  invalidReason: CombinedFactorPlanInvalidReason | null;
  primaryFactorId: string | null;
  pendingPrimaryFactorCandidates: string[] | null;
  pendingPrimaryFactorQuestion: string | null;
  stateDecisionAnswer: boolean | null;
  pendingStateDecisionCandidateId: string | null;
  resolvedPlan: ResolvedCombinedFactorPlan | null;
  remainingSteps: RouteLinkStep[];
  stepIndex: number;
  actionRoleProgress: ActionRoleProgress[];
  actionOutcomeKind: ActionResolutionOutcome["kind"] | null;
  practicedItemIds: string[];
  terminalCompleted: boolean;
}

function emptyState(input: CreateRouteLinkSessionInput): RouteLinkState {
  return {
    sessionId: (input.generateSessionId ?? generateTimerRunId)(),
    routeConfigId: input.config.id,
    mode: "route_link",
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
    remainingSteps: [],
    stepIndex: 0,
    actionRoleProgress: [],
    actionOutcomeKind: null,
    practicedItemIds: [],
    terminalCompleted: false,
  };
}

function resolvePlan(state: RouteLinkState): ReturnType<typeof resolveCombinedFactorPlan> {
  return resolveCombinedFactorPlan({
    mode: "route_link",
    config: state.snapshot.config,
    items: state.snapshot.items,
    stateProfiles: state.snapshot.stateProfiles,
    presenceArcs: state.snapshot.presenceArcs,
    primaryFactorId: state.primaryFactorId,
    stateDecisionAnswer: state.stateDecisionAnswer,
  });
}

function resolveDecisionsAndAdvance(state: RouteLinkState): RouteLinkState {
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
  const steps = buildRouteLinkSteps(plan, beneficialActionPolicy);
  const actionRoleProgress = buildActionRoleProgress(plan, beneficialActionPolicy);
  // Deliberately only the resolved primary factor -- see this module's own header doc.
  const practicedItemIds = plan.primaryFactorId ? [plan.primaryFactorId] : [];

  return {
    ...state,
    primaryFactorId: plan.primaryFactorId,
    pendingPrimaryFactorCandidates: null,
    pendingPrimaryFactorQuestion: null,
    pendingStateDecisionCandidateId: null,
    resolvedPlan: plan,
    remainingSteps: steps,
    stepIndex: 0,
    actionRoleProgress,
    practicedItemIds,
    phase: "steps",
  };
}

export function createRouteLinkSession(input: CreateRouteLinkSessionInput): RouteLinkState {
  const state = emptyState(input);
  return resolveDecisionsAndAdvance(state);
}

export function chooseRouteLinkPrimaryFactor(state: RouteLinkState, factorId: string): RouteLinkState {
  if (state.phase !== "primary_choice") return state;
  if (state.pendingPrimaryFactorCandidates && !state.pendingPrimaryFactorCandidates.includes(factorId)) return state;
  return resolveDecisionsAndAdvance({ ...state, primaryFactorId: factorId, pendingPrimaryFactorCandidates: null, pendingPrimaryFactorQuestion: null });
}

export function answerRouteLinkStateDecision(state: RouteLinkState, yes: boolean): RouteLinkState {
  if (state.phase !== "state_decision") return state;
  return resolveDecisionsAndAdvance({ ...state, stateDecisionAnswer: yes, pendingStateDecisionCandidateId: null });
}

function currentStep(state: RouteLinkState): RouteLinkStep | null {
  return state.remainingSteps[state.stepIndex] ?? null;
}

/** Resolves which actionRoleProgress entry the current "state_action"/"factor_action" step corresponds to -- identical rule to arc/combinedLiveSession.ts's own resolveActionRoleIndexForStep (state_then_factor: two entries, state first; every other outcome kind: exactly one entry regardless of the step-kind label). */
function resolveActionRoleIndexForStep(state: RouteLinkState, stepKind: "state_action" | "factor_action"): number {
  if (state.actionRoleProgress.length === 2) return stepKind === "state_action" ? 0 : 1;
  return state.actionRoleProgress.length === 1 ? 0 : -1;
}

/** Generic advance for every non-action step ("link_recognition", "state_regulation_anchor", "state_desired_state_encoding"). A no-op on an action step or once already complete. */
export function advanceRouteLinkStep(state: RouteLinkState): RouteLinkState {
  if (state.phase !== "steps") return state;
  const step = currentStep(state);
  if (!step || step.kind === "state_action" || step.kind === "factor_action") return state;
  return advanceStepCursor(state);
}

/** Mirrors arc/combinedLiveSession.ts's own markActionReached -- marks "reached" only, never "completed". */
export function markRouteLinkActionReached(state: RouteLinkState): RouteLinkState {
  if (state.phase !== "steps") return state;
  const step = currentStep(state);
  if (!step || (step.kind !== "state_action" && step.kind !== "factor_action")) return state;
  const index = resolveActionRoleIndexForStep(state, step.kind);
  if (index === -1) return state;
  const actionRoleProgress = state.actionRoleProgress.map((entry, i) => (i === index ? { ...entry, reached: true } : entry));
  return { ...state, actionRoleProgress };
}

/**
 * The ONLY event that marks a real, factual completion for Route Link's
 * action -- idempotent, mirrors arc/combinedLiveSession.ts's own
 * confirmActionCompleted exactly. There is deliberately no
 * "skipRouteLinkActionCompleted" counterpart in this module -- Route Link
 * never offers a skip control (see this module's own header doc); the
 * screen must never wire one.
 */
export function confirmRouteLinkActionCompleted(state: RouteLinkState): RouteLinkState {
  if (state.phase !== "steps") return state;
  const step = currentStep(state);
  if (!step || (step.kind !== "state_action" && step.kind !== "factor_action")) return state;
  const index = resolveActionRoleIndexForStep(state, step.kind);
  if (index === -1) return state;
  if (state.actionRoleProgress[index].completed) return state; // idempotent
  const actionRoleProgress = state.actionRoleProgress.map((entry, i) => (i === index ? { ...entry, reached: true, completed: true } : entry));
  const outcome = state.resolvedPlan ? resolvePrimaryOutcome(state.resolvedPlan) : null;
  return advanceStepCursor({ ...state, actionRoleProgress, actionOutcomeKind: outcome?.kind ?? state.actionOutcomeKind });
}

function advanceStepCursor(state: RouteLinkState): RouteLinkState {
  const nextIndex = state.stepIndex + 1;
  if (nextIndex >= state.remainingSteps.length || state.remainingSteps[nextIndex]?.kind === "terminal_boundary") {
    return { ...state, stepIndex: nextIndex, phase: "complete", terminalCompleted: true };
  }
  return { ...state, stepIndex: nextIndex };
}

// ---------------------------------------------------------------------------
// Facts projection -- reuses the SAME CombinedLiveSessionFacts shape Full/
// Mini/Action Only all share, so data/personalDevelopmentRouteProgressPersistence.ts's
// recordCombinedSessionCompletion needs no mode-specific branch.
// ---------------------------------------------------------------------------

function resolveSessionStateProfileId(state: RouteLinkState): string | null {
  if (!state.resolvedPlan?.stateIncluded) return null;
  const inclusion = resolveStateInclusion(state.snapshot.config.stateInclusionPolicy, state.snapshot.config.stateProfileId);
  if (inclusion.kind === "linked") return inclusion.stateProfileId;
  if (inclusion.kind === "decide_in_live") return inclusion.candidateStateProfileId;
  return null;
}

function findActionRole(state: RouteLinkState, role: "state" | "factor" | "shared") {
  return state.actionRoleProgress.find((entry) => entry.role === role) ?? null;
}

export function toRouteLinkSessionFacts(state: RouteLinkState): CombinedLiveSessionFacts {
  const practicedItems = state.snapshot.items.filter((item) => state.practicedItemIds.includes(item.id));
  const stateAction = findActionRole(state, "state");
  const factorAction = findActionRole(state, "factor");
  const sharedAction = findActionRole(state, "shared");

  return {
    sessionId: state.sessionId,
    routeConfigId: state.routeConfigId,
    mode: "route_link",
    cadence: "reactive",
    configuredItemIds: state.snapshot.config.interferenceItemIds,
    selectedItemIds: state.resolvedPlan ? state.resolvedPlan.factors.map((factor) => factor.itemId) : [],
    practicedItemIds: state.practicedItemIds,
    completedTypes: deriveCompletedInterferenceTypes(practicedItems),
    primaryFactorId: state.primaryFactorId,
    stateProfileId: resolveSessionStateProfileId(state),
    stateIncluded: state.resolvedPlan?.stateIncluded ?? false,
    stateInclusionDecision: state.stateDecisionAnswer,
    // Route Link never includes Presence (see this module's own header doc).
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
    // Route Link never offers a skip control -- these are always false.
    stateActionSkipped: false,
    factorActionSkipped: false,
    sharedActionSkipped: false,
    terminalCompleted: state.terminalCompleted,
    stageAtStart: state.stageAtStart,
  };
}
