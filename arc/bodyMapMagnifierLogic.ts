/**
 * arc/bodyMapMagnifierLogic.ts
 *
 * Interactive Body Map Magnifier task: pure geometry for a "magnifying
 * glass" lens over BodySilhouetteMap's own fixed
 * BODY_SILHOUETTE_VIEWBOX_WIDTH x BODY_SILHOUETTE_VIEWBOX_HEIGHT SVG
 * canvas. The lens is implemented as a CROPPED SVG viewBox, not a
 * second coordinate system: live/components/BodyMapMagnifier.tsx
 * renders the exact same <BodySilhouetteMap> shapes, just inside a
 * smaller viewBox rectangle -- so every existing onPress/onToggle hit-
 * test, every selected-region fill color, and every persisted
 * (region, side) selection stays completely untouched. This module only
 * computes WHICH smaller viewBox rectangle to show, clamped so it never
 * extends past the original canvas edges, at any zoom level -- the same
 * "pure geometry module, consumed by a .tsx component" split
 * arc/arcBodyMantraCircleLogic.ts already uses for the one other
 * clamped-viewport problem in this codebase.
 */

import { BODY_SILHOUETTE_VIEWBOX_HEIGHT, BODY_SILHOUETTE_VIEWBOX_WIDTH } from "./bodySilhouetteLayout.ts";

export const MIN_MAGNIFIER_ZOOM = 1.5;
export const MAX_MAGNIFIER_ZOOM = 4;
export const DEFAULT_MAGNIFIER_ZOOM = 2.5;
export const MAGNIFIER_ZOOM_STEP = 0.5;
/** The magnified Svg's own fixed on-screen render height -- deliberately taller than BodySilhouetteMap's own plain `height={320}`, so the enlarged regions genuinely have more real screen space to be tapped precisely in, not just a bigger number in the same box. */
export const MAGNIFIER_RENDER_HEIGHT = 420;

export interface MagnifierLensSize {
  width: number;
  height: number;
}

export interface MagnifierCenter {
  x: number;
  y: number;
}

/**
 * The lens's own crop-rectangle size at a given zoom: the SAME aspect
 * ratio as the full canvas, shrunk by 1/zoomScale -- so a higher
 * zoomScale shows a smaller slice of the body, magnified to fill the
 * same on-screen render area. zoomScale is floored at 1 (a "zoom" below
 * real size is never offered by MIN_MAGNIFIER_ZOOM, but guarded here
 * too so this function alone can never return a lens larger than the
 * canvas itself).
 */
export function resolveMagnifierLensSize(zoomScale: number, canvasWidth: number = BODY_SILHOUETTE_VIEWBOX_WIDTH, canvasHeight: number = BODY_SILHOUETTE_VIEWBOX_HEIGHT): MagnifierLensSize {
  const safeZoom = Math.max(1, zoomScale);
  return { width: canvasWidth / safeZoom, height: canvasHeight / safeZoom };
}

/** The canvas's own geometric center -- the sensible starting lens position before the trainee has tapped or dragged anywhere. */
export function resolveDefaultMagnifierCenter(canvasWidth: number = BODY_SILHOUETTE_VIEWBOX_WIDTH, canvasHeight: number = BODY_SILHOUETTE_VIEWBOX_HEIGHT): MagnifierCenter {
  return { x: canvasWidth / 2, y: canvasHeight / 2 };
}

export function clampMagnifierZoom(zoomScale: number): number {
  return Math.min(MAX_MAGNIFIER_ZOOM, Math.max(MIN_MAGNIFIER_ZOOM, zoomScale));
}

/**
 * Clamps a lens center so its own crop rectangle (center +/- half the
 * lens size, on each axis) never extends past [0, canvasWidth] x
 * [0, canvasHeight] -- the required guarantee ("the coordinate match
 * between the magnified view and the original map is accurate at every
 * zoom level") stated as a precise per-axis containment check, since
 * the lens itself IS an axis-aligned crop rectangle (never a circular
 * mask drawn inside a larger canvas, unlike arcBodyMantraCircleLogic's
 * own resolveCircleContentInsetIsSafe) -- no corner-distance trig
 * needed here, a simple per-axis clamp is the exact, correct
 * containment condition. When the lens is as large as (or larger than)
 * the canvas on some axis (e.g. MIN_MAGNIFIER_ZOOM on a very small
 * canvas), that axis clamps to the canvas's own center instead of
 * dividing by a negative/zero range.
 */
