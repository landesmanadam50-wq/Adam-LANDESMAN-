import test from "node:test";
import assert from "node:assert/strict";

import { evaluatePersonalDevelopmentRouteConfigReadiness, isPersonalDevelopmentRouteConfigCompleteForPractice, selectActiveCombinedRoutesForLive } from "./personalDevelopmentRouteConfigReadiness.ts";
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

test('"linked" with an incomplete State is NOT practice-ready', () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const item = thoughtV2({ beneficialActionAgainstFactor: "פעולה" });
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [item], [incompleteState()], []), false);
});

test('"linked" with a complete, enabled State and an explicit action relationship is practice-ready', () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "different_actions" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const item = thoughtV2({ beneficialActionAgainstFactor: "פעולה" });
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [item], [completeState()], []), true);
});

test('"linked" with a DISABLED State is not practice-ready even if its content is complete', () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const item = thoughtV2({ beneficialActionAgainstFactor: "פעולה" });
  const disabledState = disableLibraryItem(completeState(), NOW);
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [item], [disabledState], []), false);
});

test('"decide_in_live" with an incomplete candidate State is NOT practice-ready -- LIVE may still choose to include it', () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "decide_in_live", stateProfileId: "s1" });
  const item = thoughtV2({ beneficialActionAgainstFactor: "פעולה" });
  assert.equal(isPersonalDevelopmentRouteConfigCompleteForPractice(c, [item], [incompleteState()], []), false);
});

