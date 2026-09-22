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
import { createEmptyBeliefInterferenceItem, createEmptyEmotionInterferenceItem, createEmptyThoughtInterferenceItem, createEmptyUrgeInterferenceItem } from "./interferenceItem.ts";
import type { BeliefInterferenceItem, EmotionInterferenceItem, InterferenceItem, ThoughtInterferenceItem, UrgeInterferenceItem } from "./interferenceItem.ts";
import { createEmptyStateProfile } from "./stateProfile.ts";
import type { StateProfile } from "./stateProfile.ts";
import { getAcceptanceStepCopy, getFactorProcessingStepCopy, getNeutralRegulationCueCopy, getRecognitionStepCopy } from "./combinedFactorPlanCopy.ts";
import { containsInductionPattern } from "./instructions.ts";

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
  return { ...createEmptyUrgeInterferenceItem("u1", "דחף", null, NOW), schemaVersion: 2, beneficialActionAgainstFactor: "פעולת דחף", preventiveStoppingAction: "עצור עכשיו", ...overrides };
}
function emotion(overrides: Partial<EmotionInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyEmotionInterferenceItem("e1", "רגש", null, NOW), ...overrides };
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

// --- buildRouteLinkSteps: EVERY selected factor is cued, in BUILD order ---

test("a single-factor, no-State Thought route resolves to [acceptance, neutral_regulation, factor_replacement_cue, factor_action, terminal_boundary] -- Acceptance -> neutral Regulation -> Encoding cue -> Action; a no-State route still gets a real Regulation cue, no State creation/encoding, no Presence", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } } }),
    items: [thought()],
    primaryFactorId: "t1",
  });
  const steps = buildRouteLinkSteps(plan, "required");
  assert.deepEqual(kinds(steps), ["acceptance", "neutral_regulation", "factor_replacement_cue", "factor_action", "terminal_boundary"]);
});

test("a State-included route keeps neutral Regulation AND State creation/encoding as separate, correctly ordered steps: Acceptance -> neutral Regulation -> State Regulation -> State Encoding -> factor Encoding -> Action", () => {
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
  assert.deepEqual(kinds(steps), [
    "acceptance",
    "neutral_regulation",
    "state_regulation_anchor",
    "state_desired_state_encoding",
    "factor_replacement_cue",
    "state_action",
    "factor_action",
    "terminal_boundary",
  ]);
});

test("beneficialActionPolicy 'none' omits the action step entirely, same as Full/Mini -- neutral Regulation is still present (it is never conditional on the action)", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, beneficialActionPolicy: "none" }),
    items: [thought()],
    primaryFactorId: "t1",
  });
  const steps = buildRouteLinkSteps(plan, "none");
  assert.deepEqual(kinds(steps), ["acceptance", "neutral_regulation", "factor_replacement_cue", "terminal_boundary"]);
});

test("a multi-factor route cues EVERY selected factor, one factor_replacement_cue each, in plain BUILD (config.interferenceItemIds) order -- primaryFactorId only affects the action, never which factors are cued", () => {
  const plan = resolve({
    config: config({
      interferenceItemIds: ["b1", "t1"], // BUILD order: belief first, thought second
      itemRelationships: { b1: { actionRelationship: "legacy_unspecified" }, t1: { actionRelationship: "legacy_unspecified" } },
    }),
    items: [belief(), thought()],
    primaryFactorId: "t1", // primary is the SECOND factor in BUILD order
  });
  const steps = buildRouteLinkSteps(plan, "required");
  const cueSteps = steps.filter((s) => s.kind === "factor_replacement_cue");
  assert.deepEqual(
    cueSteps.map((s) => s.itemId),
    ["b1", "t1"],
    "both factors are cued, in BUILD order -- never reordered by which one is primary, never dropped"
  );
});

