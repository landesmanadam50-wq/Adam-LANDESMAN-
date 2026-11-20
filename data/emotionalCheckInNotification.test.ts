import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/emotionalCheckInNotification.test.ts
 *
 * Nine Functional Improvements task, Improvement 8 ("Emotional
 * Check-In on the Android Lock Screen"): source-text regression guard
 * for this module's notifee-backed notification (notifee isn't
 * callable under a plain `node --test` run, same convention as
 * data/taskAlarm.ts/data/dailyVisualizationAlarm.ts's own total
 * absence of direct tests).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/emotionalCheckInNotification.ts");
const alarmChannelModule = readSource("data/alarmChannel.ts");
const taskAlarmModule = readSource("data/taskAlarm.ts");
const layout = readSource("app/_layout.tsx");
const storage = readSource("data/storage.ts");

test("the notification uses ONE fixed, deterministic id -- re-displaying structurally replaces any previous one rather than ever stacking a second one", () => {
  assert.match(module_, /const EMOTIONAL_CHECKIN_NOTIFICATION_ID = "archi-emotional-checkin-notification";/);
  const fnIndex = module_.indexOf("export async function displayEmotionalCheckInNotification");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("id: EMOTIONAL_CHECKIN_NOTIFICATION_ID,"));
});

test("checkpoint (quiet, never an intrusive alert): posted to its OWN dedicated LOW-importance channel -- never TASK_ALARM_CHANNEL_ID (which is HIGH importance, sound+vibration, bypasses Do Not Disturb)", () => {
  assert.match(alarmChannelModule, /export const EMOTIONAL_CHECKIN_CHANNEL_ID = "archi-emotional-checkin";/);
  const channelFnIndex = alarmChannelModule.indexOf("export async function ensureEmotionalCheckInChannelAsync");
  const channelFnBody = alarmChannelModule.slice(channelFnIndex, channelFnIndex + 400);
  assert.ok(channelFnBody.includes("importance: AndroidImportance.LOW,"));
  assert.ok(!channelFnBody.includes("bypassDnd"), "must respect Do Not Disturb, unlike the task-alarm channel");
  assert.ok(!channelFnBody.includes('sound:'), "must stay silent -- no sound");
  assert.ok(module_.includes("ensureEmotionalCheckInChannelAsync()"));
  assert.ok(!module_.includes("TASK_ALARM_CHANNEL_ID"), "must never post to the alarm channel");
});

test("checkpoint (lock-screen visibility, never bypassing security): AndroidVisibility.PUBLIC is requested on the notification itself -- never fullScreenAction/AlarmType.SET_ALARM_CLOCK (the full-screen alarm treatment this task's own instructions explicitly rule out for this feature)", () => {
  const fnIndex = module_.indexOf("export async function displayEmotionalCheckInNotification");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("visibility: AndroidVisibility.PUBLIC,"));
  // Scoped to the function body ONLY -- the module's own doc comment
  // legitimately names fullScreenAction/AlarmType in prose to explain
  // what this feature deliberately does NOT use.
  assert.ok(!fnBody.includes("fullScreenAction"));
  assert.ok(!fnBody.includes("AlarmType"));
  assert.ok(!fnBody.includes("asForegroundService"));
});

