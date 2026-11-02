/**
 * arc/manifestMeditation.ts
 *
 * Hebrew BUILD/LIVE rework spec, page 3 ("מדיטציית מניפסט"): a separate,
 * text-only guided practice built from the trainee's own selected/
 * written values, identities to cultivate, goals/habits, personal
 * sentences, a day-in-the-life-per-values imagery description, and a
 * small action for today. Order: settling + natural breathing ->
 * presence -> values and identities -> day-imagery -> personal
 * sentences -> today's action -> gratitude.
 *
 * Deliberately NOT built on arc/arcEngine.ts's ArcStage/ArcLiveState
 * (a mostly-linear, self-contained sequence of its own, no branching),
 * and deliberately NOT reusing arc/lifeManifestVisualization.ts (a
 * different exercise -- goal-visualization-specific stage order and
 * content, no duration/chunking, singular-not-list value/identity
 * fields -- confirmed by research not to fit this spec). Mirrors that
 * module's own ARCHITECTURAL pattern instead: a pure stage union, a
 * pure next-stage function, and a pure stage-copy function, consumed by
 * a small screen component.
 *
 * No text-to-speech/audio-narration capability exists anywhere in this
 * codebase (confirmed) -- this practice is presented as text only, read
 * by the trainee at their own pace; the selected duration only sizes
 * each stage's own dwell period (reusing arc/dwellTimes.ts's existing
 * clamp bounds), never an audio runtime.
 */


/** A plural list, written or selected by the trainee -- every existing value/identity field elsewhere in this codebase (ArcBuildProfile.value, MajorGoal.value/futureIdentity, IdentityProfile.value) is a single string; this practice is the first to need more than one at once. */
export interface ManifestMeditationProfile {
  values: string[];
  identities: string[];
  goalsAndHabits: string[];
  personalSentences: string[];
  /** Free text describing a day where the trainee acts according to their values -- optional. */
  dayImageryDescription: string | null;
  /** A small action for today -- optional. */
  todaysAction: string | null;
}

export function createEmptyManifestMeditationProfile(): ManifestMeditationProfile {
  return { values: [], identities: [], goalsAndHabits: [], personalSentences: [], dayImageryDescription: null, todaysAction: null };
}

export type ManifestMeditationStage =
  | "settling"
  | "presence"
  | "values_and_identities"
  | "day_imagery"
  | "personal_sentences"
  | "todays_action"
  | "gratitude"
  | "complete";

/** The one fixed order every session follows -- no branching, mirrors arc/lifeManifestVisualization.ts's own mostly-linear shape. */
const MANIFEST_MEDITATION_STAGE_ORDER: ManifestMeditationStage[] = [
  "settling",
  "presence",
  "values_and_identities",
  "day_imagery",
  "personal_sentences",
  "todays_action",
  "gratitude",
  "complete",
];

/** Every stage except the terminal "complete" -- used to divide the trainee's chosen total duration evenly. */
const CONTENT_STAGE_COUNT = MANIFEST_MEDITATION_STAGE_ORDER.length - 1;

export function getFirstManifestMeditationStage(): ManifestMeditationStage {
  return MANIFEST_MEDITATION_STAGE_ORDER[0];
}

/** Linear, one-directional -- "complete" holds itself (there is nothing after it). */
export function getNextManifestMeditationStage(stage: ManifestMeditationStage): ManifestMeditationStage {
  const index = MANIFEST_MEDITATION_STAGE_ORDER.indexOf(stage);
  return MANIFEST_MEDITATION_STAGE_ORDER[Math.min(index + 1, MANIFEST_MEDITATION_STAGE_ORDER.length - 1)];
}

export const MANIFEST_MEDITATION_DURATION_OPTIONS_MINUTES = [5, 10, 15, 20];
export const DEFAULT_MANIFEST_MEDITATION_DURATION_MINUTES = 10;

/**
 * This practice's own dwell bounds -- deliberately NOT
 * arc/dwellTimes.ts's MIN/MAX_DWELL_SECONDS (1-120s), which are sized
 * for ARC's brief post-instruction pauses, not a long-form guided-text
 * meditation: a 120s cap would make the longest offered duration (20
 * minutes / 7 stages = ~171s/stage) impossible to actually reach,
 * silently shortening the session the trainee chose. 10s is still a
 * sensible floor against a zero/negative/degenerate input.
 */
