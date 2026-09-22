import test from "node:test";
import assert from "node:assert/strict";

import { buildFullAwarenessSteps, buildFullCombinedSteps, buildFullStepsAfterPrimaryResolution } from "./combinedFullPlan.ts";
import type { FullCombinedStepKind } from "./combinedFullPlan.ts";
import { resolveCombinedFactorPlan } from "./combinedFactorPlan.ts";
import type { CombinedFactorPlanInput, ResolvedCombinedFactorPlan } from "./combinedFactorPlan.ts";
import { createEmptyPersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import type { PersonalDevelopmentRouteConfig, PersonalDevelopmentRouteGoalConnection } from "./personalDevelopmentRouteConfig.ts";
import { createEmptyBeliefInterferenceItem, createEmptyEmotionInterferenceItem, createEmptyThoughtInterferenceItem, createEmptyUrgeInterferenceItem } from "./interferenceItem.ts";
import type { BeliefInterferenceItem, EmotionInterferenceItem, InterferenceItem, ThoughtInterferenceItem, UrgeInterferenceItem } from "./interferenceItem.ts";
import { createEmptyStateProfile } from "./stateProfile.ts";
import type { StateProfile } from "./stateProfile.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function config(overrides: Partial<PersonalDevelopmentRouteConfig> = {}): PersonalDevelopmentRouteConfig {
  return { ...createEmptyPersonalDevelopmentRouteConfig("route1", "prog1", NOW), ...overrides };
}
function thought(overrides: Partial<ThoughtInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyThoughtInterferenceItem("t1", "מחשבה", null, NOW), schemaVersion: 2, beneficialActionAgainstFactor: "פעולת מחשבה", ...overrides };
}
function belief(overrides: Partial<BeliefInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyBeliefInterferenceItem("b1", "אמונה", null, NOW), schemaVersion: 2, beneficialActionAgainstFactor: "פעולת אמונה", ...overrides };
}
function urge(overrides: Partial<UrgeInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyUrgeInterferenceItem("u1", "דחף", null, NOW), schemaVersion: 2, beneficialActionAgainstFactor: "פעולת דחף", preventiveStoppingAction: "עצור", ...overrides };
}
function emotion(overrides: Partial<EmotionInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyEmotionInterferenceItem("e1", "רגש", null, NOW), ...overrides };
}
function completeState(overrides: Partial<StateProfile> = {}): StateProfile {
  return { ...createEmptyStateProfile("s1", "מצב", null, NOW), regulationAnchor: "עוגן", encodingCue: "קידוד", action: "פעולת המצב", ...overrides };
}

function resolve(input: Partial<CombinedFactorPlanInput>): ResolvedCombinedFactorPlan {
  const result = resolveCombinedFactorPlan({
    mode: "full",
    config: config(),
    items: [],
    stateProfiles: [],
    presenceArcs: [],
    primaryFactorId: null,
    stateDecisionAnswer: null,
    ...input,
  });
  assert.equal(result.kind, "resolved", `expected resolved, got ${result.kind}`);
  if (result.kind !== "resolved") throw new Error("not resolved");
  return result.plan;
}

function kinds(steps: { kind: FullCombinedStepKind }[]): FullCombinedStepKind[] {
  return steps.map((s) => s.kind);
}

// --- No-State Thought ---

test("Thought without State: no state_regulation_anchor/afterStateRegulation/state_desired_state_encoding/desired_state_rating/state_action", () => {
  const plan = resolve({ config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }), items: [thought()] });
  const steps = buildFullCombinedSteps(plan, "skipped");
  const k = kinds(steps);
  assert.equal(k.includes("state_regulation_anchor"), false);
  assert.equal(k.includes("state_desired_state_encoding"), false);
  assert.equal(k.includes("desired_state_rating"), false);
  assert.equal(k.includes("state_action"), false);
  assert.deepEqual(
    steps.filter((s) => s.kind === "rating_checkpoint").map((s) => s.checkpoint),
    ["afterAwareness", "afterStayAcceptance"],
    "no fabricated afterStateRegulation checkpoint"
  );
  assert.equal(k.includes("factor_action"), true, "primary factor action preserved");
});

// --- With-State Thought ---

