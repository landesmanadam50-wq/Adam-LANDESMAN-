/**
 * arc/supportiveAnchorSuggestions.ts
 *
 * Physical questionnaire placement task, section 4 ("בשלב הראשון אפשר
 * להשתמש במאגר הצעות קבוע לפי תחושה רצויה"): a fixed, Phase-1
 * suggestion bank mapping the trainee's own free-text desired feeling
 * (NewArcLiveSessionState.desiredEnding) to candidate supportive body
 * regions, plus pooling movement presets across however many regions
 * were actually chosen. A later phase may replace/extend this with an
 * AI-driven suggester reading the same desired feeling, the trainee's
 * current choices, and past helpful practices (section 4) -- this
 * module's own two functions are exactly the seam that call would
 * plug into, so no other code needs to change when it does.
 *
 * desiredEnding is free text, not a closed set -- real phrasing varies
 * ("אני רוצה להרגיש רוגע" must still match "רוגע"), so matching is a
 * simple case/whitespace-insensitive substring containment against a
 * small set of known keywords, first match wins. No fabricated
 * clinical claim is made about any region "corresponding" to any
 * feeling -- these are offered strictly as starting points for the
 * trainee's own personal check, never a fixed rule (spec section 2:
 * "ההצעות הן אפשרויות לבדיקה אישית, ולא קביעה שרגש מסוים חייב להיות
 * מורגש באזור גוף מסוים").
 *
 * ARC LIVE emotion-based body suggestions task, section 8: extends this
 * SAME module (never a second, competing suggestion system) with a
 * logically SEPARATE mapping for NEGATIVE emotions -- a selected
 * negative emotion's own candidate UNPLEASANT body regions, matched the
 * exact same substring-containment way, with its own default fallback.
 * The two mappings are kept in entirely separate tables/functions
 * (resolveSuggestedSupportiveAreas/DESIRED_FEELING_REGION_SUGGESTIONS for
 * the positive/supportive side, resolveSuggestedUnpleasantAreas/
 * NEGATIVE_EMOTION_REGION_SUGGESTIONS for the negative side) so neither
 * can ever silently influence the other.
 */

import type { BodyRegion } from "./bodyRegionRoles.ts";
import { resolveBodyRegionMovementPresets } from "./bodyRegionMovementPresets.ts";

/**
 * Positive/supportive side. Table updated to match the emotion-based
 * body suggestions task's own explicit mapping (section 5) for every
 * keyword it names; a handful of additional synonyms kept from the
 * original Phase-1 bank (שלווה/ריכוז/כוח/חמלה/אהבה) are aligned to the
 * same regions as their closest named counterpart (שלווה -> רוגע,
 * ריכוז -> מיקוד) rather than left to drift into a different mapping
 * for what is effectively the same requested feeling.
 */
const DESIRED_FEELING_REGION_SUGGESTIONS: { keyword: string; regions: BodyRegion[] }[] = [
  { keyword: "ביטחון", regions: ["chest", "back", "shoulders", "legs_feet"] },
  { keyword: "רוגע", regions: ["shoulders", "abdomen", "chest"] },
  { keyword: "שלווה", regions: ["shoulders", "abdomen", "chest"] },
  { keyword: "יציבות", regions: ["legs_feet", "back"] },
  { keyword: "אנרגיה", regions: ["chest", "arms", "legs_feet"] },
  { keyword: "מיקוד", regions: ["head", "neck", "shoulders"] },
  { keyword: "ריכוז", regions: ["head", "neck", "shoulders"] },
  { keyword: "פתיחות", regions: ["chest", "shoulders", "arms"] },
  { keyword: "נינוחות", regions: ["shoulders", "jaw", "abdomen"] },
  { keyword: "מוטיבציה", regions: ["chest", "legs_feet", "arms"] },
  { keyword: "כוח", regions: ["back", "legs_feet"] },
  { keyword: "חמלה", regions: ["chest"] },
  { keyword: "אהבה", regions: ["chest"] },
];

/** A reasonable, generically-supportive default -- used whenever the trainee's own free-text desired feeling (or its absence) matches none of the known keywords above, so there is always something to offer rather than an empty list. */
const DEFAULT_SUGGESTED_REGIONS: BodyRegion[] = ["chest", "abdomen", "shoulders"];

/** Generic, region-independent movement suggestions -- used only when the trainee has chosen no supportive region at all yet (spec section 2: continuing with no area selection must still let the movement question offer something, never nothing). */
const DEFAULT_MOVEMENT_SUGGESTIONS: string[] = ["נשימה עמוקה ואיטית", "הרפיה הדרגתית של הכתפיים", "יישור עדין של תנוחת הגוף"];

