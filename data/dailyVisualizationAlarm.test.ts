import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/dailyVisualizationAlarm.test.ts
 *
 * Daily Visualization task, section 4: source-text regression guard
 * for this module's notifee-backed alarm scheduling (notifee isn't
 * callable under a plain `node --test` run, same convention as
 * data/taskAlarm.ts's own total absence of direct tests).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/dailyVisualizationAlarm.ts");
const taskAlarmModule = readSource("data/taskAlarm.ts");
const alarmChannelModule = readSource("data/alarmChannel.ts");

test("the alarm uses ONE fixed, deterministic notification id -- re-arming structurally replaces any previous one rather than ever creating a duplicate ('prevent duplicate scheduled alarms')", () => {
  assert.match(module_, /const DAILY_VISUALIZATION_ALARM_ID = "daily-visualization-alarm";/);
  const armIndex = module_.indexOf("async function armDailyVisualizationAlarm");
  const armBody = module_.slice(armIndex, armIndex + 900);
  assert.ok(armBody.includes("await cancelDailyVisualizationAlarm();"), "must cancel any previous one before arming");
  assert.ok(armBody.includes("id: DAILY_VISUALIZATION_ALARM_ID,"));
});

test("the alarm is scheduled via notifee's AlarmType.SET_ALARM_CLOCK -- the same Android-12+ exact-alarm-restriction-EXEMPT trigger type every other alarm in this app uses, reusing the shared channel/permission primitives rather than a second native mechanism", () => {
  const armIndex = module_.indexOf("async function armDailyVisualizationAlarm");
  const armBody = module_.slice(armIndex, armIndex + 1900);
  assert.ok(armBody.includes("await ensureNotifeePermissionAsync();"));
  assert.ok(armBody.includes("await ensureSilentDeliveryChannelAsync();"));
  assert.ok(armBody.includes("alarmManager: { type: AlarmType.SET_ALARM_CLOCK },"));
  // ARCHI -- Final Critical Check task: the INITIAL scheduled notification
  // now deliberately uses SILENT_DELIVERY_CHANNEL_ID (never a loud channel),
  // so Android's startForeground() requirement can never play a
  // sound/heads-up before hasActiveTaskConflict runs.
  assert.ok(armBody.includes("channelId: SILENT_DELIVERY_CHANNEL_ID,"));
});

test("notification content matches the exact requested title/action, and the data.kind lets data/taskAlarm.ts's shared router dispatch to this module", () => {
  assert.ok(module_.includes('title: "הגיע הזמן לוויזואליזציה היומית"'));
  assert.ok(module_.includes('data: { kind: "dailyVisualizationAlarm" }'));
  assert.ok(module_.includes('{ title: "התחל ויזואליזציה", pressAction: { id: ACTION_START_DAILY_VISUALIZATION } }'));
});

test("arming never throws -- a failed native call is caught and logged, returning notificationId: null (an honest 'nothing is actually armed') rather than claiming success, exactly like armTaskAlarm/armPlannedArcAlarm's own contract", () => {
  const armIndex = module_.indexOf("async function armDailyVisualizationAlarm");
  const armBody = module_.slice(armIndex, armIndex + 2100);
  assert.ok(armBody.includes("} catch (error) {"));
  assert.ok(armBody.includes("console.error(\"armDailyVisualizationAlarm failed\", error);"));
  assert.ok(armBody.includes("return { notificationId: null, scheduledFor: null };"));
});

test("reconcileDailyVisualizationAlarm recomputes the target from TODAY's real tasks every time it runs (never a cached/stale value), so editing/rescheduling/completing the first task automatically reschedules this alarm", () => {
  const fnIndex = module_.indexOf("export async function reconcileDailyVisualizationAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 1200);
  assert.ok(fnBody.includes("resolveFirstTaskClockTimeToday(tasks, completions, now)"));
  assert.ok(fnBody.includes("resolveDailyVisualizationAlarmTime(firstTaskClock)"));
});

test("reconcileDailyVisualizationAlarm is a no-op when already in sync (same target, and a genuinely native-armed id) -- this, together with the single deterministic id, is what makes a duplicate structurally impossible across repeated reconciles", () => {
  const fnIndex = module_.indexOf("export async function reconcileDailyVisualizationAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 1200);
  assert.ok(fnBody.includes("const inSync = stored.scheduledFor === targetIso && (targetIso === null || isNativeDailyVisualizationAlarmId(stored.notificationId));"));
  assert.ok(fnBody.includes("if (inSync) return;"));
});

test("reconcileDailyVisualizationAlarm never arms a moment already in the past -- disarms instead when nothing is scheduled today or the computed time has already gone by", () => {
  const fnIndex = module_.indexOf("export async function reconcileDailyVisualizationAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 1600);
  assert.match(fnBody, /if \(!targetIso \|\| !target \|\| target\.getTime\(\) <= now\.getTime\(\)\) \{\s*\/\/[^\n]*\n(\s*\/\/[^\n]*\n)*\s*await disarmDailyVisualizationAlarm\(\);/);
});

test("tapping the notification (either its single action or the plain press) always opens the Daily Visualization screen directly", () => {
  const fnIndex = module_.indexOf("export async function handleDailyVisualizationAlarmEvent");
  const fnBody = module_.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("if (event.type !== EventType.ACTION_PRESS && event.type !== EventType.PRESS) return;"));
  assert.ok(fnBody.includes('router.push("/daily-visualization");'));
});

test("data/taskAlarm.ts's single shared handleTaskAlarmEvent router dispatches the 'dailyVisualizationAlarm' kind to this module, never a second onBackgroundEvent/onForegroundEvent registration (notifee only ever has ONE of each, registered once in app/_layout.tsx)", () => {
  assert.ok(taskAlarmModule.includes('import { handleDailyVisualizationAlarmEvent } from "./dailyVisualizationAlarm.ts";'));
  const dispatchIndex = taskAlarmModule.indexOf('if (data.kind === "dailyVisualizationAlarm") {');
  const dispatchBody = taskAlarmModule.slice(dispatchIndex, dispatchIndex + 200);
  assert.ok(dispatchBody.includes("await handleDailyVisualizationAlarmEvent(event);"));
});

test("the shared channel/permission primitives live in their own module (data/alarmChannel.ts) specifically to avoid a circular import between data/taskAlarm.ts (which must dispatch INTO data/dailyVisualizationAlarm.ts) and this module (which reuses them) -- neither file imports the other", () => {
  assert.ok(!module_.includes('from "./taskAlarm.ts"'), "data/dailyVisualizationAlarm.ts must never import from data/taskAlarm.ts");
  assert.match(alarmChannelModule, /export const TASK_ALARM_CHANNEL_ID = "archi-task-alarm-v2";/);
  assert.match(alarmChannelModule, /export async function ensureTaskAlarmChannelAsync/);
  assert.match(alarmChannelModule, /export async function ensureNotifeePermissionAsync/);
});
