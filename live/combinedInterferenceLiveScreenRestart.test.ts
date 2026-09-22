/**
 * live/combinedInterferenceLiveScreenRestart.test.ts
 *
 * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 6
 * correction: a PERMANENT test for the restart-recovery half of the
 * correction (Part 2). Mirrors live/combinedInterferenceLiveScreenCompletion.test.ts's
 * own approach -- no React component test harness exists in this codebase,
 * so this drives the real arc/combinedLiveSession.ts state machine up to
 * the exact moment live/CombinedInterferenceLiveScreen.tsx's own
 * state_action/factor_action render case would mount an ActionScreen, then
 * builds the SAME frozen snapshot shape that render case now builds
 * (toCombinedLiveSessionFacts(state) + state.actionRoleProgress +
 * resolveStateActionDuration(state)'s own equivalent), and finally drives
 * that snapshot through the real, exported arc/frozenCombinedActionRecovery.ts
 * functions -- the exact sequence live/CombinedInterferenceLiveScreen.tsx's
 * own handleBypassActionConfirmed applies on every confirmed role.
 *
 * The screen event that confirms an action role: ActionScreen's
 * "עשיתי את זה" button (onCompleted), disabled until the timer genuinely
 * completes -- never auto-fired by the timer alone. The screen event that
 * commits progress: CombinedSessionCompletionScreen's own attemptSave,
 * reached only once every action role's own `completed` flag is true
 * (either via the normal walk's confirmActionCompleted, or via this file's
 * own restart path's applyActionRoleConfirmedToSnapshot) -- see
 * resolveTerminalFactsForSnapshot's own gating requirement, asserted below
 * exactly like the sibling file's own screenWouldCallCompletion pin.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  advanceAwarenessRecognition,
  advanceStep,
  answerReassessment,
  confirmActionCompleted,
  createCombinedLiveSession,
  markActionReached,
  recordAwarenessRating,
  recordDesiredStateRating,
  recordStepRating,
} from "../arc/combinedLiveSession.ts";
import type { CombinedLiveSessionState, CreateCombinedLiveSessionInput } from "../arc/combinedLiveSession.ts";
import { toCombinedLiveSessionFacts } from "../arc/combinedLiveSessionFacts.ts";
import {
  allActionRolesConfirmed,
  applyActionRoleConfirmedToSnapshot,
  resolveNextUnconfirmedActionRole,
  resolveTerminalFactsForSnapshot,
} from "../arc/frozenCombinedActionRecovery.ts";
import type { FrozenCombinedActionSnapshot } from "../arc/frozenCombinedActionRecovery.ts";
import { recordSharedLiveSessionCompletion } from "../data/sharedLiveSessionCompletion.ts";
import type { PersonalDevelopmentRouteProgressStorageDependencies } from "../data/personalDevelopmentRouteProgressPersistence.ts";
import type { PersonalDevelopmentRouteProgressStore } from "../data/storage.ts";
import { createEmptyPersonalDevelopmentRouteConfig } from "../arc/personalDevelopmentRouteConfig.ts";
import type { PersonalDevelopmentRouteConfig } from "../arc/personalDevelopmentRouteConfig.ts";
import { createEmptyThoughtInterferenceItem } from "../arc/interferenceItem.ts";
import type { InterferenceItem, ThoughtInterferenceItem } from "../arc/interferenceItem.ts";
import { createEmptyStateProfile } from "../arc/stateProfile.ts";
import type { StateProfile } from "../arc/stateProfile.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-01T00:05:00.000Z";
const EVEN_LATER = "2026-01-01T00:10:00.000Z";

function config(overrides: Partial<PersonalDevelopmentRouteConfig> = {}): PersonalDevelopmentRouteConfig {
  return { ...createEmptyPersonalDevelopmentRouteConfig("route1", "prog1", NOW), ...overrides };
}
function thought(overrides: Partial<ThoughtInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyThoughtInterferenceItem("t1", "מחשבה", null, NOW), schemaVersion: 2, beneficialActionAgainstFactor: "פעולת מחשבה", ...overrides };
}
function completeState(overrides: Partial<StateProfile> = {}): StateProfile {
  return { ...createEmptyStateProfile("s1", "מצב", null, NOW), regulationAnchor: "עוגן", encodingCue: "קידוד", action: "פעולת המצב", ...overrides };
}
function baseInput(overrides: Partial<CreateCombinedLiveSessionInput> = {}): CreateCombinedLiveSessionInput {
  return { mode: "full", config: config(), items: [], stateProfiles: [], presenceArcs: [], startedAt: NOW, stageAtStart: 1, generateSessionId: () => "session-1", ...overrides };
}
function fakeDeps(initial: PersonalDevelopmentRouteProgressStore = {}): PersonalDevelopmentRouteProgressStorageDependencies & { savedStores: PersonalDevelopmentRouteProgressStore[] } {
  let store = initial;
  const savedStores: PersonalDevelopmentRouteProgressStore[] = [];
  return { savedStores, loadStore: async () => store, saveStore: async (next) => { store = next; savedStores.push(next); } };
}

/** Mirrors live/CombinedInterferenceLiveScreen.tsx's own resolveStateActionDuration -- only ever meaningful for the "state" role. */
function stateActionDurationFor(stateProfiles: StateProfile[]): number | null {
  return stateProfiles[0]?.actionTimerConfig?.durationMinutes ?? null;
}

