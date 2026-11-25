import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/taskNotStartedNotification.test.ts
 *
 * ARCHI -- Adaptive Task Execution & Emotional Persistence task,
 * section 2: source-text regression guard for this module's notifee-
 * backed notification (notifee isn't callable under a plain
 * `node --test` run, same convention as every other notification
 * module in this app -- see data/taskTransitionNotification.test.ts).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/taskNotStartedNotification.ts");
const alarmChannelModule = readSource("data/alarmChannel.ts");
const taskAlarmModule = readSource("data/taskAlarm.ts");
const arcRemindersModule = readSource("arc/arcReminders.ts");

test("the real, user-facing notification uses ONE fixed, deterministic id -- re-displaying structurally replaces any previous one, never stacking a second one", () => {
  assert.match(module_, /const TASK_NOT_STARTED_NOTIFICATION_ID = "archi-task-not-started-notification";/);
  const fnIndex = module_.indexOf("async function displayTaskNotStartedNotification");
  const fnBody = module_.slice(fnIndex, fnIndex + 1200);
  assert.ok(fnBody.includes("id: TASK_NOT_STARTED_NOTIFICATION_ID,"));
});

test("posted to its OWN dedicated channel -- HIGH importance (heads-up) but never bypassDnd/a custom sound, so it respects Do Not Disturb like every reminder except the real task-start alarm", () => {
  assert.match(alarmChannelModule, /export const TASK_NOT_STARTED_CHANNEL_ID = "archi-task-not-started-v1";/);
  const channelFnIndex = alarmChannelModule.indexOf("export async function ensureTaskNotStartedChannelAsync");
  const channelFnBody = alarmChannelModule.slice(channelFnIndex, channelFnIndex + 400);
  assert.ok(channelFnBody.includes("importance: AndroidImportance.HIGH,"));
  assert.ok(!channelFnBody.includes("bypassDnd"), "must respect Do Not Disturb");
  assert.ok(!channelFnBody.includes("sound:"), "must not force a custom alarm sound");
  assert.ok(module_.includes("ensureTaskNotStartedChannelAsync()"));
  assert.ok(!module_.includes('import { TASK_ALARM_CHANNEL_ID'), "must never import, and so never post to or touch, the real loud task-start alarm channel");
  assert.ok(!module_.includes("channelId: TASK_ALARM_CHANNEL_ID"), "must never post to, or touch, the real loud task-start alarm channel");
  // Exactly one definition in alarmChannel.ts -- a leftover duplicate
  // from an earlier edit would silently shadow this module's own import.
  const occurrences = alarmChannelModule.split("export async function ensureTaskNotStartedChannelAsync").length - 1;
  assert.equal(occurrences, 1, "ensureTaskNotStartedChannelAsync must be defined exactly once");
});

test("never auto-dismisses quickly: the real notification is autoCancel: false, with no setTimeout-based self-cancel anywhere in its own display function", () => {
  const fnIndex = module_.indexOf("async function displayTaskNotStartedNotification");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function cancelTaskNotStartedNotification"));
  assert.ok(fnBody.includes("autoCancel: false,"));
  assert.ok(!fnBody.includes("setTimeout"));
});

test("never repeats the alert sound on a redisplay for the same still-due task -- enforced structurally via onlyAlertOnce, never a manually-tracked 'already alerted' flag gating the sound", () => {
  const fnIndex = module_.indexOf("async function displayTaskNotStartedNotification");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function cancelTaskNotStartedNotification"));
  assert.ok(fnBody.includes("onlyAlertOnce: true,"));
});

test("exactly 3 directly-visible actions, the exact required Hebrew wording and distinct action ids -- the hard 3-button Android cap this spec itself names", () => {
  const fnIndex = module_.indexOf("async function displayTaskNotStartedNotification");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function cancelTaskNotStartedNotification"));
  assert.ok(fnBody.includes('{ title: "אני צריך פעולה תומכת", pressAction: { id: ACTION_NOT_STARTED_SUPPORT } }'));
  assert.ok(fnBody.includes('{ title: "התחל משימה", pressAction: { id: ACTION_NOT_STARTED_START } }'));
  assert.ok(fnBody.includes('{ title: "סיום או ויתור על המשימה", pressAction: { id: ACTION_NOT_STARTED_FINISH_OR_GIVE_UP } }'));
  const actionsIndex = fnBody.indexOf("actions: [");
  const actionsBlock = fnBody.slice(actionsIndex, fnBody.indexOf("],", actionsIndex));
  assert.equal(actionsBlock.split("pressAction:").length - 1, 3, "must never exceed the 3-action Android cap");
});

