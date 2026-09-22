/**
 * arc/arcGoalSessionProgress.ts
 *
 * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 3: durable
 * per-goal completion counting for ArcGoal LIVE sessions, keyed by
 * ArcGoal.id -- ArcGoal's own analog to arc/personalDevelopmentRouteProgress.ts,
 * built because Phase 2's research confirmed NO persisted per-session
 * ArcGoal progress exists anywhere today (only ArcGoalTarget occurrence
 * completions, four-week-program state, and routine/weekly-action
 * linking -- none of which count "how many times was this ArcGoal LIVE
 * session actually completed").
 *
 * Deliberately a separate, parallel store from
 * PersonalDevelopmentRouteProgress -- "each track keeping its own domain
 * records/validation/progress/navigation" (the approved unified
 * architecture's own governing principle), never a shared or merged
 * counter. Also deliberately NOT a 4-stage mastery program the way
 * PersonalDevelopmentRouteProgress's stage fields are: that ladder exists
 * specifically because of PersonalDevelopmentRouteConfig.beneficialActionPolicy
 * (required/optional_in_live/none), a PD-only concept ArcGoal has no
 * equivalent of -- inventing an analogous staged ladder here without an
 * approved spec for it would be exactly the kind of unverified addition
 * the approved plan asks to avoid. This module only ever counts genuine
 * completions; a later, separately approved phase can layer staging on
 * top of it if the plan is extended to call for one.
 *
 * Consumes arc/sharedLiveSessionFacts.ts's own ArcGoalSharedFacts --
 * never reads ArcLiveState/ArcGoalLiveState directly, exactly mirroring
 * how arc/personalDevelopmentRouteProgress.ts consumes CombinedLiveSessionFacts
 * rather than CombinedLiveSessionState.
 *
 * Pure logic only -- no storage import, no data/ import. See
 * data/arcGoalSessionProgressPersistence.ts for the wrapper that loads/
 * saves the store and calls into this module.
 */

import type { ArcGoalMappingKind, ArcGoalSharedFacts } from "./sharedLiveSessionFacts.ts";

// ---------------------------------------------------------------------------
// The durable per-goal progress record
// ---------------------------------------------------------------------------

export interface ArcGoalSessionMappingKindCounts {
  interfering: number;
  urge: number;
  thought: number;
  belief: number;
  /** A completed session with no bridge selected at all -- an identity-only pass (mappingKind null on the facts). Not one of ArcGoalMappingKind's own values, kept as its own named field for the same reason PersonalDevelopmentRouteInterferenceTypeCounts.presence is kept separate from its four factor categories. */
  identityOnly: number;
}

export interface ArcGoalSessionProgress {
  arcGoalId: string;
  completedSessions: number;
  completedByMappingKind: ArcGoalSessionMappingKindCounts;
  /** How many completed sessions were launched from a linked ScheduledRoutine WeeklyAction (facts.weeklyActionId !== null) -- never double-counted against completedSessions, a breakdown of it. */
  completedFromWeeklyAction: number;
  /** The authoritative per-goal idempotency ledger -- a sessionId already present here is never re-counted. */
  countedSessionIds: string[];
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
}

const CURRENT_SCHEMA_VERSION = 1;

