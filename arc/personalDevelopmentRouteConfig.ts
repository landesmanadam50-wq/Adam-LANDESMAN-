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
import type { CombinedInterferenceSelection } from "./combinedInterferenceSelection.ts";

/**
 * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 1: once per
 * session, only when configured -- the desired result, the value it
 * expresses, and the trainee's personal reason it matters. Never a
 * Manifest contribution (PD-only content, distinct from ArcGoal's own,
 * which reuses ArcGoal.desiredResult/value/personalReason plus the
 * Manifest link instead of this record).
 */
export interface PersonalDevelopmentRouteGoalConnection {
  desiredResultText: string;
  valueText: string;
  personalReasonText: string;
}

/**
 * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 1: governs
 * whether this route's one Beneficial/Regulating Action role is required,
 * offered as an explicit optional choice in LIVE, or absent entirely.
 * Default "required" preserves every existing route's current mandatory
 * behavior exactly. "none" excludes the route from Stage 3 (ARC Link,
 * whose own real action IS this same role) and Stage 4 (Beneficial
 * Action only) of the 4-stage mastery program -- Stage 1/2 remain fully
 * available. See arc/personalDevelopmentRouteProgress.ts's own stage
 * resolvers for the exact eligibility/advancement rules.
 */
export type BeneficialActionPolicy = "required" | "optional_in_live" | "none";

