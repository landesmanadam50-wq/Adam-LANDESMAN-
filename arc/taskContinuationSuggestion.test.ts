import test from "node:test";
import assert from "node:assert/strict";

import { MIN_CONTINUATION_SEGMENT_MINUTES, suggestNextSegmentMinutes } from "./taskContinuationSuggestion.ts";

test("matches the user's own explicit example progression: 30 -> 15 -> 7.5", () => {
  const first = suggestNextSegmentMinutes(30);
  assert.equal(first, 15);
  const second = suggestNextSegmentMinutes(first);
  assert.equal(second, 7.5);
});

test("never degenerates toward ~0 -- floors at MIN_CONTINUATION_SEGMENT_MINUTES", () => {
  assert.equal(suggestNextSegmentMinutes(MIN_CONTINUATION_SEGMENT_MINUTES), MIN_CONTINUATION_SEGMENT_MINUTES);
  assert.equal(suggestNextSegmentMinutes(1), MIN_CONTINUATION_SEGMENT_MINUTES);
  assert.equal(suggestNextSegmentMinutes(0.1), MIN_CONTINUATION_SEGMENT_MINUTES);
});

test("rounds to the nearest half-minute", () => {
  assert.equal(suggestNextSegmentMinutes(11), 5.5);
  assert.equal(suggestNextSegmentMinutes(9), 4.5);
});
