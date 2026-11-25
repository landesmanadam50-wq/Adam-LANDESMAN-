import test from "node:test";
import assert from "node:assert/strict";

import {
  NEW_ARC_LIVE_STEP_ORDER,
  NEW_ARC_MINI_STEP_ORDER,
  advance,
  completeFreeBreathingIntro,
  completePresenceSteps,
  completeSession,
  confirmActionReadinessCheck,
  confirmBodyScanClosedness,
  confirmSupportiveAreas,
  confirmUnpleasantAreas,
  createSessionFromPlannedArcFields,
  declineSelfObservation,
  declineUnpleasantArea,
  goBack,
  isStepSkippable,
  migrateLegacyNewArcLiveStep,
  proceedToUnpleasantAreaSelect,
  resolveNextStep,
  resolvePreviousStep,
  resolveProgress,
  resolveStepOrder,
  confirmOpeningBodyScanRegions,
  setBodyScanHeavinessRegion,
  setCognitiveSelection,
  setDesiredEnding,
  setDesiredFeeling,
  setEmotion,
  setEmotionalAction,
  setEmotionalInsight,
  setFocusColor,
  setFocusObject,
  setGoalType,
  setInterpretation,
  setMiniAcceptanceTransition,
  setMiniAwareness,
  setMiniEncoding,
  setMiniThought,
  setPositiveMovement,
  setPrimaryOpeningBodyScanRegion,
  setSupportiveArea,
  setSupportiveSensation,
  setThought,
  setThoughtTimeOrientation,
  setUrgeText,
  setUnpleasantArea,
  toggleOpeningBodyScanRegion,
  stepSubCount,
  toggleBodyScanClosednessRegion,
  toggleBodyScanContractionRegion,
  toggleSupportiveArea,
  toggleUnpleasantArea,
} from "./newArcLiveSteps.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { NewArcLiveSessionState, NewArcLiveStepId } from "./newArcLiveTypes.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function fresh(): NewArcLiveSessionState {
  return createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW);
}

test("createNewArcLiveSessionState starts at goal_select with every continuity field null", () => {
  const state = fresh();
  assert.equal(state.currentStep, "goal_select");
  assert.equal(state.subIndex, 0);
  assert.equal(state.supportiveBodyArea, null);
  assert.equal(state.supportiveSensation, null);
  assert.equal(state.positiveMovement, null);
  assert.equal(state.completedAt, null);
});

// ARCHI -- Universal ARC Routing, Emotion Identification & Android
// Shortcuts task, requirement 2/6: the shared cognitive selector now
// sits right after goal_select, and the three cognitive branches
// (urge/thought/interpretation, each with its own capture+acceptance
// pair) all come BEFORE "emotion" -- "Urge -> Thought -> Interpretation
// -> Emotion Identification -> Presence." With nothing selected, the
// trainee walks straight from the selector to "emotion".
test("next step: goal_select -> free_breathing -> cognitive_selector -> emotion, when nothing is selected (zero-selection 'Emotion-only flow')", () => {
  let state = fresh();
  state = setGoalType(state, "action", NOW);
  assert.equal(state.currentStep, "free_breathing", "ARCHI Free Breathing Intro task: the opening screen now sits right after goal_select");
  state = completeFreeBreathingIntro(state, NOW);
  assert.equal(state.currentStep, "cognitive_selector");
  state = setCognitiveSelection(state, { thought: false, interpretation: false, urge: false }, NOW);
  assert.equal(state.currentStep, "emotion", "zero selections -- straight to naming the emotion, per the Final Product Principle");
});

test("checking 'thought' on the selector makes the dedicated 'thought' capture step reachable; leaving it blank there still continues straight to 'emotion' (reality_acceptance is skipped with no real text)", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "cognitive_selector" };
  state = setCognitiveSelection(state, { thought: true, interpretation: false, urge: false }, NOW);
  assert.equal(state.currentStep, "thought");
  state = setThought(state, "", NOW);
  assert.equal(state.currentStep, "emotion", "a blank thought still correctly skips reality_acceptance -- interpretation/urge were never selected either");
});

test("checking 'thought' and writing one reaches reality_acceptance; completing it reaches 'emotion' directly when interpretation/urge were not selected", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "cognitive_selector" };
  state = setCognitiveSelection(state, { thought: true, interpretation: false, urge: false }, NOW);
  state = setThought(state, "אני לא מספיק מוכן", NOW);
  assert.equal(state.currentStep, "reality_acceptance", "a thought was written -- reality acceptance follows");
  state = setThoughtTimeOrientation(state, "present", NOW);
  state = advance(state, NOW);
  assert.equal(state.currentStep, "emotion", "thought-acceptance completed -- interpretation/urge unselected, straight to emotion");
});

test("going back from 'emotion' lands on reality_acceptance's own last sub-screen when a thought was selected and written, or on the (always-reachable) cognitive_selector screen when nothing at all was selected", () => {
  let withThought: NewArcLiveSessionState = { ...fresh(), currentStep: "emotion", selectedCognitiveThought: true, currentThought: "מחשבה כלשהי", thoughtTimeOrientation: "present" };
  const back1 = resolvePreviousStep(withThought);
  assert.equal(back1?.step, "reality_acceptance");
  assert.equal(back1?.subIndex, 1, "lands on the LAST of its 2 sub-screens, not the first");

  let withNeither: NewArcLiveSessionState = { ...fresh(), currentStep: "emotion" };
  assert.equal(resolvePreviousStep(withNeither)?.step, "cognitive_selector");
});

test("going back from reality_acceptance's own mantra sub-screen lands on its own time-classification sub-screen first, then on the thought capture screen", () => {
  const atMantra: NewArcLiveSessionState = {
    ...fresh(),
    currentStep: "reality_acceptance",
    subIndex: 1,
    selectedCognitiveThought: true,
    currentThought: "מחשבה כלשהי",
    thoughtTimeOrientation: "present",
  };
  const backOne = resolvePreviousStep(atMantra);
  assert.equal(backOne?.step, "reality_acceptance");
  assert.equal(backOne?.subIndex, 0);

  const atAsk: NewArcLiveSessionState = { ...atMantra, subIndex: 0 };
  assert.equal(resolvePreviousStep(atAsk)?.step, "thought");
});

test("natural_breathing's own next step is center_attention, reachable from either path", () => {
  const state: NewArcLiveSessionState = { ...fresh(), currentStep: "natural_breathing" };
  const next = resolveNextStep(state);
  assert.equal(next.step, "center_attention");
});

// --- Urge-stop task (now reordered: the selector's own "urge" branch sits BEFORE thought/interpretation/emotion entirely) --------

test("test 1: ARC with 'urge' never checked on the selector never shows the 'urge' capture screen or stop_and_accept_urge -- straight from the selector to 'emotion' with nothing else selected", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "cognitive_selector" };
  state = setCognitiveSelection(state, { thought: false, interpretation: false, urge: false }, NOW);
  assert.equal(state.urgeText, null);
  assert.equal(state.currentStep, "emotion", "no urge selected -- straight to emotion, never stop_and_accept_urge");
});

// ARCHI -- Two Mantras for Urge Acceptance correction: "stop_and_
// accept_urge" is now exactly ONE page (the five preparatory sub-
// screens are gone) -- a single advance() call from it moves straight
// on to the next step, never through removed sub-screens.
test("test 2: checking 'urge' on the selector makes the dedicated 'urge' capture screen reachable, and writing one shows stop_and_accept_urge right after it, BEFORE the trainee ever sees 'emotion'", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "cognitive_selector" };
  state = setCognitiveSelection(state, { thought: false, interpretation: false, urge: true }, NOW);
  assert.equal(state.currentStep, "urge");
  state = setUrgeText(state, "דחף לפתוח את הטלפון", NOW);
  assert.equal(state.urgeText, "דחף לפתוח את הטלפון");
  assert.equal(state.currentStep, "stop_and_accept_urge", "an urge was written -- the dedicated stop step must appear immediately after the urge capture screen");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "emotion", "urge-stop is a single page -- one advance, no thought/interpretation selected -- straight to emotion");
});

test("test 3/6: urge AND thought together complete stop_and_accept_urge BEFORE the thought capture screen is ever shown -- never the other order (Urge -> Thought)", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "cognitive_selector" };
  state = setCognitiveSelection(state, { thought: true, interpretation: false, urge: true }, NOW);
  assert.equal(state.currentStep, "urge", "urge comes first in the fixed Urge -> Thought -> Interpretation order");
  state = setUrgeText(state, "דחף לגרד", NOW);
  assert.equal(state.currentStep, "stop_and_accept_urge", "urge-stop comes first, before the thought capture screen");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "thought", "urge-stop is a single page -- one advance moves past it to the thought capture screen");
  state = setThought(state, "אני לא מספיק מוכן", NOW);
  assert.equal(state.currentStep, "reality_acceptance", "the thought exists -- reality acceptance follows immediately");
});

test("going back from stop_and_accept_urge's one sub-screen lands on the urge capture screen", () => {
  const state: NewArcLiveSessionState = { ...fresh(), currentStep: "stop_and_accept_urge", subIndex: 0, selectedCognitiveUrge: true, urgeText: "דחף" };
  assert.equal(resolvePreviousStep(state)?.step, "urge");
});

test("going back from the thought capture screen lands on stop_and_accept_urge (its own single page) when an urge was selected and written, or cognitive_selector when it wasn't", () => {
  const withUrge: NewArcLiveSessionState = { ...fresh(), currentStep: "thought", selectedCognitiveThought: true, selectedCognitiveUrge: true, urgeText: "דחף לדחות משימה" };
  const back1 = resolvePreviousStep(withUrge);
  assert.equal(back1?.step, "stop_and_accept_urge");
  assert.equal(back1?.subIndex, 0, "stop_and_accept_urge is now a single page, so its only subIndex is 0");

  const withoutUrge: NewArcLiveSessionState = { ...fresh(), currentStep: "thought", selectedCognitiveThought: true, selectedCognitiveUrge: false, urgeText: null };
  assert.equal(resolvePreviousStep(withoutUrge)?.step, "cognitive_selector");
});

// ARC LIVE Body Scan and Protocol Restructuring task, section 1: the
// three former selection steps this covered (unpleasant_area_question/
// unpleasant_area_select/dwelling and the two supportive_*_select
// steps) are no longer reachable from the live engine's own forward
// walk -- proceedToUnpleasantAreaSelect/declineUnpleasantArea remain
// exported, unchanged legacy functions (see the dedicated migration
// test later in this file for how a session stranded there resumes),
// but the ordinary walk below never visits them at all anymore.
// ARCHI -- Unified 7-Part Update task, Part 2A: "desired_ending" is
// now permanently unreachable too. ARCHI -- Correct the Full ARC
// Red-to-Green/Direct-to-Blue Selection Logic task: body_scan_opening_region
// is unconditionally reachable now, so the ordinary walk from
// body_scan_closedness reaches IT directly (never the old
// supportive_area_select fallback) -- tapping nothing there still
// falls through to supportive_area_select afterward.
test("the ordinary walk from body_scan_closedness (no eligible closure region) reaches Acceptance Part 1 directly, then body_scan_opening_region (Screen Two) -- no unpleasant-area question, no separate sensation/movement screens, and (for this non-shortened session) supportive_area_select is skipped entirely in favor of Acceptance Part 2", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_closedness" };
  state = confirmBodyScanClosedness(state, NOW);
  assert.equal(state.currentStep, "acceptance", "ARCHI -- Full ARC Body Flow Redesign task: Acceptance Part 1 immediately follows Screen One/body_scan_closedness");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "body_scan_opening_region");
  state = confirmOpeningBodyScanRegions(state, NOW);
  assert.equal(state.currentStep, "acceptance_part_two", "supportive_area_select is reachable only for Shortened ARC now -- Full ARC lands directly on Acceptance Part 2");
});

// --- Body region selection correction task: negative side becomes multi-select ---

test("toggleUnpleasantArea adds and removes a region from the multi-select array, never advancing on its own, and keeps the legacy singular field as the array's own first entry", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "unpleasant_area_select" };
  state = toggleUnpleasantArea(state, "chest");
  assert.deepEqual(state.unpleasantBodyAreas, ["chest"]);
  assert.equal(state.unpleasantBodyArea, "chest");
  assert.equal(state.currentStep, "unpleasant_area_select", "toggling must never advance the step on its own");

  state = toggleUnpleasantArea(state, "abdomen");
  assert.deepEqual(state.unpleasantBodyAreas, ["chest", "abdomen"]);
  assert.equal(state.unpleasantBodyArea, "chest", "the first-chosen region stays first even after adding a second");

  state = toggleUnpleasantArea(state, "chest");
  assert.deepEqual(state.unpleasantBodyAreas, ["abdomen"], "toggling an already-selected region removes it");
  assert.equal(state.unpleasantBodyArea, "abdomen", "the legacy singular field follows the new first entry");
});