test('"decide_in_live" with a complete candidate State is practice-ready', () => {
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

test('State included AND the item\'s own action is resolvable -- "legacy_unspecified" blocks readiness', () => {
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

// --- selectActiveCombinedRoutesForLive -- regression repair task: the
// single selector build/LiveModeSelectScreen.tsx (the ARCHI LIVE
// selection screen) uses to decide which combined routes to show. ---

function readyNoStateThought(id: string): { config: PersonalDevelopmentRouteConfig; item: InterferenceItem } {
  return {
    config: config({ id, interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }),
    item: thoughtV2({ beneficialActionAgainstFactor: "לנשום עמוק" }),
  };
}

test("selectActiveCombinedRoutesForLive: an enabled, practice-ready route appears in the LIVE selection", () => {
  const { config: c, item } = readyNoStateThought("route1");
  const result = selectActiveCombinedRoutesForLive([c], [item], [], []);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "route1");
});

test("selectActiveCombinedRoutesForLive: a disabled route does not appear even though its own content is complete", () => {
  const { config: c, item } = readyNoStateThought("route1");
  const disabled = { ...c, status: "disabled" as const };
  assert.deepEqual(selectActiveCombinedRoutesForLive([disabled], [item], [], []), []);
});

test("selectActiveCombinedRoutesForLive: an archived route does not appear even though its own content is complete", () => {
  const { config: c, item } = readyNoStateThought("route1");
  const archived = { ...c, status: "archived" as const };
  assert.deepEqual(selectActiveCombinedRoutesForLive([archived], [item], [], []), []);
});

test("selectActiveCombinedRoutesForLive: a not-yet-ready (draft) enabled route does not appear", () => {
  const c = config({ id: "route1", interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  const draftItem = thoughtV2({ beneficialActionAgainstFactor: null });
  assert.deepEqual(selectActiveCombinedRoutesForLive([c], [draftItem], [], []), []);
});

test("selectActiveCombinedRoutesForLive: editing a route (e.g. enabling Presence) changes what the next call returns -- no stale/duplicated record", () => {
  const { config: c, item } = readyNoStateThought("route1");
  const beforeEdit = selectActiveCombinedRoutesForLive([c], [item], [], []);
  assert.equal(beforeEdit[0].presenceEnabled, false);

  const edited = { ...c, presenceEnabled: true, linkedPresenceArcId: "p1" };
  const notReadyPresence = createEmptyPresenceArc("p1", "נוכחות", NOW);
  const afterEditWithIncompletePresence = selectActiveCombinedRoutesForLive([edited], [item], [], [notReadyPresence]);
  assert.deepEqual(afterEditWithIncompletePresence, [], "the edited route is not yet ready again until its new Presence config is itself complete");

  const readyPresenceArc = { ...notReadyPresence, beneficialAction: "פעולה מיטיבה" };
  const afterEditReady = selectActiveCombinedRoutesForLive([edited], [item], [], [readyPresenceArc]);
  assert.equal(afterEditReady.length, 1);
  assert.equal(afterEditReady[0].presenceEnabled, true, "the LIVE selection reflects the route's latest saved configuration, never a stale copy");
});

test("selectActiveCombinedRoutesForLive: multiple active combined routes are each shown independently, keyed by their own stable id", () => {
  const routeA = readyNoStateThought("route-A");
  const routeB = readyNoStateThought("route-B");
  const result = selectActiveCombinedRoutesForLive([routeA.config, routeB.config], [routeA.item], [], []);
  const ids = result.map((r) => r.id).sort();
  assert.deepEqual(ids, ["route-A", "route-B"]);
});

test("selectActiveCombinedRoutesForLive: one disabled route among several active ones only removes that one -- the others stay independently visible", () => {
  const routeA = readyNoStateThought("route-A");
  const routeB = readyNoStateThought("route-B");
  const disabledB = { ...routeB.config, status: "disabled" as const };
  const result = selectActiveCombinedRoutesForLive([routeA.config, disabledB], [routeA.item], [], []);
  assert.deepEqual(result.map((r) => r.id), ["route-A"]);
});

// ---------------------------------------------------------------------------
// Desired State / combined-route readiness fix -- regression scenarios A-J
// from the reported "ביטחון חברתי" bug (route stays draft with no
// diagnostics; "same action" duplicate-action requirement).
// ---------------------------------------------------------------------------

// State with regulationAnchor + encodingCue but genuinely NO own action --
// exactly the shape a Desired State like "ביטחון חברתי" has once its
// regulation/encoding is filled in but the trainee never duplicated its
// action into a second field.
function stateWithoutOwnAction(overrides: Partial<StateProfile> = {}): StateProfile {
  return { ...createEmptyStateProfile("s1", "ביטחון חברתי", null, NOW), regulationAnchor: "עוגן", encodingCue: "קידוד", action: null, ...overrides };
}

// A. An existing Desired State selected + no Presence + all mandatory fields complete -> ready.
test("A: an existing, fully complete Desired State selected with no Presence is LIVE-ready", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "different_actions" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const item = thoughtV2({ beneficialActionAgainstFactor: "פעולה מיטיבה" });
  const result = evaluatePersonalDevelopmentRouteConfigReadiness(c, [item], [completeState()], []);
  assert.equal(result.ready, true);
  assert.deepEqual(result.missingRequirements, []);
});

// B / J. Presence unchecked must have zero effect on readiness -- no Presence validation runs at all.
test("B/J: Presence unchecked (presenceEnabled: false) never blocks readiness, even with a dangling/invalid linkedPresenceArcId left over from an earlier edit", () => {
  const c = config({
    interferenceItemIds: ["t1"],
    itemRelationships: { t1: { actionRelationship: "different_actions" } },
    stateInclusionPolicy: "linked",
    stateProfileId: "s1",
    presenceEnabled: false,
    linkedPresenceArcId: "some-presence-that-does-not-exist",
    presenceActionRelationship: "legacy_unspecified",
  });
  const item = thoughtV2({ beneficialActionAgainstFactor: "פעולה מיטיבה" });
  const result = evaluatePersonalDevelopmentRouteConfigReadiness(c, [item], [completeState()], []);
  assert.equal(result.ready, true);
  assert.ok(
    !result.missingRequirements.some((r) => r.code.startsWith("presence_")),
    "no presence-related requirement may appear when presenceEnabled is false"
  );
});

// C. THE ROOT-CAUSE FIX: "same_action" chosen -> one valid action (the factor's own) satisfies both roles; the State's own action field is not required.
test("C: same_action chosen -- the factor's own action satisfies both roles, the State's own action field is not required (this is the reported bug)", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const item = thoughtV2({ beneficialActionAgainstFactor: "לדבר בביטחון" });
  const state = stateWithoutOwnAction(); // regulationAnchor + encodingCue present, action genuinely empty
  const result = evaluatePersonalDevelopmentRouteConfigReadiness(c, [item], [state], []);
  assert.equal(result.ready, true, "must not require duplicating the same action into the State's own action field");
  assert.deepEqual(result.missingRequirements, []);
});

// D. "different_actions" chosen + one action missing -> draft, with the exact missing-action reason.
test("D: different_actions chosen with the State's own action missing -- draft, with an exact 'missing State action' reason", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "different_actions" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const item = thoughtV2({ beneficialActionAgainstFactor: "לדבר בביטחון" });
  const state = stateWithoutOwnAction();
  const result = evaluatePersonalDevelopmentRouteConfigReadiness(c, [item], [state], []);
  assert.equal(result.ready, false);
  assert.ok(result.missingRequirements.some((r) => r.code === "missing_state_action"), "must name the State's own action as the exact missing piece");
});

test("D (factor side): different_actions chosen with the FACTOR's own action missing -- draft, with an exact 'missing factor action' reason", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const item = thoughtV2({ beneficialActionAgainstFactor: null });
  const result = evaluatePersonalDevelopmentRouteConfigReadiness(c, [item], [completeState()], []);
  assert.equal(result.ready, false);
  assert.ok(result.missingRequirements.some((r) => r.code === "missing_factor_action"), "must name the factor's own action as the exact missing piece");
});

// E. "different_actions" chosen + both actions present -> LIVE-ready if all other mandatory requirements are complete.
test("E: different_actions chosen with both the factor's own action AND the State's own action present -- LIVE-ready", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "different_actions" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const item = thoughtV2({ beneficialActionAgainstFactor: "לדבר בביטחון" });
  const result = evaluatePersonalDevelopmentRouteConfigReadiness(c, [item], [completeState()], []);
  assert.equal(result.ready, true);
});

