/**
 * arc/activeProgramPolicy.ts
 *
 * Adaptive ARC architecture task, decisions 1 and 5 (single-active-
 * program semantics; reactivating an archived Self Development
 * program): pure, generic policy helpers over any record shaped like
 * ProgramActivationRecord below -- deliberately generic rather than
 * hard-coded to ArcGoal/PersonalDevelopmentFourWeekProgram, so the SAME
 * logic governs both tracks' own list (arc/types.ts's own `isActive`/
 * `archivedAt` fields on each type are that record's own concrete
 * instance of this shape).
 *
 * Pure logic only -- nothing in this repository calls anything below
 * yet. No screen, no storage write, no migration is wired to this
 * module in this phase.
 */

export interface ProgramActivationRecord {
  id: string;
  isActive?: boolean;
  archivedAt?: string | null;
}

/** True only when at most one record in the list is active -- the invariant every track's own list must always satisfy. */
export function hasAtMostOneActiveProgram<T extends ProgramActivationRecord>(programs: T[]): boolean {
  return programs.filter((p) => p.isActive === true).length <= 1;
}

/** The one currently active record, or null when none is active (e.g. right after migration, before a trainee has activated anything -- see arc/types.ts's own isActive doc on why migration never guesses one). */
export function findActiveProgram<T extends ProgramActivationRecord>(programs: T[]): T | null {
  return programs.find((p) => p.isActive === true) ?? null;
}

/**
 * Idempotent: archiving an already-archived record is a no-op on its
 * own archivedAt (never overwrites the original archive timestamp),
 * matching the same idempotent-delete precedent already used elsewhere
 * in this codebase (e.g. arc/fourWeekProgram.ts's completeProgramWeek).
 */
export function archiveProgram<T extends ProgramActivationRecord>(program: T, now: string): T {
  if (program.isActive !== true && program.archivedAt != null) {
    return program;
  }
  return { ...program, isActive: false, archivedAt: program.archivedAt ?? now };
}

export function activateProgram<T extends ProgramActivationRecord>(program: T): T {
  return { ...program, isActive: true, archivedAt: null };
}

export interface ReactivationPlan<T extends ProgramActivationRecord> {
  /** The record to archive (the track's previously-active one), or null when nothing was active. Every field OTHER than isActive/archivedAt is left completely untouched by this plan -- see this module's own test proving item-level/library data embedded on a record survives byte-for-byte. */
  toArchive: T | null;
  /** The target record, now marked active. Same "everything else untouched" guarantee. */
  toActivate: T;
}

/**
 * Adaptive ARC architecture task, decision 5: plans a reactivation --
 * "archive the currently active program, reactivate the selected one" --
 * as a pure, side-effect-free description of the two writes a caller
 * must perform, never performing them itself. Returns null when
 * `targetId` doesn't match any record in the list (never throws).
 *
 * Deliberately does NOT touch any embedded per-item status a program
 * record may carry (e.g. a future StateProfile/IdentityProfile/
 * InterferenceItem "enabled" library) -- decision 5's own "must not
 * automatically change the internal status of every State, Identity, or
 * interference item... Restore its previously enabled subset... Do not
 * silently reactivate internally archived items." This function only
 * ever changes isActive/archivedAt on the two top-level program records
 * it returns; every other field is carried through via object spread,
 * so any embedded item-status data is preserved exactly as it was.
 */
export function planReactivation<T extends ProgramActivationRecord>(programs: T[], targetId: string, now: string): ReactivationPlan<T> | null {
  const target = programs.find((p) => p.id === targetId);
  if (!target) return null;

  const currentActive = programs.find((p) => p.isActive === true && p.id !== targetId) ?? null;

  return {
    toArchive: currentActive ? archiveProgram(currentActive, now) : null,
    toActivate: activateProgram(target),
  };
}

/**
 * Applies a ReactivationPlan onto a program list -- a small pure helper
 * so a caller doesn't have to hand-roll the two upserts itself. Replaces
 * `toArchive` (when present) and `toActivate` in place by id; never
 * reorders, adds, or removes any other record.
 */
export function applyReactivationPlan<T extends ProgramActivationRecord>(programs: T[], plan: ReactivationPlan<T>): T[] {
  return programs.map((p) => {
    if (plan.toArchive && p.id === plan.toArchive.id) return plan.toArchive;
    if (p.id === plan.toActivate.id) return plan.toActivate;
    return p;
  });
}
