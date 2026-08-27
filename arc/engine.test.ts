import test from "node:test";
import assert from "node:assert/strict";

import { shouldRunArcThought, getRouteAfterPresence, getReactiveStage, getProactiveStage } from "./engine.ts";

test("Test A: reactive_emotion, presence 4 -> ARC Thought needed", () => {
  assert.equal(shouldRunArcThought(4), true);
  assert.equal(getRouteAfterPresence("reactive_emotion"), "reactive_state_identity");
});

test("Test B: reactive_urge, presence 8 -> ARC Thought skipped", () => {
  assert.equal(shouldRunArcThought(8), false);
  assert.equal(getRouteAfterPresence("reactive_urge"), "reactive_habit");
});

test("Test C: proactive, presence 3 -> ARC Thought needed, then presence 6 -> continue", () => {
  assert.equal(shouldRunArcThought(3), true);
  assert.equal(shouldRunArcThought(6), false);
  assert.equal(getRouteAfterPresence("proactive"), "proactive");
});

test("ARC Thought activation is presence-only — trigger type never affects it", () => {
  const triggers: Array<Parameters<typeof getRouteAfterPresence>[0]> = [
    "reactive_emotion",
    "reactive_urge",
    "proactive",
  ];
  for (const t of triggers) {
    assert.equal(shouldRunArcThought(5), true, `trigger ${t} should not change the presence decision`);
  }
});

test("Reactive: intensity 9 -> stay", () => {
  assert.equal(getReactiveStage(9), "stay");
});
test("Reactive: intensity 7 -> transition check", () => {
  assert.equal(getReactiveStage(7), "reactive_transition_check");
});
test("Reactive: intensity 5 -> regulate", () => {
  assert.equal(getReactiveStage(5), "regulate");
});
test("Reactive: intensity 3 -> encode", () => {
  assert.equal(getReactiveStage(3), "encode");
});

test("Proactive: desired state 3 -> regulate (below threshold 5)", () => {
  assert.equal(getProactiveStage(3), "regulate");
});
test("Proactive: desired state 7 -> encode (at/above threshold 5)", () => {
  assert.equal(getProactiveStage(7), "encode");
});
test("Proactive uses its own threshold, not the reactive intensity map", () => {
  assert.notEqual(getProactiveStage(7), getReactiveStage(7));
});
