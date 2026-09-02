import test from "node:test";
import assert from "node:assert/strict";

import { getEvidenceLine, getInlineRequiredRatingQuestion, getPreventiveActionReinforcement, getStageCopy, getStageInputKind } from "./stageCopy.ts";
import { getNextArcStage } from "./arcEngine.ts";
import { createEmptyLiveState } from "./types.ts";
import type { ArcBuildProfile, ArcLiveState, ArcStage, DevelopmentLayer } from "./types.ts";
import { containsInductionPattern } from "./instructions.ts";
import { INSTRUCTION_TIMING } from "./instructionTiming.ts";
import { DEFAULT_DWELL_TIMES } from "./dwellTimes.ts";
import type { EvidenceRecord } from "./evidence.ts";

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

function liveState(overrides: Partial<ArcLiveState> = {}): ArcLiveState {
  return { ...createEmptyLiveState(), ...overrides };
}

const ALL_STAGES: ArcStage[] = [
  "trigger_selection", "trigger_context", "observer_pause", "presence_check", "arc_thought_awareness", "arc_thought_combined_attention",
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

// --- Action Body Cue task: Body Cue is an ACTION concept, resolved
// from its own dedicated per-layer field (internalActionBodyCue /
// identityActionBodyCue / beneficialActionBodyCue), never from
// Encoding's own Body-Language Cue (stateEncoding/identityEncoding
// .bodyLanguageCue) and never copied automatically in either direction
// -- the two may be configured independently, identically, or not at
// all. It appears in Action Imagery (when enabled) and directly on the
// real Action screen -- never on a separate Action Preparation screen
// (removed).

test("act carries the current target's own Action Body Cue through Imagery and the actual Action, action named first, then the cue", () => {
  const p = profile({
    beneficialAction: "לגשת ולפתוח שיחה",
    beneficialActionBodyCue: "פתיחת חזה",
  });
  const base = { triggerType: "reactive_urge" as const, plannedActionConfirmed: true };

  const imagery = getStageCopy("act", p, liveState(base), ["habit"]);
  assert.match(imagery.body, /פתיחת חזה/, "Action Imagery must include this target's Action Body Cue");

  const performing = getStageCopy("act", p, liveState({ ...base, actionImageryCompleted: true }), ["habit"]);
  assert.match(performing.body, /פתיחת חזה/, "the cue must still be visible during the actual timed Action");
  const cueIndex = performing.body.indexOf("פתיחת חזה");
  const actionIndex = performing.body.indexOf("עכשיו הזמן");
  assert.ok(cueIndex >= 0 && actionIndex >= 0 && actionIndex < cueIndex, "the action is named first, the Body Cue reminder follows");
});

test("Action Body Cue and Encoding's Body-Language Cue are independent -- configuring one never sets or changes the other", () => {
  const p = profile({
    internalAction: "לכתוב 3 דברים שהושגו היום",
    internalActionBodyCue: "פתיחת חזה",
    stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: null },
  });
  const base = { triggerType: "reactive_emotion" as const, plannedActionConfirmed: true };
  const encodeCopy = getStageCopy("encode", p, liveState(base), ["state"]);
  const performingCopy = getStageCopy("act", p, liveState({ ...base, actionImageryCompleted: true }), ["state"]);

  assert.match(encodeCopy.body, /כתפיים משוחררות/, "Encoding still shows its own configured Body-Language Cue, unchanged");
  assert.ok(!encodeCopy.body.includes("פתיחת חזה"), "Encoding must never show the separate Action Body Cue");
  assert.match(performingCopy.body, /פתיחת חזה/, "the Action screen shows its own configured Action Body Cue");
  assert.ok(!performingCopy.body.includes("כתפיים משוחררות"), "the Action screen must never show Encoding's Body-Language Cue");
});

test("act's Action Body Cue is a stable, pure function of the resolved target -- it stays identical across repeated calls, i.e. while a timer would be running", () => {
  const p = profile({ internalAction: "סריקת גוף", internalActionBodyCue: "פתיחת חזה" });
  const s = liveState({ triggerType: "reactive_emotion", plannedActionConfirmed: true });
  const first = getStageCopy("act", p, s, ["state"]);
  const second = getStageCopy("act", p, s, ["state"]);
  const third = getStageCopy("act", p, s, ["state"]);
  assert.equal(first.body, second.body);
  assert.equal(second.body, third.body);
  assert.match(third.body, /פתיחת חזה/, "the cue must still be present on every re-render during the action");
});