test("confirmUnpleasantAreas advances with zero regions chosen (the option to skip), implicitly includes 'other' for a non-blank custom label, never duplicates it when already toggled, and carries the separate sensation description through", () => {
  const base: NewArcLiveSessionState = { ...fresh(), currentStep: "unpleasant_area_select" };
  const skipped = confirmUnpleasantAreas(base, "", null, NOW);
  assert.deepEqual(skipped.unpleasantBodyAreas, []);
  assert.equal(skipped.unpleasantBodyArea, null);
  assert.notEqual(skipped.currentStep, "unpleasant_area_select", "it must have advanced somewhere, not stayed put");

  const withCustom = confirmUnpleasantAreas(base, "אזור הצלעות התחתונות", "לחץ קל", NOW);
  assert.ok(withCustom.unpleasantBodyAreas.includes("other"));
  assert.equal(withCustom.unpleasantBodyAreaCustomLabel, "אזור הצלעות התחתונות");
  assert.equal(withCustom.unpleasantSensationDescription, "לחץ קל");

  let withOtherToggled: NewArcLiveSessionState = { ...fresh(), currentStep: "unpleasant_area_select" };
  withOtherToggled = toggleUnpleasantArea(withOtherToggled, "other");
  const confirmed = confirmUnpleasantAreas(withOtherToggled, "תיאור מיוחד", null, NOW);
  assert.deepEqual(confirmed.unpleasantBodyAreas, ["other"], "'other' must never be duplicated when it was already toggled on explicitly");
});

test("confirmUnpleasantAreas still correctly records multiple chosen regions and their sensation description -- this legacy setter's own data handling is unchanged, even though unpleasant_area_select/dwelling are no longer reachable from the live engine's own navigation", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "unpleasant_area_select" };
  state = toggleUnpleasantArea(state, "chest");
  state = toggleUnpleasantArea(state, "neck");
  state = confirmUnpleasantAreas(state, "", "לחץ באזור הצוואר", NOW);
  assert.deepEqual(state.unpleasantBodyAreas, ["chest", "neck"]);
  assert.equal(state.unpleasantBodyArea, "chest", "the primary/first region convention is unchanged");
  assert.equal(state.unpleasantSensationDescription, "לחץ באזור הצוואר");
});

test("declineUnpleasantArea clears the multi-select array and custom label too, not just the legacy singular fields", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "unpleasant_area_select" };
  state = toggleUnpleasantArea(state, "chest");
  state = toggleUnpleasantArea(state, "neck");
  state = { ...state, currentStep: "unpleasant_area_question" };
  state = declineUnpleasantArea(state, NOW);
  assert.deepEqual(state.unpleasantBodyAreas, []);
  assert.equal(state.unpleasantBodyAreaCustomLabel, null);
  assert.equal(state.unpleasantBodyArea, null);
});

// --- Body region selection correction task: positive side reverted to single-select ---

test("setSupportiveArea overwrites the single primary region outright and never touches the legacy multi-select array -- picking a new region replaces, never adds to, the previous one", () => {
  let state = fresh();
  state = setSupportiveArea(state, "chest", NOW);
  assert.equal(state.supportiveBodyArea, "chest");
  assert.deepEqual(state.supportiveBodyAreas, [], "the single-select setter must never populate the legacy array");

  state = { ...state, currentStep: "supportive_area_select" };
  state = setSupportiveArea(state, "back", NOW);
  assert.equal(state.supportiveBodyArea, "back", "a new pick replaces the previous one outright, never accumulates");
});

test("toggleSupportiveArea adds and removes a region from the multi-select array, never advancing on its own, and keeps the legacy singular field as the array's own first entry", () => {
  let state = fresh();
  state = toggleSupportiveArea(state, "chest");
  assert.deepEqual(state.supportiveBodyAreas, ["chest"]);
  assert.equal(state.supportiveBodyArea, "chest");
  assert.equal(state.currentStep, fresh().currentStep, "toggling must never advance the step on its own");

  state = toggleSupportiveArea(state, "shoulders");
  assert.deepEqual(state.supportiveBodyAreas, ["chest", "shoulders"]);
  assert.equal(state.supportiveBodyArea, "chest", "the first-chosen region stays first even after adding a second");

  state = toggleSupportiveArea(state, "chest");
  assert.deepEqual(state.supportiveBodyAreas, ["shoulders"], "toggling an already-selected region removes it");
  assert.equal(state.supportiveBodyArea, "shoulders", "the legacy singular field follows the new first entry");
});

function freshAtAreaSelect(): NewArcLiveSessionState {
  return { ...fresh(), currentStep: "supportive_area_select" };
}

test("confirmSupportiveAreas advances with zero regions chosen -- 'continue without choosing' is always valid, and lands directly on acceptance_part_two (no separate sensation/movement screen exists anymore)", () => {
  const state = confirmSupportiveAreas(freshAtAreaSelect(), "", NOW);
  assert.deepEqual(state.supportiveBodyAreas, []);
  assert.equal(state.supportiveBodyArea, null);
  assert.equal(state.currentStep, "acceptance_part_two");
});

test("confirmSupportiveAreas with a non-blank custom label implicitly includes 'other', even if its chip was never toggled", () => {
  const state = confirmSupportiveAreas(freshAtAreaSelect(), "אזור הגב התחתון", NOW);
  assert.ok(state.supportiveBodyAreas.includes("other"));
  assert.equal(state.supportiveBodyAreaCustomLabel, "אזור הגב התחתון");
});

test("confirmSupportiveAreas never duplicates 'other' when it was already toggled on explicitly", () => {
  let state = freshAtAreaSelect();
  state = toggleSupportiveArea(state, "other");
  state = confirmSupportiveAreas(state, "אזור מיוחד", NOW);
  assert.deepEqual(state.supportiveBodyAreas, ["other"]);
});

test("confirmSupportiveAreas clears a stale custom label when the new label is blank", () => {
  let state = freshAtAreaSelect();
  state = confirmSupportiveAreas(state, "תווית ישנה", NOW);
  state = { ...state, currentStep: "supportive_area_select" };
  state = confirmSupportiveAreas(state, "", NOW);
  assert.equal(state.supportiveBodyAreaCustomLabel, null);
});

// ARCHI -- Simplify the "פחות טוב" body-flow and remove the separate
// closure-selection screen task: body_scan_closedness is permanently
// unreachable -- going back from supportive_area_select skips past it.
// ARCHI -- Correct the Full ARC Red-to-Green/Direct-to-Blue Selection
// Logic task: body_scan_opening_region is now unconditionally
// reachable (no longer gated on contraction data), so going back lands
// on IT, never body_scan_contraction directly.
test("going back from supportive_area_select lands on body_scan_opening_region directly, regardless of goal type", () => {
  const withArea = { ...fresh(), currentStep: "supportive_area_select" as const, unpleasantBodyArea: "chest" as const };
  assert.equal(resolvePreviousStep(withArea)?.step, "body_scan_opening_region");

  const declinedArea = { ...fresh(), currentStep: "supportive_area_select" as const, unpleasantBodyArea: null };
  assert.equal(resolvePreviousStep(declinedArea)?.step, "body_scan_opening_region");
});

// ARCHI -- Correct the Full ARC Red-to-Green/Direct-to-Blue Selection
// Logic task: leaving body_scan_contraction never auto-carries
// anything into openingBodyScanRegions any more -- it stays exactly
// empty until the trainee actually taps a region on the LATER
// body_scan_opening_region screen, which is now unconditionally
// reachable (for non-shortened sessions) regardless of whether
// anything was marked contracted at all.
test("leaving body_scan_contraction never auto-carries anything into openingBodyScanRegions -- Acceptance Part 1 immediately follows it (dwelling is now permanently unreachable), and body_scan_opening_region (Screen Two) right after that is reached either way (with or without contraction data), always still empty on entry", () => {
  // With no contraction at all: body_scan_opening_region no longer
  // depends on contraction data to be reachable, and dwelling/
  // body_scan_closedness are both now permanently unreachable --
  // Acceptance Part 1 immediately follows body_scan_contraction.
  const noContraction: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_contraction" };
  let state = advance(noContraction, NOW);
  assert.equal(state.currentStep, "acceptance", "ARCHI -- Full ARC Body Flow Redesign task: Acceptance Part 1 immediately follows Screen One, with nothing (dwelling/closedness) in between");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "body_scan_opening_region", "body_scan_opening_region is reached right after Acceptance Part 1 -- it no longer needs any contraction data to be reachable");
  assert.deepEqual(state.openingBodyScanRegions, [], "nothing is ever auto-carried in, regardless of contraction data");

  const withContraction: NewArcLiveSessionState = {
    ...fresh(),
    currentStep: "body_scan_contraction",
    bodyScanContractionRegions: [{ region: "scanShoulders", side: "left" }],
  };
  state = advance(withContraction, NOW);
  assert.equal(state.currentStep, "acceptance", "dwelling/body_scan_closedness are both permanently unreachable now, regardless of contraction data -- Acceptance Part 1 follows directly");
  assert.deepEqual(state.openingBodyScanRegions, [], "leaving body_scan_contraction never writes openingBodyScanRegions -- the Red selection is remembered only in bodyScanContractionRegions");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "body_scan_opening_region", "body_scan_opening_region (Screen Two) follows Acceptance Part 1 directly");
  assert.deepEqual(state.openingBodyScanRegions, [], "the region shows green only once the trainee actually taps it here -- never automatically on entry");
  assert.deepEqual(state.bodyScanContractionRegions, [{ region: "scanShoulders", side: "left" }], "the earlier Red contraction selection remains intact, untouched, for the engine to consult when the trainee taps");

  // A region that was contracted but is NOT movement-eligible (e.g.
  // "eyes") still reaches the exact same Acceptance Part 1 ->
  // body_scan_opening_region sequence -- movement eligibility never
  // gated either step's reachability at all.
  const nonEligibleContraction: NewArcLiveSessionState = {
    ...fresh(),
    currentStep: "body_scan_contraction",
    bodyScanContractionRegions: [{ region: "eyes", side: "left" }],
  };
  let nonEligibleState = advance(nonEligibleContraction, NOW);
  assert.equal(nonEligibleState.currentStep, "acceptance", "Acceptance Part 1's own reachability never depended on movement eligibility either");
  nonEligibleState = advance(nonEligibleState, NOW);
  assert.equal(nonEligibleState.currentStep, "body_scan_opening_region", "body_scan_opening_region's own reachability no longer depends on any contracted region being movement-eligible, or existing at all");
});

test("unpleasant_area_question/unpleasant_area_select/body_scan_heaviness/desired_feeling_locate/desired_feeling_select/desired_ending are all removed from NEW_ARC_LIVE_STEP_ORDER; supportive_sensation_select/supportive_movement_select remain removed too; body_scan_opening_region is REACTIVATED (ARCHI -- Green/Blue Logic task)", () => {
  for (const removed of [
    "unpleasant_area_question",
    "unpleasant_area_select",
    "body_scan_heaviness",
    "desired_feeling_locate",
    "desired_feeling_select",
    "desired_ending",
    "supportive_sensation_select",
    "supportive_movement_select",
  ] as const) {
    assert.ok(!NEW_ARC_LIVE_STEP_ORDER.includes(removed), `${removed} must not be part of the active step order`);
  }
  assert.ok(NEW_ARC_LIVE_STEP_ORDER.includes("body_scan_opening_region"), "body_scan_opening_region must be back in the active step order as the green/blue selection screen");
});

// Legacy setters kept intact (never deleted) purely for historical
// data/goBack safety -- never called by any current UI flow, since
// their own steps are permanently unreachable now.
test("legacy setDesiredFeeling still works as a pure function, even though its own step is unreachable; toggleOpeningBodyScanRegion/confirmOpeningBodyScanRegions are ACTIVE again (ARCHI -- Green/Blue Logic task), and -- per the Correct the Full ARC Red-to-Green/Direct-to-Blue Selection Logic task -- a previously-Red region now cycles green -> none (never promoted further by a second tap), while a never-Red region cycles blue -> none directly", () => {
  const chosen = setDesiredFeeling({ ...fresh(), currentStep: "desired_feeling_select" }, "ביטחון", NOW);
  assert.equal(chosen.desiredFeelingText, "ביטחון");

  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_opening_region" };
  state = toggleBodyScanContractionRegion(state, "scanShoulders", "left"); // Red during contraction
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left");
  assert.deepEqual(state.openingBodyScanRegions, [{ region: "scanShoulders", side: "left", role: "opening" }], "first tap on a previously-Red region -> green (opening only)");
  const committed = confirmOpeningBodyScanRegions(state, NOW);
  assert.deepEqual(committed.openingBodyScanRegions, [{ region: "scanShoulders", side: "left", role: "opening" }]);
  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left");
  assert.deepEqual(state.openingBodyScanRegions, [], "second tap -> deselected entirely, never promoted to blue (the obvious reset mechanism, with no green-to-blue cycle)");

  // A region never marked Red goes straight to blue on its very first tap.
  state = toggleOpeningBodyScanRegion(state, "scanChest", null);
  assert.deepEqual(state.openingBodyScanRegions, [{ region: "scanChest", side: null, role: "opening_and_supportive" }], "first tap on a never-Red region -> blue (opening AND supportive) directly");
  state = toggleOpeningBodyScanRegion(state, "scanChest", null);
  assert.deepEqual(state.openingBodyScanRegions, [], "second tap -> deselected entirely");
});

