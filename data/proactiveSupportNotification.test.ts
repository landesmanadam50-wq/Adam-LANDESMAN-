import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/proactiveSupportNotification.test.ts
 *
 * ARCHI -- Proactive Support During Task LIVE task: source-text
 * regression guard for this module's notifee-backed notification
 * (notifee isn't callable under a plain `node --test` run, same
 * convention as data/emotionalCheckInNotification.ts's own tests).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/proactiveSupportNotification.ts");
const alarmChannelModule = readSource("data/alarmChannel.ts");
const taskAlarmModule = readSource("data/taskAlarm.ts");
const activeTaskScreenModule = readSource("live/ActiveTaskScreen.tsx");
const taskEditorModule = readSource("build/TaskEditorScreen.tsx");
const tasksModule = readSource("arc/tasks.ts");
const taskDraftModule = readSource("arc/taskDraft.ts");
const overlayModuleKt = readSource(
  "modules/floating-timer-overlay/android/src/main/java/expo/modules/floatingtimeroverlay/FloatingTimerOverlayModule.kt"
);
const floatingTimerOverlayModule = readSource("data/floatingTimerOverlay.ts");

test("the notification uses ONE fixed, deterministic id -- re-displaying structurally replaces any previous one rather than ever stacking a second one", () => {
  assert.match(module_, /const PROACTIVE_SUPPORT_NOTIFICATION_ID = "archi-proactive-support-notification";/);
  const fnIndex = module_.indexOf("export async function displayProactiveSupportNotification");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("id: PROACTIVE_SUPPORT_NOTIFICATION_ID,"));
});

test("reuses EMOTIONAL_CHECKIN_CHANNEL_ID -- no new channel -- same quiet, LOW-importance, lock-screen-visible tier as the generic check-in", () => {
  assert.ok(module_.includes('import { ensureEmotionalCheckInChannelAsync, ensureNotifeePermissionAsync, EMOTIONAL_CHECKIN_CHANNEL_ID } from "./alarmChannel.ts";'));
  const fnIndex = module_.indexOf("export async function displayProactiveSupportNotification");
  const fnBody = module_.slice(fnIndex, fnIndex + 1100);
  assert.ok(fnBody.includes("channelId: EMOTIONAL_CHECKIN_CHANNEL_ID,"));
  assert.ok(fnBody.includes("visibility: AndroidVisibility.PUBLIC,"));
  assert.ok(!module_.includes("TASK_ALARM_CHANNEL_ID"), "must never post to the alarm channel");
  assert.ok(!fnBody.includes("fullScreenAction"));
  assert.ok(!fnBody.includes("AlarmType"));
});

test("exactly 3 real action buttons -- 😟/🙂/🧠 מחשבה-דחף -- per the user's explicit decision on the Android 3-button cap; 😄 מעולה is NOT one of them", () => {
  const fnIndex = module_.indexOf("export async function displayProactiveSupportNotification");
  const actionsIndex = module_.indexOf("actions: [", fnIndex);
  const actionsBody = module_.slice(actionsIndex, actionsIndex + 400);
  assert.ok(actionsBody.includes('{ title: "😟 פחות טוב", pressAction: { id: ACTION_LESS_GOOD } }'));
  assert.ok(actionsBody.includes('{ title: "🙂 סבבה", pressAction: { id: ACTION_OK } }'));
  assert.ok(actionsBody.includes('{ title: "🧠 מחשבה / דחף", pressAction: { id: ACTION_URGE } }'));
  assert.ok(!actionsBody.includes("😄"), "😄 מעולה must never be one of the 3 direct buttons -- it is the body tap");
});

test("the body text explicitly tells the trainee that tapping the notification itself opens 😄 מעולה, per the user's explicit request", () => {
  const fnIndex = module_.indexOf("export async function displayProactiveSupportNotification");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("😄 מעולה"));
  assert.ok(fnBody.includes("האם יש מחשבה או דחף שמפריעים לך לבצע את המשימה"));
  assert.ok(fnBody.includes("איך אתה מרגיש כרגע"));
});

test("the 3 actions route through the SAME shared handleEmotionalCheckInChoice dispatcher, each with the explicit taskId -- never a new decision layer", () => {
  assert.match(module_, /import \{ handleEmotionalCheckInChoice \} from "\.\/emotionalCheckInRouting\.ts";/);
  const handlerIndex = module_.indexOf("export async function handleProactiveSupportNotificationEvent");
  const handlerBody = module_.slice(handlerIndex, handlerIndex + 1400);
  assert.ok(handlerBody.includes('if (actionId === ACTION_LESS_GOOD) {\n      await handleEmotionalCheckInChoice("full_arc", taskId);'));
  assert.ok(handlerBody.includes('if (actionId === ACTION_OK) {\n      await handleEmotionalCheckInChoice("shortened_arc", taskId);'));
  assert.ok(handlerBody.includes('if (actionId === ACTION_URGE) {\n      await handleEmotionalCheckInChoice("urge", taskId);'));
});

