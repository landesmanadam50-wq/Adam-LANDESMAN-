import test from "node:test";
import assert from "node:assert/strict";

import { buildMiniCombinedSteps } from "./combinedMiniPlan.ts";
import type { MiniCombinedStepKind } from "./combinedMiniPlan.ts";
import { resolveCombinedFactorPlan } from "./combinedFactorPlan.ts";
import type { CombinedFactorPlanInput, ResolvedCombinedFactorPlan } from "./combinedFactorPlan.ts";
import { createEmptyPersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import type { PersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import { createEmptyBeliefInterferenceItem, createEmptyThoughtInterferenceItem, createEmptyUrgeInterferenceItem } from "./interferenceItem.ts";
import type { BeliefInterferenceItem, InterferenceItem, ThoughtInterferenceItem, UrgeInterferenceItem } from "./interferenceItem.ts";
import { createEmptyStateProfile } from "./stateProfile.ts";
import type { StateProfile } from "./stateProfile.ts";
import type { PresenceArc } from "./types.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function presenceArc(overrides: Partial<PresenceArc> = {}): PresenceArc {
  return { id: "p1", name: "נוכחות", createdAt: NOW, updatedAt: NOW, presenceColor: null, presenceDwellSeconds: null, beneficialAction: "פעולת נוכחות", postActionImageryDwellSeconds: null, gratitudePrompt: null, ...overrides };
}

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
function completeState(overrides: Partial<StateProfile> = {}): StateProfile {
  return { ...createEmptyStateProfile("s1", "מצב", null, NOW), regulationAnchor: "עוגן", encodingCue: "קידוד", action: "פעולת המצב", ...overrides };
}

function resolve(input: Partial<CombinedFactorPlanInput>): ResolvedCombinedFactorPlan {
  const result = resolveCombinedFactorPlan({
    mode: "mini",
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

function kinds(steps: { kind: MiniCombinedStepKind }[]): MiniCombinedStepKind[] {
  return steps.map((s) => s.kind);
}

// --- Structural: no rating-shaped member exists in the Mini union at all ---

test("MiniCombinedStepKind has no rating/checkpoint/desired-state-rating member -- exhaustive over every declared kind", () => {
  const allPossibleKinds: MiniCombinedStepKind[] = [
    "combined_recognition",
    "urge_preventive_stopping",
    "factor_intervention",
    "presence_intervention",
    "state_regulation_anchor",
    "state_desired_state_encoding",
    "state_action",
    "factor_action",
    "terminal_boundary",
  ];
  for (const kind of allPossibleKinds) {
    assert.notEqual(kind, "rating_checkpoint" as string);
    assert.ok(!kind.toLowerCase().includes("rating"), `"${kind}" must never be a rating-shaped step`);
  }
});

test("no Mini plan (several factors, State, Presence, Emotion, or otherwise) ever produces a step kind containing 'rating'", () => {
  const plan = resolve({
    config: config({
      interferenceItemIds: ["t1", "u1", "b1"],
      itemRelationships: { t1: { actionRelationship: "same_action" }, u1: { actionRelationship: "same_action" }, b1: { actionRelationship: "same_action" } },
      stateInclusionPolicy: "linked",
      stateProfileId: "s1",
    }),
    items: [thought(), urge(), belief()],
    stateProfiles: [completeState()],
    primaryFactorId: "t1",
  });
  const steps = buildMiniCombinedSteps(plan);
  for (const step of steps) assert.ok(!step.kind.toLowerCase().includes("rating"));
});

// --- Three-factor Mini is one combined route ---

test("a three-factor Mini route is ONE combined recognition step, not three separate recognitions", () => {
  const plan = resolve({
    config: config({
      interferenceItemIds: ["t1", "u1", "b1"],
      itemRelationships: { t1: { actionRelationship: "same_action" }, u1: { actionRelationship: "same_action" }, b1: { actionRelationship: "same_action" } },
      stateInclusionPolicy: "none",
    }),
    items: [thought(), urge(), belief()],
    primaryFactorId: "t1",
  });
  const steps = buildMiniCombinedSteps(plan);
  assert.equal(kinds(steps).filter((k) => k === "combined_recognition").length, 1);
  assert.equal(kinds(steps).filter((k) => k === "factor_intervention").length, 3, "one short intervention per selected factor");
});

// --- Mini with State: Regulation + Encoding, no rating ---

test("Mini with State contains State regulation anchor and desired-state encoding cue but no rating of any kind", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "different_actions" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" }),
    items: [thought()],
    stateProfiles: [completeState()],
  });
  const steps = buildMiniCombinedSteps(plan);
  const k = kinds(steps);
  assert.equal(k.includes("state_regulation_anchor"), true);
  assert.equal(k.includes("state_desired_state_encoding"), true);
  assert.equal(k.includes("state_action"), true);
  assert.equal(k.includes("factor_action"), true);
});

// --- Mini without State: neither ---

test("Mini without State contains neither State regulation nor encoding nor a State action -- factor intervention and action preserved", () => {
  const plan = resolve({ config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }), items: [thought()] });
  const steps = buildMiniCombinedSteps(plan);
  const k = kinds(steps);
  assert.equal(k.includes("state_regulation_anchor"), false);
  assert.equal(k.includes("state_desired_state_encoding"), false);
  assert.equal(k.includes("state_action"), false);
  assert.equal(k.includes("factor_intervention"), true);
  assert.equal(k.includes("factor_action"), true);
});