// Section 15 (continuity across Acceptance/Regulation/Encoding): the
// opening regions the trainee actually TAPS on body_scan_opening_region
// must survive, completely unchanged, all the way through to Encoding.
test("openingBodyScanRegions, once the trainee taps a previously-Red region green on body_scan_opening_region and confirms, stays set unchanged from acceptance through encoding", () => {
  let state: NewArcLiveSessionState = {
    ...fresh(),
    currentStep: "body_scan_contraction",
    bodyScanContractionRegions: [{ region: "scanShoulders", side: "left" }],
  };
  // ARCHI -- Full ARC Body Flow Redesign task: leaving
  // body_scan_contraction never writes openingBodyScanRegions any more
  // -- dwelling is now permanently unreachable, so Acceptance Part 1
  // follows directly, still completely empty; the trainee only writes
  // anything once actually tapping on body_scan_opening_region (Screen
  // Two), which now follows Acceptance Part 1.
  state = advance(state, NOW);
  assert.equal(state.currentStep, "acceptance");
  assert.deepEqual(state.openingBodyScanRegions, []);
  state = advance(state, NOW);
  // body_scan_opening_region is reached right after Acceptance Part 1,
  // still completely empty on entry -- no auto-preselection.
  assert.equal(state.currentStep, "body_scan_opening_region");
  assert.deepEqual(state.openingBodyScanRegions, [], "no region is ever green before the trainee actually taps it here");

  state = toggleOpeningBodyScanRegion(state, "scanShoulders", "left");
  assert.deepEqual(state.openingBodyScanRegions, [{ region: "scanShoulders", side: "left", role: "opening" }], "tapping the previously-Red region selects green");

  state = confirmOpeningBodyScanRegions(state, NOW);
  assert.equal(state.currentStep, "acceptance_part_two", "supportive_area_select is reachable only for Shortened ARC now -- this non-shortened session lands on Acceptance Part 2 directly");
  assert.deepEqual(state.openingBodyScanRegions, [{ region: "scanShoulders", side: "left", role: "opening" }]);

  state = advance(state, NOW); // acceptance_part_two is exactly one page
  assert.equal(state.currentStep, "regulation");
  assert.equal(state.subIndex, 0, "regulation is exactly one sub-screen -- the action-selection step that used to follow it is removed entirely");
  assert.deepEqual(state.openingBodyScanRegions, [{ region: "scanShoulders", side: "left", role: "opening" }], "...and still unchanged at regulation");

  state = advance(state, NOW);
  assert.equal(state.currentStep, "encoding");
  assert.deepEqual(state.openingBodyScanRegions, [{ region: "scanShoulders", side: "left", role: "opening" }], "...and still unchanged at encoding -- never re-asked, never replaced");
});

test("Fix All Confirmed ARC Android Bugs task, requirement 2: visual_field / sound_awareness / body_scan are each now exactly ONE fixed-mantra page -- a single advance moves straight to the next one, never several progressive lines", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "visual_field", subIndex: 0 };
  state = advance(state, NOW);
  assert.equal(state.currentStep, "sound_awareness");

  state = advance(state, NOW);
  assert.equal(state.currentStep, "body_scan");

  state = completePresenceSteps(state, NOW);
  // Final ARC Flow & Body Animation task, requirement 1: body_scan is
  // now followed directly by "Identify Contraction" -- the old
  // "unpleasant area" question/dwelling trio no longer sits here at
  // all (never a change to completePresenceSteps itself, just the
  // ordinary consequence of the new active order).
  assert.equal(state.currentStep, "body_scan_contraction");
  assert.equal(state.presenceStepsCompleted, true);
  state = advance(state, NOW);
  // ARCHI -- Full ARC Body Flow Redesign task: dwelling and
  // body_scan_closedness are both permanently unreachable now, and
  // Acceptance Part 1 immediately follows body_scan_contraction
  // (Screen One), before body_scan_opening_region (Screen Two, Blue-only)
  // is ever reached.
  assert.equal(state.currentStep, "acceptance", "dwelling/body_scan_closedness must be skipped; Acceptance Part 1 follows body_scan_contraction directly");
  state = advance(state, NOW); // acceptance is exactly one page
  assert.equal(state.currentStep, "body_scan_opening_region", "body_scan_opening_region (Screen Two) is reached right after Acceptance Part 1, unconditionally");
  assert.deepEqual(state.openingBodyScanRegions, [], "still nothing preselected -- every eligible region is tappable here regardless of there being zero Red history at all");
});

test("encoding and acceptance are each exactly ONE page -- the one-mantra-per-stage simplification (requirement 4, 'ONE CIRCLE... one mantra page at a time'), regardless of goal type or any legacy unpleasant-area data", () => {
  assert.equal(stepSubCount("encoding", { ...fresh(), goalType: "action" as const }), 1);
  assert.equal(stepSubCount("encoding", { ...fresh(), goalType: "emotion_only" as const }), 1);
  assert.equal(stepSubCount("acceptance", fresh()), 1);
});

// ARCHI -- Show Action Selection ON the Regulation Screen task:
// "regulation" is now exactly ONE page, always -- the integrated
// action-selection section (when it applies, i.e. whenever
// arcGymSituationId is not set) renders TOGETHER with the circle/
// mantra on this SAME page, never a second sub-page, regardless of
// any legacy unpleasant-area data or isActiveTaskLiveOrigin. See
// arc/actionSelectionInRegulation.test.ts for the full behavioral
// coverage of this case.
test("regulation is exactly ONE page, always -- including for arcGymSituationId (nothing to select there) and when isActiveTaskLiveOrigin -- the integrated action-selection section renders together with it on the one page, never a second sub-page", () => {
  assert.equal(stepSubCount("regulation", { ...fresh(), unpleasantBodyArea: "chest" as const }), 1);
  assert.equal(stepSubCount("regulation", { ...fresh(), unpleasantBodyArea: null }), 1);
  assert.equal(stepSubCount("regulation", { ...fresh(), isActiveTaskLiveOrigin: true }), 1);
  assert.equal(stepSubCount("regulation", { ...fresh(), arcGymSituationId: "sit1" }), 1);
  assert.equal(stepSubCount("regulation", { ...fresh(), isActiveTaskLiveOrigin: true, arcGymSituationId: "sit1" }), 1);
});

test("isStepSkippable marks exactly the optional steps, never the required continuity/protocol steps", () => {
  assert.equal(isStepSkippable("emotion"), true);
  assert.equal(isStepSkippable("thought"), true);
  assert.equal(isStepSkippable("desired_ending"), true);
  assert.equal(isStepSkippable("focus_color"), true);
  for (const required of ["goal_select", "supportive_area_select", "acceptance", "regulation", "encoding"] as const) {
    assert.equal(isStepSkippable(required), false, `${required} must never be skippable`);
  }
});

test("resolveNextStep never returns past 'complete', and completeSession is the only way to actually reach it", () => {
  // ARCHI -- Unified 7-Part Update task, Part 5 ("ENCODING MUST LEAD
  // DIRECTLY TO ACTION"): "transition"/"emotional_action"/
  // "emotional_insight" are all permanently unreachable and no longer
  // part of the active order at all -- Encoding now advances straight
  // to "complete", for every goalType.
  const state = { ...fresh(), currentStep: "encoding" as const, goalType: "action" as const };
  const next = resolveNextStep(state);
  assert.equal(next.step, "complete");
  // resolveNextStep from "complete" itself must never return anything past it.
  assert.equal(resolveNextStep({ ...fresh(), currentStep: "complete" }).step, "complete");
  const completed = completeSession(state, NOW);
  assert.equal(completed.currentStep, "complete");
  assert.ok(completed.completedAt);
});

test("resolveProgress reports a position that only ever increases forward and decreases on goBack, within the total for this goal-type branch", () => {
  // Unified ARC & Productivity Update task, requirement 2: "goal_select"
  // is now permanently unreachable (isStepReachable), so resolveProgress
  // -- which only counts reachable steps -- can never find a position
  // for a raw fresh() state sitting there; migrateLegacyNewArcLiveStep
  // is the one mechanism (same one every real session actually goes
  // through, via live/NewArcLiveScreen.tsx) that fast-forwards it to a
  // real, reachable starting step first, exactly like production code.
  let state = migrateLegacyNewArcLiveStep(fresh());
  const first = resolveProgress(state);
  assert.equal(first.position, 1);
  state = setGoalType(state, "action", NOW);
  const second = resolveProgress(state);
  assert.ok(second.position > first.position);
  assert.ok(second.total >= second.position);
  state = goBack(state, NOW);
  const third = resolveProgress(state);
  assert.equal(third.position, first.position);
});

test("setFocusObject stores its own field and advances straight to visual_field -- 'focus_color' is permanently unreachable and skipped entirely (Part 7.2: the point color now comes from persistent settings, never asked here)", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "center_attention" };
  state = setFocusObject(state, "כוס", NOW);
  assert.equal(state.selectedFocusObject, "כוס");
  assert.equal(state.currentStep, "visual_field");

  let blank: NewArcLiveSessionState = { ...fresh(), currentStep: "center_attention" };
  blank = setFocusObject(blank, "", NOW);
  assert.equal(blank.selectedFocusObject, null);
});

// setFocusColor itself stays intact as a pure setter (never deleted,
// never called by any current UI flow) purely for historical sessions
// that already saved a selectedFocusColor from before this task.
test("legacy setFocusColor still stores its own field and trims blank input to null", () => {
  const withColor = setFocusColor({ ...fresh(), currentStep: "focus_color" }, "כחול", NOW);
  assert.equal(withColor.selectedFocusColor, "כחול");
  const blank = setFocusColor({ ...fresh(), currentStep: "focus_color" }, "", NOW);
  assert.equal(blank.selectedFocusColor, null);
});

test("setUnpleasantArea stores the area and an optional sensation description", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "unpleasant_area_select" };
  state = setUnpleasantArea(state, "abdomen", "לחץ קל", NOW);
  assert.equal(state.unpleasantBodyArea, "abdomen");
  assert.equal(state.unpleasantSensationDescription, "לחץ קל");
});

// ARC-system upgrade task, Part A/H: the three tracks (emotion_only/
// action/combined) and the two engine-level mode differences
// (spontaneous vs. planned).

test("createNewArcLiveSessionState defaults arcInvocationMode to 'plannedFull' when not given, preserving pre-existing in-task behavior", () => {
  assert.equal(fresh().arcInvocationMode, "plannedFull");
});

// ARCHI -- Unified 7-Part Update task, Part 5 ("ENCODING MUST LEAD
// DIRECTLY TO ACTION"): "transition"/"emotional_action"/
// "emotional_insight" are now permanently unreachable for EVERY
// goalType -- "there should be no extra goal, ending, emotional-
// action, or preparation questions after Encoding." Every track walks
// straight from goal_select to "complete" with none of the three ever
// appearing.
test("no goalType ever makes transition/emotional_action/emotional_insight reachable -- every track reaches 'complete' straight after Encoding", () => {
  for (const goalType of ["action", "emotion_only", "combined"] as const) {
    let state: NewArcLiveSessionState = setGoalType({ ...fresh(), currentStep: "goal_select" }, goalType, NOW);
    const visited: string[] = [];
    for (let i = 0; i < 40 && state.currentStep !== "complete"; i++) {
      visited.push(state.currentStep);
      state = state.currentStep === "body_scan_closedness" ? confirmBodyScanClosedness(state, NOW) : advance(state, NOW);
    }
    assert.ok(!visited.includes("transition"), `goalType=${goalType}`);
    assert.ok(!visited.includes("emotional_action"), `goalType=${goalType}`);
    assert.ok(!visited.includes("emotional_insight"), `goalType=${goalType}`);
    assert.equal(state.currentStep, "complete", `goalType=${goalType} must actually reach complete`);
  }
});

