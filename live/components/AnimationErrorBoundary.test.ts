import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/components/AnimationErrorBoundary.test.ts
 *
 * Fix All Confirmed ARC Android Bugs task, requirement 5 ("provide a
 * safe static fallback if native animation fails"): source-text
 * regression guard, same convention as every other screen/component
 * test in this codebase (no React Native renderer exists here to
 * actually mount the boundary and throw inside it).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const source = readSource("live/components/AnimationErrorBoundary.tsx");

test("AnimationErrorBoundary is a real React error boundary -- it implements getDerivedStateFromError (the only lifecycle that can intercept a render-time throw) and renders the fallback once tripped", () => {
  assert.match(source, /static getDerivedStateFromError\(\): AnimationErrorBoundaryState \{\s*\n\s*return \{ hasError: true \};/);
  assert.match(source, /if \(this\.state\.hasError\) return this\.props\.fallback;/);
  assert.match(source, /return this\.props\.children;/);
});

test("componentDidCatch swallows the error -- it never rethrows and never crashes the screen, since there is no logging backend in this app to report to", () => {
  const methodIndex = source.indexOf("componentDidCatch(): void {}");
  assert.ok(methodIndex >= 0, "componentDidCatch must be a true no-op -- swallow, never rethrow");
});

test("the boundary takes plain fallback/children props -- generic enough to wrap either the Presence ring or the articulated body independently, each with its own distinct static fallback", () => {
  assert.match(source, /fallback: ReactNode;/);
  assert.match(source, /children: ReactNode;/);
});

test("is exported as the default export, imported by name (never duplicated inline) wherever it's used", () => {
  assert.match(source, /export default class AnimationErrorBoundary extends Component</);
});
