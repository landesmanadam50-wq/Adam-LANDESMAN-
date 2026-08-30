import test from "node:test";
import assert from "node:assert/strict";

import { getInlineRequiredRatingQuestion, getStageCopy, getStageInputKind } from "./stageCopy.ts";
import { createEmptyLiveState } from "./types.ts";
import type { ArcBuildProfile, ArcLiveState, ArcStage, DevelopmentLayer } from "./types.ts";
import { containsInductionPattern } from "./instructions.ts";
import { INLINE_RATING_REVEAL_DELAY_SECONDS, INSTRUCTION_TIMING } from "./instructionTiming.ts";
import { DEFAULT_DWELL_TIMES } from "./dwellTimes.ts";

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
    stateDwellTimes: null,
    desiredIdentity: null,
    identityChallengeContext: null,
    identityInterferingEmotion: null,
    identityPreventiveAction: null,
    identityEncodingRegulationCue: null,
    identityEncoding: null,
    identityAction: null,
    identityDwellTimes: null,
    habit: null,
    beneficialAction: null,
    preventiveAction: null,
    regulationTool: "נשימה 4-7-8",
    actionDuration: null,
    successFocusDuration: null,
    negativeActionBaseDurationMinutes: null,
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
  const copy = getStageCopy("act", p, liveState({ triggerType: "reactive_urge", plannedActionConfirmed: true }), ["habit"]);
  assert.ok(copy.body.includes("לגשת ולפתוח שיחה"));
});

// --- act carries the current target's Body-Language cue over from
// Encoding into Imagery and the timed Action screen -- the same
// per-target resolution encode already uses, so it can never mix
// Focus's cue into a Discipline session or vice versa. LIVE-flow-update
// task: the standalone Action Preparation sub-phase that used to
// repeat this cue a third time is removed -- Imagery now goes straight
// to Performing, and Encoding's OWN body-language segment absorbs the
// "carry this into the real action" framing instead (see the next
// test block below).

test("act carries the current target's Body-Language cue through Imagery and the actual Action, in that order", () => {
  const p = profile({
    beneficialAction: "לגשת ולפתוח שיחה",
    stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: null },
  });
  const base = { triggerType: "reactive_emotion" as const, plannedActionConfirmed: true };

  const imagery = getStageCopy("act", p, liveState(base), ["state"]);
  assert.match(imagery.body, /כתפיים משוחררות/, "Action Imagery must carry the cue over from Encoding");

  const performing = getStageCopy("act", p, liveState({ ...base, actionImageryCompleted: true }), ["state"]);
  assert.match(performing.body, /כתפיים משוחררות/, "the cue must still be visible during the actual timed Action");
  const cueIndex = performing.body.indexOf("כתפיים משוחררות");
  const actionIndex = performing.body.indexOf("עכשיו הזמן");
  assert.ok(cueIndex >= 0 && actionIndex >= 0 && cueIndex < actionIndex, "the cue must appear before the action instruction");
});

test("LIVE-flow-update: Encoding's own body-language segment absorbs the 'carry this into the real action' reminder that used to live on the removed standalone Action Preparation screen", () => {
  const p = profile({
    stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: null },
  });
  const encode = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.match(encode.body, /כתפיים משוחררות/, "the cue itself is still there, unchanged");
  assert.match(encode.body, /בזמן הפעולה/, "and now also explicitly frames carrying it into the real action -- the useful instruction Preparation used to add is preserved, not lost");
});

test("act's Body-Language cue is a stable, pure function of the resolved target -- it stays identical across repeated calls, i.e. while a timer would be running", () => {
  const p = profile({
    stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: null },
  });
  const s = liveState({ triggerType: "reactive_emotion", plannedActionConfirmed: true });
  const first = getStageCopy("act", p, s, ["state"]);
  const second = getStageCopy("act", p, s, ["state"]);
  const third = getStageCopy("act", p, s, ["state"]);
  assert.equal(first.body, second.body);
  assert.equal(second.body, third.body);
  assert.match(third.body, /כתפיים משוחררות/, "the cue must still be present on every re-render during the action");
});

