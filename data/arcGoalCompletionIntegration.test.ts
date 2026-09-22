/**
 * data/arcGoalCompletionIntegration.test.ts
 *
 * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 4: a
 * PERMANENT end-to-end integration test for ArcGoal LIVE completion,
 * wiring together every real module the exact-once progress write
 * depends on:
 *
 *   arc/sharedLiveSessionFacts.ts (toArcGoalSharedFacts)
 *     -> arc/pendingSharedActionExecution.ts (the persisted confirmation queue)
 *     -> data/pendingSharedActionExecutionPersistence.ts (commitArcGoalProgressIfReady
 *        -- THE code path that performs the write)
 *     -> data/arcGoalSessionProgressPersistence.ts (recordArcGoalSessionCompletion)
 *     -> arc/arcGoalSessionProgress.ts (applyArcGoalSessionCompletionToProgress)
 *     -> data/storage.ts (saveArcGoalSessionProgressStore)
 *
 * "Restart the app" is simulated with a JSON-round-tripping fake backing
 * store (createRestartSafeBackingStore below): every loadStore() call
 * re-parses freshly-serialized bytes rather than returning a shared JS
 * object reference, so nothing here can pass by silently relying on
 * in-memory object identity surviving a restart -- exactly the property
 * a real AsyncStorage-backed store has and an in-memory mock without the
 * round trip would not.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { commitArcGoalProgressIfReady, confirmActionRoleAndPersist, loadPendingSharedActionExecution, startPendingSharedActionExecution } from "./pendingSharedActionExecutionPersistence.ts";
import type { PendingSharedActionExecutionStorageDependencies } from "./pendingSharedActionExecutionPersistence.ts";
import type { ArcGoalSessionProgressStorageDependencies } from "./arcGoalSessionProgressPersistence.ts";
import type { ArcGoalSessionProgressStore, PendingSharedActionExecutionStore } from "./storage.ts";
import { resolveNextPendingActionRole } from "../arc/pendingSharedActionExecution.ts";
import { toArcGoalSharedFacts } from "../arc/sharedLiveSessionFacts.ts";
import type { ArcGoalSharedFactsInput } from "../arc/sharedLiveSessionFacts.ts";
import { createEmptyArcGoalLiveState } from "../arc/arcGoalEngine.ts";
import { createEmptyLiveState } from "../arc/types.ts";
import type { ArcLiveState } from "../arc/types.ts";

const T0 = "2026-01-01T09:00:00.000Z";
const T1 = "2026-01-01T09:05:00.000Z";
const T2_RESTART = "2026-01-01T09:10:00.000Z";
const T3 = "2026-01-01T09:15:00.000Z";
const T4_RETRY = "2026-01-01T09:20:00.000Z";

const BENEFICIAL_ACTION_ROLE = "beneficial_action";
const IDENTITY_GOAL_ACTION_ROLE = "identity_goal_action";
const ARC_GOAL_ID = "goal-integration-1";

/**
 * A JSON-round-tripping fake persisted store: every load re-parses
 * freshly-serialized bytes, exactly like a real AsyncStorage.getItem
 * after the process (and every in-memory object) is gone. Calling
 * `loadStore`/`saveStore` again after "restart" (i.e. simply not reusing
 * any JS variable that held a previous execution/progress object) is the
 * entire restart simulation -- there is deliberately no special "restart"
 * API, because the real app has none either.
 */
function createRestartSafeBackingStore<T>(initial: Record<string, T> = {}) {
  let serialized = JSON.stringify(initial);
  return {
    loadStore: async (): Promise<Record<string, T>> => JSON.parse(serialized) as Record<string, T>,
    saveStore: async (store: Record<string, T>): Promise<void> => {
      serialized = JSON.stringify(store);
    },
  };
}

function outerSessionAtComplete(overrides: Partial<ArcLiveState> = {}): ArcLiveState {
  return { ...createEmptyLiveState(), currentArcStage: "complete", realActionCompleted: true, ...overrides };
}

function buildFacts(overrides: Partial<ArcGoalSharedFactsInput> = {}) {
  const input: ArcGoalSharedFactsInput = {
    sessionId: "session-integration-1",
    arcGoalId: ARC_GOAL_ID,
    weeklyActionId: null,
    outerSession: outerSessionAtComplete(),
    goalState: { ...createEmptyArcGoalLiveState(), selectedMappingId: "mapping-1" },
    mappingActionRelationship: "same_action",
    terminalCompleted: true,
    ...overrides,
  };
  return toArcGoalSharedFacts(input);
}

