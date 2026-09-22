import test from "node:test";
import assert from "node:assert/strict";

import {
  answerActionOnlyStateDecision,
  chooseActionOnlyPrimaryFactor,
  confirmActionOnlyActionCompleted,
  createActionOnlySession,
  markActionOnlyActionReached,
  resolveCurrentActionOnlyRole,
  toActionOnlySessionFacts,
} from "./personalDevelopmentRouteActionOnly.ts";
import { createEmptyPersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import type { PersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import { createEmptyBeliefInterferenceItem, createEmptyEmotionInterferenceItem, createEmptyThoughtInterferenceItem } from "./interferenceItem.ts";
import type { BeliefInterferenceItem, EmotionInterferenceItem, InterferenceItem, ThoughtInterferenceItem } from "./interferenceItem.ts";
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
function emotion(overrides: Partial<EmotionInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyEmotionInterferenceItem("e1", "רגש", null, NOW), ...overrides };
}
function completeState(overrides: Partial<StateProfile> = {}): StateProfile {
  return { ...createEmptyStateProfile("s1", "מצב", null, NOW), regulationAnchor: "עוגן", encodingCue: "קידוד", action: "פעולת המצב", ...overrides };
}

let sessionCounter = 0;
function genId(): string {
  sessionCounter += 1;
  return `action-only-session-${sessionCounter}`;
}

test("createActionOnlySession auto-resolves a single-factor route straight to phase 'action', no recognition/State-review step of any kind", () => {
  const state = createActionOnlySession({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } } }),
    items: [thought()],
    stateProfiles: [],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 4,
    generateSessionId: genId,
  });
  assert.equal(state.phase, "action");
  assert.equal(state.primaryFactorId, "t1");
  const role = resolveCurrentActionOnlyRole(state);
  assert.ok(role);
  assert.equal(role?.role, "factor");
});

test("a multi-factor route without a pre-chosen primary factor enters 'primary_choice' -- the same direct-choice question Route Link asks", () => {
  const state = createActionOnlySession({
    config: config({
      interferenceItemIds: ["t1", "b1"],
      itemRelationships: { t1: { actionRelationship: "legacy_unspecified" }, b1: { actionRelationship: "legacy_unspecified" } },
    }),
    items: [thought(), belief()],
    stateProfiles: [],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 4,
    generateSessionId: genId,
  });
  assert.equal(state.phase, "primary_choice");
  assert.equal(state.pendingPrimaryFactorQuestion, "במה היית רוצה להתמקד עכשיו?");
});

test("chooseActionOnlyPrimaryFactor resolves the plan and enters 'action'", () => {
  let state = createActionOnlySession({
    config: config({
      interferenceItemIds: ["t1", "b1"],
      itemRelationships: { t1: { actionRelationship: "legacy_unspecified" }, b1: { actionRelationship: "legacy_unspecified" } },
    }),
    items: [thought(), belief()],
    stateProfiles: [],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 4,
    generateSessionId: genId,
  });
  state = chooseActionOnlyPrimaryFactor(state, "b1");
  assert.equal(state.phase, "action");
  assert.equal(state.primaryFactorId, "b1");
});

test("answerActionOnlyStateDecision(true) includes the candidate State's own action in a state_then_factor outcome", () => {
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
    stageAtStart: 4 as const,
    generateSessionId: genId,
  };
  const pending = createActionOnlySession(input);
  assert.equal(pending.phase, "state_decision");
  const yes = answerActionOnlyStateDecision(pending, true);
  assert.equal(yes.resolvedPlan?.stateIncluded, true);
  assert.equal(yes.actionRoleProgress.length, 2);
});

test("markActionOnlyActionReached marks reached without completing", () => {
  let state = createActionOnlySession({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } } }),
    items: [thought()],
    stateProfiles: [],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 4,
    generateSessionId: genId,
  });
  state = markActionOnlyActionReached(state);
  assert.equal(state.actionRoleProgress[0].reached, true);
  assert.equal(state.actionRoleProgress[0].completed, false);
});

test("confirmActionOnlyActionCompleted is idempotent and marks terminalCompleted once confirmed -- timer expiry/opening the screen alone never counts", () => {
  let state = createActionOnlySession({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } } }),
    items: [thought()],
    stateProfiles: [],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 4,
    generateSessionId: genId,
  });
  assert.equal(state.terminalCompleted, false, "merely reaching phase 'action' never counts as complete");
  state = markActionOnlyActionReached(state);
  assert.equal(state.terminalCompleted, false, "reaching the action alone never counts as complete");

  state = confirmActionOnlyActionCompleted(state);
  assert.equal(state.actionRoleProgress[0].completed, true);
  assert.equal(state.phase, "complete");
  assert.equal(state.terminalCompleted, true);

  const before = state;
  state = confirmActionOnlyActionCompleted(state);
  assert.deepEqual(state, before, "idempotent -- a repeated confirm after completion never double-writes");
});

