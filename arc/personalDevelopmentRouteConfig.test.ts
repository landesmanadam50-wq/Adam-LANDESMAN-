import test from "node:test";
import assert from "node:assert/strict";

import {
  createEmptyPersonalDevelopmentRouteConfig,
  generatePersonalDevelopmentRouteConfigId,
  normalizePersonalDevelopmentRouteConfig,
  resolveActionRelationshipForItem,
  upsertPersonalDevelopmentRouteConfigInList,
  validatePersonalDevelopmentRouteConfig,
} from "./personalDevelopmentRouteConfig.ts";
import type { PersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import { createEmptyEmotionInterferenceItem, createEmptyThoughtInterferenceItem } from "./interferenceItem.ts";
import type { InterferenceItem } from "./interferenceItem.ts";
import { createEmptyStateProfile } from "./stateProfile.ts";
import type { StateProfile } from "./stateProfile.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-02T00:00:00.000Z";

function config(overrides: Partial<PersonalDevelopmentRouteConfig> = {}): PersonalDevelopmentRouteConfig {
  return { ...createEmptyPersonalDevelopmentRouteConfig("route1", "prog1", NOW), ...overrides };
}

// --- Create / defaults ---

test("createEmptyPersonalDevelopmentRouteConfig defaults to no State, no items, no Presence", () => {
  const c = createEmptyPersonalDevelopmentRouteConfig("route1", "prog1", NOW);
  assert.equal(c.id, "route1");
  assert.equal(c.ownerProgramId, "prog1");
  assert.deepEqual(c.interferenceItemIds, []);
  assert.equal(c.stateInclusionPolicy, "none");
  assert.equal(c.stateProfileId, null);
  assert.deepEqual(c.itemRelationships, {});
  assert.equal(c.presenceEnabled, false);
  assert.equal(c.linkedPresenceArcId, null);
  assert.equal(c.presenceActionRelationship, null);
  assert.equal(c.status, "enabled");
  assert.equal(c.schemaVersion, 1);
});

test("generatePersonalDevelopmentRouteConfigId produces distinct ids", () => {
  assert.notEqual(generatePersonalDevelopmentRouteConfigId(), generatePersonalDevelopmentRouteConfigId());
});

// --- No-State route is fully representable, without any StateProfile at all ---

test("a route can be created with stateInclusionPolicy none and no stateProfileId -- no StateProfile card is required to configure a no-State route", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } } });
  assert.equal(c.stateInclusionPolicy, "none");
  assert.equal(c.stateProfileId, null);
});

test("two distinct no-State route configs (different item sets) coexist without any uniqueness collision", () => {
  const routeA = config({ id: "routeA", interferenceItemIds: ["t1"] });
  const routeB = config({ id: "routeB", interferenceItemIds: ["t2"] });
  const list = upsertPersonalDevelopmentRouteConfigInList(upsertPersonalDevelopmentRouteConfigInList([], routeA), routeB);
  assert.equal(list.length, 2);
  assert.equal(list[0].stateProfileId, null);
  assert.equal(list[1].stateProfileId, null);
});

// --- upsert ---

test("upsertPersonalDevelopmentRouteConfigInList appends a new config when its id isn't in the list yet", () => {
  const result = upsertPersonalDevelopmentRouteConfigInList([], config());
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "route1");
});

test("upsertPersonalDevelopmentRouteConfigInList updates the one matching config in place, leaving every other row untouched", () => {
  const other = config({ id: "route2" });
  const updated = config({ interferenceItemIds: ["t1"] });
  const result = upsertPersonalDevelopmentRouteConfigInList([other, config()], updated);
  assert.equal(result.length, 2);
  assert.equal(result[0], other, "the untouched row is the exact same object");
  assert.deepEqual(result[1].interferenceItemIds, ["t1"]);
});

// --- resolveActionRelationshipForItem ---

test("resolveActionRelationshipForItem returns the configured relationship", () => {
  const c = config({ itemRelationships: { t1: { actionRelationship: "same_action" } } });
  assert.equal(resolveActionRelationshipForItem(c, "t1"), "same_action");
});

test("resolveActionRelationshipForItem defaults to legacy_unspecified when the route has no entry for that item", () => {
  assert.equal(resolveActionRelationshipForItem(config(), "unknown-item"), "legacy_unspecified");
});

// --- normalize ---

test("normalizePersonalDevelopmentRouteConfig backfills missing fields safely, dedupes item ids, and fills a missing itemRelationships entry", () => {
  const { stateInclusionPolicy, presenceEnabled, schemaVersion, itemRelationships, ...legacyShape } = config({ interferenceItemIds: ["t1", "t1", "t2"] });
  const normalized = normalizePersonalDevelopmentRouteConfig(legacyShape as PersonalDevelopmentRouteConfig);
  assert.equal(normalized.stateInclusionPolicy, "none");
  assert.equal(normalized.presenceEnabled, false);
  assert.equal(normalized.schemaVersion, 1);
  assert.deepEqual(normalized.interferenceItemIds, ["t1", "t2"]);
  assert.deepEqual(normalized.itemRelationships, { t1: { actionRelationship: "legacy_unspecified" }, t2: { actionRelationship: "legacy_unspecified" } });
});

test("normalizePersonalDevelopmentRouteConfig never overwrites an already-configured itemRelationships entry", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } } });
  const normalized = normalizePersonalDevelopmentRouteConfig(c);
  assert.equal(normalized.itemRelationships.t1.actionRelationship, "same_action");
});

test("normalizePersonalDevelopmentRouteConfig drops an orphaned itemRelationships entry for an id no longer in interferenceItemIds", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" }, t2: { actionRelationship: "different_actions" } } });
  const normalized = normalizePersonalDevelopmentRouteConfig(c);
  assert.deepEqual(Object.keys(normalized.itemRelationships), ["t1"]);
});

