/**
 * arc/pendingSharedActionExecution.ts
 *
 * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 4: the
 * persistent, restart-safe explicit-confirmation queue for a live
 * session's required action role(s) -- the mechanism that turns
 * "terminalCompleted" (arc/sharedLiveSessionFacts.ts's own
 * ArcGoalSharedFacts.terminalCompleted) from a fragile, in-memory-only
 * screen derivation into a well-defined, persisted fact: every required
 * role in `actionQueue` has been EXPLICITLY confirmed.
 *
 * Keyed by the composite (track, ownerId) pair -- ownerId is
 * routeConfigId for Personal Development, arcGoalId for ArcGoal -- since
 * at most one session is genuinely in-flight per route/goal at a time. A
 * fresh session always starts a fresh queue (createPendingSharedActionExecution
 * replaces any prior record for that owner outright); this module never
 * merges/carries over an older session's own queue.
 *
 * A timer's own expiry NEVER confirms a role by itself -- only an
 * explicit call to confirmPendingActionRole does. This mirrors every
 * existing action-timer's own "reached (timer done) is never the same as
 * completed (explicitly confirmed)" distinction already enforced
 * throughout this codebase (arc/personalDevelopmentRouteProgress.ts's own
 * validateCombinedSessionFactsForCompletion, arc/arcGoalSessionProgress.ts's
 * own validateArcGoalSharedFactsForCompletion) -- this module is simply
 * the persisted, restart-safe generalization of that same rule to a
 * session's full set of required roles.
 *
 * Pure logic only -- no storage import, no data/ import. See
 * data/pendingSharedActionExecutionPersistence.ts for the load/confirm/
 * commit orchestration wrapper, and that module's own
 * commitArcGoalProgressIfReady for the exact code path that performs the
 * ArcGoal progress write.
 */

import type { LiveSessionTrack, SharedLiveSessionFacts } from "./sharedLiveSessionFacts.ts";

export type PendingActionRoleId = string;

export interface PendingActionRoleState {
  roleId: PendingActionRoleId;
  status: "pending" | "confirmed";
  confirmedAt: string | null;
}

export type PendingSharedActionExecutionStatus = "action_pending" | "awaiting_progress_commit" | "progress_committed";

export interface PendingSharedActionExecution {
  track: LiveSessionTrack;
  ownerId: string;
  sessionId: string;
  status: PendingSharedActionExecutionStatus;
  /** Every required action role for THIS session, in the order the session presents them -- frozen at session start, never re-derived mid-session, so a restart can never silently add/drop a role. */
  actionQueue: PendingActionRoleState[];
  /** Set once, the moment status first transitions to "awaiting_progress_commit" -- the exact facts object the progress write uses. Wrapped in { facts } (not the bare facts) for forward parity with a later phase's own richer completion-payload shape. */
  completionPayload: { facts: SharedLiveSessionFacts } | null;
  createdAt: string;
  updatedAt: string;
}

export function resolvePendingSharedActionExecutionKey(track: LiveSessionTrack, ownerId: string): string {
  return `${track}:${ownerId}`;
}

/** A fresh queue for a brand-new session -- every role starts "pending", status "action_pending". A caller (data/pendingSharedActionExecutionPersistence.ts's own startPendingSharedActionExecution) replaces any prior record for the same owner wholesale -- this module never merges with one. */
export function createPendingSharedActionExecution(
  track: LiveSessionTrack,
  ownerId: string,
  sessionId: string,
  roleIds: PendingActionRoleId[],
  now: string
): PendingSharedActionExecution {
  return {
    track,
    ownerId,
    sessionId,
    status: "action_pending",
    actionQueue: roleIds.map((roleId) => ({ roleId, status: "pending", confirmedAt: null })),
    completionPayload: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** The first still-pending role, in queue order, or null once every role is confirmed. Used both to decide what to render next and, after a restart, to assert exactly which role survived as pending. */
export function resolveNextPendingActionRole(execution: PendingSharedActionExecution): PendingActionRoleId | null {
  return execution.actionQueue.find((role) => role.status === "pending")?.roleId ?? null;
}

export function allRequiredActionRolesConfirmed(execution: PendingSharedActionExecution): boolean {
  return execution.actionQueue.every((role) => role.status === "confirmed");
}

/**
 * Explicitly confirms one role. A role not present in the queue is a
 * no-op (returns the exact same object -- never invents a new role). An
 * already-confirmed role is ALSO a no-op: confirming twice (a retried
 * tap, a resumed session re-sending an already-applied confirmation)
 * never changes confirmedAt or bumps updatedAt, so a caller can always
 * safely re-send a confirmation without side effects. Only ever mutates
 * status/confirmedAt on the ONE matching, still-pending role -- every
 * other role, and every other field on the execution, is untouched.
 */
export function confirmPendingActionRole(execution: PendingSharedActionExecution, roleId: PendingActionRoleId, now: string): PendingSharedActionExecution {
  const role = execution.actionQueue.find((entry) => entry.roleId === roleId);
  if (!role || role.status === "confirmed") return execution;
  return {
    ...execution,
    actionQueue: execution.actionQueue.map((entry) => (entry.roleId === roleId ? { ...entry, status: "confirmed" as const, confirmedAt: now } : entry)),
    updatedAt: now,
  };
}

export type MarkAwaitingProgressCommitResult = { kind: "transitioned"; execution: PendingSharedActionExecution } | { kind: "not_ready" } | { kind: "already_past_action_pending" };

/**
 * The one gate a caller must pass through before ever writing progress --
 * refuses (kind "not_ready") unless allRequiredActionRolesConfirmed is
 * true, so neither a timer expiring alone nor any single role's own
 * confirmation can ever trigger this by itself, and never even inspects
 * `facts` for readiness (in particular, an ArcGoalSharedFacts.outerRunCompleted
 * of true carries no weight here at all -- only the action queue does). A
 * call while status is already past "action_pending" is reported, never
 * silently re-applied (kind "already_past_action_pending") -- the caller
 * decides whether that is an idempotent retry or a genuine caller-contract
 * error.
 */
export function markAwaitingProgressCommit(execution: PendingSharedActionExecution, facts: SharedLiveSessionFacts, now: string): MarkAwaitingProgressCommitResult {
  if (execution.status !== "action_pending") return { kind: "already_past_action_pending" };
  if (!allRequiredActionRolesConfirmed(execution)) return { kind: "not_ready" };
  return {
    kind: "transitioned",
    execution: { ...execution, status: "awaiting_progress_commit", completionPayload: { facts }, updatedAt: now },
  };
}

/**
 * The final transition, only ever valid from "awaiting_progress_commit" --
 * a caller reaches this only after the progress-store write has actually
 * been attempted (see data/pendingSharedActionExecutionPersistence.ts's
 * own commitArcGoalProgressIfReady). A no-op (returns the same object)
 * from any other status, including an already-"progress_committed"
 * record -- idempotent by construction.
 */
export function markProgressCommitted(execution: PendingSharedActionExecution, now: string): PendingSharedActionExecution {
  if (execution.status !== "awaiting_progress_commit") return execution;
  return { ...execution, status: "progress_committed", updatedAt: now };
}
