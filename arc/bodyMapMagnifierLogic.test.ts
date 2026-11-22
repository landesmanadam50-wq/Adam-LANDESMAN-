import test from "node:test";
import assert from "node:assert/strict";

import {
  clampMagnifierCenter,
  clampMagnifierZoom,
  DEFAULT_MAGNIFIER_ZOOM,
  MAX_MAGNIFIER_ZOOM,
  MIN_MAGNIFIER_ZOOM,
  resolveDefaultMagnifierCenter,
  resolveMagnifierLensSize,
  resolveMagnifierViewBox,
  resolvePannedMagnifierCenter,
} from "./bodyMapMagnifierLogic.ts";
import { BODY_SILHOUETTE_VIEWBOX_HEIGHT, BODY_SILHOUETTE_VIEWBOX_WIDTH } from "./bodySilhouetteLayout.ts";

// --- lens size / default center -------------------------------------

test("resolveMagnifierLensSize shrinks both dimensions by the SAME zoomScale, so the lens keeps the canvas's own aspect ratio at every zoom level", () => {
  const size = resolveMagnifierLensSize(2);
  assert.equal(size.width, BODY_SILHOUETTE_VIEWBOX_WIDTH / 2);
  assert.equal(size.height, BODY_SILHOUETTE_VIEWBOX_HEIGHT / 2);
  assert.equal(size.width / size.height, BODY_SILHOUETTE_VIEWBOX_WIDTH / BODY_SILHOUETTE_VIEWBOX_HEIGHT);
});

test("resolveMagnifierLensSize floors zoomScale at 1, so the lens can never be requested larger than the full canvas", () => {
  const size = resolveMagnifierLensSize(0.3);
  assert.equal(size.width, BODY_SILHOUETTE_VIEWBOX_WIDTH);
  assert.equal(size.height, BODY_SILHOUETTE_VIEWBOX_HEIGHT);
});

test("resolveDefaultMagnifierCenter is the canvas's own geometric center", () => {
  assert.deepEqual(resolveDefaultMagnifierCenter(), { x: BODY_SILHOUETTE_VIEWBOX_WIDTH / 2, y: BODY_SILHOUETTE_VIEWBOX_HEIGHT / 2 });
});

// --- zoom clamping -----------------------------------------------------

test("clampMagnifierZoom clamps to [MIN_MAGNIFIER_ZOOM, MAX_MAGNIFIER_ZOOM], and DEFAULT_MAGNIFIER_ZOOM itself is inside that range", () => {
  assert.equal(clampMagnifierZoom(0), MIN_MAGNIFIER_ZOOM);
  assert.equal(clampMagnifierZoom(100), MAX_MAGNIFIER_ZOOM);
  assert.equal(clampMagnifierZoom(DEFAULT_MAGNIFIER_ZOOM), DEFAULT_MAGNIFIER_ZOOM);
  assert.ok(DEFAULT_MAGNIFIER_ZOOM >= MIN_MAGNIFIER_ZOOM && DEFAULT_MAGNIFIER_ZOOM <= MAX_MAGNIFIER_ZOOM);
});

// --- center clamping: required test -- the magnifier must never show content outside the body map ---

test("required test: clampMagnifierCenter never lets the lens's own crop rectangle extend past the canvas edges, for a center pushed far past every edge", () => {
  const lensSize = resolveMagnifierLensSize(2.5); // 88 x 208
  const clamped = clampMagnifierCenter({ x: -9999, y: -9999 }, lensSize);
  assert.equal(clamped.x, lensSize.width / 2);
  assert.equal(clamped.y, lensSize.height / 2);
  const clampedOther = clampMagnifierCenter({ x: 9999, y: 9999 }, lensSize);
  assert.equal(clampedOther.x, BODY_SILHOUETTE_VIEWBOX_WIDTH - lensSize.width / 2);
  assert.equal(clampedOther.y, BODY_SILHOUETTE_VIEWBOX_HEIGHT - lensSize.height / 2);
});

test("clampMagnifierCenter leaves an already-valid center untouched", () => {
  const lensSize = resolveMagnifierLensSize(2.5);
  const center = { x: 110, y: 260 };
  assert.deepEqual(clampMagnifierCenter(center, lensSize), center);
});

test("clampMagnifierCenter falls back to the canvas's own center on an axis where the lens is as large as (or larger than) the canvas -- the MIN_MAGNIFIER_ZOOM floor, never a divide-by-negative-range bug", () => {
  const oversizedLens = { width: BODY_SILHOUETTE_VIEWBOX_WIDTH * 2, height: 100 };
  const clamped = clampMagnifierCenter({ x: 5, y: 5 }, oversizedLens);
  assert.equal(clamped.x, BODY_SILHOUETTE_VIEWBOX_WIDTH / 2);
  // The height axis is not oversized, so it clamps normally rather than falling back.
  assert.notEqual(clamped.y, BODY_SILHOUETTE_VIEWBOX_HEIGHT / 2);
});

