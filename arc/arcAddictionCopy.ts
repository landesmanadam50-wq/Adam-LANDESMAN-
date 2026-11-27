/**
 * arc/arcAddictionCopy.ts
 *
 * Session-level Hebrew copy for ARC Addiction (the ARC exercises' own
 * step copy lives in arc/arcAddictionArc.ts). Kept in one place so a
 * test can scan every string for judgmental wording: acting on the urge
 * is never called a failure, and nothing is ever "reset".
 */

import type { AddictionEpisodeOutcome, AddictionIntensityChoice, AddictionIntensityRoute } from "./arcAddiction.ts";
import type { AddictionTrend } from "./arcAddictionProgression.ts";

export const ARC_ADDICTION_ROUTE_TITLE = "ARC Addiction";
export const ARC_ADDICTION_ROUTE_SUBTITLE = "מסוגלות, זמן וקבלה";

/** Shown on the home screen of the route and on profile creation. */
export const ARC_ADDICTION_DISCLAIMER =
  "ARC Addiction הוא כלי לתרגול עצמי. הוא אינו טיפול רפואי או פסיכולוגי מוכח ואינו תחליף לליווי מקצועי. אם ההתנהגות גורמת לך נזק או מצוקה משמעותית – כדאי להיעזר באיש מקצוע.";

export const ARC_ADDICTION_PRINCIPLES: readonly { title: string; body: string }[] = [
  { title: "מסוגלות", body: "בניית היכולת לשאת את התחושה הקשורה לדחף." },
  { title: "זמן", body: "הרחבת מרחב הבחירה – המתנה שמתארכת בהדרגה, והתנהגות שמתקצרת בהדרגה." },
  { title: "קבלה", body: "פחות ביקורת עצמית אחרי שפעלת לפי הדחף. הקבלה אינה מותנית בהצלחה." },
];

/** The exact question of the end-of-wait notification and decision screen. */
export const ARC_ADDICTION_DECISION_QUESTION = "האם אתה בוחר לפעול לפי הדחף כרגע?";
export const ARC_ADDICTION_ANSWER_YES = "כן";
export const ARC_ADDICTION_ANSWER_NO = "לא";

export function getWaitNotificationTitle(profileName: string): string {
  const name = profileName.trim();
  return name ? `זמן ההמתנה הסתיים · ${name}` : "זמן ההמתנה הסתיים";
}

export const ARC_ADDICTION_INTENSITY_QUESTION = "מהי עוצמת התחושה או הדחף כרגע?";
export const ARC_ADDICTION_INTENSITY_HINT = "0 = אין דחף בכלל · 10 = הכי חזק";

export const INTENSITY_ROUTE_MESSAGES: Record<AddictionIntensityRoute, string> = {
  zero: "הדחף שכך. אפשר לסיים כאן ולתעד את הרגע.",
  low: "הדחף נמוך. אפשר לחזור לשגרה, או לתת לעצמך עוד זמן המתנה.",
  high: "הדחף עדיין חזק – וזה בסדר. אפשר לעשות עוד ARC קצר למסוגלות, ואחריו עוד זמן המתנה.",
};

export const INTENSITY_CHOICE_LABELS: Record<AddictionIntensityChoice, string> = {
  finish_success: "סיום ותיעוד הצלחה",
  continue_routine: "המשך בפעילות הרגילה",
  extra_wait: "עוד זמן המתנה",
  extra_arc: "ARC נוסף למסוגלות",
  end: "סיום התרגול",
};

export const GENTLE_STOP_HINT = "אפשר גם לעצור כאן. כל דקה של בחירה כבר נחשבת – התרגול לא צריך להפוך לדרישה.";

export const BEHAVIOR_LOG_TITLE = "תיעוד ההתנהגות";
export const BEHAVIOR_LOG_INTRO = "תודה על הכנות. זה חלק מהתרגול – לא סימן לכישלון."; // intentionally negated – see BANNED_WORD_EXCEPTIONS
export const BEHAVIOR_LOG_HARM_NOTE = "בהתנהגות הזו התיעוד נעשה רק בדיעבד, בלי טיימר.";
export const BEHAVIOR_LOG_DURATION_QUESTION = "כמה זמן זה נמשך בערך?";
export const BEHAVIOR_LOG_STOPWATCH_HINT = "אפשר גם להפעיל סטופר ולעצור אותו בסיום.";

export const ACCEPTANCE_ARC_INTRO = "עכשיו תרגיל ARC לקבלה עצמית. הוא לא מותנה בשום דבר – ואפשר לדלג עליו.";

export const CLOSING_MESSAGES: Record<AddictionEpisodeOutcome, string> = {
  resisted: "בחרת שלא לפעול לפי הדחף. זה רגע של חופש בחירה.",
  acted: "פעלת לפי הדחף, ונתת מקום לקבלה. ההתקדמות שלך נשמרת.",
  ended_by_user: "התרגול הסתיים. כל מה שעשית נשמר.",
  abandoned: "התרגול נסגר. כל מה שעשית נשמר.",
};

export const PROGRESS_NOT_RESET_NOTE = "ההתקדמות לעולם לא מתאפסת. יעד שלא הושג פשוט נשאר כמו שהוא.";

export function describeWaitTargetChange(before: number, after: number | null): string {
  if (after === null || after === before) return `יעד ההמתנה נשאר ${before} דק'.`;
  if (after > before) return `יעד ההמתנה הבא: ${after} דק' (+${after - before}).`;
  return `יעד ההמתנה הבא: ${after} דק'.`;
}

export function describeDurationTargetChange(before: number | null, after: number | null): string | null {
  if (after === null) return null;
  if (before === null) return `יעד עדין למשך ההתנהגות: ${after} דק'.`;
  if (after < before) return `יעד משך ההתנהגות הבא: ${after} דק' (−${before - after}).`;
  return `יעד משך ההתנהגות נשאר ${after} דק'.`;
}

export const TREND_LABELS: Record<AddictionTrend, string> = {
  improving: "מגמה טובה",
  steady: "יציב",
  not_yet: "עוד לא ניכר שינוי",
  insufficient_data: "עוד מעט נתונים",
};

export const SAVE_SUCCESS_MEMORY_LABEL = "שמירה כרגע הצלחה ב־Positive Memory";

export function buildSuccessMemoryTitle(profileName: string): string {
  return `בחרתי שלא לפעול לפי הדחף · ${profileName.trim()}`;
}

/**
 * Words that must never appear in ARC Addiction copy. BEHAVIOR_LOG_INTRO
 * uses "כישלון" only in negation ("לא סימן לכישלון") and is the single
 * allowed exception.
 */
export const BANNED_COPY_WORDS = ["כישלון", "נכשלת", "נכשל", "נפילה", "מעידה", "אפס את", "איפוס", "עונש"] as const;
export const BANNED_WORD_EXCEPTIONS: readonly string[] = [BEHAVIOR_LOG_INTRO];
