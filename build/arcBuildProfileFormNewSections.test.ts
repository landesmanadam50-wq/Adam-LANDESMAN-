import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/arcBuildProfileFormNewSections.test.ts
 *
 * Hebrew BUILD/LIVE rework spec, Stage B: regression guard for the new
 * BUILD sections (emotion/intensity, body regions, personal choices)
 * wired into build/ArcBuildProfileForm.tsx -- this codebase has no React
 * Native component test renderer (see build/selfDevelopmentEntryRoute.test.ts's
 * own doc), so this asserts directly on the real source text: every new
 * ProfileStep is present in all three target step-order arrays, mapped
 * to one of the three new sections, and has a corresponding render
 * branch. The actual field-level logic (persistence, trimming, defaults,
 * round-tripping) is covered by build/profileWizard.test.ts against the
 * real pure functions -- this file only guards the UI wiring itself.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const form = readSource("build/ArcBuildProfileForm.tsx");

const NEW_STEPS = [
  "emotionStateSelection",
  "arcSuggestionIntensityThreshold",
  "bodyRegionConfigs",
  "awakeningAwarenessSentence",
  "preMovementAirContactRegion",
  "releaseRelaxationInstruction",
  "preventionMantra",
  "choiceMantra",
];

test("every new step is present in all three step-order arrays (state/identity/habit) -- a trainee building any target sees the new sections", () => {
  const stateStepsIndex = form.indexOf("export const STATE_STEPS");
  const identityStepsIndex = form.indexOf("export const IDENTITY_STEPS");
  const habitStepsIndex = form.indexOf("export const HABIT_STEPS");
  const stepOrderForIndex = form.indexOf("export function stepOrderFor");
  assert.ok(stateStepsIndex !== -1 && identityStepsIndex !== -1 && habitStepsIndex !== -1 && stepOrderForIndex !== -1);

  const stateStepsBody = form.slice(stateStepsIndex, identityStepsIndex);
  const identityStepsBody = form.slice(identityStepsIndex, habitStepsIndex);
  const habitStepsBody = form.slice(habitStepsIndex, stepOrderForIndex);

  for (const step of NEW_STEPS) {
    assert.ok(stateStepsBody.includes(`"${step}"`), `STATE_STEPS is missing "${step}"`);
    assert.ok(identityStepsBody.includes(`"${step}"`), `IDENTITY_STEPS is missing "${step}"`);
    assert.ok(habitStepsBody.includes(`"${step}"`), `HABIT_STEPS is missing "${step}"`);
  }
});

test("every new step is mapped to one of the three new sections in SECTION_FOR -- never left unmapped (which would silently drop it from every accordion)", () => {
  const sectionForIndex = form.indexOf("const SECTION_FOR");
  assert.ok(sectionForIndex !== -1);
  const sectionForBody = form.slice(sectionForIndex);

  assert.match(sectionForBody, /emotionStateSelection:\s*"emotionIntensity"/);
  assert.match(sectionForBody, /arcSuggestionIntensityThreshold:\s*"emotionIntensity"/);
  assert.match(sectionForBody, /bodyRegionConfigs:\s*"bodyRegions"/);
  assert.match(sectionForBody, /awakeningAwarenessSentence:\s*"personalChoices"/);
  assert.match(sectionForBody, /preMovementAirContactRegion:\s*"personalChoices"/);
  assert.match(sectionForBody, /releaseRelaxationInstruction:\s*"personalChoices"/);
  assert.match(sectionForBody, /preventionMantra:\s*"personalChoices"/);
  assert.match(sectionForBody, /choiceMantra:\s*"personalChoices"/);
});

test("the three new sections each have a title and default to collapsed (purely optional/advanced, matching every other optional section)", () => {
  assert.match(form, /emotionIntensity:\s*"רגש, דחף ועוצמה"/);
  assert.match(form, /bodyRegions:\s*"אזורי גוף"/);
  assert.match(form, /personalChoices:\s*"בחירות אישיות לתרגול"/);

  const defaultExpandedIndex = form.indexOf("const SECTION_DEFAULT_EXPANDED");
  const defaultExpandedBody = form.slice(defaultExpandedIndex, defaultExpandedIndex + 600);
  assert.match(defaultExpandedBody, /emotionIntensity:\s*false/);
  assert.match(defaultExpandedBody, /bodyRegions:\s*false/);
  assert.match(defaultExpandedBody, /personalChoices:\s*false/);
});

test("renderField has a dedicated branch for every new custom-rendered step (emotion grid, intensity chips, region picker, multi-region card list)", () => {
  assert.ok(form.includes('step === "arcSuggestionIntensityThreshold"'));
  assert.ok(form.includes('step === "preMovementAirContactRegion"'));
  assert.ok(form.includes('step === "emotionStateSelection"'));
  assert.ok(form.includes('step === "bodyRegionConfigs"'));
});

test("the new Bridge to Action dwell row is added to DWELL_ROWS, reusing the existing generic per-layer dwell mechanism -- never a bespoke render branch", () => {
  const dwellRowsIndex = form.indexOf("const DWELL_ROWS");
  const dwellRowsBody = form.slice(dwellRowsIndex, dwellRowsIndex + 900);
  assert.ok(dwellRowsBody.includes('"bridgeToActionDwellSeconds"'));
});

test("every emotion option from arc/emotionStateOptions.ts is imported and used, never a parallel/duplicated list", () => {
  assert.match(form, /import\s*{\s*EMOTION_STATE_OPTIONS,\s*EMOTION_STATE_OPTION_LABELS\s*}\s*from\s*["']\.\.\/arc\/emotionStateOptions\.ts["']/);
  assert.ok(form.includes("EMOTION_STATE_OPTIONS.map"));
});

test("every body region from arc/bodyRegionRoles.ts is imported and used, never a parallel/duplicated list", () => {
  assert.match(form, /import\s*{[^}]*BODY_REGIONS[^}]*}\s*from\s*["']\.\.\/arc\/bodyRegionRoles\.ts["']/);
  assert.ok(form.includes("BODY_REGIONS.map"));
});
