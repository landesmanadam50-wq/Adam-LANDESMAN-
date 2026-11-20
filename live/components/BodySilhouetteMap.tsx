/**
 * live/components/BodySilhouetteMap.tsx
 *
 * Unified ARC Architecture and Interactive Animation Update, Phase 1
 * ("Interactive Segmented Body"): the real, SVG-based front/back body
 * diagram -- "I want the actual interactive human body visualization...
 * not an enhanced text-chip layout." Reads/writes nothing itself; it is
 * a pure, controlled presentation component over whatever
 * (region, side) selection state the caller already owns (the exact
 * same existing session fields -- bodyScanContractionRegions/
 * bodyScanHeavinessRegions/etc. -- and the exact same existing setter
 * functions in arc/newArcLiveSteps.ts), so swapping the old chip-grid
 * rendering for this component changes NOTHING about the ARC engine,
 * session data, or persistence.
 *
 * Every region/side drawn here is one of arc/bodyScanRegions.ts's own
 * 26 identifiers, positioned by arc/bodySilhouetteLayout.ts -- this
 * component never invents a region or a label of its own.
 *
 * Final ARC Body Redesign & Flow Fixes task, requirement 2 (the visual
 * redesign): every region ID, position, selection prop, and toggle
 * callback below is UNCHANGED from the original version of this file
 * -- only the drawing itself changed:
 * - BodyOutlineBackdrop now renders ONE continuous, smooth,
 *   gender-neutral body figure behind every region shape, so the body
 *   reads as one connected whole, never a scatter of disconnected
 *   ellipses.
 * - An UNSELECTED, selectable region is now a near-invisible "ghost"
 *   (a faint light-blue outline only, almost no fill) rather than a
 *   solidly-filled circle of its own -- it blends into the smooth
 *   backdrop at rest, and only pops into its own distinct color once
 *   actually selected, exactly matching "Contraction: red / Closure:
 *   dark blue / Opening-support: light blue."
 * - Each selectable region now renders TWO overlapping ellipses: an
 *   invisible, ENLARGED one (`HIT_TARGET_MIN_RADIUS`) that owns the
 *   actual `onPress` ("large, accurate touch targets" -- the small
 *   regions in particular, eyes/ears/wrists/ankles/etc., are otherwise
 *   genuinely hard to tap precisely), and the ordinary, exactly-sized
 *   one on top that owns the VISIBLE color -- so enlarging a touch
 *   target never visually enlarges or misaligns the region itself.
 */

import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Ellipse } from "react-native-svg";

import { BODY_SCAN_REGION_GROUP_DEFS, BODY_SCAN_REGION_LABELS, isBodyScanRegionPaired } from "../../arc/bodyScanRegions.ts";
import type { BodyScanRegion } from "../../arc/bodyScanRegions.ts";
import type { BodyScanSide } from "../../arc/bodyScanSelection.ts";
import {
  BODY_SCAN_REGION_SHAPES,
  BODY_SILHOUETTE_VIEWBOX_HEIGHT,
  BODY_SILHOUETTE_VIEWBOX_WIDTH,
  resolveRegionViews,
  resolveSilhouetteShapesForView,
} from "../../arc/bodySilhouetteLayout.ts";
import type { BodySilhouetteView } from "../../arc/bodySilhouetteLayout.ts";
import BodyOutlineBackdrop from "./BodyOutlineBackdrop.tsx";

/** One allow-listed (region, side) pair -- see `selectableRegions` below. */
export interface BodySilhouetteRegionKey {
  region: BodyScanRegion;
  side: BodyScanSide;
}

