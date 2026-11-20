import test from "node:test";
import assert from "node:assert/strict";

import {
  createPostponementObstacleOutcome,
  findLatestOutcomeForTask,
  findOutcomeBySmallerTaskId,
  generatePostponementObstacleOutcomeId,
  recordInterventionDuration,
  recordSmallerStepCompleted,
  recordSmallerTaskCreated,
  recordStartedOriginalTaskAfter,
  upsertPostponementObstacleOutcomeInList,
} from "./postponementObstacle.ts";

test("generatePostponementObstacleOutcomeId produces distinct, prefixed ids", () => {
  const a = generatePostponementObstacleOutcomeId();
  const b = generatePostponementObstacleOutcomeId();
  assert.notEqual(a, b);
  assert.match(a, /^postpone-obstacle-/);
});

test("createPostponementObstacleOutcome starts every unknown field at null", () => {
  const outcome = createPostponementObstacleOutcome("o1", "t1", "emotional", "2026-01-01T00:00:00.000Z");
  assert.equal(outcome.taskId, "t1");
  assert.equal(outcome.reason, "emotional");
  assert.equal(outcome.interventionDurationMinutes, null);
  assert.equal(outcome.smallerTaskId, null);
  assert.equal(outcome.startedOriginalTaskAfter, null);
  assert.equal(outcome.smallerStepCompleted, null);
});

test("recordInterventionDuration sets only the duration and bumps updatedAt", () => {
  const outcome = createPostponementObstacleOutcome("o1", "t1", "rest", "2026-01-01T00:00:00.000Z");
  const updated = recordInterventionDuration(outcome, 10, "2026-01-01T00:05:00.000Z");
  assert.equal(updated.interventionDurationMinutes, 10);
  assert.equal(updated.updatedAt, "2026-01-01T00:05:00.000Z");
  assert.equal(updated.reason, "rest", "other fields must survive untouched");
});

test("recordSmallerTaskCreated links the outcome to its smaller step", () => {
  const outcome = createPostponementObstacleOutcome("o1", "t1", "smaller_task", "2026-01-01T00:00:00.000Z");
  const updated = recordSmallerTaskCreated(outcome, "t1-step", "2026-01-01T00:01:00.000Z");
  assert.equal(updated.smallerTaskId, "t1-step");
});

test("recordStartedOriginalTaskAfter records true or false, never silently defaulting", () => {
  const outcome = createPostponementObstacleOutcome("o1", "t1", "emotional", "2026-01-01T00:00:00.000Z");
  const started = recordStartedOriginalTaskAfter(outcome, true, "2026-01-01T00:10:00.000Z");
  assert.equal(started.startedOriginalTaskAfter, true);
  const notStarted = recordStartedOriginalTaskAfter(outcome, false, "2026-01-01T00:10:00.000Z");
  assert.equal(notStarted.startedOriginalTaskAfter, false);
});

test("recordSmallerStepCompleted records true/false independently of startedOriginalTaskAfter", () => {
  const outcome = createPostponementObstacleOutcome("o1", "t1", "smaller_task", "2026-01-01T00:00:00.000Z");
  const completed = recordSmallerStepCompleted(outcome, true, "2026-01-01T00:20:00.000Z");
  assert.equal(completed.smallerStepCompleted, true);
  assert.equal(completed.startedOriginalTaskAfter, null);
});

test("findLatestOutcomeForTask returns the most recently created match for that task, ignoring other tasks' outcomes", () => {
  const outcomes = [
    createPostponementObstacleOutcome("o1", "t1", "emotional", "2026-01-01T00:00:00.000Z"),
    createPostponementObstacleOutcome("o2", "t2", "rest", "2026-01-02T00:00:00.000Z"),
    createPostponementObstacleOutcome("o3", "t1", "smaller_task", "2026-01-03T00:00:00.000Z"),
  ];
  const latest = findLatestOutcomeForTask(outcomes, "t1");
  assert.equal(latest?.id, "o3");
});

test("findLatestOutcomeForTask returns null when no outcome exists for that task", () => {
  assert.equal(findLatestOutcomeForTask([], "t1"), null);
});

test("findOutcomeBySmallerTaskId finds the outcome whose smallerTaskId matches", () => {
  const outcome = recordSmallerTaskCreated(createPostponementObstacleOutcome("o1", "t1", "smaller_task", "2026-01-01T00:00:00.000Z"), "t1-step", "2026-01-01T00:01:00.000Z");
  assert.equal(findOutcomeBySmallerTaskId([outcome], "t1-step")?.id, "o1");
  assert.equal(findOutcomeBySmallerTaskId([outcome], "no-such-id"), null);
});

test("upsertPostponementObstacleOutcomeInList inserts a new outcome and updates an existing one by id", () => {
  const first = createPostponementObstacleOutcome("o1", "t1", "emotional", "2026-01-01T00:00:00.000Z");
  const inserted = upsertPostponementObstacleOutcomeInList([], first);
  assert.equal(inserted.length, 1);
  const updatedFirst = recordStartedOriginalTaskAfter(first, true, "2026-01-01T01:00:00.000Z");
  const updatedList = upsertPostponementObstacleOutcomeInList(inserted, updatedFirst);
  assert.equal(updatedList.length, 1);
  assert.equal(updatedList[0].startedOriginalTaskAfter, true);
});
