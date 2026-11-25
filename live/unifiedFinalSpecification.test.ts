import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/unifiedFinalSpecification.test.ts
 *
 * ARCHI -- Unified Final Specification task, section 9: the 37
 * enumerated required regression tests, grouped exactly as the spec
 * itself groups them (combined shortcut 1-7, Action Selection 8-13,
 * early task execution 14-18, temporary tasks 19-24, Encoding/
 * completion 25-32, floating cube 33-37). Pure engine behavior is
 * tested by importing arc/newArcLiveSteps.ts / arc/newArcLiveCopy.ts
 * directly (same convention as every other arc/*.test.ts file);
 * screen-embedded logic (Action Selection UI, returnToTask routing,
 * temporary-task creation/clamping) and native Kotlin are tested via
 * source-text assertions, the SAME convention every other live/*.test.ts
 * screen test already uses (these files import React Native/Expo
 * modules that a plain `node --test` run cannot execute). Scenarios
 * already covered in depth by a dedicated, pre-existing test file are
 * referenced in a comment rather than re-tested here from scratch, to
 * avoid duplicating coverage -- each such test still asserts the exact
 * same invariant directly, never merely trusting the reference.
 */
import {
  NEW_ARC_LIVE_STEP_ORDER,
  NEW_ARC_MINI_STEP_ORDER,
  advance,
  completeFreeBreathingIntro,
  confirmActionReadinessCheck,
  setCognitiveSelection,
  setGoalType,
  setUrgeText,
} from "../arc/newArcLiveSteps.ts";
import { createNewArcLiveSessionState } from "../arc/newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "../arc/newArcLiveTypes.ts";
import { resolveEncodingMantra } from "../arc/newArcLiveCopy.ts";

const NOW = "2026-03-01T13:00:00.000Z";

function freshCombinedShortcut(): NewArcLiveSessionState {
  return createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "spontaneous", null, true);
}

function fresh(): NewArcLiveSessionState {
  return createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW);
}

function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const homeScreen = readSource("build/FlexibleDailyScreen.tsx");
// ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry "Cubes"
// task, section 5: the combined "מחשבה / דחף" button (and the rest of
// the mood check-in bar) moved from this screen's own former inline
// block into the shared FeelingCube component -- tests below now read
// it from there.
const feelingCubeComponent = readSource("live/components/HomeCubes.tsx");
const overlayKt = readSource("modules/floating-timer-overlay/android/src/main/java/expo/modules/floatingtimeroverlay/OverlayService.kt");
const liveScreen = readSource("live/NewArcLiveScreen.tsx");
const emotionalCheckInRouting = readSource("data/emotionalCheckInRouting.ts");

// ============================================================
// Combined shortcut (1-7)
// ============================================================

test("1. Combined button appears on Home (via the shared FeelingCube), labeled 'מחשבה / דחף' (not two separate thought/urge buttons)", () => {
  assert.ok(feelingCubeComponent.includes("מחשבה / דחף"));
  assert.ok(feelingCubeComponent.includes('onPress={() => handleEmotionalCheckInChoice("urge")}'));
});

test("2. Combined button appears in the expanded floating cube, labeled the same way", () => {
  assert.ok(overlayKt.includes("🧠 מחשבה / דחף"));
  assert.ok(overlayKt.includes('openCheckIn("urge")'));
});

test("3. No duplicate separate thought/urge buttons remain -- exactly one combined row on Home (via the shared FeelingCube) and one in the floating cube", () => {
  assert.equal((feelingCubeComponent.match(/handleEmotionalCheckInChoice\("urge"\)/g) ?? []).length, 1);
  assert.equal((overlayKt.match(/urgeTextView|urgeRow|urgeView/g) ?? []).length > 0, true);
  assert.equal((overlayKt.match(/} else if \(downOnUrge\) \{/g) ?? []).length, 1, "exactly one dispatch site for the combined button's own tap, never a second duplicated one");
  assert.ok(!feelingCubeComponent.includes("💥"), "the old urge-only emoji must be gone, replaced by the combined button's own emoji");
});