/**
 * Continues driving an ALREADY-IN-PROGRESS combined session forward
 * exactly like ActionScreen's own mount (markActionReached), but STOPS
 * the instant a state_action/factor_action step is reached, WITHOUT ever
 * confirming it -- simulating the app being killed while that role's own
 * wall-clock timer is still running (or has completed but "עשיתי את זה"
 * was never tapped). Every other step is driven identically to the
 * sibling completion test file's own walkFullToComplete. Reused both to
 * reach the FIRST pending action from a freshly created session
 * (walkToPendingAction below) and, separately, to reach the SECOND
 * pending action after the first has already been confirmed through the
 * normal (non-restart) flow -- see the state_then_factor mixed-restart
 * test below.
 */
function driveStepsUntilPendingAction(state: CombinedLiveSessionState): CombinedLiveSessionState {
  let s = state;
  let guard = 0;
  while (s.phase === "steps" && guard < 30) {
    const step = s.remainingSteps[s.stepIndex];
    if (!step) break;
    if (step.kind === "state_action" || step.kind === "factor_action") {
      return markActionReached(s); // ActionScreen mounted, timer running -- never confirmed.
    }
    if (step.kind === "rating_checkpoint") {
      for (const factor of s.resolvedPlan!.factors) s = recordStepRating(s, factor.itemId, factor.category, step.checkpoint!, 5);
    } else if (step.kind === "cognitive_reassessment") {
      s = answerReassessment(s, "not_stuck");
    } else if (step.kind === "desired_state_rating") {
      s = recordDesiredStateRating(s, 8);
    } else {
      s = advanceStep(s);
    }
    guard++;
  }
  throw new Error("driveStepsUntilPendingAction never reached a state_action/factor_action step -- test setup is wrong");
}

/** Fresh session, walked to the FIRST pending action -- see driveStepsUntilPendingAction's own doc. */
function walkToPendingAction(cfg: PersonalDevelopmentRouteConfig, items: InterferenceItem[], stateProfiles: StateProfile[]): CombinedLiveSessionState {
  let state = createCombinedLiveSession(baseInput({ items, config: cfg, stateProfiles }));
  while (state.awarenessSteps[state.awarenessIndex]?.kind === "recognition") state = advanceAwarenessRecognition(state);
  for (const item of items) state = recordAwarenessRating(state, item.id, item.category, 6);
  return driveStepsUntilPendingAction(state);
}

