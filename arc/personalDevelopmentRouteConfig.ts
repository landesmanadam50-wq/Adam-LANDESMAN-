/**
 * arc/personalDevelopmentRouteConfig.ts
 *
 * Adaptive ARC architecture task, Phase 14B-1: the route-level owner of a
 * combined Personal Development route's own configuration -- deliberately
 * NOT a restructuring of arc/combinedInterferenceSelection.ts's own
 * CombinedInterferenceSelection (Phase 12-14A), which stays completely
 * untouched and remains valid, State-scoped BUILD-authoring data.
 *
 * CombinedInterferenceSelection's own stateProfileId is genuinely
 * overloaded: it is simultaneously the record's identity key (the
 * "at most one per State" invariant) AND the reference to the State
 * actually used, and every existing creation path starts from a
 * StateProfile card (build/StateProfileListScreen.tsx's own
 * "/combined-selection/[stateProfileId]" route) -- there is no way to
 * represent a route with NO ARC State inside that record without
 * conflating those two concerns or forcing a State choice a coach never
 * made. PersonalDevelopmentRouteConfig is the small, additive answer:
 * its own `stateProfileId` is genuinely optional, and its identity is its
 * own `id`, never derived from the State it may or may not reference.
 *
 * State participation is a ROUTE-level decision, never a per-item one --
 * a route may configure several disturbing factors, but ARC State
 * regulation, desired-state encoding, the desired-state rating, and the
 * State action are each rendered at most once per route (see
 * arc/stateInclusion.ts's own doc). `itemRelationships[itemId]` therefore
 * owns only the ActionRelationship between that one factor's own action
 * and the route's single State action (arc/factorAction.ts) -- never a
 * second, per-item State-inclusion flag.
 *
 * Pure logic only -- nothing in this repository calls anything below yet
 * (no BUILD/LIVE wiring, no storage CRUD in this phase -- persistence
 * wiring belongs to a later, separately approved phase).
 */

import type { LibraryItemStatus, OwnedLibraryRecord } from "./libraryItemStatus.ts";
import type { InterferenceItem } from "./interferenceItem.ts";
import type { StateProfile } from "./stateProfile.ts";
import type { ActionRelationship } from "./factorAction.ts";
import type { StateInclusionPolicy } from "./stateInclusion.ts";
import { dedupeItemIdsPreservingOrder } from "./combinedInterferenceSelection.ts";

