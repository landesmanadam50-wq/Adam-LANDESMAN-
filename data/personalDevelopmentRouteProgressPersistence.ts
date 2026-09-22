/**
 * data/personalDevelopmentRouteProgressPersistence.ts
 *
 * Adaptive ARC architecture task, Phase 15: the single orchestration
 * point between arc/personalDevelopmentRouteProgress.ts's own pure apply
 * function and data/storage.ts's PersonalDevelopmentRouteProgressStore
 * persistence -- mirrors data/progressionSessionPersistence.ts's own
 * "load -> pure apply -> conditional save" shape exactly, for a
 * structurally unrelated store (see that module's own header doc for why
 * these two progression systems are deliberately kept separate).
 *
 * Same accepted non-atomicity caveat as data/progressionSessionPersistence.ts:
 * this is a plain load -> pure update -> save sequence, not an atomic
 * transaction. No locking is implemented. A caller must await one
 * recording call to completion before starting another one for the same
 * session.
 */

import { loadPersonalDevelopmentRouteProgressStore, savePersonalDevelopmentRouteProgressStore } from "./storage.ts";
import type { PersonalDevelopmentRouteProgressStore } from "./storage.ts";
import {
  applyCombinedSessionCompletionToProgress,
  applyStageProgressionToRouteProgress,
  createEmptyPersonalDevelopmentRouteProgress,
  resolveBeneficialActionOutcomeForFacts,
} from "../arc/personalDevelopmentRouteProgress.ts";
import type { RecordCombinedSessionOutcome } from "../arc/personalDevelopmentRouteProgress.ts";
import type { CombinedLiveSessionFacts } from "../arc/combinedLiveSessionFacts.ts";

export interface PersonalDevelopmentRouteProgressStorageDependencies {
  loadStore: () => Promise<PersonalDevelopmentRouteProgressStore>;
  saveStore: (store: PersonalDevelopmentRouteProgressStore) => Promise<void>;
}

const defaultPersonalDevelopmentRouteProgressStorageDependencies: PersonalDevelopmentRouteProgressStorageDependencies = {
  loadStore: loadPersonalDevelopmentRouteProgressStore,
  saveStore: savePersonalDevelopmentRouteProgressStore,
};

/**
 * Loads the store, resolves (or lazily creates) the one record for
 * `facts.routeConfigId`, validates and applies `facts` via the pure
 * arc/ function, and saves the WHOLE store back only when the outcome is
 * "applied" -- "duplicate_session"/"invalid_completion" never write.
 * A genuine AsyncStorage failure (load or save) propagates as a rejected
 * promise, never misreported as a successful/duplicate completion.
 *
 * Adaptive ARC architecture task (unified PD/ARC Goal), method-completion
 * correction: immediately after a genuinely new "applied" completion, also
 * runs the 4-stage counters forward via applyStageProgressionToRouteProgress
 * (arc/personalDevelopmentRouteProgress.ts) -- `facts.stageAtStart` (frozen
 * at session creation) and the outcome resolved by
 * resolveBeneficialActionOutcomeForFacts, so a session always counts toward
 * the stage it was actually practiced at. The single store write below
 * persists BOTH updates together (session counters + stage counters) in one
 * save, never two separate writes. A "duplicate_session"/"invalid_completion"
 * outcome never reaches stage progression either -- exactly the same "never
 * double-count, never count an invalid session" guarantee
 * applyCombinedSessionCompletionToProgress already provides.
 */
export async function recordCombinedSessionCompletion(
  facts: CombinedLiveSessionFacts,
  now: string,
  deps: PersonalDevelopmentRouteProgressStorageDependencies = defaultPersonalDevelopmentRouteProgressStorageDependencies
): Promise<RecordCombinedSessionOutcome> {
  const store = await deps.loadStore();
  const existing = store[facts.routeConfigId] ?? createEmptyPersonalDevelopmentRouteProgress(facts.routeConfigId, now);
  const outcome = applyCombinedSessionCompletionToProgress(existing, facts, now);
  if (outcome.kind === "applied") {
    const beneficialActionOutcome = resolveBeneficialActionOutcomeForFacts(facts);
    const { progress: withStageProgress } = applyStageProgressionToRouteProgress(outcome.progress, facts.stageAtStart, beneficialActionOutcome, facts.beneficialActionPolicy, now);
    await deps.saveStore({ ...store, [facts.routeConfigId]: withStageProgress });
    return { kind: "applied", progress: withStageProgress };
  }
  return outcome;
}
