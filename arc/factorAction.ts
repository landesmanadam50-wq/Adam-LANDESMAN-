/**
 * arc/factorAction.ts
 *
 * Adaptive ARC architecture task, Phase 14B-1 (action/State-relationship
 * data model): resolves which beneficial action a disturbing factor (or
 * Presence) actually runs within a combined Personal Development route,
 * honoring the version-aware compatibility model on InterferenceItem
 * (arc/interferenceItem.ts's own schemaVersion 1/2 split --
 * beneficialActionAgainstFactor is required for a practice-ready v2
 * Thought/Belief/Urge record, while a v1 record may fall back to the
 * route's ARC State action once) and the per-item ActionRelationship
 * owned by PersonalDevelopmentRouteConfig (arc/personalDevelopmentRouteConfig.ts)
 * -- never InterferenceItem itself, and never derived by comparing action
 * text (different wording can mean the same action; identical text can
 * later diverge; translated text isn't a stable identity check -- the
 * coach's explicit decision is meaningful data on its own).
 *
 * Emotion has no factor action of its own -- its final action IS the
 * route's required ARC State action (see resolveEmotionActionOutcome and
 * arc/interferenceItem.ts's own EmotionInterferenceItem doc).
 *
 * Pure logic only -- nothing in this repository calls anything below yet
 * (no BUILD/LIVE wiring in this phase).
 */

import type { InterferenceItem } from "./interferenceItem.ts";

/**
 * Whether a factor's (or Presence's) own beneficial action is the SAME
 * action as the route's ARC State action, a genuinely DIFFERENT action,
 * or not yet specified at all. An explicit, stored, coach-decided value --
 * never inferred.
 */
export type ActionRelationship = "same_action" | "different_actions" | "legacy_unspecified";

/**
 * The runtime outcome of resolving one factor's (or Presence's) actual
 * beneficial action within a combined route. Never fabricated text, and
 * resolving an outcome never rewrites the underlying InterferenceItem/
 * PresenceArc -- this is a pure read-time projection only.
 */
export type ActionResolutionOutcome =
  | { kind: "factor_only"; action: string }
  | { kind: "state_only"; action: string }
  | { kind: "shared_explicit"; action: string }
  | { kind: "state_then_factor"; stateAction: string; factorAction: string }
  | { kind: "legacy_shared_state_fallback"; action: string }
  | { kind: "unavailable" };

type ActionBearingInterferenceItem = Extract<InterferenceItem, { category: "thought" | "belief" | "urge" }>;

function trimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolves the beneficial action for one Thought/Belief/Urge item within a
 * combined route. `stateAction` is the route's already-resolved ARC State
 * action (StateProfile.action) -- null whenever the route's
 * StateInclusionResolution (arc/stateInclusion.ts) is not "linked"; this
 * function never re-derives State inclusion itself.
 *
 * Version-aware, per the approved compatibility model:
 * - schemaVersion >= 2 (the new action model): the item's own
 *   beneficialActionAgainstFactor is required for anything beyond
 *   "unavailable" -- a v2 item with a missing action is NEVER eligible for
 *   the legacy State fallback below, even when a State action is
 *   resolvable ("required" for a new record is never weakened into an
 *   optional fallback).
 * - schemaVersion 1 (legacy): a missing factor action falls back to the
 *   resolved State action, once, only when one is resolvable
 *   ("legacy_shared_state_fallback") -- "unavailable" when neither
 *   resolves, never fabricated.
 */
export function resolveFactorActionOutcome(item: ActionBearingInterferenceItem, actionRelationship: ActionRelationship, stateAction: string | null): ActionResolutionOutcome {
  const factorAction = trimmedOrNull((item as { beneficialActionAgainstFactor?: string | null }).beneficialActionAgainstFactor ?? null);
  const resolvedStateAction = trimmedOrNull(stateAction);

  if (item.schemaVersion >= 2) {
    if (!factorAction) return { kind: "unavailable" };
    return combineFactorAndState(factorAction, actionRelationship, resolvedStateAction);
  }

  if (factorAction) return combineFactorAndState(factorAction, actionRelationship, resolvedStateAction);
  if (resolvedStateAction) return { kind: "legacy_shared_state_fallback", action: resolvedStateAction };
  return { kind: "unavailable" };
}

function combineFactorAndState(factorAction: string, actionRelationship: ActionRelationship, resolvedStateAction: string | null): ActionResolutionOutcome {
  if (!resolvedStateAction) return { kind: "factor_only", action: factorAction };
  if (actionRelationship === "same_action") return { kind: "shared_explicit", action: factorAction };
  return { kind: "state_then_factor", stateAction: resolvedStateAction, factorAction };
}

/**
 * Emotion's own action IS the required ARC State action (see
 * arc/interferenceItem.ts's own EmotionInterferenceItem doc -- "an
 * Emotion item's whole purpose is pointing at its supportive State").
 * Never resolves a separate factor action -- Emotion has none, and an
 * Emotion route is never complete-for-practice without a linked State
 * (see arc/personalDevelopmentRouteConfig.ts's own validator).
 */
export function resolveEmotionActionOutcome(stateAction: string | null): ActionResolutionOutcome {
  const resolvedStateAction = trimmedOrNull(stateAction);
  return resolvedStateAction ? { kind: "state_only", action: resolvedStateAction } : { kind: "unavailable" };
}

/**
 * Resolves Presence's own beneficial action (PresenceArc.beneficialAction,
 * arc/types.ts -- unchanged by this phase) against the route's optional
 * ARC State action, via the route-level presenceActionRelationship
 * (arc/personalDevelopmentRouteConfig.ts). Presence has no schemaVersion
 * concept -- there is no legacy-fallback branch here.
 */
export function resolvePresenceActionOutcome(presenceBeneficialAction: string | null, presenceActionRelationship: ActionRelationship | null, stateAction: string | null): ActionResolutionOutcome {
  const presenceAction = trimmedOrNull(presenceBeneficialAction);
  if (!presenceAction) return { kind: "unavailable" };
  return combineFactorAndState(presenceAction, presenceActionRelationship ?? "legacy_unspecified", trimmedOrNull(stateAction));
}