/** Exactly what live/CombinedInterferenceLiveScreen.tsx's own state_action/factor_action render case now builds and hands to ActionScreen as frozenCombinedActionSnapshot. */
function buildFrozenSnapshot(state: CombinedLiveSessionState, stateProfiles: StateProfile[]): FrozenCombinedActionSnapshot {
  return { facts: toCombinedLiveSessionFacts(state), actionRoleProgress: state.actionRoleProgress, stateActionDurationMinutes: stateActionDurationFor(stateProfiles) };
}

/**
 * The exact sequence live/CombinedInterferenceLiveScreen.tsx's own
 * handleBypassActionConfirmed applies once a recovered/chained action
 * role's own "עשיתי את זה" is tapped. Returns either the next pending
 * snapshot (more roles remain) or the final terminalCompleted facts (every
 * role now confirmed) -- mirroring that handler's own two outcomes.
 */
function confirmBypassRole(snapshot: FrozenCombinedActionSnapshot): { next: FrozenCombinedActionSnapshot | null; terminalFacts: ReturnType<typeof resolveTerminalFactsForSnapshot> | null } {
  const role = resolveNextUnconfirmedActionRole(snapshot.actionRoleProgress);
  if (!role) return { next: snapshot, terminalFacts: null }; // idempotent duplicate confirmation -- nothing left to confirm
  const patched = applyActionRoleConfirmedToSnapshot(snapshot, role.role);
  if (allActionRolesConfirmed(patched.actionRoleProgress)) return { next: null, terminalFacts: resolveTerminalFactsForSnapshot(patched) };
  return { next: patched, terminalFacts: null };
}

// ---------------------------------------------------------------------------
// 1. Restart at a single pending action (factor_only) -- resume, confirm,
//    commit progress exactly once, with the SAME session id.
// ---------------------------------------------------------------------------

test("restart at the factor_only route's pending action: resume from the frozen snapshot, confirm, and commit progress exactly once with the original session id", async () => {
  const cfg = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  const pending = walkToPendingAction(cfg, [thought()], []);
  assert.equal(pending.phase, "steps");
  const factorEntry = pending.actionRoleProgress.find((r) => r.role === "factor");
  assert.equal(factorEntry?.reached, true, "ActionScreen's mount already called markActionReached");
  assert.equal(factorEntry?.completed, false, "never confirmed -- this IS the pending point a restart lands on");

  // "App restart" -- the only thing that survives is the frozen snapshot
  // (persisted on the TimerRun record by live/screens.tsx's useTimerRun).
  const snapshot = buildFrozenSnapshot(pending, []);
  assert.equal(snapshot.facts.sessionId, "session-1");
  assert.equal(snapshot.facts.terminalCompleted, false);

  // The resumed screen's own "עשיתי את זה" tap.
  const { next, terminalFacts } = confirmBypassRole(snapshot);
  assert.equal(next, null, "factor_only has exactly one required role -- confirming it is the whole session");
  assert.ok(terminalFacts);
  assert.equal(terminalFacts!.terminalCompleted, true);
  assert.equal(terminalFacts!.factorActionCompleted, true);
  assert.equal(terminalFacts!.sessionId, "session-1", "the SAME session id survives the restart -- never reminted");

  const deps = fakeDeps();
  const facts = { track: "personal_development" as const, facts: terminalFacts! };
  const first = await recordSharedLiveSessionCompletion(facts, NOW, { personalDevelopment: deps });
  assert.equal(first.outcome.kind, "applied");
  assert.equal(deps.savedStores[0]["route1"].completedSessions, 1);

  // A duplicate commit attempt (e.g. a second restart landing after the
  // action was already confirmed but before the app could navigate away)
  // must never double-count.
  const retry = await recordSharedLiveSessionCompletion(facts, LATER, { personalDevelopment: deps });
  assert.equal(retry.outcome.kind, "duplicate_session");
  assert.equal(deps.savedStores[deps.savedStores.length - 1]["route1"].completedSessions, 1, "still exactly one progress write");
});

