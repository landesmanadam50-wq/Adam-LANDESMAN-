/**
 * arc/personalDevelopmentRouteProgress.ts
 *
 * Adaptive ARC architecture task, Phase 15: durable per-route completion
 * counting for the combined Personal Development LIVE architecture
 * (Phase 14B-4), keyed by PersonalDevelopmentRouteConfig.id -- never by a
 * single InterferenceItem/StateProfile mapping key the way
 * arc/reactiveProactiveProgression.ts's own Stage 1-4 system is.
 *
 * Deliberately a wholly separate, parallel counting system, not an
 * extension of arc/reactiveProactiveProgression.ts. That system's own
 * ProgressionMappingContext.item is typed InterferenceItem | null --
 * singular -- and its mapping-key resolver
 * (arc/progressionSessionBridge.ts's resolveProgressionMappingKey)
 * derives exactly one key from exactly one item id. A combined session
 * practices zero or more factors at once (arc/combinedLiveSessionFacts.ts's
 * own practicedItemIds/completedTypes), and there is no way to feed that
 * into the single-item system without either picking only the primary
 * factor (silently dropping secondary-factor credit) or fanning one
 * combined session out into several legacy "sessions" (inflating
 * completedSessions and corrupting that system's own per-mapping
 * semantics) -- both explicitly rejected. Stage 1-4 remains completely
 * untouched by this module; combined Full/Mini sessions never feed it.
 *
 * Terminal-facts sufficiency: every "must not count" rule below
 * (unresolved primary factor, unresolved State decision, an unavailable
 * action outcome, an incomplete Full Presence sub-session, back
 * navigation/abandonment) is ALREADY structurally impossible whenever
 * CombinedLiveSessionFacts.terminalCompleted is true -- arc/combinedLiveSession.ts's
 * own pure state machine only ever sets terminalCompleted true from
 * advanceTail's own "complete" branch, which is only reachable once the
 * plan has genuinely resolved (no open primary-factor/State decision),
 * every required action has been explicitly confirmed (never merely
 * reached or timer-completed), and -- when Full Presence was required --
 * completeFullPresenceSubSession has actually been called (only ever
 * invoked by the screen once the nested engine reaches its own real
 * PRESENCE_EXIT_STAGE). No additional terminal fact is added here: the
 * existing combination of `terminalCompleted` and `presenceMode` is
 * treated as the authoritative proof that the selected Presence route
 * (embedded or full) actually completed, per the approved Phase 15 plan.
 * The one thing this module DOES still check independently (since the
 * validator only ever sees the facts object, never controller internals)
 * is that `actionOutcomeKind` and the reached/completed flags are mutually
 * consistent -- see validateCombinedSessionFactsForCompletion's own
 * per-kind table below.
 *
 * Pure logic only -- no storage import, no data/ import. See
 * data/personalDevelopmentRouteProgressPersistence.ts for the wrapper
 * that loads/saves the store and calls into this module.
 */

import type { CombinedLiveSessionFacts } from "./combinedLiveSessionFacts.ts";

// ---------------------------------------------------------------------------
// The durable route-level progress record
// ---------------------------------------------------------------------------

export interface PersonalDevelopmentRouteInterferenceTypeCounts {
  thought: number;
  belief: number;
  emotion: number;
  urge: number;
  /** Increments once per session whenever EITHER embedded or Full Presence actually completed (never for "skipped" or an unreached gate) -- the same "one per-type completion per session" rule as the four factor categories above, not a duplicate of embeddedPresenceUses/fullPresenceCompletions (those are the separate, mutually exclusive fine-grained breakdown of WHICH kind of Presence ran). */
  presence: number;
}

export interface PersonalDevelopmentRouteProgress {
  routeConfigId: string;
  completedSessions: number;
  completedByInterferenceType: PersonalDevelopmentRouteInterferenceTypeCounts;
  /** Full's own optional in-cognitive-route Presence AND Mini's compact presence_intervention step both count here -- see arc/combinedLiveSessionFacts.ts's own doc: Mini has no separate full/optional concept, its own Presence practice is always the compact/embedded-style content. */
  embeddedPresenceUses: number;
  /** Full only -- the reused, full ARC Presence protocol actually completed via its nested sub-session. Mutually exclusive with embeddedPresenceUses within any one session (a session's own presenceMode is a single value, never both). */
  fullPresenceCompletions: number;
  completedFullSessions: number;
  completedMiniSessions: number;
  /** The authoritative per-route idempotency ledger -- a sessionId already present here is never re-counted. */
  countedSessionIds: string[];
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
}

const CURRENT_SCHEMA_VERSION = 1;

