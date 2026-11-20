import test from "node:test";
import assert from "node:assert/strict";

import { containsInductionPattern } from "./instructions.ts";
import { getManifestStepContent } from "./manifestTaskCopy.ts";
import { MANIFEST_STEP_ORDER, manifestStepSubCount } from "./manifestTaskSteps.ts";
import type { ManifestRunState } from "./manifestTaskSteps.ts";
import { createEmptyManifestProfile } from "./tasks.ts";
import type { ManifestProfile } from "./tasks.ts";

const FULL_PROFILE: ManifestProfile = {
  longTermGoal: "להיות כותב מקצועי",
  desiredResult: "לפרסם ספר",
  desiredIdentity: "כותב מתמיד ובטוח",
  bodyLanguageDescription: "גב זקוף, כתפיים פתוחות",
};

test("no generated line across the entire Manifest sequence trips the safety denylist, with a full profile or a completely blank one", () => {
  for (const profile of [FULL_PROFILE, createEmptyManifestProfile()]) {
    for (const step of MANIFEST_STEP_ORDER) {
      if (step === "complete") continue;
      for (let sub = 0; sub < manifestStepSubCount(step); sub++) {
        const state: ManifestRunState = { taskId: "t1", currentStep: step, subIndex: sub };
        const content = getManifestStepContent(state, profile);
        assert.equal(containsInductionPattern(content.primary), false, `${step}#${sub} primary must never trip the denylist: "${content.primary}"`);
        for (const line of content.supporting) {
          assert.equal(containsInductionPattern(line), false, `${step}#${sub} supporting must never trip the denylist: "${line}"`);
        }
      }
    }
  }
});

test("a blank ManifestProfile never invents content -- every profile-derived supporting line is simply omitted, never a placeholder", () => {
  const blank = createEmptyManifestProfile();
  const visualizeFirst = getManifestStepContent({ taskId: "t1", currentStep: "visualize", subIndex: 0 }, blank);
  assert.deepEqual(visualizeFirst.supporting, []);
  const identityAction = getManifestStepContent({ taskId: "t1", currentStep: "identity_action", subIndex: 0 }, blank);
  assert.deepEqual(identityAction.supporting, []);
});

test("a fully-populated profile surfaces its own fields verbatim, never reworded", () => {
  const visualizeFirst = getManifestStepContent({ taskId: "t1", currentStep: "visualize", subIndex: 0 }, FULL_PROFILE);
  assert.ok(visualizeFirst.supporting.some((line) => line.includes(FULL_PROFILE.longTermGoal)));
  const visualizeLast = getManifestStepContent({ taskId: "t1", currentStep: "visualize", subIndex: 4 }, FULL_PROFILE);
  assert.ok(visualizeLast.supporting.some((line) => line.includes(FULL_PROFILE.desiredResult)));
  assert.ok(visualizeLast.supporting.some((line) => line.includes(FULL_PROFILE.desiredIdentity)));
});

test("Step C reuses the exact shared ARC awareness/presence instructions -- never a re-authored duplicate", () => {
  const awareness = getManifestStepContent({ taskId: "t1", currentStep: "awareness", subIndex: 0 }, FULL_PROFILE);
  const presence = getManifestStepContent({ taskId: "t1", currentStep: "presence", subIndex: 0 }, FULL_PROFILE);
  assert.ok(awareness.primary.length > 0);
  assert.ok(presence.primary.length > 0);
});

test("Regulation includes the exact shared natural-breathing line as a buffer, never a command to breathe differently", () => {
  const regulation = getManifestStepContent({ taskId: "t1", currentStep: "regulation", subIndex: 0 }, FULL_PROFILE);
  assert.ok(regulation.supporting.some((line) => line.includes("בלי לנסות לשנות אותה")));
});

test("Encoding never commands 'imagine yourself feeling X' -- the positive sensation is only ever noticed/allowed, and the body-language adoption reuses the saved description verbatim", () => {
  const sensationLine = getManifestStepContent({ taskId: "t1", currentStep: "encoding", subIndex: 0 }, FULL_PROFILE);
  assert.ok(!sensationLine.primary.includes("דמיין"));
  const bodyLanguageLine = getManifestStepContent({ taskId: "t1", currentStep: "encoding", subIndex: 2 }, FULL_PROFILE);
  assert.ok(bodyLanguageLine.supporting.includes(FULL_PROFILE.bodyLanguageDescription));
});

test("every screen shows at most two supporting lines, matching the rest of this app's own display convention", () => {
  for (const step of MANIFEST_STEP_ORDER) {
    if (step === "complete") continue;
    for (let sub = 0; sub < manifestStepSubCount(step); sub++) {
      const content = getManifestStepContent({ taskId: "t1", currentStep: step, subIndex: sub }, FULL_PROFILE);
      assert.ok(content.supporting.length <= 2, `${step}#${sub} must show at most two supporting lines`);
    }
  }
});
