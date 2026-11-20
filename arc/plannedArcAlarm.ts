/**
 * arc/plannedArcAlarm.ts
 *
 * ARC alarm task ("הוספת שעון מעורר לתרגילי ARC מתוכננים"): the pure
 * "when should this planned ARC's own alarm next fire" calculation --
 * the one thing section 2 of the spec explicitly asks to identify
 * ("זהה את מקור האמת של שעת כל תרגול ARC") and never duplicate.
 *
 * "before_task" delegates ENTIRELY to arc/taskScheduledStart.ts's own
 * resolveNextArcWindowOccurrence -- the existing source of truth for a
 * task's own before-task ARC window -- so a task's scheduledTime
 * change, recurrence, or deletion/archival is reflected automatically,
 * with zero parallel date math here.
 *
 * "standalone" reuses arc/routines.ts's own resolveNextOccurrenceDate
 * for its RECURRING case -- the exact same day-of-week walk every
 * ScheduledRoutine already uses (daily is simply every weekday
 * selected, never a distinct code path) -- and mirrors
 * arc/taskScheduledStart.ts's own "once" branch for a one-time
 * standalone alarm, never a third, invented recurrence engine.
 */

import type { PlannedArc } from "./plannedArc.ts";
import type { Task } from "./tasks.ts";
import type { TaskOccurrenceOverride } from "./taskOccurrenceOverride.ts";
import { resolveNextArcWindowOccurrence } from "./taskScheduledStart.ts";
import { resolveNextOccurrenceDate } from "./routines.ts";

function setLocalTime(day: Date, hour: number, minute: number): Date {
  const result = new Date(day);
  result.setHours(hour, minute, 0, 0);
  return result;
}

/**
 * The next absolute moment this planned ARC's own alarm should fire,
 * or null when nothing qualifies: the alarm is off, "before_task"
 * timing with no linked task (or a linked task whose own window no
 * longer resolves -- deleted/archived/unscheduled), or "standalone"
 * timing with no time set, an invalid time, or no recurrence day
 * configured. `linkedTask` is the caller's own already-loaded Task for
 * item.linkedTaskId (or null) -- this function never loads anything
 * itself, staying pure.
 */
export function resolveNextPlannedArcAlarmOccurrence(
  item: PlannedArc,
  linkedTask: Task | null,
  now: Date = new Date(),
  overrides: TaskOccurrenceOverride[] = []
): Date | null {
  if (!item.arcAlarmEnabled) return null;

  if (item.arcAlarmTimingKind === "before_task") {
    if (!linkedTask) return null;
    return resolveNextArcWindowOccurrence(linkedTask, now, overrides);
  }

  if (!item.arcAlarmTime) return null;
  const [hourText, minuteText] = item.arcAlarmTime.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  if (item.arcAlarmRecurrence.kind === "once") {
    let day = now;
    if (item.arcAlarmDate) {
      const [year, month, dayNum] = item.arcAlarmDate.split("-").map(Number);
      day = new Date(year, month - 1, dayNum);
    }
    const candidate = setLocalTime(day, hour, minute);
    return candidate.getTime() > now.getTime() ? candidate : null;
  }

  return resolveNextOccurrenceDate({ hour, minute, recurrenceDays: item.arcAlarmRecurrence.daysOfWeek }, now);
}
