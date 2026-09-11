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

import type { ArcGoal, ArcGoalInterferingMapping, ArcGoalUrgeMapping } from "./types.ts";
import { generateArcGoalMappingId, generateArcGoalUrgeMappingId } from "./types.ts";

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
    // ARC Goal task (Urge route): same "own new id per row, references
    // copied as-is" treatment as interferingMappings above.
    urgeMappings: goal.urgeMappings.map((mapping: ArcGoalUrgeMapping) => ({
      ...mapping,
      id: generateArcGoalUrgeMappingId(),
    })),
    // Four-Week Program task: a duplicate is a brand-new goal, never a
    // continuation -- it never inherits another goal's actual progress,
    // dates, or practice history. The trainee enables/configures its
    // own program from scratch, same as any newly-created ArcGoal.
    fourWeekProgram: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * ARC Goal task (Urge route + Mini ARC integration): safe-default
 * backfill for every field added to ArcGoal/ArcGoalInterferingMapping
 * after they were first saved -- the same "defensive defaulting at read
 * time, no migration step" idiom resolveDwellSecondsFor and
 * deriveActiveLayersForArcBuild already use elsewhere. Called once,
 * every time an ArcGoal is loaded (data/storage.ts's loadArcGoals/
 * getArcGoal) -- never at save time, so a goal loaded and re-saved
 * without ever touching the new fields still round-trips its old shape
 * plus these safe defaults, never losing data.
 *
 * `urgeMappings` missing entirely (a goal saved before the Urge route
 * existed) becomes []. Each interfering mapping missing
 * miniArcId/executionMode/identityProtocolId/goalAction gets them
 * defaulted to null/"full"/null/null respectively -- "full" specifically
 * because every pre-existing mapping's only real bridge was always the
 * Full Supportive-State ARC; treating an unconfigured mapping as
 * anything else would silently change its live behavior.
 */
export function normalizeArcGoal(goal: ArcGoal): ArcGoal {
  return {
    ...goal,
    // Sub-goal↔ARC Goal connection task: every ArcGoal saved before this
    // field existed (the overwhelming majority) backfills to null --
    // "not linked to any Life Manifest Sub-goal," never invented.
    lifeManifestSubGoalId: goal.lifeManifestSubGoalId ?? null,
    interferingMappings: (goal.interferingMappings ?? []).map((mapping) => ({
      ...mapping,
      miniArcId: mapping.miniArcId ?? null,
      executionMode: mapping.executionMode ?? "full",
      identityProtocolId: mapping.identityProtocolId ?? null,
      goalAction: mapping.goalAction ?? null,
    })),
    urgeMappings: (goal.urgeMappings ?? []).map((mapping) => ({
      ...mapping,
      miniArcId: mapping.miniArcId ?? null,
      executionMode: mapping.executionMode ?? "full",
      identityProtocolId: mapping.identityProtocolId ?? null,
      goalAction: mapping.goalAction ?? null,
    })),
    // Four-Week Program task: every ArcGoal saved before this field
    // existed backfills to null -- "no four-week program configured,"
    // never silently invented/enabled. See ArcGoal.fourWeekProgram's
    // own doc.
    fourWeekProgram: goal.fourWeekProgram ?? null,
  };
}
