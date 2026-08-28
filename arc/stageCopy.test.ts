import test from "node:test";
import assert from "node:assert/strict";

import { getStageCopy, getStageInputKind } from "./stageCopy.ts";
import { createEmptyLiveState } from "./types.ts";
import type { ArcBuildProfile, ArcLiveState, ArcStage, DevelopmentLayer } from "./types.ts";
import { containsInductionPattern } from "./instructions.ts";

function profile(overrides: Partial<ArcBuildProfile> = {}): ArcBuildProfile {
  return {
    programPath: "standard_3_week",
    identityActionNeeded: false,
    goal: "להגיב לעצמי בצורה בונה יותר",
    interferingState: "פחד",
    challengeContext: "אחרי טעות",
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

test("presence_check shows a Challenge Context recognition preamble for reactive_emotion when one is mapped", () => {
  const p = profile({ challengeContext: "אחרי טעות" });
  const copy = getStageCopy("presence_check", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.match(copy.body, /אחרי טעות/);
  assert.match(copy.body, /\?/, "phrased as a recognition question");
});

test("presence_check falls back to an Interfering State recognition preamble when no Challenge Context is mapped", () => {
  const p = profile({ interferingState: "ביקורת עצמית", challengeContext: null });
  const copy = getStageCopy("presence_check", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.match(copy.body, /ביקורת עצמית/);
});

test("presence_check shows no recognition preamble for reactive_urge or proactive triggers, or when nothing is mapped", () => {
  const p = profile({ challengeContext: "אחרי טעות", interferingState: "ביקורת עצמית" });
  const urgeCopy = getStageCopy("presence_check", p, liveState({ triggerType: "reactive_urge" }), ["habit"]);
  const proactiveCopy = getStageCopy("presence_check", p, liveState({ triggerType: "proactive" }), ["state"]);
  const plainQuestion = "עד כמה אתה נוכח כרגע, בסולם 1 עד 10?";
  assert.equal(urgeCopy.body, plainQuestion);
  assert.equal(proactiveCopy.body, plainQuestion);

  const nothingMapped = profile({ challengeContext: null, interferingState: null });
  const noneCopy = getStageCopy("presence_check", nothingMapped, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.equal(noneCopy.body, plainQuestion);
});

test("presence_check's recognition preamble never trips the induction-pattern audit", () => {
  const p = profile({ challengeContext: "אחרי טעות", interferingState: "ביקורת עצמית" });
  const copy = getStageCopy("presence_check", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.equal(containsInductionPattern(copy.body), false);
});

test("regulate opens with a neutral present-sensation notice, then the trainee's actual regulation tool", () => {
  const p = profile({ regulationTool: "נשימה 4-7-8" });
  const copy = getStageCopy("regulate", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.match(copy.body, /^שים לב לתחושה שלך עכשיו\./);
  assert.match(copy.body, /נשימה 4-7-8/);
  assert.equal(containsInductionPattern(copy.body), false);
});

test("regulate never claims the sensation has improved, and never references the mapped Interfering State", () => {
  const p = profile({ regulationTool: "נשימה 4-7-8", interferingState: "ביקורת עצמית" });
  const copy = getStageCopy("regulate", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.ok(!copy.body.includes("ביקורת עצמית"));
  assert.ok(!/רגוע יותר|טוב יותר|הצלחת/.test(copy.body));
});

test("encode continues the regulation tool and notices the sensation again -- neutrally -- before the encoding cue", () => {
  const p = profile({
    regulationTool: "נשימה 4-7-8",
    stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: null },
  });
  const copy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.match(copy.body, /^המשך עם נשימה 4-7-8, ושים לב לתחושה שלך עכשיו\./);
  assert.match(copy.body, /כתפיים משוחררות/);
  assert.ok(!/רגוע יותר|טוב יותר/.test(copy.body), "must not imply the sensation improved");
  assert.equal(containsInductionPattern(copy.body), false);
});

test("encode falls back to naming the Desired State body-language transition when no cue or mantra is configured", () => {
  const p = profile({
    regulationTool: "נשימה 4-7-8",
    stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: null },
  });
  const copy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.match(copy.body, /עבור לשפת הגוף של חמלה/);
});

test("encode never references the mapped Interfering State, even though it's available on the profile", () => {
  const p = profile({
    regulationTool: "נשימה 4-7-8",
    interferingState: "ביקורת עצמית",
    stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: "אני חומל" },
  });
  const copy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.ok(!copy.body.includes("ביקורת עצמית"));
  assert.equal(containsInductionPattern(copy.body), false);
});

test("encode with no regulation tool configured still works, with a neutral sensation notice and no dangling reference to a tool", () => {
  const p = profile({ regulationTool: null, stateEncoding: null });
  const copy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.equal(copy.body, "שים לב לתחושה שלך עכשיו. קח רגע לקבע את התחושה החדשה.");
});