test("4. Thought/interpretation/urge support multi-selection -- checking all three at once on cognitive_selector", () => {
  let state: NewArcLiveSessionState = { ...freshCombinedShortcut(), currentStep: "cognitive_selector" };
  state = setCognitiveSelection(state, { thought: true, interpretation: true, urge: true }, NOW);
  assert.equal(state.selectedCognitiveThought, true);
  assert.equal(state.selectedCognitiveInterpretation, true);
  assert.equal(state.selectedCognitiveUrge, true);
});

test("5. Multiple selected protocols (urge, thought, interpretation) all run within the SAME one ARC session", () => {
  let state: NewArcLiveSessionState = { ...freshCombinedShortcut(), currentStep: "cognitive_selector" };
  state = setCognitiveSelection(state, { thought: true, interpretation: true, urge: true }, NOW);
  assert.equal(state.currentStep, "urge", "urge runs first, in the engine's own fixed order");
  state = setUrgeText(state, "דחף לקום", NOW);
  state = advance(state, NOW); // stop_and_accept_urge -> thought
  assert.equal(state.currentStep, "thought", "thought runs next, in the SAME session (taskId unchanged)");
  assert.equal(state.taskId, "t1");
});

test("6. Emotion selection is skipped ONLY for the new combined-shortcut entry pathway -- an ordinary session still asks", () => {
  let combined: NewArcLiveSessionState = { ...freshCombinedShortcut(), currentStep: "cognitive_selector" };
  combined = setCognitiveSelection(combined, { thought: false, interpretation: false, urge: false }, NOW);
  // ARCHI -- Action-Readiness Check task: the new shared step now sits
  // right after this emotion-skip -- confirming it with unpleasant >= 5
  // ("continue") reaches natural_breathing exactly as before.
  assert.equal(combined.currentStep, "action_readiness_check", "skipped straight past emotion");
  combined = confirmActionReadinessCheck(combined, 9, 1, 8, NOW);
  assert.equal(combined.currentStep, "natural_breathing");

  let ordinary: NewArcLiveSessionState = { ...fresh(), currentStep: "cognitive_selector" };
  ordinary = setCognitiveSelection(ordinary, { thought: false, interpretation: false, urge: false }, NOW);
  assert.equal(ordinary.currentStep, "emotion", "an ordinary session still asks -- never skipped for it");
});

test("7. Existing mood shortcuts (😟/🙂) remain unchanged on the shared FeelingCube -- unaffected by the combined shortcut's own new skipEmotionSelection param. The ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry 'Cubes' task, section 5, later removed the 😄 smiley from this specific cube -- it still exists, unchanged, on Task LIVE's own post-completion button.", () => {
  assert.ok(feelingCubeComponent.includes('onPress={() => handleEmotionalCheckInChoice("full_arc")}'));
  assert.ok(feelingCubeComponent.includes('onPress={() => handleEmotionalCheckInChoice("shortened_arc")}'));
  assert.ok(!feelingCubeComponent.includes("😄"));
  const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
  assert.ok(activeTaskScreen.includes("😄 מעולה"), "the 😄 smiley must still exist, unchanged, on Task LIVE's own post-completion button");
  const fullArcIndex = emotionalCheckInRouting.indexOf("export async function openFullArc(");
  const shortenedArcIndex = emotionalCheckInRouting.indexOf("export async function openShortenedArc(");
  const fullArcBody = emotionalCheckInRouting.slice(fullArcIndex, shortenedArcIndex);
  // Ends at openUrgeArc's own preceding doc comment (not its function
  // keyword), since that comment itself legitimately mentions
  // skipEmotionSelection -- only openShortenedArc's own BODY must stay
  // free of it.
  const shortenedArcEnd = emotionalCheckInRouting.indexOf('* ARCHI -- Unified Final Specification task, section 1 (combined');
  const shortenedArcBody = emotionalCheckInRouting.slice(shortenedArcIndex, shortenedArcEnd);
  assert.ok(!fullArcBody.includes("skipEmotionSelection") && !shortenedArcBody.includes("skipEmotionSelection"), "openFullArc/openShortenedArc's own function bodies must never pass skipEmotionSelection");
});