export interface BodySilhouetteMapProps {
  /** Whether this exact (region, side) is currently selected -- the caller's own session field, read-only from this component's point of view. */
  isSelected: (region: BodyScanRegion, side: BodyScanSide) => boolean;
  /** Tapping a selectable shape -- the caller's own existing toggle/setter, called with the exact same (region, side) a chip would have. */
  onToggle: (region: BodyScanRegion, side: BodyScanSide) => void;
  /**
   * The fill color for a SELECTED shape -- the spec's own color
   * semantics ("Red: contraction/unpleasant tension", "Dark Blue:
   * heaviness/closedness", "Bright Blue/user-selected color: personal
   * supportive anchor") are the CALLER's decision, never hardcoded
   * here, so the same component serves every one of those screens.
   */
  selectedColor: string;
  /**
   * ARCHI -- Update ARC Body Sensation Selection: Green and Blue Logic
   * task: an OPTIONAL per-region override, consulted only for a
   * SELECTED region (never for an unselected or non-selectable one) --
   * returning a color switches that one region to it instead of the
   * plain `selectedColor` above; returning null/undefined falls back
   * to `selectedColor`. This is what lets body_scan_opening_region (and
   * the shortened-mode interactive body screen, which writes into the
   * exact same field) show genuinely distinct green ("opening") vs
   * blue ("opening_and_supportive") fills from the SAME component,
   * never a second, parallel body-map implementation. Omitted (the
   * default) preserves the exact existing single-color behavior for
   * every other screen (contraction/heaviness/closedness), unchanged.
   */
  resolveSelectedColorForRegion?: (region: BodyScanRegion, side: BodyScanSide) => string | null;
  /**
   * Restricts which (region, side) pairs can be tapped at all -- used
   * by body_scan_opening_region, which may only offer the regions
   * already identified as heavy/closed, "never inventing a positive
   * region." Omitted (the default) means every drawn region is
   * selectable, the ordinary case for the three identification
   * screens.
   */
  selectableRegions?: readonly BodySilhouetteRegionKey[];
  initialView?: BodySilhouetteView;
}

function resolveRegionLabel(region: BodyScanRegion, side: BodyScanSide): string {
  const base = BODY_SCAN_REGION_LABELS[region];
  if (side === "left") return `${base} (שמאל)`;
  if (side === "right") return `${base} (ימין)`;
  return base;
}

function isRegionKeyEqual(a: BodySilhouetteRegionKey, b: { region: BodyScanRegion; side: BodyScanSide }): boolean {
  return a.region === b.region && a.side === b.side;
}

/** Unselected, selectable region -- a near-invisible "ghost" outline only, so it blends into BodyOutlineBackdrop's own smooth figure at rest and only pops into view once actually selected. */
const NEUTRAL_FILL = "#E6F4FE";
const NEUTRAL_STROKE = "#0a7ea4";
const NEUTRAL_FILL_OPACITY = 0.12;
const NEUTRAL_STROKE_OPACITY = 0.55;
/** A drawn-but-not-selectable region (outside selectableRegions) -- even fainter than an ordinary unselected region, since it can never be tapped at all. */
const DISABLED_FILL = "#F2F2F2";
const DISABLED_STROKE = "#D8D8D8";
const DISABLED_FILL_OPACITY = 0.1;
const DISABLED_STROKE_OPACITY = 0.3;
/** Final ARC Body Redesign & Flow Fixes task, requirement 2 ("large, accurate touch targets"): the smallest regions (eyes/ears/wrists/ankles/etc.) get an invisible, enlarged hit-test ellipse at least this radius, laid UNDER the ordinary, exactly-sized visible one -- the visible region itself never changes size or position. */
const HIT_TARGET_MIN_RADIUS = 13;

