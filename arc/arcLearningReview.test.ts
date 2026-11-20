import test from "node:test";
import assert from "node:assert/strict";

import {
  advanceArcLearningRecallSessionProgress,
  createArcLearningRecallSessionProgress,
  createArcLearningReviewSchedule,
  deleteArcLearningReviewScheduleFromList,
  generateArcLearningRecallRecordId,
  isArcLearningRecallSessionProgressComplete,
  normalizeArcLearningReviewSchedule,
  recordArcLearningRecall,
  resolveArcLearningRecallHistory,
  resolveArcLearningReviewSchedule,
  resolveCurrentArcLearningRecallInsightId,
  resolveDueArcLearningInsightIds,
  upsertArcLearningReviewScheduleInList,
} from "./arcLearningReview.ts";
import { createArcLearningInsight, setArcLearningInsightMainSentence, setArcLearningInsightWantsToLearn } from "./arcLearningInsight.ts";
import { postponeArcReview } from "./spacedRepetition.ts";

const NOW = "2026-01-10T09:00:00.000Z";
const LATER = "2026-01-10T10:00:00.000Z";

test("generateArcLearningRecallRecordId returns distinct ids", () => {
  assert.notEqual(generateArcLearningRecallRecordId(), generateArcLearningRecallRecordId());
});

test("createArcLearningReviewSchedule carries the given insightId alongside the generic core fields", () => {
  const schedule = createArcLearningReviewSchedule("insight-1", NOW);
  assert.equal(schedule.insightId, "insight-1");
  assert.equal(schedule.mode, "automatic");
  assert.equal(schedule.status, "active");
});

test("recordArcLearningRecall creates a fresh schedule on first recall and appends one history record -- history and schedule can never drift apart since one call writes both", () => {
  const result = recordArcLearningRecall([], [], "insight-1", "good", "r1", NOW);
  assert.equal(result.schedules.length, 1);
  assert.equal(result.schedules[0].insightId, "insight-1");
  assert.equal(result.schedules[0].lastReviewedAt, NOW);
  assert.deepEqual(result.records, [{ id: "r1", insightId: "insight-1", rating: "good", recalledAt: NOW }]);
});

test("recordArcLearningRecall on a second recall updates the SAME schedule record (never a duplicate) and appends a second history record, preserving the first", () => {
  const first = recordArcLearningRecall([], [], "insight-1", "good", "r1", NOW);
  const second = recordArcLearningRecall(first.schedules, first.records, "insight-1", "easy", "r2", LATER);
  assert.equal(second.schedules.length, 1, "must never create a second schedule for the same insight");
  assert.equal(second.schedules[0].lastReviewedAt, LATER);
  assert.equal(second.records.length, 2);
  assert.deepEqual(resolveArcLearningRecallHistory(second.records, "insight-1").map((r) => r.rating), ["good", "easy"]);
});

test("recordArcLearningRecall keeps separate insights' schedules/history fully independent", () => {
  const first = recordArcLearningRecall([], [], "insight-1", "good", "r1", NOW);
  const second = recordArcLearningRecall(first.schedules, first.records, "insight-2", "forgot", "r2", LATER);
  assert.equal(second.schedules.length, 2);
  assert.deepEqual(resolveArcLearningRecallHistory(second.records, "insight-1").map((r) => r.id), ["r1"]);
  assert.deepEqual(resolveArcLearningRecallHistory(second.records, "insight-2").map((r) => r.id), ["r2"]);
});

test("upsertArcLearningReviewScheduleInList/deleteArcLearningReviewScheduleFromList/resolveArcLearningReviewSchedule key strictly by insightId", () => {
  const s1 = createArcLearningReviewSchedule("insight-1", NOW);
  const s2 = createArcLearningReviewSchedule("insight-2", NOW);
  let list = upsertArcLearningReviewScheduleInList([s1], s2);
  assert.equal(list.length, 2);
  assert.equal(resolveArcLearningReviewSchedule(list, "insight-2")?.insightId, "insight-2");
  list = deleteArcLearningReviewScheduleFromList(list, "insight-1");
  assert.equal(resolveArcLearningReviewSchedule(list, "insight-1"), null);
});

test("ArcLearningRecallSessionProgress: starts at index 0, advances one at a time, and reports complete only once every queued insight has been passed", () => {
  let progress = createArcLearningRecallSessionProgress(["i1", "i2", "i3"], NOW);
  assert.equal(resolveCurrentArcLearningRecallInsightId(progress), "i1");
  assert.equal(isArcLearningRecallSessionProgressComplete(progress), false);

  progress = advanceArcLearningRecallSessionProgress(progress);
  assert.equal(resolveCurrentArcLearningRecallInsightId(progress), "i2");

  progress = advanceArcLearningRecallSessionProgress(progress);
  progress = advanceArcLearningRecallSessionProgress(progress);
  assert.equal(resolveCurrentArcLearningRecallInsightId(progress), null);
  assert.equal(isArcLearningRecallSessionProgressComplete(progress), true);
});

function makeReadyInsight(id: string): ReturnType<typeof createArcLearningInsight> {
  return setArcLearningInsightMainSentence(setArcLearningInsightWantsToLearn(createArcLearningInsight(id, "raw", NOW), true, NOW), "sentence", NOW);
}

test("resolveDueArcLearningInsightIds: excludes insights not ready for recall, includes a ready insight with no schedule yet (section 2 step 6's own 'initial active recall')", () => {
  const notReady = createArcLearningInsight("i1", "raw", NOW);
  const neverReviewed = makeReadyInsight("i2");
  assert.deepEqual(resolveDueArcLearningInsightIds([notReady, neverReviewed], [], new Date(NOW)), ["i2"]);
});

test("resolveDueArcLearningInsightIds: excludes a ready insight whose schedule is not yet due, includes one that is overdue", () => {
  const upcoming = makeReadyInsight("i1");
  const overdue = makeReadyInsight("i2");
  const upcomingSchedule = { ...createArcLearningReviewSchedule("i1", NOW), nextDueAt: "2099-01-01T00:00:00.000Z" };
  const overdueSchedule = { ...createArcLearningReviewSchedule("i2", NOW), nextDueAt: "2000-01-01T00:00:00.000Z" };
  assert.deepEqual(resolveDueArcLearningInsightIds([upcoming, overdue], [upcomingSchedule, overdueSchedule], new Date(NOW)), ["i2"]);
});

test("resolveDueArcLearningInsightIds: a manual postponement defers due-ness, same as the regular schedule resolver", () => {
  const insight = makeReadyInsight("i1");
  const overdueSchedule = { ...createArcLearningReviewSchedule("i1", NOW), nextDueAt: "2000-01-01T00:00:00.000Z" };
  const postponed = postponeArcReview(overdueSchedule, "2099-01-01T00:00:00.000Z", NOW);
  assert.deepEqual(resolveDueArcLearningInsightIds([insight], [postponed], new Date(NOW)), []);
});

test("normalizeArcLearningReviewSchedule backfills generic fields while preserving insightId", () => {
  const legacy = { insightId: "insight-1" } as unknown as ReturnType<typeof createArcLearningReviewSchedule>;
  const normalized = normalizeArcLearningReviewSchedule(legacy, NOW);
  assert.equal(normalized.insightId, "insight-1");
  assert.equal(normalized.mode, "automatic");
  assert.equal(normalized.status, "active");
});
