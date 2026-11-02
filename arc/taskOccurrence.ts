/**
 * arc/taskOccurrence.ts
 *
 * Productivity roadmap, Stage I: per-occurrence completion for a
 * RECURRING Task, exact mirror of RoutineOccurrenceCompletion /
 * ArcGoalTargetOccurrenceCompletion's own shape and guarantees (see
 * data/storage.ts's RoutineOccurrenceCompletion doc) -- a separate,
 * append-only side collection keyed by (taskId, occurrenceDateLocal)
 * rather than a field on Task itself, so completing TODAY's occurrence
 * of a recurring task can never mark yesterday's, tomorrow's, or any
 * other task's occurrence complete, and never requires a read-modify-
 * write of the Task record's own full field set.
 *
 * A ONE-TIME task (recurrence.kind === "once") never uses this
 * collection -- its own Task.status/completedAt fields remain the
 * single source of truth for completion, exactly as before this stage.
 */

import type { Task } from "./tasks.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";

export interface TaskOccurrenceCompletion {
  taskId: string;
  occurrenceDateLocal: string;
  completedAt: string;
}

/** True only for a RECURRING task whose recurrence includes this date's weekday (Date.getDay() convention, matching TaskRecurrence.daysOfWeek). A one-time task is never "scheduled on a date" in this sense -- its own scheduledDate field answers that question directly. */
export function isRecurringTaskScheduledOnDate(task: Task, date: Date): boolean {
  if (task.recurrence.kind !== "recurring") return false;
  return task.recurrence.daysOfWeek.includes(date.getDay());
}

export function isTaskOccurrenceCompleted(taskId: string, occurrenceDateLocal: string, completions: TaskOccurrenceCompletion[]): boolean {
  return completions.some((entry) => entry.taskId === taskId && entry.occurrenceDateLocal === occurrenceDateLocal);
}

/** Builds today's completion entry -- callers append it via data/storage.ts's appendTaskOccurrenceCompletion, never rewriting an earlier day's entry. */
export function createTaskOccurrenceCompletion(taskId: string, now: Date): TaskOccurrenceCompletion {
  return { taskId, occurrenceDateLocal: todayLocalDateString(now), completedAt: now.toISOString() };
}
