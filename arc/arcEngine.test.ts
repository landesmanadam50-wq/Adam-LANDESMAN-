import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveActiveLayersForArcBuild,
  getAvailableLiveTriggers,
  getAvailableProactiveTargets,
  getAvailableReactiveExperiences,
  needsCurrentActionResolution,
  resolveActionDuration,
  getFirstArcStage,
  getNextArcStage,
  needsReactiveStateSelection,
  resolveActPhase,
  resolveEncodingRegulationCue,
  resolveEncodingTarget,
  resolveLiveRoute,
  resolveObserverPauseLayer,
  resolveTargetPreventiveAction,
} from "./arcEngine.ts";
import { createEmptyLiveState, createEmptyArcBuildProfile, generateArcBuildId } from "./types.ts";
import type { ArcBuildProfile, ArcLiveState, ArcStage, DevelopmentLayer } from "./types.ts";
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
    internalActionBodyCue: null,
    stateDwellTimes: null,
    desiredIdentity: null,
    identityChallengeContext: null,
    identityInterferingEmotion: null,
    identityPreventiveAction: null,
    identityEncodingRegulationCue: null,
    identityEncoding: null,
    identityAction: null,
    identityActionBodyCue: null,
    identityDwellTimes: null,
    habit: "גלילה ברשת",
    beneficialAction: "לגשת ולפתוח שיחה",
    beneficialActionBodyCue: null,
    preventiveAction: null,
    regulationTool: "נשימה 4-7-8",
    actionDuration: null,
    successFocusDuration: null,
    negativeActionBaseDurationMinutes: null,
    negativeActionReductionEnabled: true,
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
  assert.equal(getNextArcStage("trigger_selection", distraction, p, ALL_LAYERS).stage, "trigger_context");
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
  assert.equal(getNextArcStage("trigger_selection", craving, p, ALL_LAYERS).stage, "trigger_context");
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
    identityActionBodyCue: null,
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
    beneficialActionBodyCue: null,
  });
  const resolved = resolveEncodingTarget({ activeLayers: ["habit"], triggerType: "proactive", selectedTarget: null, buildProfile: p });
  assert.equal(resolved.layer, "habit", "must resolve to the only actually-active layer, not the stale state data");
});

