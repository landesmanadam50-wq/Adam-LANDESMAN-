/**
 * arc/liveSessionCoordinator.ts
 *
 * Adaptive ARC architecture task, Phase 9: the single, narrow entry point
 * a FUTURE real Self Development LIVE screen would call, exactly once,
 * when a completed session should be recorded against the Phase 6/7/8
 * per-mapping progression counters. Nothing here is wired to any screen
 * yet -- see this module's own "not yet used" note below.
 *
 * Inspection finding this phase is scoped around: as of this phase, no
 * BUILD screen exists anywhere in this repository that creates or
 * selects a real StateProfile/IdentityProfile/InterferenceItem record,
 * and the real Self Development LIVE driver (live/LiveSessionScreen.tsx)
 * runs entirely on the legacy ArcBuild/ArcBuildProfile/ArcLiveState
 * system, with zero relationship to those Phase 3 library types. A real
 * LIVE session therefore cannot yet supply a real library selection --
 * this module defines the CONTRACT and the safe, typed recording
 * pipeline a later BUILD+LIVE wiring phase will call into, without
 * itself touching any screen, storage schema, or existing Phase 2-8
 * module's own logic.
 *
 * Reuse discipline: every completion/progression rule below is imported
 * and called verbatim from the phase that already owns it --
 * arc/libraryProjectionContent.ts's buildProjectionCompletionInput
 * (Phase 5), data/progressionSessionPersistence.ts's
 * recordRegularProgressionSession (Phase 8, which itself calls Phase
 * 7's applyRegularSessionToProgression and Phase 6's
 * applyProjectionResultToCounters/isValidStageProjectionCombination
 * unmodified). This file adds no new counting, unlocking, or
 * stage/projection-validity rule of its own -- its only job is (a)
 * minting a stable session id once, (b) refusing to even ATTEMPT
 * recording a session this repository cannot yet prove is real and
 * complete, and (c) arranging the one call into Phase 8's persistence
 * layer.
 *
 * Layering note: every other arc/ module in this architecture is pure
 * logic with "no storage I/O" by design (data/ wraps arc/, never the
 * reverse). This file is the one deliberate, narrow exception --
 * its entire purpose is to be the single orchestration point between
 * Phase 7's pure bridge and Phase 8's persistence, so it imports
 * data/progressionSessionPersistence.ts's recordRegularProgressionSession
 * directly (with the SAME injectable ProgressionStorageDependencies
 * parameter that module already exposes, defaulting to real storage
 * exactly as it always has). No new storage key, schema, or module is
 * added -- this file only ever calls that one existing function.
 *
 * Session id: reuses arc/actionTimer.ts's generateTimerRunId() verbatim
 * rather than duplicating it -- that function is already a generic
 * "Date.now() + Math.random()" identifier with no TimerRun-specific
 * coupling (see its own doc: "Not cryptographically unique -- collision
 * odds are astronomically low for a single device's session-scale
 * usage, which is all this needs"), which is exactly the guarantee a
 * session id needs too. This module makes the SAME "not cryptographically
 * unique" claim, and no stronger one.
 *
 * Not yet used: nothing in this repository calls
 * createLiveSessionCoordinatorContext or recordCompletedLiveSession --
 * wiring a real LIVE screen to this module (and building the BUILD
 * screen that would let a trainee actually select a StateProfile/
 * InterferenceItem/IdentityProfile in the first place) is explicitly
 * out of scope for this phase.
 */

import { generateTimerRunId } from "./actionTimer.ts";
import type { ArcLiveState, IdentityExtensionTrack } from "./types.ts";
import type { StateProfile } from "./stateProfile.ts";
import type { IdentityProfile } from "./identityProfile.ts";
import type { InterferenceItem } from "./interferenceItem.ts";
import type { ActionCompletionSignal, ArcProjectionKind } from "./projectionCompletion.ts";
import { buildProjectionCompletionInput } from "./libraryProjectionContent.ts";
import type { ProgressionStage } from "./reactiveProactiveProgression.ts";
import type { ProgressionMappingContext, RegularSessionBridgeInput } from "./progressionSessionBridge.ts";
import { recordRegularProgressionSession } from "../data/progressionSessionPersistence.ts";
import type { ProgressionStorageDependencies } from "../data/progressionSessionPersistence.ts";
import type { RegularSessionBridgeOutcome } from "./progressionSessionBridge.ts";

