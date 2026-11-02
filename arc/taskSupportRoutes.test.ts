import test from "node:test";
import assert from "node:assert/strict";

import { containsInductionPattern } from "./instructions.ts";
import {
  EXTERNAL_INTERRUPTION_CHOICES,
  getEmbeddedPresenceSteps,
  getLowEnergySteps,
  PRACTICAL_TASK_SUPPORT_START_MINUTES_OPTIONS,
  resolvePresenceStageCount,
} from "./taskSupportRoutes.ts";

test("presence rating bands match the product spec exactly: 7-10 skip, 4-6 two stages, 1-3 three stages", () => {
  assert.equal(resolvePresenceStageCount(10), 0);
  assert.equal(resolvePresenceStageCount(7), 0);
  assert.equal(resolvePresenceStageCount(6), 2);
  assert.equal(resolvePresenceStageCount(4), 2);
  assert.equal(resolvePresenceStageCount(3), 3);
  assert.equal(resolvePresenceStageCount(1), 3);
});

test("getEmbeddedPresenceSteps returns exactly stageCount lines, and 0 for a skip", () => {
  assert.equal(getEmbeddedPresenceSteps(0).length, 0);
  assert.equal(getEmbeddedPresenceSteps(2).length, 2);
  assert.equal(getEmbeddedPresenceSteps(3).length, 3);
});

test("low-energy steps never trip the safety denylist and reference the task's own action, never an invented one", () => {
  const steps = getLowEnergySteps("לכתוב פסקה אחת");
  for (const step of steps) assert.equal(containsInductionPattern(step), false);
  assert.ok(steps.some((step) => step.includes("לכתוב פסקה אחת")));
});

test("low-energy steps stay grammatical with a blank action", () => {
  const steps = getLowEnergySteps("");
  for (const step of steps) assert.ok(!step.includes(": ."));
});

test("there are 5 practical-task-support start-minute options and 4 external-interruption choices", () => {
  assert.equal(PRACTICAL_TASK_SUPPORT_START_MINUTES_OPTIONS.length, 5);
  assert.equal(EXTERNAL_INTERRUPTION_CHOICES.length, 4);
});
