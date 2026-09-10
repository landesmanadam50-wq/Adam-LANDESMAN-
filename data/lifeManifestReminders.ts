/**
 * data/lifeManifestReminders.ts
 *
 * Sub-goal↔ARC Goal connection task: the I/O half of Sub-goal/Target
 * deadline reminders -- mirrors data/routines.ts's own
 * rescheduleRoutineNotification/reconcileRoutineNotifications exactly
 * (cancel-existing-then-schedule-new, keyed by a notificationId/
 * scheduledFor pair persisted ON the entity itself, never
 * PendingReminder's one-per-kind store -- see arc/lifeManifest.ts's own
 * SubGoal/Target field docs for why). The pure "which moment is next"
 * decision lives in arc/lifeManifest.ts's resolveNextDeadlineReminder/
 * resolveDeadlineReminderFireAt; this file only turns that decision into
 * an actual scheduled/cancelled OS notification and the updated entity
 * to persist.
 *
 * Completion notifications are NOT scheduled here -- "השלמת את..." is an
 * in-app message shown at the moment of completion (matching how Sub-goal
 * completion already shows "סיימת את תת־המטרה" in-app), not a future OS
 * push, since there's nothing to schedule for an event that already
 * happened.
 */

import { cancelScheduledNotification, scheduleReminderNotification } from "./notifications.ts";
import { resolveDeadlineReminderFireAt, resolveNextDeadlineReminder } from "../arc/lifeManifest.ts";
import type { SubGoal, Target } from "../arc/lifeManifest.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";

const LIFE_MANIFEST_REMINDER_TITLE = "ARCHI";

function subGoalReminderBody(subGoal: SubGoal, moment: "approaching" | "day_of" | "overdue"): string {
  if (moment === "day_of") return `היום מועד הסיום של תת־המטרה '${subGoal.title}'.`;
  if (moment === "overdue") return `מועד הסיום של '${subGoal.title}' עבר. האם לעדכן או לתזמן מחדש?`;
  return `תת־המטרה '${subGoal.title}' מתקרבת למועד הסיום שלה.`;
}

function targetReminderBody(target: Target, moment: "approaching" | "day_of" | "overdue"): string {
  if (moment === "day_of") return `היום מועד היעד '${target.title}'.`;
  if (moment === "overdue") return `היעד '${target.title}' עדיין לא הושלם. האם לעדכן את ההתקדמות?`;
  return `היעד '${target.title}' מתקרב למועד שלו.`;
}

/**
 * Cancels this Sub-goal's currently-scheduled deadline notification (if
 * any), then, only when a next relevant moment exists (a deadline is
 * set, the Sub-goal isn't already completed/archived, and we're within
 * the approaching/day-of/overdue window), schedules a fresh one. Returns
 * the Sub-goal with its notification fields updated -- callers persist
 * the returned value, never the input. A deadline reminder never marks
 * the Sub-goal completed itself -- purely informational.
 */
export async function reconcileSubGoalDeadlineNotification(subGoal: SubGoal, now: Date = new Date()): Promise<SubGoal> {
  await cancelScheduledNotification(subGoal.deadlineNotificationId);

  if (!subGoal.remindersEnabled) {
    return { ...subGoal, deadlineNotificationId: null, deadlineNotificationScheduledFor: null };
  }

  const today = todayLocalDateString(now);
  const next = resolveNextDeadlineReminder(subGoal.deadline, subGoal.status, today);
  if (!next) {
    return { ...subGoal, deadlineNotificationId: null, deadlineNotificationScheduledFor: null };
  }

  const fireAt = resolveDeadlineReminderFireAt(next.fireOnLocalDate, now);
  const notificationId = await scheduleReminderNotification({
    kind: "lifeManifestSubGoal",
    fireAt,
    title: LIFE_MANIFEST_REMINDER_TITLE,
    body: subGoalReminderBody(subGoal, next.moment),
    arcRequested: false,
  });

  return { ...subGoal, deadlineNotificationId: notificationId, deadlineNotificationScheduledFor: fireAt.toISOString() };
}

/** Same reconciliation, for a Target's own targetDate. */
export async function reconcileTargetDeadlineNotification(target: Target, now: Date = new Date()): Promise<Target> {
  await cancelScheduledNotification(target.deadlineNotificationId);

  if (!target.remindersEnabled) {
    return { ...target, deadlineNotificationId: null, deadlineNotificationScheduledFor: null };
  }

  const today = todayLocalDateString(now);
  const next = resolveNextDeadlineReminder(target.targetDate, target.status, today);
  if (!next) {
    return { ...target, deadlineNotificationId: null, deadlineNotificationScheduledFor: null };
  }

  const fireAt = resolveDeadlineReminderFireAt(next.fireOnLocalDate, now);
  const notificationId = await scheduleReminderNotification({
    kind: "lifeManifestTarget",
    fireAt,
    title: LIFE_MANIFEST_REMINDER_TITLE,
    body: targetReminderBody(target, next.moment),
    arcRequested: false,
  });

  return { ...target, deadlineNotificationId: notificationId, deadlineNotificationScheduledFor: fireAt.toISOString() };
}

/** Cancels and clears a Sub-goal's/Target's own scheduled deadline notification -- used when the Sub-goal/Target is deleted, so its notification can never fire after it no longer exists. */
export async function cancelSubGoalDeadlineNotification(subGoal: SubGoal): Promise<void> {
  await cancelScheduledNotification(subGoal.deadlineNotificationId);
}

export async function cancelTargetDeadlineNotification(target: Target): Promise<void> {
  await cancelScheduledNotification(target.deadlineNotificationId);
}