test("Thought with State: Regulation, afterStateRegulation, Encoding (State content then the factor's own replacement response), desired-state measurement, and resolved actions all present in the exact required boundary order", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "different_actions" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" }),
    items: [thought()],
    stateProfiles: [completeState()],
  });
  const steps = buildFullCombinedSteps(plan, "skipped");
  const k = kinds(steps);
  const regIdx = k.indexOf("state_regulation_anchor");
  const checkpointIdx = steps.findIndex((s) => s.kind === "rating_checkpoint" && s.checkpoint === "afterStateRegulation");
  const encIdx = k.indexOf("state_desired_state_encoding");
  const processingIdx = k.indexOf("processing");
  const ratingIdx = k.indexOf("desired_state_rating");
  const stateActionIdx = k.indexOf("state_action");
  const factorActionIdx = k.indexOf("factor_action");

  assert.ok(
    regIdx >= 0 && checkpointIdx >= 0 && encIdx >= 0 && processingIdx >= 0 && ratingIdx >= 0 && stateActionIdx >= 0 && factorActionIdx >= 0,
    "every required component present"
  );
  assert.ok(regIdx < checkpointIdx, "Regulation before its own checkpoint");
  assert.ok(checkpointIdx < encIdx, "checkpoint before Encoding -- the required boundary");
  assert.ok(encIdx < processingIdx, "the factor's own replacement response (New-Response Practice) follows State's own desired-state encoding, both inside Encoding");
  assert.ok(processingIdx < ratingIdx, "desired-state rating follows the whole Encoding/New-Response-Practice block, State content and replacement response alike");
  assert.ok(stateActionIdx < factorActionIdx, "State action first, factor action second");
});

// --- Urge without/with State ---

test("Urge without State preserves preventive stopping and its own visual/sensory intervention", () => {
  const plan = resolve({ config: config({ interferenceItemIds: ["u1"], itemRelationships: { u1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }), items: [urge()] });
  const steps = buildFullCombinedSteps(plan, "skipped");
  const k = kinds(steps);
  assert.equal(k.includes("urge_preventive_stopping"), true);
  assert.equal(k.includes("processing"), true);
  assert.equal(k.includes("state_regulation_anchor"), false);
});

test("Urge with State: preventive stopping precedes shared Stay, and the State block still appears", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["u1"], itemRelationships: { u1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" }),
    items: [urge()],
    stateProfiles: [completeState()],
  });
  const steps = buildFullCombinedSteps(plan, "skipped");
  assert.ok(steps.findIndex((s) => s.kind === "urge_preventive_stopping") < steps.findIndex((s) => s.kind === "shared_stay"));
  assert.equal(kinds(steps).includes("state_regulation_anchor"), true);
});

// --- Multiple factors share Stay/Acceptance/State stages once ---

test("multiple factors share shared_stay/shared_acceptance/State stages exactly once each, never duplicated per factor", () => {
  const plan = resolve({
    config: config({
      interferenceItemIds: ["t1", "b1", "u1"],
      itemRelationships: { t1: { actionRelationship: "same_action" }, b1: { actionRelationship: "same_action" }, u1: { actionRelationship: "same_action" } },
      stateInclusionPolicy: "linked",
      stateProfileId: "s1",
    }),
    items: [thought(), belief(), urge()],
    stateProfiles: [completeState()],
    primaryFactorId: "t1",
  });
  const steps = buildFullCombinedSteps(plan, "skipped");
  const k = kinds(steps);
  assert.equal(k.filter((kind) => kind === "shared_stay").length, 1);
  assert.equal(k.filter((kind) => kind === "shared_acceptance").length, 1);
  assert.equal(k.filter((kind) => kind === "state_regulation_anchor").length, 1);
  assert.equal(k.filter((kind) => kind === "state_desired_state_encoding").length, 1);
});

// --- No Emotion rating unless Emotion selected ---

test("Emotion recognition/processing steps never appear unless Emotion was explicitly selected", () => {
  const plan = resolve({ config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }), items: [thought()] });
  const steps = buildFullCombinedSteps(plan, "skipped");
  assert.equal(steps.some((s) => s.category === "emotion"), false);
});