test("act's Body-Language cue comes from the current target/map -- Focus's cue for a state-targeted session, Discipline's for an identity-targeted session", () => {
  const p = twoTargetProfile();

  const stateAct = getStageCopy(
    "act",
    p,
    liveState({ triggerType: "reactive_emotion", selectedTarget: "state", plannedActionConfirmed: true }),
    ["state", "identity"]
  );
  assert.match(stateAct.body, /עיניים פקוחות וממוקדות/, "must resolve Focus's own body-language cue");

  const identityAct = getStageCopy(
    "act",
    p,
    liveState({ triggerType: "reactive_emotion", selectedTarget: "identity", plannedActionConfirmed: true }),
    ["state", "identity"]
  );
  assert.match(identityAct.body, /שמור את הראש ישר ויציב/, "must resolve Discipline's own body-language cue");
});

test("act never mixes Focus's and Discipline's Body-Language cues, in either direction", () => {
  const p = twoTargetProfile();

  const stateAct = getStageCopy(
    "act",
    p,
    liveState({ triggerType: "reactive_emotion", selectedTarget: "state", plannedActionConfirmed: true }),
    ["state", "identity"]
  );
  assert.ok(!stateAct.body.includes("שמור את הראש ישר ויציב"), "a Focus-targeted act screen must not leak Discipline's cue");

  const identityAct = getStageCopy(
    "act",
    p,
    liveState({ triggerType: "reactive_emotion", selectedTarget: "identity", plannedActionConfirmed: true }),
    ["state", "identity"]
  );
  assert.ok(!identityAct.body.includes("עיניים פקוחות וממוקדות"), "a Discipline-targeted act screen must not leak Focus's cue");
});

test("act never invents a Body-Language cue and never shows an empty placeholder when none is configured for the current target", () => {
  const p = profile({
    beneficialAction: "לגשת ולפתוח שיחה",
    stateEncoding: null,
    identityEncoding: null,
  });
  const base = { triggerType: "reactive_urge" as const, plannedActionConfirmed: true };

  const imagery = getStageCopy("act", p, liveState(base), ["habit"]);
  assert.equal(imagery.body, "דמיין את עצמך מבצע עכשיו את לגשת ולפתוח שיחה.", "no invented cue in Action Imagery");

  const performing = getStageCopy("act", p, liveState({ ...base, actionImageryCompleted: true }), ["habit"]);
  assert.equal(performing.body, "עכשיו הזמן: לגשת ולפתוח שיחה.", "no cue sentence in the actual Action screen either");
});

// --- Action Imagery lives in the "act" stage, not Encoding: it
// imagines currentAction -- the resolved action for this session,
// preferring a session-specific alternative (ArcLiveState.selectedAction)
// when the trainee's mapped action can't be performed right now -- while
// explicitly maintaining the SAME Body-Language Cue carried over from
// Encoding, from this target's own map only.

test("Action Imagery uses currentAction, and is a distinct sub-phase that precedes the actual-action instruction", () => {
  const p = profile({ beneficialAction: "לגשת ולפתוח שיחה" });
  const base = { triggerType: "reactive_urge" as const, plannedActionConfirmed: true };

  const imagery = getStageCopy("act", p, liveState(base), ["habit"]);
  assert.match(imagery.body, /דמיין את עצמך מבצע עכשיו את לגשת ולפתוח שיחה/, "Action Imagery must use currentAction");
  assert.ok(!imagery.body.includes("עכשיו הזמן"), "Action Imagery does not yet contain the actual-action instruction");

  const performing = getStageCopy("act", p, liveState({ ...base, actionImageryCompleted: true }), ["habit"]);
  assert.match(performing.body, /עכשיו הזמן: לגשת ולפתוח שיחה/, "the actual-action instruction is shown only once performing begins");
  assert.ok(!performing.body.includes("דמיין"), "the actual Action screen no longer repeats the imagery sentence");
});

