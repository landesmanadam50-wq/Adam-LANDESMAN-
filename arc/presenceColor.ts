/**
 * arc/presenceColor.ts
 *
 * Presence Color task: pure copy helpers for the one ArcBuildProfile
 * field this task adds (arc/types.ts's presenceColor, "באיזה צבע
 * מתמלאת הנוכחות שלך?" -- chosen once during BUILD, never re-asked
 * during LIVE).
 *
 * Every line here is built from a fixed, gender-neutral Hebrew template
 * around the trainee's own saved color text -- never an inflected
 * adjective agreeing with "נוכחות" (e.g. never "הנוכחות הסגולה"),
 * because that agreement can't be produced reliably for arbitrary
 * free-typed Hebrew ("סגול" -> "הסגולה" is a guessable pattern, but not
 * every color word the trainee might type follows it). Every function
 * here treats a missing/blank color as simply "say nothing" -- callers
 * omit the line entirely rather than ever rendering "undefined",
 * "null", or an empty sentence fragment. No color meaning/interpretation
 * is ever added -- the trainee's own text is only ever echoed back
 * verbatim inside these fixed sentence frames.
 */

/** True only for a real, non-blank saved color -- never for null/undefined/whitespace-only. */
export function hasPresenceColor(color: string | null | undefined): color is string {
  return typeof color === "string" && color.trim().length > 0;
}

/**
 * Presence Stage 3 (arc/stageCopy.ts's "arc_thought_expand_presence"
 * case): the activation line appended once, at the end of that stage's
 * existing instruction -- never its own timed segment (see that case's
 * own doc), so this never changes the stage's existing timing/dwell.
 * Returns null when there's no saved color (legacy ArcBuild) -- the
 * caller then leaves Stage 3's existing text completely unchanged,
 * exactly as if this task didn't exist for that build.
 */
export function getPresenceColorActivationLine(color: string | null | undefined): string | null {
  if (!hasPresenceColor(color)) return null;
  const trimmed = color.trim();
  return `אפשר לנוכחות שלך להתמלא בצבע שבחרת: ${trimmed}. אין צורך לראות אותו בבירור — אפשר להרגיש, לדמיין או פשוט לדעת שהוא נמצא.`;
}

/**
 * The short continuous thread through the rest of the LIVE session
 * once Presence Color has been activated -- one fixed, gender-neutral
 * sentence per remaining major section, always naming the color as a
 * plain appositive ("הצבע שבחרת, X," / "בצבע שבחרת, X") rather than an
 * agreeing adjective, for the same reliability reason as
 * getPresenceColorActivationLine. Returns null (never a blank/invented
 * line) when there's no saved color.
 */
export type PresenceColorSection =
  | "awareness"
  | "acceptance"
  | "regulation"
  | "updatedSensation"
  | "encoding"
  | "identity"
  | "actionImagery"
  | "timedAction"
  | "completion";

export function getPresenceColorReminder(color: string | null | undefined, section: PresenceColorSection): string | null {
  if (!hasPresenceColor(color)) return null;
  const c = color.trim();
  switch (section) {
    case "awareness":
      return `שים לב שגם הצבע שבחרת, ${c}, נמצא איתך כרגע.`;
    case "acceptance":
      return `הצבע שבחרת, ${c}, ממשיך ללוות אותך גם עכשיו.`;
    case "regulation":
      return `אם מתאים, אפשר לצבע שבחרת, ${c}, להתפשט מעט יותר.`;
    case "updatedSensation":
      return `שים לב לכך מתוך הנוכחות שבצבע שבחרת, ${c}.`;
    case "encoding":
      return `הצבע שבחרת, ${c}, ממשיך למלא את הנוכחות שלך.`;
    case "identity":
      return `אמור זאת מתוך הנוכחות שבצבע שבחרת, ${c}.`;
    case "actionImagery":
      return `דמיין זאת כשהצבע שבחרת, ${c}, מלווה אותך.`;
    case "timedAction":
      return `תן לצבע שבחרת, ${c}, ללוות אותך.`;
    case "completion":
      return `שים לב לכך מתוך הנוכחות שבצבע שבחרת, ${c}.`;
  }
}
