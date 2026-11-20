import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/components/arcBodyMantraCircle.test.ts
 *
 * Final ARC Flow & Body Animation task, requirement 7 (test coverage),
 * extended by the Circle Centering and Touch Behavior task:
 * ArcBodyMantraCircle/ArticulatedBodyShape render real Reanimated/SVG
 * components. This environment cannot render them: `react-native`
 * itself (Flow syntax) and `react-native-reanimated` (resolves against
 * Metro's own module graph, including `react-native-worklets`) both
 * fail to even `require()` under plain Node outside of Metro/Jest --
 * confirmed directly: `node -e "require('react-native')"` throws
 * ("Unexpected token 'typeof'"), and this project has no Jest, no
 * react-test-renderer, and no react-native preset installed. Every
 * other component test in this codebase (live/newArcLiveScreen.test.ts,
 * live/dwellingStage.test.ts) is therefore source-text based too, for
 * the same reason -- this file follows that same, only-available
 * convention. Every genuinely PURE piece of logic (stage intensities,
 * the color/movement priority rule, the view picker, the clamped
 * circle-size math, the inscribed-safe-box geometry) is instead
 * covered directly, by actually calling it with real numbers, in
 * arc/arcBodyMantraCircleLogic.test.ts -- that is where the actual
 * "behavioral" verification for centering/expansion lives. Real
 * on-device verification of the rendered result (pixel-level
 * centering, actual touch dispatch) still requires a physical device
 * or emulator pass -- see the final report for exactly what that
 * covers that this file structurally cannot.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const circleSource = readSource("live/components/ArcBodyMantraCircle.tsx");
const shapeSource = readSource("live/components/ArticulatedBodyShape.tsx");
const silhouetteSource = readSource("live/components/BodySilhouetteMap.tsx");
const screenSource = readSource("live/NewArcLiveScreen.tsx");

// --- requirement 4: exactly ONE circular outline, never multiple rings ---

test("ArcBodyMantraCircle renders exactly ONE circular outline View (styles.circle) -- never a second, nested ring of its own", () => {
  const circleStyleUsages = circleSource.match(/styles\.circle\b/g) ?? [];
  assert.equal(circleStyleUsages.length, 1, "styles.circle (the one circular outline) must be applied exactly once in the whole component");
  // The only OTHER ring-shaped thing on screen is PresenceAnimation's own internal ring, a single shared, pre-existing component -- never a second circle this component draws itself.
  assert.ok(!circleSource.includes("borderRadius: circleSize"), "no SECOND place computing its own circular borderRadius may exist outside the one circleStyle");
});

test("PresenceAnimation is always rendered inside the circle, in 'subtle' mode, using the trainee's own chosen presenceColor -- continuous Presence across every stage", () => {
  assert.match(circleSource, /<PresenceAnimation color=\{presenceColor\} mode="subtle"/);
});

// --- requirement 1 (Circle Centering and Touch Behavior task): real screen-aware sizing, never a hardcoded guess ---

test("the circle's own size is measured against the REAL available space -- onLayout for width, useWindowDimensions for height -- never a hardcoded pixel/dp constant used as a stand-in for 'the screen'", () => {
  assert.match(circleSource, /onLayout=\{handleLayout\}/);
  assert.match(circleSource, /useWindowDimensions\(\)/);
  assert.match(circleSource, /const circleSize = resolveClampedCircleSize\(BASE_CIRCLE_SIZE, stage, availableWidth, window\.height\);/);
  // Must not hardcode a specific device width/height anywhere as a layout decision.
  assert.ok(!circleSource.match(/\b(320|360|375|393|412|414|428)\b/), "must never hardcode a specific device width as a layout assumption");
});

test("the circle's growth/clamping math itself is never re-derived inline -- it comes from arc/arcBodyMantraCircleLogic.ts's own resolveClampedCircleSize, which is independently proven (in that module's own test file) to never exceed the measured available space", () => {
  assert.match(circleSource, /import \{[\s\S]{0,400}resolveClampedCircleSize[\s\S]{0,400}\} from "\.\.\/\.\.\/arc\/arcBodyMantraCircleLogic\.ts";/);
  assert.ok(!circleSource.includes("Math.min(BASE_CIRCLE_SIZE"), "no second, ad hoc clamp may exist alongside the shared one");
});

// --- requirement 1: body + mantra stay inside the circle, never clipped, never overlapping ---

test("body + mantra are laid out inside ONE inset box whose fractions come from arc/arcBodyMantraCircleLogic.ts's own CIRCLE_CONTENT_INSET_* constants -- the same ones that module's own resolveCircleContentInsetIsSafe proves keep the box fully inside the circle's circular mask", () => {
  assert.match(circleSource, /top: `\$\{CIRCLE_CONTENT_INSET_TOP \* 100\}%`/);
  assert.match(circleSource, /bottom: `\$\{CIRCLE_CONTENT_INSET_BOTTOM \* 100\}%`/);
  assert.match(circleSource, /left: `\$\{CIRCLE_CONTENT_INSET_LEFT \* 100\}%`/);
  assert.match(circleSource, /right: `\$\{CIRCLE_CONTENT_INSET_RIGHT \* 100\}%`/);
});

test("inside that one safe box, the body is flex:1 and the mantra text is auto-height, as plain flex-column siblings -- flexbox's own non-overlap guarantee for normal-flow siblings, never absolute-positioned guesswork that could overlap for a long mantra", () => {
  const insetContentIndex = circleSource.indexOf("styles.insetContent");
  const bodyLayerIndex = circleSource.indexOf("<View style={styles.bodyLayer}>", insetContentIndex);
  const mantraTextIndex = circleSource.indexOf("<Text style={styles.mantraText}>", insetContentIndex);
  assert.ok(insetContentIndex >= 0 && bodyLayerIndex > insetContentIndex, "bodyLayer must be inside the one insetContent box");
  // AnimationErrorBoundary wraps the animated body (requirement 5's safe static fallback) but the mantra Text remains a
  // plain, ordinary flex-column sibling of bodyLayer, immediately after it -- never nested inside it, never reordered.
  assert.ok(mantraTextIndex > bodyLayerIndex, "the mantra text must come AFTER bodyLayer as a sibling, never nested inside it");
  assert.match(circleSource, /bodyLayer: \{ flex: 1,/, "the body region must be flex: 1 -- it yields space to the mantra text, never the reverse");
  assert.ok(!circleSource.includes('top: "6%"') && !circleSource.includes("circleSize * 0.62") && !circleSource.includes("circleSize * 0.82"), "the old magic-percentage body sizing (which left no proven-safe margin) must be gone");
});

test("the body SVG uses preserveAspectRatio to auto-fit its own flex box, rather than hand-tuned pixel multipliers of circleSize -- it can never overflow the box it's given, by SVG's own contract", () => {
  assert.match(circleSource, /width="100%"\s*\n\s*height="100%"\s*\n\s*viewBox=\{`0 0 \$\{BODY_SILHOUETTE_VIEWBOX_WIDTH\} \$\{BODY_SILHOUETTE_VIEWBOX_HEIGHT\}`\}\s*\n\s*preserveAspectRatio="xMidYMid meet"/);
});

// --- requirement 2 (reduced motion) ---

test("reduced motion jumps the intensity SharedValue directly to the correct per-stage value -- no animated transition, but still the accurate, correct stage frame", () => {
  const effectIndex = circleSource.indexOf("useEffect(() => {");
  const effectBody = circleSource.slice(effectIndex, effectIndex + 500);
  assert.match(effectBody, /if \(reduceMotionEnabled\) \{/);
  assert.match(effectBody, /intensity\.value = targetIntensity;/);
});

test("ArcBodyMantraCircle imports every stage-intensity/color/view-picker decision from arc/arcBodyMantraCircleLogic.ts -- never re-deriving any of that logic inline in the component itself", () => {
  assert.match(circleSource, /from "\.\.\/\.\.\/arc\/arcBodyMantraCircleLogic\.ts"/);
  assert.ok(!circleSource.includes("function resolveBodyMantraShapeAppearance"), "the color/movement priority logic must live only in the pure logic module");
  assert.ok(!circleSource.includes("function resolveBetterSilhouetteView"), "the view-picker logic must live only in the pure logic module");
});

// --- requirement 2 (Touch Behavior task): mantra mode -- tap anywhere advances, the body never intercepts ---

test("tapping the circle (the one outer Pressable) calls handleAdvance -- the circle itself IS the continue action, and it is the ONLY Pressable/onPress anywhere in this component", () => {
  assert.match(circleSource, /<Pressable\s*\n\s*onPress=\{handleAdvance\}/);
  const pressableCount = (circleSource.match(/<Pressable\b/g) ?? []).length;
  assert.equal(pressableCount, 1, "exactly one Pressable must exist -- no competing touch target inside the circle");
  const onPressCount = (circleSource.match(/\bonPress=/g) ?? []).length;
  assert.equal(onPressCount, 1, "exactly one onPress handler must exist in the whole component");
});

test("every layer drawn inside the circle (Presence ring, the inset body+mantra box) is pointerEvents=\"none\" -- a tap landing directly on the animated body passes straight through to the one outer Pressable, never intercepted", () => {
  const presenceLayerIndex = circleSource.indexOf("styles.presenceLayer");
  const presenceLayerTag = circleSource.slice(circleSource.lastIndexOf("<View", presenceLayerIndex), presenceLayerIndex + 80);
  assert.match(presenceLayerTag, /pointerEvents="none"/);

  const insetContentIndex = circleSource.indexOf("styles.insetContent");
  const insetContentTagEnd = circleSource.indexOf(">", circleSource.indexOf("pointerEvents=\"none\"", insetContentIndex));
  const insetContentOpenTag = circleSource.slice(circleSource.lastIndexOf("<View", insetContentIndex), insetContentTagEnd);
  assert.match(insetContentOpenTag, /pointerEvents="none"/, "the box containing the body AND the mantra text must itself be pointerEvents=\"none\" -- touches on either pass through to the outer Pressable");
});

test("ArticulatedBodyShape (the animated body shape itself) never takes an onPress of its own -- double insurance, on top of the parent's pointerEvents=\"none\", against the body ever intercepting a tap", () => {
  assert.ok(!shapeSource.includes("onPress"), "ArticulatedBodyShape must have no onPress prop or handler at all");
});

test("ArcBodyMantraCircle has no onToggle/isSelected/selection props or logic of any kind -- it is a display-only, tap-to-advance component, structurally incapable of also behaving like a selection screen", () => {
  assert.ok(!circleSource.includes("onToggle") && !circleSource.includes("isSelected"), "no selection API may exist on this component");
});

// --- requirement 2: prevention of double navigation ---

test("a useRef guard ensures handleAdvance calls onAdvance AT MOST ONCE per stage -- a second tap before the parent re-renders with the next stage is silently ignored, not queued or compounded", () => {
  assert.match(circleSource, /const hasAdvancedRef = useRef\(false\);/);
  const guardFnIndex = circleSource.indexOf("function handleAdvance()");
  const guardFnBody = circleSource.slice(guardFnIndex, guardFnIndex + 200);
  assert.match(guardFnBody, /if \(hasAdvancedRef\.current\) return;/);
  assert.match(guardFnBody, /hasAdvancedRef\.current = true;/);
  assert.match(guardFnBody, /onAdvance\(\);/);
  // The guard must re-arm specifically when the stage changes -- never permanently stuck after the first tap of the whole session.
  assert.match(circleSource, /useEffect\(\(\) => \{\s*\n\s*hasAdvancedRef\.current = false;\s*\n\s*\}, \[stage\]\);/);
});

// --- requirement 2: selection mode (BodySilhouetteMap) has no competing "advance" touch target, structurally ---

test("BodySilhouetteMap (the SELECTION-mode body map) has no onAdvance/advance concept at all, and wraps its Svg in a plain View, never a Pressable -- a region tap can only ever toggle that one region, never advance a stage", () => {
  assert.ok(!silhouetteSource.includes("onAdvance") && !silhouetteSource.includes("advance("), "BodySilhouetteMap must have no notion of advancing a stage");
  const svgWrapperIndex = silhouetteSource.indexOf("<View style={styles.svgWrapper}>");
  assert.ok(svgWrapperIndex !== -1);
  const svgWrapperBlock = silhouetteSource.slice(svgWrapperIndex, silhouetteSource.indexOf("</View>", svgWrapperIndex));
  assert.ok(!svgWrapperBlock.includes("<Pressable"), "the Svg itself must not be wrapped in an outer Pressable that could compete with the per-region Ellipse onPress handlers");
});

test("NewArcLiveScreen.tsx never renders ArcBodyMantraCircle (tap-to-advance) and BodySilhouetteMap (tap-to-select) for the same step -- the two touch modes are structurally mutually exclusive, never overlapping in one render tree", () => {
  const mantraStageCases = ['case "dwelling":', 'case "acceptance":', 'case "regulation":', 'case "encoding":'];
  const selectionStageCases = ['case "body_scan_contraction":', 'case "body_scan_heaviness":', 'case "body_scan_closedness":', 'case "body_scan_opening_region":'];
  function sliceCase(caseLabel: string): string {
    const start = screenSource.indexOf(caseLabel);
    assert.ok(start >= 0, `${caseLabel} must exist`);
    const nextCase = screenSource.slice(start + caseLabel.length).search(/\n\s*case "/);
    return nextCase === -1 ? screenSource.slice(start) : screenSource.slice(start, start + caseLabel.length + nextCase);
  }
  for (const label of mantraStageCases) {
    const block = sliceCase(label);
    assert.ok(block.includes("<ArcBodyMantraCircle"), `${label} must render ArcBodyMantraCircle`);
    assert.ok(!block.includes("<BodySilhouetteMap"), `${label} must never ALSO render BodySilhouetteMap`);
  }
  for (const label of selectionStageCases) {
    const block = sliceCase(label);
    assert.ok(block.includes("<BodySilhouetteMap"), `${label} must render BodySilhouetteMap`);
    assert.ok(!block.includes("<ArcBodyMantraCircle"), `${label} must never ALSO render ArcBodyMantraCircle`);
  }
});

// --- requirement 2: the body is a real articulated shape, never a literal SVG transform string ---

test("ArticulatedBodyShape animates a real capsule (rounded Rect) derived from the shape's own base cx/cy/rx/ry via translate+scale, never a literal SVG transform attribute string", () => {
  assert.match(shapeSource, /const rx = shape\.rx \* transform\.scale;/);
  assert.match(shapeSource, /const ry = shape\.ry \* transform\.scale;/);
  assert.match(shapeSource, /const cx = shape\.cx \+ transform\.dx;/);
  assert.match(shapeSource, /const cy = shape\.cy \+ transform\.dy;/);
  assert.match(shapeSource, /x: cx - rx,/);
  assert.match(shapeSource, /y: cy - ry,/);
  assert.match(shapeSource, /width: rx \* 2,/);
  assert.match(shapeSource, /height: ry \* 2,/);
  assert.ok(!shapeSource.includes("transform={"), "must never use a literal SVG transform attribute");
});

test("ArticulatedBodyShape passes movementDef straight through to resolveBodyRegionMovementTransform, which structurally guarantees the identity transform for any non-selected (null-def) shape", () => {
  assert.match(shapeSource, /resolveBodyRegionMovementTransform\(movementDef, shape\.side, intensity\.value\)/);
});

// --- requirement 1: vertical centering lives at the screen level, not just inside the component ---

test("live/NewArcLiveScreen.tsx centers its own ScrollView content container vertically (justifyContent: 'center') specifically for the mantra stages (and, ARCHI Free Breathing Intro task, the free_breathing screen too) -- ArcBodyMantraCircle itself only centers horizontally; true screen-level centering is this file's own job, never confused with centering inside a component", () => {
  assert.match(screenSource, /contentContainerStyle=\{\[styles\.content, \(isBodyMantraStage \|\| isFreeBreathingStage\) && styles\.contentCentered\]\}/);
  assert.match(screenSource, /contentCentered: \{ justifyContent: "center" \}/);
});

test("ArcBodyMantraCircle's own Pressable stretches to the FULL width it's given (never a shrink-wrapped, off-center box) -- this is what makes horizontal centering (via its own alignItems: 'center') actually center on the real screen, not just within some arbitrary narrower box", () => {
  assert.match(circleSource, /pressable: \{[^}]*width: "100%"/);
});

// --- Fix All Confirmed ARC Android Bugs task, requirement 1 ("black screen at Dwelling") + requirement 5 ("safe static fallback") ---

test("the Presence ring AND the articulated body are each independently wrapped in AnimationErrorBoundary with their own static, non-animated fallback -- a JS-thread render error in either one still leaves a correct, readable circle instead of a blank screen", () => {
  assert.match(circleSource, /import AnimationErrorBoundary from "\.\/AnimationErrorBoundary\.tsx";/, "the shared error boundary must be imported, never a second, duplicated class defined inline");

  const presenceBoundaryIndex = circleSource.indexOf("<AnimationErrorBoundary fallback={<StaticPresenceDot");
  assert.ok(presenceBoundaryIndex >= 0, "the Presence ring must be wrapped in its own AnimationErrorBoundary with a StaticPresenceDot fallback");

  const bodyBoundaryIndex = circleSource.indexOf("<AnimationErrorBoundary", circleSource.indexOf("styles.bodyLayer"));
  const bodyBoundaryBlock = circleSource.slice(bodyBoundaryIndex, bodyBoundaryIndex + 300);
  assert.match(bodyBoundaryBlock, /fallback=\{\s*<StaticBodyShapes/, "the articulated body must be wrapped in its own AnimationErrorBoundary with a StaticBodyShapes fallback");

  // The mantra text itself must sit OUTSIDE both boundaries -- it must never disappear even if the animated paths throw.
  const lastBoundaryCloseIndex = circleSource.lastIndexOf("</AnimationErrorBoundary>");
  const mantraTextIndex = circleSource.indexOf("<Text style={styles.mantraText}>");
  assert.ok(mantraTextIndex > lastBoundaryCloseIndex, "the mantra Text must render after (outside) every AnimationErrorBoundary, never inside one");
});

test("StaticBodyShapes (the body's own error-boundary fallback) renders plain react-native-svg Ellipses with no Reanimated shared values, worklets, or useAnimatedProps/useAnimatedStyle of its own -- it can never fail the same way the animated path could", () => {
  const fnIndex = circleSource.indexOf("function StaticBodyShapes");
  const fnBlock = circleSource.slice(fnIndex, circleSource.indexOf("const styles = StyleSheet.create", fnIndex));
  assert.match(fnBlock, /<Ellipse\b/);
  assert.ok(!fnBlock.includes("useAnimatedProps") && !fnBlock.includes("useSharedValue") && !fnBlock.includes("ArticulatedBodyShape"), "the static fallback must never itself depend on the animated component it is standing in for");
});

// --- Fix All Confirmed ARC Android Bugs task, requirement 5 ("continuous Presence animation... through the later stages") ---

test("every one of the nine ArcBodyMantraCircle usages in live/NewArcLiveScreen.tsx passes no 'key' prop -- a stage change can never force React to unmount/remount this component (and therefore its internal PresenceAnimation), which is what keeps Presence genuinely continuous across every stage transition, Dwelling included", () => {
  const usages = screenSource.match(/<ArcBodyMantraCircle\s[\s\S]{0,400}?onAdvance=\{[^}]*\}\s*\n\s*\/>/g) ?? [];
  assert.ok(usages.length >= 6, `expected at least 6 ArcBodyMantraCircle JSX usages (covering all 9 stage cases), found ${usages.length}`);
  for (const usage of usages) {
    assert.ok(!usage.includes("key="), "no ArcBodyMantraCircle usage may pass a key prop keyed by stage -- that would force a remount and restart Presence");
  }
});

// --- Final ARC Body Redesign & Flow Fixes task, requirement 5 ("SHOW MOVEMENT INSTRUCTIONS BELOW THE CIRCLE") ---

test("ArcBodyMantraCircle computes its movement-instructions list via resolveMovementInstructionsForStage(stage, openingRegions) -- the one shared gate that already returns [] outside Acceptance/Regulation/Encoding, never a locally re-derived stage check", () => {
  assert.match(circleSource, /import \{ resolveMovementInstructionsForStage \} from "\.\.\/\.\.\/arc\/bodyRegionMovements\.ts";/);
  assert.match(circleSource, /const movementInstructions = resolveMovementInstructionsForStage\(stage, openingRegions\);/);
});

test("the movement-instructions block renders AFTER (outside) the closing </Pressable> tag -- it is a plain sibling, never inside the circle's own tap-to-advance touch surface", () => {
  const pressableCloseIndex = circleSource.indexOf("</Pressable>");
  const instructionsBlockIndex = circleSource.indexOf("styles.instructionsBlock");
  assert.ok(pressableCloseIndex >= 0 && instructionsBlockIndex >= 0, "both the closing Pressable tag and the instructions block must exist");
  assert.ok(instructionsBlockIndex > pressableCloseIndex, "the instructions block must render after the Pressable closes, never inside it");
});

test("the movement-instructions block is non-interactive (pointerEvents=\"none\") and only renders when movementInstructions.length > 0 -- it never shows an empty block during Dwelling or any selection/Presence screen", () => {
  const blockIndex = circleSource.indexOf("styles.instructionsBlock");
  const blockRegionStart = circleSource.lastIndexOf("movementInstructions.length > 0", blockIndex);
  assert.ok(blockRegionStart >= 0, "the block must be conditionally rendered on movementInstructions.length > 0");
  const block = circleSource.slice(blockRegionStart, blockIndex + 200);
  assert.match(block, /pointerEvents="none"/);
});

test("the movement-instructions block maps each instruction to its own <Text>, keyed by the instruction text itself -- a compact per-line list, never one combined paragraph", () => {
  const blockIndex = circleSource.indexOf("styles.instructionsBlock");
  const mapBlock = circleSource.slice(blockIndex, circleSource.indexOf("</>", blockIndex));
  assert.match(mapBlock, /movementInstructions\.map\(\(instruction\) => \(/);
  assert.match(mapBlock, /key=\{instruction\}/);
  assert.match(mapBlock, /style=\{styles\.instructionText\}/);
});

// --- ARCHI -- Two Mantras for Urge Acceptance correction ----------------

test("ArcBodyMantraCircle accepts an OPTIONAL belowCircleLines prop, defaulting to an empty array -- every existing caller that doesn't pass it renders no extra block", () => {
  assert.match(circleSource, /belowCircleLines\?: readonly string\[\];/);
  assert.match(circleSource, /belowCircleLines = \[\],/);
});

test("the belowCircleLines block renders AFTER (outside) the closing </Pressable> tag, is non-interactive, and only renders when belowCircleLines.length > 0 -- never inside the circle's own tap-to-advance touch surface, never an empty block when no caller passes lines", () => {
  const pressableCloseIndex = circleSource.indexOf("</Pressable>");
  const belowCircleIndex = circleSource.indexOf("belowCircleLines.length > 0");
  assert.ok(pressableCloseIndex >= 0 && belowCircleIndex >= 0, "both the closing Pressable tag and the belowCircleLines condition must exist");
  assert.ok(belowCircleIndex > pressableCloseIndex, "the belowCircleLines block must render after the Pressable closes, never inside it");
  const block = circleSource.slice(belowCircleIndex, belowCircleIndex + 500);
  assert.match(block, /pointerEvents="none"/);
  assert.match(block, /belowCircleLines\.map\(\(line\) => \(/);
  assert.match(block, /key=\{line\}/);
});

test("live/NewArcLiveScreen.tsx passes belowCircleLines={content.supporting} on both the Full ARC stop_and_accept_urge and the Mini ARC mini_stop_accept_urge ArcBodyMantraCircle usages -- the two required urge-acceptance mantras reach the circle on both tracks", () => {
  const stopUrgeIndex = screenSource.indexOf('case "stop_and_accept_urge":');
  const stopUrgeBlock = screenSource.slice(stopUrgeIndex, screenSource.indexOf("case ", stopUrgeIndex + 20));
  assert.match(stopUrgeBlock, /belowCircleLines=\{content\.supporting\}/);

  const miniStopUrgeIndex = screenSource.indexOf('case "mini_stop_accept_urge":');
  const miniStopUrgeBlock = screenSource.slice(miniStopUrgeIndex, screenSource.indexOf("case ", miniStopUrgeIndex + 20));
  assert.match(miniStopUrgeBlock, /belowCircleLines=\{content\.supporting\}/);
});

// --- Unified ARC & Productivity Update task, requirements 7-8 -----------

test("requirement 8: the body layer is gated behind resolveShowBodyForStage(stage), computed once per render -- never a hardcoded/unconditional render", () => {
  assert.match(circleSource, /import \{[\s\S]*?resolveShowBodyForStage,?[\s\S]*?\} from "\.\.\/\.\.\/arc\/arcBodyMantraCircleLogic\.ts";/);
  assert.match(circleSource, /const showBody = resolveShowBodyForStage\(stage\);/);
  const bodyLayerIndex = circleSource.indexOf("<View style={styles.bodyLayer}>");
  const gateIndex = circleSource.lastIndexOf("{showBody && (", bodyLayerIndex);
  assert.ok(gateIndex >= 0 && gateIndex < bodyLayerIndex, "the body layer's own View must be wrapped by the showBody conditional, not rendered unconditionally");
});

test("requirement 7-8: the Presence ring (central point + the one expanding circle) and the mantra text both render UNCONDITIONALLY, regardless of showBody -- 'keep the circle expanding' even with the body hidden", () => {
  const showBodyIndex = circleSource.indexOf("const showBody = resolveShowBodyForStage(stage);");
  const presenceLayerIndex = circleSource.indexOf("PresenceAnimation", showBodyIndex);
  const mantraTextIndex = circleSource.indexOf("styles.mantraText", showBodyIndex);
  const gateBeforePresence = circleSource.lastIndexOf("showBody &&", presenceLayerIndex);
  const gateBeforeMantra = circleSource.lastIndexOf("showBody &&", mantraTextIndex);
  const bodyLayerIndex = circleSource.indexOf("<View style={styles.bodyLayer}>");
  assert.ok(gateBeforePresence < 0 || gateBeforePresence < circleSource.indexOf("const showBody"), "PresenceAnimation must never be gated by showBody");
  assert.ok(gateBeforeMantra < 0 || gateBeforeMantra < bodyLayerIndex, "the mantra Text must never be gated by showBody -- it is a sibling of (not inside) the conditional body layer");
});

test("requirement 7: ArcBodyMantraStage includes 'urge_acceptance' and 'thought_acceptance', and NewArcLiveScreen.tsx renders both via ArcBodyMantraCircle for the actual acceptance moment (not the earlier chip/preparatory sub-screens)", () => {
  const stepsLogic = readSource("arc/arcBodyMantraCircleLogic.ts");
  assert.match(stepsLogic, /\| "urge_acceptance"\s*\n\s*\| "thought_acceptance"\s*\n\s*\| "interpretation_acceptance"/);
  assert.match(screenSource, /stage="urge_acceptance"/);
  assert.match(screenSource, /stage="thought_acceptance"/);
  // urge_acceptance appears literally twice -- once for Full ARC's own
  // step (stop_and_accept_urge), once for Mini ARC's
  // (mini_stop_accept_urge), both now single-page screens (ARCHI Two
  // Mantras for Urge Acceptance correction).
  assert.equal((screenSource.match(/stage="urge_acceptance"/g) ?? []).length, 2, "stop_and_accept_urge (Full) and mini_stop_accept_urge (Mini) both use it");
  // thought_acceptance appears literally once for Full ARC's own
  // reality_acceptance step; Mini ARC's mini_reality_acceptance uses a
  // ternary (thought_acceptance when a thought exists, otherwise
  // interpretation_acceptance -- ARCHI Universal ARC Routing task), so
  // it is checked separately rather than by literal string count here.
  assert.equal((screenSource.match(/stage="thought_acceptance"/g) ?? []).length, 1, "only reality_acceptance (Full) uses the literal stage prop");
  assert.match(screenSource, /stage=\{session!\.currentThought \? "thought_acceptance" : "interpretation_acceptance"\}/, "mini_reality_acceptance picks between thought_acceptance/interpretation_acceptance by whether a thought exists");
});

test("requirement 7: the acceptance-moment ArcBodyMantraCircle usages pass empty contraction/closure/opening region arrays -- no body-scan selection exists yet at this point in the exercise, same convention as the five earlier Presence pages", () => {
  const stageAttributes = [
    'stage="urge_acceptance"',
    'stage="thought_acceptance"',
    'stage="interpretation_acceptance"',
    'stage={session!.currentThought ? "thought_acceptance" : "interpretation_acceptance"}',
  ];
  let totalUsages = 0;
  for (const stageAttribute of stageAttributes) {
    let searchFrom = 0;
    while (true) {
      const idx = screenSource.indexOf(stageAttribute, searchFrom);
      if (idx === -1) break;
      const usage = screenSource.slice(idx, screenSource.indexOf("/>", idx));
      assert.ok(usage.includes("contractionRegions={[]}"), `${stageAttribute} usage must pass an empty contractionRegions array`);
      assert.ok(usage.includes("closureRegions={[]}"), `${stageAttribute} usage must pass an empty closureRegions array`);
      assert.ok(usage.includes("openingRegions={[]}"), `${stageAttribute} usage must pass an empty openingRegions array`);
      searchFrom = idx + 1;
      totalUsages++;
    }
  }
  assert.equal(totalUsages, 5, "stop_and_accept_urge, mini_stop_accept_urge, reality_acceptance, interpretation_acceptance, and mini_reality_acceptance -- exactly five acceptance-moment usages");
});

// --- ARCHI -- Consolidated Implementation Request, Part 8.2 ("Whole-
// Body Spreading Animation") / Part 9 ("Mini ARC Encoding: Body + Expanded
// Circle") ---

test("ArcBodyMantraCircle computes encodingSpreadActive from the stage and the trainee's own real opening_and_supportive selections -- true only during 'encoding', and only once at least one real blue (opening_and_supportive) region was actually chosen, never invented when none was", () => {
  assert.match(
    circleSource,
    /const encodingSpreadActive = stage === "encoding" && openingRegions\.some\(\(entry\) => entry\.role === "opening_and_supportive"\);/
  );
});

test("encodingSpreadActive is threaded into BOTH resolveBodyMantraShapeAppearance call sites -- the animated path (inside shapes.map) and the StaticBodyShapes AnimationErrorBoundary fallback -- so the whole-body spread renders identically on either path, never only on one", () => {
  assert.match(circleSource, /resolveBodyMantraShapeAppearance\(shape\.region, shape\.side, \{\s*\n\s*contractionRegions,\s*\n\s*closureRegions,\s*\n\s*openingRegions,\s*\n\s*encodingSpreadActive,\s*\n\s*\}\);/);
  assert.match(circleSource, /encodingSpreadActive=\{encodingSpreadActive\}/, "the fallback StaticBodyShapes element must receive the same computed flag as a prop");
});

test("StaticBodyShapes declares encodingSpreadActive as a required boolean prop and passes it straight through to resolveBodyMantraShapeAppearance -- the fallback never silently omits the spread tint", () => {
  const fnIndex = circleSource.indexOf("function StaticBodyShapes(");
  const fnEnd = circleSource.indexOf("\n}", circleSource.indexOf("</Svg>", fnIndex));
  const fnBody = circleSource.slice(fnIndex, fnEnd);
  assert.match(fnBody, /encodingSpreadActive,\s*\n\}: \{[\s\S]*?encodingSpreadActive: boolean;/);
  assert.match(fnBody, /resolveBodyMantraShapeAppearance\(shape\.region, shape\.side, \{ contractionRegions, closureRegions, openingRegions, encodingSpreadActive \}\);/);
});

test("the encodingSpreadActive computation never mutates contractionRegions/openingRegions themselves -- Part 8.3's 'important data distinction' (the spread is a render-time visualization only, it never permanently changes stored region roles) holds structurally, since encodingSpreadActive is a plain derived boolean, never assigned back into either array", () => {
  assert.doesNotMatch(circleSource, /openingRegions\s*=\s*openingRegions\.(map|filter|concat)/, "openingRegions must never be reassigned/transformed in place");
  assert.doesNotMatch(circleSource, /contractionRegions\s*=\s*contractionRegions\.(map|filter|concat)/, "contractionRegions must never be reassigned/transformed in place");
});

test("Mini ARC's mini_encoding step now renders through ArcBodyMantraCircle with stage=\"encoding\" -- the SAME body visualization and the SAME largest (growth-index-8) circle Full/Shortened ARC's own Encoding step uses, satisfying 'larger than during Presence' (mini_presence's own growth index is only 2) without inventing a second, Mini-only intensity table", () => {
  const caseIndex = screenSource.indexOf('case "mini_encoding":');
  const caseBody = screenSource.slice(caseIndex, screenSource.indexOf('case "default"', caseIndex) !== -1 ? screenSource.indexOf("default:", caseIndex) : screenSource.length);
  assert.match(caseBody, /<ArcBodyMantraCircle/);
  assert.match(caseBody, /stage="encoding"/);
  assert.match(caseBody, /contractionRegions=\{session!\.bodyScanContractionRegions\}/);
  assert.match(caseBody, /openingRegions=\{session!\.openingBodyScanRegions\}/);
});

test("mini_encoding passes belowCircleLines={content.supporting} so the sensation/area/movement detail line stays on the SAME integrated screen as the body + circle, never a second split screen", () => {
  const caseIndex = screenSource.indexOf('case "mini_encoding":');
  const caseBody = screenSource.slice(caseIndex, screenSource.indexOf("default:", caseIndex));
  assert.match(caseBody, /belowCircleLines=\{content\.supporting\}/);
});

test("mini_encoding is included in isBodyMantraStage, so the generic title/primary/supporting header is suppressed for it (never duplicated outside the one circle), same convention as every other body-mantra stage", () => {
  const isBodyMantraStageIndex = screenSource.indexOf("const isBodyMantraStage =");
  const block = screenSource.slice(isBodyMantraStageIndex, screenSource.indexOf("isInterpretationAcceptanceCirclePhase;", isBodyMantraStageIndex));
  assert.match(block, /session\.currentStep === "mini_encoding"/);
});

test('mini_encoding still persists via the existing setMiniEncoding setter on tap (onAdvance), never a second, competing persistence path -- the same resolveEncodingMantra/miniBeliefText call the old plain-button case already made', () => {
  const caseIndex = screenSource.indexOf('case "mini_encoding":');
  const caseBody = screenSource.slice(caseIndex, screenSource.indexOf("default:", caseIndex));
  assert.match(caseBody, /onAdvance=\{\(\) => commit\(setMiniEncoding\(session!, resolveEncodingMantra\(session!\), session!\.miniBeliefText \?\? "", now\)\)\}/);
});
