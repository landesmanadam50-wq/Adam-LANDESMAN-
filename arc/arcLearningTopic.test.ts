import test from "node:test";
import assert from "node:assert/strict";

import {
  createArcLearningTopic,
  deleteArcLearningTopicFromList,
  generateArcLearningTopicId,
  linkGoalToArcLearningTopic,
  normalizeArcLearningTopic,
  resolveArcLearningTopicsForGoal,
  resolveInsightsForArcLearningTopic,
  unlinkGoalFromArcLearningTopic,
  updateArcLearningTopic,
  upsertArcLearningTopicInList,
} from "./arcLearningTopic.ts";
import type { ArcLearningTopic } from "./arcLearningTopic.ts";
import { createStandaloneInsight, linkArcLearningTopicToInsight } from "./arcInsightBelief.ts";

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

// --- ARCHI -- Insight Collection x ARC Learning linking task ---

test("3. resolveInsightsForArcLearningTopic shows an insight under every topic it's linked to", () => {
  let insight = createStandaloneInsight("i1", "תובנה", NOW);
  insight = linkArcLearningTopicToInsight(insight, "t1");
  insight = linkArcLearningTopicToInsight(insight, "t2");
  assert.deepEqual(resolveInsightsForArcLearningTopic([insight], "t1"), [insight]);
  assert.deepEqual(resolveInsightsForArcLearningTopic([insight], "t2"), [insight]);
  assert.deepEqual(resolveInsightsForArcLearningTopic([insight], "t3"), []);
});

test("resolveInsightsForArcLearningTopic returns every matching insight, in the order given, never invented or duplicated", () => {
  let insightA = createStandaloneInsight("iA", "א", NOW);
  let insightB = createStandaloneInsight("iB", "ב", NOW);
  const insightC = createStandaloneInsight("iC", "ג", NOW); // never linked to t1
  insightA = linkArcLearningTopicToInsight(insightA, "t1");
  insightB = linkArcLearningTopicToInsight(insightB, "t1");
  assert.deepEqual(resolveInsightsForArcLearningTopic([insightA, insightB, insightC], "t1"), [insightA, insightB]);
});

test("8. renaming a topic (updateArcLearningTopic) never breaks resolveInsightsForArcLearningTopic -- the link is by stable id, never by title", () => {
  let insight = createStandaloneInsight("i1", "תובנה", NOW);
  insight = linkArcLearningTopicToInsight(insight, "t1");
  const topic = updateArcLearningTopic(createArcLearningTopic("t1", "כלכלה", NOW), { title: "פסיכולוגיה" }, LATER);
  assert.equal(topic.id, "t1");
  assert.deepEqual(resolveInsightsForArcLearningTopic([insight], topic.id), [insight]);
});

test("9. a dangling topic id (the topic itself was deleted) simply never matches -- never a crash, never a broken-reference row", () => {
  let insight = createStandaloneInsight("i1", "תובנה", NOW);
  insight = linkArcLearningTopicToInsight(insight, "deleted-topic");
  const remainingTopics = deleteArcLearningTopicFromList([createArcLearningTopic("deleted-topic", "נושא שנמחק", NOW)], "deleted-topic");
  assert.equal(remainingTopics.length, 0);
  // The insight's own arcLearningTopicIds still names the deleted topic (no cascade -- same policy as linkedGoalIds), but resolving against the now-empty topic list simply finds nothing to show, never throwing.
  assert.deepEqual(remainingTopics.filter((topic) => insight.arcLearningTopicIds.includes(topic.id)), []);
});
