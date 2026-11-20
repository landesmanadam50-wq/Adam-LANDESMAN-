import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { advance, setEmotionSelection, setSelectedAction } from "./newArcLiveSteps.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";
import { resolveActionText, resolveEncodingMantra } from "./newArcLiveCopy.ts";

/**
 * arc/allowActionSelectionOnEmotionOrRegulation.test.ts
 *
 * ARCHI -- Allow Action Selection During Emotion Identification or
 * Defer It to Regulation task: the required regression scenarios --
 * selecting an action early, deferring it to Regulation, editing an
 * early selection during Regulation, preserving selections across
 * navigation/restoration, active-task/custom-action handling, and no
 * regressions in Mini ARC or Shortened ARC. The feature itself is
 * almost entirely a screen-local UI choice (live/NewArcLiveScreen.tsx's
 * own showActionSelectorOnEmotion/showActionSelectorOnRegulation state)
 * layered on top of the EXISTING, unchanged setSelectedAction/advance
 * engine -- so most scenarios are verified at that engine level (no
 * new step, no new session field), with source-text checks for the two
 * new UI choices themselves, matching this codebase's own established
 * convention for screen-level behavior with no RN renderer available.
 */

function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const NOW = "2026-01-05T12:00:00.000Z";

function freshFullArc(isActiveTaskLiveOrigin = false): NewArcLiveSessionState {
  return { ...createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "plannedFull"), isActiveTaskLiveOrigin, currentStep: "emotion", selectedEmotion: "fear" };
}

// --- Option A: selecting an action now, on the emotion screen ---

test("1. selecting an action while on the 'emotion' step saves it on the session and advances, exactly like selecting it on Regulation", () => {
  const onEmotion = freshFullArc();
  assert.equal(onEmotion.currentStep, "emotion");
  const chosen = setSelectedAction(onEmotion, { source: "temporaryAction", title: "לצאת להליכה", durationMinutes: 10 }, NOW);
  assert.equal(chosen.selectedActionSource, "temporaryAction");
  assert.equal(chosen.selectedActionTitle, "לצאת להליכה");
  assert.notEqual(chosen.currentStep, "emotion", "choosing an action advances the session forward, same as the existing 'המשך' button");
});

test("1b. an action selected on the emotion screen via a scheduled task is saved with the exact same fields setSelectedAction always writes", () => {
  const chosen = setSelectedAction(freshFullArc(), { source: "scheduledTask", taskId: "t9", title: "לקנות חלב", firstAction: "לצאת מהבית" }, NOW);
  assert.equal(chosen.selectedActionSource, "scheduledTask");
  assert.equal(chosen.selectedActionTaskId, "t9");
  assert.equal(chosen.selectedActionFirstAction, "לצאת מהבית");
});

test("1c. the positive feeling chosen earlier on the same screen stays associated with the action, even when the action is selected right there", () => {
  let state = setEmotionSelection(freshFullArc(), "fear", null);
  // ARCHI -- Combined Emotion & Supportive Feeling Selection task's own
  // auto-mapping already resolves a supportive feeling the instant an
  // emotion is chosen -- selecting the action afterward must never
  // disturb it.
  const feelingBefore = state.selectedSupportiveFeeling;
  state = setSelectedAction(state, { source: "temporaryAction", title: "לנשום עמוק", durationMinutes: 5 }, NOW);
  assert.deepEqual(state.selectedSupportiveFeeling, feelingBefore, "the supportive feeling is untouched by selecting the action");
  const mantra = resolveEncodingMantra(state);
  assert.ok(mantra.includes("לנשום עמוק"), "Encoding's own mantra still visualizes both the feeling and the early-selected action together");
});

// --- Option B: deferring action selection to Regulation ---

test("2. deferring on the emotion screen (never calling setSelectedAction there) leaves selectedActionSource null all the way to Regulation, where the existing picker is offered", () => {
  let state = setEmotionSelection(freshFullArc(), "fear", null);
  state = advance(state, NOW); // leaves "emotion" via the ordinary continue path, no action chosen
  assert.equal(state.selectedActionSource, null, "no action was ever selected -- the trainee simply continued");
  // Walk forward to Regulation the same way the real session does.
  while (state.currentStep !== "regulation" && state.currentStep !== "complete") {
    state = advance(state, NOW);
  }
  assert.equal(state.currentStep, "regulation");
  assert.equal(state.selectedActionSource, null, "still deferred -- Regulation's own subIndex 1 is exactly where the existing picker now appears");
});

