import test from "node:test";
import assert from "node:assert/strict";

import {
  commitArcGoalProgressIfReady,
  confirmActionRoleAndPersist,
  loadPendingSharedActionExecution,
  startPendingSharedActionExecution,
} from "./pendingSharedActionExecutionPersistence.ts";
import type { PendingSharedActionExecutionStorageDependencies } from "./pendingSharedActionExecutionPersistence.ts";
import type { PendingSharedActionExecutionStore, ArcGoalSessionProgressStore } from "./storage.ts";
import type { ArcGoalSessionProgressStorageDependencies } from "./arcGoalSessionProgressPersistence.ts";
import type { ArcGoalSharedFacts } from "../arc/sharedLiveSessionFacts.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-01T00:05:00.000Z";

const BENEFICIAL_ACTION_ROLE = "beneficial_action";
const IDENTITY_GOAL_ACTION_ROLE = "identity_goal_action";

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

function fakePendingDeps(initial: PendingSharedActionExecutionStore = {}): PendingSharedActionExecutionStorageDependencies & { savedStores: PendingSharedActionExecutionStore[] } {
  let store = initial;
  const savedStores: PendingSharedActionExecutionStore[] = [];
  return {
    savedStores,
    loadStore: async () => store,
    saveStore: async (next) => {
      store = next;
      savedStores.push(next);
    },
  };
}

function fakeProgressDeps(initial: ArcGoalSessionProgressStore = {}): ArcGoalSessionProgressStorageDependencies & { saveCount: number } {
  let store = initial;
  const deps = {
    saveCount: 0,
    loadStore: async () => store,
    saveStore: async (next: ArcGoalSessionProgressStore) => {
      deps.saveCount++;
      store = next;
    },
  };
  return deps;
}

test("startPendingSharedActionExecution persists a fresh action_pending record", async () => {
  const deps = fakePendingDeps();
  const execution = await startPendingSharedActionExecution("arc_goal", "goal-1", "session-1", [BENEFICIAL_ACTION_ROLE, IDENTITY_GOAL_ACTION_ROLE], NOW, deps);
  assert.equal(execution.status, "action_pending");
  const loaded = await loadPendingSharedActionExecution("arc_goal", "goal-1", deps);
  assert.deepEqual(loaded, execution);
});

test("starting a new session replaces any prior record wholesale", async () => {
  const deps = fakePendingDeps();
  await startPendingSharedActionExecution("arc_goal", "goal-1", "session-1", [BENEFICIAL_ACTION_ROLE], NOW, deps);
  await confirmActionRoleAndPersist("arc_goal", "goal-1", BENEFICIAL_ACTION_ROLE, LATER, deps);
  const fresh = await startPendingSharedActionExecution("arc_goal", "goal-1", "session-2", [BENEFICIAL_ACTION_ROLE, IDENTITY_GOAL_ACTION_ROLE], LATER, deps);
  assert.equal(fresh.sessionId, "session-2");
  assert.equal(fresh.actionQueue[0].status, "pending", "the old session's confirmation never carries over");
});

test("confirmActionRoleAndPersist reports no_pending_execution when no session was ever started", async () => {
  const deps = fakePendingDeps();
  const outcome = await confirmActionRoleAndPersist("arc_goal", "goal-1", BENEFICIAL_ACTION_ROLE, NOW, deps);
  assert.deepEqual(outcome, { kind: "no_pending_execution" });
});

test("confirmActionRoleAndPersist confirms and persists", async () => {
  const deps = fakePendingDeps();
  await startPendingSharedActionExecution("arc_goal", "goal-1", "session-1", [BENEFICIAL_ACTION_ROLE], NOW, deps);
  const outcome = await confirmActionRoleAndPersist("arc_goal", "goal-1", BENEFICIAL_ACTION_ROLE, LATER, deps);
  assert.equal(outcome.kind, "confirmed");
  if (outcome.kind !== "confirmed") return;
  assert.equal(outcome.execution.actionQueue[0].status, "confirmed");
  const reloaded = await loadPendingSharedActionExecution("arc_goal", "goal-1", deps);
  assert.equal(reloaded?.actionQueue[0].status, "confirmed", "persisted, not just returned");
});

// --- commitArcGoalProgressIfReady: the progress-write gate ---

test("commitArcGoalProgressIfReady returns not_ready and writes nothing while any required role is still pending", async () => {
  const pending = fakePendingDeps();
  const progress = fakeProgressDeps();
  await startPendingSharedActionExecution("arc_goal", "goal-1", "session-1", [BENEFICIAL_ACTION_ROLE, IDENTITY_GOAL_ACTION_ROLE], NOW, pending);
  await confirmActionRoleAndPersist("arc_goal", "goal-1", BENEFICIAL_ACTION_ROLE, LATER, pending);

  const outcome = await commitArcGoalProgressIfReady("goal-1", facts(), LATER, { pending, progress });
  assert.deepEqual(outcome, { kind: "not_ready" });
  assert.equal(progress.saveCount, 0, "the progress store is never touched while not ready");
});

test("commitArcGoalProgressIfReady returns no_pending_execution when no session was ever started for this goal", async () => {
  const progress = fakeProgressDeps();
  const outcome = await commitArcGoalProgressIfReady("goal-1", facts(), NOW, { progress, pending: fakePendingDeps() });
  assert.deepEqual(outcome, { kind: "no_pending_execution" });
  assert.equal(progress.saveCount, 0);
});

test("commitArcGoalProgressIfReady commits exactly once all required roles are confirmed", async () => {
  const pending = fakePendingDeps();
  const progress = fakeProgressDeps();
  await startPendingSharedActionExecution("arc_goal", "goal-1", "session-1", [BENEFICIAL_ACTION_ROLE, IDENTITY_GOAL_ACTION_ROLE], NOW, pending);
  await confirmActionRoleAndPersist("arc_goal", "goal-1", BENEFICIAL_ACTION_ROLE, LATER, pending);
  await confirmActionRoleAndPersist("arc_goal", "goal-1", IDENTITY_GOAL_ACTION_ROLE, LATER, pending);

  const outcome = await commitArcGoalProgressIfReady("goal-1", facts(), LATER, { pending, progress });
  assert.equal(outcome.kind, "committed");
  if (outcome.kind !== "committed") return;
  assert.equal(outcome.execution.status, "progress_committed");
  assert.equal(outcome.progressOutcome.kind, "applied");
  if (outcome.progressOutcome.kind !== "applied") return;
  assert.equal(outcome.progressOutcome.progress.completedSessions, 1);
});

test("commitArcGoalProgressIfReady is idempotent -- retrying after already_committed never double-counts", async () => {
  const pending = fakePendingDeps();
  const progress = fakeProgressDeps();
  await startPendingSharedActionExecution("arc_goal", "goal-1", "session-1", [BENEFICIAL_ACTION_ROLE], NOW, pending);
  await confirmActionRoleAndPersist("arc_goal", "goal-1", BENEFICIAL_ACTION_ROLE, LATER, pending);

  const first = await commitArcGoalProgressIfReady("goal-1", facts(), LATER, { pending, progress });
  assert.equal(first.kind, "committed");

  const retry = await commitArcGoalProgressIfReady("goal-1", facts(), LATER, { pending, progress });
  assert.equal(retry.kind, "already_committed");
  if (retry.kind !== "already_committed") return;

  const store = await pending.loadStore();
  assert.equal(store["arc_goal:goal-1"].status, "progress_committed");
});