test("the one pure predicate (arc/taskNotStartedAlert.ts's resolveTaskNotStartedAlert) is the ONLY busy-check -- recomputeTaskNotStartedNotification adds no second, competing 'is this task genuinely not started' computation", () => {
  assert.match(module_, /import \{ resolveTaskNotStartedAlert \} from "\.\.\/arc\/taskNotStartedAlert\.ts";/);
  const fnIndex = module_.indexOf("export async function recomputeTaskNotStartedNotification");
  const fnBody = module_.slice(fnIndex);
  assert.ok(fnBody.includes("const due = resolveTaskNotStartedAlert(scheduled, now, activeRun);"));
});

test("built on the Flexible Daily Schedule, never the raw weekly routine: scheduled comes from resolveTodaysScheduledPlan, the exact same IO pipeline every other sync-fixed consumer in this codebase already shares", () => {
  assert.match(module_, /import \{ resolveTodaysScheduledPlan \} from "\.\/dailyPlan\.ts";/);
  const fnIndex = module_.indexOf("export async function recomputeTaskNotStartedNotification");
  const fnBody = module_.slice(fnIndex);
  assert.ok(fnBody.includes("resolveTodaysScheduledPlan(now)"));
});

test("disabling the setting cancels the real notification AND the armed native trigger -- independent of every other ARC Reminders toggle", () => {
  const fnIndex = module_.indexOf("export async function recomputeTaskNotStartedNotification");
  const fnBody = module_.slice(fnIndex);
  assert.ok(fnBody.includes("if (!settings.taskNotStartedNotificationEnabled) {"));
  assert.ok(fnBody.includes("await cancelTaskNotStartedNotification();"));
  assert.ok(fnBody.includes("await cancelArmedTaskNotStartedAlarm();"));
  assert.ok(fnBody.includes("return;"));
  assert.match(arcRemindersModule, /taskNotStartedNotificationEnabled: boolean;/);
});

test("never leaves a stale notification once nothing is due: when resolveTaskNotStartedAlert returns null, the real notification is cancelled unconditionally -- update/remove itself the instant the user starts another way or the next task arrives", () => {
  const fnIndex = module_.indexOf("export async function recomputeTaskNotStartedNotification");
  const fnBody = module_.slice(fnIndex);
  const dueCheckIndex = fnBody.indexOf("if (!due) {");
  assert.ok(dueCheckIndex >= 0);
  const dueCheckBody = fnBody.slice(dueCheckIndex, dueCheckIndex + 150);
  assert.ok(dueCheckBody.includes("await cancelTaskNotStartedNotification();"));
});

test("re-arms the native trigger for whichever entry resolveCurrentTaskState's own 'next' field reports -- the one shared current/next decision every other consumer shares, never a second, independently-sorted 'what's upcoming' scan", () => {
  assert.match(module_, /import \{ resolveCurrentTaskState \} from "\.\.\/arc\/dailyPlan\.ts";/);
  const fnIndex = module_.indexOf("async function armNextTaskNotStartedAlarm");
  const fnBody = module_.slice(fnIndex, module_.indexOf("async function displayTaskNotStartedNotification"));
  assert.ok(fnBody.includes("const { next } = resolveCurrentTaskState(scheduled, now, activeRun, null);"));
  assert.ok(fnBody.includes("await cancelArmedTaskNotStartedAlarm();"), "must always clear any previous arm before re-arming -- never a second, stacked trigger");
});

test("the armed trigger is a real notifee TriggerNotification (TIMESTAMP + SET_ALARM_CLOCK) on the generic SILENT_DELIVERY_CHANNEL_ID placeholder -- a direct sibling of data/taskAlarm.ts's own ARC-alarm section, never a fixed polling interval and never the loud task-alarm channel", () => {
  assert.match(module_, /import \{ ALARM_FOREGROUND_SERVICE_TYPES, ensureNotifeePermissionAsync, ensureTaskNotStartedChannelAsync, SILENT_DELIVERY_CHANNEL_ID, TASK_NOT_STARTED_CHANNEL_ID \} from "\.\/alarmChannel\.ts";/);
  const fnIndex = module_.indexOf("async function armNextTaskNotStartedAlarm");
  const fnBody = module_.slice(fnIndex, module_.indexOf("async function displayTaskNotStartedNotification"));
  assert.ok(fnBody.includes("type: TriggerType.TIMESTAMP,"));
  assert.ok(fnBody.includes("alarmManager: { type: AlarmType.SET_ALARM_CLOCK },"));
  assert.ok(fnBody.includes("channelId: SILENT_DELIVERY_CHANNEL_ID,"));
  assert.ok(fnBody.includes("asForegroundService: true,"));
  assert.ok(fnBody.includes("foregroundServiceTypes: ALARM_FOREGROUND_SERVICE_TYPES,"));
});

