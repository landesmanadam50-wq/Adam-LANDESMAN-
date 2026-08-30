/**
 * arc/dwellTimes.ts
 *
 * Personal, per-ARC-state dwell times: how long a trainee wants to
 * remain in each of five experiential LIVE stages AFTER that stage's
 * own instruction/explanation has already finished revealing --
 * distinct from, and layered strictly after, arc/instructionTiming.ts's
 * existing instruction-reveal timing (never touched by this file).
 * Configured per ARC Map (the state layer's own around
 * supportiveState/interferingState, and the identity layer's own around
 * desiredIdentity/identityInterferingEmotion -- see arc/types.ts's
 * ArcBuildProfile.stateDwellTimes/identityDwellTimes), never one shared
 * global value: a trainee can configure "תשוקה" differently from
 * "פיזור". The habit layer has no ARC Map of its own (see
 * arc/arcEngine.ts's resolveEncodingTarget) and so always resolves to
 * DEFAULT_DWELL_TIMES below, exactly like a state/identity map that was
 * never customized.
 *
 * Centralized here as the one place LIVE resolves a dwell duration --
 * arc/stageCopy.ts (stay/regulate/encode/act-imagery, via
 * resolveDwellSecondsFor) and live/ArcLiveRenderer.tsx (Accept's
 * sub-flow, resolved once and passed down to live/screens.tsx's
 * AcceptScreen) are the only callers, so no screen ever hard-codes a
 * dwell duration of its own or accidentally reads a DIFFERENT target's
 * configuration.
 *
 * Legacy/default handling: a profile stored before this feature existed
 * has stateDwellTimes/identityDwellTimes missing entirely (`undefined`
 * once JSON.parse'd), and a profile that visited BUILD-ARC before this
 * step existed but never re-saved has it `null`. resolveDwellSecondsFor
 * treats both, and a missing individual field within an otherwise-
 * customized set, identically: fall back to DEFAULT_DWELL_TIMES, field
 * by field. No migration step is needed at load time --
 * data/storage.ts's loadProfile stays exactly as it already is (plain
 * JSON.parse, no per-field backfill), matching every other optional
 * ArcBuildProfile field added after the fact (e.g.
 * stateEncodingRegulationCue).
 */

import type { ArcBuildProfile, DevelopmentLayer, DwellTimes } from "./types.ts";
import type { InstructionSegment } from "./instructionTiming.ts";

/** Sensible defaults applied whenever a target has no customized value of its own -- see the module doc's example ("תשוקה" vs "פיזור" configured differently) and README/spec section B. */
export const DEFAULT_DWELL_TIMES: DwellTimes = {
  sensationDwellSeconds: 8,
  acceptanceDwellSeconds: 8,
  regulationDwellSeconds: 12,
  encodingDwellSeconds: 10,
  actionImageryDwellSeconds: 8,
};

/**
 * Reasonable bounds a configured dwell value must fall within --
 * prevents a zero/negative value from collapsing a stage's minimum
 * experiential time to nothing (defeating the whole point of a
 * post-instruction dwell period), and an absurdly large one from
 * effectively trapping the trainee on a screen.
 */
export const MIN_DWELL_SECONDS = 1;
export const MAX_DWELL_SECONDS = 120;

export function isValidDwellSeconds(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= MIN_DWELL_SECONDS && value <= MAX_DWELL_SECONDS;
}

/**
 * Clamps to the valid range, rounding a fractional value first -- used
 * by BUILD-ARC's compact seconds input so a trainee can never save a
 * dwell value that would break the flow (negative, zero, or
 * unreasonably large). `fallback` (normally DEFAULT_DWELL_TIMES' own
 * value for that field) is used only for a genuinely non-finite input
 * (e.g. an emptied/unparseable text field) -- an out-of-range but
 * otherwise valid number is clamped into range, never silently
 * discarded.
 */
export function clampDwellSeconds(value: number, fallback: number = MIN_DWELL_SECONDS): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_DWELL_SECONDS, Math.max(MIN_DWELL_SECONDS, Math.round(value)));
}

/**
 * Resolves the CURRENT layer's dwell configuration -- state and
 * identity each have their own, independently editable set (parallel to
 * arc/arcEngine.ts's resolveTargetPreventiveAction/
 * resolveEncodingRegulationCue); habit has none of its own and always
 * resolves to the defaults, exactly like a state/identity map that was
 * never customized. Missing/undefined/null overrides, or a missing
 * individual field within an otherwise-customized set (e.g. a legacy
 * partial save), all fall back to DEFAULT_DWELL_TIMES field by field --
 * never left undefined, and never mixed between layers.
 */
export function resolveDwellSecondsFor(kind: keyof DwellTimes, layer: DevelopmentLayer, profile: ArcBuildProfile): number {
  const overrides = layer === "state" ? profile.stateDwellTimes : layer === "identity" ? profile.identityDwellTimes : null;
  return overrides?.[kind] ?? DEFAULT_DWELL_TIMES[kind];
}

/**
 * Appends ONE trailing, empty-text dwell segment after a stage's own
 * (unchanged) instruction segments -- the experiential time AFTER the
 * instruction has finished, never baked into any individual segment's
 * own duration, and never appended more than once per stage's segments
 * array (so a dwell period is never added twice for the same
 * instruction sequence -- see arc/stageCopy.ts's callers).
 *
 * This is also the clean "instruction completed -> dwell begins"
 * boundary future AI voice can replace the text-timing side of without
 * touching this dwell mechanism at all: today the boundary is "the last
 * instruction segment's own durationSeconds elapses" (estimated text-
 * reveal pacing); a future voice-driven caller would instead mount this
 * same trailing segment once its own instruction audio's didJustFinish
 * fires, whatever real duration that turned out to be -- no word-count-
 * based estimate, no new timing primitive, no change to this function
 * or to getInstructionTimingStatus (arc/instructionTiming.ts), which
 * already treats the whole segments array as one uniform timeline.
 */
export function withTrailingDwellSegment(segments: InstructionSegment[], dwellSeconds: number): InstructionSegment[] {
  return [...segments, { text: "", durationSeconds: dwellSeconds }];
}
