import test from "node:test";
import assert from "node:assert/strict";

import { containsInductionPattern } from "./instructions.ts";
import { getNeutralRegulationActionStep, getNeutralRegulationNoticingSteps } from "./neutralRegulation.ts";

test("getNeutralRegulationNoticingSteps returns exactly the 6 fixed noticing steps (never evoking/intensifying the interfering state)", () => {
  const steps = getNeutralRegulationNoticingSteps();
  assert.equal(steps.length, 6);
  for (const step of steps) {
    assert.ok(step.trim().length > 0);
    assert.equal(containsInductionPattern(step), false);
  }
});

test("getNeutralRegulationActionStep echoes the task's own configured action verbatim, never inventing one", () => {
  assert.ok(getNeutralRegulationActionStep("לפתוח את המסמך").includes("לפתוח את המסמך"));
});

test("getNeutralRegulationActionStep stays grammatical even with a blank action", () => {
  const step = getNeutralRegulationActionStep("");
  assert.ok(!step.includes(": ."));
  assert.equal(containsInductionPattern(step), false);
});
