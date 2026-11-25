import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/taskAlarm.test.ts
 *
 * Task-alarm task ("הפיכת התראות המשימות לשעון מעורר אמיתי"):
 * source-text regression guard for the notifee-backed real alarm --
 * it depends on the real native @notifee/react-native module and
 * isn't callable from a plain `node --test` run (every *.test.ts
 * touching a native module follows the same constraint, per their own
 * module docs), so this checks the real source text instead of
 * actually invoking it. The pure "when" date math itself is
 * unchanged and still fully exercised in arc/taskScheduledStart.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/taskAlarm.ts");
const layout = readSource("app/_layout.tsx");
const alarmChannelModule = readSource("data/alarmChannel.ts");

test("requirement 5 (prevent duplicates): every notification/trigger for a given task uses the SAME deterministic id -- arming a task that already has one structurally replaces it rather than creating a second", () => {
  assert.match(module_, /const NATIVE_ALARM_ID_PREFIX = "task-alarm-";/);
  assert.match(module_, /function taskAlarmNotificationId\(taskId: string\): string \{\s*return `\$\{NATIVE_ALARM_ID_PREFIX\}\$\{taskId\}`;/);
});

// Critical-bug fix ("Native Alarm Still Not Working"): a stale id left
// over by the superseded expo-notifications mechanism must never be
// mistaken for "already armed" -- only this module's own prefix counts.
test("isNativeAlarmId distinguishes this module's own ids from a stale non-native one, and from null", () => {
  const fnIndex = module_.indexOf("function isNativeAlarmId");
  const fnBody = module_.slice(fnIndex, fnIndex + 200);
  assert.ok(fnBody.includes("id !== null && id.startsWith(NATIVE_ALARM_ID_PREFIX)"));
});

test("armTaskAlarm always cancels any existing alarm for the task FIRST, before creating the new trigger notification", () => {
  const fnIndex = module_.indexOf("export async function armTaskAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 200);
  assert.ok(fnBody.includes("await cancelAnyAlarmFor(task.id);"));
  const cancelIndex = fnBody.indexOf("cancelAnyAlarmFor");
  const createIndex = module_.indexOf("await notifee.createTriggerNotification", fnIndex);
  assert.ok(cancelIndex !== -1 && createIndex !== -1 && fnIndex + cancelIndex < createIndex);
});

test("the alarm uses Android's real AlarmManager alarm-clock API (SET_ALARM_CLOCK) and the ALARM notification category -- a genuine alarm, not an ordinary scheduled reminder", () => {
  assert.ok(module_.includes("alarmManager: { type: AlarmType.SET_ALARM_CLOCK }"));
  assert.ok(module_.includes("category: AndroidCategory.ALARM,"));
});

test("requirement (full-screen, works over a locked screen): fullScreenAction and asForegroundService are both set, and a foreground service type is declared -- shared by armTaskAlarm and armTestAlarm via buildAlarmAndroidConfig", () => {
  // ARCHI -- Final Critical Check task: fullScreenAction/ongoing/lightUpScreen
  // etc. were extracted into buildAlarmNotificationContent (shared with the
  // post-busy-check loud redisplay, which must NEVER set asForegroundService
  // again -- see that redisplay's own comment) -- buildAlarmAndroidConfig
  // itself now only adds asForegroundService/foregroundServiceTypes on top.
  const contentFnIndex = module_.indexOf("function buildAlarmNotificationContent");
  const configFnIndex = module_.indexOf("export function buildAlarmAndroidConfig");
  const fnBody = module_.slice(contentFnIndex, configFnIndex + 600);
  assert.ok(fnBody.includes("asForegroundService: true,"));
  assert.ok(fnBody.includes('fullScreenAction: { id: "default" },'));
  assert.ok(fnBody.includes("foregroundServiceTypes: TASK_ALARM_FOREGROUND_SERVICE_TYPES,"));
});

// Critical-bug fix: the ROOT CAUSE. notifee's own bundled native
// Service (confirmed by unzipping its .aar and reading its
// AndroidManifest.xml directly) is declared with
// android:foregroundServiceType="shortService" -- requesting any OTHER
// type (the previous code asked for MEDIA_PLAYBACK) is a mismatch that
// fails startForeground() on Android 14+, entirely inside native code,
// with no JS-visible error -- exactly matching "scheduling looks fine,
// but nothing ever actually rings."
test("the foreground service type requested at runtime is SHORT_SERVICE -- the only type that actually matches notifee's own Service class, never MEDIA_PLAYBACK or any other mismatched type", () => {
  assert.ok(module_.includes("const TASK_ALARM_FOREGROUND_SERVICE_TYPES = [AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE];"));
  assert.ok(!module_.includes("FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK"));
});

test("the alarm's title/body are resolved via resolveTaskAlarmNotificationContent (Task Reflection Memory task) from the task's own latest reflection, read fresh on every arm, and exactly the two required buttons (Start, Postpone) are present with their own distinct action ids -- Smart Postponement Flow, requirement 1: never a silent delay button", () => {
  const fnIndex = module_.indexOf("export async function armTaskAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 1800);
  assert.ok(fnBody.includes("const latestReflection = resolveLatestReflectionForTask(reflections, task.id);"));
  assert.ok(fnBody.includes("resolveTaskAlarmNotificationContent(task.title, latestReflection?.text ?? null, alarmPreferences.showReflectionOnLockScreen)"));
  assert.ok(fnBody.includes("title,"));
  assert.ok(fnBody.includes("body,"));
  assert.ok(fnBody.includes('{ title: "התחל משימה", pressAction: { id: ACTION_START_TASK } }'));
  assert.ok(fnBody.includes('{ title: "דחייה", pressAction: { id: ACTION_POSTPONE_OBSTACLE } }'));
  assert.ok(!fnBody.includes("ACTION_SNOOZE"), "the old fixed-delay snooze button must no longer be offered on this notification");
  assert.ok(!fnBody.includes("ACTION_TURN_OFF"), "a bare 'turn off' with no follow-up is no longer offered on this notification -- Postpone replaces it");
});

test("requirement 8 (ring through Do Not Disturb -- the trainee's own explicit choice, for THIS alarm only): bypassDnd: true is set on the dedicated task-alarm channel (now defined in the shared data/alarmChannel.ts, reused rather than duplicated), nowhere else", () => {
  assert.ok(!module_.includes("bypassDnd: true"), "the channel definition moved entirely to data/alarmChannel.ts -- taskAlarm.ts must not redefine it");
  assert.ok(alarmChannelModule.includes("bypassDnd: true,"));
  const occurrences = alarmChannelModule.split("bypassDnd: true").length - 1;
  assert.equal(occurrences, 1, "bypassDnd must be set in exactly one place -- the task-alarm channel -- never generalized to any other notification");
});

test("the 2-minute ring cap is a named constant (2 * 60 * 1000 ms), and the foreground-service handler both starts the ring AND schedules the automatic turn-off at that cap", () => {
  assert.ok(module_.includes("const TASK_ALARM_RING_TIMEOUT_MS = 2 * 60 * 1000;"));
  const fnIndex = module_.indexOf("export function registerTaskAlarmForegroundService");
  // Window widened (8600 -> 9100): ARCHI Dynamic Time Planning task's own
  // isFreeTimeWindowArm declaration/comment and early-return branch, both
  // inserted earlier in the function, pushed proceed()'s own body
  // (where TASK_ALARM_RING_TIMEOUT_MS/turnOffTaskAlarm actually live)
  // further from fnIndex than before -- same function, same content, just
  // at a later offset.
  const fnBody = module_.slice(fnIndex, fnIndex + 9100);
  assert.ok(fnBody.includes("startRinging(preferences.soundEnabled, preferences.vibrationEnabled)"));
  assert.ok(fnBody.includes("TASK_ALARM_RING_TIMEOUT_MS"));
  assert.ok(fnBody.includes("turnOffTaskAlarm(task, new Date())"), "the automatic 2-minute cutoff must go through the exact same turnOffTaskAlarm as the trainee's own 'כבה' button, never a separate cleanup path");
});

test("requirement ('don't re-arm an alarm already turned off for the same occurrence'): turnOffTaskAlarm never re-arms anything itself -- it only disarms, relying on resolveNextTaskStartOccurrence's own 'strictly after now' rule to make the next reconcile land on a LATER occurrence, never this same one", () => {
  const fnIndex = module_.indexOf("export async function turnOffTaskAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("await disarmTaskAlarm(task);"));
  // "disarmTaskAlarm(" itself contains "armTaskAlarm(" as a substring, so this checks for a call with no "dis" prefix specifically.
  assert.ok(!/(?<!dis)armTaskAlarm\(/.test(fnBody), "turning off must never itself arm a new alarm");
});

test("snoozeTaskAlarm arms exactly ONE fresh alarm 5 minutes later -- an ad-hoc override, never routed through resolveNextTaskStartOccurrence", () => {
  assert.ok(module_.includes("const SNOOZE_MINUTES = 5;"));
  const fnIndex = module_.indexOf("export async function snoozeTaskAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("SNOOZE_MINUTES * 60 * 1000"));
  assert.ok(fnBody.includes("armTaskAlarm(task, snoozedFireAt)"));
  assert.ok(!fnBody.includes("resolveNextTaskStartOccurrence"));
});

// --- Task Reflection Memory task, requirements 3+6: refreshing a pending notification's text without changing its trigger time ---

test("refreshTaskAlarmNotificationIfArmed re-arms with the EXACT SAME fireAt the task already had (never recomputed) -- updating a notification's text never changes its scheduled time", () => {
  const fnIndex = module_.indexOf("export async function refreshTaskAlarmNotificationIfArmed");
  const fnBody = module_.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("const fireAt = new Date(task.notificationScheduledFor);"));
  assert.ok(fnBody.includes("const armed = await armTaskAlarm(task, fireAt);"));
});

test("refreshTaskAlarmNotificationIfArmed is a no-op for a task with no currently-armed NATIVE alarm, or whose status isn't 'planned' -- never arms a fresh alarm out of nowhere just because a reflection was saved", () => {
  const fnIndex = module_.indexOf("export async function refreshTaskAlarmNotificationIfArmed");
  const fnBody = module_.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes('if (!task || task.status !== "planned") return;'));
  assert.ok(fnBody.includes("if (!isNativeAlarmId(task.notificationId) || !task.notificationScheduledFor) return;"));
});

test("refreshTaskAlarmNotificationIfArmed never rewrites a notification whose moment has already passed -- 'if a notification has already been delivered, do not attempt to rewrite it retroactively'", () => {
  const fnIndex = module_.indexOf("export async function refreshTaskAlarmNotificationIfArmed");
  const fnBody = module_.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("if (fireAt.getTime() <= now.getTime()) return;"));
});

test("refreshTaskAlarmNotificationIfArmed goes through armTaskAlarm's own cancel-then-create-with-the-SAME-deterministic-id primitive -- it can never produce a duplicate notification for the task", () => {
  const fnIndex = module_.indexOf("export async function refreshTaskAlarmNotificationIfArmed");
  const nextFnIndex = module_.indexOf("export async function disarmTaskAlarm", fnIndex);
  const fnBody = module_.slice(fnIndex, nextFnIndex);
  assert.ok(fnBody.includes("await armTaskAlarm(task, fireAt);"), "reuses armTaskAlarm, never a second notifee.createTriggerNotification call of its own");
  assert.ok(!fnBody.includes("notifee.createTriggerNotification"), "must never call the native API directly -- always through armTaskAlarm's own single, deterministic-id path");
});

test("requirement (already-started task is never re-armed): reconcileTaskAlarms disarms, never arms, any task that isn't 'planned' -- the exact same guard the superseded module used", () => {
  const fnIndex = module_.indexOf("export async function reconcileTaskAlarms");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes('if (task.status !== "planned") {'));
  assert.ok(fnBody.includes("return task.notificationId ? disarmTaskAlarm(task) : task;"));
});

test("requirement (recurring tasks): reconcileTaskAlarms and scheduleTaskAlarm both reuse resolveNextTaskStartOccurrence for the 'when' calculation -- never a second, competing date-math implementation for the real alarm", () => {
  assert.ok(module_.includes('import { resolveNextTaskStartOccurrence } from "../arc/taskScheduledStart.ts";'));
  assert.equal(module_.split("resolveNextTaskStartOccurrence(task, now, overrides)").length - 1 >= 2, true);
});

test("Flexible Daily Routine task, integration fix: both reconcileTaskAlarms and scheduleTaskAlarm load today's TaskOccurrenceOverride list and pass it into resolveNextTaskStartOccurrence -- a per-date retime/removal must change the real alarm's own fire time, never just the display", () => {
  const scheduleIndex = module_.indexOf("export async function scheduleTaskAlarm");
  const scheduleBody = module_.slice(scheduleIndex, scheduleIndex + 800);
  assert.ok(scheduleBody.includes("await loadTaskOccurrenceOverrides()"));

  const reconcileIndex = module_.indexOf("export async function reconcileTaskAlarms");
  const reconcileBody = module_.slice(reconcileIndex, reconcileIndex + 900);
  assert.ok(reconcileBody.includes("loadTaskOccurrenceOverrides()"));
});

test("'Start Task' never calls startTask()/upsertTask() itself -- it only clears the alarm and navigates with autoStart=1, reusing live/ActiveTaskScreen.tsx's own existing, already-tested autoStart flow rather than a second, competing 'start a task' implementation", () => {
  const fnIndex = module_.indexOf("export async function handleTaskAlarmAction");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(!module_.includes('import { startTask } from "../arc/tasks.ts"'), "taskAlarm.ts must never import startTask -- that transition belongs entirely to ActiveTaskScreen's own autoStart flow");
  assert.ok(fnBody.includes('router.push({ pathname: "/tasks/[id]", params: { id: taskId, autoStart: "1" } });'));
});

test("every one of the three actions stops the ring (sound+vibration+foreground service) before doing anything else, whichever action it is", () => {
  const fnIndex = module_.indexOf("export async function handleTaskAlarmAction");
  const fnBody = module_.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("stopRinging();"));
  assert.ok(fnBody.includes("endForegroundServiceFor(taskId);"));
});

test("app/_layout.tsx registers the foreground service and the background event listener at MODULE SCOPE (before the component, never inside it or inside a useEffect) -- notifee's own requirement for catching an event while the app isn't already running", () => {
  const registerIndex = layout.indexOf("registerTaskAlarmForegroundService();");
  const backgroundIndex = layout.indexOf("notifee.onBackgroundEvent(handleTaskAlarmEvent);");
  const componentIndex = layout.indexOf("export default function RootLayout()");
  assert.ok(registerIndex !== -1 && backgroundIndex !== -1 && componentIndex !== -1);
  assert.ok(registerIndex < componentIndex && backgroundIndex < componentIndex, "both must run before the component is even defined, i.e. at module scope");
});

test("app/_layout.tsx also listens for foreground events (the app already open) via the SAME handleTaskAlarmEvent, and unsubscribes it on cleanup", () => {
  const effectIndex = layout.indexOf("export default function RootLayout()");
  // ARC Reminders task, Phase 5: widened from 1700 after adding the
  // topUpRemindersIfNeeded() cold-start reconciliation call (plus its
  // explanatory comment) between syncMorningAlarm() and the cleanup
  // return -- true offset of unsubscribeTaskAlarm() is now ~1952.
  const effectBody = layout.slice(effectIndex, effectIndex + 2300);
  assert.ok(effectBody.includes("notifee.onForegroundEvent(handleTaskAlarmEvent)"));
  assert.ok(effectBody.includes("unsubscribeTaskAlarm();"));
});

// Critical-bug fix: a failure arming ONE task must never silently break
// reconciliation for every other task, nor leave TaskEditorScreen's
// handleSave/TodayScreen's reload hanging on an unhandled rejection --
// the exact "swallow, log, return an honest unarmed task" discipline
// data/notifications.ts already follows for every other notification.
test("armTaskAlarm catches any native error itself -- it never throws, and on failure returns the task with notificationId/notificationScheduledFor left at null (never a false claim of success)", () => {
  const fnIndex = module_.indexOf("export async function armTaskAlarm");
  const nextFnIndex = module_.indexOf("export async function disarmTaskAlarm");
  const fnBody = module_.slice(fnIndex, nextFnIndex);
  assert.ok(fnBody.includes("} catch (error) {"));
  assert.ok(fnBody.includes('console.error("armTaskAlarm failed", task.id, error);'));
  assert.ok(fnBody.includes("return { ...task, notificationId: null, notificationScheduledFor: null };"));
});

test("reconcileTaskAlarms's own 'already in sync' check requires isNativeAlarmId, not just 'notificationId is non-null' -- the exact fix for a task whose id predates this feature (or the mechanism it replaced)", () => {
  const fnIndex = module_.indexOf("export async function reconcileTaskAlarms");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("isNativeAlarmId(task.notificationId)"));
  assert.ok(!fnBody.includes("task.notificationId !== null)"), "the old, buggy check must be gone, not just supplemented");
});

