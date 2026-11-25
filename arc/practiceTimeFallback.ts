/**
 * arc/practiceTimeFallback.ts
 *
 * ARCHI -- Body-Sensation Discovery & Four-Component Learning task,
 * section 9: when time is short and further practice won't fit, the
 * trainee must never be trapped in forced repeated practice before
 * being "allowed" to start. This module is the one pure decision of
 * which quick-exit options apply -- the actions themselves (act anyway
 * = arc/newArcLiveSteps.ts's bailToComplete; save for later = the
 * screen-level orchestration over arc/arcGym.ts + arc/arcSaving.ts;
 * shrink the task = the already-existing /tasks/[id]/adapt route) live
 * elsewhere, reused as-is, never duplicated here.
 */

export type TimeConstrainedOption = "accept" | "act_anyway" | "save_for_later";

/**
 * "Accept the unpleasant feeling" is always offered -- it is simply the
 * normal short-depth path continuing on its own, never a special case.
 * "Act anyway without improvement" is always offered -- the whole point
 * of this fallback. "Save the case for later ARC Behaviour practice" is
 * always offered too, regardless of whether a sensation was discovered
 * this session -- even a session that found nothing worth saving is
 * still worth queuing for a calmer, better-prepared attempt later.
 * "Focus on available support" is deliberately NOT a fourth option here
 * -- it is exactly the suggested-sensation chip row already shown
 * during the body-work step itself (arc/supportiveBodySensation.ts's
 * resolveSuggestedBodySensations), not a separate action.
 */
export function resolveTimeConstrainedOptions(arcPracticeDepth: "full" | "short" | null): TimeConstrainedOption[] {
  if (arcPracticeDepth !== "short") return [];
  return ["accept", "act_anyway", "save_for_later"];
}
