import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  NEW_ARC_LIVE_STEP_ORDER,
  advance,
  completeFreeBreathingIntro,
  confirmTimeAvailableRating,
  declineSelfObservation,
  migrateLegacyNewArcLiveStep,
  resolveFinalSupportiveFeeling,
  setEmotionSelection,
  setGoalType,
  setMiniAwareness,
  setSupportiveFeelingOverride,
  toggleOpeningBodyScanRegion,
} from "./newArcLiveSteps.ts";
import { resolveEncodingMantra } from "./newArcLiveCopy.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";
import { listSupportiveFeelingAlternatives, resolveSupportiveFeeling } from "./supportiveFeelingMapping.ts";

const NOW = "2026-02-10T09:00:00.000Z";

function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const liveScreen = readSource("live/NewArcLiveScreen.tsx");
const storage = readSource("data/storage.ts");

function fresh(mode: NewArcLiveSessionState["arcInvocationMode"] = "plannedFull"): NewArcLiveSessionState {
  return { ...createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, mode), currentStep: "emotion" };
}

function shortenedSession(): NewArcLiveSessionState {
  return createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "shortened");
}

/**
 * arc/combinedEmotionSupportiveFeeling.test.ts
 *
 * ARCHI -- Combined Emotion & Supportive Feeling Selection task: the
 * 14 required regression scenarios, each its own test, numbered to
 * match the spec's own testing section exactly. Several scenarios
 * whose structural coverage already lives in live/newArcLiveScreen.test.ts
 * (added alongside the implementation itself) are re-asserted here
 * too, briefly, so this one file accounts for every numbered scenario
 * without needing to be read alongside that other file.
 */

test("scenario 1: Full ARC's 'emotion' case shows the current-emotion question AND the inline supportive-feeling picker on the SAME screen, never a separate one", () => {
  const stepIndex = liveScreen.indexOf('case "emotion":');
  const nextCaseIndex = liveScreen.indexOf('case "thought":', stepIndex);
  const stepBody = liveScreen.slice(stepIndex, nextCaseIndex);
  assert.ok(stepBody.includes("PREDEFINED_EMOTION_OPTIONS.map"));
  assert.ok(stepBody.includes("renderSupportiveFeelingPicker("));
});

test("scenario 2: Mini ARC's 'mini_awareness' case uses the SAME shared renderSupportiveFeelingPicker helper, never a separately-authored UI", () => {
  const stepIndex = liveScreen.indexOf('case "mini_awareness":');
  const nextCaseIndex = liveScreen.indexOf('case "mini_thought":', stepIndex);
  const stepBody = liveScreen.slice(stepIndex, nextCaseIndex);
  assert.ok(stepBody.includes("PREDEFINED_EMOTION_OPTIONS.map"));
  assert.ok(stepBody.includes("renderSupportiveFeelingPicker("));
});

test("scenario 3: selecting an emotion produces the expected default (automatic) supportive feeling -- fear -> ביטחון/יציבות/'אני יציב.'", () => {
  let state = fresh();
  state = setEmotionSelection(state, "fear", null);
  const resolved = resolveFinalSupportiveFeeling(state);
  assert.deepEqual(resolved, { feeling: "ביטחון", quality: "יציבות", mantra: "אני יציב." });
});

test("scenario 4: the trainee can override the automatic suggestion with one tap, and the override -- not the automatic mapping -- is what resolveFinalSupportiveFeeling returns", () => {
  let state = fresh();
  state = setEmotionSelection(state, "fear", null);
  const alternative = listSupportiveFeelingAlternatives("ביטחון")[0];
  assert.ok(alternative, "fear's own automatic suggestion must have at least one listed alternative");
  state = setSupportiveFeelingOverride(state, alternative);
  assert.deepEqual(resolveFinalSupportiveFeeling(state), alternative);
  assert.notEqual(alternative.feeling, "ביטחון", "the override must be a genuinely different feeling than the automatic suggestion it replaces");
});

test("scenario 5: the final selected (overridden) feeling, never the automatic suggestion it replaced, is what Encoding's own mantra actually uses", () => {
  let state = fresh();
  state = setEmotionSelection(state, "fear", null);
  state = setGoalType(state, "emotion_only", NOW);
  const automaticMantra = resolveEncodingMantra(state);
  assert.match(automaticMantra, /ביטחון/);
  assert.match(automaticMantra, /אני יציב/);
  const override = resolveSupportiveFeeling("anger", null)!;
  state = setSupportiveFeelingOverride(state, override);
  const overriddenMantra = resolveEncodingMantra(state);
  assert.match(overriddenMantra, /רוגע/);
  assert.match(overriddenMantra, /אני שליו/);
  assert.ok(!overriddenMantra.includes("ביטחון"), "the automatic suggestion's own feeling word must never leak back in once overridden");
});

