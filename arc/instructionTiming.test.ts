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

test("every Encoding step's duration is its previous 4-second duration plus exactly +7s (preserved, unreplaced) -- the dwell-time task removed the +15s UX/timing-update increase from Encoding (and the four other configurable-dwell stages), replaced by arc/stageCopy.ts appending the CURRENT target's own configured Encoding dwell as a trailing segment instead (arc/dwellTimes.ts) -- never baked into these per-piece durations", () => {
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
      `${key} must be its previous ${PREVIOUS_ENCODING_SECONDS}s duration plus the preserved +${ENCODING_INCREASE_SECONDS}s, with no flat experiential increase baked in any more`
    );
    assert.equal(INSTRUCTION_TIMING[key], 11);
  }
});

test("the three ARC Thought/Presence stages still carry the +15s UX/timing-update increase (Presence is untouched by the dwell-time task); the five now-configurable-dwell stages (Stay/Regulation/Encoding/Action-Imagery) reverted to their base, pre-increase durations, with a personal dwell appended separately instead (arc/dwellTimes.ts); the real Action Timer isn't part of this table at all", () => {
  const EXPERIENTIAL_TIME_INCREASE_SECONDS = 15;
  const presenceValues: Record<string, number> = {
    arcThoughtAwareness: 5,
    arcThoughtCombinedAttention: 5,
    arcThoughtExpandPresence: 5,
  };
  for (const [key, previousValue] of Object.entries(presenceValues)) {
    assert.equal(
      INSTRUCTION_TIMING[key as keyof typeof INSTRUCTION_TIMING],
      previousValue + EXPERIENTIAL_TIME_INCREASE_SECONDS,
      `${key} (Presence) must still be its previous ${previousValue}s duration plus exactly +${EXPERIENTIAL_TIME_INCREASE_SECONDS}s`
    );
  }
  const dwellStageBaseValues: Record<string, number> = {
    stayCurrentSensation: 4,
    stayNaturalBreath: 8,
    regulate: 10,
    actionImagery: 5,
  };
  for (const [key, baseValue] of Object.entries(dwellStageBaseValues)) {
    assert.equal(
      INSTRUCTION_TIMING[key as keyof typeof INSTRUCTION_TIMING],
      baseValue,
      `${key} must be back to its base ${baseValue}s -- the flat +15s it used to carry is now served by a personal, per-ARC-state configurable dwell instead`
    );
  }
  // The real Action Timer (Beneficial Action / Success Focus / Negative
  // Action) is governed entirely by arc/actionTimer.ts and
  // program/engine.ts's resolveNegativeActionDuration -- neither reads
  // from, nor is configured in, this INSTRUCTION_TIMING table at all,
  // so there is nothing here that could have picked up this increase by
  // mistake.
  assert.ok(!("actionDuration" in INSTRUCTION_TIMING));
  assert.ok(!("successFocusDuration" in INSTRUCTION_TIMING));
  assert.ok(!("negativeActionDuration" in INSTRUCTION_TIMING));
});

test("the inline-rating reveal delay is a distinct, unaffected constant from the +15s experiential-time increase -- still exactly 15s, never itself increased", () => {
  assert.equal(INLINE_RATING_REVEAL_DELAY_SECONDS, 15);
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

// --- UX/timing-update task: progressive text accumulation. live/screens.tsx's
// RevealedInstructionLines renders each visibleSegments entry as its OWN
// line, keyed by its position in that array. That's only correct --
// previous lines never resize, replace, or replay their entrance
// animation as a new one is appended -- if visibleSegments is always a
// STABLE, GROWING PREFIX of the same underlying segments as elapsed
// time increases: an already-revealed segment must keep the exact same
// array position and the exact same object identity forever, never
// reordered, replaced, or dropped. These tests pin that invariant
// explicitly against a real multi-segment stage's own copy/timing (not
// just a synthetic example), since it's what the whole "gradually
// constructed page" UX depends on -- this project has no React
// rendering harness to test the animation/mount behavior itself
// directly (node --test, not Jest/RTL).

test("visibleSegments is always a stable, growing prefix as elapsed time increases -- an already-revealed segment keeps the exact same array position and object identity forever, never reordered or replaced", () => {
  const segments: InstructionSegment[] = [
    { text: "line one", durationSeconds: 4 },
    { text: "line two", durationSeconds: 8 },
    { text: "line three", durationSeconds: 6 },
  ];

  const atT0 = getInstructionTimingStatus(segments, 0).visibleSegments;
  const atT4 = getInstructionTimingStatus(segments, 4).visibleSegments;
  const atT12 = getInstructionTimingStatus(segments, 12).visibleSegments;
  const atT100 = getInstructionTimingStatus(segments, 100).visibleSegments;

  assert.deepEqual(atT0.map((s) => s.text), ["line one"]);
  assert.deepEqual(atT4.map((s) => s.text), ["line one", "line two"]);
  assert.deepEqual(atT12.map((s) => s.text), ["line one", "line two", "line three"]);
  assert.deepEqual(atT100.map((s) => s.text), ["line one", "line two", "line three"], "never grows beyond the real segment count");

  // Not just equal text -- the SAME object reference, at the SAME index,
  // at every later time point (this is what makes key={index} safe: a
  // previously-mounted RevealedLine's key never points at a different
  // segment later).
  assert.equal(atT4[0], atT0[0], "segment 0 is the identical object once revealed, unaffected by segment 1 joining");
  assert.equal(atT12[0], atT0[0]);
  assert.equal(atT12[1], atT4[1], "segment 1 is the identical object once revealed, unaffected by segment 2 joining");
});

test("progressive reveal works identically against a real multi-segment stage's own production copy (Stay, now 4s+8s -- the dwell-time task reverted these to their base durations, with a personal dwell appended separately) -- confirming the growing-prefix guarantee holds for actual LIVE content, not just a synthetic example", () => {
  const stayText1 = "הישאר עם התחושה כפי שהיא עכשיו, בלי לנסות לשנות אותה.";
  const stayText2 = "שים לב גם לנשימה כפי שהיא מתרחשת מעצמה.";
  const segments: InstructionSegment[] = [
    { text: stayText1, durationSeconds: INSTRUCTION_TIMING.stayCurrentSensation },
    { text: stayText2, durationSeconds: INSTRUCTION_TIMING.stayNaturalBreath },
  ];
  assert.equal(INSTRUCTION_TIMING.stayCurrentSensation, 4, "sanity: base 4s, the +15s UX/timing-update increase no longer applies here");
  assert.equal(INSTRUCTION_TIMING.stayNaturalBreath, 8, "sanity: base 8s, the +15s UX/timing-update increase no longer applies here");

  const beforeBreathJoins = getInstructionTimingStatus(segments, INSTRUCTION_TIMING.stayCurrentSensation - 0.1);
  assert.deepEqual(beforeBreathJoins.visibleSegments.map((s) => s.text), [stayText1], "only the first line is up, one tick before the second joins");

  const afterBreathJoins = getInstructionTimingStatus(segments, INSTRUCTION_TIMING.stayCurrentSensation);
  assert.deepEqual(afterBreathJoins.visibleSegments.map((s) => s.text), [stayText1, stayText2], "the second line joins underneath -- the first line's text is unchanged, not replaced");
  assert.equal(afterBreathJoins.visibleSegments[0], beforeBreathJoins.visibleSegments[0], "the first line stays the identical object once the second joins it");
});
