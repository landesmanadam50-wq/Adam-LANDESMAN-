/**
 * data/dailyPlan.ts
 *
 * Morning Flow Simplification task: a thin, additional IO wrapper
 * around the EXACT SAME "resolve today's effective, auto-scheduled
 * plan" recipe build/FlexibleDailyScreen.tsx's own reload() and
 * data/emotionalCheckInRouting.ts's own resolveAndOpenNextTask already
 * each inline (tasks/overrides/completions/weekdaySettings/
 * dateModeOverrides -> resolveEffectiveScheduleMode -> resolveDailyPlan
 * -> applyScheduleMode) -- used here ONLY by
 * live/DailyStartupSequenceOverlay.tsx's new planning-decision step.
 *
 * Deliberately NOT a refactor of either existing call site: each has
 * its own pre-existing, exact-text source regression test pinning its
 * current inline form (data/emotionalCheckInRouting.test.ts's "required
 * test 6" group), so extracting their own inline copies into a shared
 * call would break those tests for no functional gain. This is a
 * third, additively-introduced copy of the same five-call pipeline,
 * never a fourth, DIFFERENT "what's scheduled today" algorithm.
 */
import { applyScheduleMode, resolveCurrentTaskState, resolveDailyPlan, resolveMostUrgentScheduledEntry } from "../arc/dailyPlan.ts";
import type { ScheduledPlanEntry } from "../arc/dailyPlan.ts";
import { resolveEffectiveScheduleMode } from "../arc/weeklyScheduleMode.ts";
import type { Task } from "../arc/tasks.ts";
import type { TaskTimerRun } from "../arc/taskTimer.ts";
import { parseCalendarDate, todayLocalDateString } from "../program/dateUtils.ts";
import { loadDailyScheduleModeOverrides, loadTaskOccurrenceCompletions, loadTaskOccurrenceOverrides, loadTasks, loadWeeklyScheduleModeSettings } from "./storage.ts";

export async function resolveTodaysScheduledPlan(now: Date = new Date()): Promise<ScheduledPlanEntry[]> {
  const [tasks, overrides, completions, weekdaySettings, dateModeOverrides] = await Promise.all([
    loadTasks(),
    loadTaskOccurrenceOverrides(),
    loadTaskOccurrenceCompletions(),
    loadWeeklyScheduleModeSettings(),
    loadDailyScheduleModeOverrides(),
  ]);
  const dateLocal = todayLocalDateString(now);
  const { year, month, day } = parseCalendarDate(dateLocal);
  const dateObj = new Date(year, month - 1, day);
  const weekday = dateObj.getDay();
  const effectiveMode = resolveEffectiveScheduleMode(weekday, dateLocal, weekdaySettings, dateModeOverrides);
  const plan = resolveDailyPlan(tasks, overrides, completions, dateLocal, dateObj);
  return applyScheduleMode(plan, effectiveMode);
}

/**
 * Lock-Screen Timer, Next-Task Schedule and Smart Alarm Conflict
 * Management task, requirement 2: the one display-ready "what's the
 * next scheduled task" lookup for both live/ActiveTaskScreen.tsx's
 * Task LIVE and Task Details renders, and the ongoing lock-screen
 * notification payload -- built entirely from resolveTodaysScheduledPlan
 * above (never a second "what's scheduled today" IO pipeline).
 * `activeTaskId` excludes whichever task is currently open/running so
 * it never reports itself as "next".
 *
 * Weekly/Flexible-Daily/ARC-LIVE task-sync fix: now reads through
 * arc/dailyPlan.ts's own resolveCurrentTaskState -- the one central
 * current/next decision every relevant consumer shares -- instead of
 * the superseded resolveNextScheduledTaskAfter/isScheduledPlanEntryOverdue
 * pair, so this display can never show a task whose own window has
 * already passed. `next` is never overdue by construction, so
 * `isOverdue` is always `false` now (kept in the shape only so existing
 * consumers of this interface don't need to change).
 */
export interface NextScheduledTaskDisplay {
  task: Task;
  effectiveStartTime: string | null;
  isOverdue: boolean;
}

export async function resolveNextScheduledTaskDisplay(activeTaskId: string | null, now: Date = new Date()): Promise<NextScheduledTaskDisplay | null> {
  const scheduled = await resolveTodaysScheduledPlan(now);
  const { next } = resolveCurrentTaskState(scheduled, now, null, activeTaskId);
  if (!next) return null;
  return { task: next.task, effectiveStartTime: next.effectiveStartTime, isOverdue: false };
}

/**
 * Task LIVE / To-Do List / Flexible Day sync fix: the ONE IO-level
 * "what to jump to or auto-start right now" lookup -- built entirely
 * from resolveTodaysScheduledPlan above (the exact same real, resolved
 * flexible-day plan build/FlexibleDailyScreen.tsx itself shows) and
 * arc/dailyPlan.ts's own resolveMostUrgentScheduledEntry, replacing
 * every former call site of arc/todaySchedule.ts's resolveNextTaskEntry/
 * resolveMostUrgentEntry (a second, independent "what's scheduled
 * today" calculation that never excluded To-Do items and never read the
 * chained effective times applyScheduleMode computes). `activeRun` is
 * real, caller-supplied state (never hardcoded null) so a genuinely
 * still-running active task is correctly distinguished from a stale
 * one, matching the Current-task logic fix's own "thread activeRun
 * through every buildTodaySections call site" precedent.
 */
export async function resolveMostUrgentScheduledTask(
  excludeTaskId: string | null,
  now: Date = new Date(),
  activeRun: TaskTimerRun | null = null
): Promise<ScheduledPlanEntry | null> {
  const scheduled = await resolveTodaysScheduledPlan(now);
  const state = resolveCurrentTaskState(scheduled, now, activeRun, excludeTaskId);
  return resolveMostUrgentScheduledEntry(state);
}
