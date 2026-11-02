import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyTask, completeTask, postponeTask } from "./tasks.ts";
import { createTaskJournalEntry } from "../data/taskJournal.ts";
import { createReviewLaterFactor } from "./reviewLaterFactor.ts";
import { createEmptyCoachingWorkspaceEntry } from "./coachingWorkspace.ts";
import { buildCoachingSessionPrepSummary, createDefaultVisibleSections } from "./coachingSessionPrep.ts";

const NOW = "2026-01-05T12:00:00.000Z";

test("buildCoachingSessionPrepSummary counts completed/postponed tasks, ARC uses, and successful returns purely from the real records -- never an invented number", () => {
  const completed = completeTask(createEmptyTask("t1", "a", "b", NOW), NOW);
  const postponed = postponeTask(createEmptyTask("t2", "a", "b", NOW), "tired", null, NOW);
  const planned = createEmptyTask("t3", "a", "b", NOW);

  const journal = [
    createTaskJournalEntry({ id: "j1", taskId: "t1", kind: "protocol_run_completed", occurredAt: NOW, createdAt: NOW, returnedToTask: true, interferenceCategory: "emotion" }),
    createTaskJournalEntry({ id: "j2", taskId: "t1", kind: "protocol_run_completed", occurredAt: NOW, createdAt: NOW, returnedToTask: false, interferenceCategory: "emotion" }),
  ];

  const summary = buildCoachingSessionPrepSummary([completed, postponed, planned], journal, [], null);
  assert.equal(summary.completedTasksCount, 1);
  assert.equal(summary.postponedTasksCount, 1);
  assert.equal(summary.arcUsesCount, 2);
  assert.equal(summary.successfulTaskReturnsCount, 1);
  assert.deepEqual(summary.recurringFactors, [{ value: "emotion", count: 2 }]);
});

test("buildCoachingSessionPrepSummary counts new unbuilt factors and reads the latest workspace entry's own success/difficulty/question verbatim", () => {
  const factors = [createReviewLaterFactor("urge", "לבדוק טלפון", "stimulation", null, NOW)];
  const entry = { ...createEmptyCoachingWorkspaceEntry("c1", NOW), success: "סיימתי 3 משימות", difficulty: "קשה להתחיל בבוקר", questionForCoach: "איך לשמור על רצף?" };
  const summary = buildCoachingSessionPrepSummary([], [], factors, entry);
  assert.equal(summary.newUnbuiltFactorsCount, 1);
  assert.equal(summary.latestSuccess, "סיימתי 3 משימות");
  assert.equal(summary.latestDifficulty, "קשה להתחיל בבוקר");
  assert.equal(summary.latestQuestionForCoach, "איך לשמור על רצף?");
});

test("buildCoachingSessionPrepSummary is all zeros/nulls with no data, never a crash", () => {
  const summary = buildCoachingSessionPrepSummary([], [], [], null);
  assert.equal(summary.completedTasksCount, 0);
  assert.equal(summary.arcUsesCount, 0);
  assert.deepEqual(summary.recurringFactors, []);
  assert.equal(summary.latestSuccess, null);
});

test("createDefaultVisibleSections defaults every section to visible -- hiding one is always the trainee's own explicit action", () => {
  const sections = createDefaultVisibleSections();
  assert.equal(sections.tasks, true);
  assert.equal(sections.arcUses, true);
  assert.equal(sections.recurringFactors, true);
  assert.equal(sections.newFactors, true);
  assert.equal(sections.latestEntry, true);
});