test("resolveEncodingTarget for Identity Only: reactive_emotion resolves to identity, not an inactive state", () => {
  const p = profile({
    interferingState: null,
    internalAction: null,
    internalActionBodyCue: null,
    identityAction: "לומר שלום",
    identityActionBodyCue: null,
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

// --- ARC Builds task: deriveActiveLayersForArcBuild -- the equivalent
// of program/'s week-based ArcProgramProgress.activeLayers, but derived
// directly from an ArcBuild's own configured fields, with no concept of
// layers unlocking over weeks.

test("deriveActiveLayersForArcBuild returns an empty array for a brand-new, fully empty build", () => {
  assert.deepEqual(deriveActiveLayersForArcBuild(createEmptyArcBuildProfile()), []);
});

test("deriveActiveLayersForArcBuild includes exactly the layers this build has actually configured, in state/identity/habit order", () => {
  const p = profile({
    stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: "אני חומל" },
    identityAction: "לומר שלום",
    beneficialAction: "לגשת ולפתוח שיחה",
  });
  assert.deepEqual(deriveActiveLayersForArcBuild(p), ["state", "identity", "habit"]);
});

test("deriveActiveLayersForArcBuild never includes a layer with nothing configured for it, even a habit-only build", () => {
  const p = profile({ internalAction: null, identityAction: null, beneficialAction: "לגשת ולפתוח שיחה" });
  assert.deepEqual(deriveActiveLayersForArcBuild(p), ["habit"]);
});

test("deriveActiveLayersForArcBuild treats internalAction alone (no stateEncoding) as enough to activate state, and identityAction alone as enough to activate identity", () => {
  const p = profile({ internalAction: "סריקת גוף", identityAction: "לומר שלום", beneficialAction: null });
  assert.deepEqual(deriveActiveLayersForArcBuild(p), ["state", "identity"]);
});

test("generateArcBuildId produces unique, non-empty ids across repeated calls", () => {
  const ids = new Set(Array.from({ length: 20 }, () => generateArcBuildId()));
  assert.equal(ids.size, 20);
  for (const id of ids) {
    assert.ok(id.length > 0);
  }
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

test("reactive_urge routes through preventive_action_check (from trigger_selection, via the reactive-flow-strengthening task's trigger_context -> observer_pause, before ARC Thought) only when the habit layer's Preventive Action is configured", () => {
  const s = state({ triggerType: "reactive_urge" });

  // trigger_selection always routes a reactive session through
  // trigger_context first now, regardless of Preventive Action config.
  const withPlan = profile({ preventiveAction: "לצאת להליכה" });
  assert.equal(getNextArcStage("trigger_selection", s, withPlan, ALL_LAYERS).stage, "trigger_context");
  assert.equal(getNextArcStage("trigger_context", s, withPlan, ALL_LAYERS).stage, "observer_pause");
  assert.equal(getNextArcStage("observer_pause", s, withPlan, ALL_LAYERS).stage, "preventive_action_check");

  const withoutPlan = profile({ preventiveAction: null });
  assert.equal(getNextArcStage("trigger_selection", s, withoutPlan, ALL_LAYERS).stage, "trigger_context");
  assert.equal(getNextArcStage("observer_pause", s, withoutPlan, ALL_LAYERS).stage, "presence_check");
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
  assert.equal(getNextArcStage("trigger_selection", s, withState, ALL_LAYERS).stage, "trigger_context");
  assert.equal(getNextArcStage("observer_pause", s, withState, ALL_LAYERS).stage, "preventive_action_check");

  const withoutState = profile({ preventiveAction: "פעולה של הרגל", statePreventiveAction: null });
  assert.equal(getNextArcStage("observer_pause", s, withoutState, ALL_LAYERS).stage, "presence_check");
});

test("reactive_emotion resolves Preventive Action from the identity layer's own field when the resolved target is identity", () => {
  const p = profile({
    interferingState: null,
    supportiveState: null,
    internalAction: null, // nothing configured for state -> inference must not land there
    identityInterferingEmotion: "תשוקה",
    desiredIdentity: "משמעת",
    identityAction: "להתקשר לחבר טוב",
    identityActionBodyCue: null,
    identityPreventiveAction: "להתקשר לחבר",
  });
  // No selectedTarget set explicitly -- resolved purely by inference
  // (only identity has any data configured), same as a real session
  // with exactly one mapped Reactive experience does via the adapter's
  // autoSelectSingleReactiveExperience (see live/liveEventAdapter.ts).
  const s = state({ triggerType: "reactive_emotion" });
  assert.equal(getNextArcStage("trigger_selection", s, p, ALL_LAYERS).stage, "trigger_context");
  assert.equal(getNextArcStage("observer_pause", s, p, ALL_LAYERS).stage, "preventive_action_check");
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

// --- REGRESSION (LIVE Acceptance stage bug fix): "accept" IS revisited
// within a single session -- the reactive stay/accept round trip
// (stay -> accept -> sensation_check -> [still "stay" tier] -> stay ->
// accept again) re-enters this exact ArcStage value more than once
// whenever intensity is still classified "stay" after one Acceptance
// round. live/ArcLiveRenderer.tsx used to key AcceptScreen on `stage`
// alone, which is the identical literal "accept" on every visit --
// React never remounted the screen on a revisit, so its own internal
// `resolved` state (live/screens.tsx) stayed stuck true from the FIRST
// visit and the willingness question silently never appeared again.
// The fix keys on `${stage}-${session.loopIterationCount}` instead
// (matching arc_thought_expand_presence/regulate's own established
// pattern for the same class of bug) -- these tests pin the underlying
// data property that fix depends on: loopIterationCount must genuinely
// differ between successive "accept" visits, and the stay/accept round
// trip must actually be reachable, not merely hypothetical.

test("loopIterationCount genuinely differs between successive 'accept' visits in the same session -- the data property AcceptScreen's remount key (live/ArcLiveRenderer.tsx) depends on", () => {
  const p = profile();
  // Round 1: stay -> accept.
  const firstAccept = getNextArcStage("stay", state({ loopIterationCount: 0 }), p, ALL_LAYERS);
  assert.equal(firstAccept.stage, "accept");
  const firstAcceptLoopCount = firstAccept.loopIterationCount;

  // Leaving "accept" (the trainee accepts, or the recheck rating is
  // submitted) increments loopIterationCount and re-classifies via
  // sensation_check -- simulate staying in the "stay" tier again.
  const afterFirstAccept = getNextArcStage("accept", state({ loopIterationCount: firstAcceptLoopCount }), p, ALL_LAYERS);
  assert.equal(afterFirstAccept.stage, "sensation_check");
  const reclassified = getNextArcStage(
    "sensation_check",
    state({ loopIterationCount: afterFirstAccept.loopIterationCount, sensationIntensity: 9 }),
    p,
    ALL_LAYERS
  );
  assert.equal(reclassified.stage, "stay", "sanity: intensity 9 stays in the 'stay' tier -- accept is genuinely revisited");

  // Round 2: stay -> accept again.
  const secondAccept = getNextArcStage("stay", state({ loopIterationCount: reclassified.loopIterationCount }), p, ALL_LAYERS);
  assert.equal(secondAccept.stage, "accept");

  assert.notEqual(
    secondAccept.loopIterationCount,
    firstAcceptLoopCount,
    "loopIterationCount must differ between the two 'accept' visits so a key built from it forces a real remount"
  );
});

test("a full reactive session can revisit 'accept' multiple times before intensity finally drops out of the 'stay' tier, each visit at a distinct loopIterationCount", () => {
  const p = profile();
  let stage: ArcStage = "stay";
  let s: ArcLiveState = state({ loopIterationCount: 0 });
  const acceptVisitLoopCounts: number[] = [];
  let iterations = 0;

  while (stage !== "regulate" && iterations < 20) {
    if (stage === "accept") acceptVisitLoopCounts.push(s.loopIterationCount);
    if (stage === "sensation_check") {
      // Stay elevated for the first two re-checks, then drop to the
      // "regulate" tier so the loop actually terminates.
      s = { ...s, sensationIntensity: acceptVisitLoopCounts.length < 3 ? 9 : 5 };
    }
    const next = getNextArcStage(stage, s, p, ALL_LAYERS);
    stage = next.stage;
    s = { ...s, loopIterationCount: next.loopIterationCount };
    iterations++;
  }

  assert.ok(acceptVisitLoopCounts.length >= 3, "sanity: 'accept' must actually be revisited multiple times in this walk");
  assert.equal(
    new Set(acceptVisitLoopCounts).size,
    acceptVisitLoopCounts.length,
    "every visit to 'accept' must have its own distinct loopIterationCount -- never two visits sharing the same value, which would fail to force a remount"
  );
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

// Negative Action reduction task: the main routine is always ARC ->
// Success Focus -> completion. The optional Negative Action Timer is a
// separate, BUILD-configured tool (program/engine.ts's
// isNegativeActionAvailable) with its own standalone entry point
// (app/negative-action.tsx) -- it is never inserted into this sequencer
// any more, regardless of activeLayers or profile.habit.

test("the tail is a fixed line: encode -> act -> success_focus -> complete, unconditionally", () => {
  const p = profile(); // default profile has habit configured -- must not matter any more
  const s = state();
  assert.equal(getNextArcStage("encode", s, p, ALL_LAYERS).stage, "act");
  assert.equal(getNextArcStage("act", s, p, ALL_LAYERS).stage, "success_focus");
  assert.equal(getNextArcStage("success_focus", s, p, ALL_LAYERS).stage, "complete");
});

test("success_focus continues straight to complete regardless of activeLayers -- habit layer active or not never matters any more", () => {
  const p = profile();
  const s = state();
  const layersWithoutHabit: DevelopmentLayer[] = ["state", "identity"];
  assert.equal(getNextArcStage("success_focus", s, p, layersWithoutHabit).stage, "complete");
  assert.equal(getNextArcStage("success_focus", s, p, ALL_LAYERS).stage, "complete");
});

test("success_focus continues straight to complete regardless of whether a negative action is configured (profile.habit set or null)", () => {
  const s = state();
  assert.equal(getNextArcStage("success_focus", s, profile({ habit: "גלילה ברשת" }), ALL_LAYERS).stage, "complete");
  assert.equal(getNextArcStage("success_focus", s, profile({ habit: null }), ALL_LAYERS).stage, "complete");
});

test("negative_action always advances unconditionally to complete -- unreachable via the sequencer, but harmless if ever reached (exhaustiveness fallback)", () => {
  const p = profile();
  assert.equal(getNextArcStage("negative_action", state(), p, ALL_LAYERS).stage, "complete");
  assert.equal(getNextArcStage("negative_action", state({ negativeActionStarted: true }), p, ALL_LAYERS).stage, "complete");
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

// --- Timer-update task: the trainee's own live, in-session Beneficial
// Action duration choice (5-10 minutes) sits between the alternative
// action's own duration and the BUILD-level fallback in priority.

test("resolveActionDuration prefers the live beneficialActionDurationMinutes choice over the BUILD-level actionDuration", () => {
  const p = profile({ actionDuration: 20 });
  assert.equal(resolveActionDuration(null, p, 7), 7);
});

test("resolveActionDuration still prefers the alternative action's own session-specific duration over the live beneficialActionDurationMinutes choice", () => {
  const p = profile({ actionDuration: 20 });
  assert.equal(resolveActionDuration(5, p, 7), 5, "the alternative-action path's own duration always wins -- it's never overridden by the planned-action-only live choice");
});

test("resolveActionDuration falls back to the BUILD-level actionDuration when neither the alternative nor the live choice is set", () => {
  const p = profile({ actionDuration: 20 });
  assert.equal(resolveActionDuration(null, p, null), 20);
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

// --- Action Body Cue task: actionBodyCue is resolved from the same
// layer as actionLabel, from its own dedicated field -- never from
// Encoding's bodyLanguageCue, never mixed across layers, and never
// overridden by a session-specific alternative action.
test("resolveEncodingTarget resolves actionBodyCue per layer, from the dedicated Action Body Cue fields, never from Encoding's bodyLanguageCue", () => {
  const p = profile({
    internalAction: "ללמוד 20 דקות",
    internalActionBodyCue: "פתיחת חזה",
    stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: null },
  });
  const resolved = resolveEncodingTarget({ activeLayers: ["state"], triggerType: "reactive_emotion", selectedTarget: "state", buildProfile: p });
  assert.equal(resolved.actionBodyCue, "פתיחת חזה", "must come from internalActionBodyCue, not Encoding's stateEncoding.bodyLanguageCue");
});

test("resolveEncodingTarget: habit and identity resolve their own, never-mixed Action Body Cue fields", () => {
  const habitProfile = profile({ beneficialAction: "לגשת ולפתוח שיחה", beneficialActionBodyCue: "יציבה זקופה" });
  const habitResolved = resolveEncodingTarget({ activeLayers: ["habit"], triggerType: "reactive_urge", selectedTarget: null, buildProfile: habitProfile });
  assert.equal(habitResolved.actionBodyCue, "יציבה זקופה");

  const identityProfile = profile({
    identityAction: "לומר שלום",
    identityActionBodyCue: "מבט ישיר",
    internalActionBodyCue: "פתיחת חזה",
  });
  const identityResolved = resolveEncodingTarget({ activeLayers: ["identity"], triggerType: "proactive", selectedTarget: "identity", buildProfile: identityProfile });
  assert.equal(identityResolved.actionBodyCue, "מבט ישיר", "identity's own cue, never the state layer's internalActionBodyCue");
});

test("resolveEncodingTarget: a session-specific Alternative Action still resolves the SAME target's Action Body Cue, never cleared and never overridden", () => {
  const p = profile({ internalAction: "לצאת להליכה של 20 דקות", internalActionBodyCue: "פתיחת חזה" });
  const resolved = resolveEncodingTarget({
    activeLayers: ["state"],
    triggerType: "reactive_emotion",
    selectedTarget: "state",
    buildProfile: p,
    selectedAction: "לעשות 5 דקות תרגילים בבית",
  });
  assert.equal(resolved.actionLabel, "לעשות 5 דקות תרגילים בבית", "the alternative action wins for actionLabel");
  assert.equal(resolved.actionBodyCue, "פתיחת חזה", "the Body Cue is untouched by the alternative action override");
});

test("resolveEncodingTarget: no configured Action Body Cue resolves to null, never undefined or invented", () => {
  const p = profile({ internalAction: "סריקת גוף", internalActionBodyCue: null });
  const resolved = resolveEncodingTarget({ activeLayers: ["state"], triggerType: "reactive_emotion", selectedTarget: "state", buildProfile: p });
  assert.equal(resolved.actionBodyCue, null);
});

// --- resolveActPhase: the "act" stage's three sub-phases, in their
// fixed, one-directional order -- see arc/instructionTiming.ts and
// arc/actionTimer.ts for why Imagery timing and the actual Action
// Timer must stay explicitly separate concepts. The standalone Action
// Preparation sub-phase that used to sit between Imagery and
// Performing is removed (LIVE-flow-update task) -- Imagery now goes
// straight to Performing.

test("resolveActPhase stays at 'choice' until currentAction is resolved", () => {
  assert.equal(resolveActPhase(false, null, false), "choice");
  assert.equal(resolveActPhase(false, null, true), "choice", "not yet resolved, even if the later flag is somehow set");
});

test("resolveActPhase moves to 'imagery' once currentAction is resolved (planned confirmed)", () => {
  assert.equal(resolveActPhase(true, null, false), "imagery");
});

test("resolveActPhase moves to 'imagery' once currentAction is resolved (a valid alternative was entered)", () => {
  assert.equal(resolveActPhase(false, "חלופה", false), "imagery");
});

test("resolveActPhase moves directly to 'performing' once Action Imagery is completed -- no standalone Preparation phase in between", () => {
  assert.equal(resolveActPhase(true, null, true), "performing");
  assert.equal(resolveActPhase(false, "חלופה", true), "performing");
});

// --- Reactive-flow-strengthening task: trigger_context/observer_pause
// insertion (#1-#4, #8, #9). Reactive-only, never reached by proactive
// sessions ("Preserve Proactive Separation").

test("reactive sessions (both reactive_urge and reactive_emotion) always route trigger_selection -> trigger_context -> observer_pause first, regardless of whether a Preventive Action is configured", () => {
  const withPreventive = profile({ preventiveAction: "לצאת להליכה", statePreventiveAction: "לנשום עמוק" });
  const withoutPreventive = profile({ preventiveAction: null, statePreventiveAction: null });

  for (const p of [withPreventive, withoutPreventive]) {
    const urge = state({ triggerType: "reactive_urge" });
    assert.equal(getNextArcStage("trigger_selection", urge, p, ALL_LAYERS).stage, "trigger_context");

    const emotion = state({ triggerType: "reactive_emotion", selectedTarget: "state" });
    assert.equal(getNextArcStage("trigger_selection", emotion, p, ALL_LAYERS).stage, "trigger_context");
  }
});

test("trigger_context always advances to observer_pause unconditionally -- an optional field, never blocking progression the way a required rating would", () => {
  const p = profile();
  const withText = state({ triggerType: "reactive_emotion", selectedTarget: "state", triggerContext: "ראיתי סרטון בטלפון" });
  assert.equal(getNextArcStage("trigger_context", withText, p, ALL_LAYERS).stage, "observer_pause");

  const withoutText = state({ triggerType: "reactive_emotion", selectedTarget: "state", triggerContext: null });
  assert.equal(getNextArcStage("trigger_context", withoutText, p, ALL_LAYERS).stage, "observer_pause", "must never block on an empty/optional trigger answer");
});

test("observer_pause resolves the SAME target (layer) trigger_selection's own inline resolution used to compute directly -- reactive_urge always habit, reactive_emotion via selectedTarget/inference -- so the correct Preventive Action is retrieved next", () => {
  const p = profile({ preventiveAction: "פעולת הרגל", statePreventiveAction: "פעולת מצב" });

  const urge = state({ triggerType: "reactive_urge" });
  const afterUrge = getNextArcStage("observer_pause", urge, p, ALL_LAYERS);
  assert.equal(afterUrge.stage, "preventive_action_check", "reactive_urge resolves to habit's own Preventive Action");

  const emotion = state({ triggerType: "reactive_emotion", selectedTarget: "state" });
  const afterEmotion = getNextArcStage("observer_pause", emotion, p, ALL_LAYERS);
  assert.equal(afterEmotion.stage, "preventive_action_check", "reactive_emotion (state target) resolves to state's own Preventive Action");
});

test("observer_pause falls through directly to presence_check when no Preventive Action is configured for the resolved target -- no duplicate/invented Preventive Action question", () => {
  const p = profile({ preventiveAction: null, statePreventiveAction: null, identityPreventiveAction: null });
  const emotion = state({ triggerType: "reactive_emotion", selectedTarget: "state" });
  assert.equal(getNextArcStage("observer_pause", emotion, p, ALL_LAYERS).stage, "presence_check");
});

test("PROACTIVE FLOW UNCHANGED: a proactive session's trigger_selection still routes straight to presence_check -- trigger_context/observer_pause are never reached", () => {
  const p = profile();
  const proactive = state({ triggerType: "proactive" });
  assert.equal(getNextArcStage("trigger_selection", proactive, p, ALL_LAYERS).stage, "presence_check");
});

test("existing downstream Reactive ARC progression is unchanged: from observer_pause onward, the exact same sensation_check -> stay/regulate -> encode -> act -> success_focus -> complete sequence the engine always had", () => {
  const p = profile({ preventiveAction: null, statePreventiveAction: null, internalAction: "סריקת גוף" });
  let s: ArcLiveState = { ...createEmptyLiveState(), triggerType: "reactive_emotion", selectedTarget: "state" };
  let stage: ArcStage = "trigger_selection";
  const visitedStages: ArcStage[] = [];
  let iterations = 0;
  while (stage !== "complete" && iterations < 30) {
    visitedStages.push(stage);
    if (stage === "presence_check") s = { ...s, presenceRating: 8 }; // high presence -- skip ARC Thought
    if (stage === "sensation_check") s = { ...s, sensationLocation: "חזה", sensationIntensity: 2 }; // low -> encode directly
    const next = getNextArcStage(stage, s, p, ALL_LAYERS);
    stage = next.stage;
    s = { ...s, loopIterationCount: next.loopIterationCount };
    iterations++;
  }
  visitedStages.push("complete");
  assert.deepEqual(visitedStages, [
    "trigger_selection",
    "trigger_context",
    "observer_pause",
    "presence_check",
    "sensation_check",
    "encode",
    "act",
    "success_focus",
    // Negative Action reduction task: negative_action is never reached
    // here any more, even though the habit layer is active and
    // profile.habit is configured (base profile() default) -- it's an
    // optional, standalone tool now, never inserted into this sequence.
    "complete",
  ]);
});

// --- Coordinated timer/dwell task (Part 20-23, 46): resolveObserverPauseLayer
// is shared between this file's own "observer_pause" transition case and
// arc/stageCopy.ts's copy-building case, so both resolve the Stop-Imagery
// dwell's layer identically for the same session.

test("resolveObserverPauseLayer always resolves reactive_urge to 'habit', unambiguously, regardless of selectedTarget", () => {
  assert.equal(resolveObserverPauseLayer("reactive_urge", null, ALL_LAYERS, profile()), "habit");
  assert.equal(resolveObserverPauseLayer("reactive_urge", "state", ALL_LAYERS, profile()), "habit", "reactive_urge's target is always habit, never overridden by a stray selectedTarget");
});

test("resolveObserverPauseLayer prefers an already-resolved selectedTarget for reactive_emotion", () => {
  assert.equal(resolveObserverPauseLayer("reactive_emotion", "identity", ALL_LAYERS, profile()), "identity");
  assert.equal(resolveObserverPauseLayer("reactive_emotion", "state", ALL_LAYERS, profile()), "state");
});

test("resolveObserverPauseLayer falls back to inferLayerFromTrigger's own existing inference when selectedTarget is still null", () => {
  const p = profile({
    interferingState: null,
    stateEncoding: null,
    internalAction: null,
    internalActionBodyCue: null,
    identityEncoding: null,
    identityAction: null,
    identityActionBodyCue: null,
    beneficialAction: null,
    beneficialActionBodyCue: null,
  });
  assert.equal(resolveObserverPauseLayer("reactive_emotion", null, ALL_LAYERS, p), "state", "the generic fallback when nothing at all is configured yet");
});

test("resolveObserverPauseLayer matches the engine's own 'observer_pause' transition case exactly -- the two must never diverge onto different layers for the same session", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state", "identity", "habit"];
  for (const state of [
    { triggerType: "reactive_urge" as const, selectedTarget: null },
    { triggerType: "reactive_emotion" as const, selectedTarget: "identity" as const },
    { triggerType: "reactive_emotion" as const, selectedTarget: null },
  ]) {
    const resolvedLayer = resolveObserverPauseLayer(state.triggerType, state.selectedTarget, activeLayers, p);
    const session: ArcLiveState = { ...createEmptyLiveState(), triggerType: state.triggerType, selectedTarget: state.selectedTarget };
    const outcome = getNextArcStage("observer_pause", session, p, activeLayers);
    // The engine's own transition routes based on resolveTargetPreventiveAction(resolvedLayer, p) --
    // cross-checking against the SAME resolver used directly proves they agree.
    assert.equal(outcome.stage, resolveTargetPreventiveAction(resolvedLayer, p) !== null ? "preventive_action_check" : "presence_check");
  }
});
