import test from "node:test";
import assert from "node:assert/strict";

import {
  createEmptyLifeManifest,
  createEmptyMajorGoal,
  createEmptySubGoal,
  createEmptyTarget,
  deleteLifeManifestFromList,
  deleteMajorGoalFromLifeManifest,
  deleteSubGoalFromMajorGoal,
  deleteTargetFromList,
  duplicateLifeManifest,
  generateLifeManifestId,
  generateMajorGoalId,
  generateSubGoalId,
  generateTargetId,
  isLifeManifestDraft,
  isMajorGoalQuestionnaireComplete,
  reorderSubGoals,
  upsertLifeManifestInList,
  upsertMajorGoalInLifeManifest,
  upsertSubGoalInMajorGoal,
  upsertTargetInList,
} from "./lifeManifest.ts";
import type { LifeManifest, MajorGoal, SubGoal, Target } from "./lifeManifest.ts";

const NOW = "2024-01-01T00:00:00.000Z";

function manifest(overrides: Partial<LifeManifest> = {}): LifeManifest {
  return { ...createEmptyLifeManifest("lm1", NOW), ...overrides };
}

function majorGoal(overrides: Partial<MajorGoal> = {}): MajorGoal {
  return { ...createEmptyMajorGoal("mg1", "מטרה", NOW), ...overrides };
}

function subGoal(overrides: Partial<SubGoal> = {}): SubGoal {
  return { ...createEmptySubGoal("sg1", "תת מטרה", NOW), ...overrides };
}

// ---------------------------------------------------------------------------
// Id generators
// ---------------------------------------------------------------------------

test("every id generator produces distinct ids across repeated calls", () => {
  const ids = new Set([generateLifeManifestId(), generateLifeManifestId(), generateMajorGoalId(), generateSubGoalId(), generateTargetId()]);
  assert.equal(ids.size, 5);
});

test("each id generator has its own distinct prefix, never confused with another entity's id", () => {
  assert.match(generateLifeManifestId(), /^lifemanifest-/);
  assert.match(generateMajorGoalId(), /^majorgoal-/);
  assert.match(generateSubGoalId(), /^subgoal-/);
  assert.match(generateTargetId(), /^target-/);
});

// ---------------------------------------------------------------------------
// Empty-record builders
// ---------------------------------------------------------------------------

test("createEmptyLifeManifest starts with no Major Goals", () => {
  const m = createEmptyLifeManifest("id1", NOW);
  assert.deepEqual(m.majorGoals, []);
  assert.equal(m.createdAt, NOW);
  assert.equal(m.updatedAt, NOW);
});

test("createEmptyMajorGoal starts with only title set -- every other question null, no sub-goals, status 'draft'", () => {
  const g = createEmptyMajorGoal("id1", "כושר", NOW);
  assert.equal(g.title, "כושר");
  assert.equal(g.why, null);
  assert.equal(g.value, null);
  assert.equal(g.futureIdentity, null);
  assert.equal(g.futureLifeDescription, null);
  assert.equal(g.capabilitiesNeeded, null);
  assert.equal(g.obstacles, null);
  assert.equal(g.supportiveInternalStates, null);
  assert.equal(g.realWorldSign, null);
  assert.equal(g.status, "draft");
  assert.deepEqual(g.subGoals, []);
});

test("createEmptyTarget starts with safe defaults -- currentProgress 0, status draft, every cross-reference empty/null", () => {
  const t = createEmptyTarget("t1", "sg1", "12 שירים", NOW);
  assert.equal(t.subGoalId, "sg1");
  assert.equal(t.currentProgress, 0);
  assert.equal(t.status, "draft");
  assert.equal(t.connectedIdentityProtocolId, null);
  assert.equal(t.connectedArcGoalId, null);
  assert.deepEqual(t.connectedSupportiveProtocolIds, []);
  assert.deepEqual(t.connectedArcLinkIds, []);
});

