/**
 * data/arcGoalSessionProgressPersistence.ts
 *
 * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 3: the
 * single orchestration point between arc/arcGoalSessionProgress.ts's own
 * pure apply function and data/storage.ts's ArcGoalSessionProgressStore
 * persistence -- mirrors data/personalDevelopmentRouteProgressPersistence.ts's
 * own "load -> pure apply -> conditional save" shape exactly, for
 * ArcGoal's own, structurally separate progress store.
 *
 * Same accepted non-atomicity caveat as that module: this is a plain
 * load -> pure update -> save sequence, not an atomic transaction. No
 * locking is implemented. A caller must await one recording call to
 * completion before starting another one for the same session.
 */

import { loadArcGoalSessionProgressStore, saveArcGoalSessionProgressStore } from "./storage.ts";
import type { ArcGoalSessionProgressStore } from "./storage.ts";
import { applyArcGoalSessionCompletionToProgress, createEmptyArcGoalSessionProgress } from "../arc/arcGoalSessionProgress.ts";
import type { RecordArcGoalSessionOutcome } from "../arc/arcGoalSessionProgress.ts";
import type { ArcGoalSharedFacts } from "../arc/sharedLiveSessionFacts.ts";

export interface ArcGoalSessionProgressStorageDependencies {
  loadStore: () => Promise<ArcGoalSessionProgressStore>;
  saveStore: (store: ArcGoalSessionProgressStore) => Promise<void>;
}

const defaultArcGoalSessionProgressStorageDependencies: ArcGoalSessionProgressStorageDependencies = {
  loadStore: loadArcGoalSessionProgressStore,
  saveStore: saveArcGoalSessionProgressStore,
};

/**
 * Loads the store, resolves (or lazily creates) the one record for
 * `facts.arcGoalId`, validates and applies `facts` via the pure arc/
 * function, and saves the WHOLE store back only when the outcome is
 * "applied" -- "duplicate_session"/"invalid_completion" never write. A
 * genuine AsyncStorage failure (load or save) propagates as a rejected
 * promise, never misreported as a successful/duplicate completion.
 */
export async function recordArcGoalSessionCompletion(
  facts: ArcGoalSharedFacts,
  now: string,
  deps: ArcGoalSessionProgressStorageDependencies = defaultArcGoalSessionProgressStorageDependencies
): Promise<RecordArcGoalSessionOutcome> {
  const store = await deps.loadStore();
  const existing = store[facts.arcGoalId] ?? createEmptyArcGoalSessionProgress(facts.arcGoalId, now);
  const outcome = applyArcGoalSessionCompletionToProgress(existing, facts, now);
  if (outcome.kind === "applied") {
    await deps.saveStore({ ...store, [facts.arcGoalId]: outcome.progress });
  }
  return outcome;
}
