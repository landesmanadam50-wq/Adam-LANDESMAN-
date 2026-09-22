import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCombinedSessionCompletionToProgress,
  applyStageProgressionToRouteProgress,
  createEmptyPersonalDevelopmentRouteProgress,
  isRequiredActionOutcomeValidForMode,
  isValidRouteStageProjection,
  normalizePersonalDevelopmentRouteProgress,
  reconcileRouteStageForPolicyChange,
  resolveEligibleStageAdvancement,
  resolvePolicyDemotion,
  validateCombinedSessionFactsForCompletion,
} from "./personalDevelopmentRouteProgress.ts";
import type { BeneficialActionOutcome, PersonalDevelopmentRouteProgress, PersonalDevelopmentRouteStage } from "./personalDevelopmentRouteProgress.ts";
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
  assert.equal(empty.stage, 1);
  assert.equal(empty.stage1ConfirmedCount, 0);
  assert.equal(empty.stage2ConfirmedCount, 0);
  assert.equal(empty.stage3ConfirmedCount, 0);
  assert.equal(empty.stage4ConfirmedCount, 0);
});

// ---------------------------------------------------------------------------
// Adaptive ARC architecture task (unified PD/ARC Goal), Phase 1: the
// 4-stage Personal Development mastery program.
// ---------------------------------------------------------------------------

// --- normalizePersonalDevelopmentRouteProgress ---

test("normalize backfills every field on a record saved before the 4-stage program existed", () => {
  const legacy = { ...emptyProgress() } as Partial<PersonalDevelopmentRouteProgress>;
  delete legacy.stage;
  delete legacy.stage1ConfirmedCount;
  delete legacy.stage2ConfirmedCount;
  delete legacy.stage3ConfirmedCount;
  delete legacy.stage4ConfirmedCount;
  const normalized = normalizePersonalDevelopmentRouteProgress(legacy as PersonalDevelopmentRouteProgress);
  assert.equal(normalized.stage, 1);
  assert.equal(normalized.stage1ConfirmedCount, 0);
  assert.equal(normalized.stage2ConfirmedCount, 0);
  assert.equal(normalized.stage3ConfirmedCount, 0);
  assert.equal(normalized.stage4ConfirmedCount, 0);
});

test("normalize preserves an already-valid stage and its counters untouched", () => {
  const progress: PersonalDevelopmentRouteProgress = { ...emptyProgress(), stage: 3, stage1ConfirmedCount: 10, stage2ConfirmedCount: 10, stage3ConfirmedCount: 4 };
  const normalized = normalizePersonalDevelopmentRouteProgress(progress);
  assert.equal(normalized.stage, 3);
  assert.equal(normalized.stage1ConfirmedCount, 10);
  assert.equal(normalized.stage2ConfirmedCount, 10);
  assert.equal(normalized.stage3ConfirmedCount, 4);
});

test("normalize resets a corrupt/out-of-range stage value to 1 rather than trusting it", () => {
  const progress = { ...emptyProgress(), stage: 7 } as unknown as PersonalDevelopmentRouteProgress;
  assert.equal(normalizePersonalDevelopmentRouteProgress(progress).stage, 1);
});

test("isValidRouteStageProjection accepts only 1|2|3|4", () => {
  assert.equal(isValidRouteStageProjection(1), true);
  assert.equal(isValidRouteStageProjection(4), true);
  assert.equal(isValidRouteStageProjection(0), false);
  assert.equal(isValidRouteStageProjection(5), false);
  assert.equal(isValidRouteStageProjection("1"), false);
  assert.equal(isValidRouteStageProjection(null), false);
});

// --- isRequiredActionOutcomeValidForMode ---

test("Stage 1/2 accept any action outcome, including null/disabled/skipped", () => {
  const outcomes: (BeneficialActionOutcome | null)[] = [null, "disabled", "optional_skipped", "optional_completed", "required_completed", "unavailable_legacy"];
  for (const outcome of outcomes) {
    assert.equal(isRequiredActionOutcomeValidForMode(1, outcome), true);
    assert.equal(isRequiredActionOutcomeValidForMode(2, outcome), true);
  }
});

test("Stage 3/4 require exactly required_completed -- every other outcome, including null, is rejected", () => {
  const rejected: (BeneficialActionOutcome | null)[] = [null, "disabled", "optional_skipped", "optional_completed", "unavailable_legacy"];
  for (const outcome of rejected) {
    assert.equal(isRequiredActionOutcomeValidForMode(3, outcome), false);
    assert.equal(isRequiredActionOutcomeValidForMode(4, outcome), false);
  }
  assert.equal(isRequiredActionOutcomeValidForMode(3, "required_completed"), true);
  assert.equal(isRequiredActionOutcomeValidForMode(4, "required_completed"), true);
});