// ---------------------------------------------------------------------------
// Top-level list helpers
// ---------------------------------------------------------------------------

test("upsertLifeManifestInList appends a new manifest when its id isn't in the list yet", () => {
  const result = upsertLifeManifestInList([], manifest());
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "lm1");
});

test("upsertLifeManifestInList updates the one matching manifest in place, leaving every other manifest's own object untouched", () => {
  const other = manifest({ id: "lm2" });
  const original = manifest();
  const updated = manifest({ majorGoals: [majorGoal()] });
  const result = upsertLifeManifestInList([other, original], updated);
  assert.equal(result.length, 2);
  assert.equal(result[0], other, "the untouched manifest is the exact same object, never copied/rebuilt");
  assert.equal(result[1].majorGoals.length, 1);
});

test("upsertLifeManifestInList never reorders the rest of the list", () => {
  const a = manifest({ id: "a" });
  const b = manifest({ id: "b" });
  const c = manifest({ id: "c" });
  const result = upsertLifeManifestInList([a, b, c], manifest({ id: "b" }));
  assert.deepEqual(result.map((m) => m.id), ["a", "b", "c"]);
});

test("deleteLifeManifestFromList removes exactly the one matching manifest, no-op for an unmatched id", () => {
  const a = manifest({ id: "a" });
  const b = manifest({ id: "b" });
  assert.deepEqual(deleteLifeManifestFromList([a, b], "a").map((m) => m.id), ["b"]);
  const result = deleteLifeManifestFromList([a], "nonexistent");
  assert.equal(result.length, 1);
  assert.equal(result[0], a);
});

test("duplicateLifeManifest produces an independent copy under a new id, with fresh ids for every nested Major Goal and Sub-goal", () => {
  const original = manifest({
    majorGoals: [majorGoal({ id: "mg1", subGoals: [subGoal({ id: "sg1" }), subGoal({ id: "sg2" })] })],
  });
  const copy = duplicateLifeManifest(original, "lm-copy", "2024-06-01T00:00:00.000Z");
  assert.equal(copy.id, "lm-copy");
  assert.equal(copy.createdAt, "2024-06-01T00:00:00.000Z");
  assert.notEqual(copy.majorGoals[0].id, "mg1");
  assert.notEqual(copy.majorGoals[0].subGoals[0].id, "sg1");
  assert.notEqual(copy.majorGoals[0].subGoals[1].id, "sg2");
  assert.notEqual(copy.majorGoals[0].subGoals[0].id, copy.majorGoals[0].subGoals[1].id);
  // The original is completely untouched.
  assert.equal(original.majorGoals[0].id, "mg1");
  assert.equal(original.majorGoals[0].subGoals[0].id, "sg1");
});

test("duplicateLifeManifest never mutates the original", () => {
  const original = manifest({ majorGoals: [majorGoal({ subGoals: [subGoal()] })] });
  const snapshot = JSON.parse(JSON.stringify(original));
  duplicateLifeManifest(original, "lm-copy", "2024-06-01T00:00:00.000Z");
  assert.deepEqual(original, snapshot);
});

// ---------------------------------------------------------------------------
// Nested Major Goal helpers
// ---------------------------------------------------------------------------

test("upsertMajorGoalInLifeManifest appends a new goal when its id isn't on the manifest yet", () => {
  const result = upsertMajorGoalInLifeManifest(manifest(), majorGoal());
  assert.equal(result.majorGoals.length, 1);
  assert.equal(result.majorGoals[0].id, "mg1");
});

test("upsertMajorGoalInLifeManifest updates the one matching goal in place, leaving every other goal's own object untouched", () => {
  const other = majorGoal({ id: "mg2", title: "אחר" });
  const m = manifest({ majorGoals: [other, majorGoal({ title: "ישן" })] });
  const result = upsertMajorGoalInLifeManifest(m, majorGoal({ title: "חדש" }));
  assert.equal(result.majorGoals.length, 2);
  assert.equal(result.majorGoals[0], other);
  assert.equal(result.majorGoals[1].title, "חדש");
});

