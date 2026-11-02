/**
 * arc/taskLibraryUsage.ts
 *
 * Productivity roadmap, Stage AC: "when editing or deleting ArcBuild/
 * StateProfile/.../never silently delete referenced data." A Task is
 * itself a NEW kind of reference onto ArcBuild (linkedArcBuildId),
 * ArcGoal (linkedArcGoalId), and StateProfile (defaultSupportiveStateId,
 * Stage K) that the EXISTING shared-item safety system
 * (arc/libraryItemUsage.ts, scoped to PersonalDevelopmentRouteConfig)
 * has no knowledge of -- deleting one of those records today would
 * silently strand a task's own link with no warning at all. This
 * module is the exact same pure "who else references this" pattern,
 * applied to Task: a plain filter over an already-loaded Task[],
 * never archived tasks (an archived task's own link is retired, same
 * convention arc/libraryItemUsage.ts already uses for routes), never
 * storage, never React.
 */

import type { Task } from "./tasks.ts";

function findReferencingTasks(allTasks: Task[], matches: (task: Task) => boolean): Task[] {
  return allTasks.filter((task) => task.status !== "archived" && matches(task));
}

export function findTasksReferencingArcBuild(arcBuildId: string, allTasks: Task[]): Task[] {
  return findReferencingTasks(allTasks, (task) => task.linkedArcBuildId === arcBuildId);
}

export function findTasksReferencingArcGoal(arcGoalId: string, allTasks: Task[]): Task[] {
  return findReferencingTasks(allTasks, (task) => task.linkedArcGoalId === arcGoalId);
}

/** Only ever matches a REAL saved StateProfile id -- never one of Stage K's 8 fixed predefined ids (those are never deletable records to begin with, so they can never need this check). */
export function findTasksReferencingStateProfile(stateProfileId: string, allTasks: Task[]): Task[] {
  return findReferencingTasks(allTasks, (task) => task.defaultSupportiveStateId === stateProfileId);
}

export function isReferencedByAnyTask(referencingTasks: Task[]): boolean {
  return referencingTasks.length > 0;
}

/**
 * The "safe unlink" half of the spec's own "allow safe unlinking, never
 * silently delete referenced data": clears exactly the one reference
 * field on every affected task, preserving every other field
 * (including the task's own history/journal entries, which reference
 * the task by id, never the deleted library record) -- the task itself
 * is never touched beyond that one field, never deleted, never
 * archived as a side effect.
 */
export function unlinkArcBuildFromTasks(tasks: Task[], arcBuildId: string, now: string): Task[] {
  return tasks.map((task) => (task.linkedArcBuildId === arcBuildId ? { ...task, linkedArcBuildId: null, updatedAt: now } : task));
}

export function unlinkArcGoalFromTasks(tasks: Task[], arcGoalId: string, now: string): Task[] {
  return tasks.map((task) => (task.linkedArcGoalId === arcGoalId ? { ...task, linkedArcGoalId: null, updatedAt: now } : task));
}

export function unlinkStateProfileFromTasks(tasks: Task[], stateProfileId: string, now: string): Task[] {
  return tasks.map((task) => (task.defaultSupportiveStateId === stateProfileId ? { ...task, defaultSupportiveStateId: null, updatedAt: now } : task));
}
