import test from "node:test";
import assert from "node:assert/strict";

import { buildSplitPlan } from "./taskSplitPlan.ts";
import {
  advanceTaskSplitProgress,
  createTaskSplitProgress,
  currentSplitSegment,
  isTaskSplitProgressComplete,
  normalizeTaskSplitProgress,
  resolveCompletedWorkMinutes,
} from "./taskSplitProgress.ts";

test("createTaskSplitProgress starts at the first segment, not complete", () => {
  const segments = buildSplitPlan(30, 3, 5);
  const progress = createTaskSplitProgress("t1", segments);
  assert.equal(progress.activeSegmentIndex, 0);
  assert.equal(isTaskSplitProgressComplete(progress), false);
  assert.deepEqual(currentSplitSegment(progress), segments[0]);
});

test("advanceTaskSplitProgress walks through every segment in order, then reports complete", () => {
  const segments = buildSplitPlan(30, 3, 5); // work, break, work, break, work = 5 segments
  let progress = createTaskSplitProgress("t1", segments);
  for (let i = 0; i < segments.length; i++) {
    assert.equal(isTaskSplitProgressComplete(progress), false);
    assert.deepEqual(currentSplitSegment(progress), segments[i]);
    progress = advanceTaskSplitProgress(progress);
  }
  assert.equal(isTaskSplitProgressComplete(progress), true);
  assert.equal(currentSplitSegment(progress), null);
});

test("advanceTaskSplitProgress never advances past segments.length, even if called again after completion", () => {
  const segments = buildSplitPlan(10, 1, 0); // single work segment
  let progress = createTaskSplitProgress("t1", segments);
  progress = advanceTaskSplitProgress(progress);
  assert.equal(progress.activeSegmentIndex, 1);
  progress = advanceTaskSplitProgress(progress);
  assert.equal(progress.activeSegmentIndex, 1, "clamped, never past segments.length");
});

test("resolveCompletedWorkMinutes counts only WORK segments strictly before the active one, never breaks", () => {
  const segments = buildSplitPlan(30, 3, 5); // 10,break,10,break,10
  let progress = createTaskSplitProgress("t1", segments);
  assert.equal(resolveCompletedWorkMinutes(progress), 0);
  progress = advanceTaskSplitProgress(progress); // past first work segment
  assert.equal(resolveCompletedWorkMinutes(progress), 10);
  progress = advanceTaskSplitProgress(progress); // past the break
  assert.equal(resolveCompletedWorkMinutes(progress), 10, "a break segment contributes nothing");
  progress = advanceTaskSplitProgress(progress); // past second work segment
  assert.equal(resolveCompletedWorkMinutes(progress), 20);
});

test("normalizeTaskSplitProgress backfills a legacy/malformed record defensively", () => {
  const normalized = normalizeTaskSplitProgress({ taskId: "t1" } as any);
  assert.deepEqual(normalized.segments, []);
  assert.equal(normalized.activeSegmentIndex, 0);
});
