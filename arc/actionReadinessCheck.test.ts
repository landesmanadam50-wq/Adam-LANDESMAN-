import test from "node:test";
import assert from "node:assert/strict";

import { advance, confirmActionReadinessCheck, resolveNextStep } from "./newArcLiveSteps.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";

/**
 * ARCHI -- Action-Readiness Check ("בדיקת מוכנות לפעולה") task:
 * regression tests for all three outcome paths, in both Full ARC and
 * Mini ARC, including the exact rating=5 boundary cases required by
 * the spec. See confirmActionReadinessCheck's own doc in
 * arc/newArcLiveSteps.ts for the exact threshold rule being verified
 * here.
 */

const NOW = "2026-01-01T00:00:00.000Z";

function freshFull(): NewArcLiveSessionState {
  return { ...createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW), currentStep: "action_readiness_check" };
}

function freshMini(): NewArcLiveSessionState {
  return { ...createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "plannedMini"), currentStep: "action_readiness_check" };
}

// --- Option A: direct to action (unpleasant < 5 AND readiness > 5) ---

test("Full ARC, direct_action: unpleasant=4/readiness=6 -- the fast lane now walks straight to 'complete', since action_selection was removed entirely (the app already knows the task's own action from context)", () => {
  const state = confirmActionReadinessCheck(freshFull(), 4, 6, 8, NOW);
  assert.equal(state.actionReadinessOutcome, "direct_action");
  assert.equal(state.unpleasantIntensityRating, 4);
  assert.equal(state.actionReadinessRating, 6);
  assert.equal(state.arcInvocationMode, "plannedFull", "direct_action never touches arcInvocationMode");
  assert.equal(state.currentStep, "complete", "every remaining ARC step, including the now-removed action-selection step, is skipped entirely");
});

test("Full ARC, direct_action: isActiveTaskLiveOrigin skips straight to complete, same as every other direct_action session now", () => {
  const state = confirmActionReadinessCheck({ ...freshFull(), isActiveTaskLiveOrigin: true }, 2, 9, 8, NOW);
  assert.equal(state.actionReadinessOutcome, "direct_action");
  assert.equal(state.currentStep, "complete", "the active task's own first action is already the resolved action -- use it, never ask again");
});

test("Full ARC, direct_action: an ARC GYM situation also counts as already resolved (its own separate action-visualization flow)", () => {
  const state = confirmActionReadinessCheck({ ...freshFull(), arcGymSituationId: "gym1" }, 3, 8, 8, NOW);
  assert.equal(state.currentStep, "complete");
});

test("Full ARC, direct_action: every step between action_readiness_check and the action is skipped -- Presence, body awareness, Acceptance, Regulation, Encoding all unreachable", () => {
  let state = confirmActionReadinessCheck({ ...freshFull(), isActiveTaskLiveOrigin: true }, 0, 10, 8, NOW);
  assert.equal(state.currentStep, "complete");
  // Re-run resolveNextStep from "action_readiness_check" itself (as if
  // re-entered) to confirm the SCAN never lands on any of the skipped
  // steps either, not just that the direct jump worked.
  const scanned = resolveNextStep({ ...state, currentStep: "action_readiness_check", subIndex: 0 });
  assert.equal(scanned.step, "complete");
});

// --- Option B: transition to Shortened ARC, same session ---

test("Full ARC, shortened: unpleasant=4/readiness=5 (boundary, 5 is NOT > 5) -- flips to shortened mode, lands on natural_breathing, same session", () => {
  const state = confirmActionReadinessCheck(freshFull(), 4, 5, 8, NOW);
  assert.equal(state.actionReadinessOutcome, "shortened");
  assert.equal(state.arcInvocationMode, "shortened", "mutates the SAME session in place -- never a new ARC");
  assert.equal(state.taskId, "t1", "same session, same task context");
  assert.equal(state.currentStep, "natural_breathing", "Shortened ARC's own one Presence screen, right after the readiness check");
});