export const MIN_MANIFEST_MEDITATION_DWELL_SECONDS = 10;
export const MAX_MANIFEST_MEDITATION_DWELL_SECONDS = 600;

function clampManifestMeditationDwellSeconds(value: number): number {
  return Math.min(MAX_MANIFEST_MEDITATION_DWELL_SECONDS, Math.max(MIN_MANIFEST_MEDITATION_DWELL_SECONDS, Math.round(value)));
}

/**
 * The trainee's chosen total session length divides evenly across every
 * content stage -- "20 minutes" paces slower than "5 minutes" through
 * the exact same fixed sequence, never a different sequence.
 */
export function resolveManifestMeditationDwellSeconds(totalDurationMinutes: number): number {
  const perStageSeconds = (totalDurationMinutes * 60) / CONTENT_STAGE_COUNT;
  return clampManifestMeditationDwellSeconds(perStageSeconds);
}

export interface ManifestMeditationStageCopy {
  title: string;
  body: string;
  /** null only for the terminal "complete" stage -- every content stage carries the trainee's own chosen per-stage dwell. */
  dwellSeconds: number | null;
}

/**
 * Pure stage-copy resolver -- every list/optional field is additive: an
 * empty list or unset field falls back to a generic, safe invitation
 * line rather than an empty or broken screen, so a trainee who hasn't
 * filled in a given section yet can still complete the practice.
 */
export function getManifestMeditationStageCopy(
  stage: ManifestMeditationStage,
  profile: ManifestMeditationProfile,
  dwellSecondsPerStage: number
): ManifestMeditationStageCopy {
  switch (stage) {
    case "settling":
      return {
        title: "התמקמות",
        body: "אפשר להתמקם בנוחות ולשים לב לנשימה הטבעית שלך, בלי לשנות אותה.",
        dwellSeconds: dwellSecondsPerStage,
      };

    case "presence":
      return {
        title: "נוכחות",
        body: "שים לב לסביבה שלך כרגע -- למה שאתה רואה, שומע ומרגיש.",
        dwellSeconds: dwellSecondsPerStage,
      };

    case "values_and_identities": {
      const valuesLine = profile.values.length > 0 ? `הערכים המרכזיים שלך: ${profile.values.join(", ")}.` : null;
      const identitiesLine = profile.identities.length > 0 ? `הזהויות שאתה מטפח: ${profile.identities.join(", ")}.` : null;
      const goalsLine = profile.goalsAndHabits.length > 0 ? `המטרות וההרגלים שלך: ${profile.goalsAndHabits.join(", ")}.` : null;
      const lines = [valuesLine, identitiesLine, goalsLine].filter((line): line is string => line !== null);
      return {
        title: "ערכים וזהויות",
        body: lines.length > 0 ? lines.join(" ") : "אפשר לחשוב לרגע על הערכים והזהויות החשובים לך.",
        dwellSeconds: dwellSecondsPerStage,
      };
    }

    case "day_imagery": {
      // Safety denylist: "דמיין יום" is a sanctioned imagine-usage
      // (arc/instructions.ts) -- a desired, values-aligned future day,
      // never an interfering state.
      const body = profile.dayImageryDescription
        ? `דמיין יום שבו אתה פועל בהתאם לערכים שלך: ${profile.dayImageryDescription}.`
        : "דמיין יום שבו אתה פועל בהתאם לערכים שלך.";
      return { title: "דמיון יישום", body, dwellSeconds: dwellSecondsPerStage };
    }

    case "personal_sentences":
      return {
        title: "משפטים אישיים",
        body: profile.personalSentences.length > 0 ? profile.personalSentences.join(" ") : "אפשר לחזור על משפט אישי שמחזק אותך.",
        dwellSeconds: dwellSecondsPerStage,
      };

    case "todays_action":
      return {
        title: "פעולה להיום",
        body: profile.todaysAction ? `הפעולה הקטנה שלך להיום: ${profile.todaysAction}.` : "אפשר לבחור פעולה קטנה אחת להיום.",
        dwellSeconds: dwellSecondsPerStage,
      };

    case "gratitude":
      return { title: "הכרת תודה", body: "אפשר להכיר תודה על רגע אחד מהיום הזה.", dwellSeconds: dwellSecondsPerStage };

    case "complete":
      return { title: "סיום", body: "התרגול הסתיים.", dwellSeconds: null };
  }
}