export default function BodySilhouetteMap({
  isSelected,
  onToggle,
  selectedColor,
  resolveSelectedColorForRegion,
  selectableRegions,
  initialView = "front",
}: BodySilhouetteMapProps) {
  const [view, setView] = useState<BodySilhouetteView>(initialView);

  // This component has no continuous animation of its own (the
  // front/back view toggle is a plain, instant state swap, never an
  // animated transition) -- so, unlike live/components/PresenceAnimation.tsx,
  // there is nothing here for the reduced-motion accessibility setting
  // to disable.

  const isSelectable = (region: BodyScanRegion, side: BodyScanSide): boolean => {
    if (!selectableRegions) return true;
    return selectableRegions.some((key) => isRegionKeyEqual(key, { region, side }));
  };

  const shapes = resolveSilhouetteShapesForView(view);
  const selectedLabels = shapes.filter((shape) => isSelected(shape.region, shape.side)).map((shape) => resolveRegionLabel(shape.region, shape.side));

  return (
    <View>
      <View style={styles.viewToggleRow}>
        <Pressable style={[styles.viewToggleButton, view === "front" && styles.viewToggleButtonActive]} onPress={() => setView("front")}>
          <Text style={[styles.viewToggleText, view === "front" && styles.viewToggleTextActive]}>קדמי</Text>
        </Pressable>
        <Pressable style={[styles.viewToggleButton, view === "back" && styles.viewToggleButtonActive]} onPress={() => setView("back")}>
          <Text style={[styles.viewToggleText, view === "back" && styles.viewToggleTextActive]}>גב</Text>
        </Pressable>
      </View>

      <View style={styles.svgWrapper}>
        <Svg
          width="100%"
          height={320}
          viewBox={`0 0 ${BODY_SILHOUETTE_VIEWBOX_WIDTH} ${BODY_SILHOUETTE_VIEWBOX_HEIGHT}`}
          accessibilityLabel={view === "front" ? "מפת גוף, מבט קדמי" : "מפת גוף, מבט אחורי"}
        >
          <BodyOutlineBackdrop instanceKey={view} />
          {shapes.map((shape) => {
            const key = `${shape.region}-${shape.side ?? "mid"}-${shape.view}`;
            const selectable = isSelectable(shape.region, shape.side);
            const selected = selectable && isSelected(shape.region, shape.side);
            const ownColor = selected ? resolveSelectedColorForRegion?.(shape.region, shape.side) ?? selectedColor : null;
            const fill = selected ? ownColor! : selectable ? NEUTRAL_FILL : DISABLED_FILL;
            const stroke = selected ? ownColor! : selectable ? NEUTRAL_STROKE : DISABLED_STROKE;
            const fillOpacity = selected ? 0.85 : selectable ? NEUTRAL_FILL_OPACITY : DISABLED_FILL_OPACITY;
            const strokeOpacity = selected ? 1 : selectable ? NEUTRAL_STROKE_OPACITY : DISABLED_STROKE_OPACITY;
            return (
              <Ellipse
                key={key}
                cx={shape.cx}
                cy={shape.cy}
                rx={shape.rx}
                ry={shape.ry}
                fill={fill}
                fillOpacity={fillOpacity}
                stroke={stroke}
                strokeOpacity={strokeOpacity}
                strokeWidth={selected ? 2 : 1}
                onPress={selectable ? () => onToggle(shape.region, shape.side) : undefined}
                accessible
                accessibilityLabel={resolveRegionLabel(shape.region, shape.side)}
              />
            );
          })}
          {/* Final ARC Body Redesign & Flow Fixes task, requirement 2 ("large, accurate touch targets"): a SECOND, invisible, enlarged hit-test layer, drawn LAST (on top, for touch priority) -- it owns the actual onPress for every selectable region, but never any fill/stroke of its own, so it can never visually change a region's size, shape, or alignment with the figure beneath it. */}
          {shapes.map((shape) => {
            if (!isSelectable(shape.region, shape.side)) return null;
            const hitRx = Math.max(shape.rx, HIT_TARGET_MIN_RADIUS);
            const hitRy = Math.max(shape.ry, HIT_TARGET_MIN_RADIUS);
            if (hitRx === shape.rx && hitRy === shape.ry) return null;
            return (
              <Ellipse
                key={`hit-${shape.region}-${shape.side ?? "mid"}-${shape.view}`}
                cx={shape.cx}
                cy={shape.cy}
                rx={hitRx}
                ry={hitRy}
                fill="transparent"
                onPress={() => onToggle(shape.region, shape.side)}
                accessible={false}
              />
            );
          })}
        </Svg>
      </View>

      <Text style={styles.selectedSummary}>{selectedLabels.length > 0 ? `נבחרו: ${selectedLabels.join(", ")}` : "לא נבחרו אזורים"}</Text>
    </View>
  );
}

/** Resolves every (region, side) pair the given region is drawn with, across every view -- a small helper for callers building a `selectableRegions` allow-list from a plain BodyScanRegion/side list (e.g. body_scan_opening_region's own already-identified heavy/closed regions), so they never have to know this component's own internal shape representation. */
export function toSilhouetteRegionKeys(entries: readonly { region: BodyScanRegion; side: BodyScanSide }[]): BodySilhouetteRegionKey[] {
  return entries.map((entry) => ({ region: entry.region, side: entry.side }));
}

/** Re-exported for callers that want to offer a view-aware hint (e.g. "this region is only visible from the back") -- never duplicated ad hoc. */
export { resolveRegionViews };
export { BODY_SCAN_REGION_GROUP_DEFS, isBodyScanRegionPaired };

const styles = StyleSheet.create({
  viewToggleRow: { flexDirection: "row-reverse", justifyContent: "center", gap: 10, marginBottom: 10 },
  viewToggleButton: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 8, borderWidth: 1, borderColor: "#0a7ea4" },
  viewToggleButtonActive: { backgroundColor: "#0a7ea4" },
  viewToggleText: { color: "#0a7ea4", fontSize: 14, fontWeight: "600" },
  viewToggleTextActive: { color: "#fff" },
  svgWrapper: { alignItems: "center", marginVertical: 8 },
  selectedSummary: { fontSize: 13, textAlign: "right", color: "#555", marginTop: 8 },
});
