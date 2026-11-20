import test from "node:test";
import assert from "node:assert/strict";

import {
  advanceStageProgress,
  createTaskStageProgress,
  isStageCompleted,
  markStageCompleted,
  normalizeTaskStageProgress,
  resolveCompletedDurationMinutes,
  type TaskStageProgress,
} from "./taskStageProgress.ts";

test("createTaskStageProgress starts with no completed stages and the given active stage", () => {
  const progress = createTaskStageProgress("task-1", "s-trigger");
  assert.equal(progress.taskId, "task-1");
  assert.equal(progress.activeStageId, "s-trigger");
  assert.deepEqual(progress.completedStageIds, []);
});

// --- Idempotent ✓ completion (requirement 4: "repeated taps cannot complete multiple stages accidentally") ---

test("markStageCompleted adds the stage id once; tapping again (already completed) is a complete no-op, never appending a duplicate", () => {
  let progress = createTaskStageProgress("task-1", "s-trigger");
  progress = markStageCompleted(progress, "s-trigger");
  assert.deepEqual(progress.completedStageIds, ["s-trigger"]);
  const again = markStageCompleted(progress, "s-trigger");
  assert.deepEqual(again.completedStageIds, ["s-trigger"], "still exactly one entry after a second tap");
  assert.equal(again, progress, "a no-op returns the SAME object -- never even a new array/object for an already-completed stage");
});

test("isStageCompleted reflects exactly what markStageCompleted has recorded, for any stage id", () => {
  const progress = markStageCompleted(createTaskStageProgress("task-1", "s-trigger"), "s-trigger");
  assert.equal(isStageCompleted(progress, "s-trigger"), true);
  assert.equal(isStageCompleted(progress, "s-main"), false);
});

// --- Advancing to the next stage never touches completedStageIds ---

test("advanceStageProgress only changes activeStageId -- completedStageIds (the trace of what's actually done) is untouched by simply moving forward", () => {
  let progress = createTaskStageProgress("task-1", "s-trigger");
  progress = markStageCompleted(progress, "s-trigger");
  progress = advanceStageProgress(progress, "s-small");
  assert.equal(progress.activeStageId, "s-small");
  assert.deepEqual(progress.completedStageIds, ["s-trigger"]);
});

// --- Overall task progress (requirement: "preserve overall task progress") ---

test("resolveCompletedDurationMinutes sums only the COMPLETED stages' own durations -- the active (not-yet-confirmed) stage never counts toward it, even if its timer has been running", () => {
  const stages = [
    { id: "s-trigger", durationMinutes: 2 },
    { id: "s-small", durationMinutes: 3 },
    { id: "s-main", durationMinutes: 25 },
  ];
  let progress = createTaskStageProgress("task-1", "s-small");
  progress = markStageCompleted(progress, "s-trigger");
  assert.equal(resolveCompletedDurationMinutes(stages, progress), 2);
  progress = markStageCompleted(progress, "s-small");
  assert.equal(resolveCompletedDurationMinutes(stages, progress), 5);
});

// --- Backward compatibility ---

test("normalizeTaskStageProgress backfills a missing completedStageIds array without crashing", () => {
  const legacy = { taskId: "task-1", activeStageId: "s-trigger" } as unknown as TaskStageProgress;
  assert.deepEqual(normalizeTaskStageProgress(legacy).completedStageIds, []);
});
