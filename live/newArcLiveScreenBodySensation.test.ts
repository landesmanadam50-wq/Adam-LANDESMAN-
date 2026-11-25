import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/newArcLiveScreenBodySensation.test.ts
 *
 * ARCHI -- Body-Sensation Discovery & Four-Component Learning task:
 * source-text regression guard for the live/NewArcLiveScreen.tsx wiring
 * (depends on react-native/expo-router, so it isn't executed directly
 * with `node --test` -- same convention as every other live/*.test.ts
 * source-text check in this app).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("live/NewArcLiveScreen.tsx");

test("reload() computes suggested body sensations from the resolved context keys and attaches them to a fresh session", () => {
  assert.ok(module_.includes("resolveBodySensationContextKeys"));
  assert.ok(module_.includes("resolveSuggestedBodySensations("));
  assert.ok(module_.includes("suggestedBodySensations: bodySensationSuggestions"));
});

test("a discovery-write effect records a SupportiveBodySensationUsage exactly once per session, the moment the effect-check step is first reached", () => {
  assert.ok(module_.includes("bodySensationDiscoveryWrittenRef"));
  assert.ok(module_.includes("recordBodySensationDiscovery("));
  assert.ok(module_.includes("appendSupportiveBodySensationUsageEntry(usage)"));
  assert.ok(module_.includes("setBodySensationUsageId(session, usage.id)"));
});

test("the sensation_effect_check / mini_sensation_effect_check render case is wired to confirmSensationEffectCheck", () => {
  assert.ok(module_.includes('case "sensation_effect_check":'));
  assert.ok(module_.includes('case "mini_sensation_effect_check":'));
  assert.ok(module_.includes("confirmSensationEffectCheck(session!, sensationEffectRatingDraft!, readinessImprovedDraft!, now)"));
});

test("mini_acceptance_transition offers past-sensation suggestion chips that only pre-fill the free-text drafts, never auto-commit", () => {
  const start = module_.indexOf('case "mini_acceptance_transition":');
  assert.ok(start !== -1);
  const body = module_.slice(start, start + 7000);
  assert.ok(body.includes("suggestedBodySensations.length > 0"));
  assert.ok(body.includes("setMiniSensationDraft(suggestion.sensationLabel)"));
  assert.ok(body.includes("setMiniMovementDraft(suggestion.movementLabel)"));
});

test("a time-crunch row offers act-anyway and save-for-later, gated on resolveTimeConstrainedOptions, never forcing repeated practice", () => {
  assert.ok(module_.includes("resolveTimeConstrainedOptions(session.arcPracticeDepth)"));
  assert.ok(module_.includes("bailToComplete(session, now)"));
  assert.ok(module_.includes("handleSaveForLaterPractice()"));
});

test("handleSaveForLaterPractice never fabricates a new ArcGymSituation -- it only creates a standalone trigger/exercise/body-option chain", () => {
  const start = module_.indexOf("async function handleSaveForLaterPractice");
  assert.ok(start !== -1);
  const end = module_.indexOf("function ", start + 40);
  const body = module_.slice(start, end === -1 ? start + 2500 : end);
  assert.ok(!body.includes("createArcGymSituation"));
  assert.ok(body.includes("createArcSavedExercise("));
  assert.ok(body.includes("createArcTrigger("));
});
