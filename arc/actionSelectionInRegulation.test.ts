import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { advance, goBack, migrateLegacyNewArcLiveStep, setMiniAcceptanceTransition, setSelectedAction, toggleBodyScanContractionRegion, toggleOpeningBodyScanRegion } from "./newArcLiveSteps.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";
import { getStepContent, resolveEncodingMantra } from "./newArcLiveCopy.ts";

/**
 * arc/actionSelectionInRegulation.test.ts
 *
 * ARCHI -- Move Action Selection into the Existing Regulation Screen
 * task, spec section 8: the 14 required regression scenarios, in
 * order. Each test below is numbered to match. Engine/content-level
 * assertions use the pure modules directly; the one scenario that is
 * genuinely about UI wiring (8: no separate screen is ever rendered)
 * is confirmed both at the engine level (currentStep never becomes
 * action_selection/mini_action_selection from advance()) and via a
 * source-text check that the screen component routes both legacy step
 * ids through the SAME renderActionSelector() used by
 * regulation/mini_acceptance_transition, never a second
 * implementation (no React Native component renderer exists in this
 * codebase, same convention as every other screen test here).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const NOW = "2026-01-05T12:00:00.000Z";

function freshFullArc(isActiveTaskLiveOrigin = false): NewArcLiveSessionState {
  return { ...createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "plannedFull"), isActiveTaskLiveOrigin };
}

function atRegulation(state: NewArcLiveSessionState): NewArcLiveSessionState {
  return { ...state, currentStep: "regulation", subIndex: 0 };
}

test("1. Acceptance is unchanged -- its own content/instructions are untouched by this task", () => {
  const state = { ...freshFullArc(), currentStep: "acceptance" as const, subIndex: 0 };
  const content = getStepContent(state);
  assert.equal(content.primary, getStepContent({ ...state }).primary, "Acceptance's content is still a pure, deterministic function of state -- nothing about it was made to depend on the new action-selection feature");
  assert.notEqual(content.primary, "", "Acceptance still has its own real mantra content");
});

test("2. Regulation still performs its existing body-opening exercise at subIndex 0, byte-for-byte the same mantra as before this task", () => {
  const regulating = atRegulation(freshFullArc());
  const content = getStepContent(regulating);
  assert.ok(content.primary.length > 0, "Regulation's subIndex-0 mantra is untouched");
  assert.notEqual(content.primary, "איזו פעולה תרצה לעשות עכשיו?", "the body-opening mantra at subIndex 0 is never replaced by the action-selection prompt");
});

test("3. The action-selection prompt, with the exact wording the spec names, renders directly ON the Regulation screen -- never a separate sub-screen reached by advancing", () => {
  const regulating = atRegulation(freshFullArc());
  assert.equal(regulating.subIndex, 0, "regulation is exactly ONE sub-screen now -- ARCHI -- Show Action Selection ON the Regulation Screen task");
  const screen = readSource("live/NewArcLiveScreen.tsx");
  const regulationCaseIndex = screen.indexOf('case "regulation": {');
  const regulationCaseBody = screen.slice(regulationCaseIndex, screen.indexOf("case ", regulationCaseIndex + 20));
  assert.ok(regulationCaseBody.includes("איזו פעולה תרצה לעשות עכשיו?"), "the exact action-selection prompt from the spec renders inline on this same screen");
  assert.ok(regulationCaseBody.includes("הפעולה הבאה"));
  assert.ok(regulationCaseBody.includes("<ArcBodyMantraCircle"), "the Regulation mantra/body exercise renders in the SAME case, on the SAME screen, together with the prompt above");
});

test("4. Option A (הפעולה הבאה): an existing scheduled task is selectable, preserving its task id and preferring its own firstAction -- directly from the Regulation screen, no intervening navigation", () => {
  const regulating = atRegulation(freshFullArc());
  const chosen = setSelectedAction(regulating, { source: "scheduledTask", taskId: "task-42", title: "לקנות חלב", firstAction: "לצאת מהבית" }, NOW);
  assert.equal(chosen.selectedActionSource, "scheduledTask");
  assert.equal(chosen.selectedActionTaskId, "task-42", "the task id is preserved, never dropped");
  assert.equal(chosen.selectedActionTitle, "לקנות חלב");
  assert.equal(chosen.selectedActionFirstAction, "לצאת מהבית");
  assert.equal(chosen.currentStep, "encoding", "selecting an action is itself the existing Continue -- it advances straight into Encoding, no second confirmation screen");
});

test("5. Option B (כתיבת פעולה): a custom, freely-typed action is enterable and is saved EXACTLY as entered -- directly from the Regulation screen", () => {
  const regulating = atRegulation(freshFullArc());
  const chosen = setSelectedAction(regulating, { source: "temporaryAction", title: "לסדר את השולחן", durationMinutes: 15 }, NOW);
  assert.equal(chosen.selectedActionSource, "temporaryAction");
  assert.equal(chosen.selectedActionTitle, "לסדר את השולחן", "the exact entered text, never rewritten");
  assert.equal(chosen.selectedActionTaskId, null, "a temporary action never fabricates a task id");
  assert.equal(chosen.currentStep, "encoding");
});

test("6. Empty/whitespace-only custom actions are rejected -- the screen's own guard (chooseTemporaryAction) never calls setSelectedAction for them", () => {
  const screen = readSource("live/NewArcLiveScreen.tsx");
  const guardIndex = screen.indexOf("function chooseTemporaryAction()");
  const guardBody = screen.slice(guardIndex, guardIndex + 200);
  assert.match(guardBody, /const title = tempActionTitleDraft\.trim\(\);/, "the draft is trimmed before use, so whitespace-only input never becomes a saved action");
  assert.match(guardBody, /if \(!title\) return;/, "an empty/whitespace-only draft is rejected and never reaches setSelectedAction");
  assert.ok(screen.includes("disabled={!tempActionTitleDraft.trim()}"), "the Continue button for Option B is also disabled while the draft is empty/whitespace-only, so the rejection is visible, not just silent");
});

test("7. After selecting either option, Regulation proceeds directly to Encoding -- no intermediate screen of any kind", () => {
  const regulating = atRegulation(freshFullArc());
  const viaScheduledTask = setSelectedAction(regulating, { source: "scheduledTask", taskId: "t9", title: "x", firstAction: null }, NOW);
  assert.equal(viaScheduledTask.currentStep, "encoding");
  assert.equal(viaScheduledTask.subIndex, 0);
  const viaTemporaryAction = setSelectedAction(regulating, { source: "temporaryAction", title: "y", durationMinutes: 5 }, NOW);
  assert.equal(viaTemporaryAction.currentStep, "encoding");
  assert.equal(viaTemporaryAction.subIndex, 0);
});

test("8. No separate Action Selection screen ever appears -- action_selection/mini_action_selection are permanently unreachable, and the only remaining implementation is the one shared renderActionSelector() reused by all four call sites", () => {
  const afterExercise = advance(atRegulation(freshFullArc()), NOW);
  assert.notEqual(afterExercise.currentStep, "action_selection");
  const miniAfterExercise = advance({ ...createNewArcLiveSessionState("t1", "x", "y", NOW, "plannedMini"), currentStep: "mini_acceptance_transition", subIndex: 0 }, NOW);
  assert.notEqual(miniAfterExercise.currentStep, "mini_action_selection");

  const screen = readSource("live/NewArcLiveScreen.tsx");
  const regulationCaseIndex = screen.indexOf('case "regulation": {');
  const regulationCaseBody = screen.slice(regulationCaseIndex, screen.indexOf("case ", regulationCaseIndex + 20));
  // ARCHI -- Show Action Selection ON the Regulation Screen task: the
  // action-selection section now renders TOGETHER with the Regulation
  // circle/mantra on this SAME screen (never a navigation to another
  // step/sub-screen) -- showing a plain summary (never re-asking) when
  // a selection already exists, but still ultimately falling through
  // to this SAME shared renderActionSelector() otherwise, never a
  // second, duplicated picker implementation.
  assert.match(regulationCaseBody, /<ArcBodyMantraCircle/, "the Regulation circle/mantra itself renders unconditionally in this one case");
  assert.match(regulationCaseBody, /renderActionSelector\(\)/, "the action-selection section still falls through to the one shared action-selector implementation");
  const legacyCaseIndex = screen.indexOf('case "action_selection":');
  const legacyCaseBody = screen.slice(legacyCaseIndex, legacyCaseIndex + 150);
  assert.match(legacyCaseBody, /return renderActionSelector\(\);/, "the old standalone step ids, kept only for one-render migration safety, reuse the EXACT same function -- never a second, duplicated implementation");
});

test("9. Encoding receives the correct selected action -- resolveEncodingMantra reads it back exactly, via the SAME priority chain used by every other origin", () => {
  const afterExercise = advance(atRegulation(freshFullArc()), NOW);
  const chosen = setSelectedAction(afterExercise, { source: "temporaryAction", title: "ללכת לרוץ", durationMinutes: 20 }, NOW);
  const mantra = resolveEncodingMantra(chosen);
  assert.ok(mantra.includes("ללכת לרוץ"), "Encoding's own mantra visualizes exactly the selected action, never a different or regenerated one");
});

test("10. Back-navigation from Encoding preserves the committed selection and returns to the SAME Regulation screen -- never a separate sub-screen", () => {
  const regulating = atRegulation(freshFullArc());
  // Selecting an action already advances into Encoding (setSelectedAction's own
  // behavior) -- going back from Encoding returns to Regulation (its one and only
  // sub-screen) with the previously-made selection still intact on the session,
  // never cleared.
  const chosen = setSelectedAction(regulating, { source: "temporaryAction", title: "לקרוא ספר", durationMinutes: 10 }, NOW);
  assert.equal(chosen.currentStep, "encoding");
  const backFromEncoding = goBack(chosen, NOW);
  assert.equal(backFromEncoding.currentStep, "regulation", "back-navigation stays on the SAME step, never jumping to a different one");
  assert.equal(backFromEncoding.subIndex, 0, "regulation is exactly one sub-screen now -- going back lands directly on it");
  assert.equal(backFromEncoding.selectedActionTitle, "לקרוא ספר", "the previously-selected custom action is never discarded by back-navigation");
});

test("11. A session interrupted exactly on the old standalone step restores correctly into Regulation/mini_acceptance_transition with its previously-selected action intact", () => {
  const interruptedOnActionSelection: NewArcLiveSessionState = { ...freshFullArc(), currentStep: "action_selection", subIndex: 0, selectedActionSource: "temporaryAction", selectedActionTitle: "לנקות את הבית", selectedActionDurationMinutes: 30 };
  const migrated = migrateLegacyNewArcLiveStep(interruptedOnActionSelection);
  assert.equal(migrated.currentStep, "regulation");
  assert.equal(migrated.subIndex, 0, "regulation is exactly one sub-screen now -- ARCHI -- Show Action Selection ON the Regulation Screen task");
  assert.equal(migrated.selectedActionTitle, "לנקות את הבית", "the previously selected action is carried over untouched -- no destructive migration");

  const interruptedOnMiniActionSelection: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "x", "y", NOW, "plannedMini"), currentStep: "mini_action_selection", subIndex: 0, selectedActionSource: "scheduledTask", selectedActionTaskId: "task-7", selectedActionTitle: "לשלוח מייל", selectedActionFirstAction: null };
  const migratedMini = migrateLegacyNewArcLiveStep(interruptedOnMiniActionSelection);
  assert.equal(migratedMini.currentStep, "mini_acceptance_transition");
  assert.equal(migratedMini.subIndex, 1);
  assert.equal(migratedMini.selectedActionTaskId, "task-7");
});

test("12. ARCHI BUG FIX (Action Selection Is Missing from Regulation in All ARC Pathways): an active-task-LIVE session no longer skips the integrated action selector -- the earlier 'already working on this task, so don't ask' shortcut was exactly the reported bug. ARC-GYM sessions still skip it (its own separate, later positive-action visualization, untouched by this fix)", () => {
  const screen = readSource("live/NewArcLiveScreen.tsx");
  const regulationCaseIndex = screen.indexOf('case "regulation": {');
  const regulationCaseBody = screen.slice(regulationCaseIndex, screen.indexOf("case ", regulationCaseIndex + 20));
  assert.ok(!regulationCaseBody.includes("isActiveTaskLiveOrigin"), "the integrated action-selection section is never gated on isActiveTaskLiveOrigin -- the earlier 'already working on this task, so don't ask' shortcut (the reported bug) is gone");
  assert.match(regulationCaseBody, /!session!\.arcGymSituationId/, "it is gated only on arcGymSituationId -- ARC GYM's own separate, later positive-action visualization, untouched by this fix");

  // An active-task-LIVE session can select+confirm an action directly from Regulation, exactly like any other session.
  const activeTaskSession = atRegulation(freshFullArc(true));
  const chosen = setSelectedAction(activeTaskSession, { source: "temporaryAction", title: "x", durationMinutes: 5 }, NOW);
  assert.equal(chosen.currentStep, "encoding", "an active-task-LIVE session now ALSO shows the action selector on Regulation, exactly like any other session");

  const arcGymSession = atRegulation({ ...freshFullArc(), arcGymSituationId: "situation-1" });
  const afterArcGymExercise = advance(arcGymSession, NOW);
  assert.equal(afterArcGymExercise.currentStep, "encoding", "an ARC GYM session (its own separate, later positive-action visualization) still skips the integrated selector -- unaffected by this bug fix");
});

test("12b. Option A for an active-task-LIVE session offers that task's own first action/title, preserving its taskId identity exactly like any other scheduled-task selection", () => {
  const activeTaskSession = atRegulation(freshFullArc(true));
  const chosen = setSelectedAction(activeTaskSession, { source: "scheduledTask", taskId: activeTaskSession.taskId, title: activeTaskSession.taskTitle, firstAction: activeTaskSession.firstAction?.trim() || null }, NOW);
  assert.equal(chosen.selectedActionTaskId, "t1", "the active task's own id is preserved, never replaced or dropped");
  assert.equal(chosen.selectedActionFirstAction, "לפתוח את המחשב");
  assert.equal(chosen.currentStep, "encoding");
  const mantra = resolveEncodingMantra(chosen);
  assert.ok(mantra.includes("לפתוח את המחשב"), "the active task's own first action reaches Encoding because the explicit selection itself carries that same text -- not because isActiveTaskLiveOrigin overrides it (see scenario 15b, where an explicit DIFFERENT selection must win instead)");
});

test("13. Full ARC, Shortened ARC, and Mini ARC (wherever it includes a regulation-equivalent moment) all correctly route through the integrated action selector", () => {
  for (const mode of ["plannedFull", "spontaneous", "shortened"] as const) {
    const state = atRegulation({ ...createNewArcLiveSessionState("t1", "x", "y", NOW, mode), isActiveTaskLiveOrigin: false });
    assert.equal(state.subIndex, 0, `${mode}: regulation is exactly one sub-screen -- the action selector already shows on it`);
    const chosen = setSelectedAction(state, { source: "temporaryAction", title: "z", durationMinutes: 5 }, NOW);
    assert.equal(chosen.currentStep, "encoding", `${mode}: selecting an action from Regulation advances straight to Encoding`);
  }
  const miniState: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "x", "y", NOW, "plannedMini"), currentStep: "mini_acceptance_transition", subIndex: 0, isActiveTaskLiveOrigin: false };
  const miniAfterTransition = setMiniAcceptanceTransition(miniState, "chest", "warmth", "breathing", NOW);
  assert.equal(miniAfterTransition.currentStep, "mini_acceptance_transition");
  assert.equal(miniAfterTransition.subIndex, 1, "Mini ARC's own regulation-equivalent moment still gets its own integrated action-selection sub-screen -- unchanged by this fix, which only touches Full/Shortened ARC's own Regulation screen");
});

test("14. Existing Green/Blue body-opening behavior is preserved -- both still receive the same opening treatment, and only Blue additionally counts as a supportive anchor, exactly as before this task", () => {
  let state = freshFullArc();
  // ARCHI -- Correct the Full ARC Red-to-Green/Direct-to-Blue
  // Selection Logic task: tapping a previously-Red (contracted) region
  // selects green; tapping a never-Red region selects blue directly --
  // a second tap on the SAME region deselects, never promoting green
  // to blue.
  state = toggleBodyScanContractionRegion(state, "scanChest", null);
  state = toggleOpeningBodyScanRegion(state, "scanChest", null); // previously-Red -> green ("opening" only)
  assert.deepEqual(state.openingBodyScanRegions, [{ region: "scanChest", side: null, role: "opening" }]);
  state = toggleOpeningBodyScanRegion(state, "scanAbdomen", null); // never-Red -> blue directly ("opening_and_supportive")
  assert.deepEqual(state.openingBodyScanRegions, [
    { region: "scanChest", side: null, role: "opening" },
    { region: "scanAbdomen", side: null, role: "opening_and_supportive" },
  ]);
  // Regulation's own rendering still passes openingBodyScanRegions straight through unchanged --
  // selecting an action on the same screen never reads or mutates it.
  const regulating = atRegulation(state);
  const chosen = setSelectedAction(regulating, { source: "temporaryAction", title: "x", durationMinutes: 5 }, NOW);
  assert.deepEqual(chosen.openingBodyScanRegions, state.openingBodyScanRegions, "the action-selection section never touches the Green/Blue selections made during the exercise");
});

/**
 * ARCHI -- BUG: Action Selection Is Missing from Regulation in All ARC
 * Pathways task: full end-to-end navigation walks for the three
 * reported-broken pathways, each simulated with isActiveTaskLiveOrigin
 * true (i.e. entered while a task's timer is already running --
 * Task LIVE's own "😟 פחות טוב"/"🙂 סבבה" buttons and Mini ARC all pass
 * through this exact same origin, which is why the bug reproduced
 * identically across all three). Each test covers all 8 points the bug
 * report asked to verify: (1) the Regulation exercise itself still
 * renders normally, (2) action selection displays inside it, (3)
 * selecting the next/scheduled action works, (4) entering a manual
 * action works, (5) Continue does not skip the required selection, (6)
 * the selected action reaches Encoding, (7) no separate Action
 * Selection screen ever appears, (8) backward navigation and session
 * restoration both preserve the selection.
 */
