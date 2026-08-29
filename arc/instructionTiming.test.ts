import test from "node:test";
import assert from "node:assert/strict";

import { getInstructionTimingStatus } from "./instructionTiming.ts";
import type { InstructionSegment } from "./instructionTiming.ts";

test("a single segment is visible from t=0 and stays incomplete until its duration elapses", () => {
  const segments: InstructionSegment[] = [{ text: "a", durationSeconds: 5 }];
  const before = getInstructionTimingStatus(segments, 0);
  assert.deepEqual(before.visibleSegments, segments);
  assert.equal(before.complete, false);

  const mid = getInstructionTimingStatus(segments, 3);
  assert.equal(mid.complete, false);

  const done = getInstructionTimingStatus(segments, 5);
  assert.equal(done.complete, true, "complete exactly at the duration, not only after it");
});

test("the exact 4s + 8s = 12s worked example: segment 2 joins at t=4, complete only at t=12", () => {
  const segments: InstructionSegment[] = [
    { text: "הישאר עם התחושה כפי שהיא עכשיו, בלי לנסות לשנות אותה.", durationSeconds: 4 },
    { text: "שים לב גם לנשימה כפי שהיא מתרחשת מעצמה.", durationSeconds: 8 },
  ];

  const t0 = getInstructionTimingStatus(segments, 0);
  assert.deepEqual(t0.visibleSegments, [segments[0]], "only segment 1 before t=4");
  assert.equal(t0.complete, false);

  const t3 = getInstructionTimingStatus(segments, 3.9);
  assert.deepEqual(t3.visibleSegments, [segments[0]], "segment 2 must not appear before t=4");

  const t4 = getInstructionTimingStatus(segments, 4);
  assert.deepEqual(t4.visibleSegments, segments, "segment 2 joins exactly at t=4");
  assert.equal(t4.complete, false, "not complete yet -- only 4 of the required 12 seconds have elapsed");

  const t11 = getInstructionTimingStatus(segments, 11.9);
  assert.equal(t11.complete, false);

  const t12 = getInstructionTimingStatus(segments, 12);
  assert.equal(t12.complete, true, "complete exactly at 4+8=12 seconds");
  assert.equal(t12.totalDurationSeconds, 12);
});

test("revealed segments are cumulative -- nothing already shown ever disappears as elapsed grows", () => {
  const segments: InstructionSegment[] = [
    { text: "a", durationSeconds: 4 },
    { text: "b", durationSeconds: 4 },
    { text: "c", durationSeconds: 4 },
  ];
  const atEnd = getInstructionTimingStatus(segments, 7);
  assert.deepEqual(atEnd.visibleSegments, [segments[0], segments[1]], "segment 3 (starting at cumulative=8) isn't visible yet at t=7");
  const wellPastEnd = getInstructionTimingStatus(segments, 100);
  assert.deepEqual(wellPastEnd.visibleSegments, segments, "elapsed far beyond the total still shows every segment, none dropped");
  assert.equal(wellPastEnd.complete, true);
});

test("an empty segments array is trivially complete from t=0, with nothing to show -- the 'no cue configured, skip cleanly' case", () => {
  const status = getInstructionTimingStatus([], 0);
  assert.deepEqual(status.visibleSegments, []);
  assert.equal(status.totalDurationSeconds, 0);
  assert.equal(status.complete, true);
});

test("different stages can use entirely different segment counts and durations without interfering with each other", () => {
  const arcThought = getInstructionTimingStatus([{ text: "x", durationSeconds: 5 }], 5);
  const encoding = getInstructionTimingStatus(
    [
      { text: "1", durationSeconds: 4 },
      { text: "2", durationSeconds: 4 },
      { text: "3", durationSeconds: 4 },
      { text: "4", durationSeconds: 4 },
    ],
    5
  );
  assert.equal(arcThought.complete, true, "a 5s single-segment stage completes at t=5");
  assert.equal(encoding.complete, false, "a 16s four-segment stage is nowhere near complete at t=5");
});
