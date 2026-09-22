import test from "node:test";
import assert from "node:assert/strict";

import {
  allActionRolesConfirmed,
  applyActionRoleConfirmedToSnapshot,
  applyActionRoleSkippedToSnapshot,
  resolveNextUnconfirmedActionRole,
  resolveTerminalFactsForSnapshot,
} from "./frozenCombinedActionRecovery.ts";
import type { FrozenCombinedActionSnapshot } from "./frozenCombinedActionRecovery.ts";
import type { ActionRoleProgress } from "./combinedLiveSession.ts";
import type { CombinedLiveSessionFacts } from "./combinedLiveSessionFacts.ts";

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
    factorActionReached: false,
    factorActionCompleted: false,
    sharedActionCompleted: false,
    beneficialActionPolicy: "required",
    stateActionSkipped: false,
    factorActionSkipped: false,
    sharedActionSkipped: false,
    terminalCompleted: false,
    stageAtStart: 1,
    ...overrides,
  };
}

function factorOnlySnapshot(): FrozenCombinedActionSnapshot {
  return {
    facts: facts({ actionOutcomeKind: "factor_only" }),
    actionRoleProgress: [{ role: "factor", action: "לכתוב יומן", timerType: "combinedFactorAction", reached: false, completed: false }],
    stateActionDurationMinutes: null,
  };
}

function stateThenFactorSnapshot(): FrozenCombinedActionSnapshot {
  return {
    facts: facts({ actionOutcomeKind: "state_then_factor", stateProfileId: "s1", stateIncluded: true }),
    actionRoleProgress: [
      { role: "state", action: "לנשום עמוק", timerType: "combinedStateAction", reached: false, completed: false },
      { role: "factor", action: "לכתוב יומן", timerType: "combinedFactorAction", reached: false, completed: false },
    ],
    stateActionDurationMinutes: 3,
  };
}

// --- resolveNextUnconfirmedActionRole ---

test("resolveNextUnconfirmedActionRole returns the one role for a single-action outcome", () => {
  const snapshot = factorOnlySnapshot();
  assert.equal(resolveNextUnconfirmedActionRole(snapshot.actionRoleProgress)?.role, "factor");
});

test("resolveNextUnconfirmedActionRole returns null once the single role is confirmed", () => {
  const snapshot = factorOnlySnapshot();
  const confirmed = [{ ...snapshot.actionRoleProgress[0], reached: true, completed: true }];
  assert.equal(resolveNextUnconfirmedActionRole(confirmed), null);
});

test("resolveNextUnconfirmedActionRole returns state first, then factor, for state_then_factor -- always array order", () => {
  const snapshot = stateThenFactorSnapshot();
  assert.equal(resolveNextUnconfirmedActionRole(snapshot.actionRoleProgress)?.role, "state");
  const afterState = [{ ...snapshot.actionRoleProgress[0], reached: true, completed: true }, snapshot.actionRoleProgress[1]];
  assert.equal(resolveNextUnconfirmedActionRole(afterState)?.role, "factor");
});

// --- applyActionRoleConfirmedToSnapshot ---

test("confirming the factor role sets factorActionReached/Completed and never touches state/shared flags", () => {
  const snapshot = factorOnlySnapshot();
  const patched = applyActionRoleConfirmedToSnapshot(snapshot, "factor");
  assert.equal(patched.facts.factorActionReached, true);
  assert.equal(patched.facts.factorActionCompleted, true);
  assert.equal(patched.facts.stateActionReached, false);
  assert.equal(patched.facts.stateActionCompleted, false);
  assert.equal(patched.facts.sharedActionCompleted, false);
  assert.equal(patched.actionRoleProgress[0].completed, true);
  assert.equal(patched.actionRoleProgress[0].reached, true);
});

test("confirming the state role in a state_then_factor snapshot never touches the factor role's own entry", () => {
  const snapshot = stateThenFactorSnapshot();
  const patched = applyActionRoleConfirmedToSnapshot(snapshot, "state");
  assert.equal(patched.facts.stateActionCompleted, true);
  assert.equal(patched.facts.factorActionCompleted, false, "the factor role remains unconfirmed");
  assert.equal(patched.actionRoleProgress[1].completed, false, "the factor entry itself is untouched");
});

test("confirming the shared role only ever sets sharedActionCompleted (there is no sharedActionReached field)", () => {
  const snapshot: FrozenCombinedActionSnapshot = {
    facts: facts({ actionOutcomeKind: "shared_explicit" }),
    actionRoleProgress: [{ role: "shared", action: "פעולה משותפת", timerType: "combinedSharedAction", reached: false, completed: false }],
    stateActionDurationMinutes: null,
  };
  const patched = applyActionRoleConfirmedToSnapshot(snapshot, "shared");
  assert.equal(patched.facts.sharedActionCompleted, true);
});

test("applyActionRoleConfirmedToSnapshot never mutates its input", () => {
  const snapshot = stateThenFactorSnapshot();
  const before = JSON.parse(JSON.stringify(snapshot));
  applyActionRoleConfirmedToSnapshot(snapshot, "state");
  assert.deepEqual(snapshot, before);
});

// --- allActionRolesConfirmed ---

