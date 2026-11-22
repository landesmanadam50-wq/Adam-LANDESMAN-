import test from "node:test";
import assert from "node:assert/strict";

import { createTodoSplitSession, normalizeTodoSplitSession } from "./todoSplitSession.ts";

test("createTodoSplitSession builds a session with the given taskId and plannedMinutes", () => {
  const session = createTodoSplitSession("task-1", 20);
  assert.deepEqual(session, { taskId: "task-1", plannedMinutes: 20 });
});

test("normalizeTodoSplitSession preserves an already-valid record untouched", () => {
  const session = { taskId: "task-1", plannedMinutes: 15 };
  assert.deepEqual(normalizeTodoSplitSession(session), session);
});

test("normalizeTodoSplitSession backfills a non-numeric plannedMinutes to 0 rather than throwing", () => {
  const corrupted = { taskId: "task-1", plannedMinutes: undefined as unknown as number };
  assert.deepEqual(normalizeTodoSplitSession(corrupted), { taskId: "task-1", plannedMinutes: 0 });
});
