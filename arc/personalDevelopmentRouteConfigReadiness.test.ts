import test from "node:test";
import assert from "node:assert/strict";

import { isPersonalDevelopmentRouteConfigCompleteForPractice } from "./personalDevelopmentRouteConfigReadiness.ts";
import { createEmptyPersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import type { PersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import { createEmptyBeliefInterferenceItem, createEmptyEmotionInterferenceItem, createEmptyThoughtInterferenceItem, createEmptyUrgeInterferenceItem } from "./interferenceItem.ts";
import type { BeliefInterferenceItem, EmotionInterferenceItem, InterferenceItem, ThoughtInterferenceItem, UrgeInterferenceItem } from "./interferenceItem.ts";
import { createEmptyStateProfile } from "./stateProfile.ts";
import type { StateProfile } from "./stateProfile.ts";
import { createEmptyPresenceArc } from "./types.ts";
import type { PresenceArc } from "./types.ts";
import { disableLibraryItem } from "./libraryItemStatus.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function config(overrides: Partial<PersonalDevelopmentRouteConfig> = {}): PersonalDevelopmentRouteConfig {
  return { ...createEmptyPersonalDevelopmentRouteConfig("route1", "prog1", NOW), ...overrides };
}

function thoughtV2(overrides: Partial<ThoughtInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyThoughtInterferenceItem("t1", "מחשבה", null, NOW), schemaVersion: 2, ...overrides };
}
function thoughtV1(overrides: Partial<ThoughtInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyThoughtInterferenceItem("t1", "מחשבה", null, NOW), schemaVersion: 1, ...overrides };
}
function belief(overrides: Partial<BeliefInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyBeliefInterferenceItem("b1", "אמונה", null, NOW), ...overrides };
}
function urge(overrides: Partial<UrgeInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyUrgeInterferenceItem("u1", "דחף", null, NOW), ...overrides };
}
function emotion(overrides: Partial<EmotionInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyEmotionInterferenceItem("e1", "רגש", null, NOW), ...overrides };
}

function completeState(overrides: Partial<StateProfile> = {}): StateProfile {
  return { ...createEmptyStateProfile("s1", "מצב", null, NOW), regulationAnchor: "עוגן", encodingCue: "קידוד", action: "פעולה מתוך המצב הרצוי", ...overrides };
}
function incompleteState(overrides: Partial<StateProfile> = {}): StateProfile {
  return { ...createEmptyStateProfile("s1", "מצב", null, NOW), ...overrides };
}

function readyPresence(overrides: Partial<PresenceArc> = {}): PresenceArc {
  return { ...createEmptyPresenceArc("p1", "נוכחות", NOW), beneficialAction: "פעולה מיטיבה מול הגורם המפריע", ...overrides };
}

// --- No-State routes ---

test("a complete no-State Thought route (v2, own action set) is practice-ready", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  const item = thoughtV2({ beneficialActionAgainstFactor: "לנשום עמוק" });
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [item], [], []), true);
});

test("a complete no-State Belief/Urge route is practice-ready the same way", () => {
  const beliefRoute = config({ interferenceItemIds: ["b1"], itemRelationships: { b1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(beliefRoute, [belief({ schemaVersion: 2, beneficialActionAgainstFactor: "אמונה תומכת" })], [], []), true);

  const urgeRoute = config({ interferenceItemIds: ["u1"], itemRelationships: { u1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(urgeRoute, [urge({ schemaVersion: 2, beneficialActionAgainstFactor: "פעולת עצירה" })], [], []), true);
});

test("a no-State Thought route with a v2 item missing its own action is NOT practice-ready", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [thoughtV2()], [], []), false);
});

// --- Legacy primaryStateProfileId independence ---

test("route State selection does not depend on an item's legacy primaryStateProfileId -- readiness is unaffected whether it matches, differs, or is null", () => {
  const c = config({
    interferenceItemIds: ["t1"],
    itemRelationships: { t1: { actionRelationship: "same_action" } },
    stateInclusionPolicy: "linked",
    stateProfileId: "s1",
  });
  const state = completeState();
  const itemWithDifferentLegacyState = thoughtV2({ beneficialActionAgainstFactor: "פעולה", primaryStateProfileId: "some-other-legacy-state" });
  const itemWithNullLegacyState = thoughtV2({ beneficialActionAgainstFactor: "פעולה", primaryStateProfileId: null });
  const itemWithMatchingLegacyState = thoughtV2({ beneficialActionAgainstFactor: "פעולה", primaryStateProfileId: "s1" });
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [itemWithDifferentLegacyState], [state], []), true);
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [itemWithNullLegacyState], [state], []), true);
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [itemWithMatchingLegacyState], [state], []), true);
});

// --- Linked/decide_in_live State readiness ---

