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
import type { BeneficialActionPolicy } from "./personalDevelopmentRouteConfig.ts";

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
  /**
   * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 1: the
   * route's own current position in the 4-stage Personal Development
   * mastery program -- Stage 1 (Full or Mini) -> Stage 2 (Mini only) ->
   * Stage 3 (ARC Link only, culminating in the SAME real, timed, confirmed
   * Beneficial Action -- never a separate Link action) -> Stage 4
   * (Beneficial Action only). One LIVE entry point serves all four stages;
   * this field alone is what a caller reads to decide which of them a
   * given route currently offers. See this module's own stage-resolver
   * section below for the exact advancement/demotion rules.
   */
  stage: PersonalDevelopmentRouteStage;
  /** Uniform 10-valid-completions threshold at every one of the three transitions -- explicitly NOT the old arc/reactiveProactiveProgression.ts ladder's asymmetric "10 reactive / 5 proactive". Each counter only ever increments for a session whose own frozen `stageAtStart` matches it AND whose action outcome is valid for that stage (see isRequiredActionOutcomeValidForMode) -- never for a session practiced at a different stage. */
  stage1ConfirmedCount: number;
  stage2ConfirmedCount: number;
  stage3ConfirmedCount: number;
  stage4ConfirmedCount: number;
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
    stage: 1,
    stage1ConfirmedCount: 0,
    stage2ConfirmedCount: 0,
    stage3ConfirmedCount: 0,
    stage4ConfirmedCount: 0,
    createdAt: now,
    updatedAt: now,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };
}

/**
 * Defensive backfill for a PersonalDevelopmentRouteProgress parsed from
 * storage -- mirrors arc/stateProfile.ts's own normalizeStateProfile
 * exactly (safe defaults, never invented content, never overwrites an
 * already-valid field). Every record saved before the 4-stage program
 * existed backfills to Stage 1 with all four confirmed-counts at 0 --
 * "no stage progress yet," never a guessed higher stage from
 * completedSessions or any other pre-existing counter.
 */
