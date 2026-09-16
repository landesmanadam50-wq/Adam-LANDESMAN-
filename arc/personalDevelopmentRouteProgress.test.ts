import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCombinedSessionCompletionToProgress,
  createEmptyPersonalDevelopmentRouteProgress,
  validateCombinedSessionFactsForCompletion,
} from "./personalDevelopmentRouteProgress.ts";
import type { PersonalDevelopmentRouteProgress } from "./personalDevelopmentRouteProgress.ts";
import type { CombinedLiveSessionFacts } from "./combinedLiveSessionFacts.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-02T00:00:00.000Z";

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
    factorActionReached: true,
    factorActionCompleted: true,
    sharedActionCompleted: false,
    terminalCompleted: true,
    ...overrides,
  };
}

function emptyProgress(routeConfigId = "route-1"): PersonalDevelopmentRouteProgress {
  return createEmptyPersonalDevelopmentRouteProgress(routeConfigId, NOW);
}

// --- Validation ---

test("valid Full terminal completion validates", () => {
  assert.deepEqual(validateCombinedSessionFactsForCompletion(facts()), { valid: true });
});

test("valid Mini terminal completion validates without any rating history", () => {
  const f = facts({ mode: "mini", factorRatingHistory: [], desiredStateRating: null });
  assert.deepEqual(validateCombinedSessionFactsForCompletion(f), { valid: true });
});

test("nonterminal facts rejected", () => {
  assert.deepEqual(validateCombinedSessionFactsForCompletion(facts({ terminalCompleted: false })), { valid: false, reason: "not_terminal" });
});

test("action reached but not confirmed is rejected -- timer completion alone never counts", () => {
  const f = facts({ factorActionReached: true, factorActionCompleted: false });
  assert.deepEqual(validateCombinedSessionFactsForCompletion(f), { valid: false, reason: "factor_action_not_completed" });
});

test("abandoned session (terminalCompleted false regardless of other flags) is rejected", () => {
  const f = facts({ terminalCompleted: false, factorActionReached: true, factorActionCompleted: true });
  assert.deepEqual(validateCombinedSessionFactsForCompletion(f), { valid: false, reason: "not_terminal" });
});

test("proactive cadence rejected -- only real merged reactive Full/Mini terminal facts may be written in this phase", () => {
  assert.deepEqual(validateCombinedSessionFactsForCompletion(facts({ cadence: "proactive" })), { valid: false, reason: "proactive_not_yet_supported" });
});

test("blank sessionId/routeConfigId rejected", () => {
  assert.deepEqual(validateCombinedSessionFactsForCompletion(facts({ sessionId: "" })), { valid: false, reason: "missing_session_id" });
  assert.deepEqual(validateCombinedSessionFactsForCompletion(facts({ routeConfigId: "   " })), { valid: false, reason: "missing_route_config_id" });
});

test("unresolved primary factor rejected when factors were selected", () => {
  const f = facts({ primaryFactorId: null, selectedItemIds: ["t1", "u1"] });
  assert.deepEqual(validateCombinedSessionFactsForCompletion(f), { valid: false, reason: "unresolved_primary_factor" });
});

test("null primaryFactorId is VALID for a legitimate Presence-only route (zero selected factors)", () => {
  const f = facts({ primaryFactorId: null, selectedItemIds: [], completedTypes: [], presenceSelectedForSession: true, presenceMode: "embedded", actionOutcomeKind: "factor_only" });
  assert.deepEqual(validateCombinedSessionFactsForCompletion(f), { valid: true });
});

test("null and 'unavailable' actionOutcomeKind both rejected", () => {
  assert.deepEqual(validateCombinedSessionFactsForCompletion(facts({ actionOutcomeKind: null })), { valid: false, reason: "action_outcome_missing" });
  assert.deepEqual(validateCombinedSessionFactsForCompletion(facts({ actionOutcomeKind: "unavailable" })), { valid: false, reason: "action_outcome_unavailable" });
});

