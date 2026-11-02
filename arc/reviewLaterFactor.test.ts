import test from "node:test";
import assert from "node:assert/strict";

import { createReviewLaterFactor, generateReviewLaterFactorId, URGE_NEED_OPTIONS } from "./reviewLaterFactor.ts";

test("there are exactly 10 deterministic need options", () => {
  assert.equal(URGE_NEED_OPTIONS.length, 10);
});

test("createReviewLaterFactor trims the label and generates a prefixed id", () => {
  const factor = createReviewLaterFactor("urge", "  לבדוק טלפון  ", "stimulation", "task-1", "2026-01-01T00:00:00.000Z");
  assert.equal(factor.label, "לבדוק טלפון");
  assert.match(factor.id, /^review-later-/);
  assert.equal(factor.need, "stimulation");
  assert.equal(factor.taskId, "task-1");
});

test("need is null for every kind except urge, even if a caller passes one by mistake", () => {
  const thought = createReviewLaterFactor("thought", "אני לא מספיק טוב", "safety", null, "2026-01-01T00:00:00.000Z");
  assert.equal(thought.need, null);
  const belief = createReviewLaterFactor("belief", "אני לא יכול לסמוך על אף אחד", "safety", null, "2026-01-01T00:00:00.000Z");
  assert.equal(belief.need, null);
});

test("generateReviewLaterFactorId produces distinct, correctly-prefixed ids", () => {
  const ids = new Set(Array.from({ length: 20 }, () => generateReviewLaterFactorId()));
  assert.equal(ids.size, 20);
});
