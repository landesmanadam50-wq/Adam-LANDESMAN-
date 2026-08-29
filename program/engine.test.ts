import test from "node:test";
import assert from "node:assert/strict";

import { resolveNegativeActionDuration } from "./engine.ts";
import { PROGRAM_DEFINITIONS } from "./config.ts";
import type { ProgramDefinition } from "./programTypes.ts";

const standardThreeWeek = PROGRAM_DEFINITIONS.standard_3_week;

test("resolveNegativeActionDuration never invents a duration when no base was configured", () => {
  assert.equal(resolveNegativeActionDuration(1, standardThreeWeek, null), null);
  assert.equal(resolveNegativeActionDuration(3, standardThreeWeek, null), null);
});

test("Week 1 of the three-week program loads the correct configured (unscaled) Negative Action duration", () => {
  assert.equal(resolveNegativeActionDuration(1, standardThreeWeek, 20), 20);
});

test("Week 2 of the three-week program loads its correct reduced duration", () => {
  const result = resolveNegativeActionDuration(2, standardThreeWeek, 20);
  assert.ok(result !== null && result < 20, "week 2 must be smaller than the base allowance");
  assert.equal(result, Math.round(20 * 0.65));
});

test("Week 3 of the three-week program loads its correct further-reduced duration", () => {
  const week2 = resolveNegativeActionDuration(2, standardThreeWeek, 20)!;
  const week3 = resolveNegativeActionDuration(3, standardThreeWeek, 20)!;
  assert.ok(week3 < week2, "week 3 must be smaller than week 2 -- gradual reduction, not a flat cut");
  assert.equal(week3, Math.round(20 * 0.35));
});

test("no manual daily duration selection is required -- the resolver is a pure function of (week, program, base), nothing session-specific", () => {
  const a = resolveNegativeActionDuration(2, standardThreeWeek, 20);
  const b = resolveNegativeActionDuration(2, standardThreeWeek, 20);
  assert.equal(a, b);
});

test("a program week with no negativeActionDurationScale configured falls back to the base duration unscaled -- existing program paths behave exactly as before this feature existed", () => {
  const programWithoutSchedule: ProgramDefinition = {
    id: "no_schedule_program",
    totalWeeks: 1,
    weeks: [{ week: 1, activeLayers: ["habit"], layersToBuild: ["habit"] }],
  };
  assert.equal(resolveNegativeActionDuration(1, programWithoutSchedule, 20), 20);
});

test("an out-of-range/unknown week falls back to the base duration unscaled (getCurrentWeekDefinition returns null)", () => {
  assert.equal(resolveNegativeActionDuration(99, standardThreeWeek, 20), 20);
});

test("resolveNegativeActionDuration rounds to a whole number of minutes", () => {
  const result = resolveNegativeActionDuration(2, standardThreeWeek, 7);
  assert.ok(Number.isInteger(result));
});

test("an already-running timer's duration is fixed at start time, unaffected by a later call with a different week -- resolveNegativeActionDuration itself never mutates or remembers a prior call's result", () => {
  const startedAtWeek1 = resolveNegativeActionDuration(1, standardThreeWeek, 20);
  // Simulates the trainee advancing to week 2 -- a NEW call with the new
  // week returns the new week's duration, but this never retroactively
  // changes the earlier result a timer run would have already persisted.
  const calledAgainAtWeek2 = resolveNegativeActionDuration(2, standardThreeWeek, 20);
  assert.notEqual(startedAtWeek1, calledAgainAtWeek2);
  assert.equal(resolveNegativeActionDuration(1, standardThreeWeek, 20), startedAtWeek1, "week 1's own resolution is unaffected by the week 2 call");
});
