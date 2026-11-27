import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/replanTimeNotification.test.ts
 *
 * ARCHI -- Replan Time task: source-text regression guard for this
 * module's notifee-backed notification (notifee isn't callable under a
 * plain `node --test` run, same convention as every other notification
 * module in this app -- see data/taskNotStartedNotification.test.ts).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/replanTimeNotification.ts");
const alarmChannelModule = readSource("data/alarmChannel.ts");
const taskAlarmModule = readSource("data/taskAlarm.ts");

test("the real, user-facing notification uses ONE fixed, deterministic id -- re-displaying structurally replaces any previous one, never stacking a second one", () => {
  assert.match(module_, /const REPLAN_TIME_NOTIFICATION_ID = "archi-replan-time-notification";/);
  const fnIndex = module_.indexOf("async function displayReplanTimeNotification");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("id: REPLAN_TIME_NOTIFICATION_ID,"));
});

test("required: the exact title/body/button wording from the spec, verbatim", () => {
  assert.match(module_, /const REPLAN_TIME_TITLE = "תכנון זמן מחדש";/);
  assert.match(module_, /const REPLAN_TIME_BODY = "הזמן שהוקצה למשימה עבר\. רוצה להתאים את התכנון להמשך היום\?";/);
  assert.match(module_, /const REPLAN_TIME_ACTION_TITLE = "תכנן זמן מחדש";/);
});

test("reuses the EXISTING task-not-started channel/infrastructure -- never a new notification channel, per the spec's own explicit 'reuse existing infra' requirement", () => {
  assert.match(module_, /import \{ ALARM_FOREGROUND_SERVICE_TYPES, ensureNotifeePermissionAsync, ensureTaskNotStartedChannelAsync, SILENT_DELIVERY_CHANNEL_ID, TASK_NOT_STARTED_CHANNEL_ID \} from "\.\/alarmChannel\.ts";/);
  assert.ok(!module_.includes("ensureReplanTime"), "must never define a second, parallel channel-ensure function");
  const fnIndex = module_.indexOf("async function displayReplanTimeNotification");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function cancelReplanTimeNotification"));
  assert.ok(fnBody.includes("channelId: TASK_NOT_STARTED_CHANNEL_ID,"));
  assert.ok(fnBody.includes("await ensureTaskNotStartedChannelAsync();"));
});

test("never auto-dismisses quickly: autoCancel: false, with no setTimeout-based self-cancel", () => {
  const fnIndex = module_.indexOf("async function displayReplanTimeNotification");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function cancelReplanTimeNotification"));
  assert.ok(fnBody.includes("autoCancel: false,"));
  assert.ok(!fnBody.includes("setTimeout"));
});

test("never repeats the alert sound on a redisplay for the same still-due task -- enforced via onlyAlertOnce, never a manually-tracked flag", () => {
  const fnIndex = module_.indexOf("async function displayReplanTimeNotification");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function cancelReplanTimeNotification"));
  assert.ok(fnBody.includes("onlyAlertOnce: true,"));
});

test("required: exactly ONE action, with the exact required title, and a bare body tap (android.pressAction default) doing the same thing -- 'לחיצה על הכפתור או על גוף ההתראה תפתח את מסך התכנון מחדש'", () => {
  const fnIndex = module_.indexOf("async function displayReplanTimeNotification");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function cancelReplanTimeNotification"));
  assert.ok(fnBody.includes("pressAction: { id: \"default\" },"));
  assert.ok(fnBody.includes('actions: [{ title: REPLAN_TIME_ACTION_TITLE, pressAction: { id: ACTION_REPLAN_TIME } }],'));
  const actionsIndex = fnBody.indexOf("actions: [");
  const actionsBlock = fnBody.slice(actionsIndex, fnBody.indexOf("],", actionsIndex) + 2);
  assert.equal(actionsBlock.split("pressAction:").length - 1, 1, "the actions ARRAY itself holds exactly one entry -- never a second button");
  assert.equal((fnBody.match(/title: REPLAN_TIME_ACTION_TITLE/g) ?? []).length, 1, "exactly one visible action -- never a second button");
});

