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
