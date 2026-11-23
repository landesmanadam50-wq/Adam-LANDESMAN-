/**
 * arc/taskSplitPlan.ts
 *
 * ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry "Cubes"
 * task, section 3/4: pure math for "עבודה מחולקת" (split work into N
 * parts with breaks between them), chosen on
 * live/TaskDurationSelectionScreen.tsx before a To-Do task starts.
 * No AsyncStorage, no navigation, no React.
 *
 * Deliberately separate from the EXISTING single-value
 * arc/todoSplitSession.ts (ARC LIVE's own auto-computed, single-chunk
 * "work on part of this now" suggestion) -- that mechanism is left
 * completely untouched and still means exactly what it always has;
 * this module only powers the NEW, explicitly multi-segment,
 * user-chosen plan. The two are reconciled at the UI layer only:
 * "עבודה רציפה" (continuous) mode reuses the existing single-value
 * `splitMinutes` plumbing verbatim, while "עבודה מחולקת" (split) mode
 * is the one case that needs this module's own multi-segment plan,
 * persisted via the sibling arc/taskSplitProgress.ts.
 */

export type SplitPlanSegmentKind = "work" | "break";

export interface SplitPlanSegment {
  kind: SplitPlanSegmentKind;
  /** 0-based index among segments of the SAME kind (first work segment is 0, first break segment is 0, etc.) -- for a "חלק X מתוך N" label that counts work segments only. */
  partIndex: number;
  durationMinutes: number;
}

/**
 * `parts` work segments, each `totalWorkMinutes / parts` minutes
 * (floored), with any remainder minutes folded onto the LAST work
 * segment so the total always sums to exactly `totalWorkMinutes` --
 * never silently dropping or inventing minutes. A `breakMinutes`
 * break segment is inserted between every pair of work segments
 * (never before the first or after the last). `parts < 2` or
 * `breakMinutes <= 0` degrades to a single, plain work segment (the
 * UI's own "עבודה רציפה" mode should prefer the existing
 * splitMinutes plumbing instead of calling this at all, but this
 * function stays safe either way -- never throws on a bad input,
 * always returns a well-formed, minutes-preserving plan).
 */
export function buildSplitPlan(totalWorkMinutes: number, parts: number, breakMinutes: number): SplitPlanSegment[] {
  const safeTotal = Math.max(1, Math.round(totalWorkMinutes));
  const safeParts = Math.max(1, Math.round(parts));
  const safeBreak = Math.max(0, Math.round(breakMinutes));
  if (safeParts === 1 || safeBreak === 0) {
    return [{ kind: "work", partIndex: 0, durationMinutes: safeTotal }];
  }
  const baseMinutesPerPart = Math.floor(safeTotal / safeParts);
  const remainder = safeTotal - baseMinutesPerPart * safeParts;
  const segments: SplitPlanSegment[] = [];
  for (let i = 0; i < safeParts; i++) {
    const isLast = i === safeParts - 1;
    segments.push({ kind: "work", partIndex: i, durationMinutes: baseMinutesPerPart + (isLast ? remainder : 0) });
    if (!isLast) segments.push({ kind: "break", partIndex: i, durationMinutes: safeBreak });
  }
  return segments;
}

/** Work + break minutes combined -- the real wall-clock length of the whole plan, used to clamp against the free time before the next fixed task. */
export function sumSplitPlanMinutes(segments: SplitPlanSegment[]): number {
  return segments.reduce((total, segment) => total + segment.durationMinutes, 0);
}
