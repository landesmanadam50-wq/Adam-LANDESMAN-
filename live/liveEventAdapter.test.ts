/**
 * live/liveEventAdapter.test.ts
 *
 * Exercises the LIVE UI integration end to end through the pure adapter
 * -- applyXxx (raw answer -> ArcLiveState patch) followed by
 * advanceLiveSession (which alone decides the next stage, via
 * arc/arcEngine.ts). No React rendering harness exists in this project
 * (node --test, not Jest/RTL), so this is the layer these scenarios are
 * verified at; the underlying per-layer routing rules themselves are
 * already covered by arc/layerAware.test.ts and arc/arcEngine.test.ts,
 * and week/credit rules by program/progress.test.ts -- these tests
 * confirm the *adapter* wires them correctly, not that the rules exist
 * (they do, and are tested there).
 *
 * "Technical titles not visible" (spec item 15) has no pure-function
 * equivalent -- it's verified by app/_layout.tsx's explicit
 * Stack.Screen titles plus a live dev-bundle inspection, not a test
 * here.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  getAvailableLiveTriggers,
  getAvailableProactiveTargets,
  getFirstArcStage,
  getNextArcStage,
  needsCurrentActionResolution,
  resolveActionDuration,
  resolveEncodingTarget,
  resolveLiveRoute,
} from "../arc/arcEngine.ts";
import { createEmptyLiveState } from "../arc/types.ts";
import type { ArcBuildProfile, ArcLiveState, ArcStage, DevelopmentLayer } from "../arc/types.ts";
import { getInlineRequiredRatingQuestion, getStageCopy } from "../arc/stageCopy.ts";
import { getInstructionTimingStatus, INSTRUCTION_TIMING } from "../arc/instructionTiming.ts";
import { DEFAULT_DWELL_TIMES } from "../arc/dwellTimes.ts";
import { isAcceptanceWillingnessLoopCapped } from "../arc/arcEngine.ts";
import { ARC_CONFIG } from "../arc/config.ts";
import { recordValidLiveCompletion } from "../program/progress.ts";
import { createInitialProgress } from "../program/progress.ts";
import {
  advanceLiveSession,
  applyAcceptanceWillingnessAnswer,
  applyActionCompletion,
  applyActionImageryCompleted,
  applyAlternativeAction,
  applyBeneficialActionDurationSelected,
  applyNegativeActionStarted,
  applyPlannedActionConfirmed,
  applyRegulationToolUsed,
  applyScaleAnswer,
  applySensationAnswer,
  applySuccessFocusExtraMinutes,
  applyWantsFutureSuccessFocus,
  applyTargetSelection,
  applyTriggerContext,
  isUnknownTriggerResponse,
  applyTriggerSelection,
  applyYesNoAnswer,
  hasSensationLocationResponse,
  hasValidAlternativeAction,
  resolveSensationLocation,
  SENSATION_LOCATION_UNCLEAR,
} from "./liveEventAdapter.ts";

function profile(overrides: Partial<ArcBuildProfile> = {}): ArcBuildProfile {
  return {
    programPath: "standard_3_week",
    identityActionNeeded: false,
    goal: null,
    interferingState: null,
    challengeContext: null,
    statePreventiveAction: null,
    stateEncodingRegulationCue: null,
    supportiveState: null,
    stateEncoding: null,
    internalAction: null,
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

function step(stage: ArcStage, session: ArcLiveState, p: ArcBuildProfile, activeLayers: DevelopmentLayer[]) {
  return advanceLiveSession(stage, session, p, activeLayers);
}

// --- 1/2/3: layer-aware trigger/target availability, re-verified at the integration surface ---

test("1. STATE ONLY: reactive_urge is unavailable", () => {
  const activeLayers: DevelopmentLayer[] = ["state"];
  assert.equal(getAvailableLiveTriggers(activeLayers).includes("reactive_urge"), false);
});

test("2. HABIT ONLY: reactive_urge is available", () => {
  const activeLayers: DevelopmentLayer[] = ["habit"];
  assert.equal(getAvailableLiveTriggers(activeLayers).includes("reactive_urge"), true);
});

test("3. IDENTITY ONLY: proactive identity target is available", () => {
  const activeLayers: DevelopmentLayer[] = ["identity"];
  const p = profile({ desiredIdentity: "אומץ" });
  const targets = getAvailableProactiveTargets(activeLayers, p);
  assert.deepEqual(targets, [{ layer: "identity", label: "אומץ" }]);
});

// --- 4: STATE + HABIT does not require identity ---

test("4. STATE + HABIT: a full habit-route session reaches encode without identity data", () => {
  const activeLayers: DevelopmentLayer[] = ["state", "habit"];
  const p = profile({ beneficialAction: "לגשת ולפתוח שיחה" });
  assert.equal(resolveLiveRoute("reactive_urge", activeLayers), "reactive_habit");

  let session = createEmptyLiveState();
  session = { ...session, currentArcStage: "sensation_check" };
  const outcome = step(
    "sensation_check",
    { ...applyTriggerSelection(session, "reactive_urge"), sensationIntensity: 2 },
    p,
    activeLayers
  );
  assert.equal(outcome.stage, "encode");
});

// --- 5/6/7: presence gate + route selection ---

test("5. Low presence: ARC Thought starts regardless of which trigger was chosen", () => {
  const p = profile();
  for (const trigger of ["reactive_emotion", "reactive_urge", "proactive"] as const) {
    const activeLayers: DevelopmentLayer[] = trigger === "reactive_urge" ? ["habit"] : ["state"];
    let session = applyTriggerSelection(createEmptyLiveState(), trigger);
    session = applyScaleAnswer("presence_check", session, 3);
    const outcome = step("presence_check", session, p, activeLayers);
    assert.equal(outcome.stage, "arc_thought_awareness", `trigger ${trigger} should still run ARC Thought at low presence`);
  }
});

test("6. High presence + reactive_emotion: reactive route starts directly", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  let session = applyTriggerSelection(createEmptyLiveState(), "reactive_emotion");
  session = applyScaleAnswer("presence_check", session, 9);
  const outcome = step("presence_check", session, p, activeLayers);
  assert.equal(outcome.stage, "sensation_check");
});

test("7. High presence + reactive_urge: habit route starts only when habit is active", () => {
  const p = profile();
  assert.throws(() => resolveLiveRoute("reactive_urge", ["state"]));

  const activeLayers: DevelopmentLayer[] = ["habit"];
  let session = applyTriggerSelection(createEmptyLiveState(), "reactive_urge");
  session = applyScaleAnswer("presence_check", session, 9);
  const outcome = step("presence_check", session, p, activeLayers);
  assert.equal(outcome.stage, "sensation_check");
});

// --- 8/9: proactive rating threshold ---

test("8. Proactive rating below threshold routes to regulate", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  let session = applyTriggerSelection(createEmptyLiveState(), "proactive");
  session = applyScaleAnswer("desired_state_check", session, 3);
  const outcome = step("desired_state_check", session, p, activeLayers);
  assert.equal(outcome.stage, "regulate");
});

test("9. Proactive rating at/above threshold routes to encode", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  let session = applyTriggerSelection(createEmptyLiveState(), "proactive");
  session = applyScaleAnswer("desired_state_check", session, 7);
  const outcome = step("desired_state_check", session, p, activeLayers);
  assert.equal(outcome.stage, "encode");
});

// --- 10: reactive intensity bands ---

test("10. Reactive ratings classify into the right band", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  const cases: Array<[number, ArcStage]> = [
    [8, "stay"],
    [6, "reactive_transition_check"],
    [4, "regulate"],
    [3, "encode"],
  ];
  for (const [intensity, expected] of cases) {
    const session = applySensationAnswer(createEmptyLiveState(), null, intensity);
    const outcome = step("sensation_check", session, p, activeLayers);
    assert.equal(outcome.stage, expected, `intensity ${intensity}`);
  }
});

// --- 11: invalid ratings are rejected by the engine, not silently accepted ---

test("11. An out-of-range rating throws instead of silently progressing", () => {
  const p = profile();
  const session = applySensationAnswer(createEmptyLiveState(), null, 20);
  assert.throws(() => step("sensation_check", session, p, ["state"]));
});

// --- 12/13/14: action completion -> daily credit, only when earned ---

test("12. Reaching act and confirming the real action grants Training Day credit", () => {
  let session = createEmptyLiveState();
  const p = profile();
  const outcome = step("encode", session, p, ["state"]); // encode -> act
  assert.equal(outcome.stage, "act");
  assert.equal(outcome.session.actionReached, true);

  const confirmed = applyActionCompletion(outcome.session, true);
  assert.equal(confirmed.realActionCompleted, true);

  const progress = createInitialProgress("state_only_1_week");
  const updated = recordValidLiveCompletion({
    progress,
    reachedAct: confirmed.actionReached,
    actionCompleted: confirmed.realActionCompleted,
    localDate: "2026-01-05",
  });
  assert.equal(updated.trainingDatesThisWeek.length, 1);
});

test("13. Reaching act WITHOUT confirming the real action grants no credit", () => {
  let session = createEmptyLiveState();
  const p = profile();
  const outcome = step("encode", session, p, ["state"]);
  assert.equal(outcome.session.actionReached, true);
  assert.equal(outcome.session.realActionCompleted, false); // never confirmed

  const progress = createInitialProgress("state_only_1_week");
  const updated = recordValidLiveCompletion({
    progress,
    reachedAct: outcome.session.actionReached,
    actionCompleted: outcome.session.realActionCompleted,
    localDate: "2026-01-05",
  });
  assert.equal(updated.trainingDatesThisWeek.length, 0);
  assert.equal(updated.liveSessionCount, 1, "opening/using LIVE is still counted as a session, just not a credited day");
});

test("13b. Abandoning before act is even reached leaves actionReached false", () => {
  const session = createEmptyLiveState(); // never advanced past trigger_selection
  assert.equal(session.actionReached, false);
});

test("14. Two qualifying LIVE completions on the same local date cap at one Training Day credit", () => {
  let progress = createInitialProgress("state_only_1_week");
  progress = recordValidLiveCompletion({ progress, reachedAct: true, actionCompleted: true, localDate: "2026-01-05" });
  progress = recordValidLiveCompletion({ progress, reachedAct: true, actionCompleted: true, localDate: "2026-01-05" });
  assert.equal(progress.trainingDatesThisWeek.length, 1);
  assert.equal(progress.liveSessionCount, 2, "both sessions are counted, only one day is credited");
});

// --- 15/16: Reactive recognition chooser (#4, #5, #6, #16) -- the adapter
// auto-resolves a single mapped experience, and stays at trigger_selection
// when 2+ are mapped until one is explicitly picked ---

test("15. A single mapped Reactive experience is auto-resolved at trigger_selection, without asking the chooser", () => {
  const p = profile({ interferingState: "פיזור", supportiveState: "מיקוד" });
  const activeLayers: DevelopmentLayer[] = ["state"];
  const session = applyTriggerSelection(createEmptyLiveState(), "reactive_emotion");
  const outcome = step("trigger_selection", session, p, activeLayers);
  assert.equal(outcome.session.selectedTarget, "state", "the one mapped experience is auto-selected");
  assert.equal(outcome.stage, "trigger_context", "reactive sessions now route through the trigger recognition step first");
});

test("16. Two mapped Reactive experiences stay at trigger_selection until one is explicitly chosen, then resolve deterministically -- Craving never resolves to Focus's state map", () => {
  const p = profile({
    interferingState: "פיזור",
    supportiveState: "מיקוד",
    identityInterferingEmotion: "תשוקה",
    desiredIdentity: "משמעת",
  });
  const activeLayers: DevelopmentLayer[] = ["state", "identity"];
  const session = applyTriggerSelection(createEmptyLiveState(), "reactive_emotion");
  const stayed = step("trigger_selection", session, p, activeLayers);
  assert.equal(stayed.stage, "trigger_selection", "must show the chooser rather than guessing");
  assert.equal(stayed.session.selectedTarget, null);

  const craving = applyTargetSelection(stayed.session, "identity");
  const resolved = step("trigger_selection", craving, p, activeLayers);
  assert.equal(resolved.stage, "trigger_context", "reactive sessions now route through the trigger recognition step first");
  assert.equal(resolved.session.selectedTarget, "identity", "Craving resolves to the identity (Discipline) target, never state");
});

// --- 17-22: Body Sensation Check now requires an explicit location
// response (preset chip / custom free text / "לא ברור לי איפה") before
// intensity can be submitted, without ever forcing the trainee to
// invent a location -- resolveSensationLocation/hasSensationLocationResponse
// are the pure functions live/screens.tsx's SensationRatingScreen gates
// on, since this project has no React rendering harness to test the
// screen itself directly. ---

test("17. An existing preset body location resolves as-is", () => {
  assert.equal(resolveSensationLocation("חזה", "", false), "חזה");
});

test("18. A custom free-text body location resolves as-is, trimmed", () => {
  assert.equal(resolveSensationLocation("", "  מתחת לצלעות  ", false), "מתחת לצלעות");
});

test("19. 'לא ברור לי איפה' resolves to the explicit SENSATION_LOCATION_UNCLEAR sentinel, never confused with 'not yet answered' (null)", () => {
  assert.equal(resolveSensationLocation("", "", true), SENSATION_LOCATION_UNCLEAR);
  assert.notEqual(SENSATION_LOCATION_UNCLEAR, null);
});

test("20. The trainee cannot continue with no body-location response: hasSensationLocationResponse is false, and resolveSensationLocation yields null, when nothing is given", () => {
  assert.equal(hasSensationLocationResponse("", "", false), false);
  assert.equal(resolveSensationLocation("", "", false), null);
});

test("20b. hasSensationLocationResponse is true for any of the three valid responses, and whitespace-only text still doesn't count as an answer", () => {
  assert.equal(hasSensationLocationResponse("חזה", "", false), true, "preset selected");
  assert.equal(hasSensationLocationResponse("", "כתף שמאל", false), true, "custom text entered");
  assert.equal(hasSensationLocationResponse("", "", true), true, "\"לא ברור לי איפה\" selected");
  assert.equal(hasSensationLocationResponse("   ", "   ", false), false, "whitespace-only text is not a real answer");
});

test("21. Intensity stays fully independent of the body-location response -- applySensationAnswer stores whatever intensity is given regardless of which (or no) location resolved", () => {
  const withPreset = applySensationAnswer(createEmptyLiveState(), resolveSensationLocation("חזה", "", false), 7);
  assert.equal(withPreset.sensationLocation, "חזה");
  assert.equal(withPreset.sensationIntensity, 7);

  const withUnclear = applySensationAnswer(createEmptyLiveState(), resolveSensationLocation("", "", true), 3);
  assert.equal(withUnclear.sensationLocation, SENSATION_LOCATION_UNCLEAR);
  assert.equal(withUnclear.sensationIntensity, 3, "intensity is stored the same way regardless of the location value");
});

test("22. ArcLiveState's shape is unchanged -- Body Sensation Check reuses the existing sensationLocation field rather than adding new session-state fields, so existing stored/serialized session shapes stay backwards compatible", () => {
  const state = createEmptyLiveState();
  assert.equal(state.sensationLocation, null);
  assert.ok(!("bodyLocationUnclear" in state), "\"unclear\" is encoded inside sensationLocation itself, not a new field");
  assert.ok(!("customSensationLocation" in state), "custom text is resolved into sensationLocation before it ever reaches ArcLiveState");
});

// --- 23-29: Action-choice ("can I perform the planned action now?") --
// applyPlannedActionConfirmed ("כן"), applyAlternativeAction ("לא", once
// validated), and the required non-empty-text + selected-duration
// validation, all as pure adapter functions.

test("23. Choosing 'כן' confirms the planned action without touching selectedAction -- currentAction stays the mapped/planned one", () => {
  const confirmed = applyPlannedActionConfirmed(createEmptyLiveState());
  assert.equal(confirmed.plannedActionConfirmed, true);
  assert.equal(confirmed.selectedAction, null, "no override -- the resolved action stays the planned/mapped one");
});

test("24. hasValidAlternativeAction requires both non-empty text and a selected duration -- 'לא' never silently falls back to the planned action", () => {
  assert.equal(hasValidAlternativeAction("", null), false, "neither given");
  assert.equal(hasValidAlternativeAction("5 דקות תרגילים בבית", null), false, "text without a duration");
  assert.equal(hasValidAlternativeAction("", 10), false, "duration without text");
  assert.equal(hasValidAlternativeAction("   ", 10), false, "whitespace-only text doesn't count");
  assert.equal(hasValidAlternativeAction("5 דקות תרגילים בבית", 10), true, "both given -- valid");
});

test("25. A valid alternative action and its duration can be selected/configured, and together become currentAction/the resolved duration", () => {
  const p = profile({ internalAction: "לצאת להליכה של 20 דקות", actionDuration: 20 });
  const withAlternative = applyAlternativeAction(createEmptyLiveState(), "5 דקות תרגילים בבית", 5);
  assert.equal(withAlternative.selectedAction, "5 דקות תרגילים בבית");
  assert.equal(withAlternative.selectedActionDuration, 5);

  const resolved = resolveEncodingTarget({
    activeLayers: ["state"],
    triggerType: "reactive_emotion",
    selectedTarget: "state",
    buildProfile: p,
    selectedAction: withAlternative.selectedAction,
  });
  assert.equal(resolved.actionLabel, "5 דקות תרגילים בבית", "currentAction is the alternative action");
  assert.equal(resolveActionDuration(withAlternative.selectedActionDuration, p), 5, "the alternative's own duration is used, not the BUILD one");
});

test("26. applyAlternativeAction trims the entered text", () => {
  const withAlternative = applyAlternativeAction(createEmptyLiveState(), "  5 דקות תרגילים בבית  ", 5);
  assert.equal(withAlternative.selectedAction, "5 דקות תרגילים בבית");
});

test("27. Choosing an alternative action never mutates the persisted BUILD/planned action -- it only ever affects this LIVE session's ArcLiveState", () => {
  const p = profile({ internalAction: "לצאת להליכה של 20 דקות", actionDuration: 20 });
  const before = { ...p };
  applyAlternativeAction(createEmptyLiveState(), "5 דקות תרגילים בבית", 5);
  applyPlannedActionConfirmed(createEmptyLiveState());
  assert.deepEqual(p, before, "the profile object is never mutated by either Action-choice branch");
});

test("28. needsCurrentActionResolution resolves Focus and Discipline independently -- confirming/choosing an alternative for one target's session never implicitly resolves the other", () => {
  // Each LIVE session targets exactly one DevelopmentLayer at a time
  // (selectedTarget), so plannedActionConfirmed/selectedAction are
  // inherently scoped to that one session/target -- there is no shared
  // global state a Focus session's choice could leak into a Discipline
  // session through.
  const focusSession = applyPlannedActionConfirmed(applyTargetSelection(createEmptyLiveState(), "state"));
  const disciplineSession = applyAlternativeAction(applyTargetSelection(createEmptyLiveState(), "identity"), "לשבת זקוף ולנשום", 10);
  assert.equal(needsCurrentActionResolution(focusSession.plannedActionConfirmed, focusSession.selectedAction), false);
  assert.equal(needsCurrentActionResolution(disciplineSession.plannedActionConfirmed, disciplineSession.selectedAction), false);
  assert.notEqual(focusSession.selectedTarget, disciplineSession.selectedTarget);
});

// --- applyActionImageryCompleted: the "act" stage's Imagery sub-phase
// marks its own flag done and nothing else -- never advances the
// ArcStage itself (that stays "act" until the real Action Timer
// completes). LIVE-flow-update task: the standalone Action Preparation
// sub-phase this section used to also test is removed -- Imagery now
// goes straight to Performing.

test("29. applyActionImageryCompleted marks Imagery done and touches nothing else", () => {
  const before = createEmptyLiveState();
  const after = applyActionImageryCompleted(before);
  assert.equal(after.actionImageryCompleted, true);
  assert.equal(after.currentArcStage, before.currentArcStage, "the ArcStage itself is never advanced by this call");
});

test("29b. applyBeneficialActionDurationSelected records the live duration choice and touches nothing else", () => {
  const before = { ...createEmptyLiveState(), actionImageryCompleted: true };
  const after = applyBeneficialActionDurationSelected(before, 7);
  assert.equal(after.beneficialActionDurationMinutes, 7);
  assert.equal(after.actionImageryCompleted, true, "Imagery's own flag stays as it was");
  assert.equal(after.currentArcStage, before.currentArcStage, "the ArcStage itself is never advanced by this call");
});

test("coordinated timer/dwell task (Part 1): applyBeneficialActionDurationSelected accepts every integer minute from 1 through 10, including the new 1-minute floor with no 5-minute minimum any more", () => {
  const before = createEmptyLiveState();
  for (let minutes = 1; minutes <= 10; minutes++) {
    const after = applyBeneficialActionDurationSelected(before, minutes);
    assert.equal(after.beneficialActionDurationMinutes, minutes, `minute value ${minutes} must be selectable and stored as-is`);
  }
  // resolveActionDuration then resolves this exact value, unchanged --
  // the real Action Timer (arc/actionTimer.ts) is duration-agnostic and
  // already handles any positive minute count correctly.
  const oneMinute = applyBeneficialActionDurationSelected(before, 1);
  assert.equal(resolveActionDuration(null, profile(), oneMinute.beneficialActionDurationMinutes), 1);
});

test("31. a fresh session starts with the act-phase flag false and no live Beneficial Action duration chosen -- Imagery is never pre-completed", () => {
  const state = createEmptyLiveState();
  assert.equal(state.actionImageryCompleted, false);
  assert.equal(state.beneficialActionDurationMinutes, null);
});

test("32. applyNegativeActionStarted marks the Negative Action Timer started and touches nothing else", () => {
  const before = createEmptyLiveState();
  const after = applyNegativeActionStarted(before);
  assert.equal(after.negativeActionStarted, true);
  assert.equal(after.currentArcStage, before.currentArcStage, "the ArcStage itself is never advanced by this call");
  assert.equal(after.realActionCompleted, before.realActionCompleted, "the Beneficial Action's own completion flag is untouched");
});

test("33. a fresh session starts with negativeActionStarted false -- the Negative Action Timer never auto-starts", () => {
  assert.equal(createEmptyLiveState().negativeActionStarted, false);
});

// --- first stage sanity ---

test("getFirstArcStage is trigger_selection, matching the new LIVE entry question", () => {
  assert.equal(getFirstArcStage(), "trigger_selection");
});

// --- Timing-update task: inline Presence/Regulation rating merge.
//
// live/LiveSessionScreen.tsx's onPresenceExperienceRating/
// onRegulationExperienceRating handlers never render
// arc_thought_presence_recheck, or desired_state_check/sensation_check
// reached via regulate, as their own screen anymore -- the rating is
// answered inline on the preceding experience's page instead. These
// tests replicate those handlers' exact logic (same applyXxx/
// advanceLiveSession calls, same order) and compare the result against
// the OLD, separately-rendered two-screen flow -- walking the SAME,
// completely unmodified arc/arcEngine.ts transitions one real hop at a
// time. Equal results at every step confirm the merge only changed
// WHERE the rating is collected, never the ARC logic, thresholds,
// loop-safety cap, or stored rating fields themselves.

function simulateOnPresenceExperienceRating(
  session: ArcLiveState,
  p: ArcBuildProfile,
  activeLayers: DevelopmentLayer[],
  value: number
) {
  return advanceLiveSession(
    "arc_thought_presence_recheck",
    applyScaleAnswer("arc_thought_presence_recheck", session, value),
    p,
    activeLayers
  );
}

function simulateOnRegulationExperienceRating(
  session: ArcLiveState,
  p: ArcBuildProfile,
  activeLayers: DevelopmentLayer[],
  value: number
) {
  const withToolUsed = applyRegulationToolUsed(session, p.regulationTool);
  const hop = advanceLiveSession("regulate", withToolUsed, p, activeLayers);
  const withRating =
    hop.stage === "desired_state_check"
      ? applyScaleAnswer("desired_state_check", hop.session, value)
      : applySensationAnswer(hop.session, hop.session.sensationLocation, value);
  return advanceLiveSession(hop.stage, withRating, p, activeLayers);
}

test("Presence merge: a high recheck rating produces the exact same stage/session as the old two-screen flow (expand_presence -> presence_recheck, entered separately)", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  const session: ArcLiveState = { ...createEmptyLiveState(), triggerType: "reactive_emotion" };

  // OLD flow: two separate real hops, exactly as when
  // arc_thought_presence_recheck was its own rendered screen.
  const oldHop1 = advanceLiveSession("arc_thought_expand_presence", session, p, activeLayers);
  assert.equal(oldHop1.stage, "arc_thought_presence_recheck");
  const oldHop2 = advanceLiveSession(
    "arc_thought_presence_recheck",
    applyScaleAnswer("arc_thought_presence_recheck", oldHop1.session, 9),
    p,
    activeLayers
  );

  // NEW merged flow: one inline rating answered directly on
  // arc_thought_expand_presence's own page.
  const merged = simulateOnPresenceExperienceRating(session, p, activeLayers, 9);

  assert.deepEqual(merged, oldHop2, "merging the rating onto the same page must not change the resulting stage or session at all");
  assert.equal(merged.session.presenceRating, 9, "the rating is stored in the exact same existing field");
  assert.notEqual(
    merged.stage,
    "arc_thought_presence_recheck",
    "the old standalone rating stage is never the literal next rendered stage once merged"
  );
});

test("Presence merge: a still-low recheck rating loops back to arc_thought_expand_presence with loopIterationCount incremented, exactly as the old flow's loop-back did", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  const session: ArcLiveState = { ...createEmptyLiveState(), triggerType: "reactive_emotion" };
  const merged = simulateOnPresenceExperienceRating(session, p, activeLayers, 2);
  assert.equal(merged.stage, "arc_thought_expand_presence", "still low -> loop back to re-expand, same target stage the old flow looped to");
  assert.equal(merged.session.loopIterationCount, 1);
});

test("Presence merge: the loop-back is still capped at ARC_CONFIG.safety.maxLoopIterations (3) -- eventually force-continues past ARC Thought, never trapping the trainee", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  let result = simulateOnPresenceExperienceRating({ ...createEmptyLiveState(), triggerType: "reactive_emotion" }, p, activeLayers, 2);
  let calls = 1;
  while (result.stage === "arc_thought_expand_presence" && calls < 10) {
    assert.ok(result.session.loopIterationCount <= 3, "loopIterationCount must never exceed the safety cap while still looping");
    result = simulateOnPresenceExperienceRating(result.session, p, activeLayers, 2);
    calls++;
  }
  assert.notEqual(result.stage, "arc_thought_expand_presence", "must eventually be forced past the loop within a handful of attempts");
  assert.equal(result.session.loopIterationCount, 3, "force-continued at exactly the safety cap, same as before the merge");
});

test("Regulation merge (proactive): the Desired State Level rating merges inline, producing the exact same stage/session as the old two-screen flow (regulate -> desired_state_check, entered separately)", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  const session: ArcLiveState = {
    ...createEmptyLiveState(),
    triggerType: "proactive",
    selectedTarget: "state",
    loopIterationCount: 1,
  };

  const withToolUsed = applyRegulationToolUsed(session, p.regulationTool);
  const oldHop1 = advanceLiveSession("regulate", withToolUsed, p, activeLayers);
  assert.equal(oldHop1.stage, "desired_state_check");
  const oldHop2 = advanceLiveSession("desired_state_check", applyScaleAnswer("desired_state_check", oldHop1.session, 8), p, activeLayers);

  const merged = simulateOnRegulationExperienceRating(session, p, activeLayers, 8);

  assert.deepEqual(merged, oldHop2);
  assert.equal(merged.session.desiredStateRating, 8, "stored in the exact same existing field");
  assert.ok(merged.session.activeTools.includes(p.regulationTool!), "applyRegulationToolUsed's existing side effect is preserved by the merge");
});

test("Regulation merge (reactive): the intensity recheck rating merges inline, preserving the existing sensationLocation instead of re-asking for it, exactly as the old flow's recheck did", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  const session: ArcLiveState = {
    ...createEmptyLiveState(),
    triggerType: "reactive_emotion",
    sensationLocation: "חזה",
    sensationIntensity: 5,
    loopIterationCount: 1,
  };

  const withToolUsed = applyRegulationToolUsed(session, p.regulationTool);
  const oldHop1 = advanceLiveSession("regulate", withToolUsed, p, activeLayers);
  assert.equal(oldHop1.stage, "sensation_check");
  const oldHop2 = advanceLiveSession(
    "sensation_check",
    applySensationAnswer(oldHop1.session, oldHop1.session.sensationLocation, 3),
    p,
    activeLayers
  );

  const merged = simulateOnRegulationExperienceRating(session, p, activeLayers, 3);

  assert.deepEqual(merged, oldHop2);
  assert.equal(merged.session.sensationIntensity, 3);
  assert.equal(merged.session.sensationLocation, "חזה", "the recheck never re-asks for or overwrites the existing location");
});

test("Regulation merge: once the loop-safety cap is reached, regulate's own transition (peeked by live/ArcLiveRenderer.tsx before ever offering a rating) goes straight to encode -- no rating is asked for, matching the pre-merge capped behavior", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  const session: ArcLiveState = {
    ...createEmptyLiveState(),
    triggerType: "proactive",
    selectedTarget: "state",
    loopIterationCount: 3, // == ARC_CONFIG.safety.maxLoopIterations
  };
  const peek = getNextArcStage("regulate", session, p, activeLayers);
  assert.equal(peek.stage, "encode", "capped -- no recheck rating stage is reached at all, same as before the merge");
});

test("desired_state_check's own first-time entry (via afterArcThought, never through regulate) is completely unaffected by the Regulation merge -- that occurrence was never merged, and is still its own standalone rating screen", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  let session = applyTriggerSelection(createEmptyLiveState(), "proactive");
  session = applyScaleAnswer("presence_check", session, 9); // high presence, skip ARC Thought
  const outcome = step("presence_check", session, p, activeLayers);
  assert.equal(outcome.stage, "desired_state_check", "still reached directly, exactly as before -- unaffected by the merge");
});

// --- BUG REGRESSION: reported symptom was the "הרחבה" (arc_thought_expand_presence)
// screen showing its instruction + a Continue button forever, with the
// inline Presence rating never appearing even after waiting well past the
// extra 15s. Root cause investigation (this session) found the LIVE code
// on main already fully implements the inline merge correctly and
// unchanged since it landed -- confirmed by diffing arc/stageCopy.ts,
// arc/instructionTiming.ts, live/screens.tsx, live/ArcLiveRenderer.tsx,
// and live/LiveSessionScreen.tsx against that commit (zero diff). The
// reported symptom exactly matches the OLD, pre-merge rendering (the
// shared InstructionScreen/TimedInstructionBody component -- title +
// disabled-then-enabled "המשך" Continue button, no rating ever shown on
// that screen), which arc_thought_expand_presence stopped using once the
// merge landed; a device/build predating that commit would show exactly
// this. No source fix was needed. This test pins the CURRENT, correct
// behavior end to end -- using the real getStageCopy("arc_thought_expand_presence", ...)
// output (not a synthetic stand-in), not just structural segment shape --
// as a permanent regression guard.
test("BUG REGRESSION: the arc_thought_expand_presence (\"הרחבה\") screen reveals the Presence rating inline only after instruction+15s, never a separate page, and nothing can bypass it before then", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  const session: ArcLiveState = { ...createEmptyLiveState(), triggerType: "reactive_emotion" };

  // The REAL production copy for this exact stage -- not a synthetic segments array.
  const copy = getStageCopy("arc_thought_expand_presence", p, session, activeLayers);
  assert.equal(copy.title, "הרחבה");
  assert.ok(copy.segments, "must be a timed/segmented screen, not the untimed 'segments: null' shape that renders an immediate Continue");

  const instructionSeconds = INSTRUCTION_TIMING.arcThoughtExpandPresence;
  // Coordinated timer/dwell task: the trailing reveal segment is now this
  // layer's own configured Presence dwell (arc/dwellTimes.ts) -- the
  // default here, since `p` never customized presenceDwellSeconds.
  const totalRevealSeconds = instructionSeconds + DEFAULT_DWELL_TIMES.presenceDwellSeconds;

  // 1/2. Rating is absent for the entire base instruction duration, and...
  assert.equal(getInstructionTimingStatus(copy.segments, 0).complete, false, "hidden at t=0");
  assert.equal(getInstructionTimingStatus(copy.segments, instructionSeconds).complete, false, "still hidden the instant the instruction itself finishes");
  // ...remains absent through the entire additional 15s on top of it.
  assert.equal(getInstructionTimingStatus(copy.segments, totalRevealSeconds - 0.1).complete, false, "hidden one tick before instruction+15s");
  // 3. Appears on this SAME screen -- same copy/segments -- exactly once instruction+15s has elapsed.
  assert.equal(getInstructionTimingStatus(copy.segments, totalRevealSeconds).complete, true, "revealed exactly at instruction+15s");

  // 4. Nothing can bypass it before reveal time: live/screens.tsx's
  // PresenceExperienceScreen (which is what arc_thought_expand_presence
  // renders -- see live/ArcLiveRenderer.tsx) gates ALL interactive
  // content, including the rating, behind this same `complete` flag, and
  // has no separate Continue/skip affordance of its own at any point --
  // unlike arc_thought_awareness/arc_thought_combined_attention/
  // preventive_action (still the plain InstructionScreen, Continue-only,
  // by design) or regulate's capped fallback (which does have one).
  // There is therefore no control on this screen that could fire before
  // `complete` is true.

  // 5/6/7. Selecting the rating stores it in the existing presenceRating
  // field, progression continues through arc_thought_presence_recheck's
  // OWN unmodified transition (loop-back-if-still-low, or continue), and
  // that stage is never the literal next rendered stage -- i.e. no
  // separate Presence Rating page is visited.
  const withRating = applyScaleAnswer("arc_thought_presence_recheck", session, 9);
  const advanced = advanceLiveSession("arc_thought_presence_recheck", withRating, p, activeLayers);
  assert.equal(advanced.session.presenceRating, 9, "stored in the exact existing field");
  assert.notEqual(advanced.stage, "arc_thought_presence_recheck", "the old standalone rating stage is never the literal next rendered stage");
  assert.equal(advanced.stage, "sensation_check", "progression continues correctly to the next protocol stage");
});

// --- BUG REGRESSION: the Desired State Level check must appear inline
// on the SAME Regulation ("ויסות") screen. This mirrors the Presence
// regression test above but for Regulation's real production copy, so
// both named categories from the escalated bug report have an
// end-to-end guard tying the real getStageCopy output through the
// reveal timer and the merge handler, not just structural segment
// shape (already covered separately in arc/stageCopy.test.ts).
test("BUG REGRESSION: the Regulation (\"ויסות\") screen reveals the Desired State Level rating inline only after instruction+dwell, remains on the same screen, and the existing ARC threshold/progression logic still receives the exact same value", () => {
  const p = profile({ regulationTool: "נשימה 4-7-8" });
  const activeLayers: DevelopmentLayer[] = ["state"];
  const session: ArcLiveState = {
    ...createEmptyLiveState(),
    triggerType: "proactive",
    selectedTarget: "state",
    loopIterationCount: 1, // regulate is only ever reached after a prior desired_state_check pass, so a target is already resolved
  };

  // The REAL production copy for this exact stage -- not a synthetic segments array.
  const copy = getStageCopy("regulate", p, session, activeLayers);
  assert.equal(copy.title, "ויסות");
  assert.ok(copy.segments, "must be a timed/segmented screen, not the untimed 'segments: null' shape that renders an immediate Continue");

  const instructionSeconds = INSTRUCTION_TIMING.regulate;
  // Dwell-time task: the trailing reveal segment is now this target's own
  // configured Regulation dwell (arc/dwellTimes.ts) -- DEFAULT_DWELL_TIMES'
  // value here, since `p` never customized regulationDwellSeconds --
  // rather than the flat INLINE_RATING_REVEAL_DELAY_SECONDS this used to
  // carry (that constant now governs only arc_thought_expand_presence's
  // unrelated, unchanged Presence rating reveal).
  const totalRevealSeconds = instructionSeconds + DEFAULT_DWELL_TIMES.regulationDwellSeconds;
  assert.equal(getInstructionTimingStatus(copy.segments, 0).complete, false, "hidden at t=0");
  assert.equal(getInstructionTimingStatus(copy.segments, instructionSeconds).complete, false, "still hidden the instant Regulation's own instruction finishes");
  assert.equal(getInstructionTimingStatus(copy.segments, totalRevealSeconds - 0.1).complete, false, "hidden one tick before instruction+dwell");
  assert.equal(getInstructionTimingStatus(copy.segments, totalRevealSeconds).complete, true, "revealed exactly at instruction+dwell, remaining on this same screen");

  // Selecting the rating stores it in the existing desiredStateRating
  // field, and the existing getProactiveStage threshold decides what
  // comes next -- both completely unchanged by the merge.
  const withToolUsed = applyRegulationToolUsed(session, p.regulationTool);
  const hop = advanceLiveSession("regulate", withToolUsed, p, activeLayers);
  assert.equal(hop.stage, "desired_state_check");
  const withRating = applyScaleAnswer("desired_state_check", hop.session, 7); // matches the existing at/above-threshold case already covered by test 9 above
  const advanced = advanceLiveSession("desired_state_check", withRating, p, activeLayers);
  assert.equal(advanced.session.desiredStateRating, 7, "stored in the exact existing field");
  assert.notEqual(advanced.stage, "desired_state_check", "the old standalone rating stage is never the literal next rendered stage");
  assert.equal(advanced.stage, "encode", "existing ARC threshold/progression logic still receives and acts on the exact same value");
});

// --- Timing-update task: inline Feeling/Urge/Interfering-state intensity
// merge (accept -> sensation_check recheck). This was the one standalone
// rating-after-experience path left unmerged in the earlier Presence/
// Regulation work (deliberately, at the time) -- it is the genuine gap
// behind this escalated report's "feeling/urge/interfering-state
// intensity" category. See live/screens.tsx's
// AcceptScreen/AcceptRatingReveal and live/LiveSessionScreen.tsx's
// onAcceptAnswer/onAcceptIntensityRating/onAcceptContinueWithoutRating.

function simulateOnAcceptIntensityRating(
  session: ArcLiveState,
  p: ArcBuildProfile,
  activeLayers: DevelopmentLayer[],
  value: number
) {
  const hop = advanceLiveSession("accept", session, p, activeLayers);
  const withRating = applySensationAnswer(hop.session, hop.session.sensationLocation, value);
  return advanceLiveSession(hop.stage, withRating, p, activeLayers);
}

test("Feeling/intensity merge: the accept screen's own reveal gate (a single dwell placeholder segment -- accept has no instruction timing of its own to precede it, so the delay starts at answer-time) hides the recheck rating for the full configured Acceptance dwell and reveals it exactly then -- dwell-time task: this is now the CURRENT target's own configured Acceptance dwell (arc/dwellTimes.ts), DEFAULT_DWELL_TIMES.acceptanceDwellSeconds here since unconfigured, not the flat INLINE_RATING_REVEAL_DELAY_SECONDS this used to hard-code", () => {
  const acceptanceDwellSeconds = DEFAULT_DWELL_TIMES.acceptanceDwellSeconds;
  const segments = [{ text: "", durationSeconds: acceptanceDwellSeconds }];
  assert.equal(getInstructionTimingStatus(segments, 0).complete, false, "hidden immediately after answering");
  assert.equal(getInstructionTimingStatus(segments, acceptanceDwellSeconds - 0.1).complete, false, "still hidden one tick before the dwell elapses");
  assert.equal(getInstructionTimingStatus(segments, acceptanceDwellSeconds).complete, true, "revealed exactly once the configured Acceptance dwell has elapsed after answering");
});

test("Feeling/intensity merge: selecting the recheck rating on the accept screen produces the exact same stage/session as the old two-screen flow (accept -> sensation_check, entered separately) -- the correct existing intensity field is used, with no duplicate rating created", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  const session: ArcLiveState = {
    ...createEmptyLiveState(),
    triggerType: "reactive_emotion",
    sensationLocation: "בטן", // set by the ORIGINAL sensation_check, before ever reaching accept
    sensationIntensity: 6,
    loopIterationCount: 0,
  };

  // OLD flow: two separate real hops, exactly as when sensation_check's recheck was its own rendered screen.
  const oldHop1 = advanceLiveSession("accept", session, p, activeLayers);
  assert.equal(oldHop1.stage, "sensation_check");
  const oldHop2 = advanceLiveSession(
    "sensation_check",
    applySensationAnswer(oldHop1.session, oldHop1.session.sensationLocation, 4),
    p,
    activeLayers
  );

  // NEW merged flow: one inline rating answered directly on the accept screen.
  const merged = simulateOnAcceptIntensityRating(session, p, activeLayers, 4);

  assert.deepEqual(merged, oldHop2, "merging the rating onto the same page must not change the resulting stage or session at all");
  assert.equal(merged.session.sensationIntensity, 4, "stored in the exact existing sensationIntensity field -- the same one the initial check and every other recheck already use");
  assert.equal(merged.session.sensationLocation, "בטן", "the existing location is preserved, never re-asked or overwritten by the recheck");
  assert.notEqual(merged.stage, "sensation_check", "the old standalone recheck stage is never the literal next rendered stage once merged");
});

test("Feeling/intensity merge: answering accept's willingness question (either the initial one, or a later readiness-recheck) never itself advances the ArcStage -- the stage only advances once the rating (or the capped no-rating Continue) fires", () => {
  const session = createEmptyLiveState();
  const answeredYes = applyAcceptanceWillingnessAnswer(session, true);
  assert.equal(answeredYes.acceptanceNeeded, false, "yes -> acceptanceNeeded false, same existing mapping as before the merge");
  assert.equal(answeredYes.currentArcStage, session.currentArcStage, "answering alone never advances currentArcStage");
  assert.equal(answeredYes.acceptanceWillingnessLoopCount, 0, "a 'yes' never starts an unwillingness round");

  const answeredNo = applyAcceptanceWillingnessAnswer(session, false);
  assert.equal(answeredNo.acceptanceNeeded, true, "no -> acceptanceNeeded true, same existing mapping as before the merge");
  assert.equal(answeredNo.currentArcStage, session.currentArcStage, "answering alone never advances currentArcStage");
  assert.equal(answeredNo.acceptanceWillingnessLoopCount, 1, "no -> starts (or advances) the unwillingness sub-flow's own dedicated counter");
});

// --- Dwell-time task: the Accept "לא" willingness sub-flow (#H-#M).
// applyAcceptanceWillingnessAnswer + isAcceptanceWillingnessLoopCapped
// are the pure pieces live/screens.tsx's AcceptScreen composes into the
// unwillingness-acknowledgment -> dwell -> readiness-recheck loop.

test("acceptanceWillingnessLoopCount starts at 0 and is untouched by unrelated session state -- createEmptyLiveState's own baseline", () => {
  assert.equal(createEmptyLiveState().acceptanceWillingnessLoopCount, 0);
});

test("repeated 'no' answers advance acceptanceWillingnessLoopCount by exactly one each time, independent of loopIterationCount (the UNRELATED accept -> sensation_check intensity-recheck loop)", () => {
  let session = { ...createEmptyLiveState(), loopIterationCount: 2 };
  session = applyAcceptanceWillingnessAnswer(session, false);
  assert.equal(session.acceptanceWillingnessLoopCount, 1);
  assert.equal(session.loopIterationCount, 2, "the unrelated intensity-recheck loop counter must never be perturbed by this sub-flow");
  session = applyAcceptanceWillingnessAnswer(session, false);
  assert.equal(session.acceptanceWillingnessLoopCount, 2);
  session = applyAcceptanceWillingnessAnswer(session, false);
  assert.equal(session.acceptanceWillingnessLoopCount, 3);
  assert.equal(session.loopIterationCount, 2, "still untouched after three unwillingness rounds");
});

test("isAcceptanceWillingnessLoopCapped reuses the exact same cap (ARC_CONFIG.safety.maxLoopIterations) every other ARC loop already uses -- not capped below it, capped at and above it", () => {
  assert.equal(isAcceptanceWillingnessLoopCapped(0), false);
  assert.equal(isAcceptanceWillingnessLoopCapped(ARC_CONFIG.safety.maxLoopIterations - 1), false);
  assert.equal(isAcceptanceWillingnessLoopCapped(ARC_CONFIG.safety.maxLoopIterations), true);
  assert.equal(isAcceptanceWillingnessLoopCapped(ARC_CONFIG.safety.maxLoopIterations + 1), true);
});

test("the willingness sub-flow has a defined, safe exit once capped -- three 'no' answers (matching maxLoopIterations=3) reach the cap, and a session at that count is reported capped, matching AcceptScreen's own 'auto-proceed into the normal Acceptance path instead of asking again' behavior", () => {
  let session = createEmptyLiveState();
  for (let i = 0; i < ARC_CONFIG.safety.maxLoopIterations; i++) {
    assert.equal(isAcceptanceWillingnessLoopCapped(session.acceptanceWillingnessLoopCount), false, `round ${i + 1} must still be allowed to ask again`);
    session = applyAcceptanceWillingnessAnswer(session, false);
  }
  assert.equal(session.acceptanceWillingnessLoopCount, ARC_CONFIG.safety.maxLoopIterations);
  assert.equal(isAcceptanceWillingnessLoopCapped(session.acceptanceWillingnessLoopCount), true, "capped after exactly maxLoopIterations rounds -- no unbounded loop");
});

// --- Coordinated timer/dwell task (Part 24-29): Acceptance regression
// fix. BUG: "accept" is reachable more than once within a single
// session (accept -> sensation_check -> stay -> accept), and
// acceptanceWillingnessLoopCount/acceptanceNeeded were never reset on
// a fresh re-entry -- so an initial "כן" on a SECOND visit could still
// render straight into unwillingness/retry copy, because
// AcceptScreen's render condition (willingnessLoopCount > 0) was
// reading a stale, session-wide running total instead of "did the
// trainee say 'לא' THIS visit". advanceLiveSession now resets both
// fields exactly when the ArcStage transitions freshly INTO "accept".

test("advanceLiveSession resets acceptanceWillingnessLoopCount/acceptanceNeeded to a clean baseline on every fresh entry into 'accept', even when the incoming session carries a stale, non-zero value from an earlier visit", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  const staleSession: ArcLiveState = {
    ...createEmptyLiveState(),
    triggerType: "reactive_emotion",
    selectedTarget: "state",
    acceptanceWillingnessLoopCount: 2, // stale carryover from an earlier visit to "accept"
    acceptanceNeeded: true,
  };
  const hop = advanceLiveSession("stay", staleSession, p, activeLayers); // "stay" always transitions into "accept"
  assert.equal(hop.stage, "accept", "sanity: stay always advances into accept");
  assert.equal(hop.session.acceptanceWillingnessLoopCount, 0, "a fresh entry into accept must never inherit a stale willingness-loop count");
  assert.equal(hop.session.acceptanceNeeded, null, "a fresh entry into accept must never inherit a stale NO-path flag");
});

test("advanceLiveSession never resets acceptanceWillingnessLoopCount for a transition that does NOT land on 'accept' -- the reset is scoped to fresh entry into accept specifically", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["habit"];
  const session: ArcLiveState = {
    ...createEmptyLiveState(),
    triggerType: "reactive_urge",
    sensationLocation: null,
    sensationIntensity: 2, // encoding-zone intensity -> routes to "encode", never "accept"
    acceptanceWillingnessLoopCount: 2,
    acceptanceNeeded: true,
  };
  const hop = advanceLiveSession("sensation_check", session, p, activeLayers);
  assert.notEqual(hop.stage, "accept");
  assert.equal(hop.session.acceptanceWillingnessLoopCount, 2, "untouched -- this transition never entered accept");
  assert.equal(hop.session.acceptanceNeeded, true, "untouched -- this transition never entered accept");
});

test("REGRESSION: a full second visit to 'accept' within the same session starts with a clean acceptanceWillingnessLoopCount of 0 -- an initial 'כן' on that second visit renders the plain first question, never unwillingness/retry copy, exactly like the FIRST visit's initial 'כן' would", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  let session: ArcLiveState = { ...createEmptyLiveState(), triggerType: "reactive_emotion", selectedTarget: "state" };
  let stage: ArcStage = "sensation_check";

  // First visit to accept: answer "לא" once (starts the unwillingness
  // sub-flow), then eventually "כן" to resolve and proceed, rate
  // intensity back into "stay" territory so the walk revisits accept.
  session = { ...session, sensationLocation: "חזה", sensationIntensity: 9 }; // stayMinIntensity -> "stay"
  let hop = step(stage, session, p, activeLayers);
  stage = hop.stage;
  session = hop.session;
  assert.equal(stage, "stay", "sanity: high intensity routes to stay first");

  hop = step(stage, session, p, activeLayers); // stay -> accept (FIRST visit)
  stage = hop.stage;
  session = hop.session;
  assert.equal(stage, "accept");
  assert.equal(session.acceptanceWillingnessLoopCount, 0, "sanity: the first-ever visit also starts clean");

  session = applyAcceptanceWillingnessAnswer(session, false); // "לא" -- one unwillingness round
  assert.equal(session.acceptanceWillingnessLoopCount, 1);
  session = applyAcceptanceWillingnessAnswer(session, true); // retry "כן" -- resolves into the normal path

  // Rate the intensity recheck low enough to reach the Encoding Zone
  // (never re-entering accept THIS time), completing this first visit.
  // accept -> sensation_check is its own hop; sensation_check then
  // classifies the just-set intensity on the NEXT hop.
  hop = step("accept", { ...session, sensationLocation: "חזה", sensationIntensity: 2 }, p, activeLayers);
  assert.equal(hop.stage, "sensation_check", "sanity: accept always hops to sensation_check first");
  hop = step(hop.stage, hop.session, p, activeLayers);
  stage = hop.stage;
  session = hop.session;
  assert.equal(stage, "encode", "first visit resolves through the Encoding Zone, never looping back to accept again this pass");

  // Simulate the session later revisiting "stay" (a completely separate
  // walk, or a later loop -- what matters is that "accept" is entered
  // FRESH again with the exact same stale acceptanceWillingnessLoopCount
  // still sitting on the session, unless advanceLiveSession resets it).
  const secondVisitHop = advanceLiveSession("stay", session, p, activeLayers);
  assert.equal(secondVisitHop.stage, "accept", "second fresh entry into accept");
  assert.equal(
    secondVisitHop.session.acceptanceWillingnessLoopCount,
    0,
    "REGRESSION GUARD: the second visit must start clean -- AcceptScreen's willingnessLoopCount===0 render condition (the plain initial yes/no question) depends on exactly this"
  );
  assert.equal(secondVisitHop.session.acceptanceNeeded, null, "REGRESSION GUARD: no stale NO-path flag leaks into the second visit either");
});

test("Feeling/intensity merge: once the loop-safety cap is reached, accept's own transition (peeked by live/ArcLiveRenderer.tsx before offering a rating) goes straight to regulate -- no rating is asked for, matching the pre-merge capped behavior", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  const session: ArcLiveState = {
    ...createEmptyLiveState(),
    triggerType: "reactive_emotion",
    sensationLocation: "חזה",
    sensationIntensity: 5,
    loopIterationCount: 3, // == ARC_CONFIG.safety.maxLoopIterations
  };
  const peek = getNextArcStage("accept", session, p, activeLayers);
  assert.equal(peek.stage, "regulate", "capped -- no recheck rating stage is reached at all, same as before the merge");
});

test("Feeling/intensity merge: the full stay -> accept -> (rating) chain reaches the exact same downstream stage the old standalone-screen flow would have, proving no regression to reactive routing or awareness logic", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  // A real reactive session already through the initial sensation_check (intensity 8, "stay" band) and now sitting at "stay".
  const initial: ArcLiveState = applySensationAnswer({ ...createEmptyLiveState(), triggerType: "reactive_emotion" }, "חזה", 8);
  const afterStay = advanceLiveSession("stay", initial, p, activeLayers);
  assert.equal(afterStay.stage, "accept", "stay -> accept is completely unchanged by this merge");

  const merged = simulateOnAcceptIntensityRating(afterStay.session, p, activeLayers, 3); // matches test 10's existing intensity-3 -> encode classification
  assert.equal(merged.stage, "encode", "the SAME classification (getReactiveStage) that would have run on the old standalone recheck screen still runs, unchanged");
});

test("no separate sensation_check page is visited for the accept-triggered recheck -- its own case in live/ArcLiveRenderer.tsx (SensationRatingScreen) is still reachable, just not from this specific hop", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  // The OTHER, still-unmerged path into sensation_check -- its first-time entry -- is completely unaffected.
  let session = applyTriggerSelection(createEmptyLiveState(), "reactive_emotion");
  session = applyScaleAnswer("presence_check", session, 9); // high presence, skip ARC Thought
  const outcome = step("presence_check", session, p, activeLayers);
  assert.equal(outcome.stage, "sensation_check", "the initial sensation_check entry is untouched -- only the accept-triggered recheck was merged");
});

// --- Visual-refinement task: the inline rating's reveal now uses a
// calm fade + small upward-move entrance (live/screens.tsx's
// RevealedRatingPrompt), matching RevealedInstructionLines' progressive
// style. This project has no React rendering harness (node --test, not
// Jest/RTL), so the animation/mount behavior itself isn't directly
// testable here -- these tests instead pin the underlying DATA
// guarantees the visual change depends on and must not disturb: the
// protocol instruction content is still driven by an independent,
// always-rendered `visibleSegments` array that the rating's own reveal
// never touches or hides, and the reveal timing gate itself (still
// `status.complete`, still the same existing delay) is completely
// unchanged by this purely-presentational update.

test("visual refinement: at the exact moment the Presence rating becomes available, all of arc_thought_expand_presence's own instruction content is still present in visibleSegments -- the rating is additive, never a replacement of what's already on screen", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  const session: ArcLiveState = { ...createEmptyLiveState(), triggerType: "reactive_emotion" };
  const copy = getStageCopy("arc_thought_expand_presence", p, session, activeLayers);
  assert.ok(copy.segments);

  const instructionSeconds = INSTRUCTION_TIMING.arcThoughtExpandPresence;
  // Coordinated timer/dwell task: the trailing reveal segment is now this
  // layer's own configured Presence dwell (arc/dwellTimes.ts) -- the
  // default here, since `p` never customized presenceDwellSeconds.
  const totalRevealSeconds = instructionSeconds + DEFAULT_DWELL_TIMES.presenceDwellSeconds;
  const atReveal = getInstructionTimingStatus(copy.segments, totalRevealSeconds);
  assert.equal(atReveal.complete, true, "reveal timing itself is unchanged by this purely-presentational update");

  const realInstructionText = atReveal.visibleSegments.filter((s) => s.text.length > 0).map((s) => s.text);
  assert.deepEqual(
    realInstructionText,
    [copy.segments[0].text],
    "the real instruction line is still there, unreplaced and unhidden, at the exact instant the rating becomes available"
  );
});

test("visual refinement: at the exact moment the Regulation/Desired-State rating becomes available, Regulation's own instruction content is still present in visibleSegments -- same additive guarantee as Presence", () => {
  const p = profile({ regulationTool: "נשימה 4-7-8" });
  const activeLayers: DevelopmentLayer[] = ["state"];
  const session: ArcLiveState = { ...createEmptyLiveState(), triggerType: "proactive", selectedTarget: "state", loopIterationCount: 1 };
  const copy = getStageCopy("regulate", p, session, activeLayers);
  assert.ok(copy.segments);

  // Dwell-time task: the trailing reveal segment is now this target's own
  // configured Regulation dwell (DEFAULT_DWELL_TIMES here, since `p` never
  // customized it), not the flat INLINE_RATING_REVEAL_DELAY_SECONDS this
  // used to carry.
  const totalRevealSeconds = INSTRUCTION_TIMING.regulate + DEFAULT_DWELL_TIMES.regulationDwellSeconds;
  const atReveal = getInstructionTimingStatus(copy.segments, totalRevealSeconds);
  assert.equal(atReveal.complete, true, "reveal timing itself is unchanged by this purely-presentational update");

  const realInstructionText = atReveal.visibleSegments.filter((s) => s.text.length > 0).map((s) => s.text);
  assert.deepEqual(realInstructionText, [copy.segments[0].text], "Regulation's own instruction line is still there, unreplaced, exactly when the rating becomes available");
});

test("visual refinement: the accept-triggered intensity rating's own reveal gate uses the CURRENT target's own configured Acceptance dwell (dwell-time task) -- still hidden strictly before it, revealed exactly at it", () => {
  const acceptanceDwellSeconds = DEFAULT_DWELL_TIMES.acceptanceDwellSeconds;
  const gateSegments = [{ text: "", durationSeconds: acceptanceDwellSeconds }];
  assert.equal(getInstructionTimingStatus(gateSegments, acceptanceDwellSeconds - 0.1).complete, false, "still hidden one tick before the reveal time");
  assert.equal(getInstructionTimingStatus(gateSegments, acceptanceDwellSeconds).complete, true, "revealed exactly at the reveal time, not before");
});

// --- Visual-refinement task (concise question line): the ONE fixed
// question live/screens.tsx's RevealedRatingPrompt shows for each of
// the three required inline ratings is picked in
// live/ArcLiveRenderer.tsx by the exact same peek that already gates
// whether a rating is offered at all (unchanged from the earlier
// Presence/Regulation/Accept merge work). These tests mirror that
// selection logic explicitly against the real engine peek, confirming:
// the right question maps to the right flow, the selection is null
// (no rating -> no bypassable Continue-only screen shows the wrong
// question) exactly when the underlying peek says no rating is
// expected, and this is completely independent of -- and doesn't
// disturb -- the rating's stored value or the reveal timing itself
// (both already covered above and unchanged here).

function selectRegulationQuestion(peekStage: ArcStage): string | null {
  if (peekStage === "desired_state_check") return getInlineRequiredRatingQuestion("desiredState");
  if (peekStage === "sensation_check") return getInlineRequiredRatingQuestion("intensity");
  return null;
}

test("the Presence screen's question is always the fixed presence question -- arc_thought_expand_presence unconditionally offers a rating, never null, matching its own unconditional getNextArcStage transition", () => {
  assert.equal(getInlineRequiredRatingQuestion("presence"), "מה רמת הנוכחות שלך עכשיו?");
});

test("Regulation selects the Desired State question for the proactive branch and the intensity question for the reactive branch, matching the real engine's own regulate peek", () => {
  const p = profile({ regulationTool: "נשימה 4-7-8" });
  const proactiveSession: ArcLiveState = {
    ...createEmptyLiveState(),
    triggerType: "proactive",
    selectedTarget: "state",
    loopIterationCount: 1,
  };
  const proactivePeek = getNextArcStage("regulate", proactiveSession, p, ["state"]);
  assert.equal(selectRegulationQuestion(proactivePeek.stage), "כמה אתה קרוב עכשיו למצב הרצוי?");

  const reactiveSession: ArcLiveState = {
    ...createEmptyLiveState(),
    triggerType: "reactive_emotion",
    sensationLocation: "חזה",
    sensationIntensity: 4,
    loopIterationCount: 1,
  };
  const reactivePeek = getNextArcStage("regulate", reactiveSession, p, ["state"]);
  assert.equal(selectRegulationQuestion(reactivePeek.stage), "מה עוצמת התחושה עכשיו?");
});

test("Regulation's question is null (no bypassable rating question shown) exactly when the loop-safety cap makes no rating available at all -- the screen falls back to a plain Continue, matching pre-merge capped behavior", () => {
  const p = profile({ regulationTool: "נשימה 4-7-8" });
  const cappedSession: ArcLiveState = {
    ...createEmptyLiveState(),
    triggerType: "proactive",
    selectedTarget: "state",
    loopIterationCount: 3, // == ARC_CONFIG.safety.maxLoopIterations
  };
  const peek = getNextArcStage("regulate", cappedSession, p, ["state"]);
  assert.equal(peek.stage, "encode");
  assert.equal(selectRegulationQuestion(peek.stage), null, "no question -- and therefore no rating, and no way to bypass a rating that was never offered");
});

test("Accept selects the intensity question exactly when a recheck rating is expected, and null exactly when the loop-safety cap skips it -- matching accept's own real peek", () => {
  const p = profile();
  const uncappedSession: ArcLiveState = {
    ...createEmptyLiveState(),
    triggerType: "reactive_emotion",
    sensationLocation: "בטן",
    sensationIntensity: 6,
    loopIterationCount: 0,
  };
  const uncappedPeek = getNextArcStage("accept", uncappedSession, p, ["state"]);
  assert.equal(uncappedPeek.stage, "sensation_check");
  const uncappedQuestion = uncappedPeek.stage === "sensation_check" ? getInlineRequiredRatingQuestion("intensity") : null;
  assert.equal(uncappedQuestion, "מה עוצמת התחושה עכשיו?");

  const cappedSession: ArcLiveState = {
    ...uncappedSession,
    loopIterationCount: 3,
  };
  const cappedPeek = getNextArcStage("accept", cappedSession, p, ["state"]);
  const cappedQuestion: string | null = cappedPeek.stage === "sensation_check" ? getInlineRequiredRatingQuestion("intensity") : null;
  assert.equal(cappedPeek.stage, "regulate");
  assert.equal(cappedQuestion, null, "no question -- and therefore no rating, and no way to bypass a rating that was never offered");
});

test("stored rating values and progression are unaffected by the concise-question visual refinement -- selecting each required rating still writes the exact existing field and advances exactly as before", () => {
  const p = profile({ regulationTool: "נשימה 4-7-8" });
  const activeLayers: DevelopmentLayer[] = ["state"];

  // Presence
  const presenceSession: ArcLiveState = { ...createEmptyLiveState(), triggerType: "reactive_emotion" };
  const presenceResult = advanceLiveSession(
    "arc_thought_presence_recheck",
    applyScaleAnswer("arc_thought_presence_recheck", presenceSession, 9),
    p,
    activeLayers
  );
  assert.equal(presenceResult.session.presenceRating, 9);

  // Desired State (via Regulation, proactive)
  const regulateSession: ArcLiveState = {
    ...createEmptyLiveState(),
    triggerType: "proactive",
    selectedTarget: "state",
    loopIterationCount: 1,
  };
  const withToolUsed = applyRegulationToolUsed(regulateSession, p.regulationTool);
  const hop = advanceLiveSession("regulate", withToolUsed, p, activeLayers);
  const desiredStateResult = advanceLiveSession("desired_state_check", applyScaleAnswer("desired_state_check", hop.session, 7), p, activeLayers);
  assert.equal(desiredStateResult.session.desiredStateRating, 7);

  // Intensity (via Accept)
  const acceptSession: ArcLiveState = {
    ...createEmptyLiveState(),
    triggerType: "reactive_emotion",
    sensationLocation: "חזה",
    sensationIntensity: 8,
    loopIterationCount: 0,
  };
  const acceptHop = advanceLiveSession("accept", acceptSession, p, activeLayers);
  const intensityResult = advanceLiveSession(
    "sensation_check",
    applySensationAnswer(acceptHop.session, acceptHop.session.sensationLocation, 3),
    p,
    activeLayers
  );
  assert.equal(intensityResult.session.sensationIntensity, 3);
  assert.equal(intensityResult.session.sensationLocation, "חזה", "location preserved, never re-asked");
});

// --- Reminder/timer-update task: Beneficial Action's live duration
// choice (5-10 minutes, live/screens.tsx's BeneficialActionDurationChoiceScreen)
// and Success Focus's now/later choice
// (live/screens.tsx's SuccessFocusChoiceScreen). Neither ever changes
// which ArcStage the session is on, or the engine's own transition
// rules for that stage -- both are purely which SCREEN renders next
// within the SAME stage, mirroring the established
// resolveActPhase/needsProactiveTargetSelection "conditional
// interstitial" pattern.

test("applyBeneficialActionDurationSelected records the choice and touches nothing else", () => {
  const before = { ...createEmptyLiveState(), actionImageryCompleted: true };
  const after = applyBeneficialActionDurationSelected(before, 8);
  assert.equal(after.beneficialActionDurationMinutes, 8);
  assert.equal(after.actionImageryCompleted, true);
  assert.equal(after.currentArcStage, before.currentArcStage, "never advances the ArcStage itself");
});

test("the Beneficial Action duration choice is only ever needed on the PLANNED-action path -- the alternative-action path (selectedAction already set) never gates on it", () => {
  // Mirrors live/ArcLiveRenderer.tsx's own needsBeneficialActionDuration condition exactly.
  function needsBeneficialActionDuration(session: ArcLiveState): boolean {
    return session.selectedAction === null && session.beneficialActionDurationMinutes === null;
  }

  const plannedNotYetChosen: ArcLiveState = { ...createEmptyLiveState(), plannedActionConfirmed: true, actionImageryCompleted: true };
  assert.equal(needsBeneficialActionDuration(plannedNotYetChosen), true, "planned path, no live choice yet -- the picker is needed");

  const plannedChosen = applyBeneficialActionDurationSelected(plannedNotYetChosen, 6);
  assert.equal(needsBeneficialActionDuration(plannedChosen), false, "planned path, already chosen -- the picker is no longer needed");

  const alternative: ArcLiveState = {
    ...createEmptyLiveState(),
    selectedAction: "5 דקות תרגילים בבית",
    selectedActionDuration: 5,
    actionImageryCompleted: true,
  };
  assert.equal(needsBeneficialActionDuration(alternative), false, "alternative-action path already has its own duration -- the live picker is never asked");
});

// --- Coordinated timer/dwell task (Part 2-4): Success Focus's new
// retrospective + future-scheduling sub-flow. The old now/later choice
// (applySuccessFocusChoice) is gone -- Success Focus is never forced
// immediately, and the trainee is never asked "עכשיו או מאוחר יותר?".

test("applySuccessFocusExtraMinutes records the retrospective answer and touches nothing else -- 0 is a fully valid, explicit answer, distinct from null", () => {
  const before = createEmptyLiveState();
  const zero = applySuccessFocusExtraMinutes(before, 0);
  assert.equal(zero.successFocusExtraMinutes, 0);
  assert.notEqual(zero.successFocusExtraMinutes, null, "0 is an explicit answer, never conflated with 'not yet answered'");
  assert.equal(zero.currentArcStage, before.currentArcStage, "never advances the ArcStage itself");

  const fifteen = applySuccessFocusExtraMinutes(before, 15);
  assert.equal(fifteen.successFocusExtraMinutes, 15);
});

test("applyWantsFutureSuccessFocus records the yes/no answer and touches nothing else", () => {
  const before = createEmptyLiveState();
  const yes = applyWantsFutureSuccessFocus(before, true);
  assert.equal(yes.wantsFutureSuccessFocus, true);
  assert.equal(yes.currentArcStage, before.currentArcStage, "never advances the ArcStage itself");

  const no = applyWantsFutureSuccessFocus(before, false);
  assert.equal(no.wantsFutureSuccessFocus, false);
});

test("a fresh session starts with successFocusExtraMinutes and wantsFutureSuccessFocus both null -- Success Focus is never forced immediately and the retrospective question is asked before the future-scheduling question", () => {
  const fresh = createEmptyLiveState();
  assert.equal(fresh.successFocusExtraMinutes, null);
  assert.equal(fresh.wantsFutureSuccessFocus, null);
});

test("success_focus's own engine transition is completely unaffected by successFocusExtraMinutes/wantsFutureSuccessFocus -- both are UI-side sub-flow state only; the real transition depends solely on needsNegativeAction", () => {
  const pWithHabit = profile();
  const activeLayersWithHabit: DevelopmentLayer[] = ["habit"];

  const declinedSession: ArcLiveState = {
    ...createEmptyLiveState(),
    successFocusExtraMinutes: 10,
    wantsFutureSuccessFocus: false,
    actionReached: true,
    realActionCompleted: true,
  };
  const scheduledSession: ArcLiveState = {
    ...createEmptyLiveState(),
    successFocusExtraMinutes: 0,
    wantsFutureSuccessFocus: true,
    actionReached: true,
    realActionCompleted: true,
  };

  const declinedOutcome = getNextArcStage("success_focus", declinedSession, pWithHabit, activeLayersWithHabit);
  const scheduledOutcome = getNextArcStage("success_focus", scheduledSession, pWithHabit, activeLayersWithHabit);
  assert.deepEqual(declinedOutcome, scheduledOutcome, "the transition depends only on needsNegativeAction, never on the retrospective/future-scheduling sub-flow answers");
});

// --- Reactive-flow-strengthening task: applyTriggerContext (#1, #8) --
// the session-specific trigger answer, deliberately separate from
// ArcBuildProfile.challengeContext/identityChallengeContext (the
// reusable, BUILD-configured context, which this adapter never reads
// or writes).

test("applyTriggerContext stores the trimmed trigger text in ArcLiveState.triggerContext only, never touching any BUILD/profile field", () => {
  const session = createEmptyLiveState();
  const answered = applyTriggerContext(session, "  ראיתי סרטון בטלפון  ");
  assert.equal(answered.triggerContext, "ראיתי סרטון בטלפון", "trimmed, stored verbatim otherwise");
});

test("applyTriggerContext stores null for an empty/whitespace-only answer -- optional, never required, never invented", () => {
  const session = createEmptyLiveState();
  assert.equal(applyTriggerContext(session, "").triggerContext, null);
  assert.equal(applyTriggerContext(session, "   ").triggerContext, null);
});

test("applyTriggerContext never advances currentArcStage by itself -- only advanceLiveSession does, same convention as every other applyXxx adapter", () => {
  const session = createEmptyLiveState();
  const answered = applyTriggerContext(session, "מישהו אמר לי משהו שהלחיץ אותי");
  assert.equal(answered.currentArcStage, session.currentArcStage);
});

test("a real reactive session walk: trigger_selection -> trigger_context -> observer_pause -> preventive_action_check, the trigger answer preserved throughout and never merged into the BUILD Challenge Context", () => {
  const p = profile({ statePreventiveAction: "לצאת לחמש דקות אוויר צח", challengeContext: "אחרי טעות" });
  const activeLayers: DevelopmentLayer[] = ["state"];
  let session = applyTriggerSelection(createEmptyLiveState(), "reactive_emotion");
  let hop = advanceLiveSession("trigger_selection", session, p, activeLayers);
  assert.equal(hop.stage, "trigger_context");

  session = applyTriggerContext(hop.session, "ראיתי סרטון בטלפון");
  hop = advanceLiveSession("trigger_context", session, p, activeLayers);
  assert.equal(hop.stage, "observer_pause");
  assert.equal(hop.session.triggerContext, "ראיתי סרטון בטלפון", "the session-specific trigger answer is preserved across the hop");

  hop = advanceLiveSession("observer_pause", hop.session, p, activeLayers);
  assert.equal(hop.stage, "preventive_action_check");
  assert.equal(hop.session.triggerContext, "ראיתי סרטון בטלפון", "still preserved");
  assert.equal(p.challengeContext, "אחרי טעות", "BUILD's own Challenge Context is never overwritten by the session-specific trigger answer");
  assert.equal(hop.session.triggerKnown, true, "a specific trigger resolves triggerKnown true -- the currently working known-trigger path, unregressed");
});

// --- Unknown-trigger refinement (#1-#9): "לא יודע" and equivalents must
// never block progression, force guessing, or fabricate imagery -- both
// the known and unknown paths converge on the SAME existing BUILD
// Preventive Action.

test("isUnknownTriggerResponse recognizes the spec's own examples ('לא יודע', 'לא בטוח', 'אין לי מושג') and their grammatically-gendered counterparts, trimming whitespace/trailing punctuation", () => {
  for (const text of ["לא יודע", "לא יודעת", "לא בטוח", "לא בטוחה", "אין לי מושג", "  לא יודע  ", "לא יודע.", "לא יודע!"]) {
    assert.equal(isUnknownTriggerResponse(text), true, `must recognize: "${text}"`);
  }
});

test("isUnknownTriggerResponse never misclassifies a genuine specific trigger that merely starts with 'לא' as unknown", () => {
  for (const text of ["לא הצלחתי להירדם", "לא קיבלתי תשובה מהחבר שלי", "מישהו אמר לי משהו"]) {
    assert.equal(isUnknownTriggerResponse(text), false, `must NOT recognize: "${text}"`);
  }
});

test("applyTriggerContext resolves triggerKnown=false for a recognized unknown response, while still preserving the trainee's own raw text verbatim -- 'לא יודע' is never discarded or treated as a literal semantic trigger", () => {
  const session = createEmptyLiveState();
  const answered = applyTriggerContext(session, "לא יודע");
  assert.equal(answered.triggerKnown, false);
  assert.equal(answered.triggerContext, "לא יודע", "the raw response itself is preserved, not discarded");
});

test("applyTriggerContext also resolves triggerKnown=false for a blank answer -- equally no known trigger to imagine, never forcing a guess", () => {
  const session = createEmptyLiveState();
  assert.equal(applyTriggerContext(session, "").triggerKnown, false);
  assert.equal(applyTriggerContext(session, "   ").triggerKnown, false);
});

test("applyTriggerContext resolves triggerKnown=true for a specific, non-empty, non-unknown answer", () => {
  const session = createEmptyLiveState();
  assert.equal(applyTriggerContext(session, "מישהו אמר לי משהו").triggerKnown, true);
});

test("an unknown-trigger answer never blocks progression: trigger_context still advances unconditionally to observer_pause, exactly as a known trigger does", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  const unknownSession = applyTriggerContext(
    applyTargetSelection(applyTriggerSelection(createEmptyLiveState(), "reactive_emotion"), "state"),
    "לא יודע"
  );
  const hop = advanceLiveSession("trigger_context", unknownSession, p, activeLayers);
  assert.equal(hop.stage, "observer_pause", "must never block or re-ask -- the trainee is never forced to guess a trigger");
});

test("both the known-trigger and unknown-trigger paths converge on the SAME existing BUILD Preventive Action stage -- no separate/different Preventive Action, no new open-ended strategy question", () => {
  const p = profile({ statePreventiveAction: "לנשום עמוק חמש פעמים" });
  const activeLayers: DevelopmentLayer[] = ["state"];

  const knownSession = applyTriggerContext(
    applyTargetSelection(applyTriggerSelection(createEmptyLiveState(), "reactive_emotion"), "state"),
    "מישהו אמר לי משהו שהלחיץ אותי"
  );
  const knownAfterContext = advanceLiveSession("trigger_context", knownSession, p, activeLayers);
  const knownAfterPause = advanceLiveSession("observer_pause", knownAfterContext.session, p, activeLayers);
  assert.equal(knownAfterPause.stage, "preventive_action_check");

  const unknownSession = applyTriggerContext(
    applyTargetSelection(applyTriggerSelection(createEmptyLiveState(), "reactive_emotion"), "state"),
    "לא יודע"
  );
  const unknownAfterContext = advanceLiveSession("trigger_context", unknownSession, p, activeLayers);
  const unknownAfterPause = advanceLiveSession("observer_pause", unknownAfterContext.session, p, activeLayers);
  assert.equal(unknownAfterPause.stage, "preventive_action_check");

  // Same resolved Preventive Action copy for both -- the exact existing
  // BUILD-configured one, regardless of which trigger path was taken.
  const knownCopy = getStageCopy("preventive_action_check", p, knownAfterPause.session, activeLayers);
  const unknownCopy = getStageCopy("preventive_action_check", p, unknownAfterPause.session, activeLayers);
  assert.match(knownCopy.body, /לנשום עמוק חמש פעמים/);
  assert.match(unknownCopy.body, /לנשום עמוק חמש פעמים/);
  assert.equal(knownCopy.body, unknownCopy.body, "identical Preventive Action copy for both paths");
});

test("existing downstream ARC progression is unchanged for an unknown-trigger session: the exact same sensation_check onward sequence a known-trigger session reaches", () => {
  const p = profile({ preventiveAction: null, statePreventiveAction: null, internalAction: "סריקת גוף" });
  const activeLayers: DevelopmentLayer[] = ["state"];
  let session = applyTriggerContext(
    applyTargetSelection(applyTriggerSelection(createEmptyLiveState(), "reactive_emotion"), "state"),
    "לא בטוח"
  );
  let stage: ArcStage = "trigger_context";
  const visited: ArcStage[] = ["trigger_selection", stage];
  let iterations = 0;
  while (stage !== "complete" && iterations < 30) {
    if (stage === "presence_check") session = { ...session, presenceRating: 8 };
    if (stage === "sensation_check") session = { ...session, sensationLocation: "חזה", sensationIntensity: 2 };
    const hop = advanceLiveSession(stage, session, p, activeLayers);
    session = hop.session;
    stage = hop.stage;
    visited.push(stage);
    iterations++;
  }
  assert.deepEqual(visited, [
    "trigger_selection",
    "trigger_context",
    "observer_pause",
    "presence_check",
    "sensation_check",
    "encode",
    "act",
    "success_focus",
    "complete",
  ]);
});