test("state_then_factor requires BOTH state and factor action completed", () => {
  const base = facts({ actionOutcomeKind: "state_then_factor", stateActionCompleted: true, factorActionCompleted: true });
  assert.deepEqual(validateCombinedSessionFactsForCompletion(base), { valid: true });
  assert.deepEqual(validateCombinedSessionFactsForCompletion({ ...base, stateActionCompleted: false }), { valid: false, reason: "state_action_not_completed" });
  assert.deepEqual(validateCombinedSessionFactsForCompletion({ ...base, factorActionCompleted: false }), { valid: false, reason: "factor_action_not_completed" });
});

test("shared_explicit requires sharedActionCompleted specifically", () => {
  const f = facts({ actionOutcomeKind: "shared_explicit", factorActionCompleted: false, stateActionCompleted: false, sharedActionCompleted: false });
  assert.deepEqual(validateCombinedSessionFactsForCompletion(f), { valid: false, reason: "shared_action_not_completed" });
  assert.deepEqual(validateCombinedSessionFactsForCompletion({ ...f, sharedActionCompleted: true }), { valid: true });
});

test("legacy_shared_state_fallback validates as State-role completion -- never pretends a new explicit relationship was configured", () => {
  const f = facts({ actionOutcomeKind: "legacy_shared_state_fallback", factorActionCompleted: false, stateActionCompleted: false });
  assert.deepEqual(validateCombinedSessionFactsForCompletion(f), { valid: false, reason: "state_action_not_completed" });
  assert.deepEqual(validateCombinedSessionFactsForCompletion({ ...f, stateActionCompleted: true }), { valid: true });
});

// --- Apply: single session ---

test("one completed combined session increments completedSessions exactly once", () => {
  const outcome = applyCombinedSessionCompletionToProgress(emptyProgress(), facts(), LATER);
  assert.equal(outcome.kind, "applied");
  if (outcome.kind !== "applied") return;
  assert.equal(outcome.progress.completedSessions, 1);
  assert.equal(outcome.progress.updatedAt, LATER);
});

test("nonterminal facts produce invalid_completion and change nothing", () => {
  const progress = emptyProgress();
  const outcome = applyCombinedSessionCompletionToProgress(progress, facts({ terminalCompleted: false }), LATER);
  assert.equal(outcome.kind, "invalid_completion");
  assert.deepEqual(progress, emptyProgress(), "input progress object never mutated");
});

test("mismatched routeConfigId between progress record and facts is rejected defensively", () => {
  const outcome = applyCombinedSessionCompletionToProgress(emptyProgress("route-A"), facts({ routeConfigId: "route-B" }), LATER);
  assert.equal(outcome.kind, "invalid_completion");
});

// --- Thought + Belief example from the approved spec ---

test("Thought + Belief in one session: one completed session, both types increment once each", () => {
  const f = facts({ completedTypes: ["thought", "belief"], practicedItemIds: ["t1", "b1"] });
  const outcome = applyCombinedSessionCompletionToProgress(emptyProgress(), f, LATER);
  assert.equal(outcome.kind, "applied");
  if (outcome.kind !== "applied") return;
  assert.equal(outcome.progress.completedSessions, 1, "Thought + Belief in one session is ONE completed session, never two");
  assert.equal(outcome.progress.completedByInterferenceType.thought, 1);
  assert.equal(outcome.progress.completedByInterferenceType.belief, 1);
  assert.equal(outcome.progress.completedByInterferenceType.emotion, 0);
  assert.equal(outcome.progress.completedByInterferenceType.urge, 0);
});

test("Thought + Belief session, then a separate Thought-only session: total 2 / thought 2 / belief 1 -- never belief 2", () => {
  const session1 = facts({ sessionId: "s1", completedTypes: ["thought", "belief"] });
  const applied1 = applyCombinedSessionCompletionToProgress(emptyProgress(), session1, NOW);
  assert.equal(applied1.kind, "applied");
  if (applied1.kind !== "applied") return;

  const session2 = facts({ sessionId: "s2", completedTypes: ["thought"] });
  const applied2 = applyCombinedSessionCompletionToProgress(applied1.progress, session2, LATER);
  assert.equal(applied2.kind, "applied");
  if (applied2.kind !== "applied") return;

  assert.equal(applied2.progress.completedSessions, 2);
  assert.equal(applied2.progress.completedByInterferenceType.thought, 2);
  assert.equal(applied2.progress.completedByInterferenceType.belief, 1, "must never display or imply belief = 2");
});