test("Emotion, when selected, always resolves with a required complete State (state_only outcome) and its own recognition/processing steps appear", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["e1"], itemRelationships: { e1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" }),
    items: [emotion()],
    stateProfiles: [completeState()],
  });
  const steps = buildFullCombinedSteps(plan, "skipped");
  assert.equal(steps.some((s) => s.kind === "recognition" && s.category === "emotion"), true);
  assert.equal(steps.some((s) => s.kind === "processing" && s.category === "emotion"), true);
  assert.equal(kinds(steps).includes("state_action"), true);
});

test("method-completion correction: Emotion's own replacement-response step (always neutral content -- see arc/combinedFactorPlanCopy.ts's own getEmotionProcessingStepCopy) still takes its BUILD-order place inside Encoding, after State's own desired-state encoding, alongside another factor", () => {
  const plan = resolve({
    config: config({
      interferenceItemIds: ["e1", "t1"],
      itemRelationships: { e1: { actionRelationship: "legacy_unspecified" }, t1: { actionRelationship: "same_action" } },
      stateInclusionPolicy: "linked",
      stateProfileId: "s1",
    }),
    items: [emotion(), thought()],
    stateProfiles: [completeState()],
    primaryFactorId: "e1",
  });
  const steps = buildFullCombinedSteps(plan, "skipped", goalConnection());
  const k = kinds(steps);
  const encodingIdx = k.indexOf("state_desired_state_encoding");
  const processingSteps = steps.filter((s) => s.kind === "processing");

  assert.deepEqual(
    processingSteps.map((s) => ({ itemId: s.itemId, category: s.category })),
    [
      { itemId: "e1", category: "emotion" },
      { itemId: "t1", category: "thought" },
    ],
    "Emotion's own replacement-response step appears exactly once, in BUILD order alongside Thought's"
  );
  const emotionProcessingIdx = steps.findIndex((s) => s.kind === "processing" && s.category === "emotion");
  assert.ok(encodingIdx >= 0 && emotionProcessingIdx > encodingIdx, "Emotion's replacement-response step still follows State's own Encoding content, exactly like every other category");
});

// --- Checkpoint boundaries ---

test("checkpoint 1 (afterAwareness) precedes recognition-adjacent preventive stopping and Stay/Acceptance", () => {
  const plan = resolve({
    config: config({
      interferenceItemIds: ["u1"],
      itemRelationships: { u1: { actionRelationship: "legacy_unspecified" } },
      stateInclusionPolicy: "none",
    }),
    items: [urge()],
  });
  const steps = buildFullCombinedSteps(plan, "skipped");
  const awarenessIdx = steps.findIndex((s) => s.kind === "rating_checkpoint" && s.checkpoint === "afterAwareness");
  const preventiveIdx = steps.findIndex((s) => s.kind === "urge_preventive_stopping");
  assert.ok(awarenessIdx < preventiveIdx);
});

test("checkpoint 2 (afterStayAcceptance) follows both shared_stay and shared_acceptance", () => {
  const plan = resolve({ config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }), items: [thought()] });
  const steps = buildFullCombinedSteps(plan, "skipped");
  const stayIdx = steps.findIndex((s) => s.kind === "shared_stay");
  const acceptanceIdx = steps.findIndex((s) => s.kind === "shared_acceptance");
  const checkpointIdx = steps.findIndex((s) => s.kind === "rating_checkpoint" && s.checkpoint === "afterStayAcceptance");
  assert.ok(stayIdx < checkpointIdx && acceptanceIdx < checkpointIdx);
});

// --- Factor interventions precede State Encoding ---

test("method-completion correction: factor-specific interventions (replacement thought/belief/movement) now FOLLOW State desired-state Encoding, as part of the Encoding / New-Response Practice block, never before Regulation/Goal Connection", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" }),
    items: [thought()],
    stateProfiles: [completeState()],
  });
  const steps = buildFullCombinedSteps(plan, "skipped");
  const processingIdx = steps.findIndex((s) => s.kind === "processing");
  const encodingIdx = steps.findIndex((s) => s.kind === "state_desired_state_encoding");
  assert.ok(encodingIdx < processingIdx, "State's own desired-state encoding comes first, then the factor's own replacement response");
});

// --- Presence precedes State Encoding when Presence runs ---