test("Full ARC, shortened: unpleasant=0/readiness=0 also routes to shortened (readiness far below 5, not direct_action)", () => {
  const state = confirmActionReadinessCheck(freshFull(), 0, 0, 8, NOW);
  assert.equal(state.actionReadinessOutcome, "shortened");
  assert.equal(state.currentStep, "natural_breathing");
});

test("Full ARC, shortened: continuing forward from there never re-asks about mood/emotion -- action_readiness_check itself is unreachable under shortened mode", () => {
  let state = confirmActionReadinessCheck(freshFull(), 4, 2, 8, NOW);
  assert.equal(state.currentStep, "natural_breathing");
  state = advance(state, NOW); // body_scan
  assert.equal(state.currentStep, "body_scan");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "supportive_area_select", "Shortened ARC's own existing steps -- never emotion/cognitive_selector again");
});

// --- Option C: continue the practice (unpleasant >= 5, any readiness) ---

test("Full ARC, continue: unpleasant=5 (boundary, 5 IS >= 5)/readiness=10 -- still continues, never direct_action, regardless of high readiness", () => {
  const state = confirmActionReadinessCheck(freshFull(), 5, 10, 8, NOW);
  assert.equal(state.actionReadinessOutcome, "continue");
  assert.equal(state.arcInvocationMode, "plannedFull", "continue never touches arcInvocationMode");
  assert.equal(state.currentStep, "natural_breathing", "ordinary Full ARC Presence step, exactly as this session would have reached anyway");
});

test("Full ARC, continue: unpleasant=10/readiness=0 -- strong sensation and low readiness both point the same way", () => {
  const state = confirmActionReadinessCheck(freshFull(), 10, 0, 8, NOW);
  assert.equal(state.actionReadinessOutcome, "continue");
  assert.equal(state.currentStep, "natural_breathing");
});

test("Full ARC, continue: resuming the ordinary walk afterward reaches the full remaining sequence (body awareness, acceptance, regulation, encoding) exactly as any Full ARC session would", () => {
  let state = confirmActionReadinessCheck(freshFull(), 8, 1, 8, NOW);
  assert.equal(state.currentStep, "natural_breathing");
  for (let i = 0; i < 4; i++) state = advance(state, NOW); // center_attention, visual_field, sound_awareness, body_scan
  assert.equal(state.currentStep, "body_scan");
});

// --- Mini ARC: all three outcomes, same thresholds ---

test("Mini ARC, direct_action: unpleasant=3/readiness=8 -- the fast lane walks straight to 'complete', since mini_action_selection was removed entirely", () => {
  const state = confirmActionReadinessCheck(freshMini(), 3, 8, 8, NOW);
  assert.equal(state.actionReadinessOutcome, "direct_action");
  assert.equal(state.currentStep, "complete", "mini_encoding and the now-removed mini_action_selection step are both skipped entirely for the direct-to-action outcome");
});

test("Mini ARC, direct_action: an already-resolved action (isActiveTaskLiveOrigin) also lands on complete", () => {
  const state = confirmActionReadinessCheck({ ...freshMini(), isActiveTaskLiveOrigin: true }, 1, 9, 8, NOW);
  assert.equal(state.currentStep, "complete");
});

test("Mini ARC, shortened: unpleasant=4/readiness=5 (boundary) -- flips the SAME session into Shortened ARC's own array, landing on natural_breathing", () => {
  const state = confirmActionReadinessCheck(freshMini(), 4, 5, 8, NOW);
  assert.equal(state.actionReadinessOutcome, "shortened");
  assert.equal(state.arcInvocationMode, "shortened");
  assert.equal(state.taskId, "t1", "same session continues -- never a new ARC opened");
  assert.equal(state.currentStep, "natural_breathing", "Mini ARC's own remaining steps are abandoned in favor of Shortened ARC's -- no step duplication, no empty mini_presence screen");
});

test("Mini ARC, continue: unpleasant=5 (boundary)/readiness=9 -- continues into Mini ARC's own next step (mini_presence), per the spec's own per-track differentiation", () => {
  const state = confirmActionReadinessCheck(freshMini(), 5, 9, 8, NOW);
  assert.equal(state.actionReadinessOutcome, "continue");
  assert.equal(state.arcInvocationMode, "plannedMini");
  assert.equal(state.currentStep, "mini_presence", "Mini ARC continues to its own next steps in the existing order, never Full ARC's");
});

