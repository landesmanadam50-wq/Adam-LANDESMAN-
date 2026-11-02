import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/taskInsightsScreen.test.ts
 *
 * Productivity roadmap, Stage Y: source-text regression guard for the
 * insights screen's wiring and reachability. The actual aggregation
 * logic is covered separately in arc/taskInsights.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const layout = readSource("app/_layout.tsx");
const route = readSource("app/tasks/insights.tsx");
const screen = readSource("live/TaskInsightsScreen.tsx");
const todayScreen = readSource("build/TodayScreen.tsx");

test("the insights route is registered in app/_layout.tsx", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/insights"/);
});

test("the route renders TaskInsightsScreen", () => {
  assert.match(route, /from ["']\.\.\/\.\.\/live\/TaskInsightsScreen\.tsx["']/);
});

test("Today has a real Pressable to the insights screen", () => {
  assert.match(todayScreen, /onPress={\(\) => router\.push\("\/tasks\/insights"\)}/);
});

test("the screen only ever renders counts from arc/taskInsights.ts's pure aggregates -- never its own interpretation", () => {
  assert.match(screen, /import\s*\{[\s\S]*?buildTaskInsightsSummary[\s\S]*?\}\s*from\s*["']\.\.\/arc\/taskInsights\.ts["']/);
  assert.ok(screen.includes("-- ${row.count} פעמים"), "wording must be count-based ('selected X in N sessions'), never a diagnosis");
});

test("an empty journal shows a plain 'not enough data yet' message, never a crash or a fabricated number", () => {
  assert.ok(screen.includes("summary.totalEntries === 0"));
});
