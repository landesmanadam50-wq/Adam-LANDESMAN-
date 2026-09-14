/**
 * arc/progressionSessionBridge.ts
 *
 * Adaptive ARC architecture task, Phase 7: the single safe entry point
 * per completed Self Development session, connecting the completion
 * evaluation modules (arc/projectionCompletion.ts, Phase 2) to the
 * per-mapping progression counters (arc/reactiveProactiveProgression.ts,
 * Phase 6) via the library records those two modules never had a direct
 * relationship to (arc/stateProfile.ts/arc/identityProfile.ts/
 * arc/interferenceItem.ts, Phase 3).
 *
 * Nothing here reimplements completion evaluation or counter mechanics
 * -- every one of those stays exactly as Phase 2/6 left it, imported and
 * called verbatim. This module's own job is narrow: resolve cadence and
 * the mapping key FROM the library context (so a caller never supplies
 * a key directly), gate ARC Goal out before anything else runs, and
 * return one strongly-typed outcome per call.
 *
 * Pure logic only -- nothing in this repository calls anything below
 * yet. No storage I/O, no navigation, deterministic, and every
 * StateProfile/IdentityProfile/InterferenceItem/counters/store input is
 * read-only -- every function here returns a new value rather than
 * mutating what it was given.
 *
 * LINKED IDENTITY DECISION: `linkedIdentityVersion` (the existing field
 * name on arc/projectionCompletion.ts's ReactiveMappingProgressKey/
 * ProactiveStateProgressKey -- NOT renamed here) is populated with the
 * linked IdentityProfile's own `id`, never its `updatedAt`. Progress
 * resets only when a DIFFERENT Identity is linked (a relationship
 * change); routine edits to the same Identity (which only change
 * `updatedAt`) never reset progress -- symmetric with State already
 * being keyed by `state.id` rather than any of its own timestamps.
 */

import type { StateProfile } from "./stateProfile.ts";
import type { IdentityProfile } from "./identityProfile.ts";
import type { InterferenceItem } from "./interferenceItem.ts";
import type { IdentityExtensionTrack } from "./types.ts";
import type {
  ActionCompletionSignal,
  ArcProjectionKind,
  IdentityCompletionSignal,
  LinkCompletionSignal,
  ProactiveStateProgressKey,
  ProjectionCompletionInput,
  ProjectionCompletionResult,
  ReactiveMappingProgressKey,
} from "./projectionCompletion.ts";
import { evaluateProjectionCompletion, proactiveStateProgressKeyToString, reactiveMappingProgressKeyToString } from "./projectionCompletion.ts";
import type {
  ApplyProjectionResultOutcome,
  ApplyStage3CompletionOutcome,
  MappingProgressionCounters,
  MappingProgressionStore,
  ProgressionCadence,
  ProgressionStage,
  Stage3CompoundCompletionResult,
} from "./reactiveProactiveProgression.ts";
import {
  applyProjectionResultToCounters,
  applyStage3CompletionToCounters,
  evaluateStage3CompoundCompletion,
  getOrCreateMappingProgress,
  isEligibleForProgressionCounters,
  isStageUnlocked,
  setMappingProgress,
} from "./reactiveProactiveProgression.ts";

// ---------------------------------------------------------------------------
// Mapping context, cadence, and key resolution
// ---------------------------------------------------------------------------

/**
 * Everything the bridge needs to resolve WHICH mapping (reactive or
 * proactive) a session belongs to. Public apply functions below accept
 * this instead of a caller-supplied key string -- the key is always
 * resolved internally from these three records, never handed in
 * pre-computed, so it can never drift from the same rule every caller
 * uses.
 */
export interface ProgressionMappingContext {
  state: StateProfile;
  item: InterferenceItem | null;
  identity: IdentityProfile | null;
}

/** "reactive" when an InterferenceItem was selected this session, "proactive" when none was -- never a separate caller choice. */
export function resolveProgressionCadence(item: InterferenceItem | null): ProgressionCadence {
  return item !== null ? "reactive" : "proactive";
}

