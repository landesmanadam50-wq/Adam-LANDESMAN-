/**
 * arc/arcAddictionArc.ts
 *
 * The two ARC exercises of the ARC Addiction route, as pure step
 * sequences rendered by live/ArcAddictionSessionScreen.tsx with the
 * app's EXISTING ARC building blocks (no new ARC visuals are invented):
 *
 *   - live/components/ArcBodyMantraCircle.tsx for the presence /
 *     acceptance / dwelling / regulation / encoding stages (the same
 *     stage ids Full ARC uses: "natural_breathing", "urge_acceptance",
 *     "thought_acceptance", "dwelling", "acceptance", "regulation",
 *     "encoding"),
 *   - live/components/BodySilhouetteMap.tsx for marking where the
 *     sensation is felt (red) and the supportive anchor (blue),
 *   - the shared supportive-sensation bank
 *     (arc/supportiveBodySensation.ts) for "what helped before",
 *   - Positive Memory for an earlier success moment (efficacy).
 *
 * ARC למסוגלות – builds the capacity to BEAR the bodily sensation tied
 * to the urge (e.g. the itch in the ears), never to fight or erase it.
 *
 * ARC לקבלה עצמית – a full ARC after acting on the urge: working
 * experientially with the bodily sensations and the self-criticism,
 * guilt, shame or frustration that arose, so the user can accept
 * themselves even though they acted. It is never conditional on
 * success and can always be skipped.
 *
 * The engine lives in its own small state object (AddictionArcState),
 * independent of arc/newArcLiveSteps.ts's single-slot session, so a
 * Task LIVE ARC session is never overwritten.
 */

import type { ArcBodyMantraStage } from "./arcBodyMantraCircleLogic.ts";
import type { AddictionArcKind, AddictionBodyArea, AddictionProfile } from "./arcAddiction.ts";
import { areaKey, isValidAddictionRating, toggleAddictionBodyArea } from "./arcAddiction.ts";
import { BODY_SCAN_REGION_LABELS } from "./bodyScanRegions.ts";
import type { BodyScanRegion } from "./bodyScanRegions.ts";
import type { BodyScanSide } from "./bodyScanSelection.ts";

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

export type AddictionArcStepId =
  // shared
  | "presence"
  | "body_mark"
  | "dwelling"
  | "acceptance"
  | "supportive_select"
  | "regulation"
  | "encoding"
  // efficacy only
  | "urge_acceptance"
  | "success_memory"
  | "efficacy_rating"
  // acceptance only
  | "acceptance_rating_before"
  | "name_reaction"
  | "thought_acceptance"
  | "understanding"
  | "gentle_intention"
  | "acceptance_rating_after";

export const EFFICACY_ARC_STEPS: readonly AddictionArcStepId[] = [
  "presence",
  "body_mark",
  "urge_acceptance",
  "dwelling",
  "acceptance",
  "supportive_select",
  "regulation",
  "success_memory",
  "encoding",
  "efficacy_rating",
];

export const ACCEPTANCE_ARC_STEPS: readonly AddictionArcStepId[] = [
  "acceptance_rating_before",
  "name_reaction",
  "presence",
  "body_mark",
  "thought_acceptance",
  "dwelling",
  "acceptance",
  "understanding",
  "supportive_select",
  "regulation",
  "encoding",
  "gentle_intention",
  "acceptance_rating_after",
];

export function getArcSteps(kind: AddictionArcKind): readonly AddictionArcStepId[] {
  return kind === "efficacy" ? EFFICACY_ARC_STEPS : ACCEPTANCE_ARC_STEPS;
}

/** Which ArcBodyMantraCircle stage renders a step (null => a form/body-map step). */
export const ARC_STEP_CIRCLE_STAGE: Partial<Record<AddictionArcStepId, ArcBodyMantraStage>> = {
  presence: "natural_breathing",
  urge_acceptance: "urge_acceptance",
  thought_acceptance: "thought_acceptance",
  dwelling: "dwelling",
  acceptance: "acceptance",
  regulation: "regulation",
  encoding: "encoding",
};

