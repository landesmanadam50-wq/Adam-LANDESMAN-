import test from "node:test";
import assert from "node:assert/strict";

import {
  beliefsOfKind,
  createArcInsight,
  createLearnedBelief,
  createNewPlannedBelief,
  createStandaloneInsight,
  createUpdatedBelief,
  linkArcLearningTopicToInsight,
  resolveOriginatingInsight,
  unlinkArcLearningTopicFromInsight,
  upsertBeliefInList,
} from "./arcInsightBelief.ts";
import type { ArcBelief } from "./arcInsightBelief.ts";
import { STANDALONE_ARC_TASK_ID } from "./newArcLiveTypes.ts";

const NOW = "2026-01-05T12:00:00.000Z";

test("createArcInsight freezes the trainee's own words, trimmed, never generated", () => {
  const insight = createArcInsight({ id: "i1", sourceExerciseId: "ex1", taskId: "t1", beliefKind: "identity", text: "  הצלחתי להתמיד גם בלי מוטיבציה  ", occurredAt: NOW, createdAt: NOW });
  assert.equal(insight.text, "הצלחתי להתמיד גם בלי מוטיבציה");
  assert.equal(insight.taskId, "t1");
});

test("createLearnedBelief is tied to the insight and exercise it came from", () => {
  const belief = createLearnedBelief("b1", "identity", "אני מסוגל להתמיד", "i1", "ex1", NOW);
  assert.equal(belief.origin, "learned");
  assert.equal(belief.insightId, "i1");
  assert.equal(belief.sourceExerciseId, "ex1");
});

test("createNewPlannedBelief has no insight/exercise yet -- it is not evidence of anything, just a stated intention", () => {
  const belief = createNewPlannedBelief("b2", "identity", "אני אדם סקרן שאוהב ללמוד דברים חדשים", NOW);
  assert.equal(belief.origin, "new");
  assert.equal(belief.insightId, null);
  assert.equal(belief.sourceExerciseId, null);
});

test("createUpdatedBelief never mutates the previous belief and always gets its own new id", () => {
  const original = createNewPlannedBelief("b3", "identity", "אני אדם סקרן", NOW);
  const updated = createUpdatedBelief("b3-v2", original, "אני אדם סקרן שמתמיד גם כשקשה", "i2", "2026-01-06T00:00:00.000Z");
  assert.equal(updated.origin, "updated");
  assert.equal(updated.id, "b3-v2");
  assert.equal(updated.insightId, "i2");
  assert.equal(original.text, "אני אדם סקרן", "the original record must be completely untouched");
});

test("upsertBeliefInList replaces only the matching id, appends otherwise -- never drops a different belief's row", () => {
  const b1 = createNewPlannedBelief("b1", "identity", "טקסט 1", NOW);
  const b2 = createNewPlannedBelief("b2", "emotional", "טקסט 2", NOW);
  let list: ArcBelief[] = [b1, b2];
  const b1Updated = { ...b1, text: "טקסט מעודכן" };
  list = upsertBeliefInList(list, b1Updated);
  assert.equal(list.length, 2);
  assert.equal(list.find((b) => b.id === "b1")?.text, "טקסט מעודכן");
  assert.equal(list.find((b) => b.id === "b2")?.text, "טקסט 2");

  const b3 = createNewPlannedBelief("b3", "identity", "טקסט 3", NOW);
  list = upsertBeliefInList(list, b3);
  assert.equal(list.length, 3);
});

test("adding a new belief never deletes/overwrites an existing one with a different id (spec rule 15)", () => {
  const original = createLearnedBelief("orig", "identity", "אני מסוגל ללמוד גם כשאין מוטיבציה", "i1", "ex1", NOW);
  const added = createNewPlannedBelief("added", "identity", "אני אדם סקרן", NOW);
  const list = upsertBeliefInList([original], added);
  assert.equal(list.length, 2);
  assert.ok(list.some((b) => b.id === "orig" && b.text === original.text));
});

test("beliefsOfKind filters by kind and sorts most-recently-updated first", () => {
  const emotional = createNewPlannedBelief("e1", "emotional", "רגשית", "2026-01-01T00:00:00.000Z");
  const identityOld = createNewPlannedBelief("id1", "identity", "ישנה", "2026-01-02T00:00:00.000Z");
  const identityNew = createNewPlannedBelief("id2", "identity", "חדשה", "2026-01-03T00:00:00.000Z");
  const result = beliefsOfKind([emotional, identityOld, identityNew], "identity");
  assert.deepEqual(result.map((b) => b.id), ["id2", "id1"]);
});

test("resolveOriginatingInsight returns null for a 'new' belief (no evidence yet), and the matching insight for a 'learned'/'updated' one", () => {
  const insight = createArcInsight({ id: "i1", sourceExerciseId: "ex1", taskId: null, beliefKind: "identity", text: "תובנה", occurredAt: NOW, createdAt: NOW });
  const learned = createLearnedBelief("b1", "identity", "אמונה", "i1", "ex1", NOW);
  const fresh = createNewPlannedBelief("b2", "identity", "אמונה חדשה", NOW);
  assert.equal(resolveOriginatingInsight(learned, [insight])?.id, "i1");
  assert.equal(resolveOriginatingInsight(fresh, [insight]), null);
});

