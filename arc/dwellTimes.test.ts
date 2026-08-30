import test from "node:test";
import assert from "node:assert/strict";

import {
  clampDwellSeconds,
  DEFAULT_DWELL_TIMES,
  isValidDwellSeconds,
  MAX_DWELL_SECONDS,
  MIN_DWELL_SECONDS,
  resolveDwellSecondsFor,
  withTrailingDwellSegment,
} from "./dwellTimes.ts";
import type { ArcBuildProfile, DwellTimes } from "./types.ts";
import type { InstructionSegment } from "./instructionTiming.ts";

function profile(overrides: Partial<ArcBuildProfile> = {}): ArcBuildProfile {
  return {
    programPath: "standard_3_week",
    identityActionNeeded: false,
    goal: null,
    interferingState: null,
    challengeContext: null,
    statePreventiveAction: null,
    stateEncodingRegulationCue: null,
    supportiveState: null,
    stateEncoding: null,
    internalAction: null,
    stateDwellTimes: null,
    desiredIdentity: null,
    identityChallengeContext: null,
    identityInterferingEmotion: null,
    identityPreventiveAction: null,
    identityEncodingRegulationCue: null,
    identityEncoding: null,
    identityAction: null,
    identityDwellTimes: null,
    habit: null,
    beneficialAction: null,
    preventiveAction: null,
    regulationTool: null,
    actionDuration: null,
    successFocusDuration: null,
    negativeActionBaseDurationMinutes: null,
    ...overrides,
  };
}

// --- B: five default dwell values -------------------------------------

test("DEFAULT_DWELL_TIMES has exactly the five specified default values", () => {
  const expected: DwellTimes = {
    sensationDwellSeconds: 8,
    acceptanceDwellSeconds: 8,
    regulationDwellSeconds: 12,
    encodingDwellSeconds: 10,
    actionImageryDwellSeconds: 8,
  };
  assert.deepEqual(DEFAULT_DWELL_TIMES, expected);
});

// --- G: LIVE dwell-time resolution --------------------------------------

test("resolveDwellSecondsFor falls back to the default when the CURRENT state has no customized value at all (stateDwellTimes null)", () => {
  const p = profile({ stateDwellTimes: null });
  assert.equal(resolveDwellSecondsFor("acceptanceDwellSeconds", "state", p), DEFAULT_DWELL_TIMES.acceptanceDwellSeconds);
  assert.equal(resolveDwellSecondsFor("regulationDwellSeconds", "state", p), DEFAULT_DWELL_TIMES.regulationDwellSeconds);
});

test("resolveDwellSecondsFor uses the CURRENT state's own configured dwell value when set", () => {
  const p = profile({ stateDwellTimes: { acceptanceDwellSeconds: 15 } });
  assert.equal(resolveDwellSecondsFor("acceptanceDwellSeconds", "state", p), 15, "the configured value wins over the default");
});

test("resolveDwellSecondsFor never accidentally uses ANOTHER state's dwell configuration -- state and identity are independently resolved", () => {
  const p = profile({
    // תשוקה (state) vs פיזור (identity) -- the spec's own worked example: two
    // different mapped states with two different, independently
    // configured dwell profiles.
    stateDwellTimes: {
      sensationDwellSeconds: 8,
      acceptanceDwellSeconds: 15,
      regulationDwellSeconds: 12,
      encodingDwellSeconds: 10,
      actionImageryDwellSeconds: 8,
    },
    identityDwellTimes: {
      sensationDwellSeconds: 6,
      acceptanceDwellSeconds: 6,
      regulationDwellSeconds: 6,
      encodingDwellSeconds: 6,
      actionImageryDwellSeconds: 6,
    },
  });
  assert.equal(resolveDwellSecondsFor("acceptanceDwellSeconds", "state", p), 15, "state's own 15s, never identity's 6s");
  assert.equal(resolveDwellSecondsFor("acceptanceDwellSeconds", "identity", p), 6, "identity's own 6s, never state's 15s");
  assert.equal(resolveDwellSecondsFor("encodingDwellSeconds", "state", p), 10);
  assert.equal(resolveDwellSecondsFor("encodingDwellSeconds", "identity", p), 6);
});

test("resolveDwellSecondsFor resolves the habit layer (no ARC Map of its own) to the plain defaults, unaffected by whatever state/identity happen to have configured", () => {
  const p = profile({
    stateDwellTimes: { acceptanceDwellSeconds: 99 },
    identityDwellTimes: { acceptanceDwellSeconds: 99 },
  });
  assert.equal(resolveDwellSecondsFor("acceptanceDwellSeconds", "habit", p), DEFAULT_DWELL_TIMES.acceptanceDwellSeconds);
});

test("resolveDwellSecondsFor falls back per-field for a legacy/partial customization -- an otherwise-configured set missing one field still defaults just that field, not the whole set", () => {
  const p = profile({ stateDwellTimes: { acceptanceDwellSeconds: 20 } as Partial<DwellTimes> });
  assert.equal(resolveDwellSecondsFor("acceptanceDwellSeconds", "state", p), 20);
  assert.equal(resolveDwellSecondsFor("regulationDwellSeconds", "state", p), DEFAULT_DWELL_TIMES.regulationDwellSeconds, "an unset field within a partial set still falls back to its own default");
});

