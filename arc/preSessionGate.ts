/**
 * arc/preSessionGate.ts
 *
 * Hebrew BUILD/LIVE rework spec, "שער הכניסה לתרגול": the optional
 * pre-practice gate shown before a session starts -- "מה קרה עכשיו?",
 * "מה עוצמת העומס או הדחף, מ-0 עד 10?", "עד כמה זה מקשה עליך לבחור
 * בפעולה הרצויה?". Every answer is optional ("אין לחייב זיהוי רגש כדי
 * להתחיל" -- no answer here is ever required to start a practice), and
 * the only effect any answer has is a SUGGESTION, never a requirement:
 * reuses arc/emotionStateOptions.ts's shouldSuggestArcForIntensity
 * directly rather than a second, parallel threshold concept.
 *
 * Deliberately NOT a new ArcStage -- this gate sits entirely BEFORE the
 * engine's own trigger_selection entry point, mirrors a trainee
 * answering it, then choosing to proceed (or not) exactly as they
 * already could before this gate existed. No existing session/engine
 * behavior is read or written here.
 */

import { shouldSuggestArcForIntensity } from "./emotionStateOptions.ts";

export interface PreSessionGateAnswers {
  whatHappened: string | null;
  /** 0-10, the spec's own "עוצמת העומס או הדחף" scale. */
  intensity: number | null;
  /** 0-10, "עד כמה זה מקשה עליך לבחור בפעולה הרצויה". */
  difficultyChoosingAction: number | null;
}

export function createEmptyPreSessionGateAnswers(): PreSessionGateAnswers {
  return { whatHappened: null, intensity: null, difficultyChoosingAction: null };
}

/**
 * Whether to show the (non-binding) "ARC מוצע" suggestion -- only ever
 * computable once an intensity answer actually exists; an unanswered
 * gate (every field still null, exactly like skipping it entirely)
 * never suggests anything, since there is nothing to suggest from.
 * Never consults difficultyChoosingAction or whatHappened -- the
 * product spec's own threshold is intensity-only; the other two
 * questions are recognition-only, offered for the trainee's own
 * reflection, not inputs to this decision.
 */
export function shouldSuggestArcFromGate(answers: PreSessionGateAnswers, threshold: number | null): boolean {
  if (answers.intensity === null) return false;
  return shouldSuggestArcForIntensity(answers.intensity, threshold);
}