export function normalizePersonalDevelopmentRouteProgress(progress: PersonalDevelopmentRouteProgress): PersonalDevelopmentRouteProgress {
  return {
    ...progress,
    completedByInterferenceType: {
      thought: progress.completedByInterferenceType?.thought ?? 0,
      belief: progress.completedByInterferenceType?.belief ?? 0,
      emotion: progress.completedByInterferenceType?.emotion ?? 0,
      urge: progress.completedByInterferenceType?.urge ?? 0,
      presence: progress.completedByInterferenceType?.presence ?? 0,
    },
    embeddedPresenceUses: progress.embeddedPresenceUses ?? 0,
    fullPresenceCompletions: progress.fullPresenceCompletions ?? 0,
    completedFullSessions: progress.completedFullSessions ?? 0,
    completedMiniSessions: progress.completedMiniSessions ?? 0,
    countedSessionIds: Array.isArray(progress.countedSessionIds) ? progress.countedSessionIds : [],
    stage: isValidRouteStageProjection(progress.stage) ? progress.stage : 1,
    stage1ConfirmedCount: progress.stage1ConfirmedCount ?? 0,
    stage2ConfirmedCount: progress.stage2ConfirmedCount ?? 0,
    stage3ConfirmedCount: progress.stage3ConfirmedCount ?? 0,
    stage4ConfirmedCount: progress.stage4ConfirmedCount ?? 0,
    schemaVersion: progress.schemaVersion ?? 1,
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
 *
 * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 8:
 * beneficialActionPolicy-aware. "required" (the default, every route
 * saved before this policy existed) preserves the exact original
 * behavior below -- only genuine completion satisfies a role.
 * "optional_in_live" additionally accepts an explicit skip
 * (arc/combinedLiveSession.ts's own skipActionCompleted) as satisfying a
 * role -- never a silent default, always the trainee's own explicit
 * choice. "none" means the route's one Beneficial/Regulating Action role
 * is absent ENTIRELY (PersonalDevelopmentRouteConfig.beneficialActionPolicy's
 * own doc) -- once the ordinary session-level checks above pass, there is
 * nothing further to validate about an action that was never offered.
 */
export function validateCombinedSessionFactsForCompletion(facts: CombinedLiveSessionFacts): ValidateCombinedSessionFactsResult {
  if (!facts.terminalCompleted) return { valid: false, reason: "not_terminal" };
  if (isBlank(facts.sessionId)) return { valid: false, reason: "missing_session_id" };
  if (isBlank(facts.routeConfigId)) return { valid: false, reason: "missing_route_config_id" };
  if (facts.cadence !== "reactive") return { valid: false, reason: "proactive_not_yet_supported" };
  if (facts.primaryFactorId === null && facts.selectedItemIds.length > 0) return { valid: false, reason: "unresolved_primary_factor" };
  if (facts.actionOutcomeKind === null) return { valid: false, reason: "action_outcome_missing" };
  if (facts.beneficialActionPolicy === "none") return { valid: true };

  const satisfied = (completed: boolean, skipped: boolean) => completed || (facts.beneficialActionPolicy === "optional_in_live" && skipped);

  switch (facts.actionOutcomeKind) {
    case "unavailable":
      return { valid: false, reason: "action_outcome_unavailable" };
    case "factor_only":
      if (!satisfied(facts.factorActionCompleted, facts.factorActionSkipped)) return { valid: false, reason: "factor_action_not_completed" };
      break;
    case "state_only":
      if (!satisfied(facts.stateActionCompleted, facts.stateActionSkipped)) return { valid: false, reason: "state_action_not_completed" };
      break;
    case "shared_explicit":
      if (!satisfied(facts.sharedActionCompleted, facts.sharedActionSkipped)) return { valid: false, reason: "shared_action_not_completed" };
      break;
    case "state_then_factor":
      if (!satisfied(facts.stateActionCompleted, facts.stateActionSkipped)) return { valid: false, reason: "state_action_not_completed" };
      if (!satisfied(facts.factorActionCompleted, facts.factorActionSkipped)) return { valid: false, reason: "factor_action_not_completed" };
      break;
    case "legacy_shared_state_fallback":
      // Renders and completes as role "state" (arc/combinedLiveSession.ts's own
      // resolveActionRoleProgress) -- "record the legacy fallback kind" never
      // "pretend a new explicit relationship was configured."
      if (!satisfied(facts.stateActionCompleted, facts.stateActionSkipped)) return { valid: false, reason: "state_action_not_completed" };
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

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task (unified PD/ARC Goal), Phase 1: the 4-stage
// Personal Development mastery program -- one LIVE entry point, uniform
// 10-valid-completions threshold at every transition, single authoritative
// store (this record), zero replay of old sessions on a policy change.
// ---------------------------------------------------------------------------

export type PersonalDevelopmentRouteStage = 1 | 2 | 3 | 4;

/** Same threshold at all three transitions (1->2, 2->3, 3->4) -- deliberately uniform, not the old ladder's asymmetric split. */
const STAGE_ADVANCEMENT_THRESHOLD = 10;

/**
 * beneficialActionPolicy "none" means this route has no real Beneficial
 * Action for Stage 3's Link to culminate in and no action for Stage 4 to
 * practice -- so a route configured this way can never sit above Stage 2,
 * however high its stage2ConfirmedCount climbs.
 */
const MAX_STAGE_WITHOUT_BENEFICIAL_ACTION: PersonalDevelopmentRouteStage = 2;

export function isValidRouteStageProjection(value: unknown): value is PersonalDevelopmentRouteStage {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

/**
 * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 1: the
 * per-session outcome of the route's one Beneficial/Regulating Action
 * role, governed by PersonalDevelopmentRouteConfig.beneficialActionPolicy
 * (arc/personalDevelopmentRouteConfig.ts). "required" can only ever
 * resolve to "required_completed" (the action is never skippable when
 * required); "optional_in_live" resolves to either "optional_completed" or
 * "optional_skipped"; "none" always resolves to "disabled". "unavailable_legacy"
 * is reserved for a session whose action outcome could not be resolved at
 * all (mirrors arc/factorAction.ts's own ActionResolutionOutcome
 * "unavailable") -- distinct from "disabled", which is a deliberate policy
 * choice, never a resolution failure.
 */
export type BeneficialActionOutcome = "required_completed" | "optional_completed" | "optional_skipped" | "disabled" | "unavailable_legacy";

/**
 * Whether a just-completed session's own action outcome counts as a VALID
 * confirmed completion for stage-advancement purposes at the stage it was
 * actually practiced (`stageAtStart`) -- distinct from
 * validateCombinedSessionFactsForCompletion above, which governs whether a
 * session counts toward completedSessions AT ALL. Stage 3 and Stage 4 both
 * culminate in the SAME real, timed, explicitly confirmed Beneficial
 * Action (never a separate "Link action"), so both require exactly
 * "required_completed". Stage 1/2 carry no such requirement: any
 * already-validated terminal completion counts toward them regardless of
 * its own action outcome, since a route may run with beneficialActionPolicy
 * "optional_in_live" or "none" and still practice Stage 1/2 normally.
 */
export function isRequiredActionOutcomeValidForMode(stage: PersonalDevelopmentRouteStage, beneficialActionOutcome: BeneficialActionOutcome | null): boolean {
  if (stage === 3 || stage === 4) return beneficialActionOutcome === "required_completed";
  return true;
}

/**
 * The highest stage `progress`'s OWN counters justify right now, capped by
 * `beneficialActionPolicy`. Shared verbatim by both the normal
 * post-session advancement path (applyStageProgressionToRouteProgress
 * below) and the policy-restoration path (reconcileRouteStageForPolicyChange
 * below) -- one cascade, one source of truth for "what stage does this
 * route's own history justify." A route can only ever have accumulated a
 * stage-N confirmed count by having actually practiced at stage N, which
 * requires the policy cap to have permitted stage N at the time -- so this
 * can never fabricate a jump across a stage the route never actually
 * reached.
 */
export function resolveEligibleStageAdvancement(progress: PersonalDevelopmentRouteProgress, beneficialActionPolicy: BeneficialActionPolicy): PersonalDevelopmentRouteStage {
  const cap: PersonalDevelopmentRouteStage = beneficialActionPolicy === "none" ? MAX_STAGE_WITHOUT_BENEFICIAL_ACTION : 4;

  let stage = progress.stage;
  if (stage === 1 && progress.stage1ConfirmedCount >= STAGE_ADVANCEMENT_THRESHOLD && cap >= 2) stage = 2;
  if (stage === 2 && progress.stage2ConfirmedCount >= STAGE_ADVANCEMENT_THRESHOLD && cap >= 3) stage = 3;
  if (stage === 3 && progress.stage3ConfirmedCount >= STAGE_ADVANCEMENT_THRESHOLD && cap >= 4) stage = 4;
  return stage;
}

/**
 * The reverse of resolveEligibleStageAdvancement -- when
 * `beneficialActionPolicy` moves to "none" while a route already sits at
 * Stage 3 or 4, this returns the safe demotion target
 * (MAX_STAGE_WITHOUT_BENEFICIAL_ACTION). "Preserving all historical
 * counters" means exactly that: this function only ever proposes a new
 * `stage` value, never resets or clears stage3ConfirmedCount/
 * stage4ConfirmedCount, so a later policy restoration has the untouched
 * history to cascade back up from. A no-op (returns `currentStage`
 * unchanged) whenever the policy isn't "none" or the route is already at
 * or below Stage 2.
 */
export function resolvePolicyDemotion(currentStage: PersonalDevelopmentRouteStage, beneficialActionPolicy: BeneficialActionPolicy): PersonalDevelopmentRouteStage {
  if (beneficialActionPolicy !== "none") return currentStage;
  return currentStage > MAX_STAGE_WITHOUT_BENEFICIAL_ACTION ? MAX_STAGE_WITHOUT_BENEFICIAL_ACTION : currentStage;
}

/**
 * The one entry point a BUILD-side policy-change caller (the route config
 * editor) needs -- handles both directions symmetrically: a demotion
 * (resolvePolicyDemotion) when the new policy is "none" and the route sits
 * above Stage 2, or an automatic restoration cascade
 * (resolveEligibleStageAdvancement) when the new policy re-enables Stage
 * 3/4 and the route's own already-accumulated counters justify moving back
 * up immediately -- zero replay of old sessions either way. Never touches
 * any *ConfirmedCount field, only `stage` and `updatedAt`. Returns the
 * exact same `progress` object (no new identity) when the current stage
 * already matches what the new policy justifies.
 */
export function reconcileRouteStageForPolicyChange(
  progress: PersonalDevelopmentRouteProgress,
  newBeneficialActionPolicy: BeneficialActionPolicy,
  now: string
): PersonalDevelopmentRouteProgress {
  const demoted = resolvePolicyDemotion(progress.stage, newBeneficialActionPolicy);
  const target = demoted !== progress.stage ? demoted : resolveEligibleStageAdvancement(progress, newBeneficialActionPolicy);
  if (target === progress.stage) return progress;
  return { ...progress, stage: target, updatedAt: now };
}

export interface StageProgressionApplyResult {
  progress: PersonalDevelopmentRouteProgress;
  stageAdvanced: boolean;
}

/**
 * The single write path for the 4-stage counters -- called once per
 * newly-applied (never duplicate) combined session completion, immediately
 * after applyCombinedSessionCompletionToProgress above. `stageAtStart` is
 * the session's OWN frozen stage (captured once at session-plan
 * resolution, never re-derived from the route's current stage, which may
 * have already moved on mid-session) -- a session always counts toward the
 * stage it was actually practiced at, never the route's stage at
 * completion time.
 *
 * A session whose action outcome fails isRequiredActionOutcomeValidForMode
 * for `stageAtStart` still counts toward completedSessions (already
 * applied by the caller before this is ever called) but never toward
 * stage advancement -- so a Stage 3/4 run that never reached a real
 * confirmed Beneficial Action can never quietly advance the route.
 */
export function applyStageProgressionToRouteProgress(
  progress: PersonalDevelopmentRouteProgress,
  stageAtStart: PersonalDevelopmentRouteStage,
  beneficialActionOutcome: BeneficialActionOutcome | null,
  beneficialActionPolicy: BeneficialActionPolicy,
  now: string
): StageProgressionApplyResult {
  if (!isRequiredActionOutcomeValidForMode(stageAtStart, beneficialActionOutcome)) {
    return { progress, stageAdvanced: false };
  }

  const incremented: PersonalDevelopmentRouteProgress = {
    ...progress,
    stage1ConfirmedCount: progress.stage1ConfirmedCount + (stageAtStart === 1 ? 1 : 0),
    stage2ConfirmedCount: progress.stage2ConfirmedCount + (stageAtStart === 2 ? 1 : 0),
    stage3ConfirmedCount: progress.stage3ConfirmedCount + (stageAtStart === 3 ? 1 : 0),
    stage4ConfirmedCount: progress.stage4ConfirmedCount + (stageAtStart === 4 ? 1 : 0),
    updatedAt: now,
  };

  const eligibleStage = resolveEligibleStageAdvancement(incremented, beneficialActionPolicy);
  if (eligibleStage === incremented.stage) return { progress: incremented, stageAdvanced: false };
  return { progress: { ...incremented, stage: eligibleStage, updatedAt: now }, stageAdvanced: true };
}
