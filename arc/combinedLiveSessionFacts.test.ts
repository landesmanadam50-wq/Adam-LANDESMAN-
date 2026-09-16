import test from "node:test";
import assert from "node:assert/strict";

import { toCombinedLiveSessionFacts } from "./combinedLiveSessionFacts.ts";
import {
  advanceAwarenessRecognition,
  advanceStep,
  advanceTail,
  answerReassessment,
  answerStateDecision,
  chooseTiePrimaryFactor,
  confirmActionCompleted,
  createCombinedLiveSession,
  markActionReached,
  recordAwarenessRating,
  recordDesiredStateRating,
  recordStepRating,
} from "./combinedLiveSession.ts";
import type { CombinedLiveSessionState, CreateCombinedLiveSessionInput } from "./combinedLiveSession.ts";
import { createEmptyPersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import type { PersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import { createEmptyThoughtInterferenceItem, createEmptyUrgeInterferenceItem } from "./interferenceItem.ts";
import type { InterferenceItem, ThoughtInterferenceItem, UrgeInterferenceItem } from "./interferenceItem.ts";
import { createEmptyStateProfile } from "./stateProfile.ts";
import type { StateProfile } from "./stateProfile.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function config(overrides: Partial<PersonalDevelopmentRouteConfig> = {}): PersonalDevelopmentRouteConfig {
  return { ...createEmptyPersonalDevelopmentRouteConfig("route1", "prog1", NOW), ...overrides };
}
function thought(overrides: Partial<ThoughtInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyThoughtInterferenceItem("t1", "מחשבה", null, NOW), schemaVersion: 2, beneficialActionAgainstFactor: "פעולת מחשבה", ...overrides };
}
function urge(overrides: Partial<UrgeInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyUrgeInterferenceItem("u1", "דחף", null, NOW), schemaVersion: 2, beneficialActionAgainstFactor: "פעולת דחף", preventiveStoppingAction: "עצור", ...overrides };
}
function completeState(overrides: Partial<StateProfile> = {}): StateProfile {
  return { ...createEmptyStateProfile("s1", "מצב", null, NOW), regulationAnchor: "עוגן", encodingCue: "קידוד", action: "פעולת המצב", ...overrides };
}

function baseInput(overrides: Partial<CreateCombinedLiveSessionInput> = {}): CreateCombinedLiveSessionInput {
  return { mode: "full", config: config(), items: [], stateProfiles: [], presenceArcs: [], startedAt: NOW, generateSessionId: () => "session-1", ...overrides };
}

function runFullToComplete(cfg: PersonalDevelopmentRouteConfig, items: InterferenceItem[], stateProfiles: StateProfile[] = []): CombinedLiveSessionState {
  let state = createCombinedLiveSession(baseInput({ items, config: cfg, stateProfiles }));
  while (state.awarenessSteps[state.awarenessIndex]?.kind === "recognition") state = advanceAwarenessRecognition(state);
  for (const item of items) state = recordAwarenessRating(state, item.id, item.category, 6);
  let guard = 0;
  while (state.phase === "steps" && guard < 30) {
    const step = state.remainingSteps[state.stepIndex];
    if (!step) break;
    if (step.kind === "rating_checkpoint") {
      for (const factor of state.resolvedPlan!.factors) state = recordStepRating(state, factor.itemId, factor.category, step.checkpoint!, 5);
    } else if (step.kind === "cognitive_reassessment") {
      state = answerReassessment(state, "not_stuck");
    } else if (step.kind === "desired_state_rating") {
      state = recordDesiredStateRating(state, 8);
    } else if (step.kind === "state_action" || step.kind === "factor_action") {
      state = confirmActionCompleted(markActionReached(state));
    } else {
      state = advanceStep(state);
    }
    guard++;
  }
  guard = 0;
  while (state.phase === "tail" && guard < 10) {
    state = advanceTail(state);
    guard++;
  }
  return state;
}

test("terminal facts for a completed no-State Full route: sessionId/routeConfigId/mode/cadence, no State fields, terminalCompleted true", () => {
  const cfg = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  const state = runFullToComplete(cfg, [thought()]);
  assert.equal(state.phase, "complete");
  const facts = toCombinedLiveSessionFacts(state);
  assert.equal(facts.sessionId, "session-1");
  assert.equal(facts.routeConfigId, "route1");
  assert.equal(facts.mode, "full");
  assert.equal(facts.cadence, "reactive");
  assert.deepEqual(facts.configuredItemIds, ["t1"]);
  assert.deepEqual(facts.selectedItemIds, ["t1"]);
  assert.deepEqual(facts.practicedItemIds, ["t1"]);
  assert.deepEqual(facts.completedTypes, ["thought"]);
  assert.equal(facts.primaryFactorId, "t1");
  assert.equal(facts.stateProfileId, null);
  assert.equal(facts.stateIncluded, false);
  assert.equal(facts.stateInclusionDecision, null, "policy was 'none' -- no decide_in_live answer was ever needed");
  assert.equal(facts.presenceSelectedForSession, false);
  assert.equal(facts.presenceMode, "skipped");
  assert.equal(facts.actionOutcomeKind, "factor_only");
  assert.equal(facts.factorActionReached, true);
  assert.equal(facts.factorActionCompleted, true);
  assert.equal(facts.stateActionReached, false);
  assert.equal(facts.stateActionCompleted, false);
  assert.equal(facts.sharedActionCompleted, false);
  assert.equal(facts.terminalCompleted, true);
});

