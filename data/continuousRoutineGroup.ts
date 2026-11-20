/**
 * data/continuousRoutineGroup.ts
 *
 * Unified ARC & Productivity Update task, requirement 9: the thin
 * storage/orchestration wrapper over arc/continuousRoutineGroup.ts's
 * pure logic -- same split data/dailyRoutine.ts already uses over
 * arc/dailyRoutine.ts. Also owns the pending-combined-smiles
 * accumulator: "accumulate eligible smiles (not points) silently...
 * one combined smile-reward experience at the end." Each task
 * completion inside a continuous routine (ad-hoc group OR the
 * pre-existing per-period routineMode) is its own separate screen
 * mount, so the running total across the whole routine has to be
 * PERSISTED between completions, not just held in a local variable.
 */

import {
  createContinuousRoutineGroup,
  findGroupForTask,
  removeContinuousRoutineGroup,
  upsertContinuousRoutineGroup,
  type ContinuousRoutineGroup,
} from "../arc/continuousRoutineGroup.ts";
import { loadContinuousRoutineGroups, loadContinuousRoutinePendingSmiles, saveContinuousRoutineGroups, saveContinuousRoutinePendingSmiles } from "./storage.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";

export async function saveNewContinuousRoutineGroup(taskIds: readonly string[], dateLocal: string, now: Date): Promise<ContinuousRoutineGroup> {
  const groups = await loadContinuousRoutineGroups();
  const group = createContinuousRoutineGroup(taskIds, dateLocal, now.toISOString());
  await saveContinuousRoutineGroups(upsertContinuousRoutineGroup(groups, group));
  return group;
}

/** Removes the grouping record only -- the tasks themselves, their schedule, and anything already completed are never touched. */
export async function deleteContinuousRoutineGroup(groupId: string): Promise<void> {
  const groups = await loadContinuousRoutineGroups();
  await saveContinuousRoutineGroups(removeContinuousRoutineGroup(groups, groupId));
}

export async function loadContinuousRoutineGroupForTaskToday(taskId: string, now: Date): Promise<ContinuousRoutineGroup | null> {
  const groups = await loadContinuousRoutineGroups();
  return findGroupForTask(groups, todayLocalDateString(now), taskId);
}

/** Every group for one specific calendar date -- build/FlexibleDailyScreen.tsx's own badge/ungroup UI reads this to know which of today's (or whichever date it's viewing) entries are already grouped. */
export async function loadContinuousRoutineGroupsForDate(dateLocal: string): Promise<ContinuousRoutineGroup[]> {
  const groups = await loadContinuousRoutineGroups();
  return groups.filter((group) => group.dateLocal === dateLocal);
}

/**
 * Pending-combined-smiles accumulator -- keyed by an opaque
 * `groupKey` the caller derives (an ad-hoc group's own id, or
 * `period:<periodId>:<dateLocal>` for the pre-existing per-period
 * routineMode flow, which has exactly the same "never shows a
 * combined total" gap). Reading via `take...` both returns AND clears
 * the stored value in one step, so the same pending total can never
 * be read twice -- "prevent duplicate rewards."
 */

/** Adds `smiles` to the running total under `groupKey` -- called after every intermediate (non-final) task in a continuous routine. */
export async function addPendingContinuousRoutineSmiles(groupKey: string, smiles: number): Promise<void> {
  if (smiles <= 0) return;
  const map = await loadContinuousRoutinePendingSmiles();
  map[groupKey] = (map[groupKey] ?? 0) + smiles;
  await saveContinuousRoutinePendingSmiles(map);
}

/** Reads and clears the accumulated total under `groupKey` in one step -- call once, on the FINAL task, to get the combined total for the one summary reward screen. 0 if nothing was pending (e.g. the routine was only ever one task long). */
export async function takePendingContinuousRoutineSmiles(groupKey: string): Promise<number> {
  const map = await loadContinuousRoutinePendingSmiles();
  const pending = map[groupKey] ?? 0;
  if (pending !== 0) {
    delete map[groupKey];
    await saveContinuousRoutinePendingSmiles(map);
  }
  return pending;
}
