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

import type { TaskActionStage } from "./taskStage.ts";
import { normalizeTaskActionStage } from "./taskStage.ts";

export type TaskStatus = "planned" | "active" | "paused" | "postponed" | "completed" | "archived";

/**
 * Productivity & Personal Development upgrade task, requirement 6: a
 * "standard" task is everything this module already modeled; "manifest"
 * is a FIXED task kind linked to a long-term goal, guided through its
 * own short visualize -> ARC -> identity-action sequence
 * (arc/manifestTaskSteps.ts/arc/manifestTaskCopy.ts) instead of the
 * plain work timer -- see live/ActiveTaskScreen.tsx's own gate on this
 * field. A Manifest task is still a real Task: same model, same
 * persistence, same Today/scheduling/recurrence/notification
 * machinery, never a second task store or a new main screen.
 *
 * "arcFocus" (ARC Focus task): same guarantee, for the ARC GYM
 * sustained-attention exercise -- live/ActiveTaskScreen.tsx's own
 * performStart routes it to the mood check-in instead of the plain work
 * timer, exactly like "manifest" routes to its own guided sequence. An
 * ARC Focus task's own duration/rhythm settings live in
 * arc/arcFocusSettings.ts (keyed by this task's id), never as new
 * fields on Task itself.
 */
/** ARC Learning + ARC Creativity + Integrated Spaced Repetition task: "arcLearningReview"/"arcCreativityReview" mark a task whose own performStart() branch opens the shared recall screen (build/ArcLearningRecallScreen.tsx / build/ArcCreativityRecallScreen.tsx) instead of a normal work timer -- same precedent as "arcFocus". Neither carries a fixed list of insight/connection ids: due items are always resolved fresh at start time via resolveDueArcLearningInsightIds/resolveDueArcCreativityConnectionIds, so a recurring weekly block collects whatever is due THEN rather than ever needing a duplicate task per occurrence. */
export type TaskKind = "standard" | "manifest" | "arcFocus" | "arcLearningReview" | "arcCreativityReview";

/** The Step-A setup a Manifest task's own guided sequence reads from every time it runs -- defined once (or re-edited later) in build/TaskEditorScreen.tsx, never re-asked per session. All four fields are free text, user-authored, never inferred. */
export interface ManifestProfile {
  longTermGoal: string;
  desiredResult: string;
  desiredIdentity: string;
  bodyLanguageDescription: string;
}

