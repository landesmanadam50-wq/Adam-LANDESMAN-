/**
 * arc/arcResult.ts
 *
 * ARCHI -- ARC Result: Automatic, Optional Suggestion Without Extra
 * Shortcuts task: pure data model + logic for "ARC Result" -- a short,
 * timer-free success-visualization exercise (focus point, personalized
 * success visualization, success mantra, supportive body language),
 * created/edited/linked/managed entirely inside ARC GYM (section 7),
 * and automatically (but optionally) suggested once it is linked to a
 * task the trainee is about to perform (sections 3-4). No AsyncStorage,
 * no navigation, no React -- same split as every other arc/*.ts module
 * (see arc/arcGym.ts's own doc for the house convention).
 *
 * Deliberately its OWN independent exercise type -- never a variant of
 * ArcGymSituation (Behaviour) or ArcGymMemoryExercise (Memory): it is
 * the first ARC GYM exercise type that links to real Tasks (arc/tasks.ts)
 * rather than to a Manifest behavior, so `linkedTaskIds` lives directly
 * on the exercise (a plain many-to-many list, same shape convention as
 * every other "set of ids" field in this app, e.g. Task.subtasks ids)
 * rather than a second join-table module.
 */

export interface ArcResultExercise {
  id: string;
  /** Section 6, step 1: the one thing to focus attention on before visualizing. */
  focusPoint: string;
  /** Section 6, step 2: the personalized success visualization text -- what the desired successful outcome looks/sounds/feels like. Distinct from arc/successfulPerformance.ts's own Result Imagery (a configured ARC Goal/Identity-profile field, timed, shown INSIDE a regular ARC session) -- this is the trainee's own free-written text for a standalone, timer-free quick-practice screen, never the other's engine. */
  successVisualization: string;
  /** Section 6, step 3. */
  successMantra: string;
  /** Section 6, step 4: a supportive body posture/gesture to hold while reading the above. */
  supportiveBodyLanguage: string;
  /** Section 7: "linking or unlinking one or more tasks" -- a task may have zero, one, or several linked results (section 5's own "if multiple results are linked" acknowledges the reverse too: one result may be linked to several tasks). Plain Task.id values, never a second ArcResultTaskLink entity. */
  linkedTaskIds: string[];
  /** ARC Gym + ARC Goal Integration task: ArcGymGoal.id values -- same many-to-many linking convention as linkedTaskIds above. */
  linkedGoalIds: string[];
  /**
   * ARC Gym + ARC Goal Integration task: non-null when this Result is
   * paired to run immediately after a specific ArcGymSituation
   * (Behaviour), as ONE combined scheduled practice -- "ARC Success
   * must never be independently schedulable as its own standalone
   * training session" once paired. At most one Result may be paired to
   * any given situationId at a time (pairArcResultWithBehaviour below
   * enforces this by clearing any other Result previously paired to
   * that same situation). null for an ordinary, independent Result,
   * which keeps using linkedTaskIds exactly as before -- pairing and
   * direct task-linking are mutually exclusive uses of the same
   * exercise record, never combined.
   */
  parentBehaviourSituationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function generateArcResultExerciseId(): string {
  return `arc-result-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcResultExercise(
  id: string,
  focusPoint: string,
  successVisualization: string,
  successMantra: string,
  supportiveBodyLanguage: string,
  now: string
): ArcResultExercise {
  return {
    id,
    focusPoint: focusPoint.trim(),
    successVisualization: successVisualization.trim(),
    successMantra: successMantra.trim(),
    supportiveBodyLanguage: supportiveBodyLanguage.trim(),
    linkedTaskIds: [],
    linkedGoalIds: [],
    parentBehaviourSituationId: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateArcResultExercise(
  exercise: ArcResultExercise,
  patch: Partial<Pick<ArcResultExercise, "focusPoint" | "successVisualization" | "successMantra" | "supportiveBodyLanguage">>,
  now: string
): ArcResultExercise {
  return {
    ...exercise,
    focusPoint: patch.focusPoint !== undefined ? patch.focusPoint.trim() : exercise.focusPoint,
    successVisualization: patch.successVisualization !== undefined ? patch.successVisualization.trim() : exercise.successVisualization,
    successMantra: patch.successMantra !== undefined ? patch.successMantra.trim() : exercise.successMantra,
    supportiveBodyLanguage: patch.supportiveBodyLanguage !== undefined ? patch.supportiveBodyLanguage.trim() : exercise.supportiveBodyLanguage,
    updatedAt: now,
  };
}

export function upsertArcResultExerciseInList(exercises: ArcResultExercise[], exercise: ArcResultExercise): ArcResultExercise[] {
  const index = exercises.findIndex((existing) => existing.id === exercise.id);
  if (index === -1) return [...exercises, exercise];
  const next = [...exercises];
  next[index] = exercise;
  return next;
}

export function deleteArcResultExerciseFromList(exercises: ArcResultExercise[], id: string): ArcResultExercise[] {
  return exercises.filter((exercise) => exercise.id !== id);
}

/** ARC Gym + ARC Goal Integration task: backfills linkedGoalIds/parentBehaviourSituationId for an exercise saved before those fields existed -- their true pre-existing "none" state, never invented. Called once per record by data/storage.ts's own loadArcResultExercises, same convention as normalizePurposeManifest. */
export function normalizeArcResultExercise(exercise: ArcResultExercise): ArcResultExercise {
  return {
    ...exercise,
    linkedGoalIds: Array.isArray(exercise.linkedGoalIds) ? exercise.linkedGoalIds : [],
    parentBehaviourSituationId: typeof exercise.parentBehaviourSituationId === "string" ? exercise.parentBehaviourSituationId : null,
  };
}

/** Section 7 ("linking or unlinking one or more tasks"): idempotent -- linking an already-linked task is a no-op (never a duplicate id in the list). */
export function linkTaskToArcResult(exercise: ArcResultExercise, taskId: string, now: string): ArcResultExercise {
  if (exercise.linkedTaskIds.includes(taskId)) return exercise;
  return { ...exercise, linkedTaskIds: [...exercise.linkedTaskIds, taskId], updatedAt: now };
}

export function unlinkTaskFromArcResult(exercise: ArcResultExercise, taskId: string, now: string): ArcResultExercise {
  if (!exercise.linkedTaskIds.includes(taskId)) return exercise;
  return { ...exercise, linkedTaskIds: exercise.linkedTaskIds.filter((id) => id !== taskId), updatedAt: now };
}

/** ARC Gym + ARC Goal Integration task: idempotent, same shape as linkTaskToArcResult above. */
export function linkGoalToArcResultExercise(exercise: ArcResultExercise, goalId: string, now: string): ArcResultExercise {
  if (exercise.linkedGoalIds.includes(goalId)) return exercise;
  return { ...exercise, linkedGoalIds: [...exercise.linkedGoalIds, goalId], updatedAt: now };
}

export function unlinkGoalFromArcResultExercise(exercise: ArcResultExercise, goalId: string, now: string): ArcResultExercise {
  if (!exercise.linkedGoalIds.includes(goalId)) return exercise;
  return { ...exercise, linkedGoalIds: exercise.linkedGoalIds.filter((id) => id !== goalId), updatedAt: now };
}

/**
 * ARC Gym + ARC Goal Integration task: pairs this Result to run
 * immediately after the given Behaviour situation, as one combined
 * practice. Atomically clears `parentBehaviourSituationId` on any
 * OTHER Result already paired to that same situationId first, so at
 * most one Result is ever paired to a given situation at a time --
 * never a silent second pairing coexisting unseen.
 */
export function pairArcResultWithBehaviour(exercises: ArcResultExercise[], resultId: string, situationId: string, now: string): ArcResultExercise[] {
  return exercises.map((exercise) => {
    if (exercise.id === resultId) return { ...exercise, parentBehaviourSituationId: situationId, updatedAt: now };
    if (exercise.parentBehaviourSituationId === situationId) return { ...exercise, parentBehaviourSituationId: null, updatedAt: now };
    return exercise;
  });
}

/** Unpairs this Result from whichever Behaviour situation it was paired to -- never deletes the Result itself, and its own linkedTaskIds (if any were set before pairing) are left completely untouched. */
export function unpairArcResultFromBehaviour(exercises: ArcResultExercise[], resultId: string, now: string): ArcResultExercise[] {
  return exercises.map((exercise) => (exercise.id === resultId ? { ...exercise, parentBehaviourSituationId: null, updatedAt: now } : exercise));
}

export function findPairedArcResultForSituation(exercises: ArcResultExercise[], situationId: string): ArcResultExercise | null {
  return exercises.find((exercise) => exercise.parentBehaviourSituationId === situationId) ?? null;
}

/**
 * Section 3/4's own step 2 ("check whether that task has any saved ARC
 * Result exercises linked to it"): the ONE resolver every suggestion
 * entry point (post-ARC completion, the 😄 shortcut) calls -- never a
 * second, independently-filtered lookup. Order is insertion order
 * (createdAt ascending in practice, since callers load the saved list
 * as-is) -- deliberately NOT re-sorted here, so "exactly one result
 * linked -> open it directly" picks the same single match regardless
 * of which order the caller happened to load the full list in.
 *
 * ARC Gym + ARC Goal Integration task: a Result paired to a Behaviour
 * situation (parentBehaviourSituationId set) is excluded here --
 * "ARC Success must never be independently schedulable as its own
 * standalone training session" once paired, so the standalone
 * post-task suggestion flow must never surface it even if it still
 * happens to carry stale linkedTaskIds from before it was paired.
 */
export function resolveArcResultsForTask(exercises: ArcResultExercise[], taskId: string): ArcResultExercise[] {
  return exercises.filter((exercise) => exercise.parentBehaviourSituationId === null && exercise.linkedTaskIds.includes(taskId));
}

/** Section 3/4's own step 3-4 gate: whether the suggestion should ever be shown at all for this task -- the one boolean every suggestion entry point checks before navigating anywhere. */
export function hasLinkedArcResult(exercises: ArcResultExercise[], taskId: string): boolean {
  return resolveArcResultsForTask(exercises, taskId).length > 0;
}