// --- resolveEligibleStageAdvancement ---

test("stage advances exactly at the 10-completion threshold, never before", () => {
  const nine: PersonalDevelopmentRouteProgress = { ...emptyProgress(), stage: 1, stage1ConfirmedCount: 9 };
  assert.equal(resolveEligibleStageAdvancement(nine, "required"), 1);
  const ten: PersonalDevelopmentRouteProgress = { ...emptyProgress(), stage: 1, stage1ConfirmedCount: 10 };
  assert.equal(resolveEligibleStageAdvancement(ten, "required"), 2);
});

test("the same uniform threshold applies at every transition -- 1->2, 2->3, 3->4", () => {
  const at2: PersonalDevelopmentRouteProgress = { ...emptyProgress(), stage: 2, stage2ConfirmedCount: 10 };
  assert.equal(resolveEligibleStageAdvancement(at2, "required"), 3);
  const at3: PersonalDevelopmentRouteProgress = { ...emptyProgress(), stage: 3, stage3ConfirmedCount: 10 };
  assert.equal(resolveEligibleStageAdvancement(at3, "required"), 4);
});

test("beneficialActionPolicy 'none' caps eligibility at Stage 2, however high stage2ConfirmedCount climbs", () => {
  const at2: PersonalDevelopmentRouteProgress = { ...emptyProgress(), stage: 2, stage2ConfirmedCount: 50 };
  assert.equal(resolveEligibleStageAdvancement(at2, "none"), 2);
});

test("beneficialActionPolicy 'optional_in_live' permits the full 1-4 ladder like 'required'", () => {
  const at3: PersonalDevelopmentRouteProgress = { ...emptyProgress(), stage: 3, stage3ConfirmedCount: 10 };
  assert.equal(resolveEligibleStageAdvancement(at3, "optional_in_live"), 4);
});

test("resolveEligibleStageAdvancement is a pure read -- never mutates its input", () => {
  const progress: PersonalDevelopmentRouteProgress = { ...emptyProgress(), stage: 1, stage1ConfirmedCount: 10 };
  const snapshot = JSON.parse(JSON.stringify(progress));
  resolveEligibleStageAdvancement(progress, "required");
  assert.deepEqual(progress, snapshot);
});

// --- resolvePolicyDemotion ---

test("policy moving to 'none' while at Stage 3/4 demotes to Stage 2", () => {
  assert.equal(resolvePolicyDemotion(3, "none"), 2);
  assert.equal(resolvePolicyDemotion(4, "none"), 2);
});

test("policy moving to 'none' while already at Stage 1/2 is a no-op", () => {
  assert.equal(resolvePolicyDemotion(1, "none"), 1);
  assert.equal(resolvePolicyDemotion(2, "none"), 2);
});

test("a non-'none' policy never demotes, whatever the current stage", () => {
  assert.equal(resolvePolicyDemotion(4, "required"), 4);
  assert.equal(resolvePolicyDemotion(3, "optional_in_live"), 3);
});

// --- reconcileRouteStageForPolicyChange ---

test("reconcile demotes Stage 4 -> Stage 2 on 'none', preserving stage3/4ConfirmedCount untouched", () => {
  const progress: PersonalDevelopmentRouteProgress = { ...emptyProgress(), stage: 4, stage1ConfirmedCount: 10, stage2ConfirmedCount: 10, stage3ConfirmedCount: 10, stage4ConfirmedCount: 6 };
  const reconciled = reconcileRouteStageForPolicyChange(progress, "none", LATER);
  assert.equal(reconciled.stage, 2);
  assert.equal(reconciled.stage3ConfirmedCount, 10, "history preserved, never reset");
  assert.equal(reconciled.stage4ConfirmedCount, 6, "history preserved, never reset");
  assert.equal(reconciled.updatedAt, LATER);
});

test("reconcile automatically restores a route's stage when policy is restored, from preserved history alone -- zero replay of old sessions", () => {
  const demoted: PersonalDevelopmentRouteProgress = { ...emptyProgress(), stage: 2, stage1ConfirmedCount: 10, stage2ConfirmedCount: 10, stage3ConfirmedCount: 10, stage4ConfirmedCount: 0 };
  const restored = reconcileRouteStageForPolicyChange(demoted, "required", LATER);
  assert.equal(restored.stage, 4, "stage2 and stage3 counts already justify jumping straight to Stage 4");
  assert.equal(restored.stage3ConfirmedCount, 10, "no counter was touched by restoration");
});

