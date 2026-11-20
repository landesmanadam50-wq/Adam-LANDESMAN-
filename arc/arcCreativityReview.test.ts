import test from "node:test";
import assert from "node:assert/strict";

import {
  advanceArcCreativityRecallSessionProgress,
  createArcCreativityRecallSessionProgress,
  createArcCreativityReviewSchedule,
  deleteArcCreativityReviewScheduleFromList,
  generateArcCreativityRecallRecordId,
  isArcCreativityRecallSessionProgressComplete,
  normalizeArcCreativityReviewSchedule,
  recordArcCreativityRecall,
  resolveArcCreativityRecallHistory,
  resolveArcCreativityReviewSchedule,
  resolveCurrentArcCreativityRecallConnectionId,
  resolveDueArcCreativityConnectionIds,
  upsertArcCreativityReviewScheduleInList,
} from "./arcCreativityReview.ts";
import { createArcCreativityConnection } from "./arcCreativityConnection.ts";

const NOW = "2026-01-10T09:00:00.000Z";
const LATER = "2026-01-10T10:00:00.000Z";

test("generateArcCreativityRecallRecordId returns distinct ids", () => {
  assert.notEqual(generateArcCreativityRecallRecordId(), generateArcCreativityRecallRecordId());
});

test("createArcCreativityReviewSchedule carries the given connectionId alongside the generic core fields", () => {
  const schedule = createArcCreativityReviewSchedule("connection-1", NOW);
  assert.equal(schedule.connectionId, "connection-1");
  assert.equal(schedule.mode, "automatic");
});

test("recordArcCreativityRecall creates a fresh schedule/history independent of ARC Learning's own collections -- Mode D's own 'must stay separate' rule", () => {
  const result = recordArcCreativityRecall([], [], "connection-1", "good", "r1", NOW);
  assert.equal(result.schedules.length, 1);
  assert.equal(result.schedules[0].connectionId, "connection-1");
  assert.deepEqual(result.records, [{ id: "r1", connectionId: "connection-1", rating: "good", recalledAt: NOW }]);
});

test("recordArcCreativityRecall on a second recall updates the same schedule and appends a second history record", () => {
  const first = recordArcCreativityRecall([], [], "connection-1", "hard", "r1", NOW);
  const second = recordArcCreativityRecall(first.schedules, first.records, "connection-1", "easy", "r2", LATER);
  assert.equal(second.schedules.length, 1);
  assert.equal(second.schedules[0].lastReviewedAt, LATER);
  assert.deepEqual(resolveArcCreativityRecallHistory(second.records, "connection-1").map((r) => r.rating), ["hard", "easy"]);
});

test("upsertArcCreativityReviewScheduleInList/deleteArcCreativityReviewScheduleFromList/resolveArcCreativityReviewSchedule key strictly by connectionId", () => {
  const s1 = createArcCreativityReviewSchedule("connection-1", NOW);
  const s2 = createArcCreativityReviewSchedule("connection-2", NOW);
  let list = upsertArcCreativityReviewScheduleInList([s1], s2);
  assert.equal(list.length, 2);
  assert.equal(resolveArcCreativityReviewSchedule(list, "connection-2")?.connectionId, "connection-2");
  list = deleteArcCreativityReviewScheduleFromList(list, "connection-1");
  assert.equal(resolveArcCreativityReviewSchedule(list, "connection-1"), null);
});

test("ArcCreativityRecallSessionProgress: starts at index 0, advances one at a time, reports complete once every queued connection has been passed -- a fully separate progress type from ArcLearningRecallSessionProgress", () => {
  let progress = createArcCreativityRecallSessionProgress(["c1", "c2"], NOW);
  assert.equal(resolveCurrentArcCreativityRecallConnectionId(progress), "c1");
  progress = advanceArcCreativityRecallSessionProgress(progress);
  assert.equal(resolveCurrentArcCreativityRecallConnectionId(progress), "c2");
  progress = advanceArcCreativityRecallSessionProgress(progress);
  assert.equal(resolveCurrentArcCreativityRecallConnectionId(progress), null);
  assert.equal(isArcCreativityRecallSessionProgressComplete(progress), true);
});

test("resolveDueArcCreativityConnectionIds: a never-reviewed connection is due immediately, an overdue one is due, an upcoming one is not", () => {
  const neverReviewed = createArcCreativityConnection("c1", "i1", "i2", "קשר", "manual", "possible", NOW);
  const overdue = createArcCreativityConnection("c2", "i3", "i4", "קשר", "manual", "possible", NOW);
  const upcoming = createArcCreativityConnection("c3", "i5", "i6", "קשר", "manual", "possible", NOW);
  const overdueSchedule = { ...createArcCreativityReviewSchedule("c2", NOW), nextDueAt: "2000-01-01T00:00:00.000Z" };
  const upcomingSchedule = { ...createArcCreativityReviewSchedule("c3", NOW), nextDueAt: "2099-01-01T00:00:00.000Z" };
  const due = resolveDueArcCreativityConnectionIds([neverReviewed, overdue, upcoming], [overdueSchedule, upcomingSchedule], new Date(NOW));
  assert.deepEqual(due, ["c1", "c2"]);
});

test("normalizeArcCreativityReviewSchedule backfills generic fields while preserving connectionId", () => {
  const legacy = { connectionId: "connection-1" } as unknown as ReturnType<typeof createArcCreativityReviewSchedule>;
  const normalized = normalizeArcCreativityReviewSchedule(legacy, NOW);
  assert.equal(normalized.connectionId, "connection-1");
  assert.equal(normalized.mode, "automatic");
});
