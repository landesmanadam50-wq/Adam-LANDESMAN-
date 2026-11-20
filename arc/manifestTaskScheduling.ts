/**
 * arc/manifestTaskScheduling.ts
 *
 * Manifest Goals & Automatic Task Scheduling task, requirement 2:
 * "Identify available time slots within the user's existing morning,
 * noon, afternoon, and evening routines" and "If the user specifies an
 * exact time, respect it when possible rather than silently moving it."
 *
 * Pure slot-finding only -- no AsyncStorage, no navigation, no React,
 * same split as every other arc/*.ts module. This file never reads or
 * writes a Task record itself; data/manifestGoals.ts loads the
 * trainee's existing tasks/routine template/occurrence completions,
 * builds the inputs below, and is the only place a Task is actually
 * created from the result. Because this module only ever DECIDES a
 * slot and never touches any other task, "never silently delete,
 * overwrite, or displace other tasks" holds by construction -- there is
 * no mutation capability here to misuse.
 */

import { formatMinutesToClockTime, parseClockTimeToMinutes, type RoutinePeriodTemplate } from "./dailyRoutine.ts";
import { ROUTINE_PERIOD_IDS, type RoutinePeriodId, type Task } from "./tasks.ts";
import { isRecurringTaskScheduledOnDate, isTaskOccurrenceCompleted, type TaskOccurrenceCompletion } from "./taskOccurrence.ts";
import { addCalendarDays } from "../program/dateUtils.ts";

export interface OccupiedInterval {
  startMinutes: number;
  endMinutes: number;
}

/**
 * Every already-existing task that occupies time on `dateLocal`: a
 * one-time task actually scheduled that date, or a recurring task whose
 * weekday matches AND whose occurrence that date isn't already marked
 * complete. Archived/completed/postponed tasks never occupy a slot --
 * archived and completed are finished with, and postponement is
 * precisely "this task is no longer sitting in its old slot" (its own
 * returnAt, not its stale scheduledTime, is where it belongs now).
 * `excludeTaskId` lets a reschedule-in-place check free time without
 * being blocked by the very task being moved.
 */
export function resolveOccupiedIntervalsForDate(
  tasks: Task[],
  completions: TaskOccurrenceCompletion[],
  dateLocal: string,
  excludeTaskId: string | null = null,
): OccupiedInterval[] {
  const intervals: OccupiedInterval[] = [];
  const dateAsDate = new Date(`${dateLocal}T00:00:00`);
  for (const task of tasks) {
    if (task.id === excludeTaskId) continue;
    if (task.status === "archived" || task.status === "completed" || task.status === "postponed") continue;
    if (!task.scheduledTime) continue;
    const appliesToDate =
      task.recurrence.kind === "recurring"
        ? isRecurringTaskScheduledOnDate(task, dateAsDate) && !isTaskOccurrenceCompleted(task.id, dateLocal, completions)
        : task.scheduledDate === dateLocal;
    if (!appliesToDate) continue;
    const startMinutes = parseClockTimeToMinutes(task.scheduledTime);
    if (startMinutes === null) continue;
    const durationMinutes = (task.expectedDurationMinutes ?? 0) + (task.breakAfter?.durationMinutes ?? 0);
    intervals.push({ startMinutes, endMinutes: startMinutes + durationMinutes });
  }
  return intervals.sort((a, b) => a.startMinutes - b.startMinutes);
}

export function isMinuteRangeFree(intervals: OccupiedInterval[], startMinutes: number, endMinutes: number): boolean {
  return intervals.every((interval) => endMinutes <= interval.startMinutes || startMinutes >= interval.endMinutes);
}

/** The first free `durationMinutes` window inside ONE routine period, scanning chronologically from the period's own startTime -- null if it never fits before endTime. */
export function findFreeSlotInPeriod(period: RoutinePeriodTemplate, intervals: OccupiedInterval[], durationMinutes: number): number | null {
  const periodStart = parseClockTimeToMinutes(period.startTime) ?? 0;
  const periodEnd = parseClockTimeToMinutes(period.endTime) ?? periodStart;
  const relevant = intervals.filter((interval) => interval.endMinutes > periodStart && interval.startMinutes < periodEnd);

  let cursor = periodStart;
  for (const interval of relevant) {
    if (interval.startMinutes - cursor >= durationMinutes) return cursor;
    cursor = Math.max(cursor, interval.endMinutes);
  }
  return periodEnd - cursor >= durationMinutes ? cursor : null;
}