test("never throws: a failed native call anywhere (display or arm) is caught and logged, never crashing the caller -- same honest-failure discipline as every other notification module", () => {
  const armIndex = module_.indexOf("async function armNextTaskNotStartedAlarm");
  const armBody = module_.slice(armIndex, module_.indexOf("async function displayTaskNotStartedNotification"));
  assert.ok(armBody.includes("} catch (error) {"));

  const displayIndex = module_.indexOf("async function displayTaskNotStartedNotification");
  const displayBody = module_.slice(displayIndex, module_.indexOf("export async function cancelTaskNotStartedNotification"));
  assert.ok(displayBody.includes("} catch (error) {"));
});

test("checkpoint (the handler never trusts 'what's current now' for which task to act on): the task id is read directly off THIS notification's own payload, never re-resolved via resolveCurrentTaskState/resolveTaskNotStartedAlert at tap time -- every action is about the exact task the alert was raised for", () => {
  const fnIndex = module_.indexOf("export async function handleTaskNotStartedNotificationEvent");
  const fnBody = module_.slice(fnIndex);
  assert.ok(fnBody.includes("const taskId = typeof data?.taskId === \"string\" ? data.taskId : null;"));
  assert.ok(!fnBody.includes("resolveCurrentTaskState("));
  assert.ok(!fnBody.includes("resolveTaskNotStartedAlert("));
});

test("checkpoint ('התחל משימה' reuses the EXISTING autoStart deep-link convention): deep-links to Task LIVE for the exact alerted task with autoStart: \"1\", never a new start-task mechanism, and cancels the notification first", () => {
  const fnIndex = module_.indexOf("export async function handleTaskNotStartedNotificationEvent");
  const fnBody = module_.slice(fnIndex);
  const branchIndex = fnBody.indexOf("if (actionId === ACTION_NOT_STARTED_START) {");
  const branchBody = fnBody.slice(branchIndex, branchIndex + 250);
  assert.ok(branchBody.includes("await cancelTaskNotStartedNotification();"));
  assert.ok(branchBody.includes('router.push({ pathname: "/tasks/[id]", params: { id: taskId, autoStart: "1" } });'));
});

test("checkpoint ('אני צריך פעולה תומכת' opens the supportive-action flow route for this exact task, never auto-starting anything)", () => {
  const fnIndex = module_.indexOf("export async function handleTaskNotStartedNotificationEvent");
  const fnBody = module_.slice(fnIndex);
  const branchIndex = fnBody.indexOf("if (actionId === ACTION_NOT_STARTED_SUPPORT) {");
  const branchBody = fnBody.slice(branchIndex, branchIndex + 250);
  assert.ok(branchBody.includes('router.push({ pathname: "/tasks/[id]/supportive-action", params: { id: taskId } });'));
});

test("checkpoint ('סיום או ויתור על המשימה' replicates build/FlexibleDailyScreen.tsx's own handleRemoveForToday exactly): weekly-origin marks only this one date's occurrence removed (never touching the recurring template), one-off deletes the task outright, then re-syncs alarms and this notification -- never a second, competing 'give up on a task' mechanism", () => {
  const fnIndex = module_.indexOf("async function finishOrGiveUpTask");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function handleTaskNotStartedNotificationEvent"));
  assert.ok(fnBody.includes('if (entry.origin === "weekly") {'));
  assert.ok(fnBody.includes("markTaskOccurrenceRemoved(entry.task, entry.occurrenceDateLocal, overrides, now.toISOString())"));
  assert.ok(fnBody.includes("await deleteTask(entry.task.id);"));
  assert.ok(fnBody.includes('await import("./taskAlarm.ts")'), "reconcileTaskAlarms is imported dynamically here specifically to avoid a static circular import with data/taskAlarm.ts, which itself imports this module's own event handler");
  assert.ok(fnBody.includes("await recomputeTaskNotStartedNotification(now);"));
});

