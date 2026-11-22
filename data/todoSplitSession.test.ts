import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/todoSplitSession.test.ts
 *
 * Smart To-Do List task: source-text regression guard for data/storage.ts's
 * TodoSplitSession CRUD and its bundling into clearTaskTimerRun(), matching
 * this codebase's own established convention for data/storage.ts (which
 * depends on AsyncStorage, so it isn't executed directly with `node --test`
 * -- see data/dailyVisualization.test.ts / data/manifestGoals.test.ts for
 * the same convention). The real pure logic (arc/todoSplitSession.ts) has
 * its own genuine, fully-executed unit tests in arc/todoSplitSession.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const storageModule = readSource("data/storage.ts");

test("data/storage.ts exposes loadTodoSplitSession/saveTodoSplitSession, mirroring loadTaskStageProgress/saveTaskStageProgress's own single-slot convention", () => {
  assert.ok(storageModule.includes("export async function loadTodoSplitSession(): Promise<TodoSplitSession | null>"));
  assert.ok(storageModule.includes("export async function saveTodoSplitSession(session: TodoSplitSession): Promise<void>"));
  assert.ok(storageModule.includes('const TODO_SPLIT_SESSION_KEY = "archi.todoSplitSession.v1";'));
});

test("loadTodoSplitSession normalizes a stored record and treats corrupt JSON as 'none' rather than crashing", () => {
  const fnIndex = storageModule.indexOf("export async function loadTodoSplitSession(");
  const fnBody = storageModule.slice(fnIndex, storageModule.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("normalizeTodoSplitSession(JSON.parse(raw)"));
  assert.ok(fnBody.includes("catch (error)"));
});

test("required test: clearTaskTimerRun() also clears the TodoSplitSession in the SAME call, so every existing call site (completion, finish-early, postponement) automatically stays correct with no change of its own", () => {
  const fnIndex = storageModule.indexOf("export async function clearTaskTimerRun(): Promise<void> {");
  const fnBody = storageModule.slice(fnIndex, storageModule.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("AsyncStorage.removeItem(TASK_TIMER_RUN_KEY)"));
  assert.ok(fnBody.includes("AsyncStorage.removeItem(TASK_STAGE_PROGRESS_KEY)"));
  assert.ok(fnBody.includes("AsyncStorage.removeItem(TODO_SPLIT_SESSION_KEY)"));
});
