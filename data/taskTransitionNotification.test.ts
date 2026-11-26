import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/taskTransitionNotification.test.ts
 *
 * ARC Reminders task, requirement 5/6.3/6.4: source-text regression
 * guard for this module's notifee-backed notification (notifee isn't
 * callable under a plain `node --test` run, same convention as every
 * other notification module in this app -- see
 * data/emotionalCheckInNotification.test.ts).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/taskTransitionNotification.ts");
const alarmChannelModule = readSource("data/alarmChannel.ts");
const taskAlarmModule = readSource("data/taskAlarm.ts");
const dailyPlanModule = readSource("data/dailyPlan.ts");

test("the notification uses ONE fixed, deterministic id -- re-displaying structurally replaces any previous one, never stacking a second one", () => {
  assert.match(module_, /const TASK_TRANSITION_NOTIFICATION_ID = "archi-task-transition-notification";/);
  const fnIndex = module_.indexOf("export async function recomputeTaskTransitionNotification");
  const fnBody = module_.slice(fnIndex, fnIndex + 1800);
  assert.ok(fnBody.includes("id: TASK_TRANSITION_NOTIFICATION_ID,"));
});

test("posted to its OWN dedicated channel -- HIGH importance (heads-up) but never bypassDnd/sound, so it respects Do Not Disturb like every reminder except the real task-start alarm", () => {
  assert.match(alarmChannelModule, /export const TASK_TRANSITION_CHANNEL_ID = "archi-task-transition-v1";/);
  const channelFnIndex = alarmChannelModule.indexOf("export async function ensureTaskTransitionChannelAsync");
  const channelFnBody = alarmChannelModule.slice(channelFnIndex, channelFnIndex + 400);
  assert.ok(channelFnBody.includes("importance: AndroidImportance.HIGH,"));
  assert.ok(!channelFnBody.includes("bypassDnd"), "must respect Do Not Disturb");
  assert.ok(!channelFnBody.includes("sound:"), "must not force a custom alarm sound");
  assert.ok(module_.includes("ensureTaskTransitionChannelAsync()"));
  assert.ok(!module_.includes("TASK_ALARM_CHANNEL_ID"), "must never post to the real task-alarm channel");
});

test("never an alarm, never ongoing-pinned: no fullScreenAction/AlarmType/asForegroundService/ongoing anywhere in the display call -- a normal, swipe-dismissible notification per the spec's own explicit instruction", () => {
  const fnIndex = module_.indexOf("export async function recomputeTaskTransitionNotification");
  const fnBody = module_.slice(fnIndex, fnIndex + 1800);
  assert.ok(!fnBody.includes("fullScreenAction"));
  assert.ok(!fnBody.includes("AlarmType"));
  assert.ok(!fnBody.includes("asForegroundService"));
  assert.ok(!fnBody.includes("ongoing:"));
  assert.ok(fnBody.includes("autoCancel: true,"));
});

test("lock-screen content hiding is its own independent toggle: visibility is PRIVATE when hideContentOnLockScreen is set, PUBLIC otherwise -- never hardcoded either way", () => {
  const fnIndex = module_.indexOf("export async function recomputeTaskTransitionNotification");
  const fnBody = module_.slice(fnIndex, fnIndex + 1800);
  assert.ok(fnBody.includes("visibility: settings.hideContentOnLockScreen ? AndroidVisibility.PRIVATE : AndroidVisibility.PUBLIC,"));
});

test("SyncFix2 (next-task desync bug): loadRealActiveRunForTransition loads the real, persisted TaskTimerRun and excludes a rest/break run (which has no task-identity cross-check role here), threading the result into BOTH recomputeTaskTransitionNotification and the tap handler -- never a hardcoded null, which would let a different task's stale leftover status==='active' field hijack the 'current' slot this notification's own mantra names", () => {
  const helperIndex = module_.indexOf("async function loadRealActiveRunForTransition()");
  const helperBody = module_.slice(helperIndex, module_.indexOf("\n}", helperIndex));
  assert.ok(helperBody.includes("const run = await loadTaskTimerRun();"));
  assert.ok(helperBody.includes('return run && run.kind !== "rest" ? run : null;'));
});

