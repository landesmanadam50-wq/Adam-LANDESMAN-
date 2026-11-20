/**
 * arc/bodySilhouetteLayout.ts
 *
 * Unified ARC Architecture and Interactive Animation Update, Phase 1
 * ("Interactive Segmented Body"): pure geometry data for the real SVG
 * front/back body silhouette -- deliberately a NEW, separate module
 * from arc/bodyScanRegions.ts, which stays the single source of truth
 * for the region identifiers, Hebrew labels, and left/right pairing
 * ("Preserve the existing body-region identifiers"). This file only
 * ever ADDS where each region is drawn; it never redefines or
 * duplicates what a region IS.
 *
 * Every BodyScanRegion from arc/bodyScanRegions.ts appears here at
 * least once (BODY_SCAN_ALL_REGIONS' own completeness is asserted by
 * this module's own test file) -- a region paired per
 * isBodyScanRegionPaired gets independent left/right shapes, a midline
 * region gets one side-less shape. A region visible from both the
 * front and the back (e.g. shoulders, forearms) simply has one shape
 * per view; one visible from only one side (e.g. the chest, the shins)
 * has a shape in that view alone -- selecting it on the other view is
 * therefore not possible, by design, never a dead tap target silently
 * doing nothing.
 *
 * Coordinates are deliberately a simple, stylized "mannequin" layout
 * (ellipses on a fixed viewBox), not literal anatomical artwork --
 * this environment has no device/emulator to visually iterate on real
 * anatomical illustration, so the geometry favors clear, well-spaced,
 * unambiguous tap targets over anatomical precision. Final visual
 * polish (exact proportions, a nicer outline) is expected to need a
 * pass on an actual Android device, per this task's own acknowledgment
 * that "actual visual verification will require testing an Android
 * APK."
 */

import { BODY_SCAN_PAIRED_REGIONS } from "./bodyScanRegions.ts";
import type { BodyScanRegion } from "./bodyScanRegions.ts";
import type { BodyScanSide } from "./bodyScanSelection.ts";

export type BodySilhouetteView = "front" | "back";

