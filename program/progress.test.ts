import test from "node:test";
import assert from "node:assert/strict";

import {
  recordTrainingDay,
  isArcWeekComplete,
  completeProgramWeek,
  unlockBuildExtension,
  createInitialProgress,
  getArcWeekStatus,
  recordValidLiveCompletion,
} from "./progress.ts";
import { getProgramDefinition, getActiveLayers, getLayersToBuild, isLayerActive } from "./engine.ts";
import { resolveCurrentPreset, deriveNeedsFromLegacyProgramPath } from "./selection.ts";
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
  assert.deepEqual(progress.nextLayersToBuild, ["identity"]);
  progress = unlockBuildExtension(progress);
  assert.deepEqual(progress.activeLayers, ["state", "identity"]);

  progress = completeAWeek(progress);
  progress = completeProgramWeek(progress);
  assert.deepEqual(progress.nextLayersToBuild, ["habit"]);
  progress = unlockBuildExtension(progress);
  assert.deepEqual(progress.activeLayers, ["state", "identity", "habit"]);
});

test("TEST 2 - Advanced: state+identity -> state+identity+habit", () => {
  let progress = createInitialProgress("advanced_2_week");
  assert.deepEqual(progress.activeLayers, ["state", "identity"]);

  progress = completeAWeek(progress);
  progress = completeProgramWeek(progress);
  assert.deepEqual(progress.nextLayersToBuild, ["habit"]);
  progress = unlockBuildExtension(progress);
  assert.deepEqual(progress.activeLayers, ["state", "identity", "habit"]);
  assert.equal(progress.programCompleted, false);
});

test("TEST 3 - Identity + Habit: identity -> identity+habit", () => {
  let progress = createInitialProgress("identity_habit_2_week");
  assert.deepEqual(progress.activeLayers, ["identity"]);

  progress = completeAWeek(progress);
  progress = completeProgramWeek(progress);
  assert.deepEqual(progress.nextLayersToBuild, ["habit"]);
  progress = unlockBuildExtension(progress);
  assert.deepEqual(progress.activeLayers, ["identity", "habit"]);
});

test("TEST 4 - Habit Only: single week, programCompleted after it", () => {
  let progress = createInitialProgress("habit_only_1_week");
  assert.deepEqual(progress.activeLayers, ["habit"]);

  progress = completeAWeek(progress);
  progress = completeProgramWeek(progress);
  assert.equal(progress.programCompleted, true);
  assert.equal(progress.nextLayersToBuild, null);
});

