import test from "node:test";
import assert from "node:assert/strict";

import { resolveNextRotationIndex } from "./contentRotation.ts";

test("the very first call (lastIndex null) always starts at index 0", () => {
  assert.equal(resolveNextRotationIndex(null, 5), 0);
});

test("advances sequentially, never repeating the last index, for a normal multi-item list", () => {
  assert.equal(resolveNextRotationIndex(0, 5), 1);
  assert.equal(resolveNextRotationIndex(1, 5), 2);
  assert.equal(resolveNextRotationIndex(2, 5), 3);
  assert.equal(resolveNextRotationIndex(3, 5), 4);
});

test("wraps back around to 0 after the last index", () => {
  assert.equal(resolveNextRotationIndex(4, 5), 0);
});

test("a list of exactly one item always returns 0 (nothing else to rotate to)", () => {
  assert.equal(resolveNextRotationIndex(null, 1), 0);
  assert.equal(resolveNextRotationIndex(0, 1), 0);
});

test("an empty list never throws -- returns 0", () => {
  assert.equal(resolveNextRotationIndex(null, 0), 0);
  assert.equal(resolveNextRotationIndex(5, 0), 0);
});

test("an out-of-range lastIndex (e.g. the list shrank since it was persisted) falls back to 0 rather than throwing or returning an invalid index", () => {
  assert.equal(resolveNextRotationIndex(99, 5), 0);
  assert.equal(resolveNextRotationIndex(-1, 5), 0);
});
