import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/dailyVisualizationArcBehaviourButton.test.ts
 *
 * ARCHI -- Body-Sensation Discovery & Four-Component Learning task,
 * section 10: source-text regression guard for the one new button on
 * Daily Visualization's existing task_body_scan step (depends on
 * expo-router/React Native, so it isn't executed directly with
 * `node --test` -- same convention as every other live/*.test.ts file
 * in this app for a screen that can't be rendered in this environment).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("live/DailyVisualizationScreen.tsx");

// The render branch is the SECOND occurrence of this check -- the first
// is handleContinue's own "save the note on leaving this step" branch.
function renderBranchBody(): string {
  const firstOccurrence = module_.indexOf('if (step.kind === "task_body_scan") {');
  assert.ok(firstOccurrence !== -1);
  const start = module_.indexOf('if (step.kind === "task_body_scan") {', firstOccurrence + 1);
  assert.ok(start !== -1, "expected a second, render-side occurrence of the task_body_scan check");
  return module_.slice(start, start + 1800);
}

test("the ARC Behaviour button is only rendered when the current task has a linkedArcGymSituationId -- never shown as a dead/disabled button otherwise", () => {
  assert.ok(renderBranchBody().includes("!!task?.linkedArcGymSituationId"));
});

test("tapping the ARC Behaviour button navigates to the existing /arc-gym/train/[id] route, never a new/duplicated training screen", () => {
  const body = renderBranchBody();
  assert.ok(body.includes('pathname: "/arc-gym/train/[id]"'));
  assert.ok(body.includes("id: task.linkedArcGymSituationId"));
});

test("the existing free-text body-scan note stays completely unchanged alongside the new button", () => {
  const body = renderBranchBody();
  assert.ok(body.includes("value={bodyScanNoteDraft}"));
  assert.ok(body.includes("onChangeText={setBodyScanNoteDraft}"));
});