export interface PersonalDevelopmentRouteConfig extends OwnedLibraryRecord {
  /**
   * Personal Development consolidation task: an optional, coach-facing
   * label for "My Routine"'s own card list -- purely a display
   * convenience, never read by any BUILD/LIVE/readiness/validation logic
   * (a route with many factors and no State is fully valid and practicable
   * with name === null; My Routine falls back to the existing
   * factor-count summary in that case). Every route saved before this
   * field existed backfills to null (normalizePersonalDevelopmentRouteConfig),
   * never an invented name.
   */
  name: string | null;
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
  itemRelationships: Record<string, { actionRelationship: ActionRelationship; miniCombinedActionOverride?: string | null }>;
  /** Once per session, only when configured -- see PersonalDevelopmentRouteGoalConnection's own doc. null means Goal Connection is skipped entirely for this route. */
  goalConnection: PersonalDevelopmentRouteGoalConnection | null;
  /** See BeneficialActionPolicy's own doc. Default "required" for every route saved before this field existed. */
  beneficialActionPolicy: BeneficialActionPolicy;
  presenceEnabled: boolean;
  linkedPresenceArcId: string | null;
  /** Only meaningful when presenceEnabled && stateInclusionPolicy !== "none" -- see arc/factorAction.ts's resolvePresenceActionOutcome. */
  presenceActionRelationship: ActionRelationship | null;
  /**
   * Adaptive ARC architecture task, Phase 14B-2: the stable provenance
   * link back to the legacy CombinedInterferenceSelection (Phase 12-14A)
   * this route was converted from, or null for a route created directly
   * in the new editor. This is the sole mechanism that makes converting
   * the SAME legacy selection idempotent -- see
   * resolvePersonalDevelopmentRouteConfigForLegacySelection/
   * resolveOrCreatePersonalDevelopmentRouteConfigFromLegacySelection
   * below -- never a translated-text or array-position comparison.
   */
  sourceLegacyCombinedSelectionId: string | null;
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
    name: null,
    interferenceItemIds: [],
    stateInclusionPolicy: "none",
    stateProfileId: null,
    itemRelationships: {},
    goalConnection: null,
    beneficialActionPolicy: "required",
    presenceEnabled: false,
    linkedPresenceArcId: null,
    presenceActionRelationship: null,
    sourceLegacyCombinedSelectionId: null,
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
  const itemRelationships: Record<string, { actionRelationship: ActionRelationship; miniCombinedActionOverride?: string | null }> = {};
  for (const itemId of dedupedItemIds) {
    const existing = existingRelationships[itemId];
    itemRelationships[itemId] = existing?.actionRelationship
      ? { actionRelationship: existing.actionRelationship, miniCombinedActionOverride: existing.miniCombinedActionOverride ?? null }
      : { actionRelationship: "legacy_unspecified", miniCombinedActionOverride: null };
  }
  return {
    ...config,
    ownerProgramId: config.ownerProgramId ?? null,
    name: config.name ?? null,
    interferenceItemIds: dedupedItemIds,
    stateInclusionPolicy: config.stateInclusionPolicy ?? "none",
    stateProfileId: config.stateProfileId ?? null,
    itemRelationships,
    // Adaptive ARC architecture task (unified PD/ARC Goal), Phase 1: every
    // route saved before these fields existed backfills to their safe,
    // inert defaults -- no Goal Connection configured, and "required"
    // (preserving every existing route's current mandatory-action
    // behavior exactly, never silently relaxed by migration).
    goalConnection: config.goalConnection ?? null,
    beneficialActionPolicy: config.beneficialActionPolicy ?? "required",
    presenceEnabled: config.presenceEnabled ?? false,
    linkedPresenceArcId: config.linkedPresenceArcId ?? null,
    presenceActionRelationship: config.presenceActionRelationship ?? null,
    sourceLegacyCombinedSelectionId: config.sourceLegacyCombinedSelectionId ?? null,
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

/**
 * Adaptive ARC architecture task, Phase 14B-2: the minimum bar for
 * PERSISTING a route at all -- an alias over validatePersonalDevelopmentRouteConfig's
 * own result, named separately (and deliberately never merged with
 * isPersonalDevelopmentRouteConfigCompleteForPractice,
 * arc/personalDevelopmentRouteConfigReadiness.ts) so callers never
 * conflate "saveable" with "ready to appear in a future LIVE picker."
 * Reuses the same structural checks validatePersonalDevelopmentRouteConfig
 * already performs (item/State references must resolve) rather than a
 * second, divergent copy of that logic.
 */
export function isPersonalDevelopmentRouteConfigSaveable(config: PersonalDevelopmentRouteConfig, items: InterferenceItem[], stateProfiles: StateProfile[]): boolean {
  return validatePersonalDevelopmentRouteConfig(config, items, stateProfiles).valid;
}

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task, Phase 14B-2: legacy CombinedInterferenceSelection
// -> PersonalDevelopmentRouteConfig conversion. Additive and read-only with
// respect to the source record -- never archives, renames, or mutates it.
// ---------------------------------------------------------------------------

/**
 * The pure builder: a fresh PersonalDevelopmentRouteConfig prefilled from
 * `selection`'s own fields -- `stateInclusionPolicy: "linked"` (a legacy
 * CombinedInterferenceSelection is always State-scoped), every configured
 * item's own ActionRelationship defaulted to "legacy_unspecified" (never
 * guessed as same/different), Presence config copied verbatim. Never
 * reads or writes `selection` itself. Callers that need idempotency
 * (never creating a second route for the same source) use
 * resolveOrCreatePersonalDevelopmentRouteConfigFromLegacySelection below
 * rather than calling this directly.
 */
export function buildPersonalDevelopmentRouteConfigFromLegacySelection(
  selection: CombinedInterferenceSelection,
  now: string,
  generateId: () => string = generatePersonalDevelopmentRouteConfigId
): PersonalDevelopmentRouteConfig {
  const interferenceItemIds = dedupeItemIdsPreservingOrder(selection.configuredItemIds);
  const itemRelationships: Record<string, { actionRelationship: ActionRelationship; miniCombinedActionOverride?: string | null }> = {};
  for (const itemId of interferenceItemIds) {
    itemRelationships[itemId] = { actionRelationship: "legacy_unspecified", miniCombinedActionOverride: null };
  }
  return {
    ...createEmptyPersonalDevelopmentRouteConfig(generateId(), selection.ownerProgramId, now),
    interferenceItemIds,
    stateInclusionPolicy: "linked",
    stateProfileId: selection.stateProfileId,
    itemRelationships,
    presenceEnabled: selection.presenceEnabled,
    linkedPresenceArcId: selection.linkedPresenceArcId,
    presenceActionRelationship: selection.presenceEnabled ? "legacy_unspecified" : null,
    sourceLegacyCombinedSelectionId: selection.id,
  };
}

/**
 * The stable provenance lookup: the one PersonalDevelopmentRouteConfig
 * already converted from `legacySelectionId`, or null if it was never
 * converted -- matched ONLY by sourceLegacyCombinedSelectionId, never by
 * translated text or array position (per the approved amendment). This is
 * what makes repeated conversion of the same legacy selection idempotent.
 */
export function resolvePersonalDevelopmentRouteConfigForLegacySelection(configs: PersonalDevelopmentRouteConfig[], legacySelectionId: string): PersonalDevelopmentRouteConfig | null {
  return configs.find((config) => config.sourceLegacyCombinedSelectionId === legacySelectionId) ?? null;
}

/**
 * The sanctioned "convert this legacy selection" write path: if a route
 * already exists for `selection.id` (resolvePersonalDevelopmentRouteConfigForLegacySelection),
 * returns the EXISTING record and an untouched `configs` list -- a
 * second, third, Nth request for the same source legacy selection always
 * resolves to the same one route, never creating a duplicate. Only
 * builds and appends a new record the first time. `generateId` is
 * injectable purely for deterministic tests; production callers omit it.
 */
export function resolveOrCreatePersonalDevelopmentRouteConfigFromLegacySelection(
  configs: PersonalDevelopmentRouteConfig[],
  selection: CombinedInterferenceSelection,
  now: string,
  generateId: () => string = generatePersonalDevelopmentRouteConfigId
): { configs: PersonalDevelopmentRouteConfig[]; result: PersonalDevelopmentRouteConfig } {
  const existing = resolvePersonalDevelopmentRouteConfigForLegacySelection(configs, selection.id);
  if (existing) return { configs, result: existing };
  const created = buildPersonalDevelopmentRouteConfigFromLegacySelection(selection, now, generateId);
  return { configs: upsertPersonalDevelopmentRouteConfigInList(configs, created), result: created };
}

/**
 * Personal Development consolidation task, step 4: the automatic,
 * additive, idempotent replacement for the old manual "צור תצורת מסלול
 * חדשה מהגדרה זו" button (build/CombinedInterferenceSelectionScreen.tsx,
 * hidden from the normal PD interface per the approved consolidation
 * plan) -- every genuinely ENABLED legacy CombinedInterferenceSelection
 * that has no corresponding route yet gets converted automatically, via
 * the exact same idempotent resolveOrCreatePersonalDevelopmentRouteConfigFromLegacySelection
 * this module already had (matched only by sourceLegacyCombinedSelectionId,
 * never by translated text or array position). A disabled/archived
 * legacy selection is never auto-converted -- a coach who deliberately
 * turned one off never has it silently resurrected as a new program; it
 * remains reachable through the legacy CombinedInterferenceSelectionScreen
 * fallback route if they want to restore and convert it by hand.
 *
 * Never reads or writes the source CombinedInterferenceSelection records
 * themselves (they are never deleted, renamed, or mutated by this
 * function or by calling it repeatedly) -- purely additive to `configs`.
 * Calling this with the same inputs twice in a row is a true no-op the
 * second time (every selection already has a route, so `configs` comes
 * back as the exact same array reference each already-converted
 * selection observed on the loop iteration).
 */
export function autoMigrateAllLegacyCombinedSelections(
  configs: PersonalDevelopmentRouteConfig[],
  selections: CombinedInterferenceSelection[],
  now: string,
  generateId: () => string = generatePersonalDevelopmentRouteConfigId
): { configs: PersonalDevelopmentRouteConfig[]; createdCount: number } {
  let currentConfigs = configs;
  let createdCount = 0;
  for (const selection of selections) {
    if (selection.status !== "enabled") continue;
    const { configs: nextConfigs } = resolveOrCreatePersonalDevelopmentRouteConfigFromLegacySelection(currentConfigs, selection, now, generateId);
    if (nextConfigs !== currentConfigs) createdCount += 1;
    currentConfigs = nextConfigs;
  }
  return { configs: currentConfigs, createdCount };
}

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task, Phase 14B-2: the "Build new State"
// return-resolution decision (build/PersonalDevelopmentRouteEditorScreen.tsx's
// own UI command -- see arc/stateInclusion.ts's own doc on why "build_new"
// is never itself a persisted policy value).
// ---------------------------------------------------------------------------

/**
 * Pure decision for what the route editor should do when it regains
 * focus after a "Build new State" round trip. The screen owns a single
 * `pendingNewStateId` (the id it pre-generated, once, before navigating
 * to StateProfile creation) and clears it to null the moment this
 * resolver reports `found: true` -- so a later focus event (or a
 * manually-chosen State in between) can never re-apply an auto-selection,
 * and returning without ever saving that State never changes the route's
 * own policy (the screen simply never calls setState with this result).
 */
export function resolvePendingBuildNewStateReturn(pendingNewStateId: string | null, stateProfiles: StateProfile[]): { found: boolean; stateProfileId: string | null } {
  if (!pendingNewStateId) return { found: false, stateProfileId: null };
  const found = stateProfiles.some((state) => state.id === pendingNewStateId);
  return found ? { found: true, stateProfileId: pendingNewStateId } : { found: false, stateProfileId: null };
}
