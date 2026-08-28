import test from "node:test";
import assert from "node:assert/strict";
import type { ArcProfile } from "../engine/types.ts";
import { LiveStage } from "../engine/types.ts";
import { DEFAULT_PRESENCE_THRESHOLD, DEFAULT_INTENSITY_THRESHOLDS } from "../engine/thresholds.ts";
import { getStageCopy, getStageInputKind } from "./stageCopy.ts";
import { containsInductionPattern } from "../engine/instructions.ts";

function baseProfile(overrides: Partial<ArcProfile> = {}): ArcProfile {
  return {
    goal: "goal",
    interferingState: "פחד",
    supportiveState: "חמלה",
    arcType: "identity",
    actions: {
      internalAction: "סריקת גוף",
      beneficialAction: "לגשת ולפתוח שיחה",
    },
    regulationTool: "נשימה 4-7-8",
    presenceThreshold: DEFAULT_PRESENCE_THRESHOLD,
    intensityThresholds: DEFAULT_INTENSITY_THRESHOLDS,
    ...overrides,
  };
}

test("every stage has an input kind and non-empty title", () => {
  const profile = baseProfile();
  for (const stage of Object.values(LiveStage)) {
    const kind = getStageInputKind(stage);
    assert.ok(kind, `missing input kind for ${stage}`);
    const copy = getStageCopy(stage, profile);
    assert.ok(copy.title.length > 0, `missing title for ${stage}`);
  }
});

test("Encoding falls back to generic copy when the profile has no mantra", () => {
  const profile = baseProfile({ mantra: undefined });
  const copy = getStageCopy(LiveStage.Encoding, profile);
  assert.ok(!copy.body.includes("undefined"));
});

test("Encoding quotes the mantra when the profile has one", () => {
  const profile = baseProfile({ mantra: "אני בטוח כאן" });
  const copy = getStageCopy(LiveStage.Encoding, profile);
  assert.ok(copy.body.includes("אני בטוח כאן"));
});

test("BeneficialAction copy is specific to the profile's beneficial action", () => {
  const profile = baseProfile();
  const copy = getStageCopy(LiveStage.BeneficialAction, profile);
  assert.ok(copy.body.includes("לגשת ולפתוח שיחה"));
});

test("InterferingAction copy is empty when the profile has no plan", () => {
  const profile = baseProfile({ interferingAction: undefined });
  const copy = getStageCopy(LiveStage.InterferingAction, profile);
  assert.equal(copy.body, "");
});

test("scale stages use the right ranges", () => {
  assert.equal(getStageInputKind(LiveStage.PresenceCheck), "scale0to10");
  assert.equal(getStageInputKind(LiveStage.ArcThoughtPresenceRecheck), "scale0to10");
  assert.equal(getStageInputKind(LiveStage.IntensityCheck), "scale1to10");
});

// --- Regression: the exact runtime bug reported from a published build ---

test("ArcThoughtCombinedAttention no longer names interferingState/supportiveState -- regression for the reported bug", () => {
  const profile = baseProfile({ interferingState: "ביקורת עצמית", supportiveState: "חמלה" });
  const copy = getStageCopy(LiveStage.ArcThoughtCombinedAttention, profile);
  assert.ok(!copy.body.includes("ביקורת עצמית"));
  assert.ok(!copy.body.includes("חמלה"));
  assert.equal(containsInductionPattern(copy.body), false);
});

test("ArcThoughtAwareness no longer names the calibrated internalAction", () => {
  const profile = baseProfile({ actions: { internalAction: "סריקת גוף מפורטת", beneficialAction: "לגשת ולפתוח שיחה" } });
  const copy = getStageCopy(LiveStage.ArcThoughtAwareness, profile);
  assert.ok(!copy.body.includes("סריקת גוף מפורטת"));
});

test("no ARC Thought stage's real generated copy trips the induction-pattern audit, for any arcType", () => {
  const arcThoughtStages = [LiveStage.ArcThoughtAwareness, LiveStage.ArcThoughtCombinedAttention, LiveStage.ArcThoughtExpansion];
  for (const arcType of ["state", "identity", "habit"] as const) {
    const profile = baseProfile({ arcType, interferingState: "תסכול", supportiveState: "רוגע" });
    for (const stage of arcThoughtStages) {
      const copy = getStageCopy(stage, profile);
      assert.equal(containsInductionPattern(copy.body), false, `${arcType}/${stage} produced unsafe copy: "${copy.body}"`);
    }
  }
});

test("Desired State (supportiveState) and Identity are never named outside Encoding", () => {
  const profile = baseProfile({ supportiveState: "SENTINEL_DESIRED_STATE", desiredIdentity: "SENTINEL_IDENTITY" });
  for (const stage of Object.values(LiveStage)) {
    if (stage === LiveStage.Encoding) continue; // Encoding is the one place a mantra/target is allowed to appear
    const copy = getStageCopy(stage, profile);
    assert.ok(!copy.title.includes("SENTINEL_DESIRED_STATE") && !copy.body.includes("SENTINEL_DESIRED_STATE"), `${stage} leaked supportiveState`);
    assert.ok(!copy.title.includes("SENTINEL_IDENTITY") && !copy.body.includes("SENTINEL_IDENTITY"), `${stage} leaked desiredIdentity`);
  }
});
