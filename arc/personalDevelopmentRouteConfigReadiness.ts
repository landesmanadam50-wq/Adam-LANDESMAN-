/**
 * arc/personalDevelopmentRouteConfigReadiness.ts
 *
 * Adaptive ARC architecture task, Phase 14B-2: whether a
 * PersonalDevelopmentRouteConfig (arc/personalDevelopmentRouteConfig.ts)
 * is COMPLETE-FOR-PRACTICE -- distinct from, and strictly stronger than,
 * that module's own isPersonalDevelopmentRouteConfigSaveable (the
 * permanent, structural-only draft bar). Kept in its own file rather
 * than folded into arc/personalDevelopmentRouteConfig.ts because it
 * reaches across InterferenceItem/StateProfile/PresenceArc readiness
 * rules that module has no reason to depend on.
 *
 * "Saving a draft" and "being ready for practice" are two genuinely
 * different outcomes (see the approved amendment) -- a route can be
 * saved at any point for incremental editing; only this function decides
 * whether it may later appear in a combined LIVE picker (not built in
 * this phase).
 *
 * Pure logic only -- nothing in this repository calls anything below yet
 * (no LIVE wiring in this phase).
 */

import type { PersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import { resolveActionRelationshipForItem, validatePersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import type { InterferenceItem } from "./interferenceItem.ts";
import { isInterferenceItemCompleteForPractice } from "./interferenceItem.ts";
import type { StateProfile } from "./stateProfile.ts";
import { isStateProfileCompleteForPractice } from "./stateProfile.ts";
import type { PresenceArc } from "./types.ts";
import { isPresenceArcReadyForCombinedRoute } from "./presenceArcs.ts";
import { isLibraryItemEnabled } from "./libraryItemStatus.ts";
import { resolveStateInclusion } from "./stateInclusion.ts";

function ownFactorActionIsSet(item: InterferenceItem): boolean {
  return item.category !== "emotion" && (item.beneficialActionAgainstFactor ?? "").trim().length > 0;
}

/**
 * Whether `config` is complete-for-practice. Requires (in addition to
 * validatePersonalDevelopmentRouteConfig's own structural checks):
 * - every configured item/Presence is not just found but ENABLED;
 * - whenever stateInclusionPolicy is "linked" or "decide_in_live", the
 *   referenced/candidate StateProfile resolves, is enabled, AND is
 *   itself complete-for-practice (isStateProfileCompleteForPractice) --
 *   "decide_in_live" requires this too, since LIVE may choose to include
 *   that exact candidate;
 * - every configured Thought/Belief/Urge item is complete-for-practice
 *   given that State readiness (isInterferenceItemCompleteForPractice --
 *   this is also where a v1 item's legacy shared-State-action fallback
 *   is honored, and where a v2 item's own required action is enforced);
 * - every configured Emotion item requires a linked, complete State
 *   (never inherits a v1/v2 item's own legacy primaryStateProfileId --
 *   the route's own State is authoritative, see
 *   arc/personalDevelopmentRouteConfig.ts's own header doc);
 * - when Presence is enabled, its linked PresenceArc resolves and is
 *   ready (isPresenceArcReadyForCombinedRoute);
 * - whenever State participates AND a factor's (or Presence's) own
 *   action is resolvable, its ActionRelationship must be explicitly
 *   "same_action"/"different_actions" -- "legacy_unspecified" blocks
 *   readiness (never silently treated as either answer).
 *
 * Pure and read-only: never mutates any argument.
 */
export function isPersonalDevelopmentRouteConfigCompleteForPractice(
  config: PersonalDevelopmentRouteConfig,
  items: InterferenceItem[],
  stateProfiles: StateProfile[],
  presenceArcs: PresenceArc[]
): boolean {
  if (!validatePersonalDevelopmentRouteConfig(config, items, stateProfiles).valid) return false;

  const stateInclusion = resolveStateInclusion(config.stateInclusionPolicy, config.stateProfileId);
  const candidateStateId = stateInclusion.kind === "linked" ? stateInclusion.stateProfileId : stateInclusion.kind === "decide_in_live" ? stateInclusion.candidateStateProfileId : null;
  const resolvedState = candidateStateId ? (stateProfiles.find((state) => state.id === candidateStateId) ?? null) : null;
  const stateReady = candidateStateId !== null && resolvedState !== null && isLibraryItemEnabled(resolvedState) && isStateProfileCompleteForPractice(resolvedState);

  if (stateInclusion.kind !== "none" && !stateReady) return false;

  const hasResolvableStateAction = stateInclusion.kind !== "none" && stateReady;

  for (const itemId of config.interferenceItemIds) {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) return false;
    if (!isLibraryItemEnabled(item)) return false;

    if (item.category === "emotion") {
      if (!stateReady) return false;
      continue;
    }

    if (!isInterferenceItemCompleteForPractice(item, hasResolvableStateAction)) return false;

    if (stateInclusion.kind !== "none" && ownFactorActionIsSet(item)) {
      if (resolveActionRelationshipForItem(config, itemId) === "legacy_unspecified") return false;
    }
  }

  if (config.presenceEnabled) {
    if (!config.linkedPresenceArcId) return false;
    const presenceArc = presenceArcs.find((candidate) => candidate.id === config.linkedPresenceArcId);
    if (!presenceArc) return false;
    if (!isPresenceArcReadyForCombinedRoute(presenceArc)) return false;
    if (stateInclusion.kind !== "none" && (config.presenceActionRelationship === null || config.presenceActionRelationship === "legacy_unspecified")) return false;
  }

  return true;
}

/**
 * Regression repair task: the single sanctioned selector for "which
 * PersonalDevelopmentRouteConfig records may start from a LIVE picker
 * right now" -- reused by build/LiveModeSelectScreen.tsx (the general
 * ARCHI LIVE selection screen) so that screen and
 * build/PersonalDevelopmentRouteListScreen.tsx's own per-card start
 * buttons apply the EXACT same two-part gate: `status === "enabled"`
 * (never "disabled"/"archived" -- disabling or archiving a route in the
 * management screen removes it from here on the very next call, no
 * separate LIVE-visibility flag to keep in sync) AND
 * isPersonalDevelopmentRouteConfigCompleteForPractice. Pure and
 * read-only -- `configs` is the same list every caller already loads via
 * data/storage.ts's loadPersonalDevelopmentRouteConfigs, so there is
 * exactly one persisted route record, never a second LIVE-only copy.
 */
export function selectActiveCombinedRoutesForLive(
  configs: PersonalDevelopmentRouteConfig[],
  items: InterferenceItem[],
  stateProfiles: StateProfile[],
  presenceArcs: PresenceArc[]
): PersonalDevelopmentRouteConfig[] {
  return configs.filter(
    (config) => config.status === "enabled" && isPersonalDevelopmentRouteConfigCompleteForPractice(config, items, stateProfiles, presenceArcs)
  );
}
