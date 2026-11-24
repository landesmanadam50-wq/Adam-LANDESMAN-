/**
 * arc/arcGymGoal.ts
 *
 * ARC Gym + ARC Goal Integration task: a goal-oriented layer living
 * INSIDE ARC Gym -- never replacing it, never requiring any exercise to
 * belong to one. Displayed to the trainee as "ARC Goal" / "מטרת ARC",
 * but named ArcGymGoal in code: this codebase already has a large,
 * completely unrelated feature literally named ArcGoal (arc/types.ts's
 * ArcGoal, arc/arcGoals.ts, arc/arcGoalEngine.ts, routes under
 * app/arc-goal/*) and a third, distinct "goal" concept, ManifestGoal
 * (arc/manifestGoals.ts, a sub-goal of an EXISTING PurposeManifest).
 * ArcGymGoal must never collide with either -- never reuse their
 * names, never their storage keys, never their routes.
 *
 * An ArcGymGoal owns exactly one, dedicated PurposeManifest (created
 * together with it, never shared with the global random-daily-popup
 * pool -- see arc/purposeManifest.ts's ownerArcGymGoalId), a set of
 * ArcGymGoalObjective records (its own, deliberately separate type --
 * never ManifestGoal, which belongs to a different, pre-existing
 * relationship direction), and a many-to-many set of linked ARC Gym
 * exercises across all four exercise kinds.
 *
 * Exercise linkage reuses the exact shape arc/arcResult.ts's own
 * linkedTaskIds/linkTaskToArcResult/unlinkTaskFromArcResult already
 * established in this codebase: a plain id-array lives on the
 * EXERCISE side (ArcGymSituation.linkedGoalIds,
 * ArcGymMemoryExercise.linkedGoalIds, ArcResultExercise.linkedGoalIds,
 * ArcFocusExercise.linkedGoalIds), never on the goal, and the reverse
 * "which exercises does this goal have" view is always computed fresh
 * by filtering those four collections (resolveLinkedExercisesForArcGymGoal
 * below) -- never cached, never duplicated, so linking an exercise to
 * several goals never copies its underlying data/config/history.
 *
 * No AsyncStorage, no navigation, no React here -- same split as every
 * other arc/*.ts module; data/arcGymGoal.ts is the thin I/O wrapper.
 */

import type { ArcGymMemoryExercise, ArcGymSituation } from "./arcGym.ts";
import type { ArcResultExercise } from "./arcResult.ts";
import type { ArcFocusExercise } from "./arcFocusExercise.ts";

export interface ArcGymGoal {
  id: string;
  title: string;
  description: string | null;
  /** Its own, dedicated PurposeManifest -- created together with the goal, never shared with another goal or with the global rotation pool. */
  manifestId: string;
  createdAt: string;
  updatedAt: string;
}

