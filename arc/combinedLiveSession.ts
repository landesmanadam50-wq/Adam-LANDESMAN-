/**
 * arc/combinedLiveSession.ts
 *
 * Adaptive ARC architecture task, Phase 14B: the pure session controller
 * for Personal Development combined LIVE practice (reactive Full and
 * proactive State strengthening). Every behavioral decision lives here
 * as a pure, total, typed transition function -- sequence phase/current
 * step, stable sessionId, configured/selected/practiced item ids,
 * factor-rating progress + checkpoint completeness, baseline primary/tie
 * resolution, reassessment, session-level Presence selection/decision,
 * the nested-Presence-session handoff boundary, practiced-item
 * completion, action flags, post-action progression, and terminal
 * idempotency. live/CombinedInterferenceLiveScreen.tsx is a thin
 * renderer over this module -- it never re-derives any of the above.
 *
 * Layering note: this module drives its OWN typed phases (never a
 * legacy ArcLiveState). For "full" Presence specifically, the actual
 * nested ArcLiveState session is driven by the SCREEN using the existing
 * live/liveEventAdapter.ts machinery (exactly like every sibling
 * Presence-driving screen already does) -- arc/ never imports from
 * live/, so this controller only owns the DECISION boundary (when to
 * start the nested session, what rating to seed it with, when reaching
 * PRESENCE_EXIT_STAGE means "done, return to the parent State action")
 * via beginFullPresenceHandoff/completeFullPresenceSubSession below,
 * never the nested session's own step-by-step advancement. Embedded
 * Presence has no such constraint (arc/embeddedPresence.ts is pure
 * arc/-only), so its four fixed stages ARE owned directly here.
 */

import { generateTimerRunId } from "./actionTimer.ts";
import { dedupeItemIdsPreservingOrder } from "./combinedInterferenceSelection.ts";
import type { FinalPresenceMode, PresenceRouteDecision } from "./combinedRoute.ts";
import { resolveFinalPresenceMode, resolvePresenceRoute } from "./combinedRoute.ts";
import { buildCombinedLiveSequencePrefix } from "./combinedLiveSequence.ts";
import type { CombinedLiveSequenceStep } from "./combinedLiveSequence.ts";
import { createEmptyCombinedLiveSessionFacts } from "./combinedLiveSessionFacts.ts";
import type { CombinedLiveSessionCadence, CombinedLiveSessionFacts } from "./combinedLiveSessionFacts.ts";
import { getFirstEmbeddedPresenceStage, getNextEmbeddedPresenceStage, isEmbeddedPresenceComplete } from "./embeddedPresence.ts";
import type { EmbeddedPresenceStage } from "./embeddedPresence.ts";
import {
  createFactorRating,
  isCheckpointComplete,
  resolveBaselinePrimaryFactor,
  resolveLatestHighestInterferingFactorIds,
  resolveRateableFactors,
} from "./factorRating.ts";
import type { FactorRating, FactorType, RateableFactor, RatingCheckpoint } from "./factorRating.ts";
import type { InterferenceItem } from "./interferenceItem.ts";
import { getFirstProactiveStatePracticeStep, getNextProactiveStatePracticeStep } from "./proactiveStatePractice.ts";
import type { ProactiveStatePracticeStepKind } from "./proactiveStatePractice.ts";
import { createEmptyPostActionCompletionState, getFirstPostActionCompletionStage, getNextPostActionCompletionStage } from "./postActionCompletion.ts";
import type { PostActionCompletionStage, PostActionCompletionState } from "./postActionCompletion.ts";

export type CombinedLiveSessionPhase = "prefix" | "presence_decision" | "presence" | "action" | "post_action" | "complete";

export interface CombinedLiveSessionState {
  sessionId: string;
  stateProfileId: string;
  cadence: CombinedLiveSessionCadence;
  phase: CombinedLiveSessionPhase;

  // Reactive-only sequencing.
  prefixSequence: CombinedLiveSequenceStep[];
  prefixIndex: number;
  cognitiveWorkSelected: boolean;
  emotionOrUrgeOnlySelected: boolean;

