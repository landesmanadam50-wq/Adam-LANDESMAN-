import test from "node:test";
import assert from "node:assert/strict";

import { resolveLastEncodingFeelingForTask, upsertLastEncodingFeeling } from "./lastEncodingFeeling.ts";

test("upserting a new task's feeling adds it without disturbing any other task's record", () => {
  const records = upsertLastEncodingFeeling([], "task-1", "רוגע", "2026-01-01T00:00:00.000Z");
  assert.equal(resolveLastEncodingFeelingForTask(records, "task-1"), "רוגע");
});

test("a later encoding for the SAME task overwrites (never accumulates a history for) that task's own record", () => {
  let records = upsertLastEncodingFeeling([], "task-1", "רוגע", "2026-01-01T00:00:00.000Z");
  records = upsertLastEncodingFeeling(records, "task-1", "ביטחון", "2026-01-02T00:00:00.000Z");
  assert.equal(resolveLastEncodingFeelingForTask(records, "task-1"), "ביטחון");
  assert.equal(records.filter((record) => record.taskId === "task-1").length, 1);
});

test("records for different tasks never collide", () => {
  let records = upsertLastEncodingFeeling([], "task-1", "רוגע", "2026-01-01T00:00:00.000Z");
  records = upsertLastEncodingFeeling(records, "task-2", "קלילות", "2026-01-01T00:00:00.000Z");
  assert.equal(resolveLastEncodingFeelingForTask(records, "task-1"), "רוגע");
  assert.equal(resolveLastEncodingFeelingForTask(records, "task-2"), "קלילות");
});

test("a task with no recorded feeling resolves to null, never throwing or inventing one", () => {
  assert.equal(resolveLastEncodingFeelingForTask([], "task-1"), null);
});
