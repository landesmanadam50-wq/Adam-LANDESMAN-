/**
 * arc/combinedFactorPlan.ts
 *
 * Adaptive ARC architecture task, Phase 14B-3: the ONE authoritative
 * semantic resolver for a combined Personal Development route -- never
 * "projection" (that word is already taken by the unrelated, older
 * single-item Full/Mini/Link/Action-only system in
 * arc/libraryProjectionContent.ts/arc/projectionCompletion.ts, which
 * this module neither reads from nor writes to). Full and Mini never
 * drift apart because both arc/combinedFullPlan.ts and
 * arc/combinedMiniPlan.ts derive their own step sequence from the exact
 * same ResolvedCombinedFactorPlan this module produces -- neither
 * deriver ever re-resolves a factor/State/action decision itself.
 *
 * Two genuinely LIVE-time decisions cannot be pre-resolved by this pure
 * planner alone -- the primary factor (Full: which baseline rating won,
 * only known once afterAwareness ratings exist; Mini: a direct choice
 * among several selected factors) and, for stateInclusionPolicy
 * "decide_in_live", whether the one configured candidate State actually
 * participates. Both are modeled as their own typed, named stages
 * ("needs_primary_factor"/"needs_state_decision") rather than left
 * implicit -- the type system itself prevents building a "resolved"
 * plan while either is still open: ResolvedCombinedFactorPlan's own
 * primaryFactorId/stateIncluded fields only exist on that one variant,
 * never a half-built shape a caller could mistake for final. No final
 * action step is ever derived (arc/combinedFullPlan.ts/
 * arc/combinedMiniPlan.ts) before a "resolved" result exists.
 *
 * Pure logic only -- nothing in this repository calls anything below
 * yet (no LIVE/screen wiring in this phase).
 */

