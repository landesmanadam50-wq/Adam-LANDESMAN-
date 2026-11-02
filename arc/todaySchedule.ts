/**
 * arc/todaySchedule.ts
 *
 * Productivity roadmap, Stage I: pure categorization + deterministic
 * sorting for the Today screen. No AsyncStorage, no navigation, no
 * React -- the same split every other screen's own pure logic module
 * keeps (arc/routines.ts for Scheduled Routines, arc/taskTimer.ts for
 * the task timer), so this entire file is unit-tested directly with
 * node --test and the UI (live/TodayScreen.tsx) only ever renders what
 * this module already decided.
 *
 * Every rule below is a plain, inspectable comparison over Task's own
 * existing fields (scheduledDate/scheduledTime/status/returnAt/
 * completedAt) plus the separate TaskOccurrenceCompletion collection for
 * recurring tasks -- never free-text interpretation, never inference.
 */

import type { Task } from "./tasks.ts";
import { isRecurringTaskScheduledOnDate, isTaskOccurrenceCompleted, type TaskOccurrenceCompletion } from "./taskOccurrence.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";

export type TodaySection = "overdue" | "currentOrNext" | "laterToday" | "unscheduled" | "completedToday";

export interface TodayTaskEntry {
  task: Task;
  section: TodaySection;
  /** Today's own local date, carried alongside the task so a caller marking a RECURRING task's occurrence complete always stamps the exact date this entry was computed for -- never a second, possibly different, re-derivation of "today" at click time. */
  occurrenceDateLocal: string;
}

/** The single clock reading a scheduledDate/scheduledTime pair (or a postponed task's own returnAt) resolves to for sorting/overdue comparisons -- null when nothing is scheduled (an unscheduled or time-less occurrence sorts after every timed one, never before). */
function resolveTaskClockTime(task: Task, occurrenceDateLocal: string): Date | null {
  if (task.status === "postponed") {
    return task.returnAt ? new Date(task.returnAt) : null;
  }
  if (!task.scheduledTime) return null;
  const [hourText, minuteText] = task.scheduledTime.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  const [year, month, day] = occurrenceDateLocal.split("-").map(Number);
  const result = new Date(year, month - 1, day);
  result.setHours(hour, minute, 0, 0);
  return result;
}

/**
 * Classifies ONE task for today, or null when it has no place on
 * today's screen at all (e.g. a one-time task scheduled for a future
 * date, or completed on an earlier day). "currentOrNext" is never
 * returned here -- that single promotion is decided once, across every
 * classified task, by buildTodaySections below.
 */
function classifyTaskForToday(
  task: Task,
  completions: TaskOccurrenceCompletion[],
  todayDateLocal: string,
  now: Date
): Exclude<TodaySection, "currentOrNext"> | null {
  if (task.status === "archived") return null;

  const isRecurring = task.recurrence.kind === "recurring";

  if (isRecurring) {
    if (!isRecurringTaskScheduledOnDate(task, new Date(`${todayDateLocal}T00:00:00`))) return null;
    if (isTaskOccurrenceCompleted(task.id, todayDateLocal, completions)) return "completedToday";
    if (task.status === "postponed") {
      if (!task.returnAt) return "unscheduled";
      const returnDateLocal = todayLocalDateString(new Date(task.returnAt));
      if (returnDateLocal > todayDateLocal) return null; // returns on a later day -- not today's concern
      return returnDateLocal < todayDateLocal ? "overdue" : resolveClockBucket(task, todayDateLocal, now);
    }
    return resolveClockBucket(task, todayDateLocal, now);
  }

  // One-time task.
  if (task.status === "completed") {
    if (!task.completedAt) return null;
    return todayLocalDateString(new Date(task.completedAt)) === todayDateLocal ? "completedToday" : null;
  }
  if (task.status === "postponed") {
    if (!task.returnAt) return "unscheduled";
    const returnDateLocal = todayLocalDateString(new Date(task.returnAt));
    if (returnDateLocal > todayDateLocal) return null;
    return returnDateLocal < todayDateLocal ? "overdue" : resolveClockBucket(task, todayDateLocal, now);
  }
  if (!task.scheduledDate) return "unscheduled";
  if (task.scheduledDate > todayDateLocal) return null; // scheduled for a future day
  if (task.scheduledDate < todayDateLocal) return "overdue";
  return resolveClockBucket(task, todayDateLocal, now);
}