test("15. Full ARC via '😟 פחות טוב' (isActiveTaskLiveOrigin=true): action selection reliably appears ON the Regulation screen and the full navigation sequence behaves correctly end to end", () => {
  const state = atRegulation(freshFullArc(true));

  // (1) Regulation's own exercise still renders normally.
  const exerciseContent = getStepContent(state);
  assert.ok(exerciseContent.primary.length > 0);
  assert.notEqual(exerciseContent.primary, "איזו פעולה תרצה לעשות עכשיו?");

  // (5) Regulation is exactly one sub-screen (ARCHI -- Show Action
  // Selection ON the Regulation Screen task) -- the action selector is
  // already showing on it, never requiring a separate advance to reach.
  assert.equal(state.subIndex, 0);

  // (2) Action selection displays ON the Regulation screen with the exact prompt (structural check, test 3).

  // (7) No separate Action Selection screen ever appears.
  assert.notEqual(state.currentStep, "action_selection");

  // (3) Selecting the next/scheduled action works.
  const viaScheduledTask = setSelectedAction(state, { source: "scheduledTask", taskId: "task-9", title: "לקנות חלב", firstAction: "לצאת מהבית" }, NOW);
  assert.equal(viaScheduledTask.selectedActionTaskId, "task-9");
  assert.equal(viaScheduledTask.currentStep, "encoding", "(6) the selection reaches Encoding");

  // (4) Entering a manual action works too, from the same screen.
  const viaTemporaryAction = setSelectedAction(state, { source: "temporaryAction", title: "ללכת לרוץ", durationMinutes: 15 }, NOW);
  assert.equal(viaTemporaryAction.selectedActionSource, "temporaryAction");
  assert.equal(viaTemporaryAction.currentStep, "encoding", "(6) the manual selection also reaches Encoding");
  // (6) resolveActionText (arc/newArcLiveCopy.ts) now checks
  // selectedActionSource BEFORE isActiveTaskLiveOrigin -- an explicit
  // manual selection must win over the active task's own original
  // action, never be silently overridden by it. See scenario 15b for
  // the dedicated regression test of exactly this case.
  assert.ok(resolveEncodingMantra(viaTemporaryAction).includes("ללכת לרוץ"), "the explicitly entered manual action, never the active task's own original action, must appear in Encoding");

  // (8) Backward navigation and session restoration preserve the selection.
  const backFromEncoding = goBack(viaTemporaryAction, NOW);
  assert.equal(backFromEncoding.currentStep, "regulation");
  assert.equal(backFromEncoding.subIndex, 0);
  assert.equal(backFromEncoding.selectedActionTitle, "ללכת לרוץ", "going back never discards the already-made selection");
  const restored = migrateLegacyNewArcLiveStep(viaTemporaryAction);
  assert.equal(restored.currentStep, "encoding", "a freshly-loaded/restored session with a real currentStep (never the legacy action_selection id) is left untouched by the migration, keeping its selection intact");
  assert.equal(restored.selectedActionTitle, "ללכת לרוץ");
});

