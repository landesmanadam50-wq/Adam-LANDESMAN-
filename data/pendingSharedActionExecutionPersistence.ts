/**
 * data/pendingSharedActionExecutionPersistence.ts
 *
 * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 4: the
 * orchestration layer between arc/pendingSharedActionExecution.ts's own
 * pure state machine and data/storage.ts's PendingSharedActionExecutionStore
 * persistence -- mirrors data/personalDevelopmentRouteProgressPersistence.ts's
 * and data/arcGoalSessionProgressPersistence.ts's own "load -> pure
 * apply -> save" shape.
 *
 * commitArcGoalProgressIfReady below is the exact code path that performs
 * the ArcGoal progress write: it gates on
 * arc/pendingSharedActionExecution.ts's own allRequiredActionRolesConfirmed
 * (via markAwaitingProgressCommit), then calls
 * data/arcGoalSessionProgressPersistence.ts's own
 * recordArcGoalSessionCompletion (which itself calls
 * arc/arcGoalSessionProgress.ts's own applyArcGoalSessionCompletionToProgress
 * and, only on a genuinely new "applied" outcome,
 * data/storage.ts's own saveArcGoalSessionProgressStore). Nothing else in
 * this codebase writes to that store.
 *
 * Same accepted non-atomicity caveat as the two sibling persistence
 * modules: plain load -> update -> save sequences, not atomic
 * transactions, no locking. Restart-safety instead comes from the pending
 * execution's own persisted status: a crash between the
 * "awaiting_progress_commit" save and the progress-store write is
 * recoverable on the next call (see the "awaiting_progress_commit" branch
 * below), because recordArcGoalSessionCompletion's own idempotency ledger
 * (keyed by facts.sessionId) makes re-calling it safe whether or not the
 * earlier attempt's write actually landed.
 */

import { loadPendingSharedActionExecutionStore, savePendingSharedActionExecutionStore } from "./storage.ts";
import type { PendingSharedActionExecutionStore } from "./storage.ts";
import { recordArcGoalSessionCompletion } from "./arcGoalSessionProgressPersistence.ts";
import type { ArcGoalSessionProgressStorageDependencies } from "./arcGoalSessionProgressPersistence.ts";
import type { RecordArcGoalSessionOutcome } from "../arc/arcGoalSessionProgress.ts";
import {
  confirmPendingActionRole,
  createPendingSharedActionExecution,
  markAwaitingProgressCommit,
  markProgressCommitted,
  resolvePendingSharedActionExecutionKey,
} from "../arc/pendingSharedActionExecution.ts";
import type { PendingActionRoleId, PendingSharedActionExecution } from "../arc/pendingSharedActionExecution.ts";
import type { ArcGoalSharedFacts, LiveSessionTrack } from "../arc/sharedLiveSessionFacts.ts";

export interface PendingSharedActionExecutionStorageDependencies {
  loadStore: () => Promise<PendingSharedActionExecutionStore>;
  saveStore: (store: PendingSharedActionExecutionStore) => Promise<void>;
}

const defaultPendingSharedActionExecutionStorageDependencies: PendingSharedActionExecutionStorageDependencies = {
  loadStore: loadPendingSharedActionExecutionStore,
  saveStore: savePendingSharedActionExecutionStore,
};

export async function loadPendingSharedActionExecution(
  track: LiveSessionTrack,
  ownerId: string,
  deps: PendingSharedActionExecutionStorageDependencies = defaultPendingSharedActionExecutionStorageDependencies
): Promise<PendingSharedActionExecution | null> {
  const store = await deps.loadStore();
  return store[resolvePendingSharedActionExecutionKey(track, ownerId)] ?? null;
}

/**
 * Starts a brand-new session's queue and persists it immediately --
 * replaces any prior record for this (track, ownerId) wholesale, exactly
 * mirroring arc/pendingSharedActionExecution.ts's own
 * createPendingSharedActionExecution doc ("never reuses a stale queue
 * from an earlier session").
 */
export async function startPendingSharedActionExecution(
  track: LiveSessionTrack,
  ownerId: string,
  sessionId: string,
  roleIds: PendingActionRoleId[],
  now: string,
  deps: PendingSharedActionExecutionStorageDependencies = defaultPendingSharedActionExecutionStorageDependencies
): Promise<PendingSharedActionExecution> {
  const store = await deps.loadStore();
  const key = resolvePendingSharedActionExecutionKey(track, ownerId);
  const execution = createPendingSharedActionExecution(track, ownerId, sessionId, roleIds, now);
  await deps.saveStore({ ...store, [key]: execution });
  return execution;
}

