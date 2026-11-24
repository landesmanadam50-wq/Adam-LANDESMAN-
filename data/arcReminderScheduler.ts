/**
 * data/arcReminderScheduler.ts
 *
 * ARC Reminders task: the rolling-window top-up orchestrator every
 * mantra/recall reminder's own scheduling ultimately runs through --
 * the one caller of arc/reminderRollingSchedule.ts's pure
 * computeTopUpPlan/needsTopUp, data/arcMantraDelivery.ts's
 * deliverArcMantraReminder, and data/arcRecallDelivery.ts's
 * deliverArcRecallReminder. Deliberately built only once Phase 5's
 * creation UI exists to actually call it from -- an untestable,
 * ungrounded scheduler with no real reminder ever created would have
 * nothing honest to verify against.
 *
 * `topUpRemindersIfNeeded()` is the ONE entry point every call site
 * (app foreground, app/_layout.tsx's own cold-start registration, and
 * immediately after a reminder's own create/edit/pause/resume/delete)
 * calls -- never a second, parallel scheduling loop. Each reminder is
 * topped up independently (`topUpOneReminder`), so one reminder's own
 * stale/missing source record (its deliver function returning `null`,
 * per arc/arcMantraContent.ts's/arc/arcRecallQuestionGeneration.ts's own
 * "never fabricate" contract) never blocks every other reminder's own
 * top-up in the same pass.
 */

import { computeTopUpPlan, needsTopUp } from "../arc/reminderRollingSchedule.ts";
import type { ReminderSchedule } from "../arc/arcReminderSchedule.ts";
import { deliverArcMantraReminder } from "./arcMantraDelivery.ts";
import { deliverArcRecallReminder } from "./arcRecallDelivery.ts";
import { cancelScheduledNotification } from "./notifications.ts";
import {
  loadArcMantraReminders,
  loadArcRecallReminders,
  loadArcReminderScheduledTriggers,
  loadArcTaskReminderSettings,
  saveArcReminderScheduledTriggers,
} from "./storage.ts";
import type { ArcReminderScheduledTrigger } from "./storage.ts";
import type { ArcMantraReminder, ArcRecallReminder } from "../arc/arcReminders.ts";

/**
 * One reminder's own top-up: diffs what's already scheduled against the
 * freshly-resolved rolling window, cancels whatever fell out of it
 * (schedule/days changed, or paused), and schedules whatever's newly
 * inside it -- calling `deliver` (the one real notifee scheduling call)
 * exactly once per NEW slot, never re-delivering an already-scheduled
 * one. `deliver` returning `null` (nothing to show yet for that source
 * record) is a silent skip for that one slot, never retried in the same
 * pass -- the next top-up run (on the next foreground/edit) tries again
 * naturally.
 */
async function topUpOneReminder(reminderId: string, schedule: ReminderSchedule, now: Date, deliver: (fireAt: Date) => Promise<string | null>): Promise<void> {
  const existing = await loadArcReminderScheduledTriggers(reminderId);
  const furthest = existing.reduce<Date | null>((max, trigger) => {
    const fireAt = new Date(trigger.fireAt);
    return max === null || fireAt > max ? fireAt : max;
  }, null);
  if (!needsTopUp(furthest, now)) return;

  if (schedule.paused) {
    await Promise.all(existing.map((trigger) => cancelScheduledNotification(trigger.notificationId)));
    await saveArcReminderScheduledTriggers(reminderId, []);
    return;
  }

  const plan = computeTopUpPlan(reminderId, existing.map((trigger) => trigger.triggerId), schedule, now);
  await Promise.all(
    plan.toCancel.map((triggerId) => {
      const trigger = existing.find((item) => item.triggerId === triggerId);
      return trigger ? cancelScheduledNotification(trigger.notificationId) : Promise.resolve();
    })
  );
  const kept = existing.filter((trigger) => !plan.toCancel.includes(trigger.triggerId));

  const added: ArcReminderScheduledTrigger[] = [];
  for (const slot of plan.toSchedule) {
    const notificationId = await deliver(slot.time);
    if (notificationId) added.push({ triggerId: slot.id, notificationId, fireAt: slot.time.toISOString() });
  }
  await saveArcReminderScheduledTriggers(reminderId, [...kept, ...added]);
}

/**
 * Called on app foreground, on cold start (app/_layout.tsx), and
 * immediately after any create/edit/pause/resume/delete of a reminder
 * definition. Each of mantra/recall's own settings toggle
 * (ArcTaskReminderSettings.mantraRemindersEnabled/activeRecallRemindersEnabled)
 * gates ONLY that family -- disabling one never stops the other's own
 * top-up, and a reminder whose own family is disabled is left exactly
 * as scheduled (never force-cancelled just because the toggle is off
 * right now) so re-enabling it resumes without needing to re-create
 * anything.
 */
export async function topUpRemindersIfNeeded(now: Date = new Date()): Promise<void> {
  const settings = await loadArcTaskReminderSettings();
  if (settings.mantraRemindersEnabled) {
    const mantras = await loadArcMantraReminders();
    await Promise.all(mantras.map((reminder) => topUpMantraReminder(reminder, now)));
  }
  if (settings.activeRecallRemindersEnabled) {
    const recalls = await loadArcRecallReminders();
    await Promise.all(recalls.map((reminder) => topUpRecallReminder(reminder, now)));
  }
}

async function topUpMantraReminder(reminder: ArcMantraReminder, now: Date): Promise<void> {
  await topUpOneReminder(reminder.id, reminder.schedule, now, (fireAt) => deliverArcMantraReminder(reminder, fireAt));
}

async function topUpRecallReminder(reminder: ArcRecallReminder, now: Date): Promise<void> {
  await topUpOneReminder(reminder.id, reminder.schedule, now, (fireAt) => deliverArcRecallReminder(reminder, fireAt, now.toISOString()));
}
