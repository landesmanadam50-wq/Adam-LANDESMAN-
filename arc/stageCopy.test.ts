import test from "node:test";
import assert from "node:assert/strict";

import { getActiveLayerContent, getStageCopy, getStageInputKind } from "./stageCopy.ts";
import { createEmptyLiveState } from "./types.ts";
import type { ArcBuildProfile, ArcLiveState } from "./types.ts";

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

test("every stage has an input kind and a non-empty title", () => {
  const p = profile();
  const s = liveState();
  const stages: Array<Parameters<typeof getStageCopy>[0]> = [
    "trigger_selection", "presence_check", "arc_thought_awareness", "arc_thought_combined_attention",
    "arc_thought_expand_presence", "arc_thought_presence_recheck", "sensation_check", "stay", "accept",
    "reactive_transition_check", "regulate", "desired_state_check", "encode", "act", "success_focus", "complete",
  ];
  for (const stage of stages) {
    assert.ok(getStageInputKind(stage), `missing input kind for ${stage}`);
    assert.ok(getStageCopy(stage, p, s).title.length > 0, `missing title for ${stage}`);
  }
});

test("getActiveLayerContent routes reactive_urge to the habit layer", () => {
  const p = profile({ beneficialAction: "לגשת ולפתוח שיחה" });
  const content = getActiveLayerContent(p, "reactive_urge");
  assert.equal(content.layer, "habit");
  assert.equal(content.actionLabel, "לגשת ולפתוח שיחה");
});

test("getActiveLayerContent routes reactive_emotion to the state layer", () => {
  const p = profile({ internalAction: "סריקת גוף" });
  const content = getActiveLayerContent(p, "reactive_emotion");
  assert.equal(content.layer, "state");
  assert.equal(content.actionLabel, "סריקת גוף");
});

test("getActiveLayerContent prefers identity for proactive when an identity encoding exists", () => {
  const p = profile({
    identityAction: "לומר שלום",
    identityEncoding: { target: "אומץ", bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: "אני בטוח כאן" },
  });
  const content = getActiveLayerContent(p, "proactive");
  assert.equal(content.layer, "identity");
  assert.equal(content.actionLabel, "לומר שלום");
});

test("getActiveLayerContent falls back to state for proactive when there's no identity encoding", () => {
  const p = profile({ identityEncoding: null });
  const content = getActiveLayerContent(p, "proactive");
  assert.equal(content.layer, "state");
});

test("encode copy quotes the mantra when the active layer has one", () => {
  const p = profile({
    stateEncoding: { target: "x", bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: "אני בטוח כאן" },
  });
  const copy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion" }));
  assert.ok(copy.body.includes("אני בטוח כאן"));
});

test("act copy is specific to the routed layer's action", () => {
  const p = profile({ beneficialAction: "לגשת ולפתוח שיחה" });
  const copy = getStageCopy("act", p, liveState({ triggerType: "reactive_urge" }));
  assert.ok(copy.body.includes("לגשת ולפתוח שיחה"));
});

test("sensation_check copy differs for habit (urge intensity) vs state/identity (body + intensity)", () => {
  const p = profile();
  const habitCopy = getStageCopy("sensation_check", p, liveState({ triggerType: "reactive_urge" }));
  const stateCopy = getStageCopy("sensation_check", p, liveState({ triggerType: "reactive_emotion" }));
  assert.notEqual(habitCopy.body, stateCopy.body);
});
