import test from "node:test";
import assert from "node:assert/strict";

import { getActionTimerStatus } from "../arc/actionTimer.ts";
import { resolveNegativeActionDuration } from "./engine.ts";
import { PROGRAM_DEFINITIONS } from "./config.ts";
import type { ProgramDefinition } from "./programTypes.ts";

const standardThreeWeek = PROGRAM_DEFINITIONS.standard_3_week;

test("resolveNegativeActionDuration never invents a duration when no base was configured", () => {
  assert.equal(resolveNegativeActionDuration(1, standardThreeWeek, null), null);
  assert.equal(resolveNegativeActionDuration(3, standardThreeWeek, null), null);
});

// --- REGRESSION (legacy data): a profile saved before
// negativeActionBaseDurationMinutes ever existed has this field
// genuinely ABSENT (`undefined`, not `null`) once JSON.parse'd --
// data/storage.ts's loadProfile is a bare parse with no migration
// step. Passing `undefined` here used to fall through the `=== null`
// check straight into `Math.round(undefined * scale)` = NaN, which
// then made the Negative Action Timer never complete (any comparison
// with NaN is false) and displayed "NaN:NaN" as the remaining time.

test("REGRESSION: resolveNegativeActionDuration treats a legacy-absent (undefined) base duration exactly like null -- never NaN", () => {
  const result = resolveNegativeActionDuration(1, standardThreeWeek, undefined);
  assert.equal(result, null);
  assert.notEqual(Number.isNaN(result as unknown as number), true);
});

test("REGRESSION: resolveNegativeActionDuration(undefined) behaves identically to resolveNegativeActionDuration(null) across every program week", () => {
  for (let week = 1; week <= 3; week++) {
    assert.equal(resolveNegativeActionDuration(week, standardThreeWeek, undefined), resolveNegativeActionDuration(week, standardThreeWeek, null));
  }
});

test("REGRESSION: a legacy-absent base duration flows into a NEVER-NaN, immediately-complete Action Timer status -- no NaN duration, no stuck-forever timer, no 'NaN:NaN' display", () => {
  const legacyBaseDuration = undefined; // simulates ArcBuildProfile.negativeActionBaseDurationMinutes missing entirely on a pre-feature profile
  const resolved = resolveNegativeActionDuration(1, standardThreeWeek, legacyBaseDuration);
  const status = getActionTimerStatus(resolved, 0);
  assert.equal(Number.isNaN(status.remainingSeconds), false, "remainingSeconds must never be NaN");
  assert.equal(status.remainingSeconds, 0);
  assert.equal(status.complete, true, "with no configured duration, the Negative Action Timer resolves as immediately complete -- never stuck waiting on a NaN comparison");
});

// --- Newly created programs: buildProfileFromDraft (build/profileWizard.ts)
// always persists a real finite number or null for this field -- never
// undefined, never NaN -- so this same resolver, fed a freshly-created
// profile's value, must produce a real scaled duration end to end.

test("a freshly-created program's configured base duration resolves to a real, non-NaN, correctly-scaled Negative Action Timer duration", () => {
  const freshlyConfiguredBaseDuration = 20; // what buildProfileFromDraft would persist for a trainee who entered "20"
  const week1 = resolveNegativeActionDuration(1, standardThreeWeek, freshlyConfiguredBaseDuration);
  const week2 = resolveNegativeActionDuration(2, standardThreeWeek, freshlyConfiguredBaseDuration);
  assert.equal(week1, 20);
  assert.equal(week2, Math.round(20 * 0.65));
  assert.equal(Number.isNaN(week1), false);
  assert.equal(Number.isNaN(week2), false);
  const status = getActionTimerStatus(week1, 0);
  assert.equal(status.complete, false, "a real configured duration genuinely gates the timer, unlike the legacy-absent case");
  assert.equal(status.remainingSeconds, week1! * 60);
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
