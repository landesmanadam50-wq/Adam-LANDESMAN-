import test from "node:test";
import assert from "node:assert/strict";

import {
  isCompleteForGoalTrack,
  isEligibleAsInterferenceItem,
  isIdentityOptionalForTrack,
  isValidInterferenceSelection,
  resolveEffectiveIdentityForInterferenceItem,
  validateInterferenceItemPrimaryState,
  validateStatePrimaryIdentity,
} from "./libraryRelationships.ts";
import { createEmptyStateProfile } from "./stateProfile.ts";
import type { StateProfile } from "./stateProfile.ts";
import { createEmptyIdentityProfile } from "./identityProfile.ts";
import type { IdentityProfile } from "./identityProfile.ts";
import { createEmptyThoughtInterferenceItem } from "./interferenceItem.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function stateProfile(overrides: Partial<StateProfile> = {}): StateProfile {
  return { ...createEmptyStateProfile("s1", "רוגע", "prog1", NOW), ...overrides };
}

function identityProfile(overrides: Partial<IdentityProfile> = {}): IdentityProfile {
  return { ...createEmptyIdentityProfile("i1", "אדם ממושמע", "prog1", NOW), ...overrides };
}

// --- Valid State reference ---

test("validateInterferenceItemPrimaryState is valid when primaryStateProfileId resolves against the given list", () => {
  const item = { ...createEmptyThoughtInterferenceItem("t1", "x", "prog1", NOW), primaryStateProfileId: "s1" };
  const result = validateInterferenceItemPrimaryState(item, [stateProfile({ id: "s1" })]);
  assert.equal(result.valid, true);
  assert.equal(result.source, "new");
});

// --- Missing State in a new record returns typed validation ---

test("validateInterferenceItemPrimaryState returns a typed invalid result (never throws) when primaryStateProfileId is null", () => {
  const item = createEmptyThoughtInterferenceItem("t1", "x", "prog1", NOW);
  const result = validateInterferenceItemPrimaryState(item, []);
  assert.equal(result.valid, false);
  assert.equal(result.source, "new");
  assert.equal(result.reason, "missing_primary_state");
});

test("validateInterferenceItemPrimaryState returns a typed invalid result when the referenced id doesn't resolve", () => {
  const item = { ...createEmptyThoughtInterferenceItem("t1", "x", "prog1", NOW), primaryStateProfileId: "does-not-exist" };
  const result = validateInterferenceItemPrimaryState(item, [stateProfile({ id: "s1" })]);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "primary_state_not_found");
});

// --- StateProfile with no Identity is valid for Self Development ---

test("validateStatePrimaryIdentity is valid when primaryIdentityProfileId is null (zero is a valid count)", () => {
  const result = validateStatePrimaryIdentity(stateProfile({ primaryIdentityProfileId: null }), []);
  assert.equal(result.valid, true);
});

// --- StateProfile with linked Identity resolves correctly ---

test("validateStatePrimaryIdentity is valid when primaryIdentityProfileId resolves against the given list", () => {
  const result = validateStatePrimaryIdentity(stateProfile({ primaryIdentityProfileId: "i1" }), [identityProfile({ id: "i1" })]);
  assert.equal(result.valid, true);
});

test("validateStatePrimaryIdentity is invalid when primaryIdentityProfileId is set but doesn't resolve", () => {
  const result = validateStatePrimaryIdentity(stateProfile({ primaryIdentityProfileId: "missing" }), [identityProfile({ id: "i1" })]);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "primary_identity_not_found");
});

// --- Interference Identity override takes precedence without mutating the State ---

test("resolveEffectiveIdentityForInterferenceItem prefers the item's own override over the linked State's primary Identity", () => {
  const state = stateProfile({ primaryIdentityProfileId: "state-identity" });
  const stateCopy = { ...state };
  const item = { ...createEmptyThoughtInterferenceItem("t1", "x", "prog1", NOW), identityProfileIdOverride: "item-identity" };
  const resolved = resolveEffectiveIdentityForInterferenceItem(item, state);
  assert.equal(resolved, "item-identity");
  assert.deepEqual(state, stateCopy, "the linked StateProfile is never mutated by resolving an override");
});

test("resolveEffectiveIdentityForInterferenceItem falls back to the linked State's primary Identity when the item has no override", () => {
  const state = stateProfile({ primaryIdentityProfileId: "state-identity" });
  const item = createEmptyThoughtInterferenceItem("t1", "x", "prog1", NOW);
  assert.equal(resolveEffectiveIdentityForInterferenceItem(item, state), "state-identity");
});

test("resolveEffectiveIdentityForInterferenceItem returns null when neither the item nor a resolvable State provides one -- Self Development allows no Identity", () => {
  const item = createEmptyThoughtInterferenceItem("t1", "x", "prog1", NOW);
  assert.equal(resolveEffectiveIdentityForInterferenceItem(item, null), null);
  assert.equal(resolveEffectiveIdentityForInterferenceItem(item, stateProfile({ primaryIdentityProfileId: null })), null);
});

// --- Track rules ---

test("isIdentityOptionalForTrack is true for personal_development, false for goal_achievement", () => {
  assert.equal(isIdentityOptionalForTrack("personal_development"), true);
  assert.equal(isIdentityOptionalForTrack("goal_achievement"), false);
});

test("isCompleteForGoalTrack requires BOTH a resolved State and Identity id", () => {
  assert.equal(isCompleteForGoalTrack("state-1", "identity-1"), true);
  assert.equal(isCompleteForGoalTrack(null, "identity-1"), false);
  assert.equal(isCompleteForGoalTrack("state-1", null), false);
  assert.equal(isCompleteForGoalTrack(null, null), false);
});

// --- Only one InterferenceItem selected in a future LIVE session ---

test("isValidInterferenceSelection allows zero or one selected id, rejects more than one", () => {
  assert.equal(isValidInterferenceSelection([]), true);
  assert.equal(isValidInterferenceSelection(["a"]), true);
  assert.equal(isValidInterferenceSelection(["a", "b"]), false);
});

// --- Presence is not an InterferenceItem ---

test("isEligibleAsInterferenceItem is false only for 'presence', true for every real category", () => {
  assert.equal(isEligibleAsInterferenceItem("presence"), false);
  assert.equal(isEligibleAsInterferenceItem("thought"), true);
  assert.equal(isEligibleAsInterferenceItem("belief"), true);
  assert.equal(isEligibleAsInterferenceItem("urge"), true);
  assert.equal(isEligibleAsInterferenceItem("emotion"), true);
});
