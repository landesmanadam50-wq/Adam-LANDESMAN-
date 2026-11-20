import test from "node:test";
import assert from "node:assert/strict";

import {
  createDefaultWeeklyScheduleModeSettings,
  findDailyScheduleModeOverride,
  isCurrentWeek,
  resetWeekScheduleModeOverrides,
  resolveEffectiveScheduleMode,
  resolveGapMinutes,
  resolveWeekDates,
  resolveWeekdayScheduleMode,
  setWeekdayScheduleMode,
  shiftWeek,
  upsertDailyScheduleModeOverride,
  WEEKLY_SPACED_GAP_PRESETS,
} from "./weeklyScheduleMode.ts";
import type { DailyScheduleModeOverride, WeeklyScheduleMode } from "./weeklyScheduleMode.ts";

const NOW = "2026-01-01T00:00:00.000Z";

// Required test 6/7/8: continuous scheduling, spaced scheduling, different gaps per weekday.

test("createDefaultWeeklyScheduleModeSettings defaults every weekday to spaced/10 (Nine Functional Improvements task, Improvement 5: Spaced is now the default)", () => {
  const settings = createDefaultWeeklyScheduleModeSettings();
  for (let weekday = 0; weekday <= 6; weekday++) {
    assert.deepEqual(resolveWeekdayScheduleMode(settings, weekday), { mode: "spaced", gapMinutes: 10 });
  }
});

test("setWeekdayScheduleMode replaces only the targeted weekday's own entry -- every other weekday keeps its own prior mode", () => {
  let settings = createDefaultWeeklyScheduleModeSettings();
  settings = setWeekdayScheduleMode(settings, 1, { mode: "spaced", gapMinutes: 15 }); // Monday: spaced, 15 min
  settings = setWeekdayScheduleMode(settings, 2, { mode: "spaced", gapMinutes: 5 }); // Tuesday: spaced, 5 min
  assert.deepEqual(resolveWeekdayScheduleMode(settings, 1), { mode: "spaced", gapMinutes: 15 });
  assert.deepEqual(resolveWeekdayScheduleMode(settings, 2), { mode: "spaced", gapMinutes: 5 });
  assert.deepEqual(resolveWeekdayScheduleMode(settings, 0), { mode: "spaced", gapMinutes: 10 }, "Sunday must stay at the default (spaced/10), untouched by Monday/Tuesday's own changes");
});

test("resolveWeekdayScheduleMode falls back to spaced/10 for a weekday never configured at all (a settings object saved before this task existed, or any weekday the trainee never touched)", () => {
  assert.deepEqual(resolveWeekdayScheduleMode({}, 3), { mode: "spaced", gapMinutes: 10 });
});

test("resolveGapMinutes returns 0 for continuous and the chosen interval for spaced, across every preset", () => {
  assert.equal(resolveGapMinutes({ mode: "continuous" }), 0);
  for (const gapMinutes of WEEKLY_SPACED_GAP_PRESETS) {
    assert.equal(resolveGapMinutes({ mode: "spaced", gapMinutes }), gapMinutes);
  }
  assert.equal(resolveGapMinutes({ mode: "spaced", gapMinutes: 45 }), 45, "a custom (non-preset) duration must work identically to a preset one");
});

// Required test 9: date-specific scheduling overrides.

test("findDailyScheduleModeOverride matches by exact date only", () => {
  const overrides: DailyScheduleModeOverride[] = [{ occurrenceDateLocal: "2026-01-05", mode: { mode: "spaced", gapMinutes: 10 }, updatedAt: NOW }];
  assert.ok(findDailyScheduleModeOverride("2026-01-05", overrides));
  assert.equal(findDailyScheduleModeOverride("2026-01-06", overrides), null);
});

