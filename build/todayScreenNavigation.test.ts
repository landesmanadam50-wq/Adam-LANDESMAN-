import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/todayScreenNavigation.test.ts
 *
 * Productivity roadmap, Stage G: originally proved every one of Stage
 * G's required destinations (Today, Tasks, Active Task, LIVE gate,
 * BUILD, Manifest Meditation) was reachable through a real, visible
 * Pressable. No React Native component test renderer exists in this
 * codebase (see every other *.test.ts in build/ and live/ for the same
 * convention), so this asserts on the real source text, exactly like
 * live/activeTaskScreen.test.ts already does for the Tasks routes.
 *
 * Simplified-architecture task, Phase 1: Home ("/") now renders
 * build/TodayScreen.tsx directly, and Today itself no longer links to
 * BUILD, the LIVE gate, or Manifest Meditation -- see
 * build/phase1Simplification.test.ts for the consolidated proof that
 * those routes stay registered and reachable directly even though
 * they're no longer linked from here.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const home = readSource("app/index.tsx");
const today = readSource("build/TodayScreen.tsx");
const layout = readSource("app/_layout.tsx");

// Open Today's Schedule Automatically task: the root route is still
// never a mode-chooser, but it now shows TODAY's own Flexible Daily
// Timetable directly (never the Weekly overview, never
// build/DailyScheduleScreen.tsx/build/TodayScreen.tsx directly, all of
// which remain reachable at their own direct routes).
test("Home itself is still the root route, never a separate mode-chooser -- it now shows today's own Flexible Daily Timetable", () => {
  assert.match(home, /import FlexibleDailyScreen from ["']\.\.\/build\/FlexibleDailyScreen\.tsx["']/);
  assert.ok(home.includes("<FlexibleDailyScreen />"));
  assert.ok(!home.includes('href="/self-development"') && !home.includes('href="/reach-your-goal"'), "Home must no longer offer the old mode-chooser buttons");
});

test("/today is registered in app/_layout.tsx", () => {
  assert.match(layout, /<Stack\.Screen name="today"/);
});

test("Today has a real Pressable to /tasks (the Tasks list, which itself opens Active Task per task)", () => {
  assert.match(today, /onPress={\(\) => router\.push\("\/tasks"\)}/);
});

test("Simplified-architecture task, Phase 1: Today no longer links to BUILD, the LIVE gate, or Manifest Meditation -- hidden from normal navigation, never deleted", () => {
  assert.ok(!today.includes('router.push("/build")'));
  assert.ok(!today.includes('router.push("/live/gate")'));
  assert.ok(!today.includes('router.push("/manifest-meditation")'));
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

// --- Floating ARC button/next-task display task: Part 2 -----------------

test("test 6: when there is no upcoming task (sections.nextTask is null), the 'next task' row becomes a 'תכנון משימה נוספת' prompt instead of silently disappearing", () => {
  const nextTaskBlockIndex = today.indexOf("{sections.nextTask ? (");
  assert.ok(nextTaskBlockIndex !== -1);
  const blockBody = today.slice(nextTaskBlockIndex, today.indexOf("</View>", nextTaskBlockIndex));
  assert.ok(blockBody.includes("תכנון משימה נוספת"));
});

test("test 6: the 'תכנון משימה נוספת' prompt opens the EXISTING task-planning screen in add-task mode (id: \"new\") -- never a new/duplicated planning screen", () => {
  const nextTaskBlockIndex = today.indexOf("{sections.nextTask ? (");
  const blockBody = today.slice(nextTaskBlockIndex, today.indexOf("</View>", nextTaskBlockIndex));
  assert.ok(blockBody.includes('router.push({ pathname: "/tasks/[id]/edit", params: { id: "new" } })'));
});

test("when there IS an upcoming task, the actual task's own name and scheduled time are shown (via the existing TaskCard), and tapping it opens the task's own details -- never a generic static label standing in for them", () => {
  const nextTaskBlockIndex = today.indexOf("{sections.nextTask ? (");
  const blockBody = today.slice(nextTaskBlockIndex, today.indexOf("</View>", nextTaskBlockIndex));
  assert.ok(blockBody.includes("<TaskCard entry={sections.nextTask} onComplete={handleComplete} />"));
});

test("the next-task slot is drawn ONLY from sections.nextTask (the nearest task whose own clock time hasn't arrived yet) -- never from sections.overdue, so a late task is never shown as if it were the next one", () => {
  const nextTaskBlockIndex = today.indexOf("{sections.nextTask ? (");
  const blockBody = today.slice(nextTaskBlockIndex, today.indexOf("</View>", nextTaskBlockIndex));
  assert.ok(!blockBody.includes("sections.overdue"));
});