test("reconcile is a no-op (same object identity) when the current stage already matches what the policy justifies", () => {
  const progress: PersonalDevelopmentRouteProgress = { ...emptyProgress(), stage: 1 };
  const reconciled = reconcileRouteStageForPolicyChange(progress, "required", LATER);
  assert.equal(reconciled, progress);
});

// --- applyStageProgressionToRouteProgress ---

test("a session's own frozen stageAtStart increments that stage's counter, never the route's current stage", () => {
  const progress: PersonalDevelopmentRouteProgress = { ...emptyProgress(), stage: 2 };
  const result = applyStageProgressionToRouteProgress(progress, 1, null, "required", LATER);
  assert.equal(result.progress.stage1ConfirmedCount, 1, "counts toward the stage actually practiced (1), not the route's current stage (2)");
  assert.equal(result.progress.stage2ConfirmedCount, 0);
});

test("Stage 1/2 sessions count toward advancement regardless of action outcome", () => {
  const progress: PersonalDevelopmentRouteProgress = { ...emptyProgress(), stage: 1, stage1ConfirmedCount: 9 };
  const result = applyStageProgressionToRouteProgress(progress, 1, "optional_skipped", "optional_in_live", LATER);
  assert.equal(result.progress.stage1ConfirmedCount, 10);
  assert.equal(result.stageAdvanced, true);
  assert.equal(result.progress.stage, 2);
});

test("Stage 3/4 sessions without required_completed never increment the counter or advance", () => {
  const progress: PersonalDevelopmentRouteProgress = { ...emptyProgress(), stage: 3, stage3ConfirmedCount: 9 };
  const result = applyStageProgressionToRouteProgress(progress, 3, "unavailable_legacy", "required", LATER);
  assert.equal(result.progress.stage3ConfirmedCount, 9, "never incremented -- action outcome invalid for this stage");
  assert.equal(result.stageAdvanced, false);
  assert.deepEqual(result.progress, progress);
});

test("Stage 3 session with required_completed increments and can advance to Stage 4 at threshold", () => {
  const progress: PersonalDevelopmentRouteProgress = { ...emptyProgress(), stage: 3, stage3ConfirmedCount: 9 };
  const result = applyStageProgressionToRouteProgress(progress, 3, "required_completed", "required", LATER);
  assert.equal(result.progress.stage3ConfirmedCount, 10);
  assert.equal(result.stageAdvanced, true);
  assert.equal(result.progress.stage, 4);
});

test("a route capped by 'none' never advances past Stage 2 via applyStageProgressionToRouteProgress", () => {
  const progress: PersonalDevelopmentRouteProgress = { ...emptyProgress(), stage: 2, stage2ConfirmedCount: 9 };
  const result = applyStageProgressionToRouteProgress(progress, 2, null, "none", LATER);
  assert.equal(result.progress.stage2ConfirmedCount, 10);
  assert.equal(result.stageAdvanced, false);
  assert.equal(result.progress.stage, 2, "capped -- Stage 3 requires a real Beneficial Action this policy doesn't have");
});

test("applyStageProgressionToRouteProgress never mutates its input progress object", () => {
  const progress: PersonalDevelopmentRouteProgress = { ...emptyProgress(), stage: 1, stage1ConfirmedCount: 9 };
  const snapshot = JSON.parse(JSON.stringify(progress));
  applyStageProgressionToRouteProgress(progress, 1, null, "required", LATER);
  assert.deepEqual(progress, snapshot);
});

test("stage never regresses purely from applyStageProgressionToRouteProgress even if stageAtStart is behind the route's current stage", () => {
  // A session frozen at Stage 1 (stageAtStart) completing after the route has already
  // moved on to Stage 2 must never pull the route's own current stage backward.
  const progress: PersonalDevelopmentRouteProgress = { ...emptyProgress(), stage: 2, stage1ConfirmedCount: 5 };
  const result = applyStageProgressionToRouteProgress(progress, 1, null, "required", LATER);
  assert.equal(result.progress.stage, 2, "route stage never regresses");
});

// --- stage type export sanity ---

test("PersonalDevelopmentRouteStage values are exactly 1|2|3|4", () => {
  const stages: PersonalDevelopmentRouteStage[] = [1, 2, 3, 4];
  for (const stage of stages) assert.equal(isValidRouteStageProjection(stage), true);
});
