/**
 * arc/combinedLiveSession.ts
 *
 * Adaptive ARC architecture task, Phase 14B-4: the pure session controller
 * for reactive combined Personal Development LIVE practice (Full and
 * Mini), driving the merged Phase 14B-3 semantic planner
 * (arc/combinedFactorPlan.ts / arc/combinedFullPlan.ts /
 * arc/combinedMiniPlan.ts). Rewritten from scratch -- WIP commit
 * 60d70d7's own arc/combinedLiveSession.ts is REJECTED wholesale (broken
 * import, and its rating model hardcodes an unconditional, always-present
 * State "afterRegulation" checkpoint -- structurally incompatible with
 * the merged planner's optional, State-aware three-checkpoint model).
 * Only its layering discipline is carried forward: full-Presence nested-
 * session advancement (arc/arcEngine.ts's own ArcStage/ArcLiveState
 * machinery, driven via live/liveEventAdapter.ts) stays owned by the
 * SCREEN, never this module -- arc/ never imports from live/. This module
 * owns only the decision boundary around it (see completeFullPresence
 * below).
 *
 * Never assumes: a State is always present (stateIncluded is a real,
 * per-route fact); there is always exactly one action (0-2 action steps,
 * per ActionResolutionOutcome); Full and Mini share the same steps (they
 * are two structurally different step unions); three factor checkpoints
 * always exist (a no-State route has exactly two); the plan is fully
 * resolved before any decision (see the staged flow below); or that
 * StateProfile.id is the session's identity (PersonalDevelopmentRouteConfig.id
 * is -- see CombinedLiveSessionState.routeConfigId).
 *
 * Session id: reuses arc/actionTimer.ts's generateTimerRunId() verbatim
 * (same "not cryptographically unique, session-scale" guarantee
 * arc/liveSessionCoordinator.ts already established for the same need),
 * minted exactly once in createCombinedLiveSession and never reminted by
 * any event function below.
 *
 * --- The staged Full flow (why buildFullAwarenessSteps exists) ---
 *
 * arc/combinedFactorPlan.ts's own resolveCombinedFactorPlan cannot
 * produce a ResolvedCombinedFactorPlan for a multi-factor Full route
 * until a primaryFactorId is supplied -- but Full's own primary factor
 * is only resolvable from REAL afterAwareness ratings (arc/factorRating.ts's
 * resolveBaselinePrimaryFactor), which in turn requires rendering
 * Awareness recognition first. This controller therefore renders
 * arc/combinedFullPlan.ts's own buildFullAwarenessSteps(context) --
 * built from the UnresolvedCombinedFactorContext resolveCombinedFactorPlan
 * already returns on its "needs_primary_factor"/"needs_state_decision"
 * results (or, for the single-factor/zero-factor auto-resolved case,
 * derived identically from the already-"resolved" plan's own
 * {factors, presence}) -- EXACTLY ONCE, collects every required
 * afterAwareness rating, resolves the primary factor (asking the exact
 * required tie question immediately when tied), and only THEN calls
 * arc/combinedFullPlan.ts's own buildFullStepsAfterPrimaryResolution for
 * the remainder. No index arithmetic, no re-deriving/skipping an assumed
 * prefix: the two halves are rendered by two completely separate code
 * paths that never overlap in step kind.
 *
 * --- Full's own Presence gate (why presenceGateIndex exists) ---
 *
 * buildFullStepsAfterPrimaryResolution(plan, finalPresenceMode) needs
 * finalPresenceMode (arc/combinedRoute.ts's own resolveFinalPresenceMode)
 * to know whether to include a "presence" step at all -- but
 * finalPresenceMode itself depends on the cognitive_reassessment step's
 * own answer, which is ONE OF THE STEPS buildFullStepsAfterPrimaryResolution
 * itself produces. This controller resolves this the same way it resolves
 * the Awareness/primary-factor circularity, but even more narrowly: it
 * calls buildFullStepsAfterPrimaryResolution(plan, "skipped") exactly
 * ONCE, right when the plan resolves -- "skipped" only ever changes
 * whether ONE step ("presence") is present; it changes nothing else in
 * that function's own output, so this "spine" is stable and final for
 * every step around it. presenceGateIndex is then computed directly from
 * the spine's own real content (the first index whose kind is
 * "state_desired_state_encoding"/"state_action"/"factor_action"/
 * "terminal_boundary" -- i.e. the exact position a real "presence" step
 * would occupy) -- never a hardcoded/guessed count, so it self-corrects
 * against any future reordering of the steps before it. When the
 * controller's step cursor is about to cross that index and presenceMode
 * has not yet been resolved, it surfaces phase "presence_decision"
 * (Emotion/Urge-only or "full_required"/"full_optional" routes resolve
 * this immediately from cognitiveWorkSelected/reassessmentAnswer, per
 * arc/combinedRoute.ts's own resolvePresenceRoute) instead of advancing;
 * once resolved, either zero or one extra Presence stage renders (phase
 * "presence_embedded" or "presence_full_active"), and the cursor then
 * continues through the SAME unmodified spine -- the spine array itself
 * is never rebuilt or mutated.
 *
 * Mini needs none of this: arc/combinedMiniPlan.ts's own
 * buildMiniCombinedSteps already includes or omits its compact
 * "presence_intervention" step unconditionally from `plan.presence`
 * alone (no reassessment concept exists for Mini at all), so Mini's own
 * "steps" phase is a single, ungated linear walk.
 */

