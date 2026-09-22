import test from "node:test";
import assert from "node:assert/strict";

import { deleteArcGoalFromList, duplicateArcGoal, normalizeArcGoal, upsertArcGoalInList } from "./arcGoals.ts";
import { createEmptyArcGoal } from "./types.ts";
import type { ArcGoal } from "./types.ts";

function goal(overrides: Partial<ArcGoal> = {}): ArcGoal {
  return { ...createEmptyArcGoal("g1", "מטרה", "2024-01-01T00:00:00.000Z"), ...overrides };
}

test("upsertArcGoalInList appends a new goal when its id isn't in the list yet", () => {
  const result = upsertArcGoalInList([], goal());
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "g1");
});

test("upsertArcGoalInList updates the one matching goal in place, leaving every other goal's own object untouched", () => {
  const other = goal({ id: "g2", name: "אחר" });
  const original = goal({ name: "ישן" });
  const updated = goal({ name: "חדש" });
  const result = upsertArcGoalInList([other, original], updated);
  assert.equal(result.length, 2);
  assert.equal(result[0], other, "the untouched goal is the exact same object, never copied/rebuilt");
  assert.equal(result[1].name, "חדש");
});

test("upsertArcGoalInList never reorders the rest of the list", () => {
  const a = goal({ id: "a" });
  const b = goal({ id: "b" });
  const c = goal({ id: "c" });
  const result = upsertArcGoalInList([a, b, c], goal({ id: "b", name: "עודכן" }));
  assert.deepEqual(
    result.map((g) => g.id),
    ["a", "b", "c"]
  );
});

test("deleteArcGoalFromList removes exactly the one matching goal", () => {
  const a = goal({ id: "a" });
  const b = goal({ id: "b" });
  const result = deleteArcGoalFromList([a, b], "a");
  assert.deepEqual(
    result.map((g) => g.id),
    ["b"]
  );
});

test("deleteArcGoalFromList is a no-op for an id that doesn't match any goal", () => {
  const a = goal({ id: "a" });
  const result = deleteArcGoalFromList([a], "nonexistent");
  assert.equal(result.length, 1);
  assert.equal(result[0], a);
});

test("duplicateArcGoal produces an independent copy under a new id, with a '(עותק)' suffix on the name", () => {
  const original = goal({ name: "כושר" });
  const copy = duplicateArcGoal(original, "g-copy", "2024-06-01T00:00:00.000Z");
  assert.equal(copy.id, "g-copy");
  assert.equal(copy.name, "כושר (עותק)");
  assert.equal(copy.createdAt, "2024-06-01T00:00:00.000Z");
  assert.equal(copy.updatedAt, "2024-06-01T00:00:00.000Z");
  assert.notEqual(copy.id, original.id);
});

test("duplicateArcGoal copies identityProtocolId and each mapping's supportiveProtocolId AS REFERENCES, never following/duplicating the referenced ArcBuild itself", () => {
  const original = goal({
    identityProtocolId: "identity-build-1",
    interferingMappings: [
      { id: "m1", interferingState: "עייפות", supportiveProtocolId: "state-build-1", supportiveAction: "לשתות מים" },
    ],
  });
  const copy = duplicateArcGoal(original, "g-copy", "2024-06-01T00:00:00.000Z");
  assert.equal(copy.identityProtocolId, "identity-build-1", "the SAME referenced identity protocol, not a duplicate of it");
  assert.equal(copy.interferingMappings[0].supportiveProtocolId, "state-build-1", "the SAME referenced supportive protocol");
  assert.equal(copy.interferingMappings[0].interferingState, "עייפות");
  assert.equal(copy.interferingMappings[0].supportiveAction, "לשתות מים");
});

