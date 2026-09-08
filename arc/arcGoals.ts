/**
 * arc/arcGoals.ts
 *
 * Pure list-manipulation logic behind data/storage.ts's ArcGoal CRUD
 * (upsertArcGoal/deleteArcGoal/duplicateArcGoal) -- extracted here,
 * separate from the AsyncStorage I/O, exactly mirroring arc/arcBuilds.ts's
 * own module doc and guarantees: creating/editing/deleting one ArcGoal
 * never touches another; two goals sharing the same name stay fully
 * independent, distinguished only by their own stable id, never by name.
 */

import type { ArcGoal, ArcGoalInterferingMapping } from "./types.ts";
import { generateArcGoalMappingId } from "./types.ts";

/** Updates the one goal matching `goal.id` in place if found, otherwise appends it as a new goal at the end. Never reorders or re-indexes the rest of the list, and never matches by anything other than id. */
export function upsertArcGoalInList(goals: ArcGoal[], goal: ArcGoal): ArcGoal[] {
  const index = goals.findIndex((existing) => existing.id === goal.id);
  if (index === -1) return [...goals, goal];
  return goals.map((existing, i) => (i === index ? goal : existing));
}

/** Removes exactly the one goal matching `id` -- every other goal is returned as the exact same object it already was. A no-op if the id doesn't match any goal. */
export function deleteArcGoalFromList(goals: ArcGoal[], id: string): ArcGoal[] {
  return goals.filter((goal) => goal.id !== id);
}

/**
 * A deep, independent copy of `goal` under a new id -- "create, edit,
 * duplicate and delete multiple ARC Goals" (spec section 2). Every
 * REFERENCE (identityProtocolId, and each mapping's supportiveProtocolId)
 * is copied as-is, never followed/duplicated itself -- the duplicate
 * goal shares the exact same referenced ArcBuild protocols as the
 * original, exactly satisfying "a protocol may support several targets
 * or goals" (spec section 19). Each interfering mapping gets its OWN
 * new id (never reusing the original mapping's id), so editing a row on
 * one goal's linking page can never accidentally affect the other's.
 * Does not persist anything itself -- callers (data/storage.ts's
 * upsertArcGoal) are responsible for saving the result.
 */
export function duplicateArcGoal(goal: ArcGoal, newId: string, now: string): ArcGoal {
  return {
    ...goal,
    id: newId,
    name: `${goal.name} (עותק)`,
    interferingMappings: goal.interferingMappings.map((mapping: ArcGoalInterferingMapping) => ({
      ...mapping,
      id: generateArcGoalMappingId(),
    })),
    createdAt: now,
    updatedAt: now,
  };
}
