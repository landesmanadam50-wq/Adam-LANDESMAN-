import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveBodyScanContractionState,
  resolveBodyScanHeavinessState,
  setBodyScanHeavinessState,
  toggleBodyScanClosedness,
  toggleBodyScanContraction,
  toggleBodyScanHeaviness,
} from "./bodyScanSelection.ts";
import type { BodyScanContractionSelection, BodyScanHeavinessSelection } from "./bodyScanSelection.ts";

// Required test 1: every region defaults to "אין תחושה".
test("every region defaults to 'none' with an empty selection list -- never a pre-populated entry", () => {
  assert.equal(resolveBodyScanContractionState([], "scanAbdomen", null), "none");
  assert.equal(resolveBodyScanHeavinessState([], "palms", null), "none");
});

// Required test 2/3: users can modify individual regions; changing one never affects another.
test("toggleBodyScanContraction sets exactly the targeted (region, side) slot to 'contraction', leaving every other slot at its own prior state", () => {
  let selections: BodyScanContractionSelection[] = [];
  selections = toggleBodyScanContraction(selections, "scanAbdomen", null);
  assert.equal(resolveBodyScanContractionState(selections, "scanAbdomen", null), "contraction");
  assert.equal(resolveBodyScanContractionState(selections, "scanChest", null), "none", "an unrelated region must stay at its own default");

  selections = toggleBodyScanContraction(selections, "scanChest", null);
  assert.equal(resolveBodyScanContractionState(selections, "scanAbdomen", null), "contraction", "the first region's own selection must survive a second, unrelated change");
  assert.equal(resolveBodyScanContractionState(selections, "scanChest", null), "contraction");
});

// Required test 4: users can restore "אין תחושה".
test("toggling an already-contracted region a second time restores it to 'none' -- removing the entry entirely, never leaving a stale record", () => {
  let selections = toggleBodyScanContraction([], "palms", "left");
  assert.equal(resolveBodyScanContractionState(selections, "palms", "left"), "contraction");
  selections = toggleBodyScanContraction(selections, "palms", "left");
  assert.equal(resolveBodyScanContractionState(selections, "palms", "left"), "none");
  assert.deepEqual(selections, [], "the entry must be fully removed, not merely marked 'none'");
});

test("left and right are completely independent slots for the same paired region", () => {
  let selections: BodyScanContractionSelection[] = [];
  selections = toggleBodyScanContraction(selections, "palms", "left");
  assert.equal(resolveBodyScanContractionState(selections, "palms", "left"), "contraction");
  assert.equal(resolveBodyScanContractionState(selections, "palms", "right"), "none");
});

// Required test 6: the same region can have contraction AND heaviness/closedness simultaneously -- the two screens' own collections are entirely independent.
test("contraction selections and heaviness/closedness selections for the SAME region are independent collections -- setting one never implies or clears the other", () => {
  const contraction = toggleBodyScanContraction([], "scanChest", null);
  const heaviness = setBodyScanHeavinessState([], "scanChest", null, "heaviness");
  assert.equal(resolveBodyScanContractionState(contraction, "scanChest", null), "contraction");
  assert.equal(resolveBodyScanHeavinessState(heaviness, "scanChest", null), "heaviness");
  // Setting heaviness never touches the (separately-stored) contraction collection.
  assert.equal(resolveBodyScanContractionState(contraction, "scanChest", null), "contraction");
});

test("setBodyScanHeavinessState supports all three real states, replacing (not accumulating) whatever the slot held before", () => {
  let selections: BodyScanHeavinessSelection[] = [];
  selections = setBodyScanHeavinessState(selections, "shins", "right", "heaviness");
  assert.equal(resolveBodyScanHeavinessState(selections, "shins", "right"), "heaviness");

  selections = setBodyScanHeavinessState(selections, "shins", "right", "closedness");
  assert.equal(resolveBodyScanHeavinessState(selections, "shins", "right"), "closedness");
  assert.equal(selections.length, 1, "replacing the state must never leave a stale second entry for the same slot");

  selections = setBodyScanHeavinessState(selections, "shins", "right", "heaviness_and_closedness");
  assert.equal(resolveBodyScanHeavinessState(selections, "shins", "right"), "heaviness_and_closedness");
});