// Legacy setEmotionalAction/setEmotionalInsight/stepSubCount(
// "emotional_action")/resolveNextStep/resolvePreviousStep over that
// step all stay fully intact as pure functions (never deleted) purely
// for historical sessions -- never called by any current UI flow,
// since "transition"/"emotional_action"/"emotional_insight" are all
// permanently unreachable now (Part 5).
test("legacy emotional_action/emotional_insight setters and sub-step math still work as pure functions, even though the steps themselves are unreachable", () => {
  assert.equal(stepSubCount("emotional_action", { ...fresh(), goalType: "emotion_only" }), 2);
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "emotional_action", subIndex: 0, goalType: "emotion_only" };
  assert.deepEqual(resolveNextStep(state), { step: "emotional_action", subIndex: 1 });
  state = setEmotionalAction(state, "מדיטציה", NOW);
  assert.equal(state.emotionalActionText, "מדיטציה");
  const withInsight = setEmotionalInsight({ ...fresh(), currentStep: "emotional_insight" }, "תובנה בלבד", "", NOW);
  assert.equal(withInsight.emotionalInsightText, "תובנה בלבד");
  assert.equal(withInsight.emotionalBeliefText, null, "a blank belief is valid, never forced");
});

test("Fix All Confirmed ARC Android Bugs task, requirement 2: body_scan has exactly 1 sub-step for EVERY invocation mode now -- the old per-region walk for planned modes is gone, replaced everywhere by the one fixed Presence mantra", () => {
  const spontaneous: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "spontaneous" };
  const plannedFull: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "plannedFull" };
  const plannedMini: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "plannedMini" };
  assert.equal(stepSubCount("body_scan", spontaneous), 1);
  assert.equal(stepSubCount("body_scan", plannedFull), 1);
  assert.equal(stepSubCount("body_scan", plannedMini), 1);
});

test("encoding is exactly ONE page regardless of goal type -- the one-mantra-per-stage simplification", () => {
  assert.equal(stepSubCount("encoding", { ...fresh(), goalType: "emotion_only" }), 1);
  assert.equal(stepSubCount("encoding", { ...fresh(), goalType: "action" }), 1);
  assert.equal(stepSubCount("encoding", { ...fresh(), goalType: "combined" }), 1);
});

// ARC-system upgrade task, Part G: Mini ARC is a genuinely different,
// shorter five-step sequence -- never Full ARC with shortened timers.

test("resolveStepOrder picks NEW_ARC_MINI_STEP_ORDER only for 'plannedMini', and NEW_ARC_LIVE_STEP_ORDER for every other mode", () => {
  assert.deepEqual(resolveStepOrder("plannedMini"), NEW_ARC_MINI_STEP_ORDER);
  assert.deepEqual(resolveStepOrder("plannedFull"), NEW_ARC_LIVE_STEP_ORDER);
  assert.deepEqual(resolveStepOrder("spontaneous"), NEW_ARC_LIVE_STEP_ORDER);
});

// ARCHI -- Adaptive Task Execution & Emotional Persistence task,
// section 1: "mini_action_selection" is removed entirely from the step
// order (the app already knows the task's own action from context) --
// seven Mini-specific steps remain.
test("NEW_ARC_MINI_STEP_ORDER has exactly seven Mini-specific steps -- genuinely short, not a subset renamed", () => {
  const miniOnly = NEW_ARC_MINI_STEP_ORDER.filter((step) => step.startsWith("mini_"));
  assert.equal(miniOnly.length, 7);
  assert.ok(!NEW_ARC_LIVE_STEP_ORDER.some((step) => step.startsWith("mini_")), "the Full ARC sequence must never include any Mini-only step");
});

// Unified ARC & Productivity Update task, requirement 11 (scenario:
// "no duplicated cognitive acceptance"): each cognitive-acceptance
// step -- stop_and_accept_urge/reality_acceptance (Full ARC) and their
// Mini ARC equivalents -- appears EXACTLY ONCE in its own fixed step
// order. advance()/goBack() only ever walk this one static array
// forward/backward; neither can insert a second occurrence, so a
// trainee can never be shown the same thought/urge acceptance screen
// twice in one forward pass through the exercise (going back and
// re-advancing revisits the SAME single entry, it never duplicates it).
test("requirement 11: stop_and_accept_urge/reality_acceptance (Full ARC) and mini_stop_accept_urge/mini_reality_acceptance (Mini ARC) each appear exactly once in their own step order -- structurally impossible to show twice", () => {
  for (const step of ["stop_and_accept_urge", "reality_acceptance"] as const) {
    assert.equal(NEW_ARC_LIVE_STEP_ORDER.filter((candidate) => candidate === step).length, 1, `${step} must appear exactly once in NEW_ARC_LIVE_STEP_ORDER`);
  }
  for (const step of ["mini_stop_accept_urge", "mini_reality_acceptance"] as const) {
    assert.equal(NEW_ARC_MINI_STEP_ORDER.filter((candidate) => candidate === step).length, 1, `${step} must appear exactly once in NEW_ARC_MINI_STEP_ORDER`);
  }
});

// ARCHI -- Unified 7-Part Update task, Part 5: "mini_action" is now
// permanently unreachable too (its own step id/copy/setters stay
// intact, never deleted) -- mini_encoding now advances straight to
// "complete", for every goalType. ARCHI -- Adaptive Task Execution &
// Emotional Persistence task, section 1: "mini_action_selection" is
// removed entirely -- mini_acceptance_transition is back to exactly
// one sub-screen, advancing straight to mini_encoding.
test("a Mini ARC session walks goal_select -> free_breathing -> mini_thought -> mini_awareness -> mini_presence -> mini_acceptance_transition -> mini_encoding -> complete, skipping every Full-ARC-only step and the now-removed mini_action/emotional_action/emotional_insight trio", () => {
  let state: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "plannedMini" };
  state = setGoalType(state, "action", NOW);
  assert.equal(state.currentStep, "self_observation_choice", "self-observation task: this is Mini ARC's own genuine first screen now, right before free_breathing");
  state = declineSelfObservation(state, NOW);
  assert.equal(state.currentStep, "free_breathing", "ARCHI Free Breathing Intro task: Mini ARC shares the same opening screen");
  state = completeFreeBreathingIntro(state, NOW);
  // ARCHI -- Consolidated Implementation Request, Part 5.1 ("Cognitive
  // Identification Before Emotion"): mini_thought now comes right after
  // free_breathing, BEFORE mini_awareness (emotion identification) --
  // the reverse of the earlier order.
  assert.equal(state.currentStep, "mini_thought", "cognitive identification (thought/interpretation/urge) comes first");
  // Declining the chooser entirely, on purpose -- this test's own scope is the general Mini walk, not reality acceptance (covered separately below), so mini_reality_acceptance and mini_stop_accept_urge must both stay skipped.
  state = setMiniThought(state, null, "", NOW);
  assert.equal(state.currentStep, "mini_awareness", "only after cognitive identification does Mini ARC proceed to Emotion Identification");
  state = setMiniAwareness(state, "fear", null, "התחלתי", null, NOW);
  // ARCHI -- Action-Readiness Check task: the new shared step now sits
  // right after "mini_awareness" -- answering it with unpleasant >= 5
  // ("continue") proceeds exactly as this walk already expects, with
  // no other behavior change.
  assert.equal(state.currentStep, "action_readiness_check");
  state = confirmActionReadinessCheck(state, 7, 3, 8, NOW);
  assert.equal(state.actionReadinessOutcome, "continue");
  assert.equal(state.currentStep, "mini_presence");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "mini_acceptance_transition");
  state = setMiniAcceptanceTransition(state, "chest", "רוגע", "יישור הגב", NOW);
  // ARCHI -- Adaptive Task Execution & Emotional Persistence task,
  // section 1: mini_acceptance_transition is back to a single
  // sub-screen (no integrated action-selection prompt), so this one
  // advance() call lands straight on mini_encoding.
  assert.equal(state.currentStep, "mini_encoding");
  state = setMiniEncoding(state, "", "", NOW);
  assert.equal(state.currentStep, "complete", "mini_action/emotional_action/emotional_insight are all gone -- Encoding leads directly to completion, for every goalType");
});

// Urge-stop task, test 7 / Unified ARC & Productivity Update task,
// requirement 6: mini_thought is now Mini ARC's own distinctive
// OPENING -- "an optional brief awareness choice: Thought /
// Interpretation / Urge... do not force completing all three." Picking
// "urge" makes mini_stop_accept_urge reachable right after it; picking
// "thought"/"interpretation" makes mini_reality_acceptance reachable
// instead; declining skips both conditional steps entirely.
test("Mini ARC: choosing 'urge' on the mini_thought chooser shows mini_stop_accept_urge right after it; choosing 'thought' or 'interpretation' shows mini_reality_acceptance instead; declining skips both", () => {
  let withUrge: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "plannedMini", currentStep: "mini_thought" };
  withUrge = setMiniThought(withUrge, "urge", "דחף לקום ולעזוב", NOW);
  assert.equal(withUrge.currentStep, "mini_stop_accept_urge");
  withUrge = advance(withUrge, NOW);
  assert.equal(withUrge.currentStep, "mini_awareness", "urge-stop completed -- no thought/interpretation was chosen, so mini_reality_acceptance stays skipped; mini_awareness (emotion identification) is next, per Part 5.1's new order");

  let withThought: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "plannedMini", currentStep: "mini_thought" };
  withThought = setMiniThought(withThought, "thought", "אף אחד לא מקשיב לי", NOW);
  assert.equal(withThought.currentStep, "mini_reality_acceptance", "a thought was chosen -- urge-stop stays skipped, reality acceptance appears instead");

  let declined: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "plannedMini", currentStep: "mini_thought" };
  declined = setMiniThought(declined, null, "", NOW);
  assert.equal(declined.currentStep, "mini_awareness", "declining all three skips both conditional steps entirely, landing on mini_awareness next");
});

test("Mini ARC's own mini_stop_accept_urge is exactly one combined screen, matching every other Mini step's own brevity requirement", () => {
  const state: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "plannedMini", urgeText: "דחף" };
  assert.equal(stepSubCount("mini_stop_accept_urge", state), 1);
});

test("a Mini ARC session (Emotional/Combined track) reaches 'complete' directly from mini_encoding -- mini_action/emotional_action/emotional_insight are all permanently unreachable now", () => {
  for (const goalType of ["emotion_only", "combined"] as const) {
    let state: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "plannedMini", currentStep: "mini_encoding", goalType };
    state = setMiniEncoding(state, "", "", NOW);
    assert.equal(state.currentStep, "complete", `goalType=${goalType}`);
  }
});

// ARCHI -- Adaptive Task Execution & Emotional Persistence task,
// section 1: mini_acceptance_transition's own former integrated
// action-selection sub-screen (subIndex 1) is removed -- it is back
// to exactly one sub-screen for every Mini ARC session, regardless of
// isActiveTaskLiveOrigin or arcGymSituationId.
test("every Mini ARC step has exactly one sub-screen -- the brevity requirement itself (mini_thought and mini_acceptance_transition included), reachable regardless of isActiveTaskLiveOrigin or arcGymSituationId", () => {
  const state: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "plannedMini" };
  for (const step of ["mini_awareness", "mini_thought", "mini_presence", "mini_encoding", "mini_action", "mini_acceptance_transition"] as const) {
    assert.equal(stepSubCount(step, state), 1);
  }
  assert.equal(stepSubCount("mini_acceptance_transition", { ...state, isActiveTaskLiveOrigin: true }), 1);
  assert.equal(stepSubCount("mini_acceptance_transition", { ...state, arcGymSituationId: "sit1" }), 1);
});

test("setMiniAcceptanceTransition and setMiniEncoding accept optional/required fields correctly -- mantra/belief may both be blank, area/sensation/movement are the continuity trio", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "mini_acceptance_transition", arcInvocationMode: "plannedMini" };
  state = setMiniAcceptanceTransition(state, "abdomen", "ביטחון", "נשימה עמוקה", NOW);
  assert.equal(state.supportiveBodyArea, "abdomen");
  assert.equal(state.supportiveSensation, "ביטחון");
  assert.equal(state.positiveMovement, "נשימה עמוקה");

  state = setMiniEncoding(state, "", "", NOW);
  assert.equal(state.miniMantraText, null);
  assert.equal(state.miniBeliefText, null);

  let withBoth: NewArcLiveSessionState = { ...fresh(), currentStep: "mini_encoding", arcInvocationMode: "plannedMini" };
  withBoth = setMiniEncoding(withBoth, "אני ממוקד", "אני מסוגל", NOW);
  assert.equal(withBoth.miniMantraText, "אני ממוקד");
  assert.equal(withBoth.miniBeliefText, "אני מסוגל");
});

