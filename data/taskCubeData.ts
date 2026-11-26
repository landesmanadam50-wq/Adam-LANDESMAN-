/**
 * data/taskCubeData.ts
 *
 * ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry "Cubes"
 * task, section 5: the ONE data-resolution function behind the shared
 * "המשימות שלי" cube on BOTH the home screen (build/FlexibleDailyScreen.tsx)
 * and the app's entry sequence (live/DailyStartupSequenceOverlay.tsx) --
 * built entirely from pre-existing pieces (resolveTodaysScheduledPlan,
 * arc/todoList.ts's resolveTodoList/resolveEffectiveTodoOrder/
 * resolveCurrentTaskStateWithTodoSuggestion, arc/dailyPlan.ts's own
 * resolveMostUrgentScheduledEntry -- the SyncFix task's own "current
 * task" precedent, see live/ActiveTaskScreen.tsx/PersistentTaskControls.tsx/
 * PostTaskRewardScreen.tsx/ManifestMeditationScreen.tsx), never a new
 * scheduling computation of its own. Both cubes calling this exact
 * same function is what makes "שתי הקוביות בשני המסכים מציגות את אותו
 * מצב משימות" true by construction.
 */
import { resolveCurrentTaskState, resolveMostUrgentScheduledEntry } from "../arc/dailyPlan.ts";
import type { ScheduledPlanEntry } from "../arc/dailyPlan.ts";
import { resolveCurrentTaskStateWithTodoSuggestion, resolveEffectiveTodoOrder, resolveTodoList } from "../arc/todoList.ts";
import type { TodoPlanEntry, TodoSuggestion } from "../arc/todoList.ts";
import type { TaskTimerRun } from "../arc/taskTimer.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";
import { loadTaskTimerRun, loadTasks } from "./storage.ts";
import { resolveNextScheduledTaskDisplay, resolveTodaysScheduledPlan } from "./dailyPlan.ts";
import type { NextScheduledTaskDisplay } from "./dailyPlan.ts";

export interface TaskCubeData {
  /** The scheduled (fixed/weekly) task to show as "current," already
   * folded through the SyncFix's own resolveMostUrgentScheduledEntry
   * (current, else the first overdue entry, else next) -- null only
   * when nothing fixed is due/overdue/upcoming at all. */
  current: ScheduledPlanEntry | null;
  /** Set ONLY when `current` is null -- a scheduled/overdue task always wins over a To-Do suggestion, never shown together. */
  todoSuggestion: TodoSuggestion | null;
  /**
   * The "המשימה הבאה" row's own answer -- resolved through the EXACT
   * SAME resolveNextScheduledTaskDisplay(current.task.id, now) pipeline
   * Task LIVE's own "הבאה" row and the floating-timer overlay's
   * next-task field already use, so this cube can never disagree with
   * either of them. Deliberately NOT "the next fixed entry" -- a To-Do
   * item woven into the free gap right after `current` (arc/todoList.ts's
   * own resolveWovenDaySections priority order) surfaces here too, same
   * as it already did for Task LIVE and the overlay. null whenever
   * `current` itself is null -- in that case nothing fixed remains
   * today at all, so there is no well-defined "and after that" either
   * (a To-Do suggestion for THAT slot already occupies `todoSuggestion`
   * above, never duplicated here).
   */
  next: NextScheduledTaskDisplay | null;
  /** The real, persisted work-timer run for the current task, if any (kind !== "rest") -- null while nothing has been started yet. */
  activeRun: TaskTimerRun | null;
  /** The real, persisted break/rest run, if any -- non-null only while on a break. */
  restRun: TaskTimerRun | null;
  /** Today's full task list for the "Tasks" row's expand -- already excludes removed/archived/completed entries and never-placed bank items, by construction of resolveTodaysScheduledPlan/resolveTodoList themselves. */
  combinedTasksList: { scheduled: ScheduledPlanEntry[]; todo: TodoPlanEntry[] };
}

export async function resolveTaskCubeData(now: Date = new Date()): Promise<TaskCubeData> {
  const [scheduled, tasks, run] = await Promise.all([resolveTodaysScheduledPlan(now), loadTasks(), loadTaskTimerRun()]);
  const activeRun = run && run.kind !== "rest" ? run : null;
  const restRun = run && run.kind === "rest" ? run : null;
  const dateLocal = todayLocalDateString(now);
  const todoEntries = resolveTodoList(tasks, dateLocal);
  const withSuggestion = resolveCurrentTaskStateWithTodoSuggestion(scheduled, todoEntries, now, activeRun, null);
  const state = resolveCurrentTaskState(scheduled, now, activeRun, null);
  const current = resolveMostUrgentScheduledEntry(state);
  const next = current ? await resolveNextScheduledTaskDisplay(current.task.id, now, activeRun) : null;

  return {
    current,
    // A scheduled/overdue/next entry already resolved as `current`
    // always wins -- the To-Do suggestion only ever surfaces when
    // nothing fixed is due at all, matching resolveCurrentTaskStateWithTodoSuggestion's
    // own contract (it computes a suggestion exactly when the STRICT
    // current is null, before the urgent-entry fallback above applies).
    todoSuggestion: current === null ? withSuggestion.todoSuggestion : null,
    next,
    activeRun,
    restRun,
    combinedTasksList: { scheduled, todo: resolveEffectiveTodoOrder(todoEntries) },
  };
}