test("duplicateArcGoal gives each interfering mapping its OWN new id, distinct from the original's mapping ids -- editing one goal's linking page never affects the other's", () => {
  const original = goal({
    interferingMappings: [
      { id: "m1", interferingState: "עייפות", supportiveProtocolId: "s1", supportiveAction: "a1" },
      { id: "m2", interferingState: "לחץ", supportiveProtocolId: "s2", supportiveAction: "a2" },
    ],
  });
  const copy = duplicateArcGoal(original, "g-copy", "2024-06-01T00:00:00.000Z");
  assert.equal(copy.interferingMappings.length, 2);
  assert.notEqual(copy.interferingMappings[0].id, "m1");
  assert.notEqual(copy.interferingMappings[1].id, "m2");
  assert.notEqual(copy.interferingMappings[0].id, copy.interferingMappings[1].id, "the two new mapping ids are also distinct from each other");
  // The original goal's own mappings are completely untouched.
  assert.equal(original.interferingMappings[0].id, "m1");
  assert.equal(original.interferingMappings[1].id, "m2");
});

test("duplicateArcGoal never mutates the original goal object", () => {
  const original = goal({ name: "כושר", interferingMappings: [{ id: "m1", interferingState: "x", supportiveProtocolId: "y", supportiveAction: "z" }] });
  const snapshot = JSON.parse(JSON.stringify(original));
  duplicateArcGoal(original, "g-copy", "2024-06-01T00:00:00.000Z");
  assert.deepEqual(original, snapshot);
});

test("createEmptyArcGoal starts with every optional field at its own empty/null default -- no field forced/invented", () => {
  const g = createEmptyArcGoal("id1", "שם", "2024-01-01T00:00:00.000Z");
  assert.equal(g.description, null);
  assert.equal(g.value, null);
  assert.equal(g.goalAction, "");
  assert.equal(g.desiredResult, "");
  assert.equal(g.identityProtocolId, null);
  assert.deepEqual(g.interferingMappings, []);
  assert.deepEqual(g.urgeMappings, [], "Urge route task: a brand-new goal starts with no urge mappings either");
});

// --- Urge route task: duplicateArcGoal's own urgeMappings treatment,
// parallel to interferingMappings above.

test("duplicateArcGoal gives each urge mapping its OWN new id, copying urgeArcId/miniArcId as references, never following/duplicating them", () => {
  const original = goal({
    urgeMappings: [
      { id: "um1", urgeArcId: "urge-1", need: "רגיעה", miniArcId: "mini-1", executionMode: "full", identityProtocolId: null, goalAction: null },
    ],
  });
  const copy = duplicateArcGoal(original, "g-copy", "2024-06-01T00:00:00.000Z");
  assert.equal(copy.urgeMappings.length, 1);
  assert.notEqual(copy.urgeMappings[0].id, "um1");
  assert.equal(copy.urgeMappings[0].urgeArcId, "urge-1", "the SAME referenced UrgeArc, not a duplicate of it");
  assert.equal(copy.urgeMappings[0].miniArcId, "mini-1", "the SAME referenced Mini ARC, not a duplicate of it");
  assert.equal(copy.urgeMappings[0].need, "רגיעה");
  // The original goal's own mapping id is completely untouched.
  assert.equal(original.urgeMappings[0].id, "um1");
});

// --- Urge route task: normalizeArcGoal's own safe-default backfill.

test("normalizeArcGoal backfills a completely missing urgeMappings array to [] -- an old goal saved before the Urge route existed loads without error", () => {
  const legacyGoal = { ...goal(), urgeMappings: undefined } as unknown as ArcGoal;
  const normalized = normalizeArcGoal(legacyGoal);
  assert.deepEqual(normalized.urgeMappings, []);
});

test("normalizeArcGoal backfills a missing interferingMappings array to [] the same way", () => {
  const legacyGoal = { ...goal(), interferingMappings: undefined } as unknown as ArcGoal;
  const normalized = normalizeArcGoal(legacyGoal);
  assert.deepEqual(normalized.interferingMappings, []);
});