/**
 * Resolves the exact same key string arc/projectionCompletion.ts's own
 * reactiveMappingProgressKeyToString/proactiveStateProgressKeyToString
 * would produce -- reused directly, never a new key format. Reactive
 * uses `context.item.id` + `context.state.id`; proactive uses only
 * `context.state.id` -- so a reactive and a proactive context built from
 * the SAME State never collide (their key strings differ structurally:
 * reactive is a 3-part string prefixed by the item id, proactive a
 * 2-part string starting directly with the state id).
 *
 * `linkedIdentityVersion` is `context.identity?.id ?? null` -- see this
 * module's own header doc for why the linked Identity's id (not its
 * updatedAt) is used.
 */
export function resolveProgressionMappingKey(context: ProgressionMappingContext): string {
  const linkedIdentityVersion = context.identity?.id ?? null;
  if (context.item !== null) {
    const key: ReactiveMappingProgressKey = { interferenceItemId: context.item.id, linkedStateId: context.state.id, linkedIdentityVersion };
    return reactiveMappingProgressKeyToString(key);
  }
  const key: ProactiveStateProgressKey = { stateId: context.state.id, linkedIdentityVersion };
  return proactiveStateProgressKeyToString(key);
}

// ---------------------------------------------------------------------------
// Regular (Stage 1/2/4) session bridge
// ---------------------------------------------------------------------------

export interface RegularSessionBridgeInput {
  sessionId: string;
  /** Which stage the trainee intentionally practiced -- never inferred from `projection` here either; passed straight through to arc/reactiveProactiveProgression.ts's own applyProjectionResultToCounters unchanged. */
  practicedStage: ProgressionStage;
  projection: ArcProjectionKind;
  track: IdentityExtensionTrack;
  completion: ProjectionCompletionInput;
}

export type RegularSessionBridgeOutcome =
  | { kind: "not_eligible"; reason: "goal_track_excluded" }
  | {
      kind: "processed";
      cadence: ProgressionCadence;
      mappingKey: string;
      /** The store AFTER this call -- identical to the input store (same reference) when applyOutcome.kind isn't "applied", since nothing was written. */
      store: MappingProgressionStore;
      completionResult: ProjectionCompletionResult;
      /** Phase 6's own outcome, surfaced unchanged -- may be "applied", "not_completed", "invalid_combination", or "duplicate_session". */
      applyOutcome: ApplyProjectionResultOutcome;
    };

/**
 * The one entry point for a completed Stage 1, Stage 2, or Stage 4
 * session. Order of operations (never reordered):
 *   1. Reject ARC Goal immediately -- before resolving a key, reading
 *      counters, or evaluating completion at all.
 *   2. Resolve cadence from context.item.
 *   3. Resolve the mapping key from context (never caller-supplied).
 *   4. Read/create that mapping's counters (Phase 6).
 *   5. Evaluate input.completion (Phase 2's evaluateProjectionCompletion,
 *      unmodified).
 *   6. Apply the result under the EXPLICIT input.practicedStage (Phase
 *      6's applyProjectionResultToCounters, unmodified) -- never
 *      inferred from input.projection.
 *   7. Write the updated counters back under the resolved key only if
 *      step 6 actually applied something.
 */
export function applyRegularSessionToProgression(store: MappingProgressionStore, context: ProgressionMappingContext, input: RegularSessionBridgeInput): RegularSessionBridgeOutcome {
  if (!isEligibleForProgressionCounters(input.track)) {
    return { kind: "not_eligible", reason: "goal_track_excluded" };
  }

  const cadence = resolveProgressionCadence(context.item);
  const mappingKey = resolveProgressionMappingKey(context);
  const counters = getOrCreateMappingProgress(store, mappingKey);

  const completionResult = evaluateProjectionCompletion(input.completion);
  const applyOutcome = applyProjectionResultToCounters(counters, {
    sessionId: input.sessionId,
    practicedStage: input.practicedStage,
    projection: input.projection,
    result: completionResult,
  });

  const updatedStore = applyOutcome.kind === "applied" ? setMappingProgress(store, mappingKey, applyOutcome.counters) : store;

  return { kind: "processed", cadence, mappingKey, store: updatedStore, completionResult, applyOutcome };
}

