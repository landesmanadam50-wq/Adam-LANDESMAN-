import test from "node:test";
import assert from "node:assert/strict";

import { resolveFloatingTimerOverlayPayload, resolveIdleFloatingOverlayPayload } from "./floatingTimerOverlayPayload.ts";
import { createTaskTimerRun, finishTaskTimerRunEarly, pauseTaskTimerRun } from "./taskTimer.ts";
import { createEmptyTask } from "./tasks.ts";
import { createTaskActionStage } from "./taskStage.ts";
import { createTaskStageProgress } from "./taskStageProgress.ts";

const NOW_ISO = "2026-01-05T09:00:00.000Z";
const NOW_MS = new Date(NOW_ISO).getTime();
const task = createEmptyTask("t1", "לכתוב דוח", "לפתוח את המחשב", NOW_ISO);

test("a freshly-started run reports the full duration remaining, running (not paused), overlay flag passed through verbatim", () => {
  const run = createTaskTimerRun(task.id, "run1", 25, NOW_ISO);
  const payload = resolveFloatingTimerOverlayPayload(run, task, true, null, NOW_MS);
  assert.equal(payload.taskId, task.id);
  assert.equal(payload.title, task.title);
  assert.equal(payload.remainingSeconds, 25 * 60);
  assert.equal(payload.paused, false);
  assert.equal(payload.overlayEnabled, true);
});

test("a paused run reports its frozen remaining time and paused: true", () => {
  const run = createTaskTimerRun(task.id, "run1", 25, NOW_ISO);
  const pausedAt = new Date(NOW_MS + 5 * 60 * 1000).toISOString();
  const paused = pauseTaskTimerRun(run, pausedAt);
  const payload = resolveFloatingTimerOverlayPayload(paused, task, true, null, NOW_MS + 10 * 60 * 1000);
  assert.equal(payload.paused, true);
  assert.equal(payload.remainingSeconds, 20 * 60, "elapsed time while paused must never advance the shown remaining time");
});

test("a run that naturally reached zero reports remainingSeconds: 0, never a negative value", () => {
  const run = createTaskTimerRun(task.id, "run1", 25, NOW_ISO);
  const payload = resolveFloatingTimerOverlayPayload(run, task, true, null, NOW_MS + 40 * 60 * 1000);
  assert.equal(payload.remainingSeconds, 0);
});

// Critical fix within this task: getTaskTimerStatus's own `complete`
// flag alone is false for a run finished EARLY (elapsedSeconds is still
// below totalSeconds) -- without checking completedAt too, the overlay
// would keep showing a stale mid-run countdown instead of 00:00.
test("a run finished EARLY (finishTaskTimerRunEarly) reports remainingSeconds: 0 immediately, even though its own elapsed time is still well under the full duration", () => {
  const run = createTaskTimerRun(task.id, "run1", 25, NOW_ISO);
  const finishedAt = new Date(NOW_MS + 2 * 60 * 1000).toISOString();
  const finished = finishTaskTimerRunEarly(run, finishedAt);
  const payload = resolveFloatingTimerOverlayPayload(finished, task, true, null, NOW_MS + 2 * 60 * 1000);
  assert.equal(payload.remainingSeconds, 0);
  assert.equal(payload.paused, false, "finishing early is an ended state, not a paused one");
});

test("overlayEnabled is passed through unchanged in both directions", () => {
  const run = createTaskTimerRun(task.id, "run1", 25, NOW_ISO);
  assert.equal(resolveFloatingTimerOverlayPayload(run, task, false, null, NOW_MS).overlayEnabled, false);
  assert.equal(resolveFloatingTimerOverlayPayload(run, task, true, null, NOW_MS).overlayEnabled, true);
});

// --- Unified Task Stages task: stage-aware overlay fields ---

test("with no stageProgress (legacy task, or a rest timer), actionTitle falls back to the plain task title, nextActionTitle is null, and the ✓ button is never shown", () => {
  const run = createTaskTimerRun(task.id, "run1", 25, NOW_ISO);
  const payload = resolveFloatingTimerOverlayPayload(run, task, true, null, NOW_MS);
  assert.equal(payload.actionTitle, task.title);
  assert.equal(payload.nextActionTitle, null);
  assert.equal(payload.showCompleteButton, false);
});