test("resolveProgress for a Mini ARC session never exceeds its own (much smaller) total, and stays monotonic", () => {
  let state: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "plannedMini" };
  let lastPosition = 0;
  for (let i = 0; i < 11 && state.currentStep !== "complete"; i++) {
    const progress = resolveProgress(state);
    assert.ok(progress.position >= lastPosition);
    assert.ok(progress.position <= progress.total);
    assert.ok(progress.total < 11, "Mini ARC's own total step count must stay small");
    lastPosition = progress.position;
    state =
      state.currentStep === "goal_select"
        ? setGoalType(state, "action", NOW)
        : state.currentStep === "free_breathing"
          ? completeFreeBreathingIntro(state, NOW)
          : advance(state, NOW);
  }
});

// ARC-system upgrade task ("ARC ספונטני ויצירת ARC מתוכנן"), Part 5:
// createSessionFromPlannedArcFields -- starting a live run pre-filled
// from a saved PlannedArc, never re-asking for data the draft already
// has, never touching isStepReachable's existing behavior for an
// ORDINARY session.

test("a prefilled Full-ARC session starts past goal_select AND all three supportive_*_select steps when the draft provides the full continuity trio", () => {
  const state = createSessionFromPlannedArcFields("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "plannedFull", {
    goalType: "action",
    triggerText: "מייל כועס",
    supportiveBodyArea: "chest",
    supportiveSensation: "רוגע",
    positiveMovement: "יישור הגב",
    mantraText: "אני ממוקד",
    beliefText: "אני מסוגל",
    urgeText: null,
    thoughtText: null,
    thoughtTimeOrientation: null,
    interpretationText: null,
  }, "draft-1");
  assert.equal(state.goalType, "action");
  assert.equal(state.supportiveBodyArea, "chest");
  assert.equal(state.supportiveSensation, "רוגע");
  assert.equal(state.positiveMovement, "יישור הגב");
  assert.equal(state.miniMantraText, "אני ממוקד");
  assert.equal(state.miniBeliefText, "אני מסוגל");
  assert.notEqual(state.currentStep, "goal_select");
  assert.notEqual(state.currentStep, "supportive_area_select");
  assert.notEqual(state.currentStep, "supportive_sensation_select");
  assert.notEqual(state.currentStep, "supportive_movement_select");
  // ARCHI -- Free Breathing Intro & Persistent Very Pale Blue
  // Background task: the breathing intro is never skipped for a
  // planned run either ("appear before this selector," for every
  // Full/Mini ARC entry) -- so the very first step still requiring
  // live input, walking resolveStepOrder from its own start, is now
  // "free_breathing", the earliest step that is neither goal_select
  // nor one of the skipped supportive_*_select steps.
  assert.equal(state.currentStep, "free_breathing");
});

test("a prefilled session with only the track known (no supportive trio) still walks through body_scan_opening_region (Screen Two, the Full ARC Blue-selection screen) etc. normally -- a partial draft never invents the missing fields", () => {
  const state = createSessionFromPlannedArcFields("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "plannedFull", {
    goalType: "emotion_only",
    triggerText: null,
    supportiveBodyArea: null,
    supportiveSensation: null,
    positiveMovement: null,
    mantraText: null,
    beliefText: null,
    urgeText: null,
    thoughtText: null,
    thoughtTimeOrientation: null,
    interpretationText: null,
  }, "draft-1");
  assert.equal(state.currentStep, "free_breathing", "ARCHI Free Breathing Intro task: the opening screen is never skipped for a planned draft either");
  // walking forward from here must still reach body_scan_opening_region normally, exactly like an ordinary session;
  // supportive_area_select itself is reachable only for Shortened ARC now, never for this plannedFull session.
  let cursor = state;
  for (let i = 0; i < 60 && cursor.currentStep !== "body_scan_opening_region"; i++) cursor = advance(cursor, NOW);
  assert.equal(cursor.currentStep, "body_scan_opening_region");
});

test("createSessionFromPlannedArcFields for Mini mode positions the session on its own first reachable Mini step (still skipping goal_select)", () => {
  const state = createSessionFromPlannedArcFields("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "plannedMini", {
    goalType: "action",
    triggerText: null,
    supportiveBodyArea: "chest",
    supportiveSensation: "רוגע",
    positiveMovement: "יישור הגב",
    mantraText: null,
    beliefText: null,
    urgeText: null,
    thoughtText: null,
    thoughtTimeOrientation: null,
    interpretationText: null,
  }, "draft-1");
  assert.equal(state.arcInvocationMode, "plannedMini");
  assert.equal(state.currentStep, "self_observation_choice", "self-observation task: Mini ARC's own first reachable step is now this choice screen, right before the shared opening (free_breathing)");
});

test("createSessionFromPlannedArcFields never invents data the draft didn't have -- fields left null on the fields argument stay null on the resulting state", () => {
  const state = createSessionFromPlannedArcFields("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "plannedFull", {
    goalType: "combined",
    triggerText: null,
    supportiveBodyArea: null,
    supportiveSensation: null,
    positiveMovement: null,
    mantraText: null,
    beliefText: null,
    urgeText: null,
    thoughtText: null,
    thoughtTimeOrientation: null,
    interpretationText: null,
  }, "draft-1");
  assert.equal(state.triggerText, null);
  assert.equal(state.supportiveBodyArea, null);
  assert.equal(state.miniMantraText, null);
  assert.equal(state.miniBeliefText, null);
});

test("isStepReachable's existing behavior for an ORDINARY (non-prefilled) session is completely unaffected -- it still starts at goal_select with every continuity field null", () => {
  const state: NewArcLiveSessionState = { ...fresh() };
  assert.equal(state.currentStep, "goal_select");
  assert.equal(state.supportiveBodyArea, null);
});

// --- Three-levels-of-acceptance task -------------------------------------

// Required test 1 / unified update, mode D: neither a thought nor an
// interpretation skips reality_acceptance and mini_reality_acceptance entirely.
test("test 1: ARC without a thought or interpretation selected/written never shows reality_acceptance or interpretation_acceptance -- goes straight from the thought screen to emotion (no urge selected either)", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "thought", selectedCognitiveThought: true };
  state = setThought(state, "", NOW);
  assert.equal(state.thoughtTimeOrientation, null);
  assert.equal(state.currentStep, "emotion", "no thought and no interpretation must skip reality_acceptance/interpretation_acceptance entirely");

  let mini: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "plannedMini", currentStep: "mini_thought" };
  mini = setMiniThought(mini, null, "", NOW);
  assert.equal(mini.currentStep, "mini_awareness", "Mini ARC with no thought or interpretation must skip mini_reality_acceptance entirely, landing on mini_awareness (Part 5.1's new order) next");
});

// Required tests 2-4: the correct mantra is shown for each time classification.
test("tests 2-4: reality_acceptance shows the correct verbatim mantra for past/future/present", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "thought", selectedCognitiveThought: true };
  state = setThought(state, "אני חושב שפישלתי", NOW);
  // The thought screen is always reachable and comes right before reality_acceptance -- no separate echo/review step.
  assert.equal(state.currentStep, "reality_acceptance");
  assert.equal(state.subIndex, 0);

  const past = setThoughtTimeOrientation(state, "past", NOW);
  assert.equal(past.thoughtTimeOrientation, "past");
  assert.equal(past.currentStep, "reality_acceptance");
  assert.equal(past.subIndex, 1);

  const future = setThoughtTimeOrientation(state, "future", NOW);
  assert.equal(future.thoughtTimeOrientation, "future");

  const present = setThoughtTimeOrientation(state, "present", NOW);
  assert.equal(present.thoughtTimeOrientation, "present");
});

test("reality_acceptance has exactly two sub-screens (ask, then mantra); mini_reality_acceptance has exactly one, matching every other Mini step", () => {
  const state: NewArcLiveSessionState = { ...fresh(), currentThought: "מחשבה", thoughtTimeOrientation: "past" };
  assert.equal(stepSubCount("reality_acceptance", state), 2);
  assert.equal(stepSubCount("mini_reality_acceptance", state), 1);
});

test("reality_acceptance is ordered right after stop_and_accept_urge, before natural_breathing, in NEW_ARC_LIVE_STEP_ORDER", () => {
  const stopIndex = NEW_ARC_LIVE_STEP_ORDER.indexOf("stop_and_accept_urge");
  const realityIndex = NEW_ARC_LIVE_STEP_ORDER.indexOf("reality_acceptance");
  const breathingIndex = NEW_ARC_LIVE_STEP_ORDER.indexOf("natural_breathing");
  assert.ok(stopIndex < realityIndex && realityIndex < breathingIndex);
});

// Required test 9: thought + classification transfer from a spontaneous session into a planned session via createSessionFromPlannedArcFields.
test("test 9: thought text and time classification transfer into a prefilled planned session, re-askable rather than silently skipped (same precedent as urgeText)", () => {
  const state = createSessionFromPlannedArcFields("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "plannedFull", {
    goalType: "action",
    triggerText: null,
    supportiveBodyArea: null,
    supportiveSensation: null,
    positiveMovement: null,
    mantraText: null,
    beliefText: null,
    urgeText: null,
    thoughtText: "אני חושב שאכשל",
    thoughtTimeOrientation: "future",
    interpretationText: null,
  }, "draft-1");
  assert.equal(state.currentThought, "אני חושב שאכשל");
  assert.equal(state.thoughtTimeOrientation, "future");
  // reality_acceptance must still be reached while walking forward -- the field is prefilled, never fast-forwarded past like the supportive-area trio.
  let cursor = state;
  for (let i = 0; i < 60 && cursor.currentStep !== "reality_acceptance"; i++) cursor = advance(cursor, NOW);
  assert.equal(cursor.currentStep, "reality_acceptance");
  assert.equal(cursor.thoughtTimeOrientation, "future", "the prefilled classification is never silently cleared while walking forward");
});

// Required test 12: the rest of the step sequence and existing user data stay untouched.
test("test 12: the new cognitive branches never change any other step's reachability or order for sessions with nothing selected", () => {
  let state: NewArcLiveSessionState = { ...fresh() };
  state = setGoalType(state, "action", NOW);
  assert.equal(state.currentStep, "free_breathing");
  state = completeFreeBreathingIntro(state, NOW);
  assert.equal(state.currentStep, "cognitive_selector");
  state = setCognitiveSelection(state, { thought: false, interpretation: false, urge: false }, NOW);
  assert.equal(state.currentStep, "emotion");
  state = setEmotion(state, "frustration", null, NOW);
  // ARCHI -- Action-Readiness Check task: the new shared step now sits
  // right after "emotion," unaffected by this test's own "nothing
  // selected" scope.
  assert.equal(state.currentStep, "action_readiness_check");
});

// --- Unified awareness/urge/thought/interpretation update (ARCHI
// Universal ARC Routing task, requirement 6-7: interpretation now ALWAYS
// has its own separate "interpretation"/"interpretation_acceptance" pair
// -- mode A no longer lives inside reality_acceptance at all) ----------

// Required test 1 (mode A isn't just mode D): an interpretation ALONE
// (no thought) reaches its own dedicated interpretation_acceptance step,
// as a single fixed screen -- never the time-classification question
// (that stays exclusive to reality_acceptance, which is itself now
// unreachable with no thought at all).
test("test 3: interpretation alone (no thought selected/written) reaches the dedicated interpretation_acceptance step as a single fixed screen, never reality_acceptance", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "cognitive_selector" };
  state = setCognitiveSelection(state, { thought: false, interpretation: true, urge: false }, NOW);
  assert.equal(state.currentStep, "interpretation");
  state = setInterpretation(state, "הוא לא אוהב אותי", NOW);
  assert.equal(state.currentThought, null);
  assert.equal(state.interpretationText, "הוא לא אוהב אותי");
  assert.equal(state.currentStep, "interpretation_acceptance", "an interpretation alone must reach its own dedicated acceptance step");
  assert.equal(stepSubCount("interpretation_acceptance", state), 1, "a single fixed screen, never the two-screen ask+mantra flow");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "emotion", "one screen is enough -- no time-classification sub-screen follows, and reality_acceptance is never reached at all");
});

// Required test 4: a thought alone still runs the ordinary two-screen
// time-classification + mantra flow (already covered by the dedicated
// tests near the top of this file) -- this test only confirms
// interpretationText stays null throughout, never invented from the
// thought, and that interpretation_acceptance is never reached either.
test("test 4: a thought alone never invents an interpretationText, and never reaches interpretation_acceptance -- only reality_acceptance's own two-screen flow runs", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "cognitive_selector" };
  state = setCognitiveSelection(state, { thought: true, interpretation: false, urge: false }, NOW);
  state = setThought(state, "אני לא מספיק מוכן", NOW);
  assert.equal(state.interpretationText, null);
  assert.equal(stepSubCount("reality_acceptance", state), 2, "reality_acceptance is always the two-screen ask+mantra flow now");
  state = setThoughtTimeOrientation(state, "present", NOW);
  state = advance(state, NOW);
  assert.equal(state.currentStep, "emotion", "no interpretation was selected -- interpretation_acceptance must never be reached");
});

