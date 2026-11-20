import test from "node:test";
import assert from "node:assert/strict";

import { POSITIVE_IMAGERY_PROMPTS, resolveNextPositiveImageryIndex } from "./positiveImagery.ts";

test("every prompt has non-empty Hebrew text and a unique id", () => {
  const ids = new Set<string>();
  for (const prompt of POSITIVE_IMAGERY_PROMPTS) {
    assert.ok(prompt.text.trim().length > 0);
    assert.match(prompt.text, /[֐-׿]/, `${prompt.id} must be in Hebrew`);
    assert.ok(!ids.has(prompt.id), `duplicate id ${prompt.id}`);
    ids.add(prompt.id);
  }
});

test("there are at least six prompts, matching the task's own example list", () => {
  assert.ok(POSITIVE_IMAGERY_PROMPTS.length >= 6);
});

test("resolveNextPositiveImageryIndex never repeats the immediately-previous prompt", () => {
  let lastIndex: number | null = null;
  for (let i = 0; i < POSITIVE_IMAGERY_PROMPTS.length * 2; i++) {
    const next = resolveNextPositiveImageryIndex(lastIndex);
    assert.notEqual(next, lastIndex);
    lastIndex = next;
  }
});
