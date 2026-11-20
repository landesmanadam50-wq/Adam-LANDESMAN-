/**
 * arc/dailyRoutine.ts
 *
 * Automatic Routine Builder & Editable Daily Schedule: pure data model
 * and schedule-generation engine. No AsyncStorage, no navigation, no
 * React -- same split as arc/todaySchedule.ts/arc/taskTimer.ts.
 *
 * A DailyRoutineTemplate is the RECURRING definition the trainee builds
 * once during first-time setup and edits any time afterwards: four
 * fixed daily periods (morning/noon/afternoon/evening), each with a
 * start/end time and an ORDERED list of task templates, each optionally
 * followed by a break template.
 *
 * The template itself never schedules anything by itself -- it is
 * materialized into real arc/tasks.ts Task records (one recurring Task
 * per RoutineTaskTemplate) by data/dailyRoutine.ts, so every existing
 * Task LIVE/timer/ARC/completion mechanism applies to a routine task
 * with zero new code. This file only computes WHEN each template task
 * should start (generateDailyRoutineSchedule) and provides pure
 * add/remove/move/rename/retime/break-conversion operations over the
 * template, each returning a new template and never mutating its input.
 *
 * Naming note: this is unrelated to arc/routines.ts's ScheduledRoutine
 * (a single recurring reminder+reflection item, screen title "השגרה
 * שלי") -- distinct concept, distinct module, distinct storage key.
 */

import type { RoutineBreakKind, RoutineBreakTemplate, RoutinePeriodId, Task } from "./tasks.ts";
import { ROUTINE_PERIOD_IDS } from "./tasks.ts";
import { isRecurringTaskScheduledOnDate, isTaskOccurrenceCompleted, type TaskOccurrenceCompletion } from "./taskOccurrence.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";

export const ROUTINE_PERIOD_LABELS: Record<RoutinePeriodId, string> = {
  morning: "בוקר",
  noon: "צהריים",
  afternoon: "אחר הצהריים",
  evening: "ערב",
};

export const ROUTINE_BREAK_KIND_LABELS: Record<RoutineBreakKind, string> = {
  regular: "הפסקה רגילה",
  mindful: "מנוחה מודעת",
  arc: "תרגיל ARC",
};

/**
 * Continuous vs. Spaced Routines task: how completing a task in this
 * period behaves. "spaced" (the default, and the ONLY behavior that
 * ever existed before this task -- every pre-existing period
 * normalizes to it, zero behavior change) shows the existing per-task
 * reflection then the existing smiling exercise before continuing.
 * "continuous" skips both of those after each task (the smile REWARD
 * is still earned every time -- see arc/postTaskRewards.ts, a totally
 * separate system from the reflection/exercise UI) and shows one
 * summary reflection only once the whole period's tasks for today are
 * done. See data/dailyRoutine.ts's resolveContinuousRoutineOutcome for
 * where this is actually read at completion time.
 */
export type RoutineMode = "continuous" | "spaced";

export const ROUTINE_MODE_LABELS: Record<RoutineMode, string> = {
  spaced: "שגרה מרווחת (רפלקציה ותרגיל חיוך בין משימות)",
  continuous: "שגרה רציפה (סימון מהיר, רפלקציה מסכמת בסוף)",
};

export interface RoutineTaskTemplate {
  id: string;
  title: string;
  durationMinutes: number;
  /** The break (if any) that follows this task, before the next task in the period (or before the period's own endTime, for the last task). null means no break follows. */
  breakAfter: RoutineBreakTemplate | null;
}

export interface RoutinePeriodTemplate {
  id: RoutinePeriodId;
  startTime: string; // "HH:MM", 24-hour, device-local
  endTime: string; // "HH:MM"
  tasks: RoutineTaskTemplate[];
  routineMode: RoutineMode;
}

