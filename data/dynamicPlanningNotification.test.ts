import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/dynamicPlanningNotification.test.ts
 *
 * ARCHI -- Rolling Dynamic Planning task: source-text regression guard
 * for this module's notifee-backed reminder (notifee isn't callable
 * from a plain `node --test` run -- importing this module at all pulls
 * in @notifee/react-native and expo-router, which pull in react-native
 * itself -- same convention as every other notification module in this
 * app, see data/taskNotStartedNotification.test.ts).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/dynamicPlanningNotification.ts");
const taskAlarmModule = readSource("data/taskAlarm.ts");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const flexibleDailyScreen = readSource("build/FlexibleDailyScreen.tsx");
const moveConfirmScreen = readSource("live/TaskMoveConfirmationScreen.tsx");

test("the real, displayed notification uses ONE fixed, deterministic id -- re-displaying structurally replaces any previous one, never stacking a second", () => {
  assert.match(module_, /export const DYNAMIC_PLANNING_NOTIFICATION_ID = "archi-dynamic-planning-notification";/);
  const fnIndex = module_.indexOf("async function displayDynamicPlanningNotification");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function recomputeDynamicPlanningNotification"));
  assert.ok(fnBody.includes("id: DYNAMIC_PLANNING_NOTIFICATION_ID,"));
});

test("reuses the EXISTING task-not-started channel/infrastructure -- never a new notification channel", () => {
  assert.match(
    module_,
    /import \{ ALARM_FOREGROUND_SERVICE_TYPES, ensureNotifeePermissionAsync, ensureTaskNotStartedChannelAsync, SILENT_DELIVERY_CHANNEL_ID, TASK_NOT_STARTED_CHANNEL_ID \} from "\.\/alarmChannel\.ts";/
  );
  const fnIndex = module_.indexOf("async function displayDynamicPlanningNotification");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function recomputeDynamicPlanningNotification"));
  assert.ok(fnBody.includes("channelId: TASK_NOT_STARTED_CHANNEL_ID,"));
  assert.ok(fnBody.includes("await ensureTaskNotStartedChannelAsync();"));
});

test("never auto-dismisses and never repeats the alert sound on a redisplay for the same still-due decision -- autoCancel: false, onlyAlertOnce: true", () => {
  const fnIndex = module_.indexOf("async function displayDynamicPlanningNotification");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function recomputeDynamicPlanningNotification"));
  assert.ok(fnBody.includes("onlyAlertOnce: true,"));
  assert.ok(fnBody.includes("autoCancel: false,"));
});

test("exactly two actions (edit/skip), with a bare body tap doing the same thing as a plain tap (android.pressAction default)", () => {
  const fnIndex = module_.indexOf("async function displayDynamicPlanningNotification");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function recomputeDynamicPlanningNotification"));
  assert.ok(fnBody.includes("pressAction: { id: \"default\" },"));
  const actionsIndex = fnBody.indexOf("actions: [");
  const actionsBlock = fnBody.slice(actionsIndex, fnBody.indexOf("],", actionsIndex) + 2);
  assert.equal(actionsBlock.split("pressAction:").length - 1, 2, "exactly two buttons -- edit and skip, never a third");
  assert.ok(actionsBlock.includes("pressAction: { id: ACTION_DYNAMIC_PLANNING_EDIT }"));
  assert.ok(actionsBlock.includes("pressAction: { id: ACTION_DYNAMIC_PLANNING_SKIP }"));
});

test("the edit action's own label depends on whether a To-Do is already woven into the gap (confirm_next_todo) or nothing has been queued yet (plan_gap) -- never a fixed, one-size label", () => {
  const fnIndex = module_.indexOf("async function displayDynamicPlanningNotification");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function recomputeDynamicPlanningNotification"));
  assert.ok(fnBody.includes('decision.action === "confirm_next_todo" ? "ערוך זמנים" : "תכנן את הזמן"'));
});