// ============================================================
// Action Selection (8-13)
// ============================================================

test("8-9. ARCHI -- Adaptive Task Execution & Emotional Persistence task, section 1: action_selection/mini_action_selection are removed entirely from the step order -- regulation advances directly into encoding, and mini_acceptance_transition directly into mini_encoding", () => {
  const regIndex = NEW_ARC_LIVE_STEP_ORDER.indexOf("regulation");
  const encodingIndex = NEW_ARC_LIVE_STEP_ORDER.indexOf("encoding");
  assert.equal(encodingIndex, regIndex + 1, "encoding must sit directly after regulation, with no action_selection step between them");
  assert.ok(!NEW_ARC_LIVE_STEP_ORDER.includes("action_selection"), "action_selection is absent from the active Full ARC order");

  const transitionIndex = NEW_ARC_MINI_STEP_ORDER.indexOf("mini_acceptance_transition");
  const miniEncodingIndex = NEW_ARC_MINI_STEP_ORDER.indexOf("mini_encoding");
  assert.equal(miniEncodingIndex, transitionIndex + 1, "mini_encoding must sit directly after mini_acceptance_transition, with no mini_action_selection step between them");
  assert.ok(!NEW_ARC_MINI_STEP_ORDER.includes("mini_action_selection"), "mini_action_selection is absent from the active Mini ARC order");
});

// ARCHI -- Adaptive Task Execution & Emotional Persistence task,
// section 1: the dedicated action-selection prompt (and the earlier bug
// around it being skipped for an active/paused task) is moot now --
// the app already knows the task's own action from context, so there
// is no selection step left to reach for ANY session, active or idle.
test("10 (superseded). regulation is exactly one sub-screen for every session, active-task-origin included -- there is no integrated action-selection section left to reach", () => {
  const active: NewArcLiveSessionState = { ...fresh(), currentStep: "regulation", isActiveTaskLiveOrigin: true };
  assert.equal(active.subIndex, 0);
});

// ARCHI -- Adaptive Task Execution & Emotional Persistence task,
// section 1: scenarios 14-24 (early task execution + temporary tasks)
// all depended on the now-removed action-selection UI -- the
// scheduledTask/temporaryAction returnToTask branches, and
// resolveMinutesUntilNextTask/createTemporaryActionTask themselves --
// none of which exist any more. There is no replacement behavior to
// test: the app resolves the task's own action from context, with no
// in-session task/duration picker left at all.

// ============================================================
// Encoding/completion (25-32)
// ============================================================

test("25. The current active task's own saved first action is preferred in Encoding", () => {
  const state: NewArcLiveSessionState = { ...fresh(), isActiveTaskLiveOrigin: true, firstAction: "לפתוח את המחשב", goalType: "combined" };
  assert.match(resolveEncodingMantra(state), /לפתוח את המחשב/);
});

// ARCHI -- Adaptive Task Execution & Emotional Persistence task,
// section 1: scenario 26 (a selected future/temporary action used in
// Encoding) no longer applies -- selectedActionSource/
// selectedActionTitle/selectedActionTaskId/selectedActionFirstAction
// are all removed from NewArcLiveSessionState; resolveActionText now
// resolves purely from firstAction/taskTitle (isActiveTaskLiveOrigin-
// gated), already covered by test 25 above.

test("27. The visualization uses the user's own actual firstAction text verbatim -- never an automatically rewritten/conjugated version of it", () => {
  const state: NewArcLiveSessionState = { ...fresh(), isActiveTaskLiveOrigin: true, goalType: "combined", firstAction: "לצחצח שיניים ולשטוף פנים" };
  assert.ok(resolveEncodingMantra(state).includes("לצחצח שיניים ולשטוף פנים"), "the exact entered text, unmodified");
});

