/**
 * arc/ratings.ts
 *
 * presenceRating, sensationIntensity, and desiredStateRating are all
 * meant to be a 1-10 integer scale. Without validation,
 * getReactiveStage(20) silently returns "stay" and getReactiveStage(0)
 * silently returns "encode" -- wrong answers presented with total
 * confidence. assertArcRating throws so a bad value is caught at the
 * engine boundary; the UI is expected to prevent one from ever being
 * entered in the first place (a fixed 1-10 button row, not free text).
 */

export const RATING_MIN = 1;
export const RATING_MAX = 10;

export function isValidArcRating(value: number): boolean {
  return Number.isInteger(value) && value >= RATING_MIN && value <= RATING_MAX;
}

export function assertArcRating(value: number, fieldName: string): void {
  if (!isValidArcRating(value)) {
    throw new Error(`${fieldName} must be an integer between ${RATING_MIN} and ${RATING_MAX}, got ${value}`);
  }
}

/** Clamps and rounds to the nearest valid rating -- for sanitizing input before it reaches the engine, not a substitute for UI-level prevention. */
export function normalizeRating(value: number): number {
  return Math.min(RATING_MAX, Math.max(RATING_MIN, Math.round(value)));
}