export function clampMagnifierCenter(
  center: MagnifierCenter,
  lensSize: MagnifierLensSize,
  canvasWidth: number = BODY_SILHOUETTE_VIEWBOX_WIDTH,
  canvasHeight: number = BODY_SILHOUETTE_VIEWBOX_HEIGHT
): MagnifierCenter {
  const clampAxis = (value: number, lensDimension: number, canvasDimension: number): number => {
    const halfLens = lensDimension / 2;
    const minCenter = halfLens;
    const maxCenter = canvasDimension - halfLens;
    if (minCenter > maxCenter) return canvasDimension / 2;
    return Math.min(maxCenter, Math.max(minCenter, value));
  };
  return {
    x: clampAxis(center.x, lensSize.width, canvasWidth),
    y: clampAxis(center.y, lensSize.height, canvasHeight),
  };
}

/**
 * The one function live/components/BodyMapMagnifier.tsx actually calls
 * to render its zoomed <Svg>: resolves the clamped lens size + center
 * for the given zoomScale, and returns the exact `viewBox` attribute
 * string react-native-svg expects ("minX minY width height") -- the
 * SAME coordinate space BodySilhouetteMap's own Ellipses are already
 * drawn in, so react-native-svg's own internal hit-testing resolves a
 * tap on a magnified Ellipse to EXACTLY the same (region, side) it
 * would at the normal, unmagnified viewBox -- no separate touch-
 * coordinate remapping is ever needed, at any zoom level.
 */
export function resolveMagnifierViewBox(
  center: MagnifierCenter,
  zoomScale: number,
  canvasWidth: number = BODY_SILHOUETTE_VIEWBOX_WIDTH,
  canvasHeight: number = BODY_SILHOUETTE_VIEWBOX_HEIGHT
): string {
  const lensSize = resolveMagnifierLensSize(zoomScale, canvasWidth, canvasHeight);
  const clampedCenter = clampMagnifierCenter(center, lensSize, canvasWidth, canvasHeight);
  const minX = clampedCenter.x - lensSize.width / 2;
  const minY = clampedCenter.y - lensSize.height / 2;
  return `${minX} ${minY} ${lensSize.width} ${lensSize.height}`;
}

/**
 * Converts a drag gesture's own on-screen pixel delta into the lens's
 * content-space delta, then applies it and re-clamps -- "the user will
 * be able to move the magnification area via dragging." The lens
 * follows the finger directly (dragging right moves the lens right,
 * revealing body content further to the right) -- the ordinary
 * magnifying-glass metaphor (the glass itself is what's being moved),
 * never the inverted "drag the content under a fixed glass" convention
 * a map/photo viewer would use. `renderedLensWidth`/`renderedLensHeight`
 * are the ACTUAL on-screen pixel size of the rendered, magnified Svg
 * (measured via onLayout by the caller) -- required so the same finger
 * movement always pans the SAME real distance across the body,
 * regardless of zoom level or device screen size.
 */
export function resolvePannedMagnifierCenter(
  center: MagnifierCenter,
  dragDeltaX: number,
  dragDeltaY: number,
  zoomScale: number,
  renderedLensWidth: number,
  renderedLensHeight: number,
  canvasWidth: number = BODY_SILHOUETTE_VIEWBOX_WIDTH,
  canvasHeight: number = BODY_SILHOUETTE_VIEWBOX_HEIGHT
): MagnifierCenter {
  const lensSize = resolveMagnifierLensSize(zoomScale, canvasWidth, canvasHeight);
  const contentPerPixelX = renderedLensWidth > 0 ? lensSize.width / renderedLensWidth : 0;
  const contentPerPixelY = renderedLensHeight > 0 ? lensSize.height / renderedLensHeight : 0;
  const nextCenter: MagnifierCenter = { x: center.x + dragDeltaX * contentPerPixelX, y: center.y + dragDeltaY * contentPerPixelY };
  return clampMagnifierCenter(nextCenter, lensSize, canvasWidth, canvasHeight);
}
