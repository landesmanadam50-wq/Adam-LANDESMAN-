/**
 * arc/frozenCombinedActionRecovery.ts
 *
 * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 6
 * correction: the pure logic behind Personal Development LIVE's own
 * restart recovery for a pending real action + wall-clock timer --
 * mirrors regular ARC's own already-real, already-shipped
 * live/LiveSessionScreen.tsx pattern (loadTimerRun("beneficialAction"),
 * resume the exact display snapshot, never reconstruct the full
 * ArcLiveState) rather than inventing a new mechanism.
 *
 * arc/combinedLiveSession.ts's own CombinedLiveSessionState carries rich
 * intermediate state (awareness ratings, tie-breaks, presence decisions)
 * that is never persisted, by design -- exactly like regular ARC's own
 * ArcLiveState. What data/storage.ts's TimerRun ALREADY persists
 * (copyTitle/copyBody/actionStartedAt/durationMinutes) is enough to
 * resume the CURRENTLY active action's own timer and content faithfully,
 * but not enough to finish recording progress correctly, since
 * data/personalDevelopmentRouteProgressPersistence.ts's own
 * recordCombinedSessionCompletion needs a full CombinedLiveSessionFacts
 * object.
 *
 * The fix: by the time ANY action role's timer begins, every decision
 * CombinedLiveSessionFacts depends on (the resolved plan, primary
 * factor, State inclusion, Presence outcome, action-outcome kind) has
 * ALREADY resolved and never changes again for the rest of the session
 * -- so freezing the terminal facts (with every not-yet-confirmed action
 * role's own completed flag still false) the moment the FIRST action
 * begins, alongside the small, already-real ActionRoleProgress[] array
 * (arc/combinedLiveSession.ts's own state.actionRoleProgress, which
 * already carries every role's own action text/timerType), is
 * sufficient to resume, confirm, chain to a second required action
 * (state_then_factor), and finish recording progress -- without ever
 * needing the discarded earlier steps again.
 *
 * Pure logic only -- no storage import, no data/ import, no React. See
 * live/CombinedInterferenceLiveScreen.tsx for where this frozen snapshot
 * is built, persisted (as one more optional field on TimerRun), and
 * consumed on resume.
 */

import type { ActionRole, ActionRoleProgress } from "./combinedLiveSession.ts";
import type { CombinedLiveSessionFacts } from "./combinedLiveSessionFacts.ts";

export interface FrozenCombinedActionSnapshot {
  /** The session's own terminal facts, frozen the moment the FIRST action role's timer began -- every completed flag reflects exactly what has genuinely been confirmed so far (never invented), terminalCompleted always false until every required role is. */
  facts: CombinedLiveSessionFacts;
  /** A frozen copy of CombinedLiveSessionState.actionRoleProgress -- every action role this outcome kind will ever need (one entry for factor_only/state_only/shared_explicit/legacy_shared_state_fallback, two for state_then_factor), each already carrying its own real action text and timerType. Never re-derived; this IS the same array the real, live session already built once, before any individual role was reached. */
  actionRoleProgress: ActionRoleProgress[];
  /** Frozen once, from the real StateProfile's own actionTimerConfig -- only ever meaningful for the "state" role (the "factor"/"shared" roles are never timed, mirroring live/CombinedInterferenceLiveScreen.tsx's own existing durationMinutes resolution). */
  stateActionDurationMinutes: number | null;
}

/**
 * The one role in `actionRoleProgress` that is not yet addressed (neither
 * completed nor explicitly skipped -- Adaptive ARC architecture task,
 * unified PD/ARC Goal, Phase 8) and should be shown/resumed next, or null
 * once every role this outcome kind needs has been addressed. Always
 * resolves in the array's own order (state before factor, for
 * state_then_factor) -- never a different order than the real, live
 * session would have reached them in.
 */
export function resolveNextUnconfirmedActionRole(actionRoleProgress: ActionRoleProgress[]): ActionRoleProgress | null {
  return actionRoleProgress.find((entry) => !entry.completed && !entry.skipped) ?? null;
}

