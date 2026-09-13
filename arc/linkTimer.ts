/**
 * arc/linkTimer.ts
 *
 * Link timers task (spec section 9): the rehearsal timer for ARC Link /
 * ARCHI ARC Link / Mini ARC Link -- a SEPARATE, self-contained timing
 * concept from arc/actionTimer.ts's engine (the real Beneficial Action /
 * Success Focus / Negative Action timers). Deliberately not built on
 * that module, not persisted via data/storage.ts's TimerRun/TimerType,
 * and never confused with arc/dwellTimes.ts's Presence dwell timing --
 * a Link rehearsal timer only ever measures the trainee's OWN imagined
 * rehearsal, never a real timed activity.
 *
 * "guided" style has no target duration at all -- no countdown
 * pressure, an optional count-up display only, focused on learning the
 * correct sequence (spec 9.1). "speed" style has an optional target
 * countdown (spec 9.2): reaching zero is purely informational --
 * reachedTarget is never used by any caller to disable a button, block
 * navigation, or auto-close the session, and is never portrayed as
 * success/failure.
 */

import type { LinkTimerStyle } from "./routineLinks.ts";

export interface LinkTimerStatus {
  elapsedSeconds: number;
  /** null for "guided" style, or "speed" style with no configured target duration -- there is nothing to count down to. */
  remainingSeconds: number | null;
  /** Purely informational -- see this module's own doc. Never gates anything. */
  reachedTarget: boolean;
}

/**
 * Pure status computation from elapsed seconds -- mirrors
 * arc/actionTimer.ts's getActionTimerStatus in SHAPE only (elapsed-in,
 * status-out), never imported from or shared with it -- see this
 * module's own doc on why these stay two separate timing concepts.
 */
export function getLinkTimerStatus(style: LinkTimerStyle, targetDurationSeconds: number | null, elapsedSeconds: number): LinkTimerStatus {
  const safeElapsed = Math.max(0, elapsedSeconds);
  if (style === "guided" || targetDurationSeconds === null || targetDurationSeconds <= 0) {
    return { elapsedSeconds: safeElapsed, remainingSeconds: null, reachedTarget: false };
  }
  const remainingSeconds = Math.max(0, targetDurationSeconds - safeElapsed);
  return { elapsedSeconds: safeElapsed, remainingSeconds, reachedTarget: safeElapsed >= targetDurationSeconds };
}

/** Formats whole seconds as "M:SS" for a live count-up/count-down display -- deliberately its own formatter (never arc/actionTimer.ts's formatRemainingTime) so a future change to either timer's own display never accidentally affects the other. */
export function formatLinkTimerSeconds(totalSecondsInput: number): string {
  const totalSeconds = Math.max(0, Math.ceil(totalSecondsInput));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Suggested editable default durations (spec section 9.2) -- offered as
 * BUILD/pre-rehearsal chip choices, never enforced. Seconds.
 */
export const LINK_TIMER_DEFAULT_DURATIONS: Record<"full_or_archi" | "fast_regular" | "mini_arc_link", number[]> = {
  full_or_archi: [120, 180, 300],
  fast_regular: [30, 60, 90],
  mini_arc_link: [15, 30, 60],
};