test("act's Action Body Cue comes from the current target/map -- Focus's (state) cue for a state-targeted session, Discipline's (identity) for an identity-targeted session", () => {
  const p = twoTargetProfile();

  const stateAct = getStageCopy(
    "act",
    p,
    liveState({ triggerType: "reactive_emotion", selectedTarget: "state", plannedActionConfirmed: true }),
    ["state", "identity"]
  );
  assert.match(stateAct.body, /פתיחת חזה/, "must resolve Focus's own Action Body Cue (internalActionBodyCue)");

  const identityAct = getStageCopy(
    "act",
    p,
    liveState({ triggerType: "reactive_emotion", selectedTarget: "identity", plannedActionConfirmed: true }),
    ["state", "identity"]
  );
  assert.match(identityAct.body, /מבט ישיר/, "must resolve Discipline's own Action Body Cue (identityActionBodyCue)");
});

test("act never mixes Focus's and Discipline's Action Body Cues, in either direction", () => {
  const p = twoTargetProfile();

  const stateAct = getStageCopy(
    "act",
    p,
    liveState({ triggerType: "reactive_emotion", selectedTarget: "state", plannedActionConfirmed: true }),
    ["state", "identity"]
  );
  assert.ok(!stateAct.body.includes("מבט ישיר"), "a Focus-targeted act screen must not leak Discipline's Action Body Cue");

  const identityAct = getStageCopy(
    "act",
    p,
    liveState({ triggerType: "reactive_emotion", selectedTarget: "identity", plannedActionConfirmed: true }),
    ["state", "identity"]
  );
  assert.ok(!identityAct.body.includes("פתיחת חזה"), "a Discipline-targeted act screen must not leak Focus's Action Body Cue");
});

test("act never invents an Action Body Cue and never shows undefined/empty when none is configured for the current target", () => {
  const p = profile({ beneficialAction: "לגשת ולפתוח שיחה", beneficialActionBodyCue: null });
  const base = { triggerType: "reactive_urge" as const, plannedActionConfirmed: true };

  const imagery = getStageCopy("act", p, liveState(base), ["habit"]);
  assert.equal(imagery.body, "דמיין את עצמך מתחיל לגשת ולפתוח שיחה.", "no invented cue in Action Imagery");
  assert.ok(!imagery.body.includes("undefined"), "never renders undefined");

  const performing = getStageCopy("act", p, liveState({ ...base, actionImageryCompleted: true }), ["habit"]);
  assert.equal(performing.body, "עכשיו הזמן: לגשת ולפתוח שיחה.", "no cue sentence in the actual Action screen either");
  assert.ok(!performing.body.includes("undefined"), "never renders undefined");
});

// --- Action Imagery lives in the "act" stage, not Encoding: it
// imagines currentAction -- the resolved action for this session,
// preferring a session-specific alternative (ArcLiveState.selectedAction)
// when the trainee's mapped action can't be performed right now -- while
// naturally including this SAME target's own Action Body Cue, using
// "מתחיל" phrasing (never the "מבצע את X" pattern, which reads as
// broken Hebrew against an infinitive action like "ללמוד").

test("Action Imagery uses currentAction, and is a distinct sub-phase that precedes the actual-action instruction", () => {
  const p = profile({ beneficialAction: "לגשת ולפתוח שיחה" });
  const base = { triggerType: "reactive_urge" as const, plannedActionConfirmed: true };

  const imagery = getStageCopy("act", p, liveState(base), ["habit"]);
  assert.match(imagery.body, /דמיין את עצמך מתחיל לגשת ולפתוח שיחה/, "Action Imagery must use currentAction");
  assert.ok(!imagery.body.includes("עכשיו הזמן"), "Action Imagery does not yet contain the actual-action instruction");

  const performing = getStageCopy("act", p, liveState({ ...base, actionImageryCompleted: true }), ["habit"]);
  assert.match(performing.body, /עכשיו הזמן: לגשת ולפתוח שיחה/, "the actual-action instruction is shown only once performing begins");
  assert.ok(!performing.body.includes("דמיין"), "the actual Action screen no longer repeats the imagery sentence");
});

