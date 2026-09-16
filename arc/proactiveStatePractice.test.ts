import test from "node:test";
import assert from "node:assert/strict";

import {
  PROACTIVE_STATE_PRACTICE_STEP_ORDER,
  getFirstProactiveStatePracticeStep,
  getNextProactiveStatePracticeStep,
  getProactiveStatePracticeStepCopy,
} from "./proactiveStatePractice.ts";
import { createEmptyStateProfile } from "./stateProfile.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function state(overrides: Partial<ReturnType<typeof createEmptyStateProfile>> = {}) {
  return { ...createEmptyStateProfile("state1", "מצב", null, NOW), ...overrides };
}

test("the proactive route contains no interference-oriented stages -- no recognition/Stay/Acceptance/reassessment/embedded-Presence kind exists in its own step type at all", () => {
  const interferenceOrientedKinds = ["recognition", "shared_stay", "shared_acceptance", "cognitive_reassessment", "presence_embedded"];
  for (const kind of PROACTIVE_STATE_PRACTICE_STEP_ORDER) {
    assert.equal(interferenceOrientedKinds.includes(kind), false);
  }
});

test("fixed order: state_intention -> embodiment -> state_mantra -> encoding -> beneficial_action", () => {
  assert.deepEqual(PROACTIVE_STATE_PRACTICE_STEP_ORDER, ["state_intention", "embodiment", "state_mantra", "encoding", "beneficial_action"]);
});

test("getFirstProactiveStatePracticeStep starts at state_intention", () => {
  assert.equal(getFirstProactiveStatePracticeStep(), "state_intention");
});

test("getNextProactiveStatePracticeStep walks the fixed order and returns null at the end -- never loops", () => {
  let current = getFirstProactiveStatePracticeStep();
  const visited = [current];
  for (let i = 0; i < PROACTIVE_STATE_PRACTICE_STEP_ORDER.length + 2; i++) {
    const next = getNextProactiveStatePracticeStep(current);
    if (next === null) break;
    current = next;
    visited.push(current);
  }
  assert.deepEqual(visited, PROACTIVE_STATE_PRACTICE_STEP_ORDER);
  assert.equal(getNextProactiveStatePracticeStep("beneficial_action"), null);
});

test("getProactiveStatePracticeStepCopy: uses only existing StateProfile fields, never invents content", () => {
  const s = state({ purpose: "להרגיש בטוח", stateMantra: "אני יציב", encodingCue: "יד על החזה", action: "לצאת להליכה", actionTimerConfig: { durationMinutes: 5 } });
  assert.equal(getProactiveStatePracticeStepCopy("state_intention", s).body, "להרגיש בטוח");
  assert.equal(getProactiveStatePracticeStepCopy("state_mantra", s).body, "אני יציב");
  assert.equal(getProactiveStatePracticeStepCopy("encoding", s).body, "יד על החזה");
  const action = getProactiveStatePracticeStepCopy("beneficial_action", s);
  assert.equal(action.body, "לצאת להליכה");
  assert.equal(action.durationMinutes, 5);
});

test("getProactiveStatePracticeStepCopy('embodiment'): joins every embodiment field that is set", () => {
  const s = state({ regulationAnchor: "עוגן", bodyLanguageCue: "תנוחה זקופה", gazeCue: "מבט רגוע" });
  const copy = getProactiveStatePracticeStepCopy("embodiment", s);
  assert.ok(copy.body.includes("עוגן"));
  assert.ok(copy.body.includes("תנוחה זקופה"));
  assert.ok(copy.body.includes("מבט רגוע"));
});

test("getProactiveStatePracticeStepCopy: blank fields fall back to a generic line, never crash", () => {
  const s = state();
  for (const kind of PROACTIVE_STATE_PRACTICE_STEP_ORDER) {
    const copy = getProactiveStatePracticeStepCopy(kind, s);
    assert.ok(copy.body.length > 0);
  }
});