// --- ARCHI -- Unified Development Specification task, Part 3/4: freeform "general" insights ---

test("createStandaloneInsight produces a taskId-less, beliefKind:'general' insight using the shared STANDALONE_ARC_TASK_ID sentinel as its sourceExerciseId -- never a second placeholder concept", () => {
  const insight = createStandaloneInsight("i-standalone", "  שווה לי לכתוב דברים כאלה גם בלי משימה  ", NOW);
  assert.equal(insight.sourceExerciseId, STANDALONE_ARC_TASK_ID);
  assert.equal(insight.taskId, null);
  assert.equal(insight.beliefKind, "general");
  assert.equal(insight.text, "שווה לי לכתוב דברים כאלה גם בלי משימה");
});

test("an insight's beliefKind can be 'general' (ArcInsightKind) without affecting ArcBelief's own stricter 'emotional'|'identity' contract", () => {
  const standalone = createStandaloneInsight("i1", "תובנה חופשית", NOW);
  assert.equal(standalone.beliefKind, "general");
  // A real ArcBelief, by contrast, only ever accepts "emotional"/"identity" -- this is a compile-time guarantee (createLearnedBelief's own kind param type), exercised here only to document the deliberate asymmetry.
  const belief = createLearnedBelief("b1", "identity", "אמונה", "i1", "ex1", NOW);
  assert.equal(belief.beliefKind, "identity");
});

// --- ARCHI -- Insight Collection x ARC Learning linking task ---

test("a freshly created insight (either entry point) starts with an empty arcLearningTopicIds array -- no topic linked by default", () => {
  const captured = createArcInsight({ id: "i1", sourceExerciseId: "ex1", taskId: null, beliefKind: "identity", text: "תובנה", occurredAt: NOW, createdAt: NOW });
  assert.deepEqual(captured.arcLearningTopicIds, []);
  const standalone = createStandaloneInsight("i2", "תובנה חופשית", NOW);
  assert.deepEqual(standalone.arcLearningTopicIds, []);
});

test("1. linkArcLearningTopicToInsight links an insight to one topic", () => {
  const insight = createStandaloneInsight("i1", "תובנה", NOW);
  const linked = linkArcLearningTopicToInsight(insight, "topic-economy");
  assert.deepEqual(linked.arcLearningTopicIds, ["topic-economy"]);
});

test("2. linkArcLearningTopicToInsight links the same insight to several topics at once -- the exact spec example (economy/history/public policy)", () => {
  let insight = createStandaloneInsight("i1", "כאשר המדינה מעודדת השקעה בטכנולוגיה, יותר אנשים וחברות עשויים להיות מוכנים להשקיע בה.", NOW);
  insight = linkArcLearningTopicToInsight(insight, "topic-economy");
  insight = linkArcLearningTopicToInsight(insight, "topic-history");
  insight = linkArcLearningTopicToInsight(insight, "topic-public-policy");
  assert.deepEqual(insight.arcLearningTopicIds, ["topic-economy", "topic-history", "topic-public-policy"]);
});

test("linkArcLearningTopicToInsight is idempotent -- linking the same topic twice never duplicates it", () => {
  let insight = createStandaloneInsight("i1", "תובנה", NOW);
  insight = linkArcLearningTopicToInsight(insight, "topic-1");
  insight = linkArcLearningTopicToInsight(insight, "topic-1");
  assert.deepEqual(insight.arcLearningTopicIds, ["topic-1"]);
});

test("5. unlinkArcLearningTopicFromInsight removes only the one topic link -- the insight record itself, and its other links, are left untouched", () => {
  let insight = createStandaloneInsight("i1", "תובנה", NOW);
  insight = linkArcLearningTopicToInsight(insight, "topic-economy");
  insight = linkArcLearningTopicToInsight(insight, "topic-history");
  const unlinked = unlinkArcLearningTopicFromInsight(insight, "topic-economy");
  assert.deepEqual(unlinked.arcLearningTopicIds, ["topic-history"]);
  assert.equal(unlinked.id, "i1");
  assert.equal(unlinked.text, "תובנה");
});

test("unlinkArcLearningTopicFromInsight is a no-op when the topic was never linked", () => {
  const insight = createStandaloneInsight("i1", "תובנה", NOW);
  const unchanged = unlinkArcLearningTopicFromInsight(insight, "never-linked");
  assert.deepEqual(unchanged.arcLearningTopicIds, []);
});

test("8. linking the same topic from two different insights never collides -- each insight's own array is fully independent", () => {
  let insightA = createStandaloneInsight("iA", "תובנה א", NOW);
  let insightB = createStandaloneInsight("iB", "תובנה ב", NOW);
  insightA = linkArcLearningTopicToInsight(insightA, "topic-1");
  insightB = linkArcLearningTopicToInsight(insightB, "topic-1");
  assert.deepEqual(insightA.arcLearningTopicIds, ["topic-1"]);
  assert.deepEqual(insightB.arcLearningTopicIds, ["topic-1"]);
  const unlinkedA = unlinkArcLearningTopicFromInsight(insightA, "topic-1");
  assert.deepEqual(unlinkedA.arcLearningTopicIds, []);
  assert.deepEqual(insightB.arcLearningTopicIds, ["topic-1"], "unlinking from A must never affect B's own, separate array");
});
