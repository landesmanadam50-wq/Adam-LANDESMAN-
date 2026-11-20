import test from "node:test";
import assert from "node:assert/strict";

import {
  createArcCreativityConnection,
  createArcLearningInsightFromConnection,
  deleteArcCreativityConnectionFromList,
  generateArcCreativityConnectionId,
  normalizeArcCreativityConnection,
  pickRandomCrossTopicInsightPair,
  pickRandomWithinTopicInsightPair,
  resolveArcCreativityConnectionsForInsight,
  setArcCreativityConnectionNewPrincipleText,
  setArcCreativityConnectionUserExplanation,
  suggestArcCreativityConnectionPair,
  updateArcCreativityConnection,
  upsertArcCreativityConnectionInList,
} from "./arcCreativityConnection.ts";
import type { ArcCreativityConnection } from "./arcCreativityConnection.ts";
import { createArcLearningInsight, setArcLearningInsightExplanation, setArcLearningInsightMainSentence, setArcLearningInsightTopic } from "./arcLearningInsight.ts";
import type { ArcLearningInsight } from "./arcLearningInsight.ts";

const NOW = "2026-01-10T09:00:00.000Z";
const LATER = "2026-01-10T10:00:00.000Z";

function makeReadyInsight(id: string, topicId: string): ArcLearningInsight {
  return setArcLearningInsightMainSentence(setArcLearningInsightTopic(createArcLearningInsight(id, `raw-${id}`, NOW), topicId, NOW), `sentence-${id}`, NOW);
}

test("generateArcCreativityConnectionId returns distinct ids", () => {
  assert.notEqual(generateArcCreativityConnectionId(), generateArcCreativityConnectionId());
});

test("createArcCreativityConnection trims relationship, starts with null userExplanation/newPrincipleInsightText", () => {
  const connection = createArcCreativityConnection("c1", "i1", "i2", "  קשר בין השתיים  ", "manual", "possible", NOW);
  assert.equal(connection.relationship, "קשר בין השתיים");
  assert.equal(connection.userExplanation, null);
  assert.equal(connection.newPrincipleInsightText, null);
  assert.equal(connection.source, "manual");
  assert.equal(connection.classification, "possible");
});

test("setArcCreativityConnectionUserExplanation/NewPrincipleText trim their text and treat empty/whitespace as clearing the field", () => {
  let connection = createArcCreativityConnection("c1", "i1", "i2", "קשר", "manual", "possible", NOW);
  connection = setArcCreativityConnectionUserExplanation(connection, "  ההסבר שלי  ", NOW);
  assert.equal(connection.userExplanation, "ההסבר שלי");
  connection = setArcCreativityConnectionNewPrincipleText(connection, "  עיקרון חדש  ", NOW);
  assert.equal(connection.newPrincipleInsightText, "עיקרון חדש");
  connection = setArcCreativityConnectionUserExplanation(connection, "   ", LATER);
  assert.equal(connection.userExplanation, null);
});

test("updateArcCreativityConnection only changes fields given in the patch", () => {
  const connection = createArcCreativityConnection("c1", "i1", "i2", "קשר", "ai_suggested", "possible", NOW);
  const updated = updateArcCreativityConnection(connection, { classification: "evidence_supported" }, LATER);
  assert.equal(updated.classification, "evidence_supported");
  assert.equal(updated.relationship, connection.relationship);
  assert.equal(updated.updatedAt, LATER);
});

test("upsertArcCreativityConnectionInList/deleteArcCreativityConnectionFromList/resolveArcCreativityConnectionsForInsight match an insight on either side", () => {
  const c1 = createArcCreativityConnection("c1", "i1", "i2", "קשר א", "manual", "possible", NOW);
  const c2 = createArcCreativityConnection("c2", "i2", "i3", "קשר ב", "manual", "possible", NOW);
  let list = upsertArcCreativityConnectionInList([c1], c2);
  assert.equal(list.length, 2);
  assert.deepEqual(resolveArcCreativityConnectionsForInsight(list, "i2").map((c) => c.id), ["c1", "c2"]);
  assert.deepEqual(resolveArcCreativityConnectionsForInsight(list, "i1").map((c) => c.id), ["c1"]);
  list = deleteArcCreativityConnectionFromList(list, "c1");
  assert.deepEqual(list.map((c) => c.id), ["c2"]);
});

test("pickRandomCrossTopicInsightPair only pairs insights from DIFFERENT topics that are ready for recall (main sentence set)", () => {
  const insights = [makeReadyInsight("i1", "t1"), makeReadyInsight("i2", "t1"), makeReadyInsight("i3", "t2")];
  const pair = pickRandomCrossTopicInsightPair(insights, [], () => 0);
  assert.ok(pair);
  assert.notEqual(pair!.insightA.topicId, pair!.insightB.topicId);
});

