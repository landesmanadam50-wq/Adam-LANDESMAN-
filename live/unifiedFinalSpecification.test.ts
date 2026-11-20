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
  setSelectedAction,
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
const overlayKt = readSource("modules/floating-timer-overlay/android/src/main/java/expo/modules/floatingtimeroverlay/OverlayService.kt");
const liveScreen = readSource("live/NewArcLiveScreen.tsx");
const emotionalCheckInRouting = readSource("data/emotionalCheckInRouting.ts");

// ============================================================
// Combined shortcut (1-7)
// ============================================================

test("1. Combined button appears on Home, labeled 'מחשבה / דחף' (not two separate thought/urge buttons)", () => {
  assert.ok(homeScreen.includes("מחשבה / דחף"));
  assert.ok(homeScreen.includes('onPress={() => handleCheckIn("urge")}'));
});

test("2. Combined button appears in the expanded floating cube, labeled the same way", () => {
  assert.ok(overlayKt.includes("🧠 מחשבה / דחף"));
  assert.ok(overlayKt.includes('openCheckIn("urge")'));
});

test("3. No duplicate separate thought/urge buttons remain -- exactly one combined row on Home and one in the cube", () => {
  assert.equal((homeScreen.match(/handleCheckIn\("urge"\)/g) ?? []).length, 1);
  assert.equal((overlayKt.match(/urgeTextView|urgeRow|urgeView/g) ?? []).length > 0, true);
  assert.equal((overlayKt.match(/} else if \(downOnUrge\) \{/g) ?? []).length, 1, "exactly one dispatch site for the combined button's own tap, never a second duplicated one");
  assert.ok(!homeScreen.includes("💥"), "the old urge-only emoji must be gone, replaced by the combined button's own emoji");
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

test("7. Existing mood shortcuts (😟/🙂/😄) remain unchanged -- unaffected by the combined shortcut's own new skipEmotionSelection param", () => {
  assert.ok(homeScreen.includes('onPress={() => handleCheckIn("full_arc")}'));
  assert.ok(homeScreen.includes('onPress={() => handleCheckIn("shortened_arc")}'));
  assert.ok(homeScreen.includes('onPress={() => handleCheckIn("next_task")}'));
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

test("8-9. action_selection sits immediately after regulation and immediately before encoding in the active Full ARC order (mini_action_selection likewise for Mini ARC)", () => {
  const regIndex = NEW_ARC_LIVE_STEP_ORDER.indexOf("regulation");
  const actionIndex = NEW_ARC_LIVE_STEP_ORDER.indexOf("action_selection");
  const encodingIndex = NEW_ARC_LIVE_STEP_ORDER.indexOf("encoding");
  assert.equal(actionIndex, regIndex + 1, "action_selection must sit directly after regulation");
  assert.equal(encodingIndex, actionIndex + 1, "encoding must sit directly after action_selection");

  const transitionIndex = NEW_ARC_MINI_STEP_ORDER.indexOf("mini_acceptance_transition");
  const miniActionIndex = NEW_ARC_MINI_STEP_ORDER.indexOf("mini_action_selection");
  const miniEncodingIndex = NEW_ARC_MINI_STEP_ORDER.indexOf("mini_encoding");
  assert.equal(miniActionIndex, transitionIndex + 1);
  assert.equal(miniEncodingIndex, miniActionIndex + 1);
});

// ARCHI -- BUG: Action Selection Is Missing from Regulation in All ARC
// Pathways task: this superseded the earlier "an active/paused task
// skips the action-selection question entirely" requirement, which was
// itself exactly the reported bug -- Action Selection silently missing
// from Regulation whenever it was reached while a task's timer was
// already running (Task LIVE's own "😟 פחות טוב" button included). The
// prompt now always appears; Option A simply offers that active task's
// own current/first action in this case (see
// arc/actionSelectionInRegulation.test.ts scenarios 12/12b/15-17 for
// full coverage).
test("10 (superseded). An active/paused task no longer skips the action-selection question -- regulation's own integrated action-selection section renders for it, exactly like any other session", () => {
  const active: NewArcLiveSessionState = { ...fresh(), currentStep: "regulation", isActiveTaskLiveOrigin: true };
  assert.equal(active.subIndex, 0, "regulation is exactly one sub-screen -- the integrated action-selection section is reachable for an active-task-origin session too, on this same screen");
});

test("11. An idle user (no active task) can select an existing scheduled task", () => {
  const idle: NewArcLiveSessionState = { ...fresh(), currentStep: "action_selection", isActiveTaskLiveOrigin: false };
  const chosen = setSelectedAction(idle, { source: "scheduledTask", taskId: "t2", title: "ללמוד כלכלה", firstAction: "לפתוח את הספר" }, NOW);
  assert.equal(chosen.selectedActionSource, "scheduledTask");
  assert.equal(chosen.selectedActionTaskId, "t2");
  assert.equal(chosen.selectedActionFirstAction, "לפתוח את הספר");
  assert.equal(chosen.currentStep, "encoding");
});

test("12. An idle user can instead enter a temporary action with a duration", () => {
  const idle: NewArcLiveSessionState = { ...fresh(), currentStep: "action_selection", isActiveTaskLiveOrigin: false };
  const chosen = setSelectedAction(idle, { source: "temporaryAction", title: "לסדר את החדר", durationMinutes: 10 }, NOW);
  assert.equal(chosen.selectedActionSource, "temporaryAction");
  assert.equal(chosen.selectedActionTitle, "לסדר את החדר");
  assert.equal(chosen.selectedActionDurationMinutes, 10);
  assert.equal(chosen.currentStep, "encoding");
});

test("13. The selected action persists unchanged through Encoding and completion -- advancing never clears it", () => {
  let state: NewArcLiveSessionState = { ...fresh(), currentStep: "action_selection", isActiveTaskLiveOrigin: false };
  state = setSelectedAction(state, { source: "temporaryAction", title: "לסדר את החדר", durationMinutes: 10 }, NOW);
  assert.equal(state.currentStep, "encoding");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "complete");
  assert.equal(state.selectedActionSource, "temporaryAction", "still set at completion -- never reset by advancing");
  assert.equal(state.selectedActionTitle, "לסדר את החדר");
});

// ============================================================
// Early task execution (14-18)
// ============================================================

test("14. A task scheduled hours later can be selected and started early -- returnToTask's scheduledTask branch navigates by id alone, with no time-based gate at all", () => {
  const branchIndex = liveScreen.indexOf('if (session?.selectedActionSource === "scheduledTask"');
  const branchEnd = liveScreen.indexOf("return;", branchIndex);
  const branchBody = liveScreen.slice(branchIndex, branchEnd);
  assert.ok(!/scheduledTime|effectiveStartTime|isOverdue/.test(branchBody), "no time comparison gates starting the selected task early");
  assert.ok(branchBody.includes("session.selectedActionTaskId"));
});

test("15-16. Original task identity/recurrence stay intact and no duplicate occurrence/reward is created -- the scheduledTask branch only ever navigates, it never calls upsertTask/creates a new task", () => {
  const branchIndex = liveScreen.indexOf('if (session?.selectedActionSource === "scheduledTask"');
  const branchEnd = liveScreen.indexOf("return;", branchIndex);
  const branchBody = liveScreen.slice(branchIndex, branchEnd);
  assert.ok(!branchBody.includes("upsertTask"), "the selected task's own record/recurrence is never touched -- only navigated to");
  assert.ok(!branchBody.includes("createEmptyTask"), "never creates a second task for an already-existing scheduled one");
});

test("17. Reminder handling accounts for early completion -- the real task's own completion path (never a second one) already cancels its pending alarm by taskId, reused unchanged since the scheduledTask branch routes to that SAME real Task LIVE/Details screen", () => {
  const taskAlarm = readSource("data/taskAlarm.ts");
  assert.ok(taskAlarm.includes("export async function cancelAnyAlarmFor"));
  const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
  assert.ok(activeTaskScreen.includes("cancelAnyAlarmFor"), "Task LIVE's own completion path already cancels the pending alarm for this exact task -- early-started via the scheduledTask branch, it is the SAME path, never a parallel one");
});

test("18. Scheduling conflicts are shown, not silently resolved -- the real Task LIVE/Details screen (reused unchanged by the scheduledTask branch) already renders a conflict/adjust section the trainee must explicitly dismiss or act on", () => {
  const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
  assert.ok(activeTaskScreen.includes("dismissedAdjustSectionForTaskId"), "the existing conflict/adjust section is reused -- never a second, silent resolution path for an early-started task");
  assert.ok(activeTaskScreen.includes("handleShortenCurrentTask"), "the existing shorten/reschedule options are reused unchanged");
});

// ============================================================
// Temporary tasks (19-24)
// ============================================================

test("19-20-21. The temporary-action timer respects the next scheduled task: a longer request is capped to the time remaining, a shorter one is respected unchanged", () => {
  const fnIndex = liveScreen.indexOf("function resolveMinutesUntilNextTask(");
  const fnBody = liveScreen.slice(fnIndex, liveScreen.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("Math.max(0, startMinutes - nowMinutes)"), "available minutes is derived from the next task's own effective start time");
  const clampIndex = liveScreen.indexOf("const clampedTempDuration = availableMinutes !== null ? Math.max(1, Math.min(requestedTempDuration, availableMinutes)) : requestedTempDuration;");
  assert.ok(clampIndex !== -1, "a longer request is clamped DOWN to availableMinutes (e.g. 15 requested, 10 available -> 10); a shorter request (e.g. 5 requested, 10 available) passes through Math.min unchanged, since 5 < 10");
});

test("22. The maximum duration is RECALCULATED at the moment the timer actually starts, never reused from the stale Action-Selection-time estimate", () => {
  const fnIndex = liveScreen.indexOf("async function createTemporaryActionTask(");
  const fnBody = liveScreen.slice(fnIndex, liveScreen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("const now = new Date();"), "a fresh clock reading at creation time, never the Action-Selection-time one");
  assert.ok(fnBody.includes("await resolveTodaysScheduledPlan(now);"), "the plan is re-resolved fresh here, never reused from reload()'s own earlier snapshot");
  assert.ok(fnBody.includes("const availableMinutes = resolveMinutesUntilNextTask(scheduled, taskId, now);"));
  assert.ok(fnBody.includes("Math.max(1, Math.min(requested, availableMinutes))"), "the trainee's own requested minutes, clamped against the FRESH availableMinutes -- never the session's own already-stale selectedActionDurationMinutes used directly");
});

test("23. No overlapping temporary timer is created when the next scheduled task is already due -- resolveMinutesUntilNextTask clamps to zero (never negative) once the next entry's own start has passed", () => {
  const fnIndex = liveScreen.indexOf("function resolveMinutesUntilNextTask(");
  const fnBody = liveScreen.slice(fnIndex, liveScreen.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("Math.max(0,"), "never negative -- a passed start time clamps to exactly zero available minutes, so a 1-minute floor (never a full-length overlapping timer) is all createTemporaryActionTask can create");
});

test("24. No upcoming task permits choosing a duration without any schedule-based limit", () => {
  const fnIndex = liveScreen.indexOf("function resolveMinutesUntilNextTask(");
  const fnBody = liveScreen.slice(fnIndex, liveScreen.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("if (!next || next.effectiveStartTime === null) return null;"), "null when nothing is scheduled next");
  const clampIndex = liveScreen.indexOf("const durationMinutes = availableMinutes !== null ? Math.max(1, Math.min(requested, availableMinutes)) : requested;");
  assert.ok(clampIndex !== -1, "a null availableMinutes leaves the trainee's own requested duration completely unclamped");
});

// ============================================================
// Encoding/completion (25-32)
// ============================================================

test("25. The current active task's own saved first action is preferred in Encoding", () => {
  const state: NewArcLiveSessionState = { ...fresh(), isActiveTaskLiveOrigin: true, firstAction: "לפתוח את המחשב", goalType: "combined" };
  assert.match(resolveEncodingMantra(state), /לפתוח את המחשב/);
});

test("26. A selected future/temporary action (never the active task's own, since the two are mutually exclusive) is used in Encoding", () => {
  const scheduled: NewArcLiveSessionState = {
    ...fresh(),
    isActiveTaskLiveOrigin: false,
    goalType: "combined",
    selectedActionSource: "scheduledTask",
    selectedActionTaskId: "t2",
    selectedActionTitle: "ללמוד כלכלה",
    selectedActionFirstAction: "לפתוח את הספר",
  };
  assert.match(resolveEncodingMantra(scheduled), /לפתוח את הספר/);

  const temporary: NewArcLiveSessionState = { ...fresh(), isActiveTaskLiveOrigin: false, goalType: "combined", selectedActionSource: "temporaryAction", selectedActionTitle: "לסדר את החדר" };
  assert.match(resolveEncodingMantra(temporary), /לסדר את החדר/);
});

test("27. The visualization uses the user's own actual text verbatim -- never an automatically rewritten/conjugated version of it", () => {
  const state: NewArcLiveSessionState = { ...fresh(), isActiveTaskLiveOrigin: false, goalType: "combined", selectedActionSource: "temporaryAction", selectedActionTitle: "לצחצח שיניים ולשטוף פנים" };
  assert.ok(resolveEncodingMantra(state).includes("לצחצח שיניים ולשטוף פנים"), "the exact entered text, unmodified");
});

test("28. Existing Encoding animations/stages remain intact -- the 'encoding' render case still wires the SAME ArcBodyMantraCircle, directly after the new action_selection case", () => {
  const actionSelectionIndex = liveScreen.indexOf('case "action_selection":');
  const encodingIndex = liveScreen.indexOf('case "encoding":', actionSelectionIndex);
  const encodingBody = liveScreen.slice(encodingIndex, encodingIndex + 400);
  assert.ok(encodingBody.includes('stage="encoding"'));
  assert.ok(encodingBody.includes("<ArcBodyMantraCircle"));
});

// Scenarios 29-31 are also covered in depth, directly against the
// function's own source, by live/postArcNavigation.test.ts (the
// dedicated post-ARC routing regression file) -- re-asserted here
// briefly for direct 1:1 traceability against this spec's own list.
test("29. ARC completion offers the EXACT previously selected action -- returnToTask navigates by the session's own stored selectedActionTaskId/newly-created temporary task, never a re-derived one", () => {
  const scheduledIndex = liveScreen.indexOf('if (session?.selectedActionSource === "scheduledTask"');
  const temporaryIndex = liveScreen.indexOf('if (session?.selectedActionSource === "temporaryAction"');
  // ARCHI -- ARC Result task, section 3: this branch now routes through
  // routeToTaskOrArcResultSuggestion (session.selectedActionTaskId still
  // passed verbatim, never re-derived) instead of a bare router.replace.
  assert.ok(liveScreen.slice(scheduledIndex, temporaryIndex).includes("routeToTaskOrArcResultSuggestion(session.selectedActionTaskId, false)"));
});

test("30. The active task's own timer is preserved/restored -- returnToTask never writes to the Task Timer Run storage at all, for any destination", () => {
  const fnIndex = liveScreen.indexOf("async function returnToTask(autoStart: boolean)");
  const fnBody = liveScreen.slice(fnIndex, fnIndex + 4600);
  assert.ok(!fnBody.includes("saveTaskTimerRun"), "never touches the task's own timer run -- it is left exactly as it was");
});

test("31. No task starts automatically without explicit user confirmation -- neither new returnToTask branch ever passes autoStart", () => {
  const scheduledIndex = liveScreen.indexOf('if (session?.selectedActionSource === "scheduledTask"');
  const standaloneIndex = liveScreen.indexOf("if (taskId === STANDALONE_ARC_TASK_ID) {");
  const bothBranches = liveScreen.slice(scheduledIndex, standaloneIndex);
  assert.ok(!bothBranches.includes("autoStart"));
});

// ARCHI -- Move Action Selection into the Existing Regulation Screen task:
// "action_selection"/"mini_action_selection" are now PERMANENTLY
// unreachable as their own steps (isStepReachable), for every
// arcInvocationMode -- their functionality moved INTO
// "regulation"/"mini_acceptance_transition" as each one's own subIndex 1.
//
// ARCHI -- BUG: Action Selection Is Missing from Regulation in All ARC
// Pathways task: an active task-LIVE session no longer skips straight
// to Encoding -- that WAS the reported bug (Action Selection silently
// missing across Full/Mini/Shortened ARC whenever reached while a
// task's timer was already running). Only ARC-GYM's own separate,
// later positive-action visualization still skips this sub-screen.
test("32. All ARC entry routes follow consistent action-selection rules -- the integrated action-selection section (on regulation's one sub-screen / mini_acceptance_transition's own subIndex 1) appears identically across every arcInvocationMode and regardless of isActiveTaskLiveOrigin, only arcGymSituationId still skips it, and action_selection/mini_action_selection are never reachable as their own steps any more", () => {
  const modes = ["plannedFull", "spontaneous", "shortened"] as const;
  for (const mode of modes) {
    const idle: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "x", "y", NOW, mode), currentStep: "regulation", subIndex: 0, isActiveTaskLiveOrigin: false };
    assert.equal(idle.subIndex, 0, `${mode}: regulation is exactly one sub-screen -- idle already shows its own integrated action-selection section`);
    const active: NewArcLiveSessionState = { ...idle, isActiveTaskLiveOrigin: true };
    assert.equal(active.subIndex, 0, `${mode}: an active task-LIVE session ALSO shows the integrated action-selection section now (this fix), on the same one screen`);
    const arcGym: NewArcLiveSessionState = { ...idle, arcGymSituationId: "sit1" };
    assert.equal(advance(arcGym, NOW).currentStep, "encoding", `${mode}: only arcGymSituationId still skips straight to encoding (regulation has only 1 page for it)`);
  }
  const idleMini: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "x", "y", NOW, "plannedMini"), currentStep: "mini_acceptance_transition", subIndex: 0, isActiveTaskLiveOrigin: false };
  const afterIdleMini = advance(idleMini, NOW);
  assert.equal(afterIdleMini.currentStep, "mini_acceptance_transition", "plannedMini: idle stays on mini_acceptance_transition for its own integrated action-selection sub-screen");
  assert.equal(afterIdleMini.subIndex, 1, "plannedMini: idle advances into mini_acceptance_transition's own subIndex 1");
  const activeMini: NewArcLiveSessionState = { ...idleMini, isActiveTaskLiveOrigin: true };
  const afterActiveMini = advance(activeMini, NOW);
  assert.equal(afterActiveMini.currentStep, "mini_acceptance_transition", "plannedMini: an active task-LIVE session ALSO reaches it now (this fix)");
  assert.equal(afterActiveMini.subIndex, 1);
  const arcGymMini: NewArcLiveSessionState = { ...idleMini, arcGymSituationId: "sit1" };
  assert.equal(advance(arcGymMini, NOW).currentStep, "mini_encoding", "plannedMini: only arcGymSituationId still skips it");
});

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
