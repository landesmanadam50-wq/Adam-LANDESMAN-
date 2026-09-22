import test from "node:test";
import assert from "node:assert/strict";

import { recordCombinedSessionCompletion } from "./personalDevelopmentRouteProgressPersistence.ts";
import type { PersonalDevelopmentRouteProgressStorageDependencies } from "./personalDevelopmentRouteProgressPersistence.ts";
import type { PersonalDevelopmentRouteProgressStore } from "./storage.ts";
import type { CombinedLiveSessionFacts } from "../arc/combinedLiveSessionFacts.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function facts(overrides: Partial<CombinedLiveSessionFacts> = {}): CombinedLiveSessionFacts {
  return {
    sessionId: "session-1",
    routeConfigId: "route-1",
    mode: "full",
    cadence: "reactive",
    configuredItemIds: ["t1"],
    selectedItemIds: ["t1"],
    practicedItemIds: ["t1"],
    completedTypes: ["thought"],
    primaryFactorId: "t1",
    stateProfileId: null,
    stateIncluded: false,
    stateInclusionDecision: null,
    presenceSelectedForSession: false,
    presenceMode: "skipped",
    reassessmentAnswer: null,
    factorRatingHistory: [],
    desiredStateRating: null,
    actionOutcomeKind: "factor_only",
    stateActionReached: false,
    stateActionCompleted: false,
    factorActionReached: true,
    factorActionCompleted: true,
    sharedActionCompleted: false,
    beneficialActionPolicy: "required",
    stateActionSkipped: false,
    factorActionSkipped: false,
    sharedActionSkipped: false,
    terminalCompleted: true,
    ...overrides,
  };
}

function fakeDeps(initial: PersonalDevelopmentRouteProgressStore = {}): PersonalDevelopmentRouteProgressStorageDependencies & { loadCount: number; saveCount: number; savedStores: PersonalDevelopmentRouteProgressStore[] } {
  let store = initial;
  const savedStores: PersonalDevelopmentRouteProgressStore[] = [];
  const deps = {
    loadCount: 0,
    saveCount: 0,
    savedStores,
    loadStore: async () => {
      deps.loadCount++;
      return store;
    },
    saveStore: async (next: PersonalDevelopmentRouteProgressStore) => {
      deps.saveCount++;
      store = next;
      savedStores.push(next);
    },
  };
  return deps;
}

test("a valid session performs exactly one load and one save", async () => {
  const deps = fakeDeps();
  const outcome = await recordCombinedSessionCompletion(facts(), NOW, deps);
  assert.equal(outcome.kind, "applied");
  assert.equal(deps.loadCount, 1);
  assert.equal(deps.saveCount, 1);
});

test("saved store has the correct routeConfigId key and counters", async () => {
  const deps = fakeDeps();
  await recordCombinedSessionCompletion(facts(), NOW, deps);
  const saved = deps.savedStores[0];
  assert.ok(saved["route-1"]);
  assert.equal(saved["route-1"].completedSessions, 1);
});

test("duplicate_session and invalid_completion outcomes never save", async () => {
  const deps = fakeDeps();
  await recordCombinedSessionCompletion(facts(), NOW, deps);
  assert.equal(deps.saveCount, 1);

  const duplicateOutcome = await recordCombinedSessionCompletion(facts(), NOW, deps);
  assert.equal(duplicateOutcome.kind, "duplicate_session");
  assert.equal(deps.saveCount, 1, "duplicate never triggers a second save");

  const invalidOutcome = await recordCombinedSessionCompletion(facts({ terminalCompleted: false, sessionId: "session-2" }), NOW, deps);
  assert.equal(invalidOutcome.kind, "invalid_completion");
  assert.equal(deps.saveCount, 1, "invalid completion never saves");
});

test("retry with the same sessionId after a prior successful save remains idempotent -- no double count", async () => {
  const deps = fakeDeps();
  const first = await recordCombinedSessionCompletion(facts({ sessionId: "retry-session" }), NOW, deps);
  assert.equal(first.kind, "applied");
  const retry = await recordCombinedSessionCompletion(facts({ sessionId: "retry-session" }), "2026-01-02T00:00:00.000Z", deps);
  assert.equal(retry.kind, "duplicate_session");
  if (retry.kind !== "duplicate_session") return;
  assert.equal(retry.progress.completedSessions, 1);
  assert.equal(deps.saveCount, 1);
});

test("a genuine load failure propagates as a rejected promise, never silently misreported as success", async () => {
  const deps: PersonalDevelopmentRouteProgressStorageDependencies = {
    loadStore: async () => {
      throw new Error("boom");
    },
    saveStore: async () => {},
  };
  await assert.rejects(() => recordCombinedSessionCompletion(facts(), NOW, deps));
});

test("a genuine save failure propagates as a rejected promise", async () => {
  const deps: PersonalDevelopmentRouteProgressStorageDependencies = {
    loadStore: async () => ({}),
    saveStore: async () => {
      throw new Error("boom");
    },
  };
  await assert.rejects(() => recordCombinedSessionCompletion(facts(), NOW, deps));
});

test("two different routes' progress stay independent within the same store", async () => {
  const deps = fakeDeps();
  await recordCombinedSessionCompletion(facts({ routeConfigId: "route-A", sessionId: "sA" }), NOW, deps);
  await recordCombinedSessionCompletion(facts({ routeConfigId: "route-B", sessionId: "sB" }), NOW, deps);
  const finalStore = deps.savedStores[deps.savedStores.length - 1];
  assert.equal(finalStore["route-A"].completedSessions, 1);
  assert.equal(finalStore["route-B"].completedSessions, 1);
});

test("missing progress for a route defaults to zero (lazily created), never requiring migration", async () => {
  const deps = fakeDeps({});
  const outcome = await recordCombinedSessionCompletion(facts({ routeConfigId: "brand-new-route" }), NOW, deps);
  assert.equal(outcome.kind, "applied");
  if (outcome.kind !== "applied") return;
  assert.equal(outcome.progress.completedSessions, 1);
  assert.equal(outcome.progress.routeConfigId, "brand-new-route");
});
