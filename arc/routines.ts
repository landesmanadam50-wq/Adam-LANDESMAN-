/**
 * arc/routines.ts
 *
 * The pure half of "Multiple Scheduled ARC + Success Focus Routines" --
 * next-occurrence date math, today's-status resolution, and display
 * sorting. Split out from data/routines.ts (which owns the actual I/O:
 * AsyncStorage persistence + expo-notifications scheduling), the same
 * reason arc/reminders.ts is separate from data/reminders.ts: this file
 * has no native-module dependency, so it's fully unit-tested directly
 * with node --test.
 *
 * All date math here works with real Date objects (never hour-only /
 * elapsed-ms arithmetic), so a routine scheduled for "tomorrow, same
 * clock time" is a real, distinct calendar date -- never miscomputed as
 * "in one hour" or any other duration-based shortcut -- and month/year
 * boundaries are handled correctly by the platform's own Date
 * arithmetic (setDate/setHours), the same way program/dateUtils.ts's
 * calendar-day math is immune to that whole bug class.
 */

import type { RoutineOccurrenceCompletion, ScheduledRoutine } from "../data/storage.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";

export type RoutineStatus = "completed" | "dueOrOverdue" | "upcoming" | "disabled" | "noOccurrenceToday";

type RoutineSchedule = Pick<ScheduledRoutine, "hour" | "minute" | "recurrenceDays">;

function setLocalTime(base: Date, hour: number, minute: number): Date {
  const withTime = new Date(base);
  withTime.setHours(hour, minute, 0, 0);
  return withTime;
}

/** This routine's own scheduled moment TODAY (device local time), or null when today's weekday isn't one of its recurrence days -- regardless of whether that moment is still ahead or already passed. */
export function resolveTodayOccurrenceDate(routine: RoutineSchedule, now: Date = new Date()): Date | null {
  if (!routine.recurrenceDays.includes(now.getDay())) return null;
  return setLocalTime(now, routine.hour, routine.minute);
}

/**
 * The next STRICTLY FUTURE occurrence of this routine, from `now` --
 * today's own moment when it hasn't happened yet, otherwise the next
 * matching recurrence day (which may be later this week or, once every
 * matching day within the coming week has already passed today, the
 * following week). Scans a full 14-day window (every weekday occurs at
 * least twice in that span) so a routine whose only recurrence day's
 * time already passed today still correctly resolves to next week,
 * never null, never a wrapped-around/negative offset. Returns null only
 * when no recurrence day is configured at all.
 */
export function resolveNextOccurrenceDate(routine: RoutineSchedule, now: Date = new Date()): Date | null {
  if (routine.recurrenceDays.length === 0) return null;
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const candidateDay = new Date(now);
    candidateDay.setDate(candidateDay.getDate() + dayOffset);
    if (!routine.recurrenceDays.includes(candidateDay.getDay())) continue;
    const candidate = setLocalTime(candidateDay, routine.hour, routine.minute);
    if (candidate.getTime() > now.getTime()) return candidate;
  }
  return null; // Unreachable when recurrenceDays is non-empty.
}

export function isRoutineCompletedForDate(
  routineId: string,
  occurrenceDateLocal: string,
  completions: RoutineOccurrenceCompletion[]
): boolean {
  return completions.some((entry) => entry.routineId === routineId && entry.occurrenceDateLocal === occurrenceDateLocal);
}

/**
 * disabled overrides everything else (a disabled routine is never
 * "due" or "completed" for display purposes, even if today would
 * otherwise match). noOccurrenceToday means today's weekday just isn't
 * one of this routine's recurrence days -- distinct from "upcoming",
 * which means today IS a recurrence day but the scheduled clock time
 * hasn't arrived yet.
 */
export function resolveRoutineStatusToday(
  routine: ScheduledRoutine,
  completions: RoutineOccurrenceCompletion[],
  now: Date = new Date()
): RoutineStatus {
  if (!routine.enabled) return "disabled";
  const todayOccurrence = resolveTodayOccurrenceDate(routine, now);
  if (!todayOccurrence) return "noOccurrenceToday";
  if (isRoutineCompletedForDate(routine.id, todayLocalDateString(now), completions)) return "completed";
  return todayOccurrence.getTime() <= now.getTime() ? "dueOrOverdue" : "upcoming";
}

export interface RoutineListItem {
  routine: ScheduledRoutine;
  status: RoutineStatus;
  todayOccurrenceDate: Date | null;
  nextOccurrenceDate: Date | null;
}

export function buildRoutineListItems(
  routines: ScheduledRoutine[],
  completions: RoutineOccurrenceCompletion[],
  now: Date = new Date()
): RoutineListItem[] {
  return routines.map((routine) => ({
    routine,
    status: resolveRoutineStatusToday(routine, completions, now),
    todayOccurrenceDate: resolveTodayOccurrenceDate(routine, now),
    nextOccurrenceDate: resolveNextOccurrenceDate(routine, now),
  }));
}

/**
 * Display ordering: routines occurring today first, sorted chronologically
 * by today's own scheduled time (spec: "Sort today's routines
 * chronologically"); routines with no occurrence today follow, sorted by
 * their own next occurrence, so every routine is still visible with its
 * "next occurrence" -- never hidden entirely just because it isn't due
 * today.
 */
export function sortRoutineListItems(items: RoutineListItem[]): RoutineListItem[] {
  return [...items].sort((a, b) => {
    const aIsToday = a.todayOccurrenceDate !== null;
    const bIsToday = b.todayOccurrenceDate !== null;
    if (aIsToday !== bIsToday) return aIsToday ? -1 : 1;
    const aKey = a.todayOccurrenceDate ?? a.nextOccurrenceDate;
    const bKey = b.todayOccurrenceDate ?? b.nextOccurrenceDate;
    if (aKey === null && bKey === null) return 0;
    if (aKey === null) return 1;
    if (bKey === null) return -1;
    return aKey.getTime() - bKey.getTime();
  });
}

/** A fresh identifier for one routine -- same shape/uniqueness guarantee as arc/actionTimer.ts's generateTimerRunId (not cryptographically unique; collision odds are astronomically low at this single-device, trainee-authored scale). */
export function generateRoutineId(): string {
  return `routine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
