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

test("a single-factor, no-State route resolves to [acceptance, factor_replacement_cue, factor_action, terminal_boundary] -- Acceptance -> Encoding cue -> Action, no Regulation/Encoding-State (no State configured), no Presence", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } } }),
    items: [thought()],
    primaryFactorId: "t1",
  });
  const steps = buildRouteLinkSteps(plan, "required");
  assert.deepEqual(kinds(steps), ["acceptance", "factor_replacement_cue", "factor_action", "terminal_boundary"]);
});

test("a State-included route inserts Regulation + State-Encoding once, between Acceptance and the per-factor cues -- Acceptance -> Regulation -> Encoding(State) -> Encoding(factor) -> Action", () => {
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
  assert.deepEqual(kinds(steps), ["acceptance", "state_regulation_anchor", "state_desired_state_encoding", "factor_replacement_cue", "state_action", "factor_action", "terminal_boundary"]);
});

test("beneficialActionPolicy 'none' omits the action step entirely, same as Full/Mini", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, beneficialActionPolicy: "none" }),
    items: [thought()],
    primaryFactorId: "t1",
  });
  const steps = buildRouteLinkSteps(plan, "none");
  assert.deepEqual(kinds(steps), ["acceptance", "factor_replacement_cue", "terminal_boundary"]);
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

test("an urge factor with preventiveStoppingRelevant gets its own urge_preventive_stopping step FIRST, before Acceptance -- a distinct beat from its later factor_replacement_cue", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["u1"], itemRelationships: { u1: { actionRelationship: "legacy_unspecified" } } }),
    items: [urge()],
    primaryFactorId: "u1",
  });
  const steps = buildRouteLinkSteps(plan, "required");
  assert.deepEqual(kinds(steps), ["urge_preventive_stopping", "acceptance", "factor_replacement_cue", "factor_action", "terminal_boundary"]);
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
  state = advanceRouteLinkStep(state); // acceptance -> factor_replacement_cue
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
  state = advanceRouteLinkStep(state); // acceptance -> regulation
  state = advanceRouteLinkStep(state); // regulation -> encoding(state)
  state = advanceRouteLinkStep(state); // encoding(state) -> factor_replacement_cue
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
  state = advanceRouteLinkStep(state);
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