// ---------------------------------------------------------------------------
// Supported projection
// ---------------------------------------------------------------------------

/**
 * Phase 9 supports only Full/Mini/Action-only. ARC Link is excluded at
 * the TYPE level -- a caller cannot construct a
 * LiveSessionCoordinatorContext with `projection: "link"` at all, so
 * "unsupported Link input" is impossible through the normal typed API,
 * not merely rejected at runtime.
 *
 * Stage 3 (the compound Link + State action + optional Identity action
 * session) is a SEPARATE concept from ArcProjectionKind entirely -- it
 * has no projection value of its own (see
 * arc/reactiveProactiveProgression.ts's own ProjectionForStage/
 * "link_plus_action" marker and arc/progressionSessionBridge.ts's
 * separate applyStage3SessionToProgression, neither of which this module
 * calls). This module exposes no Stage 3 entry point at all -- there is
 * nothing to exclude from a type that was never offered.
 */
export type CoordinatedLiveProjection = Exclude<ArcProjectionKind, "link">;

// ---------------------------------------------------------------------------
// Coordinator context
// ---------------------------------------------------------------------------

/**
 * Everything one coordinated Self Development LIVE session needs, beyond
 * the live ArcLiveState itself (passed separately to
 * recordCompletedLiveSession below, never embedded here -- this context
 * is the library/selection side, the session is the real-time-observed
 * side). Exactly eight fields; consistency between them (identitySelected
 * vs. identity, track eligibility, stage/projection validity) is
 * validated by recordCompletedLiveSession, not by constructing this
 * object -- a context can be built at session-start time before its own
 * consistency is known to matter yet.
 */
export interface LiveSessionCoordinatorContext {
  /** Minted once at session start by createLiveSessionCoordinatorContext -- never regenerated. */
  sessionId: string;
  state: StateProfile;
  /** null for a proactive session -- never inferred from ArcLiveState.selectedTarget/triggerType; the real library item must be supplied explicitly by the future caller. */
  item: InterferenceItem | null;
  /** null when no Identity is linked/selected this session. */
  identity: IdentityProfile | null;
  /** Which stage the trainee intentionally practiced -- never inferred from `projection` (see arc/reactiveProactiveProgression.ts's own doc: Mini exists in both Stage 1 and Stage 2). */
  practicedStage: ProgressionStage;
  projection: CoordinatedLiveProjection;
  track: IdentityExtensionTrack;
  /** Self Development's own optional Identity choice for THIS session -- an explicit input, never inferred from whether `identity` happens to be non-null. */
  identitySelected: boolean;
}

export interface CreateLiveSessionCoordinatorContextInput {
  state: StateProfile;
  item: InterferenceItem | null;
  identity: IdentityProfile | null;
  practicedStage: ProgressionStage;
  projection: CoordinatedLiveProjection;
  track: IdentityExtensionTrack;
  identitySelected: boolean;
  /**
   * Injectable purely for deterministic tests (verifying "minted once,
   * preserved through the session" and "separate starts produce
   * different ids") -- production callers omit this and get
   * arc/actionTimer.ts's real generateTimerRunId().
   */
  generateSessionId?: () => string;
}

