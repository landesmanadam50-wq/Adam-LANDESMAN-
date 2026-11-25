/**
 * arc/taskAdaptation.ts
 *
 * ARCHI -- Adaptive Task Execution & Emotional Persistence task, section
 * 6: the pure "offer to shrink the original task into something
 * concretely doable right now" logic. Reuses Task.parentTaskId and the
 * exact create-a-brand-new-child-task pattern live/PostponementSmallerTaskScreen.tsx
 * already established ("the ORIGINAL task is never read-modified-written
 * at all") -- never a second linking mechanism, never a mutation of the
 * original (including never touching the fixed weekly-routine task
 * definition because of a one-off Flexible-Daily adaptation).
 *
 * No AsyncStorage, no navigation, no React here; the caller (a new
 * screen, built in a later phase) is responsible for actually persisting
 * the draft via data/storage.ts's upsertTask, exactly like
 * PostponementSmallerTaskScreen's own createAndStart does.
 */
import { createEmptyTask, generateTaskId } from "./tasks.ts";
import type { Task } from "./tasks.ts";

/** Floor-safe halving: a 60-minute task suggests 30, a 6-minute task suggests MIN_ADAPTED_MINUTES (never rounds down to ~0). */
export const MIN_ADAPTED_MINUTES = 5;

export function suggestHalvedDuration(plannedMinutes: number): number {
  return Math.max(MIN_ADAPTED_MINUTES, Math.floor(plannedMinutes / 2));
}

/**
 * Builds the shrunk child task's own fields -- caller still owns
 * minting the id, persisting it (upsertTask), and clamping
 * newDurationMinutes against the real remaining free time before the
 * next scheduled task (arc/dailyPlan.ts's resolveFreeMinutesUntilNextTask)
 * before ever starting a timer on it; this function only shapes the
 * draft, it never decides whether the duration is actually safe to run.
 */
export function buildAdaptedTaskDraft(originalTask: Task, newDurationMinutes: number, newActionText: string, now: string): Task {
  const base = createEmptyTask(generateTaskId(), newActionText.trim(), newActionText.trim(), now);
  return {
    ...base,
    expectedDurationMinutes: newDurationMinutes,
    scheduledDate: originalTask.scheduledDate,
    scheduledTime: originalTask.scheduledTime,
    routinePeriodId: originalTask.routinePeriodId,
    parentTaskId: originalTask.id,
  };
}
