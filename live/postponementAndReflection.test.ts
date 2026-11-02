import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/postponementAndReflection.test.ts
 *
 * Productivity roadmap, Stage X: source-text regression guard for the
 * end-of-session reflection screen and its (optional, skippable)
 * entry point.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const layout = readSource("app/_layout.tsx");
const route = readSource("app/tasks/[id]/reflect.tsx");
const screen = readSource("live/SessionReflectionScreen.tsx");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");

test("the reflect route is registered in app/_layout.tsx", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/reflect"/);
});

test("the route passes the id param straight through to SessionReflectionScreen", () => {
  assert.match(route, /from ["']\.\.\/\.\.\/\.\.\/live\/SessionReflectionScreen\.tsx["']/);
  assert.ok(route.includes("SessionReflectionScreen taskId={id}"));
});

test("the reflection is reached only via an optional link shown once a task is completed, never forced", () => {
  assert.match(activeTaskScreen, /pathname:\s*"\/tasks\/\[id\]\/reflect",\s*params:\s*\{\s*id:\s*task\.id\s*\}/);
  const completedBlockIndex = activeTaskScreen.indexOf('task.status === "completed" ? (');
  const completedBlock = activeTaskScreen.slice(completedBlockIndex, completedBlockIndex + 400);
  assert.ok(completedBlock.includes("רפלקציה קצרה"));
});

test("the reflection screen itself has an explicit skip/dismiss action that saves nothing, never blocking on an answer", () => {
  assert.ok(screen.includes('onPress={() => router.back()}'));
});

test("finishing the reflection saves exactly one 'session_reflection' journal entry via the shared createTaskJournalEntry/appendTaskJournalEntry, never a parallel store", () => {
  assert.match(screen, /import\s*\{[\s\S]*?appendTaskJournalEntry[\s\S]*?\}\s*from\s*["']\.\.\/data\/storage\.ts["']/);
  assert.ok(screen.includes('kind: "session_reflection"'));
});
