import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/morningAlarmSettingsScreen.test.ts
 *
 * Nine Functional Improvements task, Improvement 9: source-text
 * regression guard for the morning-alarm settings screen (route
 * /tasks/morning-alarm-settings) -- its toggle, time/weekday editors,
 * honest device-limitation text, and route/navigation wiring.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("build/MorningAlarmSettingsScreen.tsx");
const route = readSource("app/tasks/morning-alarm-settings.tsx");
const layout = readSource("app/_layout.tsx");
const listScreen = readSource("build/TasksListScreen.tsx");
const flexibleDailyScreen = readSource("build/FlexibleDailyScreen.tsx");

test("the route is registered and renders MorningAlarmSettingsScreen", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/morning-alarm-settings"/);
  assert.match(route, /from ["']\.\.\/\.\.\/build\/MorningAlarmSettingsScreen\.tsx["']/);
});

test("checkpoint (editable later from Home/Settings): both build/TasksListScreen.tsx (Settings) and build/FlexibleDailyScreen.tsx (Home) link to the settings screen", () => {
  assert.match(listScreen, /router\.push\("\/tasks\/morning-alarm-settings"\)/);
  assert.match(flexibleDailyScreen, /router\.push\("\/tasks\/morning-alarm-settings"\)/);
});

test("checkpoint (configurable enable toggle): the Switch reads/writes MorningAlarmConfig.enabled via data/storage.ts and re-syncs the live native alarm immediately through syncMorningAlarm -- never a second/local preference store", () => {
  assert.match(
    screen,
    /import\s*\{[\s\S]*?loadMorningAlarmConfig[\s\S]*?saveMorningAlarmConfig[\s\S]*?\}\s*from\s*["']\.\.\/data\/storage\.ts["']/
  );
  assert.match(screen, /import \{ syncMorningAlarm \} from "\.\.\/data\/morningAlarm\.ts";/);
  const fnIndex = screen.indexOf("async function update(");
  const fnBody = screen.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("await saveMorningAlarmConfig(next);"));
  assert.ok(fnBody.includes("const synced = await syncMorningAlarm();"));
  assert.ok(screen.includes("<Switch value={config.enabled} onValueChange={(value) => update({ enabled: value })} />"));
});

test("checkpoint (configurable time): a well-formed HH:MM draft commits hour/minute via update() on blur; a malformed draft resets the field back to the saved config rather than saving garbage", () => {
  const fnIndex = screen.indexOf("function commitTimeDraft()");
  const fnBody = screen.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("const parsed = parseTime(timeDraft);"));
  assert.ok(fnBody.includes("if (!parsed) {"));
  assert.ok(fnBody.includes("setTimeDraft(formatTime(config.hour, config.minute));"));
  assert.ok(fnBody.includes("update(parsed);"));
});

test("checkpoint (configurable weekday repeat): toggleDay adds/removes exactly the tapped day from recurrenceDays and saves via update() -- every day chip is independently toggleable", () => {
  const fnIndex = screen.indexOf("function toggleDay(");
  const fnBody = screen.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("config.recurrenceDays.includes(dayOfWeek)"));
  assert.ok(fnBody.includes("config.recurrenceDays.filter((day) => day !== dayOfWeek)"));
  assert.ok(fnBody.includes("update({ recurrenceDays: days });"));
  assert.ok(screen.includes("RECURRENCE_DAY_LABELS.map((label, dayOfWeek)"));
});

test("checkpoint (dismissing/snoozing must never mark Daily Visualization completed -- and this screen says so): the hint text is explicit that closing/snoozing the native alarm never completes the exercise, and that manual access remains available", () => {
  assert.ok(screen.includes("אינם מסמנים את ההכנה היומית כהושלמה"));
  assert.ok(screen.includes("ניתן לפתוח אותה בכל עת"));
});

test("checkpoint (honest limitations, never a guaranteed-functionality claim): names reboot/timezone, Android 13 notification permission, and Xiaomi/MIUI background restrictions specifically, and surfaces the existing OEM power-manager escape hatch only when a real one was found for this device", () => {
  assert.ok(screen.includes("אתחול המכשיר"));
  assert.ok(screen.includes("שינוי שעה/אזור זמן"));
  assert.ok(screen.includes("אנדרואיד 13"));
  assert.ok(screen.includes("שיאומי"));
  assert.ok(screen.includes("MIUI"));
  assert.match(
    screen,
    /import\s*\{[\s\S]*?getAlarmPowerManagerInfo[\s\S]*?openAlarmPowerManagerSettings[\s\S]*?\}\s*from\s*["']\.\.\/data\/taskAlarm\.ts["']/
  );
  assert.ok(screen.includes("powerManagerInfo?.activity &&"));
  assert.ok(screen.includes("onPress={openAlarmPowerManagerSettings}"));
  assert.ok(screen.includes("Linking.openSettings()"));
});
