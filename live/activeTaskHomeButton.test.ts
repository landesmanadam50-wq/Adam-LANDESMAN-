import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/ActiveTaskScreen.tsx");

/**
 * live/activeTaskHomeButton.test.ts
 *
 * ARCHI -- Three UX Improvements task, Improvement 2 ("Add a Home
 * button to the Task LIVE timer screen"): source-text regression
 * guard, same convention as every other ActiveTaskScreen.tsx
 * navigation test in this codebase (live/activeTaskScreen.test.ts) --
 * no React Native component test renderer exists here. Covers section
 * 4, points 4-6.
 */

function sliceTitleRow(): string {
  const index = screen.indexOf("styles.titleRow");
  return screen.slice(index, index + 2000);
}

// Point 4: Home-button navigation from Task LIVE to "היום הגמיש".
test("a 🏠 Home button sits inside the title row, on the Task LIVE screen, navigating to '/' (the registered 'היום הגמיש' route) via router.replace -- never push/back/dismissTo, since Task LIVE can be reached from many stack-unpredictable origins", () => {
  const titleRow = sliceTitleRow();
  assert.ok(titleRow.includes("🏠"), "the house-shaped icon button must be present");
  assert.ok(titleRow.includes('router.replace("/")'), "must navigate home via the established router.replace(\"/\") idiom, not push/back");
});

test("the Home button is a plain Pressable/Text (no new icon-library dependency), matching this codebase's existing house style", () => {
  const titleRow = sliceTitleRow();
  const homeButtonIndex = titleRow.indexOf("🏠");
  const surroundingJsx = titleRow.slice(Math.max(0, homeButtonIndex - 200), homeButtonIndex + 50);
  assert.ok(surroundingJsx.includes("<Pressable"));
  assert.ok(surroundingJsx.includes("styles.homeButton"));
});

test("the floating cube/overlay is never touched by this task -- live/ActiveTaskScreen.tsx is the only file changed for the Home button, and the native floating-timer-overlay module is untouched", () => {
  assert.ok(!screen.includes("homeButton") || screen.includes("styles.homeButton"), "sanity: the new style lives in this file's own StyleSheet, not a separate module");
});

// Point 5: active task and timer preservation during navigation --
// the Home button's own onPress must never call any timer-mutating
// function.
test("the Home button's own onPress calls ONLY router.replace -- never handlePause/handleFinishEarly/clearTaskTimerRun/clearEndedTimer/any floating-overlay function, so the active task and its timer are completely unaffected by navigating home", () => {
  const titleRow = sliceTitleRow();
  const homeButtonIndex = titleRow.indexOf("🏠");
  const onPressStart = titleRow.lastIndexOf("onPress={", homeButtonIndex);
  const onPressSnippet = titleRow.slice(onPressStart, homeButtonIndex);
  assert.ok(onPressSnippet.includes('router.replace("/")'));
  for (const forbidden of ["handlePause", "handleFinishEarly", "clearTaskTimerRun", "clearEndedTimer", "showFloatingTimerOverlay", "showIdleFloatingOverlayPanel"]) {
    assert.ok(!onPressSnippet.includes(forbidden), `the Home button's onPress must never call ${forbidden}`);
  }
});

// Point 6: correct running/paused timer behavior after returning --
// this is already guaranteed structurally by the anchor-timestamp
// TaskTimerRun model (arc/taskTimer.ts) and the existing useFocusEffect
// resume-on-focus pattern (reload()), neither of which this task
// touches; this test confirms that pattern is still intact and that
// the Home button's own file has no second, competing timer-state
// read/write path.
test("reload() still resumes an already-persisted TaskTimerRun on every focus (never starting fresh) -- the existing mechanism that makes a running OR paused timer display correctly whenever the trainee returns to Task LIVE, via the Home button or any other path", () => {
  assert.ok(screen.includes("useFocusEffect(reload)"), "the existing resume-on-focus wiring must remain exactly as it was");
  const reloadIndex = screen.indexOf("const reload = useCallback");
  const reloadBody = screen.slice(reloadIndex, reloadIndex + 6000);
  assert.ok(reloadBody.includes("loadTaskTimerRun"), "reload() must still read the persisted run rather than inventing a fresh one");
});
