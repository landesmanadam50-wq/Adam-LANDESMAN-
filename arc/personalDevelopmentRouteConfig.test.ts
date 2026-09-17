import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPersonalDevelopmentRouteConfigFromLegacySelection,
  createEmptyPersonalDevelopmentRouteConfig,
  generatePersonalDevelopmentRouteConfigId,
  isPersonalDevelopmentRouteConfigSaveable,
  isRouteStateOwnActionRequired,
  normalizePersonalDevelopmentRouteConfig,
  resolveActionRelationshipForItem,
  resolveOrCreatePersonalDevelopmentRouteConfigFromLegacySelection,
  resolvePendingBuildNewStateReturn,
  resolvePersonalDevelopmentRouteConfigForLegacySelection,
  upsertPersonalDevelopmentRouteConfigInList,
  validatePersonalDevelopmentRouteConfig,
} from "./personalDevelopmentRouteConfig.ts";
import type { PersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import { createEmptyEmotionInterferenceItem, createEmptyThoughtInterferenceItem } from "./interferenceItem.ts";
import type { InterferenceItem, ThoughtInterferenceItem } from "./interferenceItem.ts";
import { createEmptyStateProfile } from "./stateProfile.ts";
import type { StateProfile } from "./stateProfile.ts";
import { createEmptyCombinedInterferenceSelection } from "./combinedInterferenceSelection.ts";
import type { CombinedInterferenceSelection } from "./combinedInterferenceSelection.ts";
import { createEmptyPresenceArc } from "./types.ts";
import type { PresenceArc } from "./types.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-02T00:00:00.000Z";

function config(overrides: Partial<PersonalDevelopmentRouteConfig> = {}): PersonalDevelopmentRouteConfig {
  return { ...createEmptyPersonalDevelopmentRouteConfig("route1", "prog1", NOW), ...overrides };
}

function legacySelection(overrides: Partial<CombinedInterferenceSelection> = {}): CombinedInterferenceSelection {
  return { ...createEmptyCombinedInterferenceSelection("sel1", "state1", "prog1", NOW), ...overrides };
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

// --- Phase 14B-2: sourceLegacyCombinedSelectionId ---

test("createEmptyPersonalDevelopmentRouteConfig defaults sourceLegacyCombinedSelectionId to null", () => {
  assert.equal(createEmptyPersonalDevelopmentRouteConfig("r1", "prog1", NOW).sourceLegacyCombinedSelectionId, null);
});

test("normalizePersonalDevelopmentRouteConfig backfills a missing sourceLegacyCombinedSelectionId to null and preserves an already-set one", () => {
  const { sourceLegacyCombinedSelectionId, ...legacyShape } = config();
  assert.equal(normalizePersonalDevelopmentRouteConfig(legacyShape as PersonalDevelopmentRouteConfig).sourceLegacyCombinedSelectionId, null);
  assert.equal(normalizePersonalDevelopmentRouteConfig(config({ sourceLegacyCombinedSelectionId: "sel1" })).sourceLegacyCombinedSelectionId, "sel1");
});

// --- Phase 14B-2: isPersonalDevelopmentRouteConfigSaveable (alias, distinct from readiness) ---

test("isPersonalDevelopmentRouteConfigSaveable mirrors validatePersonalDevelopmentRouteConfig(...).valid exactly", () => {
  const valid = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } } });
  assert.equal(isPersonalDevelopmentRouteConfigSaveable(valid, [thought("t1")], []), true);
  assert.equal(isPersonalDevelopmentRouteConfigSaveable(config(), [], []), false, "an empty route is not saveable, same reason validate() rejects it");
});

// --- Phase 14B-2: legacy CombinedInterferenceSelection conversion ---

test("buildPersonalDevelopmentRouteConfigFromLegacySelection prefills linked policy, the source State, deduped items, Presence config, and legacy_unspecified relationships -- never guessed", () => {
  const selection = legacySelection({
    stateProfileId: "state1",
    configuredItemIds: ["t1", "t1", "b1"],
    presenceEnabled: true,
    linkedPresenceArcId: "presence1",
    ownerProgramId: "prog9",
  });
  const built = buildPersonalDevelopmentRouteConfigFromLegacySelection(selection, NOW, () => "new-route-id");
  assert.equal(built.id, "new-route-id");
  assert.equal(built.ownerProgramId, "prog9");
  assert.equal(built.stateInclusionPolicy, "linked");
  assert.equal(built.stateProfileId, "state1");
  assert.deepEqual(built.interferenceItemIds, ["t1", "b1"]);
  assert.deepEqual(built.itemRelationships, { t1: { actionRelationship: "legacy_unspecified" }, b1: { actionRelationship: "legacy_unspecified" } });
  assert.equal(built.presenceEnabled, true);
  assert.equal(built.linkedPresenceArcId, "presence1");
  assert.equal(built.presenceActionRelationship, "legacy_unspecified");
  assert.equal(built.sourceLegacyCombinedSelectionId, "sel1");
});

