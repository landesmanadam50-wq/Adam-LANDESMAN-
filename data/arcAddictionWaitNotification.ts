/**
 * data/arcAddictionWaitNotification.ts
 *
 * Applies arc/arcAddictionWaitPlan.ts's plan to notifee – the same
 * library, channels and AlarmManager mode the rest of ARCHI's
 * notifications already use (data/alarmChannel.ts, data/taskAlarm.ts).
 *
 *   - End of wait: notifee TIMESTAMP trigger with
 *     AlarmManager SET_ALARM_CLOCK (exact, survives Doze and a killed
 *     app) on the HIGH-importance reminder channel, with "כן" / "לא"
 *     action buttons that open the app (launchActivity "default").
 *   - While waiting: one quiet, ongoing countdown notification
 *     (showChronometer, counting down) so the timer is visible outside
 *     the app even without the floating overlay permission.
 *
 * Both use fixed ids and are always cancelled before being re-created,
 * so there can never be two of either. Every call is best-effort and
 * never throws (a failed arm is logged, the in-app timer still works).
 */

import notifee, { AlarmType, AndroidImportance, TriggerType } from "@notifee/react-native";
import type { AddictionNotificationPlan } from "../arc/arcAddictionWaitPlan.ts";
import { ARC_ADDICTION_WAIT_END_NOTIFICATION_ID, ARC_ADDICTION_WAIT_ONGOING_NOTIFICATION_ID } from "../arc/arcAddictionWaitPlan.ts";
import {
  ensureNotifeePermissionAsync,
  ensureNotifeeReminderChannelAsync,
  ensureQuietReminderChannelAsync,
  NOTIFEE_REMINDER_CHANNEL_ID,
  QUIET_REMINDER_CHANNEL_ID,
} from "./alarmChannel.ts";

/** The end time the trigger is currently armed for (in-memory) – avoids re-creating an identical trigger on every sync. */
let armedWaitEndFireAtMs: number | null = null;
let shownOngoingEndsAtMs: number | null = null;

async function safely(label: string, action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.warn(`[arcAddictionWaitNotification] ${label} failed`, error);
  }
}

export async function cancelArcAddictionWaitEndNotification(): Promise<void> {
  armedWaitEndFireAtMs = null;
  await safely("cancel trigger", () => notifee.cancelTriggerNotification(ARC_ADDICTION_WAIT_END_NOTIFICATION_ID));
  await safely("cancel displayed", () => notifee.cancelNotification(ARC_ADDICTION_WAIT_END_NOTIFICATION_ID));
}

export async function cancelArcAddictionOngoingNotification(): Promise<void> {
  shownOngoingEndsAtMs = null;
  await safely("cancel ongoing", () => notifee.cancelNotification(ARC_ADDICTION_WAIT_ONGOING_NOTIFICATION_ID));
}

export async function applyArcAddictionNotificationPlan(plan: AddictionNotificationPlan): Promise<void> {
  // End-of-wait trigger
  if (!plan.waitEnd) {
    if (armedWaitEndFireAtMs !== null) await cancelArcAddictionWaitEndNotification();
    else await safely("cancel trigger", () => notifee.cancelTriggerNotification(ARC_ADDICTION_WAIT_END_NOTIFICATION_ID));
  } else if (armedWaitEndFireAtMs !== plan.waitEnd.fireAtMs) {
    const waitEnd = plan.waitEnd;
    await cancelArcAddictionWaitEndNotification();
    await safely("arm wait end", async () => {
      await ensureNotifeePermissionAsync();
      await ensureNotifeeReminderChannelAsync();
      await notifee.createTriggerNotification(
        {
          id: waitEnd.id,
          title: waitEnd.title,
          body: waitEnd.body,
          data: waitEnd.data,
          android: {
            channelId: NOTIFEE_REMINDER_CHANNEL_ID,
            importance: AndroidImportance.HIGH,
            autoCancel: true,
            pressAction: { id: "default", launchActivity: "default" },
            actions: waitEnd.actions.map((action) => ({ title: action.title, pressAction: { id: action.pressActionId, launchActivity: "default" } })),
          },
        },
        { type: TriggerType.TIMESTAMP, timestamp: waitEnd.fireAtMs, alarmManager: { type: AlarmType.SET_ALARM_CLOCK } }
      );
      armedWaitEndFireAtMs = waitEnd.fireAtMs;
    });
  }

  // Ongoing countdown
  if (!plan.ongoing) {
    await cancelArcAddictionOngoingNotification();
  } else if (shownOngoingEndsAtMs !== plan.ongoing.endsAtMs) {
    const ongoing = plan.ongoing;
    await safely("show ongoing", async () => {
      await ensureQuietReminderChannelAsync();
      await notifee.displayNotification({
        id: ongoing.id,
        title: ongoing.title,
        body: ongoing.body,
        data: ongoing.data,
        android: {
          channelId: QUIET_REMINDER_CHANNEL_ID,
          ongoing: true,
          autoCancel: false,
          onlyAlertOnce: true,
          showChronometer: true,
          chronometerDirection: "down",
          timestamp: ongoing.endsAtMs,
          // Removes itself at the end of the wait even if no JS runs then (app killed) – the end-of-wait alarm takes over.
          timeoutAfter: Math.max(1000, ongoing.endsAtMs - Date.now()),
          pressAction: { id: "default", launchActivity: "default" },
          actions: ongoing.actions.map((action) => ({ title: action.title, pressAction: { id: action.pressActionId, launchActivity: "default" } })),
        },
      });
      shownOngoingEndsAtMs = ongoing.endsAtMs;
    });
  }
}