test("Presence precedes State desired-state Encoding when Presence runs (embedded or full)", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" }),
    items: [thought()],
    stateProfiles: [completeState()],
  });
  const embedded = buildFullCombinedSteps(plan, "embedded");
  const presenceIdx = embedded.findIndex((s) => s.kind === "presence");
  const encodingIdx = embedded.findIndex((s) => s.kind === "state_desired_state_encoding");
  assert.ok(presenceIdx >= 0 && presenceIdx < encodingIdx);

  const full = buildFullCombinedSteps(plan, "full");
  assert.ok(full.findIndex((s) => s.kind === "presence") < full.findIndex((s) => s.kind === "state_desired_state_encoding"));
});

test("no Presence step at all when finalPresenceMode is skipped", () => {
  const plan = resolve({ config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }), items: [thought()] });
  const steps = buildFullCombinedSteps(plan, "skipped");
  assert.equal(kinds(steps).includes("presence"), false);
});

// --- Desired-state rating scale (documentation-level assertion of intent -- see arc/ratings.ts) ---

test("desired_state_rating is its own distinct step kind, structurally impossible to merge with a factor rating_checkpoint", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" }),
    items: [thought()],
    stateProfiles: [completeState()],
  });
  const steps = buildFullCombinedSteps(plan, "skipped");
  const ratingStep = steps.find((s) => s.kind === "desired_state_rating");
  assert.ok(ratingStep);
  assert.notEqual(ratingStep!.kind, "rating_checkpoint");
});

// --- Terminal boundary ---

test("terminal_boundary is always the last step", () => {
  const plan = resolve({ config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }), items: [thought()] });
  const steps = buildFullCombinedSteps(plan, "skipped");
  assert.equal(steps[steps.length - 1].kind, "terminal_boundary");
});

// --- Cognitive reassessment ---

// --- Phase 14B-4: staged Full-awareness API regression coverage ---

test("buildFullCombinedSteps is exactly the concatenation of buildFullAwarenessSteps + buildFullStepsAfterPrimaryResolution -- for every plan shape, no drift possible", () => {
  const cases: { plan: ResolvedCombinedFactorPlan; presence: Parameters<typeof buildFullCombinedSteps>[1] }[] = [
    { plan: resolve({ config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }), items: [thought()] }), presence: "skipped" },
    {
      plan: resolve({
        config: config({
          interferenceItemIds: ["t1", "b1", "u1"],
          itemRelationships: { t1: { actionRelationship: "same_action" }, b1: { actionRelationship: "same_action" }, u1: { actionRelationship: "same_action" } },
          stateInclusionPolicy: "linked",
          stateProfileId: "s1",
        }),
        items: [thought(), belief(), urge()],
        stateProfiles: [completeState()],
        primaryFactorId: "t1",
      }),
      presence: "embedded",
    },
    {
      plan: resolve({
        config: config({ interferenceItemIds: ["e1"], itemRelationships: { e1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" }),
        items: [emotion()],
        stateProfiles: [completeState()],
      }),
      presence: "full",
    },
  ];
  for (const { plan, presence } of cases) {
    const combined = buildFullCombinedSteps(plan, presence);
    const split = [...buildFullAwarenessSteps({ factors: plan.factors, presence: plan.presence }), ...buildFullStepsAfterPrimaryResolution(plan, presence)];
    assert.deepEqual(combined, split);
  }
});

test("buildFullAwarenessSteps emits exactly one recognition step per factor followed by exactly one afterAwareness checkpoint -- never more, never fewer, regardless of factor count", () => {
  const plan = resolve({
    config: config({
      interferenceItemIds: ["t1", "b1", "u1"],
      itemRelationships: { t1: { actionRelationship: "same_action" }, b1: { actionRelationship: "same_action" }, u1: { actionRelationship: "same_action" } },
      stateInclusionPolicy: "none",
    }),
    items: [thought(), belief(), urge()],
    primaryFactorId: "t1",
  });
  const awareness = buildFullAwarenessSteps({ factors: plan.factors, presence: plan.presence });
  assert.equal(awareness.filter((s) => s.kind === "recognition").length, 3);
  assert.equal(awareness.filter((s) => s.kind === "rating_checkpoint" && s.checkpoint === "afterAwareness").length, 1);
  assert.equal(awareness.length, 4, "no other step kind belongs in the Awareness prefix");
});

test("buildFullAwarenessSteps returns an empty array for a Presence-only, zero-factor plan -- no fabricated recognition/checkpoint", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: [], presenceEnabled: true, linkedPresenceArcId: "p1", presenceActionRelationship: "legacy_unspecified", stateInclusionPolicy: "none" }),
    presenceArcs: [{ id: "p1", name: "נוכחות", createdAt: NOW, updatedAt: NOW, presenceColor: null, presenceDwellSeconds: null, beneficialAction: "פעולת נוכחות", postActionImageryDwellSeconds: null, gratitudePrompt: null }],
  });
  assert.deepEqual(buildFullAwarenessSteps({ factors: plan.factors, presence: plan.presence }), []);
});

