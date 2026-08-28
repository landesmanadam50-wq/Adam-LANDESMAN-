import test from "node:test";
import assert from "node:assert/strict";

import {
  getAvailableLiveTriggers,
  getAvailableProactiveTargets,
  getFirstArcStage,
  getNextArcStage,
  resolveEncodingTarget,
  resolveLiveRoute,
} from "./arcEngine.ts";
import { createEmptyLiveState } from "./types.ts";
import type { ArcBuildProfile, ArcLiveState } from "./types.ts";
import { ARC_CONFIG } from "./config.ts";

function profile(overrides: Partial<ArcBuildProfile> = {}): ArcBuildProfile {
  return {
    programPath: "standard_3_week",
    identityActionNeeded: false,
    goal: null,
    interferingState: "פחד",
    challengeContext: null,
    supportiveState: "חמלה",
    stateEncoding: null,
    internalAction: "סריקת גוף",
    desiredIdentity: null,
    identityInterferingEmotion: null,
    identityEncoding: null,
    identityAction: null,
    habit: "גלילה ברשת",
    beneficialAction: "לגשת ולפתוח שיחה",
    preventiveAction: null,
    regulationTool: "נשימה 4-7-8",
    actionDuration: null,
    successFocusDuration: null,
    ...overrides,
  };
}

function state(overrides: Partial<ArcLiveState> = {}): ArcLiveState {
  return { ...createEmptyLiveState(), ...overrides };
}

// ---------------------------------------------------------------------------
// Layer-aware availability
// ---------------------------------------------------------------------------

test("getAvailableLiveTriggers offers nothing when no layer is active", () => {
  assert.deepEqual(getAvailableLiveTriggers([]), []);
});

test("getAvailableLiveTriggers never offers reactive_urge without the habit layer", () => {
  assert.deepEqual(getAvailableLiveTriggers(["state"]), ["reactive_emotion", "proactive"]);
  assert.deepEqual(getAvailableLiveTriggers(["identity"]), ["reactive_emotion", "proactive"]);
  assert.deepEqual(getAvailableLiveTriggers(["state", "identity"]), ["reactive_emotion", "proactive"]);
});

test("getAvailableLiveTriggers offers reactive_urge once habit is active", () => {
  assert.deepEqual(getAvailableLiveTriggers(["habit"]), ["reactive_emotion", "reactive_urge", "proactive"]);
});

test("resolveLiveRoute throws for a trigger not available under these active layers", () => {
  assert.throws(() => resolveLiveRoute("reactive_urge", ["state"]));
});

test("resolveLiveRoute succeeds and matches getRouteAfterPresence for an available trigger", () => {
  assert.equal(resolveLiveRoute("reactive_urge", ["habit"]), "reactive_habit");
  assert.equal(resolveLiveRoute("reactive_emotion", ["state"]), "reactive_state_identity");
  assert.equal(resolveLiveRoute("proactive", ["state"]), "proactive");
});

test("getAvailableProactiveTargets only includes layers that are both active and have real data", () => {
  const p = profile({ supportiveState: "חמלה", desiredIdentity: null, beneficialAction: "פעולה" });
  const targets = getAvailableProactiveTargets(["state", "identity", "habit"], p);
  assert.deepEqual(
    targets.map((t) => t.layer),
    ["state", "habit"],
    "identity is active but has no desiredIdentity data, so it's excluded"
  );
});

test("getAvailableProactiveTargets excludes a layer with data if the layer itself isn't active", () => {
  const p = profile({ desiredIdentity: "אומץ", identityEncoding: null });
  const targets = getAvailableProactiveTargets(["state"], p); // identity not active
  assert.equal(targets.some((t) => t.layer === "identity"), false);
});

// ---------------------------------------------------------------------------
// Encoding target resolution
// ---------------------------------------------------------------------------

test("resolveEncodingTarget routes reactive_urge to the habit layer", () => {
  const p = profile({ beneficialAction: "לגשת ולפתוח שיחה" });
  const resolved = resolveEncodingTarget({ activeLayers: ["habit"], triggerType: "reactive_urge", selectedTarget: null, buildProfile: p });
  assert.equal(resolved.layer, "habit");
  assert.equal(resolved.actionLabel, "לגשת ולפתוח שיחה");
});