test("terminal facts for a completed with-State (decide_in_live, Yes) Full route resolve the real StateProfile id and preserve the decision answer", () => {
  const cfg = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "different_actions" } }, stateInclusionPolicy: "decide_in_live", stateProfileId: "s1" });
  let state = createCombinedLiveSession(baseInput({ items: [thought()], config: cfg, stateProfiles: [completeState()] }));
  while (state.awarenessSteps[state.awarenessIndex]?.kind === "recognition") state = advanceAwarenessRecognition(state);
  state = recordAwarenessRating(state, "t1", "thought", 6);
  assert.equal(state.phase, "state_decision");
  state = answerStateDecision(state, true);
  let guard = 0;
  while (state.phase === "steps" && guard < 30) {
    const step = state.remainingSteps[state.stepIndex];
    if (!step) break;
    if (step.kind === "rating_checkpoint") {
      for (const factor of state.resolvedPlan!.factors) state = recordStepRating(state, factor.itemId, factor.category, step.checkpoint!, 5);
    } else if (step.kind === "cognitive_reassessment") {
      state = answerReassessment(state, "not_stuck");
    } else if (step.kind === "desired_state_rating") {
      state = recordDesiredStateRating(state, 8);
    } else if (step.kind === "state_action" || step.kind === "factor_action") {
      state = confirmActionCompleted(markActionReached(state));
    } else {
      state = advanceStep(state);
    }
    guard++;
  }
  guard = 0;
  while (state.phase === "tail" && guard < 10) {
    state = advanceTail(state);
    guard++;
  }
  const facts = toCombinedLiveSessionFacts(state);
  assert.equal(facts.stateProfileId, "s1");
  assert.equal(facts.stateIncluded, true);
  assert.equal(facts.stateInclusionDecision, true);
  assert.equal(facts.desiredStateRating, 8);
});

test("Mini terminal facts contain no fabricated ratings -- factorRatingHistory empty, desiredStateRating null, reassessmentAnswer null, even on a with-State completed route", () => {
  const cfg = config({ interferenceItemIds: ["t1", "u1"], itemRelationships: { t1: { actionRelationship: "same_action" }, u1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  let state = chooseTiePrimaryFactor(createCombinedLiveSession(baseInput({ mode: "mini", items: [thought(), urge()], config: cfg, stateProfiles: [completeState()] })), "t1");
  let guard = 0;
  while (state.phase === "steps" && guard < 30) {
    const step = state.remainingSteps[state.stepIndex];
    if (!step) break;
    if (step.kind === "state_action" || step.kind === "factor_action") {
      state = confirmActionCompleted(markActionReached(state));
    } else {
      state = advanceStep(state);
    }
    guard++;
  }
  guard = 0;
  while (state.phase === "tail" && guard < 10) {
    state = advanceTail(state);
    guard++;
  }
  assert.equal(state.phase, "complete");
  const facts = toCombinedLiveSessionFacts(state);
  assert.equal(facts.mode, "mini");
  assert.deepEqual(facts.factorRatingHistory, []);
  assert.equal(facts.desiredStateRating, null);
  assert.equal(facts.reassessmentAnswer, null);
  assert.equal(facts.terminalCompleted, true);
  assert.equal(facts.stateIncluded, true);
});

test("shared_explicit terminal facts: sharedActionCompleted true, stateActionCompleted/factorActionCompleted both false -- never double-reported", () => {
  const cfg = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const state = runFullToComplete(cfg, [thought()], [completeState()]);
  const facts = toCombinedLiveSessionFacts(state);
  assert.equal(facts.actionOutcomeKind, "shared_explicit");
  assert.equal(facts.sharedActionCompleted, true);
  assert.equal(facts.stateActionCompleted, false);
  assert.equal(facts.factorActionCompleted, false);
});

test("facts computed before terminalCompleted honestly report terminalCompleted: false -- never persisted, never fabricated as done", () => {
  const cfg = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  const state = createCombinedLiveSession(baseInput({ items: [thought()], config: cfg }));
  const facts = toCombinedLiveSessionFacts(state);
  assert.equal(facts.terminalCompleted, false);
  assert.equal(facts.practicedItemIds.length, 0, "nothing practiced yet -- the plan has not even resolved");
});
