import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * arc/freeBreathingIntro.test.ts
 *
 * ARCHI -- Free Breathing Intro & Persistent Very Pale Blue Background
 * task: the 14 numbered regression scenarios the spec's own "9.
 * REGRESSION TESTS" section requires, each as its own dedicated test
 * (never folded together) so a future change that breaks any ONE of
 * them fails exactly one, clearly-named test. Pure-logic scenarios
 * exercise the real engine functions directly; scenarios that are
 * fundamentally about a .tsx file's own JSX (this codebase's test
 * runner has no React Native renderer -- every other .tsx test file
 * in this repo already works this same way) read that file as source
 * text and assert the exact, already-implemented wiring, rather than
 * re-describing it in prose.
 */

import {
  NEW_ARC_LIVE_STEP_ORDER,
  NEW_ARC_MINI_STEP_ORDER,
  completeFreeBreathingIntro,
  confirmTimeAvailableRating,
  createSessionFromPlannedArcFields,
  declineSelfObservation,
  isStepSkippable,
  resolveProgress,
  resolveStepOrder,
  setGoalType,
  stepSubCount,
} from "./newArcLiveSteps.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";
import { getStepContent } from "./newArcLiveCopy.ts";
import { ARC_FREE_BREATHING_BACKGROUND_COLOR, ARC_FREE_BREATHING_MANTRA, resolveArcBackgroundColor } from "./freeBreathingIntro.ts";
import {
  ARC_BODY_STAGE_INTENSITY,
  OPENING_ACCEPTANCE_COLOR,
  OPENING_ENCODING_COLOR,
  OPENING_REGULATION_COLOR,
  resolveBodyMantraShapeAppearance,
  resolveShowBodyForStage,
} from "./arcBodyMantraCircleLogic.ts";

const NOW = "2026-01-01T00:00:00.000Z";

const __dirname = dirname(fileURLToPath(import.meta.url));
function readSource(relativePath: string): string {
  return readFileSync(join(__dirname, "..", relativePath), "utf8");
}

function fresh(): NewArcLiveSessionState {
  return createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW);
}

// ---------------------------------------------------------------------------
// 1. Full ARC begins with the breathing animation.
// ---------------------------------------------------------------------------
test("1. Full ARC begins with the breathing animation: free_breathing is the very first reachable step after goal_select for every Full-ARC invocation mode (plannedFull/spontaneous/action)", () => {
  assert.equal(NEW_ARC_LIVE_STEP_ORDER[0], "goal_select");
  // self-observation task: self_observation_choice/self_observation_exercise now sit in the array right after goal_select, before free_breathing -- but
  // they're only ACTUALLY reachable for arcInvocationMode === "spontaneous" (see isStepReachable), so plannedFull still walks straight through to free_breathing.
  assert.equal(NEW_ARC_LIVE_STEP_ORDER[3], "free_breathing", "free_breathing must be the fixed fourth array entry, right after goal_select/self_observation_choice/self_observation_exercise, for the whole Full ARC order");
  let plannedFullState: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "plannedFull" };
  plannedFullState = setGoalType(plannedFullState, "combined", NOW);
  assert.equal(plannedFullState.currentStep, "free_breathing", 'Full ARC mode "plannedFull" must land on free_breathing immediately after goal_select -- self_observation_choice is never reachable for this mode');

  let spontaneousState: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "spontaneous" };
  spontaneousState = setGoalType(spontaneousState, "combined", NOW);
  assert.equal(spontaneousState.currentStep, "self_observation_choice", 'Full ARC mode "spontaneous" reaches the self-observation choice screen first');
  spontaneousState = declineSelfObservation(spontaneousState, NOW);
  assert.equal(spontaneousState.currentStep, "free_breathing", 'Full ARC mode "spontaneous" lands on free_breathing right after declining self-observation');
});

