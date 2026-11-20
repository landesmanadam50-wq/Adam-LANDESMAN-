/**
 * live/components/ArcBodyMantraCircle.tsx
 *
 * Final ARC Flow & Body Animation task, requirement 4 ("ONE CIRCLE --
 * BODY + MANTRA"), extended by the Fix All Confirmed ARC Android Bugs
 * task (requirement 2, "Presence Mantras Inside the Circle") to carry
 * the trainee through all NINE mantra pages of the exercise -- the
 * five Presence pages (natural_breathing/center_attention/visual_field/
 * sound_awareness/body_scan) and then Dwelling, Acceptance, Regulation,
 * Encoding & Action -- through the exact same "exactly ONE circular
 * outline, never multiple rings" container: a large articulated body
 * inside it, the current mantra inside the SAME circle, and a tap
 * anywhere on the circle advances to the next page. The circle itself
 * grows slightly after each page (cumulative across all nine, not
 * reset between them), and live/components/PresenceAnimation.tsx (in
 * its own "subtle" mode) stays visible behind the body throughout --
 * continuous Presence, carried through every stage by this one
 * component, never a second instance.
 *
 * Fix All Confirmed ARC Android Bugs task, requirement 1 (the
 * confirmed black-screen root cause): arc/bodyRegionMovements.ts's
 * resolveBodyRegionMovementTransform is called from inside
 * live/components/ArticulatedBodyShape.tsx's own Reanimated worklet
 * but is DEFINED in a separate file -- it now carries its own explicit
 * "worklet" directive (the officially documented fix for exactly this
 * cross-file pattern), which is the confirmed cause of the reported
 * black screen on a release Android build (no redbox in release mode,
 * so an unworkletized function call throwing on the UI thread simply
 * leaves the screen blank while unrelated native overlay windows --
 * the floating task timer, the ARC shortcut -- keep rendering). This
 * component ALSO wraps its own animated rendering in
 * AnimationErrorBoundary (requirement 5, "a safe static fallback if
 * native animation fails") as a second, independent layer: if
 * anything in this render path still throws on the JS thread for any
 * OTHER reason, the trainee gets a still-correct, still-interactive
 * static rendering instead of a blank screen -- the circle's own
 * tap-to-advance (the outer Pressable, entirely outside the boundary)
 * keeps working regardless, so the trainee is never stuck.
 *
 * Circle Centering and Touch Behavior task: two things this component
 * owns directly (every number behind them lives in, and is verified
 * by, arc/arcBodyMantraCircleLogic.ts -- never re-derived here):
 *
 * 1. The circle's own diameter is measured against the REAL available
 *    space (onLayout for width, useWindowDimensions for height), not
 *    a hardcoded device-size assumption, and clamped
 *    (resolveClampedCircleSize) so it can never grow wider than the
 *    screen -- "must not extend beyond the screen" -- on any device,
 *    narrow Android phones included, while still preserving the
 *    growth cue across stages (the whole progression scales down
 *    together on a narrow screen, never flattened to one ceiling).
 *    Horizontal centering on the actual screen comes from this
 *    component's own Pressable stretching to the full width its
 *    parent gives it (live/NewArcLiveScreen.tsx centers that stage
 *    vertically too -- see isBodyMantraStage there); vertical
 *    centering is NEVER this component's own job, only horizontal and
 *    growth-stability are.
 * 2. Body + mantra are laid out as ordinary, non-overlapping flex
 *    children inside ONE inset box (CIRCLE_CONTENT_INSET_*) that is
 *    mathematically proven (resolveCircleContentInsetIsSafe, and that
 *    module's own test) to stay fully inside the circle's own
 *    `overflow: "hidden"` circular mask -- never clipped by the
 *    circle's curvature, never overlapping each other, regardless of
 *    how long the mantra text is (the body simply yields space: it is
 *    `flex: 1`, the mantra is auto-height). Growth itself never resets
 *    on a React re-render because the TARGET size is always derived
 *    fresh from the session's own currentStep (never a locally-tracked
 *    counter) -- the SAME component instance stays mounted across
 *    every one of the nine pages (confirmed: the surrounding
 *    conditional text block in live/NewArcLiveScreen.tsx renders
 *    identically -- nothing -- for every one of them, so React never
 *    remounts this component between pages), so Reanimated's own
 *    style-value animation smoothly interpolates from whatever size
 *    it was showing to the new, slightly larger target every time.
 *
 * Touch Behavior: tapping ANYWHERE inside the circle advances --
 * that's the ENTIRE component's touch surface (one outer Pressable).
 * Everything drawn inside it (the Presence ring, the articulated
 * body) is `pointerEvents="none"` AND has no onPress of its own
 * (ArticulatedBodyShape never takes one) -- so a tap landing directly
 * on the animated body can never be intercepted or mistaken for a
 * region selection; this component is only ever rendered for the nine
 * MANTRA pages, never alongside BodySilhouetteMap's own SELECTION
 * screens (body-region selection, or focus_color's own color chips),
 * so there is no shared touch surface between "select something" and
 * "advance the stage" to begin with. A `useRef` guard ensures at most
 * one onAdvance call fires per stage, regardless of how many times
 * the circle is tapped before the parent re-renders with the next
 * stage -- "only one advance should happen per tap."
 *
 * Pure presentation otherwise: every color/movement/selection decision
 * is read directly from the trainee's own actual session arrays
 * (passed in as plain props, the same convention
 * live/components/BodySilhouetteMap.tsx already uses) -- always empty
 * arrays for the five Presence pages (nothing has been selected yet
 * at that point in the exercise), which this component needs no
 * special-casing for: an empty selection naturally renders a plain,
 * neutral, motionless body.
 *
 * Unified ARC & Productivity Update task, requirements 7-8: two MORE
 * stages -- "urge_acceptance" and "thought_acceptance" -- render
 * through this SAME component (the trainee's own "accepting a
 * thought/interpretation/urge" moment, immediately BEFORE
 * natural_breathing in the actual exercise order), and `showBody`
 * (resolveShowBodyForStage) now SKIPS the body layer entirely for
 * those two plus every pre-body-awareness Presence page -- "do not
 * show the anatomical body yet... introduce the body when the body
 * scan/body-awareness stage begins." The central point and the one
 * expanding circle (PresenceAnimation + the circle's own growing
 * border, both already stage-independent) still render exactly as
 * before regardless of `showBody`, which is the whole requirement:
 * "show the center point, ONE outline circle, and mantra... keep the
 * circle expanding" even with the body hidden.
 */

