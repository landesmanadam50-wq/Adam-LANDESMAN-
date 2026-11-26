/**
 * data/taskMemoryReminderNotification.ts
 *
 * Action-Based Tasks task, section 4: a real, outside-the-app OS
 * reminder notification that fires 5 minutes before a fixed or To-Do
 * task's resolved start time, for every ArcGymMemoryExercise
 * (arc/arcGym.ts) linked to that task via
 * `Task.linkedArcGymMemoryExerciseIds` -- showing each linked
 * exercise's own situationText (trigger)/actionText (action) verbatim,
 * never reworded, mirroring the user's own worked example exactly
 * (task "go to the supermarket," trigger "when you enter the
 * supermarket," action "buy milk" -> "כשאתה נכנס לסופר, תזכור לקנות
 * חלב").
 *
 * Built as a direct structural copy of
 * data/taskNotStartedNotification.ts's own silent-arm + foreground-
 * service pattern (the one already proven to fire reliably even while
 * the app is closed): `armTaskMemoryReminderAlarm` arms ONE
 * deterministic `TriggerNotification` id for whichever today-scheduled
 * task with a linked memory exercise has the soonest upcoming
 * (start - 5min) moment, carrying that exact task's id in its own
 * `data.taskId` (never re-resolved at fire time against "what's
 * current/next now", since a reminder is about a SPECIFIC task, not
 * whichever one happens to be active 5 minutes later); cancel-then-
 * rearm on every call is what gives "reschedule automatically if the
 * task's time changes" and "cancel if the task is deleted/canceled" for
 * free, and the single deterministic id is what prevents duplicate
 * reminders -- exactly the same guarantees data/taskNotStartedNotification.ts
 * already relies on for its own identical reasons.
 *
 * `recomputeTaskMemoryReminderNotification` is the ONE exported entry
 * point every mutation site calls (task add/edit/delete/postpone/
 * reorder, performStart, FlexibleDailyScreen.reload()) -- same "called
 * from the exact same sites recomputeTaskNotStartedNotification already
 * is" discipline. `displayTaskMemoryReminderForTask` is the one real-
 * content display function, called both from the arm's own foreground-
 * service fire handler (data/taskAlarm.ts) and directly, immediately,
 * from live/ActiveTaskScreen.tsx's performStart for a To-Do task with
 * no scheduled time ("show the reminder when the task starts").
 */

import notifee, { AlarmType, EventType, TriggerType } from "@notifee/react-native";
import type { Event } from "@notifee/react-native";
import { router } from "expo-router";

import type { ScheduledPlanEntry } from "../arc/dailyPlan.ts";
import type { ArcGymMemoryExercise } from "../arc/arcGym.ts";
import { resolveTodaysScheduledPlan } from "./dailyPlan.ts";
import { ALARM_FOREGROUND_SERVICE_TYPES, ensureNotifeePermissionAsync, ensureNotifeeReminderChannelAsync, NOTIFEE_REMINDER_CHANNEL_ID, SILENT_DELIVERY_CHANNEL_ID } from "./alarmChannel.ts";
import { getTask, loadArcGymMemoryExercises } from "./storage.ts";

const TASK_MEMORY_REMINDER_ARM_ID = "archi-task-memory-reminder-arm";
const TASK_MEMORY_REMINDER_NOTIFICATION_ID = "archi-task-memory-reminder-notification";
const REMINDER_LEAD_MINUTES = 5;

/** `effectiveStartTime` is always a plain "HH:MM" clock time FOR TODAY -- same helper as data/taskNotStartedNotification.ts's own resolveEntryStartDate. */
function resolveEntryStartDate(entry: ScheduledPlanEntry, now: Date): Date | null {
  if (!entry.effectiveStartTime) return null;
  const [hoursText, minutesText] = entry.effectiveStartTime.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
}

function resolveReminderFireDate(entry: ScheduledPlanEntry, now: Date): Date | null {
  const startDate = resolveEntryStartDate(entry, now);
  if (!startDate) return null;
  return new Date(startDate.getTime() - REMINDER_LEAD_MINUTES * 60 * 1000);
}

export function buildTaskMemoryReminderBody(exercises: ArcGymMemoryExercise[]): string {
  return exercises.map((exercise) => `כש${exercise.situationText}, תזכור ${exercise.actionText}.`).join("\n");
}

async function cancelArmedTaskMemoryReminderAlarm(): Promise<void> {
  try {
    await notifee.cancelTriggerNotification(TASK_MEMORY_REMINDER_ARM_ID);
  } catch {
    // Best-effort -- nothing to cancel is not an error.
  }
}

/**
 * Finds the soonest today-scheduled entry with at least one linked
 * memory exercise and a resolved, still-future (start - 5min) moment,
 * and arms exactly one silent placeholder trigger for it -- cancelling
 * any previous arm first, so there is never more than one armed at a
 * time (the "soonest" one; once it fires, performStart's own
 * recomputeTaskMemoryReminderNotification call re-arms for whichever is
 * next).
 */
