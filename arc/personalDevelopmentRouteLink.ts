/**
 * arc/personalDevelopmentRouteLink.ts
 *
 * Adaptive ARC architecture task (unified PD/ARC Goal), stage-based entry
 * task, correction round 3: Stage 3's own real, route-specific ARC Link
 * rehearsal -- sourced from the route's StateProfile and EVERY selected
 * interference item, in plain BUILD order. `primaryFactorId` is resolved
 * through the exact same shared-selection contract Full/Mini already use
 * (arc/combinedFactorPlan.ts's own "needs_primary_factor" -- required
 * only when more than one factor is selected, since the ACTION queue
 * still needs one resolved factor to key off, see
 * arc/combinedFactorPlan.ts's own resolveCombinedActionKinds doc), but
 * that designation is used ONLY to resolve the FACTOR-SIDE action -- it
 * never removes any other selected factor's own compact cue, and never
 * adds an extra, unrelated action for a secondary factor (the shared
 * action-role resolver below still only ever surfaces the primary
 * factor's -- or, State-only, the State's own -- resolved outcome,
 * exactly like Full/Mini; a secondary factor's own action, if it even has
 * one configured, is never separately rendered or recorded). There is no
 * approved product rule limiting Route Link to one factor; if that is
 * ever wanted, it must be its own explicit LIVE selection, never a silent
 * narrowing of "primary" into "only."
 *
 * Structural mirror of arc/combinedFullPlan.ts's own corrected method
 * order (Adaptive ARC architecture task, unified PD/ARC Goal,
 * method-completion correction), extended per correction round 3's own
 * "Acceptance -> neutral Regulation -> Encoding -> Action" requirement and
 * correction round 4's own "Recognition before Acceptance" requirement --
 * reusing the EXACT SAME content resolvers
 * (arc/combinedFactorPlanCopy.ts's getRecognitionStepCopy/
 * getAcceptanceStepCopy/getNeutralRegulationCueCopy/
 * getStateRegulationAnchorCopy/getStateDesiredStateEncodingCopy/
 * getFactorProcessingStepCopy) rather than inventing a second, divergent
 * set of method content:
 *   1. Recognition, per-factor -- one compact, purely observational cue
 *      per SELECTED factor, BUILD order (plan.factors, never re-grouped
 *      by category), first in the spine (getRecognitionStepCopy: a fixed
 *      "notice X" framing line plus the item's own trigger/context/
 *      description text when configured -- so a configured trigger/context
 *      cue is folded into this same step, never a separate one). Never
 *      asks the trainee to evoke, intensify, recreate, or hold the
 *      disturbance -- "notice what is already present," exactly like
 *      Full's own Awareness/recognition step, and verified against
 *      arc/instructions.ts's containsInductionPattern by this module's
 *      own tests. Genuinely separate from step 7's Encoding cue -- this
 *      module previously (correction rounds 1-3) folded recognition
 *      framing into the SAME step as the replacement content; that
 *      compacting merge is now undone per correction round 4.
 *   2. Urge preventive stopping, one per urge factor with
 *      preventiveStoppingRelevant, BUILD order (mirrors Full's own
 *      earliest placement -- interrupting the urge from acting is a
 *      distinct, urgent beat, never folded into Recognition or the later
 *      Encoding cue).
 *   3. Acceptance (once, shared) -- names the disturbing factor(s)
 *      generically alongside the neutral anchor (getAcceptanceStepCopy);
 *      never asks the trainee to evoke or intensify the disturbance,
 *      exactly like Full/Mini's own Acceptance.
 *   4. Neutral Regulation (once, shared) -- ALWAYS present whenever there
 *      is a disturbing factor to accept (same gate as Acceptance itself),
 *      regardless of whether State participates (getNeutralRegulationCueCopy):
 *      gradually directing more attention to the neutral anchor, using
 *      natural breathing/stable posture to strengthen ordinary stability,
 *      never requiring relief or a positive feeling. Deliberately its own
 *      step kind ("neutral_regulation"), never a reuse of
 *      "state_regulation_anchor"'s name or content -- that one stays
 *      genuinely State-specific (StateProfile's own configured fields)
 *      and conditional on stateIncluded, see step 5.
 *   5. State creation/encoding (once each, shared, ONLY when State
 *      participates) -- "state_regulation_anchor"
 *      (getStateRegulationAnchorCopy, the State's own configured
 *      regulation content) then "state_desired_state_encoding"
 *      (getStateDesiredStateEncodingCopy, the desired positive
 *      sensation). A no-State route omits both entirely -- it already
 *      received its universal neutral Regulation cue at step 4, never a
 *      fabricated State cue in its place.
 *   6. Encoding, per-factor -- one compact cue per SELECTED factor, BUILD
 *      order (plan.factors, never re-grouped by category) -- the factor's
 *      own replacement thought, supportive belief, or alternative
 *      movement/sensory encoding ALONE (getFactorProcessingStepCopy) --
 *      no recognition framing here any more (see step 1 above; the
 *      screen renders this step's own category label as its title
 *      instead, mirroring Full's own "processing" step exactly).
 *   7. The real resolved action role(s) -- resolveCombinedActionKinds/
 *      resolvePrimaryOutcome/buildActionRoleProgress (arc/combinedLiveSession.ts),
 *      the SAME shared action-role resolver Full/Mini/Action Only all
 *      use, keyed off the resolved PRIMARY factor (or, State-only, State
 *      itself) alone -- never a text-equality inference: factor_only ->
 *      one factor-action role; state_only/legacy_shared_state_fallback ->
 *      one state-action role; shared_explicit -> one role, executed once
 *      (never twice for one action, regardless of whether the two
 *      configured action fields happen to hold identical text -- the
 *      explicit ActionRelationship field alone decides); state_then_factor
 *      -> two roles in that exact order, each with its own timer/restart-
 *      recovery/explicit confirmation, chained. "unavailable" is caught
 *      upstream, by resolveCombinedFactorPlan itself (returns kind
 *      "invalid" before this module ever builds a step list), so Route
 *      Link never invents Beneficial Action content for it.
 *   8. Terminal boundary -- the screen's own completion renderer
 *      (live/PersonalDevelopmentRouteLinkScreen.tsx's RouteLinkCompletionScreen)
 *      shows a short, non-interactive success reinforcement/gratitude
 *      line once every required action role is confirmed, immediately
 *      before the one route-progress write -- see that screen's own doc
 *      for the exact guarantees (never after timer expiry alone, never a
 *      second completion record, restart-safe).
 *
 * Deliberately compacted relative to Full: no Stay, no rating checkpoints,
 * no cognitive reassessment, no Presence, no Goal Connection (Full's own
 * Goal Connection step is reserved for Full alone, per
 * arc/combinedFullPlan.ts's own header doc -- "Full-only... this
 * insertion is scoped to Full, never silently extended to Mini," and
 * Route Link has no approved compact Goal-Connection field of its own to
 * repeat it from; Full's own placement is completely untouched by this
 * module). Never a replay of Full's or Mini's own exact step shape --
 * this module has its own, shorter spine, built from the same proven
 * content resolvers.
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

export type RouteLinkStepKind =
  | "factor_recognition"
  | "urge_preventive_stopping"
  | "acceptance"
  | "neutral_regulation"
  | "state_regulation_anchor"
  | "state_desired_state_encoding"
  | "factor_replacement_cue"
  | "state_action"
  | "factor_action"
  | "terminal_boundary";

export interface RouteLinkStep {
  kind: RouteLinkStepKind;
  /** Set for "factor_recognition", "urge_preventive_stopping" and "factor_replacement_cue" -- the ONE factor that step concerns. null for every session-level step. */
  itemId: string | null;
  category: InterferenceCategory | null;
}