export function createEmptyManifestProfile(): ManifestProfile {
  return { longTermGoal: "", desiredResult: "", desiredIdentity: "", bodyLanguageDescription: "" };
}

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
  /** Final Morning Flow Requirements Audit task: free-text, optional -- where the task happens, so the Daily Visualization exercise's own per-task visualization can use it alongside the saved time and first action. Never required, never inferred. */
  location: string | null;
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
  /** Requirement 6: "standard" (default) or "manifest". Additive -- every pre-existing Task, saved before this field existed, normalizes to "standard" and behaves exactly as before. */
  taskKind: TaskKind;
  /** Only meaningful when taskKind === "manifest"; null for every "standard" task. */
  manifestProfile: ManifestProfile | null;
  /**
   * ARC-system upgrade task ("ARC ספונטני ויצירת ARC מתוכנן", Part 2): an
   * OPTIONAL, explicitly-set number of minutes of ARC time immediately
   * BEFORE this task's own scheduled time -- e.g. 5 means an "ARC
   * אופציונלי" window from (scheduledTime - 5min) to scheduledTime. null
   * (the default) means no window at all; this is never auto-added
   * between tasks, only ever set per-task by the trainee in
   * build/TaskEditorScreen.tsx (spec: "אין להוסיף חלון ARC אוטומטי לאחר
   * כל משימה"). The window itself never requires an unpleasant/distinct
   * ARC build linked to it -- it only governs whether live/ActiveTaskScreen.tsx
   * and build/TodayScreen.tsx offer the ARC-window chooser
   * (live/ArcWindowScreen.tsx) before this task; it is purely advisory
   * and skippable, never a gate on starting or completing the task.
   */
  arcWindowMinutesBefore: number | null;
  /**
   * Automatic Routine Builder: set only for a task generated from a
   * RoutineTaskTemplate (see arc/dailyRoutine.ts) -- links this Task
   * back to the template entry it was materialized from, so editing or
   * removing that template entry can find and update/archive the
   * right Task. null for every ad-hoc task, including a "today only"
   * one-off routine addition (which is never written into the
   * template, so it has no template entry to link back to).
   */
  routineTaskTemplateId: string | null;
  /** Which of the four daily periods this routine-generated task belongs to -- null for any non-routine task. Purely a display/grouping key; never affects scheduling logic outside arc/dailyRoutine.ts's own grouping. */
  routinePeriodId: RoutinePeriodId | null;
  /** The break template (if any) that follows this routine task, copied onto the Task itself at generation/edit time so the daily schedule screen can render "task, then its break" without a second lookup. null means no break follows this task. */
  breakAfter: RoutineBreakTemplate | null;
  /** Smart Postponement Flow: set only on a temporary "smaller step" task created from arc/postponementObstacle.ts's own flow (live/PostponementSmallerTaskScreen.tsx) -- a reference to the ORIGINAL task it was created to make easier to start. null for every ordinary task, including the original itself (this never points back from the original to the step -- see data/postponementObstacle.ts's own outcome record for that direction). The original task is never modified, deleted, or marked complete by the smaller step's own existence or completion. */
  parentTaskId: string | null;
  /**
   * Manifest Goals & Automatic Task Scheduling task: the PurposeManifest
   * (arc/purposeManifest.ts) and ManifestGoal (arc/manifestGoals.ts) this
   * task was created under, if any -- null for every ordinary task,
   * including a "manifest"-kind task above (taskKind/manifestProfile are
   * a completely unrelated, pre-existing concept; a goal-linked task
   * here is always taskKind "standard"). This Task record IS the single
   * source of truth shared by the daily schedule AND the Manifest's own
   * goal/task view -- never a second, duplicated copy of the same
   * action. purposeManifestGoalId is always paired with a non-null
   * purposeManifestId when set; deleting the goal clears both (see
   * data/manifestGoals.ts's deleteManifestGoal) rather than leaving a
   * dangling reference, but the Task record itself is never deleted by
   * that cleanup.
   */
  purposeManifestId: string | null;
  purposeManifestGoalId: string | null;
  /** Manual ordering of this task among its own goal's other tasks (requirement: "reorder tasks"). null for any task not linked to a goal. */
  purposeManifestTaskOrder: number | null;
  /**
   * Unified Task Stages task: this task's own optional breakdown into
   * up to three sequential action stages (arc/taskStage.ts) -- null (or
   * an empty array) for every task that has never opted into this,
   * which is every pre-existing task and the default for every new one
   * ("preserve backward compatibility with existing tasks that contain
   * only a main action"). Only the STATIC template lives here -- live
   * per-run completion is arc/taskStageProgress.ts's own separate,
   * single-slot record, never embedded on this Task so a recurring
   * task's stages are correctly shared, never re-asked, across every
   * occurrence.
   */
  actionStages: TaskActionStage[] | null;
  /**
   * Fixed Weekly Routine / Flexible Daily Routine task: manual ordering
   * among whichever list this task is currently rendered in -- the
   * weekly screen's per-weekday column, or the daily screen's
   * chronological timeline (see arc/weeklyRoutine.ts/arc/dailyPlan.ts's
   * own sort: by `order` ascending when set, else by scheduledTime,
   * else pushed to the end). null (every pre-existing task, and any new
   * one left unordered) means "no manual override -- sort by time."
   * One scalar, not a per-weekday map: a recurring task normally keeps
   * the same relative position across the days it appears on, and a
   * per-date override (arc/taskOccurrenceOverride.ts) carries its own
   * separate `order` for the rare day that needs to diverge.
   */
  order: number | null;
  /**
   * Direct Break/ARC calendar actions task: null (or "task", every
   * pre-existing task) is an ordinary task, started through the normal
   * Task LIVE action timer exactly as before. "break" marks a
   * standalone break added directly from either calendar (NOT the
   * pre-existing breakAfter above, which trails a specific task) --
   * live/ActiveTaskScreen.tsx's performStart starts its TaskTimerRun
   * with kind "rest" immediately, reusing the exact same rest timer
   * every post-task "I need a break" choice already creates, never a
   * second timer implementation. "arc" marks a standalone ARC calendar
   * entry -- tapping it navigates straight to /tasks/[id]/arc (the
   * same destination breakAfter.kind === "arc" already uses), preserving
   * this real task's own id as ARC's task context, and is NEVER entered
   * automatically just because the entry exists on the calendar.
   *
   * ARC Gym + ARC Goal Integration task: "arc_gym" marks this task as
   * the ONE scheduled entry for a Behaviour(+paired Success) combined
   * practice (see linkedArcGymSituationId below) -- a dedicated value,
   * never reusing "arc" (whose semantics are for a plain planned-ARC
   * entry), so the two destinations are never confused.
   */
  calendarEntryKind: "task" | "break" | "arc" | "arc_gym" | null;
  /** ARC Gym + ARC Goal Integration task: this Task is a "practical task" that belongs to an ArcGymGoal (arc/arcGymGoal.ts) -- mirrors purposeManifestGoalId's own precedent exactly, just for the new, separate Goal concept. null for every task not created under a Gym Goal. */
  arcGymGoalId: string | null;
  /** ARC Gym + ARC Goal Integration task: non-null when this Task IS the scheduled Behaviour(+paired Success) combined-practice session -- set together with calendarEntryKind "arc_gym". Starting it opens Full/Shortened ARC with THIS task's real id (never the standalone sentinel) and arcGymSituationId set to this value. null for every ordinary task. */
  linkedArcGymSituationId: string | null;
  /** ARC Learning + ARC Creativity + Integrated Spaced Repetition task, section 7: an optional topic filter for a taskKind "arcLearningReview" task ("Sunday 10:00 -- ARC Learning: review due insights from economics"). null means every topic. Meaningless (and always null) for every other taskKind, including "arcCreativityReview" -- Mode D has no topic concept. */
  arcLearningReviewTopicId: string | null;
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
}