export function createEmptyPersonalDevelopmentRouteProgress(routeConfigId: string, now: string): PersonalDevelopmentRouteProgress {
  return {
    routeConfigId,
    completedSessions: 0,
    completedByInterferenceType: { thought: 0, belief: 0, emotion: 0, urge: 0, presence: 0 },
    embeddedPresenceUses: 0,
    fullPresenceCompletions: 0,
    completedFullSessions: 0,
    completedMiniSessions: 0,
    countedSessionIds: [],
    createdAt: now,
    updatedAt: now,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Terminal-facts validity
// ---------------------------------------------------------------------------

export type CombinedSessionFactsInvalidReason =
  | "not_terminal"
  | "missing_session_id"
  | "missing_route_config_id"
  | "proactive_not_yet_supported"
  | "unresolved_primary_factor"
  | "action_outcome_missing"
  | "action_outcome_unavailable"
  | "state_action_not_completed"
  | "factor_action_not_completed"
  | "shared_action_not_completed";

export type ValidateCombinedSessionFactsResult = { valid: true } | { valid: false; reason: CombinedSessionFactsInvalidReason };

function isBlank(value: string | null | undefined): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

/**
 * Only a genuinely terminal, internally consistent facts object passes.
 * Never inferred from any single field alone -- terminalCompleted is the
 * umbrella proof (see this module's own header doc for why every other
 * "must not count" rule is already structurally subsumed by it); the
 * per-actionOutcomeKind table below is the one thing this validator must
 * still check independently, since the facts object -- not controller
 * internals -- is all a persistence-layer caller ever sees.
 */
export function validateCombinedSessionFactsForCompletion(facts: CombinedLiveSessionFacts): ValidateCombinedSessionFactsResult {
  if (!facts.terminalCompleted) return { valid: false, reason: "not_terminal" };
  if (isBlank(facts.sessionId)) return { valid: false, reason: "missing_session_id" };
  if (isBlank(facts.routeConfigId)) return { valid: false, reason: "missing_route_config_id" };
  if (facts.cadence !== "reactive") return { valid: false, reason: "proactive_not_yet_supported" };
  if (facts.primaryFactorId === null && facts.selectedItemIds.length > 0) return { valid: false, reason: "unresolved_primary_factor" };
  if (facts.actionOutcomeKind === null) return { valid: false, reason: "action_outcome_missing" };

  switch (facts.actionOutcomeKind) {
    case "unavailable":
      return { valid: false, reason: "action_outcome_unavailable" };
    case "factor_only":
      if (!facts.factorActionCompleted) return { valid: false, reason: "factor_action_not_completed" };
      break;
    case "state_only":
      if (!facts.stateActionCompleted) return { valid: false, reason: "state_action_not_completed" };
      break;
    case "shared_explicit":
      if (!facts.sharedActionCompleted) return { valid: false, reason: "shared_action_not_completed" };
      break;
    case "state_then_factor":
      if (!facts.stateActionCompleted) return { valid: false, reason: "state_action_not_completed" };
      if (!facts.factorActionCompleted) return { valid: false, reason: "factor_action_not_completed" };
      break;
    case "legacy_shared_state_fallback":
      // Renders and completes as role "state" (arc/combinedLiveSession.ts's own
      // resolveActionRoleProgress) -- "record the legacy fallback kind" never
      // "pretend a new explicit relationship was configured."
      if (!facts.stateActionCompleted) return { valid: false, reason: "state_action_not_completed" };
      break;
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Pure apply function
// ---------------------------------------------------------------------------

export type RecordCombinedSessionOutcome =
  | { kind: "applied"; progress: PersonalDevelopmentRouteProgress }
  | { kind: "duplicate_session"; progress: PersonalDevelopmentRouteProgress }
  | { kind: "invalid_completion"; reason: string };

/**
 * One immutable apply, never several independent field writes. Validates
 * first, then checks the per-route idempotency ledger, then applies every
 * counter increment in a single new object. `progress` must already
 * belong to `facts.routeConfigId` -- a caller-contract mismatch is
 * reported as "invalid_completion" defensively, never silently
 * misattributed to the wrong route.
 */
export function applyCombinedSessionCompletionToProgress(
  progress: PersonalDevelopmentRouteProgress,
  facts: CombinedLiveSessionFacts,
  now: string
): RecordCombinedSessionOutcome {
  const validation = validateCombinedSessionFactsForCompletion(facts);
  if (!validation.valid) return { kind: "invalid_completion", reason: validation.reason };
  if (progress.routeConfigId !== facts.routeConfigId) return { kind: "invalid_completion", reason: "route_config_mismatch" };
  if (progress.countedSessionIds.includes(facts.sessionId)) return { kind: "duplicate_session", progress };

  const practicedTypes = new Set(facts.completedTypes);
  const presenceCompleted = facts.presenceMode === "embedded" || facts.presenceMode === "full";

  const completedByInterferenceType: PersonalDevelopmentRouteInterferenceTypeCounts = {
    thought: progress.completedByInterferenceType.thought + (practicedTypes.has("thought") ? 1 : 0),
    belief: progress.completedByInterferenceType.belief + (practicedTypes.has("belief") ? 1 : 0),
    emotion: progress.completedByInterferenceType.emotion + (practicedTypes.has("emotion") ? 1 : 0),
    urge: progress.completedByInterferenceType.urge + (practicedTypes.has("urge") ? 1 : 0),
    presence: progress.completedByInterferenceType.presence + (presenceCompleted ? 1 : 0),
  };

  const updated: PersonalDevelopmentRouteProgress = {
    ...progress,
    completedSessions: progress.completedSessions + 1,
    completedByInterferenceType,
    embeddedPresenceUses: progress.embeddedPresenceUses + (facts.presenceMode === "embedded" ? 1 : 0),
    fullPresenceCompletions: progress.fullPresenceCompletions + (facts.presenceMode === "full" ? 1 : 0),
    completedFullSessions: progress.completedFullSessions + (facts.mode === "full" ? 1 : 0),
    completedMiniSessions: progress.completedMiniSessions + (facts.mode === "mini" ? 1 : 0),
    countedSessionIds: [...progress.countedSessionIds, facts.sessionId],
    updatedAt: now,
  };

  return { kind: "applied", progress: updated };
}
