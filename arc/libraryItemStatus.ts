/**
 * arc/libraryItemStatus.ts
 *
 * Adaptive ARC architecture task, Phase 3 (data-layer foundations),
 * spec section 6 ("Library ownership and active status"): the shared
 * internal status every State/Identity/Interference library item
 * carries -- generic over any record shaped like LibraryStatusRecord
 * below, mirroring arc/activeProgramPolicy.ts's own cross-type
 * generic-policy precedent (the SAME kind of "status transition" logic
 * governing three different concrete record types, rather than three
 * near-identical copies of it).
 *
 * "One active Self Development program may contain: Many StateProfiles,
 * Many IdentityProfiles, Many InterferenceItems... Program archival must
 * not automatically rewrite every item's internal status" -- this module
 * therefore NEVER reads or writes a program's own isActive/archivedAt
 * (arc/activeProgramPolicy.ts's separate concern); it only ever changes
 * ONE library item's own status, on explicit request, one item at a
 * time. Nothing in this phase calls these functions from a program-level
 * archive/reactivate path.
 *
 * Pure logic only -- nothing in this repository calls anything below yet
 * (Phase 3 is pure logic/types/CRUD only, same scope discipline as
 * Phase 2).
 */

/**
 * "enabled" -- normal, selectable/usable state (the default for a newly
 * created item). "disabled" -- temporarily turned off without deleting
 * it (e.g. superseded by a better version, kept for reference).
 * "archived" -- retired, kept for history/traceability, never offered
 * live. Distinct from a program's own isActive/archivedAt (a program is
 * either the one active one or not); a library item's status is its own,
 * independent field, never derived from or synced to its owning
 * program's activation state.
 */
export type LibraryItemStatus = "enabled" | "disabled" | "archived";

export interface LibraryStatusRecord {
  id: string;
  status: LibraryItemStatus;
  updatedAt: string;
}

/** A library record additionally scoped to one owning Self Development program -- see each concrete type's own `ownerProgramId` doc for why it's nullable (a legacy-adapted item, or a record created before an owning program was resolvable, has none). */
export interface OwnedLibraryRecord extends LibraryStatusRecord {
  ownerProgramId: string | null;
}

/** Turns the item off without deleting it. Idempotent in effect (disabling an already-disabled item just refreshes updatedAt), never touches any other field. */
export function disableLibraryItem<T extends LibraryStatusRecord>(item: T, now: string): T {
  return { ...item, status: "disabled", updatedAt: now };
}

/** Retires the item (kept for history/traceability, never offered live again unless explicitly restored). Never deletes the record -- see this module's own doc. */
export function archiveLibraryItem<T extends LibraryStatusRecord>(item: T, now: string): T {
  return { ...item, status: "archived", updatedAt: now };
}

/** "Restore/enable" -- returns the item to "enabled" regardless of whether it was previously "disabled" or "archived". Never touches any other field (see arc/activeProgramPolicy.ts's planReactivation doc for the identical "everything else untouched" guarantee at the program level, mirrored here at the item level). */
export function restoreLibraryItem<T extends LibraryStatusRecord>(item: T, now: string): T {
  return { ...item, status: "enabled", updatedAt: now };
}

/** True only for an "enabled" item -- the one status a future composer/LIVE session may actually offer. */
export function isLibraryItemEnabled<T extends LibraryStatusRecord>(item: T): boolean {
  return item.status === "enabled";
}

/** Every item belonging to `programId`, regardless of status -- an unfiltered "everything this program owns" listing (e.g. for a management screen that shows disabled/archived items too). */
export function listLibraryItemsForProgram<T extends OwnedLibraryRecord>(items: T[], programId: string): T[] {
  return items.filter((item) => item.ownerProgramId === programId);
}

/** Only the ENABLED items belonging to `programId` -- "Resolve enabled items for a program" (spec section 7's required storage operation), the set a future composer/LIVE session may actually offer. */
export function resolveEnabledLibraryItemsForProgram<T extends OwnedLibraryRecord>(items: T[], programId: string): T[] {
  return items.filter((item) => item.ownerProgramId === programId && item.status === "enabled");
}
