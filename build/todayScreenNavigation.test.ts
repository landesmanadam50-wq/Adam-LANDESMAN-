import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/todayScreenNavigation.test.ts
 *
 * Productivity roadmap, Stage G: source-text regression guard proving
 * every one of Stage G's required destinations (Today, Tasks, Active
 * Task, LIVE gate, BUILD, Manifest Meditation) is reachable through a
 * real, visible Pressable -- never only by typing a route directly --
 * and that the route is registered in app/_layout.tsx. No React Native
 * component test renderer exists in this codebase (see every other
 * *.test.ts in build/ and live/ for the same convention), so this
 * asserts on the real source text, exactly like
 * live/activeTaskScreen.test.ts already does for the Tasks routes.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const home = readSource("app/index.tsx");
const today = readSource("build/TodayScreen.tsx");
const layout = readSource("app/_layout.tsx");

test("Home has a real, visible Pressable leading to /today -- never render-time navigation", () => {
  assert.match(home, /<Link href="\/today" asChild>/);
  assert.match(home, /<Pressable[^>]*todayButton/);
});

test("/today is registered in app/_layout.tsx", () => {
  assert.match(layout, /<Stack\.Screen name="today"/);
});

test("Today has a real Pressable to /tasks (the Tasks list, which itself opens Active Task per task)", () => {
  assert.match(today, /onPress={\(\) => router\.push\("\/tasks"\)}/);
});

test("Today has a real Pressable to /build (BUILD)", () => {
  assert.match(today, /onPress={\(\) => router\.push\("\/build"\)}/);
});

test("Today has a real Pressable to /live/gate (the LIVE gate)", () => {
  assert.match(today, /onPress={\(\) => router\.push\("\/live\/gate"\)}/);
});

test("Today has a real Pressable to /manifest-meditation", () => {
  assert.match(today, /onPress={\(\) => router\.push\("\/manifest-meditation"\)}/);
});

test("every destination Today links to is itself a registered route in app/_layout.tsx", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/index"/);
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]"/);
  assert.match(layout, /<Stack\.Screen name="build\/index"/);
  assert.match(layout, /<Stack\.Screen name="live\/gate"/);
  assert.match(layout, /<Stack\.Screen name="manifest-meditation"/);
});

test("Today's task cards open Active Task (/tasks/[id]) -- never navigating during render", () => {
  // The route push must only ever appear inside an onPress callback, never bare in the render body.
  const pushCount = (today.match(/router\.push\(\{\s*pathname:\s*"\/tasks\/\[id\]"/g) ?? []).length;
  const onPressPushCount = (today.match(/onPress={\(\) => router\.push\(\{\s*pathname:\s*"\/tasks\/\[id\]"/g) ?? []).length;
  assert.ok(pushCount > 0, "Today must link to the Active Task route");
  assert.equal(pushCount, onPressPushCount, "every /tasks/[id] navigation must be wrapped in an onPress, never fired during render");
});

test("Today never calls a navigation function outside of an onPress/useEffect/useFocusEffect callback (no render-time navigation)", () => {
  // A crude but effective guard: router.push/replace must always be preceded on its own statement line by '=>' (an inline arrow callback) or appear inside a named function body -- never as a bare top-level statement in the component's render return.
  const bareTopLevelCall = /\n  router\.(push|replace)\(/;
  assert.ok(!bareTopLevelCall.test(today), "found a router call that isn't wrapped in a callback");
});
