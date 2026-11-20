/**
 * arc/positiveImagery.ts
 *
 * Psychology/Smiling/Positive-Reinforcement task, feature 4: a short,
 * rotating library of positive mental-imagery prompts offered after
 * every completed task -- separate from (and never a replacement for)
 * the task-linked outcome/value imagery arc/newArcLiveCopy.ts's own
 * "encoding" step already uses inside an actual ARC session. This is a
 * lightweight, standalone celebration prompt, always skippable, shown
 * from live/PostTaskRewardScreen.tsx.
 */

import { resolveNextRotationIndex } from "./contentRotation.ts";

export interface PositiveImageryPrompt {
  id: string;
  /** Hebrew, always phrased as "imagine yourself..." -- never a command to recreate a difficult feeling. */
  text: string;
}

export const POSITIVE_IMAGERY_PROMPTS: PositiveImageryPrompt[] = [
  { id: "proud", text: "דמיין את עצמך גאה בכך שהשלמת את המשימה." },
  { id: "confident", text: "דמיין את עצמך הופך לבטוח בעצמך יותר ויותר." },
  { id: "long_term_goal", text: "דמיין את עצמך מגיע בהצלחה למטרה ארוכת הטווח שלך." },
  { id: "motivated_energetic", text: "דמיין את עצמך פועל עם מוטיבציה ואנרגיה." },
  { id: "enjoying_results", text: "דמיין את עצמך נהנה מהפירות של העבודה שהשלמת." },
  { id: "becoming_who_you_want", text: "דמיין את עצמך הופך בהדרגה לאדם שאתה רוצה להיות." },
];

/** Index to show next, given the index shown last time -- never immediately repeating, per arc/contentRotation.ts's shared rule. */
export function resolveNextPositiveImageryIndex(lastIndex: number | null): number {
  return resolveNextRotationIndex(lastIndex, POSITIVE_IMAGERY_PROMPTS.length);
}
