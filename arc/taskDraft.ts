/**
 * arc/taskDraft.ts
 *
 * Productivity roadmap, Stage H: the pure draft/validation layer for
 * the full Task creation/editing screen (build/TaskEditorScreen.tsx) --
 * same split as build/profileWizard.ts for ArcBuildProfileForm: every
 * field here is a plain string/array a TextInput can bind to directly,
 * and buildTaskFromDraft is the one place a draft becomes a real,
 * validated Task. No AsyncStorage, no React, no navigation.
 *
 * TasksListScreen.tsx's own quick create (title + first action only)
 * is untouched -- this is an ADDITIONAL, fuller path onto the exact
 * same Task record and the exact same data/storage.ts persistence,
 * never a second/incompatible task store.
 */

import { createEmptyTask, generateTaskActionStageId, generateTaskSubtaskId } from "./tasks.ts";
import type { ManifestProfile, Task, TaskKind, TaskSubtask } from "./tasks.ts";
import { createTaskActionStage, findActionStageByKind, sumActionStageDurations } from "./taskStage.ts";
import type { TaskActionStage } from "./taskStage.ts";
import { isValidCalendarDateString, todayLocalDateString } from "../program/dateUtils.ts";

const SCHEDULED_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface TaskDraft {
  title: string;
  description: string;
  /** Final Morning Flow Requirements Audit task -- see Task.location's own doc. */
  location: string;
  scheduledDate: string;
  scheduledTime: string;
  /** Text, not a number, so an empty/partially-typed field never throws -- parsed only at validate/build time, same convention as build/profileWizard.ts's own dwell-time text fields. */
  expectedDurationMinutes: string;
  firstAction: string;
  subtasks: TaskSubtask[];
  recurrenceKind: "once" | "recurring";
  /** Only meaningful when recurrenceKind === "recurring". Date.getDay() convention (0 = Sunday .. 6 = Saturday), matching TaskRecurrence.daysOfWeek. */
  recurrenceDays: number[];
  linkedArcGoalId: string | null;
  linkedArcBuildId: string | null;
  /** Task LIVE Purpose Card task: mirrors value/identity below exactly -- see Task.reason's own doc. */
  reason: string;
  value: string;
  identity: string;
  defaultSupportiveStateId: string;
  taskKind: TaskKind;
  /** Requirement 6: only meaningful when taskKind === "manifest" -- always a fully-populated (never-partial) draft shape, same "plain strings a TextInput can bind to directly" convention as every other field, parsed/trimmed only at build time. */
  manifestLongTermGoal: string;
  manifestDesiredResult: string;
  manifestDesiredIdentity: string;
  manifestBodyLanguageDescription: string;
  /** ARC-system upgrade task, Part 2: text, not a number, same "never throws on a partial value" convention as expectedDurationMinutes -- parsed only at build time. Empty means no ARC window at all. */
  arcWindowMinutesBefore: string;
  /**
   * Unified Task Stages task: this task's own optional breakdown into
   * up to three sequential action stages (arc/taskStage.ts). When
   * false, this task has no stage breakdown at all -- the pre-existing
   * firstAction/expectedDurationMinutes fields above are the whole
   * story, exactly as before this task. Stage ids are carried through
   * from an existing task (never regenerated on every edit) so a
   * record referencing one by id elsewhere stays valid across edits;
   * "" means "not created yet", filled in at build time.
   */
  stagesEnabled: boolean;
  triggerEnabled: boolean;
  triggerId: string;
  triggerDescription: string;
  triggerCueDescription: string;
  triggerDurationMinutes: string;
  smallEnabled: boolean;
  smallId: string;
  smallDescription: string;
  smallDurationMinutes: string;
  mainId: string;
  mainDescription: string;
  mainDurationMinutes: string;
  /**
   * Smart To-Do List task: true marks this task as a To-Do item (no
   * fixed start time, shown only in the Flexible Daily Schedule's own
   * "To-Do List" tab) -- see Task.isTodoItem's own doc. Mutually
   * exclusive with scheduledTime, enforced by validateTaskDraft below.
   * todoOrder/todoCompletedMinutes are deliberately NOT editor-facing
   * fields -- they are only ever changed by the Time Planning popup's
   * own reorder/re-sort/split actions, never by this screen, so
   * buildTaskFromDraft always carries them through from `base` untouched.
   */
  isTodoItem: boolean;
  /** Text, not a number, same "never throws on a partial value" convention as expectedDurationMinutes -- parsed/validated only at build time. 1-10. */
  todoUrgency: string;
  todoImportance: string;
  todoIsSplittable: boolean;
  /** Proactive Support During Task LIVE task: see Task.taskIsOnPhone's own doc -- editable here regardless of isTodoItem/recurrence, carried straight through by buildTaskFromDraft. */
  taskIsOnPhone: boolean;
}

