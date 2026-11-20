/**
 * arc/taskStageProgress.ts
 *
 * Unified Task Stages task: which of a task's own configured action
 * stages (arc/taskStage.ts) is currently active, and which are already
 * completed, for the CURRENT task-start session only -- single-slot,
 * exactly mirroring arc/taskTimer.ts's own single-slot TaskTimerRun
 * (data/storage.ts persists both side by side, cleared together --
 * see that file's own doc). A fresh TaskStageProgress is created every
 * time a staged task is (re)started, never reused across a later
 * occurrence of a recurring task -- "completed" here is per-run, never
 * baked into the stage template itself.
 */

export interface TaskStageProgress {
  taskId: string;
  activeStageId: string;
  completedStageIds: string[];
}

export function createTaskStageProgress(taskId: string, activeStageId: string): TaskStageProgress {
  return { taskId, activeStageId, completedStageIds: [] };
}

/** Backfills a record saved before a later field existed. */
export function normalizeTaskStageProgress(progress: TaskStageProgress): TaskStageProgress {
  return { ...progress, completedStageIds: Array.isArray(progress.completedStageIds) ? progress.completedStageIds : [] };
}

export function isStageCompleted(progress: TaskStageProgress, stageId: string): boolean {
  return progress.completedStageIds.includes(stageId);
}

/**
 * Requirement 4's own "idempotent so repeated taps cannot complete
 * multiple stages accidentally": marking a stage already in
 * completedStageIds a second time is a complete no-op (same object
 * identity even), so a double-tap before the UI re-renders can never
 * advance twice or append a duplicate id.
 */
export function markStageCompleted(progress: TaskStageProgress, stageId: string): TaskStageProgress {
  if (isStageCompleted(progress, stageId)) return progress;
  return { ...progress, completedStageIds: [...progress.completedStageIds, stageId] };
}

export function advanceStageProgress(progress: TaskStageProgress, nextStageId: string): TaskStageProgress {
  return { ...progress, activeStageId: nextStageId };
}

/** "Preserve overall task progress" -- the sum of completed stages' own planned durations, for a simple "X of Y minutes done" readout; never re-derives completion from elapsed timer seconds, only from what was actually confirmed done. */
export function resolveCompletedDurationMinutes(stages: { id: string; durationMinutes: number }[], progress: TaskStageProgress): number {
  return stages.filter((stage) => isStageCompleted(progress, stage.id)).reduce((total, stage) => total + stage.durationMinutes, 0);
}