/** Scans every period in its fixed chronological order (ROUTINE_PERIOD_IDS: morning -> noon -> afternoon -> evening) for the first free window -- never a different ordering, never skipping a period. */
export function findFreeSlotAcrossPeriods(
  periods: Record<RoutinePeriodId, RoutinePeriodTemplate>,
  intervals: OccupiedInterval[],
  durationMinutes: number,
): { periodId: RoutinePeriodId; startMinutes: number } | null {
  for (const periodId of ROUTINE_PERIOD_IDS) {
    const startMinutes = findFreeSlotInPeriod(periods[periodId], intervals, durationMinutes);
    if (startMinutes !== null) return { periodId, startMinutes };
  }
  return null;
}

export interface ManifestTaskSchedulingRequest {
  durationMinutes: number;
  /** A specific day to start searching from (the trainee's own "preferred date or deadline") -- null means "start today". Either way the search still looks forward across the horizon below, it never gives up after one day. */
  preferredDateLocal: string | null;
  /**
   * "HH:MM", or null for "no preference". MUST already be a validated,
   * well-formed clock time (parseClockTimeToMinutes(value) !== null) --
   * same discipline arc/dailyRoutine.ts's own parseClockTimeToMinutes
   * doc requires of every caller reading a still-being-typed value; this
   * module never re-validates a trainee's raw text.
   */
  preferredTime: string | null;
}

export interface ManifestScheduledSlot {
  dateLocal: string;
  time: string;
}

export type ManifestTaskSchedulingResult =
  | { status: "scheduled"; dateLocal: string; time: string }
  | { status: "conflict"; reason: string; alternatives: ManifestScheduledSlot[] };

const SCHEDULING_SEARCH_HORIZON_DAYS = 14;
const MAX_SCHEDULING_ALTERNATIVES = 3;

/**
 * `intervalsForDate` is a plain, deterministic function of one
 * "YYYY-MM-DD" string -- ordinarily `(dateLocal) =>
 * resolveOccupiedIntervalsForDate(tasks, completions, dateLocal)` with
 * `tasks`/`completions` already closed over by the caller (see
 * data/manifestGoals.ts). Injected rather than precomputed so this can
 * stop searching at the very first fit instead of always resolving
 * every date across the whole horizon.
 *
 * Requirement 2's exact rules, in order:
 * 1. An explicit preferred time is checked FIRST, against the raw
 *    occupied intervals of its own date only (never narrowed to a
 *    routine period's own window -- it's the trainee's own explicit
 *    choice, not an auto-pick). Free -> scheduled there immediately,
 *    "respecting it rather than silently moving it".
 * 2. Otherwise (no preferred time, or it conflicts), auto-search: the
 *    preferred/today date first, then forward day by day, trying every
 *    period in its fixed order each day. With NO preferred time at all,
 *    the very first fit found is used directly -- no need to present
 *    alternatives for a choice the trainee never asked to make. With a
 *    preferred time that conflicted, up to MAX_SCHEDULING_ALTERNATIVES
 *    fits are collected and returned as a conflict for the trainee to
 *    choose from, never auto-picked out from under their explicit ask.
 */
export function resolveManifestTaskSchedule(
  periods: Record<RoutinePeriodId, RoutinePeriodTemplate>,
  intervalsForDate: (dateLocal: string) => OccupiedInterval[],
  request: ManifestTaskSchedulingRequest,
  todayDateLocal: string,
): ManifestTaskSchedulingResult {
  const startDateLocal = request.preferredDateLocal ?? todayDateLocal;

  if (request.preferredTime) {
    const startMinutes = parseClockTimeToMinutes(request.preferredTime);
    if (startMinutes !== null) {
      const endMinutes = startMinutes + request.durationMinutes;
      if (isMinuteRangeFree(intervalsForDate(startDateLocal), startMinutes, endMinutes)) {
        return { status: "scheduled", dateLocal: startDateLocal, time: request.preferredTime };
      }
    }
  }

  const alternatives: ManifestScheduledSlot[] = [];
  for (let offset = 0; offset < SCHEDULING_SEARCH_HORIZON_DAYS; offset++) {
    const candidateDateLocal = addCalendarDays(startDateLocal, offset);
    const slot = findFreeSlotAcrossPeriods(periods, intervalsForDate(candidateDateLocal), request.durationMinutes);
    if (!slot) continue;
    const time = formatMinutesToClockTime(slot.startMinutes);

    if (!request.preferredTime) {
      return { status: "scheduled", dateLocal: candidateDateLocal, time };
    }
    alternatives.push({ dateLocal: candidateDateLocal, time });
    if (alternatives.length >= MAX_SCHEDULING_ALTERNATIVES) break;
  }

  if (alternatives.length === 0) {
    return {
      status: "conflict",
      reason: "לא נמצא חלון פנוי בשגרה היומית בטווח החיפוש -- כל הזמנים תפוסים במשימות קיימות.",
      alternatives: [],
    };
  }

  return {
    status: "conflict",
    reason: `השעה ${request.preferredTime} שביקשת תפוסה -- הנה כמה חלופות פנויות.`,
    alternatives,
  };
}