export interface PersonalDevelopmentRouteConfig extends OwnedLibraryRecord {
  interferenceItemIds: string[];
  /** Route-level -- see this module's own header doc. Never per-item. */
  stateInclusionPolicy: StateInclusionPolicy;
  /**
   * The one supportive State this route may use. Required and resolvable
   * when stateInclusionPolicy is "linked"; the one CANDIDATE State when
   * "decide_in_live" (LIVE decides whether to use it, never which State to
   * choose); must be null when "none" (see validatePersonalDevelopmentRouteConfig).
   */
  stateProfileId: string | null;
  /**
   * Keyed by InterferenceItem id -- owns ONLY the ActionRelationship
   * between that factor's own action and the route's single State action.
   * Never a second State-inclusion flag (see this module's own header
   * doc); never a copy of the item's own content.
   */
  itemRelationships: Record<string, { actionRelationship: ActionRelationship }>;
  presenceEnabled: boolean;
  linkedPresenceArcId: string | null;
  /** Only meaningful when presenceEnabled && stateInclusionPolicy !== "none" -- see arc/factorAction.ts's resolvePresenceActionOutcome. */
  presenceActionRelationship: ActionRelationship | null;
  status: LibraryItemStatus;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export function generatePersonalDevelopmentRouteConfigId(): string {
  return `pdrouteconfig-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** A fresh, empty PersonalDevelopmentRouteConfig -- no State, no items, no Presence -- mirrors createEmptyCombinedInterferenceSelection's own shape. */
export function createEmptyPersonalDevelopmentRouteConfig(id: string, ownerProgramId: string | null, now: string): PersonalDevelopmentRouteConfig {
  return {
    id,
    ownerProgramId,
    interferenceItemIds: [],
    stateInclusionPolicy: "none",
    stateProfileId: null,
    itemRelationships: {},
    presenceEnabled: false,
    linkedPresenceArcId: null,
    presenceActionRelationship: null,
    status: "enabled",
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Defensive backfill for a record parsed from storage -- mirrors
 * normalizeCombinedInterferenceSelection exactly (safe defaults, never
 * invented content, never overwrites an already-configured field).
 * `itemRelationships` is backfilled per configured item id to
 * "legacy_unspecified" only when genuinely missing -- an already-set
 * relationship is always preserved, and a relationship for an id no
 * longer in `interferenceItemIds` is dropped (never orphaned).
 */
export function normalizePersonalDevelopmentRouteConfig(config: PersonalDevelopmentRouteConfig): PersonalDevelopmentRouteConfig {
  const dedupedItemIds = dedupeItemIdsPreservingOrder(Array.isArray(config.interferenceItemIds) ? config.interferenceItemIds : []);
  const existingRelationships = config.itemRelationships && typeof config.itemRelationships === "object" ? config.itemRelationships : {};
  const itemRelationships: Record<string, { actionRelationship: ActionRelationship }> = {};
  for (const itemId of dedupedItemIds) {
    const existing = existingRelationships[itemId];
    itemRelationships[itemId] = existing?.actionRelationship ? existing : { actionRelationship: "legacy_unspecified" };
  }
  return {
    ...config,
    ownerProgramId: config.ownerProgramId ?? null,
    interferenceItemIds: dedupedItemIds,
    stateInclusionPolicy: config.stateInclusionPolicy ?? "none",
    stateProfileId: config.stateProfileId ?? null,
    itemRelationships,
    presenceEnabled: config.presenceEnabled ?? false,
    linkedPresenceArcId: config.linkedPresenceArcId ?? null,
    presenceActionRelationship: config.presenceActionRelationship ?? null,
    status: config.status ?? "enabled",
    schemaVersion: config.schemaVersion ?? 1,
  };
}

/** Updates the one config matching `config.id` in place if found, otherwise appends it as new. Never reorders the rest of the list -- mirrors upsertCombinedInterferenceSelectionInList exactly. */
export function upsertPersonalDevelopmentRouteConfigInList(configs: PersonalDevelopmentRouteConfig[], config: PersonalDevelopmentRouteConfig): PersonalDevelopmentRouteConfig[] {
  const index = configs.findIndex((existing) => existing.id === config.id);
  if (index === -1) return [...configs, config];
  return configs.map((existing, i) => (i === index ? config : existing));
}

/** The ActionRelationship configured for `itemId`, or "legacy_unspecified" when the route has no entry for it yet (never throws, never invents anything stronger). */
export function resolveActionRelationshipForItem(config: PersonalDevelopmentRouteConfig, itemId: string): ActionRelationship {
  return config.itemRelationships[itemId]?.actionRelationship ?? "legacy_unspecified";
}

export interface RouteConfigValidationResult {
  valid: boolean;
  /** A short, stable machine-readable reason code, or null when valid. Never a user-facing sentence -- a later BUILD screen owns any Hebrew copy. */
  reason: string | null;
}

function ok(): RouteConfigValidationResult {
  return { valid: true, reason: null };
}

function fail(reason: string): RouteConfigValidationResult {
  return { valid: false, reason };
}

/**
 * Whether `config` is a coherent, complete-for-practice route --
 * deliberately separate from arc/libraryRelationships.ts's own
 * validateInterferenceItemPrimaryState, which validates a single legacy
 * InterferenceItem-level relationship and has no visibility into
 * route-level State inclusion; this function is the sanctioned validator
 * for PersonalDevelopmentRouteConfig itself and never replaces that one.
 *
 * Enforces exactly the rules from the approved amendment:
 * - "linked" requires exactly one resolvable stateProfileId.
 * - "none" requires stateProfileId to be null (no State execution).
 * - "decide_in_live" requires one resolvable CANDIDATE stateProfileId
 *   (LIVE decides only whether to use it, never which State).
 * - Any configured Emotion item requires "linked" with a resolvable
 *   State -- "none"/"decide_in_live" are never complete-for-practice for
 *   an Emotion route.
 * - Every id in interferenceItemIds must resolve to a real, known item.
 * - Every configured item must have its own itemRelationships entry.
 */
export function validatePersonalDevelopmentRouteConfig(config: PersonalDevelopmentRouteConfig, items: InterferenceItem[], stateProfiles: StateProfile[]): RouteConfigValidationResult {
  if (config.interferenceItemIds.length === 0 && !config.presenceEnabled) return fail("no_factors_configured");

  const configuredItems: InterferenceItem[] = [];
  for (const itemId of config.interferenceItemIds) {
    const found = items.find((item) => item.id === itemId);
    if (!found) return fail("configured_item_not_found");
    configuredItems.push(found);
  }

  const hasEmotion = configuredItems.some((item) => item.category === "emotion");
  const stateResolves = config.stateProfileId !== null && stateProfiles.some((state) => state.id === config.stateProfileId);

  if (config.stateInclusionPolicy === "linked") {
    if (!config.stateProfileId) return fail("linked_requires_state_profile_id");
    if (!stateResolves) return fail("linked_state_not_found");
  } else if (config.stateInclusionPolicy === "decide_in_live") {
    if (hasEmotion) return fail("emotion_requires_linked_state");
    if (!config.stateProfileId) return fail("decide_in_live_requires_a_candidate_state_profile_id");
    if (!stateResolves) return fail("decide_in_live_candidate_state_not_found");
  } else {
    if (hasEmotion) return fail("emotion_requires_linked_state");
    if (config.stateProfileId) return fail("none_must_not_reference_a_state");
  }

  for (const itemId of config.interferenceItemIds) {
    if (!config.itemRelationships[itemId]) return fail("missing_item_action_relationship");
  }

  return ok();
}