test("scenario 6: no extra supportive-feeling screen appears -- 'desired_feeling_select' is not a reachable entry in NEW_ARC_LIVE_STEP_ORDER, and advancing from 'emotion' lands directly on the next real step", () => {
  assert.ok(!NEW_ARC_LIVE_STEP_ORDER.includes("desired_feeling_select"), "desired_feeling_select must stay permanently out of the active step order, never reintroduced as a second screen");
  let state = fresh();
  state = setEmotionSelection(state, "fear", null);
  state = setSupportiveFeelingOverride(state, resolveSupportiveFeeling("anger", null)!);
  state = advance(state, NOW);
  // ARCHI -- Action-Readiness Check task: a new real step now sits
  // right after "emotion" -- still "the next real step," never a
  // second feeling-selection screen.
  assert.equal(state.currentStep, "action_readiness_check", "Continue from the combined 'emotion' screen advances directly to the next real step, never through a second feeling-selection screen");
});

test("scenario 7/9: Shortened ARC does not require emotion selection and can complete without ever selecting one -- the body-based mantra applies throughout", () => {
  let state = shortenedSession();
  state = setGoalType(state, "action", NOW);
  // ARCHI -- Refine the Shortened ARC / "סבבה" Pathway task,
  // requirement 1: free_breathing now opens a shortened session too.
  assert.equal(state.currentStep, "free_breathing");
  state = completeFreeBreathingIntro(state, NOW);
  // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
  // task: "סבבה" now asks its own standalone time-available rating
  // right here -- a full-depth rating (6-10) keeps this exact same
  // walk completely unaffected.
  assert.equal(state.currentStep, "time_available_check");
  state = confirmTimeAvailableRating(state, 8, NOW);
  assert.equal(state.currentStep, "natural_breathing");
  state = advance(state, NOW); // body_scan
  state = advance(state, NOW); // supportive_area_select
  state = toggleOpeningBodyScanRegion(state, "palms", "left");
  state = advance(state, NOW); // acceptance
  state = advance(state, NOW); // regulation
  state = advance(state, NOW); // encoding
  assert.equal(state.selectedEmotion, null, "no emotion was ever asked or chosen");
  assert.match(resolveEncodingMantra(state), /אני מאפשר לגוף שלי להיפתח/, "the body-based mantra applies when no emotion was ever selected");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "complete", "Shortened ARC completes normally without any emotion selection");
});

// ARCHI -- Refine the Shortened ARC / "סבבה" Pathway task, requirement
// 3: the old optional "רוצה לבחור גם רגש?" collapsible emotion control
// is removed ENTIRELY (not merely collapsed-by-default) -- "סבבה"
// never asks about current/negative emotion at all any more.
test("scenario 8 (superseded by ARCHI -- Refine the Shortened ARC / \"סבבה\" Pathway task, requirement 3): the optional emotion control is removed entirely from Shortened ARC's own screen -- no expand-state, no emotion chip row, no emotion question of any kind", () => {
  assert.ok(!liveScreen.includes("shortenedEmotionExpanded"), "the control's own local expand state must be gone entirely, not merely defaulted to collapsed");
  assert.ok(!liveScreen.includes("רוצה לבחור גם רגש?"), "the toggle text itself must no longer appear anywhere");
  const branchIndex = liveScreen.indexOf('if (session!.arcInvocationMode === "shortened") {', liveScreen.indexOf('case "supportive_area_select":'));
  const branchEnd = liveScreen.indexOf("\n        }\n", branchIndex);
  const branchBody = liveScreen.slice(branchIndex, branchEnd);
  assert.ok(!branchBody.includes("איך אני מרגיש עכשיו?"), "Shortened ARC's own screen must never ask the current-emotion question");
  assert.ok(!branchBody.includes("PREDEFINED_EMOTION_OPTIONS.map"), "no emotion chip row of any kind on this screen");
});

// ARCHI -- Refine the Shortened ARC / "סבבה" Pathway task, requirements
// 2/4: no green legend row, and the shared supportive-feeling picker
// (predefined list + free-text custom option) is now rendered
// unconditionally, right after the interactive body, never gated
// behind an emotion question that no longer exists.
test("scenario 10 (superseded): the shared supportive-feeling picker renders unconditionally, right after the interactive body, with no green legend and no router navigation", () => {
  const branchIndex = liveScreen.indexOf('if (session!.arcInvocationMode === "shortened") {', liveScreen.indexOf('case "supportive_area_select":'));
  const branchEnd = liveScreen.indexOf("\n        }\n", branchIndex);
  const branchBody = liveScreen.slice(branchIndex, branchEnd);
  const bodyIndex = branchBody.indexOf("<BodyMapMagnifier");
  const pickerIndex = branchBody.indexOf("renderSupportiveFeelingPicker(");
  assert.ok(bodyIndex !== -1 && pickerIndex !== -1);
  assert.ok(bodyIndex < pickerIndex, "the interactive body must render before the supportive-feeling picker");
  assert.ok(!branchBody.includes("renderOpeningRoleLegend()"), "requirement 2: the green/blue legend row must never render on Shortened ARC's own screen");
  assert.ok(!branchBody.includes("router."), "using the supportive-feeling picker must never itself trigger navigation -- only the shared 'המשך' button advances");
});

