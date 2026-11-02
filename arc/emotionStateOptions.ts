/**
 * arc/emotionStateOptions.ts
 *
 * Hebrew BUILD/LIVE rework spec, BUILD section ב ("רגש, דחף ועוצמה") --
 * a fixed, offered list of named emotions/states the trainee can
 * multi-select from, alongside free-text and an explicit "עדיין לא
 * יודע" (still don't know) option, plus a personal intensity threshold
 * that only ever SUGGESTS running ARC -- never a mandatory clinical
 * rule, and never something that blocks starting a practice below it
 * ("אפשר להפעיל תרגול גם מתחת לסף").
 *
 * This is new: no selectable emotion/state list existed anywhere in
 * this codebase before (arc/interferenceItem.ts's InterferenceCategory
 * is a 4-way thought/belief/urge/emotion CATEGORY tag, not a list of
 * named emotions). Kept as its own small pure module, never merged into
 * arc/interferenceItem.ts or arc/types.ts directly -- mirrors how
 * arc/bodyImagery.ts/arc/mantras.ts each own one narrow concern.
 */

export type EmotionStateOption =
  | "fear"
  | "worry"
  | "pressure"
  | "anger"
  | "frustration"
  | "sadness"
  | "loneliness"
  | "shame"
  | "insecurity"
  | "boredom"
  | "craving"
  | "overwhelm"
  | "lack_of_motivation"
  | "lack_of_meaning";

export const EMOTION_STATE_OPTIONS: EmotionStateOption[] = [
  "fear",
  "worry",
  "pressure",
  "anger",
  "frustration",
  "sadness",
  "loneliness",
  "shame",
  "insecurity",
  "boredom",
  "craving",
  "overwhelm",
  "lack_of_motivation",
  "lack_of_meaning",
];

export const EMOTION_STATE_OPTION_LABELS: Record<EmotionStateOption, string> = {
  fear: "פחד",
  worry: "דאגה",
  pressure: "לחץ",
  anger: "כעס",
  frustration: "תסכול",
  sadness: "עצב",
  loneliness: "בדידות",
  shame: "בושה",
  insecurity: "חוסר ביטחון",
  boredom: "שעמום",
  craving: "תשוקה",
  overwhelm: "הצפה",
  lack_of_motivation: "חוסר מוטיבציה",
  lack_of_meaning: "חוסר משמעות",
};

/** The trainee's own selection for BUILD section ב -- any combination of the fixed list, plus optional free text, plus an explicit "still don't know" flag. All three may coexist (e.g. a known option AND custom text). */
export interface EmotionStateSelection {
  options: EmotionStateOption[];
  customText: string | null;
  stillUnknown: boolean;
}

export function createEmptyEmotionStateSelection(): EmotionStateSelection {
  return { options: [], customText: null, stillUnknown: false };
}

/**
 * A personal threshold is purely a SUGGESTION gate, never a
 * requirement -- see this module's own doc and the product spec's own
 * example ("מעל 4 מתוך 10"). Falls back to this documented default when
 * the trainee never configured a personal threshold of their own.
 */
export const DEFAULT_ARC_SUGGESTION_INTENSITY_THRESHOLD = 4;

/** Strictly above the threshold, matching the spec's own "above X out of 10" framing -- an intensity equal to the threshold does not yet suggest ARC. */
export function shouldSuggestArcForIntensity(intensity: number, threshold: number | null): boolean {
  const effectiveThreshold = threshold ?? DEFAULT_ARC_SUGGESTION_INTENSITY_THRESHOLD;
  return intensity > effectiveThreshold;
}