// ---------------------------------------------------------------------------
// 2. Mini ARC begins with the breathing animation.
// ---------------------------------------------------------------------------
test("2. Mini ARC begins with the breathing animation: free_breathing is the fixed second step of NEW_ARC_MINI_STEP_ORDER too -- shared verbatim, never a second duplicated engine -- and a real plannedMini session reaches it right after goal_select", () => {
  assert.equal(NEW_ARC_MINI_STEP_ORDER[0], "goal_select");
  // self-observation task: self_observation_choice/self_observation_exercise now sit right after goal_select in this array too (Mini ARC has no
  // sub-pathway, so this pair is always reachable here), pushing free_breathing to the third array entry.
  assert.equal(NEW_ARC_MINI_STEP_ORDER[3], "free_breathing");
  assert.equal(resolveStepOrder("plannedMini")[3], "free_breathing");
  const state = createSessionFromPlannedArcFields(
    "t2",
    "לדבר עם מנהל",
    "לקבוע פגישה",
    NOW,
    "plannedMini",
    {
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
    },
    "plan-1"
  );
  assert.equal(state.currentStep, "self_observation_choice", "createSessionFromPlannedArcFields itself walks forward to the first reachable step, which for a real Mini ARC session is now this self-observation choice screen, right before free_breathing");
});

// ---------------------------------------------------------------------------
// 3. Shortened ARC remains unchanged.
// ---------------------------------------------------------------------------
// ARCHI -- Refine the Shortened ARC / "סבבה" Pathway task, requirement
// 1: REVERSES this scenario's original premise -- free_breathing is
// now the FIRST screen of a shortened session too (reusing the exact
// same shared intro/animation/background every other pathway gets),
// before the body-selection/supportive-area work begins. Only after
// leaving it does the session land on the automatic Presence screen
// (natural_breathing, with Part 6.2/6.3's own cognitive-branch/emotion
// skips still fully in force right after it).
test("3. Shortened ARC (סבבה) now ALSO gets free_breathing first (ARCHI -- Refine the Shortened ARC / \"סבבה\" Pathway task, requirement 1) -- completing it turns on the persistent pale-blue background and lands on the same next reachable step as before (natural_breathing, with no cognitive branch or emotion question asked)", () => {
  let state: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "shortened" };
  state = setGoalType(state, "combined", NOW);
  assert.equal(state.currentStep, "free_breathing", "requirement 1: a shortened session now opens with the shared breathing intro too");
  assert.equal(state.freeBreathingIntroShown, false, "not shown yet -- only completing the screen sets this");
  assert.equal(resolveArcBackgroundColor(state), null, "the persistent pale-blue background is not yet on before the intro is completed");
  state = completeFreeBreathingIntro(state, NOW);
  // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
  // task: the new standalone time-available rating now sits right
  // here -- a full-depth rating (6-10) keeps the rest of this walk
  // completely unaffected.
  assert.equal(state.currentStep, "time_available_check");
  state = confirmTimeAvailableRating(state, 8, NOW);
  assert.equal(state.currentStep, "natural_breathing", "shortened ARC's own skip-list still skips 'emotion' (Part 6.2/6.3), landing directly on the automatic Presence screen");
  assert.equal(state.freeBreathingIntroShown, true, "completing the intro sets the flag, exactly like every other pathway");
  assert.equal(resolveArcBackgroundColor(state), ARC_FREE_BREATHING_BACKGROUND_COLOR, "the persistent pale-blue background now turns on for Shortened ARC too, for the rest of the session");
});

// ---------------------------------------------------------------------------
// 4. The exact Hebrew mantra is displayed.
// ---------------------------------------------------------------------------
test("4. The exact Hebrew mantra 'אני נושם בצורה חופשית.' is displayed on the free_breathing screen, verbatim, with no additional supporting lines", () => {
  assert.equal(ARC_FREE_BREATHING_MANTRA, "אני נושם בצורה חופשית.");
  const state: NewArcLiveSessionState = { ...fresh(), currentStep: "free_breathing" };
  const content = getStepContent(state);
  assert.equal(content.primary, ARC_FREE_BREATHING_MANTRA);
  assert.deepEqual(content.supporting, [], "no multiple explanatory lines on the opening screen");
  const screenSource = readSource("live/NewArcLiveScreen.tsx");
  assert.match(screenSource, /mantra=\{content\.primary\}/, "FreeBreathingIntro must be fed the exact resolved mantra text, never a hardcoded duplicate string");
});

