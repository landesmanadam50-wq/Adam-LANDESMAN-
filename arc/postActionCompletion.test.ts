import test from "node:test";
import assert from "node:assert/strict";

import {
  createEmptyPostActionCompletionState,
  getFirstMiniPostActionCompletionStage,
  getFirstPostActionCompletionStage,
  getMiniPostActionCompletionCopy,
  getNextMiniPostActionCompletionStage,
  getNextPostActionCompletionStage,
  getPostActionCompletionCopy,
  MINI_POST_ACTION_COMPLETION_STAGE_ORDER,
  POST_ACTION_COMPLETION_STAGE_ORDER,
  POST_ACTION_IMPROVED_IMAGERY_FALLBACK,
} from "./postActionCompletion.ts";
import type { PostActionCompletionStage } from "./postActionCompletion.ts";

test("Full tail walks the exact fixed order action_imagery -> improvement_entry -> improved_action_imagery -> gratitude -> complete, then stays on complete", () => {
  let stage = getFirstPostActionCompletionStage();
  let state = createEmptyPostActionCompletionState();
  const visited: PostActionCompletionStage[] = [stage];
  for (let i = 0; i < 10 && stage !== "complete"; i++) {
    const hop = getNextPostActionCompletionStage(stage, state);
    stage = hop.stage;
    state = hop.state;
    visited.push(stage);
  }
  assert.deepEqual(visited, POST_ACTION_COMPLETION_STAGE_ORDER);
});

test("Mini tail walks the exact compact order action_imagery -> gratitude -> complete, then stays on complete", () => {
  let stage = getFirstMiniPostActionCompletionStage();
  const visited = [stage];
  for (let i = 0; i < 10 && stage !== "complete"; i++) {
    stage = getNextMiniPostActionCompletionStage(stage);
    visited.push(stage);
  }
  assert.deepEqual(visited, MINI_POST_ACTION_COMPLETION_STAGE_ORDER);
});

test("Mini tail never includes Success Focus, written improvement, or improved-action imagery -- only action_imagery/gratitude/complete exist", () => {
  assert.equal(MINI_POST_ACTION_COMPLETION_STAGE_ORDER.length, 3);
  assert.ok(!MINI_POST_ACTION_COMPLETION_STAGE_ORDER.includes("improvement_entry" as never));
  assert.ok(!MINI_POST_ACTION_COMPLETION_STAGE_ORDER.includes("improved_action_imagery" as never));
});

test("action_imagery copy describes the action as it actually happened", () => {
  const copy = getPostActionCompletionCopy("action_imagery", createEmptyPostActionCompletionState());
  assert.ok(copy.body.includes("כפי שבאמת קרתה"));
});

test("missing/empty written improvement falls back to the exact spec-required fallback line, never inventing an improvement", () => {
  const noEntry = getPostActionCompletionCopy("improved_action_imagery", { ...createEmptyPostActionCompletionState(), improvementText: null });
  assert.equal(noEntry.body, POST_ACTION_IMPROVED_IMAGERY_FALLBACK);
  const blank = getPostActionCompletionCopy("improved_action_imagery", { ...createEmptyPostActionCompletionState(), improvementText: "   " });
  assert.equal(blank.body, POST_ACTION_IMPROVED_IMAGERY_FALLBACK);
});

test("a written improvement is reflected in the improved-action imagery copy", () => {
  const copy = getPostActionCompletionCopy("improved_action_imagery", { ...createEmptyPostActionCompletionState(), improvementText: "לדבר קצת יותר לאט" });
  assert.ok(copy.body.includes("לדבר קצת יותר לאט"));
});

test("Gratitude uses a configured prompt when provided, else the standard default question", () => {
  const withPrompt = getPostActionCompletionCopy("gratitude", createEmptyPostActionCompletionState(), "על מה אתה גאה בעצמך?");
  assert.equal(withPrompt.body, "על מה אתה גאה בעצמך?");
  const withoutPrompt = getPostActionCompletionCopy("gratitude", createEmptyPostActionCompletionState(), null);
  assert.equal(withoutPrompt.body, "על מה אתה מודה לעצמך בעקבות הפעולה?");
});

test("Mini action_imagery/gratitude copy never throws and is always non-empty Hebrew text", () => {
  const hebrewPattern = /[֐-׿]/;
  for (const stage of MINI_POST_ACTION_COMPLETION_STAGE_ORDER) {
    if (stage === "complete") continue;
    const copy = getMiniPostActionCompletionCopy(stage);
    assert.ok(hebrewPattern.test(copy.title));
    assert.ok(hebrewPattern.test(copy.body));
  }
});

test("Mini Gratitude uses a configured prompt when provided, else the standard default question", () => {
  const withPrompt = getMiniPostActionCompletionCopy("gratitude", "שאלה מותאמת");
  assert.equal(withPrompt.body, "שאלה מותאמת");
  const withoutPrompt = getMiniPostActionCompletionCopy("gratitude", null);
  assert.equal(withoutPrompt.body, "על מה אתה מודה לעצמך בעקבות הפעולה?");
});

test("gratitude always comes after both imagery stages in the Full tail (Action -> Success Focus [caller's own] -> as-performed imagery -> optional improvement -> improved imagery -> Gratitude)", () => {
  const idx = (s: PostActionCompletionStage) => POST_ACTION_COMPLETION_STAGE_ORDER.indexOf(s);
  assert.ok(idx("action_imagery") < idx("improvement_entry"));
  assert.ok(idx("improvement_entry") < idx("improved_action_imagery"));
  assert.ok(idx("improved_action_imagery") < idx("gratitude"));
});
