/**
 * arc/supportiveFeelingMapping.ts
 *
 * ARCHI -- Unified 7-Part Update task, Part 3.1 ("AUTOMATIC EMOTIONAL
 * MAPPING"): the one centralized, deterministic current-emotion ->
 * supportive-feeling/quality/mantra table -- "use one centralized,
 * deterministic mapping," never several ad hoc guesses scattered
 * across call sites. These are supportive EXERCISE associations the
 * trainee's own earlier practice design chose, never a claim of
 * universal, scientifically established emotional opposites, and
 * never a claim that the trainee has actually already reached the
 * supportive state -- every caller of resolveSupportiveFeeling is
 * expected to phrase its own result as guided imagery/intention
 * ("giving room to," "imagining"), never as an already-measured fact.
 *
 * Pure data/lookup only -- no React, no session mutation. Keyed by the
 * SAME EmotionSelection values arc/newArcLiveTypes.ts's own
 * PREDEFINED_EMOTION_OPTIONS already uses, so this can never drift
 * from the real emotion taxonomy the "emotion" step itself offers.
 */

import type { EmotionSelection } from "./newArcLiveTypes.ts";

export interface SupportiveFeelingMapping {
  /** The supportive feeling word itself (e.g. "ביטחון"). */
  feeling: string;
  /** The abstract quality behind it (e.g. "יציבות"). */
  quality: string;
  /** The short, first-person mantra for Encoding (e.g. "אני יציב."). */
  mantra: string;
}

/**
 * Part 3.1's own suggested initial mapping, verbatim -- every one of
 * the nine predefined emotions arc/newArcLiveTypes.ts's PREDEFINED_EMOTION_OPTIONS
 * offers gets exactly one entry here, so the table is always complete
 * for every emotion the "emotion" step can actually produce.
 */
const EMOTION_SUPPORTIVE_FEELING_TABLE: Record<Exclude<EmotionSelection, "other">, SupportiveFeelingMapping> = {
  fear: { feeling: "ביטחון", quality: "יציבות", mantra: "אני יציב." },
  frustration: { feeling: "רוגע", quality: "מסוגלות", mantra: "אני מסוגל." },
  anger: { feeling: "רוגע", quality: "שלווה", mantra: "אני שליו." },
  overwhelm: { feeling: "קלילות", quality: "מרחב", mantra: "יש בי מרחב." },
  sadness: { feeling: "נחמה", quality: "תקווה", mantra: "יש בי תקווה." },
  shame: { feeling: "ביטחון", quality: "קבלה עצמית", mantra: "אני מקבל את עצמי." },
  boredom: { feeling: "עניין", quality: "סקרנות", mantra: "אני סקרן." },
  lack_of_motivation: { feeling: "התחדשות", quality: "מסוגלות", mantra: "אני מסוגל להתחיל." },
  tiredness: { feeling: "מנוחה", quality: "רכות", mantra: "אני נותן לעצמי מרחב." },
};

/**
 * Resolves the trainee's own CURRENT emotion (a predefined
 * EmotionSelection, or free-typed custom text when `selectedEmotion`
 * is "other") to its supportive mapping -- null for "no emotion
 * identified," "other" with blank/whitespace-only text, or (safety
 * requirement: "handle unknown or custom emotion values safely... do
 * not invent a specific emotion") any free-typed custom emotion, which
 * has no deterministic mapping and is never guessed at. Every caller
 * already has its own honest, generic fallback for exactly this null
 * case (e.g. arc/newArcLiveCopy.ts's own "התחושה התומכת" wording) --
 * this function itself never fabricates one.
 */
export function resolveSupportiveFeeling(selectedEmotion: EmotionSelection | null, customEmotionText: string | null): SupportiveFeelingMapping | null {
  if (!selectedEmotion || selectedEmotion === "other") return null;
  return EMOTION_SUPPORTIVE_FEELING_TABLE[selectedEmotion] ?? null;
}

/**
 * ARCHI -- Combined Emotion & Supportive Feeling Selection task: the
 * fixed set of ALTERNATIVE supportive feelings offered as one-tap
 * overrides next to the automatic suggestion -- "allow the trainee to
 * choose a different supportive feeling with one tap," reusing this
 * SAME table (never a second, separately-authored list of feeling
 * words). Deduplicated by `.feeling` so two emotions that happen to
 * share one feeling word (fear/shame both -> ביטחון) only ever offer
 * it once, in the table's own fixed iteration order, for a stable,
 * testable UI. `excludeFeeling` (normally the current suggestion or
 * override) is dropped so the same feeling is never offered as its
 * own "alternative" to itself.
 */
export function listSupportiveFeelingAlternatives(excludeFeeling?: string | null): SupportiveFeelingMapping[] {
  const seen = new Set<string>();
  const alternatives: SupportiveFeelingMapping[] = [];
  for (const mapping of Object.values(EMOTION_SUPPORTIVE_FEELING_TABLE)) {
    if (mapping.feeling === excludeFeeling || seen.has(mapping.feeling)) continue;
    seen.add(mapping.feeling);
    alternatives.push(mapping);
  }
  return alternatives;
}
