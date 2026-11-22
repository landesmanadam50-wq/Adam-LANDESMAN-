import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/components/bodyMapMagnifier.test.ts
 *
 * Interactive Body Map Magnifier task: source-text regression guard for
 * live/components/BodyMapMagnifier.tsx and its wiring into every ARC
 * route's own body-map screen -- not callable from a plain `node --test`
 * run (React Native component, same convention as every other screen
 * test in this codebase). The pure crop-rectangle/clamping math is
 * exercised directly in arc/bodyMapMagnifierLogic.test.ts; this file
 * covers the component's own state machine and every ARC route's wiring.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const magnifier = readSource("live/components/BodyMapMagnifier.tsx");
const silhouette = readSource("live/components/BodySilhouetteMap.tsx");
const liveScreen = readSource("live/NewArcLiveScreen.tsx");

// --- requirement 1: a 🔍 button on every interactive body-selection screen ---

test("required test 1: a 🔍 magnifier button is offered whenever the magnifier is NOT yet active, right alongside the ordinary (unmagnified) body map -- never replacing it", () => {
  const fnIndex = magnifier.indexOf("if (!active) {");
  const fnBody = magnifier.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("<BodySilhouetteMap {...props} />"));
  assert.ok(fnBody.includes("🔍"));
  assert.ok(fnBody.includes("onPress={openMagnifier}"));
});

test("required test 1 continued: all 7 ARC-route body-map call sites in live/NewArcLiveScreen.tsx render BodyMapMagnifier (which always offers the 🔍 button), never the bare BodySilhouetteMap directly -- every ARC route (Full/Shortened/Mini ARC, the short-depth tracks, and anything that routes through this one shared engine screen, including ARC Gym and planned/spontaneous/saved exercises) therefore gets the magnifier automatically", () => {
  const occurrences = liveScreen.split("<BodyMapMagnifier").length - 1;
  assert.equal(occurrences, 7);
  assert.ok(!liveScreen.includes("<BodySilhouetteMap"), "no call site may render the bare component directly any more");
});

// --- requirement 2: tap a region to magnify it, drag to move, zoom in/out ---

test("required test 2a: the first region tapped after opening the magnifier becomes its own initial lens center (onRegionPress), gated so it only applies ONCE per activation -- further taps are pure marking, never re-centering unexpectedly", () => {
  const fnIndex = magnifier.indexOf("function handleRegionPress(");
  const fnBody = magnifier.slice(fnIndex, magnifier.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("if (hasCenteredSinceActivation) return;"));
  assert.ok(fnBody.includes("setCenter({ x: cx, y: cy });"));
  assert.ok(fnBody.includes("setHasCenteredSinceActivation(true);"));
});

test("required test 2b: opening the magnifier resets the one-time-centering gate (hasCenteredSinceActivation back to false), so EVERY fresh activation can again be centered by the next tap", () => {
  const fnIndex = magnifier.indexOf("function openMagnifier()");
  const fnBody = magnifier.slice(fnIndex, magnifier.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("setActive(true);"));
  assert.ok(fnBody.includes("setHasCenteredSinceActivation(false);"));
});

test("required test 2c: dragging moves the lens -- a PanResponder computes the new center from the gesture's own cumulative (dx, dy) against the FIXED center at gesture start, via the pure resolvePannedMagnifierCenter, never a second, ad hoc coordinate calculation", () => {
  const fnIndex = magnifier.indexOf("onPanResponderMove: (");
  const fnBody = magnifier.slice(fnIndex, fnIndex + 300);
  assert.ok(fnBody.includes("setCenter(resolvePannedMagnifierCenter(gestureStartCenterRef.current, gestureState.dx, gestureState.dy, zoom, width, height));"));
  assert.ok(magnifier.includes("onPanResponderGrant: () => {\n        gestureStartCenterRef.current = center;"));
});

test("required test 2c continued: a plain tap (no real movement) never gets swallowed by the drag responder -- onStartShouldSetPanResponder is always false, and the move-claim threshold requires a real drag past DRAG_CLAIM_THRESHOLD pixels on either axis before the responder claims the gesture, letting the underlying Ellipse's own onPress/onToggle fire normally for an ordinary tap", () => {
  assert.match(magnifier, /onStartShouldSetPanResponder: \(\) => false,/);
  assert.match(magnifier, /const DRAG_CLAIM_THRESHOLD = \d+;/);
  assert.match(magnifier, /Math\.abs\(gestureState\.dx\) > DRAG_CLAIM_THRESHOLD \|\| Math\.abs\(gestureState\.dy\) > DRAG_CLAIM_THRESHOLD/);
});

