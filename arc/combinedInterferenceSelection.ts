/**
 * arc/combinedInterferenceSelection.ts
 *
 * Adaptive ARC architecture task, Phase 12: the reusable, saved-instance
 * record of "which InterferenceItems (and whether Presence) are
 * available for combined practice with ONE StateProfile" -- the
 * CONFIGURED set only ("configuredItemIds: reusable items linked to the
 * State"). This is explicitly NOT the SELECTED set (a real session's own
 * subset, chosen fresh each time a trainee is asked "what is
 * interfering now") and NOT the PRACTICED set (which of those actually
 * completed) -- see arc/combinedRoute.ts's own CombinedRouteSessionFacts
 * and function parameters for those two, which stay pure in-memory
 * shapes only in this phase; nothing here conflates the three.
 *
 * At most ONE CombinedInterferenceSelection exists per StateProfile
 * (product decision: prefer one active reusable configuration per
 * State rather than several indistinguishable ones -- no user-facing
 * name field is needed, since nothing ever needs to tell two of these
 * apart for the same State). resolveCombinedInterferenceSelectionForState/
 * applyConfiguredSelectionForState below are the sanctioned way to
 * read/write one and both enforce this invariant at the pure-logic
 * level; a caller that instead calls upsertCombinedInterferenceSelectionInList
 * directly with a freshly generated id, without first checking
 * resolveCombinedInterferenceSelectionForState, is responsible for the
 * same invariant itself.
 *
 * References StateProfile/InterferenceItem by id only -- exactly the
 * same "reference, never duplicate" convention InterferenceItem's own
 * primaryStateProfileId already uses -- never a copy of either record's
 * content, and never written from arc/stateProfile.ts or
 * arc/interferenceItem.ts themselves (both stay completely unmodified).
 *
 * Pure logic only in this file -- the storage/CRUD half lives in
 * data/storage.ts's own new block, mirroring loadStateProfiles/
 * loadInterferenceItems exactly. Nothing in this repository calls any
 * of this yet -- no BUILD or LIVE screen in this phase.
 */

import type { LibraryItemStatus, OwnedLibraryRecord } from "./libraryItemStatus.ts";

