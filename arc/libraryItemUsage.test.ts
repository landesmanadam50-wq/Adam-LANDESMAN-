import test from "node:test";
import assert from "node:assert/strict";

import {
  cloneInterferenceItemForProgram,
  clonePresenceArcDraftForProgram,
  cloneStateProfileForProgram,
  findRouteConfigsReferencingInterferenceItem,
  findRouteConfigsReferencingPresenceArc,
  findRouteConfigsReferencingStateProfile,
  isLibraryItemSharedElsewhere,
  repointInterferenceItemReference,
  repointPresenceArcReference,
  repointStateProfileReference,
} from "./libraryItemUsage.ts";
import { createEmptyPersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import type { PersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import { createEmptyThoughtInterferenceItem } from "./interferenceItem.ts";
import { createEmptyStateProfile } from "./stateProfile.ts";
import { createEmptyPresenceArcDraft } from "./presenceArcs.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-02T00:00:00.000Z";

function route(id: string, overrides: Partial<PersonalDevelopmentRouteConfig> = {}): PersonalDevelopmentRouteConfig {
  return { ...createEmptyPersonalDevelopmentRouteConfig(id, null, NOW), ...overrides };
}

// --- findRouteConfigsReferencingInterferenceItem ---

test("returns no routes when nothing references the item", () => {
  const configs = [route("r1", { interferenceItemIds: ["other"] })];
  assert.deepEqual(findRouteConfigsReferencingInterferenceItem("t1", configs), []);
});

test("returns every OTHER route referencing the item", () => {
  const configs = [route("r1", { interferenceItemIds: ["t1"] }), route("r2", { interferenceItemIds: ["t1", "b1"] }), route("r3", { interferenceItemIds: ["b1"] })];
  const result = findRouteConfigsReferencingInterferenceItem("t1", configs);
  assert.deepEqual(
    result.map((r) => r.id),
    ["r1", "r2"]
  );
});

test("excludes the route currently being edited via excludeRouteId -- editing from inside its own owning route never flags itself", () => {
  const configs = [route("r1", { interferenceItemIds: ["t1"] }), route("r2", { interferenceItemIds: ["t1"] })];
  const result = findRouteConfigsReferencingInterferenceItem("t1", configs, "r1");
  assert.deepEqual(
    result.map((r) => r.id),
    ["r2"]
  );
});

test("excludeRouteId omitted/null/undefined behaves identically -- no route is excluded", () => {
  const configs = [route("r1", { interferenceItemIds: ["t1"] }), route("r2", { interferenceItemIds: ["t1"] })];
  assert.equal(findRouteConfigsReferencingInterferenceItem("t1", configs).length, 2);
  assert.equal(findRouteConfigsReferencingInterferenceItem("t1", configs, null).length, 2);
  assert.equal(findRouteConfigsReferencingInterferenceItem("t1", configs, undefined).length, 2);
});

test("an archived route referencing the item is never counted -- retired, no longer 'still linked'", () => {
  const configs = [route("r1", { interferenceItemIds: ["t1"], status: "archived" }), route("r2", { interferenceItemIds: ["t1"] })];
  const result = findRouteConfigsReferencingInterferenceItem("t1", configs);
  assert.deepEqual(
    result.map((r) => r.id),
    ["r2"]
  );
});

test("a disabled (but not archived) route referencing the item still counts -- disabling is temporary/reversible, the reference is still real", () => {
  const configs = [route("r1", { interferenceItemIds: ["t1"], status: "disabled" })];
  const result = findRouteConfigsReferencingInterferenceItem("t1", configs);
  assert.deepEqual(
    result.map((r) => r.id),
    ["r1"]
  );
});

// --- findRouteConfigsReferencingStateProfile ---

test("returns every OTHER non-archived route whose own stateProfileId matches, for both linked and decide_in_live policies", () => {
  const configs = [
    route("r1", { stateInclusionPolicy: "linked", stateProfileId: "s1" }),
    route("r2", { stateInclusionPolicy: "decide_in_live", stateProfileId: "s1" }),
    route("r3", { stateInclusionPolicy: "linked", stateProfileId: "s2" }),
    route("r4", { stateInclusionPolicy: "none", stateProfileId: null }),
  ];
  const result = findRouteConfigsReferencingStateProfile("s1", configs);
  assert.deepEqual(
    result.map((r) => r.id),
    ["r1", "r2"]
  );
});

test("excludes the route being edited and archived routes, same as the interference-item lookup", () => {
  const configs = [
    route("r1", { stateInclusionPolicy: "linked", stateProfileId: "s1" }),
    route("r2", { stateInclusionPolicy: "linked", stateProfileId: "s1" }),
    route("r3", { stateInclusionPolicy: "linked", stateProfileId: "s1", status: "archived" }),
  ];
  const result = findRouteConfigsReferencingStateProfile("s1", configs, "r1");
  assert.deepEqual(
    result.map((r) => r.id),
    ["r2"]
  );
});

// --- findRouteConfigsReferencingPresenceArc ---

test("only counts a route when presenceEnabled is true AND linkedPresenceArcId matches -- a matching id with presence disabled never counts", () => {
  const configs = [
    route("r1", { presenceEnabled: true, linkedPresenceArcId: "p1" }),
    route("r2", { presenceEnabled: false, linkedPresenceArcId: "p1" }),
    route("r3", { presenceEnabled: true, linkedPresenceArcId: "p2" }),
  ];
  const result = findRouteConfigsReferencingPresenceArc("p1", configs);
  assert.deepEqual(
    result.map((r) => r.id),
    ["r1"]
  );
});

test("excludes the route being edited and archived routes, same as the other two lookups", () => {
  const configs = [
    route("r1", { presenceEnabled: true, linkedPresenceArcId: "p1" }),
    route("r2", { presenceEnabled: true, linkedPresenceArcId: "p1" }),
    route("r3", { presenceEnabled: true, linkedPresenceArcId: "p1", status: "archived" }),
  ];
  const result = findRouteConfigsReferencingPresenceArc("p1", configs, "r1");
  assert.deepEqual(
    result.map((r) => r.id),
    ["r2"]
  );
});

// --- isLibraryItemSharedElsewhere ---

test("isLibraryItemSharedElsewhere is false for an empty result and true for a non-empty one -- the exact condition gating the copy-or-continue banner", () => {
  assert.equal(isLibraryItemSharedElsewhere([]), false);
  assert.equal(isLibraryItemSharedElsewhere([route("r1")]), true);
});

test("a brand-new item not yet referenced by any route is never flagged as shared -- no banner on first creation", () => {
  const configs: PersonalDevelopmentRouteConfig[] = [route("r1", { interferenceItemIds: ["other-item"] })];
  const referencing = findRouteConfigsReferencingInterferenceItem("brand-new-item", configs, "r1");
  assert.equal(isLibraryItemSharedElsewhere(referencing), false);
});

// --- "copy for this program only": cloneInterferenceItemForProgram / repointInterferenceItemReference ---

test("cloneInterferenceItemForProgram produces an independent copy under the new id/timestamps -- never shares an id with, or mutates, the original", () => {
  const original = { ...createEmptyThoughtInterferenceItem("t1", "מחשבה מקורית", null, NOW), thoughtText: "המקור" };
  const cloned = cloneInterferenceItemForProgram(original, "t2", LATER);
  assert.equal(cloned.id, "t2");
  assert.equal(cloned.createdAt, LATER);
  assert.equal(cloned.updatedAt, LATER);
  assert.equal(cloned.name, "מחשבה מקורית");
  assert.equal((cloned as typeof original).thoughtText, "המקור");
  // The original is byte-identical, untouched.
  assert.equal(original.id, "t1");
  assert.equal(original.createdAt, NOW);
});

test("repointInterferenceItemReference substitutes the id IN PLACE (BUILD order preserved), moves the itemRelationships entry, and touches no other field", () => {
  const config = route("r1", {
    interferenceItemIds: ["b1", "t1", "u1"], // BUILD order
    itemRelationships: { t1: { actionRelationship: "same_action" } },
    presenceEnabled: true,
  });
  const repointed = repointInterferenceItemReference(config, "t1", "t2");
  assert.deepEqual(repointed.interferenceItemIds, ["b1", "t2", "u1"], "t1 is substituted in place, never appended/reordered");
  assert.equal(repointed.itemRelationships.t1, undefined, "the old key is gone");
  assert.deepEqual(repointed.itemRelationships.t2, { actionRelationship: "same_action" }, "the relationship moves to the new id, value untouched");
  assert.equal(repointed.presenceEnabled, true, "every other field is untouched");
  // The input config is never mutated.
  assert.deepEqual(config.interferenceItemIds, ["b1", "t1", "u1"]);
});

test("repointInterferenceItemReference for an item with no configured relationship never fabricates one for the new id", () => {
  const config = route("r1", { interferenceItemIds: ["t1"], itemRelationships: {} });
  const repointed = repointInterferenceItemReference(config, "t1", "t2");
  assert.deepEqual(repointed.interferenceItemIds, ["t2"]);
  assert.equal(repointed.itemRelationships.t2, undefined);
});

test("copying leaves the ORIGINAL item id resolvable exactly as before for any OTHER route that still references it -- end-to-end isolation", () => {
  const original = createEmptyThoughtInterferenceItem("t1", "מקור משותף", null, NOW);
  const routeA = route("rA", { interferenceItemIds: ["t1"] });
  const routeB = route("rB", { interferenceItemIds: ["t1"] });

  // routeA "copies for this program only": it gets a repointed config and a clone; routeA and routeB are two separate PersonalDevelopmentRouteConfig objects, so repointing routeA's own copy never touches routeB's.
  const cloned = cloneInterferenceItemForProgram(original, "t2", LATER);
  const repointedA = repointInterferenceItemReference(routeA, "t1", "t2");

  assert.deepEqual(repointedA.interferenceItemIds, ["t2"], "routeA now points at the copy");
  assert.deepEqual(routeB.interferenceItemIds, ["t1"], "routeB's own reference is completely untouched");
  assert.equal(cloned.name, original.name, "the copy starts as an exact content match");
  assert.notEqual(cloned.id, original.id);
});

// --- "copy for this program only": cloneStateProfileForProgram / repointStateProfileReference ---

test("cloneStateProfileForProgram produces an independent copy under the new id/timestamps", () => {
  const original = { ...createEmptyStateProfile("s1", "מצב מקורי", null, NOW), regulationAnchor: "עוגן" };
  const cloned = cloneStateProfileForProgram(original, "s2", LATER);
  assert.equal(cloned.id, "s2");
  assert.equal(cloned.createdAt, LATER);
  assert.equal(cloned.regulationAnchor, "עוגן");
  assert.equal(original.id, "s1", "the original is untouched");
});

test("repointStateProfileReference only ever changes stateProfileId", () => {
  const config = route("r1", { stateInclusionPolicy: "linked", stateProfileId: "s1", presenceEnabled: true });
  const repointed = repointStateProfileReference(config, "s2");
  assert.equal(repointed.stateProfileId, "s2");
  assert.equal(repointed.stateInclusionPolicy, "linked", "every other field is untouched");
  assert.equal(repointed.presenceEnabled, true);
  assert.equal(config.stateProfileId, "s1", "the input config is never mutated");
});

// --- "copy for this program only": clonePresenceArcDraftForProgram / repointPresenceArcReference ---

test("clonePresenceArcDraftForProgram produces an independent draft copy -- the caller assigns the fresh id separately at save time", () => {
  const original = { ...createEmptyPresenceArcDraft(), name: "נוכחות מקורית", beneficialAction: "פעולה" };
  const cloned = clonePresenceArcDraftForProgram(original);
  assert.deepEqual(cloned, original, "same content");
  assert.notEqual(cloned, original, "a genuinely different object, never the same reference");
});

test("repointPresenceArcReference only ever changes linkedPresenceArcId", () => {
  const config = route("r1", { presenceEnabled: true, linkedPresenceArcId: "p1", stateInclusionPolicy: "none" });
  const repointed = repointPresenceArcReference(config, "p2");
  assert.equal(repointed.linkedPresenceArcId, "p2");
  assert.equal(repointed.presenceEnabled, true, "every other field is untouched");
  assert.equal(config.linkedPresenceArcId, "p1", "the input config is never mutated");
});
