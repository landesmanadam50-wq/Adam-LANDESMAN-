/**
 * data/taskJournal.ts
 *
 * ARCHI productivity task, Stage 1 foundation: the Task journal -- a
 * genuinely separate, append-only history of everything that happens
 * around a task (a work attempt starting/ending, interference being
 * reported, a protocol run completing, postponement, completion), kept
 * apart from the Task record itself (arc/tasks.ts). Mirrors
 * data/lifeManifestJournal.ts's LifeManifestJournalEntry exactly: one
 * flat, kind-discriminated, append-only type, each row a frozen
 * snapshot captured once at the moment of the event and never re-read
 * live afterward. CRUD lives in data/storage.ts, matching where
 * loadLifeManifestJournal/appendLifeManifestJournalEntry live relative
 * to that file's own sibling type module. This is also the source a
 * later Insights stage reads from for its factual aggregates (most
 * frequent interfering factor, regulation tool associated with the most
 * task returns, etc. -- product spec's "Journal and insights" section).
 *
 * Productivity roadmap, Stage Y: the richer per-protocol-run fields
 * this module's own doc previously deferred are now added, additively
 * (every new field is `| null`, backfilled by normalizeTaskJournalEntry
 * below) -- one per route actually built in Stages L-U:
 * `interferenceCategory` (Stage L's own 9-category chooser),
 * `confirmedEmotion` (Stage M/N), `savedFactorKind`/`savedFactorId`
 * (Stage P/R/S -- which saved Urge/Thought/Belief protocol was
 * practiced), `reviewLaterFactorId` (Stage Q/T -- a new, unmatched
 * factor captured instead). "Selected need beneath an urge" lives on
 * the ReviewLaterFactor record itself (arc/reviewLaterFactor.ts) and is
 * reachable from reviewLaterFactorId, never duplicated here. Fields
 * the spec also wants but no route yet populates (stopping action,
 * regulation tool, encoding, alternative action, user-written thought/
 * belief text, before/after rating) are still deliberately NOT modeled
 * -- adding them ahead of the logic that would fill them risks
 * guessing the wrong shape.
 */

export type TaskJournalEntryKind =
  | "attempt_started"
  | "attempt_ended"
  | "interference_reported"
  | "protocol_run_completed"
  | "postponed"
  | "task_completed"
  | "session_reflection";

export type TaskAttemptOutcome = "completed" | "paused" | "postponed" | "abandoned";

export interface TaskJournalEntry {
  id: string;
  /** REFERENCE, kept for filtering/navigation -- never re-resolved to pull "current" task data back into this frozen row. */
  taskId: string;
  kind: TaskJournalEntryKind;
  /** The event's own timestamp (SessionLogEntry/LifeManifestJournalEntry's own "occurredAt" convention). */
  occurredAt: string;
  /** Set on "attempt_started"/"attempt_ended" -- ties the two rows of one continuous work session together. */
  attemptId: string | null;
  /** Set on "attempt_ended" only. */
  attemptOutcome: TaskAttemptOutcome | null;
  /** Set on "interference_reported"/"protocol_run_completed" once the top-level triage route exists (a later stage) -- the trainee's own top-level "what do you notice happening right now?" selection, frozen at the moment it was made. */
  interferenceReason: string | null;
  /** Set on "interference_reported"/"protocol_run_completed" -- Stage L's own 9-category chooser answer (arc/reactiveFactorChooser.ts's InterferingFactorCategory), as a plain string so this module never imports that pure type (avoids a dependency cycle risk; the value is always one of its 9 literals). */
  interferenceCategory: string | null;
  /** Set on "protocol_run_completed" only when the Stage M/N emotion route confirmed or the trainee manually chose one of the 7 predefined emotions. */
  confirmedEmotion: string | null;
  /** Set on "protocol_run_completed" only when a SAVED urge/thought/belief protocol was practiced (Stage P/R/S). */
  savedFactorKind: "urge" | "thought" | "belief" | null;
  savedFactorId: string | null;
  /** Set on "interference_reported" only when a NEW, unmatched factor was captured instead of a saved one (Stage Q/T) -- references arc/reviewLaterFactor.ts's own ReviewLaterFactor.id. */
  reviewLaterFactorId: string | null;
  /** Set on "protocol_run_completed" -- did the trainee return to the original task afterward. */
  returnedToTask: boolean | null;
  /** Set on "postponed". */
  postponementReason: string | null;
  returnAt: string | null;
  /** Stage X: set only on "session_reflection" -- the trainee's own short, optional, skippable answers. Never required, never long. */
  reflectionReturnedAfterArc: boolean | null;
  reflectionWhatHelped: string | null;
  reflectionWhatToReuse: string | null;
  /** Stage K/Y: set only on "protocol_run_completed" when the Stage K preparation route was actually used (never for its own "start directly, no preparation" skip) -- the chosen state's own display label (arc/preparationStates.ts's getPreparationSourceLabel), frozen at the moment of use. Feeds Stage Y's "most-used preparation state" insight. */
  usedPreparationStateLabel: string | null;
  createdAt: string;
}

/**
 * Builds one entry with every field defaulted to null except the ones
 * the caller actually has -- so each call site (ActiveTaskScreen,
 * PostponementScreen, and every Stage L-U route) only ever states the
 * handful of fields relevant to its own event, never a 15-field
 * literal repeated at every call site.
 */
export function createTaskJournalEntry(
  fields: Pick<TaskJournalEntry, "id" | "taskId" | "kind" | "occurredAt" | "createdAt"> & Partial<TaskJournalEntry>
): TaskJournalEntry {
  return {
    attemptId: null,
    attemptOutcome: null,
    interferenceReason: null,
    interferenceCategory: null,
    confirmedEmotion: null,
    savedFactorKind: null,
    savedFactorId: null,
    reviewLaterFactorId: null,
    returnedToTask: null,
    postponementReason: null,
    returnAt: null,
    reflectionReturnedAfterArc: null,
    reflectionWhatHelped: null,
    reflectionWhatToReuse: null,
    usedPreparationStateLabel: null,
    ...fields,
  };
}

/** Backfills every field a row written before Stage Y might be missing -- same convention as arc/tasks.ts's normalizeTask. */
export function normalizeTaskJournalEntry(entry: TaskJournalEntry): TaskJournalEntry {
  return {
    ...entry,
    interferenceCategory: entry.interferenceCategory ?? null,
    confirmedEmotion: entry.confirmedEmotion ?? null,
    savedFactorKind: entry.savedFactorKind ?? null,
    savedFactorId: entry.savedFactorId ?? null,
    reviewLaterFactorId: entry.reviewLaterFactorId ?? null,
    reflectionReturnedAfterArc: entry.reflectionReturnedAfterArc ?? null,
    reflectionWhatHelped: entry.reflectionWhatHelped ?? null,
    reflectionWhatToReuse: entry.reflectionWhatToReuse ?? null,
    usedPreparationStateLabel: entry.usedPreparationStateLabel ?? null,
  };
}