export function resolveCircleStage(step: AddictionArcStepId): ArcBodyMantraStage | null {
  return ARC_STEP_CIRCLE_STAGE[step] ?? null;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export const ACCEPTANCE_REACTION_OPTIONS = ["ביקורת עצמית", "אשמה", "בושה", "תסכול", "אכזבה", "כעס על עצמי"] as const;

export interface AddictionSupportiveChoice {
  region: BodyScanRegion | null;
  side: BodyScanSide;
  label: string;
  movementLabel: string | null;
  /** Id of the SupportiveBodySensationUsage recorded in the shared bank (to attach its rating at the end). */
  usageId: string | null;
}

export interface AddictionArcState {
  kind: AddictionArcKind;
  stepIndex: number;
  startedAt: string;
  /** Red regions: the urge sensation (efficacy) / the guilt-shame sensation (acceptance). */
  markedAreas: AddictionBodyArea[];
  supportive: AddictionSupportiveChoice | null;
  /** Rating of the supportive sensation's effect (0..10), fed back into the shared bank. */
  supportiveEffectRating: number | null;
  positiveMemoryId: string | null;
  // efficacy
  efficacyRating: number | null;
  // acceptance
  acceptanceBefore: number | null;
  acceptanceAfter: number | null;
  reactions: string[];
  criticalThought: string;
  gentleIntention: string;
}

export function createAddictionArcState(kind: AddictionArcKind, profile: AddictionProfile, now: string): AddictionArcState {
  return {
    kind,
    stepIndex: 0,
    startedAt: now,
    // The efficacy ARC starts from the profile's own known urge areas – the user can still change them on the map.
    markedAreas: kind === "efficacy" ? [...profile.urgeBodyAreas] : [],
    supportive: null,
    supportiveEffectRating: null,
    positiveMemoryId: null,
    efficacyRating: null,
    acceptanceBefore: null,
    acceptanceAfter: null,
    reactions: [],
    criticalThought: "",
    gentleIntention: "",
  };
}

export function getCurrentArcStep(state: AddictionArcState): AddictionArcStepId {
  const steps = getArcSteps(state.kind);
  return steps[Math.min(Math.max(state.stepIndex, 0), steps.length - 1)];
}

export function isLastArcStep(state: AddictionArcState): boolean {
  return state.stepIndex >= getArcSteps(state.kind).length - 1;
}

export interface ArcStepContext {
  /** Whether a positive memory exists to show on "success_memory" – otherwise that step is skipped automatically. */
  hasSuccessMemory: boolean;
}

function isStepReachable(step: AddictionArcStepId, context: ArcStepContext): boolean {
  if (step === "success_memory") return context.hasSuccessMemory;
  return true;
}

/** Index of the next reachable step, or null when the ARC is complete. */
export function advanceArcState(state: AddictionArcState, context: ArcStepContext): AddictionArcState | null {
  const steps = getArcSteps(state.kind);
  for (let index = state.stepIndex + 1; index < steps.length; index += 1) {
    if (isStepReachable(steps[index], context)) return { ...state, stepIndex: index };
  }
  return null;
}

export function backArcState(state: AddictionArcState, context: ArcStepContext): AddictionArcState {
  const steps = getArcSteps(state.kind);
  for (let index = state.stepIndex - 1; index >= 0; index -= 1) {
    if (isStepReachable(steps[index], context)) return { ...state, stepIndex: index };
  }
  return state;
}

export function toggleArcMarkedArea(state: AddictionArcState, region: BodyScanRegion, side: BodyScanSide): AddictionArcState {
  return { ...state, markedAreas: toggleAddictionBodyArea(state.markedAreas, region, side) };
}

export function setArcSupportive(state: AddictionArcState, supportive: AddictionSupportiveChoice | null): AddictionArcState {
  return { ...state, supportive };
}

export function toggleArcReaction(state: AddictionArcState, reaction: string): AddictionArcState {
  const reactions = state.reactions.includes(reaction) ? state.reactions.filter((r) => r !== reaction) : [...state.reactions, reaction];
  return { ...state, reactions };
}

function ratingOrNull(value: number | null): number | null {
  return value === null || isValidAddictionRating(value) ? value : null;
}

export function setArcRating(
  state: AddictionArcState,
  field: "efficacyRating" | "acceptanceBefore" | "acceptanceAfter" | "supportiveEffectRating",
  value: number | null
): AddictionArcState {
  return { ...state, [field]: ratingOrNull(value) };
}

export function setArcText(state: AddictionArcState, field: "criticalThought" | "gentleIntention", value: string): AddictionArcState {
  return { ...state, [field]: value.slice(0, 500) };
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export interface AddictionArcStepCopy {
  title: string;
  /** The mantra inside the circle (circle steps) or the main line. */
  primary: string;
  supporting: string[];
  continueLabel: string;
}

function describeAreas(areas: readonly AddictionBodyArea[]): string {
  if (areas.length === 0) return "בגוף";
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const area of areas) {
    const label = BODY_SCAN_REGION_LABELS[area.region];
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  if (labels.length === 1) return `ב${labels[0]}`;
  return `ב${labels.slice(0, -1).join(", ")} וב${labels[labels.length - 1]}`;
}

function describeSupportive(state: AddictionArcState): string {
  if (!state.supportive) return "תחושה תומכת";
  const where = state.supportive.region ? ` ב${BODY_SCAN_REGION_LABELS[state.supportive.region]}` : "";
  return `${state.supportive.label}${where}`;
}

export function getArcStepCopy(state: AddictionArcState, profile: AddictionProfile): AddictionArcStepCopy {
  const step = getCurrentArcStep(state);
  const areas = describeAreas(state.markedAreas);
  const efficacy = state.kind === "efficacy";
  switch (step) {
    case "presence":
      return efficacy
        ? { title: "עצירה ונוכחות", primary: "אני עוצר לרגע ונושם בקצב טבעי.", supporting: ["אין צורך לעשות שום דבר עם הדחף כרגע."], continueLabel: "המשך" }
        : {
            title: "עצירה ונוכחות",
            primary: "מה שקרה כבר קרה. עכשיו אני עוצר ונושם.",
            supporting: ["אין צורך לתקן או להעניש. רק לשים לב."],
            continueLabel: "המשך",
          };
    case "body_mark":
      return efficacy
        ? {
            title: "איפה מורגש הדחף?",
            primary: "סמן את האזורים שבהם מורגשת התחושה.",
            supporting: [
              ...(profile.urgeSensation.trim() ? [`התחושה: ${profile.urgeSensation.trim()}`] : []),
              "האזורים מהפרופיל מסומנים מראש – אפשר לשנות.",
            ],
            continueLabel: "המשך",
          }
        : {
            title: "איפה זה מורגש בגוף?",
            primary: "סמן איפה מורגשים הביקורת, האשמה, הבושה או התסכול.",
            supporting: ["אפשר לסמן כמה אזורים, או להמשיך בלי לסמן."],
            continueLabel: "המשך",
          };
    case "urge_acceptance":
      return {
        title: "עצירה מול הדחף",
        primary: "אני יכול להרגיש את הדחף בלי לפעול לפיו.",
        supporting: ["אני עוצר לרגע.", `אני מפנה תשומת לב לתחושה ${areas}.`],
        continueLabel: "המשך",
      };
    case "thought_acceptance": {
      const thought = state.criticalThought.trim();
      return {
        title: "שמים לב למחשבה",
        primary: "זו מחשבה, לא עובדה עליי.",
        supporting: thought ? [`אני שם לב למחשבה: "${thought}".`, "אני לא חייב להתווכח איתה או להאמין לה."] : ["אני שם לב למחשבות הביקורתיות.", "אני לא חייב להתווכח איתן או להאמין להן."],
        continueLabel: "המשך",
      };
    }
    case "dwelling":
      return efficacy
        ? { title: "להישאר עם התחושה", primary: `אני נשאר עם התחושה ${areas}.`, supporting: ["היא יכולה לעלות ולרדת. אני כאן איתה."], continueLabel: "המשך" }
        : { title: "להישאר עם התחושה", primary: `אני מרשה לתחושה ${areas} להיות כאן.`, supporting: ["בלי להילחם בה ובלי לברוח ממנה."], continueLabel: "המשך" };
    case "acceptance":
      return efficacy
        ? { title: "קבלה", primary: "התחושה יכולה להיות כאן, ואני יכול לשאת אותה.", supporting: ["תחושה היא לא פקודה."], continueLabel: "המשך" }
        : {
            title: "קבלה",
            primary: "גם עכשיו, אחרי שפעלתי לפי הדחף, אני ראוי ליחס טוב.",
            supporting: ["קבלה אינה הסכמה עם ההתנהגות – היא הפסקת המלחמה בעצמי."],
            continueLabel: "המשך",
          };
    case "understanding":
      return {
        title: "למה קבלה עוזרת",
        primary: "ביקורת עצמית אחרי פעולה לפי הדחף מגבירה מצוקה – ומצוקה עלולה להזין את הדחף הבא.",
        supporting: ["יחס רך יותר לעצמי מוריד את הלחץ ומשאיר יותר מרחב בחירה בפעם הבאה.", "הרבה אנשים מתמודדים עם דחפים כאלה. אני לא לבד בזה."],
        continueLabel: "המשך",
      };
    case "supportive_select":
      return efficacy
        ? {
            title: "תחושה תומכת",
            primary: "בחר תחושה שעוזרת לך לשאת את הדחף.",
            supporting: ["ההצעות מבוססות על מה שעזר לך בעבר עם ההתנהגות הזו."],
            continueLabel: "המשך",
          }
        : {
            title: "תחושה תומכת",
            primary: "בחר תחושה של רכות, חום או יציבות בגוף.",
            supporting: ["אפשר לבחור מהעבר, או לסמן אזור חדש."],
            continueLabel: "המשך",
          };
    case "regulation":
      return efficacy
        ? { title: "ויסות", primary: `אני מתחבר ל${describeSupportive(state)}.`, supporting: ["התחושה התומכת והדחף יכולים להיות כאן יחד."], continueLabel: "המשך" }
        : { title: "ויסות", primary: `אני מתחבר ל${describeSupportive(state)}.`, supporting: ["אני נותן לעצמי את היחס שהייתי נותן לחבר קרוב."], continueLabel: "המשך" };
    case "success_memory":
      return { title: "רגע של מסוגלות", primary: "כבר היו רגעים שבהם בחרת שלא לפעול לפי הדחף.", supporting: [], continueLabel: "המשך" };
    case "encoding":
      return efficacy
        ? { title: "קידוד", primary: "אני מסוגל לשאת את התחושה הזו.", supporting: ["הבחירה נשארת שלי."], continueLabel: "המשך" }
        : { title: "קידוד", primary: "אני מקבל את עצמי גם עכשיו.", supporting: ["הערך שלי לא נקבע לפי מה שקרה בדקות האחרונות."], continueLabel: "המשך" };
    case "efficacy_rating":
      return {
        title: "תחושת מסוגלות",
        primary: "כמה אתה מרגיש מסוגל לשאת את התחושה עכשיו?",
        supporting: ["0 = בכלל לא · 10 = מסוגל לגמרי. אפשר לדלג."],
        continueLabel: "סיום התרגיל",
      };
    case "acceptance_rating_before":
      return { title: "קבלה עצמית", primary: "כמה אתה מקבל את עצמך כרגע?", supporting: ["0 = בכלל לא · 10 = לגמרי. אפשר לדלג."], continueLabel: "המשך" };
    case "name_reaction":
      return {
        title: "מה עולה עכשיו?",
        primary: "אילו תגובות עולות אחרי מה שקרה?",
        supporting: ["אפשר לבחור כמה, ולכתוב מה הקול הביקורתי אומר (לא חובה)."],
        continueLabel: "המשך",
      };
    case "gentle_intention":
      return {
        title: "כוונה עדינה",
        primary: "האם יש משהו קטן ועדין שתרצה לזכור לפעם הבאה?",
        supporting: ["לא התחייבות ולא דרישה – רק אם מתאים לך."],
        continueLabel: "המשך",
      };
    case "acceptance_rating_after":
      return { title: "קבלה עצמית", primary: "וכמה אתה מקבל את עצמך עכשיו?", supporting: ["אפשר לדלג."], continueLabel: "סיום התרגיל" };
  }
}

/** Body-map regions the circle animates: red = marked, blue = the supportive anchor. */
export function resolveArcCircleRegions(state: AddictionArcState): {
  contractionRegions: AddictionBodyArea[];
  openingRegions: (AddictionBodyArea & { role: "opening_and_supportive" })[];
} {
  const supportive = state.supportive && state.supportive.region ? [{ region: state.supportive.region, side: state.supportive.side, role: "opening_and_supportive" as const }] : [];
  const supportiveKeys = new Set(supportive.map(areaKey));
  return {
    contractionRegions: state.markedAreas.filter((area) => !supportiveKeys.has(areaKey(area))),
    openingRegions: supportive,
  };
}