export function createEmptyTaskDraft(): TaskDraft {
  return {
    title: "",
    description: "",
    location: "",
    scheduledDate: "",
    scheduledTime: "",
    expectedDurationMinutes: "",
    firstAction: "",
    subtasks: [],
    recurrenceKind: "once",
    recurrenceDays: [],
    linkedArcGoalId: null,
    linkedArcBuildId: null,
    reason: "",
    value: "",
    identity: "",
    defaultSupportiveStateId: "",
    taskKind: "standard",
    manifestLongTermGoal: "",
    manifestDesiredResult: "",
    manifestDesiredIdentity: "",
    manifestBodyLanguageDescription: "",
    arcWindowMinutesBefore: "",
    stagesEnabled: false,
    triggerEnabled: false,
    triggerId: "",
    triggerDescription: "",
    triggerCueDescription: "",
    triggerDurationMinutes: "",
    smallEnabled: false,
    smallId: "",
    smallDescription: "",
    smallDurationMinutes: "",
    mainId: "",
    mainDescription: "",
    mainDurationMinutes: "",
    isTodoItem: false,
    todoUrgency: "5",
    todoImportance: "5",
    todoIsSplittable: true,
    taskIsOnPhone: false,
  };
}

export function taskDraftFromTask(task: Task): TaskDraft {
  return {
    title: task.title,
    description: task.description ?? "",
    location: task.location ?? "",
    scheduledDate: task.scheduledDate ?? "",
    scheduledTime: task.scheduledTime ?? "",
    expectedDurationMinutes: task.expectedDurationMinutes !== null ? String(task.expectedDurationMinutes) : "",
    firstAction: task.firstAction,
    subtasks: task.subtasks,
    recurrenceKind: task.recurrence.kind,
    recurrenceDays: task.recurrence.kind === "recurring" ? task.recurrence.daysOfWeek : [],
    linkedArcGoalId: task.linkedArcGoalId,
    linkedArcBuildId: task.linkedArcBuildId,
    reason: task.reason ?? "",
    value: task.value ?? "",
    identity: task.identity ?? "",
    defaultSupportiveStateId: task.defaultSupportiveStateId ?? "",
    taskKind: task.taskKind,
    manifestLongTermGoal: task.manifestProfile?.longTermGoal ?? "",
    manifestDesiredResult: task.manifestProfile?.desiredResult ?? "",
    manifestDesiredIdentity: task.manifestProfile?.desiredIdentity ?? "",
    manifestBodyLanguageDescription: task.manifestProfile?.bodyLanguageDescription ?? "",
    arcWindowMinutesBefore: task.arcWindowMinutesBefore !== null ? String(task.arcWindowMinutesBefore) : "",
    ...taskActionStagesToDraftFields(task.actionStages),
    isTodoItem: task.isTodoItem,
    todoUrgency: String(task.todoUrgency),
    todoImportance: String(task.todoImportance),
    todoIsSplittable: task.todoIsSplittable,
    taskIsOnPhone: task.taskIsOnPhone,
  };
}

function taskActionStagesToDraftFields(
  stages: TaskActionStage[] | null
): Pick<
  TaskDraft,
  "stagesEnabled" | "triggerEnabled" | "triggerId" | "triggerDescription" | "triggerCueDescription" | "triggerDurationMinutes" | "smallEnabled" | "smallId" | "smallDescription" | "smallDurationMinutes" | "mainId" | "mainDescription" | "mainDurationMinutes"
> {
  if (!Array.isArray(stages) || stages.length === 0) {
    return {
      stagesEnabled: false,
      triggerEnabled: false,
      triggerId: "",
      triggerDescription: "",
      triggerCueDescription: "",
      triggerDurationMinutes: "",
      smallEnabled: false,
      smallId: "",
      smallDescription: "",
      smallDurationMinutes: "",
      mainId: "",
      mainDescription: "",
      mainDurationMinutes: "",
    };
  }
  const trigger = findActionStageByKind(stages, "trigger");
  const small = findActionStageByKind(stages, "small");
  const main = findActionStageByKind(stages, "main");
  return {
    stagesEnabled: true,
    triggerEnabled: trigger !== null,
    triggerId: trigger?.id ?? "",
    triggerDescription: trigger?.description ?? "",
    triggerCueDescription: trigger?.cueDescription ?? "",
    triggerDurationMinutes: trigger ? String(trigger.durationMinutes) : "",
    smallEnabled: small !== null,
    smallId: small?.id ?? "",
    smallDescription: small?.description ?? "",
    smallDurationMinutes: small ? String(small.durationMinutes) : "",
    mainId: main?.id ?? "",
    mainDescription: main?.description ?? "",
    mainDurationMinutes: main ? String(main.durationMinutes) : "",
  };
}