import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import Animated from "react-native-reanimated";
import Svg, { Ellipse } from "react-native-svg";

import {
  ARC_BODY_STAGE_INTENSITY,
  BASE_CIRCLE_SIZE,
  CIRCLE_CONTENT_INSET_BOTTOM,
  CIRCLE_CONTENT_INSET_LEFT,
  CIRCLE_CONTENT_INSET_RIGHT,
  CIRCLE_CONTENT_INSET_TOP,
  resolveBetterSilhouetteView,
  resolveBodyMantraShapeAppearance,
  resolveClampedCircleSize,
  resolveGreenOpeningActiveForStage,
  resolveShowBodyForStage,
} from "../../arc/arcBodyMantraCircleLogic.ts";
import type { ArcBodyMantraStage, RegionSideKey } from "../../arc/arcBodyMantraCircleLogic.ts";
import type { BodyScanOpeningRole } from "../../arc/bodyScanSelection.ts";
import { BODY_SILHOUETTE_VIEWBOX_HEIGHT, BODY_SILHOUETTE_VIEWBOX_WIDTH, resolveSilhouetteShapesForView } from "../../arc/bodySilhouetteLayout.ts";
import { resolveMovementInstructionsForStage } from "../../arc/bodyRegionMovements.ts";
import ArticulatedBodyShape from "./ArticulatedBodyShape.tsx";
import PresenceAnimation from "./PresenceAnimation.tsx";
import AnimationErrorBoundary from "./AnimationErrorBoundary.tsx";
import BodyOutlineBackdrop from "./BodyOutlineBackdrop.tsx";

export type { ArcBodyMantraStage };

