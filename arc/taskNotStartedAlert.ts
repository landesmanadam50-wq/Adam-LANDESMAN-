/**
 * arc/taskNotStartedAlert.ts
 *
 * ARCHI -- Adaptive Task Execution & Emotional Persistence task, section
 * 2: the pure "has a Flexible-Daily-Schedule task's start time arrived
 * while nothing has actually been started for it" predicate, behind the
 * new persistent outside-the-app notification. Built entirely from
 * arc/dailyPlan.ts's own resolveCurrentTaskState -- the one central
 * current/overdue/next decision every other consumer in this codebase
 * already shares -- never a second, independent "what's scheduled today"
 * calculation. Uses the Flexible Daily Schedule (via the caller's own
 * resolveTodaysScheduledPlan-resolved `scheduled` array) as the single
 * source of truth, never the raw weekly routine, by construction (that
 * is exactly what `scheduled` already is for every other caller of
 * resolveCurrentTaskState in this codebase).
 */
import { resolveCurrentTaskState } from "./dailyPlan.ts";
import type { ScheduledPlanEntry } from "./dailyPlan.ts";
import type { TaskTimerRun } from "./taskTimer.ts";

/**
 * Returns the one scheduled entry whose window has started (per
 * resolveCurrentTaskState's own "current" bucket) but which has no real,
 * matching TaskTimerRun behind it yet -- null when nothing qualifies
 * (nothing current at all, or the current entry's own task is already
 * genuinely running). A task the trainee started another way (even a
 * moment ago) immediately stops qualifying, satisfying "get updated/
 * removed if the user starts the task another way."
 */
export function resolveTaskNotStartedAlert(scheduled: ScheduledPlanEntry[], now: Date, activeRun: TaskTimerRun | null): ScheduledPlanEntry | null {
  const state = resolveCurrentTaskState(scheduled, now, activeRun, null);
  if (!state.current) return null;
  const alreadyStarted = activeRun !== null && activeRun.kind !== "rest" && activeRun.taskId === state.current.task.id;
  return alreadyStarted ? null : state.current;
}
