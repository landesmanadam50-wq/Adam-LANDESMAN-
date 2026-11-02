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

import { createEmptyTask, generateTaskSubtaskId } from "./tasks.ts";
import type { Task, TaskSubtask } from "./tasks.ts";
import { isValidCalendarDateString } from "../program/dateUtils.ts";

const SCHEDULED_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface TaskDraft {
  title: string;
  description: string;
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
  value: string;
  identity: string;
  defaultSupportiveStateId: string;
}

export function createEmptyTaskDraft(): TaskDraft {
  return {
    title: "",
    description: "",
    scheduledDate: "",
    scheduledTime: "",
    expectedDurationMinutes: "",
    firstAction: "",
    subtasks: [],
    recurrenceKind: "once",
    recurrenceDays: [],
    linkedArcGoalId: null,
    linkedArcBuildId: null,
    value: "",
    identity: "",
    defaultSupportiveStateId: "",
  };
}

export function taskDraftFromTask(task: Task): TaskDraft {
  return {
    title: task.title,
    description: task.description ?? "",
    scheduledDate: task.scheduledDate ?? "",
    scheduledTime: task.scheduledTime ?? "",
    expectedDurationMinutes: task.expectedDurationMinutes !== null ? String(task.expectedDurationMinutes) : "",
    firstAction: task.firstAction,
    subtasks: task.subtasks,
    recurrenceKind: task.recurrence.kind,
    recurrenceDays: task.recurrence.kind === "recurring" ? task.recurrence.daysOfWeek : [],
    linkedArcGoalId: task.linkedArcGoalId,
    linkedArcBuildId: task.linkedArcBuildId,
    value: task.value ?? "",
    identity: task.identity ?? "",
    defaultSupportiveStateId: task.defaultSupportiveStateId ?? "",
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

  return errors;
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
  return {
    ...base,
    title: draft.title.trim(),
    description: draft.description.trim() ? draft.description.trim() : null,
    scheduledDate: draft.scheduledDate.trim() ? draft.scheduledDate.trim() : null,
    scheduledTime: draft.scheduledTime.trim() ? draft.scheduledTime.trim() : null,
    expectedDurationMinutes: draft.expectedDurationMinutes.trim() ? Number(draft.expectedDurationMinutes) : null,
    firstAction: draft.firstAction.trim(),
    // base.currentAction is only ever truly unset for a brand-new base (createEmptyTask with an empty firstAction, see emptyTaskBase) -- an EXISTING task's own narrowed currentAction (arc/tasks.ts's setTaskCurrentAction) must never be silently reset back to firstAction just because this screen re-saved the record.
    currentAction: base.currentAction && base.currentAction.trim().length > 0 ? base.currentAction : draft.firstAction.trim(),
    subtasks: draft.subtasks,
    recurrence: draft.recurrenceKind === "recurring" ? { kind: "recurring", daysOfWeek: draft.recurrenceDays } : { kind: "once" },
    linkedArcGoalId: draft.linkedArcGoalId,
    linkedArcBuildId: draft.linkedArcBuildId,
    value: draft.value.trim() ? draft.value.trim() : null,
    identity: draft.identity.trim() ? draft.identity.trim() : null,
    defaultSupportiveStateId: draft.defaultSupportiveStateId.trim() ? draft.defaultSupportiveStateId.trim() : null,
    updatedAt: now,
  };
}

/** createEmptyTask requires an id/title/firstAction/now up front -- this is the one-line "base record for a brand-new draft" callers use instead of re-deriving createEmptyTask's own argument order. */
export function emptyTaskBase(id: string, now: string): Task {
  return createEmptyTask(id, "", "", now);
}
