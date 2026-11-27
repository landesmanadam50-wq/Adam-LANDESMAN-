/**
 * data/replanTimeNotification.ts
 *
 * ARCHI -- Replan Time task, section 1/4: the real, outside-the-app
 * notification that fires when a Flexible-Daily-Schedule task's FULL
 * allocated window (start time AND duration) has already elapsed with
 * nothing ever genuinely started for it. Built as a direct structural
 * copy of data/taskNotStartedNotification.ts (own stable notification
 * id, own silently-armed notifee TriggerNotification so it fires even
 * app-closed, own persisted state record, one recompute...() entry
 * point called from every mutation site, dispatched through
 * data/taskAlarm.ts's single shared handleTaskAlarmEvent) -- never a
 * second, parallel notification mechanism.
 *
 * The pure predicate behind every decision here,
 * arc/replanTimeAlert.ts's resolveReplanTimeAlert, is built on
 * arc/dailyPlan.ts's own resolveCurrentTaskState -- its `overdue`
 * bucket, which is disjoint by construction from the `current` bucket
 * data/taskNotStartedNotification.ts's own resolveTaskNotStartedAlert
 * targets (started-but-not-elapsed vs. started-AND-elapsed). The two
 * notifications therefore never compete over the exact same task at
 * the exact same moment -- no extra coordination logic needed here,
 * and data/taskNotStartedNotification.ts itself is never touched.
 *
 * recomputeReplanTimeNotification(now), called from every mutation
 * site this app already calls recomputeTaskNotStartedNotification
 * from, is what satisfies spec section 4's "cancel notifications made
 * irrelevant by a replan or by completing the task" -- the same
 * unconditional cancel-or-display branch every notification kind here
 * already relies on.
 */

import notifee, { AlarmType, EventType, TriggerType } from "@notifee/react-native";
import type { Event } from "@notifee/react-native";
import { router } from "expo-router";

import { resolveCurrentTaskState } from "../arc/dailyPlan.ts";
import type { ScheduledPlanEntry } from "../arc/dailyPlan.ts";
import { resolveReplanTimeAlert } from "../arc/replanTimeAlert.ts";
import type { TaskTimerRun } from "../arc/taskTimer.ts";
import { resolveTodaysScheduledPlan } from "./dailyPlan.ts";
import { ALARM_FOREGROUND_SERVICE_TYPES, ensureNotifeePermissionAsync, ensureTaskNotStartedChannelAsync, SILENT_DELIVERY_CHANNEL_ID, TASK_NOT_STARTED_CHANNEL_ID } from "./alarmChannel.ts";
import { clearReplanTimeNotificationState, loadTaskTimerRun, saveReplanTimeNotificationState } from "./storage.ts";

const REPLAN_TIME_NOTIFICATION_ID = "archi-replan-time-notification";
const REPLAN_TIME_ARM_ID = "archi-replan-time-arm";
const REPLAN_TIME_TITLE = "תכנון זמן מחדש";
const REPLAN_TIME_BODY = "הזמן שהוקצה למשימה עבר. רוצה להתאים את התכנון להמשך היום?";
const REPLAN_TIME_ACTION_TITLE = "תכנן זמן מחדש";

const ACTION_REPLAN_TIME = "replan_time_open";

/** Same "HH:MM" clock-time-for-today convention as resolveEntryStartDate in data/taskNotStartedNotification.ts -- here resolving the END of the entry's allocated window instead of its start. */
function resolveEntryEndDate(entry: ScheduledPlanEntry, now: Date): Date | null {
  if (!entry.effectiveEndTime) return null;
  const [hoursText, minutesText] = entry.effectiveEndTime.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
}

async function cancelArmedReplanTimeAlarm(): Promise<void> {
  try {
    await notifee.cancelTriggerNotification(REPLAN_TIME_ARM_ID);
  } catch {
    // Best-effort -- nothing to cancel is not an error.
  }
}

/**
 * Arms (or re-arms) the native trigger for the moment whichever entry
 * is about to go overdue -- resolveCurrentTaskState's own `current`
 * (already started, not yet elapsed) when one exists, else `next`
 * (not yet started; the trigger still correctly wakes the app once
 * that entry's own window fully elapses). A no-op/clean cancel once
 * nothing today could still go overdue.
 */