test("body tap (EventType.PRESS): when taskIsOnPhone is true, only cancels -- never navigates/foregrounds; otherwise reuses handleEmotionalCheckInChoice('next_task', taskId) as-is", () => {
  const handlerIndex = module_.indexOf("export async function handleProactiveSupportNotificationEvent");
  const handlerBody = module_.slice(handlerIndex, handlerIndex + 1400);
  assert.ok(handlerBody.includes("const task = await getTask(taskId);"));
  assert.ok(handlerBody.includes("if (task?.taskIsOnPhone) return;"));
  assert.ok(handlerBody.includes('await handleEmotionalCheckInChoice("next_task", taskId);'));
  // The early return must come BEFORE the next_task call, in source order.
  assert.ok(handlerBody.indexOf("if (task?.taskIsOnPhone) return;") < handlerBody.indexOf('await handleEmotionalCheckInChoice("next_task", taskId);'));
});

test("every branch cancels the notification first (autoCancel discipline) -- both action presses and the body tap", () => {
  const handlerIndex = module_.indexOf("export async function handleProactiveSupportNotificationEvent");
  const handlerBody = module_.slice(handlerIndex, handlerIndex + 1400);
  const cancelCount = handlerBody.split("await cancelProactiveSupportNotification();").length - 1;
  assert.strictEqual(cancelCount, 2, "one cancel for the ACTION_PRESS branch, one for the PRESS (body tap) branch");
});

test("the in-memory debounce suppresses a second display within the window, per section 4's 'no duplicate notifications when pausing AND exiting' requirement -- the single deterministic id already prevents a second OS card regardless", () => {
  assert.match(module_, /const DUPLICATE_SUPPRESSION_WINDOW_MS = 3000;/);
  const fnIndex = module_.indexOf("export async function displayProactiveSupportNotification");
  const fnBody = module_.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("if (nowMs - lastDisplayedAtMs < DUPLICATE_SUPPRESSION_WINDOW_MS) return;"));
});

test("checkpoint (never a second onBackgroundEvent/onForegroundEvent registration): data/taskAlarm.ts's own shared handleTaskAlarmEvent dispatches data.kind === 'proactiveSupport' into this module's own handler", () => {
  assert.ok(taskAlarmModule.includes('import { handleProactiveSupportNotificationEvent } from "./proactiveSupportNotification.ts";'));
  const dispatchIndex = taskAlarmModule.indexOf('if (data.kind === "proactiveSupport") {');
  assert.ok(dispatchIndex >= 0);
  const dispatchBody = taskAlarmModule.slice(dispatchIndex, dispatchIndex + 200);
  assert.ok(dispatchBody.includes("await handleProactiveSupportNotificationEvent(event);"));
});

test("never throws: display/cancel are both wrapped so a failed native call degrades to silently not showing the prompt, never a crash", () => {
  const displayFnIndex = module_.indexOf("export async function displayProactiveSupportNotification");
  const displayFnBody = module_.slice(displayFnIndex, module_.indexOf("export async function cancelProactiveSupportNotification"));
  assert.ok(displayFnBody.includes("try {"));
  assert.ok(displayFnBody.includes("} catch (error) {"));

  const cancelFnIndex = module_.indexOf("export async function cancelProactiveSupportNotification");
  const cancelFnBody = module_.slice(cancelFnIndex, module_.indexOf("export async function handleProactiveSupportNotificationEvent"));
  assert.ok(cancelFnBody.includes("try {"));
  assert.ok(cancelFnBody.includes("} catch {"));
});

// --- Task.taskIsOnPhone field -----------------------------------------

test("Task.taskIsOnPhone exists, defaults to false, backfilled on load -- same convention as isTodoItem", () => {
  assert.match(tasksModule, /taskIsOnPhone: boolean;/);
  assert.ok(tasksModule.includes("taskIsOnPhone: false,"));
  assert.ok(tasksModule.includes("taskIsOnPhone: task.taskIsOnPhone ?? false,"));
});

test("TaskDraft carries taskIsOnPhone through createEmptyTaskDraft/taskDraftFromTask/buildTaskFromDraft -- editable regardless of isTodoItem", () => {
  assert.match(taskDraftModule, /taskIsOnPhone: boolean;/);
  assert.ok(taskDraftModule.includes("taskIsOnPhone: false,\n  };\n}"));
  assert.ok(taskDraftModule.includes("taskIsOnPhone: task.taskIsOnPhone,"));
  assert.ok(taskDraftModule.includes("taskIsOnPhone: draft.taskIsOnPhone,"));
});

test("the editor shows a 'המשימה היא בטלפון' toggle, not gated behind isTodoItem", () => {
  const fieldIndex = taskEditorModule.indexOf('<Field label="המשימה היא בטלפון">');
  assert.ok(fieldIndex >= 0);
  const fieldBody = taskEditorModule.slice(fieldIndex, fieldIndex + 500);
  assert.ok(fieldBody.includes("setDraft({ ...draft, taskIsOnPhone: true })"));
  assert.ok(fieldBody.includes("setDraft({ ...draft, taskIsOnPhone: false })"));
});

// --- Trigger sites in live/ActiveTaskScreen.tsx -------------------------

