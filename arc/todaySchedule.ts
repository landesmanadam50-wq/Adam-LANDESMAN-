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
import { addCalendarDays, todayLocalDateString } from "../program/dateUtils.ts";

export type TodaySection = "overdue" | "current" | "nextTask" | "laterToday" | "unscheduled" | "completedToday";

export interface TodayTaskEntry {
  task: Task;
  section: TodaySection;
  /** Today's own local date, carried alongside the task so a caller marking a RECURRING task's occurrence complete always stamps the exact date this entry was computed for -- never a second, possibly different, re-derivation of "today" at click time. */
  occurrenceDateLocal: string;
}

/** The single clock reading a scheduledDate/scheduledTime pair (or a postponed task's own returnAt) resolves to for sorting/overdue comparisons -- null when nothing is scheduled (an unscheduled or time-less occurrence sorts after every timed one, never before). Exported for live/ActiveTaskScreen.tsx's own "starts in X" display (productivity upgrade task, requirement 5) -- the exact same clock reading, never a second re-derivation. */
export function resolveTaskClockTime(task: Task, occurrenceDateLocal: string): Date | null {
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
 * date, or completed on an earlier day). "current"/"nextTask" are never
 * returned here -- those single promotions are decided once, across
 * every classified task, by buildTodaySections below.
 */