import type { InterferenceCategory, InterferenceItem } from "./interferenceItem.ts";
import { isInterferenceItemCompleteForPractice } from "./interferenceItem.ts";
import { isLibraryItemEnabled } from "./libraryItemStatus.ts";
import type { PersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import { resolveActionRelationshipForItem, validatePersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import type { StateProfile } from "./stateProfile.ts";
import { isStateProfileCompleteForPractice } from "./stateProfile.ts";
import type { PresenceArc } from "./types.ts";
import { isPresenceArcReadyForCombinedRoute } from "./presenceArcs.ts";
import { resolveStateInclusion } from "./stateInclusion.ts";
import type { ActionResolutionOutcome } from "./factorAction.ts";
import { resolveEmotionActionOutcome, resolveFactorActionOutcome, resolvePresenceActionOutcome } from "./factorAction.ts";
import { isPreventiveStoppingRelevantForInterferenceItem } from "./arcStateComposer.ts";
import { BASELINE_TIE_QUESTION } from "./factorRating.ts";

export type CombinedFactorMode = "full" | "mini";

/** Mini's own direct-selection question -- never a rating-derived tie (Mini has no ratings at all, see arc/combinedMiniPlan.ts's own header doc). */
export const MINI_PRIMARY_FACTOR_QUESTION = "במה היית רוצה להתמקד עכשיו?";

/** The exact required decide_in_live question -- LIVE decides only whether to use the one configured candidate State, never which State to choose. */
export const STATE_DECISION_QUESTION = "האם נדרש גם מעבר למצב רצוי תומך?";

export interface ResolvedCombinedFactor {
  itemId: string;
  category: InterferenceCategory;
  /** This factor's own candidate action outcome -- ALWAYS computed and stored for every selected factor, never only for the primary one. Whether it is actually rendered as a final action step is a separate, later decision (arc/combinedFullPlan.ts/arc/combinedMiniPlan.ts only ever emit the PRIMARY factor's own outcome -- see this module's own header doc, "secondary-factor actions remain stored but do not appear automatically"). */
  actionOutcome: ActionResolutionOutcome;
  /** Urge only -- item.preventiveStoppingAction non-blank. Always false for every other category. Stored here (rather than requiring the deriver to re-resolve the full InterferenceItem) so arc/combinedFullPlan.ts/arc/combinedMiniPlan.ts stay self-contained pure functions of ResolvedCombinedFactorPlan alone. */
  preventiveStoppingRelevant: boolean;
}

export interface ResolvedCombinedPresence {
  presenceArcId: string;
  actionOutcome: ActionResolutionOutcome;
}

/**
 * The one authoritative, fully-resolved semantic plan. Both decisions
 * this module can defer (primary factor, State inclusion) are ALREADY
 * final on this shape -- there is no "resolved but still pending" state;
 * see CombinedFactorPlanResult below for the staged alternative.
 */
export interface ResolvedCombinedFactorPlan {
  mode: CombinedFactorMode;
  /** Fixed canonical order -- see arc/combinedFullPlan.ts's RECOGNITION_CATEGORY_ORDER/arc/combinedMiniPlan.ts's own ordering for how each deriver walks this list; never reordered here. */
  factors: ResolvedCombinedFactor[];
  /** null only when zero factors are selected (a Presence-only route) -- Presence itself then becomes the de facto action source, see arc/combinedFullPlan.ts's own resolveCombinedActionSteps. */
  primaryFactorId: string | null;
  stateIncluded: boolean;
  /** The resolved StateProfile's own action, only when stateIncluded -- null otherwise. Never read directly by a deriver; always reached through a factor's/Presence's own actionOutcome, which already encodes how it combines with the State action. */
  resolvedStateAction: string | null;
  presence: ResolvedCombinedPresence | null;
}

/** Everything already known before either open decision resolves -- informational only, action outcomes computed as though no State participates (the only thing NOT yet knowable). Never used to derive a final action step. */
export interface UnresolvedCombinedFactorContext {
  factors: ResolvedCombinedFactor[];
  presence: ResolvedCombinedPresence | null;
}

export type CombinedFactorPlanInvalidReason =
  | "no_factors_configured"
  | "configured_item_not_found"
  | "configured_item_disabled"
  | "incomplete_v2_factor_action"
  | "v1_factor_missing_legacy_fallback"
  | "emotion_missing_complete_state"
  | "linked_requires_state_profile_id"
  | "linked_state_not_found"
  | "linked_state_incomplete"
  | "decide_in_live_requires_a_candidate_state_profile_id"
  | "decide_in_live_candidate_state_not_found"
  | "decide_in_live_candidate_incomplete"
  | "none_must_not_reference_a_state"
  | "presence_enabled_without_valid_action"
  | "missing_item_action_relationship"
  | "missing_action_relationship"
  | "action_outcome_unavailable";

export type CombinedFactorPlanResult =
  | { kind: "invalid"; reason: CombinedFactorPlanInvalidReason }
  | {
      kind: "needs_state_decision";
      candidateStateProfileId: string;
      question: typeof STATE_DECISION_QUESTION;
      context: UnresolvedCombinedFactorContext;
    }
  | {
      kind: "needs_primary_factor";
      candidates: string[];
      question: string;
      context: UnresolvedCombinedFactorContext;
    }
  | { kind: "resolved"; plan: ResolvedCombinedFactorPlan };

export interface CombinedFactorPlanInput {
  mode: CombinedFactorMode;
  config: PersonalDevelopmentRouteConfig;
  items: InterferenceItem[];
  stateProfiles: StateProfile[];
  presenceArcs: PresenceArc[];
  /**
   * Already resolved by the caller -- for Full, via
   * arc/factorRating.ts's own resolveBaselinePrimaryFactor against real
   * afterAwareness ratings (a LIVE-time concern this module never
   * simulates); for Mini, a direct trainee choice. null means "not yet
   * chosen" -- this resolver auto-resolves it only when at most one
   * factor is selected (nothing to choose between); otherwise it reports
   * "needs_primary_factor" rather than guessing.
   */
  primaryFactorId: string | null;
  /** Only consulted when the resolved StateInclusionPolicy is "decide_in_live". null means "not yet answered". */
  stateDecisionAnswer: boolean | null;
}

function resolveActionOutcomeForItem(item: InterferenceItem, config: PersonalDevelopmentRouteConfig, stateAction: string | null): ActionResolutionOutcome {
  if (item.category === "emotion") return resolveEmotionActionOutcome(stateAction);
  return resolveFactorActionOutcome(item, resolveActionRelationshipForItem(config, item.id), stateAction);
}

function buildUnresolvedContext(resolvedItems: InterferenceItem[], config: PersonalDevelopmentRouteConfig, presenceArcs: PresenceArc[]): UnresolvedCombinedFactorContext {
  const factors: ResolvedCombinedFactor[] = resolvedItems.map((item) => ({
    itemId: item.id,
    category: item.category,
    actionOutcome: resolveActionOutcomeForItem(item, config, null),
    preventiveStoppingRelevant: isPreventiveStoppingRelevantForInterferenceItem(item),
  }));
  let presence: ResolvedCombinedPresence | null = null;
  if (config.presenceEnabled && config.linkedPresenceArcId) {
    const presenceArc = presenceArcs.find((candidate) => candidate.id === config.linkedPresenceArcId);
    if (presenceArc) {
      presence = { presenceArcId: presenceArc.id, actionOutcome: resolvePresenceActionOutcome(presenceArc.beneficialAction, config.presenceActionRelationship, null) };
    }
  }
  return { factors, presence };
}

/**
 * The one authoritative resolver. Structural validity (item/State
 * references resolve at all) is delegated to
 * validatePersonalDevelopmentRouteConfig -- never reimplemented here.
 * Checks are ordered to match the actual chronological order a LIVE
 * session encounters them (primary-factor resolution always precedes
 * the State decision in both Full -- baseline ratings, very early -- and
 * Mini -- the opening choice), so a caller querying this resolver early
 * in a session sees the primary-factor need before ever being told about
 * a State decision still further ahead.
 */
export function resolveCombinedFactorPlan(input: CombinedFactorPlanInput): CombinedFactorPlanResult {
  const { mode, config, items, stateProfiles, presenceArcs } = input;

  const structural = validatePersonalDevelopmentRouteConfig(config, items, stateProfiles);
  if (!structural.valid) return { kind: "invalid", reason: (structural.reason ?? "no_factors_configured") as CombinedFactorPlanInvalidReason };

  const resolvedItems: InterferenceItem[] = [];
  for (const itemId of config.interferenceItemIds) {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) return { kind: "invalid", reason: "configured_item_not_found" };
    if (!isLibraryItemEnabled(item)) return { kind: "invalid", reason: "configured_item_disabled" };
    resolvedItems.push(item);
  }

  // Version-2 factor-action completeness is State-independent -- checked
  // now, before either open decision, so an otherwise-broken route is
  // never mistaken for "just needs a choice."
  for (const item of resolvedItems) {
    if (item.category === "emotion") continue;
    if (item.schemaVersion >= 2 && !isInterferenceItemCompleteForPractice(item, false)) {
      return { kind: "invalid", reason: "incomplete_v2_factor_action" };
    }
  }

  const hasEmotion = resolvedItems.some((item) => item.category === "emotion");

  // --- Primary factor (resolved before the State decision -- see this function's own doc) ---
  let primaryFactorId: string | null;
  if (input.primaryFactorId) {
    primaryFactorId = input.primaryFactorId;
  } else if (resolvedItems.length <= 1) {
    primaryFactorId = resolvedItems[0]?.id ?? null;
  } else {
    return {
      kind: "needs_primary_factor",
      candidates: resolvedItems.map((item) => item.id),
      question: mode === "full" ? BASELINE_TIE_QUESTION : MINI_PRIMARY_FACTOR_QUESTION,
      context: buildUnresolvedContext(resolvedItems, config, presenceArcs),
    };
  }

  // --- State inclusion ---
  const stateInclusion = resolveStateInclusion(config.stateInclusionPolicy, config.stateProfileId);
  let stateIncluded: boolean;
  let resolvedState: StateProfile | null = null;

  if (stateInclusion.kind === "none") {
    stateIncluded = false;
  } else if (stateInclusion.kind === "linked") {
    resolvedState = stateProfiles.find((candidate) => candidate.id === stateInclusion.stateProfileId) ?? null;
    if (!resolvedState || !isLibraryItemEnabled(resolvedState) || !isStateProfileCompleteForPractice(resolvedState)) {
      return { kind: "invalid", reason: "linked_state_incomplete" };
    }
    stateIncluded = true;
  } else {
    if (input.stateDecisionAnswer === null) {
      return {
        kind: "needs_state_decision",
        candidateStateProfileId: stateInclusion.candidateStateProfileId,
        question: STATE_DECISION_QUESTION,
        context: buildUnresolvedContext(resolvedItems, config, presenceArcs),
      };
    }
    if (hasEmotion && input.stateDecisionAnswer === false) {
      // Structurally unreachable today (validatePersonalDevelopmentRouteConfig
      // already rejects decide_in_live for an Emotion-containing route), kept
      // as an explicit defensive guard per the approved architecture's own
      // "Emotion cannot resolve to No" rule.
      return { kind: "invalid", reason: "emotion_missing_complete_state" };
    }
    if (input.stateDecisionAnswer === true) {
      resolvedState = stateProfiles.find((candidate) => candidate.id === stateInclusion.candidateStateProfileId) ?? null;
      if (!resolvedState || !isLibraryItemEnabled(resolvedState) || !isStateProfileCompleteForPractice(resolvedState)) {
        return { kind: "invalid", reason: "decide_in_live_candidate_incomplete" };
      }
      stateIncluded = true;
    } else {
      stateIncluded = false;
    }
  }

  const resolvedStateAction = stateIncluded ? (resolvedState?.action ?? null) : null;

  // --- Final per-factor action outcomes, now that the State action is genuinely known ---
  const factors: ResolvedCombinedFactor[] = [];
  for (const item of resolvedItems) {
    const outcome = resolveActionOutcomeForItem(item, config, resolvedStateAction);
    if (outcome.kind === "unavailable") {
      return { kind: "invalid", reason: item.category === "emotion" || item.schemaVersion >= 2 ? "action_outcome_unavailable" : "v1_factor_missing_legacy_fallback" };
    }
    if (stateIncluded && item.category !== "emotion" && (item.beneficialActionAgainstFactor ?? "").trim().length > 0) {
      if (resolveActionRelationshipForItem(config, item.id) === "legacy_unspecified") {
        return { kind: "invalid", reason: "missing_action_relationship" };
      }
    }
    factors.push({ itemId: item.id, category: item.category, actionOutcome: outcome, preventiveStoppingRelevant: isPreventiveStoppingRelevantForInterferenceItem(item) });
  }

  let presence: ResolvedCombinedPresence | null = null;
  if (config.presenceEnabled) {
    const presenceArc = presenceArcs.find((candidate) => candidate.id === config.linkedPresenceArcId);
    if (!presenceArc || !isPresenceArcReadyForCombinedRoute(presenceArc)) {
      return { kind: "invalid", reason: "presence_enabled_without_valid_action" };
    }
    const presenceOutcome = resolvePresenceActionOutcome(presenceArc.beneficialAction, config.presenceActionRelationship, resolvedStateAction);
    if (presenceOutcome.kind === "unavailable") return { kind: "invalid", reason: "action_outcome_unavailable" };
    if (stateIncluded && (config.presenceActionRelationship === null || config.presenceActionRelationship === "legacy_unspecified")) {
      return { kind: "invalid", reason: "missing_action_relationship" };
    }
    presence = { presenceArcId: presenceArc.id, actionOutcome: presenceOutcome };
  }

  if (factors.length === 0 && !presence) {
    return { kind: "invalid", reason: "no_factors_configured" };
  }

  return { kind: "resolved", plan: { mode, factors, primaryFactorId, stateIncluded, resolvedStateAction, presence } };
}

/**
 * Shared by arc/combinedFullPlan.ts and arc/combinedMiniPlan.ts --
 * "State action first, primary-factor action second, one action only
 * for a shared/legacy-fallback outcome." Only ever reads the PRIMARY
 * factor's own outcome (or Presence's, when there is no primary factor
 * at all -- a Presence-only route) -- every other factor's own stored
 * actionOutcome is never consulted here (see ResolvedCombinedFactor's
 * own doc: "secondary-factor actions remain stored but do not appear
 * automatically").
 */
export function resolveCombinedActionKinds(plan: ResolvedCombinedFactorPlan): ("state_action" | "factor_action")[] {
  const primaryOutcome = plan.primaryFactorId ? (plan.factors.find((factor) => factor.itemId === plan.primaryFactorId)?.actionOutcome ?? null) : (plan.presence?.actionOutcome ?? null);
  if (!primaryOutcome) return [];
  switch (primaryOutcome.kind) {
    case "state_only":
      return ["state_action"];
    case "factor_only":
    case "shared_explicit":
    case "legacy_shared_state_fallback":
      return ["factor_action"];
    case "state_then_factor":
      return ["state_action", "factor_action"];
    case "unavailable":
      return [];
  }
}