test("a no-State Urge route: preventive stop -> Acceptance -> neutral Regulation -> replacement movement -- a distinct beat from its later factor_replacement_cue, never folded together", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["u1"], itemRelationships: { u1: { actionRelationship: "legacy_unspecified" } } }),
    items: [urge()],
    primaryFactorId: "u1",
  });
  const steps = buildRouteLinkSteps(plan, "required");
  assert.deepEqual(kinds(steps), ["urge_preventive_stopping", "acceptance", "neutral_regulation", "factor_replacement_cue", "factor_action", "terminal_boundary"]);
  assert.equal(steps[0].itemId, "u1");
  assert.equal(steps.find((s) => s.kind === "factor_replacement_cue")?.itemId, "u1");
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

test("a multi-factor route without a pre-chosen primary factor enters phase 'primary_choice', direct-choice question (never the rating-derived tie question) -- the shared selection contract Full/Mini also use", () => {
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

test("chooseRouteLinkPrimaryFactor resolves the plan and enters 'steps', without dropping the OTHER selected factor's own cue", () => {
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
  assert.deepEqual(
    state.remainingSteps.filter((s) => s.kind === "factor_replacement_cue").map((s) => s.itemId),
    ["t1", "b1"],
    "both factors remain cued, in BUILD order, even though b1 was chosen as primary"
  );
  assert.deepEqual(state.practicedItemIds, ["t1", "b1"], "practicedItemIds covers every selected factor, not just the primary");
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

test("advanceRouteLinkStep walks non-action steps in the correct method order but is a no-op on an action step", () => {
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
  assert.equal(state.remainingSteps[state.stepIndex].kind, "acceptance");
  state = advanceRouteLinkStep(state);
  assert.equal(state.remainingSteps[state.stepIndex].kind, "neutral_regulation");
  state = advanceRouteLinkStep(state);
  assert.equal(state.remainingSteps[state.stepIndex].kind, "state_regulation_anchor");
  state = advanceRouteLinkStep(state);
  assert.equal(state.remainingSteps[state.stepIndex].kind, "state_desired_state_encoding");
  state = advanceRouteLinkStep(state);
  assert.equal(state.remainingSteps[state.stepIndex].kind, "factor_replacement_cue");
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
  state = advanceRouteLinkStep(state); // acceptance -> neutral_regulation
  state = advanceRouteLinkStep(state); // neutral_regulation -> factor_replacement_cue
  state = advanceRouteLinkStep(state); // factor_replacement_cue -> factor_action
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

// --- Action-role resolver: every ActionResolutionOutcome kind, reusing the shared resolver ---

test("factor_only outcome: one factor role, factor action text preserved verbatim", () => {
  const state = createRouteLinkSession({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } } }),
    items: [thought({ beneficialActionAgainstFactor: "פעולת מחשבה ייחודית" })],
    stateProfiles: [],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 3,
    generateSessionId: genId,
  });
  assert.equal(state.actionRoleProgress.length, 1);
  assert.equal(state.actionRoleProgress[0].role, "factor");
  assert.equal(state.actionRoleProgress[0].action, "פעולת מחשבה ייחודית");
});

test("state_only outcome (Emotion): one state role, State's own action text", () => {
  const state = createRouteLinkSession({
    config: config({ interferenceItemIds: ["e1"], itemRelationships: { e1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" }),
    items: [emotion()],
    stateProfiles: [completeState({ action: "פעולת מצב ייחודית" })],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 3,
    generateSessionId: genId,
  });
  assert.equal(state.actionRoleProgress.length, 1);
  assert.equal(state.actionRoleProgress[0].role, "state");
  assert.equal(state.actionRoleProgress[0].action, "פעולת מצב ייחודית");
});

test("shared_explicit outcome (same_action): one role, executed once -- never two roles for one action, never merged by comparing text", () => {
  const state = createRouteLinkSession({
    config: config({
      interferenceItemIds: ["t1"],
      itemRelationships: { t1: { actionRelationship: "same_action" } },
      stateInclusionPolicy: "linked",
      stateProfileId: "s1",
    }),
    items: [thought({ beneficialActionAgainstFactor: "פעולה משותפת" })],
    stateProfiles: [completeState({ action: "פעולה משותפת" })], // same text as the factor's own action -- relationship alone decides, never text comparison
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 3,
    generateSessionId: genId,
  });
  assert.equal(state.actionRoleProgress.length, 1, "shared_explicit is exactly one role, even though the two configured action fields hold identical text");
  assert.equal(state.actionRoleProgress[0].role, "shared");
});

test("legacy_shared_state_fallback outcome (v1 item, no own action): one state role, falls back to the State's own action", () => {
  const state = createRouteLinkSession({
    config: config({
      interferenceItemIds: ["t1"],
      itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } },
      stateInclusionPolicy: "linked",
      stateProfileId: "s1",
    }),
    items: [thought({ schemaVersion: 1, beneficialActionAgainstFactor: null })],
    stateProfiles: [completeState({ action: "פעולת נפילה למצב" })],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 3,
    generateSessionId: genId,
  });
  assert.equal(state.actionRoleProgress.length, 1);
  assert.equal(state.actionRoleProgress[0].role, "state");
  assert.equal(state.actionRoleProgress[0].action, "פעולת נפילה למצב");
});

test("state_then_factor outcome (different_actions): TWO roles, state first then factor, in that exact order -- each confirmed independently, chained, never merged", () => {
  let state = createRouteLinkSession({
    config: config({
      interferenceItemIds: ["t1"],
      itemRelationships: { t1: { actionRelationship: "different_actions" } },
      stateInclusionPolicy: "linked",
      stateProfileId: "s1",
    }),
    items: [thought({ beneficialActionAgainstFactor: "פעולת גורם" })],
    stateProfiles: [completeState({ action: "פעולת מצב" })],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 3,
    generateSessionId: genId,
  });
  assert.equal(state.actionRoleProgress.length, 2);
  assert.equal(state.actionRoleProgress[0].role, "state");
  assert.equal(state.actionRoleProgress[0].action, "פעולת מצב");
  assert.equal(state.actionRoleProgress[1].role, "factor");
  assert.equal(state.actionRoleProgress[1].action, "פעולת גורם");

  // Walk to the state_action step and confirm it -- the factor role must remain untouched.
  state = advanceRouteLinkStep(state); // acceptance -> neutral_regulation
  state = advanceRouteLinkStep(state); // neutral_regulation -> state_regulation_anchor
  state = advanceRouteLinkStep(state); // state_regulation_anchor -> state_desired_state_encoding
  state = advanceRouteLinkStep(state); // state_desired_state_encoding -> factor_replacement_cue
  state = advanceRouteLinkStep(state); // factor_replacement_cue -> state_action
  assert.equal(state.remainingSteps[state.stepIndex].kind, "state_action");
  state = confirmRouteLinkActionCompleted(state);
  assert.equal(state.actionRoleProgress[0].completed, true, "state role confirmed");
  assert.equal(state.actionRoleProgress[1].completed, false, "factor role untouched by confirming the state role");
  assert.equal(state.terminalCompleted, false, "not yet complete -- one required role still unconfirmed");

  assert.equal(state.remainingSteps[state.stepIndex].kind, "factor_action");
  state = confirmRouteLinkActionCompleted(state);
  assert.equal(state.actionRoleProgress[1].completed, true);
  assert.equal(state.terminalCompleted, true, "only now, once BOTH required roles are confirmed, does the session complete");
});

test("unavailable outcome (v2 item with no configured action) fails safely at the plan level -- 'invalid', never a fabricated action, never reaching phase 'steps'", () => {
  const state = createRouteLinkSession({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } } }),
    items: [thought({ beneficialActionAgainstFactor: null })],
    stateProfiles: [],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 3,
    generateSessionId: genId,
  });
  assert.equal(state.phase, "invalid");
  assert.equal(state.invalidReason, "incomplete_v2_factor_action");
  assert.deepEqual(state.actionRoleProgress, []);
  assert.equal(state.terminalCompleted, false);
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
  state = advanceRouteLinkStep(state); // acceptance -> neutral_regulation
  state = advanceRouteLinkStep(state); // neutral_regulation -> factor_replacement_cue
  state = advanceRouteLinkStep(state); // factor_replacement_cue -> factor_action
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

// --- Correction round 3: dedicated method-order + no-evoke coverage ---

test("no-State Thought Route Link: Acceptance -> neutral Regulation -> Thought replacement, in that exact order, and Acceptance/Regulation appear exactly once", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } } }),
    items: [thought()],
    primaryFactorId: "t1",
  });
  const steps = buildRouteLinkSteps(plan, "required");
  assert.deepEqual(kinds(steps).filter((k) => k !== "factor_action" && k !== "terminal_boundary"), ["acceptance", "neutral_regulation", "factor_replacement_cue"]);
  assert.equal(kinds(steps).filter((k) => k === "acceptance").length, 1);
  assert.equal(kinds(steps).filter((k) => k === "neutral_regulation").length, 1);
});

