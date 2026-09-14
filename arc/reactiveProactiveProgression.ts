/**
 * arc/reactiveProactiveProgression.ts
 *
 * Adaptive ARC architecture task, Phase 6: per-mapping mastery
 * progression counters for the reactive (interference-item-driven) and
 * proactive (State-driven) cadences -- Stage 1 (Learning) -> Stage 2
 * (Short practice + Link) -> Stage 3 (Link + independent action) ->
 * Stage 4 (Action-only, terminal).
 *
 * This system applies ONLY to the personal_development (Self
 * Development) track -- see isEligibleForProgressionCounters below. ARC
 * Goal keeps its own simpler, goal-specific schedule and never enters
 * these per-mapping mastery counters.
 *
 * Structural correction (superseding an earlier draft of this phase): a
 * single shared "completedMiniCount" cannot represent this system,
 * because Mini exists in both Stage 1 and Stage 2, and "unlocking does
 * not force practice" means earlier stages remain fully usable after
 * later stages unlock -- a Mini completion can never be assigned to a
 * stage merely from its projection kind. Every stage therefore owns its
 * own, fully independent counters (stage1/stage2/stage3/stage4 below);
 * the caller must always say explicitly which stage the trainee
 * intentionally practiced (ApplyProjectionResultInput.practicedStage),
 * and an invalid stage/projection combination (e.g. a Link session
 * recorded as Stage 1) is rejected with a typed result rather than
 * silently recorded anywhere.
 *
 * Reuses arc/projectionCompletion.ts's own completion types
 * (ActionCompletionSignal/IdentityCompletionSignal/LinkCompletionSignal/
 * ProjectionCompletionResult/ArcProjectionKind) and key-stringifier
 * functions (reactiveMappingProgressKeyToString/
 * proactiveStateProgressKeyToString) verbatim -- neither that module nor
 * arc/libraryProjectionContent.ts is modified by this phase.
 *
 * Pure logic only -- nothing in this repository calls anything below
 * yet. No storage I/O, no navigation, deterministic, and every counters/
 * store object passed in is never mutated -- every function here returns
 * a new value.
 */

import type { IdentityExtensionTrack } from "./types.ts";
import type { ActionCompletionSignal, ArcProjectionKind, IdentityCompletionSignal, LinkCompletionSignal, ProjectionCompletionResult } from "./projectionCompletion.ts";

/** Self Development's own 4-stage mastery ladder -- see this module's own header doc for what each stage means. Stage 4 is terminal: there is no Stage 5. */
export type ProgressionStage = 1 | 2 | 3 | 4;

/** Only `personal_development` sessions ever enter this counter system -- ARC Goal (`goal_achievement`) keeps its own simpler, goal-specific schedule and must never be fed into any function below. */
export function isEligibleForProgressionCounters(track: IdentityExtensionTrack): boolean {
  return track === "personal_development";
}

// ---------------------------------------------------------------------------
// Per-stage counters -- fully independent buckets, never shared fields.
// ---------------------------------------------------------------------------

export interface Stage1ProgressionCounters {
  completedFullCount: number;
  completedMiniCount: number;
}

export interface Stage2ProgressionCounters {
  completedMiniCount: number;
  completedLinkCount: number;
}

export interface Stage3ProgressionCounters {
  completedLinkPlusActionCount: number;
}

/** completedActionOnlyCount is useful for Stage 4 analytics only -- Stage 4 is terminal, so this count never unlocks anything further. */
export interface Stage4ProgressionCounters {
  completedActionOnlyCount: number;
}

/** One entry in the GLOBAL session ledger (countedSessions below) -- records which stage/projection a given session ID was actually counted under, so a later resubmission (under the same or a different stage) can be recognized as a duplicate rather than double-counted. */
export interface CountedProgressionSession {
  stage: ProgressionStage;
  projection: ArcProjectionKind | "link_plus_action";
}

export interface MappingProgressionCounters {
  stage1: Stage1ProgressionCounters;
  stage2: Stage2ProgressionCounters;
  stage3: Stage3ProgressionCounters;
  stage4: Stage4ProgressionCounters;
  /**
   * The single, global idempotency ledger for this ENTIRE mapping --
   * shared across every stage and both apply functions below (regular
   * Stage 1/2/4 completions and Stage 3's own compound completions), so
   * a session ID counted once under any stage can never count again
   * under any other stage either.
   */
  countedSessions: Record<string, CountedProgressionSession>;
}