test("ensureNotifeePermissionAsync is called before scheduling -- notifee has its own permission API, separate from expo-notifications', belt-and-suspenders even when the OS-level permission was already granted through that other library", () => {
  const fnIndex = module_.indexOf("export async function armTaskAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("await ensureNotifeePermissionAsync();"));
});

// Critical-bug task, Step 2 ("בדיקת שעון מעורר"): the diagnostic test
// alarm must go through the SAME scheduling path as a real task's own
// alarm (buildAlarmAndroidConfig, the same channel, the same
// AlarmManager alarm-clock trigger) -- never a simplified stand-in that
// could pass while the real mechanism is still broken -- and must
// NEVER swallow a scheduling error, unlike the production path above.
test("armTestAlarm reuses buildAlarmAndroidConfig/ensureTaskAlarmChannelAsync/AlarmType.SET_ALARM_CLOCK -- the exact same mechanism a real task alarm uses, not a parallel one", () => {
  const fnIndex = module_.indexOf("export async function armTestAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 1200);
  assert.ok(fnBody.includes("await ensureTaskAlarmChannelAsync();"));
  assert.ok(fnBody.includes("android: buildAlarmAndroidConfig("));
  assert.ok(fnBody.includes("alarmManager: { type: AlarmType.SET_ALARM_CLOCK },"));
});

test("armTestAlarm does NOT swallow a scheduling error -- it's captured verbatim into the returned/saved result for the diagnostic screen to show, per the explicit requirement 'יש להציג שגיאות במקום להתעלם מהן'", () => {
  const fnIndex = module_.indexOf("export async function armTestAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 1300);
  assert.ok(fnBody.includes("result.armError = error instanceof Error ? error.message : String(error);"));
  assert.ok(fnBody.includes("await saveTaskAlarmTestResult(result);"));
});

test("the one second minute test alarm fires exactly 60 seconds out, scheduled the moment the trainee asks for it", () => {
  const fnIndex = module_.indexOf("export async function armTestAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("const fireAt = new Date(now.getTime() + 60 * 1000);"));
});

test("requirement ('לזהות אם השעון הופעל בפועל'): the foreground-service handler records firedAt for the test alarm the INSTANT ringing actually starts -- the one objective, not-just-scheduled signal", () => {
  const fnIndex = module_.indexOf("export function registerTaskAlarmForegroundService");
  // Window widened (7200 -> 7500): same offset shift as the ring-cap test above.
  const fnBody = module_.slice(fnIndex, fnIndex + 7500);
  assert.ok(fnBody.includes('const isTestAlarm = notification.data?.kind === "taskAlarmTest";'));
  assert.ok(fnBody.includes("if (isTestAlarm) recordTestAlarmFired(new Date().toISOString());"));
});

test("the test alarm's own notification action/press is handled distinctly, before any real-task logic -- it only stops ringing, never touches a Task", () => {
  const fnIndex = module_.indexOf('if (data.kind === "taskAlarmTest") {');
  const fnBody = module_.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("stopRinging();"));
  assert.ok(fnBody.includes('await cancelAnyAlarmFor("test");'));
  assert.ok(!fnBody.includes("getTask("));
});

// Critical-bug task ("Test Alarm Works, Scheduled Task Alarm Does
// Not"), Step 3: the real-task diagnostic must trace the EXACT real
// path (scheduleTaskAlarm, upsertTask) end to end, never a parallel or
// simplified one -- and must distinguish "never scheduled" from
// "scheduled but the OS doesn't actually have it" from "scheduled,
// stayed registered, but never rang" as three VISIBLY DIFFERENT
// outcomes, not one conflated signal.

test("isAlarmRegisteredWithOs checks notifee's own getTriggerNotificationIds -- the OS's own bookkeeping, never this app's Task.notificationId field -- and never throws", () => {
  const fnIndex = module_.indexOf("export async function isAlarmRegisteredWithOs");
  const fnBody = module_.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("await notifee.getTriggerNotificationIds();"));
  assert.ok(fnBody.includes("ids.includes(taskAlarmNotificationId(taskId));"));
  assert.ok(fnBody.includes("} catch {"));
});

test("armRealTaskAlarmTest creates and saves a REAL task (upsertTask), then arms it via scheduleTaskAlarm -- the exact same function build/TaskEditorScreen.tsx's own handleSave calls, never a parallel scheduling path", () => {
  const fnIndex = module_.indexOf("export async function armRealTaskAlarmTest");
  const nextFnIndex = module_.indexOf("export async function refreshRealTaskAlarmTestStatus");
  const fnBody = module_.slice(fnIndex, nextFnIndex);
  assert.ok(fnBody.includes("await upsertTask(task);"));
  assert.ok(fnBody.includes("const armed = await scheduleTaskAlarm(task, now);"));
  assert.ok(fnBody.includes("await upsertTask(armed);"));
});

test("armRealTaskAlarmTest schedules exactly 2 minutes out, as the trainee's own requirement asks", () => {
  const fnIndex = module_.indexOf("export async function armRealTaskAlarmTest");
  const fnBody = module_.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("const fireAt = new Date(now.getTime() + 2 * 60 * 1000);"));
});

test("armRealTaskAlarmTest distinguishes 'scheduleTaskAlarm returned with no error but also no armed notificationId' (armTaskAlarm's own internal catch, never visible as a thrown exception here) from a genuinely successful arm, then separately confirms registration with the OS", () => {
  const fnIndex = module_.indexOf("export async function armRealTaskAlarmTest");
  const nextFnIndex = module_.indexOf("export async function refreshRealTaskAlarmTestStatus");
  const fnBody = module_.slice(fnIndex, nextFnIndex);
  assert.ok(fnBody.includes("if (!armed.notificationId) {"));
  assert.ok(fnBody.includes("result.registeredWithOsAfterArm = await isAlarmRegisteredWithOs(task.id);"));
});

test("refreshRealTaskAlarmTestStatus re-checks OS registration without re-arming anything -- 'still registered' vs. 'disappeared before it should have' must be visible on every diagnostics-screen focus, not just right after scheduling", () => {
  const fnIndex = module_.indexOf("export async function refreshRealTaskAlarmTestStatus");
  const fnBody = module_.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("const registeredNow = await isAlarmRegisteredWithOs(existing.taskId);"));
  assert.ok(!fnBody.includes("armTaskAlarm(") && !fnBody.includes("scheduleTaskAlarm("));
});