// ---------------------------------------------------------------------------
// 4b. Mini ARC's own free_breathing page uses the EXACT SAME mantra,
// render case, and background -- confirming the exact behavior
// requested when a user later asked to verify this explicitly for
// Mini ARC (ARCHI -- Consolidated Implementation Request follow-up:
// "Mini ARC starts with the existing breathing exercise, using
// exactly the same breathing animation and light-blue background as
// the other ARC pathways").
// ---------------------------------------------------------------------------
test("4b. Mini ARC's free_breathing content (getStepContent for arcInvocationMode: 'plannedMini') is IDENTICAL to Full ARC's -- the exact same mantra, no Mini-specific text -- and the screen's own 'case \"free_breathing\":' render block contains no arcInvocationMode/mode branching of any kind, so Mini ARC is guaranteed to render the exact same FreeBreathingIntro JSX as every other pathway", () => {
  const miniState: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "plannedMini", currentStep: "free_breathing" };
  const miniContent = getStepContent(miniState);
  assert.equal(miniContent.primary, ARC_FREE_BREATHING_MANTRA);
  assert.deepEqual(miniContent.supporting, []);
  const fullState: NewArcLiveSessionState = { ...fresh(), currentStep: "free_breathing" };
  assert.deepEqual(getStepContent(miniState), getStepContent(fullState), "Mini and Full ARC must resolve byte-for-byte identical content for this shared step");

  const screenSource = readSource("live/NewArcLiveScreen.tsx");
  const caseIndex = screenSource.indexOf('case "free_breathing":');
  const caseBody = screenSource.slice(caseIndex, screenSource.indexOf("\n\n", caseIndex));
  assert.doesNotMatch(caseBody, /arcInvocationMode|mode ===|session!\.arcInvocationMode/, "the free_breathing render case must never branch on the session's own mode -- Mini ARC gets the exact same component/props as every other pathway");
});

// ---------------------------------------------------------------------------
// 5. The background expands to #F2FAFF.
// ---------------------------------------------------------------------------
test("5. The background expands to the exact, extremely-light, almost-white blue #F2FAFF once the breathing intro completes -- never a saturated/medium/dark blue", () => {
  assert.equal(ARC_FREE_BREATHING_BACKGROUND_COLOR, "#F2FAFF");
  const notYetShown: NewArcLiveSessionState = { ...fresh(), freeBreathingIntroShown: false };
  assert.equal(resolveArcBackgroundColor(notYetShown), null, "before the intro completes, the screen's own existing default background is used");
  const shown: NewArcLiveSessionState = { ...fresh(), freeBreathingIntroShown: true };
  assert.equal(resolveArcBackgroundColor(shown), "#F2FAFF");
});

// ---------------------------------------------------------------------------
// 6. The background remains #F2FAFF through all remaining stages.
// ---------------------------------------------------------------------------
test("6. The background remains the exact same #F2FAFF through every single remaining ARC stage -- resolveArcBackgroundColor is a pure function of freeBreathingIntroShown ALONE, never re-derived from (and therefore never able to drift across) currentStep", () => {
  for (const step of NEW_ARC_LIVE_STEP_ORDER) {
    const state: NewArcLiveSessionState = { ...fresh(), freeBreathingIntroShown: true, currentStep: step };
    assert.equal(resolveArcBackgroundColor(state), ARC_FREE_BREATHING_BACKGROUND_COLOR, `stage "${step}" must still show the persistent pale-blue background`);
  }
  for (const step of NEW_ARC_MINI_STEP_ORDER) {
    const state: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "plannedMini", freeBreathingIntroShown: true, currentStep: step };
    assert.equal(resolveArcBackgroundColor(state), ARC_FREE_BREATHING_BACKGROUND_COLOR, `Mini ARC stage "${step}" must still show the persistent pale-blue background`);
  }
});

// ---------------------------------------------------------------------------
// 7. Skipping the introduction still applies the background.
// ---------------------------------------------------------------------------
test("7. Skipping the introduction still applies the pale-blue background -- the screen's onSkip and onContinue both commit the exact same completeFreeBreathingIntro transition, so there is no 'declined' path that leaves the background off", () => {
  const state: NewArcLiveSessionState = { ...fresh(), currentStep: "free_breathing" };
  const afterSkip = completeFreeBreathingIntro(state, NOW);
  assert.equal(afterSkip.freeBreathingIntroShown, true, "skip must set the exact same flag continue does");
  assert.equal(resolveArcBackgroundColor(afterSkip), ARC_FREE_BREATHING_BACKGROUND_COLOR);
  const screenSource = readSource("live/NewArcLiveScreen.tsx");
  assert.match(
    screenSource,
    /onContinue=\{\(\) => commit\(completeFreeBreathingIntro\(session!, now\)\)\}\s*\n\s*onSkip=\{\(\) => commit\(completeFreeBreathingIntro\(session!, now\)\)\}/,
    "Continue and Skip must wire to the identical commit(completeFreeBreathingIntro(...)) call"
  );
});