test("pickRandomCrossTopicInsightPair excludes insights not yet ready for recall (no main sentence) and returns null when fewer than 2 eligible cross-topic insights exist", () => {
  const notReady = createArcLearningInsight("i1", "raw", NOW);
  const ready = makeReadyInsight("i2", "t1");
  assert.equal(pickRandomCrossTopicInsightPair([notReady, ready], []), null);
});

test("pickRandomCrossTopicInsightPair excludes a pair that already has a saved connection, regardless of which mode created it", () => {
  const a = makeReadyInsight("i1", "t1");
  const b = makeReadyInsight("i2", "t2");
  const existing = createArcCreativityConnection("c1", "i2", "i1", "קשר", "ai_suggested", "possible", NOW);
  assert.equal(pickRandomCrossTopicInsightPair([a, b], [existing]), null, "pair order must not matter when checking for an existing connection");
});

test("pickRandomWithinTopicInsightPair only pairs insights from the given topic, excluding already-connected pairs", () => {
  const a = makeReadyInsight("i1", "t1");
  const b = makeReadyInsight("i2", "t1");
  const c = makeReadyInsight("i3", "t2");
  const pair = pickRandomWithinTopicInsightPair([a, b, c], "t1", [], () => 0);
  assert.ok(pair);
  assert.equal(pair!.insightA.topicId, "t1");
  assert.equal(pair!.insightB.topicId, "t1");

  const existing = createArcCreativityConnection("c1", "i1", "i2", "קשר", "random_within_topic", "no_clear_connection", NOW);
  assert.equal(pickRandomWithinTopicInsightPair([a, b], "t1", [existing]), null);
});

test("createArcLearningInsightFromConnection stamps derivedFromConnectionId and prefers newPrincipleInsightText as the raw capture text, falling back to relationship", () => {
  const withPrinciple = setArcCreativityConnectionNewPrincipleText(
    createArcCreativityConnection("c1", "i1", "i2", "הקשר", "manual", "possible", NOW),
    "העיקרון החדש",
    NOW
  );
  const insight = createArcLearningInsightFromConnection("new-insight-1", withPrinciple, LATER);
  assert.equal(insight.rawText, "העיקרון החדש");
  assert.equal(insight.derivedFromConnectionId, "c1");

  const withoutPrinciple = createArcCreativityConnection("c2", "i3", "i4", "הקשר השני", "manual", "possible", NOW);
  const insight2 = createArcLearningInsightFromConnection("new-insight-2", withoutPrinciple, LATER);
  assert.equal(insight2.rawText, "הקשר השני");
});

test("suggestArcCreativityConnectionPair: returns null when fewer than two eligible insights exist", () => {
  assert.equal(suggestArcCreativityConnectionPair([], []), null);
  assert.equal(suggestArcCreativityConnectionPair([makeReadyInsight("i1", "t1")], []), null);
});

test("suggestArcCreativityConnectionPair: never claims evidence_supported from a plain heuristic match -- the strongest classification it ever returns is 'possible'", () => {
  let a = makeReadyInsight("i1", "t1");
  let b = makeReadyInsight("i2", "t2");
  a = setArcLearningInsightExplanation(a, "reason", "תהליך ביולוגי חשוב מאוד", NOW);
  b = setArcLearningInsightExplanation(b, "reason", "תהליך ביולוגי מעניין", NOW);
  const suggestion = suggestArcCreativityConnectionPair([a, b], []);
  assert.ok(suggestion);
  assert.equal(suggestion!.suggestedClassification, "possible");
});

test("suggestArcCreativityConnectionPair: with zero textual overlap, suggests 'creative_analogy' and still returns a pair (never silently gives up)", () => {
  const a = makeReadyInsight("i1", "t1");
  const b = makeReadyInsight("i2", "t2");
  const suggestion = suggestArcCreativityConnectionPair([a, b], []);
  assert.ok(suggestion);
  assert.equal(suggestion!.suggestedClassification, "creative_analogy");
});

test("suggestArcCreativityConnectionPair: excludes a pair that already has a saved connection", () => {
  const a = makeReadyInsight("i1", "t1");
  const b = makeReadyInsight("i2", "t2");
  const existing = createArcCreativityConnection("c1", "i1", "i2", "קשר", "manual", "possible", NOW);
  assert.equal(suggestArcCreativityConnectionPair([a, b], [existing]), null);
});

test("normalizeArcCreativityConnection backfills a legacy record missing userExplanation/newPrincipleInsightText", () => {
  const legacy = { id: "c1", insightIdA: "i1", insightIdB: "i2", relationship: "קשר", source: "manual", classification: "possible", createdAt: NOW, updatedAt: NOW } as unknown as ArcCreativityConnection;
  const normalized = normalizeArcCreativityConnection(legacy);
  assert.equal(normalized.userExplanation, null);
  assert.equal(normalized.newPrincipleInsightText, null);
});
