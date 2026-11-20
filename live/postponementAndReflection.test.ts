import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/postponementAndReflection.test.ts
 *
 * Productivity roadmap, Stage X: source-text regression guard for the
 * end-of-session reflection screen and its (optional, skippable)
 * entry point.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const layout = readSource("app/_layout.tsx");
const route = readSource("app/tasks/[id]/reflect.tsx");
const screen = readSource("live/SessionReflectionScreen.tsx");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");

test("the reflect route is registered in app/_layout.tsx", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/reflect"/);
});

test("the route passes the id param straight through to SessionReflectionScreen", () => {
  assert.match(route, /from ["']\.\.\/\.\.\/\.\.\/live\/SessionReflectionScreen\.tsx["']/);
  assert.match(route, /<SessionReflectionScreen\s*\n?\s*taskId=\{id\}/);
});

// Alarm-timer integration task, requirement 6: re-linked from
// ActiveTaskScreen's own handleComplete/finishIdentityInsight -- "at
// completion, the appropriate reflection appears, then automatic
// transition to the next task." Previously (Simplified-architecture
// task, Phase 1) this screen was deliberately left registered but
// unreachable from normal navigation; this task reconnects it on
// purpose.
test("ActiveTaskScreen links to the reflection screen from BOTH completion paths -- the plain complete (its own non-continuous fallback AND its continuous-routine summary branch), and after the identity-insight prompt finishes", () => {
  const occurrences = activeTaskScreen.split('pathname: "/tasks/[id]/reflect"').length - 1;
  assert.equal(occurrences, 3, "handleComplete's two branches (continuous-summary, non-continuous fallback) plus finishIdentityInsight");
});

// Psychology/Smiling/Positive-Reinforcement task: "דלג" no longer
// advances directly -- it opens live/PostTaskRewardScreen.tsx (which is
// what now actually performs the "advance to next task" redirect, once
// the trainee finishes/skips that screen's own smiling/imagery exercise).
test("the reflection screen's 'דלג' (skip) action saves nothing, never blocking on an answer, and opens the shared post-task-reward screen -- requirement 6 applies whether or not the trainee answered anything", () => {
  const skipIndex = screen.indexOf("<Pressable style={styles.skipLink}");
  const skipBody = screen.slice(skipIndex, skipIndex + 120);
  assert.ok(skipBody.includes("onPress={goToPostTaskReward}"));
  const goFnIndex = screen.indexOf("function goToPostTaskReward()");
  const goFnBody = screen.slice(goFnIndex, goFnIndex + 200);
  assert.ok(goFnBody.includes('pathname: "/tasks/[id]/post-task-reward"'));
});

test("Unified ARC & Productivity Update task, requirement 5: finishing the reflection saves via the shared saveNewTaskReflection, never the old 'session_reflection' TaskJournalEntry (removed from this screen entirely -- the simplified one-question reflection reuses the pre-existing single-field TaskReflection model instead)", () => {
  assert.match(screen, /import\s*\{\s*saveNewTaskReflection\s*\}\s*from\s*["']\.\.\/data\/taskReflection\.ts["']/);
  assert.ok(!screen.includes('kind: "session_reflection"'), "no new session_reflection journal entry is ever written from this screen any more");
  assert.ok(!screen.includes("appendTaskJournalEntry("), "appendTaskJournalEntry is no longer CALLED from this screen (a doc comment may still mention the function by name)");
});
