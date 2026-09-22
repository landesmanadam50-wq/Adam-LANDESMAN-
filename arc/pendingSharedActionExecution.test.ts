import test from "node:test";
import assert from "node:assert/strict";

import {
  allRequiredActionRolesConfirmed,
  confirmPendingActionRole,
  createPendingSharedActionExecution,
  markAwaitingProgressCommit,
  markProgressCommitted,
  resolveNextPendingActionRole,
  resolvePendingSharedActionExecutionKey,
} from "./pendingSharedActionExecution.ts";
import type { ArcGoalSharedFacts } from "./sharedLiveSessionFacts.ts";

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

test("resolvePendingSharedActionExecutionKey joins track and ownerId", () => {
  assert.equal(resolvePendingSharedActionExecutionKey("arc_goal", "goal-1"), "arc_goal:goal-1");
  assert.equal(resolvePendingSharedActionExecutionKey("personal_development", "route-1"), "personal_development:route-1");
});

test("createPendingSharedActionExecution starts every role pending, status action_pending", () => {
  const execution = createPendingSharedActionExecution("arc_goal", "goal-1", "session-1", [BENEFICIAL_ACTION_ROLE, IDENTITY_GOAL_ACTION_ROLE], NOW);
  assert.equal(execution.status, "action_pending");
  assert.equal(execution.completionPayload, null);
  assert.deepEqual(execution.actionQueue, [
    { roleId: BENEFICIAL_ACTION_ROLE, status: "pending", confirmedAt: null },
    { roleId: IDENTITY_GOAL_ACTION_ROLE, status: "pending", confirmedAt: null },
  ]);
});

test("resolveNextPendingActionRole returns roles in queue order, then null once all confirmed", () => {
  let execution = createPendingSharedActionExecution("arc_goal", "goal-1", "session-1", [BENEFICIAL_ACTION_ROLE, IDENTITY_GOAL_ACTION_ROLE], NOW);
  assert.equal(resolveNextPendingActionRole(execution), BENEFICIAL_ACTION_ROLE);
  execution = confirmPendingActionRole(execution, BENEFICIAL_ACTION_ROLE, LATER);
  assert.equal(resolveNextPendingActionRole(execution), IDENTITY_GOAL_ACTION_ROLE);
  execution = confirmPendingActionRole(execution, IDENTITY_GOAL_ACTION_ROLE, LATER);
  assert.equal(resolveNextPendingActionRole(execution), null);
});

test("allRequiredActionRolesConfirmed is false until every role is confirmed", () => {
  let execution = createPendingSharedActionExecution("arc_goal", "goal-1", "session-1", [BENEFICIAL_ACTION_ROLE, IDENTITY_GOAL_ACTION_ROLE], NOW);
  assert.equal(allRequiredActionRolesConfirmed(execution), false);
  execution = confirmPendingActionRole(execution, BENEFICIAL_ACTION_ROLE, LATER);
  assert.equal(allRequiredActionRolesConfirmed(execution), false, "one of two roles confirmed is still not all");
  execution = confirmPendingActionRole(execution, IDENTITY_GOAL_ACTION_ROLE, LATER);
  assert.equal(allRequiredActionRolesConfirmed(execution), true);
});

test("confirmPendingActionRole only ever changes the one matching role, never the others", () => {
  const execution = createPendingSharedActionExecution("arc_goal", "goal-1", "session-1", [BENEFICIAL_ACTION_ROLE, IDENTITY_GOAL_ACTION_ROLE], NOW);
  const confirmed = confirmPendingActionRole(execution, BENEFICIAL_ACTION_ROLE, LATER);
  assert.equal(confirmed.actionQueue[0].status, "confirmed");
  assert.equal(confirmed.actionQueue[0].confirmedAt, LATER);
  assert.equal(confirmed.actionQueue[1].status, "pending", "the OTHER role is untouched");
  assert.equal(confirmed.actionQueue[1].confirmedAt, null);
});

test("confirming an unknown roleId is a no-op -- returns the exact same object, never invents a role", () => {
  const execution = createPendingSharedActionExecution("arc_goal", "goal-1", "session-1", [BENEFICIAL_ACTION_ROLE], NOW);
  const result = confirmPendingActionRole(execution, "not_a_real_role", LATER);
  assert.equal(result, execution);
});

test("confirming an already-confirmed role is a no-op -- confirmedAt/updatedAt never change on a retried confirmation", () => {
  const execution = createPendingSharedActionExecution("arc_goal", "goal-1", "session-1", [BENEFICIAL_ACTION_ROLE], NOW);
  const firstConfirm = confirmPendingActionRole(execution, BENEFICIAL_ACTION_ROLE, LATER);
  const retryConfirm = confirmPendingActionRole(firstConfirm, BENEFICIAL_ACTION_ROLE, "2026-01-01T00:10:00.000Z");
  assert.equal(retryConfirm, firstConfirm, "the exact same object -- not merely deep-equal");
  assert.equal(retryConfirm.actionQueue[0].confirmedAt, LATER, "never re-stamped to the retry's later timestamp");
});

