/**
 * data/arcReminderCrud.ts
 *
 * ARC Reminders task, Phase 5: the one orchestration layer every
 * create/edit/pause/resume/delete UI action for an ArcMantraReminder/
 * ArcRecallReminder goes through -- wrapping the plain storage CRUD
 * (data/storage.ts's upsert/delete entries, which know nothing about
 * notifications) with the real side effect each action needs:
 *  - create/edit/resume: re-run data/arcReminderScheduler.ts's own
 *    topUpRemindersIfNeeded() so the change is reflected in real
 *    scheduled notifications immediately, never only on the next
 *    app-foreground/cold-start.
 *  - pause: same -- topUpOneReminder's own paused branch cancels every
 *    already-scheduled trigger and clears the storage record for THIS
 *    one reminder; it already diffs per-reminder, so this never touches
 *    any other reminder's own schedule.
 *  - delete: cancels every currently-scheduled trigger for that exact
 *    reminder BEFORE removing the reminder record itself (never leaves
 *    a stray notification for an id that no longer resolves to
 *    anything), then clears its ArcReminderScheduledTrigger record.
 */

import {
  clearArcReminderScheduledTriggers,
  deleteArcMantraReminderEntry,
  deleteArcRecallReminderEntry,
  loadArcReminderScheduledTriggers,
  upsertArcMantraReminderEntry,
  upsertArcRecallReminderEntry,
} from "./storage.ts";
import type { ArcMantraReminder, ArcRecallReminder } from "../arc/arcReminders.ts";
import { cancelScheduledNotification } from "./notifications.ts";
import { topUpRemindersIfNeeded } from "./arcReminderScheduler.ts";

async function cancelAllTriggersFor(reminderId: string): Promise<void> {
  const triggers = await loadArcReminderScheduledTriggers(reminderId);
  await Promise.all(triggers.map((trigger) => cancelScheduledNotification(trigger.notificationId)));
  await clearArcReminderScheduledTriggers(reminderId);
}

export async function saveArcMantraReminder(reminder: ArcMantraReminder): Promise<void> {
  await upsertArcMantraReminderEntry(reminder);
  await topUpRemindersIfNeeded();
}

export async function deleteArcMantraReminder(id: string): Promise<void> {
  await cancelAllTriggersFor(id);
  await deleteArcMantraReminderEntry(id);
}

export async function saveArcRecallReminder(reminder: ArcRecallReminder): Promise<void> {
  await upsertArcRecallReminderEntry(reminder);
  await topUpRemindersIfNeeded();
}

export async function deleteArcRecallReminder(id: string): Promise<void> {
  await cancelAllTriggersFor(id);
  await deleteArcRecallReminderEntry(id);
}
