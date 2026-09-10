/**
 * data/lifeManifestJournal.ts
 *
 * Sub-goal↔ARC Goal connection task: the Life Manifest journal -- a
 * genuinely separate, append-only history of completion events, kept
 * apart from the "calendar/upcoming" view (which is computed LIVE from
 * SubGoal.startDate/deadline and Target.startDate/targetDate, never
 * stored, so there's nothing there to go stale). Mirrors
 * data/sessionLog.ts's SessionLogEntry exactly: one flat, append-only
 * type, each row a frozen snapshot captured once at the moment of the
 * event and never re-read live afterward -- this is what "preserve
 * historical journal entries even if a link is later changed" (spec)
 * actually protects. CRUD lives in data/storage.ts, matching where
 * loadSessionLog/appendSessionLogEntry live relative to this file's own
 * sibling type module.
 */

export type LifeManifestJournalEntryKind = "sub_goal_completed" | "target_completed";

export interface LifeManifestJournalEntry {
  id: string;
  kind: LifeManifestJournalEntryKind;
  /** REFERENCEs, kept for filtering/navigation -- never re-resolved to pull "current" data back into this frozen row. */
  lifeManifestId: string;
  majorGoalId: string;
  subGoalId: string;
  /** Set only when kind is "target_completed". */
  targetId: string | null;
  /** The ArcGoal id this entity was linked to AT THE MOMENT of the event, if any -- a reference, and itself a frozen snapshot (the live link may be switched/removed afterward without altering this row). */
  linkedArcGoalId: string | null;
  /** Frozen display text, captured once -- renaming the Sub-goal/Target afterward never rewrites history. */
  subGoalTitle: string;
  targetTitle: string | null;
  /** The completion timestamp itself (SubGoal.completedAt / Target.completedAt at the time this row was appended). */
  occurredAt: string;
  createdAt: string;
}
