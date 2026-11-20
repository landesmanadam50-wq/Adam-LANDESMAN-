import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/emotionalCheckInNotificationSettingsScreen.test.ts
 *
 * Nine Functional Improvements task, Improvement 8: source-text
 * regression guard for the lock-screen check-in settings screen (route
 * /tasks/emotional-checkin-settings) -- its toggle, its honest
 * device-limitation text, and its route/navigation wiring.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("build/EmotionalCheckInNotificationSettingsScreen.tsx");
const route = readSource("app/tasks/emotional-checkin-settings.tsx");
const layout = readSource("app/_layout.tsx");
const listScreen = readSource("build/TasksListScreen.tsx");

test("the route is registered and renders EmotionalCheckInNotificationSettingsScreen", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/emotional-checkin-settings"/);
  assert.match(route, /from ["']\.\.\/\.\.\/build\/EmotionalCheckInNotificationSettingsScreen\.tsx["']/);
});

test("TasksListScreen links to the new settings screen, alongside the existing alarm/floating-timer settings links", () => {
  assert.match(listScreen, /router\.push\("\/tasks\/emotional-checkin-settings"\)/);
});

test("the toggle reads/writes EmotionalCheckInNotificationSettings via data/storage.ts, and re-syncs the live notification on every change -- never a second/local preference store", () => {
  assert.match(
    screen,
    /import\s*\{[\s\S]*?loadEmotionalCheckInNotificationSettings[\s\S]*?saveEmotionalCheckInNotificationSettings[\s\S]*?\}\s*from\s*["']\.\.\/data\/storage\.ts["']/
  );
  const fnIndex = screen.indexOf("async function handleToggle(");
  const fnBody = screen.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("await saveEmotionalCheckInNotificationSettings(next);"));
  assert.ok(fnBody.includes("await syncEmotionalCheckInNotification();"));
  assert.ok(screen.includes("<Switch value={settings.enabled} onValueChange={handleToggle} />"));
});

test("checkpoint (honest limitations, never a guaranteed-functionality claim): explains that lock-screen action visibility depends on the device/OEM, names the Android 13+ notification-permission requirement, and names Xiaomi/MIUI-style background restrictions specifically", () => {
  assert.ok(screen.includes("תלויה בהגדרות המכשיר ובגרסת האנדרואיד/היצרן"));
  assert.ok(screen.includes("אנדרואיד 13"));
  assert.ok(screen.includes("שיאומי"));
  assert.ok(screen.includes("MIUI"));
  assert.ok(screen.includes("לא עוקפת את אבטחת המכשיר"), "must be explicit that this never bypasses device security");
});

test("checkpoint (surfaces the existing OEM background-permission escape hatch): reuses getAlarmPowerManagerInfo/openAlarmPowerManagerSettings from data/taskAlarm.ts UNCHANGED, only ever showing the button when a real OEM screen was actually found", () => {
  assert.match(
    screen,
    /import\s*\{[\s\S]*?getAlarmPowerManagerInfo[\s\S]*?openAlarmPowerManagerSettings[\s\S]*?\}\s*from\s*["']\.\.\/data\/taskAlarm\.ts["']/
  );
  assert.ok(screen.includes("powerManagerInfo?.activity &&"));
  assert.ok(screen.includes("onPress={openAlarmPowerManagerSettings}"));
});

test("checkpoint (allow users to disable, reachable without a lock-screen-specific permission dialog): also offers the generic 'open this app's notification settings' fallback, which exists on every Android version/OEM", () => {
  assert.ok(screen.includes('import { Linking,'));
  assert.ok(screen.includes("Linking.openSettings()"));
});

// --- ARCHI -- Universal ARC Routing, Emotion Identification & Android
// Shortcuts task, requirement 1: this screen is now the ONE combined
// entry point for "הוסף כפתורי ARC למסך הבית ולמסך הנעילה" -- the
// home-screen widget-pin half, alongside the lock-screen half above.

test("the screen's own title is the exact combined label, and it imports the widget-pin bridge rather than inventing a second settings screen", () => {
  assert.ok(screen.includes(">הוסף כפתורי ARC למסך הבית ולמסך הנעילה<"));
  assert.match(
    screen,
    /import\s*\{[\s\S]*?isHomeScreenWidgetPinSupported[\s\S]*?requestHomeScreenWidgetPin[\s\S]*?\}\s*from\s*["']\.\.\/data\/emotionalCheckInWidget\.ts["']/
  );
});

test("never claims unsupported home-screen functionality: the pin button is shown ONLY once isHomeScreenWidgetPinSupported resolves true, with an honest manual-fallback message otherwise", () => {
  assert.ok(screen.includes("isHomeScreenWidgetPinSupported().then(setWidgetPinSupported)"));
  const fnIndex = screen.indexOf("async function handleRequestWidgetPin(");
  const fnBody = screen.slice(fnIndex, fnIndex + 200);
  assert.ok(fnBody.includes("await requestHomeScreenWidgetPin()"));
  assert.ok(screen.includes("widgetPinSupported ? ("), "the pin button must be conditionally rendered, never shown unconditionally");
  assert.ok(screen.includes("לחיצה ארוכה על מסך הבית"), "an honest manual-add fallback must be shown when the OS/launcher doesn't support the pin-request flow");
});

test("still shows the honest device-security disclaimer even in the combined/shortened header text", () => {
  assert.ok(screen.includes("לא עוקפת את אבטחת המכשיר"));
});
