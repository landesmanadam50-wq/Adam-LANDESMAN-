/**
 * data/personalDevelopmentProgramReminders.ts
 *
 * Phase 9: the reminder I/O half for Personal Development's four-week
 * program weeks, exact mirror of data/fourWeekProgramReminders.ts's own
 * cancel-existing-then-schedule-new pattern, keyed by the pair already
 * persisted on the week itself
 * (reminderNotificationId/reminderScheduledFor). The pure "when" decision
 * lives in arc/personalDevelopmentProgram.ts's resolveWeekReminderFireAt;
 * this file only turns it into an actual scheduled/cancelled OS
 * notification plus the updated week to persist. Never touches
 * plannedStartDate/plannedEndDate, status, or any other week-progression
 * field.
 */

import { resolveWeekReminderFireAt } from "../arc/personalDevelopmentProgram.ts";
import { cancelScheduledNotification, scheduleReminderNotification } from "./notifications.ts";
import type { PersonalDevelopmentProgramWeek } from "../arc/types.ts";

const WEEK_REMINDER_TITLE = "ARCHI";

/**
 * Cancels this week's currently-scheduled reminder (if any), then, only
 * when remindersEnabled and its planned start date hasn't already
 * passed, schedules a fresh one. Returns the week with its notification
 * fields updated -- callers persist the returned program, never the
 * original week.
 */
export async function reconcilePersonalDevelopmentProgramWeekNotification(
  week: PersonalDevelopmentProgramWeek,
  programId: string,
  weekTitle: string,
  now: Date = new Date()
): Promise<PersonalDevelopmentProgramWeek> {
  await cancelScheduledNotification(week.reminderNotificationId);

  const fireAt = resolveWeekReminderFireAt(week, now);
  if (!fireAt) {
    return { ...week, reminderNotificationId: null, reminderScheduledFor: null };
  }

  const notificationId = await scheduleReminderNotification({
    kind: "personalDevelopmentProgramWeek",
    fireAt,
    title: WEEK_REMINDER_TITLE,
    body: `${weekTitle} מתחיל היום.`,
    arcRequested: false,
    personalDevelopmentProgramId: programId,
  });

  return { ...week, reminderNotificationId: notificationId, reminderScheduledFor: fireAt.toISOString() };
}
