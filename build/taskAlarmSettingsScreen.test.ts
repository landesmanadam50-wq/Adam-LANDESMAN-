import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/taskAlarmSettingsScreen.test.ts
 *
 * Task-start alarm vibration task, requirement 7: source-text
 * regression guard for the sound/vibration settings screen -- no React
 * Native component test renderer exists in this codebase (every other
 * screen test follows the same convention), so this checks the real
 * source text instead of actually rendering it.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("build/TaskAlarmSettingsScreen.tsx");
const route = readSource("app/tasks/alarm-settings.tsx");
const layout = readSource("app/_layout.tsx");
const tasksListScreen = readSource("build/TasksListScreen.tsx");

test("the route is registered and renders the screen directly, with no params", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/alarm-settings"/);
  assert.match(route, /from ["']\.\.\/\.\.\/build\/TaskAlarmSettingsScreen\.tsx["']/);
  assert.ok(route.includes("<TaskAlarmSettingsScreen />"));
});

test("the Tasks list offers a nav button straight to the alarm settings screen", () => {
  assert.ok(tasksListScreen.includes('router.push("/tasks/alarm-settings")'));
});

test("sound and vibration are two SEPARATE switches, each wired to its own preference field -- never a single combined toggle", () => {
  const soundSwitchIndex = screen.indexOf("preferences.soundEnabled");
  const vibrationSwitchIndex = screen.indexOf("preferences.vibrationEnabled");
  assert.ok(soundSwitchIndex !== -1 && vibrationSwitchIndex !== -1 && soundSwitchIndex !== vibrationSwitchIndex);
  assert.ok(screen.includes("update({ soundEnabled: value })"));
  assert.ok(screen.includes("update({ vibrationEnabled: value })"));
});

test("update() persists the change AND immediately re-arms every already-pending task alarm -- a preference change is never left to only apply the next time an alarm happens to be re-armed anyway", () => {
  const fnIndex = screen.indexOf("async function update(");
  const fnBody = screen.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("await saveTaskAlarmPreferences(next);"));
  assert.ok(fnBody.includes("await rearmAllTaskAlarms();"));
});

test("the screen never schedules/cancels a notification directly -- all of that stays inside data/taskAlarm.ts, never a second, competing scheduling path here", () => {
  assert.ok(!screen.includes("scheduleReminderNotification") && !screen.includes("cancelScheduledNotification"));
});

test("Android-only: offers a way to open the OS's own exact-alarm permission settings, since Android doesn't expose that as an in-app runtime dialog", () => {
  assert.ok(screen.includes('Platform.OS === "android"'));
  assert.ok(screen.includes("notifee.openAlarmPermissionSettings()"));
});

// --- Task Reflection Memory task, requirement 7: lock-screen privacy preference ---

test("a THIRD switch controls showReflectionOnLockScreen, going through the exact same update() path (persist + rearmAllTaskAlarms) as sound/vibration -- the change applies to every already-pending alarm immediately", () => {
  const switchIndex = screen.indexOf("preferences.showReflectionOnLockScreen");
  assert.ok(switchIndex !== -1);
  assert.ok(screen.includes("update({ showReflectionOnLockScreen: value })"));
});
