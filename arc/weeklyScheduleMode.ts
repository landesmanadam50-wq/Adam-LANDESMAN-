/**
 * arc/weeklyScheduleMode.ts
 *
 * Weekly & Daily Routine Redesign task, section 4: "Continuous or
 * Spaced Routine -- Per Weekday." A genuinely NEW concept, distinct
 * from arc/dailyRoutine.ts's own, differently-scoped RoutineMode
 * ("continuous" vs "spaced" there governs whether the OLD Automatic
 * Routine Builder shows a reflection+smile screen between tasks or one
 * summary at the end -- a completion-flow choice, never a scheduling
 * gap). This module's own WeeklyScheduleMode instead governs how much
 * TIME is left between consecutive tasks when arc/dailyPlan.ts's own
 * applyScheduleMode auto-places a task that has no fixed time of its
 * own -- "continuous" chains them back-to-back, "spaced" inserts the
 * chosen gap. No React, no AsyncStorage -- same split every other pure
 * module in this codebase keeps (data/weeklyScheduleMode-shaped CRUD
 * lives in data/storage.ts).
 *
 * Two independent layers, exactly matching section 4's own closing
 * paragraph ("the user may also override the routine mode or gap
 * duration for a specific date without changing the permanent weekday
 * setting"):
 *  - WeeklyScheduleModeSettings: the PERMANENT, per-weekday (0-6)
 *    setting -- the template itself, never touched by an ordinary
 *    weekly reset (section 6: "the permanent recurring weekly template
 *    must NOT be deleted by a normal weekly reset").
 *  - DailyScheduleModeOverride: an OPTIONAL, per-DATE override that
 *    takes precedence over that date's own weekday setting -- cleared
 *    by a weekly reset (resetWeekScheduleModeOverrides below), exactly
 *    like a TaskOccurrenceOverride's own time/duration fields.
 */

import { todayLocalDateString } from "../program/dateUtils.ts";
import { resolveWeekDates, resolveWeekStartLocalDate } from "./weeklyRoutine.ts";

export { resolveWeekDates };

export type WeeklyScheduleMode = { mode: "continuous" } | { mode: "spaced"; gapMinutes: number };

// Nine Functional Improvements task, Improvement 5: the default for a
// weekday never explicitly configured is now Spaced (a sensible gap
// between tasks is the safer out-of-the-box behavior than chaining
// them back-to-back) -- an explicit setting a user already saved,
// continuous or spaced, always wins over this fallback regardless, so
// changing this constant alone carries zero migration risk.
export const DEFAULT_WEEKLY_SCHEDULE_MODE: WeeklyScheduleMode = { mode: "spaced", gapMinutes: 10 };

/** Section 4's own enumerated preset gaps -- "Custom duration" is simply any other positive integer typed directly into the spaced-gap field, never a 5th preset value here. */
export const WEEKLY_SPACED_GAP_PRESETS = [5, 10, 15, 30] as const;

export function createDefaultWeeklyScheduleModeSettings(): Record<number, WeeklyScheduleMode> {
  return { 0: { ...DEFAULT_WEEKLY_SCHEDULE_MODE }, 1: { ...DEFAULT_WEEKLY_SCHEDULE_MODE }, 2: { ...DEFAULT_WEEKLY_SCHEDULE_MODE }, 3: { ...DEFAULT_WEEKLY_SCHEDULE_MODE }, 4: { ...DEFAULT_WEEKLY_SCHEDULE_MODE }, 5: { ...DEFAULT_WEEKLY_SCHEDULE_MODE }, 6: { ...DEFAULT_WEEKLY_SCHEDULE_MODE } };
}

/** This one weekday's (0=Sunday..6=Saturday) permanent setting -- defaults to continuous when the trainee never configured that weekday at all (a brand-new weekday entry, or a settings object saved before this task existed). */
export function resolveWeekdayScheduleMode(settings: Record<number, WeeklyScheduleMode>, weekday: number): WeeklyScheduleMode {
  return settings[weekday] ?? DEFAULT_WEEKLY_SCHEDULE_MODE;
}