test("normalizeArcGoal backfills every interfering mapping's new optional fields to their safe defaults -- miniArcId/identityProtocolId/goalAction null, executionMode 'full', actionRelationship legacy_unspecified", () => {
  const legacyMapping = { id: "m1", interferingState: "עייפות", supportiveProtocolId: "s1", supportiveAction: "a1" };
  const g = goal({ interferingMappings: [legacyMapping] });
  const normalized = normalizeArcGoal(g);
  assert.equal(normalized.interferingMappings[0].miniArcId, null);
  assert.equal(normalized.interferingMappings[0].executionMode, "full", "'full' -- every pre-existing mapping's only real bridge was always the Full protocol");
  assert.equal(normalized.interferingMappings[0].identityProtocolId, null);
  assert.equal(normalized.interferingMappings[0].goalAction, null);
  assert.equal(normalized.interferingMappings[0].actionRelationship, "legacy_unspecified", "never guessed as same_action/different_actions");
  // The mapping's own pre-existing fields are completely untouched.
  assert.equal(normalized.interferingMappings[0].interferingState, "עייפות");
  assert.equal(normalized.interferingMappings[0].supportiveProtocolId, "s1");
  assert.equal(normalized.interferingMappings[0].supportiveAction, "a1");
});

test("normalizeArcGoal backfills every urge mapping's new optional fields to the same safe defaults", () => {
  const partialUrgeMapping = { id: "um1", urgeArcId: "urge-1", need: "רגיעה" };
  const g = goal({ urgeMappings: [partialUrgeMapping as never] });
  const normalized = normalizeArcGoal(g);
  assert.equal(normalized.urgeMappings[0].miniArcId, null);
  assert.equal(normalized.urgeMappings[0].executionMode, "full");
  assert.equal(normalized.urgeMappings[0].identityProtocolId, null);
  assert.equal(normalized.urgeMappings[0].goalAction, null);
  assert.equal(normalized.urgeMappings[0].actionRelationship, "legacy_unspecified");
  assert.equal(normalized.urgeMappings[0].urgeArcId, "urge-1");
  assert.equal(normalized.urgeMappings[0].need, "רגיעה");
});

test("normalizeArcGoal preserves an already-set actionRelationship on both mapping kinds, never overwriting the coach's own explicit decision", () => {
  const g = goal({
    interferingMappings: [{ id: "m1", interferingState: "עייפות", supportiveProtocolId: "s1", supportiveAction: "a1", actionRelationship: "same_action" }],
    urgeMappings: [{ id: "um1", urgeArcId: "urge-1", need: null, actionRelationship: "different_actions" } as never],
  });
  const normalized = normalizeArcGoal(g);
  assert.equal(normalized.interferingMappings[0].actionRelationship, "same_action");
  assert.equal(normalized.urgeMappings[0].actionRelationship, "different_actions");
});

// --- Adaptive ARC architecture task (Phase 2): normalizeArcGoal's own
// safe-default backfill for stateProfileId/identityProfileId/isActive/archivedAt.

test("normalizeArcGoal backfills missing stateProfileId/identityProfileId to null -- an old goal saved before the adaptive architecture existed loads without error", () => {
  const legacyGoal = { ...goal(), stateProfileId: undefined, identityProfileId: undefined } as unknown as ArcGoal;
  const normalized = normalizeArcGoal(legacyGoal);
  assert.equal(normalized.stateProfileId, null);
  assert.equal(normalized.identityProfileId, null);
});

test("normalizeArcGoal backfills a missing isActive to false and archivedAt to null -- migration never silently activates a pre-existing goal", () => {
  const legacyGoal = { ...goal(), isActive: undefined, archivedAt: undefined } as unknown as ArcGoal;
  const normalized = normalizeArcGoal(legacyGoal);
  assert.equal(normalized.isActive, false);
  assert.equal(normalized.archivedAt, null);
});

