import test from "node:test";
import assert from "node:assert/strict";

import {
  createPositiveMemory,
  deletePositiveMemoryFromList,
  linkGoalToPositiveMemory,
  normalizePositiveMemory,
  resolvePositiveMemoriesByEventType,
  resolvePositiveMemoriesForFeeling,
  resolvePositiveMemoriesForTask,
  setPositiveMemoryFeelings,
  unlinkGoalFromPositiveMemory,
  updatePositiveMemory,
  upsertPositiveMemoryInList,
} from "./positiveMemory.ts";

const NOW = "2026-01-01T10:00:00.000Z";

test("createPositiveMemory starts with every optional field at its true empty state, never a fabricated default", () => {
  const memory = createPositiveMemory("m1", "success", "  הצלחתי  ", NOW);
  assert.equal(memory.title, "הצלחתי");
  assert.equal(memory.description, "");
  assert.deepEqual(memory.feelings, []);
  assert.equal(memory.location, null);
  assert.equal(memory.occurredAt, NOW);
  assert.equal(memory.successDescription, null);
  assert.equal(memory.taskId, null);
  assert.deepEqual(memory.linkedGoalIds, []);
});

test("updatePositiveMemory only touches the fields explicitly passed, leaving everything else untouched", () => {
  const memory = createPositiveMemory("m1", "success", "x", NOW);
  const updated = updatePositiveMemory(memory, { description: "תיאור", taskId: "task-1" }, "2026-01-02T00:00:00.000Z");
  assert.equal(updated.description, "תיאור");
  assert.equal(updated.taskId, "task-1");
  assert.equal(updated.title, "x");
  assert.equal(updated.updatedAt, "2026-01-02T00:00:00.000Z");
});

test("setPositiveMemoryFeelings supports multiple feelings, each with its own moment and optional intensity", () => {
  const memory = createPositiveMemory("m1", "positive_feeling", "x", NOW);
  const withFeelings = setPositiveMemoryFeelings(
    memory,
    [
      { feeling: "ביטחון", moment: "כשענתי לשאלה", intensity: 4 },
      { feeling: "גאווה", moment: "בסוף השיחה", intensity: null },
    ],
    NOW
  );
  assert.equal(withFeelings.feelings.length, 2);
  assert.equal(withFeelings.feelings[0].moment, "כשענתי לשאלה");
  assert.equal(withFeelings.feelings[1].intensity, null);
});

test("linkGoalToPositiveMemory/unlinkGoalFromPositiveMemory are idempotent and never duplicate ids", () => {
  const memory = createPositiveMemory("m1", "success", "x", NOW);
  const linked = linkGoalToPositiveMemory(memory, "goal-1", NOW);
  const linkedAgain = linkGoalToPositiveMemory(linked, "goal-1", NOW);
  assert.deepEqual(linkedAgain.linkedGoalIds, ["goal-1"]);
  const unlinked = unlinkGoalFromPositiveMemory(linkedAgain, "goal-1", NOW);
  assert.deepEqual(unlinked.linkedGoalIds, []);
});

test("upsertPositiveMemoryInList inserts a new memory and replaces an existing one by id, never duplicating", () => {
  const m1 = createPositiveMemory("m1", "success", "a", NOW);
  const m2 = createPositiveMemory("m2", "success", "b", NOW);
  let list = upsertPositiveMemoryInList([], m1);
  list = upsertPositiveMemoryInList(list, m2);
  assert.equal(list.length, 2);
  const updatedM1 = updatePositiveMemory(m1, { title: "a2" }, NOW);
  list = upsertPositiveMemoryInList(list, updatedM1);
  assert.equal(list.length, 2);
  assert.equal(list.find((m) => m.id === "m1")?.title, "a2");
});

test("deletePositiveMemoryFromList never cascades -- removing the memory never implies removing anything else", () => {
  const m1 = createPositiveMemory("m1", "success", "a", NOW);
  const list = deletePositiveMemoryFromList([m1], "m1");
  assert.equal(list.length, 0);
});

test("resolvePositiveMemoriesForTask / resolvePositiveMemoriesForFeeling / resolvePositiveMemoriesByEventType filter correctly", () => {
  const m1 = updatePositiveMemory(createPositiveMemory("m1", "success", "a", NOW), { taskId: "task-1" }, NOW);
  const m2 = createPositiveMemory("m2", "positive_feeling", "b", NOW);
  const m2WithFeeling = setPositiveMemoryFeelings(m2, [{ feeling: "ביטחון", moment: "x", intensity: null }], NOW);
  const list = [m1, m2WithFeeling];

  assert.deepEqual(resolvePositiveMemoriesForTask(list, "task-1").map((m) => m.id), ["m1"]);
  assert.deepEqual(resolvePositiveMemoriesForFeeling(list, "ביטחון").map((m) => m.id), ["m2"]);
  assert.deepEqual(resolvePositiveMemoriesForFeeling(list, "  ביטחון  ").map((m) => m.id), ["m2"]);
  assert.deepEqual(resolvePositiveMemoriesByEventType(list, "success").map((m) => m.id), ["m1"]);
  assert.deepEqual(resolvePositiveMemoriesByEventType(list, "positive_feeling").map((m) => m.id), ["m2"]);
});

test("normalizePositiveMemory backfills every field a pre-existing record might be missing, never crashing on a partial record", () => {
  const legacy = { id: "m1", eventType: "success", title: "x" } as any;
  const normalized = normalizePositiveMemory(legacy, NOW);
  assert.deepEqual(normalized.feelings, []);
  assert.deepEqual(normalized.linkedGoalIds, []);
  assert.equal(normalized.location, null);
  assert.equal(normalized.taskId, null);
  assert.equal(normalized.occurredAt, NOW);
  assert.equal(normalized.createdAt, NOW);
});