export interface DailyRoutineTemplate {
  periods: Record<RoutinePeriodId, RoutinePeriodTemplate>;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_PERIOD_TIMES: Record<RoutinePeriodId, { startTime: string; endTime: string }> = {
  morning: { startTime: "07:00", endTime: "12:00" },
  noon: { startTime: "12:00", endTime: "15:00" },
  afternoon: { startTime: "15:00", endTime: "19:00" },
  evening: { startTime: "19:00", endTime: "22:00" },
};

export function createEmptyDailyRoutineTemplate(now: string): DailyRoutineTemplate {
  const periods = {} as Record<RoutinePeriodId, RoutinePeriodTemplate>;
  for (const id of ROUTINE_PERIOD_IDS) {
    periods[id] = { id, startTime: DEFAULT_PERIOD_TIMES[id].startTime, endTime: DEFAULT_PERIOD_TIMES[id].endTime, tasks: [], routineMode: "spaced" };
  }
  return { periods, createdAt: now, updatedAt: now };
}

/** Backfills routineMode for a period saved before the Continuous vs. Spaced Routines task existed -- "spaced" is the exact pre-existing behavior, so an old template's periods behave identically until the trainee explicitly switches one. */
export function normalizeRoutinePeriodTemplate(period: RoutinePeriodTemplate): RoutinePeriodTemplate {
  return { ...period, routineMode: period.routineMode ?? "spaced" };
}

export function normalizeDailyRoutineTemplate(template: DailyRoutineTemplate): DailyRoutineTemplate {
  const periods = {} as Record<RoutinePeriodId, RoutinePeriodTemplate>;
  for (const id of ROUTINE_PERIOD_IDS) {
    periods[id] = normalizeRoutinePeriodTemplate(template.periods[id]);
  }
  return { ...template, periods };
}

export function setPeriodRoutineMode(template: DailyRoutineTemplate, periodId: RoutinePeriodId, routineMode: RoutineMode, now: string): DailyRoutineTemplate {
  return {
    ...template,
    periods: { ...template.periods, [periodId]: { ...template.periods[periodId], routineMode } },
    updatedAt: now,
  };
}

/** Same stable-id-string pattern as arc/tasks.ts's generateTaskId -- not cryptographically unique; collision odds are astronomically low at this single-device, trainee-authored scale. */
export function generateRoutineTaskTemplateId(): string {
  return `routine-task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Parses a strict "HH:MM" string to minutes-since-midnight, or null for anything malformed/partial -- callers reading a trainee's still-being-typed TextInput value must check this before any arithmetic (same discipline as program/dateUtils.ts's isValidCalendarDateString). */
export function parseClockTimeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function formatMinutesToClockTime(totalMinutes: number): string {
  const normalized = Math.max(0, Math.round(totalMinutes));
  const hour = Math.floor(normalized / 60) % 24;
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export interface GeneratedRoutineSlot {
  periodId: RoutinePeriodId;
  taskTemplateId: string;
  title: string;
  durationMinutes: number;
  startTime: string; // "HH:MM", computed
  breakAfter: RoutineBreakTemplate | null;
}

export interface PeriodTimeConflict {
  periodId: RoutinePeriodId;
  neededMinutes: number;
  availableMinutes: number;
  overflowMinutes: number;
}

export interface GeneratedPeriodSchedule {
  periodId: RoutinePeriodId;
  slots: GeneratedRoutineSlot[];
  conflict: PeriodTimeConflict | null;
}

export interface GeneratedRoutineSchedule {
  periods: GeneratedPeriodSchedule[];
  conflicts: PeriodTimeConflict[];
}

/**
 * Walks one period's tasks in order, starting at the period's own
 * startTime, each task consuming durationMinutes then (if present) its
 * breakAfter's durationMinutes before the next task starts. Every task
 * always gets a computed slot -- a period that doesn't fit its tasks
 * NEVER silently drops one; it still places all of them (running past
 * endTime) and reports the overflow as a conflict for the caller to
 * show and let the trainee resolve (spec: "never silently remove
 * tasks... clearly explain the conflict").
 */
export function generatePeriodSchedule(period: RoutinePeriodTemplate): GeneratedPeriodSchedule {
  const startMinutes = parseClockTimeToMinutes(period.startTime) ?? 0;
  const endMinutes = parseClockTimeToMinutes(period.endTime) ?? startMinutes;
  const availableMinutes = Math.max(0, endMinutes - startMinutes);

  let cursor = startMinutes;
  let neededMinutes = 0;
  const slots: GeneratedRoutineSlot[] = [];
  for (const task of period.tasks) {
    slots.push({
      periodId: period.id,
      taskTemplateId: task.id,
      title: task.title,
      durationMinutes: task.durationMinutes,
      startTime: formatMinutesToClockTime(cursor),
      breakAfter: task.breakAfter,
    });
    const step = task.durationMinutes + (task.breakAfter?.durationMinutes ?? 0);
    cursor += step;
    neededMinutes += step;
  }

  const overflowMinutes = Math.max(0, neededMinutes - availableMinutes);
  const conflict: PeriodTimeConflict | null =
    overflowMinutes > 0 ? { periodId: period.id, neededMinutes, availableMinutes, overflowMinutes } : null;

  return { periodId: period.id, slots, conflict };
}

export function generateDailyRoutineSchedule(template: DailyRoutineTemplate): GeneratedRoutineSchedule {
  const periods = ROUTINE_PERIOD_IDS.map((id) => generatePeriodSchedule(template.periods[id]));
  const conflicts = periods.map((p) => p.conflict).filter((c): c is PeriodTimeConflict => c !== null);
  return { periods, conflicts };
}

// --- Pure template-editing operations -- every one returns a NEW template, never mutates its input. ---

function withPeriod(template: DailyRoutineTemplate, periodId: RoutinePeriodId, update: (period: RoutinePeriodTemplate) => RoutinePeriodTemplate, now: string): DailyRoutineTemplate {
  return {
    ...template,
    periods: { ...template.periods, [periodId]: update(template.periods[periodId]) },
    updatedAt: now,
  };
}

export function addTaskToTemplate(
  template: DailyRoutineTemplate,
  periodId: RoutinePeriodId,
  position: number,
  task: RoutineTaskTemplate,
  now: string,
): DailyRoutineTemplate {
  return withPeriod(
    template,
    periodId,
    (period) => {
      const tasks = [...period.tasks];
      const clampedPosition = Math.max(0, Math.min(position, tasks.length));
      tasks.splice(clampedPosition, 0, task);
      return { ...period, tasks };
    },
    now,
  );
}

export function removeTaskFromTemplate(template: DailyRoutineTemplate, periodId: RoutinePeriodId, taskTemplateId: string, now: string): DailyRoutineTemplate {
  return withPeriod(template, periodId, (period) => ({ ...period, tasks: period.tasks.filter((t) => t.id !== taskTemplateId) }), now);
}

export function updateTaskInTemplate(
  template: DailyRoutineTemplate,
  periodId: RoutinePeriodId,
  taskTemplateId: string,
  patch: Partial<Pick<RoutineTaskTemplate, "title" | "durationMinutes">>,
  now: string,
): DailyRoutineTemplate {
  return withPeriod(
    template,
    periodId,
    (period) => ({ ...period, tasks: period.tasks.map((t) => (t.id === taskTemplateId ? { ...t, ...patch } : t)) }),
    now,
  );
}

export function setBreakAfterTask(
  template: DailyRoutineTemplate,
  periodId: RoutinePeriodId,
  taskTemplateId: string,
  breakAfter: RoutineBreakTemplate | null,
  now: string,
): DailyRoutineTemplate {
  return withPeriod(
    template,
    periodId,
    (period) => ({ ...period, tasks: period.tasks.map((t) => (t.id === taskTemplateId ? { ...t, breakAfter } : t)) }),
    now,
  );
}

export function moveTaskWithinPeriod(template: DailyRoutineTemplate, periodId: RoutinePeriodId, taskTemplateId: string, newIndex: number, now: string): DailyRoutineTemplate {
  return withPeriod(
    template,
    periodId,
    (period) => {
      const tasks = [...period.tasks];
      const currentIndex = tasks.findIndex((t) => t.id === taskTemplateId);
      if (currentIndex === -1) return period;
      const [moved] = tasks.splice(currentIndex, 1);
      const clampedIndex = Math.max(0, Math.min(newIndex, tasks.length));
      tasks.splice(clampedIndex, 0, moved);
      return { ...period, tasks };
    },
    now,
  );
}

export function moveTaskBetweenPeriods(
  template: DailyRoutineTemplate,
  fromPeriodId: RoutinePeriodId,
  toPeriodId: RoutinePeriodId,
  taskTemplateId: string,
  newIndex: number,
  now: string,
): DailyRoutineTemplate {
  if (fromPeriodId === toPeriodId) return moveTaskWithinPeriod(template, fromPeriodId, taskTemplateId, newIndex, now);
  const fromPeriod = template.periods[fromPeriodId];
  const moved = fromPeriod.tasks.find((t) => t.id === taskTemplateId);
  if (!moved) return template;
  const withoutTask = withPeriod(template, fromPeriodId, (period) => ({ ...period, tasks: period.tasks.filter((t) => t.id !== taskTemplateId) }), now);
  return withPeriod(
    withoutTask,
    toPeriodId,
    (period) => {
      const tasks = [...period.tasks];
      const clampedIndex = Math.max(0, Math.min(newIndex, tasks.length));
      tasks.splice(clampedIndex, 0, moved);
      return { ...period, tasks };
    },
    now,
  );
}

export function updatePeriodTimes(template: DailyRoutineTemplate, periodId: RoutinePeriodId, startTime: string, endTime: string, now: string): DailyRoutineTemplate {
  return withPeriod(template, periodId, (period) => ({ ...period, startTime, endTime }), now);
}

/**
 * Where a "today only" one-time task inserted at `position` among a
 * period's ALREADY-GENERATED slots should start. Deliberately never
 * shifts the existing (recurring) slots' own fixed times -- those stay
 * exactly where the template says they are, every day, so a one-off
 * insertion can never silently change a recurring task's time for
 * today. If this creates an overlap, that is a real, visible time
 * conflict for the caller to show (spec: "if there isn't enough time,
 * show the conflict and offer options") rather than this function's
 * job to resolve.
 */
export function computeOneOffInsertionTime(periodSchedule: GeneratedPeriodSchedule, periodStartTime: string, position: number): string {
  const clamped = Math.max(0, Math.min(position, periodSchedule.slots.length));
  if (clamped === 0) return periodSchedule.slots[0]?.startTime ?? periodStartTime;
  const previous = periodSchedule.slots[clamped - 1];
  const previousEndMinutes = (parseClockTimeToMinutes(previous.startTime) ?? 0) + previous.durationMinutes + (previous.breakAfter?.durationMinutes ?? 0);
  return formatMinutesToClockTime(previousEndMinutes);
}

/** True for a routine task actually relevant to today AND not yet completed today -- same "is this task on today" rule arc/todaySchedule.ts's own classifyTaskForToday applies to a routine task, just without the overdue/current/laterToday bucketing this doesn't need. */
function isPendingToday(task: Task, completions: TaskOccurrenceCompletion[], todayDateLocal: string, now: Date): boolean {
  if (task.status === "archived" || task.status === "completed") return false;
  if (task.recurrence.kind === "recurring") {
    if (!isRecurringTaskScheduledOnDate(task, now)) return false;
    return !isTaskOccurrenceCompleted(task.id, todayDateLocal, completions);
  }
  return task.scheduledDate === todayDateLocal;
}

/**
 * Continuous vs. Spaced Routines task: the next not-yet-completed-today
 * task in `periodId`, excluding `excludeTaskId` (the one just
 * completed) -- sorted by scheduledTime, the same chronological order
 * build/DailyScheduleScreen.tsx already displays a period's tasks in.
 * null means `excludeTaskId` was the LAST remaining task in this
 * period for today -- the signal data/dailyRoutine.ts's
 * resolveContinuousRoutineOutcome uses to decide "show the one summary
 * reflection now" instead of "skip straight to the next task".
 */
export function resolveNextContinuousTaskInPeriod(
  tasks: Task[],
  completions: TaskOccurrenceCompletion[],
  periodId: RoutinePeriodId,
  excludeTaskId: string,
  now: Date,
): Task | null {
  const todayDateLocal = todayLocalDateString(now);
  const candidates = tasks.filter(
    (task) => task.id !== excludeTaskId && task.routinePeriodId === periodId && isPendingToday(task, completions, todayDateLocal, now),
  );
  candidates.sort((a, b) => (a.scheduledTime ?? "").localeCompare(b.scheduledTime ?? ""));
  return candidates[0] ?? null;
}
