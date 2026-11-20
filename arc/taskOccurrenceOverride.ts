/**
 * arc/taskOccurrenceOverride.ts
 *
 * Fixed Weekly Routine / Flexible Daily Routine task: a single
 * per-(taskId, date) override record for a RECURRING task's occurrence
 * -- the missing piece arc/taskOccurrence.ts never needed, since that
 * module only ever tracked whether a date's occurrence was completed,
 * never whether it was removed, retimed, re-durationed, or reordered
 * for that one date alone.
 *
 * Unlike TaskOccurrenceCompletion (append-only -- completing today can
 * never rewrite yesterday's fact), this record IS upserted in place:
 * editing "today's" override a second time replaces the first edit,
 * never accumulates a growing history of edits to the same date.
 *
 * Once an override exists for a date, ALL THREE of its own fields
 * (scheduledTime/expectedDurationMinutes/order) are the date's
 * effective values -- never partially inherited field-by-field from
 * the template. Each is snapshotted from the template's CURRENT value
 * at the moment the trainee first changes any one of them (see
 * resolveDailyPlan.ts's own caller, which is responsible for that
 * snapshot), so later edits to the Weekly Routine template never
 * retroactively change an already-overridden date (spec: "Do not
 * overwrite date-specific changes when the weekly template is
 * updated") -- exactly the isolation this whole feature exists for.
 *
 * A ONE-TIME task (recurrence.kind === "once") never has an override
 * record -- it is already fully date-specific via its own
 * scheduledDate/scheduledTime/expectedDurationMinutes/order fields, so
 * "removing"/"retiming"/"reordering" it for its one day IS editing the
 * Task record directly, exactly as before this task.
 */

import type { Task } from "./tasks.ts";
import { isRecurringTaskScheduledOnDate } from "./taskOccurrence.ts";

export interface TaskOccurrenceOverride {
  taskId: string;
  occurrenceDateLocal: string;
  /** True: this date's occurrence is removed from the Flexible Daily Routine entirely -- the weekly template itself, and every OTHER date it applies to, are untouched. */
  removed: boolean;
  scheduledTime: string | null;
  expectedDurationMinutes: number | null;
  order: number | null;
  /**
   * Weekly & Daily Routine Redesign task, section 4: true means
   * `scheduledTime` is a FIXED anchor the trainee explicitly chose for
   * this one date (via the task editor, or any other direct edit) --
   * arc/dailyPlan.ts's own applyScheduleMode auto-scheduler must never
   * move it. False means `scheduledTime` was last WRITTEN BY that same
   * auto-scheduler (a "flexible" task with no fixed time of its own),
   * so it may be freely recomputed the next time the day's effective
   * schedule is resolved -- never a stale, silently-stuck time. Every
   * override ever created before this field existed represents an
   * explicit edit (there was no auto-scheduler yet), so it backfills to
   * `true` (data/storage.ts's loadTaskOccurrenceOverrides) -- zero
   * behavior change for existing data.
   */
  timeIsManual: boolean;
  updatedAt: string;
}

export function findTaskOccurrenceOverride(taskId: string, occurrenceDateLocal: string, overrides: TaskOccurrenceOverride[]): TaskOccurrenceOverride | null {
  return overrides.find((entry) => entry.taskId === taskId && entry.occurrenceDateLocal === occurrenceDateLocal) ?? null;
}

/** Upserts one override into a list -- replaces any existing entry for the exact same (taskId, date), otherwise appends. Every caller passes the FULL list back to data/storage.ts's saveTaskOccurrenceOverrides, same read-modify-write convention as saveTasks. */
export function upsertTaskOccurrenceOverride(overrides: TaskOccurrenceOverride[], next: TaskOccurrenceOverride): TaskOccurrenceOverride[] {
  const index = overrides.findIndex((entry) => entry.taskId === next.taskId && entry.occurrenceDateLocal === next.occurrenceDateLocal);
  if (index === -1) return [...overrides, next];
  const copy = [...overrides];
  copy[index] = next;
  return copy;
}

