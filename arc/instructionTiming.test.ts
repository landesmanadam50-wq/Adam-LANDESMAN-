import test from "node:test";
import assert from "node:assert/strict";

import { getInstructionTimingStatus, INLINE_RATING_REVEAL_DELAY_SECONDS, INSTRUCTION_TIMING } from "./instructionTiming.ts";
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

// --- Timing-update task: every individual Encoding step's duration is
// exactly +7s over its previous (4s) duration -- never applied to any
// non-Encoding stage's timing.

test("every Encoding step's duration is exactly 7 seconds more than its previous 4-second duration", () => {
  const PREVIOUS_ENCODING_SECONDS = 4;
  const ENCODING_INCREASE_SECONDS = 7;
  for (const key of [
    "encodeUpdatedSensation",
    "encodeShortRegulationCue",
    "encodeBodyLanguageCue",
    "encodeIdentityMantra",
    "encodeFallback",
  ] as const) {
    assert.equal(
      INSTRUCTION_TIMING[key],
      PREVIOUS_ENCODING_SECONDS + ENCODING_INCREASE_SECONDS,
      `${key} must be its previous ${PREVIOUS_ENCODING_SECONDS}s duration plus exactly ${ENCODING_INCREASE_SECONDS}s, not a value that replaced it`
    );
    assert.equal(INSTRUCTION_TIMING[key], 11);
  }
});

test("no non-Encoding stage's duration was touched by the Encoding +7s increase", () => {
  assert.equal(INSTRUCTION_TIMING.arcThoughtAwareness, 5);
  assert.equal(INSTRUCTION_TIMING.arcThoughtCombinedAttention, 5);
  assert.equal(INSTRUCTION_TIMING.arcThoughtExpandPresence, 5);
  assert.equal(INSTRUCTION_TIMING.stayCurrentSensation, 4);
  assert.equal(INSTRUCTION_TIMING.stayNaturalBreath, 8);
  assert.equal(INSTRUCTION_TIMING.regulate, 10);
  assert.equal(INSTRUCTION_TIMING.actionImagery, 5);
  assert.equal(INSTRUCTION_TIMING.actionPreparation, 4);
});

// --- Timing-update task: the inline-rating reveal gate. The merged
// Presence/Regulation pages (arc/stageCopy.ts) each append one trailing,
// empty-text segment of INLINE_RATING_REVEAL_DELAY_SECONDS on top of
// their own real instruction segment(s) -- getInstructionTimingStatus's
// existing `complete` flag is what live/screens.tsx's
// PresenceExperienceScreen/RegulationScreen gate the inline rating's
// visibility on, so these tests exercise that exact shape directly.

test("the inline rating stays hidden (not complete) for the entire base instruction duration -- it only reveals after the additional 15s on top", () => {
  const instructionDurationSeconds = 5;
  const segments: InstructionSegment[] = [
    { text: "widen the visual field", durationSeconds: instructionDurationSeconds },
    { text: "", durationSeconds: INLINE_RATING_REVEAL_DELAY_SECONDS },
  ];

  const atInstructionEnd = getInstructionTimingStatus(segments, instructionDurationSeconds);
  assert.equal(atInstructionEnd.complete, false, "instruction time alone must not reveal the rating");

  const midway = getInstructionTimingStatus(segments, instructionDurationSeconds + INLINE_RATING_REVEAL_DELAY_SECONDS - 0.1);
  assert.equal(midway.complete, false, "still hidden one tick before the full instruction+15s has elapsed");

  const revealed = getInstructionTimingStatus(segments, instructionDurationSeconds + INLINE_RATING_REVEAL_DELAY_SECONDS);
  assert.equal(revealed.complete, true, "revealed exactly once instruction time PLUS the additional 15s have both elapsed");
});

test("the trailing rating-reveal-delay segment never contributes visible text -- only the real instruction segment(s) do", () => {
  const segments: InstructionSegment[] = [
    { text: "notice the sensation now", durationSeconds: 10 },
    { text: "", durationSeconds: INLINE_RATING_REVEAL_DELAY_SECONDS },
  ];
  const status = getInstructionTimingStatus(segments, 10 + INLINE_RATING_REVEAL_DELAY_SECONDS);
  const visibleText = status.visibleSegments
    .map((s) => s.text)
    .filter((t) => t.length > 0)
    .join(" ");
  assert.equal(visibleText, "notice the sensation now");
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