test("the one pure predicate (arc/replanTimeAlert.ts's resolveReplanTimeAlert) is the ONLY busy-check -- recomputeReplanTimeNotification adds no second, competing 'is this task overdue' computation", () => {
  assert.match(module_, /import \{ resolveReplanTimeAlert \} from "\.\.\/arc\/replanTimeAlert\.ts";/);
  const fnIndex = module_.indexOf("export async function recomputeReplanTimeNotification");
  const fnBody = module_.slice(fnIndex);
  assert.ok(fnBody.includes("const due = resolveReplanTimeAlert(scheduled, now, activeRun);"));
});

test("built on the Flexible Daily Schedule, never the raw weekly routine: scheduled comes from resolveTodaysScheduledPlan, the exact same IO pipeline every other sync-fixed consumer in this codebase already shares", () => {
  assert.match(module_, /import \{ resolveTodaysScheduledPlan \} from "\.\/dailyPlan\.ts";/);
  const fnIndex = module_.indexOf("export async function recomputeReplanTimeNotification");
  const fnBody = module_.slice(fnIndex);
  assert.ok(fnBody.includes("resolveTodaysScheduledPlan(now)"));
});

test("required (section 4, 'never while performing an active task' + 'never duplicate for the same task'): never leaves a stale notification once nothing is overdue -- when resolveReplanTimeAlert returns null, the real notification is cancelled unconditionally; this is also what satisfies 'cancel notifications made irrelevant by a replan or by completing the task'", () => {
  const fnIndex = module_.indexOf("export async function recomputeReplanTimeNotification");
  const fnBody = module_.slice(fnIndex);
  const dueCheckIndex = fnBody.indexOf("if (!due) {");
  assert.ok(dueCheckIndex >= 0);
  const dueCheckBody = fnBody.slice(dueCheckIndex, dueCheckIndex + 150);
  assert.ok(dueCheckBody.includes("await cancelReplanTimeNotification();"));
});

test("re-arms the native trigger for whichever entry will go overdue next -- resolveCurrentTaskState's own `current` (already started) when one exists, else `next` (not yet started) -- never a second, independently-sorted 'what's upcoming' scan", () => {
  assert.match(module_, /import \{ resolveCurrentTaskState \} from "\.\.\/arc\/dailyPlan\.ts";/);
  const fnIndex = module_.indexOf("async function armNextReplanTimeAlarm");
  const fnBody = module_.slice(fnIndex, module_.indexOf("async function displayReplanTimeNotification"));
  assert.ok(fnBody.includes("const { current, next } = resolveCurrentTaskState(scheduled, now, activeRun, null);"));
  assert.ok(fnBody.includes("const target = current ?? next;"));
  assert.ok(fnBody.includes("await cancelArmedReplanTimeAlarm();"), "must always clear any previous arm before re-arming -- never a second, stacked trigger");
});

test("arms against the target entry's own effectiveENDTime (when the window would elapse), never its start time -- the whole point of this feature versus the existing task-not-started alarm", () => {
  const fnIndex = module_.indexOf("function resolveEntryEndDate");
  const fnBody = module_.slice(fnIndex, module_.indexOf("async function cancelArmedReplanTimeAlarm"));
  assert.ok(fnBody.includes("entry.effectiveEndTime"));
  assert.ok(!fnBody.includes("entry.effectiveStartTime"));
  const armFnIndex = module_.indexOf("async function armNextReplanTimeAlarm");
  const armFnBody = module_.slice(armFnIndex, module_.indexOf("async function displayReplanTimeNotification"));
  assert.ok(armFnBody.includes("const fireAt = resolveEntryEndDate(target, now);"));
});

