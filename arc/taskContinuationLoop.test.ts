import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyTask } from "./tasks.ts";
import {
  enterArc,
  enterBreak,
  endTaskContinuationLoop,
  exitArcBackToLoop,
  exitBreak,
  recordSegmentEnd,
  resolveLoopHardStopMinutes,
  startNextSegment,
  startTaskContinuationLoop,
} from "./taskContinuationLoop.ts";
import type { ScheduledPlanEntry } from "./dailyPlan.ts";

const NOW = "2026-11-25T08:00:00.000Z";

function entry(taskId: string, scheduledTime: string | null, effectiveStartTime: string | null): ScheduledPlanEntry {
  return {
    task: createEmptyTask(taskId, taskId, "a", NOW),
    occurrenceDateLocal: "2026-11-25",
    origin: "oneoff",
    scheduledTime,
    expectedDurationMinutes: 30,
    timeIsManual: true,
    isModifiedForToday: false,
    isCompletedToday: false,
    effectiveStartTime,
    effectiveEndTime: null,
    hasConflict: false,
  };
}

test("startTaskContinuationLoop begins in 'working' with one open segment and zero worked seconds", () => {
  const state = startTaskContinuationLoop("task-1", NOW);
  assert.equal(state.phase, "working");
  assert.equal(state.activeTaskId, "task-1");
  assert.equal(state.segments.length, 1);
  assert.equal(state.segments[0].endedAt, null);
  assert.equal(state.totalWorkedSeconds, 0);
});

test("recordSegmentEnd closes the open segment, accumulates totalWorkedSeconds, and moves to choosing_action", () => {
  let state = startTaskContinuationLoop("task-1", NOW);
  state = recordSegmentEnd(state, 1800, "2026-11-25T08:30:00.000Z");
  assert.equal(state.phase, "choosing_action");
  assert.equal(state.totalWorkedSeconds, 1800);
  assert.notEqual(state.segments[0].endedAt, null);
});

test("already-completed work time is never lost across continue/shorten/break/ARC cycles -- totalWorkedSeconds only ever grows", () => {
  let state = startTaskContinuationLoop("task-1", NOW);
  state = recordSegmentEnd(state, 1800, NOW);
  state = startNextSegment(state, "task-1", NOW);
  state = recordSegmentEnd(state, 900, NOW);
  assert.equal(state.totalWorkedSeconds, 2700, "30 + 15 minutes of real worked seconds must both be preserved");
});

test("startNextSegment after a shrink can switch activeTaskId while the loop's own taskId (for history) stays the original", () => {
  let state = startTaskContinuationLoop("original-task", NOW);
  state = recordSegmentEnd(state, 1800, NOW);
  state = startNextSegment(state, "shrunk-child-task", NOW);
  assert.equal(state.taskId, "original-task");
  assert.equal(state.activeTaskId, "shrunk-child-task");
});

test("enterBreak/exitBreak round-trip through 'break' back to 'choosing_action', never losing the loop's own task context", () => {
  let state = startTaskContinuationLoop("task-1", NOW);
  state = recordSegmentEnd(state, 600, NOW);
  state = enterBreak(state, NOW);
  assert.equal(state.phase, "break");
  assert.equal(state.taskId, "task-1");
  state = exitBreak(state, NOW);
  assert.equal(state.phase, "choosing_action");
});

test("enterArc sets phase to 'arc' and records the track; a second enterArc call while already in 'arc' is a no-op (never two ARC sessions in parallel)", () => {
  let state = startTaskContinuationLoop("task-1", NOW);
  state = enterArc(state, "full", NOW);
  assert.equal(state.phase, "arc");
  assert.equal(state.lastArcTrack, "full");
  const second = enterArc(state, "shortened", "later");
  assert.equal(second, state, "already-in-arc must be a complete no-op, including not overwriting lastArcTrack");
});

test("exitArcBackToLoop always lands on 'choosing_action', never silently resuming 'working'", () => {
  let state = startTaskContinuationLoop("task-1", NOW);
  state = enterArc(state, "full", NOW);
  state = exitArcBackToLoop(state, NOW);
  assert.equal(state.phase, "choosing_action");
});

test("endTaskContinuationLoop records the end reason and moves to 'ended'", () => {
  let state = startTaskContinuationLoop("task-1", NOW);
  state = endTaskContinuationLoop(state, "user_stopped", NOW);
  assert.equal(state.phase, "ended");
  assert.equal(state.endReason, "user_stopped");
});

test("resolveLoopHardStopMinutes is a thin wrapper over arc/dailyPlan.ts's own resolveFreeMinutesUntilNextTask -- returns null when nothing else is scheduled today", () => {
  const state = startTaskContinuationLoop("task-1", NOW);
  const now = new Date(2026, 10, 25, 9, 0, 0);
  const minutes = resolveLoopHardStopMinutes(state, [entry("task-1", "08:00", "08:00")], now);
  assert.equal(minutes, null, "the loop's own task is excluded, and nothing else is scheduled -- no next-task boundary exists");
});

test("resolveLoopHardStopMinutes returns real minutes remaining until a genuinely different next task", () => {
  const state = startTaskContinuationLoop("task-1", NOW);
  const now = new Date(2026, 10, 25, 9, 0, 0);
  const minutes = resolveLoopHardStopMinutes(state, [entry("task-1", "08:00", "08:00"), entry("task-2", "10:00", "10:00")], now);
  assert.equal(minutes, 60);
});
