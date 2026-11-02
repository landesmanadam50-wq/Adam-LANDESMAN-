/**
 * arc/emotionIdentification.ts
 *
 * Productivity roadmap, Stage M: "the user should not have to know the
 * emotion in advance." Two deterministic questions (body sensation,
 * then closest statement) produce a SUGGESTION only -- never a
 * declaration. The screen must always let the trainee confirm, pick a
 * different emotion, or decline to name one at all (see
 * live/EmotionIdentificationScreen.tsx). No free text is ever
 * classified; every option below is a fixed, predefined choice.
 */

export type BodySensation =
  | "abdomenContraction"
  | "chestPressure"
  | "tension"
  | "heat"
  | "heaviness"
  | "restlessness"
  | "freezing"
  | "desireToMoveAway"
  | "anotherSensation"
  | "unknown";

export const BODY_SENSATION_OPTIONS: BodySensation[] = [
  "abdomenContraction",
  "chestPressure",
  "tension",
  "heat",
  "heaviness",
  "restlessness",
  "freezing",
  "desireToMoveAway",
  "anotherSensation",
  "unknown",
];

export const BODY_SENSATION_LABELS: Record<BodySensation, string> = {
  abdomenContraction: "התכווצות בבטן",
  chestPressure: "לחץ בחזה",
  tension: "מתח",
  heat: "חום",
  heaviness: "כובד",
  restlessness: "חוסר שקט",
  freezing: "קיפאון",
  desireToMoveAway: "רצון להתרחק",
  anotherSensation: "תחושה אחרת",
  unknown: "לא יודע",
};

export type ClosestStatement =
  | "fearOfFailing"
  | "fearOfJudgment"
  | "tryingNotProgressing"
  | "tooMuchToDo"
  | "boring"
  | "angerOrResistance"
  | "sadnessOrHopelessness"
  | "noneFits"
  | "unknown";

export const CLOSEST_STATEMENT_OPTIONS: ClosestStatement[] = [
  "fearOfFailing",
  "fearOfJudgment",
  "tryingNotProgressing",
  "tooMuchToDo",
  "boring",
  "angerOrResistance",
  "sadnessOrHopelessness",
  "noneFits",
  "unknown",
];

export const CLOSEST_STATEMENT_LABELS: Record<ClosestStatement, string> = {
  fearOfFailing: "אני חושש שלא אצליח.",
  fearOfJudgment: "אני חושש מביקורת או משיפוט.",
  tryingNotProgressing: "אני מנסה אבל לא מתקדם.",
  tooMuchToDo: "יש יותר מדי מה לעשות.",
  boring: "המשימה מרגישה משעממת.",
  angerOrResistance: "אני מרגיש כעס או התנגדות.",
  sadnessOrHopelessness: "אני מרגיש עצב או חוסר תקווה.",
  noneFits: "שום דבר לא מתאים.",
  unknown: "אני לא יודע.",
};

export type PredefinedEmotion = "fear" | "shame" | "frustration" | "overwhelm" | "boredom" | "anger" | "sadness";

export const PREDEFINED_EMOTIONS: PredefinedEmotion[] = ["fear", "shame", "frustration", "overwhelm", "boredom", "anger", "sadness"];

export const PREDEFINED_EMOTION_LABELS: Record<PredefinedEmotion, string> = {
  fear: "פחד",
  shame: "בושה",
  frustration: "תסכול",
  overwhelm: "עומס",
  boredom: "שִׁגְרָה ושעמום",
  anger: "כעס",
  sadness: "עצב",
};

export type EmotionSuggestion = { kind: "emotion"; emotion: PredefinedEmotion } | { kind: "unidentified" };

const STATEMENT_TO_EMOTION: Partial<Record<ClosestStatement, PredefinedEmotion>> = {
  fearOfFailing: "fear",
  fearOfJudgment: "shame",
  tryingNotProgressing: "frustration",
  tooMuchToDo: "overwhelm",
  boring: "boredom",
  angerOrResistance: "anger",
  sadnessOrHopelessness: "sadness",
};

/** A reasonable, still-deterministic secondary mapping -- used ONLY when the statement answer itself is "I do not know" (never when it's "none fits", which already means "this list doesn't describe me" and should not be second-guessed from the body alone). Always just a SUGGESTION the trainee confirms or overrides next. */
const SENSATION_TO_EMOTION: Partial<Record<BodySensation, PredefinedEmotion>> = {
  abdomenContraction: "fear",
  chestPressure: "fear",
  freezing: "fear",
  tension: "frustration",
  heat: "anger",
  heaviness: "sadness",
  restlessness: "overwhelm",
  desireToMoveAway: "boredom",
};

/**
 * The one deterministic mapping function -- a plain lookup table, never
 * free-text interpretation. The statement answer takes priority (it
 * maps almost directly to one of the 7 predefined emotions); the body
 * sensation is only consulted as a fallback when the statement itself
 * was "I do not know". "None fits" (an explicit, deliberate signal)
 * and "I don't know" paired with an unhelpful sensation both resolve to
 * "unidentified" -- the suggestion step is then skipped entirely in
 * favor of Stage O's neutral protocol.
 */
export function suggestEmotion(bodySensation: BodySensation, statement: ClosestStatement): EmotionSuggestion {
  const directMatch = STATEMENT_TO_EMOTION[statement];
  if (directMatch) return { kind: "emotion", emotion: directMatch };
  if (statement === "noneFits") return { kind: "unidentified" };
  // statement === "unknown" -- fall back to the body sensation.
  const sensationMatch = SENSATION_TO_EMOTION[bodySensation];
  return sensationMatch ? { kind: "emotion", emotion: sensationMatch } : { kind: "unidentified" };
}