/**
 * The session-start helper: mints ONE sessionId (via generateSessionId,
 * defaulting to the real generateTimerRunId) and returns it embedded in
 * a fresh, immutable LiveSessionCoordinatorContext. A caller must invoke
 * this exactly once per real session -- at session start (the same
 * moment live/LiveSessionScreen.tsx's own sessionStartedAt is captured
 * today), never per render, per retry within the same session, per
 * completion check, or per persistence attempt -- and hold the returned
 * object (e.g. in component-local React state, the same place
 * ArcLiveState itself already lives) for the rest of that session. This
 * function itself is pure and does not remember or dedupe anything --
 * the "only once per session" guarantee comes entirely from a caller
 * calling it once and reusing the result, exactly like every other
 * per-session value LiveSessionScreen already manages this way.
 */
export function createLiveSessionCoordinatorContext(input: CreateLiveSessionCoordinatorContextInput): LiveSessionCoordinatorContext {
  const generate = input.generateSessionId ?? generateTimerRunId;
  return {
    sessionId: generate(),
    state: input.state,
    item: input.item,
    identity: input.identity,
    practicedStage: input.practicedStage,
    projection: input.projection,
    track: input.track,
    identitySelected: input.identitySelected,
  };
}

// ---------------------------------------------------------------------------
// Pure adapters -- ArcLiveState -> Phase 2's completion signal shapes
// ---------------------------------------------------------------------------

/**
 * ArcLiveState -> ActionCompletionSignal for the State action.
 *
 * Source fields (verbatim, no transformation):
 *   - output.actionReached        <- session.actionReached
 *   - output.realActionCompleted  <- session.realActionCompleted
 *
 * These two ArcLiveState fields already track "the protocol reached
 * 'act' this session" / "the trainee confirmed they actually performed
 * the real-world action" for whichever ONE layer (state/identity/habit)
 * this session's own "act" stage targeted -- see arc/types.ts's own
 * field docs. For a Self Development session with Identity NOT selected
 * this session, that one layer IS the State action, so this mapping is
 * exact.
 */
export function adaptStateActionCompletionSignal(session: ArcLiveState): ActionCompletionSignal {
  return {
    actionReached: session.actionReached,
    realActionCompleted: session.realActionCompleted,
  };
}

export type IdentityCompletionSignalAdaptationOutcome =
  /** identitySelected was false -- Identity has no role in this session; there is nothing to adapt. */
  | { kind: "not_selected" }
  /**
   * identitySelected was true, but ArcLiveState has no INDEPENDENT
   * evidence of Identity completion to adapt. ArcLiveState.actionReached/
   * realActionCompleted are a SINGLE pair of flags describing whichever
   * ONE layer this session's one "act" stage targeted (see
   * arc/arcEngine.ts's resolveEncodingTarget/EncodingResolution) -- there
   * is no second, separate "Identity action reached"/"Identity action
   * completed" pair recorded anywhere on ArcLiveState today. Reusing the
   * State action's own flags as if they proved a SEPARATE Identity
   * action was completed would fabricate evidence this repository does
   * not actually have, so this function never does that -- it returns
   * this outcome instead, every time identitySelected is true, for as
   * long as ArcLiveState has no dedicated Identity-completion fields
   * (adding those is explicitly out of scope for this phase).
   */
  | { kind: "insufficient_identity_signal" };

/**
 * ArcLiveState -> IdentityCompletionSignal, or a typed reason why one
 * cannot be produced. Never maps arc/types.ts's ArcLiveState.actionReached/
 * realActionCompleted (the STATE action's own fields) into an Identity
 * completion signal -- see this function's own return-type doc.
 * `session` is accepted (rather than ignored) so a future extension of
 * ArcLiveState with real, independent Identity-completion fields has an
 * obvious, single place to start reading them from; this phase adds no
 * such fields and reads none from `session` yet.
 */
export function adaptIdentityCompletionSignal(session: ArcLiveState, identitySelected: boolean): IdentityCompletionSignalAdaptationOutcome {
  void session;
  if (!identitySelected) return { kind: "not_selected" };
  return { kind: "insufficient_identity_signal" };
}

// ---------------------------------------------------------------------------
// Completion boundary + recording
// ---------------------------------------------------------------------------