test("content comes from the ONE shared (current, next) resolver -- never a second, re-derived 'what's current/next' computation -- and the body is rendered by the ONE shared mantra function", () => {
  assert.match(module_, /import \{ resolveCurrentAndNextTaskForTransition \} from "\.\/dailyPlan\.ts";/);
  assert.match(module_, /import \{ ALL_DONE_TRANSITION_MANTRA, resolveTransitionMantra \} from "\.\.\/arc\/taskTransitionMantra\.ts";/);
  const fnIndex = module_.indexOf("export async function recomputeTaskTransitionNotification");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function cancelTaskTransitionNotification"));
  assert.ok(fnBody.includes("const { current, next } = await resolveCurrentAndNextTaskForTransition(null, now, await loadRealActiveRunForTransition());"));
  assert.ok(fnBody.includes("const body = resolveTransitionMantra(current, next);"));
  assert.ok(dailyPlanModule.includes("export async function resolveCurrentAndNextTaskForTransition"));
});

test("disabling the transition-notification setting cancels rather than displays -- independent of every other ARC Reminders toggle", () => {
  const fnIndex = module_.indexOf("export async function recomputeTaskTransitionNotification");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function cancelTaskTransitionNotification"));
  assert.ok(fnBody.includes("if (!settings.transitionNotificationEnabled) {"));
  assert.ok(fnBody.includes("await cancelTaskTransitionNotification();"));
  assert.ok(fnBody.includes("return;"));
});

test("'all done' renders the fixed message with zero actions -- current === null, never a fabricated current/next pair", () => {
  const fnIndex = module_.indexOf("export async function recomputeTaskTransitionNotification");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function cancelTaskTransitionNotification"));
  assert.ok(fnBody.includes("const allDone = current === null;"));
  assert.ok(fnBody.includes("actions: allDone"));
  assert.ok(fnBody.includes("? []"));
});

test("exactly 3 directly-visible actions when not all-done -- 😟/🙂/Start task, explicitly never a 4th hard button (no 😄, no inline 'finish+smile' action)", () => {
  const fnIndex = module_.indexOf("export async function recomputeTaskTransitionNotification");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function cancelTaskTransitionNotification"));
  assert.ok(fnBody.includes('{ title: "😟 פחות טוב", pressAction: { id: ACTION_TRANSITION_LESS_GOOD } }'));
  assert.ok(fnBody.includes('{ title: "🙂 סבבה", pressAction: { id: ACTION_TRANSITION_OKAY } }'));
  assert.ok(fnBody.includes('{ title: "▶ התחל משימה", pressAction: { id: ACTION_TRANSITION_START_TASK } }'));
  assert.ok(!fnBody.includes("😄"), "must never include the excluded 4th emoji action");
});

test("persisted state is updated on every recompute -- the SAME notificationId every time, plus the just-resolved from/current/next ids, so a tap can always find what was last shown", () => {
  const fnIndex = module_.indexOf("export async function recomputeTaskTransitionNotification");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function cancelTaskTransitionNotification"));
  assert.ok(fnBody.includes("await saveTaskTransitionNotificationState({"));
  assert.ok(fnBody.includes("notificationId: TASK_TRANSITION_NOTIFICATION_ID,"));
  assert.ok(fnBody.includes("fromTaskId,"));
  assert.ok(fnBody.includes("currentTaskId: current?.id ?? null,"));
  assert.ok(fnBody.includes("nextTaskId: next?.id ?? null,"));
  assert.ok(fnBody.includes("allDone,"));
});

