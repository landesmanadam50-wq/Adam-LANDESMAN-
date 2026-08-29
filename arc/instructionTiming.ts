/**
 * arc/instructionTiming.ts
 *
 * The progressive timed-instruction-reveal system: for "info"-kind LIVE
 * screens (ARC Thought's three sub-stages, Stay/Presence, Regulation,
 * Encoding, and the Action section's Imagery/Preparation sub-phases),
 * a stage's instruction text is split into one or more ordered
 * InstructionSegments, each with its own minimum practice duration.
 * Segments reveal cumulatively (segment 2 appears once segment 1's
 * window elapses; nothing already shown ever disappears), and the
 * screen's Continue action stays unavailable until every segment's
 * duration has elapsed -- see getInstructionTimingStatus.
 *
 * This is INSTRUCTION timing only -- how long a trainee practices with
 * guidance already on screen. It is deliberately a different concept
 * from the Action Timer (arc/actionTimer.ts), which times the actual
 * real-world behavior once it begins. Never conflate the two: a
 * screen's minimum instruction-practice time is never added to
 * actionDuration, and the Action Timer never starts while any
 * instruction segment is still active (see arc/stageCopy.ts's "act"
 * case and arc/arcEngine.ts's resolveActPhase).
 *
 * Durations live here, centrally, rather than hard-coded inside
 * screen components (live/screens.tsx) or duplicated alongside the
 * instruction text -- arc/stageCopy.ts pairs each already-generated
 * line of copy with its duration from this one table as it builds
 * that line, so the instruction TEXT itself is never duplicated: it's
 * generated exactly once, exactly where it already was.
 *
 * No Fade system exists yet anywhere in this codebase (checked before
 * writing this file) -- there is nothing to integrate with and no risk
 * of a competing system today. If/when Fade progression is introduced,
 * it should read/scale these durations (e.g. shorter durations or
 * fewer segments at a more advanced stage) rather than owning a
 * parallel timing mechanism.
 */

export interface InstructionSegment {
  text: string;
  durationSeconds: number;
}

/**
 * Named per stage/piece, not positional: arc/stageCopy.ts's Encoding
 * case, for instance, conditionally includes the Short Encoding
 * Regulation Cue, Body-Language Cue, and Mantra segments depending on
 * what's actually configured for the current target -- a fixed
 * positional array of durations would silently misalign once any one
 * piece is skipped. All example values from the spec; freely tunable,
 * and reused across every profile/session rather than hard-coded per
 * screen.
 */
export const INSTRUCTION_TIMING = {
  arcThoughtAwareness: 5,
  arcThoughtCombinedAttention: 5,
  arcThoughtExpandPresence: 5,
  stayCurrentSensation: 4,
  stayNaturalBreath: 8,
  regulate: 10,
  encodeUpdatedSensation: 4,
  encodeShortRegulationCue: 4,
  encodeBodyLanguageCue: 4,
  encodeIdentityMantra: 4,
  /** The generic "take a moment" fallback line, only shown when nothing else in Encoding was configured for this target. */
  encodeFallback: 4,
  actionImagery: 5,
  actionPreparation: 4,
} as const;

export interface InstructionTimingStatus {
  /** Every segment revealed so far, in order -- cumulative, never shrinks as elapsedSeconds grows. */
  visibleSegments: InstructionSegment[];
  totalDurationSeconds: number;
  /** True once elapsedSeconds has reached the sum of every segment's duration -- this is what gates Continue. */
  complete: boolean;
}

/**
 * Pure function: given a stage's ordered instruction segments and how
 * many seconds have elapsed since the screen was entered, returns
 * which segments are visible right now and whether the trainee has
 * given the full sequence its required minimum practice time.
 *
 * Segment N becomes visible once elapsedSeconds reaches the sum of
 * every PRIOR segment's duration -- e.g. a 4s segment followed by an
 * 8s segment: segment 1 is visible from t=0, segment 2 joins it at
 * t=4, and complete becomes true at t=12 (4+8), never before.
 *
 * An empty segments array is trivially complete from t=0 -- this is
 * how arc/stageCopy.ts's Action Preparation "skip the Body-Language
 * reminder cleanly when none is configured" (no invented content, no
 * forced wait) falls out of the same general mechanism, with no
 * special-casing needed by any caller.
 */
export function getInstructionTimingStatus(segments: InstructionSegment[], elapsedSeconds: number): InstructionTimingStatus {
  const totalDurationSeconds = segments.reduce((sum, segment) => sum + segment.durationSeconds, 0);
  const visibleSegments: InstructionSegment[] = [];
  let cumulative = 0;
  for (const segment of segments) {
    if (cumulative <= elapsedSeconds) {
      visibleSegments.push(segment);
    }
    cumulative += segment.durationSeconds;
  }
  return {
    visibleSegments,
    totalDurationSeconds,
    complete: elapsedSeconds >= totalDurationSeconds,
  };
}
