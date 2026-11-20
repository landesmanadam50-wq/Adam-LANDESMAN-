/**
 * arc/weeklyRoutine.ts
 *
 * Fixed Weekly Routine task: groups every recurring Task
 * (recurrence.kind === "recurring") by the weekday(s) it appears on,
 * for the Weekly Routine screen's own 7-day view -- Date.getDay()
 * convention (0 = Sunday .. 6 = Saturday), the exact same numbering
 * TaskRecurrence.daysOfWeek/arc/taskOccurrence.ts already use.
 *
 * This module never invents a second "weekly template" entity: the
 * SET of recurring Tasks already IS the Fixed Weekly Routine (spec:
 * "the weekly routine is persistent... must never disappear
 * automatically after the week ends" -- true for free, since a
 * recurring Task is never deleted by the mere passage of a week; only
 * an explicit delete/edit from the Weekly Routine screen touches it).
 * A given recurring task can legitimately appear in more than one
 * weekday's group when its own daysOfWeek lists several days.
 */

import type { Task } from "./tasks.ts";
import type { TaskOccurrenceCompletion } from "./taskOccurrence.ts";
import type { TaskOccurrenceOverride } from "./taskOccurrenceOverride.ts";

export const WEEKDAY_LABELS_HE: string[] = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/** Every recurring task, grouped by each weekday it recurs on (0 = Sunday .. 6 = Saturday), sorted within each day by `order` then `scheduledTime` then creation order -- the exact same tie-break rule arc/dailyPlan.ts's own compare uses, so a day's weekly-screen order always matches that same day's eventual daily-screen order before any per-date override. */
export function resolveWeeklyRoutineByDay(tasks: Task[]): Record<number, Task[]> {
  const byDay: Record<number, Task[]> = { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const task of tasks) {
    if (task.status === "archived" || task.recurrence.kind !== "recurring") continue;
    for (const day of task.recurrence.daysOfWeek) {
      if (day < 0 || day > 6) continue;
      byDay[day].push(task);
    }
  }
  for (const day of Object.keys(byDay)) {
    byDay[Number(day)].sort((a, b) => {
      if (a.order !== null && b.order !== null) return a.order - b.order;
      if (a.order !== null) return -1;
      if (b.order !== null) return 1;
      if (a.scheduledTime && b.scheduledTime) return a.scheduledTime.localeCompare(b.scheduledTime);
      if (a.scheduledTime) return -1;
      if (b.scheduledTime) return 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
  }
  return byDay;
}

/**
 * Fixed Weekly Routine task, "reorder recurring tasks": normalizes the
 * WHOLE day's list to sequential order values (0, 1, 2, ...) in its
 * CURRENT displayed order, then swaps the moved task with its
 * neighbor -- deterministic even when some/all of the day's tasks
 * started with a null `order` (every brand-new recurring task does).
 * Returns the full set of tasks that need their `order` field
 * persisted (every task in the day, since normalizing can touch any
 * of them), or null when the move is impossible (already at the top/
 * bottom, or the task isn't in this day's list at all) -- the caller
 * persists each returned task via data/storage.ts's upsertTask,
 * leaving every OTHER day's/task's own order untouched.
 */
export function reorderWeeklyTask(dayTasks: Task[], taskId: string, direction: "up" | "down"): Task[] | null {
  const index = dayTasks.findIndex((task) => task.id === taskId);
  if (index === -1) return null;
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= dayTasks.length) return null;
  const normalized = dayTasks.map((task, position) => ({ ...task, order: position }));
  const next = [...normalized];
  [next[index].order, next[targetIndex].order] = [next[targetIndex].order, next[index].order];
  return next;
}

/** Local YYYY-MM-DD convention, same as program/dateUtils.ts's todayLocalDateString -- the Sunday (weekday 0) that starts the week containing `dateLocal`. */
export function resolveWeekStartLocalDate(dateLocal: string): string {
  const [year, month, day] = dateLocal.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - date.getDay());
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Weekly & Daily Routine Redesign task: every one of the 7 local dates
 * (Sunday..Saturday) in the week starting at `weekStartLocal` -- the
 * one, single-sourced "which 7 calendar dates make up this week"
 * computation every other week-scoped function below (and
 * arc/weeklyScheduleMode.ts's own resolveEffectiveScheduleMode callers)
 * shares, never re-derived ad hoc a second time.
 */
export function resolveWeekDates(weekStartLocal: string): string[] {
  const [year, month, day] = weekStartLocal.split("-").map(Number);
  const dates: string[] = [];
  for (let offset = 0; offset < 7; offset++) {
    const date = new Date(year, month - 1, day + offset);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
  }
  return dates;
}

/**
 * Fixed Weekly Routine task, requirement 1's own "optional weekly
 * reset for completion/progress states, without deleting the routine
 * or task definitions": removes only the TaskOccurrenceCompletion
 * entries within the 7 local dates of `weekStartLocal`'s own week --
 * never touches the Task records themselves (their recurrence/
 * title/time/duration survive untouched), and never touches a
 * completion from any OTHER week. Purely additive/subtractive over the
 * completions list; the caller persists the RESULT via
 * data/storage.ts's saveTaskOccurrenceCompletions, same read-modify-
 * write convention as every other list mutation in this codebase.
 */
export function resetWeekCompletions(completions: TaskOccurrenceCompletion[], weekStartLocal: string): TaskOccurrenceCompletion[] {
  const weekDates = new Set(resolveWeekDates(weekStartLocal));
  return completions.filter((entry) => !weekDates.has(entry.occurrenceDateLocal));
}

/**
 * Weekly & Daily Routine Redesign task, section 6 ("Synchronized
 * Weekly Reset"): the mode-override slice above (resetWeekCompletions)
 * only ever cleared completion records -- this clears the
 * TaskOccurrenceOverride entries within the SAME week, restoring every
 * recurring task's own effective time/duration/order back to its
 * permanent template value for that week, and un-removing any
 * recurring occurrence that was removed for one of its dates. Never
 * touches the Task records themselves (the template), and never
 * touches an override from any OTHER week.
 */
export function resetWeekOccurrenceOverrides(overrides: TaskOccurrenceOverride[], weekStartLocal: string): TaskOccurrenceOverride[] {
  const weekDates = new Set(resolveWeekDates(weekStartLocal));
  return overrides.filter((entry) => !weekDates.has(entry.occurrenceDateLocal));
}

/**
 * Section 5/6: the one-time (non-recurring) tasks scheduled for a date
 * within this week -- "future one-time events" planned in advance, and
 * the exact set section 6's own "show the user which events will be
 * removed and require explicit confirmation" needs to list BEFORE a
 * separate, explicitly-confirmed clear action ever deletes them (never
 * part of the main, always-safe weekly reset above). Archived tasks
 * are never listed (already hidden everywhere else).
 */
export function listWeekOneTimeEvents(tasks: Task[], weekStartLocal: string): Task[] {
  const weekDates = new Set(resolveWeekDates(weekStartLocal));
  return tasks.filter((task) => task.status !== "archived" && task.recurrence.kind === "once" && task.scheduledDate !== null && weekDates.has(task.scheduledDate));
}
