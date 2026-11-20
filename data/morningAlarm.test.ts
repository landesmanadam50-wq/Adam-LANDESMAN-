import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/morningAlarm.test.ts
 *
 * Nine Functional Improvements task, Improvement 9 ("Configurable
 * Morning Daily Visualization Alarm"): source-text regression guard
 * for this module's notifee-backed real alarm (notifee isn't callable
 * under a plain `node --test` run, same convention as
 * data/taskAlarm.ts/data/dailyVisualizationAlarm.ts's own total
 * absence of direct tests). The next-occurrence DATE MATH itself
 * (resolveNextOccurrenceDate) is already covered directly, with real
 * executed tests, by arc/routines.test.ts -- this file only checks that
 * this module wires it (and every other reused primitive) correctly.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/morningAlarm.ts");
const taskAlarmModule = readSource("data/taskAlarm.ts");
const storage = readSource("data/storage.ts");
const layout = readSource("app/_layout.tsx");

test("the alarm uses ONE fixed, deterministic notification id -- re-arming structurally replaces any previous one rather than ever creating a duplicate ('prevent duplicate scheduled alarms')", () => {
  assert.match(module_, /const MORNING_ALARM_ID = "morning-alarm";/);
  const armIndex = module_.indexOf("async function armMorningAlarm");
  const armBody = module_.slice(armIndex, armIndex + 600);
  assert.ok(armBody.includes("await cancelMorningAlarm();"), "must cancel any previous one before arming");
  assert.ok(armBody.includes("id: MORNING_ALARM_ID,"));
});

test("checkpoint (REAL alarm, not just an in-app reminder; sound/vibration/Snooze/Dismiss; reuses existing Android alarm infra): armMorningAlarm uses buildAlarmAndroidConfig (data/taskAlarm.ts's own real-alarm config -- full-screen wake, foreground service, ALARM category) and AlarmType.SET_ALARM_CLOCK, with three actions (Start/Snooze/Close), never a second hand-rolled alarm implementation", () => {
  assert.match(module_, /import \{ buildAlarmAndroidConfig, endForegroundServiceForId \} from "\.\/taskAlarm\.ts";/);
  const armIndex = module_.indexOf("async function armMorningAlarm");
  const armBody = module_.slice(armIndex, armIndex + 1700);
  assert.ok(armBody.includes("android: buildAlarmAndroidConfig("));
  // ARCHI -- Final Critical Check task: the INITIAL scheduled notification
  // now deliberately uses SILENT_DELIVERY_CHANNEL_ID (never the loud
  // TASK_ALARM_CHANNEL_ID), so Android's startForeground() requirement
  // can never play a sound/heads-up before hasActiveTaskConflict runs --
  // see data/alarmChannel.ts's own doc for the confirmed native reason.
  assert.ok(armBody.includes("SILENT_DELIVERY_CHANNEL_ID"));
  assert.ok(armBody.includes("alarmManager: { type: AlarmType.SET_ALARM_CLOCK },"));
  assert.ok(armBody.includes('{ title: "התחל הכנה יומית", pressAction: { id: ACTION_START_MORNING } }'));
  assert.ok(armBody.includes("נודניק"));
  assert.ok(armBody.includes('{ title: "סגור", pressAction: { id: ACTION_CLOSE_MORNING } }'));
});

