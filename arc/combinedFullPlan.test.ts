import test from "node:test";
import assert from "node:assert/strict";

import { buildFullCombinedSteps } from "./combinedFullPlan.ts";
import type { FullCombinedStepKind } from "./combinedFullPlan.ts";
import { resolveCombinedFactorPlan } from "./combinedFactorPlan.ts";
import type { CombinedFactorPlanInput, ResolvedCombinedFactorPlan } from "./combinedFactorPlan.ts";
import { createEmptyPersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import type { PersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import { createEmptyBeliefInterferenceItem, createEmptyEmotionInterferenceItem, createEmptyThoughtInterferenceItem, createEmptyUrgeInterferenceItem } from "./interferenceItem.ts";
import type { BeliefInterferenceItem, EmotionInterferenceItem, InterferenceItem, ThoughtInterferenceItem, UrgeInterferenceItem } from "./interferenceItem.ts";
import { createEmptyStateProfile } from "./stateProfile.ts";
import type { StateProfile } from "./stateProfile.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function config(overrides: Partial<PersonalDevelopmentRouteConfig> = {}): PersonalDevelopmentRouteConfig {
  return { ...createEmptyPersonalDevelopmentRouteConfig("route1", "prog1", NOW), ...overrides };
}
function thought(overrides: Partial<ThoughtInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyThoughtInterferenceItem("t1", "מחשבה", null, NOW), schemaVersion: 2, beneficialActionAgainstFactor: "פעולת מחשבה", ...overrides };
}
function belief(overrides: Partial<BeliefInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyBeliefInterferenceItem("b1", "אמונה", null, NOW), schemaVersion: 2, beneficialActionAgainstFactor: "פעולת אמונה", ...overrides };
}
function urge(overrides: Partial<UrgeInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyUrgeInterferenceItem("u1", "דחף", null, NOW), schemaVersion: 2, beneficialActionAgainstFactor: "פעולת דחף", preventiveStoppingAction: "עצור", ...overrides };
}
function emotion(overrides: Partial<EmotionInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyEmotionInterferenceItem("e1", "רגש", null, NOW), ...overrides };
}
function completeState(overrides: Partial<StateProfile> = {}): StateProfile {
  return { ...createEmptyStateProfile("s1", "מצב", null, NOW), regulationAnchor: "עוגן", encodingCue: "קידוד", action: "פעולת המצב", ...overrides };
}

function resolve(input: Partial<CombinedFactorPlanInput>): ResolvedCombinedFactorPlan {
  const result = resolveCombinedFactorPlan({
    mode: "full",
    config: config(),
    items: [],
    stateProfiles: [],
    presenceArcs: [],
    primaryFactorId: null,
    stateDecisionAnswer: null,
    ...input,
  });
  assert.equal(result.kind, "resolved", `expected resolved, got ${result.kind}`);
  if (result.kind !== "resolved") throw new Error("not resolved");
  return result.plan;
}

function kinds(steps: { kind: FullCombinedStepKind }[]): FullCombinedStepKind[] {
  return steps.map((s) => s.kind);
}

// --- No-State Thought ---

test("Thought without State: no state_regulation_anchor/afterStateRegulation/state_desired_state_encoding/desired_state_rating/state_action", () => {
  const plan = resolve({ config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }), items: [thought()] });
  const steps = buildFullCombinedSteps(plan, "skipped");
  const k = kinds(steps);
  assert.equal(k.includes("state_regulation_anchor"), false);
  assert.equal(k.includes("state_desired_state_encoding"), false);
  assert.equal(k.includes("desired_state_rating"), false);
  assert.equal(k.includes("state_action"), false);
  assert.deepEqual(
    steps.filter((s) => s.kind === "rating_checkpoint").map((s) => s.checkpoint),
    ["afterAwareness", "afterStayAcceptance"],
    "no fabricated afterStateRegulation checkpoint"
  );
  assert.equal(k.includes("factor_action"), true, "primary factor action preserved");
});

// --- With-State Thought ---

