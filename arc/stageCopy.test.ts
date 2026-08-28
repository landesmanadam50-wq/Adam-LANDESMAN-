import test from "node:test";
import assert from "node:assert/strict";

import { getStageCopy, getStageInputKind } from "./stageCopy.ts";
import { createEmptyLiveState } from "./types.ts";
import type { ArcBuildProfile, ArcLiveState, ArcStage, DevelopmentLayer } from "./types.ts";
import { containsInductionPattern } from "./instructions.ts";
import type { ArcMap } from "./buildTypes.ts";

function profile(overrides: Partial<ArcBuildProfile> = {}): ArcBuildProfile {
  return {
    programPath: "standard_3_week",
    identityActionNeeded: false,
    interferingState: "פחד",
    supportiveState: "חמלה",
    stateEncoding: null,
    internalAction: "סריקת גוף",
    desiredIdentity: null,
    identityInterferingEmotion: null,
    identityEncoding: null,
    identityAction: null,
    habit: null,
    beneficialAction: null,
    preventiveAction: null,
    regulationTool: "נשימה 4-7-8",
    actionDuration: null,
    successFocusDuration: null,
    ...overrides,
  };
}

function liveState(overrides: Partial<ArcLiveState> = {}): ArcLiveState {
  return { ...createEmptyLiveState(), ...overrides };
}

const ALL_STAGES: ArcStage[] = [
  "trigger_selection", "presence_check", "arc_thought_awareness", "arc_thought_combined_attention",
  "arc_thought_expand_presence", "arc_thought_presence_recheck", "preventive_action_check", "preventive_action",
  "sensation_check", "stay", "accept", "reactive_transition_check", "regulate", "desired_state_check",
  "encode", "act", "success_focus", "complete",
];

test("every stage has an input kind and a non-empty title", () => {
  const p = profile();
  const s = liveState();
  const activeLayers: DevelopmentLayer[] = ["state", "identity", "habit"];
  for (const stage of ALL_STAGES) {
    assert.ok(getStageInputKind(stage), `missing input kind for ${stage}`);
    assert.ok(getStageCopy(stage, p, s, activeLayers).title.length > 0, `missing title for ${stage}`);
  }
});

test("encode copy quotes the mantra when the active layer has one", () => {
  const p = profile({
    stateEncoding: { target: "x", bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: "אני בטוח כאן" },
  });
  const copy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.ok(copy.body.includes("אני בטוח כאן"));
});

test("act copy is specific to the routed layer's action", () => {
  const p = profile({ beneficialAction: "לגשת ולפתוח שיחה" });
  const copy = getStageCopy("act", p, liveState({ triggerType: "reactive_urge" }), ["habit"]);
  assert.ok(copy.body.includes("לגשת ולפתוח שיחה"));
});

