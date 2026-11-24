/**
 * data/arcRecallDelivery.ts
 *
 * ARC Reminders task: given one ArcRecallReminder, loads its real
 * source record fresh and generates the question/reveal-answer pair to
 * deliver -- the I/O bridge to the pure generators in
 * arc/arcRecallQuestionGeneration.ts, mirroring data/arcMantraDelivery.ts's
 * own split exactly. `null` means skip this delivery (nothing to ask
 * about yet, e.g. the source record was deleted since the reminder was
 * created) -- never an invented question.
 */

import {
  generateArcMemoryRecallQuestion,
  generateInsightRecallQuestion,
  generateInsightRelationshipRecallQuestion,
  generateLearningMaterialRecallQuestion,
} from "../arc/arcRecallQuestionGeneration.ts";
import type { GeneratedRecallQuestion } from "../arc/arcRecallQuestionGeneration.ts";
import type { ArcRecallReminder } from "../arc/arcReminders.ts";
import { loadArcGymMemoryExercises, loadArcInsightRelationships, loadArcInsights, loadArcLearningInsights } from "./storage.ts";

export async function resolveArcRecallReminderQuestion(reminder: ArcRecallReminder): Promise<GeneratedRecallQuestion | null> {
  const sourceId = reminder.sourceRef.sourceId;
  switch (reminder.sourceRef.kind) {
    case "insight": {
      const insights = await loadArcInsights();
      const insight = insights.find((item) => item.id === sourceId) ?? null;
      return generateInsightRecallQuestion(insight);
    }
    case "insight_relationship": {
      const relationships = await loadArcInsightRelationships();
      const relationship = relationships.find((item) => item.id === sourceId) ?? null;
      return generateInsightRelationshipRecallQuestion(relationship);
    }
    case "learning_material": {
      const learningInsights = await loadArcLearningInsights();
      const learningInsight = learningInsights.find((item) => item.id === sourceId) ?? null;
      return generateLearningMaterialRecallQuestion(learningInsight);
    }
    case "arc_memory": {
      const memories = await loadArcGymMemoryExercises();
      const memory = memories.find((item) => item.id === sourceId) ?? null;
      return generateArcMemoryRecallQuestion(memory);
    }
  }
}
