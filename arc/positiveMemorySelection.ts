/**
 * arc/positiveMemorySelection.ts
 *
 * Positive Memory, Success Recall & Quick Capture task, section 13
 * ("Reusable memory-selection engine") + sections 8+9 (automatic
 * selection for ARC encoding / ARC Success): the ONE reusable
 * selection system, with two ranking strategies that both build on
 * the same shared scoring/variety machinery -- never two
 * independently-authored selectors. Pure data/logic only, no
 * AsyncStorage/navigation/React, no external AI dependency of any
 * kind (section 13: "do not introduce external AI dependencies solely
 * for memory selection").
 *
 * Both strategies retrieve only from the FINALIZED PositiveMemory
 * collection (never arc/positiveMemoryDraft.ts's own drafts, which
 * structurally can't appear here) and return null when nothing
 * matches -- "handle empty results safely," never inventing a
 * memory. Relevance (task/goal/feeling context) always outweighs raw
 * emotional intensity, which is used only as the final, smallest-
 * weighted tiebreaker (sections 8+9's own explicit requirement).
 */

import { resolvePositiveMemoriesForFeeling } from "./positiveMemory.ts";
import type { PositiveMemory } from "./positiveMemory.ts";
import { resolveLastSelectedMemoryId } from "./positiveMemorySelectionHistory.ts";
import type { PositiveMemorySelectionContext, PositiveMemorySelectionHistoryEntry } from "./positiveMemorySelectionHistory.ts";

export interface PositiveMemorySelectionContextInput {
  taskId?: string | null;
  goalIds?: string[];
}

function hasSharedGoal(memoryGoalIds: string[], contextGoalIds: string[] | undefined): boolean {
  if (!contextGoalIds || contextGoalIds.length === 0) return false;
  return memoryGoalIds.some((id) => contextGoalIds.includes(id));
}

/**
 * Shared tie-break + variety logic for BOTH strategies: picks the
 * single highest-scoring candidate; when several share the top score,
 * prefers one that was NOT the context's own last automatic
 * selection (section 8/9's own "avoid repeatedly selecting the same
 * memory" / "avoid unnecessary immediate repetition"), falling back
 * to the full tied set if excluding the last pick would leave none.
 * Deterministic ranking, randomized only among genuinely tied
 * candidates (section 13: "randomized tie-breaking is acceptable for
 * similarly relevant memories").
 */
function pickHighestScoringWithVariety<T extends { id: string }>(
  candidates: T[],
  score: (candidate: T) => number,
  history: PositiveMemorySelectionHistoryEntry[],
  selectionContext: PositiveMemorySelectionContext,
  contextKey: string
): T | null {
  if (candidates.length === 0) return null;
  const maxScore = Math.max(...candidates.map(score));
  const topCandidates = candidates.filter((candidate) => score(candidate) === maxScore);
  if (topCandidates.length === 1) return topCandidates[0];
  const lastSelectedId = resolveLastSelectedMemoryId(history, selectionContext, contextKey);
  const varied = topCandidates.filter((candidate) => candidate.id !== lastSelectedId);
  const pool = varied.length > 0 ? varied : topCandidates;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Strategy A (section 8, used by ARC encoding): a documented feeling
 * match is REQUIRED -- resolvePositiveMemoriesForFeeling already
 * filters to exactly that (criterion 1). Among those, scores:
 * criterion 2 (task/goal relevance) outweighs criterion 3 (documented
 * detail usefulness), which outweighs criterion 4 (intensity,
 * 1-5, the smallest-weighted factor) -- so a highly intense but
 * unrelated memory can never outrank a relevant one. `excludeIds`
 * supports "אירוע אחר" (re-selecting another eligible memory) without
 * a second, separately-written function.
 */
export function selectPositiveMemoryForFeeling(
  memories: PositiveMemory[],
  feeling: string,
  context: PositiveMemorySelectionContextInput,
  history: PositiveMemorySelectionHistoryEntry[],
  excludeIds: string[] = []
): PositiveMemory | null {
  const matching = resolvePositiveMemoriesForFeeling(memories, feeling);
  const eligible = matching.filter((memory) => !excludeIds.includes(memory.id));
  const pool = eligible.length > 0 ? eligible : matching;
  if (pool.length === 0) return null;

  function score(memory: PositiveMemory): number {
    const entry = memory.feelings.find((candidate) => candidate.feeling.trim().toLowerCase() === feeling.trim().toLowerCase());
    let total = 0;
    if (context.taskId && memory.taskId === context.taskId) total += 100;
    else if (hasSharedGoal(memory.linkedGoalIds, context.goalIds)) total += 50;
    if (entry?.moment.trim()) total += 10;
    if (memory.whatWasSpecial.trim()) total += 10;
    total += entry?.intensity ?? 0;
    return total;
  }

  return pickHighestScoringWithVariety(pool, score, history, "encoding_feeling", feeling.trim().toLowerCase());
}

export interface PositiveMemorySuccessSelectionContextInput {
  goalIds?: string[];
  feeling?: string | null;
}

/**
 * Strategy B (section 9, used by ARC Success): relevance to the
 * current TASK is established via an exact task-id match, a shared
 * goal link, or (secondarily) a matching documented feeling --
 * "prioritize explicit task relationships over weak text similarity"
 * is satisfied structurally by never attempting any text-similarity
 * comparison at all. Scoring mirrors Strategy A's own weighting:
 * exact task match outranks goal overlap, which outranks a feeling
 * match, which outranks mere documented-detail presence.
 */
export function selectPositiveMemoryForTaskSuccess(
  memories: PositiveMemory[],
  taskId: string,
  context: PositiveMemorySuccessSelectionContextInput,
  history: PositiveMemorySelectionHistoryEntry[],
  excludeIds: string[] = []
): PositiveMemory | null {
  const successMemories = memories.filter((memory) => memory.eventType === "success");
  const relevant = successMemories.filter(
    (memory) =>
      memory.taskId === taskId ||
      hasSharedGoal(memory.linkedGoalIds, context.goalIds) ||
      (context.feeling && memory.feelings.some((entry) => entry.feeling.trim().toLowerCase() === context.feeling!.trim().toLowerCase()))
  );
  const eligible = relevant.filter((memory) => !excludeIds.includes(memory.id));
  const pool = eligible.length > 0 ? eligible : relevant;
  if (pool.length === 0) return null;

  function score(memory: PositiveMemory): number {
    let total = 0;
    if (memory.taskId === taskId) total += 100;
    else if (hasSharedGoal(memory.linkedGoalIds, context.goalIds)) total += 50;
    if (context.feeling && memory.feelings.some((entry) => entry.feeling.trim().toLowerCase() === context.feeling!.trim().toLowerCase())) total += 20;
    if (memory.successDescription?.trim()) total += 10;
    return total;
  }

  return pickHighestScoringWithVariety(pool, score, history, "arc_success", taskId);
}