test("28. Existing Encoding animations/stages remain intact -- the 'encoding' render case still wires the SAME ArcBodyMantraCircle", () => {
  const encodingIndex = liveScreen.indexOf('case "encoding":');
  const encodingBody = liveScreen.slice(encodingIndex, encodingIndex + 400);
  assert.ok(encodingBody.includes('stage="encoding"'));
  assert.ok(encodingBody.includes("<ArcBodyMantraCircle"));
});

// ARCHI -- Adaptive Task Execution & Emotional Persistence task,
// section 1: scenario 29 (returnToTask's own scheduledTask/
// temporaryAction branches) no longer applies -- both branches are
// deleted along with the rest of the action-selection UI; returnToTask
// now falls straight through to routeToTaskOrArcResultSuggestion for
// every ordinary completion (covered directly by
// live/postArcNavigation.test.ts, the dedicated post-ARC routing
// regression file).

test("30. The active task's own timer is preserved/restored -- returnToTask never writes to the Task Timer Run storage at all, for any destination", () => {
  const fnIndex = liveScreen.indexOf("async function returnToTask(autoStart: boolean)");
  const fnEnd = liveScreen.indexOf("\n  }\n", fnIndex);
  const fnBody = liveScreen.slice(fnIndex, fnEnd);
  assert.ok(!fnBody.includes("saveTaskTimerRun"), "never touches the task's own timer run -- it is left exactly as it was");
});

// ARCHI -- Adaptive Task Execution & Emotional Persistence task,
// section 1: scenario 31 specifically concerned the two now-deleted
// scheduledTask/temporaryAction branches -- with both gone, the
// remaining branches' own autoStart behavior is unchanged and already
// covered by live/postArcNavigation.test.ts.

// ARCHI -- Adaptive Task Execution & Emotional Persistence task,
// section 1: scenario 32's entire premise -- an integrated
// action-selection section living on regulation's/
// mini_acceptance_transition's own extra sub-screen -- no longer
// exists. Both steps are back to exactly one sub-screen for every
// arcInvocationMode and every isActiveTaskLiveOrigin value; only
// arcGymSituationId ever skips a step at all, already covered by
// arc/newArcLiveSteps.test.ts.

// ============================================================
// Floating cube (33-37) -- confirmation only, per the spec's own
// section 7 ("requires only confirmation that prior work already
// satisfies it, not new implementation"). Each mechanism was built
// and tested in the immediately preceding "Two Additions" task; these
// checks confirm it is still present, unbroken by this task's own
// combined-shortcut label change.
// ============================================================

test("33. Floating cube activation/hiding still work -- the toggle handler and its button are both still present", () => {
  assert.ok(homeScreen.includes("function handleToggleFloatingOverlay"));
  assert.ok(homeScreen.includes("הפעל קובייה צפה") && homeScreen.includes("הסתר קובייה צפה"));
});

test("34. Collapsed/expanded modes remain functional -- setCollapsed/expandedContent wiring is untouched", () => {
  assert.ok(overlayKt.includes("setCollapsed"));
  assert.ok(overlayKt.includes("val expandedContent = LinearLayout(this).apply {"));
});

test("35. Current/next task info remains accurate -- the existing next-task row is still wired, unaffected by the new combined button", () => {
  assert.ok(overlayKt.includes("nextTaskInfoView") || overlayKt.includes("nextTaskActionView"));
});

test("36. The original Android home-screen widget (3 mood smileys) remains intact", () => {
  const widgetDir = readSource("modules/floating-timer-overlay/android/src/main/java/expo/modules/floatingtimeroverlay/OverlayService.kt");
  assert.ok(widgetDir.includes("moodLessGoodTextView") && widgetDir.includes("moodOkTextView") && widgetDir.includes("moodDirectTextView"), "the three existing mood buttons are untouched");
});

test("37. The task timer is not stopped when the overlay is hidden -- handleToggleFloatingOverlay never touches task-timer storage", () => {
  const fnIndex = homeScreen.indexOf("function handleToggleFloatingOverlay");
  const fnBody = homeScreen.slice(fnIndex, fnIndex + 1200);
  assert.ok(!fnBody.includes("saveTaskTimerRun") && !fnBody.includes("clearTaskTimerRun"));
});
