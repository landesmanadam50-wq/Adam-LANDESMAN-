/**
 * data/progressionSessionPersistence.ts
 *
 * Adaptive ARC architecture task, Phase 8: the thin persistence layer
 * over Phase 7's pure session bridge (arc/progressionSessionBridge.ts)
 * -- load the current MappingProgressionStore, pass it UNCHANGED to the
 * appropriate Phase 7 bridge function, and save the result only when
 * that bridge actually applied something. Neither Phase 6 nor Phase 7
 * is modified -- both are imported and called verbatim; this file adds
 * no new counting or eligibility rule of its own.
 *
 * A completed session is allowed to update progression ONLY when the
 * Phase 7 outcome is `{ kind: "processed", applyOutcome: { kind: "applied" } }`.
 * Every other outcome (`not_eligible`/`goal_track_excluded`, `processed`
 * with `applyOutcome.kind` of `not_completed`, `invalid_combination`, or
 * `duplicate_session`) skips the save entirely -- the store may still be
 * READ (harmless), but is never written.
 *
 * DEPENDENCY INJECTION: each function accepts an optional
 * ProgressionStorageDependencies parameter, defaulting to the real
 * data/storage.ts load/save functions. Production callers that omit it
 * get exactly the real AsyncStorage-backed behavior; tests inject an
 * in-memory pair instead, so this file's own orchestration logic (the
 * load -> bridge -> conditional-save sequence, and every skip-save rule
 * above) is fully covered by node --test without a native AsyncStorage
 * runtime -- data/storage.ts's own load/save functions themselves stay
 * exempt from direct unit tests, exactly like every other loadX/saveX
 * pair in that file (see its own module doc).
 *
 * CONCURRENCY: this is a plain load -> pure update -> save sequence, NOT
 * an atomic transaction. Two concurrent calls for the SAME mapping key
 * (or even the same sessionId) can each load the same pre-update store
 * and race to save, and the second write can overwrite the first's
 * update. No locking is implemented in this phase. A future LIVE caller
 * MUST `await` each recording call to completion before starting
 * another one for the same completed session, rather than firing
 * several concurrently.
 */

import type {
  ProgressionMappingContext,
  RegularSessionBridgeInput,
  RegularSessionBridgeOutcome,
  Stage3SessionBridgeInput,
  Stage3SessionBridgeOutcome,
} from "../arc/progressionSessionBridge.ts";
import { applyRegularSessionToProgression, applyStage3SessionToProgression, resolveAvailablePracticeStages, resolveProgressionCadence, resolveProgressionMappingKey } from "../arc/progressionSessionBridge.ts";
import type { MappingProgressionStore, ProgressionStage } from "../arc/reactiveProactiveProgression.ts";
import { createEmptyMappingProgressionCounters } from "../arc/reactiveProactiveProgression.ts";
import { loadProgressionMappingStore, saveProgressionMappingStore } from "./storage.ts";

/**
 * The injectable storage boundary -- `loadStore`/`saveStore` default to
 * the real data/storage.ts functions (real AsyncStorage), but a test may
 * pass an in-memory pair instead. Production behavior is never changed
 * by this: omitting the parameter always resolves to the exact same
 * real load/save calls this file would have made without it.
 */
export interface ProgressionStorageDependencies {
  loadStore: () => Promise<MappingProgressionStore>;
  saveStore: (store: MappingProgressionStore) => Promise<void>;
}

const defaultProgressionStorageDependencies: ProgressionStorageDependencies = {
  loadStore: loadProgressionMappingStore,
  saveStore: saveProgressionMappingStore,
};

/**
 * Records one completed Stage 1/2/4 session, persisting the update only
 * when Phase 7's own outcome is "processed" with an "applied"
 * applyOutcome. On a genuine storage write failure, `deps.saveStore`'s
 * own rejection propagates out of this function unchanged -- the
 * "applied" outcome is never returned as if the write had actually
 * succeeded (see this module's own header doc on the existing storage
 * error policy: loads are defensive/never throw, saves are never
 * silently swallowed).
 */
export async function recordRegularProgressionSession(
  context: ProgressionMappingContext,
  input: RegularSessionBridgeInput,
  deps: ProgressionStorageDependencies = defaultProgressionStorageDependencies
): Promise<RegularSessionBridgeOutcome> {
  const store = await deps.loadStore();
  const outcome = applyRegularSessionToProgression(store, context, input);
  if (outcome.kind === "processed" && outcome.applyOutcome.kind === "applied") {
    await deps.saveStore(outcome.store);
  }
  return outcome;
}

/** Records one completed Stage 3 compound session -- same load/apply/conditional-save sequence and the same storage-failure-propagation guarantee as recordRegularProgressionSession above. */
export async function recordStage3ProgressionSession(
  context: ProgressionMappingContext,
  input: Stage3SessionBridgeInput,
  deps: ProgressionStorageDependencies = defaultProgressionStorageDependencies
): Promise<Stage3SessionBridgeOutcome> {
  const store = await deps.loadStore();
  const outcome = applyStage3SessionToProgression(store, context, input);
  if (outcome.kind === "processed" && outcome.applyOutcome.kind === "applied") {
    await deps.saveStore(outcome.store);
  }
  return outcome;
}

/**
 * Read-only: loads the persisted store, resolves this mapping's own key
 * (Phase 7's resolveProgressionMappingKey, unmodified), and returns
 * Phase 7's own resolveAvailablePracticeStages for whichever counters
 * are on record -- a fresh, empty MappingProgressionCounters (never
 * persisted) when this mapping has no saved progress yet, which always
 * resolves to `[1]`. Never writes anything, regardless of whether the
 * mapping already existed in the store -- querying availability can
 * never create a store entry.
 */
export async function loadAvailablePracticeStagesForMapping(
  context: ProgressionMappingContext,
  deps: ProgressionStorageDependencies = defaultProgressionStorageDependencies
): Promise<ProgressionStage[]> {
  const store = await deps.loadStore();
  const key = resolveProgressionMappingKey(context);
  const counters = store[key] ?? createEmptyMappingProgressionCounters();
  const cadence = resolveProgressionCadence(context.item);
  return resolveAvailablePracticeStages(counters, cadence);
}
