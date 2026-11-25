/**
 * arc/arcReminders.ts
 *
 * ARC Reminders task: the shared types for all three reminder families
 * (ARC Mantras, ARC Active Recall, ARC Task Reminders) plus their pure
 * constructors. Every `sourceRef` below stores ONLY a reference id to
 * the real ARCHI record it points at -- never a copy of its text --
 * so content is always resolved fresh, at schedule/delivery/display
 * time, from the live record (arc/arcMantraContent.ts,
 * arc/arcRecallQuestionGeneration.ts). This is the mechanical form of
 * "read-through, never a frozen copy" and "never invent content."
 *
 * No AsyncStorage, no navigation, no React here -- same split as every
 * other arc/*.ts module; data/arcMantraReminders.ts,
 * data/arcRecallReminders.ts, data/arcRecallChatHistory.ts and
 * data/arcTaskReminderSettings.ts are the thin I/O wrappers.
 */

import type { ReminderSchedule } from "./arcReminderSchedule.ts";

export type ArcMantraSubtype = "desired_feeling" | "arc_memory" | "present_identity" | "future_identity" | "arc_goal";

export type ArcMantraSourceRef =
  | { kind: "desired_feeling" }
  | { kind: "arc_memory"; memoryExerciseId: string }
  /** insightId null = "resolve the most recently captured identity-tagged insight at delivery time", never a frozen pick. */
  | { kind: "present_identity"; insightId: string | null }
  | { kind: "future_identity" }
  | { kind: "arc_goal"; goalId: string };

export interface ArcMantraReminder {
  id: string;
  subtype: ArcMantraSubtype;
  sourceRef: ArcMantraSourceRef;
  schedule: ReminderSchedule;
  createdAt: string;
  updatedAt: string;
}

