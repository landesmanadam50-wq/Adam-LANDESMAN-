import test from "node:test";
import assert from "node:assert/strict";

import {
  applyArcGoalSessionCompletionToProgress,
  createEmptyArcGoalSessionProgress,
  normalizeArcGoalSessionProgress,
  validateArcGoalSharedFactsForCompletion,
} from "./arcGoalSessionProgress.ts";
import type { ArcGoalSessionProgress } from "./arcGoalSessionProgress.ts";
import type { ArcGoalSharedFacts } from "./sharedLiveSessionFacts.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-02T00:00:00.000Z";

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

function emptyProgress(arcGoalId = "goal-1"): ArcGoalSessionProgress {
  return createEmptyArcGoalSessionProgress(arcGoalId, NOW);
}

// --- createEmptyArcGoalSessionProgress ---

test("createEmptyArcGoalSessionProgress defaults every counter to zero", () => {
  const empty = createEmptyArcGoalSessionProgress("goal-x", NOW);
  assert.equal(empty.arcGoalId, "goal-x");
  assert.equal(empty.completedSessions, 0);
  assert.deepEqual(empty.completedByMappingKind, { interfering: 0, urge: 0, thought: 0, belief: 0, identityOnly: 0 });
  assert.equal(empty.completedFromWeeklyAction, 0);
  assert.deepEqual(empty.countedSessionIds, []);
  assert.equal(empty.schemaVersion, 1);
});

// --- normalizeArcGoalSessionProgress ---

test("normalize backfills every field on a record missing the new shape entirely", () => {
  const legacy = { arcGoalId: "goal-1", createdAt: NOW, updatedAt: NOW } as unknown as ArcGoalSessionProgress;
  const normalized = normalizeArcGoalSessionProgress(legacy);
  assert.equal(normalized.completedSessions, 0);
  assert.deepEqual(normalized.completedByMappingKind, { interfering: 0, urge: 0, thought: 0, belief: 0, identityOnly: 0 });
  assert.equal(normalized.completedFromWeeklyAction, 0);
  assert.deepEqual(normalized.countedSessionIds, []);
  assert.equal(normalized.schemaVersion, 1);
});

test("normalize preserves an already-valid record's counters untouched", () => {
  const progress: ArcGoalSessionProgress = {
    ...emptyProgress(),
    completedSessions: 3,
    completedByMappingKind: { interfering: 2, urge: 1, thought: 0, belief: 0, identityOnly: 0 },
    completedFromWeeklyAction: 1,
    countedSessionIds: ["s1", "s2", "s3"],
  };
  const normalized = normalizeArcGoalSessionProgress(progress);
  assert.equal(normalized.completedSessions, 3);
  assert.deepEqual(normalized.completedByMappingKind, { interfering: 2, urge: 1, thought: 0, belief: 0, identityOnly: 0 });
  assert.equal(normalized.completedFromWeeklyAction, 1);
  assert.deepEqual(normalized.countedSessionIds, ["s1", "s2", "s3"]);
});

// --- validateArcGoalSharedFactsForCompletion ---

test("valid terminal, identity-confirmed facts validate", () => {
  assert.deepEqual(validateArcGoalSharedFactsForCompletion(facts()), { valid: true });
});

test("nonterminal facts rejected regardless of other flags", () => {
  const f = facts({ terminalCompleted: false, identityActionCompleted: true, outerRunCompleted: true });
  assert.deepEqual(validateArcGoalSharedFactsForCompletion(f), { valid: false, reason: "not_terminal" });
});

test("outerRunCompleted true but identityActionCompleted false is rejected -- reaching 'complete' alone never earns credit", () => {
  const f = facts({ outerRunCompleted: true, identityActionCompleted: false, terminalCompleted: true });
  assert.deepEqual(validateArcGoalSharedFactsForCompletion(f), { valid: false, reason: "identity_action_not_completed" });
});

test("blank sessionId/arcGoalId rejected", () => {
  assert.deepEqual(validateArcGoalSharedFactsForCompletion(facts({ sessionId: "" })), { valid: false, reason: "missing_session_id" });
  assert.deepEqual(validateArcGoalSharedFactsForCompletion(facts({ arcGoalId: "   " })), { valid: false, reason: "missing_arc_goal_id" });
});

test("an identity-only pass (mappingKind/mappingId null) still validates -- a bridge is never required", () => {
  const f = facts({ mappingKind: null, mappingId: null, executionMode: null, actionRelationship: null });
  assert.deepEqual(validateArcGoalSharedFactsForCompletion(f), { valid: true });
});

// --- applyArcGoalSessionCompletionToProgress: single session ---

test("one completed session increments completedSessions exactly once", () => {
  const outcome = applyArcGoalSessionCompletionToProgress(emptyProgress(), facts(), LATER);
  assert.equal(outcome.kind, "applied");
  if (outcome.kind !== "applied") return;
  assert.equal(outcome.progress.completedSessions, 1);
  assert.equal(outcome.progress.updatedAt, LATER);
});

test("nonterminal facts produce invalid_completion and change nothing", () => {
  const progress = emptyProgress();
  const outcome = applyArcGoalSessionCompletionToProgress(progress, facts({ terminalCompleted: false }), LATER);
  assert.equal(outcome.kind, "invalid_completion");
  assert.deepEqual(progress, emptyProgress(), "input progress object never mutated");
});