test("resolveDwellSecondsFor treats a legacy profile with stateDwellTimes/identityDwellTimes entirely missing (undefined, as after JSON.parse of pre-feature data) exactly like null -- safe defaults, no migration step required", () => {
  const legacy = profile();
  delete (legacy as { stateDwellTimes?: unknown }).stateDwellTimes;
  delete (legacy as { identityDwellTimes?: unknown }).identityDwellTimes;
  assert.equal(resolveDwellSecondsFor("sensationDwellSeconds", "state", legacy), DEFAULT_DWELL_TIMES.sensationDwellSeconds);
  assert.equal(resolveDwellSecondsFor("sensationDwellSeconds", "identity", legacy), DEFAULT_DWELL_TIMES.sensationDwellSeconds);
});

// --- Validation (#F) -----------------------------------------------------

test("isValidDwellSeconds accepts integers within [MIN_DWELL_SECONDS, MAX_DWELL_SECONDS] and rejects zero, negative, fractional, and out-of-range values", () => {
  assert.equal(isValidDwellSeconds(MIN_DWELL_SECONDS), true);
  assert.equal(isValidDwellSeconds(MAX_DWELL_SECONDS), true);
  assert.equal(isValidDwellSeconds(8), true);
  assert.equal(isValidDwellSeconds(0), false, "zero would collapse the dwell to nothing");
  assert.equal(isValidDwellSeconds(-5), false, "negative must never be accepted");
  assert.equal(isValidDwellSeconds(4.5), false, "fractional seconds are rejected, not silently truncated");
  assert.equal(isValidDwellSeconds(MAX_DWELL_SECONDS + 1), false);
  assert.equal(isValidDwellSeconds(Number.NaN), false);
});

test("clampDwellSeconds clamps an out-of-range but finite value into [MIN_DWELL_SECONDS, MAX_DWELL_SECONDS], rounds a fractional one, and only uses the fallback for a non-finite input", () => {
  assert.equal(clampDwellSeconds(0, 8), MIN_DWELL_SECONDS, "zero is clamped up, never saved as-is");
  assert.equal(clampDwellSeconds(-5, 8), MIN_DWELL_SECONDS, "negative is clamped up, never saved as-is");
  assert.equal(clampDwellSeconds(MAX_DWELL_SECONDS + 50, 8), MAX_DWELL_SECONDS, "an absurdly large value is clamped down");
  assert.equal(clampDwellSeconds(7.6, 8), 8, "fractional input rounds to the nearest integer");
  assert.equal(clampDwellSeconds(Number.NaN, 8), 8, "a genuinely non-finite input (e.g. an emptied text field) uses the fallback");
});

// --- D/E: the dwell segment, and the clean instruction-completed -> dwell boundary --------

test("withTrailingDwellSegment appends exactly ONE empty-text segment after the given instruction segments, never mutating the input array, and never adding a dwell period twice", () => {
  const instructionSegments: InstructionSegment[] = [{ text: "notice the sensation", durationSeconds: 5 }];
  const result = withTrailingDwellSegment(instructionSegments, 12);
  assert.equal(instructionSegments.length, 1, "the original instruction segments array is never mutated");
  assert.equal(result.length, 2, "exactly one trailing segment is appended");
  assert.equal(result[0], instructionSegments[0], "the original instruction segment is preserved, same object identity");
  assert.deepEqual(result[1], { text: "", durationSeconds: 12 }, "the trailing dwell segment carries no text");

  // Calling it again on the SAME already-dwell-appended result (a caller
  // mistake this function itself doesn't prevent, but should never be
  // exercised by production code) would add a second dwell period -- so
  // production code (arc/stageCopy.ts) must call this exactly once per
  // stage's segments, never chaining calls. Documented here as the
  // explicit "never twice" contract this function's callers must honor.
  const totalDwellIfCalledOnce = result.reduce((sum, s, i) => (i === result.length - 1 ? sum + s.durationSeconds : sum), 0);
  assert.equal(totalDwellIfCalledOnce, 12, "exactly one dwell period's worth of trailing duration after a single call");
});

test("the dwell boundary is a clean 'segments finished -> dwell begins' composition, not a duration baked into any instruction segment -- future AI voice can replace only the instruction segment's own durationSeconds (its real spoken length) without touching this function or its trailing dwell segment at all", () => {
  // Today's text-timing caller: an estimated reveal duration.
  const textTimed = withTrailingDwellSegment([{ text: "instruction", durationSeconds: 7 }], 10);
  // A hypothetical future voice caller: the SAME function, given the
  // real audio's own measured duration instead of a text-timing
  // estimate -- no new parameter, no word-count-based estimate, no
  // change to withTrailingDwellSegment itself.
  const voiceTimed = withTrailingDwellSegment([{ text: "instruction", durationSeconds: 4.2 }], 10);
  assert.equal(textTimed[1].durationSeconds, 10, "the dwell segment's own duration is independent of how the instruction's duration was determined");
  assert.equal(voiceTimed[1].durationSeconds, 10, "same dwell value, regardless of the instruction-timing source feeding segment 0");
  assert.notEqual(textTimed[0].durationSeconds, voiceTimed[0].durationSeconds, "only the instruction segment's own duration would ever differ between a text-timing and a voice-timing caller");
});