test("repeated item/type IDs in facts are deduplicated defensively -- a type listed twice still increments only once", () => {
  const f = facts({ completedTypes: ["thought", "thought", "belief"] as CombinedLiveSessionFacts["completedTypes"] });
  const outcome = applyCombinedSessionCompletionToProgress(emptyProgress(), f, LATER);
  assert.equal(outcome.kind, "applied");
  if (outcome.kind !== "applied") return;
  assert.equal(outcome.progress.completedByInterferenceType.thought, 1);
  assert.equal(outcome.progress.completedByInterferenceType.belief, 1);
});

test("primary factor does not suppress secondary per-type completion -- Urge is primary, Thought still gets credited", () => {
  const f = facts({ primaryFactorId: "u1", completedTypes: ["thought", "urge"], selectedItemIds: ["t1", "u1"], actionOutcomeKind: "factor_only" });
  const outcome = applyCombinedSessionCompletionToProgress(emptyProgress(), f, LATER);
  assert.equal(outcome.kind, "applied");
  if (outcome.kind !== "applied") return;
  assert.equal(outcome.progress.completedByInterferenceType.thought, 1);
  assert.equal(outcome.progress.completedByInterferenceType.urge, 1);
});

test("a configured-but-unpracticed factor is never counted -- only facts.completedTypes drives increments", () => {
  const f = facts({ configuredItemIds: ["t1", "b1"], selectedItemIds: ["t1"], completedTypes: ["thought"] });
  const outcome = applyCombinedSessionCompletionToProgress(emptyProgress(), f, LATER);
  assert.equal(outcome.kind, "applied");
  if (outcome.kind !== "applied") return;
  assert.equal(outcome.progress.completedByInterferenceType.thought, 1);
  assert.equal(outcome.progress.completedByInterferenceType.belief, 0);
});

// --- Presence ---

test("Embedded Presence increments only embeddedPresenceUses (+ presence type), never fullPresenceCompletions", () => {
  const f = facts({ presenceSelectedForSession: true, presenceMode: "embedded" });
  const outcome = applyCombinedSessionCompletionToProgress(emptyProgress(), f, LATER);
  assert.equal(outcome.kind, "applied");
  if (outcome.kind !== "applied") return;
  assert.equal(outcome.progress.embeddedPresenceUses, 1);
  assert.equal(outcome.progress.fullPresenceCompletions, 0);
  assert.equal(outcome.progress.completedByInterferenceType.presence, 1);
});

test("Full Presence increments only fullPresenceCompletions (+ presence type), never embeddedPresenceUses", () => {
  const f = facts({ presenceSelectedForSession: true, presenceMode: "full" });
  const outcome = applyCombinedSessionCompletionToProgress(emptyProgress(), f, LATER);
  assert.equal(outcome.kind, "applied");
  if (outcome.kind !== "applied") return;
  assert.equal(outcome.progress.fullPresenceCompletions, 1);
  assert.equal(outcome.progress.embeddedPresenceUses, 0);
  assert.equal(outcome.progress.completedByInterferenceType.presence, 1);
});

test("configured-but-skipped Presence increments neither counter", () => {
  const f = facts({ presenceSelectedForSession: true, presenceMode: "skipped" });
  const outcome = applyCombinedSessionCompletionToProgress(emptyProgress(), f, LATER);
  assert.equal(outcome.kind, "applied");
  if (outcome.kind !== "applied") return;
  assert.equal(outcome.progress.embeddedPresenceUses, 0);
  assert.equal(outcome.progress.fullPresenceCompletions, 0);
  assert.equal(outcome.progress.completedByInterferenceType.presence, 0);
});

test("embedded/full Presence remain mutually exclusive within one applied session -- structurally impossible for both to increment from the same facts object", () => {
  for (const mode of ["embedded", "full", "skipped"] as const) {
    const outcome = applyCombinedSessionCompletionToProgress(emptyProgress(), facts({ presenceMode: mode, sessionId: `s-${mode}` }), LATER);
    assert.equal(outcome.kind, "applied");
    if (outcome.kind !== "applied") continue;
    const bothIncremented = outcome.progress.embeddedPresenceUses > 0 && outcome.progress.fullPresenceCompletions > 0;
    assert.equal(bothIncremented, false);
  }
});