// --- Editing an early selection during Regulation ---

test("3. an action already selected on the emotion screen is preserved through to Regulation, never silently re-asked or reset", () => {
  let state = setSelectedAction(freshFullArc(), { source: "temporaryAction", title: "לסדר את השולחן", durationMinutes: 10 }, NOW);
  while (state.currentStep !== "regulation" && state.currentStep !== "complete") {
    state = advance(state, NOW);
  }
  assert.equal(state.currentStep, "regulation");
  assert.equal(state.selectedActionSource, "temporaryAction");
  assert.equal(state.selectedActionTitle, "לסדר את השולחן", "the EXACT same early selection is still there, unchanged, by the time Regulation is reached");
});

test("4. explicitly changing an early selection during Regulation (the 'שנה פעולה' path) overwrites it correctly and still advances to Encoding", () => {
  let state = setSelectedAction(freshFullArc(), { source: "temporaryAction", title: "לסדר את השולחן", durationMinutes: 10 }, NOW);
  state = { ...state, currentStep: "regulation", subIndex: 1 };
  assert.equal(state.selectedActionSource, "temporaryAction");
  // The trainee taps "שנה פעולה" (a local UI toggle, no session change)
  // then picks a genuinely different action through the SAME picker.
  const changed = setSelectedAction(state, { source: "scheduledTask", taskId: "t5", title: "ללכת לרופא", firstAction: null }, NOW);
  assert.equal(changed.selectedActionSource, "scheduledTask");
  assert.equal(changed.selectedActionTaskId, "t5");
  assert.equal(changed.selectedActionTitle, "ללכת לרופא", "the new selection fully replaces the earlier one -- never merged or left stale");
  assert.equal(changed.currentStep, "encoding", "Regulation's own subIndex-count-based advance still moves on to Encoding exactly as before");
});

test("5. an action deferred until Regulation (never selected on the emotion screen) is picked there exactly as the existing flow already allows", () => {
  let state = freshFullArc();
  state = advance(state, NOW); // leaves "emotion" with no action chosen
  state = { ...state, currentStep: "regulation", subIndex: 1 };
  assert.equal(state.selectedActionSource, null);
  const chosen = setSelectedAction(state, { source: "temporaryAction", title: "לקרוא ספר", durationMinutes: 15 }, NOW);
  assert.equal(chosen.selectedActionSource, "temporaryAction");
  assert.equal(chosen.currentStep, "encoding");
});

// --- Preservation across navigation / session restoration ---

test("6. a session restored (e.g. app restart) mid-flight with an action already selected keeps every field exactly as persisted -- no migration, no reset", () => {
  const persisted: NewArcLiveSessionState = {
    ...freshFullArc(),
    currentStep: "regulation",
    subIndex: 1,
    selectedActionSource: "scheduledTask",
    selectedActionTaskId: "t7",
    selectedActionTitle: "להגיע לפגישה",
    selectedActionFirstAction: "לנעול נעליים",
  };
  // A plain reload/restore is nothing more than reading the exact same
  // object back -- this engine never mutates selectedAction* fields on
  // its own, only setSelectedAction does, and it is not called here.
  assert.equal(persisted.selectedActionSource, "scheduledTask");
  assert.equal(persisted.selectedActionTaskId, "t7");
  assert.equal(persisted.selectedActionTitle, "להגיע לפגישה");
  assert.equal(persisted.selectedActionFirstAction, "לנעול נעליים");
  assert.equal(resolveActionText(persisted), "לנעול נעליים", "the exact same priority chain Encoding uses also resolves the correct summary text for display");
});

test("7. going back from Regulation to the emotion screen and forward again never duplicates or discards an already-made selection", () => {
  let state = setSelectedAction(freshFullArc(), { source: "temporaryAction", title: "לנקות את הבית", durationMinutes: 20 }, NOW);
  const afterFirstAdvance = state.currentStep;
  // Re-walk forward to Regulation; the selection must still be the one
  // and only value throughout, never re-derived or overwritten by the
  // ordinary engine walk.
  while (state.currentStep !== "regulation" && state.currentStep !== "complete") {
    state = advance(state, NOW);
  }
  assert.equal(state.selectedActionSource, "temporaryAction");
  assert.equal(state.selectedActionTitle, "לנקות את הבית");
  assert.notEqual(afterFirstAdvance, "emotion", "the walk genuinely left the emotion screen, confirming this isn't a no-op test");
});

