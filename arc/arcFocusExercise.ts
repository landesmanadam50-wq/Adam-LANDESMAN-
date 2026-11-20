/**
 * arc/arcFocusExercise.ts
 *
 * ARC Gym + ARC Goal Integration task: ARC Focus has never had a
 * durable, listable "exercise" identity -- arc/arcFocusSettings.ts's
 * own settings are keyed only by taskId (or "default"), and
 * arc/arcFocusSession.ts's own sessions are ephemeral, single-slot, and
 * cleared on completion. The other three ARC GYM exercise types
 * (Behaviour/ArcGymSituation, Memory/ArcGymMemoryExercise,
 * Result/ArcResultExercise) are all durable records a trainee can
 * list, edit, and link to an ArcGymGoal -- ArcFocusExercise is the
 * minimal additive equivalent for Focus, so a Goal's "multiple
 * exercises of the same or different types" requirement has a real,
 * saved Focus identity to point at.
 *
 * `settings` is a self-contained SNAPSHOT, copied at creation/edit
 * time -- never a live reference into archi.arcFocusSettings.v1's own
 * byTaskId store. Starting training from a saved ArcFocusExercise
 * composes the EXISTING, UNCHANGED arc/arcFocusSession.ts/
 * arc/arcFocusEngine.ts machinery (createArcFocusSession with this
 * exercise's own settings) -- this file adds no new engine logic.
 * The existing zero-setup "/arc-gym/arc-focus" quick-start path stays
 * completely untouched; this is a parallel, additional entry point.
 *
 * No AsyncStorage, no navigation, no React here -- same split as every
 * other arc/*.ts module; data/arcGymGoal.ts (or data/storage.ts
 * directly) is the thin I/O wrapper.
 */

import type { ArcFocusSettings } from "./arcFocusSettings.ts";

export interface ArcFocusExercise {
  id: string;
  title: string;
  settings: ArcFocusSettings;
  /** ArcGymGoal.id values -- same many-to-many linking convention as ArcResultExercise.linkedTaskIds/ArcGymSituation.linkedGoalIds/ArcGymMemoryExercise.linkedGoalIds. */
  linkedGoalIds: string[];
  createdAt: string;
  updatedAt: string;
}

export function generateArcFocusExerciseId(): string {
  return `arc-focus-exercise-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcFocusExercise(id: string, title: string, settings: ArcFocusSettings, now: string): ArcFocusExercise {
  return { id, title: title.trim(), settings, linkedGoalIds: [], createdAt: now, updatedAt: now };
}

export function updateArcFocusExercise(exercise: ArcFocusExercise, patch: Partial<Pick<ArcFocusExercise, "title" | "settings">>, now: string): ArcFocusExercise {
  return {
    ...exercise,
    title: patch.title !== undefined ? patch.title.trim() : exercise.title,
    settings: patch.settings !== undefined ? patch.settings : exercise.settings,
    updatedAt: now,
  };
}

export function upsertArcFocusExerciseInList(exercises: ArcFocusExercise[], exercise: ArcFocusExercise): ArcFocusExercise[] {
  const index = exercises.findIndex((existing) => existing.id === exercise.id);
  if (index === -1) return [...exercises, exercise];
  const next = [...exercises];
  next[index] = exercise;
  return next;
}

export function deleteArcFocusExerciseFromList(exercises: ArcFocusExercise[], id: string): ArcFocusExercise[] {
  return exercises.filter((exercise) => exercise.id !== id);
}

export function linkGoalToArcFocusExercise(exercise: ArcFocusExercise, goalId: string, now: string): ArcFocusExercise {
  if (exercise.linkedGoalIds.includes(goalId)) return exercise;
  return { ...exercise, linkedGoalIds: [...exercise.linkedGoalIds, goalId], updatedAt: now };
}

export function unlinkGoalFromArcFocusExercise(exercise: ArcFocusExercise, goalId: string, now: string): ArcFocusExercise {
  if (!exercise.linkedGoalIds.includes(goalId)) return exercise;
  return { ...exercise, linkedGoalIds: exercise.linkedGoalIds.filter((id) => id !== goalId), updatedAt: now };
}

export function resolveArcFocusExercisesForGoal(exercises: ArcFocusExercise[], goalId: string): ArcFocusExercise[] {
  return exercises.filter((exercise) => exercise.linkedGoalIds.includes(goalId));
}