test("checkpoint (configurable time/weekday repeat/enable toggle; handle time changes/timezone): reconcileMorningAlarm reuses arc/routines.ts's resolveNextOccurrenceDate DIRECTLY over the config's own hour/minute/recurrenceDays -- never a second, hand-rolled next-occurrence calculation", () => {
  assert.match(module_, /import \{ resolveNextOccurrenceDate \} from "\.\.\/arc\/routines\.ts";/);
  const fnIndex = module_.indexOf("export async function reconcileMorningAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("resolveNextOccurrenceDate({ hour: config.hour, minute: config.minute, recurrenceDays: config.recurrenceDays }, now)"));
});

test("checkpoint (enable toggle, and 'recurrenceDays could end up empty'): disabled, or with no recurrence day at all, cancels the native alarm and clears notificationId/scheduledFor -- never leaves a stale armed alarm for a config that no longer wants one", () => {
  const fnIndex = module_.indexOf("export async function reconcileMorningAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("if (!config.enabled || config.recurrenceDays.length === 0) {"));
  const disabledBranch = fnBody.slice(fnBody.indexOf("if (!config.enabled"), fnBody.indexOf("if (!config.enabled") + 200);
  assert.ok(disabledBranch.includes("await cancelMorningAlarm();"));
  assert.ok(disabledBranch.includes("notificationId: null, scheduledFor: null"));
});

test("checkpoint (idempotent reconciliation, never a redundant re-arm): an already-in-sync config (same scheduledFor AND a real native id) is returned completely unchanged, never re-armed", () => {
  const fnIndex = module_.indexOf("export async function reconcileMorningAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("if (config.scheduledFor === targetIso && config.notificationId === MORNING_ALARM_ID) return config;"));
});

test("checkpoint (Snooze never changes the configured time/weekday recurrence): snoozeMorningAlarm arms an AD-HOC alarm 5 minutes out and saves ONLY the volatile notificationId/scheduledFor bookkeeping -- hour/minute/recurrenceDays/enabled on the returned config are whatever loadMorningAlarmConfig already had, never touched here", () => {
  assert.match(module_, /const SNOOZE_MINUTES = 5;/);
  const fnIndex = module_.indexOf("export async function snoozeMorningAlarm");
  const fnBody = module_.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("new Date(now.getTime() + SNOOZE_MINUTES * 60 * 1000)"));
  assert.ok(fnBody.includes("await saveMorningAlarmConfig({ ...config, ...armed });"));
  assert.ok(!fnBody.includes("hour:") && !fnBody.includes("recurrenceDays:"), "must never overwrite the configured time/recurrence -- only the armed-bookkeeping fields");
});

test("checkpoint (dismissing/snoozing must never mark Daily Visualization completed): neither this module, nor handleMorningAlarmAction, nor turnOffMorningAlarm/snoozeMorningAlarm ever reference Daily Visualization's own completion status at all", () => {
  assert.ok(!module_.includes("DailyVisualization"), "this module must never touch Daily Visualization's own completion status -- dismissing/snoozing the alarm is purely a native-scheduling concern");
});

test("checkpoint (opens the EXISTING morning flow, never a second morning-preparation engine): Start (and a bare notification tap) just navigate Home -- the existing live/DailyStartupSequenceOverlay.tsx and its own resume logic take over exactly as for every other entry point, with no new morning-flow code of its own", () => {
  const fnIndex = module_.indexOf("export async function handleMorningAlarmAction");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes('router.push("/");'));
  // Reaching the overlay is just ordinary navigation to Home -- this
  // module may explain that in a comment, but must never literally
  // import the overlay component.
  assert.ok(!module_.includes("DailyStartupSequenceOverlay.tsx\""), "must never import the overlay directly");
});

test("checkpoint (Snooze/Close actions): handleMorningAlarmAction branches on ACTION_SNOOZE_MORNING/ACTION_CLOSE_MORNING before falling through to the Start/default behavior, and always stops the ring first regardless of which action fired", () => {
  const fnIndex = module_.indexOf("export async function handleMorningAlarmAction");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("stopRinging();"));
  assert.ok(fnBody.includes("endForegroundServiceForId(MORNING_ALARM_ID);"));
  assert.ok(fnBody.includes("if (actionId === ACTION_SNOOZE_MORNING) {"));
  assert.ok(fnBody.includes("await snoozeMorningAlarm(new Date());"));
  assert.ok(fnBody.includes("if (actionId === ACTION_CLOSE_MORNING) {"));
  assert.ok(fnBody.includes("await turnOffMorningAlarm(new Date());"));
});

test("checkpoint (never a second onBackgroundEvent/onForegroundEvent registration): data/taskAlarm.ts's own shared handleTaskAlarmEvent dispatches data.kind === 'morningAlarm' into this module's own handleMorningAlarmAction -- for both a real action press and a bare notification tap", () => {
  assert.ok(taskAlarmModule.includes('import { handleMorningAlarmAction, turnOffMorningAlarm } from "./morningAlarm.ts";'));
  const dispatchIndex = taskAlarmModule.indexOf('if (data.kind === "morningAlarm") {');
  assert.ok(dispatchIndex >= 0);
  const dispatchBody = taskAlarmModule.slice(dispatchIndex, dispatchIndex + 400);
  assert.ok(dispatchBody.includes("await handleMorningAlarmAction(event.detail.pressAction.id);"));
  assert.ok(dispatchBody.includes('await handleMorningAlarmAction("default");'));
});

test("checkpoint (ring-timeout gives up gracefully, never left ringing forever): registerTaskAlarmForegroundService's own 2-minute-cap timeout calls turnOffMorningAlarm for a morningAlarm kind, same treatment as every other alarm kind's own timeout branch", () => {
  const isMorningIndex = taskAlarmModule.indexOf('const isMorningAlarm = notification.data?.kind === "morningAlarm";');
  assert.ok(isMorningIndex >= 0);
  const timeoutIndex = taskAlarmModule.indexOf("} else if (isMorningAlarm) {", isMorningIndex);
  assert.ok(timeoutIndex >= 0);
  const timeoutBody = taskAlarmModule.slice(timeoutIndex, timeoutIndex + 100);
  assert.ok(timeoutBody.includes("await turnOffMorningAlarm(new Date());"));
});

test("checkpoint (configurable time/weekday repeat/enable toggle, defaults never silently skip the one-time offer): MorningAlarmConfig defaults to enabled:false and hasOfferedSetup:false -- the offer is genuinely opt-in and genuinely one-time", () => {
  assert.match(
    storage,
    /const DEFAULT_MORNING_ALARM_CONFIG: MorningAlarmConfig = \{\s*enabled: false,\s*hour: 7,\s*minute: 0,\s*recurrenceDays: \[0, 1, 2, 3, 4, 5, 6\],\s*notificationId: null,\s*scheduledFor: null,\s*hasOfferedSetup: false,\s*\};/
  );
});

test("checkpoint (handle reboot/timezone/startup re-sync): app/_layout.tsx calls syncMorningAlarm once on every cold start, from the same startup effect every other reconciliation call already runs in", () => {
  assert.ok(layout.includes('import { syncMorningAlarm } from "../data/morningAlarm.ts";'));
  const effectIndex = layout.indexOf("export default function RootLayout()");
  const effectBody = layout.slice(effectIndex, effectIndex + 1700);
  assert.ok(effectBody.includes("syncMorningAlarm();"));
});
