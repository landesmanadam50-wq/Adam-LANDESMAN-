/**
 * data/fourWeekProgramReminders.ts
 *
 * Sub-goal execution task, spec section 9's closing line: "Also wire the
 * four-week reminder toggles created in Phase 4 to real notifications,
 * without changing their existing UI or week-progression logic." Phase 4
 * added ArcGoalProgramWeek.remindersEnabled/reminderNotificationId/
 * reminderScheduledFor but nothing ever scheduled them -- this file is
 * the missing I/O half, mirroring data/routines.ts's own
 * rescheduleRoutineNotification exactly (cancel-existing-then-schedule-
 * new, keyed by the pair already persisted on the week itself). The pure
 * "when" decision lives in arc/fourWeekProgram.ts's
 * resolveWeekReminderFireAt; this file only turns it into an actual
 * scheduled/cancelled OS notification plus the updated week to persist.
 * Never touches plannedStartDate/plannedEndDate, status, or any other
 * week-progression field.
 */

import { resolveWeekReminderFireAt } from "../arc/fourWeekProgram.ts";
import { cancelScheduledNotification, scheduleReminderNotification } from "./notifications.ts";
import type { ArcGoalProgramWeek } from "../arc/types.ts";

const WEEK_REMINDER_TITLE = "ARCHI";

/**
 * Cancels this week's currently-scheduled reminder (if any), then, only
 * when remindersEnabled and its planned start date hasn't already
 * passed, schedules a fresh one. Returns the week with its notification
 * fields updated -- callers persist the returned program, never the
 * original week.
 */
export async function reconcileFourWeekProgramWeekNotification(
  week: ArcGoalProgramWeek,
  arcGoalId: string,
  weekTitle: string,
  now: Date = new Date()
): Promise<ArcGoalProgramWeek> {
  await cancelScheduledNotification(week.reminderNotificationId);

  const fireAt = resolveWeekReminderFireAt(week, now);
  if (!fireAt) {
    return { ...week, reminderNotificationId: null, reminderScheduledFor: null };
  }

  const notificationId = await scheduleReminderNotification({
    kind: "fourWeekProgramWeek",
    fireAt,
    title: WEEK_REMINDER_TITLE,
    body: `${weekTitle} מתחיל היום.`,
    arcRequested: false,
    arcGoalId,
  });

  return { ...week, reminderNotificationId: notificationId, reminderScheduledFor: fireAt.toISOString() };
}