export type ConfirmActionRoleOutcome = { kind: "confirmed"; execution: PendingSharedActionExecution } | { kind: "no_pending_execution" };

/** Loads the record, applies the pure confirmPendingActionRole, and saves the WHOLE store back -- always, even on a no-op confirmation (an unknown or already-confirmed role), since the write is cheap and this keeps the persisted `updatedAt` semantics identical to the pure function's own (a genuine no-op never changes it). Reports "no_pending_execution" rather than fabricating one when no session has been started for this owner yet. */
export async function confirmActionRoleAndPersist(
  track: LiveSessionTrack,
  ownerId: string,
  roleId: PendingActionRoleId,
  now: string,
  deps: PendingSharedActionExecutionStorageDependencies = defaultPendingSharedActionExecutionStorageDependencies
): Promise<ConfirmActionRoleOutcome> {
  const store = await deps.loadStore();
  const key = resolvePendingSharedActionExecutionKey(track, ownerId);
  const existing = store[key];
  if (!existing) return { kind: "no_pending_execution" };
  const confirmed = confirmPendingActionRole(existing, roleId, now);
  await deps.saveStore({ ...store, [key]: confirmed });
  return { kind: "confirmed", execution: confirmed };
}

export type CommitArcGoalProgressOutcome =
  | { kind: "committed"; execution: PendingSharedActionExecution; progressOutcome: RecordArcGoalSessionOutcome }
  | { kind: "already_committed"; execution: PendingSharedActionExecution }
  | { kind: "not_ready" }
  | { kind: "no_pending_execution" };

export interface CommitArcGoalProgressDependencies {
  pending?: PendingSharedActionExecutionStorageDependencies;
  progress?: ArcGoalSessionProgressStorageDependencies;
}

/**
 * THE code path that performs the ArcGoal progress write. Always reads
 * the pending execution first -- never writes progress from `facts`
 * alone, however its own outerRunCompleted/terminalCompleted fields are
 * set:
 *
 * - No record for this owner at all -> "no_pending_execution", nothing written.
 * - Already "progress_committed" -> "already_committed", nothing written
 *   again (idempotent on repeated calls, e.g. a retried commit tap).
 * - "awaiting_progress_commit" (a prior call got this far but the process
 *   died before confirming the write) -> resumes from the ALREADY-STORED
 *   completionPayload, calls recordArcGoalSessionCompletion again (safe:
 *   its own countedSessionIds ledger makes this idempotent whether or not
 *   the earlier attempt's write landed), then marks committed.
 * - "action_pending" -> gated by markAwaitingProgressCommit, which itself
 *   refuses ("not_ready") unless every required role in actionQueue is
 *   confirmed. Only past that gate does this function persist the
 *   "awaiting_progress_commit" transition, call
 *   recordArcGoalSessionCompletion, and finally persist "progress_committed".
 */
export async function commitArcGoalProgressIfReady(
  ownerId: string,
  facts: ArcGoalSharedFacts,
  now: string,
  deps: CommitArcGoalProgressDependencies = {}
): Promise<CommitArcGoalProgressOutcome> {
  const pendingDeps = deps.pending ?? defaultPendingSharedActionExecutionStorageDependencies;
  const pendingStore = await pendingDeps.loadStore();
  const key = resolvePendingSharedActionExecutionKey("arc_goal", ownerId);
  const existing = pendingStore[key];
  if (!existing) return { kind: "no_pending_execution" };

  if (existing.status === "progress_committed") return { kind: "already_committed", execution: existing };

  if (existing.status === "awaiting_progress_commit") {
    const resumedFacts = existing.completionPayload!.facts as ArcGoalSharedFacts;
    const progressOutcome = await recordArcGoalSessionCompletion(resumedFacts, now, deps.progress);
    const committed = markProgressCommitted(existing, now);
    await pendingDeps.saveStore({ ...pendingStore, [key]: committed });
    return { kind: "committed", execution: committed, progressOutcome };
  }

  const transition = markAwaitingProgressCommit(existing, facts, now);
  if (transition.kind !== "transitioned") return { kind: "not_ready" };
  await pendingDeps.saveStore({ ...pendingStore, [key]: transition.execution });

  const progressOutcome = await recordArcGoalSessionCompletion(facts, now, deps.progress);
  const committed = markProgressCommitted(transition.execution, now);
  await pendingDeps.saveStore({ ...pendingStore, [key]: committed });
  return { kind: "committed", execution: committed, progressOutcome };
}
