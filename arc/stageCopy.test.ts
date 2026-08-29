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

// --- act carries the current target's Body-Language cue over from
// Encoding into Action Preparation / the timed Action screen -- the
// same per-target resolution encode already uses, so it can never mix
// Focus's cue into a Discipline session or vice versa.

test("act shows the current target's Body-Language cue before the action itself", () => {
  const p = profile({
    beneficialAction: "לגשת ולפתוח שיחה",
    stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: null },
  });
  const copy = getStageCopy("act", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.match(copy.body, /כתפיים משוחררות/, "the Body-Language cue must carry over into the act screen");
  const cueIndex = copy.body.indexOf("כתפיים משוחררות");
  const actionIndex = copy.body.indexOf("עכשיו הזמן");
  assert.ok(cueIndex >= 0 && actionIndex >= 0 && cueIndex < actionIndex, "the cue must appear before the action instruction (Action Preparation)");
});

test("act's Body-Language cue is a stable, pure function of the resolved target -- it stays identical across repeated calls, i.e. while a timer would be running", () => {
  const p = profile({
    stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: null },
  });
  const s = liveState({ triggerType: "reactive_emotion" });
  const first = getStageCopy("act", p, s, ["state"]);
  const second = getStageCopy("act", p, s, ["state"]);
  const third = getStageCopy("act", p, s, ["state"]);
  assert.equal(first.body, second.body);
  assert.equal(second.body, third.body);
  assert.match(third.body, /כתפיים משוחררות/, "the cue must still be present on every re-render during the action");
});

test("act's Body-Language cue comes from the current target/map -- Focus's cue for a state-targeted session, Discipline's for an identity-targeted session", () => {
  const p = twoTargetProfile();

  const stateAct = getStageCopy("act", p, liveState({ triggerType: "reactive_emotion", selectedTarget: "state" }), ["state", "identity"]);
  assert.match(stateAct.body, /עיניים פקוחות וממוקדות/, "must resolve Focus's own body-language cue");

  const identityAct = getStageCopy("act", p, liveState({ triggerType: "reactive_emotion", selectedTarget: "identity" }), ["state", "identity"]);
  assert.match(identityAct.body, /שמור את הראש ישר ויציב/, "must resolve Discipline's own body-language cue");
});

test("act never mixes Focus's and Discipline's Body-Language cues, in either direction", () => {
  const p = twoTargetProfile();

  const stateAct = getStageCopy("act", p, liveState({ triggerType: "reactive_emotion", selectedTarget: "state" }), ["state", "identity"]);
  assert.ok(!stateAct.body.includes("שמור את הראש ישר ויציב"), "a Focus-targeted act screen must not leak Discipline's cue");

  const identityAct = getStageCopy("act", p, liveState({ triggerType: "reactive_emotion", selectedTarget: "identity" }), ["state", "identity"]);
  assert.ok(!identityAct.body.includes("עיניים פקוחות וממוקדות"), "a Discipline-targeted act screen must not leak Focus's cue");
});

