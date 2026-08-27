import test from "node:test";
import assert from "node:assert/strict";

import { getFirstArcStage, getNextArcStage } from "./arcEngine.ts";
import { createEmptyLiveState } from "./types.ts";
import type { ArcLiveState } from "./types.ts";

function state(overrides: Partial<ArcLiveState> = {}): ArcLiveState {
  return { ...createEmptyLiveState(), ...overrides };
}

test("first stage is trigger_selection", () => {
  assert.equal(getFirstArcStage(), "trigger_selection");
});

test("trigger_selection always goes to presence_check", () => {
  assert.equal(getNextArcStage("trigger_selection", state()), "presence_check");
});

test("high presence skips ARC Thought; low presence enters it", () => {
  const high = state({ triggerType: "reactive_emotion", presenceRating: 8 });
  assert.equal(getNextArcStage("presence_check", high), "sensation_check");

  const low = state({ triggerType: "reactive_emotion", presenceRating: 3 });
  assert.equal(getNextArcStage("presence_check", low), "arc_thought_awareness");
});

test("ARC Thought is a straight line of 4 stages, then routes same as a presence_check skip would", () => {
  const s = state({ triggerType: "reactive_urge", presenceRating: 3 });
  assert.equal(getNextArcStage("arc_thought_awareness", s), "arc_thought_combined_attention");
  assert.equal(getNextArcStage("arc_thought_combined_attention", s), "arc_thought_expand_presence");
  assert.equal(getNextArcStage("arc_thought_expand_presence", s), "arc_thought_presence_recheck");
  assert.equal(getNextArcStage("arc_thought_presence_recheck", s), "sensation_check");
});

test("reactive_emotion and reactive_urge both route to sensation_check; proactive routes to desired_state_check", () => {
  assert.equal(getNextArcStage("presence_check", state({ triggerType: "reactive_emotion", presenceRating: 9 })), "sensation_check");
  assert.equal(getNextArcStage("presence_check", state({ triggerType: "reactive_urge", presenceRating: 9 })), "sensation_check");
  assert.equal(getNextArcStage("presence_check", state({ triggerType: "proactive", presenceRating: 9 })), "desired_state_check");
});

test("sensation_check branches into all four reactive intensity bands", () => {
  assert.equal(getNextArcStage("sensation_check", state({ sensationIntensity: 9 })), "stay");
  assert.equal(getNextArcStage("sensation_check", state({ sensationIntensity: 7 })), "reactive_transition_check");
  assert.equal(getNextArcStage("sensation_check", state({ sensationIntensity: 5 })), "regulate");
  assert.equal(getNextArcStage("sensation_check", state({ sensationIntensity: 2 })), "encode");
});

test("stay -> accept -> reactive_transition_check is a fixed line", () => {
  assert.equal(getNextArcStage("stay", state()), "accept");
  assert.equal(getNextArcStage("accept", state()), "reactive_transition_check");
});

test("reactive_transition_check loops back to stay when not ready, advances to regulate when ready", () => {
  assert.equal(getNextArcStage("reactive_transition_check", state({ regulationReady: false })), "stay");
  assert.equal(getNextArcStage("reactive_transition_check", state({ regulationReady: null })), "stay");
  assert.equal(getNextArcStage("reactive_transition_check", state({ regulationReady: true })), "regulate");
});

test("desired_state_check branches by getProactiveStage's threshold", () => {
  assert.equal(getNextArcStage("desired_state_check", state({ desiredStateRating: 3 })), "regulate");
  assert.equal(getNextArcStage("desired_state_check", state({ desiredStateRating: 7 })), "encode");
});

test("regulate always continues to encode, regardless of how it was reached", () => {
  assert.equal(getNextArcStage("regulate", state()), "encode");
});

test("the tail is a fixed line: encode -> act -> success_focus -> complete", () => {
  assert.equal(getNextArcStage("encode", state()), "act");
  assert.equal(getNextArcStage("act", state()), "success_focus");
  assert.equal(getNextArcStage("success_focus", state()), "complete");
});

test("complete is terminal", () => {
  assert.equal(getNextArcStage("complete", state()), "complete");
});