test("buildFullStepsAfterPrimaryResolution never contains a recognition step or an afterAwareness checkpoint -- those belong exclusively to buildFullAwarenessSteps, proving a future Awareness-prefix change cannot silently duplicate into the remainder", () => {
  const plan = resolve({
    config: config({
      interferenceItemIds: ["t1", "u1"],
      itemRelationships: { t1: { actionRelationship: "same_action" }, u1: { actionRelationship: "same_action" } },
      stateInclusionPolicy: "linked",
      stateProfileId: "s1",
    }),
    items: [thought(), urge()],
    stateProfiles: [completeState()],
    primaryFactorId: "t1",
  });
  const remainder = buildFullStepsAfterPrimaryResolution(plan, "full");
  assert.equal(remainder.some((s) => s.kind === "recognition"), false);
  assert.equal(remainder.some((s) => s.kind === "rating_checkpoint" && s.checkpoint === "afterAwareness"), false);
});

test("cognitive_reassessment appears once only when Thought and/or Belief selected", () => {
  const withThought = buildFullCombinedSteps(
    resolve({ config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }), items: [thought()] }),
    "skipped"
  );
  assert.equal(kinds(withThought).filter((k) => k === "cognitive_reassessment").length, 1);

  const withUrgeOnly = buildFullCombinedSteps(
    resolve({ config: config({ interferenceItemIds: ["u1"], itemRelationships: { u1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }), items: [urge()] }),
    "skipped"
  );
  assert.equal(kinds(withUrgeOnly).includes("cognitive_reassessment"), false);
});

// ---------------------------------------------------------------------------
// Goal Connection -- Adaptive ARC architecture task (unified PD/ARC Goal),
// Phase 7: "Acceptance -> Regulation -> Goal Connection -> Encoding".
// ---------------------------------------------------------------------------

function goalConnection(overrides: Partial<PersonalDevelopmentRouteGoalConnection> = {}): PersonalDevelopmentRouteGoalConnection {
  return { desiredResultText: "תוצאה", valueText: "ערך", personalReasonText: "סיבה", ...overrides };
}

test("goal_connection is omitted entirely when the route has no configured Goal Connection, even with State included", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" }),
    items: [thought()],
    stateProfiles: [completeState()],
  });
  const steps = buildFullStepsAfterPrimaryResolution(plan, "skipped", null);
  assert.equal(kinds(steps).includes("goal_connection"), false);
});

test("goal_connection is omitted when Goal Connection is configured but the route has no State -- it only ever appears inside the State block", () => {
  const plan = resolve({ config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }), items: [thought()] });
  const steps = buildFullStepsAfterPrimaryResolution(plan, "skipped", goalConnection());
  assert.equal(kinds(steps).includes("goal_connection"), false);
});

test("goal_connection appears exactly once, immediately before state_desired_state_encoding, when both State and Goal Connection are configured", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" }),
    items: [thought()],
    stateProfiles: [completeState()],
  });
  const steps = buildFullStepsAfterPrimaryResolution(plan, "skipped", goalConnection());
  const goalConnectionIndices = steps.map((s, i) => (s.kind === "goal_connection" ? i : -1)).filter((i) => i !== -1);
  assert.equal(goalConnectionIndices.length, 1, "goal_connection appears exactly once");
  const encodingIdx = steps.findIndex((s) => s.kind === "state_desired_state_encoding");
  assert.equal(goalConnectionIndices[0], encodingIdx - 1, "goal_connection sits immediately before state_desired_state_encoding");
});