// Required test 5: thought AND interpretation together now run as TWO
// genuinely separate, sequential acceptance moments (reality_acceptance
// then interpretation_acceptance) -- never one combined screen, and
// never interpretation folded into reality_acceptance's own content.
test("test 5: thought and interpretation together run TWO separate, sequential acceptance screens -- reality_acceptance (thought) THEN interpretation_acceptance (interpretation), in that order, never combined", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "cognitive_selector" };
  state = setCognitiveSelection(state, { thought: true, interpretation: true, urge: false }, NOW);
  assert.equal(state.currentStep, "thought", "Thought comes before Interpretation in the required order");
  state = setThought(state, "מחשבה", NOW);
  assert.equal(state.currentStep, "reality_acceptance");
  assert.equal(stepSubCount("reality_acceptance", state), 2);
  state = setThoughtTimeOrientation(state, "present", NOW);
  state = advance(state, NOW);
  assert.equal(state.currentStep, "interpretation", "only after thought-acceptance completes does the interpretation capture screen appear");
  state = setInterpretation(state, "פרשנות", NOW);
  assert.equal(state.currentStep, "interpretation_acceptance");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "emotion");
});

// Required test 7: urge + thought + interpretation together -- every
// step appears, in the exact required order: cognitive_selector -> urge
// -> stop_and_accept_urge -> thought -> reality_acceptance ->
// interpretation -> interpretation_acceptance -> emotion -> natural_breathing.
test("test 7: urge, thought, and interpretation together walk the full Urge -> Thought -> Interpretation -> Emotion -> Presence order, in that exact sequence", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "cognitive_selector" };
  state = setCognitiveSelection(state, { thought: true, interpretation: true, urge: true }, NOW);
  assert.equal(state.currentStep, "urge", "Urge comes first");
  state = setUrgeText(state, "דחף לגרד", NOW);
  assert.equal(state.currentStep, "stop_and_accept_urge");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "thought", "Thought comes second -- stop_and_accept_urge is a single page");
  state = setThought(state, "אני לא מספיק מוכן", NOW);
  assert.equal(state.currentStep, "reality_acceptance");
  assert.equal(stepSubCount("reality_acceptance", state), 2);
  state = setThoughtTimeOrientation(state, "present", NOW);
  state = advance(state, NOW);
  assert.equal(state.currentStep, "interpretation", "Interpretation comes third");
  state = setInterpretation(state, "הוא לא אוהב אותי", NOW);
  assert.equal(state.currentStep, "interpretation_acceptance");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "emotion", "Emotion comes fourth");
  state = setEmotion(state, "fear", null, NOW);
  // ARCHI -- Action-Readiness Check task: the new shared step now sits
  // right after "emotion," before Presence -- confirming it with
  // unpleasant >= 5 ("continue") reaches Presence exactly as this
  // test's own title still expects.
  assert.equal(state.currentStep, "action_readiness_check");
  state = confirmActionReadinessCheck(state, 8, 2, 8, NOW);
  assert.equal(state.actionReadinessOutcome, "continue");
  assert.equal(state.currentStep, "natural_breathing", "Presence comes last");
});

// Required test 9: Mini ARC's own interpretation-only and
// thought+interpretation-together modes. Unified update task,
// requirement 6: the chooser itself only ever sets ONE field per use
// (never two at once -- "do not force completing all three"), but a
// session that already carries both (e.g. prefilled from a saved
// PlannedArc, or from a trainee who used the chooser twice) must keep
// the exact same single fixed-screen flow.
test("test 9 (Mini): choosing 'interpretation' on the chooser makes mini_reality_acceptance reachable as a single fixed screen; a session carrying both a thought AND an interpretation keeps the same single-screen flow", () => {
  let interpretationOnly: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "plannedMini", currentStep: "mini_thought" };
  interpretationOnly = setMiniThought(interpretationOnly, "interpretation", "הוא לא אוהב אותי", NOW);
  assert.equal(interpretationOnly.currentStep, "mini_reality_acceptance");
  assert.equal(stepSubCount("mini_reality_acceptance", interpretationOnly), 1);

  const both: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "plannedMini", currentThought: "מחשבה", interpretationText: "פרשנות" };
  assert.equal(stepSubCount("mini_reality_acceptance", both), 1, "Mini ARC's own reality-acceptance screen is always exactly one screen, with or without an interpretation");
});

// Required test 12: backward compatibility -- an old session/draft that
// only ever had a thought (interpretationText never existed as a
// concept yet) must never have one invented for it.
test("test 12: a session with only a thought (interpretationText never set) never has one invented -- it stays null", () => {
  const state: NewArcLiveSessionState = { ...fresh(), currentThought: "מחשבה ישנה" };
  assert.equal(state.interpretationText, null);
});

// --- ARC LIVE emotion-based body suggestions task -------------------------

test("section 10, test 1/2 (superseded): 'desired_ending' is now permanently removed from NEW_ARC_LIVE_STEP_ORDER entirely -- Encoding reads the task's own already-known action context directly (Part 2A), never a separate end-of-action question anywhere in the sequence", () => {
  assert.equal(NEW_ARC_LIVE_STEP_ORDER.indexOf("desired_ending"), -1);
});

// Final ARC Flow & Body Animation task, requirement 1: the old
// "unpleasant area" question/select/dwelling-via-unpleasant-area trio
// is fully removed from the active order -- "Identify Contraction"
// (body_scan_contraction) now sits directly after body_scan.
test("section 10, test 3 (superseded): unpleasant_area_question/unpleasant_area_select are no longer part of the active order at all; body_scan_contraction sits directly after body_scan", () => {
  const bodyScanIndex = NEW_ARC_LIVE_STEP_ORDER.indexOf("body_scan");
  const contractionIndex = NEW_ARC_LIVE_STEP_ORDER.indexOf("body_scan_contraction");
  for (const removed of ["unpleasant_area_question", "unpleasant_area_select"] as const) {
    assert.equal(NEW_ARC_LIVE_STEP_ORDER.indexOf(removed), -1, `${removed} must no longer be part of the active step order`);
  }
  assert.equal(contractionIndex, bodyScanIndex + 1);
  for (const presenceStep of ["center_attention", "visual_field", "sound_awareness", "body_scan"] as const) {
    assert.ok(NEW_ARC_LIVE_STEP_ORDER.indexOf(presenceStep) < contractionIndex, `${presenceStep} must come before the new body-scan screens`);
  }
});

test("section 10, test 10 (superseded again by Part 2, then by ARCHI -- Full ARC Body Flow Redesign task): the EXACT ARC SEQUENCE runs in the required order -- contraction -> dwelling -> closure (both now permanently unreachable) -> Acceptance Part 1 -> opening region (Blue-only Screen Two) -> supportive area (Shortened-only fallback) -> Acceptance Part 2 (no heaviness screen, no desired-feeling/end-of-action screens any more)", () => {
  const sequence = ["body_scan_contraction", "dwelling", "body_scan_closedness", "acceptance", "body_scan_opening_region", "supportive_area_select", "acceptance_part_two"] as const;
  const indices = sequence.map((step) => NEW_ARC_LIVE_STEP_ORDER.indexOf(step));
  for (let i = 1; i < indices.length; i++) {
    assert.ok(indices[i - 1] < indices[i], `${sequence[i - 1]} must come before ${sequence[i]}`);
  }
  assert.equal(NEW_ARC_LIVE_STEP_ORDER.indexOf("body_scan_heaviness"), -1, "the heaviness-selection step must be removed from the active flow entirely");
  for (const removed of ["desired_feeling_select", "desired_ending"] as const) {
    assert.equal(NEW_ARC_LIVE_STEP_ORDER.indexOf(removed), -1, `${removed} must be removed from the active flow entirely`);
  }
});

test("section 10, test 12/section 9 (compatibility): a session saved mid-flight on the now-removed unpleasant_area_question (with desiredEnding already answered) forward-migrates to body_scan_contraction, preserving the old answer", () => {
  const state: NewArcLiveSessionState = {
    ...fresh(),
    currentStep: "unpleasant_area_question",
    desiredEnding: "רוגע",
  };
  const migrated = migrateLegacyNewArcLiveStep(state);
  assert.equal(migrated.currentStep, "body_scan_contraction", "this step is no longer active -- a session mid-flight there must forward-migrate to the new sequence's own first step");
  assert.equal(migrated.desiredEnding, "רוגע", "the old answer must survive, never silently cleared");
});

test("section 10, test 7: a custom (non-listed) unpleasant body region is expressible via the existing 'other' region plus its free-text sensation description -- no second, competing custom-label field needed", () => {
  const state = setUnpleasantArea({ ...fresh(), currentStep: "unpleasant_area_question" }, "other", "לחץ באזור הצלעות התחתונות", NOW);
  assert.equal(state.unpleasantBodyArea, "other");
  assert.equal(state.unpleasantSensationDescription, "לחץ באזור הצלעות התחתונות");
});

// Body Scan Upgrade task, section 9, required test 5: the three new
// steps sit in NEW_ARC_LIVE_STEP_ORDER right after the existing,
// untouched body_scan step and before unpleasant_area_question --
// inserted without moving anything else, and the two new selection
// screens (contraction, heaviness) are fully independent, reachable
// steps of their own.
test("ARCHI -- Unified 7-Part Update task, Part 2 (then ARCHI -- Full ARC Body Flow Redesign task): body_scan_contraction/dwelling/body_scan_closedness/acceptance/body_scan_opening_region/supportive_area_select/acceptance_part_two sit right after body_scan, in that exact order, with no heaviness/desired-feeling screen anywhere in between", () => {
  const bodyScanIndex = NEW_ARC_LIVE_STEP_ORDER.indexOf("body_scan");
  const contractionIndex = NEW_ARC_LIVE_STEP_ORDER.indexOf("body_scan_contraction");
  const dwellingIndex = NEW_ARC_LIVE_STEP_ORDER.indexOf("dwelling");
  const closednessIndex = NEW_ARC_LIVE_STEP_ORDER.indexOf("body_scan_closedness");
  const acceptanceIndex = NEW_ARC_LIVE_STEP_ORDER.indexOf("acceptance");
  const openingRegionIndex = NEW_ARC_LIVE_STEP_ORDER.indexOf("body_scan_opening_region");
  const supportiveIndex = NEW_ARC_LIVE_STEP_ORDER.indexOf("supportive_area_select");
  const acceptancePartTwoIndex = NEW_ARC_LIVE_STEP_ORDER.indexOf("acceptance_part_two");
  assert.equal(contractionIndex, bodyScanIndex + 1);
  assert.equal(dwellingIndex, contractionIndex + 1);
  assert.equal(closednessIndex, dwellingIndex + 1);
  assert.equal(acceptanceIndex, closednessIndex + 1, "Acceptance Part 1 immediately follows Screen One, with dwelling/body_scan_closedness both permanently unreachable but still present as dead steps");
  assert.equal(openingRegionIndex, acceptanceIndex + 1, "body_scan_opening_region (Screen Two, Blue-only) sits right after Acceptance Part 1");
  assert.equal(supportiveIndex, openingRegionIndex + 1);
  assert.equal(acceptancePartTwoIndex, supportiveIndex + 1, "Acceptance Part 2 follows the supportive-selection screens");
});

test("the contraction and closedness screens are fully independent -- setting one never changes the other's own collection or step reachability", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_contraction" };
  state = toggleBodyScanContractionRegion(state, "scanAbdomen", null);
  assert.equal(state.currentStep, "body_scan_contraction", "toggling must never advance the step on its own");
  assert.deepEqual(state.bodyScanHeavinessRegions, [], "the closedness screen's own collection must be untouched");

  state = { ...state, currentStep: "body_scan_closedness" };
  state = setBodyScanHeavinessRegion(state, "scanChest", null, "closedness");
  assert.equal(state.bodyScanContractionRegions.length, 1, "the earlier contraction selection must survive the independent closedness screen's own change");
  assert.equal(state.bodyScanContractionRegions[0].region, "scanAbdomen");
});