test("with a staged task's own stageProgress, actionTitle is the ACTIVE stage's description, nextActionTitle is the following stage's description, and the ✓ button is shown", () => {
  const stagedTask = {
    ...task,
    actionStages: [
      createTaskActionStage("s-trigger", "trigger", "לוקח את הספר ומניח אותו על השולחן", 2),
      createTaskActionStage("s-small", "small", "פותח את הספר וקורא פסקה אחת", 3),
      createTaskActionStage("s-main", "main", "ממשיך לקרוא את הספר", 25),
    ],
  };
  const run = createTaskTimerRun(stagedTask.id, "run1", 2, NOW_ISO);
  const progress = createTaskStageProgress(stagedTask.id, "s-trigger");
  const payload = resolveFloatingTimerOverlayPayload(run, stagedTask, true, progress, NOW_MS);
  assert.equal(payload.actionTitle, "לוקח את הספר ומניח אותו על השולחן");
  assert.equal(payload.nextActionTitle, "פותח את הספר וקורא פסקה אחת");
  assert.equal(payload.showCompleteButton, true);
  // The notification's own title is still always the task's name, unchanged.
  assert.equal(payload.title, stagedTask.title);
});

test("on the FINAL (main) stage, nextActionTitle is null -- there is nothing after it", () => {
  const stagedTask = { ...task, actionStages: [createTaskActionStage("s-main", "main", "ממשיך לקרוא את הספר", 25)] };
  const run = createTaskTimerRun(stagedTask.id, "run1", 25, NOW_ISO);
  const progress = createTaskStageProgress(stagedTask.id, "s-main");
  const payload = resolveFloatingTimerOverlayPayload(run, stagedTask, true, progress, NOW_MS);
  assert.equal(payload.actionTitle, "ממשיך לקרוא את הספר");
  assert.equal(payload.nextActionTitle, null);
  assert.equal(payload.showCompleteButton, true);
});

// --- Lock-Screen Timer, Next-Task Schedule and Smart Alarm Conflict Management task ---

test("test 3: resting is true only for a 'rest' kind run, never for the plain task timer, running or paused alike", () => {
  const taskRun = createTaskTimerRun(task.id, "run1", 25, NOW_ISO);
  assert.equal(resolveFloatingTimerOverlayPayload(taskRun, task, true, null, NOW_MS).resting, false);

  const restRun = createTaskTimerRun(task.id, "run2", 5, NOW_ISO, "rest");
  assert.equal(resolveFloatingTimerOverlayPayload(restRun, task, true, null, NOW_MS).resting, true);

  const pausedTaskRun = pauseTaskTimerRun(taskRun, new Date(NOW_MS + 60_000).toISOString());
  assert.equal(resolveFloatingTimerOverlayPayload(pausedTaskRun, task, true, null, NOW_MS + 120_000).resting, false, "a paused task timer is 'paused', never 'resting'");
});

test("test 4: nextScheduledTaskTitle/Time are null when no next task is passed, and passed through verbatim when one is", () => {
  const run = createTaskTimerRun(task.id, "run1", 25, NOW_ISO);
  const withoutNext = resolveFloatingTimerOverlayPayload(run, task, true, null, NOW_MS);
  assert.equal(withoutNext.nextScheduledTaskTitle, null);
  assert.equal(withoutNext.nextScheduledTaskTime, null);

  const withNext = resolveFloatingTimerOverlayPayload(run, task, true, null, NOW_MS, { title: "להתאמן", effectiveStartTime: "16:30" });
  assert.equal(withNext.nextScheduledTaskTitle, "להתאמן");
  assert.equal(withNext.nextScheduledTaskTime, "16:30");
});

// --- ARCHI -- Unified Floating Overlay & Mini ARC Improvements task ---

