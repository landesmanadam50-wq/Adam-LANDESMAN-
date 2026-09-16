import test from "node:test";
import assert from "node:assert/strict";

import { resolveEmotionActionOutcome, resolveFactorActionOutcome, resolvePresenceActionOutcome } from "./factorAction.ts";
import type { ActionRelationship } from "./factorAction.ts";
import { createEmptyThoughtInterferenceItem } from "./interferenceItem.ts";
import type { ThoughtInterferenceItem } from "./interferenceItem.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function thoughtV2(overrides: Partial<ThoughtInterferenceItem> = {}): ThoughtInterferenceItem {
  return { ...createEmptyThoughtInterferenceItem("t1", "מחשבה", null, NOW), schemaVersion: 2, ...overrides };
}
function thoughtV1(overrides: Partial<ThoughtInterferenceItem> = {}): ThoughtInterferenceItem {
  return { ...createEmptyThoughtInterferenceItem("t1", "מחשבה", null, NOW), schemaVersion: 1, ...overrides };
}

const UNSPECIFIED: ActionRelationship = "legacy_unspecified";
const SAME: ActionRelationship = "same_action";
const DIFFERENT: ActionRelationship = "different_actions";

// --- schemaVersion 2 (new action model) ---

test("v2 item with its own action and no State resolves factor_only", () => {
  const outcome = resolveFactorActionOutcome(thoughtV2({ beneficialActionAgainstFactor: "לנשום עמוק" }), UNSPECIFIED, null);
  assert.deepEqual(outcome, { kind: "factor_only", action: "לנשום עמוק" });
});

test("v2 item with its own action and State, relationship same_action, resolves shared_explicit", () => {
  const outcome = resolveFactorActionOutcome(thoughtV2({ beneficialActionAgainstFactor: "לנשום עמוק" }), SAME, "לנשום עמוק");
  assert.deepEqual(outcome, { kind: "shared_explicit", action: "לנשום עמוק" });
});

test("v2 item with its own action and State, relationship different_actions, resolves state_then_factor", () => {
  const outcome = resolveFactorActionOutcome(thoughtV2({ beneficialActionAgainstFactor: "לנשום עמוק" }), DIFFERENT, "ללכת לטייל");
  assert.deepEqual(outcome, { kind: "state_then_factor", stateAction: "ללכת לטייל", factorAction: "לנשום עמוק" });
});

test("v2 item with a missing action is unavailable, even when a State action IS resolvable -- never eligible for the legacy fallback", () => {
  const outcome = resolveFactorActionOutcome(thoughtV2({ beneficialActionAgainstFactor: null }), UNSPECIFIED, "ללכת לטייל");
  assert.deepEqual(outcome, { kind: "unavailable" });
});

test("v2 item with a whitespace-only action is treated as missing", () => {
  const outcome = resolveFactorActionOutcome(thoughtV2({ beneficialActionAgainstFactor: "   " }), UNSPECIFIED, null);
  assert.deepEqual(outcome, { kind: "unavailable" });
});

// --- schemaVersion 1 (legacy) ---

test("v1 item with its own action behaves exactly like a v2 item with an action (factor_only)", () => {
  const outcome = resolveFactorActionOutcome(thoughtV1({ beneficialActionAgainstFactor: "לנשום עמוק" }), UNSPECIFIED, null);
  assert.deepEqual(outcome, { kind: "factor_only", action: "לנשום עמוק" });
});

test("v1 item with no factor action but a resolvable State action falls back once (legacy_shared_state_fallback)", () => {
  const outcome = resolveFactorActionOutcome(thoughtV1({ beneficialActionAgainstFactor: null }), UNSPECIFIED, "ללכת לטייל");
  assert.deepEqual(outcome, { kind: "legacy_shared_state_fallback", action: "ללכת לטייל" });
});

test("v1 item with neither a factor action nor a State action is unavailable, never fabricated", () => {
  const outcome = resolveFactorActionOutcome(thoughtV1({ beneficialActionAgainstFactor: null }), UNSPECIFIED, null);
  assert.deepEqual(outcome, { kind: "unavailable" });
});

// --- Emotion ---

test("resolveEmotionActionOutcome resolves state_only when a State action is resolvable", () => {
  assert.deepEqual(resolveEmotionActionOutcome("ללכת לטייל"), { kind: "state_only", action: "ללכת לטייל" });
});

test("resolveEmotionActionOutcome is unavailable with no resolvable State action, never fabricated", () => {
  assert.deepEqual(resolveEmotionActionOutcome(null), { kind: "unavailable" });
});

// --- Presence ---

test("resolvePresenceActionOutcome: no beneficialAction at all is unavailable", () => {
  assert.deepEqual(resolvePresenceActionOutcome(null, null, "ללכת לטייל"), { kind: "unavailable" });
});

test("resolvePresenceActionOutcome: Presence's own action with no State is factor_only", () => {
  assert.deepEqual(resolvePresenceActionOutcome("לנשום עמוק", null, null), { kind: "factor_only", action: "לנשום עמוק" });
});

test("resolvePresenceActionOutcome: same_action deduplicates to shared_explicit -- never removes anything else, this function resolves the action step only", () => {
  assert.deepEqual(resolvePresenceActionOutcome("לנשום עמוק", "same_action", "לנשום עמוק"), { kind: "shared_explicit", action: "לנשום עמוק" });
});

test("resolvePresenceActionOutcome: different_actions resolves state_then_factor (State action, then Presence's own beneficial action)", () => {
  assert.deepEqual(resolvePresenceActionOutcome("לנשום עמוק", "different_actions", "ללכת לטייל"), { kind: "state_then_factor", stateAction: "ללכת לטייל", factorAction: "לנשום עמוק" });
});
