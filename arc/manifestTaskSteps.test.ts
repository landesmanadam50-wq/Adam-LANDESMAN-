import test from "node:test";
import assert from "node:assert/strict";

import { advanceManifestRun, createManifestRunState, goBackManifestRun, manifestStepSubCount, resolveManifestProgress, MANIFEST_STEP_ORDER } from "./manifestTaskSteps.ts";
import type { ManifestRunState } from "./manifestTaskSteps.ts";

test("createManifestRunState starts at visualize, subIndex 0", () => {
  const state = createManifestRunState("t1");
  assert.equal(state.currentStep, "visualize");
  assert.equal(state.subIndex, 0);
});

test("the sequence is linear with no branching: visualize -> awareness -> presence -> acceptance -> regulation -> encoding -> identity_action -> complete", () => {
  let state = createManifestRunState("t1");
  for (let i = 0; i < manifestStepSubCount("visualize") - 1; i++) state = advanceManifestRun(state);
  state = advanceManifestRun(state);
  assert.equal(state.currentStep, "awareness");
  state = advanceManifestRun(state);
  assert.equal(state.currentStep, "presence");
  state = advanceManifestRun(state);
  assert.equal(state.currentStep, "acceptance");
  state = advanceManifestRun(state);
  assert.equal(state.currentStep, "regulation");
  state = advanceManifestRun(state);
  assert.equal(state.currentStep, "encoding");
  for (let i = 0; i < manifestStepSubCount("encoding") - 1; i++) state = advanceManifestRun(state);
  state = advanceManifestRun(state);
  assert.equal(state.currentStep, "identity_action");
  state = advanceManifestRun(state);
  assert.equal(state.currentStep, "complete");
});

test("advancing past 'complete' stays at complete -- never overflows the sequence", () => {
  let state: ManifestRunState = { taskId: "t1", currentStep: "complete", subIndex: 0 };
  state = advanceManifestRun(state);
  assert.equal(state.currentStep, "complete");
});

test("goBackManifestRun is symmetric with advanceManifestRun, and returns null at the very first step", () => {
  let state = createManifestRunState("t1");
  state = advanceManifestRun(state); // visualize subIndex 1
  const back = goBackManifestRun(state);
  assert.equal(back?.currentStep, "visualize");
  assert.equal(back?.subIndex, 0);
  assert.equal(goBackManifestRun(createManifestRunState("t1")), null);
});

test("going back across a step boundary lands on the previous step's own LAST sub-index", () => {
  const atAwareness = { taskId: "t1", currentStep: "awareness" as const, subIndex: 0 };
  const back = goBackManifestRun(atAwareness);
  assert.equal(back?.currentStep, "visualize");
  assert.equal(back?.subIndex, manifestStepSubCount("visualize") - 1);
});

test("resolveManifestProgress increases monotonically across the whole run and never exceeds its own total", () => {
  let state = createManifestRunState("t1");
  let lastPosition = 0;
  for (let i = 0; i < 20; i++) {
    const progress = resolveManifestProgress(state);
    assert.ok(progress.position >= lastPosition);
    assert.ok(progress.position <= progress.total);
    lastPosition = progress.position;
    if (state.currentStep === "complete") break;
    state = advanceManifestRun(state);
  }
});

test("MANIFEST_STEP_ORDER has no duplicate steps and ends with 'complete'", () => {
  assert.equal(new Set(MANIFEST_STEP_ORDER).size, MANIFEST_STEP_ORDER.length);
  assert.equal(MANIFEST_STEP_ORDER[MANIFEST_STEP_ORDER.length - 1], "complete");
});