/**
 * The ArcStage literal live/liveEventAdapter.ts's advanceLiveSession
 * writes into ArcLiveState.currentArcStage on every hop (see
 * `currentArcStage: outcome.stage` there) once the protocol's own
 * transition graph reaches its terminal stage -- the exact same value
 * live/LiveSessionScreen.tsx's commitAdvance already checks
 * (`nextStage === "complete"`) before calling finalizeSession. Reusing
 * this same field/value as the completion boundary means a session that
 * merely set actionReached/realActionCompleted mid-protocol (e.g. during
 * "act" itself, several stages before "complete") is never mistaken for
 * a finished session.
 */
const TERMINAL_ARC_STAGE = "complete";

export type LiveSessionCoordinatorOutcome =
  /** ArcLiveState.currentArcStage isn't "complete" yet -- the flow has not reached its real terminal transition. Never recorded, regardless of actionReached/realActionCompleted. */
  | { kind: "session_not_complete" }
  /** context.track is "goal_achievement" -- ARC Goal keeps its own separate schedule and never enters these counters (arc/reactiveProactiveProgression.ts's isEligibleForProgressionCounters). */
  | { kind: "goal_track_excluded" }
  /** No StateProfile was supplied -- reachable only by bypassing the typed API (LiveSessionCoordinatorContext.state is required), kept as a defensive runtime guard. */
  | { kind: "missing_state_profile" }
  /** context.projection resolved to "link" at runtime -- reachable only by bypassing CoordinatedLiveProjection's own type exclusion, kept as a defensive runtime guard. Stage 3 is never reachable here at all (see CoordinatedLiveProjection's own doc), so it never produces this outcome or any other. */
  | { kind: "unsupported_projection"; projection: string }
  /** identitySelected/identity are inconsistent, or ArcLiveState cannot prove Identity completion -- see the two `reason` values below. */
  | { kind: "inconsistent_identity_context"; reason: "identity_selected_without_profile" | "insufficient_identity_signal" }
  /**
   * Every precondition held -- Phase 7/8's own outcome, surfaced
   * completely unchanged (never reinterpreted). `applyOutcome.kind` is
   * one of "applied"/"not_completed"/"invalid_combination"/
   * "duplicate_session" -- see arc/reactiveProactiveProgression.ts's
   * ApplyProjectionResultOutcome; only "applied" actually persisted a
   * write (data/progressionSessionPersistence.ts's own save-only-on-
   * applied rule, untouched by this module).
   */
  | Extract<RegularSessionBridgeOutcome, { kind: "processed" }>;

