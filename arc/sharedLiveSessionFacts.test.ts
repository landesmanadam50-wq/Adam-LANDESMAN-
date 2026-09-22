import test from "node:test";
import assert from "node:assert/strict";

import { toArcGoalSharedFacts, toPersonalDevelopmentSharedFacts } from "./sharedLiveSessionFacts.ts";
import type { ArcGoalSharedFactsInput } from "./sharedLiveSessionFacts.ts";
import { toCombinedLiveSessionFacts } from "./combinedLiveSessionFacts.ts";
import { createCombinedLiveSession } from "./combinedLiveSession.ts";
import type { CreateCombinedLiveSessionInput } from "./combinedLiveSession.ts";
import { createEmptyPersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import type { PersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import { createEmptyArcGoalLiveState } from "./arcGoalEngine.ts";
import type { ArcGoalLiveState } from "./arcGoalEngine.ts";
import { createEmptyLiveState } from "./types.ts";
import type { ArcLiveState } from "./types.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function config(overrides: Partial<PersonalDevelopmentRouteConfig> = {}): PersonalDevelopmentRouteConfig {
  return { ...createEmptyPersonalDevelopmentRouteConfig("route1", "prog1", NOW), ...overrides };
}

function baseCombinedInput(overrides: Partial<CreateCombinedLiveSessionInput> = {}): CreateCombinedLiveSessionInput {
  return { mode: "full", config: config(), items: [], stateProfiles: [], presenceArcs: [], startedAt: NOW, generateSessionId: () => "session-1", ...overrides };
}

function outerSession(overrides: Partial<ArcLiveState> = {}): ArcLiveState {
  return { ...createEmptyLiveState(), ...overrides };
}

function goalState(overrides: Partial<ArcGoalLiveState> = {}): ArcGoalLiveState {
  return { ...createEmptyArcGoalLiveState(), ...overrides };
}

function arcGoalFactsInput(overrides: Partial<ArcGoalSharedFactsInput> = {}): ArcGoalSharedFactsInput {
  return {
    sessionId: "ag-session-1",
    arcGoalId: "goal-1",
    weeklyActionId: null,
    outerSession: outerSession(),
    goalState: goalState(),
    mappingActionRelationship: null,
    terminalCompleted: false,
    ...overrides,
  };
}

// --- Personal Development wrapper ---

test("toPersonalDevelopmentSharedFacts tags the track and delegates entirely to toCombinedLiveSessionFacts", () => {
  const state = createCombinedLiveSession(baseCombinedInput());
  const wrapped = toPersonalDevelopmentSharedFacts(state);
  assert.equal(wrapped.track, "personal_development");
  assert.deepEqual(wrapped.facts, toCombinedLiveSessionFacts(state));
});

test("toPersonalDevelopmentSharedFacts forwards the cadence argument unchanged", () => {
  const state = createCombinedLiveSession(baseCombinedInput());
  const wrapped = toPersonalDevelopmentSharedFacts(state, "proactive");
  assert.equal(wrapped.facts.cadence, "proactive");
});

test("toPersonalDevelopmentSharedFacts defaults cadence to reactive, same as toCombinedLiveSessionFacts", () => {
  const state = createCombinedLiveSession(baseCombinedInput());
  const wrapped = toPersonalDevelopmentSharedFacts(state);
  assert.equal(wrapped.facts.cadence, "reactive");
});

// --- ArcGoal projection ---

test("toArcGoalSharedFacts tags the track and carries caller-supplied identity fields through unchanged", () => {
  const result = toArcGoalSharedFacts(arcGoalFactsInput({ arcGoalId: "goal-42", weeklyActionId: "wa-1" }));
  assert.equal(result.track, "arc_goal");
  assert.equal(result.sessionId, "ag-session-1");
  assert.equal(result.arcGoalId, "goal-42");
  assert.equal(result.weeklyActionId, "wa-1");
});

test("no mapping selected produces mappingKind/mappingId/actionRelationship all null -- an identity-only pass", () => {
  const result = toArcGoalSharedFacts(arcGoalFactsInput({ mappingActionRelationship: "same_action" }));
  assert.equal(result.mappingKind, null);
  assert.equal(result.mappingId, null, "no bridge selected");
  assert.equal(result.actionRelationship, null, "never surfaced when no mapping was actually selected, even if the caller passed one");
});

test("a selected supportive-state mapping produces mappingKind 'interfering' and carries its own actionRelationship", () => {
  const result = toArcGoalSharedFacts(
    arcGoalFactsInput({
      goalState: goalState({ selectedMappingId: "m1" }),
      mappingActionRelationship: "different_actions",
    })
  );
  assert.equal(result.mappingKind, "interfering");
  assert.equal(result.mappingId, "m1");
  assert.equal(result.actionRelationship, "different_actions");
});

test("a selected urge mapping produces mappingKind 'urge'", () => {
  const result = toArcGoalSharedFacts(arcGoalFactsInput({ goalState: goalState({ selectedUrgeMappingId: "um1" }) }));
  assert.equal(result.mappingKind, "urge");
  assert.equal(result.mappingId, "um1");
});

test("selectedMappingId takes precedence when (structurally impossible but defensively checked) both are somehow set", () => {
  const result = toArcGoalSharedFacts(arcGoalFactsInput({ goalState: goalState({ selectedMappingId: "m1", selectedUrgeMappingId: "um1" }) }));
  assert.equal(result.mappingKind, "interfering");
  assert.equal(result.mappingId, "m1");
});

test("executionMode is read straight off goalState, including null before the bridge resolves it", () => {
  assert.equal(toArcGoalSharedFacts(arcGoalFactsInput()).executionMode, null);
  const result = toArcGoalSharedFacts(arcGoalFactsInput({ goalState: goalState({ executionMode: "mini" }) }));
  assert.equal(result.executionMode, "mini");
});

test("identityActionCompleted mirrors ArcLiveState.realActionCompleted exactly", () => {
  assert.equal(toArcGoalSharedFacts(arcGoalFactsInput()).identityActionCompleted, false);
  const result = toArcGoalSharedFacts(arcGoalFactsInput({ outerSession: outerSession({ realActionCompleted: true }) }));
  assert.equal(result.identityActionCompleted, true);
});

test("outerRunCompleted is true only once the outer ArcLiveState's currentArcStage is exactly 'complete'", () => {
  assert.equal(toArcGoalSharedFacts(arcGoalFactsInput()).outerRunCompleted, false, "fresh session starts at trigger_selection");
  const midSession = toArcGoalSharedFacts(arcGoalFactsInput({ outerSession: outerSession({ currentArcStage: "act" }) }));
  assert.equal(midSession.outerRunCompleted, false);
  const finished = toArcGoalSharedFacts(arcGoalFactsInput({ outerSession: outerSession({ currentArcStage: "complete" }) }));
  assert.equal(finished.outerRunCompleted, true);
});

test("terminalCompleted is exactly the caller-supplied value -- never derived from outerRunCompleted alone", () => {
  // The outer run reaching 'complete' does NOT by itself mean the session is over --
  // gratitude/reflection and the final goal_action_confirm confirmation still follow it.
  const outerDoneOnly = toArcGoalSharedFacts(
    arcGoalFactsInput({ outerSession: outerSession({ currentArcStage: "complete", realActionCompleted: true }), terminalCompleted: false })
  );
  assert.equal(outerDoneOnly.outerRunCompleted, true);
  assert.equal(outerDoneOnly.terminalCompleted, false, "goal_action_confirm was never confirmed by this caller");

  const trulyDone = toArcGoalSharedFacts(
    arcGoalFactsInput({ outerSession: outerSession({ currentArcStage: "complete", realActionCompleted: true }), terminalCompleted: true })
  );
  assert.equal(trulyDone.terminalCompleted, true);
});

test("toArcGoalSharedFacts never mutates its inputs", () => {
  const input = arcGoalFactsInput({ goalState: goalState({ selectedMappingId: "m1" }) });
  const snapshot = JSON.parse(JSON.stringify(input));
  toArcGoalSharedFacts(input);
  assert.deepEqual(input, snapshot);
});