/** Pure update -- returns a NEW settings map with only `weekday`'s own entry replaced, every other weekday untouched. */
export function setWeekdayScheduleMode(settings: Record<number, WeeklyScheduleMode>, weekday: number, mode: WeeklyScheduleMode): Record<number, WeeklyScheduleMode> {
  return { ...settings, [weekday]: mode };
}

export interface DailyScheduleModeOverride {
  occurrenceDateLocal: string;
  mode: WeeklyScheduleMode;
  updatedAt: string;
}

export function findDailyScheduleModeOverride(dateLocal: string, overrides: DailyScheduleModeOverride[]): DailyScheduleModeOverride | null {
  return overrides.find((entry) => entry.occurrenceDateLocal === dateLocal) ?? null;
}

/** Upserts one date's mode override -- replaces any existing entry for the exact same date, otherwise appends. Same read-modify-write convention as arc/taskOccurrenceOverride.ts's own upsertTaskOccurrenceOverride. */
export function upsertDailyScheduleModeOverride(overrides: DailyScheduleModeOverride[], next: DailyScheduleModeOverride): DailyScheduleModeOverride[] {
  const index = overrides.findIndex((entry) => entry.occurrenceDateLocal === next.occurrenceDateLocal);
  if (index === -1) return [...overrides, next];
  const copy = [...overrides];
  copy[index] = next;
  return copy;
}

/**
 * The one, single-sourced answer to "what scheduling mode actually
 * applies on this date" -- a date-specific override (if one exists)
 * always wins over that date's own weekday's permanent setting, which
 * itself falls back to "continuous" when never configured. Every
 * caller (arc/dailyPlan.ts's applyScheduleMode, the Weekly/Flexible
 * Daily screens) goes through this, never re-deriving the precedence
 * rule its own way.
 */
export function resolveEffectiveScheduleMode(
  weekday: number,
  dateLocal: string,
  weekdaySettings: Record<number, WeeklyScheduleMode>,
  dateOverrides: DailyScheduleModeOverride[]
): WeeklyScheduleMode {
  const dateOverride = findDailyScheduleModeOverride(dateLocal, dateOverrides);
  if (dateOverride) return dateOverride.mode;
  return resolveWeekdayScheduleMode(weekdaySettings, weekday);
}

/** The gap (in minutes) a given mode inserts between consecutive tasks -- 0 for continuous, the chosen interval for spaced. The one place this translation happens, so applyScheduleMode never re-derives it. */
export function resolveGapMinutes(mode: WeeklyScheduleMode): number {
  return mode.mode === "spaced" ? mode.gapMinutes : 0;
}

/**
 * Section 6's own "resetting date-specific continuous/spaced mode
 * overrides": removes only the DailyScheduleModeOverride entries
 * within the 7 dates of `weekStartLocal`'s own week -- never touches
 * the permanent per-weekday settings (WeeklyScheduleModeSettings
 * itself is the template; a normal weekly reset must never delete it),
 * and never touches an override from any OTHER week.
 */
export function resetWeekScheduleModeOverrides(overrides: DailyScheduleModeOverride[], weekStartLocal: string): DailyScheduleModeOverride[] {
  const weekDates = new Set(resolveWeekDates(weekStartLocal));
  return overrides.filter((entry) => !weekDates.has(entry.occurrenceDateLocal));
}

/** Convenience for "is this the week containing today" -- used by the Weekly screen to label/highlight the current week distinctly from a navigated-to past/future one. Reuses resolveWeekStartLocalDate (arc/weeklyRoutine.ts) rather than re-deriving the same "Sunday that starts this week" arithmetic a second time. */
export function isCurrentWeek(weekStartLocal: string, now: Date = new Date()): boolean {
  return weekStartLocal === resolveWeekStartLocalDate(todayLocalDateString(now));
}

/** One week forward/back from `weekStartLocal` -- the Weekly screen's own prev/next navigation, built on the same local-date arithmetic resolveWeekDates already uses. */
export function shiftWeek(weekStartLocal: string, direction: "prev" | "next"): string {
  const [year, month, day] = weekStartLocal.split("-").map(Number);
  const date = new Date(year, month - 1, day + (direction === "next" ? 7 : -7));
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
