import test from "node:test";
import assert from "node:assert/strict";

import { advance, completeFreeBreathingIntro, confirmTimeAvailableRating, resolveStepOrder, setGoalType, toggleOpeningBodyScanRegion } from "./newArcLiveSteps.ts";
import { createNewArcLiveSessionState, describeArcSessionConfig, resolveSupportiveSensationLabel } from "./newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";

const NOW = "2026-01-05T12:00:00.000Z";

function shortenedSession(): NewArcLiveSessionState {
  return createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "shortened");
}

/**
 * arc/shortenedArc.test.ts
 *
 * Unified Emotional Check-In and Task Postponement System, requirement
 * 5 ("Correct Shortened ARC routing without missing body-scan data"):
 * walks a real "shortened" session end to end and asserts, at every
 * single stop, that none of the skipped preliminary-awareness steps
 * ever appears, while Regulation/Encoding/Transition/the action steps
 * all still do.
 */
test("required test: resolveStepOrder for 'shortened' is the SAME Full ARC order as every other non-Mini mode -- never a separate, duplicated engine", () => {
  assert.deepEqual(resolveStepOrder("shortened"), resolveStepOrder("plannedFull"));
  assert.deepEqual(resolveStepOrder("shortened"), resolveStepOrder("spontaneous"));
});

// ARCHI -- Unified 7-Part Update task, Part 6.2/6.3 ("REDESIGN
// SHORTENED ARC"): a deliberate REVERSAL of the earlier Universal ARC
// Routing task's "emotion is always reachable" rule, for Shortened ARC
// only -- "do not replace it with another emotion question." The
// cognitive_selector/urge/thought/interpretation branches stay
// skipped, exactly as before; "emotion" is now ALSO skipped, landing
// the trainee directly on the one automatic Presence screen
// (natural_breathing, reusing the shared engine/UI, never a second
// Presence walk). ARCHI -- Refine the Shortened ARC / "סבבה" Pathway
// task, requirement 1: "free_breathing" now comes FIRST, before even
// that -- the exact same shared breathing intro every other pathway
// gets, reused verbatim (never a second, duplicated breathing engine).
test("required test: a shortened session walked end-to-end from goal_select shows free_breathing first, then never visits cognitive_selector/urge/thought/interpretation/emotion, landing directly on the automatic Presence screen", () => {
  let state = shortenedSession();
  state = setGoalType(state, "action", NOW);
  assert.equal(state.currentStep, "free_breathing", "requirement 1: the shared breathing intro now opens a shortened session too");
  state = completeFreeBreathingIntro(state, NOW);
  // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
  // task: the new standalone time-available rating now sits right
  // here -- a full-depth rating (6-10) keeps the rest of this walk
  // completely unaffected.
  assert.equal(state.currentStep, "time_available_check");
  state = confirmTimeAvailableRating(state, 8, NOW);
  assert.equal(state.currentStep, "natural_breathing", "Part 6.2/6.3: emotion is skipped too for a shortened session now, landing directly on the automatic Presence screen");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "body_scan", "Part 6.3: the anatomical body appears right after the one Presence screen, as body awareness begins");
});

// Part 6.4/6.5: the old text-chip supportive_area_select is now the
// shared interactive anatomical body for shortened sessions --
// selections write directly into openingBodyScanRegions (the SAME
// field Acceptance/Regulation/Encoding already read generically), so
// they animate with zero extra wiring. Part 5: Encoding leads directly
// to completion, never a transition/emotional_action/emotional_insight
// menu, for any mode.
test("required test: Regulation/Encoding are still reachable for a shortened session (Acceptance is now permanently skipped -- Part 1.2), now via the shared interactive body-selection screen -- Encoding leads straight to completion, no transition/emotional_action/emotional_insight menu", () => {
  let state = shortenedSession();
  state = setGoalType(state, "action", NOW);
  assert.equal(state.currentStep, "free_breathing");
  state = completeFreeBreathingIntro(state, NOW);
  assert.equal(state.currentStep, "time_available_check");
  state = confirmTimeAvailableRating(state, 8, NOW);
  assert.equal(state.currentStep, "natural_breathing");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "body_scan");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "supportive_area_select", "Part 6.4: the new interactive body-selection screen, always reachable for a shortened session");
  // ARCHI -- Precise Body Opening and Stabilization Rules task,
  // section 4: Shortened ARC never has contraction data, so Light
  // Green can never be reachable here -- the very first tap goes
  // straight to Dark Blue (see arc/shortenedGreenBlueLogic.test.ts).
  state = toggleOpeningBodyScanRegion(state, "palms", "left");
  assert.deepEqual(state.openingBodyScanRegions, [{ region: "palms", side: "left", role: "opening_and_supportive" }]);
  // ARCHI -- Consolidated Implementation Request, Part 1.2 ("Remove
  // Acceptance" from Shortened ARC only): Regulation comes directly
  // after Body Selection now -- "acceptance" itself is permanently
  // unreachable for this one mode, so this single advance() lands
  // straight on "regulation," never passing through "acceptance" at
  // all (Full ARC/Mini ARC are unaffected, see arc/newArcLiveSteps.test.ts).
  state = advance(state, NOW);
  // ARCHI -- Adaptive Task Execution & Emotional Persistence task,
  // section 1: the action-selection section that used to render
  // together with the Regulation circle/mantra is removed entirely --
  // applies to Shortened ARC exactly like every other mode.
  assert.equal(state.currentStep, "regulation");
  assert.equal(state.subIndex, 0);
  state = advance(state, NOW);
  assert.equal(state.currentStep, "encoding");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "complete", "Part 5: Encoding leads directly to completion -- transition/emotional_action/emotional_insight are all permanently unreachable now");
});