test("Mini ARC, continue: unpleasant=6/readiness=0 -- low readiness alone never triggers shortened once unpleasant intensity is still high", () => {
  const state = confirmActionReadinessCheck(freshMini(), 6, 0, 8, NOW);
  assert.equal(state.actionReadinessOutcome, "continue");
  assert.equal(state.currentStep, "mini_presence");
});

// --- Shortened ARC from scratch: the step is never added to it on its own ---

test("A from-scratch Shortened ARC session never reaches action_readiness_check, and its own ratings/outcome stay null throughout", () => {
  let state: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "task", "action", NOW, "shortened"), currentStep: "free_breathing" };
  const visited: string[] = [];
  for (let i = 0; i < 20 && state.currentStep !== "complete"; i++) {
    visited.push(state.currentStep);
    state = advance(state, NOW);
  }
  assert.ok(!visited.includes("action_readiness_check"), "the two-rating screen must never appear on its own in the Shortened pathway");
  assert.equal(state.unpleasantIntensityRating, null);
  assert.equal(state.actionReadinessRating, null);
  assert.equal(state.actionReadinessOutcome, null);
});

// --- Rating clamping ---

test("ratings are clamped to the 0-10 range and rounded, never stored out of bounds", () => {
  const over = confirmActionReadinessCheck(freshFull(), 15, -3, 20, NOW);
  assert.equal(over.unpleasantIntensityRating, 10);
  assert.equal(over.actionReadinessRating, 0);
  assert.equal(over.timeAvailableRating, 10);
  const fractional = confirmActionReadinessCheck(freshFull(), 4.6, 5.4, 5.5, NOW);
  assert.equal(fractional.unpleasantIntensityRating, 5);
  assert.equal(fractional.actionReadinessRating, 5);
  assert.equal(fractional.timeAvailableRating, 6);
});

// --- Backward compatibility ---

test("createNewArcLiveSessionState defaults all three new fields to null for every existing call site", () => {
  const state = createNewArcLiveSessionState("t1", "task", "action", NOW);
  assert.equal(state.unpleasantIntensityRating, null);
  assert.equal(state.actionReadinessRating, null);
  assert.equal(state.actionReadinessOutcome, null);
  assert.equal(state.timeAvailableRating, null);
  assert.equal(state.arcPracticeDepth, null);
});

// --- Time rating + practice depth ---

test("arcPracticeDepth is null for direct_action regardless of time rating (time irrelevant)", () => {
  const low = confirmActionReadinessCheck(freshFull(), 2, 8, 1, NOW);
  assert.equal(low.actionReadinessOutcome, "direct_action");
  assert.equal(low.arcPracticeDepth, null);
  const high = confirmActionReadinessCheck(freshFull(), 2, 8, 10, NOW);
  assert.equal(high.arcPracticeDepth, null);
});

test("arcPracticeDepth is 'full' for time>=6 and 'short' for time<=5, for both shortened and continue outcomes", () => {
  const shortenedShort = confirmActionReadinessCheck(freshFull(), 4, 2, 5, NOW);
  assert.equal(shortenedShort.actionReadinessOutcome, "shortened");
  assert.equal(shortenedShort.arcPracticeDepth, "short");
  const shortenedFull = confirmActionReadinessCheck(freshFull(), 4, 2, 6, NOW);
  assert.equal(shortenedFull.actionReadinessOutcome, "shortened");
  assert.equal(shortenedFull.arcPracticeDepth, "full");
  const continueShort = confirmActionReadinessCheck(freshFull(), 8, 3, 0, NOW);
  assert.equal(continueShort.actionReadinessOutcome, "continue");
  assert.equal(continueShort.arcPracticeDepth, "short");
  const continueFull = confirmActionReadinessCheck(freshFull(), 8, 3, 10, NOW);
  assert.equal(continueFull.actionReadinessOutcome, "continue");
  assert.equal(continueFull.arcPracticeDepth, "full");
});