export function addSubtaskToDraft(draft: TaskDraft, title: string): TaskDraft {
  const trimmed = title.trim();
  if (!trimmed) return draft;
  return { ...draft, subtasks: [...draft.subtasks, { id: generateTaskSubtaskId(), title: trimmed, completed: false }] };
}

export function removeSubtaskFromDraft(draft: TaskDraft, subtaskId: string): TaskDraft {
  return { ...draft, subtasks: draft.subtasks.filter((subtask) => subtask.id !== subtaskId) };
}

export function toggleRecurrenceDayInDraft(draft: TaskDraft, dayOfWeek: number): TaskDraft {
  const has = draft.recurrenceDays.includes(dayOfWeek);
  return { ...draft, recurrenceDays: has ? draft.recurrenceDays.filter((day) => day !== dayOfWeek) : [...draft.recurrenceDays, dayOfWeek].sort() };
}

/**
 * Multi-Day Task Scheduling task: "בחירת כל הימים" -- a one-tap
 * shortcut onto the exact same recurrenceDays field toggleRecurrenceDayInDraft
 * already edits (Date.getDay() convention, 0..6), never a separate
 * "every day" flag the rest of the app would need to know about
 * (resolveDailyPlan/the alarm engine only ever read recurrenceDays
 * itself, so this is indistinguishable from the trainee tapping all
 * seven day chips one at a time).
 */
export function selectAllRecurrenceDaysInDraft(draft: TaskDraft): TaskDraft {
  return { ...draft, recurrenceDays: [0, 1, 2, 3, 4, 5, 6] };
}

/**
 * Deterministic validation only -- every check here is a plain shape/
 * range comparison, never free-text interpretation. Returns a list of
 * Hebrew error messages; an empty list means the draft is ready for
 * buildTaskFromDraft. "First action should be encouraged but may remain
 * optional" (product spec) -- deliberately NOT validated here, matching
 * normalizeTask's own existing tolerance for a blank firstAction.
 */
export function validateTaskDraft(draft: TaskDraft): string[] {
  const errors: string[] = [];
  if (!draft.title.trim()) errors.push("כותרת היא שדה חובה.");

  if (draft.expectedDurationMinutes.trim()) {
    const duration = Number(draft.expectedDurationMinutes);
    if (!Number.isFinite(duration) || duration < 0) errors.push("משך הזמן המתוכנן לא יכול להיות שלילי.");
  }

  if (draft.scheduledDate.trim() && !isValidCalendarDateString(draft.scheduledDate.trim())) {
    errors.push("תאריך מתוכנן לא תקין (פורמט: YYYY-MM-DD).");
  }

  if (draft.scheduledTime.trim() && !SCHEDULED_TIME_PATTERN.test(draft.scheduledTime.trim())) {
    errors.push("שעה מתוכננת לא תקינה (פורמט: HH:MM).");
  }

  if (draft.recurrenceKind === "recurring" && draft.recurrenceDays.length === 0) {
    errors.push("משימה חזרתית חייבת לפחות יום אחד בשבוע.");
  }

  if (draft.arcWindowMinutesBefore.trim()) {
    const minutes = Number(draft.arcWindowMinutesBefore);
    if (!Number.isFinite(minutes) || minutes <= 0) errors.push("חלון ה-ARC לפני המשימה חייב להיות מספר דקות חיובי.");
  }

  // Smart To-Do List task: a To-Do item (no fixed start time) and a
  // scheduled time are mutually exclusive by definition -- see
  // Task.isTodoItem's own doc. Urgency/importance are only meaningful
  // (and only validated) once isTodoItem is actually selected.
  if (draft.isTodoItem && draft.scheduledTime.trim()) {
    errors.push("משימת To-Do לא יכולה לקבל שעת התחלה קבועה.");
  }
  if (draft.isTodoItem) {
    if (!isIntegerInRange(draft.todoUrgency, 1, 10)) errors.push("דירוג הדחיפות חייב להיות מספר שלם בין 1 ל-10.");
    if (!isIntegerInRange(draft.todoImportance, 1, 10)) errors.push("דירוג החשיבות חייב להיות מספר שלם בין 1 ל-10.");
  }

  // Unified Task Stages task, requirement 1: "every task must have a
  // main action" once stages are enabled at all; the two OPTIONAL
  // stages (trigger/small) are validated only when the trainee actually
  // turned each one on.
  if (draft.stagesEnabled) {
    if (!draft.mainDescription.trim()) errors.push("לפעולה המרכזית חובה לקבוע תיאור.");
    if (!isPositiveMinutes(draft.mainDurationMinutes)) errors.push("לפעולה המרכזית חובה לקבוע משך זמן מתוכנן (מספר דקות חיובי).");
    if (draft.triggerEnabled) {
      if (!draft.triggerDescription.trim()) errors.push("לפעולת הטריגר הסביבתי חובה לקבוע תיאור.");
      if (!isPositiveMinutes(draft.triggerDurationMinutes)) errors.push("לפעולת הטריגר הסביבתי חובה לקבוע משך זמן מתוכנן (מספר דקות חיובי).");
    }
    if (draft.smallEnabled) {
      if (!draft.smallDescription.trim()) errors.push("לפעולה הקטנה חובה לקבוע תיאור.");
      if (!isPositiveMinutes(draft.smallDurationMinutes)) errors.push("לפעולה הקטנה חובה לקבוע משך זמן מתוכנן (מספר דקות חיובי).");
    }
  }

  return errors;
}

