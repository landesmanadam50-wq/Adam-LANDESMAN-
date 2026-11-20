import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/components/ArcStageScreen.test.ts
 *
 * Unified ARC Architecture and Interactive Animation Update, Phase 1
 * ("One Screen Per Stage"): source-text regression guard, same
 * convention as every other screen/component test in this codebase.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const component = readSource("live/components/ArcStageScreen.tsx");

test("renders the stage title, an optional visual slot, and an optional interactive children slot -- in that order, title first", () => {
  const titleIndex = component.indexOf("<Text style={styles.title}>{title}</Text>");
  const visualIndex = component.indexOf("{visual && <View style={styles.visualSlot}>{visual}</View>}");
  const childrenIndex = component.indexOf("{children && <View style={styles.childrenSlot}>{children}</View>}");
  assert.ok(titleIndex !== -1 && visualIndex !== -1 && childrenIndex !== -1);
  assert.ok(titleIndex < visualIndex && visualIndex < childrenIndex);
});

test("every instruction string gets its own Text element, mapped in order -- never joined into one paragraph", () => {
  assert.match(component, /\{instructions\.map\(\(line, index\) => \(/);
  assert.match(component, /<Text key=\{`\$\{index\}-\$\{line\}`\} style=\{styles\.instructionLine\}>/);
});

test("instruction lines each carry their own bottom margin -- 'clear vertical spacing between individual instructions'", () => {
  assert.match(component, /instructionLine: \{[^}]*marginBottom: \d+[^}]*\}/);
});

test("exactly one primary Continue button, disableable via continueDisabled, defaulting to label 'המשך'", () => {
  const buttonCount = (component.match(/primaryButton/g) ?? []).length;
  assert.ok(buttonCount >= 2, "styles.primaryButton must be referenced (the Pressable's style + its own style definition)");
  assert.match(component, /continueLabel = "המשך"/);
  assert.match(component, /disabled=\{continueDisabled\}/);
  assert.match(component, /onPress=\{onContinue\}/);
});

test("Back/Pause/Stop controls are each independently optional -- the row itself only renders when at least one handler is provided, and each button only renders when its own handler is", () => {
  assert.match(component, /\{\(onBack \|\| onPause \|\| onStop\) && \(/);
  assert.match(component, /\{onStop && \(/);
  assert.match(component, /\{onPause && \(/);
  assert.match(component, /\{onBack && \(/);
});

test("defines no ARC-session/engine-specific logic of its own -- it never imports from arc/newArcLiveSteps.ts or arc/newArcLiveTypes.ts, staying a pure, reusable shell for whatever caller supplies", () => {
  assert.ok(!component.includes("newArcLiveSteps"));
  assert.ok(!component.includes("newArcLiveTypes"));
});
