/**
 * arc/manifestGoals.ts
 *
 * Manifest Goals & Automatic Task Scheduling task: "Manifest -> Goals ->
 * Tasks" -- a ManifestGoal is a brand-new, lightweight entity (just a
 * title, an owning manifestId, and a manual ordering), while a "task
 * under a goal" is never a second task record: it is an ordinary
 * arc/tasks.ts Task, linked back via its own purposeManifestId/
 * purposeManifestGoalId fields (see that module's own doc). This file
 * owns only what's genuinely new -- the goal model itself, and the pure
 * decisions that read ACROSS a manifest's goals and tasks together
 * (progress, "what's next"). No AsyncStorage, no navigation, no React --
 * same split as every other arc/*.ts module; data/manifestGoals.ts is
 * the thin I/O wrapper.
 */

import { resolveTaskClockTime } from "./todaySchedule.ts";
import { isRecurringTaskScheduledOnDate, isTaskOccurrenceCompleted, type TaskOccurrenceCompletion } from "./taskOccurrence.ts";
import type { Task } from "./tasks.ts";
import { addCalendarDays, todayLocalDateString } from "../program/dateUtils.ts";

export interface ManifestGoal {
  id: string;
  manifestId: string;
  title: string;
  /** Manual ordering among this SAME manifest's other goals only -- see reorderManifestGoals below. */
  order: number;
  createdAt: string;
  updatedAt: string;
}

