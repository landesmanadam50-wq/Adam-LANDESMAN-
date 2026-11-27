/**
 * arc/replanTimeAlert.ts
 *
 * ARCHI -- Replan Time task: the pure "a Flexible-Daily-Schedule task's
 * FULL allocated window (start AND duration) has elapsed, with nothing
 * ever started for it" predicate, behind the new "תכנון זמן מחדש"
 * notification (data/replanTimeNotification.ts). Built entirely from
 * arc/dailyPlan.ts's own resolveCurrentTaskState -- the one central
 * current/overdue/next decision every other consumer in this codebase
 * already shares -- never a second, independent "what's overdue"
 * calculation.
 *
 * Deliberately distinct from arc/taskNotStartedAlert.ts's own
 * resolveTaskNotStartedAlert, which fires the moment a task's START
 * time arrives (its own `current` bucket) -- `current` and `overdue`
 * are disjoint per entry by construction inside resolveCurrentTaskState
 * (hasScheduledPlanEntryStarted && !hasScheduledPlanEntryWindowElapsed
 * vs. ...&& hasScheduledPlanEntryWindowElapsed), so this predicate and
 * the existing one can never both be true for the exact same task at
 * the exact same moment -- the two notifications never compete over
 * one task, by construction, with no extra coordination code needed.
 */
import { resolveCurrentTaskState } from "./dailyPlan.ts";
import type { ScheduledPlanEntry } from "./dailyPlan.ts";
import type { TaskTimerRun } from "./taskTimer.ts";

/**
 * Returns the EARLIEST entry whose full allocated window has elapsed
 * with nothing genuinely running for it -- resolveCurrentTaskState's
 * own `overdue[0]` (already excludes anything completed/archived, and
 * anything with a real, matching active run), never a second,
 * independently-sorted scan. Null when nothing today qualifies.
 */
export function resolveReplanTimeAlert(scheduled: ScheduledPlanEntry[], now: Date, activeRun: TaskTimerRun | null): ScheduledPlanEntry | null {
  return resolveCurrentTaskState(scheduled, now, activeRun, null).overdue[0] ?? null;
}