test("never throws: a failed native display call is caught, never crashing the caller (same discipline as every other notification module)", () => {
  const fnIndex = module_.indexOf("export async function recomputeTaskTransitionNotification");
  const fnBody = module_.slice(fnIndex, module_.indexOf("export async function cancelTaskTransitionNotification"));
  assert.ok(fnBody.includes("try {"));
  assert.ok(fnBody.includes("} catch (error) {"));

  const cancelFnIndex = module_.indexOf("export async function cancelTaskTransitionNotification");
  const cancelFnBody = module_.slice(cancelFnIndex, module_.indexOf("export async function handleTaskTransitionNotificationEvent"));
  assert.ok(cancelFnBody.includes("try {"));
  assert.ok(cancelFnBody.includes("} catch {"));
});

test("checkpoint (never trust the original payload): the tap handler re-resolves current/next FRESH via resolveCurrentAndNextTaskForTransition at tap time -- it never reads currentTaskId/nextTaskId off the notifee event's own data payload, so a flexible-day change between send and tap is always reflected", () => {
  const fnIndex = module_.indexOf("export async function handleTaskTransitionNotificationEvent");
  const fnBody = module_.slice(fnIndex);
  assert.ok(fnBody.includes("const { current } = await resolveCurrentAndNextTaskForTransition(null, new Date(), await loadRealActiveRunForTransition());"));
  assert.ok(!fnBody.includes("data.currentTaskId"), "must never trust an id baked into the original notification payload");
});

test("checkpoint (😟/🙂 reuse the one shared check-in dispatcher): both map onto handleEmotionalCheckInChoice with full_arc/shortened_arc and the FRESHLY resolved current task's id, never a new ARC-entry decision", () => {
  assert.match(module_, /import \{ handleEmotionalCheckInChoice \} from "\.\/emotionalCheckInRouting\.ts";/);
  const mapIndex = module_.indexOf("const ACTION_TO_CHOICE");
  const mapBody = module_.slice(mapIndex, mapIndex + 300);
  assert.ok(mapBody.includes('[ACTION_TRANSITION_LESS_GOOD]: "full_arc",'));
  assert.ok(mapBody.includes('[ACTION_TRANSITION_OKAY]: "shortened_arc",'));

  const fnIndex = module_.indexOf("export async function handleTaskTransitionNotificationEvent");
  const fnBody = module_.slice(fnIndex);
  assert.ok(fnBody.includes("if (choice) await handleEmotionalCheckInChoice(choice, current?.id ?? null);"));
});

test("checkpoint ('Start task' reuses the EXISTING autoStart deep-link convention): deep-links to Task LIVE for the freshly-resolved current task with autoStart: \"1\", never a new start-task mechanism", () => {
  const fnIndex = module_.indexOf("export async function handleTaskTransitionNotificationEvent");
  const fnBody = module_.slice(fnIndex);
  assert.ok(fnBody.includes('router.push({ pathname: "/tasks/[id]", params: { id: current.id, autoStart: "1" } });'));
});

test("checkpoint (optional 'Finish + smile', reachable only via this notification): a bare body tap (EventType.PRESS, not an action button) is the ONLY path into the post-task-reward screen here, carrying an explicit from/to pair rather than re-resolving via resolveMostUrgentScheduledTask", () => {
  const fnIndex = module_.indexOf("export async function handleTaskTransitionNotificationEvent");
  const fnBody = module_.slice(fnIndex);
  assert.ok(fnBody.includes('pathname: "/tasks/[id]/post-task-reward",'));
  assert.ok(fnBody.includes('source: "notification", toTaskId: current?.id ?? ""'));
});

test("checkpoint (never a second onBackgroundEvent/onForegroundEvent registration): data/taskAlarm.ts's own shared handleTaskAlarmEvent dispatches data.kind === 'taskTransition' into this module's own handler", () => {
  assert.ok(taskAlarmModule.includes('import { handleTaskTransitionNotificationEvent } from "./taskTransitionNotification.ts";'));
  const dispatchIndex = taskAlarmModule.indexOf('if (data.kind === "taskTransition") {');
  assert.ok(dispatchIndex >= 0);
  const dispatchBody = taskAlarmModule.slice(dispatchIndex, dispatchIndex + 200);
  assert.ok(dispatchBody.includes("await handleTaskTransitionNotificationEvent(event);"));
});