test("confirmPendingActionRole never mutates its input", () => {
  const execution = createPendingSharedActionExecution("arc_goal", "goal-1", "session-1", [BENEFICIAL_ACTION_ROLE, IDENTITY_GOAL_ACTION_ROLE], NOW);
  const snapshot = JSON.parse(JSON.stringify(execution));
  confirmPendingActionRole(execution, BENEFICIAL_ACTION_ROLE, LATER);
  assert.deepEqual(execution, snapshot);
});

// --- markAwaitingProgressCommit: the gate before any progress write ---

test("markAwaitingProgressCommit refuses with 'not_ready' when any required role is still pending -- timer expiry or a single confirmation alone never passes this gate", () => {
  const execution = createPendingSharedActionExecution("arc_goal", "goal-1", "session-1", [BENEFICIAL_ACTION_ROLE, IDENTITY_GOAL_ACTION_ROLE], NOW);
  assert.deepEqual(markAwaitingProgressCommit(execution, facts(), LATER), { kind: "not_ready" });

  const oneConfirmed = confirmPendingActionRole(execution, BENEFICIAL_ACTION_ROLE, LATER);
  assert.deepEqual(markAwaitingProgressCommit(oneConfirmed, facts(), LATER), { kind: "not_ready" });
});

test("markAwaitingProgressCommit ignores facts.outerRunCompleted entirely -- only the action queue governs readiness", () => {
  const execution = createPendingSharedActionExecution("arc_goal", "goal-1", "session-1", [BENEFICIAL_ACTION_ROLE, IDENTITY_GOAL_ACTION_ROLE], NOW);
  const outerCompleteButNoConfirmations = facts({ outerRunCompleted: true, identityActionCompleted: true, terminalCompleted: true });
  assert.deepEqual(markAwaitingProgressCommit(execution, outerCompleteButNoConfirmations, LATER), { kind: "not_ready" });
});

test("markAwaitingProgressCommit transitions once every required role is confirmed, attaching the completion payload", () => {
  let execution = createPendingSharedActionExecution("arc_goal", "goal-1", "session-1", [BENEFICIAL_ACTION_ROLE, IDENTITY_GOAL_ACTION_ROLE], NOW);
  execution = confirmPendingActionRole(execution, BENEFICIAL_ACTION_ROLE, LATER);
  execution = confirmPendingActionRole(execution, IDENTITY_GOAL_ACTION_ROLE, LATER);
  const f = facts();
  const result = markAwaitingProgressCommit(execution, f, LATER);
  assert.equal(result.kind, "transitioned");
  if (result.kind !== "transitioned") return;
  assert.equal(result.execution.status, "awaiting_progress_commit");
  assert.deepEqual(result.execution.completionPayload, { facts: f });
});

test("markAwaitingProgressCommit reports 'already_past_action_pending' rather than silently re-transitioning", () => {
  let execution = createPendingSharedActionExecution("arc_goal", "goal-1", "session-1", [BENEFICIAL_ACTION_ROLE], NOW);
  execution = confirmPendingActionRole(execution, BENEFICIAL_ACTION_ROLE, LATER);
  const transitioned = markAwaitingProgressCommit(execution, facts(), LATER);
  assert.equal(transitioned.kind, "transitioned");
  if (transitioned.kind !== "transitioned") return;
  const retry = markAwaitingProgressCommit(transitioned.execution, facts(), LATER);
  assert.deepEqual(retry, { kind: "already_past_action_pending" });
});

// --- markProgressCommitted ---

test("markProgressCommitted only transitions from awaiting_progress_commit", () => {
  let execution = createPendingSharedActionExecution("arc_goal", "goal-1", "session-1", [BENEFICIAL_ACTION_ROLE], NOW);
  assert.equal(markProgressCommitted(execution, LATER), execution, "no-op from action_pending");

  execution = confirmPendingActionRole(execution, BENEFICIAL_ACTION_ROLE, LATER);
  const transitioned = markAwaitingProgressCommit(execution, facts(), LATER);
  assert.equal(transitioned.kind, "transitioned");
  if (transitioned.kind !== "transitioned") return;

  const committed = markProgressCommitted(transitioned.execution, LATER);
  assert.equal(committed.status, "progress_committed");
});

test("markProgressCommitted is idempotent -- calling it again on an already-committed record is a no-op", () => {
  let execution = createPendingSharedActionExecution("arc_goal", "goal-1", "session-1", [BENEFICIAL_ACTION_ROLE], NOW);
  execution = confirmPendingActionRole(execution, BENEFICIAL_ACTION_ROLE, LATER);
  const transitioned = markAwaitingProgressCommit(execution, facts(), LATER);
  assert.equal(transitioned.kind, "transitioned");
  if (transitioned.kind !== "transitioned") return;
  const committedOnce = markProgressCommitted(transitioned.execution, LATER);
  const committedTwice = markProgressCommitted(committedOnce, "2026-01-01T00:20:00.000Z");
  assert.equal(committedTwice, committedOnce, "the exact same object -- not re-stamped");
});
