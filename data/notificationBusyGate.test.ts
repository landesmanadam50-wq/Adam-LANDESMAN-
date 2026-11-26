import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/notificationBusyGate.test.ts
 *
 * ARCHI -- Complete the Non-Interrupting Notification System task:
 * source-text regression guard for the new native-delivery architecture
 * that makes busy-state suppression reliable even when the Android
 * process has been killed -- data/notifications.ts's
 * scheduleNativeReminderNotification/isInterruptiveReminderKind/
 * redisplayReminderQuiet/redisplayReminderLoud, data/alarmChannel.ts's
 * two new channels, and data/taskAlarm.ts's own dispatcher branch that
 * ties them together. Like every other module that depends on
 * @notifee/react-native/expo-notifications, this checks the real
 * source text rather than invoking it (node --test has no native
 * module host) -- the pure parts (isInterruptiveReminderKind's own
 * kind-by-kind logic) ARE exercised directly, since it has no native
 * dependency of its own.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const notificationsModule = readSource("data/notifications.ts");
const taskAlarmModule = readSource("data/taskAlarm.ts");
const alarmChannelModule = readSource("data/alarmChannel.ts");
const dailyVisualizationModule = readSource("data/dailyVisualizationAlarm.ts");

// --- isInterruptiveReminderKind: data/notifications.ts has native-dependent
// top-level imports (expo-notifications, react-native Platform) that don't
// parse under plain `node --test` -- same constraint as every other I/O
// module here -- so this checks the real source text/logic rather than
// importing the module to call the function directly. ---

test("isInterruptiveReminderKind: the CURRENT_TASK_REMINDER_KINDS set contains exactly the 4 current-task kinds (taskTimerEnded/restTimerEnded/postponedTaskReturn/taskScheduledStart), and the function is their negation -- a timer/return notification about the task the trainee is already doing must never be busy-suppressed", () => {
  assert.match(notificationsModule, /const CURRENT_TASK_REMINDER_KINDS: ReadonlySet<ReminderKind> = new Set\(\["taskTimerEnded", "restTimerEnded", "postponedTaskReturn", "taskScheduledStart"\]\);/);
  const fnIndex = notificationsModule.indexOf("export function isInterruptiveReminderKind");
  const fnBody = notificationsModule.slice(fnIndex, fnIndex + 150);
  assert.ok(fnBody.includes("return !CURRENT_TASK_REMINDER_KINDS.has(kind);"));
});

test("isInterruptiveReminderKind: every one of the 9 'soft' reminder kinds (routine/arc/focusSuccess/lifeManifestSubGoal/lifeManifestTarget/arcGoalTarget/fourWeekProgramWeek/personalDevelopmentProgramWeek/arcGymReminder) is a REAL ReminderKind value absent from CURRENT_TASK_REMINDER_KINDS, so each resolves to interruptive -- every genuinely unrelated scheduled exercise/goal must respect the busy-state policy", () => {
  const storageModule = readSource("data/storage.ts");
  const interruptiveKinds = ["routine", "arc", "focusSuccess", "lifeManifestSubGoal", "lifeManifestTarget", "arcGoalTarget", "fourWeekProgramWeek", "personalDevelopmentProgramWeek", "arcGymReminder"];
  const typeIndex = storageModule.indexOf("export type ReminderKind =");
  const typeBody = storageModule.slice(typeIndex, typeIndex + 2400);
  for (const kind of interruptiveKinds) {
    assert.ok(typeBody.includes(`"${kind}"`), `${kind} must be a real ReminderKind value`);
    assert.ok(!notificationsModule.slice(notificationsModule.indexOf("CURRENT_TASK_REMINDER_KINDS"), notificationsModule.indexOf("CURRENT_TASK_REMINDER_KINDS") + 250).includes(`"${kind}"`), `${kind} must NOT be in CURRENT_TASK_REMINDER_KINDS`);
  }
});

// --- scheduleReminderNotification / cancelScheduledNotification routing ---

test("scheduleReminderNotification redirects every interruptive kind to scheduleNativeReminderNotification BEFORE any expo-notifications code runs -- the four current-task kinds fall through to the original, unchanged expo path", () => {
  const fnIndex = notificationsModule.indexOf("export async function scheduleReminderNotification(");
  const fnBody = notificationsModule.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("if (isInterruptiveReminderKind(input.kind)) {"));
  assert.ok(fnBody.includes("return scheduleNativeReminderNotification(input);"));
});

