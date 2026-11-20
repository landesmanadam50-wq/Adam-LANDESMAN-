import test from "node:test";
import assert from "node:assert/strict";

/**
 * arc/selfObservationStep.test.ts
 *
 * "התבוננות וחיבור לעצמי" (self-observation and self-connection) task:
 * pure-logic regression tests for the new self_observation_choice/
 * self_observation_exercise step pair, covering the spec's own section
 * 8 required-test list (scenarios that are expressible as pure engine
 * behavior; the UI-rendering/personal-name-storage scenarios are
 * covered in live/selfObservationStep.test.ts, following this
 * codebase's own two-file convention for every other ARC LIVE step).
 */

import {
  NEW_ARC_LIVE_STEP_ORDER,
  NEW_ARC_MINI_STEP_ORDER,
  advance,
  declineSelfObservation,
  goBack,
  proceedToSelfObservationExercise,
  resolveNextStep,
  resolvePreviousStep,
  resolveStepOrder,
} from "./newArcLiveSteps.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function fresh(mode: NewArcLiveSessionState["arcInvocationMode"] = "plannedFull"): NewArcLiveSessionState {
  return { ...createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW), arcInvocationMode: mode };
}

// Required test 1: the choice screen appearing in both pathways -- Full
// ARC's own "מרגיש פחות טוב" pathway (arcInvocationMode === "spontaneous")
// and Mini ARC (arcInvocationMode === "plannedMini") -- and NOT in any
// other Full ARC entry point.

test("self_observation_choice is reachable for 'spontaneous' (the 'מרגיש פחות טוב' pathway) and 'plannedMini' (Mini ARC), and ONLY those two modes", () => {
  for (const mode of ["spontaneous", "plannedMini"] as const) {
    const { step } = resolveNextStep(fresh(mode));
    assert.equal(step, "self_observation_choice", `mode "${mode}" must walk forward from goal_select straight into self_observation_choice`);
  }
  for (const mode of ["plannedFull", "shortened"] as const) {
    const { step } = resolveNextStep(fresh(mode));
    assert.equal(step, "free_breathing", `mode "${mode}" must skip self_observation_choice entirely, walking straight to free_breathing`);
  }
});

test("the choice screen is present in BOTH step-order arrays, positioned right before free_breathing (or at Mini ARC's own genuine start, since Mini ARC has no free-breathing-less branch to special-case)", () => {
  assert.ok(NEW_ARC_LIVE_STEP_ORDER.includes("self_observation_choice"));
  assert.ok(NEW_ARC_MINI_STEP_ORDER.includes("self_observation_choice"));
  const fullFreeBreathingIdx = NEW_ARC_LIVE_STEP_ORDER.indexOf("free_breathing");
  const fullChoiceIdx = NEW_ARC_LIVE_STEP_ORDER.indexOf("self_observation_choice");
  assert.ok(fullChoiceIdx < fullFreeBreathingIdx, "self_observation_choice must sit before free_breathing in the Full ARC order");
  const miniFreeBreathingIdx = NEW_ARC_MINI_STEP_ORDER.indexOf("free_breathing");
  const miniChoiceIdx = NEW_ARC_MINI_STEP_ORDER.indexOf("self_observation_choice");
  assert.ok(miniChoiceIdx < miniFreeBreathingIdx, "self_observation_choice must sit before free_breathing in the Mini ARC order too");
});

test("a real 'spontaneous' session's own forward walk from goal_select reaches self_observation_choice before free_breathing", () => {
  let state = fresh("spontaneous");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "self_observation_choice");
});

test("a real 'plannedMini' session's own forward walk from goal_select reaches self_observation_choice before free_breathing", () => {
  let state = fresh("plannedMini");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "self_observation_choice");
});

// Required test 2: entering the exercise via the first option.

test("proceedToSelfObservationExercise commits the 'exercise' choice and jumps straight to self_observation_exercise", () => {
  let state: NewArcLiveSessionState = { ...fresh("spontaneous"), currentStep: "self_observation_choice" };
  state = proceedToSelfObservationExercise(state, NOW);
  assert.equal(state.selfObservationChoice, "exercise");
  assert.equal(state.currentStep, "self_observation_exercise");
  assert.equal(state.subIndex, 0);
});

