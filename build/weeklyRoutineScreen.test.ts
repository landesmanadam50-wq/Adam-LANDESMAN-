import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/weeklyRoutineScreen.test.ts
 *
 * Fixed Weekly Routine task: source-text regression guard for
 * build/WeeklyRoutineScreen.tsx -- the grouping/reset logic itself is
 * covered directly by arc/weeklyRoutine.test.ts; this file only checks
 * the screen wires that pure module and the shared task editor/storage
 * correctly, same convention as every other screen test here.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("build/WeeklyRoutineScreen.tsx");
const layout = readSource("app/_layout.tsx");

test("the routine-week route is registered and the route file renders WeeklyRoutineScreen", () => {
  assert.match(layout, /<Stack\.Screen name="routine-week"/);
  const route = readSource("app/routine-week.tsx");
  assert.ok(route.includes("WeeklyRoutineScreen"));
});

test("groups tasks via resolveWeeklyRoutineByDay, loaded from the shared task store, excluding archived tasks", () => {
  assert.ok(screen.includes("resolveWeeklyRoutineByDay(tasks)"));
  assert.ok(screen.includes('loaded.filter((task) => task.status !== "archived")'));
});

test("renders all 7 WEEKDAY_LABELS_HE entries and an add-task button per day that opens the SAME shared task editor (never a second, competing recurring-task form)", () => {
  assert.ok(screen.includes("WEEKDAY_LABELS_HE.map"));
  assert.ok(screen.includes('router.push({ pathname: "/tasks/[id]/edit", params: { id: "new" } })'));
});

test("tapping an existing recurring task opens the shared editor for that task's own id (the Fixed Weekly Routine template, not a date-specific override)", () => {
  assert.ok(screen.includes('router.push({ pathname: "/tasks/[id]/edit", params: { id: task.id } })'));
});

// --- Weekly & Daily Routine Redesign task ---------------------------------

test("tapping a weekday's own header opens the Flexible Daily Routine for that EXACT calendar date, via the shared handleOpenDay dispatcher", () => {
  const fnIndex = screen.indexOf("function handleOpenDay(dateLocal: string)");
  assert.ok(fnIndex >= 0);
  const fnBody = screen.slice(fnIndex, fnIndex + 200);
  assert.ok(fnBody.includes('pathname: "/routine-day", params: { date: dateLocal }'));
  // The day header itself must call this exact dispatcher, keyed off the real resolved date, not a generic weekday index.
  assert.ok(screen.includes("onPress={() => handleOpenDay(dateLocal)}"));
});

test("supports previous/current/next week navigation via shiftWeek, and a direct jump back to the current week", () => {
  assert.ok(screen.includes('shiftWeek(weekStartLocal, "prev")'));
  assert.ok(screen.includes('shiftWeek(weekStartLocal, "next")'));
  assert.ok(screen.includes("resolveWeekStartLocalDate(todayLocalDateString(new Date()))"));
  assert.ok(screen.includes("isCurrentWeek(weekStartLocal)"));
});

test("each weekday offers its own continuous/spaced control -- every WEEKLY_SPACED_GAP_PRESETS value, plus a custom gap input -- writing through setWeekdayScheduleMode and reconciling alarms afterward", () => {
  const fnIndex = screen.indexOf("async function handleSetWeekdayMode(");
  assert.ok(fnIndex >= 0);
  const fnBody = screen.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("setWeekdayScheduleMode(settings, weekday, mode)"));
  assert.ok(fnBody.includes("saveWeeklyScheduleModeSettings("));
  assert.ok(fnBody.includes("reconcileTaskAlarms()"));
  assert.ok(screen.includes("WEEKLY_SPACED_GAP_PRESETS.map("));
  assert.ok(screen.includes('placeholder="מותאם"'), "a custom (non-preset) gap duration must be enterable");
});

test("the week's own one-time events are listed per day via listWeekOneTimeEvents, each individually removable without touching the permanent template", () => {
  assert.ok(screen.includes("listWeekOneTimeEvents(tasks, weekStartLocal)"));
  const fnIndex = screen.indexOf("function handleRemoveOneTimeEvent(");
  assert.ok(fnIndex >= 0);
  const fnBody = screen.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("deleteTask(task.id)"));
  assert.ok(fnBody.includes("Alert.alert("), "removing a single one-time event must still ask for confirmation");
});

test("reordering calls reorderWeeklyTask and persists every returned task via upsertTask -- never touches a task outside the moved pair's own day", () => {
  const fnIndex = screen.indexOf("async function handleReorder(");
  const fnBody = screen.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("reorderWeeklyTask(dayTasks, taskId, direction)"));
  assert.ok(fnBody.includes("for (const task of updated) await upsertTask(task);"));
});

test("reordering is disabled at the top/bottom of each day's own list (never silently no-op without visual feedback)", () => {
  assert.ok(screen.includes("disabled={position === 0}"));
  assert.ok(screen.includes("disabled={position === dayTasks.length - 1}"));
});

// Weekly & Daily Routine Redesign task, section 6: the synchronized
// weekly reset now also clears date-specific time/duration/order
// overrides and mode overrides for the viewed week, reconciles alarms
// afterward, and still tells the trainee the permanent template and
// one-time events are untouched -- never bundling the one-time-events
// clear (its own separate, explicitly-confirmed action) into this one.
test("the weekly reset action clears this week's completions, occurrence overrides, and schedule-mode overrides, reconciles alarms, and tells the trainee the permanent template and one-time events are untouched", () => {
  const fnIndex = screen.indexOf("function handleResetWeek()");
  const fnBody = screen.slice(fnIndex, fnIndex + 1400);
  assert.ok(fnBody.includes("resetWeekCompletions(completions, weekStartLocal)"));
  assert.ok(fnBody.includes("resetWeekOccurrenceOverrides(overrides, weekStartLocal)"));
  assert.ok(fnBody.includes("resetWeekScheduleModeOverrides(modeOverrides, weekStartLocal)"));
  assert.ok(fnBody.includes("reconcileTaskAlarms()"));
  assert.ok(fnBody.includes("השגרה הקבועה עצמה והאירועים החד-פעמיים לא יישתנו"));
});

test("a separate, explicitly-confirmed action clears the viewed week's one-time events, listing each one by name before deleting any of them", () => {
  const fnIndex = screen.indexOf("function handleClearWeekOneTimeEvents()");
  assert.ok(fnIndex >= 0, "the separate one-time-events clear action must exist");
  const fnBody = screen.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("weekOneTimeEvents.map((task) =>"), "it must list the affected events by name before deleting");
  assert.ok(fnBody.includes("deleteTask(task.id)"));
  assert.ok(fnBody.includes("Alert.alert("), "it must require its own explicit confirmation, separate from the main reset");
});

test("includes PersistentTaskControls, the single shared ARC/start-task dispatcher every other task screen already uses", () => {
  assert.ok(screen.includes("<PersistentTaskControls"));
});