test("Thought with State: Regulation, afterStateRegulation, Encoding, desired-state measurement, and resolved actions all present in the exact required boundary order", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "different_actions" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" }),
    items: [thought()],
    stateProfiles: [completeState()],
  });
  const steps = buildFullCombinedSteps(plan, "skipped");
  const k = kinds(steps);
  const regIdx = k.indexOf("state_regulation_anchor");
  const checkpointIdx = steps.findIndex((s) => s.kind === "rating_checkpoint" && s.checkpoint === "afterStateRegulation");
  const encIdx = k.indexOf("state_desired_state_encoding");
  const ratingIdx = k.indexOf("desired_state_rating");
  const stateActionIdx = k.indexOf("state_action");
  const factorActionIdx = k.indexOf("factor_action");

  assert.ok(regIdx >= 0 && checkpointIdx >= 0 && encIdx >= 0 && ratingIdx >= 0 && stateActionIdx >= 0 && factorActionIdx >= 0, "every required component present");
  assert.ok(regIdx < checkpointIdx, "Regulation before its own checkpoint");
  assert.ok(checkpointIdx < encIdx, "checkpoint before Encoding -- the required boundary");
  assert.ok(encIdx < ratingIdx, "desired-state rating right after Encoding");
  assert.ok(stateActionIdx < factorActionIdx, "State action first, factor action second");
});

// --- Urge without/with State ---

test("Urge without State preserves preventive stopping and its own visual/sensory intervention", () => {
  const plan = resolve({ config: config({ interferenceItemIds: ["u1"], itemRelationships: { u1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }), items: [urge()] });
  const steps = buildFullCombinedSteps(plan, "skipped");
  const k = kinds(steps);
  assert.equal(k.includes("urge_preventive_stopping"), true);
  assert.equal(k.includes("processing"), true);
  assert.equal(k.includes("state_regulation_anchor"), false);
});

test("Urge with State: preventive stopping precedes shared Stay, and the State block still appears", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["u1"], itemRelationships: { u1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" }),
    items: [urge()],
    stateProfiles: [completeState()],
  });
  const steps = buildFullCombinedSteps(plan, "skipped");
  assert.ok(steps.findIndex((s) => s.kind === "urge_preventive_stopping") < steps.findIndex((s) => s.kind === "shared_stay"));
  assert.equal(kinds(steps).includes("state_regulation_anchor"), true);
});

// --- Multiple factors share Stay/Acceptance/State stages once ---

test("multiple factors share shared_stay/shared_acceptance/State stages exactly once each, never duplicated per factor", () => {
  const plan = resolve({
    config: config({
      interferenceItemIds: ["t1", "b1", "u1"],
      itemRelationships: { t1: { actionRelationship: "same_action" }, b1: { actionRelationship: "same_action" }, u1: { actionRelationship: "same_action" } },
      stateInclusionPolicy: "linked",
      stateProfileId: "s1",
    }),
    items: [thought(), belief(), urge()],
    stateProfiles: [completeState()],
    primaryFactorId: "t1",
  });
  const steps = buildFullCombinedSteps(plan, "skipped");
  const k = kinds(steps);
  assert.equal(k.filter((kind) => kind === "shared_stay").length, 1);
  assert.equal(k.filter((kind) => kind === "shared_acceptance").length, 1);
  assert.equal(k.filter((kind) => kind === "state_regulation_anchor").length, 1);
  assert.equal(k.filter((kind) => kind === "state_desired_state_encoding").length, 1);
});

// --- No Emotion rating unless Emotion selected ---

test("Emotion recognition/processing steps never appear unless Emotion was explicitly selected", () => {
  const plan = resolve({ config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }), items: [thought()] });
  const steps = buildFullCombinedSteps(plan, "skipped");
  assert.equal(steps.some((s) => s.category === "emotion"), false);
});

test("Emotion, when selected, always resolves with a required complete State (state_only outcome) and its own recognition/processing steps appear", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["e1"], itemRelationships: { e1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" }),
    items: [emotion()],
    stateProfiles: [completeState()],
  });
  const steps = buildFullCombinedSteps(plan, "skipped");
  assert.equal(steps.some((s) => s.kind === "recognition" && s.category === "emotion"), true);
  assert.equal(steps.some((s) => s.kind === "processing" && s.category === "emotion"), true);
  assert.equal(kinds(steps).includes("state_action"), true);
});

// --- Checkpoint boundaries ---

