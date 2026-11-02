import test from "node:test";
import assert from "node:assert/strict";
import {
  createTaskTimerRun,
  finishTaskTimerRunEarly,
  generateTaskTimerRunId,
  getTaskTimerStatus,
  pauseTaskTimerRun,
  resumeTaskTimerRun,
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

test("generateTaskTimerRunId produces distinct, correctly-prefixed ids", () => {
  const ids = new Set(Array.from({ length: 20 }, () => generateTaskTimerRunId()));
  assert.equal(ids.size, 20);
  for (const id of ids) assert.match(id, /^task-timer-/);
});
