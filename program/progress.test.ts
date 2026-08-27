import test from "node:test";
import assert from "node:assert/strict";

import {
  recordTrainingDay,
  isArcWeekComplete,
  completeProgramWeek,
  unlockBuildExtension,
  createInitialProgress,
} from "./progress.ts";
import { getProgramDefinition, getActiveLayers, getLayersToBuild, isLayerActive } from "./engine.ts";
import { resolveProgramPath, deriveNeedsFromLegacyProgramPath } from "./selection.ts";
import { PROGRAM_DEFINITIONS } from "./config.ts";
import type { ArcProgramProgress } from "../arc/types.ts";

function completeAWeek(progress: ArcProgramProgress): ArcProgramProgress {
  let p = progress;
  for (const day of ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"]) {
    p = recordTrainingDay(p, day);
  }
  assert.equal(isArcWeekComplete(p), true);
  return p;
}

test("TEST 1 - Standard: state -> state+identity -> state+identity+habit", () => {
  let progress = createInitialProgress("standard_3_week");
  assert.deepEqual(progress.activeLayers, ["state"]);

  progress = completeAWeek(progress);
  progress = completeProgramWeek(progress);
  assert.deepEqual(progress.nextLayerToBuild, ["identity"]);
  progress = unlockBuildExtension(progress);
  assert.deepEqual(progress.activeLayers, ["state", "identity"]);

  progress = completeAWeek(progress);
  progress = completeProgramWeek(progress);
  assert.deepEqual(progress.nextLayerToBuild, ["habit"]);
  progress = unlockBuildExtension(progress);
  assert.deepEqual(progress.activeLayers, ["state", "identity", "habit"]);
});

test("TEST 2 - Advanced: state+identity -> state+identity+habit", () => {
  let progress = createInitialProgress("advanced_2_week");
  assert.deepEqual(progress.activeLayers, ["state", "identity"]);

  progress = completeAWeek(progress);
  progress = completeProgramWeek(progress);
  assert.deepEqual(progress.nextLayerToBuild, ["habit"]);
  progress = unlockBuildExtension(progress);
  assert.deepEqual(progress.activeLayers, ["state", "identity", "habit"]);
  assert.equal(progress.programCompleted, false);
});

test("TEST 3 - Identity + Habit: identity -> identity+habit", () => {
  let progress = createInitialProgress("identity_habit_2_week");
  assert.deepEqual(progress.activeLayers, ["identity"]);

  progress = completeAWeek(progress);
  progress = completeProgramWeek(progress);
  assert.deepEqual(progress.nextLayerToBuild, ["habit"]);
  progress = unlockBuildExtension(progress);
  assert.deepEqual(progress.activeLayers, ["identity", "habit"]);
});

test("TEST 4 - Habit Only: single week, programCompleted after it", () => {
  let progress = createInitialProgress("habit_only_1_week");
  assert.deepEqual(progress.activeLayers, ["habit"]);

  progress = completeAWeek(progress);
  progress = completeProgramWeek(progress);
  assert.equal(progress.programCompleted, true);
  assert.equal(progress.nextLayerToBuild, null);
});

test("needs assessment resolves to the right preset for all 4 branches", () => {
  assert.equal(resolveProgramPath({ needsState: true, needsIdentityImmediately: false }), "standard_3_week");
  assert.equal(resolveProgramPath({ needsState: true, needsIdentityImmediately: true }), "advanced_2_week");
  assert.equal(resolveProgramPath({ needsState: false, needsIdentity: true }), "identity_habit_2_week");
  assert.equal(resolveProgramPath({ needsState: false, needsIdentity: false }), "habit_only_1_week");
});

test("migration: legacy programPath values map back to the right needs flags", () => {
  assert.deepEqual(deriveNeedsFromLegacyProgramPath("standard_3_week"), {
    needsState: true, needsIdentity: true, needsHabit: true, needsIdentityImmediately: false,
  });
  assert.deepEqual(deriveNeedsFromLegacyProgramPath("habit_only_1_week"), {
    needsState: false, needsIdentity: false, needsHabit: true, needsIdentityImmediately: false,
  });
});

test("TEST 5 - State Only: engine works with a single-layer program, no identity/habit required", () => {
  const program = getProgramDefinition("state_only_1_week");
  assert.deepEqual(getActiveLayers(program, 1), ["state"]);
  assert.deepEqual(getLayersToBuild(program, 1), ["state"]);
  assert.equal(isLayerActive(getActiveLayers(program, 1), "identity"), false);
  assert.equal(isLayerActive(getActiveLayers(program, 1), "habit"), false);
});

test("TEST 6 - State + Habit: identity never required at any week", () => {
  const program = getProgramDefinition("state_habit_2_week");
  assert.deepEqual(getActiveLayers(program, 1), ["state"]);
  assert.deepEqual(getLayersToBuild(program, 2), ["habit"]);
  assert.deepEqual(getActiveLayers(program, 2), ["state", "habit"]);
  for (const week of program.weeks) {
    assert.equal(isLayerActive(week.activeLayers, "identity"), false, `week ${week.week} should never require identity`);
  }
});

test("TEST 7 - Identity Only: state and habit never required", () => {
  const program = getProgramDefinition("identity_only_1_week");
  assert.deepEqual(getActiveLayers(program, 1), ["identity"]);
  assert.equal(isLayerActive(getActiveLayers(program, 1), "state"), false);
  assert.equal(isLayerActive(getActiveLayers(program, 1), "habit"), false);
});

test("TEST 8 - State + Identity without Habit: valid as a complete program on its own", () => {
  const program = getProgramDefinition("state_identity_2_week");
  const lastWeek = program.weeks[program.weeks.length - 1];
  assert.deepEqual(lastWeek.activeLayers, ["state", "identity"]);
  assert.equal(isLayerActive(lastWeek.activeLayers, "habit"), false);

  let progress = createInitialProgress("state_identity_2_week");
  progress = completeAWeek(progress);
  progress = completeProgramWeek(progress);
  progress = unlockBuildExtension(progress);
  progress = completeAWeek(progress);
  progress = completeProgramWeek(progress);
  assert.equal(progress.programCompleted, true, "a program can validly end without ever building habit");
});

test("every registered program definition weeks are internally consistent, 1 to totalWeeks with no gaps", () => {
  for (const [key, program] of Object.entries(PROGRAM_DEFINITIONS)) {
    const weekNumbers = program.weeks.map((w) => w.week).sort((a, b) => a - b);
    const expected = Array.from({ length: program.totalWeeks }, (_, i) => i + 1);
    assert.deepEqual(weekNumbers, expected, `program "${key}" should define exactly weeks 1..${program.totalWeeks}`);
  }
});
