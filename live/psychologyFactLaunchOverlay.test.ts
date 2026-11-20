import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/psychologyFactLaunchOverlay.test.ts
 *
 * Psychology/Smiling/Positive-Reinforcement task, feature 1: source-
 * text regression guard for the every-launch psychology-fact overlay.
 * The rotating fact list itself is covered by arc/psychologyFacts.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const overlay = readSource("live/PsychologyFactLaunchOverlay.tsx");
const layout = readSource("app/_layout.tsx");

test("Manifest Upgrade task, requirement 4: this component is no longer mounted directly in app/_layout.tsx -- live/DailyStartupSequenceOverlay.tsx now shows this same fact (inlined there) as the first of its own two once-per-day popups, never on every single launch", () => {
  assert.ok(!layout.includes("PsychologyFactLaunchOverlay"), "the old every-launch mount must be gone");
  assert.match(layout, /import DailyStartupSequenceOverlay from ["']\.\.\/live\/DailyStartupSequenceOverlay\.tsx["'];/);
  assert.ok(layout.includes("<DailyStartupSequenceOverlay />"));
  assert.ok(!layout.includes('name="psychology-fact'), "must never be registered as its own Stack.Screen route");
});

test("the component itself is untouched and still a complete, independently mountable overlay -- kept, never deleted", () => {
  assert.ok(overlay.includes("export default function PsychologyFactLaunchOverlay()"));
});

test("on mount, it loads the last-shown index, resolves and persists the NEXT one via the shared rotation rule, then shows that fact", () => {
  const effectIndex = overlay.indexOf("useEffect(() => {");
  const effectBody = overlay.slice(effectIndex, effectIndex + 400);
  assert.ok(effectBody.includes("loadPsychologyFactProgress()"));
  assert.ok(effectBody.includes("resolveNextPsychologyFactIndex(progress.lastFactIndex)"));
  assert.ok(effectBody.includes("await savePsychologyFactProgress({ lastFactIndex: nextIndex })"));
  assert.ok(effectBody.includes("setFact(PSYCHOLOGY_FACTS[nextIndex])"));
});

test("the fact is immediately dismissible, and once dismissed the overlay renders nothing (never blocks navigation underneath)", () => {
  assert.ok(overlay.includes("if (!fact || dismissed) return null;"));
  assert.ok(overlay.includes('onPress={() => setDismissed(true)}'));
});

test("the fact's own reference and ARC connection are both displayed, never only the bare text -- the task's own 'include reliable references' and 'explain the connection' requirements", () => {
  assert.ok(overlay.includes("{fact.reference}"));
  assert.ok(overlay.includes("{fact.arcConnection}"));
});