export function generateArcMantraReminderId(): string {
  return `arc-mantra-reminder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcMantraReminder(subtype: ArcMantraSubtype, sourceRef: ArcMantraSourceRef, schedule: ReminderSchedule, now: string): ArcMantraReminder {
  return { id: generateArcMantraReminderId(), subtype, sourceRef, schedule, createdAt: now, updatedAt: now };
}

export function upsertArcMantraReminderInList(reminders: ArcMantraReminder[], reminder: ArcMantraReminder): ArcMantraReminder[] {
  const index = reminders.findIndex((existing) => existing.id === reminder.id);
  if (index === -1) return [...reminders, reminder];
  const next = [...reminders];
  next[index] = reminder;
  return next;
}

export function deleteArcMantraReminderFromList(reminders: ArcMantraReminder[], id: string): ArcMantraReminder[] {
  return reminders.filter((reminder) => reminder.id !== id);
}

export type ArcRecallSourceKind = "insight" | "insight_relationship" | "learning_material" | "arc_memory";

export interface ArcRecallSourceRef {
  kind: ArcRecallSourceKind;
  sourceId: string;
}

export interface ArcRecallReminder {
  id: string;
  sourceRef: ArcRecallSourceRef;
  schedule: ReminderSchedule;
  createdAt: string;
  updatedAt: string;
}

export function generateArcRecallReminderId(): string {
  return `arc-recall-reminder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcRecallReminder(sourceRef: ArcRecallSourceRef, schedule: ReminderSchedule, now: string): ArcRecallReminder {
  return { id: generateArcRecallReminderId(), sourceRef, schedule, createdAt: now, updatedAt: now };
}

export function upsertArcRecallReminderInList(reminders: ArcRecallReminder[], reminder: ArcRecallReminder): ArcRecallReminder[] {
  const index = reminders.findIndex((existing) => existing.id === reminder.id);
  if (index === -1) return [...reminders, reminder];
  const next = [...reminders];
  next[index] = reminder;
  return next;
}

export function deleteArcRecallReminderFromList(reminders: ArcRecallReminder[], id: string): ArcRecallReminder[] {
  return reminders.filter((reminder) => reminder.id !== id);
}

/**
 * One chat "turn": a delivered question, frozen at delivery time (it's
 * a received message -- history, never a live pointer that could
 * silently reword itself later), plus the trainee's own answer once
 * given. The original saved answer it can be compared against is
 * always resolved FRESH from `sourceRef` at reveal time, never stored
 * here -- so an edit to the source material after delivery is still
 * reflected the moment the trainee reveals it.
 */
export interface ArcRecallChatMessage {
  id: string;
  reminderId: string;
  sourceRef: ArcRecallSourceRef;
  questionText: string;
  deliveredAt: string;
  userAnswerText: string | null;
  userAnsweredAt: string | null;
  revealedOriginalAt: string | null;
  revealedEarly: boolean;
}

export function generateArcRecallChatMessageId(): string {
  return `arc-recall-chat-message-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcRecallChatMessage(reminderId: string, sourceRef: ArcRecallSourceRef, questionText: string, now: string): ArcRecallChatMessage {
  return {
    id: generateArcRecallChatMessageId(),
    reminderId,
    sourceRef,
    questionText,
    deliveredAt: now,
    userAnswerText: null,
    userAnsweredAt: null,
    revealedOriginalAt: null,
    revealedEarly: false,
  };
}

/** Idempotent at the record level (same message id twice is a plain overwrite, not a double-answer) -- the caller's own "answer once" discipline lives in data/arcRecallChatHistory.ts. */
export function recordArcRecallChatAnswer(message: ArcRecallChatMessage, answerText: string, now: string): ArcRecallChatMessage {
  return { ...message, userAnswerText: answerText, userAnsweredAt: now };
}

/** `early: true` when requested before `userAnswerText` is set -- the one explicit opt-in path to seeing the original before attempting an answer (never the default). */
export function revealArcRecallChatMessage(message: ArcRecallChatMessage, now: string): ArcRecallChatMessage {
  return { ...message, revealedOriginalAt: now, revealedEarly: message.userAnswerText === null };
}

export interface ArcTaskReminderSettings {
  transitionNotificationEnabled: boolean;
  completionSoundEnabled: boolean;
  mantraRemindersEnabled: boolean;
  activeRecallRemindersEnabled: boolean;
  hideContentOnLockScreen: boolean;
  /**
   * ARCHI -- Adaptive Task Execution & Emotional Persistence task,
   * section 2: the persistent "task not started" notification
   * (data/taskNotStartedNotification.ts) -- an independent toggle, same
   * "each one gates exactly one thing" convention as every other field
   * here.
   */
  taskNotStartedNotificationEnabled: boolean;
  updatedAt: string;
}

export function createDefaultArcTaskReminderSettings(now: string): ArcTaskReminderSettings {
  return {
    transitionNotificationEnabled: true,
    completionSoundEnabled: true,
    mantraRemindersEnabled: true,
    activeRecallRemindersEnabled: true,
    hideContentOnLockScreen: false,
    taskNotStartedNotificationEnabled: true,
    updatedAt: now,
  };
}

/** Backward compatibility: a settings record saved before a field existed normalizes to the same default that field starts with, never crashes, never silently disables something the trainee never touched. */
export function normalizeArcTaskReminderSettings(settings: Partial<ArcTaskReminderSettings> | null | undefined, now: string): ArcTaskReminderSettings {
  const defaults = createDefaultArcTaskReminderSettings(now);
  if (!settings) return defaults;
  return {
    transitionNotificationEnabled: settings.transitionNotificationEnabled ?? defaults.transitionNotificationEnabled,
    completionSoundEnabled: settings.completionSoundEnabled ?? defaults.completionSoundEnabled,
    mantraRemindersEnabled: settings.mantraRemindersEnabled ?? defaults.mantraRemindersEnabled,
    activeRecallRemindersEnabled: settings.activeRecallRemindersEnabled ?? defaults.activeRecallRemindersEnabled,
    hideContentOnLockScreen: settings.hideContentOnLockScreen ?? defaults.hideContentOnLockScreen,
    taskNotStartedNotificationEnabled: settings.taskNotStartedNotificationEnabled ?? defaults.taskNotStartedNotificationEnabled,
    updatedAt: settings.updatedAt ?? now,
  };
}
