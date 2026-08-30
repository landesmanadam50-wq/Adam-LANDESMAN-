/**
 * arc/instructionTiming.ts
 *
 * The progressive timed-instruction-reveal system: for "info"-kind LIVE
 * screens (ARC Thought's three sub-stages, Stay/Presence, Regulation,
 * Encoding, and the Action section's Imagery sub-phase), a stage's
 * instruction text is split into one or more ordered
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
/**
 * Encoding's per-piece base durations before the timing-update task
 * added ENCODING_DURATION_INCREASE_SECONDS on top -- kept as their own
 * named constants so that increase stays one auditable addition rather
 * than five opaque new literals. Every other stage's duration is
 * unaffected by that task and stays a plain literal below.
 */
const ENCODING_BASE_SECONDS = {
  updatedSensation: 4,
  shortRegulationCue: 4,
  bodyLanguageCue: 4,
  identityMantra: 4,
  fallback: 4,
} as const;

/** Timing-update task: every individual Encoding step's duration increases by exactly +7s over its previous duration -- never applied to any non-Encoding stage. Preserved as-is by the later UX/timing update below, which layers its own increase on top rather than replacing this one. */
const ENCODING_DURATION_INCREASE_SECONDS = 7;

/**
 * UX/timing-update task: every LIVE experiential protocol stage's
 * guided-practice duration got an additional +15s on top of whatever it
 * was already configured to. Dwell-time task: for the five stages a
 * trainee can now personally configure a post-instruction dwell time
 * for (Sensation/Awareness = stay, Acceptance = accept, Regulation =
 * regulate, Encoding = encode, Action Imagery = act's imagery
 * sub-phase -- see arc/dwellTimes.ts), this flat +15s was serving
 * exactly the same purpose the new configurable dwell now does more
 * precisely (per-trainee, per-ARC-state) -- so it's removed from those
 * five entries below, replaced by arc/stageCopy.ts appending a
 * withTrailingDwellSegment (arc/dwellTimes.ts) sized from the current
 * ARC state's own configuration, once, after the instruction segments
 * below. It stays fully intact for the three ARC Thought/Presence
 * entries (arcThoughtAwareness/CombinedAttention/ExpandPresence):
 * Presence isn't one of the five configurable dwell categories, and the
 * Presence technique itself is explicitly unchanged by the dwell-time
 * task. Encoding's own separate +7s per-step increase
 * (ENCODING_DURATION_INCREASE_SECONDS) is untouched either way -- it's
 * instruction-reveal pacing, not a post-instruction dwell, so it's
 * outside this task's scope regardless of which stage it's on.
 */
const EXPERIENTIAL_TIME_INCREASE_SECONDS = 15;

export const INSTRUCTION_TIMING = {
  arcThoughtAwareness: 5 + EXPERIENTIAL_TIME_INCREASE_SECONDS,
  arcThoughtCombinedAttention: 5 + EXPERIENTIAL_TIME_INCREASE_SECONDS,
  arcThoughtExpandPresence: 5 + EXPERIENTIAL_TIME_INCREASE_SECONDS,
  stayCurrentSensation: 4,
  stayNaturalBreath: 8,
  regulate: 10,
  encodeUpdatedSensation: ENCODING_BASE_SECONDS.updatedSensation + ENCODING_DURATION_INCREASE_SECONDS,
  encodeShortRegulationCue: ENCODING_BASE_SECONDS.shortRegulationCue + ENCODING_DURATION_INCREASE_SECONDS,
  encodeBodyLanguageCue: ENCODING_BASE_SECONDS.bodyLanguageCue + ENCODING_DURATION_INCREASE_SECONDS,
  encodeIdentityMantra: ENCODING_BASE_SECONDS.identityMantra + ENCODING_DURATION_INCREASE_SECONDS,
  /** The generic "take a moment" fallback line, only shown when nothing else in Encoding was configured for this target. */
  encodeFallback: ENCODING_BASE_SECONDS.fallback + ENCODING_DURATION_INCREASE_SECONDS,
  actionImagery: 5,
} as const;

/**
 * Timing-update task: the additional page-local delay, on top of a
 * screen's own instruction timing, before an inline rating/check that
 * used to live on its own separate page is allowed to reveal on the
 * SAME page -- see arc/stageCopy.ts's "arc_thought_expand_presence" and
 * "regulate" cases (the only two stages this applies to) and
 * live/screens.tsx's PresenceExperienceScreen/RegulationScreen. Modeled
 * as one more trailing, empty-text InstructionSegment appended to those
 * stages' own segments array, so getInstructionTimingStatus's existing
 * `complete` flag -- unchanged -- is the single source of truth for
 * "reveal the rating now" with no new timing primitive needed.
 */
export const INLINE_RATING_REVEAL_DELAY_SECONDS = 15;

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
 * An empty segments array is trivially complete from t=0 -- lets any
 * caller with genuinely nothing to say for a given screen (no invented
 * content, no forced wait) fall out of this same general mechanism,
 * with no special-casing needed here.
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
