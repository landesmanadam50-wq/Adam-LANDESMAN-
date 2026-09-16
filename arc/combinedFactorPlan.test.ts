import test from "node:test";
import assert from "node:assert/strict";

import { MINI_PRIMARY_FACTOR_QUESTION, STATE_DECISION_QUESTION, resolveCombinedActionKinds, resolveCombinedFactorPlan } from "./combinedFactorPlan.ts";
import type { CombinedFactorPlanInput, ResolvedCombinedFactorPlan } from "./combinedFactorPlan.ts";
import { BASELINE_TIE_QUESTION } from "./factorRating.ts";
import { createEmptyPersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import type { PersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import { createEmptyBeliefInterferenceItem, createEmptyEmotionInterferenceItem, createEmptyThoughtInterferenceItem, createEmptyUrgeInterferenceItem } from "./interferenceItem.ts";
import type { BeliefInterferenceItem, EmotionInterferenceItem, InterferenceItem, ThoughtInterferenceItem, UrgeInterferenceItem } from "./interferenceItem.ts";
import { createEmptyStateProfile } from "./stateProfile.ts";
import type { StateProfile } from "./stateProfile.ts";
import { createEmptyPresenceArc } from "./types.ts";
import type { PresenceArc } from "./types.ts";
import { disableLibraryItem } from "./libraryItemStatus.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function config(overrides: Partial<PersonalDevelopmentRouteConfig> = {}): PersonalDevelopmentRouteConfig {
  return { ...createEmptyPersonalDevelopmentRouteConfig("route1", "prog1", NOW), ...overrides };
}

function thought(overrides: Partial<ThoughtInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyThoughtInterferenceItem("t1", "מחשבה", null, NOW), schemaVersion: 2, beneficialActionAgainstFactor: "לנשום עמוק", ...overrides };
}
function belief(overrides: Partial<BeliefInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyBeliefInterferenceItem("b1", "אמונה", null, NOW), schemaVersion: 2, beneficialActionAgainstFactor: "לצעוד", ...overrides };
}
function urge(overrides: Partial<UrgeInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyUrgeInterferenceItem("u1", "דחף", null, NOW), schemaVersion: 2, beneficialActionAgainstFactor: "לעצור", ...overrides };
}
function emotion(overrides: Partial<EmotionInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyEmotionInterferenceItem("e1", "רגש", null, NOW), ...overrides };
}
function completeState(overrides: Partial<StateProfile> = {}): StateProfile {
  return { ...createEmptyStateProfile("s1", "מצב", null, NOW), regulationAnchor: "עוגן", encodingCue: "קידוד", action: "פעולת המצב", ...overrides };
}
function readyPresence(overrides: Partial<PresenceArc> = {}): PresenceArc {
  return { ...createEmptyPresenceArc("p1", "נוכחות", NOW), beneficialAction: "פעולת נוכחות", ...overrides };
}

function baseInput(overrides: Partial<CombinedFactorPlanInput> = {}): CombinedFactorPlanInput {
  return {
    mode: "full",
    config: config(),
    items: [],
    stateProfiles: [],
    presenceArcs: [],
    primaryFactorId: null,
    stateDecisionAnswer: null,
    ...overrides,
  };
}

function resolvedPlan(result: ReturnType<typeof resolveCombinedFactorPlan>): ResolvedCombinedFactorPlan {
  assert.equal(result.kind, "resolved");
  if (result.kind !== "resolved") throw new Error("expected resolved");
  return result.plan;
}

// --- Structural invalidity passthrough ---

test("an empty route (no factors, no Presence) is invalid", () => {
  const result = resolveCombinedFactorPlan(baseInput());
  assert.deepEqual(result, { kind: "invalid", reason: "no_factors_configured" });
});

test("a stale configured item id is invalid", () => {
  const c = config({ interferenceItemIds: ["ghost"], itemRelationships: { ghost: { actionRelationship: "legacy_unspecified" } } });
  const result = resolveCombinedFactorPlan(baseInput({ config: c }));
  assert.equal(result.kind, "invalid");
});

