/**
 * data/postTaskRewards.ts
 *
 * Continuous vs. Spaced Routines task: the thin storage wrapper that
 * lets a caller record a task's smile reward WITHOUT ever showing the
 * timed smiling exercise -- used only for a continuous-mode task
 * completion, where "earning the reward" and "running the timed
 * exercise" are kept deliberately separate systems (see
 * arc/postTaskRewards.ts's own module doc). Every OTHER completion
 * path still records this reward the existing way, inside
 * live/PostTaskRewardScreen.tsx's own mount effect, right before it
 * shows that exercise.
 *
 * Idempotent by the exact same (taskId, dateLocal) event id
 * PostTaskRewardScreen's own mount effect uses (arc/postTaskRewards.ts's
 * resolveTaskCompletionEventId), so a task recorded here can never also
 * be double-rewarded if some other path later (incorrectly) also
 * recorded it -- recordTaskCompletion's own idempotency guard applies
 * exactly as it always has.
 */

import { createInitialPostTaskRewardsState, recordTaskCompletion, resolveTaskCompletionEventId, type TaskCompletionOutcome } from "../arc/postTaskRewards.ts";
import { loadPostTaskRewardsState, savePostTaskRewardsState } from "./storage.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";

/**
 * Unified ARC & Productivity Update task, requirement 9: now RETURNS
 * the outcome (every earlier call site that ignores the return value
 * is unaffected -- an additive, non-breaking change), so a continuous
 * routine's own completion flow can read exactly how many smiles THIS
 * task just earned and accumulate it toward the one combined total
 * shown at the end (data/continuousRoutineGroup.ts's own
 * addPendingContinuousRoutineSmiles).
 */
export async function recordSilentTaskCompletionReward(taskId: string, now: Date): Promise<TaskCompletionOutcome> {
  const today = todayLocalDateString(now);
  const state = (await loadPostTaskRewardsState()) ?? createInitialPostTaskRewardsState(today);
  const eventId = resolveTaskCompletionEventId(taskId, today);
  const result = recordTaskCompletion(state, eventId, today);
  await savePostTaskRewardsState(result.nextState);
  return result;
}
