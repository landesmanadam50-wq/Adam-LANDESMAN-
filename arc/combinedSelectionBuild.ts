/**
 * arc/combinedSelectionBuild.ts
 *
 * Adaptive ARC architecture task, Phase 13: the pure, non-visual logic
 * behind build/CombinedInterferenceSelectionScreen.tsx -- grouping
 * available items by category, classifying every configured id as
 * available or (not_found/disabled/archived/not_linked), toggling ids
 * without duplicates, deciding whether Save is allowed, and building the
 * normalized record to persist. The screen calls these functions rather
 * than duplicating any of this logic inline.
 *
 * KNOWN PHASE 12 DEFECT (reported, not fixed here -- see this module's
 * own header note below and the Phase 13 completion report): this
 * module does NOT call arc/combinedInterferenceSelection.ts's own
 * resolveCombinedInterferenceSelectionForState/applyConfiguredSelectionForState.
 * That pair only finds an existing selection when its own status is NOT
 * "archived" ("selection.status !== 'archived'"), which is correct for
 * Phase 12's own "read the currently active configuration" use case but
 * WRONG for Phase 13's own "there must never be two
 * CombinedInterferenceSelection records for the same StateProfile,
 * regardless of status" requirement: if the only existing record for a
 * State happens to be archived, applyConfiguredSelectionForState would
 * silently create a SECOND record instead of finding and updating the
 * first. findExistingSelectionForState/buildCombinedSelectionSaveDraft
 * below reimplement the same "update in place if found, else create"
 * shape using ONLY status-agnostic Phase 12 primitives
 * (upsertCombinedInterferenceSelectionInList/
 * createEmptyCombinedInterferenceSelection/dedupeItemIdsPreservingOrder,
 * all imported and reused verbatim, never re-implemented) -- Phase 12's
 * own files are not modified, per this task's own explicit instruction
 * to stop and report rather than edit them.
 */

import type { InterferenceCategory, InterferenceItem } from "./interferenceItem.ts";
import { isInterferenceItemLinkedToState } from "./interferenceItem.ts";
import { isLibraryItemEnabled } from "./libraryItemStatus.ts";
import type { LibraryItemStatus } from "./libraryItemStatus.ts";
import {
  createEmptyCombinedInterferenceSelection,
  dedupeItemIdsPreservingOrder,
  generateCombinedInterferenceSelectionId,
} from "./combinedInterferenceSelection.ts";
import type { CombinedInterferenceSelection } from "./combinedInterferenceSelection.ts";
import type { FullPresenceAvailability } from "./combinedPresenceLink.ts";

// ---------------------------------------------------------------------------
// Grouping available items by category
// ---------------------------------------------------------------------------

export interface AvailableItemsByCategory {
  thought: InterferenceItem[];
  belief: InterferenceItem[];
  emotion: InterferenceItem[];
  urge: InterferenceItem[];
}

/**
 * "Available" = enabled AND linked to this State -- the two predicates
 * combined here, at the call site, never merged into one ambiguous
 * function (arc/libraryItemStatus.ts's isLibraryItemEnabled and
 * arc/interferenceItem.ts's isInterferenceItemLinkedToState both stay
 * single-purpose and reused verbatim). Empty categories are still
 * returned as empty arrays -- the screen itself decides to omit an
 * empty section from the view, this function never invents a "not
 * shown" concept of its own.
 */
export function groupAvailableItemsByCategory(allKnownItems: InterferenceItem[], stateProfileId: string): AvailableItemsByCategory {
  const available = allKnownItems.filter((item) => isLibraryItemEnabled(item) && isInterferenceItemLinkedToState(item, stateProfileId));
  const byCategory = (category: InterferenceCategory) => available.filter((item) => item.category === category);
  return {
    thought: byCategory("thought"),
    belief: byCategory("belief"),
    emotion: byCategory("emotion"),
    urge: byCategory("urge"),
  };
}

// ---------------------------------------------------------------------------
// Classifying every configured id
// ---------------------------------------------------------------------------

export type ConfiguredItemUnavailableReason = "not_found" | "archived" | "disabled" | "not_linked";

export type ConfiguredItemClassification = { kind: "available"; item: InterferenceItem } | { kind: "unavailable"; reason: ConfiguredItemUnavailableReason; item: InterferenceItem | null };

export interface ClassifiedConfiguredItem {
  id: string;
  classification: ConfiguredItemClassification;
}