test("scheduleNativeReminderNotification uses notifee's createTriggerNotification with asForegroundService: true and AlarmType.SET_ALARM_CLOCK -- the exact same native mechanism data/taskAlarm.ts's own alarms use, reused rather than a second, parallel engine", () => {
  const fnIndex = notificationsModule.indexOf("async function scheduleNativeReminderNotification");
  // ARC Reminders task: widened from 4700 -- the lock-screen visibility
  // read (ArcTaskReminderSettings.hideContentOnLockScreen) added before
  // this function's own notification-building call pushed the exact
  // offset of alarmManager/SET_ALARM_CLOCK to ~4854.
  const fnBody = notificationsModule.slice(fnIndex, fnIndex + 5200);
  assert.ok(fnBody.includes("await notifee.createTriggerNotification("));
  assert.ok(fnBody.includes("asForegroundService: true,"));
  assert.ok(fnBody.includes("alarmManager: { type: AlarmType.SET_ALARM_CLOCK },"));
  assert.ok(fnBody.includes("[REMINDER_DATA_FLAG]: \"true\","));
});

test("ARCHI -- Final Critical Check task: scheduleNativeReminderNotification's initial scheduled notification uses SILENT_DELIVERY_CHANNEL_ID, NEVER NOTIFEE_REMINDER_CHANNEL_ID -- the loud channel is only ever used later, by redisplayReminderLoud, AFTER hasActiveTaskConflict resolves, so the notification Android's startForeground() requirement forces onto this module can never play a sound/heads-up before the busy check runs", () => {
  const fnIndex = notificationsModule.indexOf("async function scheduleNativeReminderNotification");
  const endIndex = notificationsModule.indexOf("\n}", fnIndex);
  const fnBody = notificationsModule.slice(fnIndex, endIndex);
  assert.ok(fnBody.includes("await ensureSilentDeliveryChannelAsync();"));
  assert.ok(fnBody.includes("channelId: SILENT_DELIVERY_CHANNEL_ID,"));
  assert.ok(!fnBody.includes("channelId: NOTIFEE_REMINDER_CHANNEL_ID"), "the notification actually created here must never be assigned the LOUD channel id -- only the later redisplay functions do that, after the busy check");
});