// H. After editing a missing field, readiness recalculates immediately -- no cached/stale result.
test("H: editing the Desired State to add its previously-missing action flips readiness on the very next call, with no stale result", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "different_actions" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const item = thoughtV2({ beneficialActionAgainstFactor: "לדבר בביטחון" });

  const before = evaluatePersonalDevelopmentRouteConfigReadiness(c, [item], [stateWithoutOwnAction()], []);
  assert.equal(before.ready, false);

  const editedState = stateWithoutOwnAction({ action: "לנשום ולדבר באיטיות" });
  const after = evaluatePersonalDevelopmentRouteConfigReadiness(c, [item], [editedState], []);
  assert.equal(after.ready, true, "the very next evaluation call must reflect the edited State, never a cached prior result");
});

// G. An existing combined route referencing that Desired State receives the updated data -- same id, new content, re-evaluated fresh.
test("G: a route referencing an existing Desired State by id always evaluates against whatever record currently has that id -- never a stale copy", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "different_actions" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const item = thoughtV2({ beneficialActionAgainstFactor: "לדבר בביטחון" });

  const originalState = stateWithoutOwnAction({ name: "ביטחון חברתי" });
  const originalResult = evaluatePersonalDevelopmentRouteConfigReadiness(c, [item], [originalState], []);
  assert.equal(originalResult.ready, false);

  const updatedState = { ...originalState, action: "לדבר בקול יציב", updatedAt: "2026-01-03T00:00:00.000Z" };
  assert.equal(updatedState.id, originalState.id, "the edited record keeps the exact same stable id");
  const updatedResult = evaluatePersonalDevelopmentRouteConfigReadiness(c, [item], [updatedState], []);
  assert.equal(updatedResult.ready, true, "the SAME route config, unchanged, must reflect the State's updated content");
});

// I. An older persisted Desired State (missing newer-shaped optional content) must never crash the editor or the readiness calculation.
test("I: an older/partial Desired State record never crashes readiness -- missing fields are treated as genuinely missing, never fabricated", () => {
  const olderState = createEmptyStateProfile("s1", "ביטחון חברתי", null, NOW); // every optional field null, exactly as an old name-only record would normalize to
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const item = thoughtV2({ beneficialActionAgainstFactor: "פעולה" });
  assert.doesNotThrow(() => evaluatePersonalDevelopmentRouteConfigReadiness(c, [item], [olderState], []));
  const result = evaluatePersonalDevelopmentRouteConfigReadiness(c, [item], [olderState], []);
  assert.equal(result.ready, false);
  assert.ok(result.missingRequirements.some((r) => r.code === "state_profile_incomplete"), "must surface the State's own missing regulation/encoding content, never crash or silently pass");
});

// --- Structural reasons surface as an actionable diagnostic too ---

test("a structurally invalid route (no factors, no Presence) reports the exact missing piece rather than only a generic false", () => {
  const c = config({ interferenceItemIds: [], presenceEnabled: false });
  const result = evaluatePersonalDevelopmentRouteConfigReadiness(c, [], [], []);
  assert.equal(result.ready, false);
  assert.equal(result.missingRequirements.length, 1);
  assert.equal(result.missingRequirements[0].code, "no_factors_configured");
});

test("a disabled linked State surfaces its own distinct diagnostic", () => {
  const c = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  const item = thoughtV2({ beneficialActionAgainstFactor: "פעולה" });
  const disabledState = disableLibraryItem(completeState(), NOW);
  const result = evaluatePersonalDevelopmentRouteConfigReadiness(c, [item], [disabledState], []);
  assert.equal(result.ready, false);
  assert.ok(result.missingRequirements.some((r) => r.code === "state_profile_disabled"));
});

test("isPersonalDevelopmentRouteConfigCompleteForPractice and evaluatePersonalDevelopmentRouteConfigReadiness never disagree -- single source of truth", () => {
  const scenarios: Array<{ config: PersonalDevelopmentRouteConfig; items: InterferenceItem[]; states: StateProfile[]; presence: PresenceArc[] }> = [
    { config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" }), items: [thoughtV2({ beneficialActionAgainstFactor: "פעולה" })], states: [stateWithoutOwnAction()], presence: [] },
    { config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "different_actions" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" }), items: [thoughtV2({ beneficialActionAgainstFactor: "פעולה" })], states: [stateWithoutOwnAction()], presence: [] },
    { config: config({ interferenceItemIds: [] }), items: [], states: [], presence: [] },
  ];
  for (const s of scenarios) {
    const structured = evaluatePersonalDevelopmentRouteConfigReadiness(s.config, s.items, s.states, s.presence);
    const boolean = isPersonalDevelopmentRouteConfigCompleteForPractice(s.config, s.items, s.states, s.presence);
    assert.equal(structured.ready, boolean);
  }
});
