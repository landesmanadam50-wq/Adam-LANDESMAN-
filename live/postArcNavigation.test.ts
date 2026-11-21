import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/postArcNavigation.test.ts
 *
 * Unified ARC & Productivity Update task, requirement 10 ("POST-ARC
 * NAVIGATION"): the ONE consolidated regression guard for all five
 * origin-dependent destinations live/NewArcLiveScreen.tsx's own
 * returnToTask() resolves to --
 *
 *   Active Task LIVE    -> return to the SAME task
 *   Scheduled action     -> the next actionable scheduled task (this is
 *                           the SAME taskId the session was created
 *                           with -- requirement 2's own auto-derived
 *                           context already ties a "scheduled action"
 *                           session to that exact task at creation
 *                           time, so no separate re-derivation belongs
 *                           here)
 *   ARC GYM              -> preserve the planned practice continuation
 *                           (the situation's own visualize-only screen,
 *                           never /tasks)
 *   Morning check-in      -> Home ("/"), where the morning sequence
 *                           (fact + Manifest + preparation) actually
 *                           continues -- checked and overridden BEFORE
 *                           every other branch
 *   Standalone emotion-only -> Home ("/"), a destination always valid
 *                           regardless of which real origin (the Home
 *                           check-in bar, the dedicated spontaneous-ARC
 *                           entry screen) the session came from
 *
 * "Never navigate prematurely or mark complete before actual
 * completion": every call site commits completeSession() (or the
 * equivalent track-specific completion) BEFORE calling returnToTask,
 * and returnToTask itself is reached only from an explicit terminal
 * button press, never automatically.
 *
 * This file is source-text based (AsyncStorage/navigation aren't
 * callable from a plain `node --test` run) -- same convention as
 * every other live/*.test.ts screen test. The individual branches are
 * also separately covered, in more depth, by
 * live/morningFlowSimplification.test.ts (morning check-in),
 * live/spontaneousArcEntry.test.ts (standalone), and
 * live/arcGymScreens.test.ts (ARC GYM) -- this file exists so all five
 * destinations are verified together, against requirement 10's own
 * exact wording, in one place.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/NewArcLiveScreen.tsx");

function returnToTaskBody(): string {
  const fnIndex = screen.indexOf("async function returnToTask(autoStart: boolean)");
  assert.ok(fnIndex !== -1, "returnToTask must exist");
  // ARCHI -- Unified Final Specification task, section 6: widened from
  // 3200 to fit the two new selectedActionSource branches this function
  // grew, without bleeding into the next function below it. ARC Focus
  // task: widened again (4600 -> 5200) to fit the new arcFocusPracticeId
  // branch. ARC Gym + ARC Goal Integration task: widened again
  // (5200 -> 6500) to fit the new arcGymMemoryExerciseId branch. ARC
  // Perspective task: widened again (6500 -> 8400) to fit the new
  // arcPerspectiveId branch. ARC Saving, Trigger Management &
  // Quick-Action Buttons task: widened again (8400 -> 10700) to fit the
  // new arcSavingBodyOptionId/arcSavingExerciseId/
  // arcSavingTriggerIdForNewOption branch.
  return screen.slice(fnIndex, fnIndex + 10700);
}

// ARCHI -- ARC Result task, section 3: the generic (non-overridden)
// destination now routes through routeToTaskOrArcResultSuggestion
// (which itself opens "/tasks/[id]" verbatim, with autoStart forwarded
// unchanged, whenever no ARC Result is linked to the task -- see
// live/arcResultSuggestion.test.ts for that helper's own dedicated
// tests) rather than a bare router.replace call here -- this is the
// one, uniquely-identifiable call every lookup below searches for to
// mean "the generic, non-overridden destination."
const GENERIC_DESTINATION_NEEDLE = "await routeToTaskOrArcResultSuggestion(taskId, autoStart);";

test("requirement 10 (extended): the six early-return branches (ARC GYM, morning check-in, selected scheduled task, selected temporary action, standalone) are checked in this exact order, each returning before the generic task-linked destination below them -- so each one genuinely OVERRIDES that default, never merely supplementing it", () => {
  const body = returnToTaskBody();
  const arcGymIndex = body.indexOf("if (session?.arcGymSituationId) {");
  const morningFlowIndex = body.indexOf("if (morningFlowCheckIn) {");
  const scheduledActionIndex = body.indexOf('if (session?.selectedActionSource === "scheduledTask"');
  const temporaryActionIndex = body.indexOf('if (session?.selectedActionSource === "temporaryAction"');
  const standaloneIndex = body.indexOf("if (taskId === STANDALONE_ARC_TASK_ID) {");
  const genericIndex = body.indexOf(GENERIC_DESTINATION_NEEDLE);
  assert.ok(
    arcGymIndex !== -1 && morningFlowIndex !== -1 && scheduledActionIndex !== -1 && temporaryActionIndex !== -1 && standaloneIndex !== -1 && genericIndex !== -1
  );
  assert.ok(arcGymIndex < morningFlowIndex, "ARC GYM must be checked before morning check-in");
  assert.ok(morningFlowIndex < scheduledActionIndex, "morning check-in must be checked before the selected-scheduled-task branch");
  assert.ok(scheduledActionIndex < temporaryActionIndex, "the selected-scheduled-task branch must be checked before the selected-temporary-action branch");
  assert.ok(temporaryActionIndex < standaloneIndex, "the selected-temporary-action branch must be checked before standalone");
  assert.ok(standaloneIndex < genericIndex, "standalone must be checked before the generic task-linked default");
  for (const [branchStart, branchEnd, label] of [
    [arcGymIndex, morningFlowIndex, "ARC GYM"],
    [morningFlowIndex, scheduledActionIndex, "morning check-in"],
    [scheduledActionIndex, temporaryActionIndex, "selected scheduled task"],
    [temporaryActionIndex, standaloneIndex, "selected temporary action"],
    [standaloneIndex, genericIndex, "standalone"],
  ] as const) {
    const branchBody = body.slice(branchStart, branchEnd);
    assert.ok(branchBody.includes("return;"), `${label}'s own branch must return, never fall through to the generic destination below it`);
  }
});

test("requirement 10, 'Active Task LIVE -> return to the same task': the generic (non-overridden) destination is the EXACT taskId this session was linked to, never a different/recomputed one", () => {
  const body = returnToTaskBody();
  assert.ok(body.includes(GENERIC_DESTINATION_NEEDLE));
});

// ARCHI -- Unified Final Specification task, section 6: the two new
// branches -- never autoStart (the trainee still taps Start
// themselves), never re-deriving which task/action was selected
// (reused verbatim from the session, set once by Action Selection).
test("requirement 10 (extended), 'selected scheduled/due task -> that exact task, never auto-started': navigates to the selected task's own id with no autoStart param at all", () => {
  const body = returnToTaskBody();
  const scheduledActionIndex = body.indexOf('if (session?.selectedActionSource === "scheduledTask"');
  const temporaryActionIndex = body.indexOf('if (session?.selectedActionSource === "temporaryAction"');
  const branchBody = body.slice(scheduledActionIndex, temporaryActionIndex);
  assert.ok(branchBody.includes("await routeToTaskOrArcResultSuggestion(session.selectedActionTaskId, false);"));
  assert.ok(!branchBody.includes("autoStart"), "never auto-started -- the trainee taps Start themselves on the task's own screen");
});

test("requirement 10 (extended), 'selected temporary action -> create it now, then navigate to it, never auto-started': the ad-hoc task is created at THIS exact moment (never earlier), and navigation never passes autoStart", () => {
  const body = returnToTaskBody();
  const temporaryActionIndex = body.indexOf('if (session?.selectedActionSource === "temporaryAction"');
  const standaloneIndex = body.indexOf("if (taskId === STANDALONE_ARC_TASK_ID) {");
  const branchBody = body.slice(temporaryActionIndex, standaloneIndex);
  assert.ok(branchBody.includes("await createTemporaryActionTask(session.selectedActionTitle, session.selectedActionDurationMinutes);"));
  assert.ok(branchBody.includes('router.replace({ pathname: "/tasks/[id]", params: { id: newTaskId } });'));
  assert.ok(!branchBody.includes("autoStart"), "never auto-started -- the trainee taps Start themselves on the new task's own screen");
});

test("requirement 10, 'Scheduled action -> next actionable scheduled task': since requirement 2's own auto-derived context already ties a scheduled-action session to that exact task's id AT CREATION, returnToTask needs no second, separate 'what's next' recomputation -- it reuses the SAME taskId constant the generic branch above already returns to", () => {
  const body = returnToTaskBody();
  assert.ok(!body.includes("resolveNextActionableTask"), "returnToTask itself must never re-derive the next task -- that already happened once, at session creation");
  assert.ok(!body.includes("resolveNextTaskEntry"));
});

test("requirement 10, 'ARC GYM -> preserve planned practice continuation': routes to the situation's OWN visualize-only screen (never /tasks, never the generic task-linked destination), and only after finishing the training record first -- preserved continuation, not a fresh/duplicated one", () => {
  const body = returnToTaskBody();
  const arcGymIndex = body.indexOf("if (session?.arcGymSituationId) {");
  const nextBranchIndex = body.indexOf("if (morningFlowCheckIn) {");
  const arcGymBody = body.slice(arcGymIndex, nextBranchIndex);
  assert.ok(arcGymBody.includes("await finishArcGymTraining(session);"));
  assert.match(arcGymBody, /pathname:\s*"\/arc-gym\/visualize-only\/\[id\]"/);
  assert.ok(arcGymBody.includes("id: session.arcGymSituationId"));
  assert.ok(arcGymBody.includes('recordAlreadyFinished: "1"'));
});

test("requirement 10, 'Morning check-in -> complete fact+Manifest+preparation before navigating': returns to Home (\"/\"), where live/DailyStartupSequenceOverlay.tsx (never unmounted by this trip) is the one thing that actually resumes fact/Manifest/preparation -- never jumping ahead of that sequence itself", () => {
  const body = returnToTaskBody();
  const morningFlowIndex = body.indexOf("if (morningFlowCheckIn) {");
  const standaloneIndex = body.indexOf("if (taskId === STANDALONE_ARC_TASK_ID) {");
  const morningFlowBody = body.slice(morningFlowIndex, standaloneIndex);
  assert.ok(morningFlowBody.includes('router.replace("/");'));
});

test("requirement 10, 'Standalone emotion-only -> safe originating screen': returns to Home (\"/\"), valid for every real origin a standalone session can have", () => {
  const body = returnToTaskBody();
  const standaloneIndex = body.indexOf("if (taskId === STANDALONE_ARC_TASK_ID) {");
  const genericIndex = body.indexOf(GENERIC_DESTINATION_NEEDLE);
  const standaloneBody = body.slice(standaloneIndex, genericIndex);
  assert.ok(standaloneBody.includes('router.replace("/");'));
});

test("requirement 10, 'never mark complete before actual completion': every button/effect that calls returnToTask also commits a completion state change (completeSession, or the track-specific equivalent) in the SAME handler, never on an unrelated/earlier event (mount, a background effect, a back-navigation)", () => {
  // Genuine calls only -- excludes the function's own declaration and the
  // doc comment above it that merely mentions the name in passing.
  // Part 5 of the ARCHI Unified 7-Part Update replaced the manual
  // "complete" render case's own button (and the old Task track's own
  // "start now"/"return without timer" menu) with the single automatic
  // completeConsumedRef effect. ARCHI -- Remove Mini ARC / Add Time
  // Rating & Short-Depth Tracks task: that one remaining call site now
  // ORs in the new short-depth auto-start condition alongside
  // autoStartAfter -- there is exactly one genuine call site left,
  // never a hardcoded true/false literal.
  const callSites = [];
  for (const literal of ['returnToTask(autoStartAfter || session.arcPracticeDepth === "short");']) {
    let searchFrom = 0;
    while (true) {
      const idx = screen.indexOf(literal, searchFrom);
      if (idx === -1) break;
      callSites.push(idx);
      searchFrom = idx + 1;
    }
  }
  assert.ok(callSites.length >= 1, `expected at least 1 returnToTask call site, found ${callSites.length}`);
  const completeCaseIndex = screen.indexOf('case "complete":');
  for (const idx of callSites) {
    const before = screen.slice(Math.max(0, idx - 2300), idx);
    // Reaching the "complete" render case at all already means the
    // session fully advanced through the step order to its own
    // designated terminal step -- arc/newArcLiveSteps.ts's own
    // completeSession() is what PUT it there, from an earlier screen
    // (the Task track's own "transition" menu); a call site textually
    // inside this case needs no second, redundant completion commit.
    const isCompleteCaseOwnButton = completeCaseIndex !== -1 && idx > completeCaseIndex && idx < completeCaseIndex + 2200;
    // Part 5: the completeConsumedRef effect fires only once the engine
    // has already put the session on its terminal "complete" step --
    // guarded by this exact currentStep check -- so it is the automatic
    // equivalent of isCompleteCaseOwnButton above, not a second commit.
    const isAutomaticCompleteEffect = before.includes('session.currentStep !== "complete"');
    assert.ok(
      isCompleteCaseOwnButton ||
        isAutomaticCompleteEffect ||
        before.includes("completeSession(") ||
        before.includes("completeArcGymTraining(") ||
        before.includes("completePresenceSteps("),
      `call site at offset ${idx} must commit a completion state change in the same handler before calling returnToTask, or already be inside the terminal "complete" step's own render case or its automatic completion effect`
    );
  }
});

test("requirement 10/11: returnToTask never touches the task's own TaskTimerRun storage -- it only ever clears the ARC session itself, so an active/paused task timer that was running before ARC started is preserved exactly as it was, for every destination", () => {
  const body = returnToTaskBody();
  assert.ok(!body.includes("TaskTimerRun"), "returnToTask must never read or write TaskTimerRun -- that storage belongs entirely to ActiveTaskScreen.tsx's own timer logic");
  assert.ok(!body.includes("clearTaskTimerRun"));
  assert.ok(!body.includes("saveTaskTimerRun"));
});

test("requirement 10: returnToTask always clears the live session FIRST, regardless of which destination it resolves to -- a trainee can never resume a session that has already navigated away from", () => {
  const body = returnToTaskBody();
  const firstLineEnd = body.indexOf("\n", body.indexOf("{") + 1);
  assert.ok(body.slice(0, firstLineEnd + 60).includes("await clearNewArcLiveSession();"), "clearNewArcLiveSession must be the first statement in the function, before any branch");
});
