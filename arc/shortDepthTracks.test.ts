import test from "node:test";
import assert from "node:assert/strict";

import {
  advance,
  completeFreeBreathingIntro,
  confirmActionReadinessCheck,
  confirmTimeAvailableRating,
  cycleShortBodyMarking,
  resolveStepOrder,
  setGoalType,
  toggleOpeningBodyScanRegion,
} from "./newArcLiveSteps.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { NewArcLiveSessionState, NewArcLiveStepId } from "./newArcLiveTypes.ts";

/**
 * arc/shortDepthTracks.test.ts
 *
 * ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks task:
 * full walked-sequence assertions for all 4 track x depth combinations
 * (פחות טוב full/short, סבבה full/short), confirming step sequence,
 * that quick_presence/short_body_marking are each unreachable outside
 * their own track/depth, and that encoding/supportive_area_select are
 * correctly reused with no duplicate ids.
 */

const NOW = "2026-01-05T12:00:00.000Z";

function walk(state: NewArcLiveSessionState, steps: ((s: NewArcLiveSessionState) => NewArcLiveSessionState)[]): NewArcLiveSessionState {
  return steps.reduce((acc, step) => step(acc), state);
}

// --- פחות טוב, full depth: byte-for-byte unchanged ---

test("'פחות טוב' full depth: action_readiness_check(continue, time>=6) walks straight to natural_breathing, exactly as every pre-existing session always has", () => {
  let state: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "x", "y", NOW, "plannedFull"), currentStep: "action_readiness_check" };
  state = confirmActionReadinessCheck(state, 8, 3, 8, NOW);
  assert.equal(state.arcPracticeDepth, "full");
  assert.equal(state.currentStep, "natural_breathing");
  for (let i = 0; i < 6; i++) state = advance(state, NOW); // center_attention, visual_field, sound_awareness, body_scan, body_scan_contraction, acceptance
  assert.equal(state.currentStep, "acceptance");
});

// --- פחות טוב, short depth ---

test("'פחות טוב' short depth: action_readiness_check(continue, time<=5) walks action_readiness_check -> quick_presence -> short_body_marking -> encoding -> complete", () => {
  let state: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "x", "y", NOW, "plannedFull"), currentStep: "action_readiness_check" };
  state = confirmActionReadinessCheck(state, 8, 3, 3, NOW);
  assert.equal(state.actionReadinessOutcome, "continue");
  assert.equal(state.arcInvocationMode, "plannedFull", "continue never touches arcInvocationMode -- still 'פחות טוב'");
  assert.equal(state.arcPracticeDepth, "short");
  assert.equal(state.currentStep, "quick_presence");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "short_body_marking");
  state = cycleShortBodyMarking(state, "scanAbdomen", null); // red
  state = cycleShortBodyMarking(state, "scanAbdomen", null); // blue
  state = advance(state, NOW);
  assert.equal(state.currentStep, "encoding", "every full-depth-only screen between short_body_marking and encoding is skipped -- natural_breathing through regulation, inclusive");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "complete", "no action-selector screen ever appears -- the task's own already-known first action is used automatically");
});

test("'פחות טוב' short depth reached via 'shortened' outcome's own ARC-GYM-free path stays 'פחות טוב' (never flips mode) -- 'continue' is the only outcome that keeps this track", () => {
  let state: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "x", "y", NOW, "plannedFull"), currentStep: "action_readiness_check" };
  state = confirmActionReadinessCheck(state, 9, 1, 2, NOW);
  assert.equal(state.actionReadinessOutcome, "continue", "unpleasant>=5 always continues 'פחות טוב', regardless of how low readiness is");
  assert.equal(state.arcInvocationMode, "plannedFull");
  assert.equal(state.arcPracticeDepth, "short");
});

test("short_body_marking is unreachable for 'סבבה' (shortened) -- that track reuses supportive_area_select instead, walked end-to-end from the time rating", () => {
  let state = createNewArcLiveSessionState("t1", "x", "y", NOW, "shortened");
  state = setGoalType(state, "action", NOW);
  state = completeFreeBreathingIntro(state, NOW);
  state = confirmTimeAvailableRating(state, 1, NOW);
  const visited: NewArcLiveStepId[] = [];
  let cursor = state;
  for (let i = 0; i < 20 && cursor.currentStep !== "complete"; i++) {
    visited.push(cursor.currentStep);
    cursor = advance(cursor, NOW);
  }
  assert.ok(!visited.includes("short_body_marking"), "the 'סבבה' track must never reach the 'פחות טוב'-only body-marking screen");
});