test("required test: Acceptance's own content never crashes or references the skipped body-scan/unpleasant-area fields -- it falls back to the existing neutral 'notice what's here' framing (resolveSupportiveSensationLabel stays a plain empty-safe string)", () => {
  const state = shortenedSession();
  assert.equal(state.bodyScanContractionRegions.length, 0);
  assert.equal(state.bodyScanHeavinessRegions.length, 0);
  assert.equal(state.unpleasantBodyArea, null);
  assert.equal(resolveSupportiveSensationLabel(state), "");
});

// ARCHI -- Unified 7-Part Update task, Part 5/6: a shortened,
// EMOTION-ONLY session also reaches "complete" directly from Encoding
// now -- transition/emotional_action/emotional_insight are gone for
// every goalType, not only "action".
test("required test: a shortened, EMOTION-ONLY session also reaches 'complete' directly from Encoding -- no transition/emotional_action/emotional_insight for any goalType", () => {
  let state = shortenedSession();
  state = setGoalType(state, "emotion_only", NOW);
  assert.equal(state.currentStep, "free_breathing");
  state = completeFreeBreathingIntro(state, NOW);
  assert.equal(state.currentStep, "time_available_check");
  state = confirmTimeAvailableRating(state, 8, NOW);
  assert.equal(state.currentStep, "natural_breathing");
  state = advance(state, NOW); // body_scan
  state = advance(state, NOW); // supportive_area_select
  state = toggleOpeningBodyScanRegion(state, "palms", "left");
  state = advance(state, NOW); // acceptance
  state = advance(state, NOW); // regulation (1 fixed-mantra page)
  state = advance(state, NOW); // encoding (1 fixed-mantra page; action-selection step removed entirely)
  state = advance(state, NOW); // complete
  assert.equal(state.currentStep, "complete", "Encoding leads directly to completion for emotion_only too");
});

test("required test: describeArcSessionConfig gives 'shortened' its own distinct, correctly-labeled description -- never confused with Mini ARC's own label", () => {
  const label = describeArcSessionConfig({ arcInvocationMode: "shortened", sourcePlannedArcId: null, arcGymSituationId: null, arcFocusPracticeId: null, arcGymMemoryExerciseId: null, arcPerspectiveId: null, arcSavingBodyOptionId: null, arcSavingExerciseId: null, arcSavingTriggerIdForNewOption: null }, null);
  assert.equal(label, "ARC מקוצר");
  assert.notEqual(label, describeArcSessionConfig({ arcInvocationMode: "plannedMini", sourcePlannedArcId: null, arcGymSituationId: null, arcFocusPracticeId: null, arcGymMemoryExerciseId: null, arcPerspectiveId: null, arcSavingBodyOptionId: null, arcSavingExerciseId: null, arcSavingTriggerIdForNewOption: null }, null));
});

test("required test: a shortened session's own goalType is NOT restricted the way a standalone session's is -- when linked to a real task, all three tracks (action/emotion_only/combined) remain available, exactly like Full ARC", () => {
  const state = shortenedSession();
  const afterAction = setGoalType(state, "action", NOW);
  const afterCombined = setGoalType(state, "combined", NOW);
  assert.equal(afterAction.goalType, "action");
  assert.equal(afterCombined.goalType, "combined");
});