export function createEmptyMappingProgressionCounters(): MappingProgressionCounters {
  return {
    stage1: { completedFullCount: 0, completedMiniCount: 0 },
    stage2: { completedMiniCount: 0, completedLinkCount: 0 },
    stage3: { completedLinkPlusActionCount: 0 },
    stage4: { completedActionOnlyCount: 0 },
    countedSessions: {},
  };
}

// ---------------------------------------------------------------------------
// Valid stage/projection combinations
// ---------------------------------------------------------------------------

/** Stage 3's own compound marker -- never a member of ArcProjectionKind (that type only ever describes ONE regular projection at a time); used only in CountedProgressionSession/applyStage3CompletionToCounters. */
export type ProjectionForStage = ArcProjectionKind | "link_plus_action";

/**
 * The only allowed pairings:
 *   Stage 1: "full" | "mini"
 *   Stage 2: "mini" | "link"
 *   Stage 3: "link_plus_action" only (reached exclusively via
 *     applyStage3CompletionToCounters, never via applyProjectionResultToCounters)
 *   Stage 4: "action_only" only
 * Every other pairing (a Link recorded as Stage 1, a Full recorded as
 * Stage 2, a pure Link recorded as Stage 3, a Mini recorded as Stage 4,
 * Action-only recorded as Stage 3, etc.) is invalid.
 */
export function isValidStageProjectionCombination(stage: ProgressionStage, projection: ProjectionForStage): boolean {
  switch (stage) {
    case 1:
      return projection === "full" || projection === "mini";
    case 2:
      return projection === "mini" || projection === "link";
    case 3:
      return projection === "link_plus_action";
    case 4:
      return projection === "action_only";
  }
}

// ---------------------------------------------------------------------------
// Applying a regular (Stage 1/2/4) projection completion
// ---------------------------------------------------------------------------

export interface ApplyProjectionResultInput {
  sessionId: string;
  /** Which stage the trainee INTENTIONALLY practiced this session -- never inferred from `projection` (Mini exists in both Stage 1 and Stage 2; after Stage 2 unlocks, Stage 1 remains fully practiceable). */
  practicedStage: ProgressionStage;
  projection: ArcProjectionKind;
  result: ProjectionCompletionResult;
}

export type ApplyProjectionResultOutcome =
  | { kind: "applied"; counters: MappingProgressionCounters }
  /** The session didn't qualify for progression credit at all (result.countsForProgression was false) -- mirrors arc/projectionCompletion.ts's own applyProjectionCompletionToProgress: nothing is incremented, and the session is NOT recorded in the ledger either (an incomplete attempt occupies no session-id slot). */
  | { kind: "not_completed"; counters: MappingProgressionCounters }
  /** stage/projection is not one of the allowed pairings -- see isValidStageProjectionCombination. Nothing is incremented, nothing is recorded. */
  | { kind: "invalid_combination"; stage: ProgressionStage; projection: ArcProjectionKind }
  /** This sessionId was already counted -- under this stage or any other. Returns the ORIGINAL recorded entry so the caller can see what it was actually counted as; counters are unchanged. */
  | { kind: "duplicate_session"; sessionId: string; existing: CountedProgressionSession };

/**
 * Applies one Stage 1, Stage 2, or Stage 4 completion to `counters`,
 * idempotently and only for a valid stage/projection pairing. Stage 3 is
 * never reachable through this function (see
 * isValidStageProjectionCombination -- no regular ArcProjectionKind is
 * ever valid for stage 3); use applyStage3CompletionToCounters for that.
 *
 * Never mutates `counters` -- always returns a new object inside the
 * "applied" outcome (or the identical, untouched `counters` reference
 * inside "not_completed"/"duplicate_session", never a copy pretending
 * something changed).
 */
