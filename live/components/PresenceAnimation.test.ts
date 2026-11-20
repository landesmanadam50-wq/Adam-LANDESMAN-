import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/components/PresenceAnimation.test.ts
 *
 * Unified ARC Architecture and Interactive Animation Update, Phase 1
 * ("Continuous Animated Presence"): source-text regression guard, same
 * convention as every other screen/component test in this codebase (no
 * React Native renderer exists here to mount the component and read
 * real Reanimated frame values).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const component = readSource("live/components/PresenceAnimation.tsx");

test("exposes 'full' and 'subtle' modes, with 'full' meant for the one-time Presence exercise and 'subtle' for later stages -- never a third, undocumented mode", () => {
  assert.match(component, /export type PresenceAnimationMode = "full" \| "subtle";/);
  assert.match(component, /DEFAULT_SIZE_BY_MODE: Record<PresenceAnimationMode, number> = \{ full: \d+, subtle: \d+ \};/);
});

test("'subtle' mode is smaller, has a smaller expansion scale, and a slower rotation than 'full' -- 'nonintrusive... do not obscure the interactive body map'", () => {
  const sizeMatch = component.match(/DEFAULT_SIZE_BY_MODE: Record<PresenceAnimationMode, number> = \{ full: (\d+), subtle: (\d+) \};/);
  assert.ok(sizeMatch);
  assert.ok(Number(sizeMatch![2]) < Number(sizeMatch![1]), "subtle mode must render smaller than full mode");

  const expansionMatch = component.match(/EXPANSION_SCALE_BY_MODE: Record<PresenceAnimationMode, number> = \{ full: ([\d.]+), subtle: ([\d.]+) \};/);
  assert.ok(expansionMatch);
  assert.ok(Number(expansionMatch![2]) < Number(expansionMatch![1]), "subtle mode must expand less than full mode");

  const rotationMatch = component.match(/ROTATION_DURATION_MS_BY_MODE: Record<PresenceAnimationMode, number> = \{ full: (\d+), subtle: (\d+) \};/);
  assert.ok(rotationMatch);
  assert.ok(Number(rotationMatch![2]) > Number(rotationMatch![1]), "subtle mode's rotation must take longer (slower) than full mode's");
});

test("reduced-motion accessibility: when useReducedMotion() reports true, no withRepeat/looping animation is ever started -- only a single static frame (point + one steady ring) is set", () => {
  assert.match(component, /const reduceMotionEnabled = useReducedMotion\(\);/);
  const effectIndex = component.indexOf("useEffect(() => {");
  const effectBody = component.slice(effectIndex, component.indexOf("}, [reduceMotionEnabled]);"));
  assert.ok(effectBody.includes("if (reduceMotionEnabled) {"));
  const staticBranch = effectBody.slice(effectBody.indexOf("if (reduceMotionEnabled) {"), effectBody.indexOf("return;") + "return;".length);
  assert.ok(!staticBranch.includes("withRepeat"), "the reduced-motion branch must never schedule a repeating animation");
  assert.ok(staticBranch.includes("rotation.value = 0;"));
  assert.ok(staticBranch.includes("expansion.value ="));
  // The ordinary (motion-enabled) branch, past that early return, is
  // the only place withRepeat is ever called.
  const motionBranch = effectBody.slice(effectBody.indexOf("rotation.value = withRepeat"));
  assert.ok(motionBranch.includes("withRepeat(withTiming(360,"), "rotation must loop continuously when motion is enabled");
  assert.ok(motionBranch.includes("withRepeat(withTiming(1,"), "the expansion ring must loop continuously when motion is enabled");
});

test("the looping animations are cancelled on unmount/mode change -- never left running against a stale shared value", () => {
  const effectIndex = component.indexOf("useEffect(() => {");
  const effectBody = component.slice(effectIndex, component.indexOf("}, [reduceMotionEnabled]);"));
  assert.ok(effectBody.includes("return () => {"));
  assert.ok(effectBody.includes("cancelAnimation(rotation);"));
  assert.ok(effectBody.includes("cancelAnimation(expansion);"));
});

test("the chosen color is applied to both the central point and the expanding ring -- 'Preserve the chosen color,' never a hardcoded color overriding it", () => {
  assert.match(component, /backgroundColor: color/);
  assert.match(component, /borderColor: color/);
});

test("does not restart the whole Presence exercise on its own -- the animation's only inputs are `color`/`mode`/`size` props, with no internal 'has the intro already played' state to reset", () => {
  assert.ok(!component.includes("useState"), "this component must have no internal state of its own to reset between renders -- a parent re-styling full->subtle is purely a prop change");
});
