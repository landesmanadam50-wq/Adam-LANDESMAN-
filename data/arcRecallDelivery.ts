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
 *
 * `deliverArcRecallReminder`/`recordArcRecallAnswer` below are the two
 * I/O entry points the (future, Phase 5+) rolling-window scheduler and
 * data/taskAlarm.ts's own inline-reply handling each call into -- built
 * now, alongside the native action/input wiring (data/notifications.ts's
 * ACTION_ARC_RECALL_ANSWER), so that wiring has real functions to call
 * the moment a caller exists, never a second delivery mechanism later.
 */

import {
  generateArcMemoryRecallQuestion,
  generateInsightRecallQuestion,
  generateInsightRelationshipRecallQuestion,
  generateLearningMaterialRecallQuestion,
} from "../arc/arcRecallQuestionGeneration.ts";
import type { GeneratedRecallQuestion } from "../arc/arcRecallQuestionGeneration.ts";
import { createArcRecallChatMessage, recordArcRecallChatAnswer } from "../arc/arcReminders.ts";
import type { ArcRecallReminder } from "../arc/arcReminders.ts";
import { scheduleReminderNotification } from "./notifications.ts";
import {
  appendArcRecallChatMessageEntry,
  loadArcGymMemoryExercises,
  loadArcInsightRelationships,
  loadArcInsights,
  loadArcLearningInsights,
  loadArcRecallChatHistory,
  updateArcRecallChatMessageEntry,
} from "./storage.ts";

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

/**
 * Resolves this reminder's live question, skipping silently (never a
 * fabricated question) when `resolveArcRecallReminderQuestion` returns
 * `null`; otherwise appends a new, permanent `ArcRecallChatMessage` --
 * frozen at this exact moment, per that type's own doc -- and schedules
 * the real OS notification for `fireAt` through the SAME
 * `scheduleReminderNotification` every other reminder kind already
 * uses, carrying both `arcReminderId` (tap-to-open-chat,
 * data/reminders.ts's routeTappedReminder) and `arcRecallChatMessageId`
 * (inline-reply, this module's own `recordArcRecallAnswer` below) in
 * its data payload.
 */
export async function deliverArcRecallReminder(reminder: ArcRecallReminder, fireAt: Date, now: string): Promise<string | null> {
  const question = await resolveArcRecallReminderQuestion(reminder);
  if (!question) return null;
  const message = createArcRecallChatMessage(reminder.id, reminder.sourceRef, question.questionText, now);
  await appendArcRecallChatMessageEntry(message);
  return scheduleReminderNotification({
    kind: "arcRecallQuestion",
    fireAt,
    title: "ARCHI — שאלת זיכרון",
    body: question.questionText,
    arcRequested: false,
    arcReminderId: reminder.id,
    arcRecallChatMessageId: message.id,
  });
}

/**
 * The ONE write path for recording an Active Recall answer -- called
 * identically whether the trainee typed it inline from the notification
 * (data/taskAlarm.ts's handleTaskAlarmEvent, reading event.detail.input)
 * or from the chat screen itself. A message id that no longer exists
 * (reminder/message already cleared) is a silent no-op, never a crash.
 */
export async function recordArcRecallAnswer(chatMessageId: string, answerText: string, now: string): Promise<void> {
  const messages = await loadArcRecallChatHistory();
  const message = messages.find((item) => item.id === chatMessageId);
  if (!message) return;
  await updateArcRecallChatMessageEntry(recordArcRecallChatAnswer(message, answerText, now));
}
