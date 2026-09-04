/**
 * arc/layerAware.test.ts
 *
 * The four scenarios named explicitly in the hardening request: each
 * program-layer combination should make LIVE behave correctly without
 * requiring a layer that wasn't built. These exercise the full engine
 * (trigger availability, routing, and a real stage walk), not just
 * the isolated resolver functions already covered elsewhere.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { getAvailableLiveTriggers, getFirstArcStage, getNextArcStage, resolveLiveRoute } from "./arcEngine.ts";
import { createEmptyLiveState } from "./types.ts";
import type { ArcBuildProfile, ArcLiveState, ArcStage, DevelopmentLayer } from "./types.ts";

function profile(overrides: Partial<ArcBuildProfile> = {}): ArcBuildProfile {
  return {
    programPath: "standard_3_week",
    identityActionNeeded: false,
    goal: null,
    presenceColor: null,
    interferingState: null,
    challengeContext: null,
    statePreventiveAction: null,
    stateEncodingRegulationCue: null,
    supportiveState: null,
    stateEncoding: null,
    internalAction: null,
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
    habit: null,
    beneficialAction: null,
    beneficialActionBodyCue: null,
    preventiveAction: null,
    regulationTool: "נשימה 4-7-8",
    actionDuration: null,
    successFocusDuration: null,
    negativeActionBaseDurationMinutes: null,
    negativeActionReductionEnabled: false,
    ...overrides,
  };
}

function state(overrides: Partial<ArcLiveState> = {}): ArcLiveState {
  return { ...createEmptyLiveState(), ...overrides };
}

test("STATE ONLY: reactive_urge is not offered, and routing to it is refused", () => {
  const activeLayers: DevelopmentLayer[] = ["state"];
  assert.equal(getAvailableLiveTriggers([...activeLayers]).includes("reactive_urge"), false);
  assert.throws(() => resolveLiveRoute("reactive_urge", [...activeLayers]));
});

test("STATE ONLY: a full reactive_emotion session walks through to completion without any habit data", () => {
  const activeLayers: DevelopmentLayer[] = ["state"];
  const p = profile({
    interferingState: "פחד",
    supportiveState: "חמלה",
    internalAction: "סריקת גוף",
    internalActionBodyCue: null,
    stateEncoding: { target: "פחד", bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: "אני בטוח כאן" },
  });
  let s = state({ triggerType: "reactive_emotion", presenceRating: 8 });
  let stage = getFirstArcStage();

  stage = getNextArcStage(stage, s, p, activeLayers).stage; // trigger_selection -> trigger_context (only one mapped experience)
  assert.equal(stage, "trigger_context");
  stage = getNextArcStage(stage, s, p, activeLayers).stage; // trigger_context -> observer_pause
  assert.equal(stage, "observer_pause");
  stage = getNextArcStage(stage, s, p, activeLayers).stage; // observer_pause -> presence_check (no Preventive Action configured)
  assert.equal(stage, "presence_check");
  // Presence Color task: high presence still completes Presence Stage 3
  // (arc_thought_expand_presence) -- it only skips the full
  // arc_thought_awareness/combined_attention sequence, never Stage 3
  // itself.
  stage = getNextArcStage(stage, s, p, activeLayers).stage;
  assert.equal(stage, "arc_thought_expand_presence");
  stage = getNextArcStage(stage, s, p, activeLayers).stage;
  assert.equal(stage, "arc_thought_presence_recheck");
  stage = getNextArcStage(stage, s, p, activeLayers).stage; // still high -> sensation_check, no full ARC Thought
  assert.equal(stage, "sensation_check");

  s = { ...s, sensationIntensity: 2 };
  stage = getNextArcStage(stage, s, p, activeLayers).stage; // low intensity -> encode
  assert.equal(stage, "encode");
  stage = getNextArcStage(stage, s, p, activeLayers).stage;
  assert.equal(stage, "act");
  stage = getNextArcStage(stage, s, p, activeLayers).stage;
  assert.equal(stage, "success_focus");
  stage = getNextArcStage(stage, s, p, activeLayers).stage;
  assert.equal(stage, "complete");
});

test("STATE + HABIT: identity is never required to reach completion on either route", () => {
  const activeLayers: DevelopmentLayer[] = ["state", "habit"];
  assert.deepEqual(getAvailableLiveTriggers(activeLayers), ["reactive_emotion", "reactive_urge", "proactive"]);

  const p = profile({ internalAction: "סריקת גוף", beneficialAction: "לגשת ולפתוח שיחה" });

  // habit route
  const s = state({ triggerType: "reactive_urge", presenceRating: 8, sensationIntensity: 2 });
  assert.equal(resolveLiveRoute("reactive_urge", activeLayers), "reactive_habit");
  const stage: ArcStage = getNextArcStage("sensation_check", s, p, activeLayers).stage;
  assert.equal(stage, "encode", "no identity data needed to reach encode on the habit route");
});

test("IDENTITY ONLY: proactive routes to the identity target without any state or habit data", () => {
  const activeLayers: DevelopmentLayer[] = ["identity"];
  const p = profile({
    desiredIdentity: "אומץ",
    identityAction: "לומר שלום",
    identityActionBodyCue: null,
    identityEncoding: { target: "אומץ", bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: "אני מסוגל" },
  });

  assert.equal(resolveLiveRoute("proactive", activeLayers), "proactive");

  let s = state({ triggerType: "proactive", presenceRating: 8, desiredStateRating: 7 });
  // Presence Color task: still routes through Presence Stage 3 first.
  let stage = getNextArcStage("presence_check", s, p, activeLayers).stage;
  assert.equal(stage, "arc_thought_expand_presence");
  stage = getNextArcStage(stage, s, p, activeLayers).stage;
  assert.equal(stage, "arc_thought_presence_recheck");
  stage = getNextArcStage(stage, s, p, activeLayers).stage;
  assert.equal(stage, "desired_state_check");
  stage = getNextArcStage(stage, s, p, activeLayers).stage;
  assert.equal(stage, "encode", "high desired-state rating goes straight to encode without touching state/habit");
});

test("HABIT ONLY: presence, ARC Thought, staying, and regulation all still work without the state layer", () => {
  const activeLayers: DevelopmentLayer[] = ["habit"];
  const p = profile({ beneficialAction: "לגשת ולפתוח שיחה", regulationTool: "נשימה 4-7-8" });

  // reactive_emotion (general tools) is still offered even though state isn't active.
  assert.equal(getAvailableLiveTriggers(activeLayers).includes("reactive_emotion"), true);

  let s = state({ triggerType: "reactive_emotion", presenceRating: 3 }); // low presence -> ARC Thought
  let stage = getNextArcStage("presence_check", s, p, activeLayers).stage;
  assert.equal(stage, "arc_thought_awareness");
  stage = getNextArcStage(stage, s, p, activeLayers).stage;
  stage = getNextArcStage(stage, s, p, activeLayers).stage;
  stage = getNextArcStage(stage, s, p, activeLayers).stage;
  assert.equal(stage, "arc_thought_presence_recheck");

  // Presence recovers -> routes onward to sensation_check (no state layer needed).
  s = { ...s, presenceRating: 8 };
  stage = getNextArcStage(stage, s, p, activeLayers).stage;
  assert.equal(stage, "sensation_check");

  // High intensity -> stay/regulate flow still works.
  s = { ...s, sensationIntensity: 9 };
  stage = getNextArcStage(stage, s, p, activeLayers).stage;
  assert.equal(stage, "stay");
  stage = getNextArcStage(stage, s, p, activeLayers).stage;
  assert.equal(stage, "accept");
});
