import test from "node:test";
import assert from "node:assert/strict";
import { assertArcRating, isValidArcRating, normalizeRating, RATING_MAX, RATING_MIN } from "./ratings.ts";

test("1 and 10 are valid; 0 and 11 are not", () => {
  assert.equal(isValidArcRating(1), true);
  assert.equal(isValidArcRating(10), true);
  assert.equal(isValidArcRating(0), false);
  assert.equal(isValidArcRating(11), false);
});

test("non-integer ratings are invalid", () => {
  assert.equal(isValidArcRating(5.5), false);
});

test("assertArcRating throws for an out-of-range value", () => {
  assert.throws(() => assertArcRating(20, "sensationIntensity"), /sensationIntensity/);
  assert.throws(() => assertArcRating(0, "presenceRating"), /presenceRating/);
});

test("assertArcRating does not throw for a valid value", () => {
  assert.doesNotThrow(() => assertArcRating(6, "presenceRating"));
});

test("normalizeRating clamps out-of-range values into [1, 10]", () => {
  assert.equal(normalizeRating(20), RATING_MAX);
  assert.equal(normalizeRating(-5), RATING_MIN);
});

test("normalizeRating rounds to the nearest integer", () => {
  assert.equal(normalizeRating(5.6), 6);
});
