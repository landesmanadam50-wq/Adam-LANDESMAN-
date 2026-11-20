/**
 * data/taskScheduledStart.ts
 *
 * Productivity upgrade task, requirement 2: the I/O half of the
 * "it's time to start this task" alarm -- arc/taskScheduledStart.ts
 * decides WHEN (pure), this schedules/cancels/persists it. Mirrors
 * data/routines.ts's own rescheduleRoutineNotification/
 * reconcileRoutineNotifications split from arc/routines.ts exactly.
 */

import { resolveNextTaskStartOccurrence } from "../arc/taskScheduledStart.ts";
import type { Task } from "../arc/tasks.ts";
import { cancelScheduledNotification, scheduleReminderNotification } from "./notifications.ts";
import { loadTaskAlarmPreferences, loadTasks, saveTasks } from "./storage.ts";

/**
 * Cancels this task's own existing notification (whatever it was --
 * never assumed to already be a start alarm) and schedules a fresh
 * one for its next qualifying occurrence, or clears the fields when
 * nothing qualifies anymore. Callers must persist the returned Task
 * (never the original) -- same contract as rescheduleRoutineNotification.
 */
export async function rescheduleTaskStartNotification(task: Task, now: Date = new Date()): Promise<Task> {
  await cancelScheduledNotification(task.notificationId);

  const nextOccurrence = resolveNextTaskStartOccurrence(task, now);
  if (!nextOccurrence) {
    return { ...task, notificationId: null, notificationScheduledFor: null };
  }

  // Task-start alarm vibration task, requirement 7: the trainee's own
  // sound/vibration choice is read here (the I/O layer that already
  // orchestrates this one reminder kind) and passed through --
  // data/notifications.ts stays a dumb mechanical wrapper that never
  // reaches into storage itself.
  const preferences = await loadTaskAlarmPreferences();
  const notificationId = await scheduleReminderNotification({
    kind: "taskScheduledStart",
    fireAt: nextOccurrence,
    title: "הגיע הזמן למשימה",
    body: task.title,
    arcRequested: false,
    taskId: task.id,
    soundEnabled: preferences.soundEnabled,
    vibrationEnabled: preferences.vibrationEnabled,
  });

  return { ...task, notificationId, notificationScheduledFor: nextOccurrence.toISOString() };
}

/**
 * Brings every "planned" task's start alarm back in sync with a
 * freshly-computed next occurrence -- called when Today gains focus
 * (build/TodayScreen.tsx), the same "lazily reconcile on next relevant
 * touch" pattern reconcileRoutineNotifications already uses, so a
 * recurring task's alarm keeps advancing to its next qualifying day
 * without requiring the trainee to reopen the editor. A task that
 * isn't "planned" (active/paused/postponed/completed/archived) is
 * left alone entirely -- its notificationId, if any, belongs to a
 * different concern (e.g. postponedTaskReturn) that this must never
 * clear or overwrite.
 */
export async function reconcileTaskScheduledStartNotifications(now: Date = new Date()): Promise<Task[]> {
  const tasks = await loadTasks();
  const reconciled = await Promise.all(
    tasks.map(async (task) => {
      if (task.status !== "planned") return task;
      const targetIso = resolveNextTaskStartOccurrence(task, now)?.toISOString() ?? null;
      const inSync = task.notificationScheduledFor === targetIso && (targetIso === null || task.notificationId !== null);
      return inSync ? task : rescheduleTaskStartNotification(task, now);
    })
  );
  await saveTasks(reconciled);
  return reconciled;
}

/**
 * Task-start alarm vibration task, requirement 7: unlike
 * reconcileTaskScheduledStartNotifications above (which only touches a
 * task whose next-occurrence TIME has drifted out of sync), this
 * unconditionally re-schedules every "planned" task's own already-
 * scheduled alarm -- called right after the trainee changes their
 * sound/vibration preference, so the new choice is reflected on every
 * already-pending alarm immediately, not just on the next occurrence
 * that would have been rescheduled anyway.
 */
export async function rescheduleAllTaskStartNotifications(now: Date = new Date()): Promise<void> {
  const tasks = await loadTasks();
  const rescheduled = await Promise.all(tasks.map((task) => (task.status === "planned" ? rescheduleTaskStartNotification(task, now) : task)));
  await saveTasks(rescheduled);
}