// ---------------------------------------------------------------------------
// Stage 3 compound session bridge
// ---------------------------------------------------------------------------

export interface Stage3SessionBridgeInput {
  sessionId: string;
  track: IdentityExtensionTrack;
  /** Self Development's own optional Identity choice -- Identity remains optional here; when false, `identity` below is ignored by evaluateStage3CompoundCompletion. */
  identitySelected: boolean;
  link: LinkCompletionSignal;
  state: ActionCompletionSignal;
  identity: IdentityCompletionSignal | null;
}

export type Stage3SessionBridgeOutcome =
  | { kind: "not_eligible"; reason: "goal_track_excluded" }
  | {
      kind: "processed";
      cadence: ProgressionCadence;
      mappingKey: string;
      store: MappingProgressionStore;
      completionResult: Stage3CompoundCompletionResult;
      /** Phase 6's own outcome, surfaced unchanged -- "applied", "not_completed", or "duplicate_session". */
      applyOutcome: ApplyStage3CompletionOutcome;
    };

/**
 * The one entry point for a completed Stage 3 compound session (Link
 * rehearsal + a real State action + an Identity action only when
 * Identity was selected). Excludes ARC Goal before resolving a key or
 * reading the store, exactly like applyRegularSessionToProgression.
 * Reads/writes the SAME mapping's counters (and the same global
 * countedSessions ledger, via Phase 6's own applyStage3CompletionToCounters)
 * as the regular bridge above -- a session ID already counted through
 * either function can never count again through the other. Updates only
 * `stage3` -- never stage1/stage2/stage4. A pure Stage 2 Link completion
 * is never evaluated here at all: this function only ever receives
 * Stage-3-specific compound signals, never a Stage 2 ProjectionCompletionInput.
 */
export function applyStage3SessionToProgression(store: MappingProgressionStore, context: ProgressionMappingContext, input: Stage3SessionBridgeInput): Stage3SessionBridgeOutcome {
  if (!isEligibleForProgressionCounters(input.track)) {
    return { kind: "not_eligible", reason: "goal_track_excluded" };
  }

  const cadence = resolveProgressionCadence(context.item);
  const mappingKey = resolveProgressionMappingKey(context);
  const counters = getOrCreateMappingProgress(store, mappingKey);

  const completionResult = evaluateStage3CompoundCompletion({
    sessionId: input.sessionId,
    identitySelected: input.identitySelected,
    link: input.link,
    state: input.state,
    identity: input.identity,
  });
  const applyOutcome = applyStage3CompletionToCounters(counters, input.sessionId, completionResult);

  const updatedStore = applyOutcome.kind === "applied" ? setMappingProgress(store, mappingKey, applyOutcome.counters) : store;

  return { kind: "processed", cadence, mappingKey, store: updatedStore, completionResult, applyOutcome };
}

// ---------------------------------------------------------------------------
// Available practice stages -- availability only, never a forced choice.
// ---------------------------------------------------------------------------

/**
 * Every stage currently unlocked for `cadence`, in [1, 2, 3, 4] order --
 * a thin filter over arc/reactiveProactiveProgression.ts's own
 * isStageUnlocked, never a new unlocking rule. A fresh mapping returns
 * [1]; later stages APPEAR as their thresholds are met, but earlier
 * stages never disappear -- this function never selects or recommends
 * one for the caller.
 */
export function resolveAvailablePracticeStages(counters: MappingProgressionCounters, cadence: ProgressionCadence): ProgressionStage[] {
  const allStages: ProgressionStage[] = [1, 2, 3, 4];
  return allStages.filter((stage) => isStageUnlocked(counters, stage, cadence));
}
