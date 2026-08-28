/**
 * arc/reinforcement.ts
 *
 * Reinforcement must be specific to what actually happened, not a
 * generic "well done" -- pure function, no UI, reusable later by
 * TRAIN when it reports on completed repetitions too.
 */

export function getSuccessFocusReinforcement(extraMinutes: number): string {
  return `מעולה — לא רק התחלת, המשכת עוד ${extraMinutes} דקות.`;
}
