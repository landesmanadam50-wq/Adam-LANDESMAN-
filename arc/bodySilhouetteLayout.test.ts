import test from "node:test";
import assert from "node:assert/strict";

import { BODY_SCAN_ALL_REGIONS, BODY_SCAN_PAIRED_REGIONS } from "./bodyScanRegions.ts";
import {
  BODY_SCAN_REGION_SHAPES,
  BODY_SILHOUETTE_VIEWBOX_HEIGHT,
  BODY_SILHOUETTE_VIEWBOX_WIDTH,
  isShapeSideConsistentWithPairing,
  resolveRegionViews,
  resolveSilhouetteShapesForView,
} from "./bodySilhouetteLayout.ts";

// "Preserve the existing body-region identifiers": every one of
// arc/bodyScanRegions.ts's own 26 regions must be drawable somewhere
// -- a region with zero shapes would be a real, silent dead end (an
// identifier the rest of the app can set/read, but the trainee could
// never actually tap on this new map at all).
test("every BodyScanRegion from arc/bodyScanRegions.ts has at least one drawn shape", () => {
  for (const region of BODY_SCAN_ALL_REGIONS) {
    const shapes = BODY_SCAN_REGION_SHAPES.filter((shape) => shape.region === region);
    assert.ok(shapes.length > 0, `${region} must have at least one shape -- it must stay tappable on the new silhouette`);
  }
});

test("a paired region (per BODY_SCAN_PAIRED_REGIONS) is only ever drawn with an explicit left/right side, never side-less; a midline region is only ever drawn side-less", () => {
  for (const shape of BODY_SCAN_REGION_SHAPES) {
    assert.ok(isShapeSideConsistentWithPairing(shape), `${shape.region} (${shape.view}, side=${shape.side}) disagrees with its own pairing flag`);
  }
});

test("a paired region drawn in a given view always has BOTH a left and a right shape in that same view -- never just one side", () => {
  for (const region of BODY_SCAN_PAIRED_REGIONS) {
    for (const view of resolveRegionViews(region)) {
      const left = BODY_SCAN_REGION_SHAPES.some((shape) => shape.region === region && shape.view === view && shape.side === "left");
      const right = BODY_SCAN_REGION_SHAPES.some((shape) => shape.region === region && shape.view === view && shape.side === "right");
      assert.equal(left, right, `${region} in the '${view}' view must have either both left+right shapes or neither`);
      assert.ok(left && right, `${region} in the '${view}' view is missing one of its two sides`);
    }
  }
});

test("no two shapes share the exact same (region, side, view) triple -- never a duplicate, silently-overlapping tap target for the same identifier", () => {
  const seen = new Set<string>();
  for (const shape of BODY_SCAN_REGION_SHAPES) {
    const key = `${shape.region}:${shape.side}:${shape.view}`;
    assert.ok(!seen.has(key), `duplicate shape for ${key}`);
    seen.add(key);
  }
});

test("every shape's ellipse stays fully within the fixed viewBox -- never clipped off-canvas", () => {
  for (const shape of BODY_SCAN_REGION_SHAPES) {
    assert.ok(shape.cx - shape.rx >= 0 && shape.cx + shape.rx <= BODY_SILHOUETTE_VIEWBOX_WIDTH, `${shape.region} (${shape.view}, ${shape.side}) overflows the viewBox horizontally`);
    assert.ok(shape.cy - shape.ry >= 0 && shape.cy + shape.ry <= BODY_SILHOUETTE_VIEWBOX_HEIGHT, `${shape.region} (${shape.view}, ${shape.side}) overflows the viewBox vertically`);
  }
});

test("resolveSilhouetteShapesForView returns only shapes for that exact view, and together the two views cover every shape exactly once", () => {
  const front = resolveSilhouetteShapesForView("front");
  const back = resolveSilhouetteShapesForView("back");
  assert.ok(front.every((shape) => shape.view === "front"));
  assert.ok(back.every((shape) => shape.view === "back"));
  assert.equal(front.length + back.length, BODY_SCAN_REGION_SHAPES.length);
});

test("resolveRegionViews reports exactly the distinct views a region is actually drawn in -- e.g. 'shins'/'toes' are front-only, 'scanShoulders' is both", () => {
  assert.deepEqual(resolveRegionViews("shins"), ["front"]);
  assert.deepEqual(resolveRegionViews("toes"), ["front"]);
  assert.deepEqual(new Set(resolveRegionViews("scanShoulders")), new Set(["front", "back"]));
  assert.deepEqual(new Set(resolveRegionViews("wrists")), new Set(["front", "back"]));
});