test("checkpoint (a bare body tap opens the task itself, never auto-starting it): EventType.PRESS with no actionId pushes to /tasks/[id] with no autoStart param", () => {
  const fnIndex = module_.indexOf("export async function handleTaskNotStartedNotificationEvent");
  const fnBody = module_.slice(fnIndex);
  const tailIndex = fnBody.lastIndexOf('router.push({ pathname: "/tasks/[id]"');
  const tail = fnBody.slice(tailIndex, tailIndex + 120);
  assert.ok(!tail.includes("autoStart"));
});

test("checkpoint (never a second onBackgroundEvent/onForegroundEvent registration): data/taskAlarm.ts's own shared handleTaskAlarmEvent dispatches data.kind === 'taskNotStarted' into this module's own handler", () => {
  assert.ok(taskAlarmModule.includes('import { handleTaskNotStartedNotificationEvent, recomputeTaskNotStartedNotification } from "./taskNotStartedNotification.ts";'));
  const dispatchIndex = taskAlarmModule.indexOf('if (data.kind === "taskNotStarted") {');
  assert.ok(dispatchIndex >= 0);
  const dispatchBody = taskAlarmModule.slice(dispatchIndex, dispatchIndex + 150);
  assert.ok(dispatchBody.includes("await handleTaskNotStartedNotificationEvent(event);"));
});

test("checkpoint (the armed trigger's own fire is handled inside the ONE registered foreground service, never a second one): registerTaskAlarmForegroundService gates data.kind === 'taskNotStartedArm' straight into recomputeTaskNotStartedNotification, never duplicating the busy-check inline, and cleans up its own silent placeholder notification before stopping", () => {
  const registerIndex = taskAlarmModule.indexOf("export function registerTaskAlarmForegroundService");
  const registerBody = taskAlarmModule.slice(registerIndex, taskAlarmModule.indexOf("export function endForegroundServiceForId"));
  assert.ok(registerBody.includes('const isTaskNotStartedArm = notification.data?.kind === "taskNotStartedArm";'));
  const branchIndex = registerBody.indexOf("if (isTaskNotStartedArm) {");
  assert.ok(branchIndex >= 0);
  const branchBody = registerBody.slice(branchIndex, branchIndex + 300);
  assert.ok(branchBody.includes("recomputeTaskNotStartedNotification(new Date())"));
  assert.ok(branchBody.includes("await notifee.cancelNotification(notificationId)"));
  assert.ok(branchBody.includes("stop();"));
});

test("checkpoint (settings toggle wiring): the ARC Reminders settings screen reads/writes taskNotStartedNotificationEnabled and re-runs recomputeTaskNotStartedNotification on change, same convention as every other independent toggle there", () => {
  const settingsScreen = readSource("build/ArcRemindersSettingsScreen.tsx");
  assert.match(settingsScreen, /import \{ recomputeTaskNotStartedNotification \} from "\.\.\/data\/taskNotStartedNotification\.ts";/);
  assert.ok(settingsScreen.includes("settings.taskNotStartedNotificationEnabled"));
  assert.ok(settingsScreen.includes("update({ taskNotStartedNotificationEnabled: value })"));
  assert.ok(settingsScreen.includes("await recomputeTaskNotStartedNotification();"));
});

test("checkpoint (mutation-site wiring): build/FlexibleDailyScreen.tsx's reload() -- the one function every add/remove/reorder mutation already funnels through -- recomputes this notification for today's own schedule", () => {
  const flexibleScreen = readSource("build/FlexibleDailyScreen.tsx");
  assert.match(flexibleScreen, /import \{ recomputeTaskNotStartedNotification \} from "\.\.\/data\/taskNotStartedNotification\.ts";/);
  assert.ok(flexibleScreen.includes("void recomputeTaskNotStartedNotification();"));
});

test("checkpoint (Task LIVE wiring): performStart() retires this notification the instant a task is genuinely started (any kind), and handleComplete()'s own two recomputeTaskTransitionNotification call sites are each paired with a matching recomputeTaskNotStartedNotification call", () => {
  const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
  assert.match(activeTaskScreen, /import \{ recomputeTaskNotStartedNotification \} from "\.\.\/data\/taskNotStartedNotification\.ts";/);
  const performStartIndex = activeTaskScreen.indexOf("async function performStart()");
  const performStartBody = activeTaskScreen.slice(performStartIndex, performStartIndex + 700);
  assert.ok(performStartBody.includes("void recomputeTaskNotStartedNotification();"));
  const pairedOccurrences = activeTaskScreen.split("await recomputeTaskTransitionNotification(task.id);\n    await recomputeTaskNotStartedNotification();").length - 1;
  assert.equal(pairedOccurrences, 2, "both handleComplete()-area call sites must be paired");
});
