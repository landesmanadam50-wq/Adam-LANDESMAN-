/**
 * arc/arcRecallQuestionGeneration.ts
 *
 * ARC Reminders task: one question generator per ARC Active Recall
 * source kind, each pairing a templated QUESTION with the EXACT
 * existing field it reveals as the answer -- never an invented quiz.
 * Mirrors arc/arcMantraContent.ts's own discipline (one resolver per
 * kind, the caller already holds the loaded record, this module never
 * touches storage) and arc/spacedRepetition.ts's own self-rated-recall
 * philosophy: the trainee answers in their own words first, then
 * compares against their own saved text -- this module only decides
 * WHAT question to ask and WHICH saved field is the reveal, never a
 * right/wrong grader.
 */

import type { ArcInsight } from "./arcInsightBelief.ts";
import type { ArcInsightRelationship } from "./arcWriting.ts";
import type { ArcLearningInsight } from "./arcLearningInsight.ts";
import type { ArcGymMemoryExercise } from "./arcGym.ts";
import type { ArcRecallSourceKind } from "./arcReminders.ts";

export interface GeneratedRecallQuestion {
  questionText: string;
  /** The exact saved text this question's reveal compares against -- never invented, always the source record's own field. */
  revealText: string;
}

export function generateInsightRecallQuestion(insight: ArcInsight | null): GeneratedRecallQuestion | null {
  if (!insight || !insight.text.trim()) return null;
  return { questionText: "מה הייתה התובנה שרשמת לעצמך?", revealText: insight.text.trim() };
}

export function generateInsightRelationshipRecallQuestion(relationship: ArcInsightRelationship | null): GeneratedRecallQuestion | null {
  if (!relationship || !relationship.explanation?.trim()) return null;
  return { questionText: "מה הקשר שמצאת בין שתי התובנות האלה?", revealText: relationship.explanation.trim() };
}

/** Prefers mainSentence as the question prompt ("what does this mean?") and meaningAnswer as the reveal, matching the existing ARC Learning recall flow's own field pairing (arc/arcLearningReview.ts) -- never a second, competing question/answer pairing for the same record. */
export function generateLearningMaterialRecallQuestion(insight: ArcLearningInsight | null): GeneratedRecallQuestion | null {
  const mainSentence = insight?.mainSentence?.trim();
  const meaningAnswer = insight?.meaningAnswer?.trim();
  if (!mainSentence || !meaningAnswer) return null;
  return { questionText: `מה המשמעות של: "${mainSentence}"?`, revealText: meaningAnswer };
}

export function generateArcMemoryRecallQuestion(memory: ArcGymMemoryExercise | null): GeneratedRecallQuestion | null {
  const situationText = memory?.situationText.trim();
  const actionText = memory?.actionText.trim();
  if (!situationText || !actionText) return null;
  return { questionText: `מה אתה עושה כש${situationText}?`, revealText: actionText };
}

export type ArcRecallSourceRecord =
  | { kind: "insight"; record: ArcInsight | null }
  | { kind: "insight_relationship"; record: ArcInsightRelationship | null }
  | { kind: "learning_material"; record: ArcLearningInsight | null }
  | { kind: "arc_memory"; record: ArcGymMemoryExercise | null };

/** One dispatcher over the four generators above, for callers (data/arcRecallDelivery.ts) that already loaded whichever record matches a reminder's own `sourceRef.kind` and just want the one matching question. */
export function generateRecallQuestion(source: ArcRecallSourceRecord): GeneratedRecallQuestion | null {
  switch (source.kind) {
    case "insight":
      return generateInsightRecallQuestion(source.record);
    case "insight_relationship":
      return generateInsightRelationshipRecallQuestion(source.record);
    case "learning_material":
      return generateLearningMaterialRecallQuestion(source.record);
    case "arc_memory":
      return generateArcMemoryRecallQuestion(source.record);
  }
}

export function arcRecallSourceKindOf(source: ArcRecallSourceRecord): ArcRecallSourceKind {
  return source.kind;
}
