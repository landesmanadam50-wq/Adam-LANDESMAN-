/**
 * Source-text wiring checks for ARC Addiction's notifications and
 * session service (both depend on native modules: notifee,
 * AsyncStorage, expo-router).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");
}

const notification = read("data/arcAddictionWaitNotification.ts");
const service = read("data/arcAddictionSession.ts");
const taskAlarm = read("data/taskAlarm.ts");
const layout = read("app/_layout.tsx");

test("the end-of-wait alarm is a real scheduled notification that fires with the app closed", () => {
  assert.match(notification, /notifee\.createTriggerNotification\(/);
  assert.match(notification, /type: TriggerType\.TIMESTAMP/);
  assert.match(notification, /alarmManager: \{ type: AlarmType\.SET_ALARM_CLOCK \}/);
  assert.match(notification, /channelId: NOTIFEE_REMINDER_CHANNEL_ID/);
});

test("both answer buttons open the app (launchActivity)", () => {
  const arm = notification.slice(notification.indexOf("arm wait end"), notification.indexOf("// Ongoing countdown"));
  assert.match(arm, /actions: waitEnd\.actions\.map\(\(action\) => \(\{ title: action\.title, pressAction: \{ id: action\.pressActionId, launchActivity: "default" \} \}\)\)/);
});

test("existing infrastructure is reused: shared channels + permission helper", () => {
  assert.match(notification, /from "\.\/alarmChannel\.ts"/);
  assert.match(notification, /ensureNotifeePermissionAsync\(\)/);
  assert.match(notification, /ensureNotifeeReminderChannelAsync\(\)/);
  assert.match(notification, /ensureQuietReminderChannelAsync\(\)/);
});

test("no duplicate alarms: cancel before every re-arm, and identical re-arms are skipped", () => {
  const apply = notification.slice(notification.indexOf("export async function applyArcAddictionNotificationPlan"));
  assert.ok(apply.indexOf("await cancelArcAddictionWaitEndNotification();") < apply.indexOf("notifee.createTriggerNotification("));
  assert.match(apply, /armedWaitEndFireAtMs !== plan\.waitEnd\.fireAtMs/);
});

test("ongoing countdown: chronometer counting down, auto-removed at the end even if the app is killed", () => {
  assert.match(notification, /showChronometer: true/);
  assert.match(notification, /chronometerDirection: "down"/);
  assert.match(notification, /timeoutAfter:/);
  assert.match(notification, /ongoing: true/);
});

test("notification failures never throw into the app", () => {
  assert.match(notification, /async function safely\(/);
  assert.match(notification, /catch \(error\)/);
});

test("routed through the shared notifee dispatcher (handleTaskAlarmEvent), before the task-alarm fallback", () => {
  const handler = taskAlarm.slice(taskAlarm.indexOf("export async function handleTaskAlarmEvent"));
  const ours = handler.indexOf("isArcAddictionNotificationEvent(event)");
  assert.ok(ours > 0);
  assert.ok(ours < handler.indexOf('if (data.kind !== "taskAlarm") return;'));
  assert.match(handler, /await handleArcAddictionNotificationEvent\(event\);\n    return;/);
});

test("the answer is recorded BEFORE navigation, then the screen opens (pending-open fallback for cold start)", () => {
  const handler = service.slice(service.indexOf("export async function handleArcAddictionNotificationEvent"));
  const press = handler.slice(handler.indexOf("EventType.ACTION_PRESS"));
  assert.ok(press.indexOf("await dispatchAddictionEvent(") < press.indexOf("openSessionScreen()"));
  assert.ok(press.indexOf("await markPendingOpen()") < press.indexOf("openSessionScreen()"));
  assert.match(handler, /episodeId \}/);
});

test("delivered end alarm retires the countdown and advances the stored session", () => {
  const handler = service.slice(service.indexOf("export async function handleArcAddictionNotificationEvent"));
  assert.match(handler, /EventType\.DELIVERED/);
  assert.match(handler, /cancelArcAddictionOngoingNotification\(\)/);
});

test("every change is serialized and side effects are derived from the stored session", () => {
  assert.match(service, /function serialize<T>/);
  for (const fn of ["loadCurrentAddictionSession", "startAddictionSession", "dispatchAddictionEvent"]) {
    const body = service.slice(service.indexOf(`export async function ${fn}`));
    assert.match(body.slice(0, 400), /return serialize\(async \(\) =>/, fn);
  }
  assert.match(service, /applyArcAddictionNotificationPlan\(resolveAddictionNotificationPlan\(session, Date\.now\(\)\)\)/);
});

test("no duplicate sessions: starting while one is active returns a conflict unless replaceExisting", () => {
  const start = service.slice(service.indexOf("export async function startAddictionSession"));
  assert.match(start, /if \(!options\.replaceExisting\) return \{ status: "conflict", session: existing \}/);
  assert.match(start, /type: "END_SESSION"/);
});

test("app/_layout reconciles on cold start and on every return to the foreground", () => {
  assert.match(layout, /syncArcAddictionOnOpen\(\);/);
  assert.match(layout, /AppState\.addEventListener\("change"/);
  assert.match(layout, /if \(state === "active"\) syncArcAddictionOnOpen\(\)/);
  assert.match(layout, /consumeArcAddictionPendingOpen\(\)/);
  assert.match(layout, /return \(\) => appStateSubscription\.remove\(\);/);
});