export function applyProjectionResultToCounters(counters: MappingProgressionCounters, input: ApplyProjectionResultInput): ApplyProjectionResultOutcome {
  const { sessionId, practicedStage, projection, result } = input;

  if (!isValidStageProjectionCombination(practicedStage, projection)) {
    return { kind: "invalid_combination", stage: practicedStage, projection };
  }

  const existing = counters.countedSessions[sessionId];
  if (existing) {
    return { kind: "duplicate_session", sessionId, existing };
  }

  if (!result.countsForProgression) {
    return { kind: "not_completed", counters };
  }

  const countedSessions = { ...counters.countedSessions, [sessionId]: { stage: practicedStage, projection } };

  if (practicedStage === 1) {
    const stage1: Stage1ProgressionCounters = {
      completedFullCount: counters.stage1.completedFullCount + (projection === "full" ? 1 : 0),
      completedMiniCount: counters.stage1.completedMiniCount + (projection === "mini" ? 1 : 0),
    };
    return { kind: "applied", counters: { ...counters, stage1, countedSessions } };
  }

  if (practicedStage === 2) {
    const stage2: Stage2ProgressionCounters = {
      completedMiniCount: counters.stage2.completedMiniCount + (projection === "mini" ? 1 : 0),
      completedLinkCount: counters.stage2.completedLinkCount + (projection === "link" ? 1 : 0),
    };
    return { kind: "applied", counters: { ...counters, stage2, countedSessions } };
  }

  if (practicedStage === 4) {
    const stage4: Stage4ProgressionCounters = { completedActionOnlyCount: counters.stage4.completedActionOnlyCount + 1 };
    return { kind: "applied", counters: { ...counters, stage4, countedSessions } };
  }

  // practicedStage === 3: unreachable in practice (isValidStageProjectionCombination
  // rejects every regular ArcProjectionKind for stage 3 above), kept only
  // for TypeScript's exhaustiveness -- never silently records.
  return { kind: "invalid_combination", stage: practicedStage, projection };
}

// ---------------------------------------------------------------------------
// Stage 3: compound completion (Link + State action + optional Identity action)
// ---------------------------------------------------------------------------

/**
 * A single Stage 3 "session" is NOT the same event as a Stage 2 Link
 * rehearsal -- it requires, together: the Link rehearsal's own three
 * signals, a genuinely completed State action, and -- only when this
 * session selected Identity (Self Development's own optional rule,
 * never mandatory here since ARC Goal is excluded from this whole
 * module) -- the Identity action too. A pure Stage 2 Link completion
 * (state/identity never attempted) must never satisfy this.
 */
export interface Stage3CompoundCompletionInput {
  sessionId: string;
  identitySelected: boolean;
  link: LinkCompletionSignal;
  state: ActionCompletionSignal;
  /** Present only when identitySelected is true; ignored otherwise. */
  identity: IdentityCompletionSignal | null;
}

export interface Stage3CompoundCompletionResult {
  valid: boolean;
}

export function evaluateStage3CompoundCompletion(input: Stage3CompoundCompletionInput): Stage3CompoundCompletionResult {
  const linkValid = input.link.reachedFinalStage && input.link.requiredDwellsCompleted && input.link.completionAcknowledged;
  const stateValid = input.state.actionReached && input.state.realActionCompleted;
  if (!input.identitySelected) {
    return { valid: linkValid && stateValid };
  }
  const identityValid = input.identity !== null && input.identity.actionReached && input.identity.realActionCompleted;
  return { valid: linkValid && stateValid && identityValid };
}

export type ApplyStage3CompletionOutcome =
  | { kind: "applied"; counters: MappingProgressionCounters }
  | { kind: "not_completed"; counters: MappingProgressionCounters }
  | { kind: "duplicate_session"; sessionId: string; existing: CountedProgressionSession };

/**
 * Applies one Stage 3 compound completion to `counters` -- kept as its
 * own function (the compound result shape is unique to Stage 3), but
 * reads/writes the SAME global `countedSessions` ledger
 * applyProjectionResultToCounters uses, so a session ID already counted
 * as a regular Stage 1/2/4 completion can never ALSO count here, and
 * vice versa.
 */
export function applyStage3CompletionToCounters(counters: MappingProgressionCounters, sessionId: string, result: Stage3CompoundCompletionResult): ApplyStage3CompletionOutcome {
  const existing = counters.countedSessions[sessionId];
  if (existing) {
    return { kind: "duplicate_session", sessionId, existing };
  }

  if (!result.valid) {
    return { kind: "not_completed", counters };
  }

  const countedSessions = { ...counters.countedSessions, [sessionId]: { stage: 3 as const, projection: "link_plus_action" as const } };
  const stage3: Stage3ProgressionCounters = { completedLinkPlusActionCount: counters.stage3.completedLinkPlusActionCount + 1 };
  return { kind: "applied", counters: { ...counters, stage3, countedSessions } };
}

