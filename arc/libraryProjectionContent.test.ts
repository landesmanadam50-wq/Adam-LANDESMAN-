import test from "node:test";
import assert from "node:assert/strict";

import {
  buildProjectionCompletionInput,
  resolveActionOnlyProjectionContent,
  resolveFullProjectionContent,
  resolveIdentityApplicability,
  resolveLinkProjectionContent,
  resolveMiniProjectionContent,
  validateProjectionIdentityRequirement,
} from "./libraryProjectionContent.ts";
import type { ProjectionCompletionObservations } from "./libraryProjectionContent.ts";
import { createEmptyStateProfile } from "./stateProfile.ts";
import type { StateProfile } from "./stateProfile.ts";
import { createEmptyIdentityProfile } from "./identityProfile.ts";
import type { IdentityProfile } from "./identityProfile.ts";
import {
  createEmptyBeliefInterferenceItem,
  createEmptyEmotionInterferenceItem,
  createEmptyMiniOverrideConfig,
  createEmptyThoughtInterferenceItem,
  createEmptyUrgeInterferenceItem,
} from "./interferenceItem.ts";
import { evaluateProjectionCompletion } from "./projectionCompletion.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function stateProfile(overrides: Partial<StateProfile> = {}): StateProfile {
  return { ...createEmptyStateProfile("state1", "רוגע", "prog1", NOW), ...overrides };
}

function identityProfile(overrides: Partial<IdentityProfile> = {}): IdentityProfile {
  return { ...createEmptyIdentityProfile("identity1", "אדם רגוע", "prog1", NOW), ...overrides };
}

