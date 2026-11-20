/**
 * data/dailyVisualizationAlarm.ts
 *
 * Daily Visualization task, section 4 ("שעון מעורר חובה לוויזואליזציה
 * היומית"): a single, deterministic-id notifee notification, armed 30
 * minutes before today's first scheduled task (arc/dailyVisualization.ts's
 * resolveFirstTaskClockTimeToday/resolveDailyVisualizationAlarmTime).
 * Reuses the EXACT same native primitives data/taskAlarm.ts already
 * proved out -- the one shared notifee permission request
 * (ensureNotifeePermissionAsync), the one shared high-importance
 * channel (ensureTaskAlarmChannelAsync/TASK_ALARM_CHANNEL_ID), and
 * AlarmType.SET_ALARM_CLOCK (the one Android-12+ exact-alarm-restriction-
 * EXEMPT trigger type every alarm in this app uses) -- never a second,
 * parallel native mechanism.
 *
 * Deliberately NOT the sustained-ring alarm treatment data/taskAlarm.ts's
 * task-start alarm uses: this is a reminder to begin a calm preparation
 * exercise, not an urgent "wake up and act now" alarm -- a single
 * ordinary notification, with one action ("התחל ויזואליזציה"), is the
 * right tone.
 *
 * ARCHI -- Complete the Non-Interrupting Notification System task,
 * Part 5: DOES still use asForegroundService: true now (a change from
 * this module's original design) -- NOT for a sustained ring, but
 * because that is the only way registerTaskAlarmForegroundService's own
 * busy-state check can run before this notification is ever shown, even
 * from a cold, previously-killed process (see
 * data/notifications.ts's own scheduleNativeReminderNotification doc
 * for the confirmed native evidence). Its own dispatcher branch
 * (isDailyVisualizationAlarm) never rings -- it redisplays this exact
 * notification, action included, on either the normal or the quiet
 * channel depending on the busy check, then ends the brief foreground
 * service immediately. Reuses that SAME shared gate, never a second one
 * of its own.
 *
 * Single-slot, deterministic-id discipline, same convention as every
 * other alarm kind here: re-arming replaces the previous one rather
 * than creating a second, duplicate notification (requirement:
 * "Prevent duplicate scheduled alarms").
 */

import notifee, { AlarmType, AndroidCategory, TriggerType, EventType } from "@notifee/react-native";
import type { Event } from "@notifee/react-native";
import { router } from "expo-router";

import { resolveDailyVisualizationAlarmTime, resolveFirstTaskClockTimeToday } from "../arc/dailyVisualization.ts";
import { ALARM_FOREGROUND_SERVICE_TYPES, ensureNotifeePermissionAsync, ensureSilentDeliveryChannelAsync, SILENT_DELIVERY_CHANNEL_ID } from "./alarmChannel.ts";
import { loadDailyVisualizationAlarmState, loadTaskOccurrenceCompletions, loadTasks, saveDailyVisualizationAlarmState } from "./storage.ts";

const DAILY_VISUALIZATION_ALARM_ID = "daily-visualization-alarm";
const ACTION_START_DAILY_VISUALIZATION = "start_daily_visualization";

/** Tells a REAL armed id (this module's own) apart from a stale/foreign one -- same discipline as data/taskAlarm.ts's own isNativeAlarmId, so "already in sync" can never be confused by a leftover id from a different scheme. */
function isNativeDailyVisualizationAlarmId(id: string | null): boolean {
  return id === DAILY_VISUALIZATION_ALARM_ID;
}

/**
 * Cancels whatever is currently armed (a no-op if nothing was) --
 * mirrors data/taskAlarm.ts's own cancelAnyAlarmFor exactly, just for
 * this one deterministic id.
 */
async function cancelDailyVisualizationAlarm(): Promise<void> {
  try {
    await notifee.cancelTriggerNotification(DAILY_VISUALIZATION_ALARM_ID);
    await notifee.cancelNotification(DAILY_VISUALIZATION_ALARM_ID);
  } catch {
    // Best-effort -- nothing to cancel is not an error.
  }
}

/**
 * Arms (replacing any previous one) the reminder at the given absolute
 * moment. Never throws -- a failed native call is logged and caught,
 * same honest-failure contract as armTaskAlarm/armPlannedArcAlarm: the
 * caller sees notificationId: null (an honest "nothing is actually
 * armed"), never a false claim of success (requirement: "If exact
 * alarm scheduling is unavailable, inform the user... rather than
 * claiming the alarm is guaranteed").
 */
