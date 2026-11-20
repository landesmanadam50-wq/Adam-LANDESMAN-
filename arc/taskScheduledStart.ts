/**
 * arc/taskScheduledStart.ts
 *
 * Productivity upgrade task, requirement 2 ("שעון מעורר לתחילת
 * משימה"): pure date math for the one notification a task's own
 * scheduledDate/scheduledTime pair can produce -- "it's time to start
 * this task now." Deliberately mirrors arc/routines.ts's own
 * resolveNextOccurrenceDate exactly (same day-offset walk, same
 * "strictly after now" rule, same deliberate choice to NOT consult
 * occurrence-completion state when picking the next alarm time -- a
 * routine's own next-occurrence notification has never done that
 * either, so this stays consistent with the one existing precedent for
 * "a recurring entity's own next-fire-time reminder" rather than
 * inventing a different rule).
 *
 * Only ever produces a candidate for a task that is still "planned" --
 * once started, postponed (which has its own, separate return-time
 * reminder), completed, or archived, there is nothing left to alert
 * the trainee to "start." No I/O here; data/taskScheduledStart.ts does
 * the actual scheduling/persistence, mirroring data/routines.ts's own
 * split from arc/routines.ts.
 */

import type { Task } from "./tasks.ts";
import type { TaskOccurrenceOverride } from "./taskOccurrenceOverride.ts";
import { resolveEffectiveOccurrence } from "./taskOccurrenceOverride.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";

function setLocalTime(day: Date, hour: number, minute: number): Date {
  const result = new Date(day);
  result.setHours(hour, minute, 0, 0);
  return result;
}

/**
 * Shared day-walk for a task's own scheduledDate/scheduledTime/
 * recurrence, offset earlier by `minutesOffset` (0 for the task's own
 * start alarm; `task.arcWindowMinutesBefore` for its optional
 * before-task ARC alarm -- see resolveNextArcWindowOccurrence below).
 * The offset is applied BEFORE the "strictly after now" check, not
 * after: a task that's still ahead whose (offset-shifted) window has
 * already slipped by must advance to the task's NEXT occurrence,
 * never fire late for the one that just passed. Not exported --
 * resolveNextTaskStartOccurrence and resolveNextArcWindowOccurrence
 * below are the only two call sites, each a thin, fixed-offset wrapper
 * so neither duplicates this walk.
 */
function resolveNextTaskOccurrenceWithOffset(task: Task, now: Date, minutesOffset: number, overrides: TaskOccurrenceOverride[] = []): Date | null {
  if (task.status !== "planned") return null;

  function withOffset(day: Date, hour: number, minute: number): Date {
    return new Date(setLocalTime(day, hour, minute).getTime() - minutesOffset * 60 * 1000);
  }

  if (task.recurrence.kind === "once") {
    if (!task.scheduledTime) return null;
    const [hourText, minuteText] = task.scheduledTime.split(":");
    const hour = Number(hourText);
    const minute = Number(minuteText);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    let scheduledDay = now;
    if (task.scheduledDate) {
      const [year, month, day] = task.scheduledDate.split("-").map(Number);
      scheduledDay = new Date(year, month - 1, day);
    }
    const candidate = withOffset(scheduledDay, hour, minute);
    return candidate.getTime() > now.getTime() ? candidate : null;
  }

  if (task.recurrence.daysOfWeek.length === 0) return null;
  // Flexible Daily Routine task, integration fix: the effective daily
  // occurrence (today's own per-date override, if any) is the source of
  // truth for WHEN a recurring task's alarm should fire -- a day whose
  // occurrence was removed for this date alone is skipped entirely (the
  // walk advances to the NEXT qualifying day, never firing for a
  // removed occurrence), and a day with a retimed override fires at
  // THAT time instead of the template's own scheduledTime. Every other
  // day this task recurs on, overridden or not, resolves completely
  // independently -- never affected by one date's own override.
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const candidateDay = new Date(now);
    candidateDay.setDate(candidateDay.getDate() + dayOffset);
    if (!task.recurrence.daysOfWeek.includes(candidateDay.getDay())) continue;
    const dateLocal = todayLocalDateString(candidateDay);
    const effective = resolveEffectiveOccurrence(task, dateLocal, overrides);
    if (effective.removed) continue;
    if (!effective.scheduledTime) continue;
    const [hourText, minuteText] = effective.scheduledTime.split(":");
    const hour = Number(hourText);
    const minute = Number(minuteText);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) continue;
    const candidate = withOffset(candidateDay, hour, minute);
    if (candidate.getTime() > now.getTime()) return candidate;
  }
  return null;
}

/**
 * The next absolute moment a "it's time to start" alarm should fire
 * for this task, or null when nothing qualifies: not "planned", no
 * scheduledTime set, a one-time task whose scheduledDate/scheduledTime
 * has already passed, or a recurring task with no recurrence days.
 *
 * Critical-bug fix ("שעון מעורר אוטומטי לכל משימה"): a one-time task
 * with scheduledTime set but NO scheduledDate used to return null here
 * unconditionally -- invisible to the whole scheduling engine, no
 * alarm, no error. arc/taskDraft.ts's buildTaskFromDraft now defaults
 * scheduledDate to today for every NEW such task, but this is the
 * pure function every existing (already-saved, possibly pre-dating
 * that fix) task's own alarm is resolved through too -- defaulting to
 * TODAY here, rather than returning null, is what actually satisfies
 * "existing tasks must sync, not just new ones." Never changes
 * behavior for a task that already has an explicit scheduledDate.
 */
export function resolveNextTaskStartOccurrence(task: Task, now: Date = new Date(), overrides: TaskOccurrenceOverride[] = []): Date | null {
  return resolveNextTaskOccurrenceWithOffset(task, now, 0, overrides);
}

/**
 * ARC alarm task, requirement 1.א: the next absolute moment a task's
 * own OPTIONAL before-task ARC window (task.arcWindowMinutesBefore,
 * resolved for DISPLAY by arc/todaySchedule.ts's own
 * resolveArcWindowClockTime) should fire an alarm -- null when the
 * task has no window configured at all (never a window invented for a
 * task that never asked for one), or whenever
 * resolveNextTaskOccurrenceWithOffset itself would return null for any
 * other reason (not planned, no scheduledTime, no recurrence days --
 * the task deleted/archived/unscheduled case included: once a task is
 * no longer "planned" this always returns null, exactly like the
 * task's own start alarm, so the SAME reconciliation pass that already
 * disarms a task's own alarm also disarms any ARC alarm linked to it).
 * Reuses the EXACT SAME day-walk as the task's own start alarm --
 * never a second, competing implementation -- only the final clock
 * time differs, shifted arcWindowMinutesBefore minutes earlier.
 */
export function resolveNextArcWindowOccurrence(task: Task, now: Date = new Date(), overrides: TaskOccurrenceOverride[] = []): Date | null {
  if (task.arcWindowMinutesBefore === null) return null;
  return resolveNextTaskOccurrenceWithOffset(task, now, task.arcWindowMinutesBefore, overrides);
}
