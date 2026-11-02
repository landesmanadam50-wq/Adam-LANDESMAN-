/**
 * arc/predefinedEmotionProtocols.ts
 *
 * Productivity roadmap, Stage N: a ready-made protocol for each of the
 * 7 predefined emotions -- built into the app, never requiring the
 * trainee (or a coach) to build one in BUILD first. Per the product
 * spec, "each protocol should offer no more than three exercises at
 * one time" -- every emotion below gets exactly 3 steps, drawn from
 * (and compressing, where the spec lists more than 3 tools) that
 * emotion's own worked tool list, always ending with the exact same
 * sanctioned "דמיין את עצמך מתחיל" Action-Imagery phrasing
 * arc/preparationStates.ts already uses -- never a new, unreviewed
 * "imagine" phrasing. Shame's step 2 reads the task's own saved
 * value/identity when present (never invented) -- see
 * getShameProtocolSteps's own doc.
 *
 * Timing: every step uses this module's own fixed default dwell (no
 * configuration UI yet -- a reasonable, explicitly tracked scope
 * limit for this pass, see HEBREW_REWORK_PROGRESS.md).
 */

import { getFreeBreathingLine } from "./naturalBreathing.ts";
import type { PredefinedEmotion } from "./emotionIdentification.ts";

function imagineStartingAction(firstAction: string, flavor: string): string {
  const trimmed = firstAction.trim();
  const target = trimmed ? `: ${trimmed}` : ".";
  return `דמיין את עצמך מתחיל ${flavor ? `${flavor} ` : ""}את הפעולה הראשונה${target}`.trim();
}

/**
 * Shame's own middle step reconnects with the task's VALUE/IDENTITY
 * when the trainee has already saved one on this task (Task.value/
 * Task.identity, Stage H) -- read verbatim, never invented; a task
 * with neither field set gets a generic, still-safe invitation instead
 * (never a placeholder pretending content exists).
 */
function getReconnectionLine(value: string | null, identity: string | null): string {
  if (value && value.trim()) return `שים לב לערך "${value.trim()}" שהפעולה הזו מבטאת עבורך.`;
  if (identity && identity.trim()) return `שים לב לזהות שלך כ"${identity.trim()}", ולאיך הפעולה הזו מתחברת אליה.`;
  return "שים לב לדבר אחד שחשוב לך באמת במשימה הזו, אם יש כזה.";
}

export function getPredefinedEmotionProtocolSteps(
  emotion: PredefinedEmotion,
  firstAction: string,
  taskValue: string | null = null,
  taskIdentity: string | null = null
): string[] {
  switch (emotion) {
    case "fear":
      return [
        "שים לב למגע כפות הרגליים עם הרצפה, ולרוחב שדה הראייה סביבך.",
        "אפשר לכוון את הגוף לתנוחה פתוחה ובטוחה.",
        imagineStartingAction(firstAction, ""),
      ];
    case "shame":
      return [
        "אפשר לפתוח בעדינות את החזה ולהנמיך את הכתפיים.",
        getReconnectionLine(taskValue, taskIdentity),
        imagineStartingAction(firstAction, ""),
      ];
    case "frustration":
      return [
        "אפשר לשחרר את האחיזה בידיים ולהנמיך את הכתפיים.",
        getFreeBreathingLine(),
        imagineStartingAction(firstAction, "בקטע זמן קצר ומצומצם"),
      ];
    case "overwhelm":
      return [
        "אפשר למקד את המבט לרגע בנקודה אחת, ואז להרחיב בעדינות את שדה הראייה.",
        "שים לב למגע הגוף עם המשטח שעליו אתה נשען או יושב.",
        imagineStartingAction(firstAction, "למשך 2-5 דקות בלבד"),
      ];
    case "boredom":
      return [
        "אפשר לבצע תנועה קצרה או לשנות תנוחה.",
        "אפשר להזמין סקרנות -- מה מעניין כאן, גם אם במעט?",
        imagineStartingAction(firstAction, "כאתגר קטן וקצוב בזמן"),
      ];
    case "anger":
      return [
        "אפשר לעצור לרגע לפני כל פעולה, ולהרחיב את הפער בין התחושה לתגובה.",
        "אפשר לשחרר מתח בגוף, בלי לנסות להירגע בכוח.",
        imagineStartingAction(firstAction, "באופן מכוון ולא אוטומטי"),
      ];
    case "sadness":
      return [
        "אפשר למצוא תנוחה נתמכת ונעימה.",
        "אפשר לתת לעצמך עדינות, בלי למהר.",
        imagineStartingAction(firstAction, "בקצב נוח, בלי דרישה גבוהה"),
      ];
  }
}
