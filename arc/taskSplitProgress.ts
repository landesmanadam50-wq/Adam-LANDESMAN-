/**
 * arc/taskSplitProgress.ts
 *
 * ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry "Cubes"
 * task, section 4: which segment of a chosen "עבודה מחולקת" split plan
 * (arc/taskSplitPlan.ts) is currently active, for the CURRENT
 * task-start session only -- single-slot, mirroring
 * arc/taskStageProgress.ts's/arc/todoSplitSession.ts's own single-slot
 * convention exactly (data/storage.ts persists this alongside the
 * TaskTimerRun, cleared together by the same clearTaskTimerRun()).
 * All of the segments/parts/breaks in one session stay associated
 * with the SAME task in Task LIVE, per spec -- a fresh
 * TaskSplitProgress is created once, when the plan is chosen on
 * live/TaskDurationSelectionScreen.tsx, and advances in place as each
 * segment's own TaskTimerRun ends.
 */

import type { SplitPlanSegment } from "./taskSplitPlan.ts";

export interface TaskSplitProgress {
  taskId: string;
  segments: SplitPlanSegment[];
  activeSegmentIndex: number;
}

export function createTaskSplitProgress(taskId: string, segments: SplitPlanSegment[]): TaskSplitProgress {
  return { taskId, segments, activeSegmentIndex: 0 };
}

/** Backfills a record saved before a later field existed. */
export function normalizeTaskSplitProgress(progress: TaskSplitProgress): TaskSplitProgress {
  return {
    ...progress,
    segments: Array.isArray(progress.segments) ? progress.segments : [],
    activeSegmentIndex: typeof progress.activeSegmentIndex === "number" ? progress.activeSegmentIndex : 0,
  };
}

export function currentSplitSegment(progress: TaskSplitProgress): SplitPlanSegment | null {
  return progress.segments[progress.activeSegmentIndex] ?? null;
}

export function isTaskSplitProgressComplete(progress: TaskSplitProgress): boolean {
  return progress.activeSegmentIndex >= progress.segments.length;
}

/** Moves to the next segment -- never past the end (isTaskSplitProgressComplete becomes true exactly once activeSegmentIndex reaches segments.length, never beyond it). */
export function advanceTaskSplitProgress(progress: TaskSplitProgress): TaskSplitProgress {
  return { ...progress, activeSegmentIndex: Math.min(progress.activeSegmentIndex + 1, progress.segments.length) };
}

/** How many WORK minutes (never counting breaks) have already been completed -- segments strictly before the active one. Mirrors arc/taskStageProgress.ts's own resolveCompletedDurationMinutes shape. */
export function resolveCompletedWorkMinutes(progress: TaskSplitProgress): number {
  return progress.segments
    .slice(0, progress.activeSegmentIndex)
    .filter((segment) => segment.kind === "work")
    .reduce((total, segment) => total + segment.durationMinutes, 0);
}
