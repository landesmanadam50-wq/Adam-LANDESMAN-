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
import { resolveCurrentTaskStateWithTodoSuggestion, resolveTodoList } from "../arc/todoList.ts";
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
 * already passed.
 *
 * "הסדר של המשימות צריך לעקוב אחרי הזמן ... [ו]סדר המשימות בטו דו
 * ליסט" (floating-overlay/Task-LIVE/"current task" sync task):
 * broadened to read through resolveCurrentTaskStateWithTodoSuggestion
 * (the EXACT SAME decision data/taskCubeData.ts's resolveTaskCubeData
 * already makes for the "המשימות שלי" cube), so a fixed task whose own
 * clock window has already started -- but has no TaskTimerRun yet --
 * is shown here too, never silently skipped past (the bug this fixes:
 * the floating overlay's idle panel and Task LIVE's own "הבאה" row
 * used to show nothing, or the task AFTER the due one, for exactly
 * this case).
 *
 * Priority is current -> overdue -> a To-Do item that FITS in the free
 * gap before the next fixed task -> the next fixed task itself ->
 * null. Deliberately NOT `resolveMostUrgentScheduledEntry(withSuggestion)`
 * first: that helper's own `next` fallback is a fixed task later today,
 * and checking it before the To-Do suggestion would make the To-Do
 * fallback below dead code on almost every real day (any day with ANY
 * fixed task after now already makes `next` non-null) -- exactly the
 * bug a trainee reported: a To-Do item that fits in today's free time
 * before lunch never got a chance to surface, lunch's own fixed entry
 * always won first. The To-Do suggestion is only honored when its own
 * `reason` is "fits" or "split_suggested" (genuinely actionable in the
 * current gap) -- "top_priority_does_not_fit"/"no_todo_items" still
 * carry a non-null `entry` field (arc/todoList.ts's own
 * resolveRecommendedTodoAction last branch) but mean nothing fits, so
 * those fall through to the next fixed task instead, same as if there
 * were no To-Do items at all. `isOverdue` is true only for a genuinely
 * overdue fixed entry; both a due-now/upcoming fixed task and a To-Do
 * suggestion (which has no fixed clock window to be late against) are
 * never overdue.
 *
 * Task sync fix (floating-timer/next-task desync): `activeRun` is real,
 * caller-supplied state (never hardcoded null) -- the exact same
 * requirement resolveMostUrgentScheduledTask below already has.
 * Without it, resolveCurrentTaskState's own `isActiveTaskStillCurrent`
 * check has nothing to cross-reference, so a DIFFERENT task's leftover
 * stale `status === "active"` field (an earlier start whose
 * TaskTimerRun was later cleared without the status being reset) wins
 * the `current` slot regardless of its own clock window, and gets
 * returned here under THIS function's own "next task" contract --
 * exactly the bug where the floating overlay's "next" line, the home
 * cube's "next" row, and the transition notification all showed an
 * identical, genuinely-irrelevant task scheduled hours in the future,
 * while Task LIVE's own primary title (read directly from the real run)
 * stayed correct. Passing the real run lets isActiveTaskStillCurrent
 * defer that stale task to the ordinary clock-window check instead,
 * same as every other candidate.
 */
export interface NextScheduledTaskDisplay {
  task: Task;
  effectiveStartTime: string | null;
  isOverdue: boolean;
}

export async function resolveNextScheduledTaskDisplay(
  activeTaskId: string | null,
  now: Date = new Date(),
  activeRun: TaskTimerRun | null = null
): Promise<NextScheduledTaskDisplay | null> {
  const [scheduled, tasks] = await Promise.all([resolveTodaysScheduledPlan(now), loadTasks()]);
  const dateLocal = todayLocalDateString(now);
  const todoEntries = resolveTodoList(tasks, dateLocal);
  const withSuggestion = resolveCurrentTaskStateWithTodoSuggestion(scheduled, todoEntries, now, activeRun, activeTaskId);
  if (withSuggestion.current) {
    return { task: withSuggestion.current.task, effectiveStartTime: withSuggestion.current.effectiveStartTime, isOverdue: false };
  }
  const overdue = withSuggestion.overdue[0] ?? null;
  if (overdue) {
    return { task: overdue.task, effectiveStartTime: overdue.effectiveStartTime, isOverdue: true };
  }
  const suggestion = withSuggestion.todoSuggestion;
  if (suggestion?.entry && (suggestion.reason === "fits" || suggestion.reason === "split_suggested")) {
    return { task: suggestion.entry.task, effectiveStartTime: null, isOverdue: false };
  }
  if (withSuggestion.next) {
    return { task: withSuggestion.next.task, effectiveStartTime: withSuggestion.next.effectiveStartTime, isOverdue: false };
  }
  return null;
}

/**
 * ARC Reminders task: the (current, next) PAIR the task-transition
 * notification needs (data/taskTransitionNotification.ts) -- built
 * through the EXACT SAME priority chain resolveNextScheduledTaskDisplay
 * above already uses (current -> overdue -> a fitting To-Do item ->
 * the next fixed task -> null), just returning both halves instead of
 * collapsing them into one display entry. `next` is always
 * `withSuggestion.next` (the next FIXED task today) regardless of
 * whether `current` itself came from a fixed entry or a To-Do
 * suggestion -- there is no well-defined "second To-Do item" concept
 * here, and the fixed task after a To-Do item is still the right
 * "and after that" answer for the transition mantra.
 *
 * Task sync fix: `activeRun` is real, caller-supplied state (never
 * hardcoded null) -- same reasoning as resolveNextScheduledTaskDisplay
 * above.
 */
export async function resolveCurrentAndNextTaskForTransition(
  excludeTaskId: string | null,
  now: Date = new Date(),
  activeRun: TaskTimerRun | null = null
): Promise<{ current: Task | null; next: Task | null }> {
  const [scheduled, tasks] = await Promise.all([resolveTodaysScheduledPlan(now), loadTasks()]);
  const dateLocal = todayLocalDateString(now);
  const todoEntries = resolveTodoList(tasks, dateLocal);
  const withSuggestion = resolveCurrentTaskStateWithTodoSuggestion(scheduled, todoEntries, now, activeRun, excludeTaskId);
  const next = withSuggestion.next?.task ?? null;
  if (withSuggestion.current) return { current: withSuggestion.current.task, next };
  const overdue = withSuggestion.overdue[0] ?? null;
  if (overdue) return { current: overdue.task, next };
  const suggestion = withSuggestion.todoSuggestion;
  if (suggestion?.entry && (suggestion.reason === "fits" || suggestion.reason === "split_suggested")) {
    return { current: suggestion.entry.task, next };
  }
  if (withSuggestion.next) return { current: withSuggestion.next.task, next: null };
  return { current: null, next: null };
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
