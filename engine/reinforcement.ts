/**
 * engine/reinforcement.ts
 *
 * Spec §24: reinforcement must be specific to the action taken, not
 * a generic "well done". This module builds that text from the
 * trainee's own profile — pure function, no UI, reusable later by
 * TRAIN when it reports on completed repetitions too.
 */

import type { ArcProfile } from "./types.ts";

export function getBeneficialActionReinforcement(profile: ArcProfile): string {
  return `כל הכבוד — ${profile.actions.beneficialAction}.`;
}

export function getSuccessFocusReinforcement(extraMinutes: number): string {
  return `מעולה — לא רק התחלת, המשכת עוד ${extraMinutes} דקות.`;
}