test("checkpoint 1 (afterAwareness) precedes recognition-adjacent preventive stopping and Stay/Acceptance", () => {
  const plan = resolve({
    config: config({
      interferenceItemIds: ["u1"],
      itemRelationships: { u1: { actionRelationship: "legacy_unspecified" } },
      stateInclusionPolicy: "none",
    }),
    items: [urge()],
  });
  const steps = buildFullCombinedSteps(plan, "skipped");
  const awarenessIdx = steps.findIndex((s) => s.kind === "rating_checkpoint" && s.checkpoint === "afterAwareness");
  const preventiveIdx = steps.findIndex((s) => s.kind === "urge_preventive_stopping");
  assert.ok(awarenessIdx < preventiveIdx);
});

test("checkpoint 2 (afterStayAcceptance) follows both shared_stay and shared_acceptance", () => {
  const plan = resolve({ config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }), items: [thought()] });
  const steps = buildFullCombinedSteps(plan, "skipped");
  const stayIdx = steps.findIndex((s) => s.kind === "shared_stay");
  const acceptanceIdx = steps.findIndex((s) => s.kind === "shared_acceptance");
  const checkpointIdx = steps.findIndex((s) => s.kind === "rating_checkpoint" && s.checkpoint === "afterStayAcceptance");
  assert.ok(stayIdx < checkpointIdx && acceptanceIdx < checkpointIdx);
});

// --- Factor interventions precede State Encoding ---

test("factor-specific interventions precede State desired-state Encoding", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" }),
    items: [thought()],
    stateProfiles: [completeState()],
  });
  const steps = buildFullCombinedSteps(plan, "skipped");
  const processingIdx = steps.findIndex((s) => s.kind === "processing");
  const encodingIdx = steps.findIndex((s) => s.kind === "state_desired_state_encoding");
  assert.ok(processingIdx < encodingIdx);
});

// --- Presence precedes State Encoding when Presence runs ---

test("Presence precedes State desired-state Encoding when Presence runs (embedded or full)", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" }),
    items: [thought()],
    stateProfiles: [completeState()],
  });
  const embedded = buildFullCombinedSteps(plan, "embedded");
  const presenceIdx = embedded.findIndex((s) => s.kind === "presence");
  const encodingIdx = embedded.findIndex((s) => s.kind === "state_desired_state_encoding");
  assert.ok(presenceIdx >= 0 && presenceIdx < encodingIdx);

  const full = buildFullCombinedSteps(plan, "full");
  assert.ok(full.findIndex((s) => s.kind === "presence") < full.findIndex((s) => s.kind === "state_desired_state_encoding"));
});

test("no Presence step at all when finalPresenceMode is skipped", () => {
  const plan = resolve({ config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }), items: [thought()] });
  const steps = buildFullCombinedSteps(plan, "skipped");
  assert.equal(kinds(steps).includes("presence"), false);
});

// --- Desired-state rating scale (documentation-level assertion of intent -- see arc/ratings.ts) ---

test("desired_state_rating is its own distinct step kind, structurally impossible to merge with a factor rating_checkpoint", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" }),
    items: [thought()],
    stateProfiles: [completeState()],
  });
  const steps = buildFullCombinedSteps(plan, "skipped");
  const ratingStep = steps.find((s) => s.kind === "desired_state_rating");
  assert.ok(ratingStep);
  assert.notEqual(ratingStep!.kind, "rating_checkpoint");
});

// --- Terminal boundary ---

test("terminal_boundary is always the last step", () => {
  const plan = resolve({ config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }), items: [thought()] });
  const steps = buildFullCombinedSteps(plan, "skipped");
  assert.equal(steps[steps.length - 1].kind, "terminal_boundary");
});

// --- Cognitive reassessment ---

test("cognitive_reassessment appears once only when Thought and/or Belief selected", () => {
  const withThought = buildFullCombinedSteps(
    resolve({ config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }), items: [thought()] }),
    "skipped"
  );
  assert.equal(kinds(withThought).filter((k) => k === "cognitive_reassessment").length, 1);

  const withUrgeOnly = buildFullCombinedSteps(
    resolve({ config: config({ interferenceItemIds: ["u1"], itemRelationships: { u1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }), items: [urge()] }),
    "skipped"
  );
  assert.equal(kinds(withUrgeOnly).includes("cognitive_reassessment"), false);
});