test("the live toggle in Task LIVE flips taskIsOnPhone via the same persistTask(...) shape handlePause/handleResume already use", () => {
  assert.ok(
    activeTaskScreenModule.includes(
      'onPress={() => persistTask({ ...task, taskIsOnPhone: !task.taskIsOnPhone, updatedAt: new Date().toISOString() })}'
    )
  );
});

test("the explicit pause button (handlePauseButtonPress) always calls displayProactiveSupportNotification -- never gated by taskIsOnPhone or screen state, unlike the exit listener", () => {
  assert.ok(activeTaskScreenModule.includes('import { displayProactiveSupportNotification } from "../data/proactiveSupportNotification.ts";'));
  const fnIndex = activeTaskScreenModule.indexOf("async function handlePauseButtonPress");
  const fnBody = activeTaskScreenModule.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("await handlePause();"));
  assert.ok(fnBody.includes("if (task) await displayProactiveSupportNotification(task.id, new Date());"));
  assert.ok(activeTaskScreenModule.includes("onPress={handlePauseButtonPress}"));
});

test("the mood buttons (😟/🙂) and the pause button both call handlePause() internally, but only the explicit pause button also displays the proactive support notification -- tapping 😟/🙂 must never ALSO pop it", () => {
  const moodRowIndex = activeTaskScreenModule.indexOf("<View style={styles.moodButtonRow}>");
  const moodRowBody = activeTaskScreenModule.slice(moodRowIndex, moodRowIndex + 700);
  assert.ok(moodRowBody.includes("await handlePause();"));
  assert.ok(!moodRowBody.includes("displayProactiveSupportNotification"), "the mood row's own onPress handlers must not call this directly");
});

test("the AppState exit listener is active only while timerRun && !restRun -- the same gate the live moodButtonRow uses -- and checks taskIsOnPhone then the native screen-lock query, in that order, before displaying", () => {
  assert.ok(activeTaskScreenModule.includes('import { Alert, AppState, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";'));
  assert.ok(activeTaskScreenModule.includes('import { isScreenLockedOrOffAsync, showFloatingTimerOverlay, showIdleFloatingOverlayPanel, updateFloatingTimerOverlay } from "../data/floatingTimerOverlay.ts";'));
  const effectIndex = activeTaskScreenModule.indexOf('AppState.addEventListener("change"');
  assert.ok(effectIndex >= 0);
  const effectBody = activeTaskScreenModule.slice(effectIndex - 400, effectIndex + 600);
  assert.ok(effectBody.includes("if (!timerRun || restRun || !task) return;"));
  assert.ok(effectBody.includes('if (nextState !== "background" && nextState !== "inactive") return;'));
  assert.ok(effectBody.includes("if (activeTaskIsOnPhone) return;"));
  const taskIsOnPhoneCheckIndex = effectBody.indexOf("if (activeTaskIsOnPhone) return;");
  const screenLockCheckIndex = effectBody.indexOf("isScreenLockedOrOffAsync()");
  assert.ok(taskIsOnPhoneCheckIndex >= 0 && screenLockCheckIndex >= 0 && taskIsOnPhoneCheckIndex < screenLockCheckIndex, "taskIsOnPhone must be checked before the native screen-lock query");
  assert.ok(effectBody.includes("if (lockedOrOff) return;"));
  assert.ok(effectBody.includes("void displayProactiveSupportNotification(activeTaskId, new Date());"));
});

test("the exit listener never reads or writes TaskTimerRun -- backgrounding stays irrelevant to the timer's own correctness", () => {
  const effectIndex = activeTaskScreenModule.indexOf('AppState.addEventListener("change"');
  const effectBody = activeTaskScreenModule.slice(effectIndex - 400, effectIndex + 600);
  assert.ok(!effectBody.includes("saveTaskTimerRun"));
  assert.ok(!effectBody.includes("setTimerRun"));
  assert.ok(!effectBody.includes("pauseTaskTimerRun"));
});

// --- Native screen-lock/off query ----------------------------------------

test("FloatingTimerOverlayModule.kt exposes a plain synchronous isScreenLockedOrOff Function -- no new module, no event-emission bridge, no SYSTEM_ALERT_WINDOW permission involved", () => {
  assert.ok(overlayModuleKt.includes('Function("isScreenLockedOrOff") {'));
  const fnIndex = overlayModuleKt.indexOf("private fun isScreenLockedOrOff(): Boolean");
  const fnBody = overlayModuleKt.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("PowerManager"));
  assert.ok(fnBody.includes("KeyguardManager"));
  assert.ok(fnBody.includes("isInteractive"));
  assert.ok(fnBody.includes("isKeyguardLocked"));
});

test("the JS wrapper isScreenLockedOrOffAsync defaults to false (not locked) on any platform/build/error -- fail open to ordinary behavior", () => {
  const fnIndex = floatingTimerOverlayModule.indexOf("export async function isScreenLockedOrOffAsync");
  const fnBody = floatingTimerOverlayModule.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("getNativeModule()?.isScreenLockedOrOff() ?? false;"));
  assert.ok(fnBody.includes("} catch {"));
  assert.ok(fnBody.includes("return false;"));
});