  // Proactive-only sequencing.
  proactiveStep: ProactiveStatePracticeStepKind | null;

  configuredItemIds: string[];
  selectedItemIds: string[];
  practicedItemIds: string[];

  rateableFactors: RateableFactor[];
  factorRatingHistory: FactorRating[];
  /** Fixed once, from afterAwareness only -- never replaced by checkpoint 2/3. */
  baselinePrimaryFactorId: string | null;
  /** Non-null exactly while a baseline tie is blocking prefix progression, waiting for chooseBaselineTieFactor. */
  pendingBaselineTieFactorIds: string[] | null;
  latestHighestInterferingFactorIds: string[];

  reassessmentAnswer: "not_stuck" | "still_stuck" | null;
  /** THE session-level choice -- never BUILD's own presenceEnabled (see this module's own resolveSessionPresenceRoute doc). */
  presenceSelectedForSession: boolean;
  presenceDecision: PresenceRouteDecision | null;
  fullPresenceAccepted: boolean | null;
  presenceMode: FinalPresenceMode | null;
  embeddedPresenceStage: EmbeddedPresenceStage | null;
  /** The already-collected afterRegulation Presence FactorRating value, reused to seed the nested full-Presence session instead of asking presence_check's own question a second time -- null when no such rating exists (proactive, or Presence wasn't selected as a tracked factor). */
  presenceSeedRating: number | null;

  actionReached: boolean;
  realActionCompleted: boolean;
  postActionStage: PostActionCompletionStage | null;
  postActionCompletionState: PostActionCompletionState;