test("ARC Goal completion integration: two required action roles, restart-safe confirmation, exactly-once progress commit", async () => {
  const pendingBacking = createRestartSafeBackingStore<PendingSharedActionExecutionStore[string]>();
  const progressBacking = createRestartSafeBackingStore<ArcGoalSessionProgressStore[string]>();
  const pendingDeps: PendingSharedActionExecutionStorageDependencies = pendingBacking;
  const progressDeps: ArcGoalSessionProgressStorageDependencies = progressBacking;

  // --- Start a session with two distinct required action roles ---
  const started = await startPendingSharedActionExecution(
    "arc_goal",
    ARC_GOAL_ID,
    "session-integration-1",
    [BENEFICIAL_ACTION_ROLE, IDENTITY_GOAL_ACTION_ROLE],
    T0,
    pendingDeps
  );
  assert.equal(started.status, "action_pending");
  assert.equal(started.actionQueue.length, 2);

  // --- Confirm the Beneficial Action ---
  const afterBeneficial = await confirmActionRoleAndPersist("arc_goal", ARC_GOAL_ID, BENEFICIAL_ACTION_ROLE, T1, pendingDeps);
  assert.equal(afterBeneficial.kind, "confirmed");

  // --- Assert no Goal progress is written yet ---
  const progressAfterBeneficialOnly = await progressDeps.loadStore();
  assert.equal(progressAfterBeneficialOnly[ARC_GOAL_ID], undefined, "confirming one of two required roles must never write progress");

  // --- "Restart the app": fresh load, no reused JS references ---
  const afterRestart = await loadPendingSharedActionExecution("arc_goal", ARC_GOAL_ID, pendingDeps);
  assert.ok(afterRestart, "the pending execution survives a restart");
  assert.equal(afterRestart!.actionQueue.find((r) => r.roleId === BENEFICIAL_ACTION_ROLE)?.status, "confirmed", "the Beneficial Action confirmation is preserved across restart");
  assert.equal(resolveNextPendingActionRole(afterRestart!), IDENTITY_GOAL_ACTION_ROLE, "the pending role after restart is exactly the Identity/Goal Action");

  // --- Confirm that action ---
  const afterIdentity = await confirmActionRoleAndPersist("arc_goal", ARC_GOAL_ID, IDENTITY_GOAL_ACTION_ROLE, T2_RESTART, pendingDeps);
  assert.equal(afterIdentity.kind, "confirmed");
  if (afterIdentity.kind === "confirmed") assert.equal(resolveNextPendingActionRole(afterIdentity.execution), null, "both required roles are now confirmed");

  // --- Progress is written exactly once ---
  const facts = buildFacts();
  const commitOutcome = await commitArcGoalProgressIfReady(ARC_GOAL_ID, facts, T3, { pending: pendingDeps, progress: progressDeps });
  assert.equal(commitOutcome.kind, "committed");
  if (commitOutcome.kind !== "committed") return;
  assert.equal(commitOutcome.progressOutcome.kind, "applied");
  if (commitOutcome.progressOutcome.kind !== "applied") return;
  assert.equal(commitOutcome.progressOutcome.progress.completedSessions, 1);

  const progressAfterCommit = await progressDeps.loadStore();
  assert.equal(progressAfterCommit[ARC_GOAL_ID]?.completedSessions, 1);

  // --- Retry both confirmations and the progress commit ---
  await confirmActionRoleAndPersist("arc_goal", ARC_GOAL_ID, BENEFICIAL_ACTION_ROLE, T4_RETRY, pendingDeps);
  await confirmActionRoleAndPersist("arc_goal", ARC_GOAL_ID, IDENTITY_GOAL_ACTION_ROLE, T4_RETRY, pendingDeps);
  const retryCommit = await commitArcGoalProgressIfReady(ARC_GOAL_ID, facts, T4_RETRY, { pending: pendingDeps, progress: progressDeps });
  assert.equal(retryCommit.kind, "already_committed", "the pending execution itself already reports progress_committed");

  const finalProgress = await progressDeps.loadStore();
  assert.equal(finalProgress[ARC_GOAL_ID]?.completedSessions, 1, "the count remains exactly one after retrying both confirmations and the commit");
});

test("ARC Goal completion integration: timer expiry alone never writes progress", async () => {
  const pendingDeps = createRestartSafeBackingStore<PendingSharedActionExecutionStore[string]>();
  const progressDeps = createRestartSafeBackingStore<ArcGoalSessionProgressStore[string]>();

  await startPendingSharedActionExecution("arc_goal", ARC_GOAL_ID, "session-timer-1", [BENEFICIAL_ACTION_ROLE, IDENTITY_GOAL_ACTION_ROLE], T0, pendingDeps);

  // A timer "expiring" produces no call into this architecture at all --
  // there is no timer-expiry-to-confirm wiring anywhere in
  // arc/pendingSharedActionExecution.ts or its persistence wrapper.
  // Simulating that means: nothing is confirmed, and the commit is
  // attempted anyway (e.g. a stray/backgrounded timer callback).
  const outcome = await commitArcGoalProgressIfReady(ARC_GOAL_ID, buildFacts(), T1, { pending: pendingDeps, progress: progressDeps });
  assert.deepEqual(outcome, { kind: "not_ready" });

  const progressStore = await progressDeps.loadStore();
  assert.equal(progressStore[ARC_GOAL_ID], undefined, "no progress is ever written from timer expiry alone");
});

test("ARC Goal completion integration: the outer ARC stage reaching 'complete' alone never writes progress", async () => {
  const pendingDeps = createRestartSafeBackingStore<PendingSharedActionExecutionStore[string]>();
  const progressDeps = createRestartSafeBackingStore<ArcGoalSessionProgressStore[string]>();

  await startPendingSharedActionExecution("arc_goal", ARC_GOAL_ID, "session-outer-complete-1", [BENEFICIAL_ACTION_ROLE, IDENTITY_GOAL_ACTION_ROLE], T0, pendingDeps);

  // The outer identity run has genuinely reached ArcStage "complete" and
  // confirmed its own real action -- but NEITHER required role in this
  // session's action queue has been explicitly confirmed yet (the bridge
  // action and the final goal_action_confirm both still remain).
  const facts = buildFacts({ outerSession: outerSessionAtComplete(), terminalCompleted: true });
  assert.equal(facts.outerRunCompleted, true, "sanity check: the facts really do report the outer run as complete");

  const outcome = await commitArcGoalProgressIfReady(ARC_GOAL_ID, facts, T1, { pending: pendingDeps, progress: progressDeps });
  assert.deepEqual(outcome, { kind: "not_ready" }, "outerRunCompleted (and even a caller-supplied terminalCompleted) never bypasses the action-queue gate");

  const progressStore = await progressDeps.loadStore();
  assert.equal(progressStore[ARC_GOAL_ID], undefined);
});