function isPositiveMinutes(value: string): boolean {
  const minutes = Number(value.trim());
  return value.trim() !== "" && Number.isFinite(minutes) && minutes > 0;
}

function isIntegerInRange(value: string, min: number, max: number): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return false;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max;
}

/**
 * The draft's own stage fields, built into real TaskActionStage
 * records -- ids are reused from the draft (an existing stage being
 * re-edited) or freshly generated (a stage just turned on for the
 * first time), never regenerated for a stage that already existed.
 * Callers must only call this when draft.stagesEnabled and
 * validateTaskDraft found no errors.
 */
function buildActionStagesFromDraft(draft: TaskDraft): TaskActionStage[] {
  const stages: TaskActionStage[] = [];
  if (draft.triggerEnabled) {
    stages.push(
      createTaskActionStage(
        draft.triggerId || generateTaskActionStageId(),
        "trigger",
        draft.triggerDescription.trim(),
        Number(draft.triggerDurationMinutes),
        draft.triggerCueDescription.trim() ? draft.triggerCueDescription.trim() : null
      )
    );
  }
  if (draft.smallEnabled) {
    stages.push(createTaskActionStage(draft.smallId || generateTaskActionStageId(), "small", draft.smallDescription.trim(), Number(draft.smallDurationMinutes)));
  }
  stages.push(createTaskActionStage(draft.mainId || generateTaskActionStageId(), "main", draft.mainDescription.trim(), Number(draft.mainDurationMinutes)));
  return stages;
}

/**
 * Merges a validated draft onto `base` -- for a NEW task, `base` is
 * createEmptyTask's own result (so every field this draft doesn't cover
 * keeps its correct empty default); for an EXISTING task, `base` is the
 * loaded record itself (so status/postponement/notification/completion
 * fields this draft never touches survive editing untouched -- exactly
 * normalizeTask's own "never overwrite what's already there" guarantee,
 * applied to editing rather than storage backfill). Callers MUST run
 * validateTaskDraft first; this never re-validates.
 */