/** Hebrew label for each unavailable reason -- the screen's own single source of truth for this copy, never duplicated inline. */
export const UNAVAILABLE_REASON_LABELS: Record<ConfiguredItemUnavailableReason, string> = {
  not_found: "לא נמצא",
  archived: "בארכיון",
  disabled: "מושבת",
  not_linked: "אינו מקושר עוד למצב הזה",
};

/**
 * Classifies ONE configured id, in the exact required order: missing ->
 * not_found; archived -> archived; disabled -> disabled; enabled but no
 * longer linked to this State -> not_linked; otherwise -> available.
 * Never discards an id -- every id passed in produces exactly one
 * classification, so the caller can render it either as a normal,
 * selectable checkbox (available) or in the "לא זמינים כרגע" section
 * (unavailable, with its own reason).
 */
export function classifyConfiguredItem(id: string, allKnownItems: InterferenceItem[], stateProfileId: string): ClassifiedConfiguredItem {
  const item = allKnownItems.find((candidate) => candidate.id === id) ?? null;
  if (!item) return { id, classification: { kind: "unavailable", reason: "not_found", item: null } };
  if (item.status === "archived") return { id, classification: { kind: "unavailable", reason: "archived", item } };
  if (item.status === "disabled") return { id, classification: { kind: "unavailable", reason: "disabled", item } };
  if (!isInterferenceItemLinkedToState(item, stateProfileId)) return { id, classification: { kind: "unavailable", reason: "not_linked", item } };
  return { id, classification: { kind: "available", item } };
}

/** Classifies every id in `configuredItemIds`, preserving order -- never filters any of them out first (see this module's own doc: "do not discard unavailable IDs before classifying them"). */
export function classifyConfiguredItems(configuredItemIds: string[], allKnownItems: InterferenceItem[], stateProfileId: string): ClassifiedConfiguredItem[] {
  return configuredItemIds.map((id) => classifyConfiguredItem(id, allKnownItems, stateProfileId));
}

// ---------------------------------------------------------------------------
// Toggling the draft selection
// ---------------------------------------------------------------------------

/**
 * Checking an id not yet present appends it (via dedupeItemIdsPreservingOrder,
 * so it can never appear twice); unchecking an id present removes only
 * that id, leaving every other id's position untouched. Rechecking an id
 * that was unchecked appends it again at the end -- the merged stable-
 * order convention (first-occurrence-wins) naturally has no memory of a
 * removed id's earlier position, exactly like re-adding to any
 * deduplicated, order-preserving list.
 */
export function toggleSelectedItemId(selectedItemIds: string[], id: string): string[] {
  if (selectedItemIds.includes(id)) {
    return selectedItemIds.filter((existing) => existing !== id);
  }
  return dedupeItemIdsPreservingOrder([...selectedItemIds, id]);
}

/** Removes exactly one id from the draft -- the "הסר מהתצורה" action for an unavailable configured item. Never touches the InterferenceItem record itself; this only ever changes the local draft array the screen holds, and (if Saved afterward) the CombinedInterferenceSelection's own configuredItemIds. */
export function removeSelectedItemId(selectedItemIds: string[], id: string): string[] {
  return selectedItemIds.filter((existing) => existing !== id);
}

// ---------------------------------------------------------------------------
// Save eligibility
// ---------------------------------------------------------------------------

export type SaveBlockedReason = "state_not_enabled" | "no_available_item_selected" | "presence_requires_link";

export interface SaveEligibility {
  allowed: boolean;
  blockedReason: SaveBlockedReason | null;
}

/**
 * A configuration is saveable only when: the StateProfile itself is
 * enabled, at least one of the DRAFT's own selected ids classifies as
 * "available" (Presence on its own is never sufficient, and an
 * unavailable configured item lingering in the draft never counts
 * toward this minimum -- see classifyConfiguredItems above), AND -- if
 * Presence is enabled -- a real, resolvable PresenceArc is linked
 * (arc/combinedPresenceLink.ts's own resolver; "not_linked"/
 * "linked_not_found" both block saving a NEWLY edited configuration in
 * an unusable, unlinked state; only "not_requested"/"available" allow
 * it). An old, already-saved configuration in that same unlinked state
 * still LOADS fine (arc/combinedInterferenceSelection.ts's own
 * normalizeCombinedInterferenceSelection never rejects it) -- this rule
 * only ever blocks the Save action itself, never the read/load path.
 *
 * Adaptive ARC architecture task, Phase 14A: `fullPresenceAvailability`
 * is a new, OPTIONAL 4th parameter, defaulting to `{kind:
 * "not_requested"}` -- every call site that predates this parameter
 * (and therefore never considered a Presence link at all) keeps
 * compiling and behaving EXACTLY as before, since that default can never
 * trigger the new "presence_requires_link" outcome.
 */