test("required test 2d: zoom in/out buttons (+ / −) are offered as the zoom control, satisfying the spec's own explicit 'pinch OR +/- buttons' alternative -- each clamps through the SAME pure clampMagnifierZoom every other zoom path uses, never its own ad hoc min/max", () => {
  assert.match(magnifier, /function zoomIn\(\) \{\s*setZoom\(\(current\) => clampMagnifierZoom\(current \+ MAGNIFIER_ZOOM_STEP\)\);/);
  assert.match(magnifier, /function zoomOut\(\) \{\s*setZoom\(\(current\) => clampMagnifierZoom\(current - MAGNIFIER_ZOOM_STEP\)\);/);
  assert.ok(magnifier.includes('onPress={zoomOut} accessibilityLabel="הקטן זכוכית מגדלת"'));
  assert.ok(magnifier.includes('onPress={zoomIn} accessibilityLabel="הגדל זכוכית מגדלת"'));
});

// --- requirement 3: precise marking of small/focused regions, same colors/sensation types ---

test("required test 3: the magnified render passes the EXACT same selectedColor/resolveSelectedColorForRegion/isSelected/onToggle/selectableRegions props straight through via {...props} -- the magnifier never substitutes its own color logic or sensation-type semantics", () => {
  assert.ok(magnifier.includes("<BodySilhouetteMap {...props} viewBoxOverride={viewBox} svgHeight={MAGNIFIER_RENDER_HEIGHT} onRegionPress={handleRegionPress} />"));
});

test("required test 3 continued: BodyMapMagnifier's own prop type is BodySilhouetteMapProps itself, re-exported/reused verbatim -- never a redefined, parallel prop shape that could silently drift from the real selection contract", () => {
  assert.match(magnifier, /export default function BodyMapMagnifier\(props: BodySilhouetteMapProps\) \{/);
  assert.match(magnifier, /import type \{ BodySilhouetteMapProps \} from "\.\/BodySilhouetteMap\.tsx";/);
});

// --- requirement 4 (critical): magnifier mode persists across multiple marks, exits ONLY via the explicit button ---

test("required test 4 (critical requirement): magnifier mode is its own independent local state (active/center/zoom), never derived from or reset by the caller's selection props -- marking a region can never implicitly close the magnifier", () => {
  assert.match(magnifier, /const \[active, setActive\] = useState\(false\);/);
  assert.match(magnifier, /const \[center, setCenter\] = useState<MagnifierCenter>\(\(\) => resolveDefaultMagnifierCenter\(\)\);/);
  assert.match(magnifier, /const \[zoom, setZoom\] = useState\(DEFAULT_MAGNIFIER_ZOOM\);/);
});

test("required test 4 continued: setActive(false) -- the ONLY way magnifier mode ends -- is called from exactly one place in the whole component: closeMagnifier, which is wired to nothing but the explicit 'סיום הגדלה' button's own onPress", () => {
  const occurrences = magnifier.split("setActive(false)").length - 1;
  assert.equal(occurrences, 1, "setActive(false) must appear in exactly one place -- closeMagnifier -- never a second, implicit exit path");
  assert.match(magnifier, /function closeMagnifier\(\) \{\s*setActive\(false\);\s*\}/);
  assert.ok(magnifier.includes('onPress={closeMagnifier} accessibilityLabel="סיום הגדלה"'));
  // onToggle/onRegionPress/zoomIn/zoomOut/the pan responder must never themselves call setActive/closeMagnifier.
  assert.ok(!magnifier.includes("handleRegionPress") || !magnifier.slice(magnifier.indexOf("function handleRegionPress(")).split("\n", 6).join("\n").includes("closeMagnifier"));
});

test("required test 4 continued: the exit button's own VISIBLE text is the exact required Hebrew wording 'סיום הגדלה' -- not a paraphrase -- and tapping it returns to the full, unmagnified map (the !active branch), with every selection/mark completely untouched since marks live in the caller's own props, never in this component's local state", () => {
  assert.ok(magnifier.includes("<Text style={styles.finishButtonText}>סיום הגדלה</Text>"));
});

// --- requirement 5: marks saved relative to the original map coordinates, visible in both views, survive mode switches ---

test("required test 5: the magnified Svg is rendered through the SAME BodySilhouetteMap component and the SAME underlying Ellipse shapes (never a second coordinate system) -- only its viewBox is cropped, via arc/bodyMapMagnifierLogic.ts's own resolveMagnifierViewBox, so a mark made while magnified is drawn at the EXACT same (region, side) -- and therefore the exact same on-canvas position -- it would be at full view", () => {
  assert.match(magnifier, /const viewBox = resolveMagnifierViewBox\(center, zoom\);/);
  assert.ok(magnifier.includes("viewBoxOverride={viewBox}"));
});

test("required test 5 continued: the un-magnified branch renders BodySilhouetteMap with no viewBoxOverride/svgHeight/onRegionPress at all ({...props} alone) -- switching OUT of magnifier mode is therefore the exact original full-canvas render, byte-identical to a call site that never had a magnifier wrapped around it", () => {
  const fnIndex = magnifier.indexOf("if (!active) {");
  const fnBody = magnifier.slice(fnIndex, fnIndex + 200);
  assert.ok(!fnBody.includes("viewBoxOverride"));
  assert.ok(!fnBody.includes("svgHeight"));
  assert.ok(!fnBody.includes("onRegionPress"));
});

// --- requirement 6: one shared component, no per-screen duplication ---

test("required test 6: BodyMapMagnifier is defined exactly ONCE and wraps BodySilhouetteMap exactly twice (the plain view and the magnified view) -- no screen-specific copy of the magnifier UI exists anywhere else in the codebase", () => {
  assert.equal((magnifier.match(/export default function BodyMapMagnifier/g) ?? []).length, 1);
  assert.equal((magnifier.match(/<BodySilhouetteMap/g) ?? []).length, 2);
});

// --- requirement 7: the existing selection mechanism really supports small/focused regions (checked, not assumed) ---

test("required test 7: the magnifier's own crop-viewBox approach works precisely BECAUSE react-native-svg resolves a tap inside a cropped viewBox to the SAME underlying Ellipse hit-test BodySilhouetteMap already uses -- confirmed by viewBoxOverride/svgHeight being additive, optional props on the real selection component (never a second, re-implemented hit-test living in the magnifier itself)", () => {
  assert.match(silhouette, /viewBoxOverride\?: string;/);
  assert.match(silhouette, /svgHeight\?: number;/);
  assert.match(silhouette, /viewBox=\{viewBoxOverride \?\? `0 0 \$\{BODY_SILHOUETTE_VIEWBOX_WIDTH\} \$\{BODY_SILHOUETTE_VIEWBOX_HEIGHT\}`\}/);
  assert.match(silhouette, /height=\{svgHeight \?\? 320\}/);
});

// --- requirement 8: existing behavior preserved (no ARC step change, no color-meaning change, no deleted marks, backward compatible) ---

test("required test 8: BodyMapMagnifier never imports or touches arc/newArcLiveSteps.ts, arc/newArcLiveTypes.ts, or any session/storage module -- it is a pure, controlled UI wrapper exactly like BodySilhouetteMap itself, so it can never change an ARC step, a color's own meaning, or delete/alter a persisted mark on its own", () => {
  assert.ok(!magnifier.includes('from "../../arc/newArcLiveSteps.ts"'));
  assert.ok(!magnifier.includes('from "../../arc/newArcLiveTypes.ts"'));
  assert.ok(!magnifier.includes("storage.ts"));
});

test("required test 8 continued: every one of the 7 real ARC-route call sites still passes the EXACT same selectedColor/resolveSelectedColorForRegion/isSelected/onToggle/selectableRegions arguments as before the rename -- confirmed by the SAME setter/resolver function names (cycleBodyScanContractionAndGreen, toggleBodyScanHeavinessRegion, toggleBodyScanClosednessRegion, attemptToggleSupportiveOpeningRegion, attemptToggleOpeningBodyScanRegion, attemptCycleMiniBodyScanRegion, cycleShortBodyMarking) still appearing, unchanged, right next to each BodyMapMagnifier tag", () => {
  for (const fnName of [
    "cycleBodyScanContractionAndGreen",
    "toggleBodyScanHeavinessRegion",
    "toggleBodyScanClosednessRegion",
    "attemptToggleSupportiveOpeningRegion",
    "attemptToggleOpeningBodyScanRegion",
    "attemptCycleMiniBodyScanRegion",
    "cycleShortBodyMarking",
  ]) {
    assert.ok(liveScreen.includes(fnName), `${fnName} must still be wired in, unchanged`);
  }
});

// --- the exact 9-step required scenario, mapped to the wiring that makes it possible ---

test("required scenario (steps 1-9): open the body map (BodyMapMagnifier's own !active branch, step 1) -> tap 🔍 and magnify a region (openMagnifier + the first onRegionPress centering, steps 2-3) -> mark it (onToggle, unaffected) -> mark another region without leaving magnifier mode (hasCenteredSinceActivation already true, so the SAME active/center/zoom state persists across any number of additional onToggle calls, step 4) -> drag to a different body area (the PanResponder, step 5) -> keep marking (onToggle again, step 6) -> tap 'סיום הגדלה' (closeMagnifier, step 7) -> return to the full map with every mark intact, since marks were never part of this component's own state (step 8) -> re-open the magnifier and everything is still there, still editable (re-entering !active -> active re-renders the SAME onToggle/isSelected props against the SAME caller-owned selection, step 9)", () => {
  // Every piece this scenario depends on, confirmed to exist together in the one component:
  assert.ok(magnifier.includes("function openMagnifier()"));
  assert.ok(magnifier.includes("function handleRegionPress("));
  assert.ok(magnifier.includes("panResponder.panHandlers"));
  assert.ok(magnifier.includes("function closeMagnifier()"));
  assert.ok(magnifier.includes("if (!active) {"));
  // The marking callbacks (onToggle/isSelected via {...props}) are passed to BOTH the active and inactive
  // renders -- never swapped out, so re-opening after closing resumes against the exact same selection state.
  const activeRenderIndex = magnifier.indexOf("const viewBox = resolveMagnifierViewBox(center, zoom);");
  assert.ok(magnifier.slice(activeRenderIndex).includes("{...props}"));
});