/** Automatic Routine Builder: the four fixed daily periods every routine template is organized into, in their natural chronological order. */
export type RoutinePeriodId = "morning" | "noon" | "afternoon" | "evening";

export const ROUTINE_PERIOD_IDS: RoutinePeriodId[] = ["morning", "noon", "afternoon", "evening"];

/** "regular" = a plain rest break; "mindful" = a plain rest break framed as a short mindful pause (same mechanics, different label/cue); "arc" = the break launches the existing ARC LIVE flow instead of a rest timer. */
export type RoutineBreakKind = "regular" | "mindful" | "arc";

export interface RoutineBreakTemplate {
  kind: RoutineBreakKind;
  durationMinutes: number;
  /** Only meaningful when kind === "arc" -- a specific PlannedArc to launch directly, or null to show the existing ARC-window chooser (spontaneous/full/mini/skip) instead. */
  plannedArcId: string | null;
}

const CURRENT_TASK_SCHEMA_VERSION = 1;

export function createEmptyTask(id: string, title: string, firstAction: string, now: string): Task {
  return {
    id,
    title,
    description: null,
    location: null,
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
    taskKind: "standard",
    manifestProfile: null,
    arcWindowMinutesBefore: null,
    routineTaskTemplateId: null,
    routinePeriodId: null,
    breakAfter: null,
    parentTaskId: null,
    purposeManifestId: null,
    purposeManifestGoalId: null,
    purposeManifestTaskOrder: null,
    actionStages: null,
    order: null,
    calendarEntryKind: null,
    arcGymGoalId: null,
    linkedArcGymSituationId: null,
    arcLearningReviewTopicId: null,
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
    location: task.location ?? null,
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
    taskKind: task.taskKind ?? "standard",
    manifestProfile: task.manifestProfile ?? null,
    arcWindowMinutesBefore: task.arcWindowMinutesBefore ?? null,
    routineTaskTemplateId: task.routineTaskTemplateId ?? null,
    routinePeriodId: task.routinePeriodId ?? null,
    breakAfter: task.breakAfter ?? null,
    parentTaskId: task.parentTaskId ?? null,
    purposeManifestId: task.purposeManifestId ?? null,
    purposeManifestGoalId: task.purposeManifestGoalId ?? null,
    purposeManifestTaskOrder: task.purposeManifestTaskOrder ?? null,
    actionStages: Array.isArray(task.actionStages) ? task.actionStages.map(normalizeTaskActionStage) : null,
    order: task.order ?? null,
    calendarEntryKind: task.calendarEntryKind ?? null,
    arcGymGoalId: task.arcGymGoalId ?? null,
    linkedArcGymSituationId: task.linkedArcGymSituationId ?? null,
    arcLearningReviewTopicId: task.arcLearningReviewTopicId ?? null,
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

/**
 * Unified Emotional Check-In and Task Postponement System: "if a task
 * is already active" (the Home check-in's/Android widget's own
 * "😄 מעולה" choice, section 1) means exactly `status === "active"` --
 * Task's own single source of truth for this, never a second,
 * independently-tracked "current task" flag. At most one task is ever
 * "active" at a time in this app (starting a task always pauses/stops
 * whatever came before it), so the first match is the only one there
 * could be; this never falls back to "paused", which means something
 * deliberately set aside, not "in progress right now."
 */
export function findActiveTask(tasks: Task[]): Task | null {
  return tasks.find((task) => task.status === "active") ?? null;
}

/**
 * Nine Functional Improvements task, Improvement 2 ("Fix the
 * Time-Planning Task and Add a Timer"): a single, reserved, well-known
 * Task id -- same precedent as arc/newArcLiveTypes.ts's own
 * STANDALONE_ARC_TASK_ID -- so "start planning my day" always resolves
 * to the SAME real Task rather than minting a new one every time
 * (requirement 10, "prevent duplicate active timers," starts with never
 * having duplicate planning TASKS in the first place). It is a normal
 * "standard"-kind Task in every other respect: same Task LIVE screen,
 * same single-slot TaskTimerRun (Start/Pause/Resume/Finish), same
 * completion -> reflection -> reward flow every other task already
 * gets for free -- never a second timer engine.
 */
export const TIME_PLANNING_TASK_ID = "__time_planning__";

/** Default configurable timer length (minutes) for a never-before-started time-planning task; build/FlexibleDailyScreen.tsx lets the trainee edit and save a new value, exactly like Improvement 1's Manifest-action duration field. */
export const TIME_PLANNING_DEFAULT_DURATION_MINUTES = 15;

/**
 * Find-or-create, pure: returns the EXISTING time-planning task
 * unchanged (preserving any duration the trainee already saved, and its
 * current status/history) if one is already in `tasks`, or a freshly
 * created one otherwise. `scheduledDate`/`recurrence` are deliberately
 * left at createEmptyTask's own defaults (null / "once") so this task
 * never appears in arc/dailyPlan.ts's resolveDailyPlan (never clutters
 * build/FlexibleDailyScreen.tsx's own daily list) -- it is reached only
 * through its own dedicated entry point there, same as the ARC GYM/Daily
 * Visualization cards right next to it.
 */
export function ensureTimePlanningTaskInList(tasks: Task[], now: string): { task: Task; tasks: Task[] } {
  const existing = tasks.find((task) => task.id === TIME_PLANNING_TASK_ID);
  if (existing) return { task: existing, tasks };
  const created: Task = {
    ...createEmptyTask(TIME_PLANNING_TASK_ID, "תכנון הזמן שלי", "לתכנן את היום ולסדר את התוכנית", now),
    expectedDurationMinutes: TIME_PLANNING_DEFAULT_DURATION_MINUTES,
  };
  return { task: created, tasks: [...tasks, created] };
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

/** Same id-generator convention, for arc/taskReflection.ts's TaskReflection. */
export function generateTaskReflectionId(): string {
  return `task-reflection-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Same id-generator convention, for arc/taskStage.ts's TaskActionStage. */
export function generateTaskActionStageId(): string {
  return `task-stage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