test("scheduleNativeReminderNotification mints its own deterministic-prefix id (REMINDER_NATIVE_ID_PREFIX) rather than relying on notifee's own random default -- required so cancelScheduledNotification can tell a notifee-native reminder apart from every other id this module hands out", () => {
  assert.match(notificationsModule, /const REMINDER_NATIVE_ID_PREFIX = "reminder-";/);
  assert.match(notificationsModule, /function generateReminderNativeId\(\): string \{\s*return `\$\{REMINDER_NATIVE_ID_PREFIX\}/);
  const fnIndex = notificationsModule.indexOf("async function scheduleNativeReminderNotification");
  // Widened from 1100: the lock-screen visibility settings read now
  // comes before the id is minted (true offset ~1446).
  const fnBody = notificationsModule.slice(fnIndex, fnIndex + 1600);
  assert.ok(fnBody.includes("const id = generateReminderNativeId();"));
});

test("cancelScheduledNotification routes a notifee-native reminder id (prefix match) through notifee's own cancelTriggerNotification/cancelNotification, and every other id (expo-notifications, including the four current-task kinds and timer-completion ids) through the original expo path, unchanged", () => {
  const fnIndex = notificationsModule.indexOf("export async function cancelScheduledNotification");
  const fnBody = notificationsModule.slice(fnIndex, notificationsModule.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("if (notificationId.startsWith(REMINDER_NATIVE_ID_PREFIX)) {"));
  assert.ok(fnBody.includes("await notifee.cancelTriggerNotification(notificationId);"));
  assert.ok(fnBody.includes("await notifee.cancelNotification(notificationId);"));
  assert.ok(fnBody.includes("await Notifications.cancelScheduledNotificationAsync(notificationId);"), "the expo-notifications path must remain reachable and unchanged for every id that isn't a notifee-native reminder");
});

// --- redisplayReminderQuiet / redisplayReminderLoud ---

test("redisplayReminderQuiet shows on QUIET_REMINDER_CHANNEL_ID (LOW importance, no sound) -- never deletes the reminder outright, so it stays reachable in the notification shade afterward", () => {
  const fnIndex = notificationsModule.indexOf("export async function redisplayReminderQuiet");
  const fnBody = notificationsModule.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("await ensureQuietReminderChannelAsync();"));
  assert.ok(fnBody.includes("channelId: QUIET_REMINDER_CHANNEL_ID,"));
});

test("redisplayReminderLoud shows on NOTIFEE_REMINDER_CHANNEL_ID (the same real 'archi-reminders-v2' channel, HIGH importance) when the trainee is available -- the normal, audible/heads-up path", () => {
  const fnIndex = notificationsModule.indexOf("export async function redisplayReminderLoud");
  const fnBody = notificationsModule.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("await ensureNotifeeReminderChannelAsync();"));
  assert.ok(fnBody.includes("channelId: NOTIFEE_REMINDER_CHANNEL_ID,"));
});

test("both redisplay functions preserve a kind's own action buttons/press-action id via the options parameter -- a redisplayed Daily Visualization reminder must keep its 'התחל ויזואליזציה' button, never silently dropped just because delivery now routes through this shared gate", () => {
  // ARC Reminders task: widened from 500 -- the android object's fields
  // were reformatted onto their own lines (adding `visibility:
  // options?.visibility`), pushing actions/pressAction further in.
  const quietIndex = notificationsModule.indexOf("export async function redisplayReminderQuiet");
  const quietBody = notificationsModule.slice(quietIndex, quietIndex + 700);
  assert.ok(quietBody.includes("actions: options?.actions"));
  assert.ok(quietBody.includes("pressAction: options?.pressAction ?? { id: \"default\" }"));
  const loudIndex = notificationsModule.indexOf("export async function redisplayReminderLoud");
  const loudBody = notificationsModule.slice(loudIndex, loudIndex + 700);
  assert.ok(loudBody.includes("actions: options?.actions"));
});

test("both redisplay functions pass `visibility` through to android.visibility -- the one shared settings toggle (ArcTaskReminderSettings.hideContentOnLockScreen) applies uniformly across mantra/recall/transition notifications via this same read-back pattern, never a second decision point", () => {
  const quietIndex = notificationsModule.indexOf("export async function redisplayReminderQuiet");
  const quietBody = notificationsModule.slice(quietIndex, quietIndex + 700);
  assert.ok(quietBody.includes("visibility: options?.visibility,"));
  const loudIndex = notificationsModule.indexOf("export async function redisplayReminderLoud");
  const loudBody = notificationsModule.slice(loudIndex, loudIndex + 700);
  assert.ok(loudBody.includes("visibility: options?.visibility,"));
});

// --- data/alarmChannel.ts: the two new channels ---

test("NOTIFEE_REMINDER_CHANNEL_ID reuses the exact SAME native id ('archi-reminders-v2') the pre-existing expo-notifications reminder channel already created -- still only one real Android channel, never two competing ones for the same purpose", () => {
  assert.match(alarmChannelModule, /export const NOTIFEE_REMINDER_CHANNEL_ID = "archi-reminders-v2";/);
  assert.match(notificationsModule, /const ANDROID_REMINDER_CHANNEL_ID = "archi-reminders-v2";/);
});

test("QUIET_REMINDER_CHANNEL_ID is its own distinct, LOW-importance, never-bypassDnd channel -- Android locks importance/sound at creation, so the quiet fallback can never be the SAME channel id as the loud one, reconfigured in place", () => {
  const fnIndex = alarmChannelModule.indexOf("export async function ensureQuietReminderChannelAsync");
  const fnBody = alarmChannelModule.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("importance: AndroidImportance.LOW,"));
  assert.ok(!fnBody.includes("bypassDnd"));
  assert.match(alarmChannelModule, /export const QUIET_REMINDER_CHANNEL_ID = "archi-reminders-quiet-v1";/);
});

// --- data/taskAlarm.ts dispatcher: the reminder/Daily-Visualization branch ---

test("the dispatcher recognizes a notifee-delivered reminder via Boolean(notification.data?.[REMINDER_DATA_FLAG]) -- never '=== true' (notifee's own Notification.data type excludes boolean, so the flag is carried as the string \"true\")", () => {
  const fnIndex = taskAlarmModule.indexOf("export function registerTaskAlarmForegroundService");
  const fnBody = taskAlarmModule.slice(fnIndex, fnIndex + 3300);
  assert.ok(fnBody.includes("const isGenericReminder = Boolean(notification.data?.[REMINDER_DATA_FLAG]);"));
  assert.ok(!fnBody.includes("[REMINDER_DATA_FLAG] === true"));
});

test("a suppressible reminder is isGenericReminder AND isInterruptiveReminderKind(reminderKind) -- the four current-task kinds reach this dispatcher too (every reminder is now scheduled with asForegroundService) but must never be treated as suppressible", () => {
  const fnIndex = taskAlarmModule.indexOf("export function registerTaskAlarmForegroundService");
  const fnBody = taskAlarmModule.slice(fnIndex, fnIndex + 3300);
  assert.match(fnBody, /const isSuppressibleReminder = isGenericReminder && reminderKind !== null && isInterruptiveReminderKind\(reminderKind\);/);
});

test("Daily Visualization shares the EXACT same quiet/loud redisplay gate as a generic reminder (isDailyVisualizationAlarm, folded into the same condition) -- never a second, separate redisplay implementation of its own", () => {
  const fnIndex = taskAlarmModule.indexOf("export function registerTaskAlarmForegroundService");
  // Window widened (4900 -> 5700): Action-Based Tasks task's own
  // isTaskMemoryReminderArm declaration/comment, inserted earlier in the
  // function, pushed this branch further from fnIndex than before --
  // same function, same content, just at a later offset.
  const fnBody = taskAlarmModule.slice(fnIndex, fnIndex + 5700);
  assert.ok(fnBody.includes('const isDailyVisualizationAlarm = notification.data?.kind === "dailyVisualizationAlarm";'));
  assert.ok(fnBody.includes("if (isSuppressibleReminder || isDailyVisualizationAlarm) {"));
});

test("the reminder/Daily-Visualization branch NEVER reaches the ring-based proceed() machinery -- it decides quiet-vs-loud from hasActiveTaskConflict, cancels the originally-posted notification first, redisplays the chosen variant, then ends the brief foreground service immediately (never startRinging, never the 2-minute cap)", () => {
  const fnIndex = taskAlarmModule.indexOf("if (isSuppressibleReminder || isDailyVisualizationAlarm) {");
  const branchBody = taskAlarmModule.slice(fnIndex, fnIndex + 1200);
  assert.ok(branchBody.includes('hasActiveTaskConflict("").then(async (conflict) => {'), "no taskId of its own to exclude -- any active task or ARC session counts");
  assert.ok(branchBody.includes("await notifee.cancelNotification(notificationId).catch(() => {});"));
  assert.ok(branchBody.includes("await redisplayReminderQuiet(notificationId, title, body, data, redisplayOptions);"));
  assert.ok(branchBody.includes("await redisplayReminderLoud(notificationId, title, body, data, redisplayOptions);"));
  assert.ok(!branchBody.includes("startRinging"));
  assert.ok(branchBody.includes("stop();"));
  const returnAfter = taskAlarmModule.slice(fnIndex, fnIndex + 1300).indexOf("return;");
  assert.ok(returnAfter !== -1 && returnAfter < 1300, "must return before falling through to proceed()");
});

test("the reminder/Daily-Visualization branch is checked BEFORE `proceed` is even defined -- structurally impossible for a reminder to ever trigger the ring-based alarm machinery", () => {
  const fnIndex = taskAlarmModule.indexOf("export function registerTaskAlarmForegroundService");
  const branchIndex = taskAlarmModule.indexOf("if (isSuppressibleReminder || isDailyVisualizationAlarm) {", fnIndex);
  const proceedIndex = taskAlarmModule.indexOf("const proceed = () => {", fnIndex);
  assert.ok(branchIndex !== -1 && proceedIndex !== -1 && branchIndex < proceedIndex);
});

// --- handleTaskAlarmEvent: reminder tap routing ---

test("handleTaskAlarmEvent routes a tapped notifee-delivered reminder (Boolean(data[REMINDER_DATA_FLAG])) to the SAME routeTappedReminder data/reminders.ts already defines -- never a second, re-derived switch, and only on an actual press/action (never a silent background delivery event)", () => {
  const fnIndex = taskAlarmModule.indexOf("export async function handleTaskAlarmEvent");
  const fnBody = taskAlarmModule.slice(fnIndex, taskAlarmModule.indexOf("if (data.kind !== \"taskAlarm\") return;", fnIndex));
  assert.ok(fnBody.includes("if (Boolean(data[REMINDER_DATA_FLAG])) {"));
  assert.ok(fnBody.includes("routeTappedReminder(data);"));
  assert.ok(fnBody.includes("if (event.type === EventType.ACTION_PRESS || event.type === EventType.PRESS) {"));
});

test("taskAlarm.ts imports routeTappedReminder/isInterruptiveReminderKind/redisplayReminderLoud/redisplayReminderQuiet/REMINDER_DATA_FLAG from their single source of truth modules, never a second, locally re-derived copy", () => {
  assert.ok(taskAlarmModule.includes('import { ACTION_ARC_RECALL_ANSWER, cancelScheduledNotification, isInterruptiveReminderKind, redisplayReminderLoud, redisplayReminderQuiet, REMINDER_DATA_FLAG } from "./notifications.ts";'));
  assert.ok(taskAlarmModule.includes('import { routeTappedReminder } from "./reminders.ts";'));
});

// --- Daily Visualization: now routes through the shared busy gate ---

test("data/dailyVisualizationAlarm.ts's own createTriggerNotification now sets asForegroundService: true -- the only way its busy check can run before display even from a cold, previously-killed process", () => {
  const fnIndex = dailyVisualizationModule.indexOf("async function armDailyVisualizationAlarm");
  const fnBody = dailyVisualizationModule.slice(fnIndex, fnIndex + 1400);
  assert.ok(fnBody.includes("asForegroundService: true,"));
  assert.ok(fnBody.includes('data: { kind: "dailyVisualizationAlarm" },'), "its own data.kind must stay intact so handleDailyVisualizationAlarmEvent's existing tap routing is completely unaffected");
});

// --- Native-architecture evidence (Part 1: confirmed, not assumed) ---

test("notifee's own HeadlessTask.java confirms createReactContextAndScheduleTask starts a FRESH React instance when none exists -- the concrete native evidence that asForegroundService: true reminders/alarms run their registerForegroundService callback even after the whole app process was killed, not merely while JS happens to already be running", () => {
  const headlessTaskSource = readSource("node_modules/@notifee/react-native/android/src/main/java/io/invertase/notifee/HeadlessTask.java");
  assert.ok(headlessTaskSource.includes("reactInstanceManager.createReactContextInBackground();"));
  assert.ok(headlessTaskSource.includes("ReactContext reactContext = getReactContext(context);"));
});

// --- Part 2: "only one foreground-service notification per app" --------
//
// notifee permits only ONE asForegroundService: true notification active
// at once app-wide (its own documented contract: a second one stops the
// existing native Service and starts a new one for the new notification
// id). EVERY asForegroundService: true notification in this app --
// task-start/ARC/morning alarms, every notifee-native reminder, and
// Daily Visualization -- is handled by that SAME single Service class,
// so they all genuinely compete for that one slot. The invariants below
// are what keep that OS-level reassignment from corrupting THIS app's
// own JS-side bookkeeping, even though the reassignment itself happens
// entirely in native code before any JS runs (see data/alarmChannel.ts's
// own ALARM_FOREGROUND_SERVICE_TYPES doc) and so cannot be prevented, or
// even observed, from JS. What CAN be verified here, from source, is
// that losing the single Service slot to a second notification can
// never itself cause a duplicate sound, a stale notification, or a lost
// reminder -- only that it is possible, which no physical device is
// available to this project to actually exercise.

test("Part 2: EVERY asForegroundService: true call in this app (task-start/ARC/morning alarms, armTestAlarm/armTaskTimerEndAlarm, scheduleNativeReminderNotification, Daily Visualization) requests the exact SAME foreground-service type the one notifee Service class actually declares -- a mismatched or omitted type on ANY of them risks the identical Android-14+ startForeground() failure data/taskAlarm.ts's own alarms already had to fix once, since they all share one native Service, never one-per-kind", () => {
  assert.match(alarmChannelModule, /export const ALARM_FOREGROUND_SERVICE_TYPES = \[AndroidForegroundServiceType\.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE\];/);
  // data/taskAlarm.ts keeps its own pre-existing, already-tested constant
  // (TASK_ALARM_FOREGROUND_SERVICE_TYPES) rather than being refactored to
  // import the shared one -- both resolve to the identical single enum
  // value, so this is a naming difference, never a behavioral one.
  assert.match(taskAlarmModule, /const TASK_ALARM_FOREGROUND_SERVICE_TYPES = \[AndroidForegroundServiceType\.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE\];/);
  const reminderFnIndex = notificationsModule.indexOf("async function scheduleNativeReminderNotification");
  const reminderFnBody = notificationsModule.slice(reminderFnIndex, notificationsModule.indexOf("\n}", reminderFnIndex));
  assert.ok(reminderFnBody.includes("foregroundServiceTypes: ALARM_FOREGROUND_SERVICE_TYPES,"));
  const dvFnIndex = dailyVisualizationModule.indexOf("async function armDailyVisualizationAlarm");
  const dvFnBody = dailyVisualizationModule.slice(dvFnIndex, dailyVisualizationModule.indexOf("\n}", dvFnIndex));
  assert.ok(dvFnBody.includes("foregroundServiceTypes: ALARM_FOREGROUND_SERVICE_TYPES,"));
});

test("Part 2 (no duplicate notification sounds): startRinging is reachable ONLY from the ring-based proceed() path (task-start/ARC/morning/timer-end/test alarms) -- a reminder or Daily Visualization can NEVER call it, under any busy-check outcome, because the reminder/Daily-Visualization branch returns unconditionally before proceed is ever defined (see the structural-impossibility test above). A second asForegroundService notification stealing the native Service slot from a currently-ringing alarm can therefore never cause a SECOND sound to start -- at most it can only ever affect which notification currently owns the OS's single foreground-service slot, never which JS code is allowed to call startRinging", () => {
  const dispatcherIndex = taskAlarmModule.indexOf("export function registerTaskAlarmForegroundService");
  const dispatcherEnd = taskAlarmModule.indexOf("\n}", taskAlarmModule.indexOf("new Promise<void>((resolve) => {", dispatcherIndex));
  const dispatcherBody = taskAlarmModule.slice(dispatcherIndex, dispatcherEnd + 2);
  const startRingingCallOccurrences = dispatcherBody.split("=> startRinging(").length - 1;
  assert.strictEqual(startRingingCallOccurrences, 1, "startRinging must be CALLED from exactly one place in the dispatcher -- inside proceed(), never duplicated for a second code path (comments that merely mention startRinging() don't count)");
  const proceedIndex = dispatcherBody.indexOf("const proceed = () => {");
  const startRingingIndex = dispatcherBody.indexOf("startRinging(");
  assert.ok(proceedIndex !== -1 && startRingingIndex > proceedIndex, "the one startRinging call must be inside proceed(), never reachable from the reminder/Daily-Visualization branch above it");
});

test("Part 2 (no stale ongoing notifications / correct cleanup): every suppressed or redisplayed path cancels the notification id it is replacing BEFORE showing anything else under that same id -- a conflict-suppressed ring alarm cancels outright (notifee.cancelNotification), and the reminder/Daily-Visualization branch explicitly cancels the SILENT original before redisplaying quiet-or-loud, so no device can ever show two notifications (silent original + redisplay) stacked under the one id at once", () => {
  const suppressedAlarmIndex = taskAlarmModule.indexOf("if (conflict) {", taskAlarmModule.indexOf("if (isSuppressibleAlarm) {"));
  const suppressedAlarmBody = taskAlarmModule.slice(suppressedAlarmIndex, suppressedAlarmIndex + 200);
  assert.ok(suppressedAlarmBody.includes("notifee.cancelNotification(notificationId).catch(() => {});"));
  const reminderBranchIndex = taskAlarmModule.indexOf("if (isSuppressibleReminder || isDailyVisualizationAlarm) {");
  const reminderBranchBody = taskAlarmModule.slice(reminderBranchIndex, reminderBranchIndex + 1200);
  const cancelIndex = reminderBranchBody.indexOf("await notifee.cancelNotification(notificationId).catch(() => {});");
  const quietIndex = reminderBranchBody.indexOf("await redisplayReminderQuiet(");
  const loudIndex = reminderBranchBody.indexOf("await redisplayReminderLoud(");
  assert.ok(cancelIndex !== -1 && cancelIndex < quietIndex && cancelIndex < loudIndex, "the silent original must be canceled before EITHER redisplay variant is shown");
});

test("Part 2 (correct service cleanup / no indefinite leak): every registerForegroundService invocation registers its own resolve() into pendingForegroundServiceStops keyed by ITS OWN notification id BEFORE either branch below can run, and every exit path (the reminder/Daily-Visualization branch, the suppressed-alarm return, and proceed()'s own ring-timeout/action-handler paths) eventually calls stop() -- so even if notifee's native side silently abandons one invocation in favor of a second, differently-id'd notification (the one-foreground-service-at-a-time reassignment this Part 2 investigation is about), THIS invocation's own stop() still runs on its own ring-timeout/busy-check path and cleans up its own Map entry; it can never accumulate unboundedly because every entry is deleted by its own stop(), never left for a different invocation to clear", () => {
  const dispatcherIndex = taskAlarmModule.indexOf("export function registerTaskAlarmForegroundService");
  const stopDefIndex = taskAlarmModule.indexOf("const stop = () => {", dispatcherIndex);
  const branchIndex = taskAlarmModule.indexOf("if (isSuppressibleReminder || isDailyVisualizationAlarm) {", dispatcherIndex);
  assert.ok(stopDefIndex !== -1 && stopDefIndex < branchIndex, "stop/the pendingForegroundServiceStops registration must happen before either branch runs");
  const stopDefBody = taskAlarmModule.slice(stopDefIndex, branchIndex);
  assert.ok(stopDefBody.includes("if (notificationId) pendingForegroundServiceStops.delete(notificationId);"));
  assert.ok(stopDefBody.includes("if (notificationId) pendingForegroundServiceStops.set(notificationId, stop);"));
});

test("Part 2 (every alarm/reminder/Daily-Visualization kind uses AlarmType.SET_ALARM_CLOCK, never SET_EXACT/SET_EXACT_AND_ALLOW_WHILE_IDLE): this is the one documented Android-12+ exemption that lets a foreground service legitimately be started from a background BroadcastReceiver at all -- the only JS-controllable mitigation available for 'no unsupported background service starts', since Android's own background-start restrictions are otherwise enforced entirely in native/OS code before any JS runs", () => {
  for (const [label, source] of [
    ["task-start/ARC/morning/timer-end/test alarms", taskAlarmModule],
    ["soft reminders", notificationsModule],
    ["Daily Visualization", dailyVisualizationModule],
  ] as const) {
    const occurrences = source.split("alarmManager: { type: AlarmType.SET_ALARM_CLOCK },").length - 1;
    assert.ok(occurrences >= 1, `${label} must schedule via AlarmType.SET_ALARM_CLOCK`);
    assert.ok(!source.includes("AlarmType.SET_EXACT"), `${label} must never use the non-exempt SET_EXACT/SET_EXACT_AND_ALLOW_WHILE_IDLE trigger types`);
  }
});

// --- ARC Reminders task, Phase 4: Active Recall inline reply ---

test("checkpoint (one new action, one kind): scheduleNativeReminderNotification attaches the ACTION_ARC_RECALL_ANSWER action -- carrying notifee's existing AndroidInput support -- ONLY for kind 'arcRecallQuestion', and no actions at all for every other kind, exactly as before this task", () => {
  const fnIndex = notificationsModule.indexOf("async function scheduleNativeReminderNotification");
  const fnBody = notificationsModule.slice(fnIndex, fnIndex + 5200);
  assert.ok(fnBody.includes('input.kind === "arcRecallQuestion"'));
  assert.ok(fnBody.includes("pressAction: { id: ACTION_ARC_RECALL_ANSWER }"));
  assert.ok(fnBody.includes("input: { allowFreeFormInput: true, placeholder:"));
  assert.ok(fnBody.includes(": undefined,"), "every other kind must still get no actions at all");
});

test("checkpoint (the exact message a reply is recorded against): the data payload carries arcRecallChatMessageId alongside the pre-existing arcReminderId, both only for the kinds that need them", () => {
  assert.match(notificationsModule, /arcRecallChatMessageId\?: string;/);
  const fnIndex = notificationsModule.indexOf("async function scheduleNativeReminderNotification");
  const fnBody = notificationsModule.slice(fnIndex, fnIndex + 5200);
  assert.ok(fnBody.includes("...(input.arcRecallChatMessageId !== undefined ? { arcRecallChatMessageId: input.arcRecallChatMessageId } : {}),"));
});

test("checkpoint (never a second inline-reply primitive): ReminderRedisplayOptions widens its own actions type to allow notifee's AndroidInput, so the SAME redisplayReminderQuiet/Loud -> android.actions pass-through every other kind already relies on carries the recall action through a busy-state redisplay unchanged", () => {
  assert.match(notificationsModule, /actions\?: \{ title: string; pressAction: \{ id: string \}; input\?: true \| AndroidInput \}\[\];/);
  assert.match(notificationsModule, /import type \{ AndroidInput \} from "@notifee\/react-native";/);
});

test("checkpoint (inline answer never falls through to the plain tap handler): handleTaskAlarmEvent checks data.kind === 'arcRecallQuestion' + the exact ACTION_ARC_RECALL_ANSWER id + a non-empty event.detail.input BEFORE the generic Boolean(data[REMINDER_DATA_FLAG]) branch, and returns without ever calling routeTappedReminder for that same press", () => {
  const genericBranchIndex = taskAlarmModule.indexOf("if (Boolean(data[REMINDER_DATA_FLAG])) {");
  const inlineReplyIndex = taskAlarmModule.indexOf('data.kind === "arcRecallQuestion" &&');
  assert.ok(inlineReplyIndex !== -1 && genericBranchIndex !== -1);
  assert.ok(inlineReplyIndex < genericBranchIndex, "the inline-reply branch must be checked BEFORE the generic soft-reminder tap branch");
  const fnBody = taskAlarmModule.slice(inlineReplyIndex, genericBranchIndex);
  assert.ok(fnBody.includes("event.type === EventType.ACTION_PRESS &&"));
  assert.ok(fnBody.includes("event.detail.pressAction?.id === ACTION_ARC_RECALL_ANSWER &&"));
  assert.ok(fnBody.includes('typeof event.detail.input === "string" &&'));
  assert.ok(fnBody.includes("event.detail.input.trim().length > 0"));
  assert.ok(fnBody.includes("await recordArcRecallAnswer(chatMessageId, event.detail.input, new Date().toISOString());"));
  // Scoped to this branch's own `{ ... }` body only (through its closing
  // `return;`) -- the NEXT branch's own doc comment legitimately names
  // routeTappedReminder in prose, which would be a false positive here.
  const ownBodyEnd = taskAlarmModule.indexOf("return;", taskAlarmModule.indexOf("if (notificationId) await notifee.cancelNotification", inlineReplyIndex));
  const ownBody = taskAlarmModule.slice(inlineReplyIndex, ownBodyEnd);
  assert.ok(!ownBody.includes("routeTappedReminder"), "the inline-reply branch must never also call routeTappedReminder for the same press");
});

test("checkpoint (dismiss the notification after an inline answer, same as a plain action press on every other reminder kind): the inline-reply branch cancels the notification by its real event-carried id, never a stale/invented one", () => {
  const inlineReplyIndex = taskAlarmModule.indexOf('data.kind === "arcRecallQuestion" &&');
  const genericBranchIndex = taskAlarmModule.indexOf("if (Boolean(data[REMINDER_DATA_FLAG])) {");
  const fnBody = taskAlarmModule.slice(inlineReplyIndex, genericBranchIndex);
  assert.ok(fnBody.includes("const notificationId = event.detail.notification?.id;"));
  assert.ok(fnBody.includes("if (notificationId) await notifee.cancelNotification(notificationId).catch(() => {});"));
});