test("a state_then_factor route confirms the state role first, then chains to the factor role", () => {
  let state = createActionOnlySession({
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
    stageAtStart: 4,
    generateSessionId: genId,
  });
  assert.equal(resolveCurrentActionOnlyRole(state)?.role, "state");
  state = confirmActionOnlyActionCompleted(state);
  assert.equal(state.terminalCompleted, false);
  assert.equal(resolveCurrentActionOnlyRole(state)?.role, "factor");
  state = confirmActionOnlyActionCompleted(state);
  assert.equal(state.terminalCompleted, true);
});

test("toActionOnlySessionFacts always reports mode 'action_only', presenceMode null, zero skips (no skip control exists)", () => {
  let state = createActionOnlySession({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } } }),
    items: [thought()],
    stateProfiles: [],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 4,
    generateSessionId: genId,
  });
  state = confirmActionOnlyActionCompleted(state);
  const facts = toActionOnlySessionFacts(state);
  assert.equal(facts.mode, "action_only");
  assert.equal(facts.presenceMode, null);
  assert.equal(facts.presenceSelectedForSession, false);
  assert.equal(facts.stateActionSkipped, false);
  assert.equal(facts.factorActionSkipped, false);
  assert.equal(facts.sharedActionSkipped, false);
  assert.equal(facts.factorActionCompleted, true);
  assert.equal(facts.terminalCompleted, true);
  assert.equal(facts.stageAtStart, 4);
});

test("beneficialActionPolicy 'none' resolves defensively to phase 'invalid' rather than crashing on an empty action-role array (structurally unreachable via Stage 4 in practice, since such a route is capped at Stage 2)", () => {
  const state = createActionOnlySession({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, beneficialActionPolicy: "none" }),
    items: [thought()],
    stateProfiles: [],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 4,
    generateSessionId: genId,
  });
  assert.equal(state.phase, "invalid");
  assert.deepEqual(state.actionRoleProgress, []);
});

// --- Action-role resolver: every ActionResolutionOutcome kind, reusing the shared resolver ---

test("factor_only outcome: one factor role, factor action text preserved verbatim", () => {
  const state = createActionOnlySession({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } } }),
    items: [thought({ beneficialActionAgainstFactor: "פעולת מחשבה ייחודית" })],
    stateProfiles: [],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 4,
    generateSessionId: genId,
  });
  assert.equal(state.actionRoleProgress.length, 1);
  assert.equal(state.actionRoleProgress[0].role, "factor");
  assert.equal(state.actionRoleProgress[0].action, "פעולת מחשבה ייחודית");
});

test("state_only outcome (Emotion): one state role, State's own action text", () => {
  const state = createActionOnlySession({
    config: config({ interferenceItemIds: ["e1"], itemRelationships: { e1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" }),
    items: [emotion()],
    stateProfiles: [completeState({ action: "פעולת מצב ייחודית" })],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 4,
    generateSessionId: genId,
  });
  assert.equal(state.actionRoleProgress.length, 1);
  assert.equal(state.actionRoleProgress[0].role, "state");
  assert.equal(state.actionRoleProgress[0].action, "פעולת מצב ייחודית");
});

test("shared_explicit outcome (same_action): one role, executed once -- never two roles for one action, never merged by comparing text", () => {
  const state = createActionOnlySession({
    config: config({
      interferenceItemIds: ["t1"],
      itemRelationships: { t1: { actionRelationship: "same_action" } },
      stateInclusionPolicy: "linked",
      stateProfileId: "s1",
    }),
    items: [thought({ beneficialActionAgainstFactor: "פעולה משותפת" })],
    stateProfiles: [completeState({ action: "פעולה משותפת" })], // identical text -- relationship alone decides, never text comparison
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 4,
    generateSessionId: genId,
  });
  assert.equal(state.actionRoleProgress.length, 1, "shared_explicit is exactly one role, even though the two configured action fields hold identical text");
  assert.equal(state.actionRoleProgress[0].role, "shared");
});

test("legacy_shared_state_fallback outcome (v1 item, no own action): one state role, falls back to the State's own action", () => {
  const state = createActionOnlySession({
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
    stageAtStart: 4,
    generateSessionId: genId,
  });
  assert.equal(state.actionRoleProgress.length, 1);
  assert.equal(state.actionRoleProgress[0].role, "state");
  assert.equal(state.actionRoleProgress[0].action, "פעולת נפילה למצב");
});

test("unavailable outcome (v2 item with no configured action) fails safely at the plan level -- 'invalid', never a fabricated action, never reaching phase 'action'", () => {
  const state = createActionOnlySession({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } } }),
    items: [thought({ beneficialActionAgainstFactor: null })],
    stateProfiles: [],
    presenceArcs: [],
    startedAt: NOW,
    stageAtStart: 4,
    generateSessionId: genId,
  });
  assert.equal(state.phase, "invalid");
  assert.equal(state.invalidReason, "incomplete_v2_factor_action");
  assert.deepEqual(state.actionRoleProgress, []);
  assert.equal(state.terminalCompleted, false);
});