test("the approved order holds: shared_acceptance -> state_regulation_anchor -> goal_connection -> state_desired_state_encoding", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" }),
    items: [thought()],
    stateProfiles: [completeState()],
  });
  const steps = kinds(buildFullStepsAfterPrimaryResolution(plan, "skipped", goalConnection()));
  const acceptanceIdx = steps.indexOf("shared_acceptance");
  const regulationIdx = steps.indexOf("state_regulation_anchor");
  const goalConnectionIdx = steps.indexOf("goal_connection");
  const encodingIdx = steps.indexOf("state_desired_state_encoding");
  assert.ok(acceptanceIdx >= 0 && acceptanceIdx < regulationIdx, "Acceptance before Regulation");
  assert.ok(regulationIdx < goalConnectionIdx, "Regulation before Goal Connection");
  assert.ok(goalConnectionIdx < encodingIdx, "Goal Connection before Encoding");
});

test("buildFullCombinedSteps threads goalConnection through to the same effect as buildFullStepsAfterPrimaryResolution", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" }),
    items: [thought()],
    stateProfiles: [completeState()],
  });
  const steps = buildFullCombinedSteps(plan, "skipped", goalConnection());
  assert.equal(kinds(steps).includes("goal_connection"), true);
});

// ---------------------------------------------------------------------------
// Method-completion correction (final ordering): Regulation -> Goal
// Connection -> Encoding (State content, then every factor's own
// replacement response in BUILD order) -> Action. New comprehensive
// coverage per the approved correction: multiple factors in a
// deliberately category-scrambling BUILD order, every optional step
// omitted in turn, and no duplicate replacement content anywhere.
// ---------------------------------------------------------------------------

test("multiple factors' own replacement responses appear in plain BUILD (config.interferenceItemIds) order -- never RECOGNITION_CATEGORY_ORDER's or PROCESSING_CATEGORY_ORDER's fixed category grouping", () => {
  // u1/t1/b1 deliberately does not match either fixed category order:
  // RECOGNITION_CATEGORY_ORDER would give t1,b1,u1; PROCESSING_CATEGORY_ORDER
  // (Mini's own, still unused by Full for this step) would give u1,b1,t1.
  const plan = resolve({
    config: config({
      interferenceItemIds: ["u1", "t1", "b1"],
      itemRelationships: { u1: { actionRelationship: "same_action" }, t1: { actionRelationship: "same_action" }, b1: { actionRelationship: "same_action" } },
      stateInclusionPolicy: "linked",
      stateProfileId: "s1",
    }),
    items: [urge(), thought(), belief()],
    stateProfiles: [completeState()],
    primaryFactorId: "u1",
  });
  const steps = buildFullCombinedSteps(plan, "skipped");
  const processingItemIds = steps.filter((s) => s.kind === "processing").map((s) => s.itemId);
  assert.deepEqual(processingItemIds, ["u1", "t1", "b1"], "replacement responses render in exactly config.interferenceItemIds order");
});

test("every factor's own replacement response appears exactly once -- no duplicate replacement content anywhere in the spine", () => {
  const plan = resolve({
    config: config({
      interferenceItemIds: ["t1", "b1", "u1"],
      itemRelationships: { t1: { actionRelationship: "same_action" }, b1: { actionRelationship: "same_action" }, u1: { actionRelationship: "same_action" } },
      stateInclusionPolicy: "linked",
      stateProfileId: "s1",
    }),
    items: [thought(), belief(), urge()],
    stateProfiles: [completeState()],
    primaryFactorId: "t1",
  });
  const steps = buildFullCombinedSteps(plan, "embedded", goalConnection());
  const processingSteps = steps.filter((s) => s.kind === "processing");
  assert.equal(processingSteps.length, 3, "exactly one processing step per factor, never more");
  assert.deepEqual(
    processingSteps.map((s) => s.itemId).sort(),
    ["b1", "t1", "u1"],
    "every factor's own replacement response appears, none duplicated, none missing"
  );
});

