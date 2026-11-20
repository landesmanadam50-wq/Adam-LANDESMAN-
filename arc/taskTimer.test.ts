import test from "node:test";
import assert from "node:assert/strict";
import {
  createTaskTimerRun,
  finishTaskTimerRunEarly,
  generateTaskTimerRunId,
  getTaskTimerStatus,
  isAnotherTaskActive,
  isTaskTimerRunStale,
  pauseTaskTimerRun,
  resumeTaskTimerRun,
  shortenTaskTimerRun,
} from "./taskTimer.ts";

const START = "2026-09-26T12:00:00.000Z";
const startedMs = new Date(START).getTime();

test("createTaskTimerRun starts running (not paused), not completed, and defaults to kind 'task'", () => {
  const run = createTaskTimerRun("task-1", "run-1", 10, START);
  assert.equal(run.pausedAt, null);
  assert.equal(run.accumulatedPauseSeconds, 0);
  assert.equal(run.completedAt, null);
  assert.equal(run.durationMinutes, 10);
  assert.equal(run.kind, "task");
});

test("createTaskTimerRun accepts an explicit 'rest' kind -- Stage J's rest sub-timer, persisted through the exact same single storage slot", () => {
  const rest = createTaskTimerRun("task-1", "run-2", 5, START, "rest");
  assert.equal(rest.kind, "rest");
});

// --- Critical-bug task ("Startup Popups Still Not Working After Modal Fix"): isTaskTimerRunStale ---

test("isTaskTimerRunStale is false for a genuinely in-progress run started earlier TODAY", () => {
  const run = createTaskTimerRun("task-1", "run-1", 30, "2026-11-10T07:00:00.000Z");
  assert.equal(isTaskTimerRunStale(run, new Date("2026-11-10T08:00:00.000Z")), false);
});

test("isTaskTimerRunStale is true once the run is completed, even if that happened today -- an acknowledged/finished run is never still 'active'", () => {
  const run = { ...createTaskTimerRun("task-1", "run-1", 30, "2026-11-10T07:00:00.000Z"), completedAt: "2026-11-10T07:35:00.000Z" };
  assert.equal(isTaskTimerRunStale(run, new Date("2026-11-10T08:00:00.000Z")), true);
});

test("isTaskTimerRunStale is true for a run started on an EARLIER calendar day and never cleared -- this is the actual bug: backgrounding/force-stopping/an OS kill mid-run leaves no explicit cleanup, so an abandoned run from a previous day must never block today's startup sequence forever", () => {
  const run = createTaskTimerRun("task-1", "run-1", 30, "2026-11-08T07:00:00.000Z");
  assert.equal(isTaskTimerRunStale(run, new Date("2026-11-10T08:00:00.000Z")), true);
});

test("isTaskTimerRunStale is false for a run started earlier today even while paused -- a trainee who paused and stepped away for a few minutes is still genuinely mid-session", () => {
  const run = pauseTaskTimerRun(createTaskTimerRun("task-1", "run-1", 30, "2026-11-10T07:00:00.000Z"), "2026-11-10T07:10:00.000Z");
  assert.equal(isTaskTimerRunStale(run, new Date("2026-11-10T08:00:00.000Z")), false);
});

test("getTaskTimerStatus computes elapsed/remaining purely from timestamps -- never an accumulated tick counter", () => {
  const run = createTaskTimerRun("task-1", "run-1", 10, START);
  const status = getTaskTimerStatus(run, startedMs + 120_000); // 2 minutes later
  assert.equal(status.elapsedSeconds, 120);
  assert.equal(status.remainingSeconds, 480); // 10min - 2min = 8min = 480s
  assert.equal(status.complete, false);
  assert.equal(status.paused, false);
});

test("getTaskTimerStatus reports complete once elapsed reaches the full duration", () => {
  const run = createTaskTimerRun("task-1", "run-1", 1, START); // 1 minute
  const status = getTaskTimerStatus(run, startedMs + 90_000); // 90s elapsed, well past 60s
  assert.equal(status.complete, true);
  assert.equal(status.remainingSeconds, 0);
});

