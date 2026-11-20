/**
 * data/manifestGoals.ts
 *
 * Manifest Goals & Automatic Task Scheduling task: the thin storage I/O
 * layer over arc/manifestGoals.ts's pure model, PLUS the real
 * orchestration this layer owns -- deleting a goal safely (never
 * leaving a dangling reference, never deleting the trainee's own
 * tasks), and automatically scheduling a brand-new goal task into the
 * existing daily routine (arc/manifestTaskScheduling.ts's pure slot
 * search, fed with THIS trainee's real routine template/tasks/
 * occurrence completions).
 *
 * Every task this file creates is a completely ordinary arc/tasks.ts
 * Task, saved through the exact same upsertTask every other task
 * creation path uses -- "Manifest tasks and daily schedule tasks must
 * represent the same underlying Task records, not separate copies" is
 * satisfied by construction: there is no second task store here to
 * keep in sync, so completing/editing/postponing/deleting that task
 * anywhere else in the app is automatically reflected the next time
 * this module reads loadTasks() again.
 */

import {
  createManifestGoal,
  deleteManifestGoalFromList,
  reorderManifestGoals as reorderManifestGoalsPure,
  reorderManifestTasksForGoal as reorderManifestTasksForGoalPure,
  resolveGoalProgress,
  resolveGoalsForManifest,
  resolveNextManifestAction,
  resolveNextTaskOrderForGoal,
  resolveTasksForGoal,
  type ManifestGoal,
  type ManifestGoalProgress,
  type ManifestNextAction,
} from "../arc/manifestGoals.ts";
import {
  resolveManifestTaskSchedule,
  resolveOccupiedIntervalsForDate,
  type ManifestScheduledSlot,
  type ManifestTaskSchedulingResult,
} from "../arc/manifestTaskScheduling.ts";
import { createEmptyDailyRoutineTemplate } from "../arc/dailyRoutine.ts";
import { createEmptyTask, generateTaskId, type Task, type TaskRecurrence } from "../arc/tasks.ts";
import {
  loadDailyRoutineTemplate,
  loadManifestGoals,
  loadTaskOccurrenceCompletions,
  loadTasks,
  saveManifestGoals,
  upsertManifestGoal,
  upsertTask,
} from "./storage.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";

export { loadManifestGoals, upsertManifestGoal };

export async function resolveManifestGoalsWithProgress(manifestId: string): Promise<{ goal: ManifestGoal; progress: ManifestGoalProgress }[]> {
  const [goals, tasks] = await Promise.all([loadManifestGoals(), loadTasks()]);
  return resolveGoalsForManifest(goals, manifestId).map((goal) => ({ goal, progress: resolveGoalProgress(goal.id, tasks) }));
}

export async function createAndSaveManifestGoal(manifestId: string, title: string, now: Date = new Date()): Promise<ManifestGoal> {
  const goals = await loadManifestGoals();
  const order = resolveGoalsForManifest(goals, manifestId).length;
  const goal = createManifestGoal(manifestId, title, order, now.toISOString());
  await upsertManifestGoal(goal);
  return goal;
}

export async function reorderManifestGoals(manifestId: string, orderedIds: string[], now: Date = new Date()): Promise<void> {
  const goals = await loadManifestGoals();
  await saveManifestGoals(reorderManifestGoalsPure(goals, manifestId, orderedIds, now.toISOString()));
}

/**
 * Deletes the goal AND safely severs every task that pointed to it --
 * clears purposeManifestId/purposeManifestGoalId/purposeManifestTaskOrder
 * on those tasks, demoting them to plain standalone tasks, rather than
 * deleting the trainee's own task records ("remove its relationship
 * safely without leaving invalid references... avoid destructive data
 * migrations").
 */
export async function deleteManifestGoal(goalId: string, now: Date = new Date()): Promise<void> {
  const [goals, tasks] = await Promise.all([loadManifestGoals(), loadTasks()]);
  const nextGoals = deleteManifestGoalFromList(goals, goalId);
  const nowIso = now.toISOString();
  const affected = tasks.filter((task) => task.purposeManifestGoalId === goalId);
  await Promise.all([
    saveManifestGoals(nextGoals),
    ...affected.map((task) => upsertTask({ ...task, purposeManifestId: null, purposeManifestGoalId: null, purposeManifestTaskOrder: null, updatedAt: nowIso })),
  ]);
}