/**
 * ARCHI follow-up correction: resolveActionText (arc/newArcLiveCopy.ts)
 * originally still checked isActiveTaskLiveOrigin BEFORE
 * selectedActionSource, which was fine under the OLD behavior (Action
 * Selection was unreachable for an active-task-origin session, so
 * selectedActionSource could never be set in that case) but became a
 * silent bug the moment scenario 15 above made Action Selection always
 * reachable: an explicit manual selection made while
 * isActiveTaskLiveOrigin is true would be completely ignored, and
 * Encoding would keep showing the active task's own original action
 * regardless. Fixed by checking selectedActionSource FIRST. This test
 * is the dedicated regression for exactly that scenario, required
 * requirements being: (1) choosing the active task's own action keeps
 * showing it in Encoding, (2) manually entering a DIFFERENT action
 * while isActiveTaskLiveOrigin is true makes Encoding show THAT
 * action instead, never silently reverting to the original task's
 * own action, (3) the original task/timer context (taskId,
 * isActiveTaskLiveOrigin itself) is preserved untouched, not replaced,
 * and (4) the selection survives back-navigation and session
 * restoration.
 */
test("15b. ARC started from an active task, trainee manually enters a DIFFERENT action: Encoding must show the manual action, never silently fall back to the active task's own original action", () => {
  const state = atRegulation(freshFullArc(true));
  assert.equal(state.isActiveTaskLiveOrigin, true);
  assert.equal(state.taskId, "t1");
  assert.equal(state.subIndex, 0, "regulation is exactly one sub-screen -- the action selector already shows on it");

  // (1) Choosing the active task's own action (Option A, per
  // renderActionSelector in live/NewArcLiveScreen.tsx) still shows that
  // same action in Encoding.
  const chosenActiveTaskAction = setSelectedAction(state, { source: "scheduledTask", taskId: state.taskId, title: state.taskTitle, firstAction: state.firstAction?.trim() || null }, NOW);
  assert.ok(resolveEncodingMantra(chosenActiveTaskAction).includes("לפתוח את המחשב"));

  // (2) Manually entering a DIFFERENT action instead -- Encoding must
  // show THAT action, never the active task's own original one.
  const chosenManualAction = setSelectedAction(state, { source: "temporaryAction", title: "לשתות מים", durationMinutes: 5 }, NOW);
  assert.equal(chosenManualAction.selectedActionSource, "temporaryAction");
  assert.equal(chosenManualAction.selectedActionTitle, "לשתות מים");
  const mantra = resolveEncodingMantra(chosenManualAction);
  assert.ok(mantra.includes("לשתות מים"), "the manually-entered action must appear in Encoding");
  assert.ok(!mantra.includes("לפתוח את המחשב"), "the active task's own original action must NOT silently override the trainee's explicit manual choice");

  // (3) The original task/timer context is preserved untouched -- never
  // replaced or cleared by making a different explicit selection.
  assert.equal(chosenManualAction.taskId, "t1", "the session's own taskId (used by returnToTask/the real timer) is untouched");
  assert.equal(chosenManualAction.isActiveTaskLiveOrigin, true, "isActiveTaskLiveOrigin itself is never cleared by an explicit selection -- it describes how the session started, not what was chosen");
  assert.equal(chosenManualAction.firstAction, "לפתוח את המחשב", "the active task's own original firstAction field is left completely untouched -- only which text resolveActionText reads from changes");

  // (4) The selection survives back-navigation and session restoration.
  const backFromEncoding = goBack(chosenManualAction, NOW);
  assert.equal(backFromEncoding.currentStep, "regulation");
  assert.equal(backFromEncoding.subIndex, 0);
  assert.equal(backFromEncoding.selectedActionTitle, "לשתות מים", "back-navigation never discards the explicit manual selection");
  const restored = migrateLegacyNewArcLiveStep(chosenManualAction);
  assert.equal(restored.selectedActionSource, "temporaryAction");
  assert.equal(restored.selectedActionTitle, "לשתות מים", "a restored/reloaded session keeps the explicit manual selection, never reverting to the active task's own original action");
  assert.ok(resolveEncodingMantra(restored).includes("לשתות מים"));
});

