import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/stageADAccessibility.test.ts
 *
 * Productivity roadmap, Stage AD: source-text regression guard for the
 * loading-state fixes made during the accessibility/Hebrew-UI-quality
 * pass. Every screen below previously rendered a silent blank View
 * while its async data loaded -- now each shows a visible "טוען..."
 * hint, matching the pattern already used by build/TodayScreen.tsx,
 * build/TaskEditorScreen.tsx, and live/ActiveTaskScreen.tsx before this
 * stage. Touch-target and terminology fixes are also covered here.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const SCREENS_WITH_LOADING_HINT = [
  "live/EmotionIdentificationScreen.tsx",
  "live/NeutralRegulationScreen.tsx",
  "live/SavedFactorChooserScreen.tsx",
  "live/PostponementScreen.tsx",
  "live/SessionReflectionScreen.tsx",
  "live/CoachingWorkspaceScreen.tsx",
  "live/CoachingSessionPrepScreen.tsx",
  "live/TaskInsightsScreen.tsx",
  "build/ArcBuildListScreen.tsx",
  "build/ArcGoalListScreen.tsx",
];

test("Stage AD: every previously-silent loading guard now shows a visible 'טוען...' hint, never a blank screen", () => {
  for (const relativePath of SCREENS_WITH_LOADING_HINT) {
    const source = readSource(relativePath);
    assert.ok(source.includes("טוען..."), `${relativePath} must show a visible loading hint, not a silent blank view`);
    assert.ok(!/style=\{styles\.content\}\s*\/>/.test(source), `${relativePath} must not leave a self-closing, content-less loading View`);
  }
});

test("Stage AD: the active-task subtask completion toggle has an enlarged tap target (hitSlop) around its small glyph", () => {
  const screen = readSource("live/ActiveTaskScreen.tsx");
  const toggleIndex = screen.indexOf("toggleTaskSubtaskCompletion(task, subtask.id");
  const nearbyBefore = screen.slice(Math.max(0, toggleIndex - 300), toggleIndex);
  assert.ok(nearbyBefore.includes("hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}"));
});

test("Stage AD: the presence-rating chips (11 adjacent single-digit targets) meet the ~44pt touch-target guideline", () => {
  const screen = readSource("live/PresenceProtocolScreen.tsx");
  assert.match(screen, /chip:\s*\{[^}]*minWidth:\s*44/);
});

test("Stage AD: the end-of-reflection skip link uses the same plain-verb 'skip' wording as the new-factor-capture skip link, not a different grammatical form", () => {
  const reflection = readSource("live/SessionReflectionScreen.tsx");
  const capture = readSource("live/NewFactorCaptureScreen.tsx");
  assert.ok(reflection.includes(">דלג<"));
  assert.ok(capture.includes(">דלג<"));
  assert.ok(!reflection.includes("דילוג"));
});

test("Stage AD: archiving a task from the editor always requires an explicit confirmation step, mirroring the ARC Build/Goal list screens' own confirm-before-delete convention", () => {
  const editorScreen = readSource("build/TaskEditorScreen.tsx");
  assert.ok(editorScreen.includes("<Modal visible={confirmArchive}"));
  assert.ok(editorScreen.includes("להעביר את המשימה לארכיון?"));
});