test("replacement-response steps still appear, in BUILD order, on a no-State route -- Goal Connection/State Encoding/desired-state rating are all correctly absent, but factor-specific Encoding content is not", () => {
  const plan = resolve({
    config: config({
      interferenceItemIds: ["t1", "u1"],
      itemRelationships: { t1: { actionRelationship: "legacy_unspecified" }, u1: { actionRelationship: "legacy_unspecified" } },
      stateInclusionPolicy: "none",
    }),
    items: [thought(), urge()],
    primaryFactorId: "t1",
  });
  const steps = buildFullCombinedSteps(plan, "skipped", goalConnection());
  const k = kinds(steps);
  assert.equal(k.includes("goal_connection"), false, "Goal Connection never renders without State");
  assert.equal(k.includes("state_desired_state_encoding"), false);
  assert.equal(k.includes("desired_state_rating"), false);
  assert.deepEqual(
    steps.filter((s) => s.kind === "processing").map((s) => s.itemId),
    ["t1", "u1"],
    "factor-specific replacement-response practice still happens, in BUILD order, even with no State at all"
  );
});

test("replacement-response steps still appear when beneficialActionPolicy is 'none' -- the action step is skipped, Encoding's own replacement-response content is not", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" }),
    items: [thought()],
    stateProfiles: [completeState()],
  });
  const steps = buildFullCombinedSteps(plan, "skipped", null, "none");
  const k = kinds(steps);
  assert.equal(k.includes("state_action"), false);
  assert.equal(k.includes("factor_action"), false);
  assert.equal(k.includes("processing"), true, "the replacement response is never skipped just because the action step is absent");
  const processingIdx = k.indexOf("processing");
  const terminalIdx = k.indexOf("terminal_boundary");
  assert.ok(processingIdx < terminalIdx, "processing still precedes terminal_boundary");
});

test("replacement-response steps still appear, correctly positioned after Encoding, when Presence is skipped (finalPresenceMode 'skipped')", () => {
  const plan = resolve({
    config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" }),
    items: [thought()],
    stateProfiles: [completeState()],
  });
  const steps = buildFullCombinedSteps(plan, "skipped");
  const k = kinds(steps);
  assert.equal(k.includes("presence"), false);
  const encodingIdx = k.indexOf("state_desired_state_encoding");
  const processingIdx = k.indexOf("processing");
  assert.ok(encodingIdx >= 0 && processingIdx > encodingIdx, "processing still follows Encoding even with Presence entirely absent");
});

test("the full approved order holds end to end: Acceptance -> Regulation -> Goal Connection -> Encoding (State content, then every replacement response in BUILD order) -> Action, for a multi-factor with-State with-Presence with-Goal-Connection route", () => {
  const plan = resolve({
    config: config({
      interferenceItemIds: ["b1", "u1", "t1"],
      itemRelationships: { b1: { actionRelationship: "same_action" }, u1: { actionRelationship: "same_action" }, t1: { actionRelationship: "same_action" } },
      stateInclusionPolicy: "linked",
      stateProfileId: "s1",
    }),
    items: [belief(), urge(), thought()],
    stateProfiles: [completeState()],
    primaryFactorId: "b1",
  });
  const steps = buildFullCombinedSteps(plan, "embedded", goalConnection());
  const k = kinds(steps);
  const acceptanceIdx = k.indexOf("shared_acceptance");
  const regulationIdx = k.indexOf("state_regulation_anchor");
  const goalConnectionIdx = k.indexOf("goal_connection");
  const encodingIdx = k.indexOf("state_desired_state_encoding");
  const processingIndices = steps.map((s, i) => (s.kind === "processing" ? i : -1)).filter((i) => i !== -1);
  const ratingIdx = k.indexOf("desired_state_rating");
  const actionIndices = [k.indexOf("state_action"), k.indexOf("factor_action")].filter((i) => i !== -1);
  const firstActionIdx = Math.min(...actionIndices);

  assert.ok(acceptanceIdx < regulationIdx, "Acceptance before Regulation");
  assert.ok(regulationIdx < goalConnectionIdx, "Regulation before Goal Connection");
  assert.ok(goalConnectionIdx < encodingIdx, "Goal Connection at the end of Regulation, before Encoding begins");
  assert.ok(encodingIdx < processingIndices[0], "State's own Encoding content before any replacement response");
  assert.deepEqual(
    processingIndices.map((i) => steps[i].itemId),
    ["b1", "u1", "t1"],
    "every replacement response appears once, in BUILD order, immediately as part of Encoding"
  );
  assert.ok(processingIndices[processingIndices.length - 1] < ratingIdx, "the desired-state rating follows the whole Encoding/New-Response-Practice block");
  assert.ok(ratingIdx < firstActionIdx, "Action begins only after the whole Encoding block is complete");
});