// ---------------------------------------------------------------------------
// 8. The interactive body and central circle remain clearly visible.
// ---------------------------------------------------------------------------
test("8. The interactive body and central circle remain clearly visible for every stage that already showed them -- resolveShowBodyForStage and the circle's own growth/intensity tables are completely untouched by this task", () => {
  assert.equal(resolveShowBodyForStage("body_scan"), true);
  assert.equal(resolveShowBodyForStage("dwelling"), true);
  assert.equal(resolveShowBodyForStage("acceptance"), true);
  assert.equal(resolveShowBodyForStage("regulation"), true);
  assert.equal(resolveShowBodyForStage("encoding"), true);
  assert.equal(resolveShowBodyForStage("natural_breathing"), false, "the body still only appears from body-awareness onward, exactly as before this task");
  const screenSource = readSource("live/NewArcLiveScreen.tsx");
  assert.match(screenSource, /isFreeBreathingStage = session\.currentStep === "free_breathing"/, "free_breathing must be its own distinct flag, never merged into isBodyMantraStage's own circle-rendering condition");
  assert.doesNotMatch(screenSource, /isBodyMantraStage\s*=\s*\n?\s*[^;]*free_breathing/, "free_breathing must never be added to the body-mantra-circle condition itself");
});

// ---------------------------------------------------------------------------
// 9. Supportive blue is distinguishable from the background.
// ---------------------------------------------------------------------------
test("9. The animated supportive-blue body tiers remain clearly distinguishable from the #F2FAFF background -- every tier is a visibly darker/more saturated blue, never confusably close to the near-white background", () => {
  assert.notEqual(OPENING_ACCEPTANCE_COLOR, ARC_FREE_BREATHING_BACKGROUND_COLOR);
  assert.notEqual(OPENING_REGULATION_COLOR, ARC_FREE_BREATHING_BACKGROUND_COLOR);
  assert.notEqual(OPENING_ENCODING_COLOR, ARC_FREE_BREATHING_BACKGROUND_COLOR);
  // The background's own green/blue channels are both very close to 255
  // (almost white); every supportive tier must sit measurably lower on at
  // least one channel, which is exactly what makes it read as "blue" at all.
  const toRgb = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };
  const bg = toRgb(ARC_FREE_BREATHING_BACKGROUND_COLOR);
  for (const tier of [OPENING_ACCEPTANCE_COLOR, OPENING_REGULATION_COLOR, OPENING_ENCODING_COLOR]) {
    const c = toRgb(tier);
    assert.ok(c.r < bg.r, `${tier}'s red channel (${c.r}) must be visibly lower than the background's (${bg.r}) to stay distinguishable`);
  }
});

// ---------------------------------------------------------------------------
// 10. Encoding still animates the supportive blue across the body.
// ---------------------------------------------------------------------------
test("10. Encoding still animates the full supportive-blue spread across the body -- the opening-region color track and Encoding's own full (1.0) movement intensity are unchanged by this task", () => {
  assert.equal(ARC_BODY_STAGE_INTENSITY.encoding, 1, "Encoding must still reach full body movement intensity");
  const appearance = resolveBodyMantraShapeAppearance("palms", "right", {
    contractionRegions: [],
    closureRegions: [],
    openingRegions: [{ region: "palms", side: "right" }],
  });
  assert.equal(appearance.colorStops[3], OPENING_ENCODING_COLOR, "an opening region's own color track must still reach the vivid Encoding tier as its final stop");
  assert.ok(appearance.movementDef !== null, "an opening region must still carry a real movement definition for Encoding's own animation");
});

