/**
 * arc/continuousRoutineGroup.ts
 *
 * Unified ARC & Productivity Update task, requirement 9 ("CONTINUOUS
 * TASK ROUTINES -- SMILES, NOT POINTS"): "add the ability to select
 * multiple consecutive scheduled tasks and group them as: שגרה רצופה --
 * Continuous Routine." This is a genuinely NEW, ad-hoc, per-day
 * grouping mechanism -- distinct from (and never replacing) the
 * existing Continuous vs. Spaced Routines task's own PER-PERIOD
 * routineMode toggle (arc/dailyRoutine.ts), which is a recurring
 * template setting that applies to a whole morning/noon/afternoon/
 * evening period going forward. This one lets a trainee pick any
 * specific run of consecutive tasks on TODAY's own schedule (routine
 * tasks, one-off tasks, or a mix) and group just those, for just that
 * day, without touching the template at all.
 *
 * Pure data/logic only -- no AsyncStorage, no React. Same split as
 * arc/dailyRoutine.ts/arc/taskTimer.ts; data/continuousRoutineGroup.ts
 * is the thin storage/orchestration wrapper.
 */

import type { Task } from "./tasks.ts";
import { isTaskOccurrenceCompleted, type TaskOccurrenceCompletion } from "./taskOccurrence.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";

export interface ContinuousRoutineGroup {
  id: string;
  /** The local calendar date (YYYY-MM-DD) this group applies to -- never recurs to another day. */
  dateLocal: string;
  /** The grouped tasks, in the EXACT order the trainee selected them in -- the authoritative "which one is next" order, independent of scheduledTime (which the trainee may still freely edit afterward without breaking the group's own sequence). */
  taskIds: string[];
  createdAt: string;
}

export function generateContinuousRoutineGroupId(): string {
  return `continuous-routine-group-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Requirement 9: "select multiple CONSECUTIVE scheduled tasks" --
 * verifies the candidate ids are an unbroken run of `orderedTaskIds`
 * (the full, currently-displayed, in-order schedule for that day),
 * never an arbitrary scattered pick. Also requires at least two tasks
 * (grouping a single task is meaningless) and no duplicates.
 */
export function isConsecutiveSelection(orderedTaskIds: readonly string[], selectedTaskIds: readonly string[]): boolean {
  if (selectedTaskIds.length < 2) return false;
  if (new Set(selectedTaskIds).size !== selectedTaskIds.length) return false;
  const indices = selectedTaskIds.map((id) => orderedTaskIds.indexOf(id));
  if (indices.some((index) => index === -1)) return false;
  indices.sort((a, b) => a - b);
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i - 1] + 1) return false;
  }
  return true;
}

export function createContinuousRoutineGroup(taskIds: readonly string[], dateLocal: string, now: string, id: string = generateContinuousRoutineGroupId()): ContinuousRoutineGroup {
  return { id, dateLocal, taskIds: [...taskIds], createdAt: now };
}

/** The group (if any) that already contains this task, for this exact date -- a task can belong to at most one group per day. */
export function findGroupForTask(groups: readonly ContinuousRoutineGroup[], dateLocal: string, taskId: string): ContinuousRoutineGroup | null {
  return groups.find((group) => group.dateLocal === dateLocal && group.taskIds.includes(taskId)) ?? null;
}

/**
 * Creating a new group never leaves a task double-grouped: any
 * existing group for the same date that already contains one of the
 * new group's own task ids has those overlapping ids removed first
 * (a group left with fewer than 2 tasks is dropped entirely, since a
 * single-task "group" is meaningless -- same floor as
 * isConsecutiveSelection above).
 */
export function upsertContinuousRoutineGroup(groups: readonly ContinuousRoutineGroup[], newGroup: ContinuousRoutineGroup): ContinuousRoutineGroup[] {
  const newIds = new Set(newGroup.taskIds);
  const deduped = groups
    .map((group) => (group.dateLocal === newGroup.dateLocal ? { ...group, taskIds: group.taskIds.filter((id) => !newIds.has(id)) } : group))
    .filter((group) => group.taskIds.length >= 2);
  return [...deduped, newGroup];
}

/** Removes a group entirely (e.g. the trainee chose to ungroup) -- the tasks themselves are never touched, only the grouping record. */
export function removeContinuousRoutineGroup(groups: readonly ContinuousRoutineGroup[], groupId: string): ContinuousRoutineGroup[] {
  return groups.filter((group) => group.id !== groupId);
}

/**
 * The next not-yet-completed-today task in `group`, excluding
 * `excludeTaskId` (the one just completed) -- ordered by the GROUP's
 * own stored taskIds sequence (never scheduledTime, which the trainee
 * may re-sort independently of the group). null means `excludeTaskId`
 * was the last remaining task in the group for today -- the signal
 * data/dailyRoutine.ts's resolveContinuousRoutineOutcome uses to show
 * the one combined summary instead of skipping to the next task.
 */
export function resolveNextTaskInContinuousRoutineGroup(
  tasks: readonly Task[],
  completions: TaskOccurrenceCompletion[],
  group: ContinuousRoutineGroup,
  excludeTaskId: string,
  now: Date,
): Task | null {
  const todayDateLocal = todayLocalDateString(now);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  for (const taskId of group.taskIds) {
    if (taskId === excludeTaskId) continue;
    const task = byId.get(taskId);
    if (!task) continue;
    if (isTaskOccurrenceCompleted(task.id, todayDateLocal, completions)) continue;
    return task;
  }
  return null;
}
