import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/taskScheduledStart.test.ts
 *
 * Productivity upgrade task, requirement 2: source-text regression
 * guard for the I/O half of the "it's time to start this task" alarm
 * -- data/storage.ts depends on the real native AsyncStorage module
 * and isn't callable from a plain `node --test` run (every other
 * *.test.ts touching storage.ts follows the same constraint), so this
 * checks the real source text instead of actually invoking it. The
 * pure date math itself is fully exercised in
 * arc/taskScheduledStart.test.ts.
 *
 * Task-alarm task ("הפיכת התראות המשימות לשעון מעורר אמיתי"): this
 * module's own scheduling (rescheduleTaskStartNotification/
 * reconcileTaskScheduledStartNotifications/rescheduleAllTaskStartNotifications)
 * is superseded by data/taskAlarm.ts's notifee-backed real alarm --
 * see data/taskAlarm.test.ts for that module's own tests, and every
 * call site's test below for where each one was repointed. This file
 * is deliberately left in place, still correct and still tested, as a
 * safety net: it was never deleted so the previous one-shot-notification
 * behavior stays a trivial rollback away if the native alarm doesn't
 * hold up under real-device testing.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/taskScheduledStart.ts");
const storage = readSource("data/storage.ts");
const layout = readSource("app/_layout.tsx");
const taskEditorScreen = readSource("build/TaskEditorScreen.tsx");
const todayScreen = readSource("build/TodayScreen.tsx");

test("ReminderKind gained 'taskScheduledStart'", () => {
  assert.match(storage, /\|\s*"taskScheduledStart"/);
});

// Task-start alarm vibration task, requirement 7: the persisted
// sound/vibration preference -- both default to true (requirement 1).
test("TaskAlarmPreferences defaults soundEnabled, vibrationEnabled AND showReflectionOnLockScreen (Task Reflection Memory task) all to true, and load/save are keyed under their own dedicated storage key, never sharing one with anything else", () => {
  assert.ok(storage.includes("const DEFAULT_TASK_ALARM_PREFERENCES: TaskAlarmPreferences = { soundEnabled: true, vibrationEnabled: true, showReflectionOnLockScreen: true };"));
  assert.match(storage, /const TASK_ALARM_PREFERENCES_KEY = "archi\.taskAlarmPreferences\.v1";/);
  assert.ok(storage.includes("export async function loadTaskAlarmPreferences(): Promise<TaskAlarmPreferences> {"));
  assert.ok(storage.includes("export async function saveTaskAlarmPreferences(preferences: TaskAlarmPreferences): Promise<void> {"));
});

test("rescheduleTaskStartNotification always cancels the task's existing notification first, then schedules a fresh one via the shared scheduleReminderNotification, never a parallel scheduling path", () => {
  const fnIndex = module_.indexOf("export async function rescheduleTaskStartNotification");
  const fnBody = module_.slice(fnIndex, fnIndex + 1100);
  assert.ok(fnBody.includes("await cancelScheduledNotification(task.notificationId)"));
  assert.ok(fnBody.includes('kind: "taskScheduledStart"'));
  assert.ok(fnBody.includes("taskId: task.id"));
});

test("rescheduleTaskStartNotification clears notificationId/notificationScheduledFor to null when nothing qualifies anymore, never leaving a stale pair", () => {
  const fnIndex = module_.indexOf("export async function rescheduleTaskStartNotification");
  const fnBody = module_.slice(fnIndex, fnIndex + 1100);
  assert.ok(fnBody.includes("notificationId: null, notificationScheduledFor: null"));
});

// Task-start alarm vibration task, requirement 7: the trainee's own
// sound/vibration preference is read in THIS I/O layer and passed
// through to the shared scheduleReminderNotification, never read
// inside data/notifications.ts itself (which stays a dumb mechanical
// wrapper, per its own module doc).
test("rescheduleTaskStartNotification reads the trainee's own saved sound/vibration preference and passes both through to scheduleReminderNotification", () => {
  const fnIndex = module_.indexOf("export async function rescheduleTaskStartNotification");
  const fnBody = module_.slice(fnIndex, fnIndex + 1100);
  assert.ok(fnBody.includes("const preferences = await loadTaskAlarmPreferences();"));
  assert.ok(fnBody.includes("soundEnabled: preferences.soundEnabled,"));
  assert.ok(fnBody.includes("vibrationEnabled: preferences.vibrationEnabled,"));
});

test("rescheduleAllTaskStartNotifications reschedules every 'planned' task's own alarm unconditionally (never gated on whether its occurrence time drifted), so a preference change takes effect immediately on already-pending alarms", () => {
  const fnIndex = module_.indexOf("export async function rescheduleAllTaskStartNotifications");
  assert.ok(fnIndex !== -1);
  const fnBody = module_.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes('task.status === "planned" ? rescheduleTaskStartNotification(task, now) : task'));
});

test("reconcileTaskScheduledStartNotifications only ever touches a 'planned' task -- any other status (e.g. postponed, whose notificationId belongs to a different reminder) is left completely untouched", () => {
  const fnIndex = module_.indexOf("export async function reconcileTaskScheduledStartNotifications");
  const fnBody = module_.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes('if (task.status !== "planned") return task;'));
});

test("app/_layout.tsx still recognizes a (now unused) 'taskScheduledStart' notification kind, same as every other task-kind reminder -- kept harmlessly alongside the new native alarm's own, separate event handling", () => {
  assert.match(layout, /kind === "taskScheduledStart"/);
});

// Task-alarm task: both call sites below now go through
// data/taskAlarm.ts's notifee-backed scheduling instead -- see
// data/taskAlarm.test.ts for the equivalent assertions on that module.
test("TaskEditorScreen no longer imports from this (superseded) module -- it schedules the real alarm via data/taskAlarm.ts instead", () => {
  assert.ok(!taskEditorScreen.includes('from "../data/taskScheduledStart.ts"'));
});

test("TodayScreen no longer imports from this (superseded) module -- it reconciles real alarms via data/taskAlarm.ts instead", () => {
  assert.ok(!todayScreen.includes('from "../data/taskScheduledStart.ts"'));
});