test("needs assessment resolves to the right preset for all 4 branches", () => {
  assert.equal(resolveCurrentPreset({ needsState: true, needsIdentityImmediately: false }), "standard_3_week");
  assert.equal(resolveCurrentPreset({ needsState: true, needsIdentityImmediately: true }), "advanced_2_week");
  assert.equal(resolveCurrentPreset({ needsState: false, needsIdentity: true }), "identity_habit_2_week");
  assert.equal(resolveCurrentPreset({ needsState: false, needsIdentity: false }), "habit_only_1_week");
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

test("completeProgramWeek is idempotent: calling it twice does not double-credit", () => {
  let progress = createInitialProgress("habit_only_1_week");
  progress = completeAWeek(progress);
  progress = completeProgramWeek(progress);
  assert.equal(progress.completedProgramWeeks, 1);

  const calledAgain = completeProgramWeek(progress);
  assert.equal(calledAgain.completedProgramWeeks, 1, "a second call must not add another credit");
  assert.deepEqual(calledAgain, progress, "a second call on an already-completed week is a full no-op");
});

test("unlockBuildExtension on the final week returns progress unchanged, never past totalWeeks", () => {
  let progress = createInitialProgress("habit_only_1_week"); // totalWeeks: 1
  progress = completeAWeek(progress);
  progress = completeProgramWeek(progress);
  assert.equal(progress.programCompleted, true);

  const afterUnlock = unlockBuildExtension(progress);
  assert.equal(afterUnlock.currentProgramWeek, 1, "must not advance past the final week");
  assert.deepEqual(afterUnlock, progress, "unlocking past the end is a full no-op, not a crash or a silent overrun");
});

test("recordTrainingDay does not reset a window that already hit the required day count but isn't finalized yet", () => {
  let progress = createInitialProgress("habit_only_1_week");
  for (const day of ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"]) {
    progress = recordTrainingDay(progress, day);
  }
  assert.equal(isArcWeekComplete(progress), true);
  assert.equal(progress.trainingDatesThisWeek.length, 5);

  // Day 8 is outside the 7-day window (2026-08-03 .. 2026-08-09), but
  // completeProgramWeek() was never called -- the earned days must survive.
  const late = recordTrainingDay(progress, "2026-08-11");
  assert.equal(late.trainingDatesThisWeek.length, 5, "an already-complete window must not be silently reset");
  assert.equal(late.weekStartDate, "2026-08-03");
});

test("recordTrainingDay still opens a fresh window on expiry when the previous window was NOT complete", () => {
  let progress = createInitialProgress("habit_only_1_week");
  progress = recordTrainingDay(progress, "2026-08-03");
  progress = recordTrainingDay(progress, "2026-08-04");
  assert.equal(progress.trainingDatesThisWeek.length, 2);

  const late = recordTrainingDay(progress, "2026-08-15");
  assert.deepEqual(late.trainingDatesThisWeek, ["2026-08-15"], "an incomplete, expired window resets as before");
  assert.equal(late.weekStartDate, "2026-08-15");
});

test("getArcWeekStatus before any training day: not started", () => {
  const progress = createInitialProgress("habit_only_1_week");
  const status = getArcWeekStatus(progress, "2026-08-03");
  assert.equal(status.isStarted, false);
  assert.equal(status.isExpired, false);
  assert.equal(status.trainingDayCount, 0);
  assert.equal(status.requiredTrainingDays, 5);
});

test("getArcWeekStatus mid-window: started, not complete, not expired", () => {
  let progress = createInitialProgress("habit_only_1_week");
  progress = recordTrainingDay(progress, "2026-08-03");
  progress = recordTrainingDay(progress, "2026-08-04");
  const status = getArcWeekStatus(progress, "2026-08-05");
  assert.equal(status.isStarted, true);
  assert.equal(status.isComplete, false);
  assert.equal(status.isExpired, false);
  assert.equal(status.trainingDayCount, 2);
  assert.equal(status.windowStartDate, "2026-08-03");
  assert.equal(status.windowEndDate, "2026-08-09"); // 7-day window inclusive of the start date
  assert.equal(status.daysElapsed, 2);
  assert.equal(status.daysRemaining, 5); // 08-05..08-09 inclusive of today
});

test("getArcWeekStatus after the window closes without completion: expired", () => {
  let progress = createInitialProgress("habit_only_1_week");
  progress = recordTrainingDay(progress, "2026-08-03");
  const status = getArcWeekStatus(progress, "2026-08-15");
  assert.equal(status.isExpired, true);
  assert.equal(status.isComplete, false);
  assert.equal(status.daysRemaining, 0);
});

test("getArcWeekStatus once complete: never expired, regardless of date", () => {
  let progress = createInitialProgress("habit_only_1_week");
  progress = completeAWeek(progress);
  const status = getArcWeekStatus(progress, "2026-09-01");
  assert.equal(status.isComplete, true);
  assert.equal(status.isExpired, false, "a completed week is never 'expired', even long after the window");
});

test("recordValidLiveCompletion gives no training credit when the session didn't reach act", () => {
  const progress = createInitialProgress("habit_only_1_week");
  const result = recordValidLiveCompletion({ progress, reachedAct: false, actionCompleted: false, localDate: "2026-08-03" });
  assert.equal(result.liveSessionCount, 1, "the session still counts toward liveSessionCount");
  assert.equal(result.weekStartDate, null, "but no training-day credit is granted");
  assert.equal(result.trainingDatesThisWeek.length, 0);
});

test("recordValidLiveCompletion gives no training credit when act was reached but the action wasn't actually completed", () => {
  const progress = createInitialProgress("habit_only_1_week");
  const result = recordValidLiveCompletion({ progress, reachedAct: true, actionCompleted: false, localDate: "2026-08-03" });
  assert.equal(result.trainingDatesThisWeek.length, 0);
});

test("recordValidLiveCompletion grants training credit only when act was reached AND the action was completed", () => {
  const progress = createInitialProgress("habit_only_1_week");
  const result = recordValidLiveCompletion({ progress, reachedAct: true, actionCompleted: true, localDate: "2026-08-03" });
  assert.deepEqual(result.trainingDatesThisWeek, ["2026-08-03"]);
});

test("recordValidLiveCompletion caps training credit at one day even with multiple qualifying sessions the same day", () => {
  let progress = createInitialProgress("habit_only_1_week");
  progress = recordValidLiveCompletion({ progress, reachedAct: true, actionCompleted: true, localDate: "2026-08-03" });
  progress = recordValidLiveCompletion({ progress, reachedAct: true, actionCompleted: true, localDate: "2026-08-03" });
  progress = recordValidLiveCompletion({ progress, reachedAct: true, actionCompleted: true, localDate: "2026-08-03" });
  assert.equal(progress.trainingDatesThisWeek.length, 1, "only one credited training day for the date");
  assert.equal(progress.liveSessionCount, 3, "but every qualifying session is still counted");
});

test("recordValidLiveCompletion auto-completes the week the moment the required day count is hit", () => {
  let progress = createInitialProgress("habit_only_1_week");
  for (const day of ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"]) {
    progress = recordValidLiveCompletion({ progress, reachedAct: true, actionCompleted: true, localDate: day });
  }
  assert.equal(progress.completedProgramWeeks, 1, "the week is completed immediately, no separate completeProgramWeek() call needed");
  assert.equal(progress.programCompleted, true);
});