test("\"linked\" with an incomplete State is NOT practice-ready", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const item = thoughtV2({ beneficialActionAgainstFactor: "פעולה" });
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [item], [incompleteState()], []), false);
});

test("\"linked\" with a complete, enabled State and an explicit action relationship is practice-ready", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "different_actions" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const item = thoughtV2({ beneficialActionAgainstFactor: "פעולה" });
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [item], [completeState()], []), true);
});

test("\"linked\" with a DISABLED State is not practice-ready even if its content is complete", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const item = thoughtV2({ beneficialActionAgainstFactor: "פעולה" });
  const disabledState = disableLibraryItem(completeState(), NOW);
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [item], [disabledState], []), false);
});

test("\"decide_in_live\" with an incomplete candidate State is NOT practice-ready -- LIVE may still choose to include it", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "decide_in_live", stateProfileId: "s1" });
  const item = thoughtV2({ beneficialActionAgainstFactor: "פעולה" });
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [item], [incompleteState()], []), false);
});

test("\"decide_in_live\" with a complete candidate State is practice-ready", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "decide_in_live", stateProfileId: "s1" });
  const item = thoughtV2({ beneficialActionAgainstFactor: "פעולה" });
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [item], [completeState()], []), true);
});

// --- Emotion ---

test("Emotion with an incomplete linked State is NOT practice-ready", () => {
  const c = config({ interferenceItemIds: ["e1"], itemRelationships: { e1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [emotion()], [incompleteState()], []), false);
});

test("Emotion with a complete linked State is practice-ready -- its legacy primaryStateProfileId is never consulted", () => {
  const c = config({ interferenceItemIds: ["e1"], itemRelationships: { e1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const item = emotion({ primaryStateProfileId: "some-other-legacy-state" });
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [item], [completeState()], []), true);
});

// --- Legacy v1 fallback ---

test("a v1 item with no own action relies on a complete State's action (legacy fallback) to become practice-ready", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const item = thoughtV1({ beneficialActionAgainstFactor: null });
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [item], [completeState()], []), true, "legacy fallback -- explicit relationship not required since the item has no own action to relate");
});

test("a v1 item with no own action and no State is NOT practice-ready", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  const item = thoughtV1({ beneficialActionAgainstFactor: null });
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [item], [], []), false);
});

// --- Explicit action relationship requirement ---

test("State included AND the item's own action is resolvable -- \"legacy_unspecified\" blocks readiness", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const item = thoughtV2({ beneficialActionAgainstFactor: "פעולה" });
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [item], [completeState()], []), false);
});

// --- Enabled/stale references ---

test("a disabled configured item blocks readiness even though it still resolves", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  const disabledItem = disableLibraryItem(thoughtV2({ beneficialActionAgainstFactor: "פעולה" }), NOW);
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [disabledItem], [], []), false);
});

test("a stale configured item id that no longer resolves at all blocks readiness (matches validatePersonalDevelopmentRouteConfig's own structural check)", () => {
  const c = config({ interferenceItemIds: ["ghost"], itemRelationships: { ghost: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [], [], []), false);
});

// --- Presence ---

test("Presence enabled with no beneficial action is NOT practice-ready", () => {
  const c = config({ presenceEnabled: true, linkedPresenceArcId: "p1", stateInclusionPolicy: "none" });
  const notReadyPresence = readyPresence({ beneficialAction: null });
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [], [], [notReadyPresence]), false);
});

test("Presence enabled with a beneficial action, no State, is practice-ready (no explicit relationship required with no State)", () => {
  const c = config({ presenceEnabled: true, linkedPresenceArcId: "p1", stateInclusionPolicy: "none" });
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [], [], [readyPresence()]), true);
});

test("Presence enabled with a State included requires an explicit presenceActionRelationship", () => {
  const c = config({ presenceEnabled: true, linkedPresenceArcId: "p1", stateInclusionPolicy: "linked", stateProfileId: "s1", presenceActionRelationship: "legacy_unspecified" });
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [], [completeState()], [readyPresence()]), false);

  const withRelationship = config({ presenceEnabled: true, linkedPresenceArcId: "p1", stateInclusionPolicy: "linked", stateProfileId: "s1", presenceActionRelationship: "same_action" });
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(withRelationship, [], [completeState()], [readyPresence()]), true);
});

// --- Saving vs. readiness are distinct outcomes ---

test("a saveable route is not necessarily practice-ready -- saving a draft and being ready for practice are distinct outcomes", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  const draftItem = thoughtV2({ beneficialActionAgainstFactor: null });
  // Structurally valid/saveable (the item resolves, the route is internally consistent)...
  // ...but not complete-for-practice (the v2 item's own required action is still missing).
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [draftItem], [], []), false);
});
