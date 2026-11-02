import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/coachingWorkspace.test.ts
 *
 * Productivity roadmap, Stage Z: source-text regression guard for the
 * coaching workspace and session-prep screens' wiring and reachability.
 * Aggregation logic is covered separately in
 * arc/coachingSessionPrep.test.ts / arc/coachingWorkspace.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const layout = readSource("app/_layout.tsx");
const indexRoute = readSource("app/coaching/index.tsx");
const prepareRoute = readSource("app/coaching/prepare.tsx");
const workspaceScreen = readSource("live/CoachingWorkspaceScreen.tsx");
const prepScreen = readSource("live/CoachingSessionPrepScreen.tsx");
const todayScreen = readSource("build/TodayScreen.tsx");

test("both coaching routes are registered in app/_layout.tsx", () => {
  assert.match(layout, /<Stack\.Screen name="coaching\/index"/);
  assert.match(layout, /<Stack\.Screen name="coaching\/prepare"/);
});

test("both routes render the correct screens", () => {
  assert.match(indexRoute, /from ["']\.\.\/\.\.\/live\/CoachingWorkspaceScreen\.tsx["']/);
  assert.match(prepareRoute, /from ["']\.\.\/\.\.\/live\/CoachingSessionPrepScreen\.tsx["']/);
});

test("Today has a real Pressable to the coaching workspace", () => {
  assert.match(todayScreen, /onPress={\(\) => router\.push\("\/coaching"\)}/);
});

test("the workspace screen saves through upsertCoachingWorkspaceEntry (one entry per session, history preserved), never a single overwritten record", () => {
  assert.match(workspaceScreen, /import\s*\{[\s\S]*?upsertCoachingWorkspaceEntry[\s\S]*?\}\s*from\s*["']\.\.\/data\/storage\.ts["']/);
});

test("the workspace screen has a real Pressable to the session-prep summary", () => {
  assert.match(workspaceScreen, /onPress={\(\) => router\.push\("\/coaching\/prepare"\)}/);
});

test("the prep screen never imports any networking/sharing/export API -- nothing in this stage transmits data anywhere", () => {
  assert.ok(!prepScreen.includes("fetch(") && !prepScreen.includes("Share.") && !prepScreen.includes("Clipboard"));
});

test("every section in the prep screen defaults to visible and is hidden only by the trainee's own explicit tap -- never a default that silently withholds something", () => {
  assert.match(prepScreen, /import\s*\{[\s\S]*?createDefaultVisibleSections[\s\S]*?\}\s*from\s*["']\.\.\/arc\/coachingSessionPrep\.ts["']/);
  assert.ok(prepScreen.includes("setVisible({ ...visible, [section]: !visible[section] })"));
});
