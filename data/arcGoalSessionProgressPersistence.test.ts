import test from "node:test";
import assert from "node:assert/strict";

import { recordArcGoalSessionCompletion } from "./arcGoalSessionProgressPersistence.ts";
import type { ArcGoalSessionProgressStorageDependencies } from "./arcGoalSessionProgressPersistence.ts";
import type { ArcGoalSessionProgressStore } from "./storage.ts";
import type { ArcGoalSharedFacts } from "../arc/sharedLiveSessionFacts.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function facts(overrides: Partial<ArcGoalSharedFacts> = {}): ArcGoalSharedFacts {
  return {
    track: "arc_goal",
    sessionId: "session-1",
    arcGoalId: "goal-1",
    weeklyActionId: null,
    mappingKind: "interfering",
    mappingId: "m1",
    executionMode: "full",
    actionRelationship: "same_action",
    identityActionCompleted: true,
    outerRunCompleted: true,
    terminalCompleted: true,
    ...overrides,
  };
}

function fakeDeps(
  initial: ArcGoalSessionProgressStore = {}
): ArcGoalSessionProgressStorageDependencies & { loadCount: number; saveCount: number; savedStores: ArcGoalSessionProgressStore[] } {
  let store = initial;
  const savedStores: ArcGoalSessionProgressStore[] = [];
  const deps = {
    loadCount: 0,
    saveCount: 0,
    savedStores,
    loadStore: async () => {
      deps.loadCount++;
      return store;
    },
    saveStore: async (next: ArcGoalSessionProgressStore) => {
      deps.saveCount++;
      store = next;
      savedStores.push(next);
    },
  };
  return deps;
}

test("a valid session performs exactly one load and one save", async () => {
  const deps = fakeDeps();
  const outcome = await recordArcGoalSessionCompletion(facts(), NOW, deps);
  assert.equal(outcome.kind, "applied");
  assert.equal(deps.loadCount, 1);
  assert.equal(deps.saveCount, 1);
});

test("saved store has the correct arcGoalId key and counters", async () => {
  const deps = fakeDeps();
  await recordArcGoalSessionCompletion(facts(), NOW, deps);
  const saved = deps.savedStores[0];
  assert.ok(saved["goal-1"]);
  assert.equal(saved["goal-1"].completedSessions, 1);
});

test("duplicate_session and invalid_completion outcomes never save", async () => {
  const deps = fakeDeps();
  await recordArcGoalSessionCompletion(facts(), NOW, deps);
  assert.equal(deps.saveCount, 1);

  const duplicateOutcome = await recordArcGoalSessionCompletion(facts(), NOW, deps);
  assert.equal(duplicateOutcome.kind, "duplicate_session");
  assert.equal(deps.saveCount, 1, "duplicate never triggers a second save");

  const invalidOutcome = await recordArcGoalSessionCompletion(facts({ terminalCompleted: false, sessionId: "session-2" }), NOW, deps);
  assert.equal(invalidOutcome.kind, "invalid_completion");
  assert.equal(deps.saveCount, 1, "invalid completion never saves");
});

test("retry with the same sessionId after a prior successful save remains idempotent -- no double count", async () => {
  const deps = fakeDeps();
  const first = await recordArcGoalSessionCompletion(facts({ sessionId: "retry-session" }), NOW, deps);
  assert.equal(first.kind, "applied");
  const retry = await recordArcGoalSessionCompletion(facts({ sessionId: "retry-session" }), "2026-01-02T00:00:00.000Z", deps);
  assert.equal(retry.kind, "duplicate_session");
  if (retry.kind !== "duplicate_session") return;
  assert.equal(retry.progress.completedSessions, 1);
  assert.equal(deps.saveCount, 1);
});

test("a genuine load failure propagates as a rejected promise, never silently misreported as success", async () => {
  const deps: ArcGoalSessionProgressStorageDependencies = {
    loadStore: async () => {
      throw new Error("boom");
    },
    saveStore: async () => {},
  };
  await assert.rejects(() => recordArcGoalSessionCompletion(facts(), NOW, deps));
});

test("a genuine save failure propagates as a rejected promise", async () => {
  const deps: ArcGoalSessionProgressStorageDependencies = {
    loadStore: async () => ({}),
    saveStore: async () => {
      throw new Error("boom");
    },
  };
  await assert.rejects(() => recordArcGoalSessionCompletion(facts(), NOW, deps));
});

test("two different goals' progress stay independent within the same store", async () => {
  const deps = fakeDeps();
  await recordArcGoalSessionCompletion(facts({ arcGoalId: "goal-A", sessionId: "sA" }), NOW, deps);
  await recordArcGoalSessionCompletion(facts({ arcGoalId: "goal-B", sessionId: "sB" }), NOW, deps);
  const finalStore = deps.savedStores[deps.savedStores.length - 1];
  assert.equal(finalStore["goal-A"].completedSessions, 1);
  assert.equal(finalStore["goal-B"].completedSessions, 1);
});

test("missing progress for a goal defaults to zero (lazily created), never requiring migration", async () => {
  const deps = fakeDeps({});
  const outcome = await recordArcGoalSessionCompletion(facts({ arcGoalId: "brand-new-goal" }), NOW, deps);
  assert.equal(outcome.kind, "applied");
  if (outcome.kind !== "applied") return;
  assert.equal(outcome.progress.completedSessions, 1);
  assert.equal(outcome.progress.arcGoalId, "brand-new-goal");
});
