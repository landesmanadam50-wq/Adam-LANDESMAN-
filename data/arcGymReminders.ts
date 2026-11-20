/**
 * data/arcGymReminders.ts
 *
 * ARCHI -- Unified Development Specification task, Part 2 ("ARC GYM
 * REMINDERS"): the I/O half of ArcGymReminder -- mirrors
 * data/arcGoalTargetReminders.ts's own rescheduleArcGoalTargetNotification/
 * reconcileArcGoalTargetNotification/cancelArcGoalTargetNotification
 * exactly (cancel-existing-then-schedule-new, keyed by a
 * notificationId/notificationScheduledFor pair persisted ON the
 * reminder itself). The pure "which moment is next" decision lives in
 * arc/arcGym.ts's resolveArcGymReminderNextOccurrenceDate; this file
 * only turns that decision into an actual scheduled/cancelled OS
 * notification and the updated reminder to persist.
 *
 * "Never creates a Task LIVE session or imposes a duration" / "tap-to-
 * open-correct-exercise": the notification itself carries no timer
 * payload at all, and tapping it (app/_layout.tsx's handleReminderResponse)
 * deep-links straight to the named exercise's own detail screen using
 * exerciseKind/exerciseId carried in the notification data -- never
 * Task LIVE, never a duration.
 */

import { isArcGymReminderNotificationInSync, resolveArcGymReminderNextOccurrenceDate } from "../arc/arcGym.ts";
import type { ArcGymReminder } from "../arc/arcGym.ts";
import { cancelScheduledNotification, scheduleReminderNotification } from "./notifications.ts";

const REMINDER_TITLE = "ARCHI — תזכורת אימון";

function reminderBody(reminder: Pick<ArcGymReminder, "exerciseKind">): string {
  return reminder.exerciseKind === "memory" ? "הגיע הזמן לאימון זיכרון ב-ARC GYM." : "הגיע הזמן לאימון התנהגות ב-ARC GYM.";
}

/**
 * Cancels this reminder's currently-scheduled notification (if any),
 * then, only when enabled and a future occurrence exists, schedules a
 * fresh one. Returns the reminder with its notification fields
 * updated -- callers persist the returned value, never the original.
 */
export async function rescheduleArcGymReminderNotification(reminder: ArcGymReminder, now: Date = new Date()): Promise<ArcGymReminder> {
  await cancelScheduledNotification(reminder.notificationId);

  if (!reminder.enabled) {
    return { ...reminder, notificationId: null, notificationScheduledFor: null };
  }

  const nextOccurrence = resolveArcGymReminderNextOccurrenceDate(reminder, now);
  if (!nextOccurrence) {
    return { ...reminder, notificationId: null, notificationScheduledFor: null };
  }

  const notificationId = await scheduleReminderNotification({
    kind: "arcGymReminder",
    fireAt: nextOccurrence,
    title: REMINDER_TITLE,
    body: reminderBody(reminder),
    arcRequested: false,
    arcGymExerciseKind: reminder.exerciseKind,
    arcGymExerciseId: reminder.exerciseId,
  });

  return { ...reminder, notificationId, notificationScheduledFor: nextOccurrence.toISOString() };
}

/**
 * Reconciles ONE reminder's scheduled notification back in sync with a
 * freshly-computed next occurrence -- called whenever that reminder is
 * created/edited/disabled/tapped-from-notification. Skips the
 * cancel+reschedule round-trip when already in sync (same
 * "defensively safe to call" contract as reconcileArcGoalTargetNotification).
 */
export async function reconcileArcGymReminderNotification(reminder: ArcGymReminder, now: Date = new Date()): Promise<ArcGymReminder> {
  return isArcGymReminderNotificationInSync(reminder, now) ? reminder : rescheduleArcGymReminderNotification(reminder, now);
}

/** Cancels and clears a reminder's own scheduled notification -- used when the reminder is deleted, so its notification can never fire after it no longer exists. */
export async function cancelArcGymReminderNotification(reminder: ArcGymReminder): Promise<void> {
  await cancelScheduledNotification(reminder.notificationId);
}
