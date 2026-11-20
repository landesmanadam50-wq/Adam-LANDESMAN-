import test from "node:test";
import assert from "node:assert/strict";

import { advance, confirmActionReadinessCheck, confirmTimeAvailableRating, completeFreeBreathingIntro, setGoalType } from "./newArcLiveSteps.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";

/**
 * arc/timeAvailableRating.test.ts
 *
 * ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks task:
 * the new 0-10 "how much free time do you have for practice right
 * now?" rating -- captured as a 3rd rating on "פחות טוב"'s existing
 * action_readiness_check screen, or on "סבבה"'s own standalone
 * time_available_check screen -- and the arcPracticeDepth it computes
 * ("short" for 1-5, "full" for 6-10, always null for direct_action).
 */

const NOW = "2026-01-05T12:00:00.000Z";

function freshFull(): NewArcLiveSessionState {
  return { ...createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW), currentStep: "action_readiness_check" };
}

function freshShortened(): NewArcLiveSessionState {
  return createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "shortened");
}

// --- confirmActionReadinessCheck's new 3rd rating (פחות טוב) ---

test("direct_action: arcPracticeDepth is always null regardless of the time rating -- time is irrelevant when there is nothing left to practice", () => {
  for (const time of [0, 1, 5, 6, 10]) {
    const state = confirmActionReadinessCheck(freshFull(), 2, 8, time, NOW);
    assert.equal(state.actionReadinessOutcome, "direct_action");
    assert.equal(state.arcPracticeDepth, null, `time=${time} must still yield null depth for direct_action`);
    assert.equal(state.timeAvailableRating, Math.max(0, Math.min(10, Math.round(time))));
  }
});

test("shortened outcome: time 1-5 yields 'short' depth, time 6-10 yields 'full' depth -- every boundary value", () => {
  for (let time = 0; time <= 10; time++) {
    const state = confirmActionReadinessCheck(freshFull(), 4, 2, time, NOW);
    assert.equal(state.actionReadinessOutcome, "shortened");
    assert.equal(state.arcPracticeDepth, time >= 6 ? "full" : "short", `time=${time}`);
  }
});

test("continue outcome: time 1-5 yields 'short' depth, time 6-10 yields 'full' depth -- every boundary value, even with high readiness", () => {
  for (let time = 0; time <= 10; time++) {
    const state = confirmActionReadinessCheck(freshFull(), 8, 10, time, NOW);
    assert.equal(state.actionReadinessOutcome, "continue");
    assert.equal(state.arcPracticeDepth, time >= 6 ? "full" : "short", `time=${time}`);
  }
});

test("the existing 2-rating outcome formula is completely unchanged by the 3rd rating's addition", () => {
  assert.equal(confirmActionReadinessCheck(freshFull(), 4, 6, 3, NOW).actionReadinessOutcome, "direct_action");
  assert.equal(confirmActionReadinessCheck(freshFull(), 4, 5, 3, NOW).actionReadinessOutcome, "shortened");
  assert.equal(confirmActionReadinessCheck(freshFull(), 5, 10, 3, NOW).actionReadinessOutcome, "continue");
});

test("the time rating is clamped to 0-10 and rounded, exactly like the other two ratings", () => {
  const over = confirmActionReadinessCheck(freshFull(), 4, 2, 15, NOW);
  assert.equal(over.timeAvailableRating, 10);
  const under = confirmActionReadinessCheck(freshFull(), 4, 2, -3, NOW);
  assert.equal(under.timeAvailableRating, 0);
  const fractional = confirmActionReadinessCheck(freshFull(), 4, 2, 5.5, NOW);
  assert.equal(fractional.timeAvailableRating, 6);
});

// --- confirmTimeAvailableRating (סבבה's own standalone screen) ---

test("confirmTimeAvailableRating computes depth the same way, with no outcome field involved at all", () => {
  let state: NewArcLiveSessionState = { ...freshShortened(), currentStep: "time_available_check" };
  const short = confirmTimeAvailableRating(state, 3, NOW);
  assert.equal(short.timeAvailableRating, 3);
  assert.equal(short.arcPracticeDepth, "short");
  assert.equal(short.actionReadinessOutcome, null, "סבבה never computes an outcome -- it has no unpleasant/readiness ratings at all");

  const full = confirmTimeAvailableRating(state, 9, NOW);
  assert.equal(full.arcPracticeDepth, "full");
});

test("confirmTimeAvailableRating clamps and rounds exactly like confirmActionReadinessCheck's own rating", () => {
  let state: NewArcLiveSessionState = { ...freshShortened(), currentStep: "time_available_check" };
  assert.equal(confirmTimeAvailableRating(state, 20, NOW).timeAvailableRating, 10);
  assert.equal(confirmTimeAvailableRating(state, -5, NOW).timeAvailableRating, 0);
  assert.equal(confirmTimeAvailableRating(state, 5.4, NOW).timeAvailableRating, 5);
});

// --- time_available_check reachability ---

test("a fresh shortened session reaches time_available_check right after free_breathing, and never re-asks once answered", () => {
  let state = freshShortened();
  state = setGoalType(state, "action", NOW);
  assert.equal(state.currentStep, "free_breathing");
  state = completeFreeBreathingIntro(state, NOW);
  assert.equal(state.currentStep, "time_available_check");
  state = confirmTimeAvailableRating(state, 7, NOW);
  assert.notEqual(state.currentStep, "time_available_check", "never re-reachable once answered");
});

test("a 'פחות טוב' session that transitions into 'shortened' via the existing shortened outcome carries its already-answered time rating through, never re-asking time_available_check", () => {
  let state = confirmActionReadinessCheck(freshFull(), 4, 2, 7, NOW);
  assert.equal(state.arcInvocationMode, "shortened", "the existing transition mutates the SAME session into shortened mode");
  assert.equal(state.timeAvailableRating, 7, "the time rating already answered on action_readiness_check survives the transition");
  assert.notEqual(state.currentStep, "time_available_check", "time_available_check must never be reachable once timeAvailableRating is already set");
});

test("createNewArcLiveSessionState defaults timeAvailableRating/arcPracticeDepth to null for every existing call site", () => {
  const state = createNewArcLiveSessionState("t1", "task", "action", NOW);
  assert.equal(state.timeAvailableRating, null);
  assert.equal(state.arcPracticeDepth, null);
});

test("time_available_check is unreachable for every mode except shortened, even with timeAvailableRating null", () => {
  for (const mode of ["spontaneous", "plannedFull", "plannedMini"] as const) {
    const state: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "x", "y", NOW, mode), currentStep: "action_readiness_check" };
    const advanced = advance(state, NOW);
    assert.notEqual(advanced.currentStep, "time_available_check", `mode=${mode} must never reach time_available_check`);
  }
});
