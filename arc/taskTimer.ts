/**
 * arc/taskTimer.ts
 *
 * Hebrew BUILD/LIVE rework spec, page 4 ("הפעלת טיימר"): a per-task
 * timer that stays accurate across backgrounding (computed from real
 * timestamps, never an interval/tick counter -- mirrors
 * arc/actionTimer.ts's own getActionTimerStatusFromStartedAt
 * philosophy exactly), with explicit pause/resume support ARC's own
 * internal action timer never needed (ARC's beneficial-action timer
 * runs straight through once started; a task's own timer must survive
 * "אפשר השהיה, המשך וסיום מוקדם" -- pause, resume, and an early
 * finish).
 *
 * Elapsed time while paused never advances -- `accumulatedPauseSeconds`
 * freezes the running total the moment a pause begins, and resume
 * folds the just-finished pause's own real duration into it, so the
 * timer is exactly as accurate coming out of a pause as it is coming
 * out of the app being backgrounded (both are "time passed that must
 * not count").
 *
 * Deliberately its own module, never extending data/storage.ts's
 * existing TimerRun/TimerType (that is a singleton-per-fixed-type
 * union of exactly 7 ARC-internal timer kinds -- adding an 8th
 * "task" entry would conflate two genuinely different systems; see
 * data/storage.ts's own TaskTimerRun CRUD for this module's sibling
 * persistence, kept completely separate).
 */

import { todayLocalDateString } from "../program/dateUtils.ts";

export interface TaskTimerRun {
  taskId: string;
  runId: string;
  /** ISO timestamp -- the one anchor every elapsed-time read is computed from. */
  startedAt: string;
  durationMinutes: number;
  /** ISO timestamp of the current pause, or null while running. */
  pausedAt: string | null;
  /** Total real seconds already spent paused across every previous pause/resume cycle this run -- excluded from elapsed time. */
  accumulatedPauseSeconds: number;
  notificationId: string | null;
  /** Set once the trainee finishes early, or once the timer naturally completes and that completion has been acknowledged. */
  completedAt: string | null;
  /**
   * Productivity roadmap, Stage J: disambiguates the ONE single-slot
   * TaskTimerRun persisted in data/storage.ts (loadTaskTimerRun/
   * saveTaskTimerRun) between the main task timer ("task", the
   * default -- see the `?? "task"` fallback every reader uses, so an
   * already-persisted run from before this field existed is never
   * misread) and the end-of-timer "I need rest" sub-timer ("rest").
   * They are never both in flight at once (the main run is always
   * cleared before a rest run is saved), so reusing the single slot --
   * rather than adding a second storage key -- is exactly the "no new
   * incompatible store" instruction applied to an already-sequential
   * pair of timers. This is what makes the rest timer survive
   * backgrounding/app-restart exactly like the main timer always has.
   */
  kind: "task" | "rest";
}

export function createTaskTimerRun(taskId: string, runId: string, durationMinutes: number, now: string, kind: "task" | "rest" = "task"): TaskTimerRun {
  return { taskId, runId, startedAt: now, durationMinutes, pausedAt: null, accumulatedPauseSeconds: 0, notificationId: null, completedAt: null, kind };
}

/**
 * Critical-bug task ("Startup Popups Still Not Working After Modal
 * Fix"): the single-slot TaskTimerRun is only ever explicitly cleared
 * on an in-app exit path (finish early, complete, postpone --
 * live/ActiveTaskScreen.tsx/live/PostponementScreen.tsx) -- there is no
 * handler for the trainee backgrounding/force-stopping the app, or the
 * OS killing it, while a timer is running. That leaves a genuinely
 * ABANDONED run sitting in storage forever, and
 * live/DailyStartupSequenceOverlay.tsx's own "don't interrupt an active
 * task" gate was treating ANY persisted run as still active -- so one
 * stale run, from any earlier day, silently suppressed BOTH startup
 * popups on every single cold start afterward, forever, regardless of
 * any UI/presentation fix. A run only counts as genuinely active when
 * it is NOT already completed/acknowledged (completedAt still null) AND
 * it was actually started TODAY -- a run abandoned on an earlier day is
 * stale, never still "active" for the purposes of blocking a brand new
 * day's startup sequence. Exported so the overlay (and its own tests)
 * read this exact rule rather than re-deriving a second one.
 */
