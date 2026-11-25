/**
 * arc/newArcLiveCopy.ts
 *
 * Simplified-architecture task, Phase 2: the actual Hebrew instruction
 * text for every (step, subIndex) pair -- "the app must not merely
 * show stage names... it must display the actual instruction the user
 * should perform at every step." Pure content only; no React, no
 * storage. live/NewArcLiveScreen.tsx only ever renders what
 * getStepContent returns.
 *
 * Every line reusing the continuity-rule fields (supportiveBodyArea,
 * supportiveSensation, positiveMovement) reads them verbatim from the
 * session state -- never re-asked, never reworded, matching the task's
 * own "use one clear typed field... do not create competing fields"
 * requirement. Two lines are deliberately reworded from the task's own
 * literal spec text to stay inside arc/instructions.ts's safety
 * denylist without weakening it (documented at each site below) --
 * every other line is verbatim.
 */

import { BODY_REGIONS, BODY_REGION_LABELS, resolveBodyRegionDisplayLabel } from "./bodyRegionRoles.ts";
import type { BodyRegionConfig } from "./bodyRegionRoles.ts";
import { resolveBodyRegionMovementPresets } from "./bodyRegionMovementPresets.ts";
import {
  EMOTION_OPTION_LABELS,
  EMOTIONAL_ACTION_PRESETS,
  FOCUS_COLOR_OPTIONS,
  PREDEFINED_EMOTION_OPTIONS,
  SUPPORTIVE_SENSATION_OPTIONS,
} from "./newArcLiveTypes.ts";
import type { EmotionSelection, NewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { BodyRegion } from "./bodyRegionRoles.ts";
import {
  BODY_SCAN_ALL_REGIONS,
  BODY_SCAN_REGION_GROUP_DEFS,
  BODY_SCAN_REGION_LABELS,
  isBodyScanRegionPaired,
} from "./bodyScanRegions.ts";
import type { BodyScanRegion } from "./bodyScanRegions.ts";
import { resolveBodyScanContractionState, resolveBodyScanHeavinessState, resolveSupportiveOpeningSelections } from "./bodyScanSelection.ts";
import type { BodyScanSide } from "./bodyScanSelection.ts";
// Three-levels-of-acceptance task: reused UNCHANGED from the existing,
// independent ARC Thought engine -- never a second, parallel type.
import type { ThoughtTimeOrientation } from "./types.ts";
import { ARC_FREE_BREATHING_MANTRA } from "./freeBreathingIntro.ts";
import { resolveFinalSupportiveFeeling } from "./newArcLiveSteps.ts";

export interface NewArcLiveStepContent {
  title: string;
  primary: string;
  supporting: string[];
  dwellSeconds?: number;
}

export { BODY_REGIONS, BODY_REGION_LABELS, FOCUS_COLOR_OPTIONS, SUPPORTIVE_SENSATION_OPTIONS, PREDEFINED_EMOTION_OPTIONS, EMOTION_OPTION_LABELS, EMOTIONAL_ACTION_PRESETS };

/** Up to 3 movement presets for the chosen supportive area, same "no more than three visible at once" cap the task's own Step 9 asks for -- a caller offering "view more" passes a larger limit explicitly. */
export function resolveSupportiveMovementSuggestions(area: BodyRegion, limit = 3): string[] {
  return resolveBodyRegionMovementPresets(area).slice(0, limit);
}

/**
 * Body region selection correction task: reads ONLY the singular
 * supportiveBodyArea -- the one primary positive anchor -- never the
 * supportiveBodyAreas array. A session saved while the (now reverted)
 * multi-select UI was active already has its singular field synced to
 * that array's own first entry by every setter that ever touched it
 * (toggleSupportiveArea/confirmSupportiveAreas in arc/newArcLiveSteps.ts),
 * so an old multi-region session's PRIMARY region still surfaces
 * correctly here with zero migration, exactly per this task's own
 * "use the primary region without destructively deleting historical
 * data" instruction -- the array itself stays intact in storage, this
 * function simply never reads it.
 */
function resolveSupportiveAreaLabel(state: NewArcLiveSessionState): string {
  if (!state.supportiveBodyArea) return "";
  if (state.supportiveBodyArea === "other" && state.supportiveBodyAreaCustomLabel) return state.supportiveBodyAreaCustomLabel;
  const config: BodyRegionConfig = { region: state.supportiveBodyArea, customLabel: null, roles: [], movementText: null, order: 0 };
  return resolveBodyRegionDisplayLabel(config);
}

/**
 * ARC Full Sequence Update task, Part 1 steps 4-5: a grammatically
 * correct "תחושת ה-X" phrase for every DESIRED_FEELING_OPTIONS preset
 * (same reason EMOTION_QUESTION_PHRASES exists above -- a mechanical
 * "תחושת ה" + label join reads correctly for all seven of these
 * specific words, verified individually, but is never assumed to hold
 * for arbitrary free-typed text). A free-typed custom feeling falls
 * back to the same "התחושה של X" wording resolveUnpleasantAreaQuestionPrimary
 * above already uses for a custom-typed emotion -- never a guess at
 * broken Hebrew grammar.
 */
const DESIRED_FEELING_DEFINITE_LABELS: Record<string, string> = {
  רוגע: "תחושת הרוגע",
  ביטחון: "תחושת הביטחון",
  קלילות: "תחושת הקלילות",
  חופש: "תחושת החופש",
  נינוחות: "תחושת הנינוחות",
  שמחה: "תחושת השמחה",
  יציבות: "תחושת היציבות",
};

function resolveDesiredFeelingDefiniteLabel(feelingText: string): string {
  return DESIRED_FEELING_DEFINITE_LABELS[feelingText] ?? `התחושה של ${feelingText}`;
}

/** The exact personalized question Part 1 step 5 requires, with the trainee's own chosen feeling inserted -- e.g. for "ביטחון": "איפה בגוף אתה מרגיש כרגע את תחושת הביטחון?". */
function resolveDesiredFeelingLocateQuestion(feelingText: string): string {
  return `איפה בגוף אתה מרגיש כרגע את ${resolveDesiredFeelingDefiniteLabel(feelingText)}?`;
}

/** "אזור (ימין)"/"אזור (שמאל)" for a differentiated side, or the plain region label for a midline region (or a paired one the trainee never differentiated) -- the one shared label format every body-scan line below uses. */
function resolveBodyScanRegionLabel(region: BodyScanRegion, side: BodyScanSide): string {
  const base = BODY_SCAN_REGION_LABELS[region];
  if (side === "left") return `${base} (שמאל)`;
  if (side === "right") return `${base} (ימין)`;
  return base;
}

/**
 * Body Scan Upgrade task, section 5 / section 6, extended by the
 * ARCHI -- Update ARC Body Sensation Selection: Green and Blue Logic
 * task (main objective -- "use supportive attention only for areas
 * explicitly selected as blue; do not present green-only areas as
 * supportive"): the session's own primary positive anchor for
 * Acceptance/Regulation/Encoding now prefers the FIRST region actually
 * marked "blue" (opening_and_supportive) in openingBodyScanRegions --
 * never a green-only entry, which this function must never present as
 * supportive. Only when NO region was ever marked blue does it fall
 * back to the OLDER primaryOpeningBodyScanRegion (a session mid-flight
 * from before "Select Opening Regions" became multi-select), and only
 * after that to resolveSupportiveAreaLabel (the coarse, desiredEnding-
 * keyed supportive_area_select flow) -- exactly the task's own
 * "existing mechanism" fallback instruction, now with one new,
 * higher-priority rung ahead of it. Every pre-existing session (both
 * newer fields empty/null) resolves through the untouched fallback
 * path, byte for byte as before this task.
 */
function resolvePrimaryOpeningLabel(state: NewArcLiveSessionState): string {
  const supportive = resolveSupportiveOpeningSelections(state.openingBodyScanRegions)[0];
  if (supportive) return resolveBodyScanRegionLabel(supportive.region, supportive.side);
  if (state.primaryOpeningBodyScanRegion) return resolveBodyScanRegionLabel(state.primaryOpeningBodyScanRegion, state.primaryOpeningBodyScanSide);
  return resolveSupportiveAreaLabel(state);
}

/**
 * ARC LIVE emotion-based body suggestions task, section 3: the plain
 * Hebrew word/phrase for whatever emotion is currently selected --
 * never the question copy itself (that's resolveUnpleasantAreaQuestionPrimary
 * below), and never a value live/NewArcLiveScreen.tsx re-derives its
 * own way. Shared by both the question's own wording AND the body-
 * region suggestion lookup (arc/supportiveAnchorSuggestions.ts's
 * resolveSuggestedUnpleasantAreas), so the two always agree on exactly
 * which emotion is "currently selected." null means no emotion was
 * identified (or "other" was chosen with nothing typed) -- both fall
 * through to the neutral question/suggestion default.
 */
export function resolveSelectedEmotionText(state: NewArcLiveSessionState): string | null {
  if (state.selectedEmotion && state.selectedEmotion !== "other") return EMOTION_OPTION_LABELS[state.selectedEmotion];
  if (state.selectedEmotion === "other") return state.customEmotionText?.trim() || null;
  return null;
}

/**
 * A few predefined emotions need their own grammatically correct "את
 * ה-X" phrase rather than a mechanical "את ה" + label concatenation --
 * "חוסר מוטיבציה" (lack_of_motivation) is the one case where that
 * mechanical join would read as broken Hebrew ("את החוסר מוטיבציה").
 * Every other predefined emotion's phrase is still just "את ה" + its
 * own label, listed explicitly here anyway so this table is the single,
 * complete source for all nine rather than half-mechanical/half-listed.
 */
const EMOTION_QUESTION_PHRASES: Record<Exclude<EmotionSelection, "other">, string> = {
  fear: "את הפחד",
  frustration: "את התסכול",
  overwhelm: "את העומס",
  boredom: "את השעמום",
  anger: "את הכעס",
  sadness: "את העצב",
  shame: "את הבושה",
  lack_of_motivation: "את חוסר המוטיבציה",
  tiredness: "את העייפות",
};

/**
 * Requirement 3: "איפה בגוף אתה מרגיש את ה[רגש]?" when a predefined
 * emotion was selected, a generic "...את התחושה של [הטקסט שנכתב]?" for
 * a typed custom emotion (free text can't be grammatically guaranteed
 * to fit the "את ה-X" template), and the neutral fallback when no
 * emotion was identified at all -- exactly the three cases the task's
 * own spec names.
 */
function resolveUnpleasantAreaQuestionPrimary(state: NewArcLiveSessionState): string {
  if (state.selectedEmotion && state.selectedEmotion !== "other") {
    return `איפה בגוף אתה מרגיש ${EMOTION_QUESTION_PHRASES[state.selectedEmotion]}?`;
  }
  const customText = state.selectedEmotion === "other" ? state.customEmotionText?.trim() : null;
  if (customText) return `איפה בגוף אתה מרגיש את התחושה של ${customText}?`;
  return "איפה בגוף אתה מרגיש תחושה לא נעימה, אם קיימת?";
}

export function getStepContent(state: NewArcLiveSessionState): NewArcLiveStepContent {
  const sensation = state.supportiveSensation ?? "";
  const movement = state.positiveMovement ?? "";
  const supportiveAreaLabel = resolvePrimaryOpeningLabel(state);

  switch (state.currentStep) {
    case "goal_select":
      return { title: "המטרה", primary: "מה המטרה שלך עכשיו?", supporting: [] };

    // "התבוננות וחיבור לעצמי" task: the branch screen -- the choice
    // itself (do the exercise, or continue) lives in live/NewArcLiveScreen.tsx's
    // own two-button render case, never guessed or auto-decided here.
    case "self_observation_choice":
      return {
        title: "התבוננות וחיבור לעצמי",
        primary: "לפני שממשיכים, אפשר לעשות תרגיל קצר של התבוננות וחיבור לעצמי.",
        supporting: [],
      };

    // The guided exercise itself -- the exact, verbatim instruction from
    // the spec. The personalized name button and the "no name saved yet"
    // entry field are both rendered by live/NewArcLiveScreen.tsx (a
    // personal-profile value, not session content), never duplicated
    // here in the copy itself.
    case "self_observation_exercise":
      return {
        title: "התבוננות וחיבור לעצמי",
        primary: "ראה את עצמך מהצד, אמור את שמך והתייחס לעצמך כפי שהיית רוצה שיתייחסו אליך -- בקבלה ובהבנה.",
        supporting: [],
      };

    // ARCHI -- Free Breathing Intro & Persistent Very Pale Blue
    // Background task: the one shared opening screen for Full ARC and
    // Mini ARC alike -- the exact, verbatim mantra, no other text
    // (live/components/FreeBreathingIntro.tsx renders its own
    // illustration + Continue/Skip actions, never a second,
    // competing instruction below the mantra).
    case "free_breathing":
      return { title: "נשימה חופשית", primary: ARC_FREE_BREATHING_MANTRA, supporting: [] };

    case "desired_ending":
      if (state.goalType === "emotion_only") {
        return { title: "התחושה המבוקשת", primary: "איך היית רוצה להרגיש בסוף התרגיל?", supporting: [] };
      }
      return {
        title: "סוף הפעולה",
        primary: "איך אתה רוצה שסוף הפעולה הבאה ייראה?",
        supporting: state.firstAction ? [`הפעולה הראשונה שהגדרת: ${state.firstAction}`] : [],
      };

    // ARCHI -- Universal ARC Routing, Emotion Identification & Android
    // Shortcuts task, requirement 2 ("ONE SHARED INITIAL COGNITIVE
    // SELECTOR"): "מה מופיע אצלי עכשיו?" -- the trainee's own exact
    // wording from the spec. The three checkboxes themselves, and the
    // dynamic "המשך עם הרגש בלבד" / "המשך לתרגיל" continue-button label,
    // are rendered directly by live/NewArcLiveScreen.tsx (never baked
    // into this fixed content), since they depend on live UI state
    // (which boxes are currently checked), not on session data alone.
    case "cognitive_selector":
      return { title: "מה מופיע אצלי עכשיו?", primary: "מה מופיע אצלך עכשיו?", supporting: ["אפשר לבחור כל שילוב -- מחשבה, פרשנות, דחף -- או לא לבחור כלל."] };

    // Requirement 6: a dedicated capture-only screen -- reachable only
    // when "cognitive_selector" checked "דחף". Never asks about
    // emotion here any more (emotion now has its own always-reachable
    // step, later in the sequence).
    case "urge":
      return { title: "דחף", primary: "איזה דחף עולה עכשיו?", supporting: ["לדוגמה: דחף לפתוח את הטלפון, לדחות את המשימה, לגרד, לקום ולעזוב. (רשות)"] };

    // Requirement 4 ("EMOTION IDENTIFICATION -- ALWAYS INCLUDED"): now
    // ALWAYS reachable (Full, Shortened, and Mini ARC alike), and now
    // the trainee's own exact wording -- "איזה רגש אני מרגיש עכשיו?" --
    // reusing the existing emotion taxonomy/picker (PREDEFINED_EMOTION_OPTIONS),
    // never a second, separate emotion engine.
    case "emotion":
      return { title: "רגש", primary: "איזה רגש אני מרגיש עכשיו?", supporting: [] };

    // ARCHI -- Action-Readiness Check ("בדיקת מוכנות לפעולה") task:
    // the two 0-10 rating questions, both shown on the same screen --
    // live/NewArcLiveScreen.tsx's own render case reads "primary" as
    // the first question and supporting[0] as the second, exactly as
    // written in the spec.
    //
    // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
    // task: a THIRD 0-10 rating, supporting[1], added to this SAME
    // screen -- "how much free time do you have for practice right
    // now?" -- read by the live screen's own third chip row.
    case "action_readiness_check":
      return {
        title: "בדיקת מוכנות לפעולה",
        primary: "עד כמה התחושה הלא נעימה חזקה כרגע?",
        supporting: ["עד כמה אתה מרגיש מוכן לפעולה כרגע?", "כמה זמן פנוי יש לך לתרגול כרגע?"],
      };

    // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
    // task: "סבבה" (shortened) has no action_readiness_check at all, so
    // it asks this SAME free-time rating on its own standalone screen
    // instead, right after "free_breathing" -- never re-asked if a
    // "פחות טוב" session already answered it (see isStepReachable).
    case "time_available_check":
      return { title: "זמן פנוי", primary: "כמה זמן פנוי יש לך לתרגול כרגע?", supporting: [] };

    // Shared by both tracks' short depth -- one combined screen
    // (point, widening the field of view, sounds, body) replacing the
    // 4-5 separate full-depth Presence pages. The body itself is shown
    // and animated in the circle here (resolveShowBodyForStage in
    // arc/arcBodyMantraCircleLogic.ts), unlike every other pre-body
    // Presence page.
    case "quick_presence":
      return {
        title: "נוכחות מהירה",
        primary: "אני ממקד את המבט בנקודה, מרחיב את שדה הראייה, מקשיב לצלילים סביבי, ומרגיש את הגוף.",
        supporting: [],
      };

    // "פחות טוב" short depth only -- a single RED/BLUE body-marking
    // screen (cycleShortBodyMarking, arc/newArcLiveSteps.ts) replacing
    // the two separate full-depth body_scan_contraction/
    // body_scan_opening_region screens. "סבבה" short depth reuses the
    // existing "supportive_area_select" screen instead.
    case "short_body_marking":
      return {
        title: "סימון בגוף",
        primary: "סמן אזור מכווץ באדום, ואזור תומך אך סגור ולא יציב בכחול.",
        supporting: [],
      };

    // Requirement 6: captures ONLY the thought now -- reachable only
    // when "cognitive_selector" checked "מחשבה". Interpretation has its
    // own separate "interpretation" step right after "reality_acceptance"
    // (Thought's own acceptance), never merged into this screen any more.
    case "thought":
      return {
        title: "מחשבה",
        primary: "שים לב למחשבה שעוברת עכשיו, בלי לנסות לעצור או לשנות אותה.",
        supporting: ["איזו מחשבה מעסיקה אותך עכשיו? (רשות)"],
      };

    case "stop_and_accept_urge":
      return getUrgeAcceptanceContent();

    // Requirement 6-7: always has a real thought at this point
    // (isStepReachable gates on currentThought alone) -- the old
    // mode-A "interpretation only" fallback is gone from this function
    // entirely; see getInterpretationAcceptanceContent below for that
    // content's own new, separate home.
    case "reality_acceptance":
      return getRealityAcceptanceContent(state.subIndex, state.thoughtTimeOrientation);

    // Requirement 6: captures ONLY the interpretation -- reachable only
    // when "cognitive_selector" checked "פרשנות".
    case "interpretation":
      return {
        title: "פרשנות",
        primary: "שים לב לפרשנות שאתה נותן למצב עכשיו, בלי לנסות לעצור או לשנות אותה.",
        supporting: ["איזו פרשנות אתה נותן למצב? (רשות)"],
      };

    // Requirement 7: Interpretation's own dedicated, ALWAYS-separate
    // acceptance moment (never folded into "reality_acceptance" any
    // more) -- the exact, verbatim mantra, shown inside the Presence
    // circle exactly like Thought's own acceptance above.
    case "interpretation_acceptance":
      return { title: "קבלת הפרשנות", primary: INTERPRETATION_ACCEPTANCE_LINE, supporting: [] };

    // Fix All Confirmed ARC Android Bugs task, requirement 2 ("Presence
    // Mantras Inside the Circle"): these five Presence steps are now
    // each exactly one fixed first-person mantra, rendered INSIDE
    // live/components/ArcBodyMantraCircle.tsx -- the exact same "one
    // mantra page at a time, the body animation teaches the movement,
    // the mantra teaches attention" pattern Dwelling/Acceptance/
    // Regulation/Encoding below already use, extended backward to
    // cover every one of the nine mantra pages in the exercise. The
    // old multi-line/conditional wording (getVisualFieldContent's own
    // thought/interpretation-aware phrasing, getSoundAwarenessContent,
    // getBodyScanContent's per-region walk) carried no session-state
    // or gating side effects of its own -- confirmed by reading every
    // one of those functions before deleting them -- so replacing it
    // with a fixed mantra loses no functionality. "focus_color"
    // (immediately below, UNCHANGED) stays its own genuine interactive
    // color-selection screen, never mantra-ified: picking the
    // Presence color is a real selection action, not a passive page.
    case "natural_breathing":
      // ARCHI -- Unified 7-Part Update task, Part 6.3 ("AUTOMATIC
      // PRESENCE MUST BE FIRST" -- Shortened ARC only): "סבבה" reuses
      // this exact step/engine/UI (ArcBodyMantraCircle, never a second
      // Presence engine) as its own ONE automatic opening screen --
      // the exact, verbatim combined mantra the spec requires, never
      // the Full ARC five-screen Presence walk (center_attention/
      // focus_color/visual_field/sound_awareness stay skipped for this
      // mode, SHORTENED_ARC_SKIPPED_STEPS in arc/newArcLiveSteps.ts).
      if (state.arcInvocationMode === "shortened") {
        return { title: "נוכחות", primary: "אני מרחיב את שדה הראייה ושם לב לגוף.", supporting: [] };
      }
      return { title: "נשימה טבעית", primary: "אני נוכח כאן ועכשיו.", supporting: [] };

    case "center_attention":
      return { title: "נקודת מיקוד", primary: "אני ממקד את המבט בנקודה.", supporting: [] };

    case "focus_color":
      return { title: "נקודת מיקוד", primary: "מה הצבע של הנקודה?", supporting: [], dwellSeconds: 3 };

    case "visual_field":
      return { title: "התרחבות שדה הראייה", primary: "אני מרחיב את שדה הראייה.", supporting: [] };

    case "sound_awareness":
      return { title: "מודעות לצלילים", primary: "אני מקשיב לצלילים סביבי.", supporting: [] };

    case "body_scan":
      return { title: "מודעות לגוף", primary: "אני מרגיש את הגוף שלי.", supporting: [] };

    // ARCHI -- Full ARC Body Flow Redesign task, Screen One: a SINGLE
    // combined Red/Green selection screen now (first tap -> Red, second
    // tap -> Light Green [only for a movement-eligible region], third
    // tap -> deselect -- cycleBodyScanContractionAndGreen,
    // arc/newArcLiveSteps.ts). The two explanatory lines are verbatim
    // from the spec, never paraphrased.
    case "body_scan_contraction":
      return {
        title: "כיווץ וסגירות",
        primary: "איפה בגוף אתה מרגיש כיווץ?",
        supporting: [
          "אפשר לסמן כמה אזורים שרלוונטיים, או להמשיך בלי לסמן אף אחד.",
          "אדום — אזור שבו אתה מרגיש כיווץ.",
          "ירוק — אזור מכווץ וסגור, שאותו אפשר לפתוח ולייצב בנוחות בשלב הקבלה.",
        ],
      };

    // ARC Full Sequence Update task, Part 3: TWO CONSECUTIVE, SEPARATE
    // questions -- "do not automatically assume heaviness means
    // closedness or vice versa; save selections independently." Both
    // read/write the exact same bodyScanHeavinessRegions array, via
    // their own independent bit-flip (arc/bodyScanSelection.ts's
    // toggleBodyScanHeaviness/toggleBodyScanClosedness).
    case "body_scan_heaviness":
      return {
        title: "כבדות",
        primary: "באילו אזורים בגוף אתה מרגיש כבדות?",
        supporting: ["אפשר לסמן כמה אזורים שרלוונטיים, או להמשיך בלי לסמן אף אחד."],
      };

    case "body_scan_closedness":
      return {
        title: "סגירות",
        primary: "באילו אזורים בגוף אתה מרגיש סגירות?",
        supporting: ["אפשר לסמן כמה אזורים שרלוונטיים, או להמשיך בלי לסמן אף אחד."],
      };

    // ARCHI -- Update ARC Body Sensation Selection: Green and Blue
    // Logic task, section 7 ("show a short, clear legend... make it
    // clear that BLUE represents two roles simultaneously, not merely
    // a positive sensation"): the legend lines live here, in
    // `supporting`, right next to the question itself -- never a
    // separate screen/step.
    // ARCHI -- Full ARC Body Flow Redesign task, Screen Two: now
    // Blue-ONLY -- every Red/Green region from Screen One is absolutely
    // excluded (enforced in the engine by cycleSupportiveOnlyOpening,
    // never only here in copy). The question names the trainee's own
    // ACTUAL positive/supportive feeling (resolveFinalSupportiveFeeling,
    // the exact same resolution Encoding already uses) whenever one is
    // already known; "If a positive feeling is missing, provide the
    // existing appropriate selection/custom-entry option before
    // requiring it" is handled by the SCREEN itself (live/NewArcLiveScreen.tsx
    // shows the shared supportive-feeling picker inline in that case),
    // never by inventing a feeling name here.
    case "body_scan_opening_region": {
      const feeling = resolveFinalSupportiveFeeling(state);
      return {
        title: "בחירת אזור תומך",
        primary: feeling
          ? `באילו אזורים בגוף אתה מרגיש סגירות ותמיכה הקשורות לתחושת ה${feeling.feeling}?`
          : "באילו אזורים בגוף אתה מרגיש סגירות ותמיכה?",
        supporting: ["כחול — אזור תומך שבו תרצה להפנות תשומת לב ולבצע פתיחה וייצוב הדרגתיים.", "לחץ על אזור לבחירה, ולחץ שוב לביטול."],
      };
    }

    // ARC Full Sequence Update task, Part 1 steps 4-5: a genuinely NEW
    // pair of steps -- deliberately never reusing "desired_ending"
    // below, which keeps its own existing, goalType-dependent role for
    // "action"/"combined" (its own, different question about the
    // action's ending, never a feeling). Final ARC Body Redesign & Flow
    // Fixes task: "desired_ending" ALSO used to ask this exact same
    // "how would you like to feel" question again for goalType
    // "emotion_only" -- a confirmed duplicate, since THIS step already
    // asks it, unconditionally, for every goal type, right after Closure
    // Identification. isStepReachable (arc/newArcLiveSteps.ts) now skips
    // "desired_ending" in exactly that case, so the question is asked
    // exactly once. "Save the exact feeling; do not assume it is already
    // present."
    case "desired_feeling_select":
      return { title: "התחושה המבוקשת", primary: "מה היית רוצה להרגיש?", supporting: [] };

    case "desired_feeling_locate": {
      // Reachable (isStepReachable, arc/newArcLiveSteps.ts) only when a
      // feeling was actually chosen, so desiredFeelingText is never
      // blank here in practice -- the ?? "" fallback is purely
      // defensive, never actually hit.
      const feelingText = state.desiredFeelingText ?? "";
      return { title: "מיקום התחושה המבוקשת", primary: resolveDesiredFeelingLocateQuestion(feelingText), supporting: [] };
    }

    case "unpleasant_area_question":
      // ARC LIVE emotion-based body suggestions task, requirement 3:
      // the question itself now names the already-selected emotion
      // (or falls back to the neutral wording) -- the two existing
      // chip actions below it (resolveNextStep's own "כן, לבחור אזור"
      // / "לא, להמשיך") are UNCHANGED, still exactly "allow skipping
      // when no unpleasant region is identified."
      return { title: "סריקת הגוף", primary: resolveUnpleasantAreaQuestionPrimary(state), supporting: [] };

    case "unpleasant_area_select":
      // Part F step 3 / H.2: the side-view imagery of the unpleasant
      // area is a PLANNED-ONLY engine-level difference -- never shown
      // in a spontaneous session, which moves directly to dwelling in
      // the sensation from inside (Part B.2 item 5).
      if (state.arcInvocationMode === "spontaneous") {
        return { title: "אזור לא נעים", primary: "שים לב לאזור הזה מבפנים, במידה שנוחה לך. אין צורך להתמקד בו בכוח.", supporting: [] };
      }
      // Reworded to avoid "דמיין" entirely, the same established
      // convention this file already uses twice elsewhere (see the
      // encoding-spread lines below) -- arc/instructions.ts's safety
      // denylist only whitelists a handful of exact "דמיין" continuations,
      // and observing a BODY AREA from outside isn't one of them, so
      // "אפשר להתבונן ב... כאילו מבחוץ" is used instead, preserving the
      // task's own "side-view" instruction without invoking the banned
      // verb at all.
      return {
        title: "אזור לא נעים",
        primary: "לרגע קצר, אפשר להתבונן באזור הזה כאילו מבחוץ, כמו מהצד.",
        supporting: ["עכשיו אפשר לעבור לשהות בתחושה הזאת מבפנים, במידה שנוחה לך."],
        dwellSeconds: 2,
      };

    case "dwelling":
      // Final ARC Flow & Body Animation task, requirement 5 ("שהייה"):
      // the EXACT fixed Hebrew mantra, verbatim from the spec -- no
      // interpolation, no region names, no duration guidance. "The
      // body animation teaches the movement; the mantra teaches
      // attention" -- this stage's own body stillness and the
      // continuing Presence point are shown by
      // live/components/ArcBodyMantraCircle.tsx, never described here
      // in words. Deliberately user-paced, never timer-gated: no
      // dwellSeconds is set, so Continue is enabled immediately and
      // there is no auto-advance -- the trainee stays exactly as long
      // as they need.
      return { title: "שהייה", primary: "אני נוכח, ונשאר בתחושה הקיימת בגוף.", supporting: [] };

    case "supportive_area_select": {
      // ARCHI -- Unified 7-Part Update task, Part 6.4 ("REPLACE
      // TEXT-BASED SUPPORTIVE BODY SELECTION" -- Shortened ARC only):
      // the exact, verbatim prompt for the new interactive-body screen
      // that replaces the old "אזורי גוף תומכים" text chips for this
      // mode alone -- Full/Mini ARC keep that existing chip screen's
      // own question, below, completely unchanged.
      if (state.arcInvocationMode === "shortened") {
        return { title: "אזורים לפתיחה", primary: "באילו אזורים בגוף אני מרגיש סגירות או חוסר יציבות?", supporting: [] };
      }
      // Physical questionnaire placement task, section 1 / ARC LIVE
      // emotion-based body suggestions task, requirement 4: the desired
      // feeling was already asked earlier (desired_feeling_select,
      // right after Closure Identification -- the ONE place every goal
      // type is asked this, since the Final ARC Body Redesign & Flow
      // Fixes task) and is never re-asked here -- only read verbatim
      // and interpolated into this new question's own text.
      // desiredFeelingText, never desiredEnding: that field now holds
      // this universal feeling answer for every goal type (action's own
      // desiredEnding is about the action's ending, never a feeling, so
      // it was never the right field to read here even before this
      // fix -- a latent inconsistency this change also corrects).
      const desiredFeeling = state.desiredFeelingText?.trim();
      return {
        title: "אזורי גוף תומכים",
        primary: desiredFeeling
          ? `באילו אזורים בגוף היית רוצה לחזק תחושה שתומכת ב${desiredFeeling}?`
          : "באילו אזורים בגוף היית רוצה לחזק תחושה תומכת?",
        supporting: [],
      };
    }

    case "supportive_sensation_select":
      return {
        title: "תחושה תומכת",
        primary: "איזו תחושה תומכת או תחושת התחדשות היית רוצה לחזק באזור הזה?",
        supporting: [],
      };

    case "supportive_movement_select":
      return {
        title: "תנועה תומכת",
        primary: "איזו תנועה גופנית יכולה לתמוך בתחושה הזאת?",
        supporting: [],
      };

    case "acceptance":
      return getAcceptanceContent();

    // ARCHI -- Full ARC Body Flow Redesign task: Acceptance Part 2 --
    // right after the new Blue-only supportive-region selection screen.
    case "acceptance_part_two":
      return getAcceptancePartTwoContent();

    // ARCHI -- Show Action Selection ON the Regulation Screen task:
    // "regulation" is now always exactly one sub-screen (subIndex 0),
    // so its content is always just the Regulation mantra itself --
    // the action-selection prompt is a separate, always-visible UI
    // section live/NewArcLiveScreen.tsx renders alongside it, not a
    // second content page.
    case "regulation":
      return getRegulationContent(state);

    // ARCHI -- Unified Final Specification task, section 2 ("Action
    // Selection must occur immediately AFTER Regulation and BEFORE
    // Encoding") / ARCHI -- Move Action Selection into the Existing
    // Regulation Screen task: these two step ids are now permanently
    // unreachable (isStepReachable in arc/newArcLiveSteps.ts) -- their
    // content stays intact, purely for migrateLegacyNewArcLiveStep's
    // own historical-data safety (a session can briefly carry this
    // currentStep in memory for one tick before that migration runs).
    // getActionSelectionContent() below is the SAME content now also
    // used by "regulation"/"mini_acceptance_transition" at subIndex 1
    // -- never a second, duplicated copy of this prompt.
    case "action_selection":
    case "mini_action_selection":
      return getActionSelectionContent();

    case "encoding":
      return getEncodingContent(state);

    case "transition":
      // Part A: the Emotional track's own emotional action happens live,
      // right here (the next two steps) -- never "the exercise has
      // ended, optionally do something small", which left it without a
      // real action at all. The Combined track names BOTH actions, so
      // the emotional one isn't mistaken for the whole exercise.
      if (state.goalType === "emotion_only") {
        return { title: "לקראת הפעולה הרגשית", primary: "לקראת סיום -- אילו פעולה רגשית קטנה תרצה לבצע עכשיו?", supporting: [] };
      }
      if (state.goalType === "combined") {
        return {
          title: "לקראת הפעולה",
          primary: "לקראת סיום -- קודם פעולה רגשית קטנה, ולאחריה הפעולה הזהותית.",
          supporting: [`הפעולה הזהותית שלך: ${state.firstAction}`],
        };
      }
      return {
        title: "לקראת הפעולה",
        primary: `הפעולה הראשונה שלך: ${state.firstAction}`,
        supporting: ["אתה מוכן להתחיל?"],
      };

    case "emotional_action":
      return {
        title: "פעולה רגשית",
        primary: "בחר פעולה רגשית קטנה שתרצה לבצע עכשיו, או כתוב פעולה משלך.",
        supporting: [],
      };

    case "emotional_insight":
      return {
        title: "תובנה",
        primary: "מה התובנה שלמדת על עצמך מהפעולה?",
        supporting: ["אפשר גם לנסח מתוך התובנה אמונה מחזקת, או לשמור את התובנה בלבד."],
      };

    case "complete":
      // Part F step 10 / Part A (every track ends with reinforcement +
      // gratitude): a brief, neutral acknowledgement -- never claiming
      // a specific emotional outcome (same "never claim the trainee is
      // now calmer" restraint arc/instructions.ts's own denylist
      // already enforces elsewhere), just recognizing that the practice
      // happened.
      return { title: "הושלם", primary: "חוזרים למשימה.", supporting: ["שווה לשים לב שהתרגול הזה קרה. על מה אתה מודה לעצמך כרגע?"] };

    // Part G: Mini ARC's own combined screens.
    case "mini_awareness":
      // Unified awareness/urge/thought/interpretation update, section 6:
      // no longer asks about the thought here -- that is now
      // "mini_thought"'s own dedicated screen, AFTER mini_stop_accept_urge.
      return {
        title: "מודעות מהירה",
        primary: "מה הרגש שעולה עכשיו?",
        supporting: state.goalType !== "emotion_only" ? ["איזו תוצאה אני רוצה לקדם ואיזה ערך היא מבטאת?"] : [],
      };

    case "mini_thought":
      // Unified ARC & Productivity Update task, requirement 6: Mini
      // ARC's own distinctive opening -- "an optional brief awareness
      // choice: Thought / Interpretation / Urge... do not force
      // completing all three." Framed as a single choice, not the old
      // combined thought+interpretation screen.
      return {
        title: "מודעות קצרה (רשות)",
        primary: "אפשר לשים לב בקצרה למה שעולה עכשיו -- מחשבה, פרשנות, או דחף -- בלי לנסות לעצור או לשנות אותו.",
        supporting: ["אפשר לבחור לכל היותר אחד מהשלושה, או להמשיך בלי לבחור כלל."],
      };

    // Unified ARC & Productivity Update task, requirement 7: Mini
    // ARC's own short acceptance protocol for the "urge" chooser
    // option -- the exact, verbatim Presence-circle mantra (rendered
    // via live/components/ArcBodyMantraCircle.tsx, stage
    // "urge_acceptance"), matching Full ARC's own closing mantra, kept
    // to the one screen Mini ARC's brevity requirement calls for.
    // ARCHI -- Two Mantras for Urge Acceptance correction: Mini ARC's
    // own urge screen now shows the exact SAME content as Full ARC's
    // "stop_and_accept_urge" -- "apply this change whenever the
    // urge-acceptance branch is used, including Full ARC, Mini ARC" --
    // never a second, slightly-different mantra for the same moment.
    case "mini_stop_accept_urge":
      return getUrgeAcceptanceContent();

    case "mini_reality_acceptance":
      return getMiniRealityAcceptanceContent(state.thoughtTimeOrientation, !!state.currentThought);

    case "mini_presence": {
      // Three-levels-of-acceptance task, section 6 / unified update,
      // section 6: Mini ARC combines psychological (thought and/or
      // interpretation) acceptance with field-widening on this SAME
      // screen, never a separate transition screen -- "לא להאריך את
      // התרגיל במסכי מעבר מיותרים." Body-sensation noticing stays in
      // the same sentence in every case. Interpretation-only (mode A)
      // gets no extra wording here -- its own acceptance already
      // happened on the dedicated mini_reality_acceptance screen just
      // before this one.
      const hasThought = !!state.currentThought;
      const hasInterpretation = !!state.interpretationText;
      let primary: string;
      if (hasThought && hasInterpretation) {
        primary =
          "הרחב לרגע את שדה הראייה לסביבה, ואפשר למחשבה להיות נוכחת. קבל גם את העובדה שאתה מפרש כרגע את המציאות, בלי להילחם באף אחת מהן. שים לב גם לתחושה הלא נעימה, אם יש כזו.";
      } else if (hasThought) {
        primary = "הרחב לרגע את שדה הראייה לסביבה, ואפשר למחשבה להיות נוכחת בלי להילחם בה, ושים לב גם לתחושה הלא נעימה, אם יש כזו.";
      } else {
        primary = "הרחב לרגע את שדה הראייה לסביבה, ושים לב לתחושה הלא נעימה, אם יש כזו.";
      }
      return {
        title: "נוכחות קצרה",
        primary,
        // Mini ARC is always a PLANNED mode, so the side-view line
        // always applies here -- reworded the same way as the Full ARC
        // unpleasant_area_select case, never using "דמיין" directly.
        supporting: ["אפשר להתבונן בה לרגע כאילו מבחוץ, ואז לעבור לשהות בה מבפנים, במידה שנוחה לך."],
      };
    }

    // ARCHI -- Move Action Selection into the Existing Regulation Screen
    // task: same subIndex-1 integration as "regulation" above, since
    // this is Mini ARC's own regulation-equivalent moment (no separate
    // "regulation" step of its own). subIndex 0 is the UNCHANGED
    // existing area/sensation/movement prompt.
    case "mini_acceptance_transition":
      return state.subIndex === 1
        ? getActionSelectionContent()
        : {
            title: "קבלה ומעבר",
            primary: "אפשר לתחושה הלא נעימה להתקיים, בלי להילחם בה. במקביל, בחר אזור תומך, תחושה תומכת ותנועה תומכת.",
            supporting: [],
            // ARCHI -- Consolidated Implementation Request, Part 7.3
            // ("Allow Several Seconds of Acceptance"): the SAME existing
            // dwellSeconds mechanism every other timed ARC screen
            // already uses (focus_color/natural_breathing) -- "do not
            // automatically advance... allow continuing after the
            // minimum interval... allow remaining longer." Applies only
            // to subIndex 0 (the acceptance/transition screen itself),
            // never to subIndex 1 (the integrated action selector).
            dwellSeconds: 4,
          };

    case "mini_encoding": {
      // Unified ARC & Productivity Update task, requirement 3: the
      // SAME auto-computed resolveEncodingMantra Full/Shortened ARC's
      // own "encoding" step uses -- Mini ARC's old bespoke actionLine
      // (which read the wrong field, desiredEnding, for its
      // emotion_only branch, the same stale-field bug already fixed
      // elsewhere for supportive_area_select) is gone, replaced by the
      // one shared mantra builder. The sensation/area/movement line
      // stays as supporting body-focused detail -- still genuinely
      // useful, just no longer bundled with an invitation to fill in
      // free-text mantra/belief fields (removed entirely, requirement 4).
      const bodyLine = sensation && movement ? `הרגש את ${sensation} באזור ${supportiveAreaLabel}, תוך כדי התנועה ${movement}.` : null;
      return {
        title: "קידוד משולב",
        primary: resolveEncodingMantra(state),
        supporting: bodyLine ? [bodyLine] : [],
      };
    }

    case "mini_action":
      if (state.goalType === "emotion_only") return { title: "לקראת הפעולה", primary: "לקראת פעולה רגשית קטנה.", supporting: [] };
      if (state.goalType === "combined") {
        return { title: "לקראת הפעולה", primary: "לקראת פעולה רגשית, ולאחריה הפעולה הזהותית.", supporting: [`הפעולה הזהותית שלך: ${state.firstAction}`] };
      }
      return { title: "הפעולה שלך", primary: `הפעולה שלך: ${state.firstAction}`, supporting: ["אתה מוכן להתחיל?"] };
  }
}

/**
 * Three-levels-of-acceptance task, section 2: the exact, verbatim
 * time-oriented mantra for reality acceptance -- shared by Full ARC's
 * own two-screen reality_acceptance step and Mini ARC's single combined
 * mini_reality_acceptance screen, so the three mantra strings are never
 * duplicated between them.
 */
/**
 * Unified ARC & Productivity Update task, requirement 7 ("START
 * PRESENCE DURING COGNITIVE ACCEPTANCE"): the exact, verbatim
 * first-person mantra shown INSIDE the Presence circle
 * (live/components/ArcBodyMantraCircle.tsx, stage "thought_acceptance")
 * the moment a thought's time orientation is known -- replaces the
 * old second-person "תנשום... ותסתכל על נקודה" wording entirely, per
 * the task's own "use short, positive copy."
 */
function resolveRealityAcceptanceMantra(orientation: ThoughtTimeOrientation): string {
  switch (orientation) {
    case "past":
      return "אני מביט בנקודה ונותן מקום למחשבה על מה שקרה.";
    case "present":
      return "אני מביט בנקודה ונותן מקום למחשבה על מה שקורה.";
    case "future":
      return "אני מביט בנקודה ונותן מקום למחשבה על מה שעשוי לקרות.";
  }
}

/**
 * Unified awareness/urge/thought/interpretation update, section 4,
 * mode A: a thought was never written, only an interpretation -- a
 * single fixed line, never the time-classification question (there is
 * no thought to classify), never the time-oriented mantras, never the
 * thought-acceptance step. Accepts the ACT of interpreting, not the
 * interpretation's own content (section 4's own closing line: "המטרה
 * היא לקבל את עצם פעולת הפרשנות, ולא להסכים עם התוכן שלה.").
 */
// Unified ARC & Productivity Update task, requirement 7: the exact,
// verbatim mantra shown inside the SAME Presence circle for mode A
// (interpretation only, no thought) -- replaces the old second-person
// "נשום בצורה חופשית וקבל..." line entirely.
const INTERPRETATION_ACCEPTANCE_LINE = "אני מביט בנקודה ונותן מקום לפרשנות שלי.";

/**
 * Three-levels-of-acceptance task, section 2 / ARCHI Universal ARC
 * Routing task, requirement 6-7: subIndex 0 asks which time the
 * thought concerns, subIndex 1 shows the resolved, orientation-adapted
 * mantra. ALWAYS reached with a real thought now -- this step's own
 * isStepReachable gate requires currentThought specifically; the old
 * mode-A "interpretation only" fallback is gone from this function
 * entirely (interpretation_acceptance, below the switch in
 * getStepContent, is its own separate, always-reachable-independently
 * step now).
 */
// Unified ARC & Productivity Update task, requirement 7: once the
// mantra itself is known (once an orientation is chosen), this step's
// own render case in live/NewArcLiveScreen.tsx shows it inside the
// Presence circle -- content.primary only, never title/supporting (the
// circle component never reads either) -- so both are kept
// minimal/empty here, and the old "this isn't agreement" clarification
// lines (still true, but no longer shown as on-screen text) move into
// this doc comment instead: accepting a thought/interpretation never
// means agreeing with it, justifying it, or treating a feared future
// event as certain.
function getRealityAcceptanceContent(subIndex: number, orientation: ThoughtTimeOrientation | null): NewArcLiveStepContent {
  const title = "קבלת המציאות";
  if (subIndex === 0 || !orientation) {
    return { title, primary: "לאיזה זמן המחשבה שלך מתייחסת?", supporting: [] };
  }
  return { title, primary: resolveRealityAcceptanceMantra(orientation), supporting: [] };
}

/**
 * Three-levels-of-acceptance task, section 6 / unified update, section
 * 6: Mini ARC's own short combined screen. With a thought (modes B/C):
 * the same question before an orientation is chosen, then the same
 * resolved mantra once it is, never two separate sub-screens. Without
 * a thought but with an interpretation (mode A): the same single fixed
 * line as Full ARC's own mode-A screen, no time question at all.
 */
function getMiniRealityAcceptanceContent(orientation: ThoughtTimeOrientation | null, hasThought: boolean): NewArcLiveStepContent {
  if (!hasThought) {
    return { title: "קבלת הפרשנות", primary: INTERPRETATION_ACCEPTANCE_LINE, supporting: [] };
  }
  const title = "קבלת מציאות קצרה";
  if (!orientation) {
    return { title, primary: "לאיזה זמן המחשבה שלך מתייחסת?", supporting: [] };
  }
  return { title, primary: resolveRealityAcceptanceMantra(orientation), supporting: [] };
}

/**
 * ARCHI -- Two Mantras for Urge Acceptance correction: replaces the old
 * five-preparatory-sub-screen walk (requirements 2-3 of the earlier
 * Urge-stop task) with the ONE animated urge-acceptance screen the
 * trainee's own correction asks for -- "these create unnecessary
 * friction before the user reaches the animated acceptance circle."
 * `primary` is the short mantra shown INSIDE the circle
 * (live/components/ArcBodyMantraCircle.tsx, stage "urge_acceptance");
 * `supporting` is EXACTLY the two below-circle first-person mantras,
 * always shown together, representing the two essential actions --
 * pausing the automatic response, and directing attention to the
 * urge's own bodily sensation. No dwellSeconds: the trainee stays on
 * this one screen exactly as long as needed, advancing with a single
 * tap on the circle, never auto-timed and never blocked. Shared
 * verbatim by Full ARC's "stop_and_accept_urge" and Mini ARC's
 * "mini_stop_accept_urge" -- never a second, duplicated urge-
 * acceptance engine for the same moment, whether reached from Full
 * ARC, Mini ARC, or a Task-LIVE-triggered session (the same universal
 * step order carries all three).
 */
function getUrgeAcceptanceContent(): NewArcLiveStepContent {
  return {
    title: "עצירה וקבלת הדחף",
    primary: "אני נותן מקום לדחף.",
    supporting: ["אני עוצר לרגע.", "אני מפנה תשומת לב לתחושת הדחף בגוף."],
  };
}

/**
 * Final ARC Flow & Body Animation task, requirement 5: Acceptance,
 * Regulation and Encoding are each now exactly ONE fixed mantra page
 * (stepSubCount for all three is 1, arc/newArcLiveSteps.ts) -- "the
 * body animation teaches the movement; the mantra teaches attention."
 * None of these three mantras interpolates a region label, sensation
 * word, or movement description: "do not verbally list anatomical
 * regions during these stages -- the body already shows them." The
 * body's own progressive opening movement and the red/blue-to-
 * supportive-color brightening are rendered entirely by
 * live/components/ArcBodyMantraCircle.tsx from the session's own
 * openingBodyScanRegions/bodyScanContractionRegions/bodyScanHeavinessRegions
 * -- never duplicated here as text.
 */
/**
 * ARCHI -- Full ARC Body Flow Redesign task: Acceptance Part 1's own
 * EXACT required mantra, verbatim -- "I stay and accept the
 * contraction," never mentioning support (the Blue supportive region
 * hasn't been chosen yet at this point in the sequence; it is only
 * selected right after this stage). The personalized Green-region
 * opening/stabilization instructions (one line per distinct movement
 * set the trainee actually selected Green) render entirely below the
 * circle via live/components/ArcBodyMantraCircle.tsx's own
 * resolveMovementInstructionsForStage -- never duplicated here as text.
 */
function getAcceptanceContent(): NewArcLiveStepContent {
  return { title: "קבלה", primary: "אני שוהה ומקבל את הכיווץ.", supporting: [] };
}

/**
 * ARCHI -- Final Correction: One Acceptance Stage, Two Parts, Attention
 * Transfer During Regulation task: Acceptance Part 2, right after the
 * Blue-only supportive-region selection screen -- ONE continuous
 * exercise, never divided into separate phases/substeps. It guides
 * SIMULTANEOUS attention to the contracted Red regions AND the chosen
 * Blue regions together (contraction need not disappear here either),
 * and begins the Blue regions' own gentle opening/stabilization --
 * but, critically, it must NEVER instruct transferring attention AWAY
 * from the contracted regions; that gradual transfer now happens only
 * during Regulation (getRegulationContent below). Same title "קבלה" as
 * Part 1 -- Acceptance stays ONE user-facing stage with two parts, even
 * though "acceptance"/"acceptance_part_two" remain separate internal
 * step ids for navigation/persistence. The Blue regions' own
 * region-specific opening instructions render below the circle exactly
 * like Part 1's Green ones did, via the same shared mechanism.
 */
function getAcceptancePartTwoContent(): NewArcLiveStepContent {
  return { title: "קבלה", primary: "אני שם לב גם לכיווץ וגם לתמיכה, ומתחיל לפתוח ולייצב בעדינות את אזורי התמיכה.", supporting: [] };
}

/**
 * Bug fix: "סבבה" (Shortened ARC) never asks about contraction at all
 * -- body_scan_contraction is permanently unreachable for
 * arcInvocationMode "shortened" (SHORTENED_ARC_SKIPPED_STEPS,
 * arc/newArcLiveSteps.ts), so the shared "אני נוכח, מקבל את הכיווץ..."
 * wording ("I accept the CONTRACTION") was always inaccurate for this
 * one path -- the trainee never identified a contraction to accept.
 * Shortened ARC's own Regulation page keeps its own required wording,
 * with no mention of contraction; it is unaffected by this task, which
 * concerns Full ARC / "פחות טוב" only.
 *
 * ARCHI -- Final Correction: One Acceptance Stage, Two Parts, Attention
 * Transfer During Regulation task: Regulation -- NOT Acceptance Part 2
 * -- is where the gradual transfer of attention from the contracted
 * Red regions toward the supportive Blue regions actually happens. It
 * also names the continued, gradual, comfortable opening/stabilization
 * of the Blue regions (whose own per-region instructions render below
 * the circle, unchanged) -- and explicitly never requires the
 * contraction to disappear. The integrated action-selection sub-screen
 * at subIndex 1 is completely untouched by this wording change.
 *
 * ARCHI -- Full ARC Regulation Fix + Automatic Symmetrical Body
 * Highlighting task, section 1-2: the PREVIOUS wording here (from the
 * task above) folded in a "<feeling> מתפשטת אצלי" ("<feeling> is
 * spreading throughout me") clause -- a genuine regression, since that
 * exact whole-body-spreading-feeling phrasing is Encoding's own
 * dedicated job (resolveEncodingMantra below), never Regulation's.
 * Corrected: this mantra now (1) opens by acknowledging the CONTINUED
 * acceptance of the contracted sensation, (2) states the spec's own
 * exact required sentence verbatim ("אני מעביר בהדרגה את תשומת הלב
 * מהאזורים המכווצים לעבר אזורי התמיכה"), and (3) closes with the
 * continued opening/stabilization + "never requires the contraction to
 * disappear" clause -- with NO mention of the supportive feeling
 * spreading anywhere in it any more. resolveDesiredFeelingPhrase is no
 * longer called here at all (Encoding is its only caller now).
 */
function getRegulationContent(state: NewArcLiveSessionState): NewArcLiveStepContent {
  if (state.arcInvocationMode === "shortened") {
    return { title: "ויסות", primary: "אני שם לב למה שקורה בגוף ומעמיק את תשומת הלב לתמיכה", supporting: [] };
  }
  // ARCHI -- Simplify the Regulation Stage (Body Image + Short Mantra)
  // task: supersedes the earlier three-sentence mantra above (and that
  // task's own "exact required sentence" requirement) with exactly
  // this one short, readable line -- "a simple, clear, visual
  // regulation stage where the user accepts the contraction while
  // directing more attention to the body's supportive areas," never
  // the longer wording. "סבבה" (the branch right above this one) is
  // explicitly NOT touched -- its own separate, unrelated mantra text
  // stays exactly as it already was.
  return { title: "ויסות", primary: "אני מקבל את הכיווץ ושם לב יותר לתמיכה", supporting: [] };
}

/**
 * ARCHI -- Move Action Selection into the Existing Regulation Screen
 * task: the fixed prompt text only -- "איזו פעולה תרצה לעשות עכשיו?"
 * (the task's own exact wording). The actual candidate list (scheduled
 * tasks for today, highlighting any due now, plus a temporary-action
 * text/duration entry) is session/IO data, not fixed copy --
 * live/NewArcLiveScreen.tsx renders it from its own locally-loaded
 * daily-plan state, exactly the same split every other interactive-
 * picker step here already uses. Shared verbatim by "regulation" and
 * "mini_acceptance_transition" at their own subIndex 1, and by the
 * now-unreachable "action_selection"/"mini_action_selection" (kept for
 * historical-data safety) -- one single source of this text.
 */
function getActionSelectionContent(): NewArcLiveStepContent {
  return { title: "הפעולה הבאה", primary: "איזו פעולה תרצה לעשות עכשיו?", supporting: [] };
}

/**
 * Unified ARC & Productivity Update task, requirement 3 ("AUTOMATIC
 * ENCODING MANTRAS -- ALL ARC ROUTES"): the one COMPUTED mantra every
 * ARC route's Encoding step actually uses -- "remove the need for
 * users to write their own belief or action mantra... Presence +
 * supportive feeling + imagined next action, when an action is
 * available." Built from session fields alone, never user-authored
 * free text:
 * - The feeling clause now names the trainee's OWN actually-selected
 *   desiredFeelingText ("נותן מקום לתחושת X") whenever one was
 *   captured, falling back to the old generic "התחושה התומכת" only
 *   when none exists (e.g. a shortened session that skipped
 *   desired_feeling_select and never reached desired_ending either).
 *   Phrased as "giving ROOM to" the feeling, never "I already feel
 *   X" -- "do not claim the user already experiences a feeling merely
 *   because they selected it as a desired feeling."
 * - The action clause is added only "when an action is available" --
 *   goalType !== "emotion_only" with a non-blank firstAction ("Active
 *   Task LIVE"/"scheduled task" alike; the engine has no reliable
 *   signal distinguishing an already-in-progress task from a merely
 *   upcoming one, so both use the one honest, origin-agnostic
 *   phrasing: "I imagine myself PERFORMING the action," never claiming
 *   it's already underway) -- first person, "ומדמיין את עצמי מבצע את
 *   [הפעולה]" -- whitelisted in arc/instructions.ts's induction-
 *   pattern denylist (14), alongside the pre-existing second-person
 *   "עצמך מבצע" continuation, since the imagined content still always
 *   sources from the trainee's own already-chosen action, never an
 *   interfering state.
 * - "Emotion-only without action" (standalone emotional ARC, or any
 *   session with no real action) ends at the feeling clause alone --
 *   "without inventing an action," never fabricating one. ARC GYM
 *   sessions are always "emotion_only" too (deliberately, by Nine
 *   Functional Improvements task Improvement 4): their own
 *   personalized positive-action visualization is a SEPARATE
 *   experience that happens strictly AFTER the ARC exercise ends
 *   (live/NewArcLiveScreen.tsx's own returnToTask(), routing to
 *   /arc-gym/visualize-only/[id]), never folded into Encoding --
 *   "never interrupting Acceptance/Regulation/Encoding." This function
 *   therefore never reads arcGymVisualizationText at all; "Use its
 *   selected practice action" is already satisfied, just by that
 *   separate, dedicated, already-built screen rather than by this
 *   mantra.
 */
/**
 * ARCHI -- Unified 7-Part Update task, Part 3.1/4.1 ("AUTOMATIC
 * EMOTIONAL MAPPING" / "PERSONALIZED ENCODING... ALL ARC ROUTES"),
 * REVISED by the Combined Emotion & Supportive Feeling Selection task
 * (Part 4, "USE THE FINAL SUPPORTIVE FEELING") -- the feeling clause's
 * own priority order is now --
 * 1. An EXPLICIT override the trainee chose with one tap, overriding
 *    the automatic suggestion -- "never overwrite an explicit user
 *    choice with the automatic suggestion."
 * 2. The AUTOMATIC mapping from the trainee's own just-identified
 *    CURRENT emotion (arc/supportiveFeelingMapping.ts), whenever one
 *    was actually selected and never overridden -- "automatically
 *    derive... a short, first-person mantra," never asked manually.
 * (Both of the above are resolved together by
 * arc/newArcLiveSteps.ts's own resolveFinalSupportiveFeeling -- the
 * SAME function the combined screens' own UI uses to decide which
 * chip to show as "current," so the UI and Encoding can never drift
 * apart on which feeling actually won.)
 * 3. A historical session's own already-saved desiredFeelingText (from
 *    BEFORE this task, when "desired_feeling_select" still asked
 *    manually) -- never lost, simply no longer the primary source for
 *    any NEW session (that screen is now permanently unreachable).
 * 4. The honest, generic fallback -- "do not force the trainee to
 *    claim that a supportive emotional state has already been
 *    achieved," and "handle unknown or custom emotion values safely"
 *    (a free-typed custom emotion has no deterministic mapping, never
 *    guessed at).
 * Returns both the plain feeling phrase (for the "נותן מקום ל..."
 * clause) and, when priority 1/2 applied, its own short mantra
 * sentence -- so resolveEncodingMantra below can fold the mantra in
 * too, exactly like requirement 4.1's own worked example ("אני מרגיש
 * איך היציבות מתפשטת... אני יציב... ומדמיין...").
 */
function resolveDesiredFeelingPhrase(state: NewArcLiveSessionState): { phrase: string; mantra: string | null } {
  const mapped = resolveFinalSupportiveFeeling(state);
  if (mapped) return { phrase: `תחושת ${mapped.feeling}`, mantra: mapped.mantra };
  const legacyFeeling = state.desiredFeelingText?.trim();
  if (legacyFeeling) return { phrase: `תחושת ${legacyFeeling}`, mantra: null };
  return { phrase: "התחושה התומכת", mantra: null };
}

/**
 * Part 6.6 ("SHORTENED ARC ENCODING"): "סבבה" never identifies an
 * unpleasant emotion at all (Part 6.2), so the feeling clause above is
 * never the right source for it -- "do not fabricate an emotion-based
 * opposite. Instead, generate a suitable supportive mantra based on
 * the selected body regions and their opening/stabilization
 * qualities." Mirrors the spec's own worked example verbatim when at
 * least one region was actually selected (openingBodyScanRegions,
 * auto-carried by the shortened interactive-body screen itself -- see
 * arc/newArcLiveSteps.ts's own "supportive_area_select" reachability
 * doc); falls back to a plain presence phrase when the trainee
 * continued without selecting any region at all, never inventing a
 * body state that was never indicated.
 */
function resolveShortenedBodyBasedMantra(state: NewArcLiveSessionState): string {
  return state.openingBodyScanRegions.length > 0 ? "אני מאפשר לגוף שלי להיפתח ולהתייצב. אני יציב" : "אני נוכח, ומאפשר לעצמי להתייצב";
}

/**
 * ARCHI -- Universal ARC Routing, Emotion Identification & Android
 * Shortcuts task, requirement 9 ("ENCODING AND ACTION IMAGERY"), as
 * superseded by the Unified Final Specification task's own section 5
 * ("PERSONALIZED ACTION VISUALIZATION DURING ENCODING" -- see
 * resolveActionText's own doc below for the exact priority chain):
 * every origin that HAS a real action (active task, an explicitly
 * selected scheduled/temporary/due task, or the plain pre-existing
 * firstAction fallback) resolves through the SAME "...ומדמיין את עצמי
 * מבצע את [הפעולה]" template, built purely from session fields -- never
 * user-authored free text rewritten. Standalone Emotional ARC
 * (emotion_only, no action) still ends at the feeling clause alone,
 * "without inventing a task/action."
 */
export function resolveEncodingMantra(state: NewArcLiveSessionState): string {
  // Part 6.6, REVISED by the Refine the Shortened ARC / "סבבה" Pathway
  // task: "סבבה" no longer asks about current emotion AT ALL (not even
  // the old optional collapsible control) -- it offers ONLY a
  // supportive-feeling pick (predefined list or free text), recorded
  // as an explicit selectedSupportiveFeeling override exactly like
  // Full/Mini ARC's own override mechanism. resolveFinalSupportiveFeeling
  // already checks that override FIRST, before any emotion-based
  // mapping, so checking it directly here (rather than selectedEmotion,
  // which Shortened ARC can no longer ever set) is what correctly
  // picks up a chosen supportive feeling regardless of there being no
  // emotion data at all. Only a session that never picked a supportive
  // feeling either falls through to the body-based mantra below --
  // never fabricating a feeling the trainee never chose.
  // ARCHI -- Consolidated Implementation Request, Part 8.1 ("Replace
  // the Current Wording"): the old "אני נותן מקום לתחושה של X" clause
  // is replaced by "X מתפשטת אצלי בכל הגוף" ("the feeling of X is
  // spreading throughout my whole body") -- `phrase` already means
  // "the feeling of X" via Hebrew smichut (e.g. "תחושת רוגע"), so it
  // slots directly into the new template with no restructuring.
  // Applies identically across Full ARC, Mini ARC, and Shortened ARC
  // (whenever it has a real selectedEmotion) -- every pathway that
  // goes through this one shared function. The "אני נוכח" (I am
  // present) opening and the mantra/action clauses that follow are
  // unchanged; only the targeted "נותן מקום ל..." clause itself is
  // replaced.
  // ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
  // task: "פחות טוב" short depth's own fixed sentence, in place of the
  // usual feeling-spreading clause -- checked BEFORE the "shortened"
  // branch below since the two are mutually exclusive tracks. The
  // usual action-visualization clause (resolved further down) still
  // appends after it, exactly like every other branch here.
  const presenceAndFeeling =
    state.arcInvocationMode !== "shortened" && state.arcPracticeDepth === "short"
      ? "אני מקבל את הכיווץ עובר לתמיכה"
      : state.arcInvocationMode === "shortened" && !resolveFinalSupportiveFeeling(state)
      ? resolveShortenedBodyBasedMantra(state)
      : (() => {
          const { phrase, mantra } = resolveDesiredFeelingPhrase(state);
          return mantra ? `אני נוכח. ${phrase} מתפשטת אצלי בכל הגוף. ${mantra}` : `אני נוכח. ${phrase} מתפשטת אצלי בכל הגוף`;
        })();
  if (state.goalType === "emotion_only") return `${presenceAndFeeling}.`;
  const action = resolveActionText(state);
  if (action) return `${presenceAndFeeling}, ומדמיין את עצמי מבצע את ${action}.`;
  return `${presenceAndFeeling}.`;
}

/**
 * ARCHI -- Adaptive Task Execution & Emotional Persistence task,
 * section 1: the action-selection fields (selectedActionSource and
 * friends) that used to be checked first here are removed along with
 * the whole action-selection step -- the app already knows the task's
 * own action from context (isActiveTaskLiveOrigin), never from an
 * explicit in-ARC pick any more. isActiveTaskLiveOrigin's own
 * `firstAction` is read before `taskTitle`, matching the SAME "prefer
 * the first action, fall back to the task title" precedent
 * createNewArcLiveSessionState itself already applies when deriving a
 * fresh session's own firstAction. Falls back to the session's own
 * `firstAction` field otherwise, exactly as every pre-existing session
 * (with no Action Selection step at all) already resolved.
 */
export function resolveActionText(state: NewArcLiveSessionState): string | null {
  if (state.isActiveTaskLiveOrigin) {
    return state.firstAction?.trim() || state.taskTitle?.trim() || null;
  }
  return state.firstAction?.trim() || null;
}

function getEncodingContent(state: NewArcLiveSessionState): NewArcLiveStepContent {
  return { title: "קידוד ופעולה", primary: resolveEncodingMantra(state), supporting: [] };
}