test("resolveEncodingTarget routes reactive_emotion to the state layer", () => {
  const p = profile({ internalAction: "סריקת גוף" });
  const resolved = resolveEncodingTarget({ activeLayers: ["state"], triggerType: "reactive_emotion", selectedTarget: null, buildProfile: p });
  assert.equal(resolved.layer, "state");
  assert.equal(resolved.actionLabel, "סריקת גוף");
});

test("resolveEncodingTarget prefers identity for proactive when an identity encoding exists", () => {
  const p = profile({
    identityAction: "לומר שלום",
    identityEncoding: { target: "אומץ", bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: "אני בטוח כאן" },
  });
  const resolved = resolveEncodingTarget({ activeLayers: ["identity"], triggerType: "proactive", selectedTarget: null, buildProfile: p });
  assert.equal(resolved.layer, "identity");
});

test("resolveEncodingTarget falls back to state for proactive without an identity encoding", () => {
  const p = profile({ identityEncoding: null });
  const resolved = resolveEncodingTarget({ activeLayers: ["state"], triggerType: "proactive", selectedTarget: null, buildProfile: p });
  assert.equal(resolved.layer, "state");
});

test("resolveEncodingTarget never falls back to an inactive layer, even one with stale profile data", () => {
  // Habit Only: state isn't active, but the profile might still carry
  // leftover state fields from a previous program. proactive must land
  // on habit, not silently fall through to an inactive "state".
  const p = profile({
    interferingState: "stale",
    stateEncoding: { target: "stale", bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: null },
    beneficialAction: "לגשת ולפתוח שיחה",
  });
  const resolved = resolveEncodingTarget({ activeLayers: ["habit"], triggerType: "proactive", selectedTarget: null, buildProfile: p });
  assert.equal(resolved.layer, "habit", "must resolve to the only actually-active layer, not the stale state data");
});

test("resolveEncodingTarget for Identity Only: reactive_emotion resolves to identity, not an inactive state", () => {
  const p = profile({
    interferingState: null,
    internalAction: null,
    identityAction: "לומר שלום",
    identityEncoding: { target: "אומץ", bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: null },
  });
  const resolved = resolveEncodingTarget({ activeLayers: ["identity"], triggerType: "reactive_emotion", selectedTarget: null, buildProfile: p });
  assert.equal(resolved.layer, "identity");
});

test("resolveEncodingTarget honors an explicit selectedTarget override regardless of trigger", () => {
  const p = profile({ beneficialAction: "פעולה" });
  const resolved = resolveEncodingTarget({ activeLayers: ["habit"], triggerType: "reactive_emotion", selectedTarget: "habit", buildProfile: p });
  assert.equal(resolved.layer, "habit");
});

// ---------------------------------------------------------------------------
// Sequencer: entry, ARC Thought, routing
// ---------------------------------------------------------------------------

test("first stage is trigger_selection", () => {
  assert.equal(getFirstArcStage(), "trigger_selection");
});

test("trigger_selection always goes to presence_check", () => {
  assert.equal(getNextArcStage("trigger_selection", state(), profile()).stage, "presence_check");
});

test("high presence skips ARC Thought; low presence enters it", () => {
  const high = state({ triggerType: "reactive_emotion", presenceRating: 8 });
  assert.equal(getNextArcStage("presence_check", high, profile()).stage, "sensation_check");

  const low = state({ triggerType: "reactive_emotion", presenceRating: 3 });
  assert.equal(getNextArcStage("presence_check", low, profile()).stage, "arc_thought_awareness");
});

test("ARC Thought is a straight line through its first three stages", () => {
  const s = state({ triggerType: "reactive_urge", presenceRating: 3 });
  const p = profile();
  assert.equal(getNextArcStage("arc_thought_awareness", s, p).stage, "arc_thought_combined_attention");
  assert.equal(getNextArcStage("arc_thought_combined_attention", s, p).stage, "arc_thought_expand_presence");
  assert.equal(getNextArcStage("arc_thought_expand_presence", s, p).stage, "arc_thought_presence_recheck");
});