test("checkpoint (the three check-ins, never a new decision): all three actions map 1:1 onto EmotionalCheckInChoice and route through the SAME shared handleEmotionalCheckInChoice every other entry point (Home bar, widget, Postponement screen) already uses", () => {
  assert.match(module_, /import \{ handleEmotionalCheckInChoice \} from "\.\/emotionalCheckInRouting\.ts";/);
  const displayFnIndex = module_.indexOf("export async function displayEmotionalCheckInNotification");
  const displayFnBody = module_.slice(displayFnIndex, displayFnIndex + 900);
  assert.ok(displayFnBody.includes('{ title: "😟 פחות טוב", pressAction: { id: ACTION_CHECKIN_FULL_ARC } }'));
  assert.ok(displayFnBody.includes('{ title: "🙂 סבבה", pressAction: { id: ACTION_CHECKIN_SHORTENED_ARC } }'));
  assert.ok(displayFnBody.includes('{ title: "😄 מעולה", pressAction: { id: ACTION_CHECKIN_NEXT_TASK } }'));

  const mapIndex = module_.indexOf("const ACTION_TO_CHOICE");
  const mapBody = module_.slice(mapIndex, mapIndex + 300);
  assert.ok(mapBody.includes('[ACTION_CHECKIN_FULL_ARC]: "full_arc",'));
  assert.ok(mapBody.includes('[ACTION_CHECKIN_SHORTENED_ARC]: "shortened_arc",'));
  assert.ok(mapBody.includes('[ACTION_CHECKIN_NEXT_TASK]: "next_task",'));

  const handlerIndex = module_.indexOf("export async function handleEmotionalCheckInNotificationEvent");
  const handlerBody = module_.slice(handlerIndex, handlerIndex + 500);
  assert.ok(handlerBody.includes("handleEmotionalCheckInChoice(choice);"));
});

test("checkpoint (never a second onBackgroundEvent/onForegroundEvent registration): data/taskAlarm.ts's own shared handleTaskAlarmEvent dispatches data.kind === 'emotionalCheckIn' into this module's own handler", () => {
  assert.ok(taskAlarmModule.includes('import { handleEmotionalCheckInNotificationEvent } from "./emotionalCheckInNotification.ts";'));
  const dispatchIndex = taskAlarmModule.indexOf('if (data.kind === "emotionalCheckIn") {');
  assert.ok(dispatchIndex >= 0);
  const dispatchBody = taskAlarmModule.slice(dispatchIndex, dispatchIndex + 200);
  assert.ok(dispatchBody.includes("await handleEmotionalCheckInNotificationEvent(event);"));
});

test("checkpoint (user-enabled, quiet by default): the stored settings default to enabled: false -- the notification is never shown until the trainee explicitly turns it on", () => {
  assert.match(storage, /const DEFAULT_EMOTIONAL_CHECKIN_NOTIFICATION_SETTINGS: EmotionalCheckInNotificationSettings = \{ enabled: false \};/);
});

test("checkpoint (allow users to disable): syncEmotionalCheckInNotification reads the stored setting and either (re)displays or cancels the notification -- never both, never silently ignoring a disabled setting", () => {
  const fnIndex = module_.indexOf("export async function syncEmotionalCheckInNotification");
  const fnBody = module_.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("if (settings.enabled) {"));
  assert.ok(fnBody.includes("await displayEmotionalCheckInNotification();"));
  assert.ok(fnBody.includes("await cancelEmotionalCheckInNotification();"));
});

test("checkpoint (re-synced on every cold start): app/_layout.tsx calls syncEmotionalCheckInNotification once, from the same startup effect every other reconciliation call already runs in", () => {
  assert.ok(layout.includes('import { syncEmotionalCheckInNotification } from "../data/emotionalCheckInNotification.ts";'));
  const effectIndex = layout.indexOf("export default function RootLayout()");
  const effectBody = layout.slice(effectIndex, effectIndex + 1300);
  assert.ok(effectBody.includes("syncEmotionalCheckInNotification();"));
});

test("never throws: display/cancel are both wrapped so a failed native call (e.g. denied notification permission on Android 13+) degrades to silently not showing the reminder, never a crash", () => {
  const displayFnIndex = module_.indexOf("export async function displayEmotionalCheckInNotification");
  const displayFnBody = module_.slice(displayFnIndex, module_.indexOf("export async function cancelEmotionalCheckInNotification"));
  assert.ok(displayFnBody.includes("try {"));
  assert.ok(displayFnBody.includes("} catch (error) {"));

  const cancelFnIndex = module_.indexOf("export async function cancelEmotionalCheckInNotification");
  const cancelFnBody = module_.slice(cancelFnIndex, module_.indexOf("export async function syncEmotionalCheckInNotification"));
  assert.ok(cancelFnBody.includes("try {"));
  assert.ok(cancelFnBody.includes("} catch {"));
});
