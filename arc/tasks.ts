/**
 * arc/tasks.ts
 *
 * ARCHI productivity task, Stage 1 foundation: the versioned Task data
 * model plus its pure logic (id generation, normalize/backfill,
 * list upsert/delete, and the small set of deterministic status
 * transitions -- start/pause/postpone/complete). No React, no
 * AsyncStorage, no navigation -- I/O lives in data/storage.ts, exactly
 * the same split arc/routines.ts keeps from data/routines.ts (see that
 * file's own module doc) and arc/lifeManifest.ts keeps from its own
 * storage CRUD.
 *
 * Task is the center of the new productivity surface: "Task -> optional
 * supportive-state preparation -> action -> interference -> ARC/Mini
 * ARC -> return to action." This module models only the task's own
 * durable, current-state fields (title, schedule, first/current action,
 * subtasks, optional goal/value/identity/supportive-state links, and
 * status). The GROWING, event-shaped history the product spec also asks
 * for -- attempt history, interference events, protocol runs, whether a
 * given protocol run returned the trainee to the task -- is deliberately
 * NOT modeled as arrays embedded on the Task record itself. Every
 * existing growing-history precedent in this codebase (
 * RoutineOccurrenceCompletion, ArcGoalTargetOccurrenceCompletion,
 * LifeManifestJournalEntry) uses a separate, append-only side collection
 * keyed by the owning record's id instead, so recording one more event
 * never requires a read-modify-write of the owning record's full field
 * set, and Insights (a later stage) can query across every task's
 * history in one pass. See data/taskJournal.ts's TaskJournalEntry for
 * that side collection, and data/storage.ts for its CRUD.
 *
 * Status vocabulary ("planned" | "active" | "paused" | "postponed" |
 * "completed" | "archived") is new to this codebase -- no existing
 * entity models "postponed" as a status. It is intentionally its own
 * bespoke union rather than a reuse of arc/libraryItemStatus.ts's
 * enabled/disabled/archived vocabulary: a Task is a trainee's own
 * to-do item, not a shared, referenceable "library" record (it is never
 * pointed at by id from multiple other records the way an
 * InterferenceItem/StateProfile is), so it supports real deletion
 * (deleteTaskFromList) rather than the library convention of
 * disable-only, non-destructive status transitions. "archived" (Stage H)
 * is the one exception borrowed from that convention: archiving a task
 * hides it from the normal Tasks/Today lists without deleting its own
 * history (journal entries, occurrence completions) the way a real
 * delete would make orphaned/confusing -- see archiveTask/unarchiveTask
 * below.
 */

export type TaskStatus = "planned" | "active" | "paused" | "postponed" | "completed" | "archived";

export interface TaskSubtask {
  id: string;
  title: string;
  completed: boolean;
}

/** Mirrors ScheduledRoutine.recurrenceDays' own 0-6 (Sunday-Saturday, Date.getDay() convention) day-of-week numbering -- never a separate day-numbering scheme. */
export type TaskRecurrence = { kind: "once" } | { kind: "recurring"; daysOfWeek: number[] };