test("self_observation_exercise is reachable once, and only once, selfObservationChoice is 'exercise' -- resolveNextStep from the choice screen only ever lands there in that one case", () => {
  for (const choice of [null, "skip"] as const) {
    const state: NewArcLiveSessionState = { ...fresh("spontaneous"), currentStep: "self_observation_choice", selfObservationChoice: choice };
    assert.equal(resolveNextStep(state).step, "free_breathing", `selfObservationChoice "${choice}" must skip self_observation_exercise entirely`);
  }
  const exerciseChosen: NewArcLiveSessionState = { ...fresh("spontaneous"), currentStep: "self_observation_choice", selfObservationChoice: "exercise" };
  assert.equal(resolveNextStep(exerciseChosen).step, "self_observation_exercise");
});

// Required test 3: skipping via the second option.

test("declineSelfObservation commits the 'skip' choice and advances normally to free_breathing (Full ARC spontaneous)", () => {
  let state: NewArcLiveSessionState = { ...fresh("spontaneous"), currentStep: "self_observation_choice" };
  state = declineSelfObservation(state, NOW);
  assert.equal(state.selfObservationChoice, "skip");
  assert.equal(state.currentStep, "free_breathing");
});

test("declineSelfObservation commits the 'skip' choice and advances normally to free_breathing (Mini ARC)", () => {
  let state: NewArcLiveSessionState = { ...fresh("plannedMini"), currentStep: "self_observation_choice" };
  state = declineSelfObservation(state, NOW);
  assert.equal(state.selfObservationChoice, "skip");
  assert.equal(state.currentStep, "free_breathing");
});

test("after declining, self_observation_exercise stays correctly unreachable -- a trainee who goes back to the choice screen and re-decides still works off the real, persisted field, never a stale second flag", () => {
  let state: NewArcLiveSessionState = { ...fresh("spontaneous"), currentStep: "self_observation_choice" };
  state = declineSelfObservation(state, NOW);
  assert.equal(state.currentStep, "free_breathing");
  assert.equal(resolveNextStep({ ...state, currentStep: "self_observation_choice" }).step, "free_breathing", "with selfObservationChoice now 'skip', re-walking forward from the choice screen must still skip the exercise, never landing on it");
});

// Required test 6: pressing the name button and advancing to the next step.
// The engine's own side of this is simply "self_observation_exercise
// advances like any other step" -- the name-button UI itself (and its
// personalName/AsyncStorage wiring) is covered in
// live/selfObservationStep.test.ts.

test("advancing from self_observation_exercise lands on free_breathing, exactly like declining does -- the exercise and the skip converge on the same next step", () => {
  let state: NewArcLiveSessionState = { ...fresh("spontaneous"), currentStep: "self_observation_choice" };
  state = proceedToSelfObservationExercise(state, NOW);
  state = advance(state, NOW);
  assert.equal(state.currentStep, "free_breathing");
});

// Required test 7: returning to the choice screen.

test("resolvePreviousStep/goBack from self_observation_exercise correctly returns to self_observation_choice", () => {
  let state: NewArcLiveSessionState = { ...fresh("spontaneous"), currentStep: "self_observation_choice" };
  state = proceedToSelfObservationExercise(state, NOW);
  const previous = resolvePreviousStep(state);
  assert.equal(previous?.step, "self_observation_choice");
  state = goBack(state, NOW);
  assert.equal(state.currentStep, "self_observation_choice");
});

test("resolvePreviousStep/goBack from free_breathing (reached by declining) returns to self_observation_choice, never skipping past it", () => {
  let state: NewArcLiveSessionState = { ...fresh("plannedMini"), currentStep: "self_observation_choice" };
  state = declineSelfObservation(state, NOW);
  assert.equal(state.currentStep, "free_breathing");
  state = goBack(state, NOW);
  assert.equal(state.currentStep, "self_observation_choice");
});

// Required test 8: session/practice state persisting after exit and
// return. The persistence mechanism itself (AsyncStorage save/load) is
// generic and already covered elsewhere; what THIS feature must get
// right is that selfObservationChoice is a real, stable field that
// survives a resume -- re-deriving resolvePreviousStep/goBack from the
// same persisted state twice must be idempotent (no re-asking, no lost
// progress), exactly as if the trainee had never left.