test("time spent backgrounded is still counted accurately -- a status read long after start, with no intermediate reads, computes the exact same result as if read continuously", () => {
  const run = createTaskTimerRun("task-1", "run-1", 5, START);
  const immediately = getTaskTimerStatus(run, startedMs + 1000);
  const afterLongBackground = getTaskTimerStatus(run, startedMs + 200_000);
  assert.equal(immediately.elapsedSeconds, 1);
  assert.equal(afterLongBackground.elapsedSeconds, 200);
});

test("pauseTaskTimerRun freezes elapsed time -- remaining time never decreases while paused, regardless of how much real time passes", () => {
  const run = createTaskTimerRun("task-1", "run-1", 10, START);
  const paused = pauseTaskTimerRun(run, new Date(startedMs + 60_000).toISOString()); // paused after 1 minute
  const statusRightAfterPause = getTaskTimerStatus(paused, startedMs + 60_000);
  const statusMuchLater = getTaskTimerStatus(paused, startedMs + 600_000); // 10 real minutes later, still paused
  assert.equal(statusRightAfterPause.elapsedSeconds, 60);
  assert.equal(statusMuchLater.elapsedSeconds, 60, "elapsed time must not advance while paused, no matter how long the pause lasts");
  assert.equal(statusMuchLater.paused, true);
});

test("pauseTaskTimerRun is a no-op when already paused -- never double-freezes or shifts the pause anchor", () => {
  const run = createTaskTimerRun("task-1", "run-1", 10, START);
  const firstPause = pauseTaskTimerRun(run, new Date(startedMs + 60_000).toISOString());
  const secondPauseAttempt = pauseTaskTimerRun(firstPause, new Date(startedMs + 120_000).toISOString());
  assert.equal(secondPauseAttempt.pausedAt, firstPause.pausedAt);
});

test("resumeTaskTimerRun folds the real pause duration into accumulatedPauseSeconds, and elapsed time continues correctly afterward", () => {
  const run = createTaskTimerRun("task-1", "run-1", 10, START);
  const paused = pauseTaskTimerRun(run, new Date(startedMs + 60_000).toISOString()); // pause at 1min
  const resumed = resumeTaskTimerRun(paused, new Date(startedMs + 360_000).toISOString()); // resume 5 minutes later (paused for 5 real minutes)
  assert.equal(resumed.pausedAt, null);
  assert.equal(resumed.accumulatedPauseSeconds, 300);

  // 1 real minute after resuming (startedMs + 360_000 + 60_000), elapsed should be 1min (before pause) + 1min (after resume) = 2 minutes = 120s.
  const statusAfterResume = getTaskTimerStatus(resumed, startedMs + 360_000 + 60_000);
  assert.equal(statusAfterResume.elapsedSeconds, 120);
  assert.equal(statusAfterResume.paused, false);
});

test("resumeTaskTimerRun is a no-op when not currently paused", () => {
  const run = createTaskTimerRun("task-1", "run-1", 10, START);
  const resumedAnyway = resumeTaskTimerRun(run, new Date(startedMs + 60_000).toISOString());
  assert.deepEqual(resumedAnyway, run);
});

test("multiple pause/resume cycles accumulate correctly -- each cycle's own real duration adds to the running total", () => {
  let run = createTaskTimerRun("task-1", "run-1", 10, START);
  run = pauseTaskTimerRun(run, new Date(startedMs + 60_000).toISOString()); // pause at 1min
  run = resumeTaskTimerRun(run, new Date(startedMs + 120_000).toISOString()); // resume after 1min paused
  assert.equal(run.accumulatedPauseSeconds, 60);
  run = pauseTaskTimerRun(run, new Date(startedMs + 180_000).toISOString()); // pause again after another 1min running
  run = resumeTaskTimerRun(run, new Date(startedMs + 300_000).toISOString()); // resume after 2min paused
  assert.equal(run.accumulatedPauseSeconds, 180, "60s (first pause) + 120s (second pause) = 180s");
});

test("finishTaskTimerRunEarly sets completedAt and is idempotent -- calling it again never overwrites the original completion time", () => {
  const run = createTaskTimerRun("task-1", "run-1", 10, START);
  const finished = finishTaskTimerRunEarly(run, new Date(startedMs + 30_000).toISOString());
  assert.equal(finished.completedAt, new Date(startedMs + 30_000).toISOString());

  const finishedAgain = finishTaskTimerRunEarly(finished, new Date(startedMs + 90_000).toISOString());
  assert.equal(finishedAgain.completedAt, finished.completedAt, "the second call must never move the completion time");
});