export function buildTaskFromDraft(draft: TaskDraft, base: Task, now: string): Task {
  // Computed ONCE and reused below -- calling buildActionStagesFromDraft
  // twice would generate two DIFFERENT fresh ids for the same brand-new
  // stage (its draft id field is still "" both times), silently
  // desyncing actionStages from the expectedDurationMinutes sum.
  const actionStages = draft.stagesEnabled ? buildActionStagesFromDraft(draft) : null;
  return {
    ...base,
    title: draft.title.trim(),
    description: draft.description.trim() ? draft.description.trim() : null,
    location: draft.location.trim() ? draft.location.trim() : null,
    // Critical-bug fix ("שעון מעורר אוטומטי לכל משימה"): a one-time task
    // with a start TIME but no explicit date was silently invisible to
    // the whole scheduling engine (arc/taskScheduledStart.ts's own
    // resolveNextTaskStartOccurrence requires scheduledDate for a
    // "once" task, with no fallback) -- no alarm, no error, nothing.
    // Setting a time without separately typing today's date was never
    // an unreasonable thing for a trainee to do; defaulting to today
    // here closes that gap at the exact point a draft becomes a real
    // Task, for every "once" task that has a time but no date.
    // Smart To-Do List task: a To-Do item has no scheduledTime, but it
    // still needs a scheduledDate to appear in any day's To-Do tab at
    // all (resolveTodoList filters by exact date match) -- defaulting
    // to today here, same rationale as the existing "a time but no
    // date defaults to today" fix just below, for the exact same reason
    // (a task record with neither would otherwise be silently invisible
    // to every consumer).
    scheduledDate: draft.scheduledDate.trim()
      ? draft.scheduledDate.trim()
      : draft.isTodoItem || (draft.recurrenceKind === "once" && draft.scheduledTime.trim())
        ? todayLocalDateString(new Date(now))
        : null,
    scheduledTime: draft.isTodoItem ? null : draft.scheduledTime.trim() ? draft.scheduledTime.trim() : null,
    // Unified Task Stages task: once stages are enabled, their own sum
    // IS the task's total planned duration (requirement 3's own worked
    // example, 2+3+25=30) -- every pre-existing reader of
    // expectedDurationMinutes (duration badges, auto-scheduling, alarm
    // timing) keeps working unchanged, reading one correct number, with
    // no need to know stages exist at all. The plain duration field
    // below is simply not used/shown while stages are enabled (see the
    // editor screen's own UI split).
    expectedDurationMinutes: actionStages ? sumActionStageDurations(actionStages) : draft.expectedDurationMinutes.trim() ? Number(draft.expectedDurationMinutes) : null,
    actionStages,
    firstAction: draft.firstAction.trim(),
    // base.currentAction is only ever truly unset for a brand-new base (createEmptyTask with an empty firstAction, see emptyTaskBase) -- an EXISTING task's own narrowed currentAction (arc/tasks.ts's setTaskCurrentAction) must never be silently reset back to firstAction just because this screen re-saved the record.
    currentAction: base.currentAction && base.currentAction.trim().length > 0 ? base.currentAction : draft.firstAction.trim(),
    subtasks: draft.subtasks,
    // Smart To-Do List task: a To-Do item is ALWAYS one-off (see
    // arc/tasks.ts's own doc on why -- every edit then stays scoped to
    // one date by construction) -- this overrides recurrenceKind
    // regardless of whatever the recurrence controls happen to show,
    // since the editor UI hides/ignores them while isTodoItem is on.
    recurrence: draft.isTodoItem ? { kind: "once" } : draft.recurrenceKind === "recurring" ? { kind: "recurring", daysOfWeek: draft.recurrenceDays } : { kind: "once" },
    linkedArcGoalId: draft.linkedArcGoalId,
    linkedArcBuildId: draft.linkedArcBuildId,
    reason: draft.reason.trim() ? draft.reason.trim() : null,
    value: draft.value.trim() ? draft.value.trim() : null,
    identity: draft.identity.trim() ? draft.identity.trim() : null,
    defaultSupportiveStateId: draft.defaultSupportiveStateId.trim() ? draft.defaultSupportiveStateId.trim() : null,
    taskKind: draft.taskKind,
    manifestProfile: draft.taskKind === "manifest" ? buildManifestProfileFromDraft(draft) : null,
    arcWindowMinutesBefore: draft.arcWindowMinutesBefore.trim() ? Number(draft.arcWindowMinutesBefore) : null,
    isTodoItem: draft.isTodoItem,
    todoUrgency: draft.isTodoItem ? Number(draft.todoUrgency) : base.todoUrgency,
    todoImportance: draft.isTodoItem ? Number(draft.todoImportance) : base.todoImportance,
    // todoOrder/todoCompletedMinutes are never edited from this screen --
    // see TaskDraft.isTodoItem's own doc -- so they always carry through
    // from `base` untouched, exactly like status/postponement/notification
    // fields this draft never touches.
    todoOrder: base.todoOrder,
    todoIsSplittable: draft.isTodoItem ? draft.todoIsSplittable : base.todoIsSplittable,
    todoCompletedMinutes: base.todoCompletedMinutes,
    taskIsOnPhone: draft.taskIsOnPhone,
    updatedAt: now,
  };
}

function buildManifestProfileFromDraft(draft: TaskDraft): ManifestProfile {
  return {
    longTermGoal: draft.manifestLongTermGoal.trim(),
    desiredResult: draft.manifestDesiredResult.trim(),
    desiredIdentity: draft.manifestDesiredIdentity.trim(),
    bodyLanguageDescription: draft.manifestBodyLanguageDescription.trim(),
  };
}

/** createEmptyTask requires an id/title/firstAction/now up front -- this is the one-line "base record for a brand-new draft" callers use instead of re-deriving createEmptyTask's own argument order. */
export function emptyTaskBase(id: string, now: string): Task {
  return createEmptyTask(id, "", "", now);
}