test("the foreground-service handler records firedAt for a REAL task's alarm too (not just the isolated test one), gated to only the currently-tracked real-task-test id -- never touching an unrelated task's own alarm", () => {
  const fnIndex = module_.indexOf("export function registerTaskAlarmForegroundService");
  // Window widened (7400 -> 7800): same offset shift as the ring-cap test above.
  const fnBody = module_.slice(fnIndex, fnIndex + 7800);
  // ARC alarm task: this line also gained "&& !isArcAlarm" -- an ARC-alarm firing must never be mistaken for a real TASK alarm's own diagnostics.
  // ARC alarm diagnostics task: isArcAlarm now has its own earlier branch entirely, so this one no longer needs its own "&& !isArcAlarm" guard.
  assert.ok(fnBody.includes("else if (taskId && !isTimerEndAlarm) recordRealTaskAlarmFiredIfTracked(taskId, new Date().toISOString());"));
  assert.ok(fnBody.includes("if (plannedArcId) recordRealArcAlarmFiredIfTracked(plannedArcId, new Date().toISOString());"));
  const trackedFnIndex = module_.indexOf("async function recordRealTaskAlarmFiredIfTracked");
  const trackedFnBody = module_.slice(trackedFnIndex, trackedFnIndex + 250);
  assert.ok(trackedFnBody.includes("if (!existing || existing.taskId !== taskId) return;"));
});

