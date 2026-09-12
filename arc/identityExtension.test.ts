import test from "node:test";
import assert from "node:assert/strict";

import {
  createIdentityExtensionInitialSession,
  getFirstIdentityExtensionStage,
  IDENTITY_EXTENSION_OFFER_QUESTION,
  isIdentityExtensionEligible,
  resolveIdentityExtensionActiveLayers,
  resolveIdentityExtensionEntry,
  shouldShowIdentityExtensionOffer,
} from "./identityExtension.ts";
import { createEmptyArcBuildProfile, createEmptyArcGoal, generateArcGoalSubGoalId } from "./types.ts";
import type { ArcBuild, ArcGoal, ArcGoalSubGoal } from "./types.ts";
import { getNextArcStage } from "./arcEngine.ts";

function arcBuild(overrides: Partial<ArcBuild> = {}): ArcBuild {
  return {
    id: "build-1",
    name: "בנייה",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    needsState: false,
    needsIdentity: true,
    needsHabit: false,
    needsIdentityImmediately: false,
    profile: createEmptyArcBuildProfile(),
    ...overrides,
  };
}

function subGoal(overrides: Partial<ArcGoalSubGoal> = {}): ArcGoalSubGoal {
  return {
    id: generateArcGoalSubGoalId(),
    arcGoalId: "goal-1",
    name: "תת-מטרה",
    description: null,
    order: 0,
    plannedStartDate: null,
    plannedCompletionDate: null,
    actualCompletionDate: null,
    status: "active",
    reflection: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function arcGoal(overrides: Partial<ArcGoal> = {}): ArcGoal {
  return { ...createEmptyArcGoal("goal-1", "מטרה", "2026-01-01T00:00:00.000Z"), ...overrides };
}

// --- Track-specific offer routing ---

test("Personal Development shows the identity extension offer", () => {
  assert.equal(shouldShowIdentityExtensionOffer("personal_development"), true);
});

test("Goal Achievement never shows the offer -- it is mandatory and auto-enters", () => {
  assert.equal(shouldShowIdentityExtensionOffer("goal_achievement"), false);
});

test("the offer question matches the exact confirmed Hebrew wording", () => {
  assert.equal(IDENTITY_EXTENSION_OFFER_QUESTION, "האם תרצה להמשיך לבניית הזהות ולפעולה?");
});

// --- resolveIdentityExtensionEntry ---

test("Goal Achievement resolves arcBuildId from goal.identityProtocolId, never a second source", () => {
  const goal = arcGoal({ identityProtocolId: "identity-build-1" });
  const entry = resolveIdentityExtensionEntry("goal_achievement", { goal });
  assert.equal(entry.arcBuildId, "identity-build-1");
});

test("Goal Achievement carries the active sub-goal id as CONTEXT only", () => {
  const active = subGoal({ id: "sg-active", status: "active" });
  const locked = subGoal({ id: "sg-locked", status: "locked", order: 1 });
  const goal = arcGoal({ identityProtocolId: "identity-build-1", subGoals: [locked, active] });
  const entry = resolveIdentityExtensionEntry("goal_achievement", { goal });
  assert.equal(entry.activeSubGoalId, "sg-active");
});

test("Goal Achievement with no active sub-goal still resolves arcBuildId, with a null sub-goal context", () => {
  const goal = arcGoal({ identityProtocolId: "identity-build-1", subGoals: [] });
  const entry = resolveIdentityExtensionEntry("goal_achievement", { goal });
  assert.equal(entry.arcBuildId, "identity-build-1");
  assert.equal(entry.activeSubGoalId, null);
});

test("Goal Achievement with no identityProtocolId configured yet resolves a null arcBuildId, never invents one", () => {
  const goal = arcGoal({ identityProtocolId: null });
  const entry = resolveIdentityExtensionEntry("goal_achievement", { goal });
  assert.equal(entry.arcBuildId, null);
});

test("Goal Achievement with no goal passed at all resolves safely to nulls, never throws", () => {
  const entry = resolveIdentityExtensionEntry("goal_achievement", {});
  assert.equal(entry.arcBuildId, null);
  assert.equal(entry.activeSubGoalId, null);
});

test("Personal Development resolves arcBuildId from the caller's own selectedArcBuildId, and its sub-goal context is always null", () => {
  const entry = resolveIdentityExtensionEntry("personal_development", { selectedArcBuildId: "pd-build-1" });
  assert.equal(entry.arcBuildId, "pd-build-1");
  assert.equal(entry.activeSubGoalId, null);
});

test("Personal Development with no ArcBuild selected yet resolves a null arcBuildId, never invents one", () => {
  const entry = resolveIdentityExtensionEntry("personal_development", {});
  assert.equal(entry.arcBuildId, null);
});

test("Personal Development never reads a goal's identityProtocolId, even when one is supplied by mistake", () => {
  const goal = arcGoal({ identityProtocolId: "identity-build-1" });
  const entry = resolveIdentityExtensionEntry("personal_development", { goal, selectedArcBuildId: "pd-build-1" });
  assert.equal(entry.arcBuildId, "pd-build-1");
});

// --- Resumption adapter: starts directly at "encode", skips the whole preamble ---

test("getFirstIdentityExtensionStage always resumes directly at 'encode'", () => {
  assert.equal(getFirstIdentityExtensionStage(), "encode");
});

test("createIdentityExtensionInitialSession forces selectedTarget to 'identity', so encode/act never resolve to a different layer", () => {
  const session = createIdentityExtensionInitialSession();
  assert.equal(session.selectedTarget, "identity");
});

test("a driving screen that instead routed this session through 'trigger_selection' (the wrong way) would land on presence_check, not 'encode' -- confirming why this module documents starting directly at 'encode' instead", () => {
  const session = createIdentityExtensionInitialSession();
  const profile = createEmptyArcBuildProfile();
  const hop = getNextArcStage("trigger_selection", session, profile, ["identity"]);
  assert.equal(hop.stage, "presence_check");
  assert.notEqual(hop.stage, "encode");
});

// --- activeLayers / eligibility ---

test("resolveIdentityExtensionActiveLayers reuses deriveActiveLayersForArcBuild verbatim -- a build with a configured identityAction includes 'identity'", () => {
  const build = arcBuild({ profile: { ...createEmptyArcBuildProfile(), identityAction: "לפעול כמו מישהו ממושמע" } });
  const layers = resolveIdentityExtensionActiveLayers(build);
  assert.ok(layers.includes("identity"));
});

test("isIdentityExtensionEligible is true for a build with a configured identity target, false for one without", () => {
  const eligible = arcBuild({ profile: { ...createEmptyArcBuildProfile(), identityAction: "פעולה" } });
  const ineligible = arcBuild({ profile: createEmptyArcBuildProfile() });
  assert.equal(isIdentityExtensionEligible(eligible), true);
  assert.equal(isIdentityExtensionEligible(ineligible), false);
});

test("isIdentityExtensionEligible is false, never throws, for a null ArcBuild (unresolved arcBuildId)", () => {
  assert.doesNotThrow(() => isIdentityExtensionEligible(null));
  assert.equal(isIdentityExtensionEligible(null), false);
});