// --- Full/Mini totals ---

test("Full and Mini totals stay separated", () => {
  const fullOutcome = applyCombinedSessionCompletionToProgress(emptyProgress(), facts({ mode: "full", sessionId: "s-full" }), LATER);
  assert.equal(fullOutcome.kind, "applied");
  if (fullOutcome.kind !== "applied") return;
  assert.equal(fullOutcome.progress.completedFullSessions, 1);
  assert.equal(fullOutcome.progress.completedMiniSessions, 0);

  const miniOutcome = applyCombinedSessionCompletionToProgress(fullOutcome.progress, facts({ mode: "mini", sessionId: "s-mini" }), LATER);
  assert.equal(miniOutcome.kind, "applied");
  if (miniOutcome.kind !== "applied") return;
  assert.equal(miniOutcome.progress.completedFullSessions, 1);
  assert.equal(miniOutcome.progress.completedMiniSessions, 1);
  assert.equal(miniOutcome.progress.completedSessions, 2);
});

// --- Idempotency ---

test("duplicate sessionId is a no-op -- returns duplicate_session and changes nothing", () => {
  const applied = applyCombinedSessionCompletionToProgress(emptyProgress(), facts(), NOW);
  assert.equal(applied.kind, "applied");
  if (applied.kind !== "applied") return;

  const duplicate = applyCombinedSessionCompletionToProgress(applied.progress, facts(), LATER);
  assert.equal(duplicate.kind, "duplicate_session");
  if (duplicate.kind !== "duplicate_session") return;
  assert.deepEqual(duplicate.progress, applied.progress, "no counters, no timestamps change on a duplicate");
});

test("a retry after an uncertain save resubmits the same sessionId and stays idempotent (simulated: apply twice against the persisted result)", () => {
  const first = applyCombinedSessionCompletionToProgress(emptyProgress(), facts({ sessionId: "retry-1" }), NOW);
  assert.equal(first.kind, "applied");
  if (first.kind !== "applied") return;
  const retry = applyCombinedSessionCompletionToProgress(first.progress, facts({ sessionId: "retry-1" }), LATER);
  assert.equal(retry.kind, "duplicate_session");
  if (retry.kind !== "duplicate_session") return;
  assert.equal(retry.progress.completedSessions, 1);
});

// --- Immutability ---

test("applyCombinedSessionCompletionToProgress never mutates its input progress object", () => {
  const progress = emptyProgress();
  const snapshot = JSON.parse(JSON.stringify(progress));
  applyCombinedSessionCompletionToProgress(progress, facts(), LATER);
  assert.deepEqual(progress, snapshot);
});

// --- Historical totals survive route edits / archived routes ---

test("historical totals are unaffected by anything outside this pure function -- archiving/editing a route never touches an already-applied progress record", () => {
  const applied = applyCombinedSessionCompletionToProgress(emptyProgress(), facts({ completedTypes: ["thought", "belief"] }), NOW);
  assert.equal(applied.kind, "applied");
  if (applied.kind !== "applied") return;
  // Nothing in this module reads/writes PersonalDevelopmentRouteConfig at all -- the progress
  // record is a wholly separate store, so a route edit/archive (a different store entirely)
  // can never touch it. This test documents that guarantee at the type/module level.
  assert.equal(applied.progress.completedSessions, 1);
  assert.equal(applied.progress.completedByInterferenceType.thought, 1);
  assert.equal(applied.progress.completedByInterferenceType.belief, 1);
});

// --- Missing progress defaults to zero ---

test("createEmptyPersonalDevelopmentRouteProgress defaults every counter to zero", () => {
  const empty = createEmptyPersonalDevelopmentRouteProgress("route-x", NOW);
  assert.equal(empty.completedSessions, 0);
  assert.deepEqual(empty.completedByInterferenceType, { thought: 0, belief: 0, emotion: 0, urge: 0, presence: 0 });
  assert.equal(empty.embeddedPresenceUses, 0);
  assert.equal(empty.fullPresenceCompletions, 0);
  assert.equal(empty.completedFullSessions, 0);
  assert.equal(empty.completedMiniSessions, 0);
  assert.deepEqual(empty.countedSessionIds, []);
});
