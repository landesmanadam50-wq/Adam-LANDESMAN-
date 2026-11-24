import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/postTaskRewardScreen.test.ts
 *
 * Psychology/Smiling/Positive-Reinforcement task: source-text
 * regression guard for the shared post-completion screen's wiring --
 * this codebase has no React Native component test renderer. The pure
 * reward/duration/streak formulas are covered by
 * arc/postTaskRewards.test.ts; the rotating content lists by
 * arc/psychologyFacts.test.ts and arc/positiveImagery.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/PostTaskRewardScreen.tsx");
const route = readSource("app/tasks/[id]/post-task-reward.tsx");
const layout = readSource("app/_layout.tsx");
const todayScreen = readSource("build/TodayScreen.tsx");
const reflectionScreen = readSource("live/SessionReflectionScreen.tsx");
const manifestScreen = readSource("live/ManifestTaskLiveScreen.tsx");

test("the route is registered in app/_layout.tsx and passes id + source straight through, plus (ARC Reminders task) the new toTaskId param for the notification entry's own explicit from/to pair", () => {
  assert.match(layout, /<Stack\.Screen name="tasks\/\[id\]\/post-task-reward"/);
  assert.match(route, /from ["']\.\.\/\.\.\/\.\.\/live\/PostTaskRewardScreen\.tsx["']/);
  assert.ok(route.includes("taskId={id}"));
  assert.ok(route.includes("source={source}"));
  assert.ok(route.includes("toTaskId={toTaskId ?? null}"));
});

test("the reward is recorded exactly once per screen instance, guarded by a ref (never re-fired by a re-render)", () => {
  const effectIndex = screen.indexOf("if (processedRef.current) return;");
  assert.ok(effectIndex !== -1);
  const effectBody = screen.slice(effectIndex, effectIndex + 700);
  assert.ok(effectBody.includes("processedRef.current = true;"));
  assert.ok(effectBody.includes("recordTaskCompletion(base, eventId, today)"));
  assert.ok(effectBody.includes("await savePostTaskRewardsState(result.nextState)"));
});

test("the completion-event id is built via the shared resolveTaskCompletionEventId, never an ad-hoc string -- same idempotency key the pure module's own tests rely on", () => {
  assert.match(screen, /import\s*\{[\s\S]*?resolveTaskCompletionEventId[\s\S]*?\}\s*from\s*["']\.\.\/arc\/postTaskRewards\.ts["']/);
  assert.ok(screen.includes("resolveTaskCompletionEventId(taskId, today)"));
});

test("skipping, pausing, or ending the smiling exercise never touches the already-recorded reward -- the smile-status buttons only ever call local setSmileStatus/setPhase, never re-record or undo anything", () => {
  const blockIndex = screen.indexOf('phase === "smiling"');
  const blockBody = screen.slice(blockIndex, screen.indexOf('phase === "imagery"'));
  assert.ok(blockBody.includes('onPress={() => setSmileStatus("paused")}'));
  assert.ok(blockBody.includes('onPress={() => setSmileStatus("running")}'));
  assert.ok(blockBody.includes('onPress={() => setSmileStatus("done")}'));
  assert.ok(blockBody.includes('onPress={() => setPhase("imagery")}'), "skipping/finishing must advance, never re-touch recordTaskCompletion");
  assert.ok(!blockBody.includes("recordTaskCompletion"), "no button in this block may call recordTaskCompletion a second time");
});

test("the imagery prompt rotates via the shared resolveNextPositiveImageryIndex, persisted separately from the reward state", () => {
  assert.match(screen, /import\s*\{[\s\S]*?resolveNextPositiveImageryIndex[\s\S]*?\}\s*from\s*["']\.\.\/arc\/positiveImagery\.ts["']/);
  assert.ok(screen.includes("resolveNextPositiveImageryIndex(imageryProgress.lastImageryIndex)"));
  assert.ok(screen.includes("await savePositiveImageryProgress({ lastImageryIndex: nextImageryIndex })"));
});

test("the summary phase displays today's smile reward, the current streak, today's total, the lifetime total, and the next task's own reward -- all five required stats, with no points anywhere", () => {
  const summaryIndex = screen.indexOf('phase === "summary"');
  const summaryBody = screen.slice(summaryIndex, screen.indexOf("{phase !== \"summary\""));
  assert.ok(summaryBody.includes("outcome.streakRewardSmiles"));
  assert.ok(summaryBody.includes("outcome.newStreak"));
  assert.ok(summaryBody.includes("outcome.todaySmiles"));
  assert.ok(summaryBody.includes("outcome.totalSmiles"));
  assert.ok(summaryBody.includes("resolveNextStreakReward(outcome.nextState)"));
  assert.ok(!screen.includes("totalPoints") && !screen.includes("todaySmilePoints"), "no points terminology may remain anywhere in this screen");
});

test("source=\"today\" returns to Today (router.back) when finished, never advancing into a different task's own live screen; source=\"tasksList\" returns to the Tasks list; every other source keeps the pre-existing advance-to-next-task behavior", () => {
  const finishIndex = screen.indexOf("async function finish()");
  const finishBody = screen.slice(finishIndex, screen.indexOf("\n  }", finishIndex));
  assert.ok(finishBody.includes('if (source === "today") {'));
  assert.ok(finishBody.includes("router.back();"));
  assert.ok(finishBody.includes('if (source === "tasksList") {'));
  assert.ok(finishBody.includes('router.replace("/tasks");'));
  assert.ok(finishBody.includes("await advanceToNextTask();"));
});

test("a global 'דלג על הכל' link is available on every phase except the summary, calling the same finish() -- the whole screen can always be skipped in one tap, never blocking the next task", () => {
  assert.ok(screen.includes('{phase !== "summary" && ('));
  const linkIndex = screen.indexOf("skipAllLink");
  const linkBody = screen.slice(linkIndex, linkIndex + 150);
  assert.ok(linkBody.includes("onPress={finish}"));
});

// --- Integration: both completion paths reach this screen -----------------

test("Today's quick-complete (build/TodayScreen.tsx) opens this screen with source=\"today\" -- Continuous vs. Spaced Routines task: both the recurring-occurrence and one-time branches now share ONE final navigation (unless a continuous-routine period intercepts it first), rather than each branch duplicating the same push", () => {
  const occurrences = (todayScreen.match(/pathname: "\/tasks\/\[id\]\/post-task-reward", params: \{ id: task\.id, source: "today" \}/g) ?? []).length;
  assert.equal(occurrences, 1, "the non-continuous fallback path is now a single shared navigation, reached after either completion branch");
});

test("the full Task LIVE flow reaches this screen via SessionReflectionScreen's own finish/skip, both calling goToPostTaskReward, never the old direct advance", () => {
  assert.ok(reflectionScreen.includes("function goToPostTaskReward()"));
  const goFnIndex = reflectionScreen.indexOf("function goToPostTaskReward()");
  const goFnBody = reflectionScreen.slice(goFnIndex, goFnIndex + 200);
  assert.ok(goFnBody.includes('pathname: "/tasks/[id]/post-task-reward"'));
  assert.ok(!reflectionScreen.includes("async function advanceToNextTask"), "the old implementation must be fully removed from this screen, not merely unused");
});

test("the Manifest-kind task's own guided run (live/ManifestTaskLiveScreen.tsx's finishRun) also opens this screen, with source=\"tasksList\" to preserve its pre-existing direct-to-Tasks-list destination", () => {
  const fnIndex = manifestScreen.indexOf("async function finishRun()");
  const fnBody = manifestScreen.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes('pathname: "/tasks/[id]/post-task-reward", params: { id: task.id, source: "tasksList" }'));
  assert.ok(!fnBody.includes('router.replace("/tasks");'), "must route through the shared reward screen, never bypass it with the old direct navigation");
});