test("nextScheduledTaskDurationMinutes is null when there's no next task, null when the next task is passed without a durationMinutes, and passed through verbatim when one is", () => {
  const run = createTaskTimerRun(task.id, "run1", 25, NOW_ISO);
  const withoutNext = resolveFloatingTimerOverlayPayload(run, task, true, null, NOW_MS);
  assert.equal(withoutNext.nextScheduledTaskDurationMinutes, null);

  const withNextNoDuration = resolveFloatingTimerOverlayPayload(run, task, true, null, NOW_MS, { title: "להתאמן", effectiveStartTime: "16:30" });
  assert.equal(withNextNoDuration.nextScheduledTaskDurationMinutes, null);

  const withNextDuration = resolveFloatingTimerOverlayPayload(run, task, true, null, NOW_MS, { title: "להתאמן", effectiveStartTime: "16:30", durationMinutes: 45 });
  assert.equal(withNextDuration.nextScheduledTaskDurationMinutes, 45);
});

test("resolveIdleFloatingOverlayPayload: taskId is the empty-string 'no current task' sentinel, remainingSeconds/paused/resting/showCompleteButton are all the inert idle defaults, and overlayEnabled is passed through verbatim", () => {
  const idleOff = resolveIdleFloatingOverlayPayload(false);
  assert.equal(idleOff.taskId, "");
  assert.equal(idleOff.title, "");
  assert.equal(idleOff.remainingSeconds, 0);
  assert.equal(idleOff.paused, false);
  assert.equal(idleOff.resting, false);
  assert.equal(idleOff.showCompleteButton, false);
  assert.equal(idleOff.actionTitle, "");
  assert.equal(idleOff.nextActionTitle, null);
  assert.equal(idleOff.overlayEnabled, false);

  const idleOn = resolveIdleFloatingOverlayPayload(true);
  assert.equal(idleOn.overlayEnabled, true);
});

test("resolveIdleFloatingOverlayPayload: with no next task, all three next-scheduled-task fields are null -- 'no upcoming task handled safely' (scenario 13); with one, title/time/durationMinutes are passed through exactly like the active-task payload", () => {
  const idleWithoutNext = resolveIdleFloatingOverlayPayload(true, null);
  assert.equal(idleWithoutNext.nextScheduledTaskTitle, null);
  assert.equal(idleWithoutNext.nextScheduledTaskTime, null);
  assert.equal(idleWithoutNext.nextScheduledTaskDurationMinutes, null);

  const idleWithNext = resolveIdleFloatingOverlayPayload(true, { title: "לכתוב דוח", effectiveStartTime: "09:00", durationMinutes: 30 });
  assert.equal(idleWithNext.nextScheduledTaskTitle, "לכתוב דוח");
  assert.equal(idleWithNext.nextScheduledTaskTime, "09:00");
  assert.equal(idleWithNext.nextScheduledTaskDurationMinutes, 30);
});

// --- ARCHI -- Home-Screen Widget Sync task, section 4 ---

test("nextScheduledTaskIsOverdue defaults to false with no next task, false when the next task is passed without isOverdue, and passed through verbatim when one is -- for both the active and idle payload builders", () => {
  const run = createTaskTimerRun(task.id, "run1", 25, NOW_ISO);
  assert.equal(resolveFloatingTimerOverlayPayload(run, task, true, null, NOW_MS).nextScheduledTaskIsOverdue, false);
  assert.equal(
    resolveFloatingTimerOverlayPayload(run, task, true, null, NOW_MS, { title: "להתאמן", effectiveStartTime: "16:30" }).nextScheduledTaskIsOverdue,
    false
  );
  assert.equal(
    resolveFloatingTimerOverlayPayload(run, task, true, null, NOW_MS, { title: "להתאמן", effectiveStartTime: "16:30", isOverdue: true }).nextScheduledTaskIsOverdue,
    true
  );

  assert.equal(resolveIdleFloatingOverlayPayload(true).nextScheduledTaskIsOverdue, false);
  assert.equal(resolveIdleFloatingOverlayPayload(true, { title: "להתאמן", effectiveStartTime: "16:30", isOverdue: true }).nextScheduledTaskIsOverdue, true);
});
