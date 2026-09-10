import test from "node:test";
import assert from "node:assert/strict";

import {
  activateSubGoal,
  allRequiredTargetsComplete,
  completeSubGoal,
  computeSubGoalProgress,
  createEmptyAchievedStateMantra,
  createEmptyEmbodiedIdentityCue,
  createEmptyLifeManifest,
  createEmptyMajorGoal,
  createEmptySubGoal,
  createEmptyTarget,
  DEADLINE_APPROACHING_LEAD_DAYS,
  deleteLifeManifestFromList,
  deleteMajorGoalFromLifeManifest,
  deleteSubGoalFromMajorGoal,
  deleteTargetFromList,
  duplicateLifeManifest,
  findMajorGoalOwner,
  findSubGoalOwner,
  generateLifeManifestId,
  generateMajorGoalId,
  generateSubGoalId,
  generateTargetId,
  isLifeManifestDraft,
  isMajorGoalQuestionnaireComplete,
  reorderSubGoals,
  resolveActiveSubGoal,
  resolveAchievedStateMantraForSubGoal,
  resolveDeadlineReminderFireAt,
  resolveEffectiveTargetArcGoalId,
  resolveEmbodiedIdentityCueForSubGoal,
  resolveNextDeadlineReminder,
  resolveNextSubGoal,
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

// ---------------------------------------------------------------------------
// Sub-goal↔ARC Goal connection task: cross-manifest finders
// ---------------------------------------------------------------------------

test("findSubGoalOwner locates a Sub-goal by id alone, reporting its 1-based order among its siblings", () => {
  const m = manifest({
    majorGoals: [
      majorGoal({ id: "mg1", subGoals: [subGoal({ id: "a" }), subGoal({ id: "b" }), subGoal({ id: "c" })] }),
    ],
  });
  const owner = findSubGoalOwner([m], "b");
  assert.equal(owner?.manifest.id, "lm1");
  assert.equal(owner?.majorGoal.id, "mg1");
  assert.equal(owner?.subGoal.id, "b");
  assert.equal(owner?.order, 2);
});

test("findSubGoalOwner returns null for an id that doesn't match any Sub-goal across any manifest", () => {
  const m = manifest({ majorGoals: [majorGoal({ subGoals: [subGoal({ id: "a" })] })] });
  assert.equal(findSubGoalOwner([m], "nonexistent"), null);
});

test("findMajorGoalOwner locates a Major Goal by id alone across manifests", () => {
  const m1 = manifest({ id: "lm1", majorGoals: [majorGoal({ id: "mg1" })] });
  const m2 = manifest({ id: "lm2", majorGoals: [majorGoal({ id: "mg2" })] });
  const owner = findMajorGoalOwner([m1, m2], "mg2");
  assert.equal(owner?.manifest.id, "lm2");
  assert.equal(owner?.majorGoal.id, "mg2");
});

test("findMajorGoalOwner returns null for an unmatched id", () => {
  assert.equal(findMajorGoalOwner([manifest()], "nonexistent"), null);
});

// ---------------------------------------------------------------------------
// Sub-goal↔ARC Goal connection task: sequential progression
// ---------------------------------------------------------------------------

test("resolveActiveSubGoal defaults to the first non-completed/archived Sub-goal in array order when none is explicitly active", () => {
  const g = majorGoal({
    subGoals: [subGoal({ id: "a", status: "completed" }), subGoal({ id: "b", status: "pending" }), subGoal({ id: "c", status: "draft" })],
  });
  assert.equal(resolveActiveSubGoal(g)?.id, "b");
});

test("resolveActiveSubGoal prefers an explicitly-active Sub-goal even when it's not first in array order", () => {
  const g = majorGoal({
    subGoals: [subGoal({ id: "a", status: "pending" }), subGoal({ id: "b", status: "active" }), subGoal({ id: "c", status: "pending" })],
  });
  assert.equal(resolveActiveSubGoal(g)?.id, "b");
});

test("resolveActiveSubGoal treats a paused Sub-goal as still eligible for the default-active fallback", () => {
  const g = majorGoal({ subGoals: [subGoal({ id: "a", status: "completed" }), subGoal({ id: "b", status: "paused" })] });
  assert.equal(resolveActiveSubGoal(g)?.id, "b");
});

test("resolveActiveSubGoal returns null when every Sub-goal is completed/archived, or there are none", () => {
  assert.equal(resolveActiveSubGoal(majorGoal({ subGoals: [] })), null);
  assert.equal(
    resolveActiveSubGoal(majorGoal({ subGoals: [subGoal({ id: "a", status: "completed" }), subGoal({ id: "b", status: "archived" })] })),
    null
  );
});

test("activateSubGoal sets the target Sub-goal active and demotes any other currently-active one to pending, touching nothing else", () => {
  const g = majorGoal({
    subGoals: [
      subGoal({ id: "a", status: "active" }),
      subGoal({ id: "b", status: "pending" }),
      subGoal({ id: "c", status: "completed" }),
    ],
  });
  const result = activateSubGoal(g, "b");
  assert.equal(result.subGoals.find((s) => s.id === "a")?.status, "pending");
  assert.equal(result.subGoals.find((s) => s.id === "b")?.status, "active");
  assert.equal(result.subGoals.find((s) => s.id === "c")?.status, "completed", "an unrelated (completed) Sub-goal is never touched");
});

test("activateSubGoal can activate any Sub-goal regardless of array position -- manual override, no order enforced", () => {
  const g = majorGoal({ subGoals: [subGoal({ id: "a" }), subGoal({ id: "b" }), subGoal({ id: "c" })] });
  const result = activateSubGoal(g, "c");
  assert.equal(result.subGoals.find((s) => s.id === "c")?.status, "active");
});

test("activateSubGoal is a no-op for an id that doesn't match any Sub-goal", () => {
  const g = majorGoal({ subGoals: [subGoal({ id: "a", status: "pending" })] });
  const result = activateSubGoal(g, "nonexistent");
  assert.equal(result, g);
});

test("completeSubGoal marks status completed and records completedAt, without activating any other Sub-goal", () => {
  const g = majorGoal({ subGoals: [subGoal({ id: "a", status: "active" }), subGoal({ id: "b", status: "pending" })] });
  const result = completeSubGoal(g, "a", "2024-03-01T00:00:00.000Z");
  assert.equal(result.subGoals.find((s) => s.id === "a")?.status, "completed");
  assert.equal(result.subGoals.find((s) => s.id === "a")?.completedAt, "2024-03-01T00:00:00.000Z");
  assert.equal(result.subGoals.find((s) => s.id === "b")?.status, "pending", "the next Sub-goal is never auto-activated by completeSubGoal itself");
});

test("resolveNextSubGoal finds the next non-completed/archived Sub-goal after the given one, skipping completed/archived ones", () => {
  const g = majorGoal({
    subGoals: [
      subGoal({ id: "a", status: "completed" }),
      subGoal({ id: "b", status: "completed" }),
      subGoal({ id: "c", status: "archived" }),
      subGoal({ id: "d", status: "pending" }),
    ],
  });
  assert.equal(resolveNextSubGoal(g, "a")?.id, "d");
});

test("resolveNextSubGoal returns null when there is no eligible next Sub-goal, or the given id doesn't exist", () => {
  const g = majorGoal({ subGoals: [subGoal({ id: "a" }), subGoal({ id: "b", status: "completed" })] });
  assert.equal(resolveNextSubGoal(g, "b"), null);
  assert.equal(resolveNextSubGoal(g, "nonexistent"), null);
});

test("full progression: three Sub-goals completed and activated in sequence", () => {
  let g = majorGoal({ subGoals: [subGoal({ id: "1" }), subGoal({ id: "2" }), subGoal({ id: "3" })] });
  g = activateSubGoal(g, "1");
  assert.equal(resolveActiveSubGoal(g)?.id, "1");
  g = completeSubGoal(g, "1", "2024-01-02T00:00:00.000Z");
  let next = resolveNextSubGoal(g, "1");
  assert.equal(next?.id, "2");
  g = activateSubGoal(g, next!.id);
  assert.equal(resolveActiveSubGoal(g)?.id, "2");
  g = completeSubGoal(g, "2", "2024-01-03T00:00:00.000Z");
  next = resolveNextSubGoal(g, "2");
  assert.equal(next?.id, "3");
  g = activateSubGoal(g, next!.id);
  assert.equal(resolveActiveSubGoal(g)?.id, "3");
  g = completeSubGoal(g, "3", "2024-01-04T00:00:00.000Z");
  assert.equal(resolveNextSubGoal(g, "3"), null);
  assert.equal(resolveActiveSubGoal(g), null, "all three complete -- nothing left to be the default-active Sub-goal");
});

test("manually activating an earlier or out-of-order Sub-goal never requires completing in order", () => {
  let g = majorGoal({ subGoals: [subGoal({ id: "1" }), subGoal({ id: "2" }), subGoal({ id: "3" })] });
  g = activateSubGoal(g, "3");
  assert.equal(resolveActiveSubGoal(g)?.id, "3");
  g = activateSubGoal(g, "1");
  assert.equal(resolveActiveSubGoal(g)?.id, "1", "returning to an earlier Sub-goal is always allowed");
});

test("reordering Sub-goals never changes completedAt or status -- history survives a reorder", () => {
  let g = majorGoal({ subGoals: [subGoal({ id: "a" }), subGoal({ id: "b" }), subGoal({ id: "c" })] });
  g = completeSubGoal(g, "a", "2024-01-05T00:00:00.000Z");
  g = reorderSubGoals(g, "a", "down");
  g = reorderSubGoals(g, "c", "up");
  const a = g.subGoals.find((s) => s.id === "a")!;
  assert.equal(a.status, "completed");
  assert.equal(a.completedAt, "2024-01-05T00:00:00.000Z");
});

// ---------------------------------------------------------------------------
// Sub-goal↔ARC Goal connection task: Target ARC Goal resolution + progress
// ---------------------------------------------------------------------------

test("resolveEffectiveTargetArcGoalId resolves to the Sub-goal's own connectedArcGoalId when inherited (the default)", () => {
  const t = target({ arcGoalLinkMode: "inherited", connectedArcGoalId: "own-goal-never-used" });
  const sg = subGoal({ connectedArcGoalId: "subgoal-goal" });
  assert.equal(resolveEffectiveTargetArcGoalId(t, sg), "subgoal-goal");
});

test("resolveEffectiveTargetArcGoalId resolves to the Target's own connectedArcGoalId when arcGoalLinkMode is 'own', ignoring the Sub-goal's", () => {
  const t = target({ arcGoalLinkMode: "own", connectedArcGoalId: "own-goal" });
  const sg = subGoal({ connectedArcGoalId: "subgoal-goal-never-used" });
  assert.equal(resolveEffectiveTargetArcGoalId(t, sg), "own-goal");
});

test("resolveEffectiveTargetArcGoalId returns null when the effective source has no ArcGoal linked", () => {
  assert.equal(resolveEffectiveTargetArcGoalId(target({ arcGoalLinkMode: "inherited" }), subGoal({ connectedArcGoalId: null })), null);
  assert.equal(resolveEffectiveTargetArcGoalId(target({ arcGoalLinkMode: "own", connectedArcGoalId: null }), subGoal()), null);
});

test("allRequiredTargetsComplete is true only when every non-archived Target is completed, and false for an empty/all-archived list", () => {
  assert.equal(allRequiredTargetsComplete([]), false);
  assert.equal(allRequiredTargetsComplete([target({ id: "a", status: "archived" })]), false);
  assert.equal(allRequiredTargetsComplete([target({ id: "a", status: "completed" }), target({ id: "b", status: "active" })]), false);
  assert.equal(
    allRequiredTargetsComplete([target({ id: "a", status: "completed" }), target({ id: "b", status: "archived" })]),
    true,
    "an archived Target is excluded from the requirement"
  );
});

test("computeSubGoalProgress averages currentProgress across non-archived Targets, ignoring archived ones, never NaN for an empty list", () => {
  assert.equal(computeSubGoalProgress([]), 0);
  assert.equal(
    computeSubGoalProgress([target({ id: "a", currentProgress: 50 }), target({ id: "b", currentProgress: 100 })]),
    75
  );
  assert.equal(
    computeSubGoalProgress([target({ id: "a", currentProgress: 100 }), target({ id: "b", currentProgress: 0, status: "archived" })]),
    100,
    "the archived Target is excluded from the average entirely"
  );
});

// ---------------------------------------------------------------------------
// Reminder task: deadline-reminder moment resolution
// ---------------------------------------------------------------------------

test("resolveNextDeadlineReminder returns null when there's no deadline, or the entity is already completed/archived", () => {
  assert.equal(resolveNextDeadlineReminder(null, "active", "2024-06-01"), null);
  assert.equal(resolveNextDeadlineReminder("2024-06-05", "completed", "2024-06-01"), null);
  assert.equal(resolveNextDeadlineReminder("2024-06-05", "archived", "2024-06-01"), null);
});

test("resolveNextDeadlineReminder returns null when the deadline is still more than the lead time away", () => {
  assert.equal(resolveNextDeadlineReminder("2024-06-10", "active", "2024-06-01"), null);
});

test(`resolveNextDeadlineReminder returns 'approaching' once within ${DEADLINE_APPROACHING_LEAD_DAYS} days of the deadline`, () => {
  const result = resolveNextDeadlineReminder("2024-06-05", "active", "2024-06-03");
  assert.deepEqual(result, { moment: "approaching", fireOnLocalDate: "2024-06-03" });
});

test("resolveNextDeadlineReminder returns 'day_of' exactly on the deadline date", () => {
  const result = resolveNextDeadlineReminder("2024-06-05", "active", "2024-06-05");
  assert.deepEqual(result, { moment: "day_of", fireOnLocalDate: "2024-06-05" });
});

test("resolveNextDeadlineReminder returns 'overdue' any day after the deadline", () => {
  const result = resolveNextDeadlineReminder("2024-06-05", "active", "2024-06-09");
  assert.deepEqual(result, { moment: "overdue", fireOnLocalDate: "2024-06-09" });
});

test("resolveDeadlineReminderFireAt fires at 09:00 local on the given date when that's still in the future", () => {
  const now = new Date(2024, 5, 3, 7, 0, 0, 0); // June 3, 07:00 local
  const fireAt = resolveDeadlineReminderFireAt("2024-06-03", now);
  assert.equal(fireAt.getHours(), 9);
  assert.equal(fireAt.getMinutes(), 0);
  assert.ok(fireAt.getTime() > now.getTime());
});

test("resolveDeadlineReminderFireAt falls back to a few seconds from now when 09:00 on the target date has already passed", () => {
  const now = new Date(2024, 5, 3, 14, 0, 0, 0); // June 3, 14:00 local -- past 09:00
  const fireAt = resolveDeadlineReminderFireAt("2024-06-03", now);
  assert.ok(fireAt.getTime() > now.getTime());
  assert.ok(fireAt.getTime() - now.getTime() < 60000, "the fallback fires almost immediately, not hours later");
});

// ---------------------------------------------------------------------------
// Visualization task: shared-vs-own embodied cue / achieved-state mantra resolution
// ---------------------------------------------------------------------------

test("resolveEmbodiedIdentityCueForSubGoal returns the Major Goal's shared cue when useSharedEmbodiedCue is true", () => {
  const mg = majorGoal({ embodiedIdentityCue: { ...createEmptyEmbodiedIdentityCue(), posture: "זקוף" } });
  const sg = subGoal({ useSharedEmbodiedCue: true, ownEmbodiedIdentityCue: { ...createEmptyEmbodiedIdentityCue(), posture: "שפוף" } });
  assert.equal(resolveEmbodiedIdentityCueForSubGoal(mg, sg).posture, "זקוף");
});

test("resolveEmbodiedIdentityCueForSubGoal returns the Sub-goal's own cue when useSharedEmbodiedCue is false and an own cue is set", () => {
  const mg = majorGoal({ embodiedIdentityCue: { ...createEmptyEmbodiedIdentityCue(), posture: "זקוף" } });
  const sg = subGoal({ useSharedEmbodiedCue: false, ownEmbodiedIdentityCue: { ...createEmptyEmbodiedIdentityCue(), posture: "שפוף" } });
  assert.equal(resolveEmbodiedIdentityCueForSubGoal(mg, sg).posture, "שפוף");
});

test("resolveEmbodiedIdentityCueForSubGoal falls back to the shared cue when useSharedEmbodiedCue is false but no own cue is set yet", () => {
  const mg = majorGoal({ embodiedIdentityCue: { ...createEmptyEmbodiedIdentityCue(), posture: "זקוף" } });
  const sg = subGoal({ useSharedEmbodiedCue: false, ownEmbodiedIdentityCue: null });
  assert.equal(resolveEmbodiedIdentityCueForSubGoal(mg, sg).posture, "זקוף");
});

test("resolveEmbodiedIdentityCueForSubGoal never mutates the Major Goal's shared cue when a Sub-goal has its own", () => {
  const sharedCue = { ...createEmptyEmbodiedIdentityCue(), posture: "זקוף" };
  const mg = majorGoal({ embodiedIdentityCue: sharedCue });
  const sg = subGoal({ useSharedEmbodiedCue: false, ownEmbodiedIdentityCue: { ...createEmptyEmbodiedIdentityCue(), posture: "שפוף" } });
  resolveEmbodiedIdentityCueForSubGoal(mg, sg);
  assert.equal(mg.embodiedIdentityCue.posture, "זקוף");
});

test("resolveAchievedStateMantraForSubGoal returns the Major Goal's shared mantra when useSharedAchievedStateMantra is true", () => {
  const mg = majorGoal({ achievedStateMantra: { text: "אני שם", tense: "present", enabled: true } });
  const sg = subGoal({ useSharedAchievedStateMantra: true, ownAchievedStateMantra: { text: "הגעתי", tense: "past", enabled: true } });
  assert.equal(resolveAchievedStateMantraForSubGoal(mg, sg).text, "אני שם");
});

test("resolveAchievedStateMantraForSubGoal returns the Sub-goal's own mantra when useSharedAchievedStateMantra is false and an own mantra is set", () => {
  const mg = majorGoal({ achievedStateMantra: { text: "אני שם", tense: "present", enabled: true } });
  const sg = subGoal({ useSharedAchievedStateMantra: false, ownAchievedStateMantra: { text: "הגעתי", tense: "past", enabled: true } });
  assert.equal(resolveAchievedStateMantraForSubGoal(mg, sg).text, "הגעתי");
});

test("resolveAchievedStateMantraForSubGoal falls back to the shared mantra when useSharedAchievedStateMantra is false but no own mantra is set yet", () => {
  const mg = majorGoal({ achievedStateMantra: { text: "אני שם", tense: "present", enabled: true } });
  const sg = subGoal({ useSharedAchievedStateMantra: false, ownAchievedStateMantra: null });
  assert.equal(resolveAchievedStateMantraForSubGoal(mg, sg).text, "אני שם");
});

test("createEmptyMajorGoal defaults embodiedIdentityCue/achievedStateMantra to empty/disabled", () => {
  const mg = createEmptyMajorGoal("id1", "כושר", NOW);
  assert.deepEqual(mg.embodiedIdentityCue, createEmptyEmbodiedIdentityCue());
  assert.equal(mg.achievedStateMantra.enabled, false);
});

test("createEmptySubGoal defaults to using the shared cue/mantra with no own override", () => {
  const sg = createEmptySubGoal("sg1", "תת מטרה", NOW);
  assert.equal(sg.useSharedEmbodiedCue, true);
  assert.equal(sg.ownEmbodiedIdentityCue, null);
  assert.equal(sg.useSharedAchievedStateMantra, true);
  assert.equal(sg.ownAchievedStateMantra, null);
});