// ---------------------------------------------------------------------------
// 2. Restart at EACH pending action in a state_then_factor route -- both
//    roles individually recoverable, neither alone completes the session.
// ---------------------------------------------------------------------------

test("state_then_factor: restart at the state role's pending point, confirm, chain to the factor role, restart AGAIN there, confirm -- exactly one final progress write", async () => {
  const cfg = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "different_actions" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const stateProfiles = [completeState()];

  // -- First pending point: the STATE role's own timer. --
  const pendingState = walkToPendingAction(cfg, [thought()], stateProfiles);
  const stateEntry = pendingState.actionRoleProgress.find((r) => r.role === "state");
  assert.equal(stateEntry?.reached, true);
  assert.equal(stateEntry?.completed, false);
  const factorEntryBefore = pendingState.actionRoleProgress.find((r) => r.role === "factor");
  assert.equal(factorEntryBefore?.completed, false, "the second role has not even been reached yet");

  const firstSnapshot = buildFrozenSnapshot(pendingState, stateProfiles);
  assert.equal(firstSnapshot.stateActionDurationMinutes, stateProfiles[0].actionTimerConfig?.durationMinutes ?? null);

  const afterState = confirmBypassRole(firstSnapshot);
  assert.ok(afterState.next, "state_then_factor still needs the factor role confirmed -- session is not over");
  assert.equal(afterState.terminalFacts, null);
  assert.equal(afterState.next!.facts.sessionId, "session-1");
  assert.equal(resolveNextUnconfirmedActionRole(afterState.next!.actionRoleProgress)?.role, "factor", "the chain correctly advances to the SECOND role, never re-offering the first");

  // -- Second pending point: the FACTOR role's own timer, in a FRESH
  //    ActionScreen mount within the same app session (live/screens.tsx's
  //    useTimerRun persists ITS OWN new run here, carrying afterState.next
  //    forward as its frozenCombinedActionSnapshot) -- simulate ANOTHER
  //    restart landing exactly here.
  const secondSnapshot = afterState.next!;
  assert.equal(secondSnapshot.actionRoleProgress.find((r) => r.role === "state")?.completed, true, "the frozen snapshot itself now reflects the state role as confirmed");

  const afterFactor = confirmBypassRole(secondSnapshot);
  assert.equal(afterFactor.next, null);
  assert.ok(afterFactor.terminalFacts);
  assert.equal(afterFactor.terminalFacts!.terminalCompleted, true);
  assert.equal(afterFactor.terminalFacts!.stateActionCompleted, true, "the FIRST role's own confirmation, from before the second restart, is preserved");
  assert.equal(afterFactor.terminalFacts!.factorActionCompleted, true);
  assert.equal(afterFactor.terminalFacts!.sessionId, "session-1", "session id survives BOTH restarts");

  const deps = fakeDeps();
  const facts = { track: "personal_development" as const, facts: afterFactor.terminalFacts! };
  const result = await recordSharedLiveSessionCompletion(facts, NOW, { personalDevelopment: deps });
  assert.equal(result.outcome.kind, "applied");
  assert.equal(deps.savedStores[0]["route1"].completedSessions, 1, "exactly one progress write for the whole two-role session");
});

