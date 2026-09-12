/**
 * data/arcGoalTargetReminders.ts
 *
 * Sub-goal execution task, spec section 9 ("Real notification
 * scheduling"): the I/O half of ArcGoalTarget reminders -- mirrors
 * data/routines.ts's own rescheduleRoutineNotification/
 * reconcileRoutineNotifications exactly (cancel-existing-then-schedule-
 * new, keyed by a notificationId/notificationScheduledFor pair persisted
 * ON the target itself, never PendingReminder's one-per-kind store). The
 * pure "which moment is next" decision lives in
 * arc/subGoalExecution.ts's resolveTargetNextOccurrenceDate; this file
 * only turns that decision into an actual scheduled/cancelled OS
 * notification and the updated target to persist.
 *
 * One notification per target for its own NEXT occurrence only -- for a
 * one-time target, completing it clears the schedule entirely (nothing
 * left to remind about); for a recurring target, reconciling after an
 * occurrence completes naturally advances to the FOLLOWING occurrence
 * (never the same day twice), satisfying "cancel remaining reminders for
 * a completed one-time occurrence" / "preserve valid future recurring
 * reminders" through the exact same mechanism, with no special-casing.
 */

import { isTargetNotificationInSync, resolveTargetNextOccurrenceDate } from "../arc/subGoalExecution.ts";
import { cancelScheduledNotification, scheduleReminderNotification } from "./notifications.ts";
import type { ArcGoalTarget } from "../arc/types.ts";

const TARGET_REMINDER_TITLE = "ARCHI";

function targetReminderBody(target: ArcGoalTarget, subGoalName: string | null): string {
  const subGoalPart = subGoalName ? ` (${subGoalName})` : "";
  return `הגיע הזמן ל: ${target.name}${subGoalPart}`;
}

/**
 * Cancels this target's currently-scheduled notification (if any), then,
 * only when reminders are enabled and a future occurrence exists,
 * schedules a fresh one. Returns the target with its notification fields
 * updated -- callers persist the returned value, never the original.
 * `subGoalName` is optional context only (never required to resolve the
 * reminder itself) so the notification body can name the owning
 * sub-goal when the caller has it loaded.
 */
export async function rescheduleArcGoalTargetNotification(target: ArcGoalTarget, subGoalName: string | null = null, now: Date = new Date()): Promise<ArcGoalTarget> {
  await cancelScheduledNotification(target.notificationId);

  if (!target.remindersEnabled) {
    return { ...target, notificationId: null, notificationScheduledFor: null };
  }

  const nextOccurrence = resolveTargetNextOccurrenceDate(target, now);
  if (!nextOccurrence) {
    return { ...target, notificationId: null, notificationScheduledFor: null };
  }

  const notificationId = await scheduleReminderNotification({
    kind: "arcGoalTarget",
    fireAt: nextOccurrence,
    title: TARGET_REMINDER_TITLE,
    body: targetReminderBody(target, subGoalName),
    arcRequested: false,
    targetId: target.id,
  });

  return { ...target, notificationId, notificationScheduledFor: nextOccurrence.toISOString() };
}

/**
 * Reconciles ONE target's scheduled notification back in sync with a
 * freshly-computed next occurrence -- called whenever that target is
 * created/edited/completed/tapped-from-notification, never a bulk
 * operation (unlike reconcileRoutineNotifications' own screen-focus bulk
 * reconcile) since target reminders aren't all reviewed together on one
 * shared screen the way routines are. Skips the cancel+reschedule
 * round-trip when the already-scheduled notification still targets the
 * correct occurrence -- safe and cheap to call defensively.
 */
export async function reconcileArcGoalTargetNotification(target: ArcGoalTarget, subGoalName: string | null = null, now: Date = new Date()): Promise<ArcGoalTarget> {
  return isTargetNotificationInSync(target, now) ? target : rescheduleArcGoalTargetNotification(target, subGoalName, now);
}

/** Cancels and clears a target's own scheduled notification -- used when the target is deleted, so its notification can never fire after it no longer exists. */
export async function cancelArcGoalTargetNotification(target: ArcGoalTarget): Promise<void> {
  await cancelScheduledNotification(target.notificationId);
}
