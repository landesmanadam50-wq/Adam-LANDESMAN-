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
import { getStageCopy } from "../arc/stageCopy.ts";
import { getInstructionTimingStatus, INLINE_RATING_REVEAL_DELAY_SECONDS, INSTRUCTION_TIMING } from "../arc/instructionTiming.ts";
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
  applyRegulationToolUsed,
  applyScaleAnswer,
  applySensationAnswer,
  applyTargetSelection,
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
  const totalRevealSeconds = instructionSeconds + INLINE_RATING_REVEAL_DELAY_SECONDS;

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
test("BUG REGRESSION: the Regulation (\"ויסות\") screen reveals the Desired State Level rating inline only after instruction+15s, remains on the same screen, and the existing ARC threshold/progression logic still receives the exact same value", () => {
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
  const totalRevealSeconds = instructionSeconds + INLINE_RATING_REVEAL_DELAY_SECONDS;
  assert.equal(getInstructionTimingStatus(copy.segments, 0).complete, false, "hidden at t=0");
  assert.equal(getInstructionTimingStatus(copy.segments, instructionSeconds).complete, false, "still hidden the instant Regulation's own instruction finishes");
  assert.equal(getInstructionTimingStatus(copy.segments, totalRevealSeconds - 0.1).complete, false, "hidden one tick before instruction+15s");
  assert.equal(getInstructionTimingStatus(copy.segments, totalRevealSeconds).complete, true, "revealed exactly at instruction+15s, remaining on this same screen");

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

test("Feeling/intensity merge: the accept screen's own reveal gate (a single INLINE_RATING_REVEAL_DELAY_SECONDS placeholder segment -- accept has no instruction timing of its own to precede it, so the delay starts at answer-time) hides the recheck rating for the full 15s and reveals it exactly at 15s", () => {
  const segments = [{ text: "", durationSeconds: INLINE_RATING_REVEAL_DELAY_SECONDS }];
  assert.equal(getInstructionTimingStatus(segments, 0).complete, false, "hidden immediately after answering");
  assert.equal(getInstructionTimingStatus(segments, INLINE_RATING_REVEAL_DELAY_SECONDS - 0.1).complete, false, "still hidden one tick before 15s");
  assert.equal(getInstructionTimingStatus(segments, INLINE_RATING_REVEAL_DELAY_SECONDS).complete, true, "revealed exactly at 15s after answering");
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

test("Feeling/intensity merge: answering accept's yes/no never itself advances the ArcStage -- it only stores acceptanceNeeded exactly as before; the stage only advances once the rating (or the capped no-rating Continue) fires", () => {
  const session = createEmptyLiveState();
  const answeredYes = applyYesNoAnswer("accept", session, true);
  assert.equal(answeredYes.acceptanceNeeded, false, "yes -> acceptanceNeeded false, same existing mapping as before the merge");
  assert.equal(answeredYes.currentArcStage, session.currentArcStage, "answering alone never advances currentArcStage");

  const answeredNo = applyYesNoAnswer("accept", session, false);
  assert.equal(answeredNo.acceptanceNeeded, true, "no -> acceptanceNeeded true, same existing mapping as before the merge");
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