test("setBodyScanHeavinessState with 'none' removes the entry entirely, restoring the true default", () => {
  let selections = setBodyScanHeavinessState([], "feet", "left", "heaviness");
  selections = setBodyScanHeavinessState(selections, "feet", "left", "none");
  assert.equal(resolveBodyScanHeavinessState(selections, "feet", "left"), "none");
  assert.deepEqual(selections, []);
});

// Required test 10: users can proceed when every region remains at its default (an empty list is itself a perfectly valid, complete answer -- nothing further to assert here beyond "it is just an empty array", already implicit throughout).
test("an entirely empty selection list is a valid, complete answer -- every region reads back as 'none'", () => {
  for (const region of ["forehead", "scanChest", "fingers", "toes"] as const) {
    assert.equal(resolveBodyScanContractionState([], region, null), "none");
    assert.equal(resolveBodyScanHeavinessState([], region, null), "none");
  }
});

// ARC Full Sequence Update task, Part 3 ("Identify Heavy and Closed
// Regions" via TWO CONSECUTIVE, SEPARATE questions): toggleBodyScanHeaviness
// and toggleBodyScanClosedness each flip ONLY their own bit of the
// shared tri-state, over the exact same bodyScanHeavinessRegions array
// -- "do not automatically assume heaviness means closedness or vice
// versa; save selections independently."
test("toggleBodyScanHeaviness flips only the heaviness bit, leaving any existing closedness bit on the same slot untouched", () => {
  let selections: BodyScanHeavinessSelection[] = [];
  selections = toggleBodyScanHeaviness(selections, "feet", "left");
  assert.equal(resolveBodyScanHeavinessState(selections, "feet", "left"), "heaviness");

  selections = toggleBodyScanClosedness(selections, "feet", "left");
  assert.equal(resolveBodyScanHeavinessState(selections, "feet", "left"), "heaviness_and_closedness", "adding closedness to an already-heavy slot must combine, never overwrite");

  selections = toggleBodyScanHeaviness(selections, "feet", "left");
  assert.equal(resolveBodyScanHeavinessState(selections, "feet", "left"), "closedness", "turning heaviness back off must leave the closedness bit exactly as it was");
});

test("toggleBodyScanClosedness flips only the closedness bit, leaving any existing heaviness bit on the same slot untouched", () => {
  let selections: BodyScanHeavinessSelection[] = [];
  selections = toggleBodyScanClosedness(selections, "scanChest", null);
  assert.equal(resolveBodyScanHeavinessState(selections, "scanChest", null), "closedness");

  selections = toggleBodyScanHeaviness(selections, "scanChest", null);
  assert.equal(resolveBodyScanHeavinessState(selections, "scanChest", null), "heaviness_and_closedness");

  selections = toggleBodyScanClosedness(selections, "scanChest", null);
  assert.equal(resolveBodyScanHeavinessState(selections, "scanChest", null), "heaviness", "turning closedness back off must leave the heaviness bit exactly as it was");
});

test("toggling heaviness/closedness off entirely (both bits cleared) removes the slot's own entry completely, restoring the true 'אין תחושה' default", () => {
  let selections: BodyScanHeavinessSelection[] = [];
  selections = toggleBodyScanHeaviness(selections, "palms", "right");
  selections = toggleBodyScanHeaviness(selections, "palms", "right");
  assert.equal(resolveBodyScanHeavinessState(selections, "palms", "right"), "none");
  assert.deepEqual(selections, []);
});

test("toggleBodyScanHeaviness/toggleBodyScanClosedness never touch any OTHER (region, side) slot's own state", () => {
  let selections: BodyScanHeavinessSelection[] = [{ region: "feet", side: "left", state: "closedness" }];
  selections = toggleBodyScanHeaviness(selections, "palms", "right");
  assert.equal(resolveBodyScanHeavinessState(selections, "feet", "left"), "closedness", "an unrelated slot must never be affected");
  assert.equal(resolveBodyScanHeavinessState(selections, "palms", "right"), "heaviness");
});