test("no-State Urge Route Link: preventive stop -> Acceptance -> neutral Regulation -> replacement movement, in that exact order", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["u1"], itemRelationships: { u1: { actionRelationship: "legacy_unspecified" } } }),
    items: [urge()],
    primaryFactorId: "u1",
  });
  const steps = buildRouteLinkSteps(plan, "required");
  assert.deepEqual(kinds(steps).filter((k) => k !== "factor_action" && k !== "terminal_boundary"), ["urge_preventive_stopping", "acceptance", "neutral_regulation", "factor_replacement_cue"]);
});

test("State-included Route Link keeps neutral Regulation and State creation/encoding as separate steps, both present, correctly ordered relative to each other", () => {
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
  const neutralRegIndex = kinds(steps).indexOf("neutral_regulation");
  const stateRegIndex = kinds(steps).indexOf("state_regulation_anchor");
  const stateEncIndex = kinds(steps).indexOf("state_desired_state_encoding");
  assert.notEqual(neutralRegIndex, -1, "neutral Regulation is present even when State is also included");
  assert.notEqual(stateRegIndex, -1, "State's own Regulation content is also present -- the two are never merged into one step");
  assert.ok(neutralRegIndex < stateRegIndex, "neutral Regulation precedes State's own Regulation/creation content");
  assert.ok(stateRegIndex < stateEncIndex, "State Regulation precedes State Encoding, unchanged");
});