test("mismatched arcGoalId between progress record and facts is rejected defensively", () => {
  const outcome = applyArcGoalSessionCompletionToProgress(emptyProgress("goal-A"), facts({ arcGoalId: "goal-B" }), LATER);
  assert.equal(outcome.kind, "invalid_completion");
});

// --- mapping-kind bucketing ---

test("an interfering-mapping session increments completedByMappingKind.interfering only", () => {
  const outcome = applyArcGoalSessionCompletionToProgress(emptyProgress(), facts({ mappingKind: "interfering" }), LATER);
  assert.equal(outcome.kind, "applied");
  if (outcome.kind !== "applied") return;
  assert.equal(outcome.progress.completedByMappingKind.interfering, 1);
  assert.equal(outcome.progress.completedByMappingKind.urge, 0);
  assert.equal(outcome.progress.completedByMappingKind.identityOnly, 0);
});

test("an urge-mapping session increments completedByMappingKind.urge only", () => {
  const outcome = applyArcGoalSessionCompletionToProgress(emptyProgress(), facts({ mappingKind: "urge", mappingId: "um1" }), LATER);
  assert.equal(outcome.kind, "applied");
  if (outcome.kind !== "applied") return;
  assert.equal(outcome.progress.completedByMappingKind.urge, 1);
  assert.equal(outcome.progress.completedByMappingKind.interfering, 0);
});

test("an identity-only session (mappingKind null) increments completedByMappingKind.identityOnly", () => {
  const f = facts({ mappingKind: null, mappingId: null, executionMode: null, actionRelationship: null });
  const outcome = applyArcGoalSessionCompletionToProgress(emptyProgress(), f, LATER);
  assert.equal(outcome.kind, "applied");
  if (outcome.kind !== "applied") return;
  assert.equal(outcome.progress.completedByMappingKind.identityOnly, 1);
  assert.equal(outcome.progress.completedByMappingKind.interfering, 0);
});

test("thought and belief mapping kinds bucket correctly (forward-compatible, not reachable from the live engine yet)", () => {
  const thoughtOutcome = applyArcGoalSessionCompletionToProgress(emptyProgress(), facts({ mappingKind: "thought", mappingId: "tm1" }), LATER);
  assert.equal(thoughtOutcome.kind, "applied");
  if (thoughtOutcome.kind === "applied") assert.equal(thoughtOutcome.progress.completedByMappingKind.thought, 1);

  const beliefOutcome = applyArcGoalSessionCompletionToProgress(emptyProgress(), facts({ mappingKind: "belief", mappingId: "bm1" }), LATER);
  assert.equal(beliefOutcome.kind, "applied");
  if (beliefOutcome.kind === "applied") assert.equal(beliefOutcome.progress.completedByMappingKind.belief, 1);
});

// --- weekly-action breakdown ---

test("weeklyActionId present increments completedFromWeeklyAction, never double-counting completedSessions", () => {
  const outcome = applyArcGoalSessionCompletionToProgress(emptyProgress(), facts({ weeklyActionId: "wa-1" }), LATER);
  assert.equal(outcome.kind, "applied");
  if (outcome.kind !== "applied") return;
  assert.equal(outcome.progress.completedSessions, 1);
  assert.equal(outcome.progress.completedFromWeeklyAction, 1);
});

test("weeklyActionId absent never increments completedFromWeeklyAction", () => {
  const outcome = applyArcGoalSessionCompletionToProgress(emptyProgress(), facts({ weeklyActionId: null }), LATER);
  assert.equal(outcome.kind, "applied");
  if (outcome.kind !== "applied") return;
  assert.equal(outcome.progress.completedFromWeeklyAction, 0);
});

// --- Idempotency ---

test("duplicate sessionId is a no-op -- returns duplicate_session and changes nothing", () => {
  const applied = applyArcGoalSessionCompletionToProgress(emptyProgress(), facts(), NOW);
  assert.equal(applied.kind, "applied");
  if (applied.kind !== "applied") return;

  const duplicate = applyArcGoalSessionCompletionToProgress(applied.progress, facts(), LATER);
  assert.equal(duplicate.kind, "duplicate_session");
  if (duplicate.kind !== "duplicate_session") return;
  assert.deepEqual(duplicate.progress, applied.progress, "no counters, no timestamps change on a duplicate");
});

// --- Immutability ---

test("applyArcGoalSessionCompletionToProgress never mutates its input progress object", () => {
  const progress = emptyProgress();
  const snapshot = JSON.parse(JSON.stringify(progress));
  applyArcGoalSessionCompletionToProgress(progress, facts(), LATER);
  assert.deepEqual(progress, snapshot);
});

// --- Multiple sessions accumulate correctly ---

test("two sessions with different mapping kinds accumulate independently", () => {
  const first = applyArcGoalSessionCompletionToProgress(emptyProgress(), facts({ sessionId: "s1", mappingKind: "interfering" }), NOW);
  assert.equal(first.kind, "applied");
  if (first.kind !== "applied") return;
  const second = applyArcGoalSessionCompletionToProgress(first.progress, facts({ sessionId: "s2", mappingKind: "urge", mappingId: "um1" }), LATER);
  assert.equal(second.kind, "applied");
  if (second.kind !== "applied") return;
  assert.equal(second.progress.completedSessions, 2);
  assert.equal(second.progress.completedByMappingKind.interfering, 1);
  assert.equal(second.progress.completedByMappingKind.urge, 1);
});