// --- Smart Alarm Conflict Management task: isAnotherTaskActive -----------

test("test 7/8: isAnotherTaskActive is true for a DIFFERENT task's run that is running, paused, or resting, as long as it isn't stale", () => {
  const now = new Date("2026-11-10T08:00:00.000Z");
  const running = createTaskTimerRun("task-B", "run-1", 30, "2026-11-10T07:00:00.000Z");
  assert.equal(isAnotherTaskActive(running, "task-A", now), true);

  const paused = pauseTaskTimerRun(running, "2026-11-10T07:30:00.000Z");
  assert.equal(isAnotherTaskActive(paused, "task-A", now), true, "a paused run still occupies the active-task slot");

  const resting = createTaskTimerRun("task-B", "run-2", 5, "2026-11-10T07:00:00.000Z", "rest");
  assert.equal(isAnotherTaskActive(resting, "task-A", now), true, "a rest run for task-B is still task-B's own active context, a conflict for task-A");
});

test("isAnotherTaskActive is false when there is no run, the run is for the SAME task, it's already completed, or it's stale", () => {
  const now = new Date("2026-11-10T08:00:00.000Z");
  assert.equal(isAnotherTaskActive(null, "task-A", now), false);

  const sameTask = createTaskTimerRun("task-A", "run-1", 30, "2026-11-10T07:00:00.000Z");
  assert.equal(isAnotherTaskActive(sameTask, "task-A", now), false, "a task is never a conflict with its own run");

  const completed = { ...createTaskTimerRun("task-B", "run-2", 30, "2026-11-10T07:00:00.000Z"), completedAt: "2026-11-10T07:40:00.000Z" };
  assert.equal(isAnotherTaskActive(completed, "task-A", now), false, "do not automatically re-ring/suppress for a run that has already been completed");

  const stale = createTaskTimerRun("task-B", "run-3", 30, "2026-11-08T07:00:00.000Z");
  assert.equal(isAnotherTaskActive(stale, "task-A", now), false, "an abandoned run from an earlier day can never suppress today's alarms");
});

// --- Task Shortening/Rescheduling UI, option A: shortenTaskTimerRun ------

test("test 10: shortenTaskTimerRun changes only durationMinutes -- startedAt/pausedAt/accumulatedPauseSeconds are untouched, so already-elapsed time is never reset", () => {
  const run = createTaskTimerRun("task-1", "run-1", 60, START);
  const shortened = shortenTaskTimerRun(run, 20);
  assert.equal(shortened.durationMinutes, 20);
  assert.equal(shortened.startedAt, run.startedAt);
  assert.equal(shortened.pausedAt, run.pausedAt);
  assert.equal(shortened.accumulatedPauseSeconds, run.accumulatedPauseSeconds);

  const statusBefore = getTaskTimerStatus(run, startedMs + 15 * 60_000); // 15 minutes elapsed
  const statusAfter = getTaskTimerStatus(shortened, startedMs + 15 * 60_000);
  assert.equal(statusAfter.elapsedSeconds, statusBefore.elapsedSeconds, "elapsed time is identical before and after shortening");
  assert.equal(statusAfter.remainingSeconds, 5 * 60, "20min total - 15min already elapsed = 5 minutes left");
});

test("shortenTaskTimerRun can produce an already-passed end time (remainingSeconds 0, complete true) -- the caller's own job to confirm with the trainee first, never auto-completed here", () => {
  const run = createTaskTimerRun("task-1", "run-1", 60, START);
  const shortened = shortenTaskTimerRun(run, 10);
  const status = getTaskTimerStatus(shortened, startedMs + 15 * 60_000); // 15min elapsed > 10min new total
  assert.equal(status.remainingSeconds, 0);
  assert.equal(status.complete, true);
  assert.equal(shortened.completedAt, null, "shortening itself never marks the run completed -- only the natural timerEnded state changes");
});

test("generateTaskTimerRunId produces distinct, correctly-prefixed ids", () => {
  const ids = new Set(Array.from({ length: 20 }, () => generateTaskTimerRunId()));
  assert.equal(ids.size, 20);
  for (const id of ids) assert.match(id, /^task-timer-/);
});
