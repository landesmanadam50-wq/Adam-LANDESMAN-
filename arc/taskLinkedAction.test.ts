import test from "node:test";
import assert from "node:assert/strict";

import {
  createTaskLinkedAction,
  hasLinkedAction,
  linkedActionKindNeedsItem,
  NO_LINKED_ACTION,
  resolveLinkedActionStaticRoute,
} from "./taskLinkedAction.ts";

test("createTaskLinkedAction defaults itemId to null, and NO_LINKED_ACTION is the canonical none/null value", () => {
  assert.deepEqual(createTaskLinkedAction("arc_diary"), { kind: "arc_diary", itemId: null });
  assert.deepEqual(createTaskLinkedAction("arc_learning", "topic-1"), { kind: "arc_learning", itemId: "topic-1" });
  assert.deepEqual(NO_LINKED_ACTION, { kind: "none", itemId: null });
});

test("hasLinkedAction is false for null and for kind 'none', true for every other kind -- the one gate every caller shares", () => {
  assert.equal(hasLinkedAction(null), false);
  assert.equal(hasLinkedAction(NO_LINKED_ACTION), false);
  assert.equal(hasLinkedAction(createTaskLinkedAction("arc_diary")), true);
  assert.equal(hasLinkedAction(createTaskLinkedAction("write_insight")), true);
});

test("linkedActionKindNeedsItem is true only for the kinds whose module has more than one specific thing to point at", () => {
  assert.equal(linkedActionKindNeedsItem("arc_behaviour"), true);
  assert.equal(linkedActionKindNeedsItem("arc_learning"), true);
  assert.equal(linkedActionKindNeedsItem("arc_focus"), true);
  assert.equal(linkedActionKindNeedsItem("arc_video"), true);
  assert.equal(linkedActionKindNeedsItem("arc_writing"), true);
  assert.equal(linkedActionKindNeedsItem("arc_book"), true);
  for (const kind of ["none", "arc_creativity", "arc_diary", "arc_questions_write", "arc_questions_explore", "write_insight", "organize_insights", "write_positive_event"] as const) {
    assert.equal(linkedActionKindNeedsItem(kind), false, `${kind} must not require a specific item`);
  }
});

test("resolveLinkedActionStaticRoute returns null for 'none', and null for arc_focus/arc_book -- both need an async lookup the caller resolves itself first", () => {
  assert.equal(resolveLinkedActionStaticRoute(NO_LINKED_ACTION, "task-1"), null);
  assert.equal(resolveLinkedActionStaticRoute(createTaskLinkedAction("arc_focus"), "task-1"), null);
  assert.equal(resolveLinkedActionStaticRoute(createTaskLinkedAction("arc_book", "chapter-1"), "task-1"), null);
});

test("resolveLinkedActionStaticRoute resolves arc_behaviour/arc_learning with and without an itemId -- itemId present adds the specific-item param, absent omits it entirely (never a stray undefined param)", () => {
  assert.deepEqual(resolveLinkedActionStaticRoute(createTaskLinkedAction("arc_behaviour", "sit-1"), "task-1"), {
    pathname: "/tasks/[id]/arc",
    params: { id: "task-1", arcGymSituationId: "sit-1" },
  });
  assert.deepEqual(resolveLinkedActionStaticRoute(createTaskLinkedAction("arc_behaviour"), "task-1"), { pathname: "/tasks/[id]/arc", params: { id: "task-1" } });
  assert.deepEqual(resolveLinkedActionStaticRoute(createTaskLinkedAction("arc_learning", "topic-1"), "task-1"), {
    pathname: "/tasks/[id]/arc-learning-review",
    params: { id: "task-1", topicId: "topic-1" },
  });
  assert.deepEqual(resolveLinkedActionStaticRoute(createTaskLinkedAction("arc_learning"), "task-1"), { pathname: "/tasks/[id]/arc-learning-review", params: { id: "task-1" } });
});

test("resolveLinkedActionStaticRoute resolves arc_creativity with the task's own real id, never the standalone sentinel", () => {
  assert.deepEqual(resolveLinkedActionStaticRoute(createTaskLinkedAction("arc_creativity"), "task-1"), { pathname: "/tasks/[id]/arc-creativity-review", params: { id: "task-1" } });
});

test("resolveLinkedActionStaticRoute resolves arc_writing/arc_video to the same writing-text route, keyed by itemId -- null itemId is a no-op (null route, never a crash)", () => {
  assert.deepEqual(resolveLinkedActionStaticRoute(createTaskLinkedAction("arc_writing", "text-1"), "task-1"), { pathname: "/arc-gym/writing/[id]", params: { id: "text-1" } });
  assert.deepEqual(resolveLinkedActionStaticRoute(createTaskLinkedAction("arc_video", "text-2"), "task-1"), { pathname: "/arc-gym/writing/[id]", params: { id: "text-2" } });
  assert.equal(resolveLinkedActionStaticRoute(createTaskLinkedAction("arc_writing"), "task-1"), null);
});

test("resolveLinkedActionStaticRoute resolves every quick-capture-style kind with returnToTaskId -- the 'return to this exact Task LIVE screen' convention every new source already follows", () => {
  assert.deepEqual(resolveLinkedActionStaticRoute(createTaskLinkedAction("arc_diary"), "task-1"), { pathname: "/diary/new", params: { returnToTaskId: "task-1" } });
  assert.deepEqual(resolveLinkedActionStaticRoute(createTaskLinkedAction("arc_questions_write"), "task-1"), { pathname: "/questions/new", params: { returnToTaskId: "task-1" } });
  assert.deepEqual(resolveLinkedActionStaticRoute(createTaskLinkedAction("arc_questions_explore"), "task-1"), { pathname: "/questions", params: { returnToTaskId: "task-1" } });
  assert.deepEqual(resolveLinkedActionStaticRoute(createTaskLinkedAction("write_insight"), "task-1"), { pathname: "/insights/new", params: { returnToTaskId: "task-1" } });
  assert.deepEqual(resolveLinkedActionStaticRoute(createTaskLinkedAction("write_positive_event"), "task-1"), { pathname: "/positive-memories/new", params: { returnToTaskId: "task-1" } });
});

test("resolveLinkedActionStaticRoute resolves organize_insights with no returnToTaskId -- InsightsCollectionScreen doesn't accept that param today", () => {
  assert.deepEqual(resolveLinkedActionStaticRoute(createTaskLinkedAction("organize_insights"), "task-1"), { pathname: "/insights", params: {} });
});
