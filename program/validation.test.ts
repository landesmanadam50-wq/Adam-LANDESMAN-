import test from "node:test";
import assert from "node:assert/strict";
import { validateAllProgramDefinitions, validateProgramDefinition } from "./validation.ts";
import { PROGRAM_DEFINITIONS } from "./config.ts";
import type { ProgramDefinition } from "./programTypes.ts";

test("every registered program definition is structurally valid", () => {
  assert.deepEqual(validateAllProgramDefinitions(PROGRAM_DEFINITIONS), []);
});

test("flags totalWeeks not matching weeks.length", () => {
  const program: ProgramDefinition = {
    id: "broken",
    totalWeeks: 3,
    weeks: [{ week: 1, activeLayers: ["state"], layersToBuild: ["state"] }],
  };
  const issues = validateProgramDefinition(program);
  assert.ok(issues.some((i) => i.includes("totalWeeks")));
});

test("flags duplicate week numbers", () => {
  const program: ProgramDefinition = {
    id: "broken",
    totalWeeks: 2,
    weeks: [
      { week: 1, activeLayers: ["state"], layersToBuild: ["state"] },
      { week: 1, activeLayers: ["state", "identity"], layersToBuild: ["identity"] },
    ],
  };
  const issues = validateProgramDefinition(program);
  assert.ok(issues.some((i) => i.includes("duplicate week numbers")));
});

test("flags a layersToBuild entry not present in activeLayers", () => {
  const program: ProgramDefinition = {
    id: "broken",
    totalWeeks: 1,
    weeks: [{ week: 1, activeLayers: ["state"], layersToBuild: ["habit"] }],
  };
  const issues = validateProgramDefinition(program);
  assert.ok(issues.some((i) => i.includes("layersToBuild has \"habit\"")));
});

test("flags duplicate entries within activeLayers or layersToBuild", () => {
  const program: ProgramDefinition = {
    id: "broken",
    totalWeeks: 1,
    weeks: [{ week: 1, activeLayers: ["state", "state"], layersToBuild: ["state"] }],
  };
  const issues = validateProgramDefinition(program);
  assert.ok(issues.some((i) => i.includes("duplicate entries in activeLayers")));
});

test("flags a layer disappearing from activeLayers in a later week (non-cumulative)", () => {
  const program: ProgramDefinition = {
    id: "broken",
    totalWeeks: 2,
    weeks: [
      { week: 1, activeLayers: ["state", "identity"], layersToBuild: ["state", "identity"] },
      { week: 2, activeLayers: ["identity"], layersToBuild: [] },
    ],
  };
  const issues = validateProgramDefinition(program);
  assert.ok(issues.some((i) => i.includes("lost previously-active layer \"state\"")));
});

test("a well-formed multi-week program with cumulative layers has no issues", () => {
  const program: ProgramDefinition = {
    id: "fine",
    totalWeeks: 2,
    weeks: [
      { week: 1, activeLayers: ["state"], layersToBuild: ["state"] },
      { week: 2, activeLayers: ["state", "habit"], layersToBuild: ["habit"] },
    ],
  };
  assert.deepEqual(validateProgramDefinition(program), []);
});