test("allActionRolesConfirmed is false until every role is confirmed, true once they all are", () => {
  const snapshot = stateThenFactorSnapshot();
  assert.equal(allActionRolesConfirmed(snapshot.actionRoleProgress), false);
  const afterState = applyActionRoleConfirmedToSnapshot(snapshot, "state");
  assert.equal(allActionRolesConfirmed(afterState.actionRoleProgress), false, "one of two confirmed is still not all");
  const afterBoth = applyActionRoleConfirmedToSnapshot(afterState, "factor");
  assert.equal(allActionRolesConfirmed(afterBoth.actionRoleProgress), true);
});

// --- resolveTerminalFactsForSnapshot ---

test("resolveTerminalFactsForSnapshot sets terminalCompleted true without touching any other field", () => {
  const snapshot = factorOnlySnapshot();
  const confirmed = applyActionRoleConfirmedToSnapshot(snapshot, "factor");
  const terminal = resolveTerminalFactsForSnapshot(confirmed);
  assert.equal(terminal.terminalCompleted, true);
  assert.equal(terminal.factorActionCompleted, true);
  assert.equal(terminal.sessionId, "session-1");
});

test("resolveTerminalFactsForSnapshot is a pure projection -- never mutates the snapshot, and can be called even before every role is confirmed (never a gate itself)", () => {
  const snapshot = stateThenFactorSnapshot();
  const before = JSON.parse(JSON.stringify(snapshot));
  const terminal = resolveTerminalFactsForSnapshot(snapshot);
  assert.equal(terminal.terminalCompleted, true, "this function alone never checks readiness -- callers must check allActionRolesConfirmed first");
  assert.deepEqual(snapshot, before);
});

// --- applyActionRoleSkippedToSnapshot (Adaptive ARC architecture task, unified PD/ARC Goal, Phase 8) ---

test("applyActionRoleSkippedToSnapshot marks the role skipped (never completed) only when the frozen policy is 'optional_in_live'", () => {
  const snapshot: FrozenCombinedActionSnapshot = { ...factorOnlySnapshot(), facts: { ...factorOnlySnapshot().facts, beneficialActionPolicy: "optional_in_live" } };
  const patched = applyActionRoleSkippedToSnapshot(snapshot, "factor");
  assert.equal(patched.facts.factorActionSkipped, true);
  assert.equal(patched.facts.factorActionCompleted, false);
  assert.equal(patched.actionRoleProgress[0].skipped, true);
  assert.equal(patched.actionRoleProgress[0].completed, false);
});

test("applyActionRoleSkippedToSnapshot is a no-op when the frozen policy is 'required' (the default) -- mirrors skipActionCompleted's own defensive check, never relying on the caller alone", () => {
  const snapshot = factorOnlySnapshot(); // beneficialActionPolicy: "required" by default
  assert.equal(snapshot.facts.beneficialActionPolicy, "required");
  const patched = applyActionRoleSkippedToSnapshot(snapshot, "factor");
  assert.equal(patched, snapshot, "same reference -- nothing changed");
});

test("a skipped role is treated as addressed by resolveNextUnconfirmedActionRole/allActionRolesConfirmed, exactly like a completed one", () => {
  const snapshot: FrozenCombinedActionSnapshot = { ...factorOnlySnapshot(), facts: { ...factorOnlySnapshot().facts, beneficialActionPolicy: "optional_in_live" } };
  assert.equal(resolveNextUnconfirmedActionRole(snapshot.actionRoleProgress)?.role, "factor");
  const patched = applyActionRoleSkippedToSnapshot(snapshot, "factor");
  assert.equal(resolveNextUnconfirmedActionRole(patched.actionRoleProgress), null, "a skipped role is no longer 'next unconfirmed'");
  assert.equal(allActionRolesConfirmed(patched.actionRoleProgress), true);
});

test("applyActionRoleSkippedToSnapshot never mutates its input", () => {
  const snapshot: FrozenCombinedActionSnapshot = { ...stateThenFactorSnapshot(), facts: { ...stateThenFactorSnapshot().facts, beneficialActionPolicy: "optional_in_live" } };
  const before = JSON.parse(JSON.stringify(snapshot));
  applyActionRoleSkippedToSnapshot(snapshot, "state");
  assert.deepEqual(snapshot, before);
});

test("state_then_factor: one role skipped, the other confirmed -- resolveTerminalFactsForSnapshot is reachable once both are addressed, mixing completed and skipped correctly", () => {
  const base = stateThenFactorSnapshot();
  const snapshot: FrozenCombinedActionSnapshot = { ...base, facts: { ...base.facts, beneficialActionPolicy: "optional_in_live" } };
  const afterSkipState = applyActionRoleSkippedToSnapshot(snapshot, "state");
  assert.equal(allActionRolesConfirmed(afterSkipState.actionRoleProgress), false, "factor role still pending");
  const afterBoth = applyActionRoleConfirmedToSnapshot(afterSkipState, "factor");
  assert.equal(allActionRolesConfirmed(afterBoth.actionRoleProgress), true);
  const terminal = resolveTerminalFactsForSnapshot(afterBoth);
  assert.equal(terminal.stateActionSkipped, true);
  assert.equal(terminal.stateActionCompleted, false);
  assert.equal(terminal.factorActionCompleted, true);
});