export async function resolveManifestTasksForGoal(goalId: string): Promise<Task[]> {
  const tasks = await loadTasks();
  return resolveTasksForGoal(tasks, goalId);
}

export async function reorderManifestTasksForGoal(goalId: string, orderedIds: string[], now: Date = new Date()): Promise<void> {
  const tasks = await loadTasks();
  const reordered = reorderManifestTasksForGoalPure(tasks, goalId, orderedIds, now.toISOString());
  const changed = reordered.filter((task) => task.purposeManifestGoalId === goalId);
  await Promise.all(changed.map((task) => upsertTask(task)));
}

/**
 * "Remove its relationship safely without leaving invalid references" --
 * deleting a goal task is still an ordinary task deletion (callers use
 * data/storage.ts's existing deleteTask directly for that); this module
 * adds nothing extra there, since a deleted Task simply stops matching
 * any purposeManifestGoalId filter above, which already tolerates a
 * task disappearing between reads. No orphan bookkeeping is needed on
 * the GOAL side either -- a goal never stores its own task id list, it
 * is always the task pointing at the goal, never the reverse.
 */
export async function resolveManifestNextAction(manifestId: string, now: Date = new Date()): Promise<ManifestNextAction | null> {
  const [goals, tasks, completions] = await Promise.all([loadManifestGoals(), loadTasks(), loadTaskOccurrenceCompletions()]);
  return resolveNextManifestAction(manifestId, goals, tasks, completions, now);
}

export interface ScheduleManifestTaskInput {
  manifestId: string;
  goalId: string;
  title: string;
  durationMinutes: number;
  preferredDateLocal: string | null;
  preferredTime: string | null;
  recurrence: TaskRecurrence;
}

export type ScheduleManifestTaskOutcome = { status: "scheduled"; task: Task } | { status: "conflict"; reason: string; alternatives: ManifestScheduledSlot[] };

/**
 * Requirement 2's full pipeline: load the trainee's REAL routine
 * template (falling back to the same default period windows every
 * fresh template starts with, if routine setup was never completed --
 * never crashes just because first-time setup hasn't happened yet),
 * tasks, and occurrence completions; run the pure scheduler; and, only
 * on a genuine fit, create ONE real Task -- scheduled, duration-stamped,
 * and linked to its manifest/goal -- through the exact same upsertTask
 * every other task creation path uses. A conflict creates nothing at
 * all, so calling this twice for the same conflicting request is always
 * safe and never produces a duplicate.
 */
export async function scheduleManifestTask(input: ScheduleManifestTaskInput, now: Date = new Date()): Promise<ScheduleManifestTaskOutcome> {
  const [routineTemplate, tasks, completions] = await Promise.all([loadDailyRoutineTemplate(), loadTasks(), loadTaskOccurrenceCompletions()]);
  const todayDateLocal = todayLocalDateString(now);
  const periods = (routineTemplate ?? createEmptyDailyRoutineTemplate(now.toISOString())).periods;

  const result: ManifestTaskSchedulingResult = resolveManifestTaskSchedule(
    periods,
    (dateLocal) => resolveOccupiedIntervalsForDate(tasks, completions, dateLocal),
    { durationMinutes: input.durationMinutes, preferredDateLocal: input.preferredDateLocal, preferredTime: input.preferredTime },
    todayDateLocal,
  );
  if (result.status === "conflict") return result;

  const nowIso = now.toISOString();
  const base = createEmptyTask(generateTaskId(), input.title, input.title, nowIso);
  const task: Task = {
    ...base,
    scheduledDate: result.dateLocal,
    scheduledTime: result.time,
    expectedDurationMinutes: input.durationMinutes,
    recurrence: input.recurrence,
    purposeManifestId: input.manifestId,
    purposeManifestGoalId: input.goalId,
    purposeManifestTaskOrder: resolveNextTaskOrderForGoal(input.goalId, tasks),
  };
  await upsertTask(task);
  return { status: "scheduled", task };
}