test("multiple selected factors share Acceptance and neutral Regulation exactly once, and each receives its own factor-specific Encoding cue, in BUILD order", () => {
  const plan = resolve({
    config: config({
      interferenceItemIds: ["b1", "u1", "t1"], // BUILD order
      itemRelationships: { b1: { actionRelationship: "legacy_unspecified" }, u1: { actionRelationship: "legacy_unspecified" }, t1: { actionRelationship: "legacy_unspecified" } },
    }),
    items: [belief(), urge(), thought()],
    primaryFactorId: "t1",
  });
  const steps = buildRouteLinkSteps(plan, "required");
  assert.equal(kinds(steps).filter((k) => k === "acceptance").length, 1, "Acceptance appears exactly once, regardless of factor count");
  assert.equal(kinds(steps).filter((k) => k === "neutral_regulation").length, 1, "neutral Regulation appears exactly once, regardless of factor count");
  const cueItemIds = steps.filter((s) => s.kind === "factor_replacement_cue").map((s) => s.itemId);
  assert.deepEqual(cueItemIds, ["b1", "u1", "t1"], "each selected factor gets its own Encoding cue, in plain BUILD order");
});

test("neither Acceptance nor the universal neutral Regulation cue ever asks the trainee to evoke, intensify, suppress, or replace the disturbance, for realistic multi-category fixtures", () => {
  const anchor = completeState().regulationAnchor;
  const acceptanceCopy = getAcceptanceStepCopy(["thought", "urge"], anchor);
  const regulationCopy = getNeutralRegulationCueCopy(anchor);
  assert.equal(containsInductionPattern(acceptanceCopy.body), false);
  assert.equal(containsInductionPattern(regulationCopy.body), false);
  // The per-factor recognition framing (reused verbatim for factor_replacement_cue's own title) must also pass.
  for (const item of [thought(), belief(), urge(), emotion()]) {
    assert.equal(containsInductionPattern(getRecognitionStepCopy(item).framing), false);
  }
});

