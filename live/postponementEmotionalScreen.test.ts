import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/postponementEmotionalScreen.test.ts
 *
 * Unified Emotional Check-In and Task Postponement System, section 3,
 * Option B: source-text regression guard for
 * live/PostponementEmotionalScreen.tsx -- the two smiley choices and
 * their routing through the SAME shared module the Home screen/widget
 * use.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/PostponementEmotionalScreen.tsx");
const route = readSource("app/tasks/[id]/postpone-emotional.tsx");
const layout = readSource("app/_layout.tsx");

test("the postpone-emotional route is registered and passes taskId straight through", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/postpone-emotional"/);
  assert.ok(route.includes("PostponementEmotionalScreen taskId={id}"));
});

test("required test 7 (postponement intervention) + required test 17 (navigation back to Task LIVE): both smileys call the shared routing module with THIS exact taskId -- never re-resolved, never left null (which would mean 'resolve the active task instead')", () => {
  assert.match(screen, /import\s*\{[\s\S]*?openFullArc[\s\S]*?openShortenedArc[\s\S]*?\}\s*from\s*["']\.\.\/data\/emotionalCheckInRouting\.ts["']/);
  assert.ok(screen.includes("onPress={() => openFullArc(taskId)}"));
  assert.ok(screen.includes("onPress={() => openShortenedArc(taskId)}"));
});

test("shows both required smiley emoji with their Hebrew labels", () => {
  assert.ok(screen.includes("😟") && screen.includes("פחות טוב"));
  assert.ok(screen.includes("🙂") && screen.includes("סבבה"));
});

test("never implements a second ARC engine itself -- only navigates to the existing route", () => {
  assert.ok(!screen.includes("NewArcLiveSessionState"));
  assert.ok(!screen.includes("createNewArcLiveSessionState"));
});

test("required test 12 (no premature postponement recording): this screen never records an actual postponement -- it only reads the task for display", () => {
  assert.ok(!screen.includes("recordPostponement"));
  assert.ok(!screen.includes("postponeTask"));
});