test("buildDynamicPlanningBody: confirm_next_todo names the preceding fixed task AND the already-woven To-Do candidate, with its suggested start/duration, never a fabricated name", () => {
  const fnIndex = module_.indexOf("export function buildDynamicPlanningBody");
  const fnBody = module_.slice(fnIndex, module_.indexOf("async function displayDynamicPlanningNotification"));
  assert.ok(fnBody.includes('const header = `"${decision.precedingEntry.task.title}" עומדת להתחיל.`;'));
  assert.ok(fnBody.includes('decision.action === "confirm_next_todo" && decision.candidate && window'));
  assert.ok(fnBody.includes("const suggestedStart = formatMinutesToClockTime(window.startMinutes);"));
  assert.ok(fnBody.includes('return `${header}\\n\\nאחריה מתוכננת "${decision.candidate.task.title}" ב-${suggestedStart}, למשך ${suggestedDuration} דקות.`;'));
});

test("buildDynamicPlanningBody: plan_gap (nothing woven yet) asks the open planning question instead, with an open-ended window worded as 'זמן פתוח' rather than a fabricated duration", () => {
  const fnIndex = module_.indexOf("export function buildDynamicPlanningBody");
  const fnBody = module_.slice(fnIndex, module_.indexOf("async function displayDynamicPlanningNotification"));
  assert.ok(fnBody.includes('const durationText = window && window.durationMinutes !== null ? `${window.durationMinutes} דקות` : "זמן פתוח";'));
  assert.ok(fnBody.includes("רוצה לתכנן מה לעשות בזמן הזה?"));
});

test("the 5-minute lead time is a named constant, reused from resolveReminderFireDate against the preceding entry's own effectiveStartTime -- the same arm-math every sibling 5-minutes-before reminder here already uses", () => {
  assert.match(module_, /const REMINDER_LEAD_MINUTES = 5;/);
  const fnIndex = module_.indexOf("function resolveReminderFireDate");
  const fnBody = module_.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("startDate.getTime() - REMINDER_LEAD_MINUTES * 60 * 1000"));
  const startFnIndex = module_.indexOf("function resolveEntryStartDate");
  const startFnBody = module_.slice(startFnIndex, startFnIndex + 500);
  assert.ok(startFnBody.includes("decision.precedingEntry.effectiveStartTime"));
});

