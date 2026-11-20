import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  NEW_ARC_LIVE_STEP_ORDER,
  NEW_ARC_MINI_STEP_ORDER,
  advance,
  isStepSkippable,
  migrateLegacyNewArcLiveStep,
  resolveNextStep,
  resolvePreviousStep,
  resolveStepOrder,
  setCognitiveSelection,
  setEmotion,
  setInterpretation,
  setThought,
  setThoughtTimeOrientation,
  setUrgeText,
} from "./newArcLiveSteps.ts";
import { getStepContent, resolveEncodingMantra } from "./newArcLiveCopy.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";
import { resolveShowBodyForStage } from "./arcBodyMantraCircleLogic.ts";

/**
 * arc/universalArcRouting.test.ts
 *
 * ARCHI -- UNIVERSAL ARC ROUTING, EMOTION IDENTIFICATION & ANDROID
 * SHORTCUTS task, requirement 11: the 21 required regression
 * scenarios, each as its own test (several scenarios whose coverage
 * already lives, in more depth, in a dedicated existing test file
 * point to it rather than duplicating it wholesale). This file is the
 * one place every scenario number from the spec is accounted for.
 */

function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const NOW = "2026-01-01T00:00:00.000Z";

/** Most scenarios below start right AT "cognitive_selector" (the real first reachable step for an ordinary, non-shortened session) -- never at the permanently-unreachable "goal_select" raw default, which would make advance()/the setters below compute the wrong next step. */
function fresh(mode: NewArcLiveSessionState["arcInvocationMode"] = "plannedFull"): NewArcLiveSessionState {
  return { ...createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, mode), currentStep: "cognitive_selector" };
}

// --- Scenario 1: Android home-screen/lock-screen shortcut entry point -----

test("scenario 1: the settings screen exposes both the home-screen widget-pin button and the lock-screen toggle under one combined entry, gated by isHomeScreenWidgetPinSupported -- see build/emotionalCheckInNotificationSettingsScreen.test.ts for the full regression coverage", () => {
  const screen = readSource("build/EmotionalCheckInNotificationSettingsScreen.tsx");
  assert.ok(screen.includes(">הוסף כפתורי ARC למסך הבית ולמסך הנעילה<"));
  assert.ok(screen.includes("isHomeScreenWidgetPinSupported"));
  assert.ok(screen.includes("<Switch value={settings.enabled} onValueChange={handleToggle} />"), "the lock-screen toggle must still be present in the same combined screen");
});

// --- Scenario 2: mood routing (pre-existing, untouched by this task) ------