export interface Task {
  id: string;
  title: string;
  description: string | null;
  /** Local YYYY-MM-DD, same convention as program/dateUtils.ts's todayLocalDateString. */
  scheduledDate: string | null;
  /** "HH:MM", 24-hour, device-local -- same convention as ScheduledRoutine's separate hour/minute fields, kept here as one string since a task (unlike a routine) has no recurrence-time reuse to justify splitting it. */
  scheduledTime: string | null;
  expectedDurationMinutes: number | null;
  /** The task's own first physical action, set once at creation. Never overwritten in place -- see currentAction below for the field the practical-task-difficulty route (a later stage) updates. */
  firstAction: string;
  /** Defaults to firstAction at creation; the practical-task-difficulty route (a later stage) may narrow this to a smaller next action without losing firstAction's own original text. */
  currentAction: string | null;
  subtasks: TaskSubtask[];
  recurrence: TaskRecurrence;
  linkedArcGoalId: string | null;
  /** Hebrew BUILD/LIVE rework spec, page 4: a reference to the ArcBuild (ARC practice) this task's "ARC" end-of-timer choice opens directly -- distinct from linkedArcGoalId above (a goal, not a practice). null means the trainee picks a practice at the moment they choose "ARC" instead (see arc/taskTimerEndChoice.ts's resolveArcChoiceDestination). */
  linkedArcBuildId: string | null;
  /** Free-text value this task serves -- optional, user-written, never inferred. */
  value: string | null;
  /** Free-text identity this task reinforces -- optional, user-written, never inferred. */
  identity: string | null;
  /** References a saved personal supportive state, or one of the fixed preset keys (focus/confidence/calm/energy/patience/curiosity/determination/creativity) a later stage defines -- optional, and always changeable/skippable at runtime regardless of this default (product spec: "the user can change or skip it at runtime"). */
  defaultSupportiveStateId: string | null;
  status: TaskStatus;
  /** Set only while status is "postponed". */
  postponementReason: string | null;
  /** ISO timestamp of when to return to this task -- set only while status is "postponed" (product spec: "Postponement must end with either a return time or an explicit move to an unscheduled list", the latter being returnAt: null while still postponed). */
  returnAt: string | null;
  /** Reminder scheduling pair, same {notificationId, scheduledFor} shape every other per-entity reminder in this codebase uses (ScheduledRoutine.nextOccurrenceNotificationId/nextOccurrenceScheduledFor, ArcGoalTarget.notificationId/notificationScheduledFor) -- fields wired now so a later reminders stage never needs a breaking schema change, left null until that stage's reconcile logic exists. */
  notificationId: string | null;
  notificationScheduledFor: string | null;
  /** Set once, for a one-time task's own single completion. A recurring task's per-occurrence completions belong in a separate occurrence-completion collection (mirroring RoutineOccurrenceCompletion/ArcGoalTargetOccurrenceCompletion), not yet needed until a later stage actually renders recurring tasks in Today. */
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
}

const CURRENT_TASK_SCHEMA_VERSION = 1;

export function createEmptyTask(id: string, title: string, firstAction: string, now: string): Task {
  return {
    id,
    title,
    description: null,
    scheduledDate: null,
    scheduledTime: null,
    expectedDurationMinutes: null,
    firstAction,
    currentAction: firstAction,
    subtasks: [],
    recurrence: { kind: "once" },
    linkedArcGoalId: null,
    linkedArcBuildId: null,
    value: null,
    identity: null,
    defaultSupportiveStateId: null,
    status: "planned",
    postponementReason: null,
    returnAt: null,
    notificationId: null,
    notificationScheduledFor: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    schemaVersion: CURRENT_TASK_SCHEMA_VERSION,
  };
}

/**
 * Backfills every field a Task saved by an earlier version of this
 * schema might be missing, so every other reader in the app can assume
 * a fully-populated record -- the same normalize-at-load-time pattern
 * as normalizePersonalDevelopmentRouteConfig/normalizeLifeManifest (see
 * data/storage.ts's own module doc for the concrete motivating bug:
 * unguarded reads of a field added after a record was first saved crash
 * with no error boundary).
 */
export function normalizeTask(task: Task): Task {
  return {
    ...task,
    description: task.description ?? null,
    scheduledDate: task.scheduledDate ?? null,
    scheduledTime: task.scheduledTime ?? null,
    expectedDurationMinutes: task.expectedDurationMinutes ?? null,
    firstAction: task.firstAction ?? "",
    currentAction: task.currentAction ?? task.firstAction ?? null,
    subtasks: Array.isArray(task.subtasks) ? task.subtasks : [],
    recurrence: task.recurrence ?? { kind: "once" },
    linkedArcGoalId: task.linkedArcGoalId ?? null,
    linkedArcBuildId: task.linkedArcBuildId ?? null,
    value: task.value ?? null,
    identity: task.identity ?? null,
    defaultSupportiveStateId: task.defaultSupportiveStateId ?? null,
    status: task.status ?? "planned",
    postponementReason: task.postponementReason ?? null,
    returnAt: task.returnAt ?? null,
    notificationId: task.notificationId ?? null,
    notificationScheduledFor: task.notificationScheduledFor ?? null,
    completedAt: task.completedAt ?? null,
    schemaVersion: task.schemaVersion ?? CURRENT_TASK_SCHEMA_VERSION,
  };
}