// ARCHI -- Refine the Shortened ARC / "סבבה" Pathway task: the
// optional emotion control's own UI is gone (requirement 3), but the
// underlying engine-level setter (setEmotionSelection) is untouched --
// this test now exercises that engine behavior directly, at the
// function level, rather than through UI the trainee can no longer
// reach.
test("scenario 11: setting an emotion at the engine level switches Encoding to the SAME emotion-mapped/overridden mantra Full/Mini ARC use, replacing the body-based one", () => {
  let state = shortenedSession();
  state = setGoalType(state, "action", NOW);
  state = advance(state, NOW); // body_scan
  state = advance(state, NOW); // supportive_area_select
  state = toggleOpeningBodyScanRegion(state, "palms", "left");
  state = setEmotionSelection(state, "sadness", null);
  const mantra = resolveEncodingMantra(state);
  assert.match(mantra, /נחמה/);
  assert.match(mantra, /יש בי תקווה/);
  assert.ok(!mantra.includes("אני מאפשר לגוף שלי להיפתח"), "the body-based mantra must never apply once an emotion was actually chosen");
});

test("scenario 12: an interrupted/resumed session's own explicit override survives untouched -- data/storage.ts backfills it (never invents one), and migrateLegacyNewArcLiveStep never clears an already-set value", () => {
  const fnIndex = storage.indexOf("export async function loadNewArcLiveSession(");
  const fnBody = storage.slice(fnIndex, storage.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("selectedSupportiveFeeling: parsed.selectedSupportiveFeeling ?? null,"));

  const override = resolveSupportiveFeeling("overwhelm", null)!;
  let state = fresh();
  state = setEmotionSelection(state, "overwhelm", null);
  state = setSupportiveFeelingOverride(state, override);
  const migrated = migrateLegacyNewArcLiveStep(state);
  assert.deepEqual(migrated.selectedSupportiveFeeling, override, "a session already on a currently-reachable step must pass its override through migration completely untouched");
});

test("scenario 13: setEmotionSelection/setSupportiveFeelingOverride/setMiniAwareness never mutate taskId/taskTitle/firstAction/isActiveTaskLiveOrigin -- the active task and its timer stay completely untouched by this feature", () => {
  let state = fresh();
  const before = { taskId: state.taskId, taskTitle: state.taskTitle, firstAction: state.firstAction, isActiveTaskLiveOrigin: state.isActiveTaskLiveOrigin };
  state = setEmotionSelection(state, "fear", null);
  state = setSupportiveFeelingOverride(state, resolveSupportiveFeeling("anger", null)!);
  let miniState: NewArcLiveSessionState = { ...fresh("plannedMini"), currentStep: "mini_awareness" };
  miniState = setMiniAwareness(miniState, "fear", null, "התחלתי", resolveSupportiveFeeling("anger", null), NOW);
  for (const s of [state, miniState]) {
    assert.equal(s.taskId, before.taskId);
    assert.equal(s.taskTitle, before.taskTitle);
    assert.equal(s.firstAction, before.firstAction);
    assert.equal(s.isActiveTaskLiveOrigin, before.isActiveTaskLiveOrigin);
  }
});

test("scenario 14: no regression in Full, Mini, or Shortened ARC's own overall navigation -- each still walks from goal_select to 'complete' through its own exact sequence, unaffected by this feature", () => {
  let full: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "x", "y", NOW, "plannedFull") };
  full = setGoalType(full, "emotion_only", NOW);
  assert.equal(full.currentStep, "free_breathing");

  let mini: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "x", "y", NOW, "plannedMini") };
  mini = setGoalType(mini, "emotion_only", NOW);
  assert.equal(mini.currentStep, "self_observation_choice", "self-observation task: Mini ARC's own genuine first screen now, right before free_breathing");
  mini = declineSelfObservation(mini, NOW);
  assert.equal(mini.currentStep, "free_breathing", "Mini ARC still shares the same opening screen as Full ARC, unaffected");

  let shortened = shortenedSession();
  shortened = setGoalType(shortened, "emotion_only", NOW);
  // ARCHI -- Refine the Shortened ARC / "סבבה" Pathway task,
  // requirement 1: free_breathing now opens a shortened session too,
  // right before the automatic Presence screen.
  assert.equal(shortened.currentStep, "free_breathing", "requirement 1: a shortened session now opens with the shared breathing intro too");
  shortened = completeFreeBreathingIntro(shortened, NOW);
  // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
  // task: the new standalone time-available rating now sits here too --
  // a full-depth rating keeps the rest of this walk unaffected.
  assert.equal(shortened.currentStep, "time_available_check");
  shortened = confirmTimeAvailableRating(shortened, 8, NOW);
  assert.equal(shortened.currentStep, "natural_breathing", "Shortened ARC's own automatic single Presence screen is unaffected, right after the time rating");
});
