/**
 * arc/libraryItemUsage.ts
 *
 * Personal Development consolidation task, step 1: pure "who else uses
 * this shared library record" lookups -- InterferenceItem/StateProfile/
 * PresenceArc are each reusable records referenced BY ID from
 * PersonalDevelopmentRouteConfig.interferenceItemIds/stateProfileId/
 * linkedPresenceArcId, and more than one route may reference the SAME
 * record. The new inline BUILD screen (PersonalDevelopmentRouteEditorScreen.tsx)
 * uses these to decide whether an inline edit needs the "copy-or-continue"
 * safety gate before writing -- see that screen's own doc for the UI side.
 *
 * A route in this file's own results is always:
 *   - NOT the route currently being edited (`excludeRouteId`, when given)
 *     -- editing from inside the very route that already owns this
 *     reference must never flag itself as an "other" user.
 *   - NOT archived -- an archived route is retired and never offered live
 *     again (see arc/libraryItemStatus.ts's own doc); it no longer counts
 *     as "still linked" for the purpose of warning about a shared edit.
 * A disabled (but not archived) route still counts -- disabling is
 * temporary and reversible, so its own reference is still real.
 *
 * Pure logic only -- no storage import, no React. Every function here is
 * a plain filter over an already-loaded PersonalDevelopmentRouteConfig[]
 * array; callers load that list exactly as every other screen already
 * does (data/storage.ts's own loadPersonalDevelopmentRouteConfigs).
 */

import type { PersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import type { InterferenceItem } from "./interferenceItem.ts";
import type { StateProfile } from "./stateProfile.ts";
import type { PresenceArcDraft } from "./presenceArcs.ts";

function findReferencingRoutes(
  allConfigs: PersonalDevelopmentRouteConfig[],
  excludeRouteId: string | null | undefined,
  matches: (config: PersonalDevelopmentRouteConfig) => boolean
): PersonalDevelopmentRouteConfig[] {
  return allConfigs.filter((config) => config.status !== "archived" && config.id !== excludeRouteId && matches(config));
}

/** Every OTHER non-archived route whose own interferenceItemIds includes `itemId`. */
export function findRouteConfigsReferencingInterferenceItem(
  itemId: string,
  allConfigs: PersonalDevelopmentRouteConfig[],
  excludeRouteId?: string | null
): PersonalDevelopmentRouteConfig[] {
  return findReferencingRoutes(allConfigs, excludeRouteId, (config) => config.interferenceItemIds.includes(itemId));
}

/**
 * Every OTHER non-archived route whose own stateProfileId is `stateProfileId`
 * -- meaningful regardless of stateInclusionPolicy ("linked" or
 * "decide_in_live"; a "none" route's own stateProfileId is always null
 * per validatePersonalDevelopmentRouteConfig, so it can never match here).
 */
export function findRouteConfigsReferencingStateProfile(
  stateProfileId: string,
  allConfigs: PersonalDevelopmentRouteConfig[],
  excludeRouteId?: string | null
): PersonalDevelopmentRouteConfig[] {
  return findReferencingRoutes(allConfigs, excludeRouteId, (config) => config.stateProfileId === stateProfileId);
}

/** Every OTHER non-archived route with presenceEnabled and its own linkedPresenceArcId equal to `presenceArcId`. */
export function findRouteConfigsReferencingPresenceArc(
  presenceArcId: string,
  allConfigs: PersonalDevelopmentRouteConfig[],
  excludeRouteId?: string | null
): PersonalDevelopmentRouteConfig[] {
  return findReferencingRoutes(allConfigs, excludeRouteId, (config) => config.presenceEnabled && config.linkedPresenceArcId === presenceArcId);
}

/** True when at least one other non-archived route references this record -- the exact condition that must trigger the inline BUILD screen's copy-or-continue gate, rather than a silent inline edit. */
export function isLibraryItemSharedElsewhere(referencingRoutes: PersonalDevelopmentRouteConfig[]): boolean {
  return referencingRoutes.length > 0;
}

// ---------------------------------------------------------------------------
// "Copy for this program only" -- the inline BUILD screen's own
// shared-item safety gate offers this as the alternative to "continue
// editing" (which is just the ordinary shared-library upsert, already
// exercised by every other screen's own save path -- nothing new to test
// here). Each pair below is: clone the record under a fresh id/timestamps
// (never sharing an id with, or mutating, the original), then repoint
// ONLY the given route's own reference to the new id. The original
// record and every OTHER route referencing it are never read or written
// by either function -- repoint* takes and returns a config, nothing
// else; clone* takes and returns a record, nothing else.
// ---------------------------------------------------------------------------

/** A new, independent InterferenceItem under a fresh id -- never shares an id with, or mutates, `original`. */
export function cloneInterferenceItemForProgram(original: InterferenceItem, newId: string, now: string): InterferenceItem {
  return { ...original, id: newId, createdAt: now, updatedAt: now };
}

/**
 * Repoints ONLY this route's own reference from `originalItemId` to
 * `newItemId` -- interferenceItemIds keeps its exact BUILD-order
 * position (a plain id substitution, never an append/reorder), and the
 * item's own itemRelationships entry (if any) moves with it to the new
 * id. Every other field is untouched; returns a new object, never
 * mutates `config`.
 */
export function repointInterferenceItemReference(config: PersonalDevelopmentRouteConfig, originalItemId: string, newItemId: string): PersonalDevelopmentRouteConfig {
  const interferenceItemIds = config.interferenceItemIds.map((id) => (id === originalItemId ? newItemId : id));
  const itemRelationships = { ...config.itemRelationships };
  const relationship = itemRelationships[originalItemId];
  delete itemRelationships[originalItemId];
  if (relationship) itemRelationships[newItemId] = relationship;
  return { ...config, interferenceItemIds, itemRelationships };
}

/** A new, independent StateProfile under a fresh id -- never shares an id with, or mutates, `original`. */
export function cloneStateProfileForProgram(original: StateProfile, newId: string, now: string): StateProfile {
  return { ...original, id: newId, createdAt: now, updatedAt: now };
}

/** Repoints ONLY this route's own stateProfileId to `newStateProfileId`. Every other field is untouched; returns a new object, never mutates `config`. */
export function repointStateProfileReference(config: PersonalDevelopmentRouteConfig, newStateProfileId: string): PersonalDevelopmentRouteConfig {
  return { ...config, stateProfileId: newStateProfileId };
}

/** A new, independent PresenceArc draft -- a plain copy, since the caller always assigns it a fresh id separately (see repointPresenceArcReference) before ever saving it. */
export function clonePresenceArcDraftForProgram(original: PresenceArcDraft): PresenceArcDraft {
  return { ...original };
}

/** Repoints ONLY this route's own linkedPresenceArcId to `newPresenceArcId`. Every other field is untouched; returns a new object, never mutates `config`. */
export function repointPresenceArcReference(config: PersonalDevelopmentRouteConfig, newPresenceArcId: string): PersonalDevelopmentRouteConfig {
  return { ...config, linkedPresenceArcId: newPresenceArcId };
}