test("deleteMajorGoalFromLifeManifest removes exactly the one matching goal, no-op for an unmatched id", () => {
  const m = manifest({ majorGoals: [majorGoal({ id: "a" }), majorGoal({ id: "b" })] });
  assert.deepEqual(deleteMajorGoalFromLifeManifest(m, "a").majorGoals.map((g) => g.id), ["b"]);
  const result = deleteMajorGoalFromLifeManifest(manifest({ majorGoals: [majorGoal({ id: "a" })] }), "nonexistent");
  assert.equal(result.majorGoals.length, 1);
});

// ---------------------------------------------------------------------------
// Nested Sub-goal helpers
// ---------------------------------------------------------------------------

test("upsertSubGoalInMajorGoal appends a new sub-goal at the end when its id isn't on the goal yet", () => {
  const g = majorGoal({ subGoals: [subGoal({ id: "sg1" })] });
  const result = upsertSubGoalInMajorGoal(g, subGoal({ id: "sg2" }));
  assert.deepEqual(result.subGoals.map((s) => s.id), ["sg1", "sg2"]);
});

test("upsertSubGoalInMajorGoal updates the one matching sub-goal in place, leaving every other sub-goal's own object untouched", () => {
  const other = subGoal({ id: "sg2", title: "אחר" });
  const g = majorGoal({ subGoals: [subGoal({ title: "ישן" }), other] });
  const result = upsertSubGoalInMajorGoal(g, subGoal({ title: "חדש" }));
  assert.equal(result.subGoals[1], other);
  assert.equal(result.subGoals[0].title, "חדש");
});

test("deleteSubGoalFromMajorGoal removes exactly the one matching sub-goal, no-op for an unmatched id", () => {
  const g = majorGoal({ subGoals: [subGoal({ id: "a" }), subGoal({ id: "b" })] });
  assert.deepEqual(deleteSubGoalFromMajorGoal(g, "a").subGoals.map((s) => s.id), ["b"]);
  const result = deleteSubGoalFromMajorGoal(majorGoal({ subGoals: [subGoal({ id: "a" })] }), "nonexistent");
  assert.equal(result.subGoals.length, 1);
});

// ---------------------------------------------------------------------------
// Reordering
// ---------------------------------------------------------------------------

test("reorderSubGoals swaps a sub-goal with its previous neighbor when moved 'up'", () => {
  const g = majorGoal({ subGoals: [subGoal({ id: "a" }), subGoal({ id: "b" }), subGoal({ id: "c" })] });
  const result = reorderSubGoals(g, "b", "up");
  assert.deepEqual(result.subGoals.map((s) => s.id), ["b", "a", "c"]);
});

test("reorderSubGoals swaps a sub-goal with its next neighbor when moved 'down'", () => {
  const g = majorGoal({ subGoals: [subGoal({ id: "a" }), subGoal({ id: "b" }), subGoal({ id: "c" })] });
  const result = reorderSubGoals(g, "b", "down");
  assert.deepEqual(result.subGoals.map((s) => s.id), ["a", "c", "b"]);
});

test("reorderSubGoals is a no-op moving the first sub-goal 'up' or the last sub-goal 'down'", () => {
  const g = majorGoal({ subGoals: [subGoal({ id: "a" }), subGoal({ id: "b" })] });
  assert.deepEqual(reorderSubGoals(g, "a", "up").subGoals.map((s) => s.id), ["a", "b"]);
  assert.deepEqual(reorderSubGoals(g, "b", "down").subGoals.map((s) => s.id), ["a", "b"]);
});

test("reorderSubGoals is a no-op for an id that doesn't match any sub-goal", () => {
  const g = majorGoal({ subGoals: [subGoal({ id: "a" })] });
  const result = reorderSubGoals(g, "nonexistent", "up");
  assert.deepEqual(result.subGoals.map((s) => s.id), ["a"]);
});