/**
 * The one entry point a future LIVE screen would call, exactly once per
 * completed session, to record it against the Phase 6/7/8 progression
 * counters. Order of operations (never reordered, never short-circuited
 * out of order):
 *
 *   1. Require session.currentArcStage === "complete" (the real terminal
 *      transition) -- otherwise "session_not_complete".
 *   2. Exclude ARC Goal (context.track === "goal_achievement") --
 *      otherwise "goal_track_excluded". Checked before anything else
 *      below is even read.
 *   3. Require a StateProfile -- otherwise "missing_state_profile"
 *      (defensive; unreachable through the typed API).
 *   4. Require a supported projection -- otherwise "unsupported_projection"
 *      (defensive; unreachable through the typed API).
 *   5. Validate Identity consistency:
 *      - identitySelected && identity === null -> "inconsistent_identity_context"
 *        (reason "identity_selected_without_profile").
 *      - identitySelected && identity !== null -> "inconsistent_identity_context"
 *        (reason "insufficient_identity_signal") -- see
 *        adaptIdentityCompletionSignal's own doc for why an
 *        identity-selected session can never be scored from today's
 *        ArcLiveState. Self Development WITHOUT selected Identity is
 *        entirely unaffected by this -- it proceeds normally.
 *   6. Build the Phase 5 ProjectionCompletionInput via
 *      arc/libraryProjectionContent.ts's own buildProjectionCompletionInput
 *      (unmodified), from the State adapter's output only -- identity
 *      observations are always false/inert here, since step 5 already
 *      returned for every identitySelected===true case.
 *   7. Call Phase 8's recordRegularProgressionSession exactly once,
 *      through the caller's injected ProgressionStorageDependencies
 *      (defaulting to real storage, exactly as that function already
 *      does on its own).
 *   8. Return its outcome completely unchanged (Phase 6/7's own
 *      "applied"/"not_completed"/"invalid_combination"/"duplicate_session"
 *      distinctions, and Phase 7's own cadence/mappingKey resolution, are
 *      never reinterpreted here). Phase 6's own countedSessions ledger
 *      remains the ONLY exactly-once guarantee -- this module adds no
 *      second counter or ledger of its own.
 *
 * Cadence (reactive vs. proactive) is never a caller-supplied field on
 * LiveSessionCoordinatorContext -- it is derived, as it already was in
 * Phase 7, purely from context.item being non-null
 * (arc/progressionSessionBridge.ts's resolveProgressionCadence, called
 * internally by recordRegularProgressionSession, unmodified). Stage/
 * projection pairing validity (arc/reactiveProactiveProgression.ts's
 * isValidStageProjectionCombination) is likewise never re-validated
 * here -- it remains entirely governed by Phase 6, reached via Phase
 * 7/8 unchanged, and surfaces as `applyOutcome.kind === "invalid_combination"`
 * inside a "processed" result exactly as it always has.
 */
export async function recordCompletedLiveSession(
  context: LiveSessionCoordinatorContext,
  session: ArcLiveState,
  deps?: ProgressionStorageDependencies
): Promise<LiveSessionCoordinatorOutcome> {
  if (session.currentArcStage !== TERMINAL_ARC_STAGE) {
    return { kind: "session_not_complete" };
  }

  if (context.track === "goal_achievement") {
    return { kind: "goal_track_excluded" };
  }

  if (!context.state) {
    return { kind: "missing_state_profile" };
  }

  if ((context.projection as ArcProjectionKind) === "link") {
    return { kind: "unsupported_projection", projection: context.projection };
  }

  if (context.identitySelected) {
    if (context.identity === null) {
      return { kind: "inconsistent_identity_context", reason: "identity_selected_without_profile" };
    }
    return { kind: "inconsistent_identity_context", reason: "insufficient_identity_signal" };
  }

  const stateSignal = adaptStateActionCompletionSignal(session);
  const completion = buildProjectionCompletionInput(context.projection, context.track, context.sessionId, context.identitySelected, {
    stateActionReached: stateSignal.actionReached,
    stateRealActionCompleted: stateSignal.realActionCompleted,
    // Identity/Link observations are always inert here: identitySelected
    // is guaranteed false by this point (the branch above already
    // returned for every identitySelected === true case), and this
    // module never builds a Link completion input at all.
    identityActionReached: false,
    identityRealActionCompleted: false,
    linkReachedFinalStage: false,
    linkRequiredDwellsCompleted: false,
    linkCompletionAcknowledged: false,
  });

  const bridgeContext: ProgressionMappingContext = { state: context.state, item: context.item, identity: context.identity };
  const bridgeInput: RegularSessionBridgeInput = {
    sessionId: context.sessionId,
    practicedStage: context.practicedStage,
    projection: context.projection,
    track: context.track,
    completion,
  };

  const outcome = await recordRegularProgressionSession(bridgeContext, bridgeInput, deps);

  if (outcome.kind === "not_eligible") {
    // Defensive/unreachable in practice: step 2 above already excludes
    // "goal_achievement" before recordRegularProgressionSession is ever
    // called, so its own identical exclusion can never actually fire
    // here. Kept only so this function stays exhaustive over
    // RegularSessionBridgeOutcome without an unsafe cast.
    return { kind: "goal_track_excluded" };
  }

  return outcome;
}
