import test from "node:test";
import assert from "node:assert/strict";

import {
  addArcLearningInsightMentalImage,
  createArcLearningInsight,
  deleteArcLearningInsightFromList,
  generateArcLearningInsightId,
  isArcLearningInsightReadyForRecall,
  normalizeArcLearningInsight,
  removeArcLearningInsightMentalImage,
  resolveAnsweredArcLearningExplanationKinds,
  resolveArcLearningInsightExplanation,
  resolveArcLearningInsightsForTopic,
  resolveUnfinishedArcLearningInsights,
  setArcLearningInsightExplanation,
  setArcLearningInsightMainSentence,
  setArcLearningInsightTopic,
  setArcLearningInsightWantsToLearn,
  skipArcLearningInsightExplanation,
  upsertArcLearningInsightInList,
} from "./arcLearningInsight.ts";
import type { ArcLearningInsight } from "./arcLearningInsight.ts";

const NOW = "2026-01-10T09:00:00.000Z";
const LATER = "2026-01-10T10:00:00.000Z";

test("generateArcLearningInsightId returns distinct ids", () => {
  assert.notEqual(generateArcLearningInsightId(), generateArcLearningInsightId());
});

test("createArcLearningInsight trims rawText, starts save-only with every later-step field null/empty", () => {
  const insight = createArcLearningInsight("i1", "  תובנה גולמית  ", NOW);
  assert.equal(insight.rawText, "תובנה גולמית");
  assert.equal(insight.wantsToLearn, false);
  assert.equal(insight.topicId, null);
  assert.equal(insight.mainSentence, null);
  assert.equal(insight.meaningAnswer, null);
  assert.equal(insight.reasonAnswer, null);
  assert.equal(insight.mechanismAnswer, null);
  assert.deepEqual(insight.mentalImages, []);
});

test("setArcLearningInsightWantsToLearn/Topic/MainSentence set exactly the one field each targets", () => {
  let insight = createArcLearningInsight("i1", "תובנה", NOW);
  insight = setArcLearningInsightWantsToLearn(insight, true, NOW);
  assert.equal(insight.wantsToLearn, true);
  insight = setArcLearningInsightTopic(insight, "topic-1", NOW);
  assert.equal(insight.topicId, "topic-1");
  insight = setArcLearningInsightMainSentence(insight, "  המשפט העיקרי  ", LATER);
  assert.equal(insight.mainSentence, "המשפט העיקרי");
  assert.equal(insight.updatedAt, LATER);
});

test("setArcLearningInsightExplanation answers the given kind only, trims it, and an empty/whitespace answer is treated as a skip (null)", () => {
  let insight = createArcLearningInsight("i1", "תובנה", NOW);
  insight = setArcLearningInsightExplanation(insight, "meaning", "  המשמעות  ", NOW);
  assert.equal(insight.meaningAnswer, "המשמעות");
  assert.equal(insight.reasonAnswer, null);
  assert.equal(insight.mechanismAnswer, null);

  insight = setArcLearningInsightExplanation(insight, "meaning", "   ", LATER);
  assert.equal(insight.meaningAnswer, null, "a whitespace-only answer must be stored the same as a skip");
});

test("skipArcLearningInsightExplanation sets the targeted kind back to null without touching the others", () => {
  let insight = createArcLearningInsight("i1", "תובנה", NOW);
  insight = setArcLearningInsightExplanation(insight, "reason", "הסבר", NOW);
  insight = setArcLearningInsightExplanation(insight, "mechanism", "תהליך", NOW);
  insight = skipArcLearningInsightExplanation(insight, "reason", LATER);
  assert.equal(insight.reasonAnswer, null);
  assert.equal(insight.mechanismAnswer, "תהליך", "skipping one question must never clear a different, already-answered one");
});

test("resolveArcLearningInsightExplanation reads the right field per kind", () => {
  let insight = createArcLearningInsight("i1", "תובנה", NOW);
  insight = setArcLearningInsightExplanation(insight, "mechanism", "איך", NOW);
  assert.equal(resolveArcLearningInsightExplanation(insight, "mechanism"), "איך");
  assert.equal(resolveArcLearningInsightExplanation(insight, "meaning"), null);
});