export function generateArcGymGoalId(): string {
  return `arc-gym-goal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcGymGoal(id: string, title: string, description: string | null, manifestId: string, now: string): ArcGymGoal {
  return { id, title: title.trim(), description: description?.trim() || null, manifestId, createdAt: now, updatedAt: now };
}

export function updateArcGymGoal(goal: ArcGymGoal, patch: Partial<Pick<ArcGymGoal, "title" | "description">>, now: string): ArcGymGoal {
  return {
    ...goal,
    title: patch.title !== undefined ? patch.title.trim() : goal.title,
    description: patch.description !== undefined ? patch.description?.trim() || null : goal.description,
    updatedAt: now,
  };
}

export function upsertArcGymGoalInList(goals: ArcGymGoal[], goal: ArcGymGoal): ArcGymGoal[] {
  const index = goals.findIndex((existing) => existing.id === goal.id);
  if (index === -1) return [...goals, goal];
  const next = [...goals];
  next[index] = goal;
  return next;
}

/** Removes the goal record itself only -- never touches its own PurposeManifest (left for the trainee to separately, explicitly delete if they choose) and never touches any exercise/task; callers (data/arcGymGoal.ts) are responsible for unlinking every exercise/task that pointed at this goal first. */
export function deleteArcGymGoalFromList(goals: ArcGymGoal[], id: string): ArcGymGoal[] {
  return goals.filter((goal) => goal.id !== id);
}

export interface ArcGymGoalObjective {
  id: string;
  goalId: string;
  title: string;
  order: number;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export function generateArcGymGoalObjectiveId(): string {
  return `arc-gym-goal-objective-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcGymGoalObjective(goalId: string, title: string, order: number, now: string): ArcGymGoalObjective {
  return { id: generateArcGymGoalObjectiveId(), goalId, title: title.trim(), order, completed: false, createdAt: now, updatedAt: now };
}

export function upsertArcGymGoalObjectiveInList(objectives: ArcGymGoalObjective[], objective: ArcGymGoalObjective): ArcGymGoalObjective[] {
  const index = objectives.findIndex((existing) => existing.id === objective.id);
  if (index === -1) return [...objectives, objective];
  const next = [...objectives];
  next[index] = objective;
  return next;
}

export function deleteArcGymGoalObjectiveFromList(objectives: ArcGymGoalObjective[], id: string): ArcGymGoalObjective[] {
  return objectives.filter((objective) => objective.id !== id);
}

/** This goal's own objectives only, in their own manual display order. */
export function resolveObjectivesForArcGymGoal(objectives: ArcGymGoalObjective[], goalId: string): ArcGymGoalObjective[] {
  return objectives.filter((objective) => objective.goalId === goalId).sort((a, b) => a.order - b.order);
}

/** Reassigns `order` (0..n-1) for ONE goal's objectives per `orderedIds`, leaving every other goal's own objectives completely untouched -- same per-parent reorder shape as arc/manifestGoals.ts's reorderManifestGoals. */
export function reorderArcGymGoalObjectives(objectives: ArcGymGoalObjective[], goalId: string, orderedIds: string[], now: string): ArcGymGoalObjective[] {
  return objectives.map((objective) => {
    if (objective.goalId !== goalId) return objective;
    const newOrder = orderedIds.indexOf(objective.id);
    if (newOrder === -1) return objective;
    return { ...objective, order: newOrder, updatedAt: now };
  });
}

export function toggleArcGymGoalObjectiveCompleted(objectives: ArcGymGoalObjective[], id: string, now: string): ArcGymGoalObjective[] {
  return objectives.map((objective) => (objective.id === id ? { ...objective, completed: !objective.completed, updatedAt: now } : objective));
}

export interface ArcGymGoalObjectiveProgress {
  completed: number;
  total: number;
}

export function resolveArcGymGoalObjectiveProgress(objectives: ArcGymGoalObjective[], goalId: string): ArcGymGoalObjectiveProgress {
  const linked = resolveObjectivesForArcGymGoal(objectives, goalId);
  return { completed: linked.filter((objective) => objective.completed).length, total: linked.length };
}

/**
 * ARC Reminders task: the one "which objective is next" decision for the
 * ARC Goal mantra reminder (arc/arcMantraContent.ts's
 * resolveFirstIncompleteObjectiveMantra) -- the first not-yet-completed
 * objective in this goal's own manual display order (same order
 * resolveObjectivesForArcGymGoal already returns), or null once every
 * objective is completed (or the goal has none yet). Never a second
 * "what's left" computation: any other screen needing this same answer
 * should call this, not re-filter objectives itself.
 */
export function resolveFirstIncompleteArcGymGoalObjective(objectives: ArcGymGoalObjective[], goalId: string): ArcGymGoalObjective | null {
  return resolveObjectivesForArcGymGoal(objectives, goalId).find((objective) => !objective.completed) ?? null;
}

export type ArcGymExerciseKind = "behaviour" | "memory" | "result" | "focus";

export interface ArcGymExerciseRef {
  kind: ArcGymExerciseKind;
  exerciseId: string;
}

/**
 * The derived, NEVER-persisted "which exercises does this goal have"
 * view -- computed fresh every call by filtering each of the four
 * exercise collections' own linkedGoalIds, exactly like
 * arc/arcResult.ts's resolveArcResultsForTask already does for
 * Task<->Result linking. Linking/unlinking an exercise only ever
 * touches that exercise's own tiny linkedGoalIds array; this function
 * never caches or copies anything, so "linking to multiple goals must
 * never duplicate the exercise's underlying data/config/history" is
 * satisfied structurally, not by convention.
 */
export function resolveLinkedExercisesForArcGymGoal(
  goalId: string,
  situations: ArcGymSituation[],
  memoryExercises: ArcGymMemoryExercise[],
  resultExercises: ArcResultExercise[],
  focusExercises: ArcFocusExercise[]
): ArcGymExerciseRef[] {
  const refs: ArcGymExerciseRef[] = [];
  for (const situation of situations) {
    if (situation.linkedGoalIds.includes(goalId)) refs.push({ kind: "behaviour", exerciseId: situation.id });
  }
  for (const exercise of memoryExercises) {
    if (exercise.linkedGoalIds.includes(goalId)) refs.push({ kind: "memory", exerciseId: exercise.id });
  }
  for (const exercise of resultExercises) {
    if (exercise.linkedGoalIds.includes(goalId)) refs.push({ kind: "result", exerciseId: exercise.id });
  }
  for (const exercise of focusExercises) {
    if (exercise.linkedGoalIds.includes(goalId)) refs.push({ kind: "focus", exerciseId: exercise.id });
  }
  return refs;
}
