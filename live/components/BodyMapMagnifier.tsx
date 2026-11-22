/**
 * live/components/BodyMapMagnifier.tsx
 *
 * Interactive Body Map Magnifier task: adds a 🔍 magnifying-glass tool
 * to every interactive body map in ARCHI, so small/close-together
 * regions (eyes, ears, wrists, fingers, parts of the chest/abdomen) can
 * be aimed at precisely, "without this becoming a second, parallel body
 * map implementation" -- this component is a thin wrapper AROUND the
 * one existing live/components/BodySilhouetteMap.tsx, accepting the
 * EXACT same props (isSelected/onToggle/selectedColor/
 * resolveSelectedColorForRegion/selectableRegions/initialView) and
 * forwarding every one of them unchanged. The 7 real call sites in
 * live/NewArcLiveScreen.tsx (which together cover every ARC route --
 * Full/Shortened/Mini ARC, the short-depth "fine"/"so-so" tracks, ARC
 * Gym's own body-map screens, and every planned/spontaneous/saved
 * exercise, since all of them funnel through this one shared engine
 * screen) only ever need their import swapped from BodySilhouetteMap to
 * this component -- zero other change at any call site.
 *
 * The lens itself is a CROPPED SVG viewBox over the exact same shapes
 * (BodySilhouetteMap's own new, additive `viewBoxOverride`/`svgHeight`
 * props) -- never a second coordinate system, never a duplicated
 * rendering path, and never any change to the underlying (region, side)
 * selection data. react-native-svg resolves a tap inside a cropped
 * viewBox to the correct underlying Ellipse automatically, so "the
 * coordinate match between the magnified view and the original map is
 * accurate at every zoom level" holds by construction, not by any
 * screen-pixel math this component has to get right on its own --
 * arc/bodyMapMagnifierLogic.ts only ever has to compute WHICH crop
 * rectangle to show, always clamped inside the real canvas bounds.
 *
 * Section 4 ("critical requirement"): magnifier mode is local component
 * state (`active`/`center`/`zoom`), completely independent of the
 * caller's own selection state -- marking a region (onToggle, routed
 * through to the caller exactly as always) can never close or reset
 * the magnifier, so the trainee can mark any number of regions, pan,
 * and re-zoom in one continuous session. The ONLY thing that exits
 * magnifier mode is the explicit "סיום הגדלה" button.
 */

import { useRef, useState } from "react";
import type { GestureResponderEvent, PanResponderGestureState } from "react-native";
import { PanResponder, Pressable, StyleSheet, Text, View } from "react-native";

import type { BodyScanRegion } from "../../arc/bodyScanRegions.ts";
import type { BodyScanSide } from "../../arc/bodyScanSelection.ts";
import {
  clampMagnifierZoom,
  DEFAULT_MAGNIFIER_ZOOM,
  MAGNIFIER_RENDER_HEIGHT,
  MAGNIFIER_ZOOM_STEP,
  resolveDefaultMagnifierCenter,
  resolveMagnifierViewBox,
  resolvePannedMagnifierCenter,
} from "../../arc/bodyMapMagnifierLogic.ts";
import type { MagnifierCenter } from "../../arc/bodyMapMagnifierLogic.ts";
import BodySilhouetteMap from "./BodySilhouetteMap.tsx";
import type { BodySilhouetteMapProps } from "./BodySilhouetteMap.tsx";

/** A drag shorter than this (in screen pixels, either axis) is treated as a plain tap -- letting the underlying Ellipse's own onPress/onToggle fire normally, rather than the PanResponder claiming the gesture and swallowing the tap. Only a deliberate drag past this threshold starts panning. */
const DRAG_CLAIM_THRESHOLD = 6;