export function resolveSaveEligibility(
  stateProfileStatus: LibraryItemStatus,
  selectedItemIds: string[],
  classifiedItems: ClassifiedConfiguredItem[],
  fullPresenceAvailability: FullPresenceAvailability = { kind: "not_requested" }
): SaveEligibility {
  if (stateProfileStatus !== "enabled") {
    return { allowed: false, blockedReason: "state_not_enabled" };
  }
  const classifiedById = new Map(classifiedItems.map((c) => [c.id, c.classification]));
  const hasAvailableSelected = selectedItemIds.some((id) => classifiedById.get(id)?.kind === "available");
  if (!hasAvailableSelected) {
    return { allowed: false, blockedReason: "no_available_item_selected" };
  }
  if (fullPresenceAvailability.kind === "not_linked" || fullPresenceAvailability.kind === "linked_not_found") {
    return { allowed: false, blockedReason: "presence_requires_link" };
  }
  return { allowed: true, blockedReason: null };
}

export const SAVE_BLOCKED_REASON_LABELS: Record<SaveBlockedReason, string> = {
  state_not_enabled: "אי אפשר לשמור -- המצב הרצוי אינו פעיל.",
  no_available_item_selected: "יש לבחור לפחות גורם מפריע זמין אחד לפני השמירה.",
  presence_requires_link: "כדי להשתמש בתרגול נוכחות מלא במסלול המשולב, יש לבחור פרוטוקול נוכחות.",
};

// ---------------------------------------------------------------------------
// One-per-State resolution/save-draft -- status-agnostic (see this
// module's own header doc on why this doesn't call Phase 12's own
// resolveCombinedInterferenceSelectionForState/applyConfiguredSelectionForState).
// ---------------------------------------------------------------------------

/** The single existing CombinedInterferenceSelection for `stateProfileId`, regardless of its own status (enabled/disabled/archived) -- never excludes archived, unlike Phase 12's own resolveCombinedInterferenceSelectionForState (see this module's header doc). At most one is ever expected; the first match is returned. */
export function findExistingSelectionForState(selections: CombinedInterferenceSelection[], stateProfileId: string): CombinedInterferenceSelection | null {
  return selections.find((selection) => selection.stateProfileId === stateProfileId) ?? null;
}

/**
 * Builds the record to persist: updates the existing selection for this
 * State in place (same id/createdAt/status -- ordinary saving never
 * changes status) when one exists, or creates a fresh "enabled" one
 * otherwise. `selectedItemIds` is saved verbatim (deduplicated) -- an
 * unavailable id the trainee has NOT explicitly removed via
 * removeSelectedItemId is still saved, never silently dropped ("do not
 * rewrite the stored configuration automatically merely because an item
 * became unavailable").
 *
 * Adaptive ARC architecture task, Phase 14A: `linkedPresenceArcId` is a
 * new, OPTIONAL final parameter (mirrors
 * arc/combinedInterferenceSelection.ts's own applyConfiguredSelectionForState
 * exactly, for the same backward-compatibility reason -- every call site
 * predating this field keeps compiling and behaving exactly as before).
 * Omitting it (`undefined`) preserves whatever link the existing record
 * already had (or null for a brand-new one) -- it is never silently
 * cleared by a caller that doesn't know about it yet. Pass `null`
 * explicitly to clear a link, or a real id to set/replace one.
 */
export function buildCombinedSelectionSaveDraft(
  existing: CombinedInterferenceSelection | null,
  stateProfileId: string,
  ownerProgramId: string | null,
  selectedItemIds: string[],
  presenceEnabled: boolean,
  now: string,
  generateId: () => string = generateCombinedInterferenceSelectionId,
  linkedPresenceArcId?: string | null
): CombinedInterferenceSelection {
  const deduped = dedupeItemIdsPreservingOrder(selectedItemIds);
  const resolvedLinkedPresenceArcId = linkedPresenceArcId !== undefined ? linkedPresenceArcId : (existing?.linkedPresenceArcId ?? null);
  if (existing) {
    return { ...existing, configuredItemIds: deduped, presenceEnabled, linkedPresenceArcId: resolvedLinkedPresenceArcId, updatedAt: now };
  }
  return {
    ...createEmptyCombinedInterferenceSelection(generateId(), stateProfileId, ownerProgramId, now),
    configuredItemIds: deduped,
    presenceEnabled,
    linkedPresenceArcId: resolvedLinkedPresenceArcId,
  };
}
