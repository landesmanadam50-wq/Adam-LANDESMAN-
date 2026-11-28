import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/taskEditorScreen.dynamicPlanning.test.ts
 *
 * ARCHI -- Rolling Dynamic Planning task, spec section 1 ("add new
 * To-Do tasks" from live/DynamicPlanningConfirmScreen.tsx): source-text
 * regression guard for build/TaskEditorScreen.tsx's two new initial*
 * props and their threading through app/tasks/[id]/edit.tsx -- same
 * convention as the existing initialArcGymGoalId checkpoint test in
 * build/arcGymGoalUi.test.ts.
 */
function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const taskEditor = readSource("build/TaskEditorScreen.tsx");
const editRoute = readSource("app/tasks/[id]/edit.tsx");

test("initialIsTodoItem prefills a brand-new task's draft as a To-Do with no scheduledTime -- never applies to an existing task", () => {
  assert.match(taskEditor, /initialIsTodoItem\?: boolean;/);
  assert.ok(taskEditor.includes('...(initialIsTodoItem ? { isTodoItem: true, scheduledTime: "" } : {})'));
});

test("initialTodoPinnedAfterTaskId carries through from `base` exactly like initialArcGymGoalId -- buildTaskFromDraft never overrides this field, so the new To-Do weaves straight into the exact gap the trainee opened the planning screen for", () => {
  assert.match(taskEditor, /initialTodoPinnedAfterTaskId\?: string \| null;/);
  const fnIndex = taskEditor.indexOf("async function handleSave");
  const fnBody = taskEditor.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes("...(initialTodoPinnedAfterTaskId ? { todoPinnedAfterTaskId: initialTodoPinnedAfterTaskId } : {}),"));
});

test("both new props are threaded through the /tasks/[id]/edit route from plain string search params (isTodoItem === '1'), the same convention every other initial* param here already follows", () => {
  assert.ok(editRoute.includes("isTodoItem, todoPinnedAfterTaskId"));
  assert.ok(editRoute.includes("initialIsTodoItem={isTodoItem === \"1\"}"));
  assert.ok(editRoute.includes("initialTodoPinnedAfterTaskId={todoPinnedAfterTaskId ?? null}"));
});