test("resolveAnsweredArcLearningExplanationKinds returns only the kinds actually answered, never a skipped/unanswered one -- section 2 step 6's own recall rule", () => {
  let insight = createArcLearningInsight("i1", "תובנה", NOW);
  insight = setArcLearningInsightExplanation(insight, "meaning", "משמעות", NOW);
  insight = setArcLearningInsightExplanation(insight, "mechanism", "תהליך", NOW);
  assert.deepEqual(resolveAnsweredArcLearningExplanationKinds(insight), ["meaning", "mechanism"]);
});

test("addArcLearningInsightMentalImage appends trimmed descriptions in entry order, ignoring empty input; removeArcLearningInsightMentalImage removes by index only", () => {
  let insight = createArcLearningInsight("i1", "תובנה", NOW);
  insight = addArcLearningInsightMentalImage(insight, "  תמונה א  ", NOW);
  insight = addArcLearningInsightMentalImage(insight, "", LATER);
  insight = addArcLearningInsightMentalImage(insight, "תמונה ב", LATER);
  assert.deepEqual(insight.mentalImages, ["תמונה א", "תמונה ב"]);

  insight = removeArcLearningInsightMentalImage(insight, 0, LATER);
  assert.deepEqual(insight.mentalImages, ["תמונה ב"]);
});

test("upsertArcLearningInsightInList/deleteArcLearningInsightFromList/resolveArcLearningInsightsForTopic behave like every other collection module", () => {
  const i1 = createArcLearningInsight("i1", "א", NOW);
  const i2 = setArcLearningInsightTopic(createArcLearningInsight("i2", "ב", NOW), "topic-1", NOW);
  let list = upsertArcLearningInsightInList([i1], i2);
  assert.equal(list.length, 2);
  assert.deepEqual(resolveArcLearningInsightsForTopic(list, "topic-1").map((i) => i.id), ["i2"]);
  list = deleteArcLearningInsightFromList(list, "i1");
  assert.deepEqual(list.map((i) => i.id), ["i2"]);
});

test("resolveUnfinishedArcLearningInsights returns wants-to-learn insights with no main sentence yet (section 2's own 'continue learning'); isArcLearningInsightReadyForRecall requires both wantsToLearn and a main sentence", () => {
  const saveOnly = createArcLearningInsight("i1", "א", NOW);
  const midFlow = setArcLearningInsightWantsToLearn(createArcLearningInsight("i2", "ב", NOW), true, NOW);
  const ready = setArcLearningInsightMainSentence(setArcLearningInsightWantsToLearn(createArcLearningInsight("i3", "ג", NOW), true, NOW), "משפט", NOW);

  assert.equal(isArcLearningInsightReadyForRecall(saveOnly), false);
  assert.equal(isArcLearningInsightReadyForRecall(midFlow), false);
  assert.equal(isArcLearningInsightReadyForRecall(ready), true);

  const unfinished = resolveUnfinishedArcLearningInsights([saveOnly, midFlow, ready]);
  assert.deepEqual(unfinished.map((i) => i.id), ["i2"], "a save-only insight is not 'unfinished learning' -- it was never opted into learning at all");
});

test("normalizeArcLearningInsight backfills every field a legacy record might be missing, never throwing", () => {
  const legacy = { id: "i1", rawText: "א", createdAt: NOW, updatedAt: NOW } as unknown as ArcLearningInsight;
  const normalized = normalizeArcLearningInsight(legacy);
  assert.equal(normalized.wantsToLearn, false);
  assert.equal(normalized.topicId, null);
  assert.equal(normalized.mainSentence, null);
  assert.equal(normalized.meaningAnswer, null);
  assert.equal(normalized.reasonAnswer, null);
  assert.equal(normalized.mechanismAnswer, null);
  assert.deepEqual(normalized.mentalImages, []);
});
