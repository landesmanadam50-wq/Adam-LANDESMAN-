import test from "node:test";
import assert from "node:assert/strict";

import {
  advanceRouteLinkStep,
  answerRouteLinkStateDecision,
  buildRouteLinkSteps,
  chooseRouteLinkPrimaryFactor,
  confirmRouteLinkActionCompleted,
  createRouteLinkSession,
  markRouteLinkActionReached,
  toRouteLinkSessionFacts,
} from "./personalDevelopmentRouteLink.ts";
import type { RouteLinkStepKind } from "./personalDevelopmentRouteLink.ts";
import { resolveCombinedFactorPlan } from "./combinedFactorPlan.ts";
import type { CombinedFactorPlanInput, ResolvedCombinedFactorPlan } from "./combinedFactorPlan.ts";
import { createEmptyPersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import type { PersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import { createEmptyBeliefInterferenceItem, createEmptyThoughtInterferenceItem } from "./interferenceItem.ts";
import type { BeliefInterferenceItem, InterferenceItem, ThoughtInterferenceItem } from "./interferenceItem.ts";
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
function completeState(overrides: Partial<StateProfile> = {}): StateProfile {
  return { ...createEmptyStateProfile("s1", "מצב", null, NOW), regulationAnchor: "עוגן", encodingCue: "קידוד", action: "פעולת המצב", ...overrides };
}

function resolve(input: Partial<CombinedFactorPlanInput>): ResolvedCombinedFactorPlan {
  const result = resolveCombinedFactorPlan({
    mode: "route_link",
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

function kinds(steps: { kind: RouteLinkStepKind }[]): RouteLinkStepKind[] {
  return steps.map((s) => s.kind);
}

let sessionCounter = 0;
function genId(): string {
  sessionCounter += 1;
  return `link-session-${sessionCounter}`;
}

// --- buildRouteLinkSteps: structurally leaner than Mini ---

test("a single-factor, no-State route resolves to exactly [link_recognition, factor_action, terminal_boundary] -- no recognition/processing loop, no Presence", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } } }),
    items: [thought()],
    primaryFactorId: "t1",
  });
  const steps = buildRouteLinkSteps(plan, "required");
  assert.deepEqual(kinds(steps), ["link_recognition", "factor_action", "terminal_boundary"]);
});

test("a State-included route inserts the paired state_regulation_anchor/state_desired_state_encoding steps, no checkpoint between them", () => {
  const plan = resolve({
    config: config({
      interferenceItemIds: ["t1"],
      itemRelationships: { t1: { actionRelationship: "different_actions" } },
      stateInclusionPolicy: "linked",
      stateProfileId: "s1",
    }),
    items: [thought()],
    stateProfiles: [completeState()],
    primaryFactorId: "t1",
  });
  const steps = buildRouteLinkSteps(plan, "required");
  assert.deepEqual(kinds(steps), ["link_recognition", "state_regulation_anchor", "state_desired_state_encoding", "state_action", "factor_action", "terminal_boundary"]);
});

test("beneficialActionPolicy 'none' omits the action step entirely, same as Mini/Full", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, beneficialActionPolicy: "none" }),
    items: [thought()],
    primaryFactorId: "t1",
  });
  const steps = buildRouteLinkSteps(plan, "none");
  assert.deepEqual(kinds(steps), ["link_recognition", "terminal_boundary"]);
});

test("multi-factor route rehearses ONLY the resolved primary factor -- never a second recognition/intervention loop over every selected factor (the one deliberate structural difference from Mini/Full)", () => {
  const plan = resolve({
    config: config({
      interferenceItemIds: ["t1", "b1"],
      itemRelationships: { t1: { actionRelationship: "legacy_unspecified" }, b1: { actionRelationship: "legacy_unspecified" } },
    }),
    items: [thought(), belief()],
    primaryFactorId: "t1",
  });
  const steps = buildRouteLinkSteps(plan, "required");
  const recognitionSteps = steps.filter((s) => s.kind === "link_recognition");
  assert.equal(recognitionSteps.length, 1);
  assert.equal(recognitionSteps[0].itemId, "t1");
});

// --- Session lifecycle ---

test("createRouteLinkSession auto-resolves a single-factor route straight to phase 'steps'", () => {
  const state = createRouteLinkSession({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } } }),
    items: [thought()],
    stateProfiles: [],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 3,
    generateSessionId: genId,
  });
  assert.equal(state.phase, "steps");
  assert.equal(state.primaryFactorId, "t1");
});

test("a multi-factor route without a pre-chosen primary factor enters phase 'primary_choice', direct-choice question (never the rating-derived tie question)", () => {
  const state = createRouteLinkSession({
    config: config({
      interferenceItemIds: ["t1", "b1"],
      itemRelationships: { t1: { actionRelationship: "legacy_unspecified" }, b1: { actionRelationship: "legacy_unspecified" } },
    }),
    items: [thought(), belief()],
    stateProfiles: [],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 3,
    generateSessionId: genId,
  });
  assert.equal(state.phase, "primary_choice");
  assert.equal(state.pendingPrimaryFactorQuestion, "במה היית רוצה להתמקד עכשיו?");
});

test("chooseRouteLinkPrimaryFactor resolves the plan and enters 'steps'", () => {
  let state = createRouteLinkSession({
    config: config({
      interferenceItemIds: ["t1", "b1"],
      itemRelationships: { t1: { actionRelationship: "legacy_unspecified" }, b1: { actionRelationship: "legacy_unspecified" } },
    }),
    items: [thought(), belief()],
    stateProfiles: [],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 3,
    generateSessionId: genId,
  });
  state = chooseRouteLinkPrimaryFactor(state, "b1");
  assert.equal(state.phase, "steps");
  assert.equal(state.primaryFactorId, "b1");
  assert.deepEqual(state.practicedItemIds, ["b1"]);
});