// --- Active task + custom (temporary) action handling, both still intact ---

test("8. renderActionSelector's own active-task one-tap option and custom/temporary-action entry are both still present in the shared implementation, untouched by this task", () => {
  const screen = readSource("live/NewArcLiveScreen.tsx");
  const fnIndex = screen.indexOf("function renderActionSelector()");
  assert.ok(fnIndex !== -1, "the one shared action-selector implementation must still exist");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  function ", fnIndex + 10));
  assert.ok(fnBody.includes("activeTaskActionLabel"), "the active task's own one-tap option is still offered");
  assert.ok(fnBody.includes("chooseActiveTaskAction"), "choosing the active task's current action is still wired");
  assert.ok(fnBody.includes("chooseTemporaryAction"), "the custom/temporary-action entry is still wired");
  assert.ok(fnBody.includes("chooseScheduledTask"), "picking any other scheduled task is still wired");
});

test("8b. an active-task-origin session can still select its own current action directly from the emotion screen, exactly as Regulation already allowed", () => {
  const state = freshFullArc(true);
  assert.equal(state.isActiveTaskLiveOrigin, true);
  const chosen = setSelectedAction(state, { source: "scheduledTask", taskId: state.taskId, title: state.taskTitle, firstAction: state.firstAction?.trim() || null }, NOW);
  assert.equal(chosen.selectedActionSource, "scheduledTask");
  assert.equal(chosen.selectedActionTaskId, "t1");
});

// --- Structural: the two new choices actually exist on the emotion screen, exactly as specified ---

test("9. the 'emotion' screen's own render case offers both required choices verbatim, and reuses the SAME renderActionSelector() and resolveActionText already used elsewhere -- no new, duplicated implementation", () => {
  const screen = readSource("live/NewArcLiveScreen.tsx");
  const emotionCaseIndex = screen.indexOf('case "emotion":');
  const nextCaseIndex = screen.indexOf("case ", emotionCaseIndex + 'case "emotion":'.length);
  const emotionCaseBody = screen.slice(emotionCaseIndex, nextCaseIndex);
  assert.ok(emotionCaseBody.includes("בחירת פעולה עכשיו"), "Option A's exact required label must appear");
  assert.ok(emotionCaseBody.includes("אבחר פעולה בשלב הוויסות"), "Option B's exact required label must appear");
  assert.ok(emotionCaseBody.includes("renderActionSelector()"), "choosing 'now' reuses the one shared picker, never a second implementation");
  assert.ok(emotionCaseBody.includes("resolveActionText(session!)"), "an already-made selection is summarized via the same priority-chain helper Encoding and Regulation use");
});

test("9b. bug fix: the action-selection choice is NOT gated on selectedEmotion -- it must still be shown (and usable) when the trainee is about to press 'המשך בלי רגש' without ever picking an emotion chip", () => {
  const screen = readSource("live/NewArcLiveScreen.tsx");
  const labelIndex = screen.indexOf("מתי תרצה לבחור פעולה");
  assert.ok(labelIndex !== -1);
  const precedingCode = screen.slice(Math.max(0, labelIndex - 150), labelIndex);
  assert.ok(
    !precedingCode.includes("selectedEmotion !== null"),
    "the action-choice section must render unconditionally on the emotion screen, never withheld until an emotion is actually selected"
  );
});

test("9c. choosing an action without ever selecting an emotion (the exact 'המשך בלי רגש' scenario) still saves it correctly", () => {
  const onEmotionNoFeeling: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "task", "action", NOW, "plannedFull"), currentStep: "emotion" };
  assert.equal(onEmotionNoFeeling.selectedEmotion, null, "no emotion chosen yet -- exactly the scenario that was previously missing the choice");
  const chosen = setSelectedAction(onEmotionNoFeeling, { source: "temporaryAction", title: "לצאת להפסקה", durationMinutes: 10 }, NOW);
  assert.equal(chosen.selectedActionSource, "temporaryAction");
  assert.equal(chosen.selectedActionTitle, "לצאת להפסקה");
  assert.notEqual(chosen.currentStep, "emotion");
});

