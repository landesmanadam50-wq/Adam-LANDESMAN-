/**
 * arc/arcReminderScheduling.ts
 *
 * ARC Reminders task: resolves one `ReminderSchedule` (arc/arcReminderSchedule.ts)
 * into concrete `Date` trigger times within a window -- the one engine
 * both ARC Mantra and ARC Active Recall reminders schedule through,
 * never a second "what time should this fire" computation anywhere
 * else. Pure, deterministic, zero I/O: `data/arcReminderScheduler.ts`
 * is the thin wrapper that actually hands these times to notifee.
 *
 * `spreadTimesInWindow`'s own seed is deterministic
 * (reminderId + calendar date), confirmed by direct investigation to
 * have NO precedent anywhere in this codebase -- this is genuinely new
 * logic, written so re-computing the same reminder/date always yields
 * the exact same slot times. That determinism is what makes the
 * rolling-window top-up (arc/reminderRollingSchedule.ts) safe to run
 * repeatedly without ever double-scheduling the same slot.
 */

import { addCalendarDays, daysBetweenCalendarDates, parseCalendarDate, todayLocalDateString } from "../program/dateUtils.ts";
import { parseClockTimeToMinutes } from "./dailyRoutine.ts";
import type { ReminderSchedule } from "./arcReminderSchedule.ts";

/** A tiny, deterministic string hash -> [0, 1) float, so the same (date, seed) always produces the same jitter -- no Math.random() anywhere in this module. */
function seededFraction(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  // Fold the signed 32-bit hash into [0, 1).
  return (hash >>> 0) / 4294967296;
}

function weekdayOfLocalDate(localDate: string): number {
  const { year, month, day } = parseCalendarDate(localDate);
  return new Date(year, month - 1, day).getDay();
}

function dateAtClockTime(localDate: string, clockMinutes: number): Date {
  const { year, month, day } = parseCalendarDate(localDate);
  return new Date(year, month - 1, day, Math.floor(clockMinutes / 60), clockMinutes % 60, 0, 0);
}

/**
 * Divides [windowStart, windowEnd] (minutes-since-midnight) into `count`
 * equal buckets, places one time per bucket with deterministic
 * seeded jitter inside it, then enforces `minGapMinutes` by pushing a
 * time forward (never past its own bucket's end, clamped to windowEnd)
 * when jitter placed two times too close together. `count <= 0` or an
 * inverted/empty window returns `[]`.
 */
export function spreadTimesInWindow(localDate: string, windowStart: string, windowEnd: string, count: number, minGapMinutes: number, seed: string): Date[] {
  const startMinutes = parseClockTimeToMinutes(windowStart);
  const endMinutes = parseClockTimeToMinutes(windowEnd);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes || count <= 0) return [];

  const span = endMinutes - startMinutes;
  const bucketSize = span / count;
  const times: number[] = [];
  for (let i = 0; i < count; i++) {
    const bucketStart = startMinutes + i * bucketSize;
    const bucketEnd = startMinutes + (i + 1) * bucketSize;
    const jitter = seededFraction(`${seed}:${localDate}:${i}`);
    let minute = bucketStart + jitter * (bucketEnd - bucketStart);
    if (i > 0 && minute - times[i - 1] < minGapMinutes) {
      minute = Math.min(bucketEnd, times[i - 1] + minGapMinutes);
    }
    times.push(minute);
  }
  return times.map((minute) => dateAtClockTime(localDate, Math.round(minute)));
}

function isDateWithinRepeat(localDate: string, repeat: ReminderSchedule["repeat"]): boolean {
  if (repeat.kind === "forever") return true;
  return daysBetweenCalendarDates(repeat.endDate, localDate) <= 0;
}

/**
 * Every trigger time this schedule produces within [windowStart, windowEnd]
 * (real Date instants, not day-local windows -- do not confuse with
 * ReminderSchedule's own day-local windowStart/windowEnd field, which is
 * a time-of-day, not a date range). Returns `[]` immediately when paused.
 */
export function resolveUpcomingTriggerTimes(schedule: ReminderSchedule, windowStart: Date, windowEnd: Date): Date[] {
  if (schedule.paused) return [];
  if (windowEnd <= windowStart) return [];

  const results: Date[] = [];
  let localDate = todayLocalDateString(windowStart);
  const lastLocalDate = todayLocalDateString(windowEnd);
  // Walk one extra day back is unnecessary -- todayLocalDateString(windowStart) already anchors the
  // first candidate day; walking forward day-by-day until we pass windowEnd's own local date.
  // Safety cap so a malformed repeat/date never loops forever.
  for (let guard = 0; guard < 400; guard++) {
    const weekday = weekdayOfLocalDate(localDate);
    const dayIncluded = schedule.daysOfWeek.length === 0 || schedule.daysOfWeek.includes(weekday);
    if (dayIncluded && isDateWithinRepeat(localDate, schedule.repeat)) {
      const dayTimes =
        schedule.mode === "fixed_times"
          ? schedule.fixedTimes
              .map((clock) => parseClockTimeToMinutes(clock))
              .filter((minutes): minutes is number => minutes !== null)
              .map((minutes) => dateAtClockTime(localDate, minutes))
          : spreadTimesInWindow(localDate, schedule.windowStart, schedule.windowEnd, schedule.timesPerDay, schedule.minGapMinutes, `reminder:${schedule.createdAt}`);
      for (const time of dayTimes) {
        if (time >= windowStart && time <= windowEnd) results.push(time);
      }
    }
    if (localDate === lastLocalDate) break;
    localDate = addCalendarDays(localDate, 1);
  }
  return results.sort((a, b) => a.getTime() - b.getTime());
}