// --- viewBox string: required test -- accurate at every zoom level ----

test("required test: resolveMagnifierViewBox returns the FULL canvas rectangle at zoomScale=1 (the un-magnified baseline), proving the magnifier is the identity transform at its own floor", () => {
  const viewBox = resolveMagnifierViewBox(resolveDefaultMagnifierCenter(), 1);
  assert.equal(viewBox, `0 0 ${BODY_SILHOUETTE_VIEWBOX_WIDTH} ${BODY_SILHOUETTE_VIEWBOX_HEIGHT}`);
});

test("required test: resolveMagnifierViewBox at every zoom level from MIN to MAX produces a rectangle strictly inside the canvas bounds, for a center requested at every corner and the middle", () => {
  const centers = [
    { x: 0, y: 0 },
    { x: BODY_SILHOUETTE_VIEWBOX_WIDTH, y: 0 },
    { x: 0, y: BODY_SILHOUETTE_VIEWBOX_HEIGHT },
    { x: BODY_SILHOUETTE_VIEWBOX_WIDTH, y: BODY_SILHOUETTE_VIEWBOX_HEIGHT },
    resolveDefaultMagnifierCenter(),
  ];
  for (let zoom = MIN_MAGNIFIER_ZOOM; zoom <= MAX_MAGNIFIER_ZOOM; zoom += 0.5) {
    for (const center of centers) {
      const [minX, minY, width, height] = resolveMagnifierViewBox(center, zoom).split(" ").map(Number);
      assert.ok(minX >= -1e-9, `minX ${minX} must be >= 0 at zoom ${zoom}`);
      assert.ok(minY >= -1e-9, `minY ${minY} must be >= 0 at zoom ${zoom}`);
      assert.ok(minX + width <= BODY_SILHOUETTE_VIEWBOX_WIDTH + 1e-9, `right edge must be <= canvas width at zoom ${zoom}`);
      assert.ok(minY + height <= BODY_SILHOUETTE_VIEWBOX_HEIGHT + 1e-9, `bottom edge must be <= canvas height at zoom ${zoom}`);
    }
  }
});

test("resolveMagnifierViewBox at a higher zoom produces a strictly smaller crop rectangle than a lower zoom, for the same (valid, centered) point", () => {
  const center = resolveDefaultMagnifierCenter();
  const [, , lowWidth] = resolveMagnifierViewBox(center, MIN_MAGNIFIER_ZOOM).split(" ").map(Number);
  const [, , highWidth] = resolveMagnifierViewBox(center, MAX_MAGNIFIER_ZOOM).split(" ").map(Number);
  assert.ok(highWidth < lowWidth);
});

// --- drag/pan: required test -- the lens can be moved via dragging ----

test("required test: resolvePannedMagnifierCenter moves the lens WITH the drag direction (drag right -> center moves right), the magnifying-glass-follows-the-finger convention", () => {
  const center = resolveDefaultMagnifierCenter();
  const panned = resolvePannedMagnifierCenter(center, 50, 0, DEFAULT_MAGNIFIER_ZOOM, 300, 300);
  assert.ok(panned.x > center.x);
  assert.equal(panned.y, center.y);
});

test("resolvePannedMagnifierCenter's content-space delta scales with zoom -- the SAME on-screen drag pans a SMALLER content distance at a higher zoom (finer control when more magnified)", () => {
  const center = resolveDefaultMagnifierCenter();
  const pannedLowZoom = resolvePannedMagnifierCenter(center, 50, 0, MIN_MAGNIFIER_ZOOM, 300, 300);
  const pannedHighZoom = resolvePannedMagnifierCenter(center, 50, 0, MAX_MAGNIFIER_ZOOM, 300, 300);
  const deltaLow = pannedLowZoom.x - center.x;
  const deltaHigh = pannedHighZoom.x - center.x;
  assert.ok(deltaHigh > 0 && deltaHigh < deltaLow, "a higher zoom must pan a smaller content-space distance for the identical finger movement");
});

test("resolvePannedMagnifierCenter re-clamps after panning, so a drag far past an edge still lands on a valid, in-bounds lens position -- never a crop rectangle outside the canvas", () => {
  const panned = resolvePannedMagnifierCenter(resolveDefaultMagnifierCenter(), -99999, -99999, DEFAULT_MAGNIFIER_ZOOM, 300, 300);
  const lensSize = resolveMagnifierLensSize(DEFAULT_MAGNIFIER_ZOOM);
  assert.equal(panned.x, lensSize.width / 2);
  assert.equal(panned.y, lensSize.height / 2);
});

test("resolvePannedMagnifierCenter is a no-op (zero delta) when the rendered lens size is reported as 0 (not yet measured by onLayout) -- never a division producing NaN/Infinity", () => {
  const center = resolveDefaultMagnifierCenter();
  const panned = resolvePannedMagnifierCenter(center, 50, 50, DEFAULT_MAGNIFIER_ZOOM, 0, 0);
  assert.deepEqual(panned, center);
});