// ---------------------------------------------------------------------------
// Unlocking (availability, never forced advancement)
// ---------------------------------------------------------------------------

export type ProgressionCadence = "reactive" | "proactive";

/** Reactive: 10. Proactive: 5. Shared by every stage's own combined threshold below. */
function resolveCombinedThreshold(cadence: ProgressionCadence): number {
  return cadence === "reactive" ? 10 : 5;
}

/** Reactive: 3. Proactive: 2. Stage 2's own per-type minimum (Mini and Link each). */
function resolveStage2MinimumEach(cadence: ProgressionCadence): number {
  return cadence === "reactive" ? 3 : 2;
}

/** Stage 1 is always available -- there is nothing to unlock. */
export function isStage1Available(): true {
  return true;
}

/** Stage 2 unlocks purely from Stage 1's own combined Full+Mini count -- Stage 1 counts NEVER contribute to Stage 2, even for the same projection kind (Mini). */
export function isStage2Unlocked(counters: MappingProgressionCounters, cadence: ProgressionCadence): boolean {
  return counters.stage1.completedFullCount + counters.stage1.completedMiniCount >= resolveCombinedThreshold(cadence);
}

/** Stage 3 unlocks purely from Stage 2's own fresh Mini+Link counts, AND both per-type minimums. Reaching the combined total alone (e.g. 10 Mini, 0 Link) is never sufficient. */
export function isStage3Unlocked(counters: MappingProgressionCounters, cadence: ProgressionCadence): boolean {
  const combined = counters.stage2.completedMiniCount + counters.stage2.completedLinkCount;
  const minEach = resolveStage2MinimumEach(cadence);
  return combined >= resolveCombinedThreshold(cadence) && counters.stage2.completedMiniCount >= minEach && counters.stage2.completedLinkCount >= minEach;
}

/** Stage 4 unlocks purely from Stage 3's own valid compound-completion count. Terminal -- there is no Stage 5 to unlock from it. */
export function isStage4Unlocked(counters: MappingProgressionCounters, cadence: ProgressionCadence): boolean {
  return counters.stage3.completedLinkPlusActionCount >= resolveCombinedThreshold(cadence);
}

/** True for every stage that is currently AVAILABLE to practice -- never a claim about which stage the trainee "should" be on. See this module's own header doc: unlocking never forces or removes access to an earlier stage. */
export function isStageUnlocked(counters: MappingProgressionCounters, stage: ProgressionStage, cadence: ProgressionCadence): boolean {
  if (stage === 1) return true;
  if (stage === 2) return isStage2Unlocked(counters, cadence);
  if (stage === 3) return isStage3Unlocked(counters, cadence);
  return isStage4Unlocked(counters, cadence);
}

/** The highest stage currently unlocked -- purely derived from the counters each time (never stored redundantly), so it can never drift out of sync with them. Monotonic by construction: every counter only ever increases via the idempotent apply functions above, so this value never decreases for a given `counters` history. */
export function resolveHighestUnlockedStage(counters: MappingProgressionCounters, cadence: ProgressionCadence): ProgressionStage {
  if (isStage4Unlocked(counters, cadence)) return 4;
  if (isStage3Unlocked(counters, cadence)) return 3;
  if (isStage2Unlocked(counters, cadence)) return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// Per-mapping progress store -- keyed by arc/projectionCompletion.ts's own
// (unmodified) ReactiveMappingProgressKey/ProactiveStateProgressKey
// stringifiers. Changing a mapping's linked State or Identity produces a
// different key string there, so progress under one key is never merged
// into another -- this module adds no new keying scheme of its own.
// ---------------------------------------------------------------------------

export type MappingProgressionStore = Record<string, MappingProgressionCounters>;

export function getOrCreateMappingProgress(store: MappingProgressionStore, key: string): MappingProgressionCounters {
  return store[key] ?? createEmptyMappingProgressionCounters();
}

export function setMappingProgress(store: MappingProgressionStore, key: string, counters: MappingProgressionCounters): MappingProgressionStore {
  return { ...store, [key]: counters };
}