function observations(overrides: Partial<ProjectionCompletionObservations> = {}): ProjectionCompletionObservations {
  return {
    stateActionReached: false,
    stateRealActionCompleted: false,
    identityActionReached: false,
    identityRealActionCompleted: false,
    linkReachedFinalStage: false,
    linkRequiredDwellsCompleted: false,
    linkCompletionAcknowledged: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resolveIdentityApplicability
// ---------------------------------------------------------------------------

test("resolveIdentityApplicability: Self Development follows the explicit identitySelected input", () => {
  assert.equal(resolveIdentityApplicability("personal_development", true), true);
  assert.equal(resolveIdentityApplicability("personal_development", false), false);
});

test("resolveIdentityApplicability: ARC Goal is always true, regardless of identitySelected", () => {
  assert.equal(resolveIdentityApplicability("goal_achievement", true), true);
  assert.equal(resolveIdentityApplicability("goal_achievement", false), true);
});

// ---------------------------------------------------------------------------
// validateProjectionIdentityRequirement
// ---------------------------------------------------------------------------

test("validateProjectionIdentityRequirement: Self Development is always valid, with or without a resolved Identity", () => {
  const state = stateProfile();
  assert.deepEqual(validateProjectionIdentityRequirement("personal_development", state, null), { valid: true, source: "new", reason: null });
  assert.deepEqual(validateProjectionIdentityRequirement("personal_development", state, "identity1"), { valid: true, source: "new", reason: null });
});

test("validateProjectionIdentityRequirement: ARC Goal is valid only when an Identity actually resolves", () => {
  const state = stateProfile();
  assert.deepEqual(validateProjectionIdentityRequirement("goal_achievement", state, "identity1"), { valid: true, source: "new", reason: null });
});

test("validateProjectionIdentityRequirement: ARC Goal without a resolved Identity returns a typed invalid result, never throws", () => {
  const state = stateProfile();
  const result = validateProjectionIdentityRequirement("goal_achievement", state, null);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "goal_requires_identity");
});

// ---------------------------------------------------------------------------
// Full projection
// ---------------------------------------------------------------------------

test("resolveFullProjectionContent: delegates content resolution to the Phase 4 resolver", () => {
  const state = stateProfile({ regulationAnchor: "נשימה", encodingCue: "יד על הלב", action: "לצאת להליכה" });
  const result = resolveFullProjectionContent(state, null, null, "personal_development", false);
  assert.equal(result.content.regulationCue, "נשימה");
  assert.equal(result.content.encodingCue, "יד על הלב");
  assert.equal(result.content.action, "לצאת להליכה");
});

test("resolveFullProjectionContent: identityApplicable follows Self Development selection / Goal-always-mandatory", () => {
  const state = stateProfile();
  assert.equal(resolveFullProjectionContent(state, null, null, "personal_development", false).identityApplicable, false);
  assert.equal(resolveFullProjectionContent(state, null, null, "personal_development", true).identityApplicable, true);
  assert.equal(resolveFullProjectionContent(state, null, null, "goal_achievement", false).identityApplicable, true);
});

test("resolveFullProjectionContent: never mutates its inputs", () => {
  const state = stateProfile();
  const item = createEmptyThoughtInterferenceItem("t1", "x", "prog1", NOW);
  const identity = identityProfile();
  const stateCopy = JSON.parse(JSON.stringify(state));
  const itemCopy = JSON.parse(JSON.stringify(item));
  const identityCopy = JSON.parse(JSON.stringify(identity));
  resolveFullProjectionContent(state, item, identity, "goal_achievement", true);
  assert.deepEqual(state, stateCopy);
  assert.deepEqual(item, itemCopy);
  assert.deepEqual(identity, identityCopy);
});

// ---------------------------------------------------------------------------
// Mini projection
// ---------------------------------------------------------------------------

test("resolveMiniProjectionContent: Mini override wins for every field it covers, falling back to item/state where it doesn't", () => {
  const state = stateProfile({ regulationAnchor: "בסיס", encodingCue: "בסיס", action: "בסיס", actionTimerConfig: { durationMinutes: 5 } });
  const item = {
    ...createEmptyThoughtInterferenceItem("t1", "x", "prog1", NOW),
    thoughtText: "מחשבה מטרידה",
    situationContext: "בעבודה",
    regulationCue: "מרמת הפריט",
    miniOverride: {
      ...createEmptyMiniOverrideConfig(),
      shortRecognitionCue: "רמז קצר",
      regulationAnchorOverride: "מיני רגולציה",
      encodingCueOverride: "מיני קידוד",
      stateActionOverride: "מיני פעולה",
      stateActionDurationOverrideMinutes: 2,
    },
  };
  const result = resolveMiniProjectionContent(state, item, null, "personal_development", false);
  assert.equal(result.recognitionCue, "רמז קצר");
  assert.equal(result.regulationCue, "מיני רגולציה");
  assert.equal(result.encodingCue, "מיני קידוד");
  assert.equal(result.action, "מיני פעולה");
  assert.equal(result.actionDurationMinutes, 2);
});

test("resolveMiniProjectionContent: with no Mini override set, falls back to the item's own field, then the base StateProfile", () => {
  const state = stateProfile({ regulationAnchor: "בסיס", actionTimerConfig: { durationMinutes: 5 } });
  const item = {
    ...createEmptyThoughtInterferenceItem("t1", "מחשבה", "prog1", NOW),
    thoughtText: "מחשבה מטרידה",
    regulationCue: "מרמת הפריט",
    miniOverride: createEmptyMiniOverrideConfig(),
  };
  const result = resolveMiniProjectionContent(state, item, null, "personal_development", false);
  assert.equal(result.recognitionCue, "מחשבה מטרידה");
  assert.equal(result.regulationCue, "מרמת הפריט");
  assert.equal(result.actionDurationMinutes, 5, "no Mini duration override -- falls back to the base StateProfile's own actionTimerConfig");
});

test("resolveMiniProjectionContent: preventiveStoppingAction is populated only for an Urge item, Mini override wins over the item's own field", () => {
  const urge = { ...createEmptyUrgeInterferenceItem("u1", "x", "prog1", NOW), preventiveStoppingAction: "להניח את הטלפון" };
  const resultUrge = resolveMiniProjectionContent(stateProfile(), urge, null, "personal_development", false);
  assert.equal(resultUrge.preventiveStoppingAction, "להניח את הטלפון");

  const urgeWithMini = { ...urge, miniOverride: { ...createEmptyMiniOverrideConfig(), preventiveStoppingActionOverride: "מיני עצירה" } };
  const resultUrgeMini = resolveMiniProjectionContent(stateProfile(), urgeWithMini, null, "personal_development", false);
  assert.equal(resultUrgeMini.preventiveStoppingAction, "מיני עצירה");

  const belief = createEmptyBeliefInterferenceItem("b1", "x", "prog1", NOW);
  const resultBelief = resolveMiniProjectionContent(stateProfile(), belief, null, "personal_development", false);
  assert.equal(resultBelief.preventiveStoppingAction, null);
});

test("resolveMiniProjectionContent: Identity fields are null when not applicable, and Mini identity overrides win when applicable", () => {
  const state = stateProfile({ primaryIdentityProfileId: "identity1" });
  const item = createEmptyThoughtInterferenceItem("t1", "x", "prog1", NOW);
  const identity = identityProfile({ id: "identity1", encodingCue: "מנטרה", action: "לרוץ" });

  const notApplicable = resolveMiniProjectionContent(state, item, identity, "personal_development", false);
  assert.equal(notApplicable.identityApplicable, false);
  assert.equal(notApplicable.identityCue, null);
  assert.equal(notApplicable.identityAction, null);

  const applicable = resolveMiniProjectionContent(state, item, identity, "personal_development", true);
  assert.equal(applicable.identityApplicable, true);
  assert.equal(applicable.identityCue, "מנטרה");
  assert.equal(applicable.identityAction, "לרוץ");

  const itemWithMiniIdentity = { ...item, miniOverride: { ...createEmptyMiniOverrideConfig(), identityCueOverride: "מיני זהות", identityActionOverride: "מיני פעולת זהות" } };
  const withMiniOverride = resolveMiniProjectionContent(state, itemWithMiniIdentity, identity, "personal_development", true);
  assert.equal(withMiniOverride.identityCue, "מיני זהות");
  assert.equal(withMiniOverride.identityAction, "מיני פעולת זהות");
});

test("resolveMiniProjectionContent: a blank/whitespace-only Mini override never erases a meaningful fallback value", () => {
  const item = {
    ...createEmptyThoughtInterferenceItem("t1", "מחשבה", "prog1", NOW),
    thoughtText: "מחשבה מטרידה",
    miniOverride: { ...createEmptyMiniOverrideConfig(), shortRecognitionCue: "   " },
  };
  const result = resolveMiniProjectionContent(stateProfile(), item, null, "personal_development", false);
  assert.equal(result.recognitionCue, "מחשבה מטרידה");
});

test("resolveMiniProjectionContent: never mutates its inputs", () => {
  const state = stateProfile();
  const item = { ...createEmptyUrgeInterferenceItem("u1", "x", "prog1", NOW), miniOverride: createEmptyMiniOverrideConfig() };
  const identity = identityProfile();
  const stateCopy = JSON.parse(JSON.stringify(state));
  const itemCopy = JSON.parse(JSON.stringify(item));
  const identityCopy = JSON.parse(JSON.stringify(identity));
  resolveMiniProjectionContent(state, item, identity, "goal_achievement", true);
  assert.deepEqual(state, stateCopy);
  assert.deepEqual(item, itemCopy);
  assert.deepEqual(identity, identityCopy);
});

// ---------------------------------------------------------------------------
// ARC Link projection
// ---------------------------------------------------------------------------

test("resolveLinkProjectionContent: Thought recognition is exposed", () => {
  const item = { ...createEmptyThoughtInterferenceItem("t1", "מחשבה", "prog1", NOW), thoughtText: "אני לא מספיק טוב", situationContext: "בעבודה" };
  const result = resolveLinkProjectionContent(stateProfile(), item, null, "personal_development", false);
  assert.match(result.recognitionCue as string, /אני לא מספיק טוב/);
  assert.match(result.recognitionCue as string, /בעבודה/);
});

test("resolveLinkProjectionContent: Belief recognition is exposed", () => {
  const item = { ...createEmptyBeliefInterferenceItem("b1", "אמונה", "prog1", NOW), beliefText: "אני לא מתמיד" };
  const result = resolveLinkProjectionContent(stateProfile(), item, null, "personal_development", false);
  assert.match(result.recognitionCue as string, /אני לא מתמיד/);
});

test("resolveLinkProjectionContent: Urge recognition and preventiveStoppingAction are exposed", () => {
  const item = { ...createEmptyUrgeInterferenceItem("u1", "דחף", "prog1", NOW), urgeName: "דחף לעישון", preventiveStoppingAction: "להניח את הטלפון" };
  const result = resolveLinkProjectionContent(stateProfile(), item, null, "personal_development", false);
  assert.match(result.recognitionCue as string, /דחף לעישון/);
  assert.equal(result.preventiveStoppingAction, "להניח את הטלפון");
});

test("resolveLinkProjectionContent: Emotion content is exposed without a duplicate component", () => {
  const item = {
    ...createEmptyEmotionInterferenceItem("e1", "תסכול", "prog1", NOW),
    emotionName: "תסכול",
    situationContext: "מול לוח זמנים",
    regulationCue: "כפות רגליים על הרצפה",
  };
  const result = resolveLinkProjectionContent(stateProfile({ regulationAnchor: "בסיס" }), item, null, "personal_development", false);
  assert.match(result.recognitionCue as string, /תסכול/);
  assert.match(result.recognitionCue as string, /מול לוח זמנים/);
  assert.equal(result.regulationCue, "כפות רגליים על הרצפה", "the item's own content is used -- LinkProjectionContent has no separate 'component' concept to duplicate");
});

test("resolveLinkProjectionContent: Self Development without Identity has no Identity content", () => {
  const state = stateProfile({ primaryIdentityProfileId: "identity1" });
  const item = createEmptyThoughtInterferenceItem("t1", "x", "prog1", NOW);
  const identity = identityProfile({ id: "identity1", encodingCue: "מנטרה", action: "לרוץ" });
  const result = resolveLinkProjectionContent(state, item, identity, "personal_development", false);
  assert.equal(result.identityApplicable, false);
  assert.equal(result.identityCue, null);
  assert.equal(result.identityAction, null);
});

test("resolveLinkProjectionContent: Self Development with selected Identity includes Identity cue/action", () => {
  const state = stateProfile({ primaryIdentityProfileId: "identity1" });
  const item = createEmptyThoughtInterferenceItem("t1", "x", "prog1", NOW);
  const identity = identityProfile({ id: "identity1", encodingCue: "מנטרה", action: "לרוץ" });
  const result = resolveLinkProjectionContent(state, item, identity, "personal_development", true);
  assert.equal(result.identityApplicable, true);
  assert.equal(result.identityCue, "מנטרה");
  assert.equal(result.identityAction, "לרוץ");
});

test("resolveLinkProjectionContent: ARC Goal Link includes required Identity cue/action", () => {
  const state = stateProfile({ primaryIdentityProfileId: "identity1" });
  const item = createEmptyThoughtInterferenceItem("t1", "x", "prog1", NOW);
  const identity = identityProfile({ id: "identity1", encodingCue: "מנטרת המטרה", action: "לפעול לקראת המטרה" });
  const result = resolveLinkProjectionContent(state, item, identity, "goal_achievement", false);
  assert.equal(result.identityApplicable, true);
  assert.equal(result.identityCue, "מנטרת המטרה");
  assert.equal(result.identityAction, "לפעול לקראת המטרה");
});

test("resolveLinkProjectionContent: ARC Goal Link without a resolved Identity returns typed invalid validation (never silently State-only)", () => {
  const state = stateProfile({ primaryIdentityProfileId: null });
  const item = createEmptyThoughtInterferenceItem("t1", "x", "prog1", NOW);
  const content = resolveLinkProjectionContent(state, item, null, "goal_achievement", false);
  // Content resolution itself never throws -- identityApplicable is still
  // true by policy (Goal always requires Identity), but nothing actually
  // resolved, so the cue/action stay null.
  assert.equal(content.identityApplicable, true);
  assert.equal(content.identityCue, null);
  const validation = validateProjectionIdentityRequirement("goal_achievement", state, null);
  assert.equal(validation.valid, false);
  assert.equal(validation.reason, "goal_requires_identity");
});

test("resolveLinkProjectionContent: never mutates its inputs", () => {
  const state = stateProfile();
  const item = createEmptyEmotionInterferenceItem("e1", "x", "prog1", NOW);
  const identity = identityProfile();
  const stateCopy = JSON.parse(JSON.stringify(state));
  const itemCopy = JSON.parse(JSON.stringify(item));
  const identityCopy = JSON.parse(JSON.stringify(identity));
  resolveLinkProjectionContent(state, item, identity, "goal_achievement", true);
  assert.deepEqual(state, stateCopy);
  assert.deepEqual(item, itemCopy);
  assert.deepEqual(identity, identityCopy);
});

// --- Link completion input remains rehearsal-based only ---

test("buildProjectionCompletionInput: Link completion input remains purely rehearsal-based and never invents a physical action", () => {
  const input = buildProjectionCompletionInput(
    "link",
    "personal_development",
    "session1",
    true,
    observations({ linkReachedFinalStage: true, linkRequiredDwellsCompleted: true, linkCompletionAcknowledged: true })
  );
  assert.equal(input.projection, "link");
  if (input.projection === "link") {
    assert.deepEqual(input.link, { reachedFinalStage: true, requiredDwellsCompleted: true, completionAcknowledged: true });
  }
  assert.equal("state" in input, false, "a Link input never carries a state/identity action signal -- Stage 2 is rehearsal-only");
  assert.equal("identity" in input, false);
});

// ---------------------------------------------------------------------------
// Action-only projection
// ---------------------------------------------------------------------------

test("resolveActionOnlyProjectionContent: State action and duration resolve", () => {
  const state = stateProfile({ action: "לצאת להליכה", actionTimerConfig: { durationMinutes: 10 } });
  const result = resolveActionOnlyProjectionContent(state, null, null, "personal_development", false);
  assert.equal(result.stateAction, "לצאת להליכה");
  assert.equal(result.stateActionDurationMinutes, 10);
});

test("resolveActionOnlyProjectionContent: Self Development may omit Identity", () => {
  const state = stateProfile({ action: "לצאת להליכה" });
  const result = resolveActionOnlyProjectionContent(state, null, null, "personal_development", false);
  assert.equal(result.identityApplicable, false);
  assert.equal(result.identityAction, null);
  assert.equal(result.identityActionDurationMinutes, null);
});

test("resolveActionOnlyProjectionContent: Self Development with selected Identity includes Identity action and duration", () => {
  const state = stateProfile({ action: "לצאת להליכה", primaryIdentityProfileId: "identity1" });
  const identity = identityProfile({ id: "identity1", action: "לרוץ", actionTimerConfig: { durationMinutes: 15 } });
  const result = resolveActionOnlyProjectionContent(state, null, identity, "personal_development", true);
  assert.equal(result.identityApplicable, true);
  assert.equal(result.identityAction, "לרוץ");
  assert.equal(result.identityActionDurationMinutes, 15);
});

test("resolveActionOnlyProjectionContent: ARC Goal includes mandatory Identity action and duration", () => {
  const state = stateProfile({ action: "לצאת להליכה", primaryIdentityProfileId: "identity1" });
  const identity = identityProfile({ id: "identity1", action: "לפעול לקראת המטרה", actionTimerConfig: { durationMinutes: 20 } });
  const result = resolveActionOnlyProjectionContent(state, null, identity, "goal_achievement", false);
  assert.equal(result.identityApplicable, true);
  assert.equal(result.identityAction, "לפעול לקראת המטרה");
  assert.equal(result.identityActionDurationMinutes, 20);
});

test("resolveActionOnlyProjectionContent: ARC Goal without a resolved Identity returns typed invalid validation, content stays safely null rather than a silent State-only success", () => {
  const state = stateProfile({ action: "לצאת להליכה", primaryIdentityProfileId: null });
  const content = resolveActionOnlyProjectionContent(state, null, null, "goal_achievement", false);
  assert.equal(content.identityApplicable, true, "still policy-applicable -- Goal always requires Identity");
  assert.equal(content.identityAction, null, "nothing actually resolved");
  const validation = validateProjectionIdentityRequirement("goal_achievement", state, null);
  assert.equal(validation.valid, false);
  assert.equal(validation.reason, "goal_requires_identity");
});

test("resolveActionOnlyProjectionContent: no Recognition/Stay/Acceptance/Regulation/Encoding content leaks in -- only action-shaped fields exist on this type", () => {
  const state = stateProfile({ regulationAnchor: "נשימה", encodingCue: "יד על הלב", action: "לצאת להליכה" });
  const result = resolveActionOnlyProjectionContent(state, null, null, "personal_development", false);
  assert.deepEqual(Object.keys(result).sort(), ["identityAction", "identityActionDurationMinutes", "identityApplicable", "stateAction", "stateActionDurationMinutes"].sort());
});

test("resolveActionOnlyProjectionContent: never mutates its inputs", () => {
  const state = stateProfile();
  const item = createEmptyUrgeInterferenceItem("u1", "x", "prog1", NOW);
  const identity = identityProfile();
  const stateCopy = JSON.parse(JSON.stringify(state));
  const itemCopy = JSON.parse(JSON.stringify(item));
  const identityCopy = JSON.parse(JSON.stringify(identity));
  resolveActionOnlyProjectionContent(state, item, identity, "goal_achievement", true);
  assert.deepEqual(state, stateCopy);
  assert.deepEqual(item, itemCopy);
  assert.deepEqual(identity, identityCopy);
});

// ---------------------------------------------------------------------------
// Mini and Full: identity applicability rules
// ---------------------------------------------------------------------------

test("Mini and Full: explicit Self Development Identity selection controls applicability", () => {
  const state = stateProfile();
  const full = resolveFullProjectionContent(state, null, null, "personal_development", true);
  const mini = resolveMiniProjectionContent(state, null, null, "personal_development", true);
  assert.equal(full.identityApplicable, true);
  assert.equal(mini.identityApplicable, true);
});

test("Mini and Full: Goal always requires Identity, regardless of identitySelected", () => {
  const state = stateProfile();
  const full = resolveFullProjectionContent(state, null, null, "goal_achievement", false);
  const mini = resolveMiniProjectionContent(state, null, null, "goal_achievement", false);
  assert.equal(full.identityApplicable, true);
  assert.equal(mini.identityApplicable, true);
});

test("Mini: missing Goal Identity never silently degrades to State-only -- identityApplicable stays true and validation flags it separately", () => {
  const state = stateProfile({ primaryIdentityProfileId: null });
  const mini = resolveMiniProjectionContent(state, null, null, "goal_achievement", false);
  assert.equal(mini.identityApplicable, true);
  assert.equal(mini.identityCue, null);
  const validation = validateProjectionIdentityRequirement("goal_achievement", state, null);
  assert.equal(validation.valid, false);
  assert.equal(validation.reason, "goal_requires_identity");
});

// ---------------------------------------------------------------------------
// buildProjectionCompletionInput -- full/mini/action_only
// ---------------------------------------------------------------------------

test("buildProjectionCompletionInput: Self Development, Identity not selected -- identity is null in the built input", () => {
  const input = buildProjectionCompletionInput("full", "personal_development", "s1", false, observations({ stateActionReached: true, stateRealActionCompleted: true }));
  if (input.projection !== "link") {
    assert.equal(input.identity, null);
    assert.deepEqual(input.state, { actionReached: true, realActionCompleted: true });
  }
});

test("buildProjectionCompletionInput: Self Development, Identity selected -- identity signal is built from the observed booleans", () => {
  const input = buildProjectionCompletionInput(
    "mini",
    "personal_development",
    "s2",
    true,
    observations({ stateActionReached: true, stateRealActionCompleted: true, identityActionReached: true, identityRealActionCompleted: false })
  );
  if (input.projection !== "link") {
    assert.deepEqual(input.identity, { selected: true, actionReached: true, realActionCompleted: false });
  }
});

test("buildProjectionCompletionInput: ARC Goal always builds an identity signal with selected: true, regardless of identitySelected", () => {
  const input = buildProjectionCompletionInput(
    "action_only",
    "goal_achievement",
    "s3",
    false,
    observations({ stateActionReached: true, stateRealActionCompleted: true, identityActionReached: true, identityRealActionCompleted: true })
  );
  if (input.projection !== "link") {
    assert.deepEqual(input.identity, { selected: true, actionReached: true, realActionCompleted: true });
  }
});

// --- Integration: the built input evaluates correctly through the real, unmodified evaluateProjectionCompletion ---

test("buildProjectionCompletionInput + evaluateProjectionCompletion: a fully completed Self Development session with Identity selected counts for progression", () => {
  const input = buildProjectionCompletionInput(
    "full",
    "personal_development",
    "s4",
    true,
    observations({ stateActionReached: true, stateRealActionCompleted: true, identityActionReached: true, identityRealActionCompleted: true })
  );
  const result = evaluateProjectionCompletion(input);
  assert.equal(result.countsForProgression, true);
});

test("buildProjectionCompletionInput + evaluateProjectionCompletion: a Goal session with the Identity action left incomplete does not count for progression", () => {
  const input = buildProjectionCompletionInput(
    "full",
    "goal_achievement",
    "s5",
    false,
    observations({ stateActionReached: true, stateRealActionCompleted: true, identityActionReached: true, identityRealActionCompleted: false })
  );
  const result = evaluateProjectionCompletion(input);
  assert.equal(result.countsForProgression, false);
  assert.equal(result.stateCompleted, true, "State completion is preserved separately even though the overall session doesn't count");
});

test("buildProjectionCompletionInput + evaluateProjectionCompletion: a fully completed Link rehearsal counts for progression", () => {
  const input = buildProjectionCompletionInput(
    "link",
    "personal_development",
    "s6",
    false,
    observations({ linkReachedFinalStage: true, linkRequiredDwellsCompleted: true, linkCompletionAcknowledged: true })
  );
  const result = evaluateProjectionCompletion(input);
  assert.equal(result.countsForProgression, true);
});
