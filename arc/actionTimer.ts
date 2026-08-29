/**
 * arc/actionTimer.ts
 *
 * The Action Timer: times the ACTUAL physical behavior once it
 * begins, as a distinct concept from instruction timing
 * (arc/instructionTiming.ts). It begins only when the "performing"
 * act sub-phase is reached -- never during Encoding, Action Imagery,
 * Action Preparation, or while a trainee is still choosing between
 * the planned action and a session-specific alternative
 * (arc/arcEngine.ts's resolveActPhase governs that ordering).
 *
 * Deliberately a separate file/type from instructionTiming.ts's
 * status shape, per the requirement to keep instruction timing and
 * action timing explicit in both code and naming -- nothing here is
 * shared with, or derived from, any instruction segment's duration.
 */

export interface ActionTimerStatus {
  remainingSeconds: number;
  complete: boolean;
}

/**
 * Pure function: given the resolved action duration (in minutes, as
 * already produced by arc/arcEngine.ts's resolveActionDuration for
 * whichever action is currently active -- the planned action or a
 * session-specific alternative) and how many seconds have elapsed
 * since actual performance began, returns the remaining time and
 * whether the timer has completed.
 *
 * durationMinutes === null means no duration was ever configured for
 * this action -- the pre-existing, dominant case for most profiles
 * today. The timer resolves as immediately complete, so the
 * completion control stays enabled with no forced wait: identical to
 * the app's behavior before this feature existed, for anyone who
 * never configured an action duration.
 */
export function getActionTimerStatus(durationMinutes: number | null, elapsedSeconds: number): ActionTimerStatus {
  if (durationMinutes === null) {
    return { remainingSeconds: 0, complete: true };
  }
  const totalSeconds = durationMinutes * 60;
  const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
  return { remainingSeconds, complete: elapsedSeconds >= totalSeconds };
}

/**
 * Absolute-time entry point: converts an absolute actionStartedAt
 * anchor (an ISO timestamp, captured once when the actual Action
 * began) into elapsed seconds against `now`, then delegates to
 * getActionTimerStatus. This -- not a running interval counting ticks
 * -- is what the live screen (live/screens.tsx's ActionScreen) actually
 * calls: as long as actionStartedAt was captured once and persisted
 * somewhere durable (see data/storage.ts's ActiveActionTimer), the
 * correct remaining/complete state can always be recomputed from a
 * fresh Date.now() read, with no dependency on how many interval ticks
 * fired, whether the JS thread was suspended (backgrounded/locked) in
 * between, or whether the component/app was ever remounted or
 * relaunched. `now` defaults to Date.now() but takes an explicit value
 * for deterministic testing.
 */
export function getActionTimerStatusFromStartedAt(
  actionStartedAt: string,
  durationMinutes: number | null,
  now: number = Date.now()
): ActionTimerStatus {
  const elapsedSeconds = Math.max(0, (now - new Date(actionStartedAt).getTime()) / 1000);
  return getActionTimerStatus(durationMinutes, elapsedSeconds);
}

/** Formats whole seconds as "MM:SS" for the live remaining-time display during the actual timed Action. */
export function formatRemainingTime(remainingSeconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingSeconds));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