export function resolveSuggestedSupportiveAreas(desiredEnding: string | null): BodyRegion[] {
  const text = (desiredEnding ?? "").trim();
  if (!text) return DEFAULT_SUGGESTED_REGIONS;
  const normalized = text.toLowerCase();
  const match = DESIRED_FEELING_REGION_SUGGESTIONS.find((entry) => normalized.includes(entry.keyword));
  return match ? match.regions : DEFAULT_SUGGESTED_REGIONS;
}

/**
 * Negative/unpleasant side (ARC LIVE emotion-based body suggestions
 * task, section 3's own explicit mapping table). Deliberately only the
 * emotions the task itself names -- "lack_of_motivation" and
 * "tiredness" (two of PREDEFINED_EMOTION_OPTIONS not covered by the new
 * mapping) fall through to DEFAULT_UNPLEASANT_REGIONS below rather than
 * guessing an unrequested, unverified region claim for them (section 8:
 * "avoid keyword matching that produces obviously irrelevant
 * suggestions"). "עומס" (overwhelm) is matched as this app's own
 * closest existing predefined option to "anxiety"/"חרדה", which the
 * task's table names but which isn't itself one of
 * PREDEFINED_EMOTION_OPTIONS -- the "חרדה" keyword is kept too, since a
 * trainee's own custom/free emotion text may use that exact word.
 */
const NEGATIVE_EMOTION_REGION_SUGGESTIONS: { keyword: string; regions: BodyRegion[] }[] = [
  { keyword: "פחד", regions: ["chest", "abdomen", "neck", "shoulders"] },
  { keyword: "חרדה", regions: ["chest", "abdomen", "neck", "legs_feet"] },
  { keyword: "עומס", regions: ["chest", "abdomen", "neck", "legs_feet"] },
  { keyword: "כעס", regions: ["jaw", "shoulders", "chest", "hands"] },
  { keyword: "עצב", regions: ["chest", "neck", "abdomen"] },
  { keyword: "תסכול", regions: ["jaw", "shoulders", "chest"] },
  { keyword: "בושה", regions: ["face", "chest", "abdomen"] },
  { keyword: "שעמום", regions: ["head", "shoulders", "back"] },
];

/** Used whenever no emotion was selected, or the selected/custom emotion text matches none of the known keywords above -- there is always something to offer, never an empty list, exactly mirroring DEFAULT_SUGGESTED_REGIONS' own role on the positive side. */
const DEFAULT_UNPLEASANT_REGIONS: BodyRegion[] = ["chest", "abdomen", "shoulders"];

/**
 * `emotionText` is the plain Hebrew label/word for the selected
 * emotion (e.g. "פחד"), or the trainee's own free-typed custom emotion
 * text -- never the "את ה-" question phrase itself, matching exactly
 * how resolveSuggestedSupportiveAreas above takes plain desiredEnding
 * text, never pre-formatted question copy. null/blank (no emotion
 * selected) resolves to the same generic default as an unmatched one.
 */
export function resolveSuggestedUnpleasantAreas(emotionText: string | null): BodyRegion[] {
  const text = (emotionText ?? "").trim();
  if (!text) return DEFAULT_UNPLEASANT_REGIONS;
  const normalized = text.toLowerCase();
  const match = NEGATIVE_EMOTION_REGION_SUGGESTIONS.find((entry) => normalized.includes(entry.keyword));
  return match ? match.regions : DEFAULT_UNPLEASANT_REGIONS;
}

/**
 * Pools arc/bodyRegionMovementPresets.ts's own per-region presets
 * across every CHOSEN region (never only the first), deduplicated,
 * capped at `limit` -- same "no more than three visible at once" cap
 * resolveSupportiveMovementSuggestions (the pre-existing single-area
 * version, kept unchanged for any other caller) already uses.
 */
export function resolveSupportiveMovementSuggestionsForAreas(areas: BodyRegion[], limit = 3): string[] {
  if (areas.length === 0) return DEFAULT_MOVEMENT_SUGGESTIONS.slice(0, limit);
  const pooled = areas.flatMap((area) => resolveBodyRegionMovementPresets(area));
  const deduped = Array.from(new Set(pooled));
  return deduped.length > 0 ? deduped.slice(0, limit) : DEFAULT_MOVEMENT_SUGGESTIONS.slice(0, limit);
}