async function armDailyVisualizationAlarm(fireAt: Date): Promise<{ notificationId: string | null; scheduledFor: string | null }> {
  await cancelDailyVisualizationAlarm();
  try {
    await ensureNotifeePermissionAsync();
    // ARCHI -- Final Critical Check task: SILENT_DELIVERY_CHANNEL_ID here,
    // not TASK_ALARM_CHANNEL_ID -- this notification only exists to
    // satisfy Android's startForeground() requirement; the dispatcher's
    // own isDailyVisualizationAlarm branch redisplays the real,
    // user-facing version (action included) AFTER hasActiveTaskConflict
    // resolves, never from this initial post.
    await ensureSilentDeliveryChannelAsync();
    await notifee.createTriggerNotification(
      {
        id: DAILY_VISUALIZATION_ALARM_ID,
        title: "הגיע הזמן לוויזואליזציה היומית",
        body: "כמה דקות לפני שמתחילים את היום -- דמיון, סריקת גוף קצרה, והתחושה שרוצים להגיע אליה.",
        data: { kind: "dailyVisualizationAlarm" },
        android: {
          channelId: SILENT_DELIVERY_CHANNEL_ID,
          category: AndroidCategory.REMINDER,
          autoCancel: true,
          asForegroundService: true,
          // ARCHI -- Final Critical Check task, Part 2: see
          // data/alarmChannel.ts's own doc on ALARM_FOREGROUND_SERVICE_TYPES.
          foregroundServiceTypes: ALARM_FOREGROUND_SERVICE_TYPES,
          pressAction: { id: "default" },
          actions: [{ title: "התחל ויזואליזציה", pressAction: { id: ACTION_START_DAILY_VISUALIZATION } }],
        },
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp: fireAt.getTime(),
        alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
      }
    );
    return { notificationId: DAILY_VISUALIZATION_ALARM_ID, scheduledFor: fireAt.toISOString() };
  } catch (error) {
    console.error("armDailyVisualizationAlarm failed", error);
    return { notificationId: null, scheduledFor: null };
  }
}

async function disarmDailyVisualizationAlarm(): Promise<void> {
  await cancelDailyVisualizationAlarm();
  await saveDailyVisualizationAlarmState({ notificationId: null, scheduledFor: null });
}

/**
 * Same lazy "reconcile on next relevant touch" pattern as
 * reconcileTaskAlarms/reconcilePlannedArcAlarms -- called whenever the
 * daily schedule gains focus, so a changed first-task time (the task
 * itself edited, rescheduled, postponed, completed, or a new earlier
 * task added) is reflected automatically (requirement: "If the user
 * changes the first task's scheduled time, automatically recalculate
 * and update the visualization alarm"). "In sync, nothing to do" is
 * the exact same guarded comparison those two functions use, which is
 * what makes a duplicate alarm structurally impossible here too.
 */
export async function reconcileDailyVisualizationAlarm(now: Date = new Date()): Promise<void> {
  const [tasks, completions, stored] = await Promise.all([loadTasks(), loadTaskOccurrenceCompletions(), loadDailyVisualizationAlarmState()]);
  const firstTaskClock = resolveFirstTaskClockTimeToday(tasks, completions, now);
  const target = resolveDailyVisualizationAlarmTime(firstTaskClock);
  const targetIso = target ? target.toISOString() : null;

  const inSync = stored.scheduledFor === targetIso && (targetIso === null || isNativeDailyVisualizationAlarmId(stored.notificationId));
  if (inSync) return;

  if (!targetIso || !target || target.getTime() <= now.getTime()) {
    // Nothing scheduled today, or the computed alarm time has already
    // passed (reconciling mid-morning, after the window already went
    // by) -- never arm a moment already in the past.
    await disarmDailyVisualizationAlarm();
    return;
  }

  const armed = await armDailyVisualizationAlarm(target);
  await saveDailyVisualizationAlarmState(armed);
}

/**
 * Routes a notifee event for this alarm -- its own single action, or
 * the plain notification/press itself -- BOTH open the Daily
 * Visualization screen directly (requirement: "Tapping the
 * notification opens the Daily Visualization screen directly"). Called
 * from data/taskAlarm.ts's own shared handleTaskAlarmEvent router,
 * never a second onBackgroundEvent/onForegroundEvent registration.
 */
export async function handleDailyVisualizationAlarmEvent(event: Event): Promise<void> {
  if (event.type !== EventType.ACTION_PRESS && event.type !== EventType.PRESS) return;
  router.push("/daily-visualization");
}
