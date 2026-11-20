import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * build/arcReviewScheduling.test.ts
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task,
 * sections 7+8 (fixed weekly + flexible daily planning integration):
 * source-text regression guard for the review-task creation flow -- no
 * React Native component test renderer exists in this codebase, so this
 * checks the real source text, same convention as every other screen
 * test.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const learningSchedule = readSource("build/ArcLearningScheduleReviewScreen.tsx");
const learningHome = readSource("build/ArcLearningScreen.tsx");
const creativityHome = readSource("build/ArcCreativityScreen.tsx");
const layout = readSource("app/_layout.tsx");

test("ARC Learning home exposes 'תזמון סקירה', routing to its own creation screen; both routes are registered", () => {
  assert.ok(learningHome.includes("🗓️ תזמון סקירה"));
  assert.ok(learningHome.includes('router.push("/arc-learning/schedule-review")'));
  assert.ok(layout.includes('name="arc-learning/schedule-review"'));
});

test("ArcLearningScheduleReviewScreen: creates a Task with taskKind 'arcLearningReview' and the selected topic filter (null for 'כל הנושאים'), then opens the EXISTING generic task editor -- never a second, parallel scheduling form", () => {
  assert.ok(learningSchedule.includes('taskKind: "arcLearningReview" as const,'));
  assert.ok(learningSchedule.includes("arcLearningReviewTopicId: selectedTopicId,"));
  assert.ok(learningSchedule.includes('router.push({ pathname: "/tasks/[id]/edit", params: { id: task.id } });'));
  assert.ok(learningSchedule.includes("await upsertTask(task);"));
  assert.ok(learningSchedule.includes("await reconcileTaskAlarms();"));
});

test("ArcLearningScheduleReviewScreen: 'כל הנושאים' is the default selection (selectedTopicId starts null), and picking a specific topic sets arcLearningReviewTopicId to that topic's id -- never hardcoding a single topic", () => {
  assert.ok(learningSchedule.includes("useState<string | null>(null)"));
  assert.ok(learningSchedule.includes("onPress={() => setSelectedTopicId(topic.id)}"));
});

test("this ONE creation flow serves both the Fixed Weekly Routine and Flexible Daily planning requirements -- it never asks recurring-vs-one-time itself, deferring entirely to the existing task editor's own choice", () => {
  assert.ok(learningSchedule.includes('lets the trainee choose "recurring"'));
  assert.ok(!learningSchedule.includes("recurrence.kind"), "this screen must never itself set/branch on a Task's recurrence -- that stays the editor's own job");
});

test("ARC Creativity home exposes 'תזמון שליפת קשרים', creating a Task with taskKind 'arcCreativityReview' directly (no topic concept) and opening the existing generic task editor", () => {
  assert.ok(creativityHome.includes("🗓️ תזמון שליפת קשרים"));
  const fnIndex = creativityHome.indexOf("async function scheduleReview()");
  const fnBody = creativityHome.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes('taskKind: "arcCreativityReview" as const,'));
  assert.ok(fnBody.includes('router.push({ pathname: "/tasks/[id]/edit", params: { id: task.id } });'));
  assert.ok(fnBody.includes("await upsertTask(task);"));
  assert.ok(fnBody.includes("await reconcileTaskAlarms();"));
});
