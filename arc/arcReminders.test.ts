import test from "node:test";
import assert from "node:assert/strict";

import {
  createArcMantraReminder,
  createArcRecallChatMessage,
  createArcRecallReminder,
  createDefaultArcTaskReminderSettings,
  deleteArcMantraReminderFromList,
  deleteArcRecallReminderFromList,
  normalizeArcTaskReminderSettings,
  recordArcRecallChatAnswer,
  revealArcRecallChatMessage,
  upsertArcMantraReminderInList,
  upsertArcRecallReminderInList,
} from "./arcReminders.ts";
import { createFixedTimesSchedule } from "./arcReminderSchedule.ts";

const NOW = "2026-01-05T12:00:00.000Z";

test("createArcMantraReminder stores only the sourceRef, never a copy of resolved text, and upsert/delete are scoped by id", () => {
  const schedule = createFixedTimesSchedule(["08:00"], [], NOW);
  const reminder = createArcMantraReminder("arc_memory", { kind: "arc_memory", memoryExerciseId: "mem-1" }, schedule, NOW);
  assert.equal(reminder.sourceRef.kind, "arc_memory");
  assert.ok(!("actionText" in reminder.sourceRef));

  let list = upsertArcMantraReminderInList([], reminder);
  assert.equal(list.length, 1);
  const edited = { ...reminder, updatedAt: "later" };
  list = upsertArcMantraReminderInList(list, edited);
  assert.equal(list.length, 1);
  assert.equal(list[0].updatedAt, "later");

  list = deleteArcMantraReminderFromList(list, reminder.id);
  assert.equal(list.length, 0);
});

test("createArcRecallReminder/upsert/delete follow the exact same id-scoped CRUD convention", () => {
  const schedule = createFixedTimesSchedule(["21:00"], [], NOW);
  const reminder = createArcRecallReminder({ kind: "insight", sourceId: "ins-1" }, schedule, NOW);
  let list = upsertArcRecallReminderInList([], reminder);
  assert.equal(list.length, 1);
  list = deleteArcRecallReminderFromList(list, reminder.id);
  assert.equal(list.length, 0);
});

test("recordArcRecallChatAnswer sets the answer fields without touching reveal state, and revealArcRecallChatMessage marks revealedEarly correctly based on whether an answer already exists", () => {
  const message = createArcRecallChatMessage("rem-1", { kind: "insight", sourceId: "ins-1" }, "מה למדת?", NOW);
  assert.equal(message.userAnswerText, null);
  assert.equal(message.revealedOriginalAt, null);

  const earlyReveal = revealArcRecallChatMessage(message, "2026-01-05T12:05:00.000Z");
  assert.equal(earlyReveal.revealedEarly, true);
  assert.equal(earlyReveal.revealedOriginalAt, "2026-01-05T12:05:00.000Z");

  const answered = recordArcRecallChatAnswer(message, "זה מה שלמדתי", "2026-01-05T12:10:00.000Z");
  assert.equal(answered.userAnswerText, "זה מה שלמדתי");
  assert.equal(answered.revealedOriginalAt, null);
  const normalReveal = revealArcRecallChatMessage(answered, "2026-01-05T12:11:00.000Z");
  assert.equal(normalReveal.revealedEarly, false);
});

test("createDefaultArcTaskReminderSettings enables everything except lock-screen hiding, and normalizeArcTaskReminderSettings backfills a record saved before a field existed without disabling anything the trainee never touched", () => {
  const defaults = createDefaultArcTaskReminderSettings(NOW);
  assert.equal(defaults.transitionNotificationEnabled, true);
  assert.equal(defaults.completionSoundEnabled, true);
  assert.equal(defaults.mantraRemindersEnabled, true);
  assert.equal(defaults.activeRecallRemindersEnabled, true);
  assert.equal(defaults.hideContentOnLockScreen, false);
  assert.equal(defaults.taskNotStartedNotificationEnabled, true);

  const legacy = { transitionNotificationEnabled: false } as any;
  const normalized = normalizeArcTaskReminderSettings(legacy, NOW);
  assert.equal(normalized.transitionNotificationEnabled, false);
  assert.equal(normalized.completionSoundEnabled, true);
  assert.equal(normalized.mantraRemindersEnabled, true);
  assert.equal(normalized.taskNotStartedNotificationEnabled, true, "a record saved before this field existed must default it to enabled, never silently disabled");

  assert.deepEqual(normalizeArcTaskReminderSettings(null, NOW), createDefaultArcTaskReminderSettings(NOW));
});
