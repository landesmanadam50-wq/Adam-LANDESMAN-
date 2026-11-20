import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/components/BodySilhouetteMap.test.ts
 *
 * Unified ARC Architecture and Interactive Animation Update, Phase 1
 * ("Interactive Segmented Body"): source-text regression guard for the
 * component itself. The underlying region/shape DATA is owned and
 * fully tested by arc/bodySilhouetteLayout.ts/.test.ts; each real
 * screen's own wiring (which setter, which color, which allow-list) is
 * tested in live/newArcLiveScreen.test.ts. This file only checks the
 * component's own generic contract: controlled selection, front/back
 * toggle, and the selectableRegions allow-list.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const component = readSource("live/components/BodySilhouetteMap.tsx");

test("is a pure, controlled component -- it never IMPORTS any ARC session/engine module, only reading isSelected/onToggle/selectedColor/selectableRegions from its own props", () => {
  assert.ok(!component.includes('from "../../arc/newArcLiveSteps.ts"'));
  assert.ok(!component.includes('from "../../arc/newArcLiveTypes.ts"'));
  assert.match(component, /isSelected: \(region: BodyScanRegion, side: BodyScanSide\) => boolean;/);
  assert.match(component, /onToggle: \(region: BodyScanRegion, side: BodyScanSide\) => void;/);
});

test("renders a front/back view toggle, defaulting to 'front' unless initialView overrides it, and only draws the shapes for whichever view is currently active", () => {
  assert.match(component, /useState<BodySilhouetteView>\(initialView\)/);
  assert.match(component, /initialView = "front"/);
  assert.match(component, /const shapes = resolveSilhouetteShapesForView\(view\);/);
});

test("a shape outside the optional selectableRegions allow-list is drawn but never tappable -- onPress is undefined, never calling onToggle for a region the caller didn't allow", () => {
  const fnIndex = component.indexOf("const isSelectable = (region: BodyScanRegion, side: BodyScanSide): boolean => {");
  const fnBody = component.slice(fnIndex, component.indexOf("};", fnIndex));
  assert.ok(fnBody.includes("if (!selectableRegions) return true;"), "omitting the allow-list must make every drawn region selectable, the ordinary case");
  assert.match(component, /onPress=\{selectable \? \(\) => onToggle\(shape\.region, shape\.side\) : undefined\}/);
});

test("a selected shape is filled with the caller's own selectedColor; an unselected-but-selectable shape uses the neutral palette; a disabled (not-selectable) shape uses a visibly dimmer, inert palette", () => {
  assert.match(component, /const fill = selected \? selectedColor : selectable \? NEUTRAL_FILL : DISABLED_FILL;/);
  assert.match(component, /const stroke = selected \? selectedColor : selectable \? NEUTRAL_STROKE : DISABLED_STROKE;/);
});

test("exports toSilhouetteRegionKeys, a plain pass-through helper for callers building a selectableRegions allow-list from their own existing (region, side) list -- never requiring them to know this component's internal shape representation", () => {
  assert.match(component, /export function toSilhouetteRegionKeys\(entries: readonly \{ region: BodyScanRegion; side: BodyScanSide \}\[\]\): BodySilhouetteRegionKey\[\] \{/);
  assert.match(component, /return entries\.map\(\(entry\) => \(\{ region: entry\.region, side: entry\.side \}\)\);/);
});

test("every drawn shape is accessible, with a real Hebrew region+side label -- never an unlabeled tap target", () => {
  assert.match(component, /accessibilityLabel=\{resolveRegionLabel\(shape\.region, shape\.side\)\}/);
  const fnIndex = component.indexOf("function resolveRegionLabel(");
  const fnBody = component.slice(fnIndex, component.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("(שמאל)"));
  assert.ok(fnBody.includes("(ימין)"));
});
