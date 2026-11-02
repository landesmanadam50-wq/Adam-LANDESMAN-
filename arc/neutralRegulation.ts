/**
 * arc/neutralRegulation.ts
 *
 * Productivity roadmap, Stage O: the neutral, ready-made protocol for
 * when a factor is unidentified, unknown, or simply has no saved
 * protocol yet -- reused as the explicit fallback for Stage O (emotion
 * identification declined/unknown), Stage Q (an urge with no saved
 * match), and Stages R/S (a thought or belief with no saved match),
 * per the product spec's own repeated "offer neutral Mini ARC or
 * neutral regulation" instruction. Deliberately brief (the spec's own
 * sequence, never expanded) and never blocking -- "do not block the
 * user because a factor was not identified."
 *
 * Pure content only. The supportive-state CHOICE step (spec step 7) is
 * rendered by the screen directly from arc/preparationStates.ts's own
 * 8 predefined chips -- no new state-selection logic duplicated here.
 */

import { getFreeBreathingLine } from "./naturalBreathing.ts";

/** Steps 1-6 of the spec's own sequence: notice sensation, brief Stay, accept without naming, widen visual field, notice body contact, natural breath. Step 7 (choose a supportive state) and step 9 (return to task) are handled by the screen itself; step 8 is getNeutralRegulationActionStep below. */
export function getNeutralRegulationNoticingSteps(): string[] {
  return [
    "שים לב לתחושה הגופנית הנוכחית, בלי לשנות אותה.",
    "אפשר להישאר איתה לרגע קצר, בעדינות.",
    "אפשר לקבל את התחושה כמו שהיא, בלי צורך לתת לה שם או הגדרה.",
    "אפשר להרחיב בעדינות את שדה הראייה.",
    "שים לב למגע של הגוף עם המשטח שעליו אתה נשען או יושב.",
    getFreeBreathingLine(),
  ];
}

/** Step 8: "choose one small action" -- always the task's own already-configured action, never invented. */
export function getNeutralRegulationActionStep(firstOrCurrentAction: string): string {
  const trimmed = firstOrCurrentAction.trim();
  return trimmed ? `אפשר לבחור פעולה קטנה אחת כדי להמשיך: ${trimmed}.` : "אפשר לבחור פעולה קטנה אחת כדי להמשיך.";
}