test("a disabled configured item is invalid", () => {
  const item = disableLibraryItem(thought(), NOW);
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  const result = resolveCombinedFactorPlan(baseInput({ config: c, items: [item] }));
  assert.deepEqual(result, { kind: "invalid", reason: "configured_item_disabled" });
});

test("a v2 item missing its own action is invalid, independent of State", () => {
  const item = thought({ beneficialActionAgainstFactor: null });
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  const result = resolveCombinedFactorPlan(baseInput({ config: c, items: [item] }));
  assert.deepEqual(result, { kind: "invalid", reason: "incomplete_v2_factor_action" });
});

// --- No-State single-factor route resolves directly ---

test("a complete no-State single-factor route resolves directly (auto primary, no state decision)", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  const result = resolveCombinedFactorPlan(baseInput({ config: c, items: [thought()] }));
  const plan = resolvedPlan(result);
  assert.equal(plan.primaryFactorId, "t1");
  assert.equal(plan.stateIncluded, false);
  assert.equal(plan.resolvedStateAction, null);
  assert.equal(plan.factors[0].actionOutcome.kind, "factor_only");
});

// --- Primary-factor staged resolution ---

test("multiple factors with no primaryFactorId input returns needs_primary_factor -- Full uses the baseline tie question", () => {
  const c = config({
    interferenceItemIds: ["t1", "u1"],
    itemRelationships: { t1: { actionRelationship: "legacy_unspecified" }, u1: { actionRelationship: "legacy_unspecified" } },
    stateInclusionPolicy: "none",
  });
  const result = resolveCombinedFactorPlan(baseInput({ mode: "full", config: c, items: [thought(), urge()] }));
  assert.equal(result.kind, "needs_primary_factor");
  if (result.kind === "needs_primary_factor") {
    assert.deepEqual(result.candidates.sort(), ["t1", "u1"]);
    assert.equal(result.question, BASELINE_TIE_QUESTION);
  }
});

test("multiple factors, Mini mode, no primaryFactorId input -- uses the Mini-specific direct-choice question", () => {
  const c = config({
    interferenceItemIds: ["t1", "u1"],
    itemRelationships: { t1: { actionRelationship: "legacy_unspecified" }, u1: { actionRelationship: "legacy_unspecified" } },
    stateInclusionPolicy: "none",
  });
  const result = resolveCombinedFactorPlan(baseInput({ mode: "mini", config: c, items: [thought(), urge()] }));
  assert.equal(result.kind, "needs_primary_factor");
  if (result.kind === "needs_primary_factor") assert.equal(result.question, MINI_PRIMARY_FACTOR_QUESTION);
});

test("unresolved primary factor never emits factor-action steps -- resolveCombinedActionKinds is only reachable via a resolved plan", () => {
  const c = config({
    interferenceItemIds: ["t1", "u1"],
    itemRelationships: { t1: { actionRelationship: "legacy_unspecified" }, u1: { actionRelationship: "legacy_unspecified" } },
    stateInclusionPolicy: "none",
  });
  const result = resolveCombinedFactorPlan(baseInput({ config: c, items: [thought(), urge()] }));
  assert.equal(result.kind, "needs_primary_factor");
  assert.equal("plan" in result, false, "no ResolvedCombinedFactorPlan -- and therefore no action step -- exists on this result at all");
});

test("supplying a resolved primaryFactorId resolves the plan directly, and it is never later replaced", () => {
  const c = config({
    interferenceItemIds: ["t1", "u1"],
    itemRelationships: { t1: { actionRelationship: "legacy_unspecified" }, u1: { actionRelationship: "legacy_unspecified" } },
    stateInclusionPolicy: "none",
  });
  const result = resolveCombinedFactorPlan(baseInput({ config: c, items: [thought(), urge()], primaryFactorId: "u1" }));
  const plan = resolvedPlan(result);
  assert.equal(plan.primaryFactorId, "u1", "frozen exactly as supplied, never recomputed from anything else");
});