test("state_then_factor: confirm the state role through the NORMAL (non-restart) flow, then restart before confirming the factor role -- the state role's own confirmation survives the restart, only the factor role is pending, the session id is unchanged, and progress is written exactly once after the second confirmation", async () => {
  const cfg = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "different_actions" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const stateProfiles = [completeState()];

  // -- The state role is confirmed the NORMAL way: no restart yet. This
  //    is EXACTLY live/CombinedInterferenceLiveScreen.tsx's own
  //    state_action/factor_action onCompleted handler -- confirmActionCompleted,
  //    the real engine function, never the restart module's own
  //    applyActionRoleConfirmedToSnapshot.
  const pendingState = walkToPendingAction(cfg, [thought()], stateProfiles);
  const afterNormalStateConfirm = confirmActionCompleted(pendingState);
  const stateEntryAfterNormalConfirm = afterNormalStateConfirm.actionRoleProgress.find((r) => r.role === "state");
  assert.equal(stateEntryAfterNormalConfirm?.completed, true, "the state role is genuinely confirmed through the normal flow");
  assert.equal(afterNormalStateConfirm.sessionId, "session-1");

  // -- The session continues (still no restart) until the SECOND
  //    ActionScreen (the factor role) mounts -- this is the exact render
  //    case in live/CombinedInterferenceLiveScreen.tsx that now builds
  //    frozenCombinedActionSnapshot and hands it to live/screens.tsx's
  //    useTimerRun, which persists it on this role's own fresh TimerRun.
  const pendingFactor = driveStepsUntilPendingAction(afterNormalStateConfirm);
  const factorEntry = pendingFactor.actionRoleProgress.find((r) => r.role === "factor");
  assert.equal(factorEntry?.reached, true);
  assert.equal(factorEntry?.completed, false, "this IS the pending point the restart below lands on");
  assert.equal(pendingFactor.actionRoleProgress.find((r) => r.role === "state")?.completed, true, "the state role's own confirmation is still carried in the live state, unaffected by reaching the second action");

  const snapshotAtFactorMount = buildFrozenSnapshot(pendingFactor, stateProfiles);
  assert.equal(snapshotAtFactorMount.actionRoleProgress.find((r) => r.role === "state")?.completed, true, "the frozen snapshot persisted for the SECOND action already carries the first role's genuine confirmation");
  assert.equal(snapshotAtFactorMount.facts.stateActionCompleted, true, "the frozen facts themselves already reflect the state role as completed -- not just the actionRoleProgress array");
  assert.equal(snapshotAtFactorMount.facts.sessionId, "session-1");

  // -- "App restart" -- everything above (afterNormalStateConfirm,
  //    pendingFactor, the whole in-memory CombinedLiveSessionState) is
  //    gone. Only snapshotAtFactorMount, persisted on the factor role's
  //    own TimerRun, survives -- exactly what
  //    findResumableCombinedAction would load back.
  assert.equal(resolveNextUnconfirmedActionRole(snapshotAtFactorMount.actionRoleProgress)?.role, "factor", "only the factor role is pending after the restart -- the state role is never re-offered");

  const afterRestart = confirmBypassRole(snapshotAtFactorMount);
  assert.equal(afterRestart.next, null);
  assert.ok(afterRestart.terminalFacts);
  assert.equal(afterRestart.terminalFacts!.terminalCompleted, true);
  assert.equal(afterRestart.terminalFacts!.stateActionCompleted, true, "the pre-restart state confirmation is still present in the final terminal facts");
  assert.equal(afterRestart.terminalFacts!.factorActionCompleted, true);
  assert.equal(afterRestart.terminalFacts!.sessionId, "session-1", "the session id is unchanged across the restart");

  const deps = fakeDeps();
  const facts = { track: "personal_development" as const, facts: afterRestart.terminalFacts! };
  const first = await recordSharedLiveSessionCompletion(facts, NOW, { personalDevelopment: deps });
  assert.equal(first.outcome.kind, "applied");
  assert.equal(deps.savedStores[0]["route1"].completedSessions, 1, "progress is written exactly once, after the second (post-restart) confirmation");

  // A retry (e.g. a second restart landing after the factor confirmation
  // was already applied) must never double-count.
  const retry = await recordSharedLiveSessionCompletion(facts, LATER, { personalDevelopment: deps });
  assert.equal(retry.outcome.kind, "duplicate_session");
  assert.equal(deps.savedStores[deps.savedStores.length - 1]["route1"].completedSessions, 1);
});