  terminalCompleted: boolean;
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export interface CreateCombinedLiveSessionInput {
  stateProfileId: string;
  cadence: CombinedLiveSessionCadence;
  /** Reactive: the resolved active items for this session. Proactive: always []. */
  activeItems: InterferenceItem[];
  configuredItemIds: string[];
  selectedItemIds: string[];
  presenceSelectedForSession: boolean;
  /** Injectable purely for deterministic tests; production callers omit it. */
  generateSessionId?: () => string;
}

export function createCombinedLiveSession(input: CreateCombinedLiveSessionInput): CombinedLiveSessionState {
  const sessionId = (input.generateSessionId ?? generateTimerRunId)();
  const isReactive = input.cadence === "reactive";
  const hasThought = input.activeItems.some((item) => item.category === "thought");
  const hasBelief = input.activeItems.some((item) => item.category === "belief");
  const hasEmotionOrUrge = input.activeItems.some((item) => item.category === "emotion" || item.category === "urge");
  const cognitiveWorkSelected = isReactive && (hasThought || hasBelief);
  const emotionOrUrgeOnlySelected = isReactive && !cognitiveWorkSelected && hasEmotionOrUrge;

  return {
    sessionId,
    stateProfileId: input.stateProfileId,
    cadence: input.cadence,
    phase: "prefix",
    prefixSequence: isReactive ? buildCombinedLiveSequencePrefix(input.activeItems) : [],
    prefixIndex: 0,
    cognitiveWorkSelected,
    emotionOrUrgeOnlySelected,
    proactiveStep: isReactive ? null : getFirstProactiveStatePracticeStep(),
    configuredItemIds: dedupeItemIdsPreservingOrder(input.configuredItemIds),
    selectedItemIds: dedupeItemIdsPreservingOrder(input.selectedItemIds),
    practicedItemIds: [],
    rateableFactors: isReactive ? resolveRateableFactors(input.activeItems, input.presenceSelectedForSession) : [],
    factorRatingHistory: [],
    baselinePrimaryFactorId: null,
    pendingBaselineTieFactorIds: null,
    latestHighestInterferingFactorIds: [],
    reassessmentAnswer: null,
    presenceSelectedForSession: input.presenceSelectedForSession,
    presenceDecision: null,
    fullPresenceAccepted: null,
    presenceMode: null,
    embeddedPresenceStage: null,
    presenceSeedRating: null,
    actionReached: false,
    realActionCompleted: false,
    postActionStage: null,
    postActionCompletionState: createEmptyPostActionCompletionState(),
    terminalCompleted: false,
  };
}

// ---------------------------------------------------------------------------
// Reactive prefix walking
// ---------------------------------------------------------------------------

export function getCurrentPrefixStep(session: CombinedLiveSessionState): CombinedLiveSequenceStep | null {
  if (session.cadence !== "reactive" || session.phase !== "prefix") return null;
  return session.prefixSequence[session.prefixIndex] ?? null;
}

/**
 * True while the current step requires something the trainee hasn't
 * supplied yet -- an incomplete rating checkpoint (never advance after
 * only the first of several factors was rated), an unresolved baseline
 * tie, or an unanswered cognitive_reassessment question. advancePrefixStep
 * is a no-op while this is true.
 */
export function isPrefixAdvanceBlocked(session: CombinedLiveSessionState): boolean {
  const step = getCurrentPrefixStep(session);
  if (!step) return false;
  if (step.kind === "rating_checkpoint" && step.checkpoint) {
    if (!isCheckpointComplete(session.factorRatingHistory, step.checkpoint, session.rateableFactors)) return true;
    if (step.checkpoint === "afterAwareness" && session.pendingBaselineTieFactorIds !== null) return true;
    return false;
  }
  if (step.kind === "cognitive_reassessment") {
    return session.reassessmentAnswer === null;
  }
  return false;
}

/** Every one of an item's own processing-bucket steps in the prefix -- Thought/Belief may have more than one (e.g. thought_alternative + thought_future_insight); Emotion/Urge have exactly one. */
function processingStepIndicesForItem(sequence: CombinedLiveSequenceStep[], itemId: string): number[] {
  return sequence.map((step, index) => (step.kind === "processing" && step.itemId === itemId ? index : -1)).filter((index) => index >= 0);
}

/**
 * Adaptive ARC architecture task, Phase 14B: the one pure helper that
 * decides whether `index` is an item's FINAL required processing step --
 * never an inline screen condition. An item is marked practiced only
 * once this is true for the step just advanced past; recognition and
 * rating-checkpoint steps never mark anything practiced.
 */
export function isFinalRequiredProcessingStep(sequence: CombinedLiveSequenceStep[], index: number): boolean {
  const step = sequence[index];
  if (!step || step.kind !== "processing" || !step.itemId) return false;
  const indices = processingStepIndicesForItem(sequence, step.itemId);
  return indices.length > 0 && index === indices[indices.length - 1];
}

/**
 * Advances exactly one prefix step, a no-op while isPrefixAdvanceBlocked
 * is true. Appends to practicedItemIds only when the step just advanced
 * past was an item's own final required processing step (per
 * isFinalRequiredProcessingStep) -- never during recognition, never
 * during a rating, never duplicated. Reaching the end of the prefix
 * moves the session into "presence_decision".
 */
export function advancePrefixStep(session: CombinedLiveSessionState): CombinedLiveSessionState {
  if (session.cadence !== "reactive" || session.phase !== "prefix") return session;
  if (isPrefixAdvanceBlocked(session)) return session;

  const currentIndex = session.prefixIndex;
  const currentStep = session.prefixSequence[currentIndex];
  let practicedItemIds = session.practicedItemIds;
  if (currentStep && currentStep.itemId && isFinalRequiredProcessingStep(session.prefixSequence, currentIndex)) {
    if (!practicedItemIds.includes(currentStep.itemId)) {
      practicedItemIds = [...practicedItemIds, currentStep.itemId];
    }
  }

  const nextIndex = currentIndex + 1;
  if (nextIndex >= session.prefixSequence.length) {
    return { ...session, prefixIndex: nextIndex, practicedItemIds, phase: "presence_decision" };
  }
  return { ...session, prefixIndex: nextIndex, practicedItemIds };
}

/** Advances the proactive fixed sequence one step; reaching the end moves the session into "presence_decision" -- mirrors advancePrefixStep's own end-of-sequence transition, but proactive has no blocking condition of its own (no ratings, no reassessment). */
export function advanceProactiveStep(session: CombinedLiveSessionState): CombinedLiveSessionState {
  if (session.cadence !== "proactive" || session.phase !== "prefix" || !session.proactiveStep) return session;
  const next = getNextProactiveStatePracticeStep(session.proactiveStep);
  if (next === null) {
    return { ...session, proactiveStep: null, phase: "presence_decision" };
  }
  return { ...session, proactiveStep: next };
}

// ---------------------------------------------------------------------------
// Factor ratings + baseline primary/tie
// ---------------------------------------------------------------------------

/**
 * Records one factor's rating at the current checkpoint. Once every
 * required factor has an afterAwareness rating, automatically resolves
 * baselinePrimaryFactorId (unique max) or sets pendingBaselineTieFactorIds
 * (a tie -- blocking prefix progression until chooseBaselineTieFactor is
 * called). Once every required factor has an afterRegulation rating,
 * resolves the separate latestHighestInterferingFactorIds report --
 * never touches baselinePrimaryFactorId.
 */
export function recordFactorRating(session: CombinedLiveSessionState, factorId: string, factorType: FactorType, checkpoint: RatingCheckpoint, value: number): CombinedLiveSessionState {
  const rating = createFactorRating(factorId, factorType, checkpoint, value);
  const factorRatingHistory = [...session.factorRatingHistory.filter((r) => !(r.factorId === factorId && r.checkpoint === checkpoint)), rating];
  let updated: CombinedLiveSessionState = { ...session, factorRatingHistory };

  if (checkpoint === "afterAwareness" && isCheckpointComplete(factorRatingHistory, "afterAwareness", session.rateableFactors)) {
    const resolution = resolveBaselinePrimaryFactor(factorRatingHistory);
    if (resolution.kind === "unique") {
      updated = { ...updated, baselinePrimaryFactorId: resolution.factorId, pendingBaselineTieFactorIds: null };
    } else if (resolution.kind === "tie") {
      updated = { ...updated, pendingBaselineTieFactorIds: resolution.factorIds };
    }
  }
  if (checkpoint === "afterRegulation" && isCheckpointComplete(factorRatingHistory, "afterRegulation", session.rateableFactors)) {
    updated = { ...updated, latestHighestInterferingFactorIds: resolveLatestHighestInterferingFactorIds(factorRatingHistory) };
  }
  return updated;
}

/** Resolves a pending baseline tie -- a no-op if there is no pending tie or `factorId` wasn't one of the tied ids. Preserved for the rest of the session; never replaced by checkpoint 2/3. */
export function chooseBaselineTieFactor(session: CombinedLiveSessionState, factorId: string): CombinedLiveSessionState {
  if (!session.pendingBaselineTieFactorIds || !session.pendingBaselineTieFactorIds.includes(factorId)) return session;
  return { ...session, baselinePrimaryFactorId: factorId, pendingBaselineTieFactorIds: null };
}

export function recordReassessmentAnswer(session: CombinedLiveSessionState, answer: "not_stuck" | "still_stuck"): CombinedLiveSessionState {
  const step = getCurrentPrefixStep(session);
  if (!step || step.kind !== "cognitive_reassessment") return session;
  return { ...session, reassessmentAnswer: answer };
}

// ---------------------------------------------------------------------------
// Presence decision -- session-level choice, never BUILD's own flag.
// ---------------------------------------------------------------------------

/**
 * Deliberately passes `presenceSelectedForSession` (never BUILD's own
 * presenceEnabled) into arc/combinedRoute.ts's own unmodified
 * resolvePresenceRoute as its own `presenceEnabled` parameter -- that
 * parameter's real meaning there is "is Presence available/chosen for
 * THIS session's routing," which presenceSelectedForSession answers
 * correctly for every case: configured-but-not-selected and
 * unavailable/unlinked both correctly resolve as false, never silently
 * treated as configured-and-selected. Reproduces exactly the required
 * six-row table without any Phase 12 change.
 */
export function resolveSessionPresenceRoute(
  cognitiveWorkSelected: boolean,
  emotionOrUrgeOnlySelected: boolean,
  presenceSelectedForSession: boolean,
  reassessmentAnswer: "not_stuck" | "still_stuck" | null
): PresenceRouteDecision {
  return resolvePresenceRoute({ cognitiveWorkSelected, emotionOrUrgeOnlySelected, presenceEnabled: presenceSelectedForSession, reassessmentAnswer });
}

function applyResolvedPresenceMode(session: CombinedLiveSessionState, mode: FinalPresenceMode): CombinedLiveSessionState {
  if (mode === "embedded") {
    return { ...session, presenceMode: mode, phase: "presence", embeddedPresenceStage: getFirstEmbeddedPresenceStage() };
  }
  if (mode === "full") {
    const seed = session.factorRatingHistory.find((r) => r.factorType === "presence" && r.checkpoint === "afterRegulation")?.value ?? null;
    return { ...session, presenceMode: mode, phase: "presence", presenceSeedRating: seed };
  }
  return { ...session, presenceMode: "skipped", phase: "action" };
}

/**
 * Called once the prefix (reactive) or the proactive fixed sequence
 * finishes -- resolves the Presence decision/mode for this session.
 * Reactive: cognitive-work-based routing via resolveSessionPresenceRoute
 * above; a full_optional result STOPS here (phase stays
 * "presence_decision") until recordFullPresenceAcceptance is called --
 * never guesses the answer. Proactive: no reassessment/stuck concept
 * exists at all, so Presence simply runs (full) when explicitly
 * selected, or is skipped -- never embedded (see
 * arc/proactiveStatePractice.ts's own doc).
 */
export function resolvePresenceForSession(session: CombinedLiveSessionState): CombinedLiveSessionState {
  if (session.phase !== "presence_decision") return session;

  if (session.cadence === "proactive") {
    return applyResolvedPresenceMode(session, session.presenceSelectedForSession ? "full" : "skipped");
  }

  const decision = resolveSessionPresenceRoute(session.cognitiveWorkSelected, session.emotionOrUrgeOnlySelected, session.presenceSelectedForSession, session.reassessmentAnswer);
  const updated: CombinedLiveSessionState = { ...session, presenceDecision: decision };
  if (decision === "full_optional") {
    return updated; // waits for recordFullPresenceAcceptance
  }
  return applyResolvedPresenceMode(updated, resolveFinalPresenceMode(decision, null));
}

/** Only meaningful when presenceDecision is "full_optional" (reactive only) -- a no-op otherwise. */
export function recordFullPresenceAcceptance(session: CombinedLiveSessionState, accepted: boolean): CombinedLiveSessionState {
  if (session.phase !== "presence_decision" || session.presenceDecision !== "full_optional") return session;
  const mode = resolveFinalPresenceMode("full_optional", accepted);
  return applyResolvedPresenceMode({ ...session, fullPresenceAccepted: accepted }, mode);
}

// ---------------------------------------------------------------------------
// Presence sub-session handoff
// ---------------------------------------------------------------------------

/** Embedded Presence's four fixed stages, owned directly (pure arc/ state) -- reaching "complete" moves the session on to "action". */
export function advanceEmbeddedPresence(session: CombinedLiveSessionState): CombinedLiveSessionState {
  if (session.phase !== "presence" || session.presenceMode !== "embedded" || !session.embeddedPresenceStage) return session;
  const next = getNextEmbeddedPresenceStage(session.embeddedPresenceStage);
  if (isEmbeddedPresenceComplete(next)) {
    return { ...session, embeddedPresenceStage: next, phase: "action" };
  }
  return { ...session, embeddedPresenceStage: next };
}

/**
 * The full-Presence boundary: the screen drives the actual nested
 * ArcLiveState itself (see this module's own header doc) and calls this
 * exactly once, the moment that nested session reaches
 * PRESENCE_EXIT_STAGE (arc/presenceLive.ts's own isPresenceComplete) --
 * never after entering PresenceArc's own separate action/post-action
 * sub-engine, which this controller's own combined-session action/tail
 * (§ below) replaces entirely for this session.
 */
export function completeFullPresenceSubSession(session: CombinedLiveSessionState): CombinedLiveSessionState {
  if (session.phase !== "presence" || session.presenceMode !== "full") return session;
  return { ...session, phase: "action" };
}

// ---------------------------------------------------------------------------
// Action + post-action tail
// ---------------------------------------------------------------------------

/** Displaying the beneficial-action step -- sets actionReached only, never realActionCompleted. */
export function markActionReached(session: CombinedLiveSessionState): CombinedLiveSessionState {
  if (session.phase !== "action") return session;
  return { ...session, actionReached: true };
}

/** The one explicit acknowledgment that sets realActionCompleted -- idempotent past the first call (mirrors live/liveEventAdapter.ts's own applyActionCompletion "never reset once true" convention), and only ever reachable once actionReached is true. */
export function acknowledgeRealActionCompleted(session: CombinedLiveSessionState): CombinedLiveSessionState {
  if (session.phase !== "action" || !session.actionReached || session.realActionCompleted) return session;
  return { ...session, realActionCompleted: true, phase: "post_action", postActionStage: getFirstPostActionCompletionStage() };
}

/**
 * Advances the shared post-action tail (arc/postActionCompletion.ts,
 * unmodified) exactly once per call, only while phase is "post_action"
 * (i.e. only after realActionCompleted is true). Reaching "complete"
 * sets terminalCompleted exactly once and moves phase to "complete" --
 * further calls are no-ops (phase is no longer "post_action"), so a
 * re-render or a repeated event can never duplicate terminal completion.
 */
export function advancePostActionStage(session: CombinedLiveSessionState, improvementText?: string | null, gratitudeText?: string | null): CombinedLiveSessionState {
  if (session.phase !== "post_action" || !session.postActionStage) return session;
  let postActionCompletionState = session.postActionCompletionState;
  if (improvementText !== undefined) postActionCompletionState = { ...postActionCompletionState, improvementText };
  if (gratitudeText !== undefined) postActionCompletionState = { ...postActionCompletionState, gratitudeText };

  const hop = getNextPostActionCompletionStage(session.postActionStage, postActionCompletionState);
  const isComplete = hop.stage === "complete";
  return {
    ...session,
    postActionStage: hop.stage,
    postActionCompletionState: hop.state,
    phase: isComplete ? "complete" : "post_action",
    terminalCompleted: isComplete ? true : session.terminalCompleted,
  };
}

// ---------------------------------------------------------------------------
// Terminal facts
// ---------------------------------------------------------------------------

/** Snapshots the controller's own state into the terminal CombinedLiveSessionFacts shape -- safe to call at any point (e.g. for an in-progress summary), but terminalCompleted only ever reads true once advancePostActionStage has actually completed the tail. */
export function toCombinedLiveSessionFacts(session: CombinedLiveSessionState): CombinedLiveSessionFacts {
  const base = createEmptyCombinedLiveSessionFacts(session.sessionId, session.stateProfileId, session.configuredItemIds, session.cadence);
  return {
    ...base,
    selectedItemIds: session.selectedItemIds,
    practicedItemIds: session.practicedItemIds,
    presenceMode: session.presenceMode ?? "skipped",
    reassessmentAnswer: session.reassessmentAnswer,
    presenceSelectedForSession: session.presenceSelectedForSession,
    factorRatingHistory: session.factorRatingHistory,
    baselinePrimaryFactorId: session.baselinePrimaryFactorId,
    latestHighestInterferingFactorIds: session.latestHighestInterferingFactorIds,
    actionReached: session.actionReached,
    realActionCompleted: session.realActionCompleted,
    terminalCompleted: session.terminalCompleted,
  };
}
