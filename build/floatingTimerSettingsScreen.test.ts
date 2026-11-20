import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/floatingTimerSettingsScreen.test.ts
 *
 * Floating task timer task, requirement 1's own closing line + requirement
 * 2: source-text regression guard for the floating-overlay settings
 * screen (route /tasks/floating-timer-settings) -- its toggle, its
 * permission-explanation + request flow, and its route/navigation wiring.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("build/FloatingTimerSettingsScreen.tsx");
const route = readSource("app/tasks/floating-timer-settings.tsx");
const layout = readSource("app/_layout.tsx");
const listScreen = readSource("build/TasksListScreen.tsx");

test("the route is registered and renders FloatingTimerSettingsScreen", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/floating-timer-settings"/);
  assert.match(route, /from ["']\.\.\/\.\.\/build\/FloatingTimerSettingsScreen\.tsx["']/);
});

test("TasksListScreen links to the new settings screen, alongside the existing task-alarm settings link", () => {
  assert.match(listScreen, /router\.push\("\/tasks\/floating-timer-settings"\)/);
});

test("the toggle reads/writes FloatingTimerOverlayPreferences via data/storage.ts, never a second/local preference store", () => {
  assert.match(
    screen,
    /import\s*\{[\s\S]*?loadFloatingTimerOverlayPreferences[\s\S]*?saveFloatingTimerOverlayPreferences[\s\S]*?\}\s*from\s*["']\.\.\/data\/storage\.ts["']/
  );
  const fnIndex = screen.indexOf("async function update(");
  const fnBody = screen.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("await saveFloatingTimerOverlayPreferences(next);"));
});

test("requirement 2: the permission status is checked on every focus (re-checking after the trainee returns from the OS settings screen), and the one request action is the same 'open settings' call either way", () => {
  assert.match(screen, /import\s*\{[\s\S]*?hasFloatingOverlayPermissionAsync[\s\S]*?requestFloatingOverlayPermissionAsync[\s\S]*?\}\s*from\s*["']\.\.\/data\/floatingTimerOverlay\.ts["']/);
  assert.ok(screen.includes("hasFloatingOverlayPermissionAsync().then(setHasPermission)"));
  assert.ok(screen.includes("onPress={() => requestFloatingOverlayPermissionAsync()}"));
});

test("never gates/disables the regular timer or navigates away based on permission or the overlay preference -- this screen only ever touches its own toggle and the one permission button", () => {
  assert.ok(!screen.includes("router.push") && !screen.includes("router.replace"));
});