// --- Floating task timer task, requirement 4: the end-of-timer ring ----

test("the end-of-timer ring has its OWN id prefix, completely disjoint from the start-of-task alarm's own -- they can never collide or be mistaken for one another", () => {
  assert.match(module_, /const TASK_TIMER_END_ALARM_ID_PREFIX = "task-timer-end-";/);
  assert.match(module_, /function taskTimerEndAlarmNotificationId\(taskId: string\): string \{\s*return `\$\{TASK_TIMER_END_ALARM_ID_PREFIX\}\$\{taskId\}`;/);
});

test("the end-of-timer ring's own cap is a named 10-second constant, completely separate from the start alarm's 2-minute one", () => {
  assert.match(module_, /const TASK_TIMER_END_RING_TIMEOUT_MS = 10 \* 1000;/);
});

test("armTaskTimerEndAlarm cancels any existing one for this task FIRST, reuses the exact same channel/ring/trigger mechanism as armTaskAlarm (never a parallel one), defaults to the task-start wording but accepts an override title (used for the rest sub-timer), and never throws -- a failed arm returns null, the same honest-failure contract as armTaskAlarm", () => {
  const fnIndex = module_.indexOf("export async function armTaskTimerEndAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("await cancelTaskTimerEndAlarm(id);"));
  assert.ok(fnBody.includes("notificationTitle = \"הזמן למשימה הסתיים\""));
  assert.ok(fnBody.includes('data: { kind: "taskTimerEnd", taskId }'));
  assert.ok(fnBody.includes("alarmManager: { type: AlarmType.SET_ALARM_CLOCK }"), "must reuse the exact same genuine alarm-clock trigger as the start alarm, never a plain notification");
  assert.ok(fnBody.includes("return null;"));
});

test("cancelTaskTimerEndAlarm is a safe no-op for null, and otherwise stops the ring and cancels the native trigger/notification by the exact id given", () => {
  const fnIndex = module_.indexOf("export async function cancelTaskTimerEndAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("if (!notificationId) return;"));
  assert.ok(fnBody.includes("stopRinging();"));
  assert.ok(fnBody.includes("await notifee.cancelTriggerNotification(notificationId);"));
});

test("the foreground-service handler gives the end-of-timer ring its own much-shorter timeout branch, cancelling via cancelTaskTimerEndAlarm -- never turnOffTaskAlarm, which is specific to the START alarm's own task-status semantics", () => {
  const fnIndex = module_.indexOf("export function registerTaskAlarmForegroundService");
  // Window widened (8200 -> 8500): same offset shift as the ring-cap test above.
  const fnBody = module_.slice(fnIndex, fnIndex + 8500);
  assert.ok(fnBody.includes('const isTimerEndAlarm = notification.data?.kind === "taskTimerEnd";'));
  assert.ok(fnBody.includes("if (isTimerEndAlarm) {"));
  const branchIndex = fnBody.indexOf("if (isTimerEndAlarm) {");
  const branchBody = fnBody.slice(branchIndex, branchIndex + 300);
  assert.ok(branchBody.includes("TASK_TIMER_END_RING_TIMEOUT_MS"));
  assert.ok(branchBody.includes("await cancelTaskTimerEndAlarm(notificationId);"));
  assert.ok(!branchBody.includes("turnOffTaskAlarm"));
});

test("handleTaskAlarmEvent gives the end-of-timer ring's own single 'עצור' action/press its own branch -- stopping the ring without any task/navigation side effect, same treatment as the isolated test alarm's own single action", () => {
  const fnIndex = module_.indexOf("export async function handleTaskAlarmEvent");
  // ARC Reminders task: widened from 3600 -- the new "taskTransition"
  // dispatch branch (inserted right after the pre-existing
  // "emotionalCheckIn" branch, above this one) pushed this function's
  // later branches further into its own body; same discipline as every
  // other widened window in this test file, never a byte-offset pin
  // narrow enough to break on an unrelated, earlier, additive insertion.
  // ARCHI -- Adaptive Task Execution & Emotional Persistence task:
  // widened again (4200 -> 5000) for the new "taskNotStarted" dispatch
  // branch, inserted right after "taskTransition", above this one.
  const fnBody = module_.slice(fnIndex, fnIndex + 5000);
  const branchIndex = fnBody.indexOf('if (data.kind === "taskTimerEnd") {');
  assert.ok(branchIndex !== -1);
  const branchBody = fnBody.slice(branchIndex, branchIndex + 400);
  assert.ok(branchBody.includes("stopRinging();"));
  assert.ok(branchBody.includes("await cancelTaskTimerEndAlarm(id);"));
});

test("the end-of-timer ring's single action id (ACTION_STOP_TIMER_END) is wired into armTaskTimerEndAlarm's own notification actions, distinct from the start alarm's three action ids", () => {
  assert.match(module_, /const ACTION_STOP_TIMER_END = "stop_timer_end";/);
  const fnIndex = module_.indexOf("export async function armTaskTimerEndAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes('android: buildAlarmAndroidConfig([{ title: "עצור", pressAction: { id: ACTION_STOP_TIMER_END } }])'));
});

// --- Alarm reliability task: reboot restoration + Xiaomi background limits ---

test("app.json explicitly declares RECEIVE_BOOT_COMPLETED, even though @notifee/react-native's own bundled AAR manifest already merges it in -- documenting the app's own reliance on it rather than relying silently on a dependency's manifest", () => {
  const appJson = readSource("app.json");
  assert.match(appJson, /"android\.permission\.RECEIVE_BOOT_COMPLETED"/);
});

test("getAlarmPowerManagerInfo is a thin, non-throwing wrapper around notifee's own documented getPowerManagerInfo() -- never a custom native addition", () => {
  const fnIndex = module_.indexOf("export async function getAlarmPowerManagerInfo");
  const fnBody = module_.slice(fnIndex, fnIndex + 200);
  assert.ok(fnBody.includes("return await notifee.getPowerManagerInfo();"));
  assert.ok(fnBody.includes("} catch {"));
  assert.ok(fnBody.includes("return null;"));
});

test("openAlarmPowerManagerSettings is a thin, non-throwing wrapper around notifee's own documented openPowerManagerSettings()", () => {
  const fnIndex = module_.indexOf("export async function openAlarmPowerManagerSettings");
  const fnBody = module_.slice(fnIndex, fnIndex + 200);
  assert.ok(fnBody.includes("await notifee.openPowerManagerSettings();"));
  assert.ok(fnBody.includes("} catch {"));
});

test("AlarmPowerManagerInfo is inferred from notifee's own getPowerManagerInfo() return type, never a hand-copied duplicate or a fragile deep import into notifee's dist/ internals", () => {
  assert.match(module_, /export type AlarmPowerManagerInfo = Awaited<ReturnType<typeof notifee\.getPowerManagerInfo>>;/);
});

// --- Smart Alarm Conflict Management task, requirement 3 ("critical") ---

test("hasActiveTaskConflict is the one IO wrapper every conflict check reads through -- the PERSISTED TaskTimerRun (loadTaskTimerRun), delegated to arc/taskTimer.ts's own isAnotherTaskActive predicate, never a second/re-derived definition", () => {
  assert.ok(module_.includes('import { isAnotherTaskActive, pauseTaskTimerRun } from "../arc/taskTimer.ts";'));
  const fnIndex = module_.indexOf("export async function hasActiveTaskConflict");
  const fnBody = module_.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("const run = await loadTaskTimerRun();"));
  assert.ok(fnBody.includes("if (isAnotherTaskActive(run, excludeTaskId, now)) return true;"));
});

// ARCHI -- Regression Audit and Recovery task, Part 2 fix: "an ARC
// exercise is active" is its own busy condition, independent of any
// task timer -- a standalone ARC session (no linked task running/
// paused at all) must still suppress a different task's alarm.
test("bug fix: hasActiveTaskConflict ALSO checks the persisted, single-slot NewArcLiveSessionState (loadNewArcLiveSession) -- a standalone ARC session (no TaskTimerRun at all) must still count as busy, never only checked via the task timer", () => {
  const fnIndex = module_.indexOf("export async function hasActiveTaskConflict");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("const arcSession = await loadNewArcLiveSession();"));
  // Regression Audit, Part 2 (stale-session gap) fix: completedAt === null
  // alone is no longer the busy test -- an abandoned session (app killed
  // mid-ARC, never completed) also has completedAt === null, and without a
  // staleness check it would suppress every future alarm forever. Now reuses
  // isNewArcLiveSessionStale (the exact same "not completed AND created
  // today" rule live/DailyStartupSequenceOverlay.tsx already relies on for
  // session recovery) rather than the old, incomplete raw check.
  assert.ok(fnBody.includes("return arcSession !== null && !isNewArcLiveSessionStale(arcSession, now);"), "an ARC session only counts as busy while genuinely still in progress AND not stale -- a session already marked complete, OR abandoned from an earlier day, must never block a later alarm");
  assert.ok(module_.includes("loadNewArcLiveSession,"), "loadNewArcLiveSession must be imported from the same ./storage.ts module every other persisted-state read here already uses");
  assert.ok(module_.includes("isNewArcLiveSessionStale"), "must reuse the EXISTING staleness predicate from arc/newArcLiveTypes.ts, never a second, competing staleness definition");
});

test("bug fix, required scenario coverage: the ARC-session busy check is mode-agnostic -- it reads NewArcLiveSessionState.completedAt alone, with no arcInvocationMode branch anywhere in hasActiveTaskConflict, so a reminder due while Full ARC, Mini ARC (plannedMini), or Shortened ARC is active are all suppressed identically -- never only some of the three pathways", () => {
  const fnIndex = module_.indexOf("export async function hasActiveTaskConflict");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  assert.ok(!fnBody.includes("arcInvocationMode"), "the busy check must never branch on which ARC pathway is active -- Full/Mini/Shortened are all the SAME 'an ARC session is active' condition");
});

test("bug fix, required scenario coverage: an idle session (loadNewArcLiveSession resolves null -- no ARC exercise ever started, or already cleared via returnToTask) never reports a conflict from the ARC-session check alone -- hasActiveTaskConflict falls through to false unless the task-timer check already found a real task conflict", () => {
  const fnIndex = module_.indexOf("export async function hasActiveTaskConflict");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  assert.match(fnBody, /return arcSession !== null && !isNewArcLiveSessionStale\(arcSession, now\);/, "null (idle/cleared) must resolve this branch to false, never throw or default to true");
});

// ARCHI -- Regression Audit, Part 2 (stale-session gap): the actual
// behavior of the new staleness check, exercised against the REAL,
// exported predicate rather than only read as source text, since a
// text-slice assertion alone could not catch a wrong comparison
// direction or an inverted boolean.
test("bug fix, required scenario coverage: a session abandoned on an EARLIER day (completedAt still null -- the app was killed/force-stopped mid-ARC, never reached its own completion step) is STALE and must NOT suppress a later day's task alarm forever", async () => {
  const { isNewArcLiveSessionStale } = await import("../arc/newArcLiveTypes.ts");
  const { createNewArcLiveSessionState } = await import("../arc/newArcLiveTypes.ts");
  const abandonedYesterday = createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", "2026-01-04T09:00:00.000Z");
  assert.equal(abandonedYesterday.completedAt, null);
  assert.equal(isNewArcLiveSessionStale(abandonedYesterday, new Date("2026-01-05T09:00:00.000Z")), true, "a session created on an earlier day, never completed, must be stale -- this is exactly the abandoned-session case the fix closes");
});

test("bug fix, required scenario coverage: a session created EARLIER TODAY, still not completed (the trainee merely backgrounded the app mid-ARC, or the screen remounted), is NOT stale -- legitimate same-day session recovery must remain completely unaffected by the staleness fix", async () => {
  const { isNewArcLiveSessionStale, createNewArcLiveSessionState } = await import("../arc/newArcLiveTypes.ts");
  const stillToday = createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", "2026-01-05T09:00:00.000Z");
  assert.equal(isNewArcLiveSessionStale(stillToday, new Date("2026-01-05T11:30:00.000Z")), false, "same-day, not-yet-completed sessions must still be resumable and must still count as busy");
});

test("bug fix, required scenario coverage: hasActiveTaskConflict is a pure read -- it never calls any Task/alarm-mutating storage function (upsertTask, saveTasks, cancel*, turnOff*, disarm*), so a suppressed alarm can never lose or alter the pending scheduled task's own stored data, only decide whether THIS delivery may ring", () => {
  const fnIndex = module_.indexOf("export async function hasActiveTaskConflict");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  assert.doesNotMatch(fnBody, /upsertTask|saveTasks|cancel\w+|turnOff\w+|disarm\w+/, "the conflict check must be read-only -- all mutation (canceling the notification, leaving the task's own alarm fields untouched) happens in the caller, per the delivery-boundary suppression logic above");
});

test("requirement 3 (delivery boundary), extended by the Regression Audit to cover ARC/morning alarms too: a task-START alarm, a Planned ARC alarm, OR the morning alarm (never the timer-end/test kinds) checks hasActiveTaskConflict BEFORE ever calling startRinging -- a genuine conflict cancels the notification outright and ends the foreground service, never ringing/vibrating/showing full-screen", () => {
  const fnIndex = module_.indexOf("export function registerTaskAlarmForegroundService");
  // Window widened (11000 -> 12200): ARCHI task-not-started task's own
  // isTaskNotStartedArm declaration/comment and early-return branch,
  // both inserted earlier in the function, pushed proceed()/the
  // isSuppressibleAlarm guard further from fnIndex than before.
  const fnBody = module_.slice(fnIndex, fnIndex + 12200);
  assert.ok(fnBody.includes("const isTaskStartAlarm = taskId !== null && !isTimerEndAlarm;"));
  assert.ok(fnBody.includes("const isSuppressibleAlarm = isTaskStartAlarm || isArcAlarm || isMorningAlarm;"), "a Planned ARC alarm and the morning alarm must be suppressible on the exact same busy check as a task-start alarm -- neither carries a taskId of its own, so they must never be silently excluded from isSuppressibleAlarm");
  const guardIndex = fnBody.indexOf("if (isSuppressibleAlarm) {");
  assert.ok(guardIndex !== -1);
  const guardBody = fnBody.slice(guardIndex, guardIndex + 1800);
  // ARCHI -- Final Critical Check task: the callback is now `async` --
  // it explicitly redisplays the loud alarm channel AFTER the conflict
  // check clears, before proceed()/startRinging ever run (see this same
  // file's own comment on that redisplay for why).
  assert.ok(guardBody.includes('hasActiveTaskConflict(taskId ?? "").then(async (conflict) => {'), "ARC/morning alarms have no taskId of their own -- '' (never a real generated task id) means no exclusion, so any active task or ARC session counts as a conflict for them");
  assert.ok(guardBody.includes("if (conflict) {"));
  assert.ok(guardBody.includes("notifee.cancelNotification(notificationId)"));
  assert.ok(guardBody.includes("stop();"));
  assert.ok(guardBody.includes("proceed();"));
  assert.ok(guardBody.includes("await notifee"), "the busy-cleared path must explicitly redisplay before proceed() is ever called");
  // startRinging only happens inside `proceed`, called from the guard only in the non-conflict branch -- never unconditionally before the check.
  const proceedIndex = fnBody.indexOf("const proceed = () => {");
  assert.ok(proceedIndex !== -1 && proceedIndex < guardIndex, "proceed (which calls startRinging) must be DEFINED before the conflict check runs, but only ever INVOKED from inside it");
  const proceedBody = fnBody.slice(proceedIndex, guardIndex);
  assert.ok(proceedBody.includes("loadTaskAlarmPreferences().then((preferences) => startRinging(preferences.soundEnabled, preferences.vibrationEnabled));"));
});

test("requirement 3: a suppressed conflicting alarm never writes to Task/alarm storage (never disarms, never marks turned-off) -- the next reconcileTaskAlarms pass arms the task's TRUE next occurrence, never a retroactive ring for the one just suppressed here", () => {
  const fnIndex = module_.indexOf("export function registerTaskAlarmForegroundService");
  const fnBody = module_.slice(fnIndex, fnIndex + 11000);
  const guardIndex = fnBody.indexOf("if (isSuppressibleAlarm) {");
  const conflictBranchIndex = fnBody.indexOf("if (conflict) {", guardIndex);
  const conflictBranchBody = fnBody.slice(conflictBranchIndex, fnBody.indexOf("return;", conflictBranchIndex) + 10);
  assert.ok(!conflictBranchBody.includes("disarmTaskAlarm"));
  assert.ok(!conflictBranchBody.includes("turnOffTaskAlarm"));
  assert.ok(!conflictBranchBody.includes("saveTasks"));
});

test("requirement 3 (scheduling boundary): reconcileTaskAlarms/scheduleTaskAlarm are documented as unaffected by an active-task conflict -- an active conflict must never be a reason to withhold or cancel a DIFFERENT task's own schedule, only the delivery boundary ever suppresses the ring itself", () => {
  const fnIndex = module_.indexOf("export async function reconcileTaskAlarms");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(!fnBody.includes("hasActiveTaskConflict"), "reconcileTaskAlarms must still arm every planned task's true next occurrence regardless of any OTHER task's current conflict state -- the schedule itself is never conflict-gated");
  assert.ok(fnBody.includes("return armTaskAlarm(task, new Date(targetIso));"));
});

test("ARCHI -- Unified Development Specification task, Part 13: armTaskAlarm/disarmTaskAlarm both cancel a STALE legacy (non-native) notification before anything else -- closes the orphaned-notification bug where overwriting task.notificationId without first canceling the OLD value's expo-notifications reminder left it pending", () => {
  assert.match(module_, /async function cancelStaleLegacyNotification\(task: Task\): Promise<void> \{\s*if \(task\.notificationId && !isNativeAlarmId\(task\.notificationId\)\) \{\s*await cancelScheduledNotification\(task\.notificationId\);/);

  const armIndex = module_.indexOf("export async function armTaskAlarm");
  const armBody = module_.slice(armIndex, armIndex + 400);
  assert.ok(armBody.includes("await cancelStaleLegacyNotification(task);"), "armTaskAlarm must cancel a stale legacy notification before arming");

  const disarmIndex = module_.indexOf("export async function disarmTaskAlarm");
  const disarmBody = module_.slice(disarmIndex, disarmIndex + 400);
  assert.ok(disarmBody.includes("await cancelStaleLegacyNotification(task);"), "disarmTaskAlarm must cancel a stale legacy notification before disarming");
});

test("ARCHI -- Unified Development Specification task, Part 12: the task-alarm channel id was re-versioned (channel importance/sound/vibration can never change on an existing channel id) -- insurance alongside the reminder channel's own re-versioning in data/notifications.ts", () => {
  assert.match(alarmChannelModule, /const TASK_ALARM_CHANNEL_ID = "archi-task-alarm-v2";/);
});