export interface ArcBodyMantraCircleProps {
  stage: ArcBodyMantraStage;
  mantra: string;
  /** resolveFocusColorHex(appearanceSettings.pointColor) -- the trainee's own configured Presence point/ring color (arc/arcAppearanceSettings.ts, Part 7.2). */
  presenceColor: string;
  /**
   * ARCHI -- Unified 7-Part Update task, Part 4.3/7.2: the circle's own
   * OUTLINE color -- independently configurable from presenceColor
   * (the point/ring color). Optional, defaulting to presenceColor when
   * omitted, so every pre-existing call site (never updated to pass
   * this) keeps rendering byte-for-byte as before -- "the circle
   * outline may be purple or another saved user-selected color. Do not
   * hardcode purple if the user has changed it in Settings."
   */
  circleOutlineColor?: string;
  /** session.bodyScanContractionRegions, verbatim. */
  contractionRegions: readonly RegionSideKey[];
  /** The trainee's own closure regions -- session.bodyScanHeavinessRegions already filtered by the caller to entries with state "closedness" or "heaviness_and_closedness" (the same filter arc/newArcLiveSteps.ts's own isStepReachable("body_scan_opening_region") uses), so this component never needs to know about the tri-state heaviness/closedness shape at all. */
  closureRegions: readonly RegionSideKey[];
  /**
   * session.openingBodyScanRegions, verbatim -- always a subset of
   * closureRegions, by construction (Select Opening Regions only ever
   * offers already-closed, movement-eligible regions). Widened (Part
   * 8.2) to optionally carry each entry's own real `.role` ("opening"
   * | "opening_and_supportive") -- the shape
   * session.openingBodyScanRegions (BodyScanOpeningSelection[])
   * already has at the call site -- so this component can tell
   * whether the trainee chose at least one real supportive (blue)
   * region, without widening RegionSideKey itself (which stays the
   * plain region/side pair every other track in this file already
   * expects).
   */
  openingRegions: readonly (RegionSideKey & { role?: BodyScanOpeningRole })[];
  /**
   * ARCHI -- Two Mantras for Urge Acceptance correction: an OPTIONAL,
   * stage-independent block of short first-person lines shown below
   * the circle, always together, outside its touch surface -- same
   * "non-interactive, never intercepts tap-to-advance" rendering as
   * `movementInstructions` below, but for plain cognitive-acceptance
   * copy rather than body-movement guidance. Used by the
   * "urge_acceptance" stage for its own two required mantras ("אני
   * עוצר לרגע." / "אני מפנה תשומת לב לתחושת הדחף בגוף."); defaults to
   * empty for every other stage/caller, which renders nothing extra.
   */
  belowCircleLines?: readonly string[];
  onAdvance: () => void;
}

