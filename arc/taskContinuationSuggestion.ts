/**
 * arc/taskContinuationSuggestion.ts
 *
 * ARCHI -- Adaptive Task Execution & Emotional Persistence task, section
 * 7: "when the user wants to shorten the NEXT continuation segment,
 * suggest half of the LAST work segment by default, editable, with safe
 * rounding so the timer never reaches ~0" (example progression:
 * 30 -> 15 -> 7.5). Deliberately a SEPARATE module from
 * arc/taskSplitPlan.ts's buildSplitPlan: that one divides a KNOWN total
 * duration upfront into N pre-planned parts (floor-per-part, remainder
 * folded onto the last segment) for a To-Do item's own split-session
 * screen; this one repeatedly halves a single JUST-ENDED segment,
 * reactively, once per continuation-loop iteration -- genuinely
 * different math serving a genuinely different moment in the flow.
 */

/** Below this, continuing no longer makes sense as a "shorter work burst" -- the loop's break/finish options exist for that case instead. */
export const MIN_CONTINUATION_SEGMENT_MINUTES = 2;

/** Rounds to the nearest half-minute (so 30 -> 15 -> 7.5 matches the user's own explicit example), then floors at MIN_CONTINUATION_SEGMENT_MINUTES so it can never degenerate toward 0. */
export function suggestNextSegmentMinutes(lastSegmentMinutes: number): number {
  const halved = lastSegmentMinutes / 2;
  const roundedToHalf = Math.round(halved * 2) / 2;
  return Math.max(MIN_CONTINUATION_SEGMENT_MINUTES, roundedToHalf);
}