test("Action Imagery includes the current target's Body-Language Cue when configured, in the same sentence as the action", () => {
  const p = profile({
    stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: null },
  });
  const copy = getStageCopy("act", p, liveState({ triggerType: "reactive_emotion", plannedActionConfirmed: true }), ["state"]);
  assert.match(
    copy.body,
    /דמיין את עצמך מבצע עכשיו את סריקת גוף, תוך שמירה על כתפיים משוחררות\./,
    "imagery must name both the action and the cue together"
  );
});

test("an alternative currentAction (entered because the planned action can't be performed now) is imagined together with the correct Body-Language Cue, never the original planned action", () => {
  const p = profile({
    internalAction: "לצאת להליכה של 20 דקות", // the planned/BUILD action
    stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "ראש ישר ויציב", mantra: null },
  });
  const s = liveState({ triggerType: "reactive_emotion", selectedAction: "לעשות 5 דקות תרגילים בבית" });
  const copy = getStageCopy("act", p, s, ["state"]);
  assert.match(copy.body, /דמיין את עצמך מבצע עכשיו את לעשות 5 דקות תרגילים בבית, תוך שמירה על ראש ישר ויציב\./);
  assert.ok(!copy.body.includes("לצאת להליכה של 20 דקות"), "must never continue imagining the original planned action");
});

test("resolveEncodingTarget's currentAction resolution is backwards compatible -- omitting selectedAction behaves exactly like the pre-existing mapped-action-only resolution", () => {
  const p = profile({ internalAction: "לצאת להליכה של 20 דקות" });
  const withoutSelectedAction = getStageCopy(
    "act",
    p,
    liveState({ triggerType: "reactive_emotion", plannedActionConfirmed: true }),
    ["state"]
  );
  const withNullSelectedAction = getStageCopy(
    "act",
    p,
    liveState({ triggerType: "reactive_emotion", plannedActionConfirmed: true, selectedAction: null }),
    ["state"]
  );
  assert.equal(withoutSelectedAction.body, withNullSelectedAction.body);
  assert.match(withoutSelectedAction.body, /לצאת להליכה של 20 דקות/);
});

test("no cue is invented in Action Imagery when none is configured -- it simply imagines the action, with no body-language wording", () => {
  const p = profile({ beneficialAction: "לגשת ולפתוח שיחה", stateEncoding: null, identityEncoding: null });
  const copy = getStageCopy("act", p, liveState({ triggerType: "reactive_urge", plannedActionConfirmed: true }), ["habit"]);
  assert.match(copy.body, /^דמיין את עצמך מבצע עכשיו את לגשת ולפתוח שיחה\./, "no trailing body-language clause");
  assert.ok(!copy.body.includes("תוך שמירה"), "must never invent a body-language clause");
});

test("Action Imagery never contains Interfering-State imagery, even though the Interfering State is available on the profile", () => {
  const p = profile({
    interferingState: "ביקורת עצמית",
    stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: null },
  });
  const copy = getStageCopy("act", p, liveState({ triggerType: "reactive_emotion", plannedActionConfirmed: true }), ["state"]);
  assert.ok(!copy.body.includes("ביקורת עצמית"), "Action Imagery must never reference the Interfering State");
  assert.equal(containsInductionPattern(copy.body), false);
});

test("the same Body-Language Cue is used across Encoding, Action Imagery, and the actual timed Action -- it never changes between these stages", () => {
  const p = profile({
    stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: null },
  });
  const base = { triggerType: "reactive_emotion" as const, plannedActionConfirmed: true };
  const encodeCopy = getStageCopy("encode", p, liveState(base), ["state"]);
  const imageryCopy = getStageCopy("act", p, liveState(base), ["state"]);
  const performingCopy = getStageCopy("act", p, liveState({ ...base, actionImageryCompleted: true }), ["state"]);

  assert.match(encodeCopy.body, /שמור על כתפיים משוחררות/, "Encoding activates the cue");
  assert.match(imageryCopy.body, /תוך שמירה על כתפיים משוחררות/, "Action Imagery maintains the same cue");
  assert.match(performingCopy.body, /שמור על שפת הגוף שבחרת: כתפיים משוחררות/, "the actual timed Action repeats the same cue");
});