// --- Correction round 3: explicit action-ownership for multi-factor routes ---

test("the PRIMARY factor determines the factor-side Beneficial Action -- a secondary factor's own separately-configured action is never surfaced as an extra role, even though the secondary factor still gets its own compact cue", () => {
  const state = createRouteLinkSession({
    config: config({
      interferenceItemIds: ["b1", "t1"],
      itemRelationships: { b1: { actionRelationship: "legacy_unspecified" }, t1: { actionRelationship: "legacy_unspecified" } },
    }),
    items: [belief({ beneficialActionAgainstFactor: "פעולת אמונה שונה לגמרי" }), thought({ beneficialActionAgainstFactor: "פעולת מחשבה נבחרת" })],
    stateProfiles: [],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 3,
    generateSessionId: genId,
  });
  const chosen = chooseRouteLinkPrimaryFactor(state, "t1");
  // Exactly one action role, and it is the PRIMARY (t1) factor's own action -- the
  // secondary (b1) factor's own separately-configured action never appears as a
  // second role or gets silently substituted in.
  assert.equal(chosen.actionRoleProgress.length, 1, "only one action role total -- the secondary factor never adds an extra, unrelated action");
  assert.equal(chosen.actionRoleProgress[0].action, "פעולת מחשבה נבחרת", "the resolved action is the PRIMARY factor's own");
  assert.notEqual(chosen.actionRoleProgress[0].action, "פעולת אמונה שונה לגמרי", "never the secondary factor's own action");
  // But the secondary factor still receives its own compact cue -- point 1's own guarantee, unaffected by action ownership.
  assert.ok(
    chosen.remainingSteps.some((s) => s.kind === "factor_replacement_cue" && s.itemId === "b1"),
    "the secondary factor still gets its own Encoding cue"
  );
});

test("the linked State action still participates according to the explicit ActionRelationship -- a State-only route (Emotion) never fabricates a factor-side role even with a secondary Thought factor selected", () => {
  const state = createRouteLinkSession({
    config: config({
      interferenceItemIds: ["e1", "t1"],
      itemRelationships: { e1: { actionRelationship: "legacy_unspecified" }, t1: { actionRelationship: "different_actions" } },
      stateInclusionPolicy: "linked",
      stateProfileId: "s1",
    }),
    items: [emotion(), thought({ beneficialActionAgainstFactor: "פעולת מחשבה" })],
    stateProfiles: [completeState({ action: "פעולת מצב" })],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 3,
    generateSessionId: genId,
  });
  const chosen = chooseRouteLinkPrimaryFactor(state, "e1"); // Emotion chosen primary -> state_only outcome
  assert.equal(chosen.actionRoleProgress.length, 1, "Emotion's own outcome is state_only -- exactly one role, the State's own action");
  assert.equal(chosen.actionRoleProgress[0].role, "state");
  assert.equal(chosen.actionRoleProgress[0].action, "פעולת מצב");
  // The secondary Thought factor's own configured action is never separately surfaced.
  assert.ok(!chosen.actionRoleProgress.some((role) => role.action === "פעולת מחשבה"), "the secondary Thought factor's own action never appears as an extra role");
});
