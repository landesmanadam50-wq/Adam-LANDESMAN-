import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/notifications.test.ts
 *
 * Task-start alarm vibration task: source-text regression guard for
 * data/notifications.ts -- it depends on the real native
 * expo-notifications module and isn't callable from a plain `node
 * --test` run (every *.test.ts touching storage.ts/notifications.ts
 * follows the same constraint, per their own module docs), so this
 * checks the real source text instead of actually invoking it.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/notifications.ts");

test("requirement 1/3: a dedicated, non-trivial vibration pattern exists for the task-start alarm -- never relying on the OS's own single-buzz default", () => {
  assert.match(module_, /const TASK_START_ALARM_VIBRATION_PATTERN = \[0, \d+, \d+, \d+, \d+, \d+\];/);
});

test("requirement 7 ('according to Android's capabilities'): four fixed channel ids cover every sound/vibration combination -- Android locks a channel's sound/vibration at creation, so toggling the trainee's preference must pick a DIFFERENT already-correct channel, never try to reconfigure one", () => {
  assert.ok(module_.includes('const ANDROID_TASK_START_CHANNEL_SOUND_VIBRATION_ID = "archi-task-start-sound-vibration";'));
  assert.ok(module_.includes('const ANDROID_TASK_START_CHANNEL_SOUND_ONLY_ID = "archi-task-start-sound-only";'));
  assert.ok(module_.includes('const ANDROID_TASK_START_CHANNEL_VIBRATION_ONLY_ID = "archi-task-start-vibration-only";'));
  assert.ok(module_.includes('const ANDROID_TASK_START_CHANNEL_SILENT_ID = "archi-task-start-silent";'));
});

test("resolveTaskStartChannelId picks exactly one of the four channels for every sound x vibration combination", () => {
  const fnIndex = module_.indexOf("function resolveTaskStartChannelId");
  const fnBody = module_.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("if (soundEnabled && vibrationEnabled) return ANDROID_TASK_START_CHANNEL_SOUND_VIBRATION_ID;"));
  assert.ok(fnBody.includes("if (soundEnabled) return ANDROID_TASK_START_CHANNEL_SOUND_ONLY_ID;"));
  assert.ok(fnBody.includes("if (vibrationEnabled) return ANDROID_TASK_START_CHANNEL_VIBRATION_ONLY_ID;"));
  assert.ok(fnBody.includes("return ANDROID_TASK_START_CHANNEL_SILENT_ID;"));
});

test("ensureAndroidTaskStartChannelAsync configures sound/vibration on the channel exactly according to the two flags, and sets HIGH importance so the alarm can alert even with the screen locked", () => {
  const fnIndex = module_.indexOf("async function ensureAndroidTaskStartChannelAsync");
  const fnBody = module_.slice(fnIndex, fnIndex + 600);
  assert.ok(fnBody.includes("importance: Notifications.AndroidImportance.HIGH,"));
  assert.ok(fnBody.includes("sound: soundEnabled ? TIMER_COMPLETION_SOUND_FILE : null,"));
  assert.ok(fnBody.includes("enableVibrate: vibrationEnabled,"));
  assert.ok(fnBody.includes("vibrationPattern: vibrationEnabled ? TASK_START_ALARM_VIBRATION_PATTERN : null,"));
});

test("requirement 8: bypassDnd is never SET anywhere in this module -- Do Not Disturb/silent mode is always respected, never overridden (the identifier may appear only in prose explaining this)", () => {
  assert.ok(!module_.includes("bypassDnd:") && !module_.includes("bypassDnd ="), "setting bypassDnd would let the alarm override the trainee's own Do Not Disturb setting, which nothing here was asked to do");
});

test("requirement 2 (works in background/closed too): the task-start alarm still goes through scheduleNotificationAsync's own DATE trigger -- the exact same OS-level scheduling primitive every other reminder already relies on to fire while backgrounded or killed, never a separate mechanism", () => {
  const fnIndex = module_.indexOf('if (input.kind === "taskScheduledStart") {');
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("Notifications.scheduleNotificationAsync({"));
  assert.ok(fnBody.includes("type: Notifications.SchedulableTriggerInputTypes.DATE,"));
});

test("scheduleReminderNotification's taskScheduledStart branch defaults both soundEnabled and vibrationEnabled to true when the caller doesn't pass them -- requirement 1, never silently off", () => {
  const fnIndex = module_.indexOf('if (input.kind === "taskScheduledStart") {');
  const fnBody = module_.slice(fnIndex, fnIndex + 200);
  assert.ok(fnBody.includes("const soundEnabled = input.soundEnabled ?? true;"));
  assert.ok(fnBody.includes("const vibrationEnabled = input.vibrationEnabled ?? true;"));
});

test("every other reminder kind's existing scheduling path (the shared reminder channel/content shape) is completely untouched by the taskScheduledStart branch", () => {
  assert.ok(module_.includes("await ensureAndroidReminderChannelAsync();"));
  assert.ok(module_.includes("channelId: Platform.OS === \"android\" ? ANDROID_REMINDER_CHANNEL_ID : undefined,"));
});

// ARCHI -- Regression Audit, Part 1 (notification audit): ARC GYM
// reminders, sub-goal/four-week-program/personal-development-program/
// life-manifest reminders, and routine reminders all go through THIS
// handler to decide whether to actually show/sound a reminder notifee
// already created -- it previously decided purely from isReminder, with
// no regard for whether the trainee is currently mid-task or mid-ARC.
test("bug fix: ensureNotificationHandlerConfigured's handler checks hasActiveTaskConflict for every REMINDER notification, before deciding shouldShowBanner/shouldPlaySound -- the actual delivery boundary for this whole expo-notifications-based reminder family, same principle as data/taskAlarm.ts's own registerForegroundService", () => {
  assert.ok(module_.includes('import { hasActiveTaskConflict } from "./taskAlarm.ts";'), "must reuse the EXISTING busy-check, never a second, re-derived definition of 'is a task/ARC session active'");
  const fnIndex = module_.indexOf("function ensureNotificationHandlerConfigured");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("const busy = await hasActiveTaskConflict(reminderTaskId);"));
  assert.ok(fnBody.includes("shouldShowBanner: !busy,"));
  assert.ok(fnBody.includes("shouldPlaySound: !busy,"));
});

test("bug fix, required scenario coverage: a busy reminder is QUIETED, never DELETED -- shouldShowList stays true even while busy, so the reminder remains reachable in the notification shade afterward, matching the audit's 'preserve upcoming or missed tasks so they remain accessible' requirement", () => {
  const fnIndex = module_.indexOf("function ensureNotificationHandlerConfigured");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("shouldShowList: true,"), "shouldShowList must never be gated on `busy` -- only the banner and sound may be suppressed");
});

test("bug fix, required scenario coverage: a non-reminder notification (timer completion) is untouched by the busy check -- it still returns false/false/false/false unconditionally, exactly as before", () => {
  const fnIndex = module_.indexOf("function ensureNotificationHandlerConfigured");
  const fnBody = module_.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("if (!isReminder) {"));
  assert.ok(fnBody.includes("return { shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false };"));
});

test("bug fix, required scenario coverage: the busy check excludes a reminder's OWN taskId (taskScheduledStart carries one) from the 'another task is active' test, exactly as a real task-start alarm does -- every other reminder kind has no task of its own, so '' means no exclusion at all", () => {
  const fnIndex = module_.indexOf("function ensureNotificationHandlerConfigured");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.match(fnBody, /const reminderTaskId = typeof notification\.request\.content\.data\?\.taskId === "string" \? notification\.request\.content\.data\.taskId : "";/);
});
