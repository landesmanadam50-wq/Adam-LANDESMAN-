/**
 * data/reminders.ts
 *
 * The I/O half of the "come back later" reminder feature (#4, #5) --
 * deferred Focus Success and the independently-scheduled future ARC
 * session reminder. The pure decision logic (DEFERRAL_OPTIONS,
 * resolveReminderFireDate, resolveReminderRoute) lives in
 * arc/reminders.ts instead, and is unit-tested there directly -- this
 * file only orchestrates real AsyncStorage/expo-notifications calls
 * (via data/storage.ts/data/notifications.ts), so -- like those two
 * modules themselves -- it's exercised for real by running the app,
 * not with node --test.
 */

import { resolveReminderFireDate } from "../arc/reminders.ts";
import type { DeferralOption } from "../arc/reminders.ts";
import { cancelScheduledNotification, scheduleReminderNotification } from "./notifications.ts";
import { clearPendingReminder, loadPendingReminder, savePendingReminder } from "./storage.ts";
import type { PendingReminder, ReminderKind } from "./storage.ts";

export { DEFERRAL_OPTIONS, resolveReminderFireDate, resolveReminderRoute } from "../arc/reminders.ts";
export type { DeferralOption, ReminderRoute } from "../arc/reminders.ts";

export interface ScheduleDeferredReminderInput {
  kind: ReminderKind;
  option: DeferralOption;
  arcRequested: boolean;
  title: string;
  body: string;
  now?: Date;
}

/**
 * Schedules (or re-schedules) the ONE pending reminder for this kind.
 * "Avoid duplicate reminders" (#4, #5) is enforced structurally, not by
 * a separate check: data/storage.ts's PendingReminder is keyed
 * one-per-kind, so loading, cancelling, and overwriting the existing
 * record for this exact kind before scheduling the new one means there
 * can never be two pending reminders of the same kind at once --
 * scheduling again (e.g. the trainee changes their mind about when)
 * simply replaces the old one, cancelling its now-stale notification
 * first so it can never also fire.
 */
export async function scheduleDeferredReminder(input: ScheduleDeferredReminderInput): Promise<void> {
  const now = input.now ?? new Date();
  const existing = await loadPendingReminder(input.kind);
  if (existing) {
    await cancelScheduledNotification(existing.notificationId);
  }
  const fireAt = resolveReminderFireDate(input.option, now);
  const notificationId = await scheduleReminderNotification({
    kind: input.kind,
    fireAt,
    title: input.title,
    body: input.body,
    arcRequested: input.arcRequested,
  });
  const reminder: PendingReminder = {
    kind: input.kind,
    fireAt: fireAt.toISOString(),
    arcRequested: input.arcRequested,
    notificationId,
    createdAt: now.toISOString(),
  };
  await savePendingReminder(reminder);
}

/** Called once a reminder has been acted on (its notification was tapped/handled) so it never fires a stale duplicate later, and so scheduling a new one of the same kind starts clean. */
export async function cancelPendingReminder(kind: ReminderKind): Promise<void> {
  const existing = await loadPendingReminder(kind);
  if (existing) {
    await cancelScheduledNotification(existing.notificationId);
  }
  await clearPendingReminder(kind);
}