import type { InterferenceItem } from "./interferenceItem.ts";
import type { PersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import type { StateProfile } from "./stateProfile.ts";
import type { PresenceArc } from "./types.ts";
import { resolveCombinedFactorPlan, resolveCombinedActionKinds, MINI_PRIMARY_FACTOR_QUESTION, STATE_DECISION_QUESTION } from "./combinedFactorPlan.ts";
import type { CombinedFactorMode, CombinedFactorPlanInvalidReason, ResolvedCombinedFactorPlan, UnresolvedCombinedFactorContext } from "./combinedFactorPlan.ts";
import { buildFullAwarenessSteps, buildFullStepsAfterPrimaryResolution } from "./combinedFullPlan.ts";
import type { FullCombinedStep } from "./combinedFullPlan.ts";
import { buildMiniCombinedSteps } from "./combinedMiniPlan.ts";
import type { MiniCombinedStep } from "./combinedMiniPlan.ts";
import {
  BASELINE_TIE_QUESTION,
  createFactorRating,
  isCheckpointComplete,
  resolveBaselinePrimaryFactor,
  resolveNextUnratedFactor,
  resolveRateableFactors,
} from "./factorRating.ts";
import type { FactorRating, FactorType, RatingCheckpoint, RateableFactor } from "./factorRating.ts";
import { resolvePresenceRoute, resolveFinalPresenceMode } from "./combinedRoute.ts";
import type { FinalPresenceMode, PresenceRouteDecision } from "./combinedRoute.ts";
import { getFirstEmbeddedPresenceStage, getNextEmbeddedPresenceStage, isEmbeddedPresenceComplete } from "./embeddedPresence.ts";
import type { EmbeddedPresenceStage } from "./embeddedPresence.ts";
import type { ActionResolutionOutcome } from "./factorAction.ts";
import {
  createEmptyPostActionCompletionState,
  getFirstMiniPostActionCompletionStage,
  getFirstPostActionCompletionStage,
  getNextMiniPostActionCompletionStage,
  getNextPostActionCompletionStage,
} from "./postActionCompletion.ts";
import type { MiniPostActionCompletionStage, PostActionCompletionStage, PostActionCompletionState } from "./postActionCompletion.ts";
import { generateTimerRunId } from "./actionTimer.ts";

/**
 * The three combined-action timer identities (data/storage.ts's own
 * TimerType is a superset that includes these exact three string
 * literals plus every pre-existing timer type) -- declared locally
 * rather than imported, since arc/ never imports from data/ (the one
 * documented exception, arc/liveSessionCoordinator.ts, is deliberately
 * not extended here). A screen passing one of these three values into
 * live/screens.tsx's ActionScreen (whose own `timerType` prop is typed
 * against the real, wider TimerType) type-checks without any cast --
 * TypeScript accepts a narrower string-literal union wherever a superset
 * is expected.
 */
export type CombinedActionTimerType = "combinedStateAction" | "combinedFactorAction" | "combinedSharedAction";

// ---------------------------------------------------------------------------
// Snapshot -- loaded once by the screen, frozen for the whole session.
// ---------------------------------------------------------------------------

export interface CombinedLiveSessionSnapshot {
  config: PersonalDevelopmentRouteConfig;
  items: InterferenceItem[];
  stateProfiles: StateProfile[];
  presenceArcs: PresenceArc[];
  startedAt: string;
}

export interface CreateCombinedLiveSessionInput {
  mode: CombinedFactorMode;
  config: PersonalDevelopmentRouteConfig;
  items: InterferenceItem[];
  stateProfiles: StateProfile[];
  presenceArcs: PresenceArc[];
  startedAt: string;
  /** Injectable purely for deterministic tests -- production callers omit it (defaults to generateTimerRunId, the same "not cryptographically unique, session-scale" id every other LIVE session in this codebase already uses). */
  generateSessionId?: () => string;
}

// ---------------------------------------------------------------------------
// Phase
// ---------------------------------------------------------------------------

export type CombinedLiveSessionPhase =
  | "invalid"
  | "awareness"
  | "primary_choice"
  | "state_decision"
  | "steps"
  | "presence_decision"
  | "presence_optional_offer"
  | "presence_embedded"
  | "presence_full_active"
  | "tail"
  | "complete";

export type ActionRole = "state" | "factor" | "shared";

export interface ActionRoleProgress {
  role: ActionRole;
  action: string;
  timerType: CombinedActionTimerType;
  reached: boolean;
  completed: boolean;
}

export interface CombinedLiveSessionState {
  sessionId: string;
  routeConfigId: string;
  mode: CombinedFactorMode;
  cadence: "reactive";
  snapshot: CombinedLiveSessionSnapshot;
  phase: CombinedLiveSessionPhase;
  invalidReason: CombinedFactorPlanInvalidReason | null;

  // Awareness (Full only -- always [] for Mini)
  awarenessSteps: FullCombinedStep[];
  awarenessIndex: number;
  awarenessContext: UnresolvedCombinedFactorContext | null;

  // Primary factor
  primaryFactorId: string | null;
  pendingPrimaryFactorCandidates: string[] | null;
  pendingPrimaryFactorQuestion: string | null;

  // State decision
  stateDecisionAnswer: boolean | null;
  pendingStateDecisionCandidateId: string | null;

  // Resolved plan + the frozen remaining-steps spine
  resolvedPlan: ResolvedCombinedFactorPlan | null;
  remainingSteps: (FullCombinedStep | MiniCombinedStep)[];
  /** Full only -- see this module's own header doc. null for Mini (no gate) and before the plan resolves. */
  presenceGateIndex: number | null;
  stepIndex: number;

  // Ratings
  factorRatingHistory: FactorRating[];
  desiredStateRating: number | null;

  // Cognitive reassessment (Full only)
  reassessmentAnswer: "not_stuck" | "still_stuck" | null;

  // Presence
  presenceSelectedForSession: boolean;
  presenceRouteDecision: PresenceRouteDecision | null;
  presenceMode: FinalPresenceMode | null;
  fullPresenceAccepted: boolean | null;
  embeddedPresenceStage: EmbeddedPresenceStage | null;
  fullPresenceSessionActive: boolean;

  // Actions
  actionRoleProgress: ActionRoleProgress[];
  actionOutcomeKind: ActionResolutionOutcome["kind"] | null;

  // Practiced items
  practicedItemIds: string[];

  // Tail
  tailStage: PostActionCompletionStage | MiniPostActionCompletionStage | null;
  tailState: PostActionCompletionState;

  terminalCompleted: boolean;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

function emptyState(input: CreateCombinedLiveSessionInput): CombinedLiveSessionState {
  return {
    sessionId: (input.generateSessionId ?? generateTimerRunId)(),
    routeConfigId: input.config.id,
    mode: input.mode,
    cadence: "reactive",
    // Adaptive ARC architecture task, Phase 14B-4: shallow-copied so later in-place
    // mutation of the caller's own config/items/stateProfiles/presenceArcs arrays
    // (or reassignment of the config object's own top-level fields) can never
    // retroactively change an already-started session's snapshot.
    snapshot: {
      config: { ...input.config, interferenceItemIds: [...input.config.interferenceItemIds], itemRelationships: { ...input.config.itemRelationships } },
      items: [...input.items],
      stateProfiles: [...input.stateProfiles],
      presenceArcs: [...input.presenceArcs],
      startedAt: input.startedAt,
    },
    phase: "invalid",
    invalidReason: null,
    awarenessSteps: [],
    awarenessIndex: 0,
    awarenessContext: null,
    primaryFactorId: null,
    pendingPrimaryFactorCandidates: null,
    pendingPrimaryFactorQuestion: null,
    stateDecisionAnswer: null,
    pendingStateDecisionCandidateId: null,
    resolvedPlan: null,
    remainingSteps: [],
    presenceGateIndex: null,
    stepIndex: 0,
    factorRatingHistory: [],
    desiredStateRating: null,
    reassessmentAnswer: null,
    presenceSelectedForSession: false,
    presenceRouteDecision: null,
    presenceMode: null,
    fullPresenceAccepted: null,
    embeddedPresenceStage: null,
    fullPresenceSessionActive: false,
    actionRoleProgress: [],
    actionOutcomeKind: null,
    practicedItemIds: [],
    tailStage: null,
    tailState: createEmptyPostActionCompletionState(),
    terminalCompleted: false,
  };
}

function resolvePlan(state: CombinedLiveSessionState): ReturnType<typeof resolveCombinedFactorPlan> {
  return resolveCombinedFactorPlan({
    mode: state.mode,
    config: state.snapshot.config,
    items: state.snapshot.items,
    stateProfiles: state.snapshot.stateProfiles,
    presenceArcs: state.snapshot.presenceArcs,
    primaryFactorId: state.primaryFactorId,
    stateDecisionAnswer: state.stateDecisionAnswer,
  });
}

function contextFromResult(result: ReturnType<typeof resolveCombinedFactorPlan>): UnresolvedCombinedFactorContext {
  if (result.kind === "resolved") return { factors: result.plan.factors, presence: result.plan.presence };
  if (result.kind === "invalid") return { factors: [], presence: null };
  return result.context;
}

/** Every configured, resolved factor is practiced (recognized + intervened on) regardless of which one ends up primary -- see arc/combinedFullPlan.ts's/arc/combinedMiniPlan.ts's own header docs ("secondary interventions remain"). */
function practicedItemIdsForPlan(plan: ResolvedCombinedFactorPlan): string[] {
  return plan.factors.map((factor) => factor.itemId);
}

/** The one findIndex-based, self-correcting computation described in this module's own header doc -- never a hardcoded count. */
function computePresenceGateIndex(spine: FullCombinedStep[]): number {
  const index = spine.findIndex((step) => step.kind === "state_desired_state_encoding" || step.kind === "state_action" || step.kind === "factor_action" || step.kind === "terminal_boundary");
  return index === -1 ? spine.length : index;
}

/**
 * The one place ActionResolutionOutcome is turned into concrete
 * per-position render info. See this module's own header/section-7 doc
 * for the exact per-kind role mapping (in particular:
 * "legacy_shared_state_fallback" renders as role "state", matching
 * "record the legacy fallback kind" rather than the array-position label
 * resolveCombinedActionKinds itself uses for ordering purposes only).
 */
function resolveActionRoleProgress(outcome: ActionResolutionOutcome, stepKind: "state_action" | "factor_action"): ActionRoleProgress | null {
  switch (outcome.kind) {
    case "unavailable":
      return null;
    case "factor_only":
      return { role: "factor", action: outcome.action, timerType: "combinedFactorAction", reached: false, completed: false };
    case "state_only":
      return { role: "state", action: outcome.action, timerType: "combinedStateAction", reached: false, completed: false };
    case "shared_explicit":
      return { role: "shared", action: outcome.action, timerType: "combinedSharedAction", reached: false, completed: false };
    case "legacy_shared_state_fallback":
      return { role: "state", action: outcome.action, timerType: "combinedStateAction", reached: false, completed: false };
    case "state_then_factor":
      return stepKind === "state_action"
        ? { role: "state", action: outcome.stateAction, timerType: "combinedStateAction", reached: false, completed: false }
        : { role: "factor", action: outcome.factorAction, timerType: "combinedFactorAction", reached: false, completed: false };
  }
}

function resolvePrimaryOutcome(plan: ResolvedCombinedFactorPlan): ActionResolutionOutcome | null {
  if (plan.primaryFactorId) return plan.factors.find((factor) => factor.itemId === plan.primaryFactorId)?.actionOutcome ?? null;
  return plan.presence?.actionOutcome ?? null;
}

/** Called once, the moment the plan resolves -- builds the ordered per-position action role list from resolveCombinedActionKinds' own step-kind order, never re-derived later. */
function buildActionRoleProgress(plan: ResolvedCombinedFactorPlan): ActionRoleProgress[] {
  const outcome = resolvePrimaryOutcome(plan);
  if (!outcome) return [];
  const kinds = resolveCombinedActionKinds(plan);
  const entries: ActionRoleProgress[] = [];
  for (const kind of kinds) {
    const entry = resolveActionRoleProgress(outcome, kind);
    if (entry) entries.push(entry);
  }
  return entries;
}

/**
 * The single decision-resolution step, re-run after every decision event
 * (a chosen primary factor, a state-decision answer). Never called after
 * the plan has already resolved once -- resolvedPlan/remainingSteps are
 * frozen at that point (see this module's own header doc: "later BUILD
 * edits affect only future sessions" / "do not recompute the saved route
 * in a way that changes the in-progress sequence after start").
 */
function resolveDecisionsAndAdvance(state: CombinedLiveSessionState): CombinedLiveSessionState {
  const result = resolvePlan(state);
  if (result.kind === "invalid") {
    return { ...state, phase: "invalid", invalidReason: result.reason };
  }
  if (result.kind === "needs_primary_factor") {
    const question = state.mode === "full" ? BASELINE_TIE_QUESTION : MINI_PRIMARY_FACTOR_QUESTION;
    return { ...state, phase: "primary_choice", pendingPrimaryFactorCandidates: result.candidates, pendingPrimaryFactorQuestion: question };
  }
  if (result.kind === "needs_state_decision") {
    return { ...state, phase: "state_decision", pendingStateDecisionCandidateId: result.candidateStateProfileId };
  }
  // resolved -- plan.primaryFactorId may have been auto-resolved internally by
  // resolveCombinedFactorPlan itself (<=1 factor, zero-UI case); sync it back
  // onto the controller's own field so it is never left null while the plan
  // already has a real primary factor.
  const plan = result.plan;
  const practicedItemIds = practicedItemIdsForPlan(plan);
  const actionRoleProgress = buildActionRoleProgress(plan);
  const presenceSelectedForSession = plan.presence !== null;

  if (state.mode === "mini") {
    const steps = buildMiniCombinedSteps(plan);
    return {
      ...state,
      primaryFactorId: plan.primaryFactorId,
      resolvedPlan: plan,
      remainingSteps: steps,
      presenceGateIndex: null,
      stepIndex: 0,
      practicedItemIds,
      actionRoleProgress,
      presenceSelectedForSession,
      // Mini's own presence_intervention step (when present) is always the
      // compact embedded-style content -- there is no Full-only "mode" concept
      // for Mini; presenceMode is only ever consulted for Full's own gate.
      phase: "steps",
    };
  }

  // Full: build the spine with the neutral "skipped" placeholder -- see this
  // module's own header doc for why this is safe and final.
  const spine = buildFullStepsAfterPrimaryResolution(plan, "skipped");
  const presenceGateIndex = computePresenceGateIndex(spine);
  return {
    ...state,
    primaryFactorId: plan.primaryFactorId,
    resolvedPlan: plan,
    remainingSteps: spine,
    presenceGateIndex,
    stepIndex: 0,
    practicedItemIds,
    actionRoleProgress,
    presenceSelectedForSession,
    phase: "steps",
  };
}

export function createCombinedLiveSession(input: CreateCombinedLiveSessionInput): CombinedLiveSessionState {
  let state = emptyState(input);
  const initialResult = resolvePlan(state);
  if (initialResult.kind === "invalid") {
    return { ...state, phase: "invalid", invalidReason: initialResult.reason };
  }

  if (input.mode === "full") {
    const context = contextFromResult(initialResult);
    const awarenessSteps = buildFullAwarenessSteps(context);
    state = { ...state, awarenessContext: context, awarenessSteps, awarenessIndex: 0 };
    if (awarenessSteps.length > 0) return { ...state, phase: "awareness" };
    // Zero factors selected (a Presence-only Full route) -- nothing to make aware of; proceed straight to decision resolution.
    return resolveDecisionsAndAdvance(state);
  }

  // Mini never has an Awareness phase at all.
  return resolveDecisionsAndAdvance(state);
}

// ---------------------------------------------------------------------------
// Awareness events (Full only)
// ---------------------------------------------------------------------------

function currentAwarenessStep(state: CombinedLiveSessionState): FullCombinedStep | null {
  return state.awarenessSteps[state.awarenessIndex] ?? null;
}

/** For "recognition"-kind Awareness steps -- simple acknowledge-and-advance. */
export function advanceAwarenessRecognition(state: CombinedLiveSessionState): CombinedLiveSessionState {
  if (state.phase !== "awareness") return state;
  const step = currentAwarenessStep(state);
  if (!step || step.kind !== "recognition") return state;
  return { ...state, awarenessIndex: state.awarenessIndex + 1 };
}

/**
 * For the single trailing "rating_checkpoint" (afterAwareness) Awareness
 * step -- collects one factor's rating at a time (arc/factorRating.ts's
 * own resolveNextUnratedFactor decides which factor is still owed a
 * rating); once every required factor has rated, resolves the baseline
 * primary factor (unique -> freeze silently; tie -> BASELINE_TIE_QUESTION,
 * asked immediately, phase "primary_choice") and re-runs decision
 * resolution. Awareness is never re-entered after this point.
 */
export function recordAwarenessRating(state: CombinedLiveSessionState, factorId: string, factorType: FactorType, value: number): CombinedLiveSessionState {
  if (state.phase !== "awareness" || !state.awarenessContext) return state;
  const step = currentAwarenessStep(state);
  if (!step || step.kind !== "rating_checkpoint" || step.checkpoint !== "afterAwareness") return state;

  const requiredFactors: RateableFactor[] = resolveRateableFactors(
    state.snapshot.items.filter((item) => state.awarenessContext!.factors.some((f) => f.itemId === item.id)),
    false
  );
  const rating = createFactorRating(factorId, factorType, "afterAwareness", value);
  const factorRatingHistory = [...state.factorRatingHistory, rating];

  if (!isCheckpointComplete(factorRatingHistory, "afterAwareness", requiredFactors)) {
    return { ...state, factorRatingHistory };
  }

  const baseline = resolveBaselinePrimaryFactor(factorRatingHistory);
  const advancedIndex = state.awarenessIndex + 1;
  let next: CombinedLiveSessionState = { ...state, factorRatingHistory, awarenessIndex: advancedIndex };

  if (baseline.kind === "unique") {
    next = { ...next, primaryFactorId: baseline.factorId };
  } else if (baseline.kind === "tie") {
    return { ...next, phase: "primary_choice", pendingPrimaryFactorCandidates: baseline.factorIds, pendingPrimaryFactorQuestion: baseline.question };
  }
  // baseline.kind === "none" is unreachable here (a rating_checkpoint step only exists when hasFactors).

  return resolveDecisionsAndAdvance(next);
}

/** Convenience for a screen that wants "which factor still needs a rating right now" without re-deriving RateableFactor itself. Returns null once the checkpoint is already complete (or when not on the checkpoint step). */
export function resolveCurrentAwarenessRatingFactor(state: CombinedLiveSessionState): RateableFactor | null {
  if (state.phase !== "awareness" || !state.awarenessContext) return null;
  const step = currentAwarenessStep(state);
  if (!step || step.kind !== "rating_checkpoint" || step.checkpoint !== "afterAwareness") return null;
  const requiredFactors = resolveRateableFactors(
    state.snapshot.items.filter((item) => state.awarenessContext!.factors.some((f) => f.itemId === item.id)),
    false
  );
  return resolveNextUnratedFactor(state.factorRatingHistory, "afterAwareness", requiredFactors);
}

// ---------------------------------------------------------------------------
// Primary-factor / State-decision events
// ---------------------------------------------------------------------------

export function chooseTiePrimaryFactor(state: CombinedLiveSessionState, factorId: string): CombinedLiveSessionState {
  if (state.phase !== "primary_choice") return state;
  if (state.pendingPrimaryFactorCandidates && !state.pendingPrimaryFactorCandidates.includes(factorId)) return state;
  return resolveDecisionsAndAdvance({ ...state, primaryFactorId: factorId, pendingPrimaryFactorCandidates: null, pendingPrimaryFactorQuestion: null });
}

/** STATE_DECISION_QUESTION's own Yes/No answer -- Yes includes the one saved candidate State; No continues without it. Never rewrites the saved route config, never asks to pick among several States. */
export function answerStateDecision(state: CombinedLiveSessionState, yes: boolean): CombinedLiveSessionState {
  if (state.phase !== "state_decision") return state;
  return resolveDecisionsAndAdvance({ ...state, stateDecisionAnswer: yes, pendingStateDecisionCandidateId: null });
}

export const STATE_DECISION_QUESTION_TEXT = STATE_DECISION_QUESTION;

// ---------------------------------------------------------------------------
// Steps phase -- checkpoint ratings, desired-state rating, reassessment,
// the Presence gate, generic step advance.
// ---------------------------------------------------------------------------

function currentStep(state: CombinedLiveSessionState): FullCombinedStep | MiniCombinedStep | null {
  return state.remainingSteps[state.stepIndex] ?? null;
}

/** Shared by afterStayAcceptance/afterStateRegulation (Full's steps phase) -- the SAME per-factor collection mechanics as recordAwarenessRating, over a different checkpoint. */
export function recordStepRating(state: CombinedLiveSessionState, factorId: string, factorType: FactorType, checkpoint: RatingCheckpoint, value: number): CombinedLiveSessionState {
  if (state.phase !== "steps" || !state.resolvedPlan) return state;
  const step = currentStep(state);
  if (!step || step.kind !== "rating_checkpoint" || step.checkpoint !== checkpoint) return state;

  const requiredFactors = resolveRateableFactors(state.snapshot.items.filter((item) => state.resolvedPlan!.factors.some((f) => f.itemId === item.id)), false);
  const rating = createFactorRating(factorId, factorType, checkpoint, value);
  const factorRatingHistory = [...state.factorRatingHistory, rating];
  if (!isCheckpointComplete(factorRatingHistory, checkpoint, requiredFactors)) {
    return { ...state, factorRatingHistory };
  }
  return advanceStepCursor({ ...state, factorRatingHistory });
}

export function resolveCurrentStepRatingFactor(state: CombinedLiveSessionState, checkpoint: RatingCheckpoint): RateableFactor | null {
  if (state.phase !== "steps" || !state.resolvedPlan) return null;
  const step = currentStep(state);
  if (!step || step.kind !== "rating_checkpoint" || step.checkpoint !== checkpoint) return null;
  const requiredFactors = resolveRateableFactors(state.snapshot.items.filter((item) => state.resolvedPlan!.factors.some((f) => f.itemId === item.id)), false);
  return resolveNextUnratedFactor(state.factorRatingHistory, checkpoint, requiredFactors);
}

/** Full's own separate desired-state rating (desired_state_rating step -- never merged into a factor checkpoint, never rendered for Mini, which has no such step kind at all). */
export function recordDesiredStateRating(state: CombinedLiveSessionState, value: number): CombinedLiveSessionState {
  if (state.phase !== "steps") return state;
  const step = currentStep(state);
  if (!step || step.kind !== "desired_state_rating") return state;
  return advanceStepCursor({ ...state, desiredStateRating: value });
}

/** cognitive_reassessment's own Yes/No-shaped answer (Full only). */
export function answerReassessment(state: CombinedLiveSessionState, answer: "not_stuck" | "still_stuck"): CombinedLiveSessionState {
  if (state.phase !== "steps") return state;
  const step = currentStep(state);
  if (!step || step.kind !== "cognitive_reassessment") return state;
  return advanceStepCursor({ ...state, reassessmentAnswer: answer });
}

/** Displaying/confirming an action marks only "reached" -- see markActionReached/confirmActionCompleted below. Reaching a "state_action"/"factor_action" step never auto-advances; the screen calls markActionReached once it renders the action, then confirmActionCompleted once the trainee explicitly confirms. */
export function markActionReached(state: CombinedLiveSessionState): CombinedLiveSessionState {
  if (state.phase !== "steps") return state;
  const step = currentStep(state);
  if (!step || (step.kind !== "state_action" && step.kind !== "factor_action")) return state;
  const index = resolveActionRoleIndexForStep(state, step.kind);
  if (index === -1) return state;
  const actionRoleProgress = state.actionRoleProgress.map((entry, i) => (i === index ? { ...entry, reached: true } : entry));
  return { ...state, actionRoleProgress };
}

/** The ONLY event that marks a real, factual completion for an action -- idempotent (repeated calls once already completed are a no-op that never mints a second completion or re-advances). */
export function confirmActionCompleted(state: CombinedLiveSessionState): CombinedLiveSessionState {
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

/** Resolves which actionRoleProgress entry a given "state_action"/"factor_action" step-kind position corresponds to. For state_then_factor there are two distinct entries (role "state" then role "factor", built in that exact order by buildActionRoleProgress); for every other outcome kind there is exactly one entry regardless of the step-kind label. */
function resolveActionRoleIndexForStep(state: CombinedLiveSessionState, stepKind: "state_action" | "factor_action"): number {
  if (state.actionRoleProgress.length === 2) {
    return stepKind === "state_action" ? 0 : 1;
  }
  return state.actionRoleProgress.length === 1 ? 0 : -1;
}

/** Generic advance for every step kind with no dedicated event above (recognition-after-primary is unreachable here -- Full's remaining steps never contain one; urge_preventive_stopping, shared_stay, shared_acceptance, state_regulation_anchor, state_desired_state_encoding, processing, combined_recognition, factor_intervention, presence_intervention[Mini]). Presence_intervention (Mini) is intentionally excluded -- see advanceEmbeddedPresenceStage below, which owns it. */
export function advanceStep(state: CombinedLiveSessionState): CombinedLiveSessionState {
  if (state.phase !== "steps") return state;
  const step = currentStep(state);
  if (!step) return state;
  if (step.kind === "rating_checkpoint" || step.kind === "desired_state_rating" || step.kind === "cognitive_reassessment" || step.kind === "state_action" || step.kind === "factor_action") return state;
  if (state.mode === "mini" && step.kind === "presence_intervention") return state;
  return advanceStepCursor(state);
}

/** The one place stepIndex actually moves forward -- always checks Full's Presence gate first (never for Mini, which has presenceGateIndex === null). */
function advanceStepCursor(state: CombinedLiveSessionState): CombinedLiveSessionState {
  const nextIndex = state.stepIndex + 1;
  if (state.mode === "full" && state.presenceGateIndex !== null && nextIndex === state.presenceGateIndex && state.presenceMode === null) {
    return enterPresenceGate({ ...state, stepIndex: nextIndex });
  }
  // "terminal_boundary" is the plan's own neutral closing marker, never a
  // rendered step of its own -- reaching it (or walking past the end of the
  // array entirely, which should never happen in practice since every real
  // plan ends in exactly one terminal_boundary entry) enters the shared
  // post-action tail directly.
  if (nextIndex >= state.remainingSteps.length || state.remainingSteps[nextIndex]?.kind === "terminal_boundary") {
    return enterTail({ ...state, stepIndex: nextIndex });
  }
  return { ...state, stepIndex: nextIndex };
}

// ---------------------------------------------------------------------------
// Presence -- Full's gate, embedded (Full + Mini), full (Full only).
// ---------------------------------------------------------------------------

function resolvePresenceRouteForState(state: CombinedLiveSessionState): PresenceRouteDecision {
  const config = state.snapshot.config;
  const cognitiveWorkSelected = state.resolvedPlan?.factors.some((f) => f.category === "thought" || f.category === "belief") ?? false;
  const emotionOrUrgeOnlySelected = !cognitiveWorkSelected && (state.resolvedPlan?.factors.some((f) => f.category === "emotion" || f.category === "urge") ?? false);
  return resolvePresenceRoute({ cognitiveWorkSelected, emotionOrUrgeOnlySelected, presenceEnabled: config.presenceEnabled, reassessmentAnswer: state.reassessmentAnswer });
}

function enterPresenceGate(state: CombinedLiveSessionState): CombinedLiveSessionState {
  const decision = resolvePresenceRouteForState(state);
  if (decision === "full_optional") {
    return { ...state, phase: "presence_optional_offer", presenceRouteDecision: decision };
  }
  return resolvePresenceModeAndContinue({ ...state, presenceRouteDecision: decision });
}

/** full_optional's own accept/decline -- "full_optional was offered but declined" resolves to "skipped", never "full" (arc/combinedRoute.ts's own resolveFinalPresenceMode already guarantees this). */
export function answerPresenceOptionalOffer(state: CombinedLiveSessionState, accepted: boolean): CombinedLiveSessionState {
  if (state.phase !== "presence_optional_offer" || !state.presenceRouteDecision) return state;
  return resolvePresenceModeAndContinue({ ...state, fullPresenceAccepted: accepted });
}

function resolvePresenceModeAndContinue(state: CombinedLiveSessionState): CombinedLiveSessionState {
  const decision = state.presenceRouteDecision;
  if (!decision) return state;
  const mode = resolveFinalPresenceMode(decision, state.fullPresenceAccepted);
  const next = { ...state, presenceMode: mode };
  if (mode === "embedded") return { ...next, phase: "presence_embedded", embeddedPresenceStage: getFirstEmbeddedPresenceStage() };
  if (mode === "full") return { ...next, phase: "presence_full_active", fullPresenceSessionActive: true };
  // "skipped" -- no extra stage at all, continue straight through the (unmodified) spine.
  return continueStepsFromCursor(next);
}

function continueStepsFromCursor(state: CombinedLiveSessionState): CombinedLiveSessionState {
  if (state.stepIndex >= state.remainingSteps.length || state.remainingSteps[state.stepIndex]?.kind === "terminal_boundary") return enterTail(state);
  return { ...state, phase: "steps" };
}

/** Shared by Full's embedded Presence (entered via the gate above) and Mini's compact presence_intervention step (arc/embeddedPresence.ts's own four stages, reused verbatim for both -- see arc/combinedMiniPlan.ts's own header doc: "the renderer guides this single semantic step using arc/embeddedPresence.ts's existing four compact stages"). Never restarts the cognitive route once complete -- always continues forward. */
export function advanceEmbeddedPresenceStage(state: CombinedLiveSessionState): CombinedLiveSessionState {
  if (state.phase === "presence_embedded") {
    const current = state.embeddedPresenceStage ?? getFirstEmbeddedPresenceStage();
    const next = getNextEmbeddedPresenceStage(current);
    if (isEmbeddedPresenceComplete(next)) {
      return continueStepsFromCursor({ ...state, embeddedPresenceStage: null });
    }
    return { ...state, embeddedPresenceStage: next };
  }
  if (state.phase === "steps" && state.mode === "mini") {
    const step = currentStep(state);
    if (!step || step.kind !== "presence_intervention") return state;
    const current = state.embeddedPresenceStage ?? getFirstEmbeddedPresenceStage();
    const next = getNextEmbeddedPresenceStage(current);
    if (isEmbeddedPresenceComplete(next)) {
      return advanceStepCursor({ ...state, embeddedPresenceStage: null });
    }
    return { ...state, embeddedPresenceStage: next };
  }
  return state;
}

/** Enters Mini's own presence_intervention step -- called by the screen once it renders that step, mirroring markActionReached's own "displaying sets no completion" discipline (embeddedPresenceStage starts at the first stage only once the screen actually asks for it). */
export function beginMiniPresenceIntervention(state: CombinedLiveSessionState): CombinedLiveSessionState {
  if (state.phase !== "steps" || state.mode !== "mini") return state;
  const step = currentStep(state);
  if (!step || step.kind !== "presence_intervention") return state;
  if (state.embeddedPresenceStage !== null) return state;
  return { ...state, embeddedPresenceStage: getFirstEmbeddedPresenceStage() };
}

/**
 * Full Presence only. The screen owns the actual nested ArcLiveState/
 * ArcStage sub-session (arc/presenceLive.ts's presenceArcToProfile +
 * live/liveEventAdapter.ts's advanceLiveSession, driven exactly like
 * live/PresenceArcLiveScreen.tsx already does) -- this controller only
 * needs to know it has finished. Per this module's own header doc: the
 * reused engine's own "desired_state_check" exit stage is intercepted by
 * the screen BEFORE it is ever rendered (exactly like the existing
 * standalone PresenceArcLiveScreen.tsx does), so it never collects a
 * rating of its own -- the combined session's own later desired_state_rating
 * step is the ONE place this measurement is asked, for every Presence
 * mode alike. Never enters PresenceArc's own standalone
 * action/post-action sub-engine (arc/presenceLive.ts's separate
 * PresenceActionLiveStage machinery) -- the screen must never call that
 * module's own getFirstPresenceActionLiveStage/getNextPresenceActionLiveStage
 * for this nested sub-session.
 */
export function completeFullPresenceSubSession(state: CombinedLiveSessionState): CombinedLiveSessionState {
  if (state.phase !== "presence_full_active") return state;
  return continueStepsFromCursor({ ...state, fullPresenceSessionActive: false });
}

// ---------------------------------------------------------------------------
// Post-action tail -- Full's existing shared 4-stage tail, Mini's existing
// compact 2-stage tail. Neither is invented here; both are the EXISTING
// arc/postActionCompletion.ts engines, selected once by mode.
// ---------------------------------------------------------------------------

function enterTail(state: CombinedLiveSessionState): CombinedLiveSessionState {
  const stage = state.mode === "full" ? getFirstPostActionCompletionStage() : getFirstMiniPostActionCompletionStage();
  return { ...state, phase: "tail", tailStage: stage };
}

export function recordTailImprovementText(state: CombinedLiveSessionState, text: string | null): CombinedLiveSessionState {
  if (state.phase !== "tail" || state.mode !== "full") return state;
  return { ...state, tailState: { ...state.tailState, improvementText: text } };
}

export function recordTailGratitudeText(state: CombinedLiveSessionState, text: string | null): CombinedLiveSessionState {
  if (state.phase !== "tail") return state;
  return { ...state, tailState: { ...state.tailState, gratitudeText: text } };
}

/** Advances the tail one stage. Reaching the tail's own "complete" stage marks terminalCompleted exactly once -- repeated calls are inert (see completeSession's own idempotency note). */
export function advanceTail(state: CombinedLiveSessionState): CombinedLiveSessionState {
  if (state.phase !== "tail" || !state.tailStage) return state;
  if (state.mode === "full") {
    const { stage } = getNextPostActionCompletionStage(state.tailStage as PostActionCompletionStage, state.tailState);
    if (stage === "complete") return completeSession({ ...state, tailStage: stage });
    return { ...state, tailStage: stage };
  }
  const stage = getNextMiniPostActionCompletionStage(state.tailStage as MiniPostActionCompletionStage);
  if (stage === "complete") return completeSession({ ...state, tailStage: stage });
  return { ...state, tailStage: stage };
}

// ---------------------------------------------------------------------------
// Terminal completion
// ---------------------------------------------------------------------------

/** The ONLY place terminalCompleted ever becomes true -- idempotent: a repeated call (e.g. a duplicate final event) never produces a second transition, since this function itself is only ever reached from advanceTail's own "complete" branch, and a caller may safely call it again with an already-terminal state as a no-op. */
export function completeSession(state: CombinedLiveSessionState): CombinedLiveSessionState {
  if (state.terminalCompleted) return state;
  return { ...state, phase: "complete", terminalCompleted: true };
}
