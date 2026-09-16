import test from "node:test";
import assert from "node:assert/strict";

import {
  PROACTIVE_STATE_PRACTICE_STEP_ORDER,
  getFirstProactiveStatePracticeStep,
  getNextProactiveStatePracticeStep,
  getProactiveStatePracticeStepCopy,
} from "./proactiveStatePractice.ts";
import { createEmptyStateProfile } from "./stateProfile.ts";
import { containsInductionPattern } from "./instructions.ts";

const NOW = "2026-01-01T00:00:00.000Z";

test("the fixed step order has no disturbing-factor concept -- state-only, no recognition/Stay/Acceptance/checkpoint/primary-factor step", () => {
  assert.deepEqual(PROACTIVE_STATE_PRACTICE_STEP_ORDER, ["state_intention", "embodiment", "state_mantra", "encoding", "beneficial_action"]);
  for (const kind of PROACTIVE_STATE_PRACTICE_STEP_ORDER) {
    assert.ok(!kind.includes("recognition"));
    assert.ok(!kind.includes("checkpoint"));
    assert.ok(!kind.includes("primary"));
  }
});

test("getFirstProactiveStatePracticeStep/getNextProactiveStatePracticeStep walk the fixed sequence linearly, never looping or branching", () => {
  let step = getFirstProactiveStatePracticeStep();
  const visited = [step];
  for (let i = 0; i < 10; i++) {
    const next = getNextProactiveStatePracticeStep(step);
    if (next === null) break;
    visited.push(next);
    step = next;
  }
  assert.deepEqual(visited, PROACTIVE_STATE_PRACTICE_STEP_ORDER);
  assert.equal(getNextProactiveStatePracticeStep("beneficial_action"), null);
});

test("beneficial_action step uses only state.action -- never fabricates an ActionRelationship, since there is no factor to relate it to", () => {
  const state = { ...createEmptyStateProfile("s1", "מצב", null, NOW), action: "פעולה מיטיבה מהמצב" };
  const copy = getProactiveStatePracticeStepCopy("beneficial_action", state);
  assert.equal(copy.body, "פעולה מיטיבה מהמצב");
});

test("every step's copy reads only already-existing StateProfile fields and falls back to a generic line when blank, never inventing specifics", () => {
  const emptyState = createEmptyStateProfile("s1", "מצב", null, NOW);
  for (const kind of PROACTIVE_STATE_PRACTICE_STEP_ORDER) {
    const copy = getProactiveStatePracticeStepCopy(kind, emptyState);
    assert.ok(copy.title.length > 0);
    assert.ok(copy.body.length > 0);
  }
});

test("every step's title/body passes the safety validator", () => {
  const state = {
    ...createEmptyStateProfile("s1", "מצב", null, NOW),
    purpose: "מטרה",
    regulationAnchor: "עוגן",
    stateMantra: "משפט",
    encodingCue: "קידוד",
    action: "פעולה",
  };
  for (const kind of PROACTIVE_STATE_PRACTICE_STEP_ORDER) {
    const copy = getProactiveStatePracticeStepCopy(kind, state);
    assert.equal(containsInductionPattern(copy.title), false);
    assert.equal(containsInductionPattern(copy.body), false);
  }
});