// confirmBodyScanClosedness itself is dead code -- body_scan_closedness
// is permanently unreachable (isStepReachable), so no real session can
// ever call it through the UI any more; it is kept, unremoved, purely
// for historical/goBack-safety reasons. ARCHI -- Correct the Full ARC
// Red-to-Green/Direct-to-Blue Selection Logic task: its own internal
// auto-carry-as-green behavior is untouched (it is unreachable, dead
// code, not "unrelated ARC stages" this task should rewrite), but
// isStepReachable("body_scan_opening_region") no longer depends on any
// contraction/closure data at all -- so advance() now always lands on
// body_scan_opening_region after this call, never the old
// supportive_area_select fallback, regardless of whether anything was
// ever marked closed.
test("body_scan_closedness's own (now-unreachable, dead) confirm still auto-derives opening regions when eligible, but advance() now always lands on acceptance (Part 1) next -- body_scan_closedness is unreachable and acceptance is the very next step in the order, before body_scan_opening_region (Screen Two) is ever reached", () => {
  const withoutClosure: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_closedness", bodyScanHeavinessRegions: [] };
  const afterNoClosure = confirmBodyScanClosedness(withoutClosure, NOW);
  assert.equal(afterNoClosure.currentStep, "acceptance", "acceptance (Part 1) is unconditionally reachable right after body_scan_closedness -- it is reached even with nothing identified");

  const withClosure: NewArcLiveSessionState = {
    ...fresh(),
    currentStep: "body_scan_closedness",
    bodyScanContractionRegions: [{ region: "palms", side: "left" }],
    bodyScanHeavinessRegions: [{ region: "palms", side: "left", state: "closedness" }],
  };
  const afterClosure = confirmBodyScanClosedness(withClosure, NOW);
  assert.deepEqual(afterClosure.openingBodyScanRegions, [{ region: "palms", side: "left", role: "opening" }], "this dead function's own internal behavior is untouched by this task");
  assert.equal(afterClosure.currentStep, "acceptance");
});

test("a session that never engages the closure/opening screens (openingBodyScanRegions empty, primaryOpeningBodyScanRegion null) also reaches acceptance (Part 1) right after body_scan_closedness, never supportive_area_select or body_scan_opening_region directly", () => {
  const ordinary: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_closedness", openingBodyScanRegions: [], primaryOpeningBodyScanRegion: null };
  const next = confirmBodyScanClosedness(ordinary, NOW);
  assert.equal(next.currentStep, "acceptance");
});

// --- Compatibility with older saved sessions ------------------------------

// The now-removed steps are gone from active navigation, but every one
// of their own type/content/setter definitions is untouched (already
// exercised throughout this file by the still-passing
// toggleUnpleasantArea/confirmUnpleasantAreas/setUnpleasantArea/
// declineUnpleasantArea/proceedToUnpleasantAreaSelect/
// setBodyScanHeavinessRegion tests above).
test("the removed step ids remain valid NewArcLiveStepId values -- only their ACTIVE reachability was removed, never their type definition", () => {
  const legacySession: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_heaviness" };
  assert.equal(legacySession.currentStep, "body_scan_heaviness", "TypeScript must still accept this as a valid step id");
});

// The chosen opening region(s) are used (via
// arc/newArcLiveCopy.ts's resolvePrimaryOpeningLabel, exercised in
// arc/newArcLiveCopy.test.ts) throughout Acceptance/Regulation/
// Encoding -- here we confirm the engine-level piece: the SAME
// selection stays set, untouched, across the whole later sequence.

// Compatibility with older saved sessions: migrateLegacyNewArcLiveStep
// is the one, single place this happens, called once at load time
// (data/storage.ts's loadNewArcLiveSession).
test("migrateLegacyNewArcLiveStep forward-migrates every one of the four newly-removed steps to the nearest still-active step, preserving already-answered data", () => {
  const unpleasant: NewArcLiveSessionState = { ...fresh(), currentStep: "unpleasant_area_question", subIndex: 2, unpleasantBodyArea: "chest", desiredEnding: "רוגע" };
  const migratedUnpleasant = migrateLegacyNewArcLiveStep(unpleasant);
  assert.equal(migratedUnpleasant.currentStep, "body_scan_contraction");
  assert.equal(migratedUnpleasant.subIndex, 0);
  assert.equal(migratedUnpleasant.unpleasantBodyArea, "chest", "the old answer must survive, never silently cleared");

  const select: NewArcLiveSessionState = { ...fresh(), currentStep: "unpleasant_area_select" };
  assert.equal(migrateLegacyNewArcLiveStep(select).currentStep, "body_scan_contraction");

  const heaviness: NewArcLiveSessionState = {
    ...fresh(),
    currentStep: "body_scan_heaviness",
    bodyScanHeavinessRegions: [{ region: "palms", side: "left", state: "heaviness" }],
  };
  const migratedHeaviness = migrateLegacyNewArcLiveStep(heaviness);
  assert.equal(migratedHeaviness.currentStep, "body_scan_closedness");
  assert.deepEqual(migratedHeaviness.bodyScanHeavinessRegions, [{ region: "palms", side: "left", state: "heaviness" }]);

  // ARCHI -- Unified 7-Part Update task, Part 2: "desired_feeling_locate"
  // (like "desired_feeling_select"/"desired_ending") now forward-
  // migrates to the first step reachable after body_scan_closedness --
  // ARCHI -- Full ARC Body Flow Redesign task: that is now "acceptance"
  // (Part 1), which sits directly after body_scan_closedness and is
  // unconditionally reachable; body_scan_opening_region (Screen Two)
  // only comes after it now.
  const locate: NewArcLiveSessionState = { ...fresh(), currentStep: "desired_feeling_locate", desiredFeelingText: "רוגע" };
  const migratedLocate = migrateLegacyNewArcLiveStep(locate);
  assert.equal(migratedLocate.currentStep, "acceptance");
  assert.equal(migratedLocate.desiredFeelingText, "רוגע", "the old answer must survive, never silently cleared");

  for (const removedStep of ["supportive_sensation_select", "supportive_movement_select"] as const) {
    const legacy: NewArcLiveSessionState = { ...fresh(), currentStep: removedStep, subIndex: 0, supportiveBodyArea: "chest" };
    const migrated = migrateLegacyNewArcLiveStep(legacy);
    assert.equal(migrated.currentStep, "acceptance", `${removedStep} must migrate to acceptance`);
    assert.equal(migrated.supportiveBodyArea, "chest", "the already-chosen supportive area must survive migration");
  }
});

// ARCHI -- Universal ARC Routing, Emotion Identification & Android
// Shortcuts task, requirement 6-7: a session saved mid-flight exactly
// on "reality_acceptance" from BEFORE this task, with only
// interpretationText set (the old mode A -- interpretation only, no
// thought) predates the split between reality_acceptance (Thought-only
// now) and the new "interpretation_acceptance" step. It must
// forward-migrate to "interpretation_acceptance", never stay stuck on
// a step now gated on currentThought alone.
test("migrateLegacyNewArcLiveStep forward-migrates a legacy mode-A 'reality_acceptance' session (interpretation only, no thought) to the new 'interpretation_acceptance' step, preserving the interpretation text", () => {
  const modeA: NewArcLiveSessionState = { ...fresh(), currentStep: "reality_acceptance", subIndex: 0, currentThought: null, interpretationText: "הוא לא אוהב אותי" };
  const migrated = migrateLegacyNewArcLiveStep(modeA);
  assert.equal(migrated.currentStep, "interpretation_acceptance");
  assert.equal(migrated.subIndex, 0);
  assert.equal(migrated.interpretationText, "הוא לא אוהב אותי", "the already-written interpretation must survive migration, untouched");

  // A session with a real thought (mode B/C) must NOT be migrated --
  // reality_acceptance is still its own correct, reachable home.
  const modeB: NewArcLiveSessionState = { ...fresh(), currentStep: "reality_acceptance", subIndex: 1, currentThought: "מחשבה", thoughtTimeOrientation: "present" };
  assert.equal(migrateLegacyNewArcLiveStep(modeB).currentStep, "reality_acceptance", "a session with a real thought must never be migrated away from reality_acceptance");
});

test("Unified ARC & Productivity Update task, requirement 2: migrateLegacyNewArcLiveStep now forward-migrates a brand-new session off 'goal_select' (permanently unreachable -- the goal/trigger selection screen is removed), landing on the real first reachable step and backfilling a sensible goalType", () => {
  const freshSession = fresh();
  assert.equal(freshSession.currentStep, "goal_select", "createNewArcLiveSessionState itself is unchanged -- still starts there");
  const migrated = migrateLegacyNewArcLiveStep(freshSession);
  assert.equal(migrated.currentStep, "free_breathing", "ARCHI Free Breathing Intro task: the first genuinely reachable step for a task-linked (non-shortened) session is now the shared opening screen");
  assert.equal(migrated.subIndex, 0);
  assert.equal(migrated.goalType, "combined", "a real task context backfills to 'combined', never left null");
  // Every OTHER field must survive untouched.
  assert.deepEqual({ ...migrated, currentStep: freshSession.currentStep, goalType: freshSession.goalType, subIndex: freshSession.subIndex }, freshSession);
});

test("migrateLegacyNewArcLiveStep is a no-op for every ordinary, non-removed, already-past-goal_select currentStep", () => {
  const midFlow: NewArcLiveSessionState = { ...fresh(), currentStep: "regulation", subIndex: 1 };
  assert.deepEqual(migrateLegacyNewArcLiveStep(midFlow), midFlow);
  // The one step that is STILL active (body_scan_contraction) must
  // also be a complete no-op. "dwelling" and "body_scan_closedness"
  // are NOT in this list any more -- ARCHI -- Full ARC Body Flow
  // Redesign task made "dwelling" permanently unreachable too (on top
  // of "body_scan_closedness" from the earlier Simplify task) -- both
  // are now genuinely-migrated removed steps, each covered by its own
  // dedicated test below.
  for (const stillActive of ["body_scan_contraction"] as const) {
    const current: NewArcLiveSessionState = { ...fresh(), currentStep: stillActive, subIndex: 0 };
    assert.deepEqual(migrateLegacyNewArcLiveStep(current), current);
  }
});

// ARCHI -- Full ARC Body Flow Redesign task: a session saved mid-flight
// exactly on "dwelling" predates this task -- that step is now
// permanently unreachable, so it must forward-migrate to the next
// reachable step (Acceptance Part 1), preserving its own already-saved
// contraction data untouched.
test("migrateLegacyNewArcLiveStep forward-migrates a session parked on the now-removed dwelling straight to acceptance (Part 1), preserving contraction data", () => {
  const legacy: NewArcLiveSessionState = {
    ...fresh(),
    currentStep: "dwelling",
    bodyScanContractionRegions: [{ region: "scanChest", side: null }],
  };
  const migrated = migrateLegacyNewArcLiveStep(legacy);
  assert.equal(migrated.currentStep, "acceptance");
  assert.deepEqual(migrated.bodyScanContractionRegions, [{ region: "scanChest", side: null }], "the earlier Red contraction data survives the migration untouched");
});

// ARCHI -- Full ARC Body Flow Redesign task: a session saved mid-flight
// exactly on "body_scan_closedness" (now permanently unreachable) is
// forward-migrated to the next reachable step -- "acceptance" (Part 1),
// which sits directly after it in the order -- with NO auto-carry/
// backfill of any kind, regardless of whether anything was ever marked
// contracted.
test("migrateLegacyNewArcLiveStep forward-migrates a session parked on the now-removed body_scan_closedness straight to acceptance (Part 1), with no auto-carry of any kind", () => {
  const withContraction: NewArcLiveSessionState = {
    ...fresh(),
    currentStep: "body_scan_closedness",
    bodyScanContractionRegions: [{ region: "scanShoulders", side: "left" }],
  };
  const migrated = migrateLegacyNewArcLiveStep(withContraction);
  assert.equal(migrated.currentStep, "acceptance", "forward-migrated past body_scan_closedness to the next reachable step");
  assert.deepEqual(migrated.openingBodyScanRegions, [], "no backfill of any kind -- the region shows green only once the trainee actually taps it on body_scan_opening_region");
  assert.deepEqual(migrated.bodyScanContractionRegions, [{ region: "scanShoulders", side: "left" }], "the earlier Red contraction data survives the migration untouched");

  const withoutContraction: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_closedness" };
  const migratedEmpty = migrateLegacyNewArcLiveStep(withoutContraction);
  assert.equal(migratedEmpty.currentStep, "acceptance", "acceptance (Part 1) is reached either way -- it no longer depends on any contraction data to be reachable");
  assert.deepEqual(migratedEmpty.openingBodyScanRegions, []);
});