test("sensation_check copy differs for habit (urge intensity) vs state/identity (body + intensity) on first entry", () => {
  const p = profile();
  const habitCopy = getStageCopy("sensation_check", p, liveState({ triggerType: "reactive_urge" }), ["habit"]);
  const stateCopy = getStageCopy("sensation_check", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.notEqual(habitCopy.body, stateCopy.body);
});

test("sensation_check copy switches to a recheck message once intensity was already rated once", () => {
  const p = profile();
  const first = getStageCopy("sensation_check", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  const recheck = getStageCopy(
    "sensation_check",
    p,
    liveState({ triggerType: "reactive_emotion", sensationIntensity: 7 }),
    ["state"]
  );
  assert.notEqual(first.title, recheck.title);
});

test("arc_thought_combined_attention no longer names interferingState/supportiveState -- regression for the induction-pattern bug", () => {
  const p = profile({ interferingState: "ביקורת עצמית", supportiveState: "חמלה" });
  const copy = getStageCopy("arc_thought_combined_attention", p, liveState(), ["state"]);
  assert.ok(!copy.body.includes("ביקורת עצמית"));
  assert.ok(!copy.body.includes("חמלה"));
  assert.equal(containsInductionPattern(copy.body), false);
});

test("no ARC Thought stage's real generated copy trips the induction-pattern audit", () => {
  const p = profile();
  const arcThoughtStages: ArcStage[] = ["arc_thought_awareness", "arc_thought_combined_attention", "arc_thought_expand_presence"];
  for (const stage of arcThoughtStages) {
    const copy = getStageCopy(stage, p, liveState(), ["state"]);
    assert.equal(containsInductionPattern(copy.body), false, `${stage} body flagged: "${copy.body}"`);
  }
});

test("preventive_action_check copy names the configured preventive action", () => {
  const p = profile({ preventiveAction: "לצאת להליכה" });
  const copy = getStageCopy("preventive_action_check", p, liveState({ triggerType: "reactive_urge" }), ["habit"]);
  assert.ok(copy.body.includes("לצאת להליכה"));
});

const mapWithContext: ArcMap = {
  id: "map1",
  desiredStateId: "d1",
  interferingState: "ביקורת עצמית",
  challengeContext: "אחרי טעות",
  preventiveAction: "לעצור ולשים לב למה שכבר נוכח",
};
const mapNoContext: ArcMap = {
  id: "map2",
  desiredStateId: "d1",
  interferingState: null,
  challengeContext: null,
  preventiveAction: "לעצור לפני תגובה אוטומטית",
};

test("preventive_action_check shows an ArcMap picker when more than one exists and none is selected", () => {
  const p = profile({ preventiveAction: null });
  const copy = getStageCopy("preventive_action_check", p, liveState({ triggerType: "reactive_urge" }), ["habit"], [
    mapWithContext,
    mapNoContext,
  ]);
  assert.equal(copy.title, "זיהוי דפוס");
});

test("preventive_action_check asks to recognize the Challenge Context, and mentions Interfering State as a recognition question only", () => {
  const p = profile({ preventiveAction: null });
  const copy = getStageCopy(
    "preventive_action_check",
    p,
    liveState({ triggerType: "reactive_urge", selectedArcMapId: "map1" }),
    ["habit"],
    [mapWithContext]
  );
  assert.ok(copy.body.includes("אחרי טעות"));
  assert.ok(copy.body.includes("ביקורת עצמית"));
  assert.ok(copy.body.includes("?"), "must be phrased as a recognition question");
  assert.equal(containsInductionPattern(copy.body), false, "never an instruction to evoke/imagine/strengthen the interfering state");
});

test("preventive_action_check skips straight to offering the action once challengeRecognized is set, using the SELECTED map's action", () => {
  const p = profile({ preventiveAction: null });
  const copy = getStageCopy(
    "preventive_action_check",
    p,
    liveState({ triggerType: "reactive_urge", selectedArcMapId: "map1", challengeRecognized: true }),
    ["habit"],
    [mapWithContext]
  );
  assert.ok(copy.body.includes("לעצור ולשים לב למה שכבר נוכח"));
});

test("preventive_action_check with a Challenge-Context-free ArcMap goes straight to offering the action", () => {
  const p = profile({ preventiveAction: null });
  const copy = getStageCopy(
    "preventive_action_check",
    p,
    liveState({ triggerType: "reactive_urge", selectedArcMapId: "map2" }),
    ["habit"],
    [mapNoContext]
  );
  assert.ok(copy.body.includes("לעצור לפני תגובה אוטומטית"));
});

test("preventive_action_check offer_action degrades gracefully when the selected map has no preventiveAction", () => {
  const noAction: ArcMap = { id: "map3", desiredStateId: "d1", interferingState: null, challengeContext: null, preventiveAction: null };
  const p = profile({ preventiveAction: null });
  const copy = getStageCopy(
    "preventive_action_check",
    p,
    liveState({ triggerType: "reactive_urge", selectedArcMapId: "map3" }),
    ["habit"],
    [noAction]
  );
  assert.equal(copy.body, "אין פעולה מונעת מוגדרת לדפוס הזה כרגע.");
});

test("preventive_action (the follow-through stage) uses the selected ArcMap's action, not a stale legacy field", () => {
  const p = profile({ preventiveAction: "legacy-stale-action" });
  const copy = getStageCopy(
    "preventive_action",
    p,
    liveState({ triggerType: "reactive_urge", selectedArcMapId: "map1" }),
    ["habit"],
    [mapWithContext]
  );
  assert.ok(copy.body.includes("לעצור ולשים לב למה שכבר נוכח"));
  assert.ok(!copy.body.includes("legacy-stale-action"));
});
