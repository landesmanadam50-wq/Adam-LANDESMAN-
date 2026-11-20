/**
 * arc/taskReflection.ts
 *
 * Task Reflection Memory & Smart Notification Updates task: "מה למדת
 * מהמשימה הזאת?" -- a trainee's own saved insight about a SPECIFIC
 * task, kept as its own small, mutable (editable/deletable) history,
 * deliberately NOT modeled as another data/taskJournal.ts
 * TaskJournalEntry row. That module is explicitly append-only with "no
 * update/delete function... on purpose" (its own doc), a guarantee
 * every OTHER entry kind there (attempt_started, interference_reported,
 * postponed, etc.) depends on; this feature's own explicit requirement
 * ("allow users to correct or remove an individual reflection") would
 * have meant either breaking that guarantee for everyone, or bolting a
 * second, kind-specific exception onto a type that's deliberately flat
 * and uniform. A dedicated TaskReflection record, keyed by its own id
 * and the owning Task's id, keeps both modules' contracts intact.
 *
 * Recurring-task requirement 4 ("Wednesday's notification shows
 * Monday's reflection"): satisfied for free, with no extra modeling --
 * a recurring task's every occurrence shares the exact same Task.id
 * (arc/taskOccurrence.ts's own doc: recurrence lives on ONE Task
 * record; only completion is tracked per-occurrence, in a separate side
 * collection). Keying a reflection by taskId alone therefore already
 * gives every occurrence of a recurring task the same shared history,
 * never a separate one per occurrence.
 */

export interface TaskReflection {
  id: string;
  taskId: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export function createTaskReflection(id: string, taskId: string, text: string, now: string): TaskReflection {
  return { id, taskId, text, createdAt: now, updatedAt: now };
}

/** Backfills a record saved before `updatedAt` existed -- same backward-compatibility convention as every other normalize* function in this codebase. */
export function normalizeTaskReflection(reflection: TaskReflection): TaskReflection {
  return { ...reflection, updatedAt: reflection.updatedAt ?? reflection.createdAt };
}

export function reflectionsForTask(reflections: TaskReflection[], taskId: string): TaskReflection[] {
  return reflections.filter((reflection) => reflection.taskId === taskId);
}

/** Newest first, by createdAt -- requirement 5: "the newest reflection should appear first," and editing an OLDER reflection's text must never make it jump ahead of a genuinely more recent one (ordering is always by when it was first written, never by when it was last edited). */
export function sortReflectionsNewestFirst(reflections: TaskReflection[]): TaskReflection[] {
  return [...reflections].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** null when the task has no reflection at all -- callers must preserve whatever default notification text they already show in that case, never invent placeholder content. */
export function resolveLatestReflectionForTask(reflections: TaskReflection[], taskId: string): TaskReflection | null {
  const forTask = sortReflectionsNewestFirst(reflectionsForTask(reflections, taskId));
  return forTask[0] ?? null;
}

export function upsertReflectionInList(reflections: TaskReflection[], updated: TaskReflection): TaskReflection[] {
  const index = reflections.findIndex((reflection) => reflection.id === updated.id);
  if (index === -1) return [...reflections, updated];
  const next = [...reflections];
  next[index] = updated;
  return next;
}

export function removeReflectionFromList(reflections: TaskReflection[], id: string): TaskReflection[] {
  return reflections.filter((reflection) => reflection.id !== id);
}

/**
 * Requirement 2+7: the task-alarm's own title/body pair. Deliberately
 * the ONLY place this decision is made, called from data/taskAlarm.ts's
 * armTaskAlarm every time an alarm is (re-)armed, so a future
 * occurrence's notification always reflects whichever reflection is
 * latest AT ARM TIME (requirement 6's closing line) -- never a value
 * computed once and cached. `showReflectionInNotifications` is the
 * trainee's own lock-screen-privacy preference (requirement 7): when
 * off, the reflection is withheld from the notification's content
 * entirely (not merely a lock-screen-only redaction -- see
 * data/taskAlarm.ts's own doc on why), which is also exactly "no saved
 * reflection" from this function's point of view, so the SAME default
 * branch already covers both cases with no special-casing.
 */
export function resolveTaskAlarmNotificationContent(
  taskTitle: string,
  latestReflectionText: string | null,
  showReflectionInNotifications: boolean
): { title: string; body: string } {
  const reflectionText = showReflectionInNotifications ? latestReflectionText?.trim() || null : null;
  if (!reflectionText) return { title: "הגיע הזמן למשימה", body: taskTitle };
  return { title: taskTitle, body: reflectionText };
}