test("normalizeArcGoal preserves an already-set stateProfileId/identityProfileId/isActive/archivedAt untouched", () => {
  const g = goal({ stateProfileId: "state-1", identityProfileId: "identity-1", isActive: true, archivedAt: null });
  const normalized = normalizeArcGoal(g);
  assert.equal(normalized.stateProfileId, "state-1");
  assert.equal(normalized.identityProfileId, "identity-1");
  assert.equal(normalized.isActive, true);
});

test("normalizeArcGoal never overwrites an already-configured field with its default", () => {
  const g = goal({
    interferingMappings: [
      {
        id: "m1",
        interferingState: "עייפות",
        supportiveProtocolId: "s1",
        supportiveAction: "a1",
        miniArcId: "mini-1",
        executionMode: "choose",
        identityProtocolId: "identity-override",
        goalAction: "פעולה מותאמת",
      },
    ],
  });
  const normalized = normalizeArcGoal(g);
  assert.equal(normalized.interferingMappings[0].miniArcId, "mini-1");
  assert.equal(normalized.interferingMappings[0].executionMode, "choose");
  assert.equal(normalized.interferingMappings[0].identityProtocolId, "identity-override");
  assert.equal(normalized.interferingMappings[0].goalAction, "פעולה מותאמת");
});

test("normalizeArcGoal leaves every other ArcGoal field completely untouched", () => {
  const g = goal({ name: "כושר", goalAction: "לרוץ", desiredResult: "מרתון" });
  const normalized = normalizeArcGoal(g);
  assert.equal(normalized.name, "כושר");
  assert.equal(normalized.goalAction, "לרוץ");
  assert.equal(normalized.desiredResult, "מרתון");
  assert.equal(normalized.id, g.id);
});

// --- Four-Week Program task: a legacy ArcGoal (saved before this field existed) still opens normally.

test("normalizeArcGoal backfills a completely missing fourWeekProgram to null -- a legacy ArcGoal still opens exactly as before", () => {
  const legacyGoal = { ...goal(), fourWeekProgram: undefined } as unknown as ArcGoal;
  const normalized = normalizeArcGoal(legacyGoal);
  assert.equal(normalized.fourWeekProgram, null);
});

test("createEmptyArcGoal itself starts with fourWeekProgram null -- never silently enabled for a brand-new goal", () => {
  assert.equal(createEmptyArcGoal("g1", "מטרה", "2025-01-01T00:00:00.000Z").fourWeekProgram, null);
});

test("normalizeArcGoal never touches an already-configured fourWeekProgram", () => {
  const g = goal({ fourWeekProgram: { enabled: true, currentWeek: 2 } as never });
  const normalized = normalizeArcGoal(g);
  assert.equal((normalized.fourWeekProgram as { enabled: boolean }).enabled, true);
  assert.equal((normalized.fourWeekProgram as { currentWeek: number }).currentWeek, 2);
});

test("duplicateArcGoal never carries over another goal's four-week program -- a duplicate starts fresh", () => {
  const g = goal({ fourWeekProgram: { enabled: true, currentWeek: 3 } as never });
  const copy = duplicateArcGoal(g, "g2", "2025-02-01T00:00:00.000Z");
  assert.equal(copy.fourWeekProgram, null);
});

// --- Adaptive ARC architecture task (unified PD/ARC Goal), Phase 1:
// personalReason, thoughtMappings/beliefMappings, miniCombinedActionOverride.

test("createEmptyArcGoal starts with personalReason null and empty thoughtMappings/beliefMappings arrays", () => {
  const g = createEmptyArcGoal("g1", "מטרה", "2024-01-01T00:00:00.000Z");
  assert.equal(g.personalReason, null);
  assert.deepEqual(g.thoughtMappings, []);
  assert.deepEqual(g.beliefMappings, []);
});

test("normalizeArcGoal backfills a missing personalReason to null and missing thoughtMappings/beliefMappings to []", () => {
  const legacyGoal = { ...goal(), personalReason: undefined, thoughtMappings: undefined, beliefMappings: undefined } as unknown as ArcGoal;
  const normalized = normalizeArcGoal(legacyGoal);
  assert.equal(normalized.personalReason, null);
  assert.deepEqual(normalized.thoughtMappings, []);
  assert.deepEqual(normalized.beliefMappings, []);
});

