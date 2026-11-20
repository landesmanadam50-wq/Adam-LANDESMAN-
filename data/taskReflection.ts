/**
 * data/taskReflection.ts
 *
 * Task Reflection Memory & Smart Notification Updates task:
 * AsyncStorage-backed orchestration for arc/taskReflection.ts's pure
 * TaskReflection model -- save/edit/delete, each followed by refreshing
 * the task's own ALREADY-ARMED alarm notification (requirement 3/6) so
 * it reflects the new latest reflection without ever touching its
 * trigger time. Imports data/taskAlarm.ts (one direction only --
 * data/taskAlarm.ts never imports this file, only the pure primitives
 * it needs from arc/taskReflection.ts and data/storage.ts directly, the
 * same acyclic shape data/alarmChannel.ts already established for the
 * Daily Visualization alarm).
 */

import {
  createTaskReflection,
  reflectionsForTask,
  removeReflectionFromList,
  resolveLatestReflectionForTask,
  sortReflectionsNewestFirst,
  upsertReflectionInList,
  type TaskReflection,
} from "../arc/taskReflection.ts";
import { generateTaskReflectionId } from "../arc/tasks.ts";
import { loadTaskReflections, saveTaskReflections } from "./storage.ts";
import { refreshTaskAlarmNotificationIfArmed } from "./taskAlarm.ts";

/** Requirement 1: saves a brand-new reflection, permanently, associated with this exact Task id, preserving every earlier one as history. A blank answer is never saved (mirrors every other optional free-text field in this codebase -- the trainee simply skipped it). */
export async function saveNewTaskReflection(taskId: string, text: string, now: Date = new Date()): Promise<TaskReflection | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const reflections = await loadTaskReflections();
  const reflection = createTaskReflection(generateTaskReflectionId(), taskId, trimmed, now.toISOString());
  await saveTaskReflections([...reflections, reflection]);
  await refreshTaskAlarmNotificationIfArmed(taskId, now);
  return reflection;
}

/** Requirement 2: the single piece of text a task's own notification should show -- null means "no saved reflection yet," so the caller preserves its existing default text rather than inventing placeholder content. */
export async function getLatestReflectionTextForTask(taskId: string): Promise<string | null> {
  const reflections = await loadTaskReflections();
  return resolveLatestReflectionForTask(reflections, taskId)?.text ?? null;
}

/** Requirement 5: every saved reflection for this task, newest first, for the history screen. */
export async function listReflectionsForTaskNewestFirst(taskId: string): Promise<TaskReflection[]> {
  const reflections = await loadTaskReflections();
  return sortReflectionsNewestFirst(reflectionsForTask(reflections, taskId));
}

/** Requirement 5: corrects an existing reflection's text in place (never creates a new history row for it) -- if it happens to be the latest one for its task, the refreshed alarm notification picks up the correction immediately. */
export async function editTaskReflection(id: string, text: string, now: Date = new Date()): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const reflections = await loadTaskReflections();
  const existing = reflections.find((reflection) => reflection.id === id);
  if (!existing) return;
  await saveTaskReflections(upsertReflectionInList(reflections, { ...existing, text: trimmed, updatedAt: now.toISOString() }));
  await refreshTaskAlarmNotificationIfArmed(existing.taskId, now);
}

/** Requirement 5: removes one reflection -- if it was the task's latest, the next-most-recent one (or the default text, if none remain) takes over in any already-armed notification. */
export async function deleteTaskReflection(id: string, now: Date = new Date()): Promise<void> {
  const reflections = await loadTaskReflections();
  const existing = reflections.find((reflection) => reflection.id === id);
  if (!existing) return;
  await saveTaskReflections(removeReflectionFromList(reflections, id));
  await refreshTaskAlarmNotificationIfArmed(existing.taskId, now);
}