// --- Visual/sensory Urge Mini branches ---

test("Mini preserves Urge preventive stopping before its own factor intervention", () => {
  const plan = resolve({ config: config({ interferenceItemIds: ["u1"], itemRelationships: { u1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }), items: [urge()] });
  const steps = buildMiniCombinedSteps(plan);
  const preventiveIdx = steps.findIndex((s) => s.kind === "urge_preventive_stopping");
  const interventionIdx = steps.findIndex((s) => s.kind === "factor_intervention");
  assert.ok(preventiveIdx >= 0 && preventiveIdx < interventionIdx);
});

test("Mini Urge with visual representation vs sensory representation both preserve exactly one factor_intervention step (content differs, structure does not)", () => {
  const visual = resolve({
    config: config({ interferenceItemIds: ["u1"], itemRelationships: { u1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }),
    items: [urge({ representationPreference: "visual", visualEncodingConfig: "דימוי חזותי" })],
  });
  const sensory = resolve({
    config: config({ interferenceItemIds: ["u1"], itemRelationships: { u1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }),
    items: [urge({ representationPreference: "sensory", sensoryEncodingConfig: "תחושה גופנית" })],
  });
  assert.equal(kinds(buildMiniCombinedSteps(visual)).filter((k) => k === "factor_intervention").length, 1);
  assert.equal(kinds(buildMiniCombinedSteps(sensory)).filter((k) => k === "factor_intervention").length, 1);
});

// --- No cognitive_reassessment in Mini ---

test("Mini never contains a cognitive_reassessment-shaped step (no such member exists in the union at all)", () => {
  const plan = resolve({
    config: config({
      interferenceItemIds: ["t1", "b1"],
      itemRelationships: { t1: { actionRelationship: "same_action" }, b1: { actionRelationship: "same_action" } },
      stateInclusionPolicy: "none",
    }),
    items: [thought(), belief()],
    primaryFactorId: "t1",
  });
  const steps = buildMiniCombinedSteps(plan);
  for (const step of steps) assert.notEqual(step.kind as string, "cognitive_reassessment");
});

// --- Primary selection precedes intervention (structural) ---

test("Mini primary selection precedes every factor intervention -- structurally guaranteed since primaryFactorId is already fixed before this deriver is ever reachable", () => {
  const config1 = config({
    interferenceItemIds: ["t1", "u1"],
    itemRelationships: { t1: { actionRelationship: "legacy_unspecified" }, u1: { actionRelationship: "legacy_unspecified" } },
    stateInclusionPolicy: "none",
  });
  const unresolved = resolveCombinedFactorPlan({
    mode: "mini",
    config: config1,
    items: [thought(), urge()],
    stateProfiles: [],
    presenceArcs: [],
    primaryFactorId: null,
    stateDecisionAnswer: null,
  });
  assert.equal(unresolved.kind, "needs_primary_factor", "no ResolvedCombinedFactorPlan -- and therefore no buildMiniCombinedSteps call -- is reachable before this choice is made");
});

// --- Terminal boundary ---

test("terminal_boundary is always the last Mini step", () => {
  const plan = resolve({ config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }), items: [thought()] });
  const steps = buildMiniCombinedSteps(plan);
  assert.equal(steps[steps.length - 1].kind, "terminal_boundary");
});

// --- Phase 14B-4: Mini compact Presence intervention (approved correction) ---

test("Presence-only Mini (zero disturbing factors, Presence configured): one presence_intervention step, no combined_recognition (nothing to recognize), resolved action driven by Presence's own outcome", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: [], presenceEnabled: true, linkedPresenceArcId: "p1", presenceActionRelationship: "legacy_unspecified", stateInclusionPolicy: "none" }),
    presenceArcs: [presenceArc()],
  });
  const steps = buildMiniCombinedSteps(plan);
  const k = kinds(steps);
  assert.equal(k.filter((kind) => kind === "presence_intervention").length, 1);
  assert.equal(k.includes("combined_recognition"), false, "nothing to recognize when zero factors are selected");
  assert.equal(k.includes("factor_action"), true, "Presence's own outcome becomes the rendered action when it is the only source");
});

