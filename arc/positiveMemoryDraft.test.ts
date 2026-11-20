import test from "node:test";
import assert from "node:assert/strict";

import {
  createPositiveMemoryDraft,
  deletePositiveMemoryDraftFromList,
  finalizePositiveMemoryDraft,
  normalizePositiveMemoryDraft,
  resolvePositiveMemoryDraftsForTask,
  setPositiveMemoryDraftEventType,
  setPositiveMemoryDraftStep,
  sortPositiveMemoryDraftsNewestFirst,
  updatePositiveMemoryDraftFields,
  upsertPositiveMemoryDraftInList,
} from "./positiveMemoryDraft.ts";

const NOW = "2026-01-01T10:00:00.000Z";

test("createPositiveMemoryDraft starts with every field empty and the given first step/task context", () => {
  const draft = createPositiveMemoryDraft("d1", "success", "task_link", NOW, "task-1");
  assert.equal(draft.currentStep, "task_link");
  assert.equal(draft.taskId, "task-1");
  assert.equal(draft.fields.title, "");
  assert.deepEqual(draft.fields.feelings, []);
});

test("updatePositiveMemoryDraftFields merges shallowly, preserving fields not passed", () => {
  const draft = createPositiveMemoryDraft("d1", "success", "what_happened", NOW);
  const withTitle = updatePositiveMemoryDraftFields(draft, { title: "כותרת" }, "2026-01-02T00:00:00.000Z");
  const withDescription = updatePositiveMemoryDraftFields(withTitle, { description: "תיאור" }, "2026-01-03T00:00:00.000Z");
  assert.equal(withDescription.fields.title, "כותרת");
  assert.equal(withDescription.fields.description, "תיאור");
  assert.equal(withDescription.updatedAt, "2026-01-03T00:00:00.000Z");
});

test("setPositiveMemoryDraftStep is a no-op when already on that step (never bumps updatedAt pointlessly)", () => {
  const draft = createPositiveMemoryDraft("d1", "success", "what_happened", NOW);
  const same = setPositiveMemoryDraftStep(draft, "what_happened", "2026-01-02T00:00:00.000Z");
  assert.equal(same.updatedAt, NOW);
  const advanced = setPositiveMemoryDraftStep(draft, "feelings", "2026-01-02T00:00:00.000Z");
  assert.equal(advanced.currentStep, "feelings");
  assert.equal(advanced.updatedAt, "2026-01-02T00:00:00.000Z");
});

test("setPositiveMemoryDraftEventType preserves compatible fields but clears successDescription when switching away from success", () => {
  const draft = createPositiveMemoryDraft("d1", "success", "what_happened", NOW);
  const withSuccessText = updatePositiveMemoryDraftFields(draft, { title: "x", successDescription: "הצלחתי במשהו" }, NOW);
  const switched = setPositiveMemoryDraftEventType(withSuccessText, "positive_feeling", "2026-01-02T00:00:00.000Z");
  assert.equal(switched.eventType, "positive_feeling");
  assert.equal(switched.fields.title, "x", "compatible fields must survive the type switch");
  assert.equal(switched.fields.successDescription, null, "success-only field must be cleared when switching away from success");

  const switchedBack = setPositiveMemoryDraftEventType(switched, "success", "2026-01-03T00:00:00.000Z");
  assert.equal(switchedBack.fields.successDescription, null, "switching back must never resurrect stale, unconfirmed text");
});

test("upsertPositiveMemoryDraftInList and deletePositiveMemoryDraftFromList support multiple independent drafts without overwriting each other", () => {
  const d1 = createPositiveMemoryDraft("d1", "success", "task_link", NOW);
  const d2 = createPositiveMemoryDraft("d2", "positive_feeling", "feeling_select", NOW);
  let list = upsertPositiveMemoryDraftInList([], d1);
  list = upsertPositiveMemoryDraftInList(list, d2);
  assert.equal(list.length, 2);
  list = deletePositiveMemoryDraftFromList(list, "d1");
  assert.equal(list.length, 1);
  assert.equal(list[0].id, "d2");
});

test("resolvePositiveMemoryDraftsForTask and sortPositiveMemoryDraftsNewestFirst", () => {
  const d1 = createPositiveMemoryDraft("d1", "success", "task_link", "2026-01-01T00:00:00.000Z", "task-1");
  const d2 = createPositiveMemoryDraft("d2", "success", "task_link", "2026-01-02T00:00:00.000Z", "task-1");
  const d3 = createPositiveMemoryDraft("d3", "success", "task_link", "2026-01-01T00:00:00.000Z", "task-2");
  const forTask1 = resolvePositiveMemoryDraftsForTask([d1, d2, d3], "task-1");
  assert.deepEqual(forTask1.map((d) => d.id), ["d1", "d2"]);
  const sorted = sortPositiveMemoryDraftsNewestFirst(forTask1);
  assert.deepEqual(sorted.map((d) => d.id), ["d2", "d1"]);
});

test("finalizePositiveMemoryDraft maps every draft field onto the finalized PositiveMemory exactly once, with no re-derivation", () => {
  const draft = createPositiveMemoryDraft("d1", "success", "done", NOW, "task-1");
  const filled = updatePositiveMemoryDraftFields(
    draft,
    {
      title: "הצלחתי בתרגיל",
      description: "תיאור מה קרה",
      feelings: [{ feeling: "ביטחון", moment: "באמצע", intensity: 3 }],
      location: "בבית",
      occurredAt: "2026-01-05T09:00:00.000Z",
      whatWasSpecial: "זה היה מיוחד",
      successDescription: "הצלחתי לבצע את הפעולה",
      linkedGoalIds: ["goal-1"],
    },
    NOW
  );
  const memory = finalizePositiveMemoryDraft(filled, "memory-1", "2026-01-06T00:00:00.000Z");
  assert.equal(memory.id, "memory-1");
  assert.equal(memory.eventType, "success");
  assert.equal(memory.title, "הצלחתי בתרגיל");
  assert.equal(memory.description, "תיאור מה קרה");
  assert.equal(memory.feelings.length, 1);
  assert.equal(memory.location, "בבית");
  assert.equal(memory.occurredAt, "2026-01-05T09:00:00.000Z");
  assert.equal(memory.whatWasSpecial, "זה היה מיוחד");
  assert.equal(memory.successDescription, "הצלחתי לבצע את הפעולה");
  assert.equal(memory.taskId, "task-1");
  assert.deepEqual(memory.linkedGoalIds, ["goal-1"]);
  assert.equal(memory.createdAt, "2026-01-06T00:00:00.000Z");
});

test("finalizePositiveMemoryDraft defaults occurredAt to `now` when the draft never set one", () => {
  const draft = createPositiveMemoryDraft("d1", "positive_feeling", "done", NOW);
  const memory = finalizePositiveMemoryDraft(draft, "memory-1", "2026-01-06T00:00:00.000Z");
  assert.equal(memory.occurredAt, "2026-01-06T00:00:00.000Z");
});

test("normalizePositiveMemoryDraft backfills a legacy/partial record without crashing", () => {
  const legacy = { id: "d1", eventType: "success" } as any;
  const normalized = normalizePositiveMemoryDraft(legacy, NOW);
  assert.equal(normalized.currentStep, "task_link");
  assert.deepEqual(normalized.fields.feelings, []);
  assert.equal(normalized.taskId, null);
  assert.equal(normalized.createdAt, NOW);
});