async function armTaskMemoryReminderAlarm(scheduled: ScheduledPlanEntry[], now: Date): Promise<void> {
  await cancelArmedTaskMemoryReminderAlarm();

  let soonest: { entry: ScheduledPlanEntry; fireAt: Date } | null = null;
  for (const entry of scheduled) {
    if (entry.task.linkedArcGymMemoryExerciseIds.length === 0) continue;
    const fireAt = resolveReminderFireDate(entry, now);
    if (!fireAt || fireAt.getTime() <= now.getTime()) continue;
    if (!soonest || fireAt.getTime() < soonest.fireAt.getTime()) soonest = { entry, fireAt };
  }
  if (!soonest) return;

  try {
    await ensureNotifeePermissionAsync();
    await ensureNotifeeReminderChannelAsync();
    await notifee.createTriggerNotification(
      {
        id: TASK_MEMORY_REMINDER_ARM_ID,
        title: soonest.entry.task.title,
        body: "",
        data: { kind: "taskMemoryReminderArm", taskId: soonest.entry.task.id },
        android: {
          channelId: SILENT_DELIVERY_CHANNEL_ID,
          asForegroundService: true,
          foregroundServiceTypes: ALARM_FOREGROUND_SERVICE_TYPES,
          pressAction: { id: "default" },
        },
      },
      {
        type: TriggerType.TIMESTAMP,
        timestamp: soonest.fireAt.getTime(),
        alarmManager: { type: AlarmType.SET_ALARM_CLOCK },
      }
    );
  } catch (error) {
    console.error("armTaskMemoryReminderAlarm failed", error);
  }
}

/**
 * The one real-content display function -- called both from the armed
 * alarm's own fire handler (data/taskAlarm.ts's foreground-service
 * dispatch, data.kind === "taskMemoryReminderArm") and directly from
 * performStart for a To-Do task with no scheduled time. Re-reads the
 * task fresh (never trusts stale arm-time data) so an edit made between
 * arming and firing is always reflected; a task that no longer exists,
 * or no longer has any linked exercise, is a silent no-op -- never a
 * stale/empty notification.
 */
export async function displayTaskMemoryReminderForTask(taskId: string, now: Date = new Date()): Promise<void> {
  const task = await getTask(taskId);
  if (!task || task.linkedArcGymMemoryExerciseIds.length === 0) return;
  const allExercises = await loadArcGymMemoryExercises();
  const linkedExercises = task.linkedArcGymMemoryExerciseIds.map((id) => allExercises.find((candidate) => candidate.id === id)).filter((exercise): exercise is ArcGymMemoryExercise => exercise !== undefined);
  if (linkedExercises.length === 0) return;

  try {
    await ensureNotifeePermissionAsync();
    await ensureNotifeeReminderChannelAsync();
    await notifee.displayNotification({
      id: TASK_MEMORY_REMINDER_NOTIFICATION_ID,
      title: task.title,
      body: buildTaskMemoryReminderBody(linkedExercises),
      data: { kind: "taskMemoryReminder", taskId: task.id },
      android: {
        channelId: NOTIFEE_REMINDER_CHANNEL_ID,
        pressAction: { id: "default" },
      },
    });
  } catch (error) {
    console.error("displayTaskMemoryReminderForTask failed", taskId, error);
  }
}

/**
 * The one exported entry point every mutation site calls -- re-resolves
 * today's plan fresh and re-arms the soonest qualifying reminder,
 * exactly as data/taskNotStartedNotification.ts's own
 * recomputeTaskNotStartedNotification does for its own alarm. Never
 * displays anything itself -- display only ever happens via
 * displayTaskMemoryReminderForTask, either from the arm's own fire or
 * from the immediate To-Do-task-start path.
 */
export async function recomputeTaskMemoryReminderNotification(now: Date = new Date()): Promise<void> {
  const scheduled = await resolveTodaysScheduledPlan(now);
  await armTaskMemoryReminderAlarm(scheduled, now);
}

/**
 * Routed from data/taskAlarm.ts's own foreground-service dispatch once
 * the silent arm placeholder actually fires -- displays the real
 * reminder for the exact task the arm carried, then the caller cancels
 * the placeholder notification itself (same two-step pattern as
 * data/taskNotStartedNotification.ts's own isTaskNotStartedArm branch).
 */
export async function handleTaskMemoryReminderAlarmFired(taskId: string, now: Date = new Date()): Promise<void> {
  await displayTaskMemoryReminderForTask(taskId, now);
}

/**
 * Routed in from data/taskAlarm.ts's shared handleTaskAlarmEvent
 * (data.kind === "taskMemoryReminder") -- a bare tap on the real,
 * displayed reminder opens that exact task, same bare-open convention
 * every other reminder-style notification in this app already follows.
 */
export async function handleTaskMemoryReminderNotificationEvent(event: Event): Promise<void> {
  if (event.type !== EventType.PRESS) return;
  const data = event.detail.notification?.data;
  const taskId = typeof data?.taskId === "string" ? data.taskId : null;
  if (!taskId) return;
  try {
    await notifee.cancelNotification(TASK_MEMORY_REMINDER_NOTIFICATION_ID);
  } catch {
    // Best-effort.
  }
  router.push({ pathname: "/tasks/[id]", params: { id: taskId } });
}