// --- decide_in_live staged resolution ---

test("decide_in_live with no answer yet returns needs_state_decision with the exact required question and the one configured candidate", () => {
  const c = config({
    interferenceItemIds: ["t1"],
    itemRelationships: { t1: { actionRelationship: "same_action" } },
    stateInclusionPolicy: "decide_in_live",
    stateProfileId: "s1",
  });
  const result = resolveCombinedFactorPlan(baseInput({ config: c, items: [thought()], stateProfiles: [completeState()] }));
  assert.equal(result.kind, "needs_state_decision");
  if (result.kind === "needs_state_decision") {
    assert.equal(result.candidateStateProfileId, "s1");
    assert.equal(result.question, STATE_DECISION_QUESTION);
  }
});

test("unresolved decide_in_live never emits State steps -- no ResolvedCombinedFactorPlan (and therefore no stateIncluded/resolvedStateAction) exists on this result", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "decide_in_live", stateProfileId: "s1" });
  const result = resolveCombinedFactorPlan(baseInput({ config: c, items: [thought()], stateProfiles: [completeState()] }));
  assert.equal(result.kind, "needs_state_decision");
  assert.equal("plan" in result, false);
});

test("decide_in_live Yes resolves to the one configured candidate State, included", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "decide_in_live", stateProfileId: "s1" });
  const result = resolveCombinedFactorPlan(baseInput({ config: c, items: [thought()], stateProfiles: [completeState()], stateDecisionAnswer: true }));
  const plan = resolvedPlan(result);
  assert.equal(plan.stateIncluded, true);
  assert.equal(plan.resolvedStateAction, "פעולת המצב");
});

test("decide_in_live No resolves to no State", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "decide_in_live", stateProfileId: "s1" });
  const result = resolveCombinedFactorPlan(baseInput({ config: c, items: [thought()], stateProfiles: [completeState()], stateDecisionAnswer: false }));
  const plan = resolvedPlan(result);
  assert.equal(plan.stateIncluded, false);
  assert.equal(plan.resolvedStateAction, null);
});

test("decide_in_live Yes vs No produce genuinely different, correctly resolved plans from the same config", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "different_actions" } }, stateInclusionPolicy: "decide_in_live", stateProfileId: "s1" });
  const yes = resolvedPlan(resolveCombinedFactorPlan(baseInput({ config: c, items: [thought()], stateProfiles: [completeState()], stateDecisionAnswer: true })));
  const no = resolvedPlan(resolveCombinedFactorPlan(baseInput({ config: c, items: [thought()], stateProfiles: [completeState()], stateDecisionAnswer: false })));
  assert.notEqual(yes.stateIncluded, no.stateIncluded);
  assert.notEqual(yes.factors[0].actionOutcome.kind, no.factors[0].actionOutcome.kind);
});

test("decide_in_live with an incomplete candidate State is invalid once Yes is answered", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "decide_in_live", stateProfileId: "s1" });
  const incomplete = createEmptyStateProfile("s1", "מצב", null, NOW);
  const result = resolveCombinedFactorPlan(baseInput({ config: c, items: [thought()], stateProfiles: [incomplete], stateDecisionAnswer: true }));
  assert.deepEqual(result, { kind: "invalid", reason: "decide_in_live_candidate_incomplete" });
});

// --- Emotion ---