test("the armed trigger is a real notifee TriggerNotification (TIMESTAMP + SET_ALARM_CLOCK) on the generic SILENT_DELIVERY_CHANNEL_ID placeholder -- a direct sibling of data/taskAlarm.ts's own ARC-alarm section, never a fixed polling interval and never the loud task-alarm channel, so this fires even with the app fully closed", () => {
  const fnIndex = module_.indexOf("async function armNextReplanTimeAlarm");
  const fnBody = module_.slice(fnIndex, module_.indexOf("async function displayReplanTimeNotification"));
  assert.ok(fnBody.includes("type: TriggerType.TIMESTAMP,"));
  assert.ok(fnBody.includes("alarmManager: { type: AlarmType.SET_ALARM_CLOCK },"));
  assert.ok(fnBody.includes("channelId: SILENT_DELIVERY_CHANNEL_ID,"));
  assert.ok(fnBody.includes("asForegroundService: true,"));
  assert.ok(fnBody.includes("foregroundServiceTypes: ALARM_FOREGROUND_SERVICE_TYPES,"));
  assert.ok(fnBody.includes('data: { kind: "replanTimeArm" },'));
});

test("never throws: a failed native call anywhere (display or arm) is caught and logged, never crashing the caller -- same honest-failure discipline as every other notification module", () => {
  const armIndex = module_.indexOf("async function armNextReplanTimeAlarm");
  const armBody = module_.slice(armIndex, module_.indexOf("async function displayReplanTimeNotification"));
  assert.ok(armBody.includes("} catch (error) {"));

  const displayIndex = module_.indexOf("async function displayReplanTimeNotification");
  const displayBody = module_.slice(displayIndex, module_.indexOf("export async function cancelReplanTimeNotification"));
  assert.ok(displayBody.includes("} catch (error) {"));
});

test("required: both the one action and a bare body tap cancel the notification, then open the Replan screen (no params -- the screen resolves its own target task fresh, never trusting stale alarm-time data)", () => {
  const fnIndex = module_.indexOf("export async function handleReplanTimeNotificationEvent");
  const fnBody = module_.slice(fnIndex);
  assert.ok(fnBody.includes("await cancelReplanTimeNotification();"));
  assert.ok(fnBody.includes('router.push("/replan-time");'));
  assert.ok(fnBody.includes("if (event.type !== EventType.ACTION_PRESS && event.type !== EventType.PRESS) return;"), "both the action press and the bare body tap reach the same cancel+push, never two separate branches that could diverge");
});

test("checkpoint (never a second onBackgroundEvent/onForegroundEvent registration): data/taskAlarm.ts's own shared handleTaskAlarmEvent dispatches data.kind === 'replanTime' into this module's own handler", () => {
  assert.ok(taskAlarmModule.includes('import { handleReplanTimeNotificationEvent, recomputeReplanTimeNotification } from "./replanTimeNotification.ts";'));
  const dispatchIndex = taskAlarmModule.indexOf('if (data.kind === "replanTime") {');
  assert.ok(dispatchIndex >= 0);
  const dispatchBody = taskAlarmModule.slice(dispatchIndex, dispatchIndex + 150);
  assert.ok(dispatchBody.includes("await handleReplanTimeNotificationEvent(event);"));
});

test("checkpoint (the armed trigger's own fire is handled inside the ONE registered foreground service, never a second one): registerTaskAlarmForegroundService gates data.kind === 'replanTimeArm' straight into recomputeReplanTimeNotification, never duplicating the busy-check inline, and cleans up its own silent placeholder notification before stopping", () => {
  const registerIndex = taskAlarmModule.indexOf("export function registerTaskAlarmForegroundService");
  const registerBody = taskAlarmModule.slice(registerIndex, taskAlarmModule.indexOf("export function endForegroundServiceForId"));
  assert.ok(registerBody.includes('const isReplanTimeArm = notification.data?.kind === "replanTimeArm";'));
  const branchIndex = registerBody.indexOf("if (isReplanTimeArm) {");
  assert.ok(branchIndex >= 0);
  const branchBody = registerBody.slice(branchIndex, branchIndex + 300);
  assert.ok(branchBody.includes("recomputeReplanTimeNotification(new Date())"));
  assert.ok(branchBody.includes("await notifee.cancelNotification(notificationId)"));
  assert.ok(branchBody.includes("stop();"));
});

