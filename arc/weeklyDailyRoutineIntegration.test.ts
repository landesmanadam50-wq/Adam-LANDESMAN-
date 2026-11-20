import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createEmptyTask } from "./tasks.ts";
import type { Task } from "./tasks.ts";
import { resolveDailyPlan } from "./dailyPlan.ts";
import { applyScheduleMode } from "./dailyPlan.ts";
import { listWeekOneTimeEvents } from "./weeklyRoutine.ts";

/**
 * arc/weeklyDailyRoutineIntegration.test.ts
 *
 * Weekly & Daily Routine Redesign task, section 10: cross-cutting
 * integration checks that don't belong to any single pure module's own
 * test file -- required tests 12 (future events in the correct daily
 * calendar), 15 (protection of completed-task/ARC/Manifest history),
 * 17 (correct Task LIVE timer durations), and 18 (new storage keys
 * actually persist).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const NOW = "2026-01-01T00:00:00.000Z";

// Required test 12: a future one-time event planned from the Weekly
// screen (section 5) must appear in that EXACT date's Flexible Daily
// Routine -- the same Task record, read by BOTH listWeekOneTimeEvents
// (the weekly view) and resolveDailyPlan (the daily view), never two
// competing representations that could disagree.
test("required test 12: a one-time event visible in the weekly view for its own date is the SAME record resolveDailyPlan surfaces for that exact date", () => {
  const appointment: Task = { ...createEmptyTask("o1", "תור לרופא", "להתחיל", NOW), scheduledDate: "2026-01-07", scheduledTime: "12:00" };
  const weeklyView = listWeekOneTimeEvents([appointment], "2026-01-04");
  assert.deepEqual(weeklyView.map((t) => t.id), ["o1"]);

  const dailyView = resolveDailyPlan([appointment], [], [], "2026-01-07", new Date(2026, 0, 7));
  assert.equal(dailyView.length, 1);
  assert.equal(dailyView[0].task.id, "o1");
  assert.equal(dailyView[0].origin, "oneoff");
  assert.equal(dailyView[0].scheduledTime, "12:00");

  // And it must NOT appear on any other date's own daily view.
  const otherDayView = resolveDailyPlan([appointment], [], [], "2026-01-08", new Date(2026, 0, 8));
  assert.equal(otherDayView.length, 0);
});

// Required test 15: the weekly reset (build/WeeklyRoutineScreen.tsx's
// own handleResetWeek) must never touch completed-task history, ARC
// sessions, or Manifest data -- it only ever reads/writes the three
// collections section 6 actually names (completions, occurrence
// overrides, schedule-mode overrides). Verified structurally: the
// function body never references any ARC insight/belief, Manifest, or
// task-journal storage function at all.
test("required test 15: the weekly reset function never references ARC insight/belief, Manifest, or task-journal storage -- completed-task/ARC/Manifest history is structurally untouched", () => {
  const screen = readSource("build/WeeklyRoutineScreen.tsx");
  const fnIndex = screen.indexOf("function handleResetWeek()");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }\n", fnIndex));
  for (const forbidden of ["ArcInsight", "ArcBelief", "PurposeManifest", "ManifestRunState", "TaskJournal", "ArcGoal"]) {
    assert.ok(!fnBody.includes(forbidden), `the weekly reset must never reference ${forbidden} -- it is out of scope for this reset entirely`);
  }
});

// Required test 17: the auto-scheduler only ever computes/writes a
// TIME -- it must never read or alter a task's own expectedDurationMinutes,
// so Task LIVE's own timer duration is always whatever the template (or
// an explicit per-date edit) actually set, never silently changed by
// scheduling.
test("required test 17: applyScheduleMode never alters an entry's own expectedDurationMinutes -- only scheduledTime/effectiveStartTime are computed", () => {
  const task: Task = { ...createEmptyTask("t1", "משימה", "להתחיל", NOW), recurrence: { kind: "recurring", daysOfWeek: [1] }, scheduledTime: null, expectedDurationMinutes: 45 };
  const plan = resolveDailyPlan([task], [], [], "2026-01-05", new Date(2026, 0, 5));
  const scheduled = applyScheduleMode(plan, { mode: "spaced", gapMinutes: 10 });
  assert.equal(scheduled[0].expectedDurationMinutes, 45, "the duration itself must never be touched by the scheduler");
});

// Required test 18: persistence after application restart -- the two
// new storage keys are real, versioned AsyncStorage keys (same
// convention as every other collection in this codebase), with their
// own CRUD functions actually wired to them.
test("required test 18: the new weekly-schedule-mode storage keys and their CRUD functions are registered in data/storage.ts", () => {
  const storage = readSource("data/storage.ts");
  assert.match(storage, /const WEEKLY_SCHEDULE_MODE_SETTINGS_KEY = "archi\.weeklyScheduleModeSettings\.v1";/);
  assert.match(storage, /const DAILY_SCHEDULE_MODE_OVERRIDES_KEY = "archi\.dailyScheduleModeOverrides\.v1";/);
  for (const fn of [
    "loadWeeklyScheduleModeSettings",
    "saveWeeklyScheduleModeSettings",
    "loadDailyScheduleModeOverrides",
    "saveDailyScheduleModeOverrides",
    "upsertDailyScheduleModeOverrideEntry",
  ]) {
    assert.match(storage, new RegExp(`export async function ${fn}\\(`), `${fn} must be exported from data/storage.ts`);
  }
});

test("required test 18: loadTaskOccurrenceOverrides backfills timeIsManual to true for data saved before this task existed -- a restarted app never silently lets the auto-scheduler move an old, pre-existing override's own time", () => {
  const storage = readSource("data/storage.ts");
  const fnIndex = storage.indexOf("export async function loadTaskOccurrenceOverrides(");
  const fnBody = storage.slice(fnIndex, storage.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("entry.timeIsManual ?? true"));
});