export function generateManifestGoalId(): string {
  return `manifest-goal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createManifestGoal(manifestId: string, title: string, order: number, now: string): ManifestGoal {
  return { id: generateManifestGoalId(), manifestId, title, order, createdAt: now, updatedAt: now };
}

export function upsertManifestGoalInList(goals: ManifestGoal[], goal: ManifestGoal): ManifestGoal[] {
  const index = goals.findIndex((existing) => existing.id === goal.id);
  if (index === -1) return [...goals, goal];
  const next = [...goals];
  next[index] = goal;
  return next;
}

export function deleteManifestGoalFromList(goals: ManifestGoal[], id: string): ManifestGoal[] {
  return goals.filter((goal) => goal.id !== id);
}

/** This manifest's own goals only, in their own manual display order. */
export function resolveGoalsForManifest(goals: ManifestGoal[], manifestId: string): ManifestGoal[] {
  return goals.filter((goal) => goal.manifestId === manifestId).sort((a, b) => a.order - b.order);
}

/** Reassigns `order` (0..n-1) for ONE manifest's goals per `orderedIds`, leaving every other manifest's own goals completely untouched -- any goal id from a DIFFERENT manifest, or missing from `orderedIds`, is left exactly as it was. */
export function reorderManifestGoals(goals: ManifestGoal[], manifestId: string, orderedIds: string[], now: string): ManifestGoal[] {
  return goals.map((goal) => {
    if (goal.manifestId !== manifestId) return goal;
    const newOrder = orderedIds.indexOf(goal.id);
    if (newOrder === -1) return goal;
    return { ...goal, order: newOrder, updatedAt: now };
  });
}

export interface ManifestGoalProgress {
  completed: number;
  total: number;
}

/** "View task completion progress" -- every non-archived task linked to this goal, archived ones excluded the same way they're excluded from every other task list in this codebase (arc/tasks.ts's own module doc). */
export function resolveGoalProgress(goalId: string, tasks: Task[]): ManifestGoalProgress {
  const linked = tasks.filter((task) => task.purposeManifestGoalId === goalId && task.status !== "archived");
  return { completed: linked.filter((task) => task.status === "completed").length, total: linked.length };
}

/** Reassigns `purposeManifestTaskOrder` (0..n-1) for one goal's own tasks per `orderedIds` -- same per-parent reorder shape as reorderManifestGoals, just applied to Task.purposeManifestTaskOrder instead of ManifestGoal.order. Tasks outside this goal, or ids missing from `orderedIds`, are returned unchanged. */
export function reorderManifestTasksForGoal(tasks: Task[], goalId: string, orderedIds: string[], now: string): Task[] {
  return tasks.map((task) => {
    if (task.purposeManifestGoalId !== goalId) return task;
    const newOrder = orderedIds.indexOf(task.id);
    if (newOrder === -1) return task;
    return { ...task, purposeManifestTaskOrder: newOrder, updatedAt: now };
  });
}

/** Where a brand-new task should land in its goal's own manual order -- one past the current maximum (or 0 for the goal's first task), never reusing an existing position. */
export function resolveNextTaskOrderForGoal(goalId: string, tasks: Task[]): number {
  const orders = tasks.filter((task) => task.purposeManifestGoalId === goalId).map((task) => task.purposeManifestTaskOrder ?? 0);
  return orders.length === 0 ? 0 : Math.max(...orders) + 1;
}

/** This goal's own tasks only, in manual order (ties broken by creation order, for a task created before this ordering existed). */
export function resolveTasksForGoal(tasks: Task[], goalId: string): Task[] {
  return tasks
    .filter((task) => task.purposeManifestGoalId === goalId && task.status !== "archived")
    .sort((a, b) => (a.purposeManifestTaskOrder ?? 0) - (b.purposeManifestTaskOrder ?? 0) || a.createdAt.localeCompare(b.createdAt));
}

/**
 * The single sort key "Define the next task as the earliest upcoming
 * scheduled, incomplete task" resolves to, in epoch milliseconds -- null
 * for a task with no resolvable schedule at all ("unscheduled"), which
 * sorts LAST, never first and never silently dropped (requirement 3's
 * own "if the task has no confirmed schedule, clearly indicate that").
 *
 * Reuses arc/todaySchedule.ts's resolveTaskClockTime for the actual
 * clock-time math (postponed-returnAt priority, "HH:MM" parsing) rather
 * than a second implementation of the same rule. A ONE-TIME task needs
 * only its own scheduledDate. A RECURRING task has no single
 * scheduledDate, so this projects forward from today (inclusive) up to
 * SEVEN days ahead to find the next not-yet-completed matching weekday
 * -- a task recurring on just one weekday, already completed today, has
 * its next occurrence exactly 7 days out, so the search must cover a
 * full week ahead of (and including) today, not merely the six days
 * remaining in today's own calendar week. A recurring task whose own
 * returnAt (while postponed) is set still takes priority, exactly like
 * a one-time task's, via resolveTaskClockTime's own postponed branch.
 */
export function resolveManifestTaskSortTimestamp(task: Task, completions: TaskOccurrenceCompletion[], now: Date): number | null {
  if (task.status === "postponed") {
    return task.returnAt ? new Date(task.returnAt).getTime() : null;
  }

  if (task.recurrence.kind === "once") {
    if (!task.scheduledDate) return null;
    const clock = resolveTaskClockTime(task, task.scheduledDate);
    return clock ? clock.getTime() : new Date(`${task.scheduledDate}T00:00:00`).getTime();
  }

  const todayDateLocal = todayLocalDateString(now);
  for (let offset = 0; offset <= 7; offset++) {
    const candidateDateLocal = addCalendarDays(todayDateLocal, offset);
    if (!isRecurringTaskScheduledOnDate(task, new Date(`${candidateDateLocal}T00:00:00`))) continue;
    if (isTaskOccurrenceCompleted(task.id, candidateDateLocal, completions)) continue;
    const clock = resolveTaskClockTime(task, candidateDateLocal);
    return clock ? clock.getTime() : new Date(`${candidateDateLocal}T00:00:00`).getTime();
  }
  return null; // No matching, not-yet-completed day within the next full week -- treated as unscheduled, same as a one-time task with no scheduledDate.
}

export interface ManifestNextAction {
  goal: ManifestGoal;
  task: Task;
}

/**
 * "Every Manifest should be able to identify its next actionable task...
 * Do not simply choose the first goal in the list" -- across EVERY
 * incomplete, non-archived task linked to this manifest (regardless of
 * which goal), picks the earliest by resolveManifestTaskSortTimestamp
 * (which naturally surfaces an overdue task first, since its timestamp
 * is already in the past -- "handle overdue tasks explicitly and
 * consistently" is satisfied by this single, uniform ordering rule,
 * never a separate overdue-vs-upcoming special case). Only when NO
 * linked task has any resolvable schedule at all does this fall back to
 * the earliest-CREATED unscheduled one, so a manifest with only
 * unscheduled tasks still has a "next task" to show (flagged by the
 * caller as needing scheduling) rather than showing nothing. null only
 * when this manifest has no incomplete, non-archived linked task at all
 * ("if no incomplete tasks exist, show an option to create a new task").
 */
export function resolveNextManifestAction(
  manifestId: string,
  goals: ManifestGoal[],
  tasks: Task[],
  completions: TaskOccurrenceCompletion[],
  now: Date,
): ManifestNextAction | null {
  const relevantTasks = tasks.filter((task) => task.purposeManifestId === manifestId && task.status !== "completed" && task.status !== "archived");
  if (relevantTasks.length === 0) return null;

  let best: { task: Task; sortKey: number } | null = null;
  for (const task of relevantTasks) {
    const sortKey = resolveManifestTaskSortTimestamp(task, completions, now);
    if (sortKey === null) continue;
    if (best === null || sortKey < best.sortKey) best = { task, sortKey };
  }

  let chosenTask: Task | null = best?.task ?? null;
  if (!chosenTask) {
    const unscheduled = relevantTasks
      .filter((task) => resolveManifestTaskSortTimestamp(task, completions, now) === null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    chosenTask = unscheduled[0] ?? null;
  }
  if (!chosenTask) return null;

  const goal = goals.find((candidate) => candidate.id === chosenTask!.purposeManifestGoalId) ?? null;
  // Defensive only -- deleteManifestGoal (data/manifestGoals.ts) always
  // clears a task's own goal link the moment its goal is removed, so a
  // task pointing at a nonexistent goal should never actually occur.
  if (!goal) return null;

  return { goal, task: chosenTask };
}
