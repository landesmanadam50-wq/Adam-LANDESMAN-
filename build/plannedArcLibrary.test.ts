import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/plannedArcLibrary.test.ts
 *
 * ARC-system upgrade task, Part D: source-text regression guard for
 * the planned-ARC library's list/editor screens and routes. The
 * underlying data model is covered by arc/plannedArc.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const listScreen = readSource("build/PlannedArcListScreen.tsx");
const editorScreen = readSource("build/PlannedArcEditorScreen.tsx");
const listRoute = readSource("app/planned-arcs/index.tsx");
const editorRoute = readSource("app/planned-arcs/[id].tsx");
const layout = readSource("app/_layout.tsx");
const tasksListScreen = readSource("build/TasksListScreen.tsx");

test("both routes are registered, and the tasks list offers a nav button to the library", () => {
  assert.match(layout, /<Stack\.Screen name="planned-arcs\/index"/);
  assert.match(layout, /<Stack\.Screen name="planned-arcs\/\[id\]"/);
  assert.match(listRoute, /from ["']\.\.\/\.\.\/build\/PlannedArcListScreen\.tsx["']/);
  assert.match(editorRoute, /from ["']\.\.\/\.\.\/build\/PlannedArcEditorScreen\.tsx["']/);
  assert.ok(tasksListScreen.includes('router.push("/planned-arcs")'));
});

test("the list screen loads from loadPlannedArcs (never the legacy ArcBuild collection) and shows the trigger/emotion/sensation/actions the spec names", () => {
  assert.ok(listScreen.includes("loadPlannedArcs()"));
  for (const field of ["triggerText", "supportiveSensation", "emotionalActionText", "identityActionText"]) {
    assert.ok(listScreen.includes(`item.${field}`));
  }
  assert.ok(listScreen.includes('router.push({ pathname: "/planned-arcs/[id]", params: { id: item.id } })'));
});

test("the editor persists every field edit via upsertPlannedArc, and editing never writes back to any session/task record", () => {
  assert.ok(editorScreen.includes("async function persist(next: PlannedArc)"));
  assert.ok(editorScreen.includes("await upsertPlannedArc({ ...next, updatedAt: new Date().toISOString() });"));
  assert.ok(!editorScreen.includes("saveNewArcLiveSession"));
  assert.ok(!editorScreen.includes("upsertTask("));
});

test("the editor only shows the emotional-action/belief fields for tracks that have one, and only the identity-action/belief fields for tracks that have one", () => {
  assert.ok(editorScreen.includes('item.track !== "action" && ('));
  assert.ok(editorScreen.includes('item.track !== "emotion_only" && ('));
});

test("adding a new belief persists it via upsertArcBelief (never mutating an existing one) and sets it as THIS draft's active belief", () => {
  const fnIndex = editorScreen.indexOf("async function addNewBelief");
  const fnBody = editorScreen.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("createNewPlannedBelief(generateArcBeliefId(), kind, text, now)"));
  assert.ok(fnBody.includes("await upsertArcBelief(belief);"));
  assert.ok(fnBody.includes("activeEmotionalBeliefId: belief.id"));
  assert.ok(fnBody.includes("activeIdentityBeliefId: belief.id"));
});

// Urge-stop task, test 6: editing the saved urge on a planned exercise.
test("the editor exposes the saved urge as its own editable field, persisted the same way as every other field, and blank trims to null", () => {
  assert.ok(editorScreen.includes("item.urgeText"));
  assert.ok(editorScreen.includes('persist({ ...item, urgeText: value.trim() || null })'));
});

// Three-levels-of-acceptance task, required test 10: editing the thought text and its time classification on a planned exercise.
test("test 10: the editor exposes the saved thought text and a past/present/future chip row as editable fields, persisted the same way as every other field", () => {
  assert.ok(editorScreen.includes("item.thoughtText"));
  assert.ok(editorScreen.includes('persist({ ...item, thoughtText: value.trim() || null })'));
  assert.ok(editorScreen.includes("getThoughtTimeOrientationOptions()"));
  assert.ok(editorScreen.includes("item.thoughtTimeOrientation === option.value"));
  assert.ok(editorScreen.includes("persist({ ...item, thoughtTimeOrientation: option.value })"));
});

// Unified awareness/urge/thought/interpretation update, required test
// 10: editing the saved interpretation -- a SEPARATE field from the
// thought text above, editable the same way as every other field.
test("test 10: the editor exposes the saved interpretation as its own editable field, separate from the thought text, and blank trims to null", () => {
  assert.ok(editorScreen.includes("item.interpretationText"));
  assert.ok(editorScreen.includes('persist({ ...item, interpretationText: value.trim() || null })'));
});

test("deleting calls deletePlannedArc and navigates back, never silently failing", () => {
  assert.ok(editorScreen.includes("await deletePlannedArc(item.id);"));
  assert.ok(editorScreen.includes("router.back();"));
});