function classifyTaskForToday(
  task: Task,
  completions: TaskOccurrenceCompletion[],
  todayDateLocal: string,
  now: Date
): Exclude<TodaySection, "current" | "nextTask"> | null {
  if (task.status === "archived") return null;

  // Task-categorization fix, requirement 1 / day-transition safety: a
  // task actually STARTED always has a place on today's screen, however
  // its recurrence calendar or postponement fields read -- the active
  // task is pulled out into its own "current" slot below regardless of
  // which bucket it lands in here. This is what keeps a still-running
  // task from vanishing from Today just because, e.g., a recurring
  // task's scheduled weekday rolled over past midnight while it was
  // still active.
  if (task.status === "active") return resolveClockBucket(task, todayDateLocal, now);

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

/**
 * ARC-system upgrade task, Part 2: the clock moment an OPTIONAL ARC
 * window before this task begins -- `resolveTaskClockTime`'s own
 * result minus `arcWindowMinutesBefore`. null when the task has no
 * resolvable clock time (nothing to anchor a window to) OR no window
 * was ever set (`arcWindowMinutesBefore` is null) -- never a window
 * auto-derived for a task that never asked for one.
 */
export function resolveArcWindowClockTime(task: Task, occurrenceDateLocal: string): Date | null {
  if (task.arcWindowMinutesBefore === null) return null;
  const taskClock = resolveTaskClockTime(task, occurrenceDateLocal);
  if (!taskClock) return null;
  return new Date(taskClock.getTime() - task.arcWindowMinutesBefore * 60 * 1000);
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

export interface TodaySections {
  /** Task-categorization fix, requirement 1: ONLY a task actually started (status "active") and still active -- NEVER a fallback to the nearest overdue/upcoming task. null whenever nothing is actually running. */
  current: TodayTaskEntry | null;
  /** Requirement 2: scheduled start time has passed, but the task was never started (or never completed) -- kept and shown here, never merged into/replaced by "current". */
  overdue: TodayTaskEntry[];
  /** Requirement 3: the single nearest task by its own scheduled clock time that HASN'T arrived yet -- drawn only from laterToday, never from overdue. null when nothing is still ahead today. */
  nextTask: TodayTaskEntry | null;
  /** Every other not-yet-due task, excluding whichever one is already singled out as nextTask. */
  laterToday: TodayTaskEntry[];
  unscheduled: TodayTaskEntry[];
  /** Requirement 4: once a task lands here it only leaves on a later day (see classifyTaskForToday's own completed-task branch) -- nothing in this module ever moves a completed task back into any active bucket. */
  completedToday: TodayTaskEntry[];
}

/**
 * The single "what to jump to or suggest right now" pick used by
 * navigation/suggestion call sites -- resolveNextTaskEntry below (Next
 * Task/Skip Task/post-completion auto-advance), and
 * live/ManifestMeditationScreen.tsx's "today's action" suggestion. This
 * is deliberately NOT the same thing as Today's own `current` section:
 * an overdue, never-started task is never shown AS "current" on Today
 * (requirement 1), but it is still the most sensible task to jump to or
 * suggest a focus for when nothing is actually active -- exactly the
 * old currentOrNext fallback order, kept for these two purposes only.
 */
export function resolveMostUrgentEntry(sections: TodaySections): TodayTaskEntry | null {
  return sections.current ?? sections.overdue[0] ?? sections.nextTask ?? null;
}

/**
 * ARC-system upgrade task, Part J: resolves the next task to show when
 * deliberately moving away from `excludeTaskId` WITHOUT completing or
 * skipping it ("Next Task" is its own action, distinct from "Complete
 * Task"). Reuses buildTodaySections's own sort/bucketing (via
 * resolveMostUrgentEntry) with the current task excluded from the
 * candidate pool -- never a second, competing "what's next"
 * calculation. Also reused by "Skip Task" and by the post-completion
 * auto-advance, so every navigation path agrees on exactly one
 * definition of "next."
 */
export function resolveNextTaskEntry(tasks: Task[], completions: TaskOccurrenceCompletion[], excludeTaskId: string, now: Date = new Date()): TodayTaskEntry | null {
  return resolveMostUrgentEntry(buildTodaySections(tasks.filter((task) => task.id !== excludeTaskId), completions, now));
}

export function buildTodaySections(tasks: Task[], completions: TaskOccurrenceCompletion[], now: Date = new Date()): TodaySections {
  const todayDateLocal = todayLocalDateString(now);

  const overdueRaw: TodayTaskEntry[] = [];
  const laterTodayRaw: TodayTaskEntry[] = [];
  const unscheduled: TodayTaskEntry[] = [];
  const completedToday: TodayTaskEntry[] = [];

  for (const task of tasks) {
    const section = classifyTaskForToday(task, completions, todayDateLocal, now);
    if (!section) continue;
    const entry: TodayTaskEntry = { task, section, occurrenceDateLocal: todayDateLocal };
    if (section === "overdue") overdueRaw.push(entry);
    else if (section === "laterToday") laterTodayRaw.push(entry);
    else if (section === "unscheduled") unscheduled.push(entry);
    else completedToday.push(entry);
  }

  overdueRaw.sort(compareByClockThenCreatedAt);
  laterTodayRaw.sort(compareByClockThenCreatedAt);
  unscheduled.sort((a, b) => a.task.createdAt.localeCompare(b.task.createdAt));
  completedToday.sort((a, b) => (b.task.completedAt ?? "").localeCompare(a.task.completedAt ?? ""));

  // Requirement 1 (and "starting a late task manually makes it the
  // active task"): pulled out of WHICHEVER bucket it naturally landed
  // in above, so an active task is only ever shown once, under
  // "current" -- never also duplicated under "overdue"/"laterToday".
  // There is only ever one active task at a time (the app's
  // single-active-timer model), so a plain find is enough.
  const current = overdueRaw.find((entry) => entry.task.status === "active") ?? laterTodayRaw.find((entry) => entry.task.status === "active") ?? null;
  const overdue = current ? overdueRaw.filter((entry) => entry.task.id !== current.task.id) : overdueRaw;
  const laterTodayWithoutActive = current ? laterTodayRaw.filter((entry) => entry.task.id !== current.task.id) : laterTodayRaw;

  // Requirement 3: the nearest not-yet-due task, singled out of
  // laterToday (already sorted chronologically) and removed from it so
  // it's never shown twice.
  const nextTask = laterTodayWithoutActive.length > 0 ? laterTodayWithoutActive[0] : null;
  const laterToday = nextTask ? laterTodayWithoutActive.filter((entry) => entry.task.id !== nextTask.task.id) : laterTodayWithoutActive;

  return {
    current: current ? { ...current, section: "current" } : null,
    overdue,
    nextTask: nextTask ? { ...nextTask, section: "nextTask" } : null,
    laterToday,
    unscheduled,
    completedToday,
  };
}

/**
 * ARCHI -- Unified Development Specification task, Part 8 ("LINK
 * INSIGHTS TO EXISTING TASKS"): "show existing tasks scheduled for the
 * current week" -- reuses buildTodaySections's own already-correct
 * per-day resolution (including isRecurringTaskScheduledOnDate's own
 * recurrence logic) over each of the next 7 local calendar days,
 * rather than a second, separate "is this task scheduled on date X"
 * engine. Deliberately excludes the "unscheduled" section -- an
 * always-pending task with no real scheduledDate at all is not what
 * "scheduled for the current week" means here -- and de-duplicates a
 * recurring task that qualifies on more than one day down to its
 * FIRST (earliest) qualifying occurrence this week, so the trainee
 * never sees the same task listed seven times.
 */
export interface WeeklyScheduledTaskEntry {
  task: Task;
  /** The first day this week (today .. today+6) the task is actually scheduled on. */
  occurrenceDateLocal: string;
}

export function listTasksScheduledThisWeek(tasks: Task[], completions: TaskOccurrenceCompletion[], now: Date = new Date()): WeeklyScheduledTaskEntry[] {
  const todayDateLocal = todayLocalDateString(now);
  const seen = new Map<string, WeeklyScheduledTaskEntry>();
  for (let offset = 0; offset < 7; offset++) {
    const dateLocal = addCalendarDays(todayDateLocal, offset);
    const dayNow = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const sections = buildTodaySections(tasks, completions, dayNow);
    const entries = [...(sections.current ? [sections.current] : []), ...sections.overdue, ...(sections.nextTask ? [sections.nextTask] : []), ...sections.laterToday, ...sections.completedToday];
    for (const entry of entries) {
      if (!seen.has(entry.task.id)) seen.set(entry.task.id, { task: entry.task, occurrenceDateLocal: dateLocal });
    }
  }
  return [...seen.values()].sort((a, b) => a.occurrenceDateLocal.localeCompare(b.occurrenceDateLocal));
}
