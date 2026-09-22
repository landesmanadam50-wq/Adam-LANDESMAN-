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
    stageAtStart: 1,
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

// --- Method-completion correction: applyStageProgressionToRouteProgress is now wired in ---

test("a single applied session also advances the correct stageAtStart-matching confirmed count, in the SAME save as the session counters", async () => {
  const deps = fakeDeps();
  const outcome = await recordCombinedSessionCompletion(facts({ stageAtStart: 1 }), NOW, deps);
  assert.equal(outcome.kind, "applied");
  if (outcome.kind !== "applied") return;
  assert.equal(outcome.progress.stage1ConfirmedCount, 1);
  assert.equal(outcome.progress.stage, 1, "one completion is below the 10-completion threshold");
  assert.equal(deps.saveCount, 1, "session counters and stage counters are written together, in one save");
});

test("the 10th valid completion at Stage 1 advances the route's own stage to 2, all still within one recordCombinedSessionCompletion call per session", async () => {
  const deps = fakeDeps();
  let lastOutcome;
  for (let i = 0; i < 10; i++) {
    lastOutcome = await recordCombinedSessionCompletion(facts({ sessionId: `s${i}`, stageAtStart: 1 }), NOW, deps);
  }
  assert.equal(lastOutcome?.kind, "applied");
  if (lastOutcome?.kind !== "applied") return;
  assert.equal(lastOutcome.progress.stage1ConfirmedCount, 10);
  assert.equal(lastOutcome.progress.stage, 2);
});

test("a duplicate session never advances stage progression a second time", async () => {
  const deps = fakeDeps();
  await recordCombinedSessionCompletion(facts({ sessionId: "dup", stageAtStart: 1 }), NOW, deps);
  const retry = await recordCombinedSessionCompletion(facts({ sessionId: "dup", stageAtStart: 1 }), NOW, deps);
  assert.equal(retry.kind, "duplicate_session");
  if (retry.kind !== "duplicate_session") return;
  assert.equal(retry.progress.stage1ConfirmedCount, 1, "the duplicate retry never increments a second time");
});

test("a Stage 3 session under policy 'optional_in_live' whose action was SKIPPED counts toward completedSessions but never toward stage3ConfirmedCount", async () => {
  const deps = fakeDeps({ "route-1": { routeConfigId: "route-1", completedSessions: 0, completedByInterferenceType: { thought: 0, belief: 0, emotion: 0, urge: 0, presence: 0 }, embeddedPresenceUses: 0, fullPresenceCompletions: 0, completedFullSessions: 0, completedMiniSessions: 0, completedRouteLinkSessions: 0, completedActionOnlySessions: 0, countedSessionIds: [], stage: 3, stage1ConfirmedCount: 10, stage2ConfirmedCount: 10, stage3ConfirmedCount: 0, stage4ConfirmedCount: 0, createdAt: NOW, updatedAt: NOW, schemaVersion: 1 } });
  const outcome = await recordCombinedSessionCompletion(
    facts({ stageAtStart: 3, mode: "route_link", beneficialActionPolicy: "optional_in_live", factorActionCompleted: false, factorActionSkipped: true }),
    NOW,
    deps
  );
  assert.equal(outcome.kind, "applied");
  if (outcome.kind !== "applied") return;
  assert.equal(outcome.progress.completedSessions, 1, "the session itself still counts");
  assert.equal(outcome.progress.stage3ConfirmedCount, 0, "a skipped Beneficial Action never counts toward Stage 3 credit");
});

test("a Full session practiced while the route sits at Stage 2 (a secondary/support session, Mini being Stage 2's own advancement mode) still writes the normal completion and Full-session statistic, but never increments stage2ConfirmedCount", async () => {
  const deps = fakeDeps({
    "route-1": {
      routeConfigId: "route-1",
      completedSessions: 0,
      completedByInterferenceType: { thought: 0, belief: 0, emotion: 0, urge: 0, presence: 0 },
      embeddedPresenceUses: 0,
      fullPresenceCompletions: 0,
      completedFullSessions: 0,
      completedMiniSessions: 0,
      completedRouteLinkSessions: 0,
      completedActionOnlySessions: 0,
      countedSessionIds: [],
      stage: 2,
      stage1ConfirmedCount: 10,
      stage2ConfirmedCount: 3,
      stage3ConfirmedCount: 0,
      stage4ConfirmedCount: 0,
      createdAt: NOW,
      updatedAt: NOW,
      schemaVersion: 1,
    },
  });
  const outcome = await recordCombinedSessionCompletion(facts({ stageAtStart: 2, mode: "full" }), NOW, deps);
  assert.equal(outcome.kind, "applied");
  if (outcome.kind !== "applied") return;
  assert.equal(outcome.progress.completedSessions, 1, "the normal route completion is still written exactly once");
  assert.equal(outcome.progress.completedFullSessions, 1, "the general per-mode statistic still updates");
  assert.equal(outcome.progress.stage2ConfirmedCount, 3, "a support-mode session never increments the current stage's advancement counter");
  assert.equal(outcome.progress.stage, 2, "the route's stage is unaffected");
});

test("Stage 1 counts both Full and Mini toward the SAME stage1ConfirmedCount, since Stage 1 has no earlier stage to demote either one to secondary support", async () => {
  const deps = fakeDeps();
  await recordCombinedSessionCompletion(facts({ sessionId: "s-full", stageAtStart: 1, mode: "full" }), NOW, deps);
  const outcome = await recordCombinedSessionCompletion(facts({ sessionId: "s-mini", stageAtStart: 1, mode: "mini" }), NOW, deps);
  assert.equal(outcome.kind, "applied");
  if (outcome.kind !== "applied") return;
  assert.equal(outcome.progress.stage1ConfirmedCount, 2, "both Full and Mini completions counted toward Stage 1 advancement");
});