test("checkpoint (mutation-site wiring): build/FlexibleDailyScreen.tsx's reload() -- the one function every add/remove/reorder/retime mutation already funnels through -- recomputes this notification for today's own schedule, satisfying spec section 5's full sync requirement for free", () => {
  const flexibleScreen = readSource("build/FlexibleDailyScreen.tsx");
  assert.match(flexibleScreen, /import \{ recomputeReplanTimeNotification \} from "\.\.\/data\/replanTimeNotification\.ts";/);
  assert.ok(flexibleScreen.includes("void recomputeReplanTimeNotification();"));
});

test("checkpoint (Task LIVE wiring): performStart() retires this notification the instant a task is genuinely started (any kind), and handleComplete()'s own two recomputeTaskTransitionNotification call sites each end with a matching recomputeReplanTimeNotification call -- placed LAST in each site, after recomputeTaskMemoryReminderNotification/recomputeFreeTimeWindowNotification, so the existing adjacent 'recomputeTaskNotStartedNotification -> recomputeTaskMemoryReminderNotification' pair (data/taskMemoryReminderNotification.test.ts's own checkpoint) stays byte-identical", () => {
  const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
  assert.match(activeTaskScreen, /import \{ recomputeReplanTimeNotification \} from "\.\.\/data\/replanTimeNotification\.ts";/);
  const performStartIndex = activeTaskScreen.indexOf("async function performStart()");
  const performStartBody = activeTaskScreen.slice(performStartIndex, performStartIndex + 1000);
  assert.ok(performStartBody.includes("void recomputeReplanTimeNotification();"));
  const pairedOccurrences = activeTaskScreen.split("await recomputeTaskMemoryReminderNotification();\n    await recomputeFreeTimeWindowNotification();\n    await recomputeReplanTimeNotification();").length - 1;
  assert.equal(pairedOccurrences, 2, "both handleComplete()-area call sites must end with this exact sequence");
});

test("checkpoint (move-confirm wiring): applying a move re-syncs this notification -- a replan that moves the overdue task out of its old slot must not leave a stale alert for it", () => {
  const moveConfirmScreen = readSource("live/TaskMoveConfirmationScreen.tsx");
  assert.match(moveConfirmScreen, /import \{ recomputeReplanTimeNotification \} from "\.\.\/data\/replanTimeNotification\.ts";/);
  assert.ok(moveConfirmScreen.includes("await recomputeReplanTimeNotification(now);"));
});

test("checkpoint ('סיום או ויתור על המשימה' on the EXISTING task-not-started notification also re-syncs this one): finishOrGiveUpTask in data/taskNotStartedNotification.ts dynamically imports and calls recomputeReplanTimeNotification -- giving up on an overdue task must retire this notification too, never left stale", () => {
  const taskNotStartedModule = readSource("data/taskNotStartedNotification.ts");
  const fnIndex = taskNotStartedModule.indexOf("async function finishOrGiveUpTask");
  const fnBody = taskNotStartedModule.slice(fnIndex, taskNotStartedModule.indexOf("export async function handleTaskNotStartedNotificationEvent"));
  assert.ok(fnBody.includes('await import("./replanTimeNotification.ts")'));
  assert.ok(fnBody.includes("await recomputeReplanTimeNotification(now);"));
});

test("required: this module never imports or touches data/taskNotStartedNotification.ts's own notification id/channel-ensure call directly -- the two notifications are built as independent siblings, never merged into one, per the plan's own architecture decision", () => {
  assert.ok(!module_.includes("TASK_NOT_STARTED_NOTIFICATION_ID"));
  assert.ok(!module_.includes('from "./taskNotStartedNotification.ts"'));
});