export default function BodyMapMagnifier(props: BodySilhouetteMapProps) {
  const [active, setActive] = useState(false);
  const [center, setCenter] = useState<MagnifierCenter>(() => resolveDefaultMagnifierCenter());
  const [zoom, setZoom] = useState(DEFAULT_MAGNIFIER_ZOOM);
  const [hasCenteredSinceActivation, setHasCenteredSinceActivation] = useState(false);
  const renderedLensSizeRef = useRef({ width: 0, height: MAGNIFIER_RENDER_HEIGHT });
  const gestureStartCenterRef = useRef<MagnifierCenter>(center);

  function openMagnifier() {
    setActive(true);
    setHasCenteredSinceActivation(false);
  }

  function closeMagnifier() {
    setActive(false);
  }

  function zoomIn() {
    setZoom((current) => clampMagnifierZoom(current + MAGNIFIER_ZOOM_STEP));
  }

  function zoomOut() {
    setZoom((current) => clampMagnifierZoom(current - MAGNIFIER_ZOOM_STEP));
  }

  /**
   * "The user will be able to press an area of the body to magnify it":
   * the first region tapped after opening the magnifier also becomes
   * its initial lens center (in addition to the ordinary onToggle the
   * tap already performs via BodySilhouetteMap) -- after that one
   * placement, further taps are pure marking, so repeatedly tapping
   * nearby regions to mark them never fights with where the lens is
   * centered. Dragging (below) is the deliberate way to move the lens
   * again afterward.
   */
  function handleRegionPress(_region: BodyScanRegion, _side: BodyScanSide, cx: number, cy: number) {
    if (hasCenteredSinceActivation) return;
    setCenter({ x: cx, y: cy });
    setHasCenteredSinceActivation(true);
  }

  const shouldClaimDrag = (_evt: GestureResponderEvent, gestureState: PanResponderGestureState) =>
    Math.abs(gestureState.dx) > DRAG_CLAIM_THRESHOLD || Math.abs(gestureState.dy) > DRAG_CLAIM_THRESHOLD;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: shouldClaimDrag,
      onMoveShouldSetPanResponderCapture: shouldClaimDrag,
      onPanResponderGrant: () => {
        gestureStartCenterRef.current = center;
      },
      onPanResponderMove: (_evt, gestureState) => {
        const { width, height } = renderedLensSizeRef.current;
        setCenter(resolvePannedMagnifierCenter(gestureStartCenterRef.current, gestureState.dx, gestureState.dy, zoom, width, height));
      },
    })
  ).current;

  if (!active) {
    return (
      <View>
        <BodySilhouetteMap {...props} />
        <Pressable style={styles.openButton} onPress={openMagnifier} accessibilityLabel="הפעלת זכוכית מגדלת">
          <Text style={styles.openButtonText}>🔍 זכוכית מגדלת</Text>
        </Pressable>
      </View>
    );
  }

  const viewBox = resolveMagnifierViewBox(center, zoom);

  return (
    <View>
      <View style={styles.controlsRow}>
        <View style={styles.zoomButtonsRow}>
          <Pressable style={styles.zoomButton} onPress={zoomOut} accessibilityLabel="הקטן זכוכית מגדלת">
            <Text style={styles.zoomButtonText}>−</Text>
          </Pressable>
          <Pressable style={styles.zoomButton} onPress={zoomIn} accessibilityLabel="הגדל זכוכית מגדלת">
            <Text style={styles.zoomButtonText}>+</Text>
          </Pressable>
        </View>
        <Pressable style={styles.finishButton} onPress={closeMagnifier} accessibilityLabel="סיום הגדלה">
          <Text style={styles.finishButtonText}>סיום הגדלה</Text>
        </Pressable>
      </View>
      <Text style={styles.dragHint}>גרור לניווט בין אזורי הגוף</Text>
      <View
        onLayout={(event) => {
          renderedLensSizeRef.current = { width: event.nativeEvent.layout.width, height: MAGNIFIER_RENDER_HEIGHT };
        }}
        {...panResponder.panHandlers}
      >
        <BodySilhouetteMap {...props} viewBoxOverride={viewBox} svgHeight={MAGNIFIER_RENDER_HEIGHT} onRegionPress={handleRegionPress} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  openButton: {
    marginTop: 10,
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0a7ea4",
    backgroundColor: "#E6F4FE",
  },
  openButtonText: { color: "#0a7ea4", fontSize: 14, fontWeight: "600" },
  controlsRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 6, gap: 10 },
  zoomButtonsRow: { flexDirection: "row-reverse", gap: 8 },
  zoomButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0a7ea4",
    backgroundColor: "#fff",
  },
  zoomButtonText: { color: "#0a7ea4", fontSize: 20, fontWeight: "700" },
  finishButton: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, backgroundColor: "#0a7ea4" },
  finishButtonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  dragHint: { fontSize: 12, textAlign: "right", color: "#777", marginBottom: 4 },
});
