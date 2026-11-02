import test from "node:test";
import assert from "node:assert/strict";
import { BODY_REGIONS } from "./bodyRegionRoles.ts";
import { BODY_REGION_MOVEMENT_PRESETS, resolveBodyRegionMovementPresets } from "./bodyRegionMovementPresets.ts";

test("BODY_REGION_MOVEMENT_PRESETS has an entry (possibly empty) for every BodyRegion -- never missing a key", () => {
  for (const region of BODY_REGIONS) {
    assert.ok(Array.isArray(BODY_REGION_MOVEMENT_PRESETS[region]), `missing presets array for ${region}`);
  }
});

test("resolveBodyRegionMovementPresets returns the spec's own worked examples for chest/shoulders/hands/back/legs_feet/jaw", () => {
  assert.deepEqual(resolveBodyRegionMovementPresets("chest"), ["פתיחה עדינה באמצעות שינוי תנוחה נוח"]);
  assert.ok(resolveBodyRegionMovementPresets("shoulders").some((text) => text.includes("הורדה") || text.includes("שחרור")));
  assert.deepEqual(resolveBodyRegionMovementPresets("hands"), ["פתיחה הדרגתית של כפות הידיים"]);
  assert.deepEqual(resolveBodyRegionMovementPresets("back"), ["התיישרות נוחה של הגב"]);
  assert.deepEqual(resolveBodyRegionMovementPresets("legs_feet"), ["הנחה יציבה של כפות הרגליים על הרצפה"]);
  assert.deepEqual(resolveBodyRegionMovementPresets("jaw"), ["שחרור עדין של הלסת"]);
});

test("a region with no authored presets yet returns an empty array, never undefined/null -- the BUILD UI's free-text field stays usable regardless", () => {
  assert.deepEqual(resolveBodyRegionMovementPresets("face"), []);
  assert.deepEqual(resolveBodyRegionMovementPresets("other"), []);
});