test("buildPersonalDevelopmentRouteConfigFromLegacySelection never reads or mutates the source selection", () => {
  const selection = legacySelection({ configuredItemIds: ["t1"] });
  const before = JSON.parse(JSON.stringify(selection));
  buildPersonalDevelopmentRouteConfigFromLegacySelection(selection, NOW, () => "new-route-id");
  assert.deepEqual(selection, before);
});

test("resolvePersonalDevelopmentRouteConfigForLegacySelection finds the one route matching sourceLegacyCombinedSelectionId, never by translated text or array position", () => {
  const converted = config({ id: "route1", sourceLegacyCombinedSelectionId: "sel1" });
  const unrelated = config({ id: "route2", sourceLegacyCombinedSelectionId: "sel2" });
  const neverConverted = config({ id: "route3", sourceLegacyCombinedSelectionId: null });
  assert.equal(resolvePersonalDevelopmentRouteConfigForLegacySelection([unrelated, converted, neverConverted], "sel1"), converted);
  assert.equal(resolvePersonalDevelopmentRouteConfigForLegacySelection([unrelated, neverConverted], "sel1"), null);
});

test("resolveOrCreatePersonalDevelopmentRouteConfigFromLegacySelection creates exactly one new route the first time", () => {
  const selection = legacySelection({ id: "sel1", configuredItemIds: ["t1"] });
  const { configs, result } = resolveOrCreatePersonalDevelopmentRouteConfigFromLegacySelection([], selection, NOW, () => "route-a");
  assert.equal(configs.length, 1);
  assert.equal(result.id, "route-a");
  assert.equal(result.sourceLegacyCombinedSelectionId, "sel1");
});

test("repeated conversion of the SAME legacy selection resolves to the SAME one route, never creating a duplicate (idempotent, permanent regression test)", () => {
  const selection = legacySelection({ id: "sel1", configuredItemIds: ["t1"] });
  const first = resolveOrCreatePersonalDevelopmentRouteConfigFromLegacySelection([], selection, NOW, () => "route-a");
  const second = resolveOrCreatePersonalDevelopmentRouteConfigFromLegacySelection(first.configs, selection, LATER, () => "should-not-be-used");
  const third = resolveOrCreatePersonalDevelopmentRouteConfigFromLegacySelection(second.configs, selection, LATER, () => "also-should-not-be-used");
  assert.equal(second.configs.length, 1, "still exactly one route after a second conversion request");
  assert.equal(third.configs.length, 1, "still exactly one route after a third conversion request");
  assert.equal(second.result.id, "route-a", "the same existing route is returned, never regenerated");
  assert.equal(third.result.id, "route-a");
  assert.deepEqual(second.result, first.result, "the existing route is returned completely untouched, not re-copied from the (possibly since-edited) legacy selection");
});

test("converting two DIFFERENT legacy selections produces two distinct routes", () => {
  const selectionA = legacySelection({ id: "selA", stateProfileId: "stateA", configuredItemIds: ["t1"] });
  const selectionB = legacySelection({ id: "selB", stateProfileId: "stateB", configuredItemIds: ["b1"] });
  const afterA = resolveOrCreatePersonalDevelopmentRouteConfigFromLegacySelection([], selectionA, NOW, () => "route-a");
  const afterB = resolveOrCreatePersonalDevelopmentRouteConfigFromLegacySelection(afterA.configs, selectionB, NOW, () => "route-b");
  assert.equal(afterB.configs.length, 2);
  assert.notEqual(afterA.result.id, afterB.result.id);
  assert.equal(afterB.result.sourceLegacyCombinedSelectionId, "selB");
});

test("resolveOrCreatePersonalDevelopmentRouteConfigFromLegacySelection never archives, renames, or mutates the source legacy selection", () => {
  const selection = legacySelection({ id: "sel1", configuredItemIds: ["t1"] });
  const before = JSON.parse(JSON.stringify(selection));
  resolveOrCreatePersonalDevelopmentRouteConfigFromLegacySelection([], selection, NOW, () => "route-a");
  assert.deepEqual(selection, before, "still status enabled, still exactly as it was");
});

// --- Phase 14B-2: "Build new State" return-resolution decision ---

test("resolvePendingBuildNewStateReturn: no pending id at all means nothing to apply", () => {
  assert.deepEqual(resolvePendingBuildNewStateReturn(null, [createEmptyStateProfile("s1", "x", null, NOW)]), { found: false, stateProfileId: null });
});

test("resolvePendingBuildNewStateReturn: returning before the State is actually saved never applies anything -- the route policy is never changed", () => {
  assert.deepEqual(resolvePendingBuildNewStateReturn("pending-id", []), { found: false, stateProfileId: null });
  assert.deepEqual(resolvePendingBuildNewStateReturn("pending-id", [createEmptyStateProfile("some-other-id", "x", null, NOW)]), { found: false, stateProfileId: null });
});