export function createEmptyArcGoalSessionProgress(arcGoalId: string, now: string): ArcGoalSessionProgress {
  return {
    arcGoalId,
    completedSessions: 0,
    completedByMappingKind: { interfering: 0, urge: 0, thought: 0, belief: 0, identityOnly: 0 },
    completedFromWeeklyAction: 0,
    countedSessionIds: [],
    createdAt: now,
    updatedAt: now,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

/**
 * Defensive backfill for an ArcGoalSessionProgress parsed from storage --
 * mirrors arc/personalDevelopmentRouteProgress.ts's own
 * normalizePersonalDevelopmentRouteProgress exactly (safe defaults, never
 * invented content, never overwrites an already-valid field).
 */
export function normalizeArcGoalSessionProgress(progress: ArcGoalSessionProgress): ArcGoalSessionProgress {
  return {
    ...progress,
    completedSessions: progress.completedSessions ?? 0,
    completedByMappingKind: {
      interfering: progress.completedByMappingKind?.interfering ?? 0,
      urge: progress.completedByMappingKind?.urge ?? 0,
      thought: progress.completedByMappingKind?.thought ?? 0,
      belief: progress.completedByMappingKind?.belief ?? 0,
      identityOnly: progress.completedByMappingKind?.identityOnly ?? 0,
    },
    completedFromWeeklyAction: progress.completedFromWeeklyAction ?? 0,
    countedSessionIds: Array.isArray(progress.countedSessionIds) ? progress.countedSessionIds : [],
    schemaVersion: progress.schemaVersion ?? 1,
  };
}

// ---------------------------------------------------------------------------
// Terminal-facts validity
// ---------------------------------------------------------------------------

export type ArcGoalSessionFactsInvalidReason = "not_terminal" | "missing_session_id" | "missing_arc_goal_id" | "identity_action_not_completed";

export type ValidateArcGoalSharedFactsResult = { valid: true } | { valid: false; reason: ArcGoalSessionFactsInvalidReason };

function isBlank(value: string | null | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

/**
 * Only a genuinely terminal, genuinely-confirmed facts object passes.
 * `terminalCompleted` is the umbrella proof (see ArcGoalSharedFacts's own
 * doc for why it's caller-supplied rather than derived from engine state);
 * `identityActionCompleted` is checked independently because
 * ArcLiveState's own doc is explicit that "the trainee confirmed they
 * actually performed the real-world action" is "the only thing that earns
 * Training Day credit" -- terminalCompleted alone (goal_action_confirm
 * reached and confirmed) does not by itself prove the EARLIER identity
 * action was ever confirmed, so both are required.
 */
export function validateArcGoalSharedFactsForCompletion(facts: ArcGoalSharedFacts): ValidateArcGoalSharedFactsResult {
  if (!facts.terminalCompleted) return { valid: false, reason: "not_terminal" };
  if (isBlank(facts.sessionId)) return { valid: false, reason: "missing_session_id" };
  if (isBlank(facts.arcGoalId)) return { valid: false, reason: "missing_arc_goal_id" };
  if (!facts.identityActionCompleted) return { valid: false, reason: "identity_action_not_completed" };
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Pure apply function
// ---------------------------------------------------------------------------

export type RecordArcGoalSessionOutcome =
  | { kind: "applied"; progress: ArcGoalSessionProgress }
  | { kind: "duplicate_session"; progress: ArcGoalSessionProgress }
  | { kind: "invalid_completion"; reason: string };

function mappingKindCountKey(mappingKind: ArcGoalMappingKind | null): keyof ArcGoalSessionMappingKindCounts {
  return mappingKind ?? "identityOnly";
}

/**
 * One immutable apply, never several independent field writes. Validates
 * first, then checks the per-goal idempotency ledger, then applies every
 * counter increment in a single new object. `progress` must already
 * belong to `facts.arcGoalId` -- a caller-contract mismatch is reported as
 * "invalid_completion" defensively, never silently misattributed to the
 * wrong goal. Mirrors arc/personalDevelopmentRouteProgress.ts's own
 * applyCombinedSessionCompletionToProgress exactly.
 */
export function applyArcGoalSessionCompletionToProgress(progress: ArcGoalSessionProgress, facts: ArcGoalSharedFacts, now: string): RecordArcGoalSessionOutcome {
  const validation = validateArcGoalSharedFactsForCompletion(facts);
  if (!validation.valid) return { kind: "invalid_completion", reason: validation.reason };
  if (progress.arcGoalId !== facts.arcGoalId) return { kind: "invalid_completion", reason: "arc_goal_id_mismatch" };
  if (progress.countedSessionIds.includes(facts.sessionId)) return { kind: "duplicate_session", progress };

  const kindKey = mappingKindCountKey(facts.mappingKind);
  const updated: ArcGoalSessionProgress = {
    ...progress,
    completedSessions: progress.completedSessions + 1,
    completedByMappingKind: {
      ...progress.completedByMappingKind,
      [kindKey]: progress.completedByMappingKind[kindKey] + 1,
    },
    completedFromWeeklyAction: progress.completedFromWeeklyAction + (facts.weeklyActionId !== null ? 1 : 0),
    countedSessionIds: [...progress.countedSessionIds, facts.sessionId],
    updatedAt: now,
  };

  return { kind: "applied", progress: updated };
}