test("a session parked mid-exercise (selfObservationChoice: 'exercise', currentStep: self_observation_exercise) stays correctly positioned across a simulated exit-and-resume -- re-checking resolvePreviousStep on the very same persisted state twice gives the same answer both times", () => {
  const resumed: NewArcLiveSessionState = { ...fresh("spontaneous"), currentStep: "self_observation_exercise", selfObservationChoice: "exercise" };
  assert.equal(resolvePreviousStep(resumed)?.step, "self_observation_choice");
  assert.equal(resolvePreviousStep(resumed)?.step, "self_observation_choice", "checking again on the identical resumed state must give the same answer -- no hidden mutation");
  assert.equal(advance(resumed, NOW).currentStep, "free_breathing", "resuming mid-exercise and pressing the name button must still advance correctly, same as before the exit");
});

test("a session parked on the choice screen with selfObservationChoice still null (never answered yet) resumes correctly -- both options are still fully available, nothing was silently pre-decided by the exit/return itself", () => {
  const resumed: NewArcLiveSessionState = { ...fresh("plannedMini"), currentStep: "self_observation_choice", selfObservationChoice: null };
  assert.equal(proceedToSelfObservationExercise(resumed, NOW).currentStep, "self_observation_exercise");
  assert.equal(declineSelfObservation(resumed, NOW).currentStep, "free_breathing");
});

// Required test 9: preserving the link to the active task.

test("proceedToSelfObservationExercise/declineSelfObservation never touch taskId/taskTitle/firstAction/isActiveTaskLiveOrigin -- the active task and its timer stay completely untouched", () => {
  const base: NewArcLiveSessionState = { ...fresh("spontaneous"), currentStep: "self_observation_choice", taskId: "real-task-7", isActiveTaskLiveOrigin: true };
  const before = { taskId: base.taskId, taskTitle: base.taskTitle, firstAction: base.firstAction, isActiveTaskLiveOrigin: base.isActiveTaskLiveOrigin };

  const proceeded = proceedToSelfObservationExercise(base, NOW);
  assert.equal(proceeded.taskId, before.taskId);
  assert.equal(proceeded.taskTitle, before.taskTitle);
  assert.equal(proceeded.firstAction, before.firstAction);
  assert.equal(proceeded.isActiveTaskLiveOrigin, before.isActiveTaskLiveOrigin);

  const declined = declineSelfObservation(base, NOW);
  assert.equal(declined.taskId, before.taskId);
  assert.equal(declined.taskTitle, before.taskTitle);
  assert.equal(declined.firstAction, before.firstAction);
  assert.equal(declined.isActiveTaskLiveOrigin, before.isActiveTaskLiveOrigin);
});

// Required test 10: no unintended change in other ARC pathways.

test("self_observation_choice/self_observation_exercise are NEVER reachable for 'plannedFull' or 'shortened' -- those two modes walk straight from goal_select to free_breathing exactly as before this feature", () => {
  for (const mode of ["plannedFull", "shortened"] as const) {
    let state = fresh(mode);
    state = advance(state, NOW);
    assert.equal(state.currentStep, "free_breathing", `mode "${mode}" must reach free_breathing directly, with no self-observation step in between`);
  }
});

test("resolveStepOrder still returns NEW_ARC_LIVE_STEP_ORDER/NEW_ARC_MINI_STEP_ORDER by the same rule as before (plannedMini only takes the Mini array) -- this feature changed the arrays' CONTENTS, never which array each mode resolves to", () => {
  assert.deepEqual(resolveStepOrder("plannedMini"), NEW_ARC_MINI_STEP_ORDER);
  assert.deepEqual(resolveStepOrder("plannedFull"), NEW_ARC_LIVE_STEP_ORDER);
  assert.deepEqual(resolveStepOrder("spontaneous"), NEW_ARC_LIVE_STEP_ORDER);
  assert.deepEqual(resolveStepOrder("shortened"), NEW_ARC_LIVE_STEP_ORDER);
});
