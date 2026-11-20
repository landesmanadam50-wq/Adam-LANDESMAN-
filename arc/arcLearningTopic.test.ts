import test from "node:test";
import assert from "node:assert/strict";

import {
  createArcLearningTopic,
  deleteArcLearningTopicFromList,
  generateArcLearningTopicId,
  linkGoalToArcLearningTopic,
  normalizeArcLearningTopic,
  resolveArcLearningTopicsForGoal,
  unlinkGoalFromArcLearningTopic,
  updateArcLearningTopic,
  upsertArcLearningTopicInList,
} from "./arcLearningTopic.ts";
import type { ArcLearningTopic } from "./arcLearningTopic.ts";

const NOW = "2026-01-10T09:00:00.000Z";
const LATER = "2026-01-10T10:00:00.000Z";

test("generateArcLearningTopicId returns distinct ids on successive calls", () => {
  assert.notEqual(generateArcLearningTopicId(), generateArcLearningTopicId());
});

test("createArcLearningTopic trims the title, starts with zero linked goals", () => {
  const topic = createArcLearningTopic("t1", "  כלכלה  ", NOW);
  assert.equal(topic.title, "כלכלה");
  assert.deepEqual(topic.linkedGoalIds, []);
  assert.equal(topic.createdAt, NOW);
  assert.equal(topic.updatedAt, NOW);
});

test("updateArcLearningTopic trims the new title and bumps updatedAt without touching createdAt", () => {
  const topic = createArcLearningTopic("t1", "כלכלה", NOW);
  const updated = updateArcLearningTopic(topic, { title: "  פסיכולוגיה  " }, LATER);
  assert.equal(updated.title, "פסיכולוגיה");
  assert.equal(updated.updatedAt, LATER);
  assert.equal(updated.createdAt, NOW);
});

test("upsertArcLearningTopicInList adds new, replaces existing by id", () => {
  const t1 = createArcLearningTopic("t1", "א", NOW);
  const t2 = createArcLearningTopic("t2", "ב", NOW);
  const list = upsertArcLearningTopicInList([t1], t2);
  assert.equal(list.length, 2);
  const renamed = updateArcLearningTopic(t1, { title: "חדש" }, LATER);
  const replaced = upsertArcLearningTopicInList(list, renamed);
  assert.equal(replaced.length, 2);
  assert.equal(replaced.find((t) => t.id === "t1")?.title, "חדש");
});

test("deleteArcLearningTopicFromList removes only the matching topic", () => {
  const t1 = createArcLearningTopic("t1", "א", NOW);
  const t2 = createArcLearningTopic("t2", "ב", NOW);
  const list = deleteArcLearningTopicFromList([t1, t2], "t1");
  assert.deepEqual(list.map((t) => t.id), ["t2"]);
});

test("linkGoalToArcLearningTopic is idempotent, unlink reverses it, and resolveArcLearningTopicsForGoal finds it via the reverse filter", () => {
  let topic = createArcLearningTopic("t1", "א", NOW);
  topic = linkGoalToArcLearningTopic(topic, "goal-1", NOW);
  topic = linkGoalToArcLearningTopic(topic, "goal-1", LATER);
  assert.deepEqual(topic.linkedGoalIds, ["goal-1"], "linking an already-linked goal must not duplicate it");
  assert.equal(topic.updatedAt, NOW, "a no-op link must not bump updatedAt");

  assert.deepEqual(resolveArcLearningTopicsForGoal([topic], "goal-1"), [topic]);
  assert.deepEqual(resolveArcLearningTopicsForGoal([topic], "goal-2"), []);

  const unlinked = unlinkGoalFromArcLearningTopic(topic, "goal-1", LATER);
  assert.deepEqual(unlinked.linkedGoalIds, []);
  assert.equal(unlinked.updatedAt, LATER);
});

test("normalizeArcLearningTopic backfills a legacy record missing linkedGoalIds, never dropping other fields", () => {
  const legacy = { id: "t1", title: "א", createdAt: NOW, updatedAt: NOW } as unknown as ArcLearningTopic;
  const normalized = normalizeArcLearningTopic(legacy);
  assert.deepEqual(normalized.linkedGoalIds, []);
  assert.equal(normalized.id, "t1");
  assert.equal(normalized.title, "א");
});