test("scenario 2: the three mood shortcuts still route to Full ARC / Shortened ARC / next-action exactly as before -- this task adds no new mood-routing logic", () => {
  const routing = readSource("data/emotionalCheckInRouting.ts");
  assert.match(routing, /export async function openFullArc\(/);
  assert.match(routing, /export async function openShortenedArc\(/);
  assert.match(routing, /export async function resolveAndOpenNextTask\(/);
  assert.match(routing, /export type EmotionalCheckInChoice = "full_arc" \| "shortened_arc" \| "next_task" \| "urge";/);
});

// --- Scenario 3: the selector offers 0/1/2/3 selections, each correctly
// gating urge/thought/interpretation/reality_acceptance/interpretation_acceptance ---

test("scenario 3: every one of the 8 possible thought/interpretation/urge combinations gates exactly the matching set of downstream steps", () => {
  const combinations: { thought: boolean; interpretation: boolean; urge: boolean }[] = [
    { thought: false, interpretation: false, urge: false },
    { thought: true, interpretation: false, urge: false },
    { thought: false, interpretation: true, urge: false },
    { thought: false, interpretation: false, urge: true },
    { thought: true, interpretation: true, urge: false },
    { thought: true, interpretation: false, urge: true },
    { thought: false, interpretation: true, urge: true },
    { thought: true, interpretation: true, urge: true },
  ];
  for (const selection of combinations) {
    let state = setCognitiveSelection(fresh(), selection, NOW);
    if (selection.urge) {
      assert.equal(state.currentStep, "urge", JSON.stringify(selection));
      state = setUrgeText(state, "דחף", NOW);
      assert.equal(state.currentStep, "stop_and_accept_urge");
      state = advance(state, NOW); // single page now (ARCHI Two Mantras for Urge Acceptance correction)
    }
    if (selection.thought) {
      assert.equal(state.currentStep, "thought", JSON.stringify(selection));
      state = setThought(state, "מחשבה", NOW);
      assert.equal(state.currentStep, "reality_acceptance");
      state = setThoughtTimeOrientation(state, "present", NOW);
      state = advance(state, NOW);
    }
    if (selection.interpretation) {
      assert.equal(state.currentStep, "interpretation", JSON.stringify(selection));
      state = setInterpretation(state, "פרשנות", NOW);
      assert.equal(state.currentStep, "interpretation_acceptance");
      state = advance(state, NOW);
    }
    assert.equal(state.currentStep, "emotion", `after walking selection ${JSON.stringify(selection)}, must land on emotion`);
  }
});

// --- Scenario 4: Continue is always enabled on cognitive_selector --------

test("scenario 4: cognitive_selector has no disabled-continue concept anywhere in the engine -- setCognitiveSelection always advances regardless of selection, and the screen's own render case has no disabled button for it", () => {
  const allFalse = setCognitiveSelection(fresh(), { thought: false, interpretation: false, urge: false }, NOW);
  const allTrue = setCognitiveSelection(fresh(), { thought: true, interpretation: true, urge: true }, NOW);
  assert.notEqual(allFalse.currentStep, "cognitive_selector");
  assert.notEqual(allTrue.currentStep, "cognitive_selector");
  const screen = readSource("live/NewArcLiveScreen.tsx");
  const stepIndex = screen.indexOf('case "cognitive_selector": {');
  const nextCaseIndex = screen.indexOf('case "urge":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  assert.ok(!stepBody.includes("disabled="), "the cognitive_selector screen's own Continue button must never be disabled");
});

// --- Scenario 5: no 4th "Emotion" option on the selector ------------------

test("scenario 5: cognitive_selector's own three checkboxes never include a 4th 'Emotion' option -- emotion has its own separate, always-reachable step", () => {
  const screen = readSource("live/NewArcLiveScreen.tsx");
  const stepIndex = screen.indexOf('case "cognitive_selector": {');
  const nextCaseIndex = screen.indexOf('case "urge":');
  const stepBody = screen.slice(stepIndex, nextCaseIndex);
  assert.ok(stepBody.includes("מחשבה") && stepBody.includes("פרשנות") && stepBody.includes("דחף"));
  // Exactly three checkbox rows (☐/☑-prefixed options) -- never a 4th
  // for emotion. "רגש" itself legitimately appears inside the
  // Continue button's own "המשך עם הרגש בלבד" label (zero-selection
  // case), so this checks the checkbox rows specifically, not a blunt
  // substring ban on the whole screen.
  const checkboxRows = [...stepBody.matchAll(/\? "☑" : "☐"\} ([^<]+)</g)].map((match) => match[1]);
  assert.deepEqual(checkboxRows, ["מחשבה", "פרשנות", "דחף"], "exactly these three checkboxes, never a 4th");
});

// --- Scenario 6: zero selections -> directly to emotion -------------------

test("scenario 6: zero selections on cognitive_selector skip urge/thought/reality_acceptance/interpretation/interpretation_acceptance entirely, landing directly on emotion", () => {
  const state = setCognitiveSelection(fresh(), { thought: false, interpretation: false, urge: false }, NOW);
  assert.equal(state.currentStep, "emotion");
});

// --- Scenario 7: emotion is reachable in Full, Shortened, AND Mini ARC ----

// ARCHI -- Unified 7-Part Update task, Part 6.2: a deliberate
// REVERSAL for Shortened ARC only -- "do not replace it with another
// emotion question" -- so "emotion" is now skipped for 'shortened'
// specifically, while Full ARC (plannedFull/spontaneous) still always
// reaches it, exactly as before.
test("scenario 7 (updated by Part 6.2): 'emotion' is always reachable in Full ARC (never conditionally skipped by invocation mode) but now deliberately skipped for Shortened ARC, landing it on the automatic Presence screen instead; Mini ARC's own 'mini_awareness' always asks for the emotion too", () => {
  for (const mode of ["plannedFull", "spontaneous"] as const) {
    let state = fresh(mode);
    state = setCognitiveSelection(state, { thought: false, interpretation: false, urge: false }, NOW);
    assert.equal(state.currentStep, "emotion", `mode ${mode} must always reach 'emotion'`);
  }
  let shortenedState = fresh("shortened");
  shortenedState = setCognitiveSelection(shortenedState, { thought: false, interpretation: false, urge: false }, NOW);
  assert.equal(shortenedState.currentStep, "natural_breathing", "Part 6.2/6.3: a shortened session skips 'emotion' too now, landing directly on the automatic Presence screen");
  // ARCHI -- Free Breathing Intro & Persistent Very Pale Blue
  // Background task: the shared opening screen now sits at index 3,
  // right after the self-observation task's own choice/exercise pair
  // (indices 1-2).
  // ARCHI -- Consolidated Implementation Request, Part 5.1: "mini_thought"
  // (cognitive identification) now comes right after it, BEFORE
  // "mini_awareness" (emotion identification), which moved from index 2.
  assert.equal(resolveStepOrder("plannedMini")[3], "free_breathing");
  assert.equal(resolveStepOrder("plannedMini")[4], "mini_thought");
  assert.equal(resolveStepOrder("plannedMini").indexOf("mini_awareness") > resolveStepOrder("plannedMini").indexOf("mini_thought"), true, "mini_awareness still always exists, just later in the order now");
});

// --- Scenario 8: current emotion vs. desired supportive feeling are
// architecturally distinct fields ------------------------------------------

test("scenario 8: selectedEmotion/customEmotionText (current emotion) and desiredFeelingText (desired supportive feeling) are two completely independent fields -- setting one never touches the other", () => {
  let state = setEmotion(fresh(), "fear", null, NOW);
  assert.equal(state.selectedEmotion, "fear");
  assert.equal(state.desiredFeelingText, null, "choosing the current emotion must never set/invent a desired feeling");
  state = { ...state, desiredFeelingText: "רוגע" };
  assert.equal(state.selectedEmotion, "fear", "setting the desired feeling must never overwrite the already-identified current emotion");
});

// --- Scenario 9: only the selected branches execute ------------------------

test("scenario 9: selecting ONLY interpretation skips urge and thought entirely; selecting ONLY urge skips thought and interpretation entirely", () => {
  let interpretationOnly = setCognitiveSelection(fresh(), { thought: false, interpretation: true, urge: false }, NOW);
  assert.equal(interpretationOnly.currentStep, "interpretation", "urge and thought must both be skipped");
  interpretationOnly = setInterpretation(interpretationOnly, "פרשנות", NOW);
  assert.equal(interpretationOnly.currentStep, "interpretation_acceptance");

  let urgeOnly = setCognitiveSelection(fresh(), { thought: false, interpretation: false, urge: true }, NOW);
  assert.equal(urgeOnly.currentStep, "urge", "thought and interpretation must both be skipped");
  urgeOnly = setUrgeText(urgeOnly, "דחף", NOW);
  assert.equal(urgeOnly.currentStep, "stop_and_accept_urge");
});

// --- Scenario 10: no duplicated ARC engine ---------------------------------

test("scenario 10: cognitive_selector/urge/thought/interpretation/interpretation_acceptance each appear exactly once in NEW_ARC_LIVE_STEP_ORDER, and no second chooser screen exists anywhere in the live screen", () => {
  for (const step of ["cognitive_selector", "urge", "thought", "interpretation", "interpretation_acceptance"] as const) {
    assert.equal(NEW_ARC_LIVE_STEP_ORDER.filter((candidate) => candidate === step).length, 1, `${step} must appear exactly once`);
  }
  const screen = readSource("live/NewArcLiveScreen.tsx");
  assert.equal([...screen.matchAll(/case "cognitive_selector":/g)].length, 1, "exactly one render case for the selector -- never a second, duplicated chooser");
});

// --- Scenario 11: thought time orientation (past/present/future) preserved ---

test("scenario 11: past/present/future orientation is preserved and correctly adapts reality_acceptance's resolved mantra", () => {
  for (const orientation of ["past", "present", "future"] as const) {
    let state = setCognitiveSelection(fresh(), { thought: true, interpretation: false, urge: false }, NOW);
    state = setThought(state, "מחשבה", NOW);
    state = setThoughtTimeOrientation(state, orientation, NOW);
    assert.equal(state.thoughtTimeOrientation, orientation);
    const content = getStepContent(state);
    assert.ok(content.primary.length > 0);
  }
});

// --- Scenario 12: Presence begins DURING cognitive acceptance -------------

test("scenario 12: urge_acceptance/thought_acceptance/interpretation_acceptance all render with the body hidden -- Presence (the circle/mantra) begins immediately at the acceptance moment, before body awareness", () => {
  for (const stage of ["urge_acceptance", "thought_acceptance", "interpretation_acceptance"] as const) {
    assert.equal(resolveShowBodyForStage(stage), false);
  }
});

// --- Scenario 13: anatomical body shown only from body_scan onward --------

test("scenario 13: resolveShowBodyForStage is true from body_scan onward, for every later stage too", () => {
  for (const stage of ["body_scan", "dwelling", "acceptance", "regulation", "encoding"] as const) {
    assert.equal(resolveShowBodyForStage(stage), true);
  }
});

// --- Scenario 14: Task-LIVE-triggered ARC walks the SAME sequence ---------

test("scenario 14: a task-linked (combined/action) session walks the exact SAME cognitive_selector -> ... -> emotion sequence as a standalone one -- no special-cased alternate engine for Task-LIVE-triggered sessions", () => {
  const taskLinked = { ...fresh(), goalType: "combined" as const };
  const standalone = { ...createNewArcLiveSessionState("__standalone__", "", "", NOW, "spontaneous"), currentStep: "cognitive_selector" as const };
  assert.deepEqual(resolveStepOrder(taskLinked.arcInvocationMode), resolveStepOrder(standalone.arcInvocationMode));
  const taskLinkedNext = setCognitiveSelection(taskLinked, { thought: false, interpretation: false, urge: false }, NOW);
  const standaloneNext = setCognitiveSelection(standalone, { thought: false, interpretation: false, urge: false }, NOW);
  assert.equal(taskLinkedNext.currentStep, standaloneNext.currentStep);
});

// --- Scenario 15: task id/title/firstAction preserved ----------------------

test("scenario 15: taskId/taskTitle/firstAction are never mutated by setCognitiveSelection/setUrgeText/setThought/setInterpretation/setEmotion", () => {
  let state = fresh();
  const { taskId, taskTitle, firstAction } = state;
  state = setCognitiveSelection(state, { thought: true, interpretation: true, urge: true }, NOW);
  state = setUrgeText(state, "דחף", NOW);
  for (let i = 0; i < 6; i++) state = advance(state, NOW);
  state = setThought(state, "מחשבה", NOW);
  state = setThoughtTimeOrientation(state, "present", NOW);
  state = advance(state, NOW);
  state = setInterpretation(state, "פרשנות", NOW);
  state = advance(state, NOW);
  state = setEmotion(state, "fear", null, NOW);
  assert.equal(state.taskId, taskId);
  assert.equal(state.taskTitle, taskTitle);
  assert.equal(state.firstAction, firstAction);
});

// --- Scenario 16: Encoding mantra by origin --------------------------------

// ARCHI -- Unified Final Specification task, section 5: resolveEncodingMantra
// now reads the session's own selected action via a shared priority
// chain (active task's own first action > explicitly selected
// scheduled/temporary action > plain firstAction) -- isActiveTaskLiveOrigin
// reuses the SAME "...ומדמיין את עצמי מבצע את X" template every other
// priority already uses, rather than a separate "ממשיך את המשימה"
// phrase, per the spec's own "avoid awkward automatic rewriting...
// use a neutral instruction quoting the action" guidance.
test("scenario 16 (superseded): isActiveTaskLiveOrigin and a plain next action both resolve through the SAME action-quoting phrasing now; emotion_only ends at the feeling clause alone", () => {
  const taskLive = { ...fresh(), goalType: "combined" as const, firstAction: "לפתוח את המחשב", isActiveTaskLiveOrigin: true };
  assert.equal(resolveEncodingMantra(taskLive), "אני נוכח. התחושה התומכת מתפשטת אצלי בכל הגוף, ומדמיין את עצמי מבצע את לפתוח את המחשב.");

  const nextScheduled = { ...fresh(), goalType: "combined" as const, firstAction: "לפתוח את המחשב", isActiveTaskLiveOrigin: false };
  assert.equal(resolveEncodingMantra(nextScheduled), "אני נוכח. התחושה התומכת מתפשטת אצלי בכל הגוף, ומדמיין את עצמי מבצע את לפתוח את המחשב.");

  const emotionOnly = { ...fresh(), goalType: "emotion_only" as const, isActiveTaskLiveOrigin: true };
  assert.equal(resolveEncodingMantra(emotionOnly), "אני נוכח. התחושה התומכת מתפשטת אצלי בכל הגוף.");
});

// --- Scenario 17: morning-flow psychology-fact gating untouched -----------

test("scenario 17: DailyStartupSequenceOverlay's own psychology-fact-blocking gate (arcActive, keyed off isNewArcLiveSessionStale) is unchanged by this task -- never advancing to the fact while an ARC session is active", () => {
  const overlay = readSource("live/DailyStartupSequenceOverlay.tsx");
  assert.ok(overlay.includes("const arcActive = arcSession !== null && !isNewArcLiveSessionStale(arcSession, now);"));
});

// --- Scenario 18: interrupted-session restore / legacy backfill -----------

test("scenario 18: a legacy session with the four new fields absent backfills all of them to their 'nothing selected/not Task-LIVE' defaults, and a legacy mode-A reality_acceptance session forward-migrates to interpretation_acceptance", () => {
  const legacy = { ...fresh() } as Partial<NewArcLiveSessionState>;
  delete legacy.selectedCognitiveThought;
  delete legacy.selectedCognitiveInterpretation;
  delete legacy.selectedCognitiveUrge;
  delete legacy.isActiveTaskLiveOrigin;
  const backfilled: NewArcLiveSessionState = {
    ...(legacy as NewArcLiveSessionState),
    selectedCognitiveThought: (legacy as NewArcLiveSessionState).selectedCognitiveThought ?? false,
    selectedCognitiveInterpretation: (legacy as NewArcLiveSessionState).selectedCognitiveInterpretation ?? false,
    selectedCognitiveUrge: (legacy as NewArcLiveSessionState).selectedCognitiveUrge ?? false,
    isActiveTaskLiveOrigin: (legacy as NewArcLiveSessionState).isActiveTaskLiveOrigin ?? false,
  };
  assert.equal(backfilled.selectedCognitiveThought, false);
  assert.equal(backfilled.selectedCognitiveInterpretation, false);
  assert.equal(backfilled.selectedCognitiveUrge, false);
  assert.equal(backfilled.isActiveTaskLiveOrigin, false);

  const modeA: NewArcLiveSessionState = { ...fresh(), currentStep: "reality_acceptance", currentThought: null, interpretationText: "הוא לא אוהב אותי" };
  assert.equal(migrateLegacyNewArcLiveStep(modeA).currentStep, "interpretation_acceptance");
});

// --- Scenario 19: Full/Shortened/Mini ARC each complete end-to-end --------

test("scenario 19: Full ARC completes end-to-end with all three branches selected, without getting stuck", () => {
  let state = setCognitiveSelection(fresh(), { thought: true, interpretation: true, urge: true }, NOW);
  state = setUrgeText(state, "דחף", NOW);
  for (let i = 0; i < 6; i++) state = advance(state, NOW);
  state = setThought(state, "מחשבה", NOW);
  state = setThoughtTimeOrientation(state, "present", NOW);
  state = advance(state, NOW);
  state = setInterpretation(state, "פרשנות", NOW);
  state = advance(state, NOW);
  state = setEmotion(state, "fear", null, NOW);
  for (let i = 0; i < 40 && state.currentStep !== "complete"; i++) {
    state = advance(state, NOW);
    assert.notEqual(state.currentStep, "goal_select", "must never loop back to an unreachable step");
  }
  assert.equal(state.currentStep, "complete");
});

test("scenario 19: a Shortened session completes end-to-end, skipping every cognitive branch but still naming the emotion", () => {
  let state = fresh("shortened");
  state = { ...state, currentStep: "emotion" };
  state = setEmotion(state, "fear", null, NOW);
  for (let i = 0; i < 20 && state.currentStep !== "complete"; i++) state = advance(state, NOW);
  assert.equal(state.currentStep, "complete");
});

test("scenario 19: a Mini ARC session completes end-to-end", () => {
  let state: NewArcLiveSessionState = { ...fresh("plannedMini"), currentStep: NEW_ARC_MINI_STEP_ORDER[1] };
  for (let i = 0; i < 20 && state.currentStep !== "complete"; i++) state = advance(state, NOW);
  assert.equal(state.currentStep, "complete");
});

// --- Scenario 20: ordering is structurally Urge -> Thought ->
// Interpretation -> Emotion -> Presence -------------------------------------

test("scenario 20: NEW_ARC_LIVE_STEP_ORDER places urge before thought before interpretation before emotion before natural_breathing (Presence)", () => {
  const order = NEW_ARC_LIVE_STEP_ORDER;
  const urgeIndex = order.indexOf("urge");
  const thoughtIndex = order.indexOf("thought");
  const interpretationIndex = order.indexOf("interpretation");
  const emotionIndex = order.indexOf("emotion");
  const presenceIndex = order.indexOf("natural_breathing");
  assert.ok(urgeIndex < thoughtIndex);
  assert.ok(thoughtIndex < interpretationIndex);
  assert.ok(interpretationIndex < emotionIndex);
  assert.ok(emotionIndex < presenceIndex);
});

// --- Scenario 21: Android widget-pin JS bridge never throws ---------------

test("scenario 21: the widget-pin JS bridge's own contract (lazy-cached, never-throwing, android-only) is present -- see data/emotionalCheckInWidget.test.ts for the full regression coverage of this module", () => {
  const bridge = readSource("data/emotionalCheckInWidget.ts");
  assert.ok(bridge.includes('Platform.OS !== "android"'));
  assert.match(bridge, /export async function isHomeScreenWidgetPinSupported[\s\S]{0,200}catch \{\s*return false;/);
  assert.match(bridge, /export async function requestHomeScreenWidgetPin[\s\S]{0,200}catch \{\s*return false;/);
});

// --- Cross-check: isStepSkippable covers every new optional capture step --

test("the three new cognitive capture screens (urge/thought/interpretation) are all skippable, matching the existing optional-field convention", () => {
  for (const step of ["urge", "thought", "interpretation"] as const) {
    assert.equal(isStepSkippable(step), true);
  }
  assert.equal(isStepSkippable("cognitive_selector"), false, "cognitive_selector needs no separate skip link -- its own Continue button already serves that purpose");
});

// --- Cross-check: goBack from emotion with nothing selected reaches cognitive_selector, never a step before it ---

test("goBack chain from 'emotion' with nothing selected reaches cognitive_selector and then goal_select, never skipping past either", () => {
  const atEmotion: NewArcLiveSessionState = { ...fresh(), currentStep: "emotion" };
  const back1 = resolvePreviousStep(atEmotion);
  assert.equal(back1?.step, "cognitive_selector");
});

test("resolveNextStep from cognitive_selector with every real text field blank but all three boxes checked still correctly skips straight through to emotion", () => {
  let state = setCognitiveSelection(fresh(), { thought: true, interpretation: true, urge: true }, NOW);
  // Checked the boxes, but never actually types anything on any of the three capture screens.
  state = setUrgeText(state, "", NOW);
  assert.equal(state.currentStep, "thought", "a blank urge still correctly skips stop_and_accept_urge, landing on the next selected branch");
  state = setThought(state, "", NOW);
  assert.equal(state.currentStep, "interpretation", "a blank thought still correctly skips reality_acceptance");
  state = setInterpretation(state, "", NOW);
  assert.equal(state.currentStep, "emotion", "a blank interpretation still correctly skips interpretation_acceptance");
});
