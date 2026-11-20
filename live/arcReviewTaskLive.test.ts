import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/arcReviewTaskLive.test.ts
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task,
 * section 9 (review execution through Task LIVE): source-text
 * regression guard for live/ActiveTaskScreen.tsx's own
 * "arcLearningReview"/"arcCreativityReview" performStart branches, and
 * for the two recall screens' own taskId-aware "finish" destinations --
 * no React Native component test renderer exists in this codebase, so
 * this checks the real source text, same convention as every other
 * screen test.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const learningRecall = readSource("build/ArcLearningRecallScreen.tsx");
const creativityRecall = readSource("build/ArcCreativityRecallScreen.tsx");
const layout = readSource("app/_layout.tsx");
const taskLearningReviewRoute = readSource("app/tasks/[id]/arc-learning-review.tsx");
const taskCreativityReviewRoute = readSource("app/tasks/[id]/arc-creativity-review.tsx");

test("performStart has an early 'arcLearningReview' branch (same precedent position as arcFocus, before the generic work-timer fallback), opening the review screen with this task's real id and its own topic filter, and creating no TaskTimerRun", () => {
  const fnIndex = activeTaskScreen.indexOf("async function performStart()");
  const arcFocusIndex = activeTaskScreen.indexOf('task.taskKind === "arcFocus"', fnIndex);
  const learningReviewIndex = activeTaskScreen.indexOf('task.taskKind === "arcLearningReview"', fnIndex);
  const genericFallbackIndex = activeTaskScreen.indexOf("if (task.notificationId) await cancelScheduledNotification(task.notificationId);", fnIndex);
  assert.ok(arcFocusIndex !== -1 && learningReviewIndex !== -1 && genericFallbackIndex !== -1);
  assert.ok(arcFocusIndex < learningReviewIndex && learningReviewIndex < genericFallbackIndex, "the arcLearningReview branch must sit between arcFocus and the generic fallback");
  const branchBody = activeTaskScreen.slice(learningReviewIndex, learningReviewIndex + 300);
  assert.ok(branchBody.includes('router.push({ pathname: "/tasks/[id]/arc-learning-review", params: { id: task.id, topicId: task.arcLearningReviewTopicId ?? undefined } });'));
  assert.ok(branchBody.includes("return;"));
  assert.ok(!branchBody.includes("createTaskTimerRun("));
});

test("performStart has an early 'arcCreativityReview' branch, opening the review screen with this task's real id, and creating no TaskTimerRun", () => {
  const fnIndex = activeTaskScreen.indexOf("async function performStart()");
  const creativityReviewIndex = activeTaskScreen.indexOf('task.taskKind === "arcCreativityReview"', fnIndex);
  const genericFallbackIndex = activeTaskScreen.indexOf("if (task.notificationId) await cancelScheduledNotification(task.notificationId);", fnIndex);
  assert.ok(creativityReviewIndex !== -1 && creativityReviewIndex < genericFallbackIndex);
  const branchBody = activeTaskScreen.slice(creativityReviewIndex, creativityReviewIndex + 250);
  assert.ok(branchBody.includes('router.push({ pathname: "/tasks/[id]/arc-creativity-review", params: { id: task.id } });'));
  assert.ok(!branchBody.includes("createTaskTimerRun("));
});

test("the primary start button labels both review kinds distinctly, same precedent as manifest/arcFocus", () => {
  assert.ok(activeTaskScreen.includes('task.taskKind === "arcLearningReview"'));
  assert.ok(activeTaskScreen.includes('"התחלת שליפה"'));
  assert.ok(activeTaskScreen.includes('task.taskKind === "arcCreativityReview"'));
  assert.ok(activeTaskScreen.includes('"התחלת שליפת קשרים"'));
});

test("both review Task-LIVE routes are registered, pointing at the SAME shared recall screens ARC Learning/ARC Creativity home use directly -- never a second, duplicated recall implementation", () => {
  assert.ok(layout.includes('name="tasks/[id]/arc-learning-review"'));
  assert.ok(layout.includes('name="tasks/[id]/arc-creativity-review"'));
  assert.ok(taskLearningReviewRoute.includes('from "../../../build/ArcLearningRecallScreen.tsx"'));
  assert.ok(taskCreativityReviewRoute.includes('from "../../../build/ArcCreativityRecallScreen.tsx"'));
  assert.ok(taskLearningReviewRoute.includes("<ArcLearningRecallScreen taskId={id} topicId={topicId} />"));
  assert.ok(taskCreativityReviewRoute.includes("<ArcCreativityRecallScreen taskId={id} />"));
});

test("ArcLearningRecallScreen: with a taskId, finishing the queue routes back to /tasks/[id] (never to /arc-learning) so the ordinary task-complete button can invoke the real handleComplete()", () => {
  assert.ok(learningRecall.includes("export default function ArcLearningRecallScreen({ taskId, topicId }: { taskId?: string; topicId?: string }) {"));
  const emptyStateIndex = learningRecall.indexOf("if (!insight) {");
  const emptyStateBody = learningRecall.slice(emptyStateIndex, emptyStateIndex + 500);
  assert.ok(emptyStateBody.includes('taskId ? router.replace({ pathname: "/tasks/[id]", params: { id: taskId } }) : router.replace("/arc-learning")'));
});

test("ArcLearningRecallScreen: a topicId filters which insights are eligible when building a FRESH queue (section 7's per-block topic scoping), but an existing in-progress queue is always resumed as-is regardless of topicId", () => {
  const effectIndex = learningRecall.indexOf("useFocusEffect(");
  const effectBody = learningRecall.slice(effectIndex, effectIndex + 900);
  const existingCheckIndex = effectBody.indexOf("if (existing) {");
  const filterIndex = effectBody.indexOf("topicId ? allInsights.filter((insight) => insight.topicId === topicId) : allInsights");
  assert.ok(existingCheckIndex !== -1 && filterIndex !== -1 && existingCheckIndex < filterIndex, "the resume-existing check must come before the fresh-queue topic filter");
});

test("ArcCreativityRecallScreen: with a taskId, finishing the queue routes back to /tasks/[id] (never to /arc-creativity)", () => {
  assert.ok(creativityRecall.includes("export default function ArcCreativityRecallScreen({ taskId }: { taskId?: string }) {"));
  const emptyStateIndex = creativityRecall.indexOf("if (!connection) {");
  const emptyStateBody = creativityRecall.slice(emptyStateIndex, emptyStateIndex + 500);
  assert.ok(emptyStateBody.includes('taskId ? router.replace({ pathname: "/tasks/[id]", params: { id: taskId } }) : router.replace("/arc-creativity")'));
});

test("neither recall screen, when given a taskId, ever calls completeTask itself -- completion stays exclusively the ordinary Task LIVE button's job (handleComplete is a closure inside live/ActiveTaskScreen.tsx, not importable here)", () => {
  assert.ok(!learningRecall.includes("completeTask("));
  assert.ok(!creativityRecall.includes("completeTask("));
});