export interface CombinedInterferenceSelection extends OwnedLibraryRecord {
  stateProfileId: string;
  /**
   * The reusable, BUILD-configured set of InterferenceItem ids available
   * for combined practice with this State -- never a session's own
   * subset (see this module's own header doc). Always deduplicated,
   * order-preserving (dedupeItemIdsPreservingOrder) -- normalizeCombined
   * InterferenceSelection re-applies this defensively for any record
   * loaded from storage.
   */
  configuredItemIds: string[];
  /**
   * Whether the full ARC Presence protocol is configured as part of
   * this State's combined practice at all -- a separate BUILD-time
   * flag, since Presence is deliberately never a member of
   * InterferenceCategory (see arc/interferenceItem.ts's own doc) and so
   * can never appear inside configuredItemIds itself.
   */
  presenceEnabled: boolean;
  /**
   * Adaptive ARC architecture task, Phase 14A: the stable id of the one
   * saved PresenceArc (arc/types.ts) this State's combined practice
   * should run as its full Presence protocol -- never a copy of that
   * record's own fields (same "reference, never duplicate" convention
   * every other cross-reference in this feature already uses). null
   * means "not yet chosen" -- this is a normal, valid state (including
   * for every record saved before this field existed, via
   * normalizeCombinedInterferenceSelection's own backfill below), never
   * treated as an error on its own; only arc/combinedPresenceLink.ts's
   * own resolver decides what that means for readiness. Presence itself
   * can be enabled/disabled independently of whether a link is chosen --
   * disabling presenceEnabled never clears this field (see
   * arc/combinedPresenceLink.ts's own "not_requested regardless of a
   * stale linked id" rule), so re-enabling Presence later remembers the
   * previous choice.
   */
  linkedPresenceArcId: string | null;
  status: LibraryItemStatus;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export function generateCombinedInterferenceSelectionId(): string {
  return `combinedselection-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** A fresh, empty CombinedInterferenceSelection for `stateProfileId` -- mirrors createEmptyStateProfile's own shape exactly. */
export function createEmptyCombinedInterferenceSelection(id: string, stateProfileId: string, ownerProgramId: string | null, now: string): CombinedInterferenceSelection {
  return {
    id,
    ownerProgramId,
    stateProfileId,
    configuredItemIds: [],
    presenceEnabled: false,
    linkedPresenceArcId: null,
    status: "enabled",
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * First-occurrence-wins, order-preserving de-duplication -- the one
 * dedup rule this entire feature uses (both for a stored
 * configuredItemIds list and for a session's own selectedItemIds),
 * defined once here and reused by arc/combinedRoute.ts rather than
 * re-implemented there.
 */
export function dedupeItemIdsPreservingOrder(ids: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/** Defensive backfill for a record parsed from storage -- mirrors arc/stateProfile.ts's own normalizeStateProfile exactly (safe defaults, never invented content, never overwrites an already-configured field). */
export function normalizeCombinedInterferenceSelection(selection: CombinedInterferenceSelection): CombinedInterferenceSelection {
  return {
    ...selection,
    ownerProgramId: selection.ownerProgramId ?? null,
    configuredItemIds: dedupeItemIdsPreservingOrder(Array.isArray(selection.configuredItemIds) ? selection.configuredItemIds : []),
    presenceEnabled: selection.presenceEnabled ?? false,
    linkedPresenceArcId: selection.linkedPresenceArcId ?? null,
    status: selection.status ?? "enabled",
    schemaVersion: selection.schemaVersion ?? 1,
  };
}

/** Updates the one selection matching `selection.id` in place if found, otherwise appends it as new. Never reorders the rest of the list -- mirrors arc/stateProfile.ts's upsertStateProfileInList exactly. */
export function upsertCombinedInterferenceSelectionInList(selections: CombinedInterferenceSelection[], selection: CombinedInterferenceSelection): CombinedInterferenceSelection[] {
  const index = selections.findIndex((existing) => existing.id === selection.id);
  if (index === -1) return [...selections, selection];
  return selections.map((existing, i) => (i === index ? selection : existing));
}

/**
 * The one-per-State invariant's own read side: the single non-archived
 * CombinedInterferenceSelection for `stateProfileId`, or null when none
 * exists yet. Archived selections are excluded -- they are not "the
 * active configuration" any more, exactly like an archived StateProfile/
 * InterferenceItem is never offered live (arc/libraryItemStatus.ts's
 * own status vocabulary).
 */
export function resolveCombinedInterferenceSelectionForState(selections: CombinedInterferenceSelection[], stateProfileId: string): CombinedInterferenceSelection | null {
  return selections.find((selection) => selection.stateProfileId === stateProfileId && selection.status !== "archived") ?? null;
}

/**
 * The one-per-State invariant's own write side: updates the existing
 * CombinedInterferenceSelection for `stateProfileId` if one exists
 * (never creating a second record for the same State), or creates a
 * fresh one otherwise. This is the sanctioned way to persist a BUILD
 * change to "which items/Presence are configured for this State" --
 * never call upsertCombinedInterferenceSelectionInList directly with a
 * freshly generated id without first checking
 * resolveCombinedInterferenceSelectionForState yourself, or a second
 * record for the same State can be created. `generateId` is injectable
 * purely for deterministic tests; production callers omit it.
 *
 * Adaptive ARC architecture task, Phase 14A: `linkedPresenceArcId` is a
 * new, OPTIONAL final parameter (backward-compatible signature -- every
 * existing call site that predates this field keeps compiling and
 * behaving exactly as before). Passing `undefined` (i.e. omitting the
 * argument entirely) means "leave whatever link this State already had
 * untouched" -- it resolves to the existing record's own
 * linkedPresenceArcId (or null for a brand-new record), never to null
 * outright, so an old caller that has never heard of this field can
 * never silently clear a link a trainee already chose. Pass `null`
 * explicitly to clear a link, or a real id to set/replace one.
 */
export function applyConfiguredSelectionForState(
  selections: CombinedInterferenceSelection[],
  stateProfileId: string,
  configuredItemIds: string[],
  presenceEnabled: boolean,
  ownerProgramId: string | null,
  now: string,
  generateId: () => string = generateCombinedInterferenceSelectionId,
  linkedPresenceArcId?: string | null
): CombinedInterferenceSelection[] {
  const existing = resolveCombinedInterferenceSelectionForState(selections, stateProfileId);
  const deduped = dedupeItemIdsPreservingOrder(configuredItemIds);
  const resolvedLinkedPresenceArcId = linkedPresenceArcId !== undefined ? linkedPresenceArcId : (existing?.linkedPresenceArcId ?? null);
  const updated: CombinedInterferenceSelection = existing
    ? { ...existing, configuredItemIds: deduped, presenceEnabled, linkedPresenceArcId: resolvedLinkedPresenceArcId, updatedAt: now }
    : {
        ...createEmptyCombinedInterferenceSelection(generateId(), stateProfileId, ownerProgramId, now),
        configuredItemIds: deduped,
        presenceEnabled,
        linkedPresenceArcId: resolvedLinkedPresenceArcId,
      };
  return upsertCombinedInterferenceSelectionInList(selections, updated);
}
