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
  needsCurrentActionResolution,
  resolveActionDuration,
  resolveEncodingTarget,
  resolveLiveRoute,
} from "../arc/arcEngine.ts";
import { createEmptyLiveState } from "../arc/types.ts";
import type { ArcBuildProfile, ArcLiveState, ArcStage, DevelopmentLayer } from "../arc/types.ts";
import { recordValidLiveCompletion } from "../program/progress.ts";
import { createInitialProgress } from "../program/progress.ts";
import {
  advanceLiveSession,
  applyActionCompletion,
  applyActionImageryCompleted,
  applyActionPreparationCompleted,
  applyAlternativeAction,
  applyNegativeActionStarted,
  applyPlannedActionConfirmed,
  applyScaleAnswer,
  applySensationAnswer,
  applyTargetSelection,
  applyTriggerSelection,
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
  assert.equal(outcome.stage, "presence_check");
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
  assert.equal(resolved.stage, "presence_check");
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

// --- applyActionImageryCompleted / applyActionPreparationCompleted: the
// "act" stage's Imagery/Preparation sub-phases each mark their own flag
// done and nothing else -- neither ever advances the ArcStage itself
// (that stays "act" until the real Action Timer completes).

test("29. applyActionImageryCompleted marks Imagery done and touches nothing else", () => {
  const before = createEmptyLiveState();
  const after = applyActionImageryCompleted(before);
  assert.equal(after.actionImageryCompleted, true);
  assert.equal(after.actionPreparationCompleted, false, "Preparation is untouched");
  assert.equal(after.currentArcStage, before.currentArcStage, "the ArcStage itself is never advanced by this call");
});

test("30. applyActionPreparationCompleted marks Preparation done and touches nothing else", () => {
  const before = { ...createEmptyLiveState(), actionImageryCompleted: true };
  const after = applyActionPreparationCompleted(before);
  assert.equal(after.actionPreparationCompleted, true);
  assert.equal(after.actionImageryCompleted, true, "Imagery's own flag stays as it was");
  assert.equal(after.currentArcStage, before.currentArcStage);
});

test("31. a fresh session starts with both act-phase flags false -- Imagery/Preparation are never pre-completed", () => {
  const state = createEmptyLiveState();
  assert.equal(state.actionImageryCompleted, false);
  assert.equal(state.actionPreparationCompleted, false);
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