test("Action Imagery includes the current target's Action Body Cue when configured, in the same sentence as the action, using natural phrasing", () => {
  const p = profile({ internalAction: "ללמוד 20 דקות", internalActionBodyCue: "פתיחת חזה" });
  const copy = getStageCopy("act", p, liveState({ triggerType: "reactive_emotion", plannedActionConfirmed: true }), ["state"]);
  assert.match(
    copy.body,
    /דמיין את עצמך מתחיל ללמוד 20 דקות תוך שמירה על פתיחת חזה\./,
    "imagery must name both the action and the cue together, in natural Hebrew"
  );
});

test("an alternative currentAction (entered because the planned action can't be performed now) is imagined together with the correct Action Body Cue, never the original planned action", () => {
  const p = profile({
    internalAction: "לצאת להליכה של 20 דקות", // the planned/BUILD action
    internalActionBodyCue: "ראש ישר ויציב",
  });
  const s = liveState({ triggerType: "reactive_emotion", selectedAction: "לעשות 5 דקות תרגילים בבית" });
  const copy = getStageCopy("act", p, s, ["state"]);
  assert.match(copy.body, /דמיין את עצמך מתחיל לעשות 5 דקות תרגילים בבית תוך שמירה על ראש ישר ויציב\./);
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

test("no cue is invented in Action Imagery when none is configured -- it simply imagines the action, with no body-cue wording", () => {
  const p = profile({ beneficialAction: "לגשת ולפתוח שיחה" });
  const copy = getStageCopy("act", p, liveState({ triggerType: "reactive_urge", plannedActionConfirmed: true }), ["habit"]);
  assert.match(copy.body, /^דמיין את עצמך מתחיל לגשת ולפתוח שיחה\./, "no trailing body-cue clause");
  assert.ok(!copy.body.includes("תוך שמירה"), "must never invent a body-cue clause");
});

test("Action Imagery never contains Interfering-State imagery, even though the Interfering State is available on the profile", () => {
  const p = profile({ interferingState: "ביקורת עצמית", internalActionBodyCue: "כתפיים משוחררות" });
  const copy = getStageCopy("act", p, liveState({ triggerType: "reactive_emotion", plannedActionConfirmed: true }), ["state"]);
  assert.ok(!copy.body.includes("ביקורת עצמית"), "Action Imagery must never reference the Interfering State");
  assert.equal(containsInductionPattern(copy.body), false);
});

test("Body Cue does not require Action Imagery -- it still appears correctly on the real Action screen when Imagery is skipped/already completed", () => {
  const p = profile({ beneficialAction: "לגשת ולפתוח שיחה", beneficialActionBodyCue: "פתיחת חזה" });
  const performing = getStageCopy(
    "act",
    p,
    liveState({ triggerType: "reactive_urge", plannedActionConfirmed: true, actionImageryCompleted: true }),
    ["habit"]
  );
  assert.match(performing.body, /פתיחת חזה/, "the Body Cue must work normally on the Action screen even without Imagery");
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
    internalActionBodyCue: null,
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

test("the Short Encoding Regulation Cue appears before the Body-Language cue, and the Body-Language cue appears before the Mantra (final corrected sub-order: embodiment -> evidence -> identity)", () => {
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
    internalActionBodyCue: null,
    beneficialAction: null,
    beneficialActionBodyCue: null,
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
    internalAction: "לכתוב 3 דברים שהושגו היום",
    internalActionBodyCue: "פתיחת חזה",
    identityAction: "לגשת ולדבר ראשון",
    identityActionBodyCue: "מבט ישיר",
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

test("Action Imagery uses different map-specific Action Body Cues for Focus and Discipline, never mixed, and never Encoding's own Body-Language Cue", () => {
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
    /דמיין את עצמך מתחיל סריקת גוף ממוקדת תוך שמירה על פתיחת חזה\./,
    "Focus's imagery must use Focus's own action and Action Body Cue (internalActionBodyCue)"
  );
  assert.ok(!stateAct.body.includes("מבט ישיר"), "Focus's imagery must not leak Discipline's Action Body Cue");
  assert.ok(!stateAct.body.includes("עיניים פקוחות וממוקדות"), "Focus's imagery must not use Encoding's own Body-Language Cue");

  const identityAct = getStageCopy(
    "act",
    p,
    liveState({ triggerType: "reactive_emotion", selectedTarget: "identity", plannedActionConfirmed: true }),
    ["state", "identity"]
  );
  assert.match(
    identityAct.body,
    /דמיין את עצמך מתחיל לשבת זקוף ולהתחיל תוך שמירה על מבט ישיר\./,
    "Discipline's imagery must use Discipline's own action and Action Body Cue (identityActionBodyCue)"
  );
  assert.ok(!identityAct.body.includes("פתיחת חזה"), "Discipline's imagery must not leak Focus's Action Body Cue");
  assert.ok(!identityAct.body.includes("שמור את הראש ישר ויציב"), "Discipline's imagery must not use Encoding's own Body-Language Cue");
});

test("encode's Body-Language cue appears before the matching Identity/Mantra, for either target (final corrected sub-order: embodiment -> evidence -> identity)", () => {
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

test("arc_thought_expand_presence carries its own instruction segment plus a trailing dwell segment sized from the CURRENT layer's own configured Presence dwell (default 8s, unconfigured here) -- the inline-merged Presence Rating's reveal gate (coordinated timer/dwell task)", () => {
  const expand = getStageCopy("arc_thought_expand_presence", profile(), liveState(), ["state"]);
  assert.equal(expand.segments?.length, 2, "the instruction segment plus the trailing dwell segment");
  assert.equal(expand.segments?.[0].durationSeconds, INSTRUCTION_TIMING.arcThoughtExpandPresence);
  assert.equal(expand.segments?.[0].text.length > 0, true, "the real instruction text stays on the first segment");
  assert.equal(expand.segments?.[1].durationSeconds, DEFAULT_DWELL_TIMES.presenceDwellSeconds);
  assert.equal(expand.segments?.[1].text, "", "the trailing dwell segment carries no text of its own");
  assert.equal(expand.body, expand.segments?.[0].text, "body stays exactly the spoken instruction text, unaffected by the trailing dwell segment");
});

test("arc_thought_expand_presence's trailing dwell honors a customized Presence dwell for the active state layer, distinct from the default -- proves it's a real per-trainee configured value, not a hard-coded constant", () => {
  const p = profile({ stateDwellTimes: { presenceDwellSeconds: 15 } });
  const expand = getStageCopy("arc_thought_expand_presence", p, liveState(), ["state"]);
  assert.equal(expand.segments?.[1].durationSeconds, 15);
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
  assert.equal(copy.segments?.[1].durationSeconds, DEFAULT_DWELL_TIMES.regulationDwellSeconds, "the trailing segment is this stage's own configurable Regulation dwell");
  assert.equal(copy.segments?.[1].text, "", "the trailing placeholder carries no text of its own");
  assert.equal(copy.body, copy.segments?.[0].text, "body stays exactly the spoken instruction text, unaffected by the trailing placeholder");
});

test("Encoding preserves its exact 4-piece order (Updated Sensation -> Short Regulation Cue -> Body-Language -> Mantra) as four separate timed segments, plus a trailing dwell segment (the CURRENT target's own configured Encoding dwell, default 10s unconfigured here) -- final corrected sub-order: Body-Language precedes Mantra (with evidence/memory-detail, when selected, sitting between them -- see the evidence-selection tests below)", () => {
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
    beneficialActionBodyCue: null,
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

// --- Evidence-encoding task: personal evidence in Encoding's copy --------
// (arc/evidence.ts's selectEncodingEvidence is unit-tested on its own in
// arc/evidence.test.ts; these tests confirm getStageCopy's "encode" case
// wires a supplied evidenceIndex into the actual segment order.)

function evidenceRecord(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    sourceType: "beneficial_action",
    sourceSessionId: "s1",
    timestamp: "2026-01-01T09:00:00.000Z",
    text: "אתמול, למרות שהיית עייף, התחלת את מה שתכננת",
    memoryDetail: null,
    targetLayer: "state",
    identityLabel: "חמלה", // matches profile()'s default supportiveState
    goal: "להגיב לעצמי בצורה בונה יותר",
    habit: null,
    interferingState: "פחד",
    challengeContext: "אחרי טעות",
    ...overrides,
  };
}

test("with no evidenceIndex supplied (the default, backward-compatible call shape), encode's copy is completely unaffected -- no evidence/memory-detail segments appear at all", () => {
  const p = profile({ stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: "אני חומל" } });
  const withoutArg = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  const withEmptyIndex = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion" }), ["state"], []);
  assert.deepEqual(withoutArg.segments, withEmptyIndex.segments);
  assert.ok(!withoutArg.body.includes("משהו שכבר עשית"), "no evidence lead-in when nothing was selected");
});

test("a relevant selected evidence item appears BEFORE Identity/Mantra, using the natural, non-clinical lead-in", () => {
  const p = profile({ stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: "אני חומל" } });
  const index = [evidenceRecord()];
  const copy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion" }), ["state"], index);
  const evidenceIndexInBody = copy.body.indexOf("משהו שכבר עשית: אתמול, למרות שהיית עייף");
  const mantraIndexInBody = copy.body.indexOf("אני חומל");
  assert.ok(evidenceIndexInBody >= 0, "the evidence line, with its natural lead-in, must appear in the copy");
  assert.ok(mantraIndexInBody >= 0);
  assert.ok(evidenceIndexInBody < mantraIndexInBody, "evidence must precede Identity/Mantra");
  assert.ok(!copy.body.includes("הוכחה"), "must never use a clinical/argumentative label like \"הוכחה ש...\"");
});

test("FINAL CORRECTED ORDER: Body-Language appears BEFORE the evidence/Gratitude line -- embodiment first, then real personal evidence", () => {
  const p = profile({ stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: "אני חומל" } });
  const copy = getStageCopy(
    "encode",
    p,
    liveState({ triggerType: "reactive_emotion" }),
    ["state"],
    [evidenceRecord()]
  );
  const bodyLanguageIndex = copy.segments!.findIndex((s) => s.text.includes("כתפיים משוחררות"));
  const evidenceIndex = copy.segments!.findIndex((s) => s.text.includes("משהו שכבר עשית"));
  assert.ok(bodyLanguageIndex >= 0 && evidenceIndex >= 0, "both the body-language segment and the evidence segment must exist");
  assert.ok(bodyLanguageIndex < evidenceIndex, "Body-Language must precede the evidence/Gratitude line");
});

test("FINAL CORRECTED ORDER, full chain in one profile: Body-Language -> evidence -> concrete memory detail -> Identity/Mantra, in that exact segment order", () => {
  const p = profile({ stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: "אני חומל" } });
  const copy = getStageCopy(
    "encode",
    p,
    liveState({ triggerType: "reactive_emotion" }),
    ["state"],
    [evidenceRecord({ memoryDetail: "שמתי לב שהכתפיים שלי נרגעו אחרי כמה שניות" })]
  );
  const bodyLanguageIndex = copy.segments!.findIndex((s) => s.text.includes("כתפיים משוחררות"));
  const evidenceIndex = copy.segments!.findIndex((s) => s.text.includes("משהו שכבר עשית"));
  const detailIndex = copy.segments!.findIndex((s) => s.text === "שמתי לב שהכתפיים שלי נרגעו אחרי כמה שניות");
  const mantraIndex = copy.segments!.findIndex((s) => s.text.includes("אני חומל"));
  assert.ok([bodyLanguageIndex, evidenceIndex, detailIndex, mantraIndex].every((i) => i >= 0), "all four pieces must be present");
  assert.ok(bodyLanguageIndex < evidenceIndex, "Body-Language before evidence");
  assert.ok(evidenceIndex < detailIndex, "evidence before concrete memory detail");
  assert.ok(detailIndex < mantraIndex, "concrete memory detail before Identity/Mantra");
});

test("no-match fallback (no relevant evidence/Gratitude at all): Body-Language is immediately followed by Identity/Mantra, with nothing inserted between them", () => {
  const p = profile({ stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: "אני חומל" } });
  const copy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion" }), ["state"], []);
  const bodyLanguageIndex = copy.segments!.findIndex((s) => s.text.includes("כתפיים משוחררות"));
  const mantraIndex = copy.segments!.findIndex((s) => s.text.includes("אני חומל"));
  assert.equal(mantraIndex, bodyLanguageIndex + 1, "Identity/Mantra must be the very next segment after Body-Language -- no evidence line, no filler");
});

test("Identity/Mantra (encode) always precedes Action Imagery (the separate, unchanged 'act' stage reached immediately after encode) -- ArcStage-level ordering is unaffected by the local Encoding sub-order change", () => {
  const p = profile({
    stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: "אני חומל" },
  });
  const state = liveState({ triggerType: "reactive_emotion" });
  // encode's own copy contains Identity/Mantra.
  const encodeCopy = getStageCopy("encode", p, state, ["state"]);
  assert.ok(encodeCopy.body.includes("אני חומל"), "encode must still render Identity/Mantra");
  // The engine's own unchanged transition: encode always advances to act
  // next (Action Imagery lives inside "act" -- see arc/arcEngine.ts's
  // resolveActPhase), never reordered by this task.
  const next = getNextArcStage("encode", state, p, ["state"]);
  assert.equal(next.stage, "act", "encode must still be immediately followed by act (Action Imagery/performing), unchanged");
});

test("a Gratitude-sourced evidence item uses the Gratitude lead-in, distinct from the behavioral-evidence one", () => {
  const p = profile({ stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: "אני חומל" } });
  const index = [evidenceRecord({ sourceType: "gratitude", text: "אני מעריך את זה שהיום עצרתי והקשבתי לעצמי" })];
  const copy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion" }), ["state"], index);
  assert.ok(copy.body.includes("משהו שהערכת בעצמך: אני מעריך את זה שהיום עצרתי והקשבתי לעצמי"));
});

test("the concrete memory detail, when present on the selected record, appears immediately BEFORE Identity/Mantra and immediately AFTER the evidence line -- never anywhere else, never a filler line when absent", () => {
  const p = profile({ stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: "אני חומל" } });

  const withDetail = getStageCopy(
    "encode",
    p,
    liveState({ triggerType: "reactive_emotion" }),
    ["state"],
    [evidenceRecord({ memoryDetail: "שמתי לב שהכתפיים שלי נרגעו אחרי כמה שניות" })]
  );
  const evidenceSegmentIndex = withDetail.segments!.findIndex((s) => s.text.includes("משהו שכבר עשית"));
  const detailSegmentIndex = withDetail.segments!.findIndex((s) => s.text === "שמתי לב שהכתפיים שלי נרגעו אחרי כמה שניות");
  const mantraSegmentIndex = withDetail.segments!.findIndex((s) => s.text.includes("אני חומל"));
  assert.equal(detailSegmentIndex, evidenceSegmentIndex + 1, "the memory detail must be the segment immediately after the evidence line");
  assert.equal(mantraSegmentIndex, detailSegmentIndex + 1, "Identity/Mantra must be the segment immediately after the memory detail");

  const withoutDetail = getStageCopy(
    "encode",
    p,
    liveState({ triggerType: "reactive_emotion" }),
    ["state"],
    [evidenceRecord({ memoryDetail: null })]
  );
  const evidenceIdx = withoutDetail.segments!.findIndex((s) => s.text.includes("משהו שכבר עשית"));
  const mantraIdx = withoutDetail.segments!.findIndex((s) => s.text.includes("אני חומל"));
  assert.equal(mantraIdx, evidenceIdx + 1, "no fabricated filler segment when no memory detail exists -- Identity/Mantra follows immediately");
});