test("upsertDailyScheduleModeOverride replaces an existing date's entry rather than accumulating a second one", () => {
  const first: DailyScheduleModeOverride = { occurrenceDateLocal: "2026-01-05", mode: { mode: "continuous" }, updatedAt: NOW };
  const second: DailyScheduleModeOverride = { occurrenceDateLocal: "2026-01-05", mode: { mode: "spaced", gapMinutes: 30 }, updatedAt: "2026-01-02T00:00:00.000Z" };
  const result = upsertDailyScheduleModeOverride([first], second);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].mode, { mode: "spaced", gapMinutes: 30 });
});

test("resolveEffectiveScheduleMode: a date-specific override wins over that date's own weekday setting, without changing the permanent weekday setting itself", () => {
  let settings = createDefaultWeeklyScheduleModeSettings();
  settings = setWeekdayScheduleMode(settings, 1, { mode: "spaced", gapMinutes: 15 }); // Monday permanently spaced/15
  const dateOverrides: DailyScheduleModeOverride[] = [{ occurrenceDateLocal: "2026-01-05", mode: { mode: "continuous" }, updatedAt: NOW }]; // this one Monday overridden to continuous

  const overriddenDate = resolveEffectiveScheduleMode(1, "2026-01-05", settings, dateOverrides);
  assert.deepEqual(overriddenDate, { mode: "continuous" }, "the date override must win");

  const nextMonday = resolveEffectiveScheduleMode(1, "2026-01-12", settings, dateOverrides);
  assert.deepEqual(nextMonday, { mode: "spaced", gapMinutes: 15 }, "the permanent weekday setting must still apply to every OTHER Monday");

  assert.deepEqual(resolveWeekdayScheduleMode(settings, 1), { mode: "spaced", gapMinutes: 15 }, "the permanent weekday setting itself must be completely untouched by the one-date override");
});

test("resolveEffectiveScheduleMode falls back to spaced/10 when neither a date override nor a weekday setting exists", () => {
  assert.deepEqual(resolveEffectiveScheduleMode(4, "2026-01-08", {}, []), { mode: "spaced", gapMinutes: 10 });
});

test("resolveWeekDates returns the exact 7 local dates (Sunday through Saturday) starting at weekStartLocal", () => {
  const dates = resolveWeekDates("2026-11-22"); // a Sunday
  assert.deepEqual(dates, ["2026-11-22", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"]);
});

// Required test 13: synchronized weekly reset (the mode-override slice of it).

test("resetWeekScheduleModeOverrides removes only the date overrides within the given week, never a different week's own override, and never the permanent weekday settings (which this function doesn't even touch)", () => {
  const overrides: DailyScheduleModeOverride[] = [
    { occurrenceDateLocal: "2026-11-25", mode: { mode: "continuous" }, updatedAt: NOW }, // inside the week of 2026-11-22
    { occurrenceDateLocal: "2026-12-02", mode: { mode: "spaced", gapMinutes: 10 }, updatedAt: NOW }, // the following week
  ];
  const result = resetWeekScheduleModeOverrides(overrides, "2026-11-22");
  assert.deepEqual(result, [overrides[1]]);
});

test("isCurrentWeek is true only for the week actually containing `now`", () => {
  const now = new Date("2026-11-25T12:00:00");
  assert.equal(isCurrentWeek("2026-11-22", now), true);
  assert.equal(isCurrentWeek("2026-11-15", now), false);
  assert.equal(isCurrentWeek("2026-11-29", now), false);
});

test("shiftWeek moves exactly 7 days forward or back, and is its own inverse", () => {
  assert.equal(shiftWeek("2026-11-22", "next"), "2026-11-29");
  assert.equal(shiftWeek("2026-11-22", "prev"), "2026-11-15");
  assert.equal(shiftWeek(shiftWeek("2026-11-22", "next"), "prev"), "2026-11-22");
});

test("a custom (non-preset) spaced gap duration is a perfectly valid WeeklyScheduleMode, not restricted to the 4 presets", () => {
  const custom: WeeklyScheduleMode = { mode: "spaced", gapMinutes: 7 };
  assert.equal(resolveGapMinutes(custom), 7);
});
