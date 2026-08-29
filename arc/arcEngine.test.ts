import test from "node:test";
import assert from "node:assert/strict";

import {
  getAvailableLiveTriggers,
  getAvailableProactiveTargets,
  getAvailableReactiveExperiences,
  needsCurrentActionResolution,
  resolveActionDuration,
  getFirstArcStage,
  getNextArcStage,
  needsReactiveStateSelection,
  resolveEncodingRegulationCue,
  resolveEncodingTarget,
  resolveLiveRoute,
  resolveTargetPreventiveAction,
} from "./arcEngine.ts";
import { createEmptyLiveState } from "./types.ts";
import type { ArcBuildProfile, ArcLiveState, DevelopmentLayer } from "./types.ts";
import { ARC_CONFIG } from "./config.ts";

const ALL_LAYERS: DevelopmentLayer[] = ["state", "identity", "habit"];

function profile(overrides: Partial<ArcBuildProfile> = {}): ArcBuildProfile {
  return {
    programPath: "standard_3_week",
    identityActionNeeded: false,
    goal: null,
    interferingState: "פחד",
    challengeContext: null,
    statePreventiveAction: null,
    stateEncodingRegulationCue: null,
    supportiveState: "חמלה",
    stateEncoding: null,
    internalAction: "סריקת גוף",
    desiredIdentity: null,
    identityChallengeContext: null,
    identityInterferingEmotion: null,
    identityPreventiveAction: null,
    identityEncodingRegulationCue: null,
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
// Reactive recognition chooser (#4, #5, #6, #16)
// ---------------------------------------------------------------------------

test("getAvailableReactiveExperiences is empty when nothing is mapped", () => {
  const p = profile({ interferingState: null, identityInterferingEmotion: null });
  assert.deepEqual(getAvailableReactiveExperiences(ALL_LAYERS, p), []);
});

test("getAvailableReactiveExperiences offers both state and identity experiences when both are mapped and active -- Distraction (state) and Craving (identity)", () => {
  const p = profile({ interferingState: "פיזור", identityInterferingEmotion: "תשוקה" });
  const experiences = getAvailableReactiveExperiences(ALL_LAYERS, p);
  assert.deepEqual(
    experiences.map((e) => e.layer),
    ["state", "identity"]
  );
  assert.deepEqual(
    experiences.map((e) => e.label),
    ["פיזור", "תשוקה"]
  );
});

test("getAvailableReactiveExperiences excludes a mapped experience whose layer isn't active", () => {
  const p = profile({ interferingState: "פיזור", identityInterferingEmotion: "תשוקה" });
  const experiences = getAvailableReactiveExperiences(["state"], p);
  assert.deepEqual(
    experiences.map((e) => e.layer),
    ["state"]
  );
});

test("needsReactiveStateSelection is false with fewer than two mapped experiences, or once a target is already selected", () => {
  const zeroMapped = profile({ interferingState: null, identityInterferingEmotion: null });
  assert.equal(needsReactiveStateSelection("reactive_emotion", ALL_LAYERS, zeroMapped, null), false);

  const oneMapped = profile({ interferingState: "פיזור", identityInterferingEmotion: null });
  assert.equal(needsReactiveStateSelection("reactive_emotion", ALL_LAYERS, oneMapped, null), false);

  const twoMapped = profile({ interferingState: "פיזור", identityInterferingEmotion: "תשוקה" });
  assert.equal(needsReactiveStateSelection("reactive_emotion", ALL_LAYERS, twoMapped, null), true);
  assert.equal(needsReactiveStateSelection("reactive_emotion", ALL_LAYERS, twoMapped, "state"), false, "already resolved");
});

test("needsReactiveStateSelection is false for reactive_urge and proactive, regardless of how many experiences are mapped", () => {
  const twoMapped = profile({ interferingState: "פיזור", identityInterferingEmotion: "תשוקה" });
  assert.equal(needsReactiveStateSelection("reactive_urge", ALL_LAYERS, twoMapped, null), false);
  assert.equal(needsReactiveStateSelection("proactive", ALL_LAYERS, twoMapped, null), false);
});

test("trigger_selection stays put (renders the chooser) while 2+ reactive experiences are mapped and none is chosen", () => {
  const p = profile({ interferingState: "פיזור", identityInterferingEmotion: "תשוקה" });
  const s = state({ triggerType: "reactive_emotion" });
  assert.equal(getNextArcStage("trigger_selection", s, p, ALL_LAYERS).stage, "trigger_selection");
});

test("trigger_selection resolves once a Reactive experience is explicitly selected -- Distraction routes through the state (Focus) map, Craving through the identity (Discipline) map, never mixed", () => {
  const p = profile({
    interferingState: "פיזור",
    supportiveState: "מיקוד",
    identityInterferingEmotion: "תשוקה",
    desiredIdentity: "משמעת",
  });

  const distraction = state({ triggerType: "reactive_emotion", selectedTarget: "state" });
  assert.equal(getNextArcStage("trigger_selection", distraction, p, ALL_LAYERS).stage, "presence_check");
  assert.equal(
    resolveEncodingTarget({
      activeLayers: ALL_LAYERS,
      triggerType: "reactive_emotion",
      selectedTarget: distraction.selectedTarget,
      buildProfile: p,
    }).layer,
    "state"
  );

  const craving = state({ triggerType: "reactive_emotion", selectedTarget: "identity" });
  assert.equal(getNextArcStage("trigger_selection", craving, p, ALL_LAYERS).stage, "presence_check");
  assert.equal(
    resolveEncodingTarget({
      activeLayers: ALL_LAYERS,
      triggerType: "reactive_emotion",
      selectedTarget: craving.selectedTarget,
      buildProfile: p,
    }).layer,
    "identity"
  );
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

test("trigger_selection stays put until a trigger type is recorded", () => {
  assert.equal(getNextArcStage("trigger_selection", state(), profile(), ALL_LAYERS).stage, "trigger_selection");
});

test("trigger_selection routes proactive straight to presence_check, unaffected by any mapped Reactive experience or Preventive Action", () => {
  const p = profile({ interferingState: "פיזור", identityInterferingEmotion: "תשוקה", statePreventiveAction: "פעולה" });
  const s = state({ triggerType: "proactive" });
  assert.equal(getNextArcStage("trigger_selection", s, p, ALL_LAYERS).stage, "presence_check");
});

test("high presence skips ARC Thought; low presence enters it", () => {
  const high = state({ triggerType: "reactive_emotion", presenceRating: 8 });
  assert.equal(getNextArcStage("presence_check", high, profile(), ALL_LAYERS).stage, "sensation_check");

  const low = state({ triggerType: "reactive_emotion", presenceRating: 3 });
  assert.equal(getNextArcStage("presence_check", low, profile(), ALL_LAYERS).stage, "arc_thought_awareness");
});

test("ARC Thought is a straight line through its first three stages", () => {
  const s = state({ triggerType: "reactive_urge", presenceRating: 3 });
  const p = profile();
  assert.equal(getNextArcStage("arc_thought_awareness", s, p, ALL_LAYERS).stage, "arc_thought_combined_attention");
  assert.equal(getNextArcStage("arc_thought_combined_attention", s, p, ALL_LAYERS).stage, "arc_thought_expand_presence");
  assert.equal(getNextArcStage("arc_thought_expand_presence", s, p, ALL_LAYERS).stage, "arc_thought_presence_recheck");
});

test("arc_thought_presence_recheck returns to the stored route once presence recovers", () => {
  const p = profile();
  assert.equal(
    getNextArcStage("arc_thought_presence_recheck", state({ triggerType: "reactive_emotion", presenceRating: 7 }), p, ALL_LAYERS).stage,
    "sensation_check"
  );
  assert.equal(
    getNextArcStage("arc_thought_presence_recheck", state({ triggerType: "proactive", presenceRating: 7 }), p, ALL_LAYERS).stage,
    "desired_state_check"
  );
});

test("arc_thought_presence_recheck loops back to expand_presence, incrementing loopIterationCount, while presence stays low", () => {
  const s = state({ triggerType: "reactive_emotion", presenceRating: 4, loopIterationCount: 0 });
  const outcome = getNextArcStage("arc_thought_presence_recheck", s, profile(), ALL_LAYERS);
  assert.equal(outcome.stage, "arc_thought_expand_presence");
  assert.equal(outcome.loopIterationCount, 1);
});

test("arc_thought_presence_recheck stops looping once the safety cap is hit and forces continuation", () => {
  const s = state({
    triggerType: "reactive_emotion",
    presenceRating: 4,
    loopIterationCount: ARC_CONFIG.safety.maxLoopIterations,
  });
  const outcome = getNextArcStage("arc_thought_presence_recheck", s, profile(), ALL_LAYERS);
  assert.equal(outcome.stage, "sensation_check", "forced forward despite presence still being low");
  assert.equal(outcome.loopIterationCount, ARC_CONFIG.safety.maxLoopIterations, "does not increment past the cap");
});

// ---------------------------------------------------------------------------
// Preventive action -- resolved per-target, surfaced BEFORE ARC Thought (#3)
// ---------------------------------------------------------------------------

test("reactive_urge routes through preventive_action_check (from trigger_selection, before ARC Thought) only when the habit layer's Preventive Action is configured", () => {
  const s = state({ triggerType: "reactive_urge" });

  const withPlan = profile({ preventiveAction: "לצאת להליכה" });
  assert.equal(getNextArcStage("trigger_selection", s, withPlan, ALL_LAYERS).stage, "preventive_action_check");

  const withoutPlan = profile({ preventiveAction: null });
  assert.equal(getNextArcStage("trigger_selection", s, withoutPlan, ALL_LAYERS).stage, "presence_check");
});

test("preventive_action_check branches on wantsPreventiveAction, then both branches continue to presence_check -- never back to sensation_check", () => {
  const p = profile({ preventiveAction: "לצאת להליכה" });
  assert.equal(getNextArcStage("preventive_action_check", state({ wantsPreventiveAction: true }), p, ALL_LAYERS).stage, "preventive_action");
  assert.equal(getNextArcStage("preventive_action_check", state({ wantsPreventiveAction: false }), p, ALL_LAYERS).stage, "presence_check");
  assert.equal(getNextArcStage("preventive_action", state(), p, ALL_LAYERS).stage, "presence_check");
});

test("reactive_emotion resolves Preventive Action from the state layer's own field, never the habit layer's", () => {
  const s = state({ triggerType: "reactive_emotion" }); // only one mapped experience -> resolves to "state"

  const withState = profile({
    preventiveAction: "פעולה של הרגל", // habit's -- must never leak into a state-layer session
    statePreventiveAction: "לצאת לחמש דקות אוויר צח",
  });
  assert.equal(getNextArcStage("trigger_selection", s, withState, ALL_LAYERS).stage, "preventive_action_check");

  const withoutState = profile({ preventiveAction: "פעולה של הרגל", statePreventiveAction: null });
  assert.equal(getNextArcStage("trigger_selection", s, withoutState, ALL_LAYERS).stage, "presence_check");
});

test("reactive_emotion resolves Preventive Action from the identity layer's own field when the resolved target is identity", () => {
  const p = profile({
    interferingState: null,
    supportiveState: null,
    internalAction: null, // nothing configured for state -> inference must not land there
    identityInterferingEmotion: "תשוקה",
    desiredIdentity: "משמעת",
    identityAction: "להתקשר לחבר טוב",
    identityPreventiveAction: "להתקשר לחבר",
  });
  // No selectedTarget set explicitly -- resolved purely by inference
  // (only identity has any data configured), same as a real session
  // with exactly one mapped Reactive experience does via the adapter's
  // autoSelectSingleReactiveExperience (see live/liveEventAdapter.ts).
  const s = state({ triggerType: "reactive_emotion" });
  assert.equal(getNextArcStage("trigger_selection", s, p, ALL_LAYERS).stage, "preventive_action_check");
});

test("state, identity, and habit Preventive Actions never leak into each other, even when all three are configured", () => {
  const p = profile({
    statePreventiveAction: "פעולה מונעת של מיקוד",
    identityPreventiveAction: "פעולה מונעת של משמעת",
    preventiveAction: "פעולה מונעת של הרגל",
  });
  assert.equal(resolveTargetPreventiveAction("state", p), "פעולה מונעת של מיקוד");
  assert.equal(resolveTargetPreventiveAction("identity", p), "פעולה מונעת של משמעת");
  assert.equal(resolveTargetPreventiveAction("habit", p), "פעולה מונעת של הרגל");
});

// ---------------------------------------------------------------------------
// Encoding regulation -- a lightweight per-target Short Encoding
// Regulation Cue, distinct from the Full Regulation Cue used during
// Regulation itself
// ---------------------------------------------------------------------------

test("an ARC Map can store both a Full Regulation Cue and its own Short Encoding Regulation Cue", () => {
  const p = profile({ regulationTool: "הרפיית כתפיים + נשיפה איטית", stateEncodingRegulationCue: "נשיפה רגועה" });
  assert.equal(p.regulationTool, "הרפיית כתפיים + נשיפה איטית", "the Full Regulation Cue is stored");
  assert.equal(resolveEncodingRegulationCue("state", p), "נשיפה רגועה", "the target's own Short Encoding Regulation Cue is stored separately");
});

test("Focus and Discipline can have different Short Encoding Regulation Cues, never mixed", () => {
  const p = profile({ stateEncodingRegulationCue: "נשיפה רגועה", identityEncodingRegulationCue: "כתפיים רפויות" });
  assert.equal(resolveEncodingRegulationCue("state", p), "נשיפה רגועה");
  assert.equal(resolveEncodingRegulationCue("identity", p), "כתפיים רפויות");
});

test("selecting 'use the same cue during Encoding' (no separate short cue configured) correctly reuses the Full Regulation Cue", () => {
  const p = profile({ regulationTool: "כלי הוויסות המלא", stateEncodingRegulationCue: null, identityEncodingRegulationCue: null });
  assert.equal(resolveEncodingRegulationCue("state", p), "כלי הוויסות המלא");
  assert.equal(resolveEncodingRegulationCue("identity", p), "כלי הוויסות המלא");
});

test("resolveEncodingRegulationCue never invents a cue when neither a short cue nor a Full Regulation Cue is configured", () => {
  const p = profile({ regulationTool: null, stateEncodingRegulationCue: null, identityEncodingRegulationCue: null });
  assert.equal(resolveEncodingRegulationCue("state", p), null);
  assert.equal(resolveEncodingRegulationCue("identity", p), null);
});

test("resolveEncodingRegulationCue for habit always uses the Full Regulation Cue directly -- habit has no short cue of its own", () => {
  const p = profile({ regulationTool: "כלי הוויסות המלא" });
  assert.equal(resolveEncodingRegulationCue("habit", p), "כלי הוויסות המלא");
});

test("a profile stored before this field existed resolves exactly like 'use the same cue' -- existing stored users remain backwards compatible", () => {
  const legacyProfile = { ...profile({ regulationTool: "נשימה 4-7-8" }) } as ArcBuildProfile;
  delete (legacyProfile as { stateEncodingRegulationCue?: unknown }).stateEncodingRegulationCue;
  delete (legacyProfile as { identityEncodingRegulationCue?: unknown }).identityEncodingRegulationCue;
  assert.equal(resolveEncodingRegulationCue("state", legacyProfile), "נשימה 4-7-8");
  assert.equal(resolveEncodingRegulationCue("identity", legacyProfile), "נשימה 4-7-8");
});

// ---------------------------------------------------------------------------
// Reactive intensity classification and the stay/accept/transition loop
// ---------------------------------------------------------------------------

test("sensation_check branches into all four reactive intensity bands", () => {
  const p = profile();
  assert.equal(getNextArcStage("sensation_check", state({ sensationIntensity: 9 }), p, ALL_LAYERS).stage, "stay");
  assert.equal(getNextArcStage("sensation_check", state({ sensationIntensity: 7 }), p, ALL_LAYERS).stage, "reactive_transition_check");
  assert.equal(getNextArcStage("sensation_check", state({ sensationIntensity: 5 }), p, ALL_LAYERS).stage, "regulate");
  assert.equal(getNextArcStage("sensation_check", state({ sensationIntensity: 2 }), p, ALL_LAYERS).stage, "encode");
});

test("stay always continues to accept", () => {
  assert.equal(getNextArcStage("stay", state(), profile(), ALL_LAYERS).stage, "accept");
});

test("accept loops back to sensation_check (an intensity re-check), incrementing loopIterationCount", () => {
  const outcome = getNextArcStage("accept", state({ loopIterationCount: 0 }), profile(), ALL_LAYERS);
  assert.equal(outcome.stage, "sensation_check");
  assert.equal(outcome.loopIterationCount, 1);
});

test("accept forces forward to regulate once the safety cap is hit", () => {
  const outcome = getNextArcStage("accept", state({ loopIterationCount: ARC_CONFIG.safety.maxLoopIterations }), profile(), ALL_LAYERS);
  assert.equal(outcome.stage, "regulate");
});

test("reactive_transition_check advances to regulate when ready, loops back to stay when not", () => {
  const p = profile();
  const ready = getNextArcStage("reactive_transition_check", state({ regulationReady: true, loopIterationCount: 0 }), p, ALL_LAYERS);
  assert.equal(ready.stage, "regulate");

  const notReady = getNextArcStage("reactive_transition_check", state({ regulationReady: false, loopIterationCount: 0 }), p, ALL_LAYERS);
  assert.equal(notReady.stage, "stay");
  assert.equal(notReady.loopIterationCount, 1);
});

test("reactive_transition_check forces forward to regulate once the safety cap is hit, even if not ready", () => {
  const outcome = getNextArcStage(
    "reactive_transition_check",
    state({ regulationReady: false, loopIterationCount: ARC_CONFIG.safety.maxLoopIterations }),
    profile(),
    ALL_LAYERS
  );
  assert.equal(outcome.stage, "regulate");
});

test("regulate on the reactive path loops back to sensation_check for a re-check", () => {
  const outcome = getNextArcStage("regulate", state({ triggerType: "reactive_emotion", loopIterationCount: 0 }), profile(), ALL_LAYERS);
  assert.equal(outcome.stage, "sensation_check");
  assert.equal(outcome.loopIterationCount, 1);
});

test("regulate on the reactive path forces forward to encode once the safety cap is hit", () => {
  const outcome = getNextArcStage(
    "regulate",
    state({ triggerType: "reactive_emotion", loopIterationCount: ARC_CONFIG.safety.maxLoopIterations }),
    profile(),
    ALL_LAYERS
  );
  assert.equal(outcome.stage, "encode");
});

// ---------------------------------------------------------------------------
// Proactive path
// ---------------------------------------------------------------------------

test("desired_state_check branches by getProactiveStage's threshold", () => {
  const p = profile();
  assert.equal(getNextArcStage("desired_state_check", state({ desiredStateRating: 3 }), p, ALL_LAYERS).stage, "regulate");
  assert.equal(getNextArcStage("desired_state_check", state({ desiredStateRating: 7 }), p, ALL_LAYERS).stage, "encode");
});

test("regulate on the proactive path loops back to desired_state_check, not sensation_check", () => {
  const outcome = getNextArcStage("regulate", state({ triggerType: "proactive", loopIterationCount: 0 }), profile(), ALL_LAYERS);
  assert.equal(outcome.stage, "desired_state_check");
  assert.equal(outcome.loopIterationCount, 1);
});

test("regulate on the proactive path forces forward to encode once the safety cap is hit", () => {
  const outcome = getNextArcStage(
    "regulate",
    state({ triggerType: "proactive", loopIterationCount: ARC_CONFIG.safety.maxLoopIterations }),
    profile(),
    ALL_LAYERS
  );
  assert.equal(outcome.stage, "encode");
});

test("proactive never uses the reactive intensity thresholds", () => {
  // desiredStateRating 7 must be classified by getProactiveStage's threshold (5), not
  // getReactiveStage's (which would call 7 "reactive_transition_check", not a real stage here).
  const outcome = getNextArcStage("desired_state_check", state({ desiredStateRating: 7 }), profile(), ALL_LAYERS);
  assert.notEqual(outcome.stage, "reactive_transition_check");
});

// ---------------------------------------------------------------------------
// Tail
// ---------------------------------------------------------------------------

test("the tail is a fixed line: encode -> act -> success_focus -> complete", () => {
  const p = profile();
  const s = state();
  assert.equal(getNextArcStage("encode", s, p, ALL_LAYERS).stage, "act");
  assert.equal(getNextArcStage("act", s, p, ALL_LAYERS).stage, "success_focus");
  assert.equal(getNextArcStage("success_focus", s, p, ALL_LAYERS).stage, "complete");
});

test("complete is terminal", () => {
  assert.equal(getNextArcStage("complete", state(), profile(), ALL_LAYERS).stage, "complete");
});

// ---------------------------------------------------------------------------
// Action choice -- planned action vs. a session-specific alternative
// ---------------------------------------------------------------------------

test("needsCurrentActionResolution is true until the trainee has confirmed the planned action or entered a valid alternative", () => {
  assert.equal(needsCurrentActionResolution(false, null), true, "not yet asked");
  assert.equal(needsCurrentActionResolution(true, null), false, "planned action confirmed (\"כן\")");
  assert.equal(needsCurrentActionResolution(false, "5 דקות תרגילים בבית"), false, "a valid alternative was entered (\"לא\")");
});

test("getNextArcStage's act -> success_focus transition is unconditional, regardless of the Action-choice state -- routing itself is untouched by this feature", () => {
  const p = profile();
  assert.equal(getNextArcStage("act", state({ plannedActionConfirmed: false, selectedAction: null }), p, ALL_LAYERS).stage, "success_focus");
  assert.equal(getNextArcStage("act", state({ plannedActionConfirmed: true }), p, ALL_LAYERS).stage, "success_focus");
  assert.equal(getNextArcStage("act", state({ selectedAction: "חלופה" }), p, ALL_LAYERS).stage, "success_focus");
});

test("resolveActionDuration uses the alternative action's own session-specific duration when set", () => {
  const p = profile({ actionDuration: 20 });
  assert.equal(resolveActionDuration(5, p), 5);
});

test("resolveActionDuration falls back to the BUILD-level actionDuration when no session-specific duration was set", () => {
  const p = profile({ actionDuration: 20 });
  assert.equal(resolveActionDuration(null, p), 20);
});

test("resolveActionDuration never invents a duration when neither is set", () => {
  const p = profile({ actionDuration: null });
  assert.equal(resolveActionDuration(null, p), null);
});

test("resolveEncodingTarget: currentAction becomes the alternative action once selectedAction is set, and the planned BUILD action itself is never mutated", () => {
  const p = profile({ internalAction: "לצאת להליכה של 20 דקות" });
  const resolved = resolveEncodingTarget({
    activeLayers: ["state"],
    triggerType: "reactive_emotion",
    selectedTarget: "state",
    buildProfile: p,
    selectedAction: "לעשות 5 דקות תרגילים בבית",
  });
  assert.equal(resolved.actionLabel, "לעשות 5 דקות תרגילים בבית", "currentAction is the alternative");
  assert.equal(p.internalAction, "לצאת להליכה של 20 דקות", "the planned/BUILD action itself is untouched");
});