test("getEvidenceLine never alters the stored evidence text itself -- only prepends a fixed lead-in", () => {
  const originalText = "טקסט מקורי בדיוק כפי שנשמר";
  const record = evidenceRecord({ text: originalText });
  const line = getEvidenceLine(record);
  assert.ok(line.endsWith(originalText), "the original text must appear verbatim, unaltered, at the end of the line");
  assert.equal(line, `משהו שכבר עשית: ${originalText}`);
});

test("unrelated evidence (identityLabel mismatched with the current target) is never surfaced in Encoding's copy -- getStageCopy relies entirely on selectEncodingEvidence's own relevance gate, never showing everything it's handed", () => {
  const p = profile({ stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: "אני חומל" } });
  const unrelated = [evidenceRecord({ identityLabel: "זהות אחרת לגמרי", text: "אירוע לא קשור" })];
  const copy = getStageCopy("encode", p, liveState({ triggerType: "reactive_emotion" }), ["state"], unrelated);
  assert.ok(!copy.body.includes("אירוע לא קשור"), "unrelated evidence must never appear");
});

test("evidence/memory-detail insertion never disturbs the trailing Encoding dwell segment -- it stays the last segment, same duration as without evidence", () => {
  const p = profile({ stateEncoding: { target: "חמלה", bodySensationCue: null, breathCue: null, bodyLanguageCue: "כתפיים משוחררות", mantra: "אני חומל" } });
  const copy = getStageCopy(
    "encode",
    p,
    liveState({ triggerType: "reactive_emotion" }),
    ["state"],
    [evidenceRecord({ memoryDetail: "פרט קונקרטי" })]
  );
  const last = copy.segments![copy.segments!.length - 1];
  assert.equal(last.text, "", "the dwell segment is still the very last one, after evidence/detail/mantra/body-language");
  assert.equal(last.durationSeconds, DEFAULT_DWELL_TIMES.encodingDwellSeconds);
});

