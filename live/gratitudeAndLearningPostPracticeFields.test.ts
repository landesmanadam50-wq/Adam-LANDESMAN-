import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/gratitudeAndLearningPostPracticeFields.test.ts
 *
 * Hebrew BUILD/LIVE rework spec, Stage C5: source-text regression guard
 * for GratitudeAndLearningScreen's new, optional post-practice
 * intensity re-rating and "was the action performed?" fields -- this
 * codebase has no React Native component test renderer, so this
 * asserts directly on the real source text (same pattern as every
 * other screen-wiring test in this repo).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screens = readSource("live/screens.tsx");
const renderer = readSource("live/ArcLiveRenderer.tsx");
const sessionScreen = readSource("live/LiveSessionScreen.tsx");

function sliceFunction(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.ok(start !== -1, `could not find ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(end !== -1, `could not find ${endMarker} after ${startMarker}`);
  return source.slice(start, end);
}

const gratitudeScreen = sliceFunction(screens, "export function GratitudeAndLearningScreen", "export function");

test("GratitudeAndLearningScreen accepts and renders the two new optional fields", () => {
  assert.ok(gratitudeScreen.includes("postPracticeIntensity"));
  assert.ok(gratitudeScreen.includes("onSelectPostPracticeIntensity"));
  assert.ok(gratitudeScreen.includes("actionPerformed"));
  assert.ok(gratitudeScreen.includes("onSelectActionPerformed"));
  assert.ok(gratitudeScreen.includes("עד 10 (רשות)"));
  assert.ok(gratitudeScreen.includes("האם ביצעת את הפעולה המיטיבה?"));
});

test("handleContinuePress's gating logic is untouched -- it still checks only improvementText, never the two new fields", () => {
  const handleContinuePressIndex = gratitudeScreen.indexOf("function handleContinuePress");
  const handleContinuePressBody = gratitudeScreen.slice(handleContinuePressIndex, handleContinuePressIndex + 300);
  assert.match(handleContinuePressBody, /improvementText\.trim\(\)\.length === 0/);
  assert.ok(!handleContinuePressBody.includes("postPracticeIntensity"));
  assert.ok(!handleContinuePressBody.includes("actionPerformed"));
});

test("ArcLiveRenderer makes the two new fields optional on its own props type, so other callers (ArcGoal/Identity Extension sessions) are never forced to wire them", () => {
  assert.match(renderer, /postPracticeIntensity\?:\s*number \| null/);
  assert.match(renderer, /onSelectPostPracticeIntensity\?:/);
  assert.match(renderer, /actionPerformed\?:\s*boolean \| null/);
  assert.match(renderer, /onSelectActionPerformed\?:/);
  // And the call site defaults them safely when a caller omits them.
  assert.match(renderer, /postPracticeIntensity=\{props\.postPracticeIntensity \?\? null\}/);
  assert.match(renderer, /onSelectPostPracticeIntensity=\{props\.onSelectPostPracticeIntensity \?\? \(\(\) => \{\}\)\}/);
});

test("LiveSessionScreen holds the two new fields as session-local state, reset to null alongside improvementText on every fresh session", () => {
  assert.match(sessionScreen, /const \[postPracticeIntensity, setPostPracticeIntensity\] = useState<number \| null>\(null\)/);
  assert.match(sessionScreen, /const \[actionPerformed, setActionPerformed\] = useState<boolean \| null>\(null\)/);
  const resetCount = (sessionScreen.match(/setPostPracticeIntensity\(null\);\s*\n\s*setActionPerformed\(null\);/g) ?? []).length;
  assert.equal(resetCount, 2, "both reset call sites (restart paths) must reset both new fields together");
});
