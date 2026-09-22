import test from "node:test";
import assert from "node:assert/strict";

import { recordSharedLiveSessionCompletion } from "./sharedLiveSessionCompletion.ts";
import { recordCombinedSessionCompletion } from "./personalDevelopmentRouteProgressPersistence.ts";
import type { PersonalDevelopmentRouteProgressStorageDependencies } from "./personalDevelopmentRouteProgressPersistence.ts";
import { startPendingSharedActionExecution, confirmActionRoleAndPersist } from "./pendingSharedActionExecutionPersistence.ts";
import type { PendingSharedActionExecutionStorageDependencies } from "./pendingSharedActionExecutionPersistence.ts";
import type { ArcGoalSessionProgressStorageDependencies } from "./arcGoalSessionProgressPersistence.ts";
import type { PersonalDevelopmentRouteProgressStore, PendingSharedActionExecutionStore, ArcGoalSessionProgressStore } from "./storage.ts";
import type { PersonalDevelopmentSharedFacts, ArcGoalSharedFacts } from "../arc/sharedLiveSessionFacts.ts";
import type { CombinedLiveSessionFacts } from "../arc/combinedLiveSessionFacts.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-01T00:05:00.000Z";

const BENEFICIAL_ACTION_ROLE = "beneficial_action";
const IDENTITY_GOAL_ACTION_ROLE = "identity_goal_action";

function pdFacts(overrides: Partial<CombinedLiveSessionFacts> = {}): CombinedLiveSessionFacts {
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
    terminalCompleted: true,
    ...overrides,
  };
}

function pdSharedFacts(overrides: Partial<CombinedLiveSessionFacts> = {}): PersonalDevelopmentSharedFacts {
  return { track: "personal_development", facts: pdFacts(overrides) };
}

function arcGoalFacts(overrides: Partial<ArcGoalSharedFacts> = {}): ArcGoalSharedFacts {
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

function fakePdDeps(initial: PersonalDevelopmentRouteProgressStore = {}): PersonalDevelopmentRouteProgressStorageDependencies {
  let store = initial;
  return {
    loadStore: async () => store,
    saveStore: async (next) => {
      store = next;
    },
  };
}

function fakePendingDeps(initial: PendingSharedActionExecutionStore = {}): PendingSharedActionExecutionStorageDependencies {
  let store = initial;
  return {
    loadStore: async () => store,
    saveStore: async (next) => {
      store = next;
    },
  };
}

function fakeProgressDeps(initial: ArcGoalSessionProgressStore = {}): ArcGoalSessionProgressStorageDependencies {
  let store = initial;
  return {
    loadStore: async () => store,
    saveStore: async (next) => {
      store = next;
    },
  };
}

// --- Dispatch ---

test("a personal_development facts object is tagged and routed to the PD outcome shape", async () => {
  const outcome = await recordSharedLiveSessionCompletion(pdSharedFacts(), NOW, { personalDevelopment: fakePdDeps() });
  assert.equal(outcome.track, "personal_development");
  assert.equal(outcome.outcome.kind, "applied");
});

test("an arc_goal facts object is tagged and routed to the ArcGoal outcome shape", async () => {
  const pending = fakePendingDeps();
  await startPendingSharedActionExecution("arc_goal", "goal-1", "session-1", [BENEFICIAL_ACTION_ROLE], NOW, pending);
  await confirmActionRoleAndPersist("arc_goal", "goal-1", BENEFICIAL_ACTION_ROLE, LATER, pending);

  const outcome = await recordSharedLiveSessionCompletion(arcGoalFacts(), LATER, { arcGoal: { pending, progress: fakeProgressDeps() } });
  assert.equal(outcome.track, "arc_goal");
  assert.equal(outcome.outcome.kind, "committed");
});

// --- Compatibility: the PD branch is a pure, unmodified delegation ---

test("the PD branch produces byte-identical results to calling recordCombinedSessionCompletion directly", async () => {
  const deps = fakePdDeps();
  const direct = await recordCombinedSessionCompletion(pdFacts({ sessionId: "compat-1" }), NOW, deps);

  const deps2 = fakePdDeps();
  const viaShared = await recordSharedLiveSessionCompletion(pdSharedFacts({ sessionId: "compat-1" }), NOW, { personalDevelopment: deps2 });

  assert.deepEqual(viaShared.outcome, direct, "identical outcome object -- the shared controller never reshapes it");
});

test("the PD branch preserves PD's own idempotency ledger exactly -- a duplicate session is still a no-op", async () => {
  const deps = fakePdDeps();
  await recordSharedLiveSessionCompletion(pdSharedFacts({ sessionId: "dup-1" }), NOW, { personalDevelopment: deps });
  const retry = await recordSharedLiveSessionCompletion(pdSharedFacts({ sessionId: "dup-1" }), LATER, { personalDevelopment: deps });
  assert.equal(retry.outcome.kind, "duplicate_session");
});

test("the PD branch never touches ArcGoal's own stores, and vice versa", async () => {
  const pdDeps = fakePdDeps();
  const pending = fakePendingDeps();
  const progress = fakeProgressDeps();

  await recordSharedLiveSessionCompletion(pdSharedFacts(), NOW, { personalDevelopment: pdDeps });
  assert.deepEqual(await pending.loadStore(), {}, "a PD completion never writes to the pending-execution store");
  assert.deepEqual(await progress.loadStore(), {}, "a PD completion never writes to ArcGoal's progress store");
});

// --- ArcGoal branch dispatches to the real gated path (never bypasses it) ---

test("the ArcGoal branch still refuses (not_ready) when required roles aren't all confirmed -- the shared controller adds no shortcut", async () => {
  const pending = fakePendingDeps();
  await startPendingSharedActionExecution("arc_goal", "goal-1", "session-1", [BENEFICIAL_ACTION_ROLE, IDENTITY_GOAL_ACTION_ROLE], NOW, pending);
  // Only one of two required roles confirmed.
  await confirmActionRoleAndPersist("arc_goal", "goal-1", BENEFICIAL_ACTION_ROLE, LATER, pending);

  const outcome = await recordSharedLiveSessionCompletion(arcGoalFacts(), LATER, { arcGoal: { pending, progress: fakeProgressDeps() } });
  assert.equal(outcome.track, "arc_goal");
  assert.deepEqual(outcome.outcome, { kind: "not_ready" });
});

test("the ArcGoal branch is idempotent through the shared entry point exactly like calling commitArcGoalProgressIfReady directly", async () => {
  const pending = fakePendingDeps();
  const progress = fakeProgressDeps();
  await startPendingSharedActionExecution("arc_goal", "goal-1", "session-1", [BENEFICIAL_ACTION_ROLE], NOW, pending);
  await confirmActionRoleAndPersist("arc_goal", "goal-1", BENEFICIAL_ACTION_ROLE, LATER, pending);

  const first = await recordSharedLiveSessionCompletion(arcGoalFacts(), LATER, { arcGoal: { pending, progress } });
  assert.equal(first.outcome.kind, "committed");

  const retry = await recordSharedLiveSessionCompletion(arcGoalFacts(), LATER, { arcGoal: { pending, progress } });
  assert.equal(retry.outcome.kind, "already_committed");

  const finalProgress = await progress.loadStore();
  assert.equal(finalProgress["goal-1"]?.completedSessions, 1);
});
