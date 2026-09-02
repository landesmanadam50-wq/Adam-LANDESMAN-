import test from "node:test";
import assert from "node:assert/strict";

import { deleteArcBuildFromList, upsertArcBuildInList } from "./arcBuilds.ts";
import { createEmptyArcBuildProfile } from "./types.ts";
import type { ArcBuild } from "./types.ts";

function build(id: string, name: string, overrides: Partial<ArcBuild> = {}): ArcBuild {
  return {
    id,
    name,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    needsState: false,
    needsIdentity: false,
    needsHabit: false,
    needsIdentityImmediately: false,
    profile: createEmptyArcBuildProfile(),
    ...overrides,
  };
}

// --- #1: A user can create multiple independent ARC Builds ----------------

test("upsertArcBuildInList: creating multiple ArcBuilds one after another never overwrites an earlier one", () => {
  let builds: ArcBuild[] = [];
  builds = upsertArcBuildInList(builds, build("a", "עייפות"));
  builds = upsertArcBuildInList(builds, build("b", "תשוקה"));
  builds = upsertArcBuildInList(builds, build("c", "פיזור"));
  builds = upsertArcBuildInList(builds, build("d", "ביקורת עצמית"));
  assert.equal(builds.length, 4);
  assert.deepEqual(
    builds.map((b) => b.name),
    ["עייפות", "תשוקה", "פיזור", "ביקורת עצמית"]
  );
});

// --- #2: two builds can use the same Desired State without overwriting ----

test("upsertArcBuildInList: two builds that happen to share the exact same Desired State/name text are still distinct, matched only by id", () => {
  let builds: ArcBuild[] = [];
  builds = upsertArcBuildInList(builds, build("a", "רוגע", { needsState: true, profile: { ...createEmptyArcBuildProfile(), supportiveState: "רוגע" } }));
  builds = upsertArcBuildInList(
    builds,
    build("b", "רוגע", { needsState: true, profile: { ...createEmptyArcBuildProfile(), supportiveState: "רוגע", interferingState: "לחץ בעבודה" } })
  );
  assert.equal(builds.length, 2, "both builds must exist as separate entries despite the identical Desired State text");
  assert.equal(builds[0].id, "a");
  assert.equal(builds[1].id, "b");
  assert.notEqual(builds[0].profile.interferingState, builds[1].profile.interferingState);
});

// --- #3: editing one ARC Build does not modify another ---------------------

test("upsertArcBuildInList: updating one build by id leaves every other build's own object completely untouched", () => {
  const original = [
    build("a", "עייפות", { profile: { ...createEmptyArcBuildProfile(), supportiveState: "אנרגיה" } }),
    build("b", "תשוקה", { profile: { ...createEmptyArcBuildProfile(), supportiveState: "מוטיבציה" } }),
    build("c", "פיזור", { profile: { ...createEmptyArcBuildProfile(), supportiveState: "ריכוז" } }),
  ];
  const edited = { ...original[1], name: "תשוקה מתחדשת", updatedAt: "2026-02-01T00:00:00.000Z" };
  const updated = upsertArcBuildInList(original, edited);

  assert.equal(updated.length, 3);
  assert.equal(updated[0], original[0], "build a's object identity is untouched");
  assert.equal(updated[2], original[2], "build c's object identity is untouched");
  assert.equal(updated[1].name, "תשוקה מתחדשת");
  assert.equal(updated[0].name, "עייפות");
  assert.equal(updated[2].name, "פיזור");
});

// --- #4: deleting one ARC Build does not affect the others -----------------

test("deleteArcBuildFromList: removing one build by id leaves every other build in place, unchanged", () => {
  const original = [build("a", "עייפות"), build("b", "תשוקה"), build("c", "פיזור")];
  const remaining = deleteArcBuildFromList(original, "b");
  assert.equal(remaining.length, 2);
  assert.deepEqual(
    remaining.map((b) => b.id),
    ["a", "c"]
  );
  assert.equal(remaining[0], original[0]);
  assert.equal(remaining[1], original[2]);
});

test("deleteArcBuildFromList: deleting an id that doesn't exist is a no-op", () => {
  const original = [build("a", "עייפות"), build("b", "תשוקה")];
  const result = deleteArcBuildFromList(original, "does-not-exist");
  assert.equal(result.length, 2);
  assert.deepEqual(result, original);
});

test("upsertArcBuildInList: never reorders or re-indexes the rest of the list when updating an existing build", () => {
  const original = [build("a", "1"), build("b", "2"), build("c", "3"), build("d", "4")];
  const updated = upsertArcBuildInList(original, { ...original[2], name: "3-edited" });
  assert.deepEqual(
    updated.map((b) => b.id),
    ["a", "b", "c", "d"]
  );
  assert.equal(updated[2].name, "3-edited");
});