async function armNextReplanTimeAlarm(scheduled: ScheduledPlanEntry[], now: Date, activeRun: TaskTimerRun | null): Promise<void> {
  await cancelArmedReplanTimeAlarm();
  const { current, next } = resolveCurrentTaskState(scheduled, now, activeRun, null);
  const target = current ?? next;
  if (!target) return;
  const fireAt = resolveEntryEndDate(target, now);
  if (!fireAt || fireAt.getTime() <= now.getTime()) return;

  try {
    await ensureNotifeePermissionAsync();
    await ensureTaskNotStartedChannelAsync();
    await notifee.createTriggerNotification(
      {
        id: REPLAN_TIME_ARM_ID,
        title: target.task.title,
        body: REPLAN_TIME_BODY,
        data: { kind: "replanTimeArm" },
        android: {
          channelId: SILENT_DELIVERY_CHANNEL_ID,
          asForegroundService: true,
          foregroundServiceTypes: ALARM_FOREGROUND_SERVICE_TYPES,
          pressAction: { id: "default" },
        },
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp: fireAt.getTime(),
        alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
      }
    );
  } catch (error) {
    console.error("armNextReplanTimeAlarm failed", error);
  }
}

async function displayReplanTimeNotification(entry: ScheduledPlanEntry, now: Date): Promise<void> {
  try {
    await ensureNotifeePermissionAsync();
    await ensureTaskNotStartedChannelAsync();
    await notifee.displayNotification({
      id: REPLAN_TIME_NOTIFICATION_ID,
      title: REPLAN_TIME_TITLE,
      body: REPLAN_TIME_BODY,
      data: { kind: "replanTime", taskId: entry.task.id },
      android: {
        channelId: TASK_NOT_STARTED_CHANNEL_ID,
        onlyAlertOnce: true,
        autoCancel: false,
        pressAction: { id: "default" },
        actions: [{ title: REPLAN_TIME_ACTION_TITLE, pressAction: { id: ACTION_REPLAN_TIME } }],
      },
    });
    await saveReplanTimeNotificationState({ notificationId: REPLAN_TIME_NOTIFICATION_ID, alertedTaskId: entry.task.id, alertedAt: now.toISOString() });
  } catch (error) {
    console.error("displayReplanTimeNotification failed", entry.task.id, error);
  }
}

export async function cancelReplanTimeNotification(): Promise<void> {
  try {
    await notifee.cancelNotification(REPLAN_TIME_NOTIFICATION_ID);
  } catch {
    // Best-effort -- nothing to cancel is not an error.
  }
  await clearReplanTimeNotificationState();
}

/**
 * Re-resolves "is some task's full window overdue with nothing
 * started" fresh and either cancels (nothing qualifies -- including
 * because the user replanned the day, started the task another way,
 * or it was removed) or (re-)displays the ONE notification in place,
 * and either way re-arms the native trigger for whatever will go
 * overdue next. Called from every mutation site
 * recomputeTaskNotStartedNotification already is -- this is the one
 * function every one of those sites calls into for Replan Time, never
 * a second recompute path.
 */
export async function recomputeReplanTimeNotification(now: Date = new Date()): Promise<void> {
  const [scheduled, activeRun] = await Promise.all([resolveTodaysScheduledPlan(now), loadTaskTimerRun()]);
  await armNextReplanTimeAlarm(scheduled, now, activeRun);

  const due = resolveReplanTimeAlert(scheduled, now, activeRun);
  if (!due) {
    await cancelReplanTimeNotification();
    return;
  }
  await displayReplanTimeNotification(due, now);
}

/**
 * Routed in from data/taskAlarm.ts's shared handleTaskAlarmEvent
 * (data.kind === "replanTime") -- same single-dispatcher discipline
 * every other notification kind in this app already follows. Both the
 * one action and a bare body tap do the same thing: the Replan screen
 * resolves its own target task fresh (never trusting stale alarm-time
 * data, same rule data/taskMemoryReminderNotification.ts already
 * documents), so no taskId/param needs to survive the navigation.
 */
export async function handleReplanTimeNotificationEvent(event: Event): Promise<void> {
  if (event.type !== EventType.ACTION_PRESS && event.type !== EventType.PRESS) return;
  await cancelReplanTimeNotification();
  router.push("/replan-time");
}