/** Today (or a postponed task's return day, which the caller has already confirmed IS today) -- due now/already passed vs. still ahead, by clock time only; a task with no time at all defaults to "laterToday" (never silently dropped, never falsely marked overdue). */
function resolveClockBucket(task: Task, todayDateLocal: string, now: Date): "overdue" | "laterToday" {
  const clock = resolveTaskClockTime(task, todayDateLocal);
  if (!clock) return "laterToday";
  return clock.getTime() <= now.getTime() ? "overdue" : "laterToday";
}

function compareByClockThenCreatedAt(a: TodayTaskEntry, b: TodayTaskEntry): number {
  const clockA = resolveTaskClockTime(a.task, a.occurrenceDateLocal);
  const clockB = resolveTaskClockTime(b.task, b.occurrenceDateLocal);
  if (clockA && clockB) return clockA.getTime() - clockB.getTime();
  if (clockA && !clockB) return -1; // timed before time-less
  if (!clockA && clockB) return 1;
  return a.task.createdAt.localeCompare(b.task.createdAt);
}

/**
 * The one task promoted out of its raw bucket into "currentOrNext":
 * an already-ACTIVE task always wins (there is only ever one, per the
 * app's single-active-timer model); otherwise the most urgent timed
 * task -- the earliest-due among overdue, else the earliest-due among
 * laterToday. Returns null when nothing is eligible (every remaining
 * task is unscheduled or already completed today).
 */
function pickCurrentOrNext(overdue: TodayTaskEntry[], laterToday: TodayTaskEntry[]): TodayTaskEntry | null {
  const active = [...overdue, ...laterToday].find((entry) => entry.task.status === "active");
  if (active) return active;
  if (overdue.length > 0) return overdue[0];
  if (laterToday.length > 0) return laterToday[0];
  return null;
}

export interface TodaySections {
  overdue: TodayTaskEntry[];
  currentOrNext: TodayTaskEntry | null;
  laterToday: TodayTaskEntry[];
  unscheduled: TodayTaskEntry[];
  completedToday: TodayTaskEntry[];
}

export function buildTodaySections(tasks: Task[], completions: TaskOccurrenceCompletion[], now: Date = new Date()): TodaySections {
  const todayDateLocal = todayLocalDateString(now);

  const overdue: TodayTaskEntry[] = [];
  const laterToday: TodayTaskEntry[] = [];
  const unscheduled: TodayTaskEntry[] = [];
  const completedToday: TodayTaskEntry[] = [];

  for (const task of tasks) {
    const section = classifyTaskForToday(task, completions, todayDateLocal, now);
    if (!section) continue;
    const entry: TodayTaskEntry = { task, section, occurrenceDateLocal: todayDateLocal };
    if (section === "overdue") overdue.push(entry);
    else if (section === "laterToday") laterToday.push(entry);
    else if (section === "unscheduled") unscheduled.push(entry);
    else completedToday.push(entry);
  }

  overdue.sort(compareByClockThenCreatedAt);
  laterToday.sort(compareByClockThenCreatedAt);
  unscheduled.sort((a, b) => a.task.createdAt.localeCompare(b.task.createdAt));
  completedToday.sort((a, b) => (b.task.completedAt ?? "").localeCompare(a.task.completedAt ?? ""));

  const currentOrNext = pickCurrentOrNext(overdue, laterToday);
  const remainingOverdue = currentOrNext ? overdue.filter((entry) => entry.task.id !== currentOrNext.task.id) : overdue;
  const remainingLaterToday = currentOrNext ? laterToday.filter((entry) => entry.task.id !== currentOrNext.task.id) : laterToday;

  return {
    overdue: remainingOverdue,
    currentOrNext: currentOrNext ? { ...currentOrNext, section: "currentOrNext" } : null,
    laterToday: remainingLaterToday,
    unscheduled,
    completedToday,
  };
}