test("Emotion can never resolve to no-State -- structurally rejected before a state decision is even reachable", () => {
  const c = config({ interferenceItemIds: ["e1"], itemRelationships: { e1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  const result = resolveCombinedFactorPlan(baseInput({ config: c, items: [emotion()] }));
  assert.equal(result.kind, "invalid");
});

test("Emotion with a complete linked State resolves to state_only", () => {
  const c = config({ interferenceItemIds: ["e1"], itemRelationships: { e1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const plan = resolvedPlan(resolveCombinedFactorPlan(baseInput({ config: c, items: [emotion()], stateProfiles: [completeState()] })));
  assert.equal(plan.factors[0].actionOutcome.kind, "state_only");
});

// --- linked State ---

test("linked with an incomplete State is invalid", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const result = resolveCombinedFactorPlan(baseInput({ config: c, items: [thought()], stateProfiles: [createEmptyStateProfile("s1", "מצב", null, NOW)] }));
  assert.deepEqual(result, { kind: "invalid", reason: "linked_state_incomplete" });
});

// --- explicit action relationship requirement ---

test("State included and the factor's own action resolvable -- legacy_unspecified relationship is invalid", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const result = resolveCombinedFactorPlan(baseInput({ config: c, items: [thought()], stateProfiles: [completeState()] }));
  assert.deepEqual(result, { kind: "invalid", reason: "missing_action_relationship" });
});

// --- Presence ---

test("Presence without a beneficial action is invalid", () => {
  const c = config({ presenceEnabled: true, linkedPresenceArcId: "p1", stateInclusionPolicy: "none" });
  const result = resolveCombinedFactorPlan(baseInput({ config: c, presenceArcs: [readyPresence({ beneficialAction: null })] }));
  assert.deepEqual(result, { kind: "invalid", reason: "presence_enabled_without_valid_action" });
});

test("Presence-only route (no factors) resolves with primaryFactorId null and Presence as the action source", () => {
  const c = config({ presenceEnabled: true, linkedPresenceArcId: "p1", stateInclusionPolicy: "none" });
  const plan = resolvedPlan(resolveCombinedFactorPlan(baseInput({ config: c, presenceArcs: [readyPresence()] })));
  assert.equal(plan.primaryFactorId, null);
  assert.equal(plan.presence?.actionOutcome.kind, "factor_only");
  assert.deepEqual(resolveCombinedActionKinds(plan), ["factor_action"]);
});

// --- resolveCombinedActionKinds ---

test("resolveCombinedActionKinds: state_only -> [state_action]; factor_only/shared_explicit/legacy_shared_state_fallback -> [factor_action]; state_then_factor -> both, State first", () => {
  const c1 = config({ interferenceItemIds: ["e1"], itemRelationships: { e1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const plan1 = resolvedPlan(resolveCombinedFactorPlan(baseInput({ config: c1, items: [emotion()], stateProfiles: [completeState()] })));
  assert.deepEqual(resolveCombinedActionKinds(plan1), ["state_action"]);

  const c2 = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "different_actions" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const plan2 = resolvedPlan(resolveCombinedFactorPlan(baseInput({ config: c2, items: [thought()], stateProfiles: [completeState()] })));
  assert.deepEqual(resolveCombinedActionKinds(plan2), ["state_action", "factor_action"]);

  const c3 = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const plan3 = resolvedPlan(resolveCombinedFactorPlan(baseInput({ config: c3, items: [thought()], stateProfiles: [completeState()] })));
  assert.deepEqual(resolveCombinedActionKinds(plan3), ["factor_action"], "one action only for shared_explicit");
});

// --- Secondary-factor actions remain stored but never auto-emitted ---

test("secondary-factor action outcomes remain stored on the resolved plan but never appear in resolveCombinedActionKinds", () => {
  const c = config({
    interferenceItemIds: ["t1", "u1"],
    itemRelationships: { t1: { actionRelationship: "legacy_unspecified" }, u1: { actionRelationship: "legacy_unspecified" } },
    stateInclusionPolicy: "none",
  });
  const plan = resolvedPlan(resolveCombinedFactorPlan(baseInput({ config: c, items: [thought(), urge()], primaryFactorId: "u1" })));
  assert.equal(plan.factors.length, 2, "both factors' own outcomes remain stored");
  assert.equal(plan.factors.find((f) => f.itemId === "t1")?.actionOutcome.kind, "factor_only");
  assert.deepEqual(resolveCombinedActionKinds(plan), ["factor_action"], "only the primary (u1) contributes an action step");
});
