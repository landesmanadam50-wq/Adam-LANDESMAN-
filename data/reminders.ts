/**
 * data/reminders.ts
 *
 * The I/O half of the "come back later" reminder feature -- the
 * independently-scheduled future ARC session reminder
 * (scheduleDeferredReminder, kind "arc", see app/index.tsx), and,
 * coordinated timer/dwell task (Part 5-11), the future-scheduled
 * Success Focus (scheduleFutureSuccessFocus/cancelFutureSuccessFocus,
 * kind "focusSuccess"). The pure decision logic (DEFERRAL_OPTIONS,
 * resolveReminderFireDate, resolveReminderRoute) lives in
 * arc/reminders.ts instead, and is unit-tested there directly -- this
 * file only orchestrates real AsyncStorage/expo-notifications calls
 * (via data/storage.ts/data/notifications.ts), so -- like those two
 * modules themselves -- it's exercised for real by running the app,
 * not with node --test.
 */

import { resolveReminderFireDate } from "../arc/reminders.ts";
import type { DeferralOption } from "../arc/reminders.ts";
import { cancelScheduledNotification, scheduleReminderNotification, scheduleTimerCompletionNotification } from "./notifications.ts";
import { clearPendingReminder, clearTimerRun, loadPendingReminder, loadTimerRun, savePendingReminder, saveTimerRun } from "./storage.ts";
import type { PendingReminder, ReminderKind } from "./storage.ts";
import { generateTimerRunId } from "../arc/actionTimer.ts";

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

const SUCCESS_FOCUS_START_NOTIFICATION_TITLE = "ARCHI — מיקוד הצלחה";
const SUCCESS_FOCUS_START_NOTIFICATION_BODY = "הגיע הזמן למיקוד ההצלחה שקבעת.";
const SUCCESS_FOCUS_COPY_TITLE = "מיקוד הצלחה";
const SUCCESS_FOCUS_COPY_BODY = "קח רגע להתמקד במה שהלך טוב.";

export interface ScheduleFutureSuccessFocusInput {
  /** Reused existing shortcut (see arc/reminders.ts's DEFERRAL_OPTIONS) -- resolves to one concrete plannedStartAt via resolveReminderFireDate, avoiding any new native date/time-picker dependency. */
  option: DeferralOption;
  durationMinutes: number;
  now?: Date;
}

/**
 * Coordinated timer/dwell task (Part 5-11): schedules a future Success
 * Focus without inventing a parallel timer/reminder architecture --
 * reuses the two EXISTING models exactly as they already are:
 *
 *   - PendingReminder (kind "focusSuccess"): the START ping at
 *     plannedStartAt, scheduled via the same scheduleReminderNotification
 *     every other reminder already uses (an always-visible OS
 *     notification, foreground or not).
 *   - TimerRun (timerType "successCoding"): the actual timed run,
 *     anchored to actionStartedAt = plannedStartAt -- a timestamp in
 *     the FUTURE at scheduling time. arc/actionTimer.ts's
 *     getActionTimerStatusFromStartedAt already clamps elapsed time to
 *     >= 0, so this naturally reports "not started yet, full duration
 *     remaining" for any `now` before plannedStartAt, then counts down
 *     normally once real time passes it, and reports complete once
 *     endsAt (plannedStartAt + durationMinutes) passes -- exactly
 *     Part 7/8's "late opening restores the real remaining time, never
 *     starts fresh, never shifts endsAt" requirement, with NO new
 *     absolute-time logic needed: it's the identical mechanism every
 *     other real timer in this app already relies on. Its own
 *     completion notification (the clear bell at endsAt) is scheduled
 *     via the same scheduleTimerCompletionNotification every other
 *     timer already uses.
 *
 * "One persisted scheduled run, one start reminder, one completion
 * event" (Part 11) is enforced structurally, not by an extra check:
 * PendingReminder is already one-per-kind, and TimerRun is already
 * one-per-timerType (data/storage.ts) -- both existing invariants.
 * Rescheduling (calling this again, e.g. the trainee changes their
 * mind) or cancelling (cancelFutureSuccessFocus below) always cancels
 * whatever was previously scheduled FIRST, so no notification is ever
 * left orphaned and no duplicate run/reminder can exist at once.
 */
export async function scheduleFutureSuccessFocus(input: ScheduleFutureSuccessFocusInput): Promise<void> {
  const now = input.now ?? new Date();
  await cancelFutureSuccessFocus();

  const plannedStartAt = resolveReminderFireDate(input.option, now);

  const startNotificationId = await scheduleReminderNotification({
    kind: "focusSuccess",
    fireAt: plannedStartAt,
    title: SUCCESS_FOCUS_START_NOTIFICATION_TITLE,
    body: SUCCESS_FOCUS_START_NOTIFICATION_BODY,
    arcRequested: false,
  });
  const reminder: PendingReminder = {
    kind: "focusSuccess",
    fireAt: plannedStartAt.toISOString(),
    arcRequested: false,
    notificationId: startNotificationId,
    createdAt: now.toISOString(),
  };
  await savePendingReminder(reminder);

  const runId = generateTimerRunId();
  const endsAt = new Date(plannedStartAt.getTime() + input.durationMinutes * 60_000);
  const completionNotificationId = await scheduleTimerCompletionNotification({
    timerType: "successCoding",
    runId,
    endTime: endsAt,
    title: SUCCESS_FOCUS_COPY_TITLE,
  });
  await saveTimerRun({
    timerType: "successCoding",
    runId,
    actionStartedAt: plannedStartAt.toISOString(),
    durationMinutes: input.durationMinutes,
    copyTitle: SUCCESS_FOCUS_COPY_TITLE,
    copyBody: SUCCESS_FOCUS_COPY_BODY,
    notificationId: completionNotificationId,
    completedAt: null,
  });
}

/**
 * Cancels a pending/in-progress future Success Focus -- both the start
 * reminder and the timed run's own completion notification, and clears
 * both persisted records. Called at the start of every
 * scheduleFutureSuccessFocus (so rescheduling never leaves the OLD
 * notifications pending -- Part 10) and available for an explicit
 * cancellation. A no-op, safely, when nothing is currently scheduled.
 */
export async function cancelFutureSuccessFocus(): Promise<void> {
  await cancelPendingReminder("focusSuccess");
  const existingRun = await loadTimerRun("successCoding");
  if (existingRun) {
    await cancelScheduledNotification(existingRun.notificationId);
    await clearTimerRun("successCoding");
  }
}