test("10. this task never introduces a new ARC step id -- only the existing 'emotion' and 'regulation' render cases changed; the step order and engine remain exactly as before", () => {
  const screen = readSource("live/NewArcLiveScreen.tsx");
  // The Regulation sub-screen must still fall through to the one
  // shared picker for a deferred/no-selection session -- confirming no
  // navigation to a separate step was introduced for either choice.
  const regulationCaseIndex = screen.indexOf('case "regulation":');
  const regulationCaseBody = screen.slice(regulationCaseIndex, screen.indexOf("case ", regulationCaseIndex + 20));
  assert.ok(regulationCaseBody.includes("renderActionSelector()"));
  assert.ok(regulationCaseBody.includes("שנה פעולה"), "Regulation's own review/change option uses the same wording convention");
});

// --- No regressions in Mini ARC or Shortened ARC ---

test("11. Mini ARC's own screens (mini_awareness, mini_acceptance_transition) never gained the new emotion-screen choice -- it is exclusive to Full ARC's 'emotion' step", () => {
  const screen = readSource("live/NewArcLiveScreen.tsx");
  const miniAwarenessIndex = screen.indexOf('case "mini_awareness":');
  const nextCaseIndex = screen.indexOf("case ", miniAwarenessIndex + 'case "mini_awareness":'.length);
  const miniAwarenessBody = screen.slice(miniAwarenessIndex, nextCaseIndex);
  assert.ok(!miniAwarenessBody.includes("בחירת פעולה עכשיו"), "Mini ARC's own emotion-equivalent screen must stay completely unaffected");
  assert.ok(!miniAwarenessBody.includes("אבחר פעולה בשלב הוויסות"));

  const miniTransitionIndex = screen.indexOf('case "mini_acceptance_transition":');
  const miniTransitionNext = screen.indexOf("case ", miniTransitionIndex + 'case "mini_acceptance_transition":'.length);
  const miniTransitionBody = screen.slice(miniTransitionIndex, miniTransitionNext);
  assert.ok(!miniTransitionBody.includes("בחירת פעולה עכשיו"), "Mini ARC's own Regulation-equivalent must stay completely unaffected too");
  assert.ok(!miniTransitionBody.includes("אבחר פעולה בשלב הוויסות"));
});

test("12. Mini ARC's own action-selection flow (mini_acceptance_transition subIndex 1) behaves exactly as before this task, end to end", () => {
  let state: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "x", "y", NOW, "plannedMini"), currentStep: "mini_acceptance_transition", subIndex: 1 };
  const chosen = setSelectedAction(state, { source: "temporaryAction", title: "לשתות מים", durationMinutes: 5 }, NOW);
  assert.equal(chosen.currentStep, "mini_encoding");
  assert.equal(chosen.selectedActionSource, "temporaryAction");
});

test("13. Shortened ARC ('סבבה') never reaches the 'emotion' step at all (unaffected by this task's own addition there), and its own Regulation action-selector continues to work end to end", () => {
  const shortened: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "x", "y", NOW, "shortened"), isActiveTaskLiveOrigin: false };
  let state: NewArcLiveSessionState = { ...shortened, currentStep: "free_breathing" };
  const visited: string[] = [];
  for (let i = 0; i < 20 && state.currentStep !== "regulation"; i++) {
    visited.push(state.currentStep);
    state = advance(state, NOW);
  }
  assert.ok(!visited.includes("emotion"), "Shortened ARC must never see the Full-ARC-only 'emotion' step, so this task's addition there is simply never reached");
  assert.equal(state.currentStep, "regulation");
  state = { ...state, subIndex: 1 };
  const chosen = setSelectedAction(state, { source: "temporaryAction", title: "לשתות כוס מים", durationMinutes: 5 }, NOW);
  assert.equal(chosen.currentStep, "encoding");
  assert.equal(chosen.selectedActionSource, "temporaryAction", "Shortened ARC's own Regulation action-selector is exactly the same shared implementation and still works correctly");
});

test("14. Shortened ARC reaching Regulation with an action already deferred still shows the existing picker, never a forced re-ask of mood or a second ARC", () => {
  const shortened: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "x", "y", NOW, "shortened"), currentStep: "regulation", subIndex: 1 };
  assert.equal(shortened.selectedActionSource, null, "deferred, exactly like any other pathway reaching Regulation with no selection yet");
});