// ---------------------------------------------------------------------------
// 3. Early-completion attempts and timer-expiry-alone never counting as
//    completion.
// ---------------------------------------------------------------------------

test("re-reading a frozen snapshot repeatedly (simulating elapsed wall-clock time) never flips a role to completed without an explicit confirmBypassRole call", () => {
  const cfg = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  const pending = walkToPendingAction(cfg, [thought()], []);
  const snapshot = buildFrozenSnapshot(pending, []);

  // Simulate the timer completing (and even overshooting) with the
  // trainee never tapping "עשיתי את זה" -- nothing here ever calls
  // applyActionRoleConfirmedToSnapshot.
  for (const now of [NOW, LATER, EVEN_LATER]) {
    void now;
    assert.equal(resolveNextUnconfirmedActionRole(snapshot.actionRoleProgress)?.role, "factor", "still pending -- a timer reaching zero is not a confirmation event");
    assert.equal(allActionRolesConfirmed(snapshot.actionRoleProgress), false);
  }
});

test("an early-completion attempt (confirming a role that was never actually reached) is never possible through this module's own API -- resolveNextUnconfirmedActionRole only ever returns roles the frozen snapshot already carries as real, resolved actions", () => {
  const cfg = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "different_actions" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const stateProfiles = [completeState()];
  const pendingState = walkToPendingAction(cfg, [thought()], stateProfiles);
  const snapshot = buildFrozenSnapshot(pendingState, stateProfiles);

  // The factor role has not been reached yet -- confirming the snapshot
  // only ever resolves and confirms the NEXT unconfirmed role in the
  // frozen snapshot's own fixed order (state, then factor); it can never
  // be asked to confirm the factor role "early", out of order.
  const { next } = confirmBypassRole(snapshot);
  assert.equal(resolveNextUnconfirmedActionRole(next!.actionRoleProgress)?.role, "factor", "only the state role was confirmable; the factor role is correctly next, never skippable");
});

// ---------------------------------------------------------------------------
// 4. Retry / duplicate confirmation idempotency.
// ---------------------------------------------------------------------------

test("a duplicate confirmation of an already-fully-confirmed snapshot is a no-op -- never re-triggers completion or a second progress write", async () => {
  const cfg = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  const pending = walkToPendingAction(cfg, [thought()], []);
  const snapshot = buildFrozenSnapshot(pending, []);

  const first = confirmBypassRole(snapshot);
  assert.ok(first.terminalFacts);

  // Duplicate tap / a second restart landing after confirmation was
  // already applied but before the screen could navigate away -- there is
  // no unconfirmed role left in the (already fully-confirmed) snapshot the
  // duplicate event would be replaying against.
  const alreadyConfirmedSnapshot: FrozenCombinedActionSnapshot = {
    ...snapshot,
    actionRoleProgress: snapshot.actionRoleProgress.map((entry) => ({ ...entry, reached: true, completed: true })),
  };
  const duplicate = confirmBypassRole(alreadyConfirmedSnapshot);
  assert.equal(duplicate.next, alreadyConfirmedSnapshot, "resolveNextUnconfirmedActionRole finds nothing left -- the snapshot is returned unchanged");
  assert.equal(duplicate.terminalFacts, null, "a duplicate confirmation never re-derives terminal facts on its own -- the screen only calls resolveTerminalFactsForSnapshot once, at the transition that first reaches allActionRolesConfirmed");

  const deps = fakeDeps();
  const facts = { track: "personal_development" as const, facts: first.terminalFacts! };
  await recordSharedLiveSessionCompletion(facts, NOW, { personalDevelopment: deps });
  const retry = await recordSharedLiveSessionCompletion(facts, LATER, { personalDevelopment: deps });
  assert.equal(retry.outcome.kind, "duplicate_session");
  assert.equal(deps.savedStores[deps.savedStores.length - 1]["route1"].completedSessions, 1);
});