// ---------------------------------------------------------------------------
// 11. Interrupted ARC sessions restore correctly without replaying the intro.
// ---------------------------------------------------------------------------
test("11. An interrupted ARC session restores with freeBreathingIntroShown carried over verbatim from storage -- never forced back to false (which would wrongly replay the intro) and never defaulting a genuinely old, pre-this-task session to true (which would wrongly skip it)", () => {
  const storageSource = readSource("data/storage.ts");
  assert.match(
    storageSource,
    /freeBreathingIntroShown:\s*parsed\.freeBreathingIntroShown\s*\?\?\s*false/,
    "loadNewArcLiveSession must backfill freeBreathingIntroShown from the persisted value, defaulting only a pre-existing (undefined) session to false"
  );
  // The pure resolver itself never re-derives from currentStep, so a
  // session resumed mid-flight on any later step still shows the correct,
  // already-decided background with zero extra computation.
  const resumedMidFlight: NewArcLiveSessionState = { ...fresh(), currentStep: "regulation", freeBreathingIntroShown: true };
  assert.equal(resolveArcBackgroundColor(resumedMidFlight), ARC_FREE_BREATHING_BACKGROUND_COLOR, "a session resumed mid-flight must show the background without ever re-entering free_breathing");
});

// ---------------------------------------------------------------------------
// 12. Task LIVE timers and origin navigation are preserved.
// ---------------------------------------------------------------------------
test("12. Task LIVE timers and origin-based return navigation are preserved: isActiveTaskLiveOrigin and returnToTask are completely untouched by this task -- neither references free_breathing or freeBreathingIntroShown in any way", () => {
  const screenSource = readSource("live/NewArcLiveScreen.tsx");
  const returnToTaskMatch = screenSource.match(/async function returnToTask\(autoStart: boolean\) \{[\s\S]*?\n  \}/);
  assert.ok(returnToTaskMatch, "returnToTask must still exist, unchanged in shape");
  assert.doesNotMatch(returnToTaskMatch![0], /free_breathing|freeBreathingIntroShown/, "returnToTask must have no coupling at all to the free-breathing feature");
  assert.match(screenSource, /isActiveTaskLiveOrigin = !!taskTimerRun && taskTimerRun\.taskId === taskId/, "the Task LIVE origin detection itself must remain exactly as it was");
});

// ---------------------------------------------------------------------------
// 13. Morning psychology facts remain correctly gated.
// ---------------------------------------------------------------------------
test("13. The daily psychology fact overlay remains correctly gated away from any active ARC session: it is rendered only inside the separate morning DailyStartupSequenceOverlay, and neither that overlay, PsychologyFactLaunchOverlay, nor NewArcLiveScreen gained any new coupling between the two features", () => {
  const screenSource = readSource("live/NewArcLiveScreen.tsx");
  assert.doesNotMatch(screenSource, /PsychologyFactLaunchOverlay/, "NewArcLiveScreen must never itself render the psychology-fact overlay -- the two remain entirely separate screens, as before this task");
  const introSource = readSource("live/components/FreeBreathingIntro.tsx");
  assert.doesNotMatch(introSource, /PsychologyFactLaunchOverlay|psychologyFact/i, "the breathing intro component itself must have zero awareness of the psychology-fact feature");
  const startupOverlaySource = readSource("live/DailyStartupSequenceOverlay.tsx");
  assert.doesNotMatch(startupOverlaySource, /free_breathing|freeBreathingIntroShown/, "the morning startup overlay must remain untouched by this task -- its own existing ARC-active gating is unaffected");
});

// ---------------------------------------------------------------------------
// 14. No additional unnecessary screens appear.
// ---------------------------------------------------------------------------
test("14. free_breathing is exactly ONE screen, with no extra confirmation/instruction pages and no duplicate Skip control: it has exactly one sub-screen, is never registered in isStepSkippable (its own Continue/Skip buttons already cover that, so the screen's generic shared 'דלג' link never renders a second time), and goal_select->free_breathing is a direct, single hop with nothing in between", () => {
  const state: NewArcLiveSessionState = { ...fresh(), currentStep: "free_breathing" };
  assert.equal(stepSubCount("free_breathing", state), 1, "free_breathing must be a single page, never split into progressive sub-screens");
  assert.equal(isStepSkippable("free_breathing"), false, "free_breathing must not also register with the generic skip-link mechanism -- it already renders its own Continue/Skip actions");
  let afterGoal: NewArcLiveSessionState = { ...fresh() };
  afterGoal = setGoalType(afterGoal, "combined", NOW);
  assert.equal(afterGoal.currentStep, "free_breathing", "goal_select must advance directly to free_breathing with no intermediate screen");
  const progress = resolveProgress(afterGoal);
  assert.equal(progress.total > 0, true);
});