export default function ArcBodyMantraCircle({
  stage,
  mantra,
  presenceColor,
  circleOutlineColor,
  contractionRegions,
  closureRegions,
  openingRegions,
  belowCircleLines = [],
  onAdvance,
}: ArcBodyMantraCircleProps) {
  const resolvedCircleOutlineColor = circleOutlineColor ?? presenceColor;
  // ARCHI -- Consolidated Implementation Request, Part 8.2: the
  // whole-body spreading tint is only ever active during Encoding, and
  // only once the trainee actually chose at least one real
  // opening_and_supportive (blue) region -- never invented when no
  // supportive region was ever selected (Part 8.3).
  const encodingSpreadActive = stage === "encoding" && openingRegions.some((entry) => entry.role === "opening_and_supportive");
  // ARCHI -- Precise Body Opening and Stabilization Rules task, Final
  // Goal: Light Green's own active opening/movement is allowed ONLY
  // during Acceptance (resolveGreenOpeningActiveForStage) -- Dark Blue
  // is completely unaffected and keeps opening through Regulation/
  // Encoding exactly as before.
  const allowGreenOpening = resolveGreenOpeningActiveForStage(stage);
  const reduceMotionEnabled = useReducedMotion();
  const intensity = useSharedValue(ARC_BODY_STAGE_INTENSITY[stage]);
  const targetIntensity = ARC_BODY_STAGE_INTENSITY[stage];

  useEffect(() => {
    if (reduceMotionEnabled) {
      // Accessible alternative: jump straight to the correct value for
      // this stage -- still an accurate, discrete progression, just
      // without an animated transition between stages.
      intensity.value = targetIntensity;
      return;
    }
    intensity.value = withTiming(targetIntensity, { duration: 1100, easing: Easing.out(Easing.quad) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intensity is a SharedValue, stable across renders by design.
  }, [targetIntensity, reduceMotionEnabled]);

  // Circle Centering and Touch Behavior task, requirement 1: measure
  // the REAL available width from the Pressable's own rendered box
  // (already inside whatever padding live/NewArcLiveScreen.tsx's own
  // ScrollView content applies) -- never a hardcoded screen-size
  // assumption. useWindowDimensions supplies the height side of the
  // clamp (a short/landscape viewport), which this component has no
  // other way to measure on its own.
  const window = useWindowDimensions();
  const [availableWidth, setAvailableWidth] = useState(0);
  const handleLayout = (event: LayoutChangeEvent) => setAvailableWidth(event.nativeEvent.layout.width);

  const circleSize = resolveClampedCircleSize(BASE_CIRCLE_SIZE, stage, availableWidth, window.height);

  const circleStyle = useAnimatedStyle(() => ({
    width: withTiming(circleSize, { duration: 500 }),
    height: withTiming(circleSize, { duration: 500 }),
    borderRadius: withTiming(circleSize / 2, { duration: 500 }),
  }));

  const view = resolveBetterSilhouetteView([...contractionRegions, ...closureRegions, ...openingRegions]);
  const shapes = resolveSilhouetteShapesForView(view);

  // Requirement 8 ("SHOW THE ANATOMICAL BODY ONLY FROM BODY
  // AWARENESS"): a pure function of the stage alone -- false for
  // urge_acceptance/thought_acceptance and every Presence page before
  // body_scan, so only the central point, the one expanding circle,
  // and the mantra show during those stages; true from body_scan
  // onward, unchanged from this component's existing behavior there.
  const showBody = resolveShowBodyForStage(stage);

  // Final ARC Body Redesign task, requirement 5 ("SHOW MOVEMENT
  // INSTRUCTIONS BELOW THE CIRCLE"): a plain, non-interactive line per
  // distinct selected movement set, for the three movement stages
  // only -- resolveMovementInstructionsForStage itself returns [] for
  // every other stage (including Dwelling and every Presence page),
  // so this is the one gate this component needs.
  const movementInstructions = resolveMovementInstructionsForStage(stage, openingRegions);

  // Requirement 2 ("only one advance should happen per tap" / "prevent
  // double navigation"): at most one onAdvance call fires for this
  // stage -- a second, third, etc. tap before the parent re-renders
  // with the NEXT stage (and remounts/re-arms this guard via the
  // effect below) is silently ignored, never queued or compounded
  // into skipping an extra step.
  const hasAdvancedRef = useRef(false);
  useEffect(() => {
    hasAdvancedRef.current = false;
  }, [stage]);
  function handleAdvance() {
    if (hasAdvancedRef.current) return;
    hasAdvancedRef.current = true;
    onAdvance();
  }

  return (
    <>
    <Pressable
      onPress={handleAdvance}
      onLayout={handleLayout}
      accessibilityRole="button"
      accessibilityLabel={`${mantra}. הקש להמשך לשלב הבא.`}
      style={styles.pressable}
    >
      <Animated.View style={[styles.circle, circleStyle, { borderColor: resolvedCircleOutlineColor }]}>
        <AnimationErrorBoundary fallback={<StaticPresenceDot circleSize={circleSize} presenceColor={presenceColor} />}>
          <View style={styles.presenceLayer} pointerEvents="none">
            <PresenceAnimation color={presenceColor} mode="subtle" size={circleSize * 0.95} />
          </View>
        </AnimationErrorBoundary>
        <View
          style={[
            styles.insetContent,
            {
              top: `${CIRCLE_CONTENT_INSET_TOP * 100}%`,
              bottom: `${CIRCLE_CONTENT_INSET_BOTTOM * 100}%`,
              left: `${CIRCLE_CONTENT_INSET_LEFT * 100}%`,
              right: `${CIRCLE_CONTENT_INSET_RIGHT * 100}%`,
            },
          ]}
          pointerEvents="none"
        >
          {showBody && (
            <View style={styles.bodyLayer}>
              <AnimationErrorBoundary
                fallback={
                  <StaticBodyShapes
                    shapes={shapes}
                    contractionRegions={contractionRegions}
                    closureRegions={closureRegions}
                    openingRegions={openingRegions}
                    encodingSpreadActive={encodingSpreadActive}
                    allowGreenOpening={allowGreenOpening}
                  />
                }
              >
                <Svg
                  width="100%"
                  height="100%"
                  viewBox={`0 0 ${BODY_SILHOUETTE_VIEWBOX_WIDTH} ${BODY_SILHOUETTE_VIEWBOX_HEIGHT}`}
                  preserveAspectRatio="xMidYMid meet"
                >
                  <BodyOutlineBackdrop instanceKey="mantra-circle" />
                  {shapes.map((shape) => {
                    const { colorStops, movementDef } = resolveBodyMantraShapeAppearance(shape.region, shape.side, {
                      contractionRegions,
                      closureRegions,
                      openingRegions,
                      encodingSpreadActive,
                      allowGreenOpening,
                    });
                    return <ArticulatedBodyShape key={`${shape.region}-${shape.side ?? "mid"}-${shape.view}`} shape={shape} intensity={intensity} movementDef={movementDef} colorStops={colorStops} />;
                  })}
                </Svg>
              </AnimationErrorBoundary>
            </View>
          )}
          {/* The mantra itself always renders as a plain flex sibling, outside both boundaries above -- the one thing the trainee needs no matter what, immune to any animation-path failure. */}
          <Text style={styles.mantraText}>{mantra}</Text>
        </View>
      </Animated.View>
    </Pressable>
    {movementInstructions.length > 0 && (
      // Non-interactive and entirely outside the Pressable above --
      // it must never intercept the tap-to-advance gesture. Rendered
      // as a compact vertical list (one line per distinct selected
      // movement set) rather than one long paragraph, so several
      // simultaneously-selected regions never overcrowd the screen.
      <View style={styles.instructionsBlock} pointerEvents="none">
        {movementInstructions.map((instruction) => (
          <Text key={instruction} style={styles.instructionText}>
            {instruction}
          </Text>
        ))}
      </View>
    )}
    {belowCircleLines.length > 0 && (
      // Both lines stay visible together, below the circle, exactly as
      // long as the trainee remains on this screen -- never a separate
      // explanation page, never one line replacing the other.
      <View style={styles.instructionsBlock} pointerEvents="none">
        {belowCircleLines.map((line) => (
          <Text key={line} style={styles.instructionText}>
            {line}
          </Text>
        ))}
      </View>
    )}
    </>
  );
}

/** AnimationErrorBoundary fallback for the Presence ring: a plain, motionless, correctly-colored dot in the same absolute-centered spot the ring itself occupies. */
function StaticPresenceDot({ circleSize, presenceColor }: { circleSize: number; presenceColor: string }) {
  const dotSize = circleSize * 0.08;
  return (
    <View style={styles.presenceLayer} pointerEvents="none">
      <View style={[styles.staticPresenceDot, { backgroundColor: presenceColor, width: dotSize, height: dotSize, borderRadius: dotSize / 2 }]} />
    </View>
  );
}

/** AnimationErrorBoundary fallback for the articulated body: the exact same shapes at their own resting geometry (no movement transform, no intensity-driven color interpolation), filled with each shape's own fully-open (colorStops[3]) color via a plain react-native-svg Ellipse -- still a correct, readable, stage-appropriate body, just without motion. */
function StaticBodyShapes({
  shapes,
  contractionRegions,
  closureRegions,
  openingRegions,
  encodingSpreadActive,
  allowGreenOpening,
}: {
  shapes: ReturnType<typeof resolveSilhouetteShapesForView>;
  contractionRegions: readonly RegionSideKey[];
  closureRegions: readonly RegionSideKey[];
  openingRegions: readonly RegionSideKey[];
  encodingSpreadActive: boolean;
  allowGreenOpening: boolean;
}) {
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${BODY_SILHOUETTE_VIEWBOX_WIDTH} ${BODY_SILHOUETTE_VIEWBOX_HEIGHT}`} preserveAspectRatio="xMidYMid meet">
      <BodyOutlineBackdrop instanceKey="mantra-circle-static" />
      {shapes.map((shape) => {
        const { colorStops } = resolveBodyMantraShapeAppearance(shape.region, shape.side, { contractionRegions, closureRegions, openingRegions, encodingSpreadActive, allowGreenOpening });
        return <Ellipse key={`${shape.region}-${shape.side ?? "mid"}-${shape.view}-static`} cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} fill={colorStops[3]} />;
      })}
    </Svg>
  );
}

const styles = StyleSheet.create({
  pressable: { alignItems: "center", justifyContent: "center", paddingVertical: 12, width: "100%" },
  circle: {
    borderWidth: 2,
    overflow: "hidden",
    backgroundColor: "#ffffff",
  },
  presenceLayer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  // The one mathematically-safe box (see arc/arcBodyMantraCircleLogic.ts's
  // own CIRCLE_CONTENT_INSET_* + resolveCircleContentInsetIsSafe) that
  // body + mantra lay out inside, as plain flex-column siblings --
  // never overlapping, never reaching the circle's own curved edge.
  insetContent: { position: "absolute" },
  bodyLayer: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center" },
  staticPresenceDot: { opacity: 0.85 },
  mantraText: {
    textAlign: "center",
    fontSize: 15,
    lineHeight: 21,
    color: "#1a1a1a",
    paddingTop: 6,
  },
  // Requirement 5's "below the circle" layer -- a separate, plain flex
  // sibling of the Pressable above (never inside its touch surface),
  // one compact line per distinct selected movement set.
  instructionsBlock: {
    width: "100%",
    paddingTop: 10,
    paddingHorizontal: 16,
    gap: 4,
  },
  instructionText: {
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18,
    color: "#3a3a3a",
  },
});