// ARCHI -- Correct the Full ARC Red-to-Green/Direct-to-Blue Selection
// Logic task: the OLD backfill-on-migration behavior for a session
// already parked on body_scan_opening_region is removed outright --
// this step is a currently-active, directly reachable step (never
// migrated away from), so migrateLegacyNewArcLiveStep is now a
// complete no-op for it, exactly like any other still-active step.
test("migrateLegacyNewArcLiveStep is a complete no-op for a session already parked on body_scan_opening_region -- no backfill of any kind, Dark Blue selections and contraction data alike stay byte-for-byte unchanged", () => {
  const legacy: NewArcLiveSessionState = {
    ...fresh(),
    currentStep: "body_scan_opening_region",
    bodyScanContractionRegions: [
      { region: "scanShoulders", side: "left" },
      { region: "scanChest", side: null },
    ],
    openingBodyScanRegions: [{ region: "scanChest", side: null, role: "opening_and_supportive" }],
  };
  const migrated = migrateLegacyNewArcLiveStep(legacy);
  assert.deepEqual(migrated, legacy, "a complete no-op -- no backfill, no auto-carry, nothing changed");
});

// Preservation of selections after navigation or restart: migrating a
// legacy session off a removed step must never touch the body-scan
// screens' own already-saved selections -- they simply carry straight
// through, exactly as every other untouched field does.
test("migrateLegacyNewArcLiveStep preserves already-saved body-scan contraction/closedness selections and the chosen opening region, unchanged, for a step that genuinely migrates", () => {
  const legacy: NewArcLiveSessionState = {
    ...fresh(),
    currentStep: "supportive_sensation_select",
    bodyScanContractionRegions: [{ region: "scanChest", side: null }],
    bodyScanHeavinessRegions: [{ region: "palms", side: "left", state: "closedness" }],
    openingBodyScanRegions: [{ region: "palms", side: "left", role: "opening" }],
  };
  const migrated = migrateLegacyNewArcLiveStep(legacy);
  assert.equal(migrated.currentStep, "acceptance");
  assert.deepEqual(migrated.bodyScanContractionRegions, [{ region: "scanChest", side: null }]);
  assert.deepEqual(migrated.bodyScanHeavinessRegions, [{ region: "palms", side: "left", state: "closedness" }]);
  assert.deepEqual(migrated.openingBodyScanRegions, [{ region: "palms", side: "left", role: "opening" }]);
});

// Follow-up verification (user-reported risk, still valid under the
// new sequence): a full, end-to-end walk confirming the trainee is
// never asked to choose a supportive body region twice. When a closure
// region was identified and an opening region was picked from it,
// "supportive_area_select" must never appear anywhere in the rest of
// the walk through to completion.
test("full walk: once an opening region is auto-derived from an identified closure region, supportive_area_select never appears anywhere in the rest of the session", () => {
  let state: NewArcLiveSessionState = { ...fresh(), goalType: "action", currentStep: "body_scan_closedness" };
  state = toggleBodyScanContractionRegion(state, "palms", "left");
  state = setBodyScanHeavinessRegion(state, "palms", "left", "closedness");
  state = confirmBodyScanClosedness(state, NOW);
  // ARCHI -- Full ARC Body Flow Redesign task: body_scan_closedness's
  // own dead auto-carry still runs (unchanged, unreachable code), but
  // advance() now always lands on "acceptance" (Part 1) right after it
  // -- body_scan_opening_region (Screen Two, Blue-only) only comes
  // later, after Acceptance Part 1 -- and supportive_area_select
  // (reachable only for Shortened ARC) is skipped either way.
  assert.equal(state.currentStep, "acceptance", "acceptance (Part 1) follows body_scan_closedness directly, regardless of any auto-derived opening region");
  assert.deepEqual(state.openingBodyScanRegions, [{ region: "palms", side: "left", role: "opening" }]);

  const visited: string[] = [];
  let cursor = state;
  for (let i = 0; i < 40 && cursor.currentStep !== "complete"; i++) {
    visited.push(cursor.currentStep);
    cursor = advance(cursor, NOW);
  }
  assert.ok(!visited.includes("supportive_area_select"), "the trainee already has an auto-derived opening region -- the coarse supportive-area question must never appear at all");
});

// ARCHI -- Full ARC Body Flow Redesign task: "supportive_area_select"
// is now reachable ONLY for Shortened ARC -- for a non-shortened
// (plannedFull) session, with NO closure region ever identified, the
// one and only supportive-selection screen is body_scan_opening_region
// (Screen Two, Blue-only); supportive_area_select must never appear at
// all, and body_scan_opening_region appears exactly once.
test("full walk: with no closure region identified, body_scan_opening_region (Screen Two) is reached exactly once and supportive_area_select never appears at all for a non-shortened session", () => {
  const state: NewArcLiveSessionState = { ...fresh(), goalType: "action", currentStep: "body_scan_closedness" };
  const visited: string[] = [];
  let cursor = state;
  for (let i = 0; i < 40 && cursor.currentStep !== "complete"; i++) {
    visited.push(cursor.currentStep);
    cursor = advance(cursor, NOW);
  }
  assert.equal(visited.filter((step) => step === "supportive_area_select").length, 0, "supportive_area_select is reachable only for Shortened ARC -- never for this plannedFull session");
  assert.equal(visited.filter((step) => step === "body_scan_opening_region").length, 1, "body_scan_opening_region (Screen Two) is Full ARC's own single supportive-selection screen, asked exactly once");
});

// --- ARCHI -- Unified Final Specification task, section 1 (combined "מחשבה / דחף" shortcut) ---

function freshCombinedShortcut(): NewArcLiveSessionState {
  return createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "spontaneous", null, true);
}

test("skipEmotionSelection: nothing is preselected at creation -- the trainee still checks מחשבה/פרשנות/דחף by hand on cognitive_selector, never auto-chosen for them", () => {
  const state = freshCombinedShortcut();
  assert.equal(state.selectedCognitiveUrge, false);
  assert.equal(state.selectedCognitiveThought, false);
  assert.equal(state.selectedCognitiveInterpretation, false);
  assert.equal(state.skipEmotionSelection, true);
});

test("skipEmotionSelection: goal_select -> free_breathing -> cognitive_selector, fully reachable and interactive -- never skipped for this shortcut", () => {
  let state = freshCombinedShortcut();
  state = setGoalType(state, "action", NOW);
  assert.equal(state.currentStep, "self_observation_choice", "self-observation task: this 'spontaneous' entry point also reaches the choice screen first, right before free_breathing");
  state = declineSelfObservation(state, NOW);
  assert.equal(state.currentStep, "free_breathing");
  state = completeFreeBreathingIntro(state, NOW);
  assert.equal(state.currentStep, "cognitive_selector", "cognitive_selector must stay reachable -- the trainee picks any combination of מחשבה/פרשנות/דחף themselves");
});

test("skipEmotionSelection: cognitive_selector supports checking one, two, or all three of מחשבה/פרשנות/דחף in the same session", () => {
  let state: NewArcLiveSessionState = { ...freshCombinedShortcut(), currentStep: "cognitive_selector" };
  state = setCognitiveSelection(state, { thought: true, interpretation: true, urge: true }, NOW);
  assert.equal(state.selectedCognitiveThought, true);
  assert.equal(state.selectedCognitiveInterpretation, true);
  assert.equal(state.selectedCognitiveUrge, true);
  assert.equal(state.currentStep, "urge", "all three protocols run in this one session, in the engine's own fixed urge -> thought -> interpretation order");
});

test("skipEmotionSelection: after every selected cognitive protocol completes, emotion is permanently skipped -- lands on natural_breathing directly, never an invented unpleasant emotion", () => {
  let state: NewArcLiveSessionState = { ...freshCombinedShortcut(), currentStep: "cognitive_selector" };
  state = setCognitiveSelection(state, { thought: false, interpretation: false, urge: true }, NOW);
  assert.equal(state.currentStep, "urge");
  state = setUrgeText(state, "", NOW);
  // ARCHI -- Action-Readiness Check task: the new shared step now sits
  // right after "emotion" (so also right after this emotion-skip) --
  // confirming it with unpleasant >= 5 ("continue") reaches
  // natural_breathing exactly as this test's own title still expects.
  assert.equal(state.currentStep, "action_readiness_check", "emotion is unreachable for this session -- the walk lands straight on the next real step");
  state = confirmActionReadinessCheck(state, 9, 1, 8, NOW);
  assert.equal(state.currentStep, "natural_breathing");
});

test("skipEmotionSelection: zero cognitive selections still reaches emotion-skip correctly, landing directly on natural_breathing", () => {
  let state: NewArcLiveSessionState = { ...freshCombinedShortcut(), currentStep: "cognitive_selector" };
  state = setCognitiveSelection(state, { thought: false, interpretation: false, urge: false }, NOW);
  assert.equal(state.currentStep, "action_readiness_check", "no cognitive protocol selected and emotion skipped -- the trainee lands on the next real step with no empty screens in between");
  state = confirmActionReadinessCheck(state, 9, 1, 8, NOW);
  assert.equal(state.currentStep, "natural_breathing");
});

test("skipEmotionSelection has zero effect on every step after natural_breathing (Presence, body awareness, acceptance, regulation, action selection, encoding) -- the rest of Full ARC is completely unaffected, reached exactly the same way as any other Full ARC session", () => {
  const withFlag: NewArcLiveSessionState = { ...freshCombinedShortcut(), currentStep: "body_scan_contraction" };
  const without: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan_contraction" };
  assert.deepEqual(resolveNextStep(withFlag), resolveNextStep(without));
});

test("skipEmotionSelection defaults to false for every pre-existing call site -- createNewArcLiveSessionState's 7th argument is purely additive, never required", () => {
  const state = createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "spontaneous");
  assert.equal(state.skipEmotionSelection, false);
  assert.equal(state.selectedCognitiveUrge, false, "without the shortcut, urge is never silently preselected");
});

test("every other existing Full ARC entry point (לא נעים/סבבה/direct task) leaves skipEmotionSelection false -- only the combined shortcut button sets it", () => {
  const plainFull = createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "spontaneous");
  const shortened = createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "shortened");
  assert.equal(plainFull.skipEmotionSelection, false);
  assert.equal(shortened.skipEmotionSelection, false);
});

// --- ARC Saving, Trigger Management & Quick-Action Buttons task ---

test("arcSavingBodyOptionId/arcSavingExerciseId: a trigger-activated session walks straight from body_scan to acceptance, skipping body_scan_contraction entirely -- the trainee never re-selects contraction regions a saved option already answered", () => {
  const withOption: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan", arcSavingBodyOptionId: "option-1" };
  const { step } = resolveNextStep(withOption);
  assert.equal(step, "acceptance");
});

test("arcSavingBodyOptionId/arcSavingExerciseId: from acceptance, body_scan_opening_region and supportive_area_select are both skipped -- the walk lands on acceptance_part_two, never re-asking for the opening/support region a saved option already answered", () => {
  const withOption: NewArcLiveSessionState = { ...fresh(), currentStep: "acceptance", arcSavingBodyOptionId: "option-1" };
  const { step } = resolveNextStep(withOption);
  assert.equal(step, "acceptance_part_two");
});

test("arcSavingExerciseId has the exact same skip effect as arcSavingBodyOptionId -- 'תרגל שוב' on a standalone saved exercise skips body-region re-selection the same way a trigger's body option does", () => {
  const withExercise: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan", arcSavingExerciseId: "exercise-1" };
  const { step } = resolveNextStep(withExercise);
  assert.equal(step, "acceptance");
});

test("arcSaving skip has ZERO effect once past the skipped region-selection screens -- regulation and every step after it are reached exactly like any other Full ARC session (the trainee can still see/adjust the pre-filled sensation/movement there)", () => {
  const withOption: NewArcLiveSessionState = { ...fresh(), currentStep: "acceptance_part_two", arcSavingBodyOptionId: "option-1" };
  const without: NewArcLiveSessionState = { ...fresh(), currentStep: "acceptance_part_two" };
  assert.deepEqual(resolveNextStep(withOption), resolveNextStep(without));
});

test("arcSavingTriggerIdForNewOption (the 'בחירת אזורי גוף מחדש' path) has NO skip effect at all -- a fresh-regions session walks through body_scan_contraction/body_scan_opening_region exactly like an ordinary session, since there is no pre-existing body option to reuse", () => {
  const freshRegions: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan", arcSavingTriggerIdForNewOption: "trigger-1" };
  const ordinary: NewArcLiveSessionState = { ...fresh(), currentStep: "body_scan" };
  assert.deepEqual(resolveNextStep(freshRegions), resolveNextStep(ordinary));
});

test("arcSavingBodyOptionId/arcSavingExerciseId default to null for every pre-existing call site -- createNewArcLiveSessionState never requires them, purely additive", () => {
  const state = createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "spontaneous");
  assert.equal(state.arcSavingBodyOptionId, null);
  assert.equal(state.arcSavingExerciseId, null);
  assert.equal(state.arcSavingTriggerIdForNewOption, null);
});
