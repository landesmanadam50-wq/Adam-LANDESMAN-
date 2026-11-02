import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/preSessionGateScreen.test.ts
 *
 * Hebrew BUILD/LIVE rework spec, Stage C3: source-text regression guard
 * for the new pre-practice gate screen and its route registration --
 * this codebase has no React Native component test renderer (see
 * build/selfDevelopmentEntryRoute.test.ts's own doc), so this asserts
 * directly on the real source text. The gate's own decision logic
 * (shouldSuggestArcFromGate) is covered by arc/preSessionGate.test.ts
 * against the real pure function.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/PreSessionGateScreen.tsx");
const route = readSource("app/live/gate.tsx");
const layout = readSource("app/_layout.tsx");

test("the route renders PreSessionGateScreen", () => {
  assert.match(route, /from ["']\.\.\/\.\.\/live\/PreSessionGateScreen\.tsx["']/);
});

test("the route is registered in app/_layout.tsx", () => {
  assert.match(layout, /<Stack\.Screen name="live\/gate"/);
});

test("the screen asks all three spec questions and never gates Continue on any of them being answered", () => {
  assert.ok(screen.includes("מה קרה עכשיו?"));
  assert.ok(screen.includes("מה עוצמת העומס או הדחף"));
  assert.ok(screen.includes("עד כמה זה מקשה עליך לבחור בפעולה הרצויה"));
  // "Continue" must be a plain, always-enabled Pressable -- no disabled prop tied to any answers field.
  const continueIndex = screen.indexOf('onPress={() => router.push("/live/select")}');
  assert.ok(continueIndex !== -1);
  const buttonBlock = screen.slice(continueIndex - 40, continueIndex + 40);
  assert.ok(!buttonBlock.includes("disabled"));
});

test("the screen reuses the shared shouldSuggestArcFromGate decision -- never a duplicated/local threshold check", () => {
  assert.match(screen, /import\s*{\s*createEmptyPreSessionGateAnswers,\s*shouldSuggestArcFromGate\s*}\s*from\s*["']\.\.\/arc\/preSessionGate\.ts["']/);
});

test("the suggestion banner is additive -- it never blocks or replaces the Continue button, and Continue always routes to the existing /live/select chooser, never a new/duplicated chooser", () => {
  assert.match(screen, /router\.push\("\/live\/select"\)/);
  assert.equal((screen.match(/router\.push\("\/live\/select"\)/g) ?? []).length, 1, "exactly one continue path -- never a second, divergent one");
});
