/**
 * live/components/ArticulatedBodyShape.tsx
 *
 * Final ARC Flow & Body Animation task, requirement 2 ("BODY MOVEMENT
 * -- CRITICAL") + requirement 3 (color progression): the ONE leaf
 * component that actually animates a single drawn body shape -- one
 * instance per arc/bodySilhouetteLayout.ts shape, rendered by
 * live/components/ArcBodyMantraCircle.tsx. Purely mechanical: it reads
 * a shared 0..1 "intensity" value (owned by the parent -- Dwelling=0
 * through Encoding=1) and a movement definition decided by the parent,
 * and renders the resulting translated/scaled shape with its own
 * interpolated fill color. It never decides WHICH shapes move or what
 * color category a shape belongs to -- that classification is the
 * parent's job, from the session's own actual selections, so "never
 * animate unselected regions as opening targets" holds structurally:
 * passing movementDef={null} (any shape not in the trainee's own
 * openingBodyScanRegions) always yields the identity transform,
 * regardless of intensity (arc/bodyRegionMovements.ts's own
 * resolveBodyRegionMovementTransform(null, ...) contract).
 *
 * Final ARC Body Redesign & Flow Fixes task, requirement 3 ("coherent
 * joint-based SVG articulation... do not merely stretch or reposition
 * disconnected ellipses"): renders a rounded-rect "capsule" (a plain
 * SVG Rect with a rounded corner radius) instead of a plain Ellipse.
 * For an elongated region (an arm, a thigh, the torso) this reads as a
 * genuine limb SEGMENT -- the same visual language
 * live/components/BodyOutlineBackdrop.tsx's own connected figure
 * already uses underneath it -- rather than a stretched oval; for a
 * near-circular region (palms, the head) the capsule's corner radius
 * simply equals its own half-width, which renders identically to a
 * circle. The underlying movement MATH is UNCHANGED (still the exact
 * same dx/dy/scale transform from arc/bodyRegionMovements.ts, applied
 * to the shape's own center and half-extents) -- only the drawn
 * primitive changed, from an ellipse to a capsule built around that
 * same center and those same half-extents, so every existing
 * eligibility/selection/intensity rule continues to hold exactly as
 * before.
 *
 * Requirement 4 (progressive light-blue): now interpolates across
 * FOUR color stops (arc/arcBodyMantraCircleLogic.ts's own
 * INTENSITY_COLOR_CHECKPOINTS -- 0/0.3/0.65/1, the exact same
 * checkpoints ARC_BODY_STAGE_INTENSITY already pins Acceptance/
 * Regulation/Encoding to), never just two -- so an opening region's
 * own fixed three-tier light-blue progression (soft -> brighter ->
 * vivid) lands exactly on those three stage boundaries, in step with
 * the movement itself.
 *
 * Reduced-motion: this component has no animation logic of its own to
 * disable -- it simply reads whatever `intensity` the parent gives it.
 * The parent decides whether that value animates smoothly or jumps
 * directly to each stage's target (mirroring
 * live/components/PresenceAnimation.tsx's own useReducedMotion
 * handling), so the correct, accurate per-stage frame always renders
 * either way.
 */

import Animated, { interpolateColor, useAnimatedProps } from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { Rect } from "react-native-svg";

import { INTENSITY_COLOR_CHECKPOINTS } from "../../arc/arcBodyMantraCircleLogic.ts";
import type { BodyRegionMovementDef } from "../../arc/bodyRegionMovements.ts";
import { resolveBodyRegionMovementTransform } from "../../arc/bodyRegionMovements.ts";
import type { BodyScanRegionShapeDef } from "../../arc/bodySilhouetteLayout.ts";

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const COLOR_CHECKPOINTS_ARRAY: number[] = [...INTENSITY_COLOR_CHECKPOINTS];

export interface ArticulatedBodyShapeProps {
  shape: BodyScanRegionShapeDef;
  /** 0 (Dwelling -- no movement) through 1 (Encoding -- full comfortable opening), shared across every shape of the same body so they all move together, in sync. */
  intensity: SharedValue<number>;
  /** Only set (non-null) for a shape the trainee actually selected in openingBodyScanRegions -- every other shape never moves, no matter what intensity is. */
  movementDef: BodyRegionMovementDef | null;
  /** Exactly four fill colors, one per INTENSITY_COLOR_CHECKPOINTS entry. */
  colorStops: readonly [string, string, string, string];
}

export default function ArticulatedBodyShape({ shape, intensity, movementDef, colorStops }: ArticulatedBodyShapeProps) {
  const colorStopsArray: string[] = [...colorStops];
  const animatedProps = useAnimatedProps(() => {
    const transform = resolveBodyRegionMovementTransform(movementDef, shape.side, intensity.value);
    const rx = shape.rx * transform.scale;
    const ry = shape.ry * transform.scale;
    const cx = shape.cx + transform.dx;
    const cy = shape.cy + transform.dy;
    return {
      x: cx - rx,
      y: cy - ry,
      width: rx * 2,
      height: ry * 2,
      rx: Math.min(rx, ry),
      ry: Math.min(rx, ry),
      fill: interpolateColor(intensity.value, COLOR_CHECKPOINTS_ARRAY, colorStopsArray),
    };
  }, [shape, movementDef, colorStopsArray]);

  return <AnimatedRect animatedProps={animatedProps} stroke={colorStops[3]} strokeWidth={1} strokeOpacity={0.4} fillOpacity={0.85} />;
}
