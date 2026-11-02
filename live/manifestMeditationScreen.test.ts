import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/manifestMeditationScreen.test.ts
 *
 * Hebrew BUILD/LIVE rework spec, Stage D: source-text regression guard
 * for the new Manifest Meditation screen and its route registration.
 * The underlying stage/content logic is covered by
 * arc/manifestMeditation.test.ts against the real pure functions.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/ManifestMeditationScreen.tsx");
const route = readSource("app/manifest-meditation.tsx");
const layout = readSource("app/_layout.tsx");

test("the route renders ManifestMeditationScreen and is registered in app/_layout.tsx", () => {
  assert.match(route, /from ["']\.\.\/live\/ManifestMeditationScreen\.tsx["']/);
  assert.match(layout, /<Stack\.Screen name="manifest-meditation"/);
});

test("the screen collects every spec field (values, identities, goals/habits, personal sentences, day imagery, today's action) and a duration choice before starting", () => {
  assert.ok(screen.includes("ערכים מרכזיים"));
  assert.ok(screen.includes("זהויות שאתה רוצה לטפח"));
  assert.ok(screen.includes("מטרות והרגלים"));
  assert.ok(screen.includes("משפטים אישיים"));
  assert.ok(screen.includes("דמיון של יום שבו אתה פועל בהתאם לערכיך"));
  assert.ok(screen.includes("פעולה קטנה להיום"));
  assert.match(screen, /import\s*{[^}]*MANIFEST_MEDITATION_DURATION_OPTIONS_MINUTES[^}]*}\s*from\s*["']\.\.\/arc\/manifestMeditation\.ts["']/);
});

test("the screen reuses the shared pure stage/copy functions -- never a duplicated/local stage sequence or content", () => {
  assert.match(screen, /import\s*\{[\s\S]*?getFirstManifestMeditationStage[\s\S]*?\}\s*from\s*["']\.\.\/arc\/manifestMeditation\.ts["']/);
  assert.ok(screen.includes("getManifestMeditationStageCopy("));
  assert.ok(screen.includes("getNextManifestMeditationStage("));
  assert.ok(screen.includes("resolveManifestMeditationDwellSeconds("));
});

test("Continue is never hard-gated by the dwell countdown -- it is a plain, always-pressable button", () => {
  const practicePressableIndex = screen.lastIndexOf("<Pressable");
  const practicePressableBlock = screen.slice(practicePressableIndex, practicePressableIndex + 300);
  assert.ok(!practicePressableBlock.includes("disabled"));
});

test("the screen never claims or uses any text-to-speech/audio narration -- no Speech/Audio import anywhere", () => {
  assert.ok(!/expo-speech|expo-av|expo-audio|Speech\.speak/.test(screen));
});