/**
 * Builds (or updates) the override for one date from a patch of the
 * fields the trainee actually changed -- any field left out of `patch`
 * is snapshotted from `task`'s own CURRENT value (or the existing
 * override's value, if one already exists for this date), never left
 * as a bare "inherit" marker, per this module's own "all three fields
 * are the date's effective values" rule above.
 */
export function buildTaskOccurrenceOverride(
  task: Task,
  occurrenceDateLocal: string,
  existing: TaskOccurrenceOverride | null,
  patch: {
    removed?: boolean;
    scheduledTime?: string | null;
    expectedDurationMinutes?: number | null;
    order?: number | null;
    /** Weekly & Daily Routine Redesign task: every ordinary caller (a real trainee edit) omits this -- it then defaults to `true`, since calling this function at all already means an explicit edit happened. Only arc/dailyPlan.ts's own auto-scheduler write-back passes `false` here, alongside its own computed `scheduledTime`. */
    timeIsManual?: boolean;
  },
  now: string
): TaskOccurrenceOverride {
  return {
    taskId: task.id,
    occurrenceDateLocal,
    removed: patch.removed ?? existing?.removed ?? false,
    scheduledTime: "scheduledTime" in patch ? patch.scheduledTime! : existing?.scheduledTime ?? task.scheduledTime,
    expectedDurationMinutes: "expectedDurationMinutes" in patch ? patch.expectedDurationMinutes! : existing?.expectedDurationMinutes ?? task.expectedDurationMinutes,
    order: "order" in patch ? patch.order! : existing?.order ?? task.order,
    timeIsManual: "scheduledTime" in patch ? patch.timeIsManual ?? true : existing?.timeIsManual ?? true,
    updatedAt: now,
  };
}

/** Convenience for the Flexible Daily Routine's own "remove this occurrence" action -- marks the date removed while preserving whatever time/duration/order values already existed for it (or the template's, if this is the first override for this date). */
export function markTaskOccurrenceRemoved(task: Task, occurrenceDateLocal: string, overrides: TaskOccurrenceOverride[], now: string): TaskOccurrenceOverride {
  const existing = findTaskOccurrenceOverride(task.id, occurrenceDateLocal, overrides);
  return buildTaskOccurrenceOverride(task, occurrenceDateLocal, existing, { removed: true }, now);
}

/** The effective (template-or-overridden) values for one recurring task's occurrence on one date -- never meaningful for a one-time task, whose own Task fields already ARE its effective values. */
export interface EffectiveOccurrence {
  removed: boolean;
  scheduledTime: string | null;
  expectedDurationMinutes: number | null;
  order: number | null;
  isOverridden: boolean;
  /** Weekly & Daily Routine Redesign task: true when `scheduledTime` is a fixed anchor (the template's own time, or an explicit per-date edit) the auto-scheduler must never move; false only when an override exists AND it was itself last written by the auto-scheduler. A task with no override at all is always `true` here -- the template's own time (even when null) is never something applyScheduleMode may silently overwrite into storage on its own. */
  timeIsManual: boolean;
}

export function resolveEffectiveOccurrence(task: Task, occurrenceDateLocal: string, overrides: TaskOccurrenceOverride[]): EffectiveOccurrence {
  const override = findTaskOccurrenceOverride(task.id, occurrenceDateLocal, overrides);
  if (!override) {
    return { removed: false, scheduledTime: task.scheduledTime, expectedDurationMinutes: task.expectedDurationMinutes, order: task.order, isOverridden: false, timeIsManual: true };
  }
  return {
    removed: override.removed,
    scheduledTime: override.scheduledTime,
    expectedDurationMinutes: override.expectedDurationMinutes,
    order: override.order,
    isOverridden: true,
    timeIsManual: override.timeIsManual,
  };
}

/** True only for a recurring task that is BOTH scheduled on this date (daysOfWeek) AND not removed for it specifically -- the one predicate the Flexible Daily Routine's own resolution (arc/dailyPlan.ts) needs to decide whether a weekly-origin task appears today at all. */
export function isRecurringOccurrenceVisibleOnDate(task: Task, date: Date, dateLocal: string, overrides: TaskOccurrenceOverride[]): boolean {
  if (!isRecurringTaskScheduledOnDate(task, date)) return false;
  return !resolveEffectiveOccurrence(task, dateLocal, overrides).removed;
}