test("normalizeArcGoal preserves an already-set personalReason", () => {
  const g = goal({ personalReason: "כי חשוב לי" });
  assert.equal(normalizeArcGoal(g).personalReason, "כי חשוב לי");
});

test("normalizeArcGoal backfills every thought/belief mapping's optional fields to the same safe defaults as interfering/urge mappings", () => {
  const g = goal({
    thoughtMappings: [{ id: "tm1", thoughtArcId: "thought-1" } as never],
    beliefMappings: [{ id: "bm1", beliefArcId: "belief-1" } as never],
  });
  const normalized = normalizeArcGoal(g);
  assert.equal(normalized.thoughtMappings[0].miniArcId, null);
  assert.equal(normalized.thoughtMappings[0].executionMode, "full");
  assert.equal(normalized.thoughtMappings[0].identityProtocolId, null);
  assert.equal(normalized.thoughtMappings[0].goalAction, null);
  assert.equal(normalized.thoughtMappings[0].actionRelationship, "legacy_unspecified");
  assert.equal(normalized.thoughtMappings[0].miniCombinedActionOverride, null);
  assert.equal(normalized.thoughtMappings[0].thoughtArcId, "thought-1");
  assert.equal(normalized.beliefMappings[0].beliefArcId, "belief-1");
  assert.equal(normalized.beliefMappings[0].actionRelationship, "legacy_unspecified");
  assert.equal(normalized.beliefMappings[0].miniCombinedActionOverride, null);
});

test("normalizeArcGoal backfills a missing miniCombinedActionOverride on interfering/urge mappings to null, preserving an already-set one", () => {
  const g = goal({
    interferingMappings: [{ id: "m1", interferingState: "x", supportiveProtocolId: "s1", supportiveAction: "a1" }],
    urgeMappings: [{ id: "um1", urgeArcId: "urge-1", need: null, miniCombinedActionOverride: "פעולה משולבת" } as never],
  });
  const normalized = normalizeArcGoal(g);
  assert.equal(normalized.interferingMappings[0].miniCombinedActionOverride, null);
  assert.equal(normalized.urgeMappings[0].miniCombinedActionOverride, "פעולה משולבת", "already-set override preserved unchanged");
});

test("duplicateArcGoal gives each thought/belief mapping its OWN new id, copying thoughtArcId/beliefArcId as references", () => {
  const original = goal({
    thoughtMappings: [{ id: "tm1", thoughtArcId: "thought-1" } as never],
    beliefMappings: [{ id: "bm1", beliefArcId: "belief-1" } as never],
  });
  const copy = duplicateArcGoal(original, "g-copy", "2024-06-01T00:00:00.000Z");
  assert.notEqual(copy.thoughtMappings[0].id, "tm1");
  assert.equal(copy.thoughtMappings[0].thoughtArcId, "thought-1", "the SAME referenced ThoughtArc, not a duplicate of it");
  assert.notEqual(copy.beliefMappings[0].id, "bm1");
  assert.equal(copy.beliefMappings[0].beliefArcId, "belief-1", "the SAME referenced BeliefArc, not a duplicate of it");
  // The original goal's own mapping ids are completely untouched.
  assert.equal(original.thoughtMappings[0].id, "tm1");
  assert.equal(original.beliefMappings[0].id, "bm1");
});

test("duplicateArcGoal defaults missing thoughtMappings/beliefMappings to [] rather than throwing on a pre-Phase-1 goal", () => {
  const legacyOriginal = { ...goal(), thoughtMappings: undefined, beliefMappings: undefined } as unknown as ArcGoal;
  const copy = duplicateArcGoal(legacyOriginal, "g-copy", "2024-06-01T00:00:00.000Z");
  assert.deepEqual(copy.thoughtMappings, []);
  assert.deepEqual(copy.beliefMappings, []);
});