function factorStep(kind: RouteLinkStepKind, itemId: string, category: InterferenceCategory): RouteLinkStep {
  return { kind, itemId, category };
}

function sessionStep(kind: RouteLinkStepKind): RouteLinkStep {
  return { kind, itemId: null, category: null };
}

/**
 * The full, ordered Stage 3 rehearsal spine -- see this module's own
 * header doc for the exact method-order rationale. Every selected factor
 * (`plan.factors`, already BUILD/config.interferenceItemIds order -- see
 * arc/combinedFactorPlan.ts's own resolveCombinedFactorPlan) gets its own
 * compact Recognition cue AND its own compact Encoding cue; `plan.primaryFactorId`
 * is consulted only by resolveCombinedActionKinds below, never to drop a
 * factor from this spine.
 *
 * Correction round 4: Recognition must occur BEFORE Acceptance, not folded
 * into the post-Regulation Encoding step -- "factor_recognition" is now its
 * own step kind, one per selected factor in plain BUILD order, placed
 * first (even before urge_preventive_stopping, since noticing the urge is
 * itself part of recognizing it). "factor_replacement_cue" is now
 * Encoding-ONLY content (see live/PersonalDevelopmentRouteLinkScreen.tsx's
 * own rendering, which used to fold recognition.framing into that step's
 * title and no longer does).
 */
export function buildRouteLinkSteps(plan: ResolvedCombinedFactorPlan, beneficialActionPolicy: BeneficialActionPolicy): RouteLinkStep[] {
  const steps: RouteLinkStep[] = [];
  const hasFactors = plan.factors.length > 0;
  const byCategory = (category: InterferenceCategory) => plan.factors.filter((factor) => factor.category === category);

  for (const factor of plan.factors) steps.push(factorStep("factor_recognition", factor.itemId, factor.category));

  for (const factor of byCategory("urge")) {
    if (factor.preventiveStoppingRelevant) steps.push(factorStep("urge_preventive_stopping", factor.itemId, factor.category));
  }

  if (hasFactors) {
    steps.push(sessionStep("acceptance"));
    // Correction round 3: the universal, State-INDEPENDENT Regulation cue
    // -- "applies according to the selected disturbing factor whether or
    // not ARC State is included" (latest method correction). Always
    // present whenever there is a disturbing factor to accept (same gate
    // as Acceptance itself), never conditional on plan.stateIncluded --
    // that is what makes it genuinely distinct from "state_regulation_anchor"
    // below, which stays fully State-specific and conditional.
    steps.push(sessionStep("neutral_regulation"));
  }

  if (plan.stateIncluded) {
    steps.push(sessionStep("state_regulation_anchor"));
    steps.push(sessionStep("state_desired_state_encoding"));
  }

  for (const factor of plan.factors) steps.push(factorStep("factor_replacement_cue", factor.itemId, factor.category));

  if (beneficialActionPolicy !== "none") {
    for (const actionKind of resolveCombinedActionKinds(plan)) steps.push(sessionStep(actionKind));
  }

  steps.push(sessionStep("terminal_boundary"));
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
  // Correction round 2: EVERY selected/resolved factor is genuinely cued
  // (see buildRouteLinkSteps above), so every one of them counts as
  // practiced -- matching Full/Mini's own practicedItemIdsForPlan exactly,
  // never just the resolved primary factor.
  const practicedItemIds = plan.factors.map((factor) => factor.itemId);

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

/** Generic advance for every non-action step ("factor_recognition", "urge_preventive_stopping", "acceptance", "neutral_regulation", "state_regulation_anchor", "state_desired_state_encoding", "factor_replacement_cue"). A no-op on an action step or once already complete. */
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