export interface BodyScanRegionShapeDef {
  region: BodyScanRegion;
  side: BodyScanSide;
  view: BodySilhouetteView;
  /** Ellipse center/radii, in the fixed BODY_SILHOUETTE_VIEWBOX_* coordinate space below. */
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export const BODY_SILHOUETTE_VIEWBOX_WIDTH = 220;
export const BODY_SILHOUETTE_VIEWBOX_HEIGHT = 520;

/**
 * One row per drawn shape. A paired region contributes one row per
 * side it's drawn in (never a single "both sides at once" shape); a
 * midline region contributes one side-less row per view it appears in.
 */
export const BODY_SCAN_REGION_SHAPES: BodyScanRegionShapeDef[] = [
  // --- ראש ופנים ---
  { region: "scalp", side: null, view: "front", cx: 110, cy: 18, rx: 26, ry: 10 },
  { region: "scalp", side: null, view: "back", cx: 110, cy: 30, rx: 30, ry: 26 },
  { region: "forehead", side: null, view: "front", cx: 110, cy: 34, rx: 22, ry: 12 },
  { region: "eyes", side: "left", view: "front", cx: 100, cy: 46, rx: 6, ry: 4 },
  { region: "eyes", side: "right", view: "front", cx: 120, cy: 46, rx: 6, ry: 4 },
  { region: "cheeks", side: "left", view: "front", cx: 92, cy: 56, rx: 9, ry: 9 },
  { region: "cheeks", side: "right", view: "front", cx: 128, cy: 56, rx: 9, ry: 9 },
  { region: "ears", side: "left", view: "front", cx: 82, cy: 48, rx: 5, ry: 9 },
  { region: "ears", side: "right", view: "front", cx: 138, cy: 48, rx: 5, ry: 9 },
  { region: "scanJaw", side: null, view: "front", cx: 110, cy: 68, rx: 17, ry: 9 },

  // --- צוואר ופלג גוף עליון ---
  { region: "scanNeck", side: null, view: "front", cx: 110, cy: 85, rx: 13, ry: 10 },
  { region: "scanNeck", side: null, view: "back", cx: 110, cy: 85, rx: 13, ry: 10 },
  { region: "throat", side: null, view: "front", cx: 110, cy: 90, rx: 6, ry: 4 },
  { region: "scanShoulders", side: "left", view: "front", cx: 72, cy: 108, rx: 20, ry: 12 },
  { region: "scanShoulders", side: "right", view: "front", cx: 148, cy: 108, rx: 20, ry: 12 },
  { region: "scanShoulders", side: "left", view: "back", cx: 72, cy: 108, rx: 20, ry: 12 },
  { region: "scanShoulders", side: "right", view: "back", cx: 148, cy: 108, rx: 20, ry: 12 },
  { region: "scanChest", side: null, view: "front", cx: 110, cy: 140, rx: 36, ry: 28 },
  { region: "upperBack", side: null, view: "back", cx: 110, cy: 138, rx: 38, ry: 32 },
  { region: "scanAbdomen", side: null, view: "front", cx: 110, cy: 198, rx: 32, ry: 26 },
  { region: "lowerBack", side: null, view: "back", cx: 110, cy: 198, rx: 34, ry: 26 },
  { region: "pelvisHips", side: null, view: "front", cx: 110, cy: 238, rx: 36, ry: 20 },
  { region: "pelvisHips", side: null, view: "back", cx: 110, cy: 238, rx: 36, ry: 20 },

  // --- ידיים ---
  { region: "scanArms", side: "left", view: "front", cx: 52, cy: 160, rx: 15, ry: 42 },
  { region: "scanArms", side: "right", view: "front", cx: 168, cy: 160, rx: 15, ry: 42 },
  { region: "scanArms", side: "left", view: "back", cx: 52, cy: 160, rx: 15, ry: 42 },
  { region: "scanArms", side: "right", view: "back", cx: 168, cy: 160, rx: 15, ry: 42 },
  { region: "elbows", side: "left", view: "front", cx: 50, cy: 205, rx: 9, ry: 9 },
  { region: "elbows", side: "right", view: "front", cx: 170, cy: 205, rx: 9, ry: 9 },
  { region: "elbows", side: "left", view: "back", cx: 50, cy: 205, rx: 9, ry: 9 },
  { region: "elbows", side: "right", view: "back", cx: 170, cy: 205, rx: 9, ry: 9 },
  { region: "forearms", side: "left", view: "front", cx: 46, cy: 240, rx: 12, ry: 30 },
  { region: "forearms", side: "right", view: "front", cx: 174, cy: 240, rx: 12, ry: 30 },
  { region: "forearms", side: "left", view: "back", cx: 46, cy: 240, rx: 12, ry: 30 },
  { region: "forearms", side: "right", view: "back", cx: 174, cy: 240, rx: 12, ry: 30 },
  { region: "wrists", side: "left", view: "front", cx: 44, cy: 268, rx: 7, ry: 7 },
  { region: "wrists", side: "right", view: "front", cx: 176, cy: 268, rx: 7, ry: 7 },
  { region: "wrists", side: "left", view: "back", cx: 44, cy: 268, rx: 7, ry: 7 },
  { region: "wrists", side: "right", view: "back", cx: 176, cy: 268, rx: 7, ry: 7 },
  { region: "palms", side: "left", view: "front", cx: 42, cy: 290, rx: 9, ry: 14 },
  { region: "palms", side: "right", view: "front", cx: 178, cy: 290, rx: 9, ry: 14 },
  { region: "palms", side: "left", view: "back", cx: 42, cy: 290, rx: 9, ry: 14 },
  { region: "palms", side: "right", view: "back", cx: 178, cy: 290, rx: 9, ry: 14 },
  { region: "fingers", side: "left", view: "front", cx: 41, cy: 312, rx: 8, ry: 12 },
  { region: "fingers", side: "right", view: "front", cx: 179, cy: 312, rx: 8, ry: 12 },
  { region: "fingers", side: "left", view: "back", cx: 41, cy: 312, rx: 8, ry: 12 },
  { region: "fingers", side: "right", view: "back", cx: 179, cy: 312, rx: 8, ry: 12 },

  // --- רגליים ---
  { region: "thighs", side: "left", view: "front", cx: 90, cy: 295, rx: 20, ry: 42 },
  { region: "thighs", side: "right", view: "front", cx: 130, cy: 295, rx: 20, ry: 42 },
  { region: "thighs", side: "left", view: "back", cx: 90, cy: 295, rx: 20, ry: 42 },
  { region: "thighs", side: "right", view: "back", cx: 130, cy: 295, rx: 20, ry: 42 },
  { region: "knees", side: "left", view: "front", cx: 90, cy: 340, rx: 13, ry: 11 },
  { region: "knees", side: "right", view: "front", cx: 130, cy: 340, rx: 13, ry: 11 },
  { region: "knees", side: "left", view: "back", cx: 90, cy: 340, rx: 13, ry: 11 },
  { region: "knees", side: "right", view: "back", cx: 130, cy: 340, rx: 13, ry: 11 },
  { region: "shins", side: "left", view: "front", cx: 90, cy: 385, rx: 15, ry: 38 },
  { region: "shins", side: "right", view: "front", cx: 130, cy: 385, rx: 15, ry: 38 },
  { region: "ankles", side: "left", view: "front", cx: 90, cy: 430, rx: 9, ry: 8 },
  { region: "ankles", side: "right", view: "front", cx: 130, cy: 430, rx: 9, ry: 8 },
  { region: "ankles", side: "left", view: "back", cx: 90, cy: 430, rx: 9, ry: 8 },
  { region: "ankles", side: "right", view: "back", cx: 130, cy: 430, rx: 9, ry: 8 },
  { region: "feet", side: "left", view: "front", cx: 88, cy: 452, rx: 16, ry: 10 },
  { region: "feet", side: "right", view: "front", cx: 132, cy: 452, rx: 16, ry: 10 },
  { region: "feet", side: "left", view: "back", cx: 88, cy: 452, rx: 16, ry: 10 },
  { region: "feet", side: "right", view: "back", cx: 132, cy: 452, rx: 16, ry: 10 },
  { region: "toes", side: "left", view: "front", cx: 88, cy: 472, rx: 14, ry: 7 },
  { region: "toes", side: "right", view: "front", cx: 132, cy: 472, rx: 14, ry: 7 },
];

/** Every shape drawn for the given view, in declaration order -- never re-sorted, so overlapping shapes always render/hit-test in the same, predictable stacking order. */
export function resolveSilhouetteShapesForView(view: BodySilhouetteView): BodyScanRegionShapeDef[] {
  return BODY_SCAN_REGION_SHAPES.filter((shape) => shape.view === view);
}

/** Which views (front/back) the given region is ever drawn in -- used to decide whether switching view should clear a now-undrawable selection highlight (it never clears the underlying session data, only which view a pending tap targets). */
export function resolveRegionViews(region: BodyScanRegion): BodySilhouetteView[] {
  const views = new Set<BodySilhouetteView>();
  for (const shape of BODY_SCAN_REGION_SHAPES) {
    if (shape.region === region) views.add(shape.view);
  }
  return [...views];
}

/** Sanity-checks this module's own data against arc/bodyScanRegions.ts's pairing flag -- a paired region must only ever have left/right shapes, a midline region only ever side-less ones. Exported so the test file can assert it directly rather than re-deriving the same check ad hoc. */
export function isShapeSideConsistentWithPairing(shape: BodyScanRegionShapeDef): boolean {
  const paired = BODY_SCAN_PAIRED_REGIONS.has(shape.region);
  return paired ? shape.side !== null : shape.side === null;
}

/**
 * Final ARC Body Redesign & Flow Fixes task, requirement 2 ("beautiful,
 * polished, gender-neutral human silhouette... smooth connected shapes
 * instead of disconnected ellipses"): a purely decorative BACKDROP --
 * one continuous head/neck/torso/arm/leg figure, drawn BEHIND the
 * existing per-region selection ellipses above (which are completely
 * UNCHANGED in identity -- every region ID, position, and selection
 * mechanism this module and arc/bodyScanSelection.ts already own stays
 * exactly as it was). Rendered by the new live/components/BodyOutlineBackdrop.tsx
 * (gradient fill + light-blue stroke there; this file only ever supplies
 * the plain geometry, no React, no react-native-svg, matching this
 * module's own existing "pure data" convention).
 *
 * Deliberately simple, straight-edged polygons (never hand-authored
 * freeform bezier curves) -- with no device/emulator available in this
 * environment to visually iterate a curved silhouette against, a
 * polygon whose exact vertices are plain, inspectable numbers is the
 * safer choice; SVG's own `strokeLinejoin="round"` (set by the
 * rendering component, not here) already softens every corner
 * considerably. Front and back views intentionally share the same
 * outline -- this app's silhouette was never modeling true depth, and
 * the existing per-region shapes above already mostly mirror between
 * the two views for exactly this reason.
 *
 * Every coordinate below is derived from, and stays consistent with,
 * the SAME landmark shapes already defined in BODY_SCAN_REGION_SHAPES
 * above (shoulder/chest/abdomen/hip/arm/leg positions) -- the backdrop
 * is built to size itself around the interactive regions, never the
 * reverse, so the two layers always line up by construction.
 */
export type BodyOutlinePartId = "head" | "neck" | "torso" | "armLeft" | "armRight" | "legLeft" | "legRight";

export interface BodyOutlineEllipsePart {
  id: BodyOutlinePartId;
  kind: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface BodyOutlinePolygonPart {
  id: BodyOutlinePartId;
  kind: "polygon";
  /** Ready-to-use react-native-svg Polygon `points` attribute value. */
  points: string;
}

export type BodyOutlinePart = BodyOutlineEllipsePart | BodyOutlinePolygonPart;

function polygonPoints(coords: readonly [number, number][]): string {
  return coords.map(([x, y]) => `${x},${y}`).join(" ");
}

/** The body's own vertical midline in BODY_SILHOUETTE_VIEWBOX_WIDTH's own coordinate space -- mirroring any left-side x coordinate to its right-side counterpart is always `BODY_SILHOUETTE_MIDLINE_X * 2 - x`. */
export const BODY_SILHOUETTE_MIDLINE_X = 110;

function mirrorX(x: number): number {
  return BODY_SILHOUETTE_MIDLINE_X * 2 - x;
}

function mirrorPoints(coords: readonly [number, number][]): [number, number][] {
  return coords.map(([x, y]) => [mirrorX(x), y]);
}

const LEFT_ARM_POLYGON: readonly [number, number][] = [
  [88, 100],
  [54, 100],
  [38, 280],
  [50, 280],
];

const LEFT_LEG_POLYGON: readonly [number, number][] = [
  [108, 258],
  [72, 258],
  [77, 432],
  [101, 432],
];

export const BODY_OUTLINE_PARTS: readonly BodyOutlinePart[] = [
  { id: "head", kind: "ellipse", cx: BODY_SILHOUETTE_MIDLINE_X, cy: 44, rx: 32, ry: 36 },
  { id: "neck", kind: "polygon", points: polygonPoints([[92, 70], [128, 70], [126, 98], [94, 98]]) },
  {
    id: "torso",
    kind: "polygon",
    points: polygonPoints([
      [68, 98],
      [152, 98],
      [148, 160],
      [144, 206],
      [150, 240],
      [146, 262],
      [74, 262],
      [70, 240],
      [76, 206],
      [72, 160],
    ]),
  },
  { id: "armLeft", kind: "polygon", points: polygonPoints(LEFT_ARM_POLYGON) },
  { id: "armRight", kind: "polygon", points: polygonPoints(mirrorPoints(LEFT_ARM_POLYGON)) },
  { id: "legLeft", kind: "polygon", points: polygonPoints(LEFT_LEG_POLYGON) },
  { id: "legRight", kind: "polygon", points: polygonPoints(mirrorPoints(LEFT_LEG_POLYGON)) },
];