// --- Action-choice: before currentAction is resolved (plannedActionConfirmed
// is false and selectedAction is null), "act" shows the planned action +
// "can I perform it now?" instead of the normal Body-Language/Imagery/
// Preparation copy -- see arc/arcEngine.ts's needsCurrentActionResolution.

test("the Action-choice screen displays the planned action before any choice is made", () => {
  const p = profile({ internalAction: "לצאת להליכה של 20 דקות" });
  const copy = getStageCopy("act", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.match(copy.body, /הפעולה שתכננת: לצאת להליכה של 20 דקות\./, "must show the planned/mapped action");
});

test("the Action-choice screen never shows Body-Language, Action Imagery, or Action-Preparation content before the choice is resolved", () => {
  const p = profile({
    internalAction: "לצאת להליכה של 20 דקות",
    stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: null },
  });
  const copy = getStageCopy("act", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.ok(!copy.body.includes("דמיין"), "no Action Imagery before the choice is resolved");
  assert.ok(!copy.body.includes("כתפיים משוחררות"), "no Body-Language reminder before the choice is resolved");
});

test("the Action-choice screen never invents a planned action when none is configured", () => {
  const p = profile({ beneficialAction: null, internalAction: null, identityAction: null });
  const copy = getStageCopy("act", p, liveState({ triggerType: "reactive_urge" }), ["habit"]);
  assert.equal(copy.body, "האם תוכל לבצע את הפעולה שתכננת עכשיו?");
});

test("Action Timer: the resolved action duration is named once currentAction is resolved -- the alternative's own duration when set, else the BUILD-level actionDuration, never invented when neither is set", () => {
  const performingFlags = { actionImageryCompleted: true };

  const withAlternativeDuration = profile({ internalAction: "לצאת להליכה של 20 דקות", actionDuration: 20 });
  const alternativeCopy = getStageCopy(
    "act",
    withAlternativeDuration,
    liveState({
      triggerType: "reactive_emotion",
      selectedAction: "5 דקות תרגילים בבית",
      selectedActionDuration: 5,
      ...performingFlags,
    }),
    ["state"]
  );
  assert.match(alternativeCopy.body, /משך הפעולה: 5 דקות\./, "uses the alternative's own duration, not the BUILD one");

  const withBuildDuration = profile({ internalAction: "לצאת להליכה של 20 דקות", actionDuration: 20 });
  const plannedCopy = getStageCopy(
    "act",
    withBuildDuration,
    liveState({ triggerType: "reactive_emotion", plannedActionConfirmed: true, ...performingFlags }),
    ["state"]
  );
  assert.match(plannedCopy.body, /משך הפעולה: 20 דקות\./, "falls back to the BUILD-level actionDuration");

  const withNoDuration = profile({ internalAction: "לצאת להליכה של 20 דקות", actionDuration: null });
  const noDurationCopy = getStageCopy(
    "act",
    withNoDuration,
    liveState({ triggerType: "reactive_emotion", plannedActionConfirmed: true, ...performingFlags }),
    ["state"]
  );
  assert.ok(!noDurationCopy.body.includes("משך הפעולה"), "no invented duration when neither is set");
});

test("Focus and Discipline resolve independent Action-choice states -- confirming/choosing an alternative for one target's session leaves the other's untouched", () => {
  const p = twoTargetProfile({
    internalAction: "סריקת גוף ממוקדת", // Focus's own action
    identityAction: "לשבת זקוף ולהתחיל", // Discipline's own action
  });

  const focusChoice = getStageCopy("act", p, liveState({ triggerType: "reactive_emotion", selectedTarget: "state" }), ["state", "identity"]);
  assert.match(focusChoice.body, /הפעולה שתכננת: סריקת גוף ממוקדת\./);

  const disciplineChoice = getStageCopy(
    "act",
    p,
    liveState({ triggerType: "reactive_emotion", selectedTarget: "identity" }),
    ["state", "identity"]
  );
  assert.match(disciplineChoice.body, /הפעולה שתכננת: לשבת זקוף ולהתחיל\./);
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

test("encode with no regulation tool configured still works, with a neutral sensation notice and no dangling reference to a tool -- and no Action Imagery, which now lives in the act stage", () => {
  const p = profile({ regulationTool: null, stateEncoding: null });
  const copy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.equal(copy.body, "שים לב לתחושה שלך עכשיו ולכל שינוי שקרה, אם קרה. קח רגע לקבע את התחושה החדשה.");
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

test("Action Imagery uses different map-specific Body-Language cues for Focus and Discipline, never mixed", () => {
  const p = twoTargetProfile({
    internalAction: "סריקת גוף ממוקדת", // Focus's own action
    identityAction: "לשבת זקוף ולהתחיל", // Discipline's own action
  });

  const stateAct = getStageCopy(
    "act",
    p,
    liveState({ triggerType: "reactive_emotion", selectedTarget: "state", plannedActionConfirmed: true }),
    ["state", "identity"]
  );
  assert.match(
    stateAct.body,
    /דמיין את עצמך מבצע עכשיו את סריקת גוף ממוקדת, תוך שמירה על עיניים פקוחות וממוקדות\./,
    "Focus's imagery must use Focus's own action and cue"
  );
  assert.ok(!stateAct.body.includes("שמור את הראש ישר ויציב"), "Focus's imagery must not leak Discipline's cue");

  const identityAct = getStageCopy(
    "act",
    p,
    liveState({ triggerType: "reactive_emotion", selectedTarget: "identity", plannedActionConfirmed: true }),
    ["state", "identity"]
  );
  assert.match(
    identityAct.body,
    /דמיין את עצמך מבצע עכשיו את לשבת זקוף ולהתחיל, תוך שמירה על שמור את הראש ישר ויציב\./,
    "Discipline's imagery must use Discipline's own action and cue"
  );
  assert.ok(!identityAct.body.includes("עיניים פקוחות וממוקדות"), "Discipline's imagery must not leak Focus's cue");
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

// --- Progressive timed-instruction segments (arc/instructionTiming.ts):
// stage-specific configs, exact ordering, and which stages the timed-
// reveal system does/doesn't apply to.

test("stages the timed-reveal system doesn't apply to carry segments: null, unchanged immediate-Continue behavior", () => {
  const p = profile();
  const untimedStages: ArcStage[] = [
    "trigger_selection",
    "presence_check",
    "arc_thought_presence_recheck",
    "preventive_action_check",
    "preventive_action",
    "sensation_check",
    "accept",
    "reactive_transition_check",
    "desired_state_check",
    "success_focus",
    "complete",
  ];
  for (const stage of untimedStages) {
    const copy = getStageCopy(stage, p, liveState({ triggerType: "reactive_emotion" }), ["state", "identity", "habit"]);
    assert.equal(copy.segments, null, `${stage} must not carry instruction segments`);
  }
});

test("ARC Thought's awareness/combined-attention sub-stages each carry exactly one segment, matching their own configured duration", () => {
  const p = profile();
  const s = liveState();
  const awareness = getStageCopy("arc_thought_awareness", p, s, ["state"]);
  assert.equal(awareness.segments?.length, 1);
  assert.equal(awareness.segments?.[0].durationSeconds, INSTRUCTION_TIMING.arcThoughtAwareness);
  assert.equal(awareness.segments?.[0].text, awareness.body);

  const combined = getStageCopy("arc_thought_combined_attention", p, s, ["state"]);
  assert.equal(combined.segments?.length, 1);
  assert.equal(combined.segments?.[0].durationSeconds, INSTRUCTION_TIMING.arcThoughtCombinedAttention);
});

test("arc_thought_expand_presence carries its own instruction segment plus a trailing, empty-text INLINE_RATING_REVEAL_DELAY_SECONDS placeholder -- the inline-merged Presence Rating's reveal gate", () => {
  const expand = getStageCopy("arc_thought_expand_presence", profile(), liveState(), ["state"]);
  assert.equal(expand.segments?.length, 2, "the instruction segment plus the trailing rating-reveal-delay segment");
  assert.equal(expand.segments?.[0].durationSeconds, INSTRUCTION_TIMING.arcThoughtExpandPresence);
  assert.equal(expand.segments?.[0].text.length > 0, true, "the real instruction text stays on the first segment");
  assert.equal(expand.segments?.[1].durationSeconds, INLINE_RATING_REVEAL_DELAY_SECONDS);
  assert.equal(expand.segments?.[1].text, "", "the trailing placeholder carries no text of its own");
  assert.equal(expand.body, expand.segments?.[0].text, "body stays exactly the spoken instruction text, unaffected by the trailing placeholder");
});

test("Stay/Presence reveals the current-sensation segment first, then the natural-breath segment, then a trailing dwell segment sized from the CURRENT target's own configured Sensation/Awareness dwell (default 8s, unconfigured here) -- the exact spec example, 4s then 8s then the dwell", () => {
  const p = profile();
  const copy = getStageCopy("stay", p, liveState(), ["state"]);
  assert.equal(copy.segments?.length, 3, "the two instruction segments plus the trailing dwell segment");
  assert.equal(copy.segments?.[0].text, "הישאר עם התחושה כפי שהיא עכשיו, בלי לנסות לשנות אותה.");
  assert.equal(copy.segments?.[0].durationSeconds, INSTRUCTION_TIMING.stayCurrentSensation);
  assert.equal(copy.segments?.[1].text, "שים לב גם לנשימה כפי שהיא מתרחשת מעצמה.");
  assert.equal(copy.segments?.[1].durationSeconds, INSTRUCTION_TIMING.stayNaturalBreath);
  assert.equal(copy.segments?.[2].text, "", "the trailing dwell segment carries no text of its own");
  assert.equal(copy.segments?.[2].durationSeconds, DEFAULT_DWELL_TIMES.sensationDwellSeconds);
});

test("Stay/Presence's breath segment stays non-regulatory -- no slow/deepen/extend-exhale/rhythm-change wording, that stays exclusive to Regulation", () => {
  const p = profile();
  const copy = getStageCopy("stay", p, liveState(), ["state"]);
  const breathText = copy.segments?.[1].text ?? "";
  for (const regulatoryWord of ["האט", "העמק", "האריך", "שנה את הקצב", profile().regulationTool ?? "__none__"]) {
    assert.ok(!breathText.includes(regulatoryWord), `Stay's breath segment must not contain regulatory wording: "${regulatoryWord}"`);
  }
});

test("Regulation has its own instruction segment and duration, separate from Stay/Presence's, plus a trailing dwell segment (the CURRENT target's own configured Regulation dwell, default 12s unconfigured here) for the inline-merged Desired State/intensity rating", () => {
  const p = profile({ regulationTool: "נשימה 4-7-8" });
  const copy = getStageCopy("regulate", p, liveState(), ["state"]);
  assert.equal(copy.segments?.length, 2, "the instruction segment plus the trailing dwell segment");
  assert.equal(copy.segments?.[0].durationSeconds, INSTRUCTION_TIMING.regulate);
  assert.notEqual(INSTRUCTION_TIMING.regulate, INSTRUCTION_TIMING.stayCurrentSensation, "sanity: Regulation's timing config is its own, not reused from Stay");
  assert.equal(copy.segments?.[1].durationSeconds, DEFAULT_DWELL_TIMES.regulationDwellSeconds, "the flat INLINE_RATING_REVEAL_DELAY_SECONDS this trailing segment used to carry is now this stage's own configurable Regulation dwell");
  assert.equal(copy.segments?.[1].text, "", "the trailing placeholder carries no text of its own");
  assert.equal(copy.body, copy.segments?.[0].text, "body stays exactly the spoken instruction text, unaffected by the trailing placeholder");
});

test("Encoding preserves its exact 4-piece order (Updated Sensation -> Short Regulation Cue -> Body-Language -> Mantra) as four separate timed segments, plus a trailing dwell segment (the CURRENT target's own configured Encoding dwell, default 10s unconfigured here)", () => {
  const p = profile({
    stateEncodingRegulationCue: "נשיפה רגועה",
    stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: "אני בטוח כאן" },
  });
  const copy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.equal(copy.segments?.length, 5, "the four instruction segments plus the trailing dwell segment");
  assert.match(copy.segments![0].text, /שים לב לתחושה שלך עכשיו/);
  assert.equal(copy.segments![0].durationSeconds, INSTRUCTION_TIMING.encodeUpdatedSensation);
  assert.match(copy.segments![1].text, /נשיפה רגועה/);
  assert.equal(copy.segments![1].durationSeconds, INSTRUCTION_TIMING.encodeShortRegulationCue);
  assert.match(copy.segments![2].text, /כתפיים משוחררות/);
  assert.equal(copy.segments![2].durationSeconds, INSTRUCTION_TIMING.encodeBodyLanguageCue);
  assert.match(copy.segments![3].text, /אני בטוח כאן/);
  assert.equal(copy.segments![3].durationSeconds, INSTRUCTION_TIMING.encodeIdentityMantra);
  assert.equal(copy.segments![4].text, "", "the trailing dwell segment carries no text of its own");
  assert.equal(copy.segments![4].durationSeconds, DEFAULT_DWELL_TIMES.encodingDwellSeconds);
  assert.equal(
    copy.body,
    copy.segments!.slice(0, 4).map((seg) => seg.text).join(" "),
    "body is exactly the joined instruction segments (never the trailing dwell placeholder), same text as before"
  );
});

test("Encoding's fallback segment (nothing configured) is appended after the always-present sensation-notice segment, not an untimed instant screen -- plus its own trailing dwell segment", () => {
  const p = profile({ stateEncoding: null, stateEncodingRegulationCue: null, regulationTool: null });
  const copy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.equal(copy.segments?.length, 3, "the sensation-notice segment, the fallback segment, plus the trailing dwell segment");
  assert.equal(copy.segments?.[0].durationSeconds, INSTRUCTION_TIMING.encodeUpdatedSensation);
  assert.equal(copy.segments?.[1].text, "קח רגע לקבע את התחושה החדשה.");
  assert.equal(copy.segments?.[1].durationSeconds, INSTRUCTION_TIMING.encodeFallback);
  assert.equal(copy.segments?.[2].text, "");
  assert.equal(copy.segments?.[2].durationSeconds, DEFAULT_DWELL_TIMES.encodingDwellSeconds);
});

test("Action Imagery carries its own configured duration, distinct from every instruction stage above, plus a trailing dwell segment (the CURRENT target's own configured Action Imagery dwell, default 8s unconfigured here)", () => {
  const p = profile({
    beneficialAction: "לגשת ולפתוח שיחה",
    stateEncoding: null,
  });
  const base = { triggerType: "reactive_urge" as const, plannedActionConfirmed: true };
  const imagery = getStageCopy("act", p, liveState(base), ["habit"]);
  assert.equal(imagery.segments?.length, 2, "the instruction segment plus the trailing dwell segment");
  assert.equal(imagery.segments?.[0].durationSeconds, INSTRUCTION_TIMING.actionImagery);
  assert.equal(imagery.segments?.[1].text, "");
  assert.equal(imagery.segments?.[1].durationSeconds, DEFAULT_DWELL_TIMES.actionImageryDwellSeconds);
});

test("the actual timed Action ('performing') carries segments: null -- it is governed by the separate Action Timer, never instruction segments -- and is reached directly once Action Imagery completes, with no standalone Action Preparation phase in between", () => {
  const p = profile({ beneficialAction: "לגשת ולפתוח שיחה" });
  const performing = getStageCopy(
    "act",
    p,
    liveState({ triggerType: "reactive_urge", plannedActionConfirmed: true, actionImageryCompleted: true }),
    ["habit"]
  );
  assert.equal(performing.segments, null);
});

test("timing entering a new stage never inherits another stage's segments -- each getStageCopy call is a pure function of its own stage argument", () => {
  const p = profile();
  const s = liveState();
  const stay = getStageCopy("stay", p, s, ["state"]);
  const regulate = getStageCopy("regulate", p, s, ["state"]);
  assert.notDeepEqual(stay.segments, regulate.segments, "sanity: different stages produce different segment sets");
  // Calling stay's copy again must reproduce the exact same segments --
  // no shared mutable state leaking between stages.
  const stayAgain = getStageCopy("stay", p, s, ["state"]);
  assert.deepEqual(stay.segments, stayAgain.segments);
});

// --- negative_action: the trainee's own predefined interfering/negative
// behavior (profile.habit), shown after Success Focus with an
// explicit pre-start screen before the timer.

test("negative_action names the predefined negative action before it's started", () => {
  const p = profile({ habit: "גלילה ברשת" });
  const copy = getStageCopy("negative_action", p, liveState(), ["habit"]);
  assert.match(copy.body, /גלילה ברשת/, "must name the predefined negative action");
  assert.equal(copy.segments, null);
});

test("negative_action never invents a negative action when none is configured", () => {
  const p = profile({ habit: null });
  const copy = getStageCopy("negative_action", p, liveState(), ["habit"]);
  assert.ok(!copy.body.includes("null"), "must never leak a literal null into the copy");
  assert.equal(copy.body, "לא הוגדרה פעולה שלילית.");
});

test("negative_action's copy changes once started, still naming the same action", () => {
  const p = profile({ habit: "גלילה ברשת" });
  const before = getStageCopy("negative_action", p, liveState({ negativeActionStarted: false }), ["habit"]);
  const after = getStageCopy("negative_action", p, liveState({ negativeActionStarted: true }), ["habit"]);
  assert.match(before.body, /גלילה ברשת/);
  assert.match(after.body, /גלילה ברשת/);
  assert.notEqual(before.body, after.body, "the pre-start and in-progress copy must differ");
});

// --- Visual-refinement task: the ONE concise question line used by the
// three REQUIRED inline ratings only -- Presence, Desired State Level,
// and the feeling/urge/interfering-state intensity recheck. Exact
// literal text per spec; never used for any other rating in the app
// (every other rating stage keeps its own existing title+body copy,
// completely untouched -- see the many getStageCopy tests above for
// presence_check/arc_thought_presence_recheck/desired_state_check/
// sensation_check, all still passing unchanged).

test("getInlineRequiredRatingQuestion returns the exact specified concise question for each of the three required inline ratings", () => {
  assert.equal(getInlineRequiredRatingQuestion("presence"), "מה רמת הנוכחות שלך עכשיו?");
  assert.equal(getInlineRequiredRatingQuestion("desiredState"), "כמה אתה קרוב עכשיו למצב הרצוי?");
  assert.equal(getInlineRequiredRatingQuestion("intensity"), "מה עוצמת התחושה עכשיו?");
});

test("getInlineRequiredRatingQuestion's three questions are distinct, single, concise lines -- no shared text, no heading-style prefix, one sentence each", () => {
  const questions = [
    getInlineRequiredRatingQuestion("presence"),
    getInlineRequiredRatingQuestion("desiredState"),
    getInlineRequiredRatingQuestion("intensity"),
  ];
  assert.equal(new Set(questions).size, 3, "all three questions are distinct");
  for (const question of questions) {
    assert.ok(!question.includes("\n"), "a single line, never multi-line");
    assert.equal((question.match(/\?/g) ?? []).length, 1, "exactly one question in the line");
  }
});