// --- Reactive-flow-strengthening task: trigger_context / observer_pause
// copy (#1, #2, #3, #5, #6, #9), and the Preventive Action reinforcement
// (#5, #6, #16).

test("trigger_context asks the exact specified trigger question, as a free-text (non-blocking) stage", () => {
  const p = profile();
  const copy = getStageCopy("trigger_context", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.equal(copy.body, "מה הפעיל אצלך עכשיו את הרגש או הדחף?");
  assert.equal(getStageInputKind("trigger_context"), "triggerContext");
  assert.equal(copy.segments, null, "not a timed/gated stage -- the trainee is never blocked here");
});

test("observer_pause (KNOWN trigger) reveals the observer-perspective-of-the-situation line, then the pause line, then the explicit safety/recognition line, in that exact order and exact wording -- the currently working known-trigger path, unregressed", () => {
  const p = profile();
  const copy = getStageCopy("observer_pause", p, liveState({ triggerType: "reactive_emotion", triggerKnown: true }), ["state"]);
  assert.ok(copy.segments, "must be a timed/progressive-reveal screen, reusing the existing instruction-timing mechanism");
  const texts = copy.segments!.map((s) => s.text).filter((t) => t.length > 0);
  assert.deepEqual(texts, [
    "דמיין לרגע את מה שקרה כאילו אתה רואה את הסיטואציה מהצד, ואת עצמך בתוכה.",
    "ראה את עצמך עוצר לכמה שניות לפני התגובה.",
    "אין צורך לעורר מחדש או לחזק את הרגש או הדחף — רק לראות את מה שקרה.",
  ]);
});

test("observer_pause (UNKNOWN trigger) reveals only the shorter two-line sequence: observing ONESELF from the side (no situation/event referenced), then the same pause line -- never the situation-imagery or safety-recognition lines", () => {
  const p = profile();
  for (const triggerKnown of [false, null] as const) {
    const copy = getStageCopy("observer_pause", p, liveState({ triggerType: "reactive_emotion", triggerKnown }), ["state"]);
    const texts = copy.segments!.map((s) => s.text).filter((t) => t.length > 0);
    assert.deepEqual(
      texts,
      ["דמיין את עצמך לרגע כאילו אתה רואה את עצמך מהצד.", "ראה את עצמך עוצר לכמה שניות לפני התגובה."],
      `triggerKnown=${triggerKnown}`
    );
  }
});

test("observer_pause carries a trailing dwell segment sized from the CURRENT layer's own configured Stop-Imagery dwell (default 8s, unconfigured here) -- coordinated timer/dwell task: no longer a fixed constant, but the same underlying dwell/Continue-cue mechanism every other timed stage uses", () => {
  const p = profile();
  const copy = getStageCopy("observer_pause", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  const last = copy.segments![copy.segments!.length - 1];
  assert.equal(last.text, "");
  assert.equal(last.durationSeconds, DEFAULT_DWELL_TIMES.stopImageryDwellSeconds);
});

test("observer_pause's trailing dwell honors a customized Stop-Imagery dwell for the current reactive session's own resolved layer, distinct from the default", () => {
  const p = profile({ stateDwellTimes: { stopImageryDwellSeconds: 20 } });
  const copy = getStageCopy("observer_pause", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  const last = copy.segments![copy.segments!.length - 1];
  assert.equal(last.durationSeconds, 20);
});

test("observer_pause's trailing dwell resolves the HABIT layer's dwell (always the default, habit has no ARC Map of its own) for a reactive_urge session, never a state/identity value that happens to be configured", () => {
  const p = profile({ stateDwellTimes: { stopImageryDwellSeconds: 99 }, identityDwellTimes: { stopImageryDwellSeconds: 99 } });
  const copy = getStageCopy("observer_pause", p, liveState({ triggerType: "reactive_urge" }), ["habit"]);
  const last = copy.segments![copy.segments!.length - 1];
  assert.equal(last.durationSeconds, DEFAULT_DWELL_TIMES.stopImageryDwellSeconds);
});

test("observer_pause's copy never trips the induction-pattern audit -- it is recognition/rehearsal only, never an instruction to evoke, hold, or intensify the interfering emotion/urge -- for both the known- and unknown-trigger variants", () => {
  const p = profile();
  for (const triggerKnown of [true, false, null] as const) {
    const copy = getStageCopy("observer_pause", p, liveState({ triggerType: "reactive_emotion", triggerKnown }), ["state"]);
    assert.equal(containsInductionPattern(copy.body), false, `triggerKnown=${triggerKnown}`);
    for (const forbidden of ["תחזק", "תחזיק", "עורר מחדש את", "השאר את הרגש פעיל"]) {
      assert.ok(!copy.body.includes(forbidden), `triggerKnown=${triggerKnown} must never contain: "${forbidden}"`);
    }
  }
});

test("unknown-trigger observer_pause never invents or infers a triggering situation/event -- no imagery text references any specific event, only the trainee's own position", () => {
  const p = profile();
  const copy = getStageCopy("observer_pause", p, liveState({ triggerType: "reactive_emotion", triggerKnown: false }), ["state"]);
  for (const situationWord of ["מה שקרה", "הסיטואציה", "האירוע"]) {
    assert.ok(!copy.body.includes(situationWord), `must never reference an unidentified situation/event: "${situationWord}"`);
  }
});

test("trigger_context/observer_pause never reference profile.challengeContext/identityChallengeContext -- the session-specific recognition step is entirely separate from the BUILD-configured, reusable Challenge Context", () => {
  const p = profile({ challengeContext: "אחרי טעות", identityChallengeContext: "לפני שיחה קשה" });
  const triggerCopy = getStageCopy("trigger_context", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  const observerCopy = getStageCopy("observer_pause", p, liveState({ triggerType: "reactive_emotion" }), ["state"]);
  assert.ok(!triggerCopy.body.includes("אחרי טעות") && !triggerCopy.body.includes("לפני שיחה קשה"));
  assert.ok(!observerCopy.body.includes("אחרי טעות") && !observerCopy.body.includes("לפני שיחה קשה"));
});

test("preventive_action_check still presents the EXISTING BUILD-configured Preventive Action, and never the open-ended 'what could help reduce the chance of this happening again' question", () => {
  const p = profile({ statePreventiveAction: "לצאת לחמש דקות אוויר צח" });
  const copy = getStageCopy("preventive_action_check", p, liveState({ triggerType: "reactive_emotion", selectedTarget: "state" }), ["state"]);
  assert.match(copy.body, /לצאת לחמש דקות אוויר צח/, "must present the exact configured Preventive Action");
  assert.ok(!copy.body.includes("מה יכול לעזור לך לצמצם"), "must never ask the open-ended alternative-strategy question");
});

test("getPreventiveActionReinforcement returns the exact specified line", () => {
  assert.equal(getPreventiveActionReinforcement(), "כל הכבוד על שנכנסת ל־ARCHI ויצרת מרווח לפני התגובה.");
});

test("the Preventive Action reinforcement never claims the feeling/urge was eliminated, defeated, or controlled -- it praises creating a pause, not removing the interfering state", () => {
  const reinforcement = getPreventiveActionReinforcement();
  for (const forbidden of ["ניצחת", "השתלטת", "נפטרת", "הכנעת", "ביטלת"]) {
    assert.ok(!reinforcement.includes(forbidden), `must never contain: "${forbidden}"`);
  }
  assert.match(reinforcement, /מרווח לפני התגובה/, "must frame success as creating a pause before the automatic reaction");
});

// --- Coordinated timer/dwell task (Part 2-3): success_focus's copy is
// now the RETROSPECTIVE question, with the exact spec title/wording --
// never "עכשיו"/"מאוחר יותר" anywhere in this copy.

test("success_focus carries the exact spec title and retrospective question, never the old now/later choice text", () => {
  const copy = getStageCopy("success_focus", profile(), liveState(), ["habit"]);
  assert.equal(copy.title, "מיקוד הצלחה");
  assert.equal(copy.body, "כמה זמן המשכת בפעולה המיטיבה מעבר לזמן שתכננת?");
  assert.ok(!copy.body.includes("עכשיו"));
  assert.ok(!copy.body.includes("מאוחר יותר"));
  assert.equal(copy.segments, null, "no instruction-timing gate on this plain retrospective question");
});