/**
 * Patches the snapshot to reflect `role` now being explicitly confirmed
 * -- never touches any OTHER role's own flag, never mutates the input.
 * Mirrors arc/combinedLiveSession.ts's own confirmActionCompleted: this
 * is only ever called from an explicit "עשיתי את זה" confirmation, never
 * from a timer merely reaching zero.
 */
export function applyActionRoleConfirmedToSnapshot(snapshot: FrozenCombinedActionSnapshot, role: ActionRole): FrozenCombinedActionSnapshot {
  const patchedFacts: CombinedLiveSessionFacts = {
    ...snapshot.facts,
    stateActionReached: role === "state" ? true : snapshot.facts.stateActionReached,
    stateActionCompleted: role === "state" ? true : snapshot.facts.stateActionCompleted,
    factorActionReached: role === "factor" ? true : snapshot.facts.factorActionReached,
    factorActionCompleted: role === "factor" ? true : snapshot.facts.factorActionCompleted,
    sharedActionCompleted: role === "shared" ? true : snapshot.facts.sharedActionCompleted,
  };
  const patchedRoleProgress = snapshot.actionRoleProgress.map((entry) => (entry.role === role ? { ...entry, reached: true, completed: true } : entry));
  return { ...snapshot, facts: patchedFacts, actionRoleProgress: patchedRoleProgress };
}

/**
 * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 8: the
 * restart-recovery equivalent of arc/combinedLiveSession.ts's own
 * skipActionCompleted -- patches the snapshot to reflect `role` now being
 * explicitly SKIPPED, never a fabricated completion (mutually exclusive
 * with `completed`). A no-op (returns `snapshot` unchanged) unless the
 * route's own frozen beneficialActionPolicy is "optional_in_live" --
 * mirrors skipActionCompleted's own defensive policy check, never relying
 * on the caller (the skip button's own visibility) alone.
 */
export function applyActionRoleSkippedToSnapshot(snapshot: FrozenCombinedActionSnapshot, role: ActionRole): FrozenCombinedActionSnapshot {
  if (snapshot.facts.beneficialActionPolicy !== "optional_in_live") return snapshot;
  const patchedFacts: CombinedLiveSessionFacts = {
    ...snapshot.facts,
    stateActionReached: role === "state" ? true : snapshot.facts.stateActionReached,
    stateActionSkipped: role === "state" ? true : snapshot.facts.stateActionSkipped,
    factorActionReached: role === "factor" ? true : snapshot.facts.factorActionReached,
    factorActionSkipped: role === "factor" ? true : snapshot.facts.factorActionSkipped,
    sharedActionSkipped: role === "shared" ? true : snapshot.facts.sharedActionSkipped,
  };
  const patchedRoleProgress = snapshot.actionRoleProgress.map((entry) => (entry.role === role ? { ...entry, reached: true, skipped: true } : entry));
  return { ...snapshot, facts: patchedFacts, actionRoleProgress: patchedRoleProgress };
}

/** Whether every action role this outcome kind needs has now been addressed (completed OR explicitly skipped) -- the moment terminalCompleted may finally become true. */
export function allActionRolesConfirmed(actionRoleProgress: ActionRoleProgress[]): boolean {
  return actionRoleProgress.every((entry) => entry.completed || entry.skipped);
}

/**
 * The final facts object to submit once every required role is
 * confirmed -- terminalCompleted flips true only here, never earlier,
 * mirroring arc/combinedLiveSession.ts's own advanceTail doc ("only
 * reachable once... every required action has been explicitly
 * confirmed"). Callers must check allActionRolesConfirmed first; this
 * function does not check it itself (it is a pure projection, not a
 * gate) so it can also be used defensively/diagnostically.
 */
export function resolveTerminalFactsForSnapshot(snapshot: FrozenCombinedActionSnapshot): CombinedLiveSessionFacts {
  return { ...snapshot.facts, terminalCompleted: true };
}