test("resolvePendingBuildNewStateReturn: auto-selection occurs only once the exact pending id is found", () => {
  const profiles = [createEmptyStateProfile("s1", "x", null, NOW), createEmptyStateProfile("pending-id", "y", null, NOW)];
  assert.deepEqual(resolvePendingBuildNewStateReturn("pending-id", profiles), { found: true, stateProfileId: "pending-id" });
});

// --- Desired State / combined-route readiness fix: isRouteStateOwnActionRequired ---

function thoughtItem(overrides: Partial<ThoughtInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyThoughtInterferenceItem("t1", "מחשבה", null, NOW), schemaVersion: 2, ...overrides };
}

function presence(overrides: Partial<PresenceArc> = {}): PresenceArc {
  return { ...createEmptyPresenceArc("p1", "נוכחות", NOW), ...overrides };
}

test("isRouteStateOwnActionRequired: a single factor with an explicit same_action relationship and its own action present does not require the State's own action", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } } });
  const item = thoughtItem({ beneficialActionAgainstFactor: "לנשום עמוק" });
  assert.equal(isRouteStateOwnActionRequired(c, [item], []), false);
});

test("isRouteStateOwnActionRequired: a factor with different_actions still requires the State's own action", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "different_actions" } } });
  const item = thoughtItem({ beneficialActionAgainstFactor: "לנשום עמוק" });
  assert.equal(isRouteStateOwnActionRequired(c, [item], []), true);
});

test("isRouteStateOwnActionRequired: an unresolved relationship (legacy_unspecified) still requires the State's own action", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } } });
  const item = thoughtItem({ beneficialActionAgainstFactor: "לנשום עמוק" });
  assert.equal(isRouteStateOwnActionRequired(c, [item], []), true);
});

test("isRouteStateOwnActionRequired: same_action declared but the factor's own action is still empty still requires the State's own action", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } } });
  const item = thoughtItem({ beneficialActionAgainstFactor: null });
  assert.equal(isRouteStateOwnActionRequired(c, [item], []), true);
});

test("isRouteStateOwnActionRequired: an Emotion item always requires the State's own action, regardless of any other relationship", () => {
  const c = config({ interferenceItemIds: ["e1"], itemRelationships: { e1: { actionRelationship: "same_action" } } });
  const emotion = createEmptyEmotionInterferenceItem("e1", "רגש", null, NOW);
  assert.equal(isRouteStateOwnActionRequired(c, [emotion], []), true);
});

test("isRouteStateOwnActionRequired: multiple factors all under same_action with their own actions present -- still not required", () => {
  const c = config({
    interferenceItemIds: ["t1", "t2"],
    itemRelationships: { t1: { actionRelationship: "same_action" }, t2: { actionRelationship: "same_action" } },
  });
  const item1 = thoughtItem({ id: "t1", beneficialActionAgainstFactor: "פעולה א" });
  const item2 = thoughtItem({ id: "t2", beneficialActionAgainstFactor: "פעולה ב" });
  assert.equal(isRouteStateOwnActionRequired(c, [item1, item2], []), false);
});

test("isRouteStateOwnActionRequired: one same_action factor plus one different_actions factor -- required (not every consumer is covered)", () => {
  const c = config({
    interferenceItemIds: ["t1", "t2"],
    itemRelationships: { t1: { actionRelationship: "same_action" }, t2: { actionRelationship: "different_actions" } },
  });
  const item1 = thoughtItem({ id: "t1", beneficialActionAgainstFactor: "פעולה א" });
  const item2 = thoughtItem({ id: "t2", beneficialActionAgainstFactor: "פעולה ב" });
  assert.equal(isRouteStateOwnActionRequired(c, [item1, item2], []), true);
});

test("isRouteStateOwnActionRequired: Presence under same_action with its own beneficial action present does not require the State's own action", () => {
  const c = config({ presenceEnabled: true, linkedPresenceArcId: "p1", presenceActionRelationship: "same_action" });
  const presenceArc = presence({ beneficialAction: "פעולה מיטיבה" });
  assert.equal(isRouteStateOwnActionRequired(c, [], [presenceArc]), false);
});

test("isRouteStateOwnActionRequired: Presence under different_actions still requires the State's own action", () => {
  const c = config({ presenceEnabled: true, linkedPresenceArcId: "p1", presenceActionRelationship: "different_actions" });
  const presenceArc = presence({ beneficialAction: "פעולה מיטיבה" });
  assert.equal(isRouteStateOwnActionRequired(c, [], [presenceArc]), true);
});

test("isRouteStateOwnActionRequired: a route with zero resolvable consumers defensively still requires the State's own action", () => {
  const c = config({ interferenceItemIds: [] });
  assert.equal(isRouteStateOwnActionRequired(c, [], []), true);
});