test("act never invents a Body-Language cue and never shows an empty placeholder when none is configured for the current target", () => {
  const p = profile({
    beneficialAction: "לגשת ולפתוח שיחה",
    stateEncoding: null,
    identityEncoding: null,
  });
  const copy = getStageCopy("act", p, liveState({ triggerType: "reactive_urge" }), ["habit"]);
  assert.equal(copy.body, "עכשיו הזמן: לגשת ולפתוח שיחה.", "no cue sentence, and no dangling/empty placeholder, when nothing is configured");
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

test("regulate always uses the Full Regulation Cue, never the Short Encoding Regulation Cue, even when both are configured", () => {
  const p = profile({ regulationTool: "הרפיית כתפיים + נשיפה איטית", stateEncodingRegulationCue: "נשיפה רגועה" });
  const copy = getStageCopy("regulate", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.match(copy.body, /הרפיית כתפיים \+ נשיפה איטית/, "Regulation must use the Full Regulation Cue");
  assert.ok(!copy.body.includes("נשיפה רגועה"), "Regulation must never use the shorter Encoding-only cue");
});

test("encode uses the Short Encoding Regulation Cue when configured, not the Full Regulation Cue's own text", () => {
  const p = profile({
    regulationTool: "הרפיית כתפיים + נשיפה איטית",
    stateEncodingRegulationCue: "נשיפה רגועה",
    stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: null },
  });
  const copy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.match(copy.body, /המשך עם נשיפה רגועה/, "Encoding must continue with the short cue");
  assert.ok(!copy.body.includes("הרפיית כתפיים + נשיפה איטית"), "Encoding must not use the longer Full Regulation Cue text when a short one is configured");
});

test("the Short Encoding Regulation Cue appears before the Body-Language cue and the Mantra", () => {
  const p = profile({
    stateEncodingRegulationCue: "נשיפה רגועה",
    stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: "אני חומל" },
  });
  const copy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  const regulationIndex = copy.body.indexOf("נשיפה רגועה");
  const cueIndex = copy.body.indexOf("כתפיים משוחררות");
  const mantraIndex = copy.body.indexOf("אני חומל");
  assert.ok(regulationIndex >= 0 && cueIndex >= 0 && mantraIndex >= 0);
  assert.ok(regulationIndex < cueIndex, "the Short Encoding Regulation Cue must precede the Body-Language cue");
  assert.ok(cueIndex < mantraIndex, "the Body-Language cue must precede the Mantra");
});

test("no cue is invented in Encoding when neither a Short Encoding Regulation Cue nor a Full Regulation Cue is configured", () => {
  const p = profile({
    regulationTool: null,
    stateEncodingRegulationCue: null,
    stateEncoding: null,
    internalAction: null,
    beneficialAction: null,
  });
  const copy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.ok(!copy.body.includes("המשך עם"), "no regulation-continuity line when nothing at all is configured");
});

test("encode continues the regulation tool and notices the sensation again -- neutrally -- before the encoding cue", () => {
  const p = profile({
    regulationTool: "נשימה 4-7-8",
    stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: null },
  });
  const copy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.match(copy.body, /^שים לב לתחושה שלך עכשיו ולכל שינוי שקרה, אם קרה\./, "sensation notice must come first");
  assert.match(copy.body, /המשך עם נשימה 4-7-8/, "regulation cue must continue, not be dropped");
  assert.match(copy.body, /כתפיים משוחררות/, "body-language cue must be present");
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

test("encode with no regulation tool configured still works, with a neutral sensation notice, no dangling reference to a tool, and a trailing Action Imagery sentence", () => {
  const p = profile({ regulationTool: null, stateEncoding: null });
  const copy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.equal(
    copy.body,
    "שים לב לתחושה שלך עכשיו ולכל שינוי שקרה, אם קרה. קח רגע לקבע את התחושה החדשה. דמיין את עצמך מבצע עכשיו את סריקת גוף."
  );
});

test("stay is Awareness-adjacent -- it must never name the regulation tool, since Regulation begins only at the regulate stage", () => {
  const p = profile({ regulationTool: "נשימה 4-7-8" });
  const copy = getStageCopy("stay", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.ok(!copy.body.includes("נשימה 4-7-8"), "stay must not reference the regulation tool");
  assert.equal(containsInductionPattern(copy.body), false);
});

test("stay includes natural breath awareness, but never an instruction to regulate the breath -- that belongs only to Regulation", () => {
  const copy = getStageCopy("stay", profile(), liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.match(copy.body, /שים לב גם לנשימה כפי שהיא מתרחשת מעצמה/, "must include natural breath awareness");
  assert.ok(
    !/האט|העמק|הארך|שנה את הקצב|נשוף לאט|נשימת בטן/.test(copy.body),
    "must never instruct intentional breath regulation (slow/deepen/extend/change rhythm/abdomen-breathe)"
  );
});

test("stay never changes copy based on regulationTool -- it's identical with or without one configured", () => {
  const withTool = getStageCopy("stay", profile({ regulationTool: "נשימה 4-7-8" }), liveState(), ["state"]);
  const withoutTool = getStageCopy("stay", profile({ regulationTool: null }), liveState(), ["state"]);
  assert.equal(withTool.body, withoutTool.body);
});

test("desired_state_check (Proactive) names the resolved target -- Desired State, Identity, or Desired Habit -- consuming the mapped data", () => {
  const p = profile({ supportiveState: "חמלה", desiredIdentity: "אדם ממוקד", beneficialAction: "לגשת ולפתוח שיחה" });

  const stateTarget = getStageCopy("desired_state_check", p, liveState({ triggerType: "proactive", selectedTarget: "state" }), ["state", "identity", "habit"]);
  assert.match(stateTarget.body, /המטרה: חמלה/);

  const identityTarget = getStageCopy("desired_state_check", p, liveState({ triggerType: "proactive", selectedTarget: "identity" }), ["state", "identity", "habit"]);
  assert.match(identityTarget.body, /המטרה: אדם ממוקד/);

  const habitTarget = getStageCopy("desired_state_check", p, liveState({ triggerType: "proactive", selectedTarget: "habit" }), ["state", "identity", "habit"]);
  assert.match(habitTarget.body, /המטרה: לגשת ולפתוח שיחה/);
});

test("desired_state_check (Proactive) references the mapped Challenge Context only when the resolved target is the state layer", () => {
  const p = profile({ supportiveState: "חמלה", desiredIdentity: "אדם ממוקד", challengeContext: "אחרי טעות" });

  const stateTarget = getStageCopy("desired_state_check", p, liveState({ triggerType: "proactive", selectedTarget: "state" }), ["state", "identity", "habit"]);
  assert.match(stateTarget.body, /אחרי טעות/);

  const identityTarget = getStageCopy("desired_state_check", p, liveState({ triggerType: "proactive", selectedTarget: "identity" }), ["state", "identity", "habit"]);
  assert.ok(!identityTarget.body.includes("אחרי טעות"), "Challenge Context is state-specific -- must not leak into an identity-target proactive session");
});

test("desired_state_check (Proactive) never requires an Interfering State to be present -- it's absent from the copy entirely", () => {
  const p = profile({ interferingState: "ביקורת עצמית", supportiveState: "חמלה" });
  const copy = getStageCopy("desired_state_check", p, liveState({ triggerType: "proactive", selectedTarget: "state" }), ["state"]);
  assert.ok(!copy.body.includes("ביקורת עצמית"));
  assert.equal(containsInductionPattern(copy.body), false);
});

// --- Encode resolves the Body-Language cue from the CURRENT selected
// target's own ARC Map (Focus/state vs Discipline/identity), never the
// other one's -- the second half of the BUILD-ARC multi-target bug:
// LIVE must retrieve each target's own cue, and never invent one when
// a target genuinely has none configured.

function twoTargetProfile(overrides: Partial<ArcBuildProfile> = {}): ArcBuildProfile {
  return profile({
    supportiveState: "מיקוד", // Focus
    desiredIdentity: "משמעת עצמית", // Discipline
    stateEncoding: { target: "מיקוד", bodySensationCue: null, breathCue: null, bodyLanguageCue: "עיניים פקוחות וממוקדות", mantra: "אני ממוקד" },
    identityEncoding: { target: "משמעת עצמית", bodySensationCue: null, breathCue: null, bodyLanguageCue: "שמור את הראש ישר ויציב", mantra: "אני ממושמע בפעולותיי" },
    regulationTool: "כלי הוויסות",
    ...overrides,
  });
}

test("encode retrieves the Focus (state) Body-Language cue and mantra when the state target is active -- never Discipline's", () => {
  const p = twoTargetProfile();
  const copy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion", selectedTarget: "state" }), ["state", "identity"]);
  assert.match(copy.body, /עיניים פקוחות וממוקדות/, "must resolve Focus's own body-language cue");
  assert.match(copy.body, /אני ממוקד/, "must resolve Focus's own mantra");
  assert.ok(!copy.body.includes("שמור את הראש ישר ויציב"), "must not leak Discipline's body-language cue");
  assert.ok(!copy.body.includes("אני ממושמע בפעולותיי"), "must not leak Discipline's mantra");
});

test("encode retrieves the Discipline (identity) Body-Language cue and mantra when the identity target is active -- never Focus's", () => {
  const p = twoTargetProfile();
  const copy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion", selectedTarget: "identity" }), ["state", "identity"]);
  assert.match(copy.body, /שמור את הראש ישר ויציב/, "must resolve Discipline's own body-language cue");
  assert.match(copy.body, /אני ממושמע בפעולותיי/, "must resolve Discipline's own mantra");
  assert.ok(!copy.body.includes("עיניים פקוחות וממוקדות"), "must not leak Focus's body-language cue");
  assert.ok(!copy.body.includes("אני ממוקד"), "must not leak Focus's mantra");
});

test("encode's Body-Language cue appears before the matching Identity/Mantra, for either target", () => {
  const p = twoTargetProfile();

  const stateCopy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion", selectedTarget: "state" }), ["state", "identity"]);
  const stateCueIndex = stateCopy.body.indexOf("עיניים פקוחות וממוקדות");
  const stateMantraIndex = stateCopy.body.indexOf("אני ממוקד");
  assert.ok(stateCueIndex >= 0 && stateMantraIndex >= 0 && stateCueIndex < stateMantraIndex, "Focus: body-language cue must precede the mantra");

  const identityCopy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion", selectedTarget: "identity" }), ["state", "identity"]);
  const identityCueIndex = identityCopy.body.indexOf("שמור את הראש ישר ויציב");
  const identityMantraIndex = identityCopy.body.indexOf("אני ממושמע בפעולותיי");
  assert.ok(
    identityCueIndex >= 0 && identityMantraIndex >= 0 && identityCueIndex < identityMantraIndex,
    "Discipline: body-language cue must precede the mantra"
  );
});

test("encode preserves the full order for both targets: updated sensation -> maintain regulation -> body-language cue -> identity/mantra", () => {
  const p = twoTargetProfile();
  for (const selectedTarget of ["state", "identity"] as const) {
    const copy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion", selectedTarget }), ["state", "identity"]);
    const sensationIndex = copy.body.indexOf("שים לב לתחושה שלך עכשיו");
    const regulationIndex = copy.body.indexOf("המשך עם כלי הוויסות");
    const cueIndex = selectedTarget === "state" ? copy.body.indexOf("עיניים פקוחות וממוקדות") : copy.body.indexOf("שמור את הראש ישר ויציב");
    const mantraIndex = selectedTarget === "state" ? copy.body.indexOf("אני ממוקד") : copy.body.indexOf("אני ממושמע בפעולותיי");
    assert.ok(sensationIndex === 0, `${selectedTarget}: sensation notice must come first`);
    assert.ok(regulationIndex > sensationIndex, `${selectedTarget}: regulation must follow the sensation notice`);
    assert.ok(cueIndex > regulationIndex, `${selectedTarget}: body-language cue must follow regulation`);
    assert.ok(mantraIndex > cueIndex, `${selectedTarget}: identity/mantra must follow the body-language cue`);
  }
});

test("Focus and Discipline can have different Short Encoding Regulation Cues, and each target's own is used, never the other's", () => {
  const p = twoTargetProfile({
    stateEncodingRegulationCue: "נשיפה רגועה", // Focus's own short cue
    identityEncodingRegulationCue: "כתפיים רפויות", // Discipline's own short cue
  });

  const stateCopy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion", selectedTarget: "state" }), ["state", "identity"]);
  assert.match(stateCopy.body, /המשך עם נשיפה רגועה/, "Focus's session must use Focus's own short cue");
  assert.ok(!stateCopy.body.includes("כתפיים רפויות"), "must not leak Discipline's short cue into Focus's session");

  const identityCopy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion", selectedTarget: "identity" }), ["state", "identity"]);
  assert.match(identityCopy.body, /המשך עם כתפיים רפויות/, "Discipline's session must use Discipline's own short cue");
  assert.ok(!identityCopy.body.includes("נשיפה רגועה"), "must not leak Focus's short cue into Discipline's session");
});

test("Discipline (identity) with NO Body-Language cue configured falls back to a generic transition -- it never invents a specific cue, and never borrows Focus's", () => {
  const p = twoTargetProfile({
    identityEncoding: { target: "משמעת עצמית", bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: "אני ממושמע בפעולותיי" },
  });
  const copy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion", selectedTarget: "identity" }), ["state", "identity"]);
  assert.ok(!copy.body.includes("עיניים פקוחות וממוקדות"), "must not borrow Focus's body-language cue");
  assert.ok(!copy.body.includes("שמור את"), "must not invent a specific body-language instruction that was never configured");
  assert.match(copy.body, /אני ממושמע בפעולותיי/, "the configured mantra still comes through");
});

test("editing Focus's Body-Language cue in the underlying data never changes what Discipline's encode copy resolves, and vice versa", () => {
  const base = twoTargetProfile();
  const focusEdited = twoTargetProfile({
    stateEncoding: { ...base.stateEncoding!, bodyLanguageCue: "כתפיים משוחררות" },
  });
  const disciplineCopyBefore = getStageCopy("encode", base, liveState({ triggerType: "reactive_emotion", selectedTarget: "identity" }), ["state", "identity"]);
  const disciplineCopyAfter = getStageCopy("encode", focusEdited, liveState({ triggerType: "reactive_emotion", selectedTarget: "identity" }), ["state", "identity"]);
  assert.equal(disciplineCopyBefore.body, disciplineCopyAfter.body, "changing Focus's cue must not change Discipline's resolved encode copy");
});