test("arc_thought_presence_recheck returns to the stored route once presence recovers", () => {
  const p = profile();
  assert.equal(
    getNextArcStage("arc_thought_presence_recheck", state({ triggerType: "reactive_emotion", presenceRating: 7 }), p).stage,
    "sensation_check"
  );
  assert.equal(
    getNextArcStage("arc_thought_presence_recheck", state({ triggerType: "proactive", presenceRating: 7 }), p).stage,
    "desired_state_check"
  );
});

test("arc_thought_presence_recheck loops back to expand_presence, incrementing loopIterationCount, while presence stays low", () => {
  const s = state({ triggerType: "reactive_emotion", presenceRating: 4, loopIterationCount: 0 });
  const outcome = getNextArcStage("arc_thought_presence_recheck", s, profile());
  assert.equal(outcome.stage, "arc_thought_expand_presence");
  assert.equal(outcome.loopIterationCount, 1);
});

test("arc_thought_presence_recheck stops looping once the safety cap is hit and forces continuation", () => {
  const s = state({
    triggerType: "reactive_emotion",
    presenceRating: 4,
    loopIterationCount: ARC_CONFIG.safety.maxLoopIterations,
  });
  const outcome = getNextArcStage("arc_thought_presence_recheck", s, profile());
  assert.equal(outcome.stage, "sensation_check", "forced forward despite presence still being low");
  assert.equal(outcome.loopIterationCount, ARC_CONFIG.safety.maxLoopIterations, "does not increment past the cap");
});

// ---------------------------------------------------------------------------
// Preventive action
// ---------------------------------------------------------------------------

test("reactive_urge routes through preventive_action_check only when a preventive action is configured", () => {
  const withPlan = profile({ preventiveAction: "לצאת להליכה" });
  const s = state({ triggerType: "reactive_urge", presenceRating: 8 });
  assert.equal(getNextArcStage("presence_check", s, withPlan).stage, "preventive_action_check");

  const withoutPlan = profile({ preventiveAction: null });
  assert.equal(getNextArcStage("presence_check", s, withoutPlan).stage, "sensation_check");
});

test("preventive_action_check branches on wantsPreventiveAction", () => {
  const p = profile({ preventiveAction: "לצאת להליכה" });
  assert.equal(
    getNextArcStage("preventive_action_check", state({ wantsPreventiveAction: true }), p).stage,
    "preventive_action"
  );
  assert.equal(
    getNextArcStage("preventive_action_check", state({ wantsPreventiveAction: false }), p).stage,
    "sensation_check"
  );
});

test("preventive_action always continues to sensation_check", () => {
  assert.equal(getNextArcStage("preventive_action", state(), profile()).stage, "sensation_check");
});

test("reactive_emotion never routes through preventive action, even with one configured", () => {
  const p = profile({ preventiveAction: "לצאת להליכה" });
  const s = state({ triggerType: "reactive_emotion", presenceRating: 8 });
  assert.equal(getNextArcStage("presence_check", s, p).stage, "sensation_check");
});

// ---------------------------------------------------------------------------
// Reactive intensity classification and the stay/accept/transition loop
// ---------------------------------------------------------------------------

test("sensation_check branches into all four reactive intensity bands", () => {
  const p = profile();
  assert.equal(getNextArcStage("sensation_check", state({ sensationIntensity: 9 }), p).stage, "stay");
  assert.equal(getNextArcStage("sensation_check", state({ sensationIntensity: 7 }), p).stage, "reactive_transition_check");
  assert.equal(getNextArcStage("sensation_check", state({ sensationIntensity: 5 }), p).stage, "regulate");
  assert.equal(getNextArcStage("sensation_check", state({ sensationIntensity: 2 }), p).stage, "encode");
});

test("stay always continues to accept", () => {
  assert.equal(getNextArcStage("stay", state(), profile()).stage, "accept");
});