export function upsertTaskInList(tasks: Task[], task: Task): Task[] {
  const index = tasks.findIndex((existing) => existing.id === task.id);
  if (index === -1) return [...tasks, task];
  const next = [...tasks];
  next[index] = task;
  return next;
}

export function deleteTaskFromList(tasks: Task[], id: string): Task[] {
  return tasks.filter((task) => task.id !== id);
}

/** Same stable-id-string pattern as arc/routines.ts's generateRoutineId -- not cryptographically unique; collision odds are astronomically low at this single-device, trainee-authored scale. */
export function generateTaskId(): string {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function generateTaskSubtaskId(): string {
  return `task-subtask-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Same id-generator convention, for data/taskJournal.ts's TaskJournalEntry -- lives alongside domain logic here, not in data/, mirroring generateLifeManifestJournalEntryId's own placement in arc/lifeManifest.ts rather than data/lifeManifestJournal.ts. */
export function generateTaskJournalEntryId(): string {
  return `task-journal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * "Start now" (or resuming a paused/postponed task). Clears any leftover
 * postponement fields -- a task that's actively being worked on again is
 * no longer, in any sense, postponed.
 */
export function startTask(task: Task, now: string): Task {
  return { ...task, status: "active", postponementReason: null, returnAt: null, updatedAt: now };
}

/** "Pause" -- keeps the task's current/first action and every other field untouched, only the status changes. */
export function pauseTask(task: Task, now: string): Task {
  return { ...task, status: "paused", updatedAt: now };
}

/**
 * The postponement flow's own terminal write (a later stage's screen
 * collects reason/returnAt through the product spec's postponement
 * questions; this is the single pure state change all of those answers
 * resolve to). returnAt: null is the explicit "move to an unscheduled
 * list" outcome the product spec calls for as postponement's other valid
 * ending, alongside a concrete return time.
 */
export function postponeTask(task: Task, reason: string | null, returnAt: string | null, now: string): Task {
  return { ...task, status: "postponed", postponementReason: reason, returnAt, updatedAt: now };
}

export function completeTask(task: Task, now: string): Task {
  return { ...task, status: "completed", completedAt: now, postponementReason: null, returnAt: null, updatedAt: now };
}

/** Hides the task from the normal Tasks/Today lists without deleting it or its history -- see this file's own module doc. Clears any leftover postponement fields, mirroring startTask/completeTask's own convention of never leaving a stale postponement behind a status transition. */
export function archiveTask(task: Task, now: string): Task {
  return { ...task, status: "archived", postponementReason: null, returnAt: null, updatedAt: now };
}

/** Returns an archived task to "planned" -- never "completed" or any other status, since archiving never recorded completion. A no-op (still returns a new object with updatedAt bumped) when called on a task that isn't archived, same permissive style as pauseTask/startTask. */
export function unarchiveTask(task: Task, now: string): Task {
  return { ...task, status: "planned", updatedAt: now };
}

export function toggleTaskSubtaskCompletion(task: Task, subtaskId: string, now: string): Task {
  return {
    ...task,
    subtasks: task.subtasks.map((subtask) => (subtask.id === subtaskId ? { ...subtask, completed: !subtask.completed } : subtask)),
    updatedAt: now,
  };
}

/** Updates only currentAction -- the practical-task-difficulty route's own terminal write (a later stage), narrowing the task to its smallest next action without losing firstAction's original text. */
export function setTaskCurrentAction(task: Task, currentAction: string, now: string): Task {
  return { ...task, currentAction, updatedAt: now };
}