test("normalizePersonalDevelopmentRouteConfig never overwrites an already-configured stateInclusionPolicy/stateProfileId", () => {
  const c = config({ stateInclusionPolicy: "linked", stateProfileId: "state1" });
  const normalized = normalizePersonalDevelopmentRouteConfig(c);
  assert.equal(normalized.stateInclusionPolicy, "linked");
  assert.equal(normalized.stateProfileId, "state1");
});

test("a PersonalDevelopmentRouteConfig survives a JSON round trip with its no-State configuration intact", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "different_actions" } }, stateInclusionPolicy: "none", updatedAt: LATER });
  const roundTripped = JSON.parse(JSON.stringify(c)) as PersonalDevelopmentRouteConfig;
  const normalized = normalizePersonalDevelopmentRouteConfig(roundTripped);
  assert.equal(normalized.stateInclusionPolicy, "none");
  assert.equal(normalized.stateProfileId, null);
  assert.deepEqual(normalized.itemRelationships, { t1: { actionRelationship: "different_actions" } });
});

// --- validatePersonalDevelopmentRouteConfig ---

function thought(id: string): InterferenceItem {
  return createEmptyThoughtInterferenceItem(id, "מחשבה", null, NOW);
}
function emotion(id: string): InterferenceItem {
  return createEmptyEmotionInterferenceItem(id, "רגש", null, NOW);
}
function state(id: string): StateProfile {
  return createEmptyStateProfile(id, "מצב", null, NOW);
}

test("an empty route (no items, no Presence) fails validation", () => {
  const result = validatePersonalDevelopmentRouteConfig(config(), [], []);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "no_factors_configured");
});

test("presenceEnabled alone (no InterferenceItems) is a valid, complete route", () => {
  const result = validatePersonalDevelopmentRouteConfig(config({ presenceEnabled: true }), [], []);
  assert.equal(result.valid, true);
});

test("a configured item id that doesn't resolve to a real item fails validation", () => {
  const c = config({ interferenceItemIds: ["missing"], itemRelationships: { missing: { actionRelationship: "legacy_unspecified" } } });
  const result = validatePersonalDevelopmentRouteConfig(c, [], []);
  assert.equal(result.reason, "configured_item_not_found");
});

test("stateInclusionPolicy none with a Thought item and no stateProfileId is valid", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  const result = validatePersonalDevelopmentRouteConfig(c, [thought("t1")], []);
  assert.equal(result.valid, true);
});

test("stateInclusionPolicy none with a stray stateProfileId set fails validation", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none", stateProfileId: "state1" });
  const result = validatePersonalDevelopmentRouteConfig(c, [thought("t1")], [state("state1")]);
  assert.equal(result.reason, "none_must_not_reference_a_state");
});

test("stateInclusionPolicy linked requires a resolvable stateProfileId", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "linked", stateProfileId: null });
  assert.equal(validatePersonalDevelopmentRouteConfig(c, [thought("t1")], []).reason, "linked_requires_state_profile_id");
});

test("stateInclusionPolicy linked with a stateProfileId that doesn't resolve fails validation", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "linked", stateProfileId: "ghost" });
  assert.equal(validatePersonalDevelopmentRouteConfig(c, [thought("t1")], []).reason, "linked_state_not_found");
});

test("stateInclusionPolicy linked with a resolvable stateProfileId is valid", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "linked", stateProfileId: "state1" });
  assert.equal(validatePersonalDevelopmentRouteConfig(c, [thought("t1")], [state("state1")]).valid, true);
});

test("stateInclusionPolicy decide_in_live requires one candidate stateProfileId that resolves", () => {
  const missingCandidate = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "decide_in_live", stateProfileId: null });
  assert.equal(validatePersonalDevelopmentRouteConfig(missingCandidate, [thought("t1")], []).reason, "decide_in_live_requires_a_candidate_state_profile_id");

  const unresolvedCandidate = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "decide_in_live", stateProfileId: "ghost" });
  assert.equal(validatePersonalDevelopmentRouteConfig(unresolvedCandidate, [thought("t1")], []).reason, "decide_in_live_candidate_state_not_found");

  const valid = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "decide_in_live", stateProfileId: "state1" });
  assert.equal(validatePersonalDevelopmentRouteConfig(valid, [thought("t1")], [state("state1")]).valid, true);
});

test("an Emotion-containing route with stateInclusionPolicy none is never complete-for-practice", () => {
  const c = config({ interferenceItemIds: ["e1"], itemRelationships: { e1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  assert.equal(validatePersonalDevelopmentRouteConfig(c, [emotion("e1")], []).reason, "emotion_requires_linked_state");
});

test("an Emotion-containing route with stateInclusionPolicy decide_in_live is never complete-for-practice", () => {
  const c = config({ interferenceItemIds: ["e1"], itemRelationships: { e1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "decide_in_live", stateProfileId: "state1" });
  assert.equal(validatePersonalDevelopmentRouteConfig(c, [emotion("e1")], [state("state1")]).reason, "emotion_requires_linked_state");
});

test("an Emotion-containing route with stateInclusionPolicy linked and a resolvable State is valid", () => {
  const c = config({ interferenceItemIds: ["e1"], itemRelationships: { e1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "linked", stateProfileId: "state1" });
  assert.equal(validatePersonalDevelopmentRouteConfig(c, [emotion("e1")], [state("state1")]).valid, true);
});

test("a configured item missing its own itemRelationships entry fails validation", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: {} });
  assert.equal(validatePersonalDevelopmentRouteConfig(c, [thought("t1")], []).reason, "missing_item_action_relationship");
});