test("answerRouteLinkStateDecision(true) includes the candidate State; (false) proceeds without it", () => {
  const input = {
    config: config({
      interferenceItemIds: ["t1"],
      itemRelationships: { t1: { actionRelationship: "different_actions" } },
      stateInclusionPolicy: "decide_in_live" as const,
      stateProfileId: "s1",
    }),
    items: [thought()],
    stateProfiles: [completeState()],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 3 as const,
    generateSessionId: genId,
  };
  const pending = createRouteLinkSession(input);
  assert.equal(pending.phase, "state_decision");

  const yes = answerRouteLinkStateDecision(pending, true);
  assert.equal(yes.resolvedPlan?.stateIncluded, true);

  const noState = createRouteLinkSession(input);
  const no = answerRouteLinkStateDecision(noState, false);
  assert.equal(no.resolvedPlan?.stateIncluded, false);
});

test("advanceRouteLinkStep walks non-action steps but is a no-op on an action step", () => {
  let state = createRouteLinkSession({
    config: config({
      interferenceItemIds: ["t1"],
      itemRelationships: { t1: { actionRelationship: "different_actions" } },
      stateInclusionPolicy: "linked",
      stateProfileId: "s1",
    }),
    items: [thought()],
    stateProfiles: [completeState()],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 3,
    generateSessionId: genId,
  });
  assert.equal(state.remainingSteps[state.stepIndex].kind, "link_recognition");
  state = advanceRouteLinkStep(state);
  assert.equal(state.remainingSteps[state.stepIndex].kind, "state_regulation_anchor");
  state = advanceRouteLinkStep(state);
  assert.equal(state.remainingSteps[state.stepIndex].kind, "state_desired_state_encoding");
  state = advanceRouteLinkStep(state);
  assert.equal(state.remainingSteps[state.stepIndex].kind, "state_action");
  const stepIndexBeforeNoOp = state.stepIndex;
  state = advanceRouteLinkStep(state);
  assert.equal(state.stepIndex, stepIndexBeforeNoOp, "advanceRouteLinkStep never advances past an action step");
});

test("confirmRouteLinkActionCompleted is idempotent and marks terminalCompleted once every action role is confirmed", () => {
  let state = createRouteLinkSession({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } } }),
    items: [thought()],
    stateProfiles: [],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 3,
    generateSessionId: genId,
  });
  state = advanceRouteLinkStep(state); // link_recognition -> factor_action
  assert.equal(state.remainingSteps[state.stepIndex].kind, "factor_action");
  state = markRouteLinkActionReached(state);
  assert.equal(state.actionRoleProgress[0].reached, true);
  assert.equal(state.actionRoleProgress[0].completed, false);

  state = confirmRouteLinkActionCompleted(state);
  assert.equal(state.actionRoleProgress[0].completed, true);
  assert.equal(state.phase, "complete");
  assert.equal(state.terminalCompleted, true);

  const before = state;
  state = confirmRouteLinkActionCompleted(state);
  assert.deepEqual(state, before, "idempotent -- a repeated confirm after completion never advances again or double-writes");
});

test("a state_then_factor route confirms the state role first, then chains to the factor role -- neither role auto-completes the other", () => {
  let state = createRouteLinkSession({
    config: config({
      interferenceItemIds: ["t1"],
      itemRelationships: { t1: { actionRelationship: "different_actions" } },
      stateInclusionPolicy: "linked",
      stateProfileId: "s1",
    }),
    items: [thought()],
    stateProfiles: [completeState()],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 3,
    generateSessionId: genId,
  });
  state = advanceRouteLinkStep(state); // recognition
  state = advanceRouteLinkStep(state); // state_regulation_anchor
  state = advanceRouteLinkStep(state); // state_desired_state_encoding
  assert.equal(state.remainingSteps[state.stepIndex].kind, "state_action");
  state = confirmRouteLinkActionCompleted(state);
  assert.equal(state.actionRoleProgress[0].role, "state");
  assert.equal(state.actionRoleProgress[0].completed, true);
  assert.equal(state.actionRoleProgress[1].completed, false, "the factor role is untouched by confirming the state role");
  assert.equal(state.terminalCompleted, false);

  assert.equal(state.remainingSteps[state.stepIndex].kind, "factor_action");
  state = confirmRouteLinkActionCompleted(state);
  assert.equal(state.actionRoleProgress[1].completed, true);
  assert.equal(state.terminalCompleted, true);
});

// --- Facts projection ---

test("toRouteLinkSessionFacts always reports mode 'route_link', presenceMode null, zero skips (no skip control exists)", () => {
  let state = createRouteLinkSession({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } } }),
    items: [thought()],
    stateProfiles: [],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 3,
    generateSessionId: genId,
  });
  state = advanceRouteLinkStep(state);
  state = confirmRouteLinkActionCompleted(state);
  const facts = toRouteLinkSessionFacts(state);
  assert.equal(facts.mode, "route_link");
  assert.equal(facts.presenceMode, null);
  assert.equal(facts.presenceSelectedForSession, false);
  assert.equal(facts.stateActionSkipped, false);
  assert.equal(facts.factorActionSkipped, false);
  assert.equal(facts.sharedActionSkipped, false);
  assert.equal(facts.factorActionCompleted, true);
  assert.equal(facts.terminalCompleted, true);
  assert.equal(facts.stageAtStart, 3);
  assert.deepEqual(facts.practicedItemIds, ["t1"]);
});