test("accept loops back to sensation_check (an intensity re-check), incrementing loopIterationCount", () => {
  const outcome = getNextArcStage("accept", state({ loopIterationCount: 0 }), profile());
  assert.equal(outcome.stage, "sensation_check");
  assert.equal(outcome.loopIterationCount, 1);
});

test("accept forces forward to regulate once the safety cap is hit", () => {
  const outcome = getNextArcStage("accept", state({ loopIterationCount: ARC_CONFIG.safety.maxLoopIterations }), profile());
  assert.equal(outcome.stage, "regulate");
});

test("reactive_transition_check advances to regulate when ready, loops back to stay when not", () => {
  const p = profile();
  const ready = getNextArcStage("reactive_transition_check", state({ regulationReady: true, loopIterationCount: 0 }), p);
  assert.equal(ready.stage, "regulate");

  const notReady = getNextArcStage("reactive_transition_check", state({ regulationReady: false, loopIterationCount: 0 }), p);
  assert.equal(notReady.stage, "stay");
  assert.equal(notReady.loopIterationCount, 1);
});

test("reactive_transition_check forces forward to regulate once the safety cap is hit, even if not ready", () => {
  const outcome = getNextArcStage(
    "reactive_transition_check",
    state({ regulationReady: false, loopIterationCount: ARC_CONFIG.safety.maxLoopIterations }),
    profile()
  );
  assert.equal(outcome.stage, "regulate");
});

test("regulate on the reactive path loops back to sensation_check for a re-check", () => {
  const outcome = getNextArcStage("regulate", state({ triggerType: "reactive_emotion", loopIterationCount: 0 }), profile());
  assert.equal(outcome.stage, "sensation_check");
  assert.equal(outcome.loopIterationCount, 1);
});

test("regulate on the reactive path forces forward to encode once the safety cap is hit", () => {
  const outcome = getNextArcStage(
    "regulate",
    state({ triggerType: "reactive_emotion", loopIterationCount: ARC_CONFIG.safety.maxLoopIterations }),
    profile()
  );
  assert.equal(outcome.stage, "encode");
});

// ---------------------------------------------------------------------------
// Proactive path
// ---------------------------------------------------------------------------

test("desired_state_check branches by getProactiveStage's threshold", () => {
  const p = profile();
  assert.equal(getNextArcStage("desired_state_check", state({ desiredStateRating: 3 }), p).stage, "regulate");
  assert.equal(getNextArcStage("desired_state_check", state({ desiredStateRating: 7 }), p).stage, "encode");
});

test("regulate on the proactive path loops back to desired_state_check, not sensation_check", () => {
  const outcome = getNextArcStage("regulate", state({ triggerType: "proactive", loopIterationCount: 0 }), profile());
  assert.equal(outcome.stage, "desired_state_check");
  assert.equal(outcome.loopIterationCount, 1);
});

test("regulate on the proactive path forces forward to encode once the safety cap is hit", () => {
  const outcome = getNextArcStage(
    "regulate",
    state({ triggerType: "proactive", loopIterationCount: ARC_CONFIG.safety.maxLoopIterations }),
    profile()
  );
  assert.equal(outcome.stage, "encode");
});

test("proactive never uses the reactive intensity thresholds", () => {
  // desiredStateRating 7 must be classified by getProactiveStage's threshold (5), not
  // getReactiveStage's (which would call 7 "reactive_transition_check", not a real stage here).
  const outcome = getNextArcStage("desired_state_check", state({ desiredStateRating: 7 }), profile());
  assert.notEqual(outcome.stage, "reactive_transition_check");
});

// ---------------------------------------------------------------------------
// Tail
// ---------------------------------------------------------------------------

test("the tail is a fixed line: encode -> act -> success_focus -> complete", () => {
  const p = profile();
  const s = state();
  assert.equal(getNextArcStage("encode", s, p).stage, "act");
  assert.equal(getNextArcStage("act", s, p).stage, "success_focus");
  assert.equal(getNextArcStage("success_focus", s, p).stage, "complete");
});

test("complete is terminal", () => {
  assert.equal(getNextArcStage("complete", state(), profile()).stage, "complete");
});