test("quick_presence is unreachable for every full-depth session (arcPracticeDepth 'full' or null), walked for both tracks", () => {
  let full1 = createNewArcLiveSessionState("t1", "x", "y", NOW, "plannedFull");
  full1 = setGoalType(full1, "action", NOW);
  const visited1: NewArcLiveStepId[] = [];
  let cursor1 = full1;
  for (let i = 0; i < 25 && cursor1.currentStep !== "complete"; i++) {
    visited1.push(cursor1.currentStep);
    cursor1 = cursor1.currentStep === "action_readiness_check" ? confirmActionReadinessCheck(cursor1, 8, 3, 8, NOW) : advance(cursor1, NOW);
  }
  assert.ok(!visited1.includes("quick_presence"), "a full-depth 'פחות טוב' session must never reach quick_presence");

  let full2 = createNewArcLiveSessionState("t1", "x", "y", NOW, "shortened");
  full2 = setGoalType(full2, "action", NOW);
  const visited2: NewArcLiveStepId[] = [];
  let cursor2 = full2;
  for (let i = 0; i < 25 && cursor2.currentStep !== "complete"; i++) {
    visited2.push(cursor2.currentStep);
    cursor2 = cursor2.currentStep === "time_available_check" ? confirmTimeAvailableRating(cursor2, 8, NOW) : advance(cursor2, NOW);
  }
  assert.ok(!visited2.includes("quick_presence"), "a full-depth 'סבבה' session must never reach quick_presence");
});

// --- סבבה, full depth: byte-for-byte unchanged apart from the new time-rating screen ---

test("'סבבה' full depth: free_breathing -> time_available_check(full) -> natural_breathing -> ... -> encoding -> complete, exactly like every pre-existing shortened session", () => {
  let state = createNewArcLiveSessionState("t1", "x", "y", NOW, "shortened");
  state = setGoalType(state, "action", NOW);
  assert.equal(state.currentStep, "free_breathing");
  state = completeFreeBreathingIntro(state, NOW);
  assert.equal(state.currentStep, "time_available_check");
  state = confirmTimeAvailableRating(state, 9, NOW);
  assert.equal(state.arcPracticeDepth, "full");
  assert.equal(state.currentStep, "natural_breathing");
  state = advance(state, NOW); // body_scan
  state = advance(state, NOW); // supportive_area_select
  assert.equal(state.currentStep, "supportive_area_select");
  state = toggleOpeningBodyScanRegion(state, "palms", "left");
  state = advance(state, NOW); // regulation (acceptance permanently skipped for shortened)
  assert.equal(state.currentStep, "regulation");
  state = advance(state, NOW); // encoding (action-selection step removed entirely)
  assert.equal(state.currentStep, "encoding");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "complete");
});

// --- סבבה, short depth ---

test("'סבבה' short depth: free_breathing -> time_available_check(short) -> quick_presence -> supportive_area_select -> encoding -> complete, skipping natural_breathing/body_scan/regulation", () => {
  let state = createNewArcLiveSessionState("t1", "x", "y", NOW, "shortened");
  state = setGoalType(state, "action", NOW);
  assert.equal(state.currentStep, "free_breathing");
  state = completeFreeBreathingIntro(state, NOW);
  assert.equal(state.currentStep, "time_available_check");
  state = confirmTimeAvailableRating(state, 2, NOW);
  assert.equal(state.arcPracticeDepth, "short");
  assert.equal(state.currentStep, "quick_presence", "quick_presence is shared by both tracks' short depth");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "supportive_area_select", "'סבבה' short reuses this EXISTING screen rather than a new id");
  state = toggleOpeningBodyScanRegion(state, "palms", "left");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "encoding", "regulation is skipped entirely for short depth -- supportive_area_select leads directly to encoding");
  state = advance(state, NOW);
  assert.equal(state.currentStep, "complete");
});

test("'סבבה' short depth never visits natural_breathing/body_scan/regulation, walked from scratch with the generic advance()", () => {
  let state = createNewArcLiveSessionState("t1", "x", "y", NOW, "shortened");
  state = setGoalType(state, "action", NOW);
  state = completeFreeBreathingIntro(state, NOW);
  state = confirmTimeAvailableRating(state, 1, NOW);
  const visited: NewArcLiveStepId[] = [];
  let cursor = state;
  for (let i = 0; i < 20 && cursor.currentStep !== "complete"; i++) {
    visited.push(cursor.currentStep);
    if (cursor.currentStep === "supportive_area_select") cursor = advance(cursor, NOW);
    else cursor = advance(cursor, NOW);
  }
  assert.ok(!visited.includes("natural_breathing"));
  assert.ok(!visited.includes("body_scan"));
  assert.ok(!visited.includes("regulation"));
  assert.ok(visited.includes("quick_presence"));
  assert.ok(visited.includes("supportive_area_select"));
});

// --- shared engine, no duplicate ids ---

test("resolveStepOrder for both 'פחות טוב' and 'סבבה' is the SAME single array -- quick_presence/short_body_marking/time_available_check appear exactly once each, never duplicated per track", () => {
  const order = resolveStepOrder("plannedFull");
  assert.deepEqual(order, resolveStepOrder("shortened"));
  for (const id of ["quick_presence", "short_body_marking", "time_available_check"] as const) {
    assert.equal(order.filter((s) => s === id).length, 1, `${id} must appear exactly once in the shared step order`);
  }
});

test("encoding and supportive_area_select are reused as-is for short depth -- no second/duplicate step id exists for either", () => {
  const order = resolveStepOrder("plannedFull");
  assert.equal(order.filter((s) => s === "encoding").length, 1);
  assert.equal(order.filter((s) => s === "supportive_area_select").length, 1);
});
