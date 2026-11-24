/**
 * arc/reminderRollingSchedule.ts
 *
 * ARC Reminders task: native schedulers (notifee/expo-notifications)
 * cannot hold an infinite horizon of future triggers, so this module
 * computes what a "keep the next ROLLING_WINDOW_HOURS always scheduled"
 * strategy needs to do RIGHT NOW -- pure diffing, no I/O.
 * data/arcReminderScheduler.ts is the thin wrapper that actually calls
 * notifee with this plan's output.
 *
 * Each trigger's own id is deterministic (`${reminderId}:${isoDateOfTrigger}`,
 * built by the caller from arc/arcReminderScheduling.ts's resolved Date
 * instants) precisely so this diff is idempotent: calling
 * computeTopUpPlan repeatedly with the same already-scheduled set and
 * the same schedule never re-schedules or duplicates a slot that's
 * already there.
 */

import { resolveUpcomingTriggerTimes } from "./arcReminderScheduling.ts";
import type { ReminderSchedule } from "./arcReminderSchedule.ts";

export const ROLLING_WINDOW_HOURS = 72;
export const TOPUP_THRESHOLD_HOURS = 48;

export interface ReminderTriggerSlot {
  id: string;
  time: Date;
}

export interface TopUpPlan {
  toSchedule: ReminderTriggerSlot[];
  toCancel: string[];
}

export function triggerIdForTime(reminderId: string, time: Date): string {
  return `${reminderId}:${time.toISOString()}`;
}

/**
 * `existingScheduledTriggerIds` is whatever the caller's own storage
 * already believes is currently scheduled for this one reminder (never
 * another reminder's ids -- callers diff one reminder at a time).
 * Returns the slots to newly schedule (inside the rolling window, not
 * already present) and the ids to cancel (already scheduled but no
 * longer inside the rolling window, e.g. the reminder's schedule/days
 * changed and a previously-valid slot is no longer produced).
 */
export function computeTopUpPlan(reminderId: string, existingScheduledTriggerIds: string[], schedule: ReminderSchedule, now: Date): TopUpPlan {
  const windowEnd = new Date(now.getTime() + ROLLING_WINDOW_HOURS * 60 * 60 * 1000);
  const upcoming = resolveUpcomingTriggerTimes(schedule, now, windowEnd);
  const upcomingSlots = upcoming.map((time) => ({ id: triggerIdForTime(reminderId, time), time }));
  const upcomingIds = new Set(upcomingSlots.map((slot) => slot.id));

  const toSchedule = upcomingSlots.filter((slot) => !existingScheduledTriggerIds.includes(slot.id));
  const toCancel = existingScheduledTriggerIds.filter((id) => !upcomingIds.has(id));
  return { toSchedule, toCancel };
}

/** Whether it's time to re-run computeTopUpPlan for this reminder -- once the furthest-out already-scheduled trigger is within TOPUP_THRESHOLD_HOURS of `now` (or nothing at all is scheduled yet). */
export function needsTopUp(furthestScheduledTime: Date | null, now: Date): boolean {
  if (furthestScheduledTime === null) return true;
  const hoursRemaining = (furthestScheduledTime.getTime() - now.getTime()) / (60 * 60 * 1000);
  return hoursRemaining < TOPUP_THRESHOLD_HOURS;
}