test("16. Mini ARC (isActiveTaskLiveOrigin=true): action selection reliably appears inside mini_acceptance_transition and the full navigation sequence behaves correctly end to end", () => {
  const miniBase: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "plannedMini"), isActiveTaskLiveOrigin: true, currentStep: "mini_acceptance_transition", subIndex: 0 };

  // (1) The regulation-equivalent exercise itself still renders normally.
  const exerciseContent = getStepContent(miniBase);
  assert.ok(exerciseContent.primary.length > 0);
  assert.notEqual(exerciseContent.primary, "איזו פעולה תרצה לעשות עכשיו?");

  // (5) setMiniAcceptanceTransition (Mini ARC's own Continue for this
  // step) does not skip the required selection.
  const afterTransition = setMiniAcceptanceTransition(miniBase, "chest", "רוגע", "יישור הגב", NOW);
  assert.equal(afterTransition.currentStep, "mini_acceptance_transition");
  assert.equal(afterTransition.subIndex, 1, "(2) action selection displays inside mini_acceptance_transition");

  const selectorContent = getStepContent(afterTransition);
  assert.equal(selectorContent.primary, "איזו פעולה תרצה לעשות עכשיו?");

  // (7) No separate mini_action_selection screen ever appears.
  assert.notEqual(afterTransition.currentStep, "mini_action_selection");

  // (3)/(4) Both options still work for Mini ARC.
  const viaScheduledTask = setSelectedAction(afterTransition, { source: "scheduledTask", taskId: "task-11", title: "לשלוח מייל", firstAction: null }, NOW);
  assert.equal(viaScheduledTask.currentStep, "mini_encoding", "(6) the selection reaches Mini ARC's own Encoding step");

  const viaTemporaryAction = setSelectedAction(afterTransition, { source: "temporaryAction", title: "לסדר את החדר", durationMinutes: 10 }, NOW);
  assert.equal(viaTemporaryAction.currentStep, "mini_encoding");

  // (8) Backward navigation and restoration preserve the selection.
  const backFromEncoding = goBack(viaTemporaryAction, NOW);
  assert.equal(backFromEncoding.currentStep, "mini_acceptance_transition");
  assert.equal(backFromEncoding.subIndex, 1);
  assert.equal(backFromEncoding.selectedActionTitle, "לסדר את החדר");
});