export function isTaskTimerRunStale(run: TaskTimerRun, now: Date): boolean {
  if (run.completedAt !== null) return true;
  return todayLocalDateString(new Date(run.startedAt)) !== todayLocalDateString(now);
}

export interface TaskTimerStatus {
  elapsedSeconds: number;
  remainingSeconds: number;
  complete: boolean;
  paused: boolean;
}

/** Every read recomputes fully from `now` -- no counter, no accumulation of tick deltas, so backgrounding for any length of time never desyncs the displayed remaining time. */
export function getTaskTimerStatus(run: TaskTimerRun, now: number = Date.now()): TaskTimerStatus {
  const startedMs = new Date(run.startedAt).getTime();
  const currentPauseSeconds = run.pausedAt ? Math.max(0, (now - new Date(run.pausedAt).getTime()) / 1000) : 0;
  const elapsedSeconds = Math.max(0, (now - startedMs) / 1000 - run.accumulatedPauseSeconds - currentPauseSeconds);
  const totalSeconds = run.durationMinutes * 60;
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
  const paused = run.pausedAt !== null;
  return { elapsedSeconds, remainingSeconds, complete: !paused && elapsedSeconds >= totalSeconds, paused };
}

/** No-op if already paused -- never double-counts a pause gap. */
export function pauseTaskTimerRun(run: TaskTimerRun, now: string): TaskTimerRun {
  if (run.pausedAt !== null) return run;
  return { ...run, pausedAt: now };
}

/** No-op if not currently paused. Folds the just-finished pause's own real duration into accumulatedPauseSeconds, never estimated. */
export function resumeTaskTimerRun(run: TaskTimerRun, now: string): TaskTimerRun {
  if (run.pausedAt === null) return run;
  const pauseDurationSeconds = Math.max(0, (new Date(now).getTime() - new Date(run.pausedAt).getTime()) / 1000);
  return { ...run, pausedAt: null, accumulatedPauseSeconds: run.accumulatedPauseSeconds + pauseDurationSeconds };
}

/** "סיום מוקדם" -- finishing before the timer would naturally complete. Idempotent: calling it again on an already-finished run leaves completedAt at its original value. */
export function finishTaskTimerRunEarly(run: TaskTimerRun, now: string): TaskTimerRun {
  if (run.completedAt !== null) return run;
  return { ...run, completedAt: now };
}

export function generateTaskTimerRunId(): string {
  return `task-timer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Smart Alarm Conflict Management task, requirement 3 ("critical"):
 * the ONE authoritative, persisted-state predicate every conflict
 * check (both the alarm-delivery boundary in data/taskAlarm.ts and the
 * Task LIVE/Details UI) must read -- never temporary React component
 * state, which a killed/backgrounded app or a cold alarm delivery
 * would never see. `run` genuinely occupies the "one active task" slot
 * for any OTHER task as long as it exists, isn't completed, and isn't
 * stale -- covering running, paused (pausedAt set), AND resting
 * (kind: "rest", still the same taskId's own context) alike, since
 * none of those states ever clear this single-slot run.
 */
export function isAnotherTaskActive(run: TaskTimerRun | null, excludeTaskId: string, now: Date): boolean {
  if (!run) return false;
  if (run.taskId === excludeTaskId) return false;
  if (run.completedAt !== null) return false;
  if (isTaskTimerRunStale(run, now)) return false;
  return true;
}

/**
 * Task Shortening/Rescheduling UI, option A ("Shorten the current
 * task"): changes ONLY the run's own total duration -- startedAt,
 * pausedAt and accumulatedPauseSeconds (the three fields
 * getTaskTimerStatus's elapsed-time math actually depends on) are left
 * untouched, so already-elapsed time is never reset. remainingSeconds
 * simply becomes whatever getTaskTimerStatus computes from the new,
 * smaller total -- including possibly <= 0 (the caller's own job to
 * confirm with the trainee before calling this when that's the case,
 * per the spec's "require explicit user decision if the new end time
 * has already passed").
 */
export function shortenTaskTimerRun(run: TaskTimerRun, newDurationMinutes: number): TaskTimerRun {
  return { ...run, durationMinutes: newDurationMinutes };
}
