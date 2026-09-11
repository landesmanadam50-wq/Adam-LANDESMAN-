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

test("normalizeArcGoal backfills every interfering mapping's new optional fields to their safe defaults -- miniArcId/identityProtocolId/goalAction null, executionMode 'full'", () => {
  const legacyMapping = { id: "m1", interferingState: "עייפות", supportiveProtocolId: "s1", supportiveAction: "a1" };
  const g = goal({ interferingMappings: [legacyMapping] });
  const normalized = normalizeArcGoal(g);
  assert.equal(normalized.interferingMappings[0].miniArcId, null);
  assert.equal(normalized.interferingMappings[0].executionMode, "full", "'full' -- every pre-existing mapping's only real bridge was always the Full protocol");
  assert.equal(normalized.interferingMappings[0].identityProtocolId, null);
  assert.equal(normalized.interferingMappings[0].goalAction, null);
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
  assert.equal(normalized.urgeMappings[0].urgeArcId, "urge-1");
  assert.equal(normalized.urgeMappings[0].need, "רגיעה");
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
