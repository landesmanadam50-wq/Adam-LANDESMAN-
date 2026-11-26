import test from "node:test";
import assert from "node:assert/strict";

import {
  generateArcMemoryRecallQuestion,
  generateInsightRecallQuestion,
  generateInsightRelationshipRecallQuestion,
  generateLearningMaterialRecallQuestion,
  generateRecallQuestion,
} from "./arcRecallQuestionGeneration.ts";
import type { ArcInsight } from "./arcInsightBelief.ts";
import type { ArcInsightRelationship } from "./arcWriting.ts";
import type { ArcLearningInsight } from "./arcLearningInsight.ts";
import { createArcGymMemoryExercise } from "./arcGym.ts";

const NOW = "2026-01-05T12:00:00.000Z";

function insight(overrides: Partial<ArcInsight> = {}): ArcInsight {
  return {
    id: "ins-1",
    sourceExerciseId: "ex-1",
    taskId: null,
    beliefKind: "general",
    text: "הבנתי שאני מתמודד טוב יותר כשאני עוצר לנשום.",
    occurredAt: NOW,
    createdAt: NOW,
    arcLearningTopicIds: [],
    classification: null,
    classificationNote: null,
    ...overrides,
  };
}

function relationship(overrides: Partial<ArcInsightRelationship> = {}): ArcInsightRelationship {
  return { id: "rel-1", insightIds: ["ins-1", "ins-2"], relationshipType: "cause_effect", explanation: "קבלת הרגש מובילה להתמדה", createdAt: NOW, updatedAt: NOW, ...overrides };
}

function learningInsight(overrides: Partial<ArcLearningInsight> = {}): ArcLearningInsight {
  return {
    id: "learn-1",
    rawText: "raw",
    wantsToLearn: true,
    topicId: "topic-1",
    mainSentence: "פחד הוא איתות, לא פקודה.",
    meaningAnswer: "אפשר לפעול גם כשהפחד נוכח.",
    reasonAnswer: null,
    mechanismAnswer: null,
    mentalImages: [],
    derivedFromConnectionId: null,
    sourceArcInsightId: null,
    whyChain: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

test("generateInsightRecallQuestion reveals the insight's own verbatim text, never invented, and is null for a missing/blank insight", () => {
  assert.equal(generateInsightRecallQuestion(null), null);
  const generated = generateInsightRecallQuestion(insight());
  assert.equal(generated?.revealText, insight().text);
  assert.equal(generateInsightRecallQuestion(insight({ text: "" })), null);
});

test("generateInsightRelationshipRecallQuestion reveals the relationship's own explanation, null when no explanation was ever written", () => {
  assert.equal(generateInsightRelationshipRecallQuestion(null), null);
  const generated = generateInsightRelationshipRecallQuestion(relationship());
  assert.equal(generated?.revealText, "קבלת הרגש מובילה להתמדה");
  assert.equal(generateInsightRelationshipRecallQuestion(relationship({ explanation: null })), null);
});

test("generateLearningMaterialRecallQuestion asks about mainSentence and reveals meaningAnswer -- the same field pairing the existing ARC Learning recall flow already uses, null when either half is missing", () => {
  assert.equal(generateLearningMaterialRecallQuestion(null), null);
  const generated = generateLearningMaterialRecallQuestion(learningInsight());
  assert.ok(generated?.questionText.includes("פחד הוא איתות, לא פקודה."));
  assert.equal(generated?.revealText, "אפשר לפעול גם כשהפחד נוכח.");
  assert.equal(generateLearningMaterialRecallQuestion(learningInsight({ meaningAnswer: null })), null);
});

test("generateArcMemoryRecallQuestion asks about the situation and reveals actionText verbatim, null when either half is blank", () => {
  assert.equal(generateArcMemoryRecallQuestion(null), null);
  const memory = createArcGymMemoryExercise("mem-1", "אני מרגיש עומס", "לעצור ולנשום שלוש נשימות", NOW);
  const generated = generateArcMemoryRecallQuestion(memory);
  assert.equal(generated?.revealText, "לעצור ולנשום שלוש נשימות");
  assert.equal(generateArcMemoryRecallQuestion(createArcGymMemoryExercise("mem-2", "", "x", NOW)), null);
});

test("generateRecallQuestion dispatches to the matching generator for each source kind", () => {
  assert.equal(generateRecallQuestion({ kind: "insight", record: insight() })?.revealText, insight().text);
  assert.equal(generateRecallQuestion({ kind: "insight_relationship", record: relationship() })?.revealText, "קבלת הרגש מובילה להתמדה");
  assert.equal(generateRecallQuestion({ kind: "learning_material", record: learningInsight() })?.revealText, "אפשר לפעול גם כשהפחד נוכח.");
  assert.equal(generateRecallQuestion({ kind: "arc_memory", record: null }), null);
});