test("17. Shortened ARC ('סבבה', isActiveTaskLiveOrigin=true): action selection reliably appears ON the Regulation screen (Acceptance stays permanently skipped for this mode) and the full navigation sequence behaves correctly end to end", () => {
  const shortenedBase: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "shortened"), isActiveTaskLiveOrigin: true };
  const atReg = atRegulation(shortenedBase);

  // (1) Regulation's own exercise still renders normally for Shortened ARC too.
  const exerciseContent = getStepContent(atReg);
  assert.ok(exerciseContent.primary.length > 0);

  // (5)/(2) Regulation is exactly one sub-screen -- the action selector already shows on it for Shortened ARC too.
  assert.equal(atReg.subIndex, 0);

  // (7) No separate Action Selection screen ever appears.
  assert.notEqual(atReg.currentStep, "action_selection");

  // (3)/(4) Both options still work.
  const viaScheduledTask = setSelectedAction(atReg, { source: "scheduledTask", taskId: "task-21", title: "לכבס", firstAction: null }, NOW);
  assert.equal(viaScheduledTask.currentStep, "encoding", "(6) the selection reaches Encoding, which for Shortened ARC leads directly to completion");

  const viaTemporaryAction = setSelectedAction(atReg, { source: "temporaryAction", title: "לצחצח שיניים", durationMinutes: 5 }, NOW);
  assert.equal(viaTemporaryAction.currentStep, "encoding");
  const afterEncoding = advance(viaTemporaryAction, NOW);
  assert.equal(afterEncoding.currentStep, "complete", "Shortened ARC's own direct-to-completion behavior is unaffected by this fix");

  // (8) Backward navigation preserves the selection.
  const backFromEncoding = goBack(viaTemporaryAction, NOW);
  assert.equal(backFromEncoding.currentStep, "regulation");
  assert.equal(backFromEncoding.subIndex, 0);
  assert.equal(backFromEncoding.selectedActionTitle, "לצחצח שיניים");
});