test("armDynamicPlanningAlarm cancels any previous arm FIRST, then picks the SOONEST still-future decision's own (start - 5min) moment -- never more than one armed at a time", () => {
  const fnIndex = module_.indexOf("async function armDynamicPlanningAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 1800);
  assert.ok(fnBody.includes("await cancelArmedDynamicPlanningAlarm();"));
  assert.ok(fnBody.includes("if (!fireAt || fireAt.getTime() <= now.getTime()) continue;"));
  assert.ok(fnBody.includes("if (!soonest || fireAt.getTime() < soonest.fireAt.getTime()) soonest = { decision, fireAt };"));
  assert.ok(fnBody.includes("if (!soonest) return;"));
});

test("the arm is a SILENT placeholder -- the exact SILENT_DELIVERY_CHANNEL_ID/foreground-service/alarm-clock trigger pattern every sibling arm here already uses, carrying its own data.kind for taskAlarm.ts's dispatcher -- the real decision is re-derived fresh at fire time, never trusted stale", () => {
  const fnIndex = module_.indexOf("async function armDynamicPlanningAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 1800);
  assert.ok(fnBody.includes("id: DYNAMIC_PLANNING_ARM_ID,"));
  assert.ok(fnBody.includes('data: { kind: "dynamicPlanningArm" },'));
  assert.ok(fnBody.includes("channelId: SILENT_DELIVERY_CHANNEL_ID,"));
  assert.ok(fnBody.includes("asForegroundService: true,"));
  assert.ok(fnBody.includes("foregroundServiceTypes: ALARM_FOREGROUND_SERVICE_TYPES,"));
  assert.ok(fnBody.includes("type: TriggerType.TIMESTAMP,"));
  assert.ok(fnBody.includes("alarmManager: { type: AlarmType.SET_ALARM_CLOCK },"));
});

test("never throws: a failed native call anywhere (arm or display) is caught and logged, never crashing the caller", () => {
  const armIndex = module_.indexOf("async function armDynamicPlanningAlarm");
  const armBody = module_.slice(armIndex, module_.indexOf("async function displayDynamicPlanningNotification"));
  assert.ok(armBody.includes("} catch (error) {"));
  const displayIndex = module_.indexOf("async function displayDynamicPlanningNotification");
  const displayBody = module_.slice(displayIndex, module_.indexOf("export async function recomputeDynamicPlanningNotification"));
  assert.ok(displayBody.includes("} catch (error) {"));
});

test("required (never a useless planning notification while a task is active): recomputeDynamicPlanningNotification's own busy gate reuses hasActiveTaskConflict and cancels BOTH the real notification and the armed placeholder when busy, before doing any plan resolution at all", () => {
  const fnIndex = module_.indexOf("export async function recomputeDynamicPlanningNotification");
  const fnBody = module_.slice(fnIndex);
  assert.ok(fnBody.includes('const { hasActiveTaskConflict } = await import("./taskAlarm.ts");'));
  assert.ok(fnBody.includes('const busy = await hasActiveTaskConflict("", now);'));
  const busyBranchIndex = fnBody.indexOf("if (busy) {");
  assert.ok(busyBranchIndex >= 0);
  const busyBranchBody = fnBody.slice(busyBranchIndex, busyBranchIndex + 200);
  assert.ok(busyBranchBody.includes("await cancelDynamicPlanningNotification();"));
  assert.ok(busyBranchBody.includes("await cancelArmedDynamicPlanningAlarm();"));
  assert.ok(busyBranchBody.includes("return;"));
});

test("required ('skip' dedup reuses the EXISTING free-time-window dismissal list verbatim, never a second/parallel dismissal mechanism): recomputeDynamicPlanningNotification loads+prunes arc/freeTimeWindowDismissal.ts's own dismissal list and filters today's decisions through isFreeTimeWindowDismissed before arming/displaying anything", () => {
  assert.match(
    module_,
    /import \{ isFreeTimeWindowDismissed, pruneFreeTimeWindowDismissals, recordFreeTimeWindowDismissal \} from "\.\.\/arc\/freeTimeWindowDismissal\.ts";/
  );
  assert.ok(!module_.includes("DynamicPlanningDismissal"), "must never define a second, parallel dismissal type/list for this feature");
  const fnIndex = module_.indexOf("export async function recomputeDynamicPlanningNotification");
  const fnBody = module_.slice(fnIndex);
  assert.ok(fnBody.includes("loadFreeTimeWindowDismissals()"));
  assert.ok(fnBody.includes("const prunedDismissals = pruneFreeTimeWindowDismissals(dismissals, dateLocal);"));
  assert.ok(fnBody.includes("if (prunedDismissals.length !== dismissals.length) await saveFreeTimeWindowDismissals(prunedDismissals);"));
  assert.ok(fnBody.includes("!isFreeTimeWindowDismissed(prunedDismissals, dateLocal, decision.window!)"));
});

test("recomputeDynamicPlanningNotification resolves every fixed entry's own decision fresh via resolveDynamicPlanningActions (never a second, independently-sorted 'what's upcoming' scan), re-arms the soonest one, then shows or cancels the ONE real notification depending on whether anything is genuinely due now", () => {
  assert.match(module_, /import \{ resolveDynamicPlanningActions, resolveDynamicPlanningKey \} from "\.\.\/arc\/dynamicPlanning\.ts";/);
  assert.match(module_, /import \{ resolveTodaysScheduledPlan \} from "\.\/dailyPlan\.ts";/);
  const fnIndex = module_.indexOf("export async function recomputeDynamicPlanningNotification");
  const fnBody = module_.slice(fnIndex);
  assert.ok(fnBody.includes("resolveDynamicPlanningActions(scheduled, todoEntries)"));
  assert.ok(fnBody.includes("await armDynamicPlanningAlarm(decisions, now);"));
  const dueCheckIndex = fnBody.indexOf("if (!due) {");
  assert.ok(dueCheckIndex >= 0);
  const dueCheckBody = fnBody.slice(dueCheckIndex, dueCheckIndex + 150);
  assert.ok(dueCheckBody.includes("await cancelDynamicPlanningNotification();"));
  assert.ok(fnBody.includes("await displayDynamicPlanningNotification(due, dateLocal, now);"));
});

test("a decision only counts as 'due now' once its own (start - 5min) moment has arrived AND its window hasn't already fully elapsed (open-ended windows -- endMinutes null -- never expire this way)", () => {
  const fnIndex = module_.indexOf("export async function recomputeDynamicPlanningNotification");
  const fnBody = module_.slice(fnIndex);
  assert.ok(fnBody.includes("if (!fireAt || fireAt.getTime() > now.getTime()) return false;"));
  assert.ok(fnBody.includes("return window.endMinutes === null || nowMinutes < window.endMinutes;"));
});

test("handleDynamicPlanningAlarmFired (routed from the arm's own fire, data.kind === 'dynamicPlanningArm') re-derives everything fresh via recomputeDynamicPlanningNotification -- never trusts an arm-time snapshot", () => {
  const fnIndex = module_.indexOf("export async function handleDynamicPlanningAlarmFired");
  const fnBody = module_.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("await recomputeDynamicPlanningNotification(now);"));
});

test("required (spec sections 1+2: one action, 'edit', opens the confirm screen -- never a second decision UI): handleDynamicPlanningNotificationEvent routes both the edit action and a bare body tap to /tasks/[id]/plan-next with id = the preceding fixed task, falling back to Home only when no precedingTaskId was carried", () => {
  const fnIndex = module_.indexOf("export async function handleDynamicPlanningNotificationEvent");
  const fnBody = module_.slice(fnIndex);
  assert.ok(fnBody.includes("if (event.type !== EventType.ACTION_PRESS && event.type !== EventType.PRESS) return;"));
  assert.ok(fnBody.includes('router.push({ pathname: "/tasks/[id]/plan-next", params: { id: precedingTaskId } });'));
  assert.ok(fnBody.includes('router.push("/");'));
});

test("required ('skip' records a dismissal for this exact window, reusing the shared dismissal list, then recomputes so a DIFFERENT gap can still be offered): the skip branch cancels both the real notification and its own armed placeholder, calls recordFreeTimeWindowDismissal keyed by (dateLocal, precedingTaskId, followingTaskId), persists it, and recomputes before returning -- never falls through to the edit-routing code below it", () => {
  const fnIndex = module_.indexOf("export async function handleDynamicPlanningNotificationEvent");
  const fnBody = module_.slice(fnIndex);
  const skipBranchIndex = fnBody.indexOf("if (actionId === ACTION_DYNAMIC_PLANNING_SKIP) {");
  assert.ok(skipBranchIndex >= 0);
  const restOfFn = fnBody.slice(skipBranchIndex);
  const skipBranchBody = restOfFn.slice(0, restOfFn.indexOf("\n  }\n\n  await cancelDynamicPlanningNotification();"));
  assert.ok(skipBranchBody.includes("await cancelDynamicPlanningNotification();"));
  assert.ok(skipBranchBody.includes("await cancelArmedDynamicPlanningAlarm();"));
  assert.ok(skipBranchBody.includes("recordFreeTimeWindowDismissal(dismissals, dateLocal, { precedingTaskId, followingTaskId }, new Date().toISOString());"));
  assert.ok(skipBranchBody.includes("await saveFreeTimeWindowDismissals(updated);"));
  assert.ok(skipBranchBody.includes("await recomputeDynamicPlanningNotification(new Date());"));
  assert.ok(skipBranchBody.includes("return;"));
});

test("checkpoint (never a second onBackgroundEvent/onForegroundEvent registration): data/taskAlarm.ts's own shared handleTaskAlarmEvent dispatches data.kind === 'dynamicPlanning' into this module's own handler", () => {
  assert.ok(taskAlarmModule.includes('import { handleDynamicPlanningAlarmFired, handleDynamicPlanningNotificationEvent } from "./dynamicPlanningNotification.ts";'));
  const dispatchIndex = taskAlarmModule.indexOf('if (data.kind === "dynamicPlanning") {');
  assert.ok(dispatchIndex >= 0);
  const dispatchBody = taskAlarmModule.slice(dispatchIndex, dispatchIndex + 150);
  assert.ok(dispatchBody.includes("await handleDynamicPlanningNotificationEvent(event);"));
});

test("checkpoint (the armed trigger's own fire is handled inside the ONE registered foreground service, never a second one): registerTaskAlarmForegroundService gates data.kind === 'dynamicPlanningArm' straight into handleDynamicPlanningAlarmFired, then cancels its own silent placeholder before stopping", () => {
  const registerIndex = taskAlarmModule.indexOf("export function registerTaskAlarmForegroundService");
  const registerBody = taskAlarmModule.slice(registerIndex, taskAlarmModule.indexOf("export function endForegroundServiceForId"));
  assert.ok(registerBody.includes('const isDynamicPlanningArm = notification.data?.kind === "dynamicPlanningArm";'));
  const branchIndex = registerBody.indexOf("if (isDynamicPlanningArm) {");
  assert.ok(branchIndex >= 0);
  const branchBody = registerBody.slice(branchIndex, branchIndex + 300);
  assert.ok(branchBody.includes("handleDynamicPlanningAlarmFired(new Date())"));
  assert.ok(branchBody.includes("await notifee.cancelNotification(notificationId).catch(() => {});"));
  assert.ok(branchBody.includes("stop();"));
});

test("checkpoint (mutation-site wiring, Task LIVE): live/ActiveTaskScreen.tsx recomputes this notification on performStart (fire-and-forget, same convention as its sibling recomputeFreeTimeWindowNotification call right above it) and on both handleComplete-area sites, each paired right after recomputeReplanTimeNotification", () => {
  assert.match(activeTaskScreen, /import \{ recomputeDynamicPlanningNotification \} from "\.\.\/data\/dynamicPlanningNotification\.ts";/);
  assert.ok(activeTaskScreen.includes("void recomputeDynamicPlanningNotification();"));
  const pairedOccurrences = activeTaskScreen.split(
    "await recomputeFreeTimeWindowNotification();\n    await recomputeReplanTimeNotification();\n    await recomputeDynamicPlanningNotification();"
  ).length - 1;
  assert.equal(pairedOccurrences, 2, "both handleComplete()-area call sites must end with this exact sequence");
});

test("checkpoint (mutation-site wiring, Flexible Daily Schedule): build/FlexibleDailyScreen.tsx's reload() -- the one function every add/remove/reorder/retime mutation already funnels through -- recomputes this notification for today's own schedule, satisfying the feature's own full-sync requirement for free", () => {
  assert.match(flexibleDailyScreen, /import \{ recomputeDynamicPlanningNotification \} from "\.\.\/data\/dynamicPlanningNotification\.ts";/);
  assert.ok(flexibleDailyScreen.includes("void recomputeDynamicPlanningNotification();"));
});

test("checkpoint (mutation-site wiring, move-confirm): live/TaskMoveConfirmationScreen.tsx's handleApplyMove recomputes this notification after reconciling alarms -- a replan that moves a fixed task out of its old slot must not leave a stale planning prompt armed for it", () => {
  assert.match(moveConfirmScreen, /import \{ recomputeDynamicPlanningNotification \} from "\.\.\/data\/dynamicPlanningNotification\.ts";/);
  assert.ok(moveConfirmScreen.includes("await recomputeDynamicPlanningNotification(now);"));
});

test("this module never writes to any Task itself -- confirming (the real conversion of a To-Do into a fixed, daily-only anchor) is exclusively live/DynamicPlanningConfirmScreen.tsx's own job via upsertTask, never performed from inside a notification handler", () => {
  assert.ok(!module_.includes("upsertTask"));
});
