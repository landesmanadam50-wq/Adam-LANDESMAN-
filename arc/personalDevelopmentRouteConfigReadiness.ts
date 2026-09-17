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
import { isRouteStateOwnActionRequired, resolveActionRelationshipForItem, validatePersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import type { RouteConfigValidationResult } from "./personalDevelopmentRouteConfig.ts";
import type { InterferenceItem } from "./interferenceItem.ts";
import { isInterferenceItemCompleteForPractice } from "./interferenceItem.ts";
import type { StateProfile } from "./stateProfile.ts";
import type { PresenceArc } from "./types.ts";
import { isPresenceArcReadyForCombinedRoute } from "./presenceArcs.ts";
import { isLibraryItemEnabled } from "./libraryItemStatus.ts";
import { resolveStateInclusion } from "./stateInclusion.ts";

function ownFactorActionIsSet(item: InterferenceItem): boolean {
  return item.category !== "emotion" && (item.beneficialActionAgainstFactor ?? "").trim().length > 0;
}

/**
 * Desired State / combined-route readiness fix: the structural-validation
 * reason codes (arc/personalDevelopmentRouteConfig.ts's own
 * validatePersonalDevelopmentRouteConfig), each given a short, actionable
 * "חסר: ..."/"שגיאה: ..." Hebrew line for the route editor's diagnostics
 * list -- the same wording a caller may already show elsewhere for these
 * codes; duplicated here (rather than imported from a screen) because
 * this is the one place PersonalDevelopmentRouteConfig readiness text is
 * authored, matching this codebase's existing convention of Hebrew UI
 * copy living alongside its own arc/ logic (e.g. arc/combinedFactorPlan.ts's
 * own STATE_DECISION_QUESTION).
 */
const STRUCTURAL_REASON_MESSAGES: Record<string, string> = {
  no_factors_configured: "חסר: גורם מפריע (או תרגול נוכחות)",
  configured_item_not_found: "חסר: אחד מהגורמים המפריעים שנבחרו כבר אינו זמין",
  linked_requires_state_profile_id: "חסר: בחירת מצב רצוי",
  linked_state_not_found: "חסר: המצב הרצוי שנבחר לא נמצא",
  emotion_requires_linked_state: "חסר: מצב רצוי מקושר (נדרש כאשר יש רגש במסלול)",
  decide_in_live_requires_a_candidate_state_profile_id: "חסר: בחירת מצב רצוי מועמד עבור החלטה בזמן התרגול",
  decide_in_live_candidate_state_not_found: "חסר: המצב הרצוי המועמד לא נמצא",
  none_must_not_reference_a_state: 'שגיאה: לא ניתן לקשר מצב רצוי כאשר נבחרה האפשרות "לא"',
  missing_item_action_relationship: "חסר: מידע פנימי על יחס הפעולה עבור אחד הגורמים",
};

export interface PersonalDevelopmentRouteReadinessRequirement {
  /** Short, stable machine-readable code -- never parsed for its text, matches RouteConfigValidationResult's own reason convention. */
  code: string;
  /** User-facing Hebrew line, always starting with "חסר:" (or "שגיאה:" for the one structural conflict case) -- see this module's own STRUCTURAL_REASON_MESSAGES doc. */
  message: string;
}

export interface PersonalDevelopmentRouteReadinessResult {
  ready: boolean;
  /** Empty exactly when ready is true. Never includes a requirement that is already satisfied. */
  missingRequirements: PersonalDevelopmentRouteReadinessRequirement[];
}

/**
 * Desired State / combined-route readiness fix: whether the StateProfile
 * this route resolves to (`resolvedState`, already looked up by the
 * caller) is usable AS LINKED IN THIS SPECIFIC ROUTE -- distinct from,
 * and strictly weaker than, arc/stateProfile.ts's own
 * isStateProfileCompleteForPractice (that function stays the State's own,
 * route-independent completeness bar, still used as-is by every OTHER
 * caller, e.g. a future ArcGoal State requirement).
 *
 * Root cause this fixes: a route where every configured factor (and/or
 * Presence) already declares an explicit "same_action" relationship with
 * its OWN beneficial action present never actually reads the State's own
 * `action` field at all (arc/factorAction.ts's own combineFactorAndState
 * resolves "shared_explicit" from the factor's/Presence's action text,
 * never the State's) -- requiring the trainee to ALSO fill in the State's
 * own action was requiring data LIVE never consumes. `regulationAnchor`
 * and `encodingCue` remain unconditionally required whenever the State
 * participates at all (they represent the State's own recognition/
 * encoding content, unrelated to which text stands in for "the action").
 *
 * Pure and read-only: never mutates any argument.
 */
export function isLinkedStateProfileUsableForRoute(
  resolvedState: StateProfile,
  config: PersonalDevelopmentRouteConfig,
  items: InterferenceItem[],
  presenceArcs: PresenceArc[]
): boolean {
  if (!isLibraryItemEnabled(resolvedState)) return false;
  const regulationEncodingReady = (resolvedState.regulationAnchor ?? "").trim().length > 0 && (resolvedState.encodingCue ?? "").trim().length > 0;
  if (!regulationEncodingReady) return false;
  const stateActionPresent = (resolvedState.action ?? "").trim().length > 0;
  if (stateActionPresent) return true;
  return !isRouteStateOwnActionRequired(config, items, presenceArcs);
}

/**
 * The one authoritative, structured readiness evaluator -- both
 * isPersonalDevelopmentRouteConfigCompleteForPractice (the plain boolean
 * every existing caller uses) and the route editor's own diagnostics list
 * are computed from THIS function alone, so they can never disagree.
 * Structural invalidity (validatePersonalDevelopmentRouteConfig) is
 * reported as the sole missing requirement -- the checks below all
 * assume resolved, structurally valid references, so mixing the two would
 * risk a misleading message (e.g. "item missing its own action" for an
 * item id that does not even resolve).
 *
 * Every check below mirrors the exact rules documented on the former
 * isPersonalDevelopmentRouteConfigCompleteForPractice (see git history),
 * with two differences: (1) every failing requirement is collected rather
 * than short-circuiting on the first one, and (2) the State's own
 * `action` field is only required when isLinkedStateProfileUsableForRoute
 * says this specific route actually needs it (see that function's own
 * doc) -- `hasResolvableStateAction`, fed into
 * isInterferenceItemCompleteForPractice's v1 legacy-fallback parameter and
 * into Emotion's own requirement, still means "the State genuinely has a
 * real, usable action," never the relaxed per-route bar.
 *
 * Pure and read-only: never mutates any argument.
 */
export function evaluatePersonalDevelopmentRouteConfigReadiness(
  config: PersonalDevelopmentRouteConfig,
  items: InterferenceItem[],
  stateProfiles: StateProfile[],
  presenceArcs: PresenceArc[]
): PersonalDevelopmentRouteReadinessResult {
  const structural: RouteConfigValidationResult = validatePersonalDevelopmentRouteConfig(config, items, stateProfiles);
  if (!structural.valid) {
    const reason = structural.reason ?? "no_factors_configured";
    return { ready: false, missingRequirements: [{ code: reason, message: STRUCTURAL_REASON_MESSAGES[reason] ?? `חסר: ${reason}` }] };
  }

  const missing: PersonalDevelopmentRouteReadinessRequirement[] = [];

  const stateInclusion = resolveStateInclusion(config.stateInclusionPolicy, config.stateProfileId);
  const candidateStateId = stateInclusion.kind === "linked" ? stateInclusion.stateProfileId : stateInclusion.kind === "decide_in_live" ? stateInclusion.candidateStateProfileId : null;
  const resolvedState = candidateStateId ? (stateProfiles.find((state) => state.id === candidateStateId) ?? null) : null;

  let hasResolvableStateAction = false;

  if (stateInclusion.kind !== "none") {
    if (!resolvedState || !isLibraryItemEnabled(resolvedState)) {
      // Structurally unreachable here (validatePersonalDevelopmentRouteConfig already
      // requires a resolvable stateProfileId), kept as a defensive fallback.
      missing.push({ code: "state_profile_disabled", message: "חסר: המצב הרצוי שנבחר אינו פעיל -- יש להפעיל אותו או לבחור מצב אחר" });
    } else {
      const regulationEncodingReady = (resolvedState.regulationAnchor ?? "").trim().length > 0 && (resolvedState.encodingCue ?? "").trim().length > 0;
      const stateActionPresent = (resolvedState.action ?? "").trim().length > 0;
      hasResolvableStateAction = regulationEncodingReady && stateActionPresent;

      if (!regulationEncodingReady) {
        missing.push({ code: "state_profile_incomplete", message: "חסר: השלמת הגדרת המצב הרצוי (עוגן ויסות ורמז קידוד)" });
      } else if (!stateActionPresent && isRouteStateOwnActionRequired(config, items, presenceArcs)) {
        missing.push({ code: "missing_state_action", message: "חסר: פעולה מתוך המצב הרצוי" });
      }
    }
  }

  for (const itemId of config.interferenceItemIds) {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) continue; // already reported by structural validation above
    if (!isLibraryItemEnabled(item)) {
      missing.push({ code: "factor_disabled", message: `חסר: הגורם המפריע "${item.name}" מושבת -- יש להפעיל אותו או להסירו מהמסלול` });
      continue;
    }

    if (item.category === "emotion") {
      // Emotion has no factor action of its own -- its completeness is
      // entirely the State's own action, already evaluated above.
      continue;
    }

    if (!isInterferenceItemCompleteForPractice(item, hasResolvableStateAction)) {
      missing.push({ code: "missing_factor_action", message: `חסר: פעולה מיטיבה מול הגורם המפריע -- "${item.name}"` });
    } else if (stateInclusion.kind !== "none" && ownFactorActionIsSet(item) && resolveActionRelationshipForItem(config, itemId) === "legacy_unspecified") {
      missing.push({ code: "missing_action_relationship", message: `חסר: יש לבחור האם הפעולה עבור "${item.name}" זהה לפעולה מהמצב הרצוי` });
    }
  }

  if (config.presenceEnabled) {
    if (!config.linkedPresenceArcId) {
      missing.push({ code: "presence_not_selected", message: "חסר: בחירת פרוטוקול נוכחות" });
    } else {
      const presenceArc = presenceArcs.find((candidate) => candidate.id === config.linkedPresenceArcId);
      if (!presenceArc || !isPresenceArcReadyForCombinedRoute(presenceArc)) {
        missing.push({ code: "presence_not_ready", message: "חסר: תרגול הנוכחות שנבחר אינו מוכן" });
      } else if (stateInclusion.kind !== "none" && (config.presenceActionRelationship === null || config.presenceActionRelationship === "legacy_unspecified")) {
        missing.push({ code: "missing_action_relationship", message: "חסר: יש לבחור האם פעולת הנוכחות זהה לפעולה מהמצב הרצוי" });
      }
    }
  }

  return { ready: missing.length === 0, missingRequirements: missing };
}

/**
 * Whether `config` is complete-for-practice -- a plain boolean view over
 * evaluatePersonalDevelopmentRouteConfigReadiness's own result, so every
 * existing caller (build/PersonalDevelopmentRouteListScreen.tsx's ready
 * badge, build/LiveModeSelectScreen.tsx's selectActiveCombinedRoutesForLive,
 * live/CombinedInterferenceLiveScreen.tsx) and the route editor's own
 * structured diagnostics can never disagree -- there is exactly one
 * readiness computation, never two parallel ones.
 *
 * Pure and read-only: never mutates any argument.
 */
export function isPersonalDevelopmentRouteConfigCompleteForPractice(
  config: PersonalDevelopmentRouteConfig,
  items: InterferenceItem[],
  stateProfiles: StateProfile[],
  presenceArcs: PresenceArc[]
): boolean {
  return evaluatePersonalDevelopmentRouteConfigReadiness(config, items, stateProfiles, presenceArcs).ready;
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
