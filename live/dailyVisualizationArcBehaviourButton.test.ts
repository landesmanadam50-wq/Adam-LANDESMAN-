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
  return module_.slice(start, start + 2900);
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

/**
 * ARCHI -- Extend Save-For-Later Beyond Linked Situations task,
 * requirement 2: the NEW always-available save-for-later button never
 * depends on task.linkedArcGymSituationId -- it must appear in the
 * render branch unconditionally, strictly before the existing
 * linked-only button's own guard.
 */
test("a NEW save-for-later button is rendered unconditionally -- it never checks task.linkedArcGymSituationId", () => {
  const body = renderBranchBody();
  const saveButtonIndex = body.indexOf("onSaveCaseForLaterPractice");
  assert.ok(saveButtonIndex !== -1, "expected an always-available save-for-later call site");
  const linkedGuardIndex = body.indexOf("!!task?.linkedArcGymSituationId");
  assert.ok(saveButtonIndex < linkedGuardIndex, "the new button must render before (independently of) the linked-only guard");
});

test("the save-for-later handler goes through the ArcTrigger/ArcSavedExercise/ArcSavedBodyOption chain only -- never a fabricated ArcGymSituation/manifestId/behaviorId", () => {
  const source = readSource("live/DailyVisualizationScreen.tsx");
  assert.ok(source.includes("createArcSavedExercise("));
  assert.ok(source.includes("promoteArcSavedExerciseToBodyOption("));
  assert.ok(source.includes("createArcTrigger("));
  assert.ok(source.includes("addBodyOptionToTrigger("));
  assert.ok(source.includes("upsertArcSavedExerciseEntry("));
  assert.ok(source.includes("upsertArcSavedBodyOptionEntry("));
  assert.ok(source.includes("upsertArcTriggerEntry("));
  const handlerIndex = source.indexOf("async function onSaveCaseForLaterPractice");
  assert.ok(handlerIndex !== -1);
  const handlerBody = source.slice(handlerIndex, handlerIndex + 1200);
  assert.ok(!handlerBody.includes("manifestId"));
  assert.ok(!handlerBody.includes("behaviorId"));
  assert.ok(!/createArcGymSituation|generateArcGymSituationId/.test(handlerBody));
});

test("the save-for-later snapshot is genuinely empty -- no field is fabricated from the body-scan note", () => {
  const source = readSource("live/DailyVisualizationScreen.tsx");
  const constIndex = source.indexOf("const EMPTY_BODY_PROTOCOL_SNAPSHOT");
  assert.ok(constIndex !== -1);
  const constBody = source.slice(constIndex, constIndex + 500);
  assert.match(constBody, /bodyScanContractionRegions:\s*\[\]/);
  assert.match(constBody, /openingBodyScanRegions:\s*\[\]/);
  assert.match(constBody, /supportiveBodyArea:\s*null/);
  assert.match(constBody, /supportiveSensation:\s*null/);
  assert.match(constBody, /positiveMovement:\s*null/);
  assert.match(constBody, /selectedSupportiveFeeling:\s*null/);
});

test("the free-text body-scan note (when present) is carried into the trigger's own description field -- never forced into a body/sensation field it might mischaracterize", () => {
  const source = readSource("live/DailyVisualizationScreen.tsx");
  const handlerIndex = source.indexOf("async function onSaveCaseForLaterPractice");
  assert.ok(handlerIndex !== -1);
  const handlerBody = source.slice(handlerIndex, handlerIndex + 1200);
  assert.ok(handlerBody.includes("updateArcTrigger(trigger, { description: bodyScanNoteDraft }"));
});