// ---------------------------------------------------------------------------
// Draft/completeness
// ---------------------------------------------------------------------------

test("isMajorGoalQuestionnaireComplete is false for a brand-new goal (title only)", () => {
  assert.equal(isMajorGoalQuestionnaireComplete(createEmptyMajorGoal("id1", "כושר", NOW)), false);
});

test("isMajorGoalQuestionnaireComplete is false when every question is answered but there are no sub-goals", () => {
  const g = majorGoal({
    why: "x",
    value: "x",
    futureIdentity: "x",
    futureLifeDescription: "x",
    capabilitiesNeeded: "x",
    obstacles: "x",
    supportiveInternalStates: "x",
    realWorldSign: "x",
    subGoals: [],
  });
  assert.equal(isMajorGoalQuestionnaireComplete(g), false);
});

test("isMajorGoalQuestionnaireComplete is false when one required question is still blank/whitespace-only, even with a sub-goal present", () => {
  const g = majorGoal({
    why: "x",
    value: "x",
    futureIdentity: "x",
    futureLifeDescription: "x",
    capabilitiesNeeded: "x",
    obstacles: "   ",
    supportiveInternalStates: "x",
    realWorldSign: "x",
    subGoals: [subGoal()],
  });
  assert.equal(isMajorGoalQuestionnaireComplete(g), false);
});

test("isMajorGoalQuestionnaireComplete is true once all 9 questions are answered and at least one sub-goal exists", () => {
  const g = majorGoal({
    why: "x",
    value: "x",
    futureIdentity: "x",
    futureLifeDescription: "x",
    capabilitiesNeeded: "x",
    obstacles: "x",
    supportiveInternalStates: "x",
    realWorldSign: "x",
    subGoals: [subGoal()],
  });
  assert.equal(isMajorGoalQuestionnaireComplete(g), true);
});

test("isLifeManifestDraft is true for a manifest with zero Major Goals", () => {
  assert.equal(isLifeManifestDraft(manifest()), true);
});

test("isLifeManifestDraft is true when every Major Goal on the manifest is still incomplete", () => {
  const m = manifest({ majorGoals: [majorGoal(), majorGoal({ id: "mg2" })] });
  assert.equal(isLifeManifestDraft(m), true);
});

test("isLifeManifestDraft is false once at least one Major Goal on the manifest is complete", () => {
  const complete = majorGoal({
    why: "x",
    value: "x",
    futureIdentity: "x",
    futureLifeDescription: "x",
    capabilitiesNeeded: "x",
    obstacles: "x",
    supportiveInternalStates: "x",
    realWorldSign: "x",
    subGoals: [subGoal()],
  });
  const m = manifest({ majorGoals: [majorGoal({ id: "mg-incomplete" }), complete] });
  assert.equal(isLifeManifestDraft(m), false);
});

// ---------------------------------------------------------------------------
// Target flat-list helpers
// ---------------------------------------------------------------------------

function target(overrides: Partial<Target> = {}): Target {
  return { ...createEmptyTarget("t1", "sg1", "יעד", NOW), ...overrides };
}

test("upsertTargetInList appends a new target, and updates the one matching target in place without touching others", () => {
  const appended = upsertTargetInList([], target());
  assert.equal(appended.length, 1);
  const other = target({ id: "t2" });
  const result = upsertTargetInList([other, target({ title: "ישן" })], target({ title: "חדש" }));
  assert.equal(result[0], other);
  assert.equal(result[1].title, "חדש");
});

test("deleteTargetFromList removes exactly the one matching target, no-op for an unmatched id", () => {
  const a = target({ id: "a" });
  const b = target({ id: "b" });
  assert.deepEqual(deleteTargetFromList([a, b], "a").map((t) => t.id), ["b"]);
  const result = deleteTargetFromList([a], "nonexistent");
  assert.equal(result.length, 1);
  assert.equal(result[0], a);
});
