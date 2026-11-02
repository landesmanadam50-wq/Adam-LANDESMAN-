import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/taskEditorScreen.test.ts
 *
 * Productivity roadmap, Stage H: source-text regression guard for the
 * full task creation/editing screen and its entry points. The pure
 * draft/validation logic is covered separately in arc/taskDraft.test.ts
 * -- this only checks wiring (routes registered, buttons present, the
 * same storage functions reused, never a parallel task store).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const editorScreen = readSource("build/TaskEditorScreen.tsx");
const editRoute = readSource("app/tasks/[id]/edit.tsx");
const layout = readSource("app/_layout.tsx");
const listScreen = readSource("build/TasksListScreen.tsx");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const todayScreen = readSource("build/TodayScreen.tsx");

test("the edit route is registered in app/_layout.tsx", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/edit"/);
});

test("the edit route passes the id param straight through to TaskEditorScreen", () => {
  assert.match(editRoute, /from ["']\.\.\/\.\.\/\.\.\/build\/TaskEditorScreen\.tsx["']/);
  assert.ok(editRoute.includes("TaskEditorScreen id={id}"));
});

test("TaskEditorScreen saves through the SAME upsertTask as the quick-create path -- never a parallel task store", () => {
  assert.match(editorScreen, /import\s*\{[\s\S]*?upsertTask[\s\S]*?\}\s*from\s*["']\.\.\/data\/storage\.ts["']/);
  assert.ok(editorScreen.includes("await upsertTask(saved)"));
});

test("TaskEditorScreen validates before saving and never saves when there are validation errors", () => {
  const saveIndex = editorScreen.indexOf("async function handleSave");
  const saveBody = editorScreen.slice(saveIndex, saveIndex + 400);
  assert.ok(saveBody.includes("validateTaskDraft(draft)"));
  assert.ok(saveBody.includes("if (validationErrors.length > 0) return;"));
});

test("TaskEditorScreen offers archive (arc/tasks.ts's archiveTask), never a hard delete, and only for an existing task", () => {
  assert.match(editorScreen, /import\s*\{[\s\S]*?archiveTask[\s\S]*?\}\s*from\s*["']\.\.\/arc\/tasks\.ts["']/);
  assert.ok(editorScreen.includes("archiveTask(existingTask"));
  assert.ok(editorScreen.includes("{!isNew && ("), "the archive action must only render for an existing task, never while creating a new one");
});

test("Stage AD: archiving requires an explicit confirm step -- the archive button never calls handleArchive directly", () => {
  assert.ok(editorScreen.includes('onPress={() => setConfirmArchive(true)}'), "the visible archive button must only open a confirmation, never archive immediately on tap");
  assert.ok(editorScreen.includes("<Modal visible={confirmArchive}"));
  assert.ok(editorScreen.includes("onPress={handleArchive}"), "the modal's own confirm button is the only place handleArchive is actually wired to a press");
});

test("TaskEditorScreen offers linked ArcGoal/ArcBuild as a deterministic pick from the trainee's own saved records, never a free-text id field", () => {
  assert.match(editorScreen, /import\s*\{[\s\S]*?loadArcBuilds[\s\S]*?loadArcGoals[\s\S]*?\}\s*from\s*["']\.\.\/data\/storage\.ts["']/);
  assert.ok(editorScreen.includes("arcGoals.map((goal)"));
  assert.ok(editorScreen.includes("arcBuilds.map((build)"));
});

test("TasksListScreen has a real Pressable to the full editor for a NEW task", () => {
  assert.match(listScreen, /pathname:\s*"\/tasks\/\[id\]\/edit",\s*params:\s*\{\s*id:\s*"new"\s*\}/);
});

test("ActiveTaskScreen has a real Pressable to the full editor for the current task", () => {
  assert.match(activeTaskScreen, /pathname:\s*"\/tasks\/\[id\]\/edit",\s*params:\s*\{\s*id:\s*task\.id\s*\}/);
});

test("TodayScreen's cards also link to the full editor", () => {
  assert.match(todayScreen, /pathname:\s*"\/tasks\/\[id\]\/edit",\s*params:\s*\{\s*id:\s*task\.id\s*\}/);
});