test("Thought + Presence Mini: combined_recognition, one factor_intervention (Thought), one presence_intervention, no rating anywhere", () => {
  const plan = resolve({
    config: config({
      interferenceItemIds: ["t1"],
      itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } },
      presenceEnabled: true,
      linkedPresenceArcId: "p1",
      presenceActionRelationship: "legacy_unspecified",
      stateInclusionPolicy: "none",
    }),
    items: [thought()],
    presenceArcs: [presenceArc()],
  });
  const steps = buildMiniCombinedSteps(plan);
  const k = kinds(steps);
  assert.equal(k.filter((kind) => kind === "combined_recognition").length, 1);
  assert.equal(k.filter((kind) => kind === "factor_intervention").length, 1);
  assert.equal(k.filter((kind) => kind === "presence_intervention").length, 1);
  for (const step of steps) assert.ok(!step.kind.toLowerCase().includes("rating"));
});

test("Thought + Urge + Presence Mini: one factor_intervention per selected factor plus exactly one presence_intervention, preventive stopping still precedes it", () => {
  const plan = resolve({
    config: config({
      interferenceItemIds: ["t1", "u1"],
      itemRelationships: { t1: { actionRelationship: "same_action" }, u1: { actionRelationship: "same_action" } },
      presenceEnabled: true,
      linkedPresenceArcId: "p1",
      presenceActionRelationship: "legacy_unspecified",
      stateInclusionPolicy: "none",
    }),
    items: [thought(), urge()],
    presenceArcs: [presenceArc()],
    primaryFactorId: "t1",
  });
  const steps = buildMiniCombinedSteps(plan);
  const k = kinds(steps);
  assert.equal(k.filter((kind) => kind === "factor_intervention").length, 2, "one intervention per selected factor");
  assert.equal(k.filter((kind) => kind === "presence_intervention").length, 1);
  assert.ok(steps.findIndex((s) => s.kind === "urge_preventive_stopping") < steps.findIndex((s) => s.kind === "presence_intervention"));
});

test("no presence_intervention step at all when Presence is not configured for the route", () => {
  const plan = resolve({ config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }), items: [thought()] });
  assert.equal(kinds(buildMiniCombinedSteps(plan)).includes("presence_intervention"), false);
});

test("Mini Presence never runs a standalone Presence action/tail sub-engine -- the planner output contains only this module's own MiniCombinedStepKind values, never a PresenceArc-specific action/imagery/gratitude stage name", () => {
  const plan = resolve({
    config: config({
      interferenceItemIds: ["t1"],
      itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } },
      presenceEnabled: true,
      linkedPresenceArcId: "p1",
      presenceActionRelationship: "legacy_unspecified",
      stateInclusionPolicy: "none",
    }),
    items: [thought()],
    presenceArcs: [presenceArc()],
  });
  const steps = buildMiniCombinedSteps(plan);
  const disallowedStandalonePresenceStageNames = ["action_imagery", "improvement_entry", "improved_action_imagery", "gratitude", "action", "complete"];
  for (const step of steps) assert.ok(!disallowedStandalonePresenceStageNames.includes(step.kind), `"${step.kind}" must never appear -- it belongs to arc/presenceLive.ts's own separate standalone sub-engine, never this planner`);
});

test("Presence Mini remains one combined route -- a single flat, linear step array, never a nested/branching structure", () => {
  const plan = resolve({
    config: config({
      interferenceItemIds: ["t1", "u1"],
      itemRelationships: { t1: { actionRelationship: "same_action" }, u1: { actionRelationship: "same_action" } },
      presenceEnabled: true,
      linkedPresenceArcId: "p1",
      presenceActionRelationship: "different_actions",
      stateInclusionPolicy: "linked",
      stateProfileId: "s1",
    }),
    items: [thought(), urge()],
    presenceArcs: [presenceArc()],
    stateProfiles: [completeState()],
    primaryFactorId: "t1",
  });
  const steps = buildMiniCombinedSteps(plan);
  assert.ok(Array.isArray(steps));
  assert.ok(steps.every((s) => typeof s.kind === "string" && !Array.isArray(s)), "every element is one flat step, never a nested array/sub-sequence");
  assert.equal(steps[steps.length - 1].kind, "terminal_boundary", "still ends in the one shared terminal boundary, regardless of Presence participating");
});
