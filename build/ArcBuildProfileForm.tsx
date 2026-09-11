import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { buildEvidenceIndex, selectEncodingEvidence } from "../arc/evidence.ts";
import type { EvidenceRecord } from "../arc/evidence.ts";
import { shouldShowProfileStep, type ProfileDraft, type ProfileStep } from "./profileWizard.ts";
import type { Target } from "./arcBuildSave.ts";
import { NEGATIVE_ACTION_MAX_DURATION_MINUTES, NEGATIVE_ACTION_MIN_DURATION_MINUTES } from "../program/engine.ts";
import { ARC_LINK_TRIGGER_TYPE_LABELS } from "../arc/bodyImagery.ts";
import type { ArcLinkTriggerType } from "../arc/bodyImagery.ts";
import type { DevelopmentLayer, DwellTimes } from "../arc/types.ts";
import { EXECUTION_QUALITY_PRESETS } from "../arc/successfulPerformance.ts";
import CollapsibleSection from "./CollapsibleSection.tsx";

export { buildEvidenceIndex };
export type { EvidenceRecord };

/**
 * build/ArcBuildProfileForm.tsx
 *
 * Single-page BUILD task (spec section 3): the one, single-target
 * ArcBuildProfile field set, previously walked one field at a time by
 * build/ArcBuildEditorScreen.tsx's own step wizard (STATE_STEPS/
 * IDENTITY_STEPS/HABIT_STEPS + a step index + "המשך"/"חזור" buttons).
 * That wizard's field-order arrays, field-to-title map, field-to-draft-
 * key map, and every per-field-type render branch (plain text, Yes/No,
 * ask-a-or-b, chip pickers, dwell-time rows, the review summary) are ALL
 * reused completely unchanged below -- this file only replaces the
 * CONTROL FLOW: instead of showing exactly one step and gating
 * progression on a "המשך" press, it renders every step for the chosen
 * target at once, grouped into named CollapsibleSection blocks (never
 * unmounted, so nothing typed is ever lost when a section collapses),
 * skipping only fields shouldShowProfileStep (profileWizard.ts, itself
 * unchanged) says don't apply yet (e.g. stateEncodingRegulationCue while
 * its own "ask" is still unanswered). A field with no real per-field
 * required/optional gate at the SAVE level (isTargetDraftComplete,
 * build/arcBuildSave.ts, also unchanged) is simply always editable here
 * -- the old wizard's separate "isOptional" continue-button gate no
 * longer exists, because there is no longer a continue button to gate.
 *
 * Reused, byte-for-byte, by both build/ArcBuildEditorScreen.tsx (route
 * /build/[id], one ArcBuild) and build/SelfDevelopmentBuildScreen.tsx
 * (the new unified single-page BUILD, spec section 3, offering Full
 * ARC/Mini ARC/both from one page) -- one field-rendering
 * implementation, never a second, divergent copy.
 */

export const STATE_STEPS: ProfileStep[] = [
  "presenceColor",
  "value",
  "stayMantra",
  "acceptanceMantra",
  "supportiveState",
  "challengeContext",
  "interferingState",
  "stateBarrierType",
  "statePracticalAlternative",
  "internalAction",
  "internalActionBodyCue",
  "statePreventiveAction",
  "stateSupportingAction",
  "stateLimitingBelief",
  "stateBalancedAlternativeInterpretation",
  "stateBridgeBelief",
  "regulationTool",
  "regulationBodyParts",
  "regulationMovementText",
  "regulationMantra",
  "bridgeMantra",
  "stateEncodingRegulationCueAsk",
  "stateEncodingRegulationCue",
  "stateFutureOrientedMantra",
  "stateMantra",
  "stateBodyLanguageCue",
  "stateEncodingBodyParts",
  "stateEncodingMovementText",
  "stateDesiredImageryType",
  "stateDesiredImageryDescription",
  "dwellTimes",
  "linkTriggerType",
  "linkTriggerText",
];

export const IDENTITY_STEPS: ProfileStep[] = [
  "presenceColor",
  "value",
  "stayMantra",
  "acceptanceMantra",
  "desiredIdentity",
  "identityDesiredState",
  "identityChallengeContext",
  "identityInterferingEmotion",
  "identityBarrierType",
  "identityPracticalAlternative",
  "identityAction",
  "identityActionBodyCue",
  "identityPreventiveAction",
  "identitySupportingAction",
  "identityLimitingBelief",
  "identityBalancedAlternativeInterpretation",
  "identityBridgeBelief",
  "regulationTool",
  "regulationBodyParts",
  "regulationMovementText",
  "regulationMantra",
  "bridgeMantra",
  "identityEncodingRegulationCueAsk",
  "identityEncodingRegulationCue",
  "identityFutureOrientedMantra",
  "identityMantra",
  "identityBodyLanguageCue",
  "identityEncodingBodyParts",
  "identityEncodingMovementText",
  "identityDesiredImageryType",
  "identityDesiredImageryDescription",
  "successfulPerformanceAsk",
  "successfulPerformanceAction",
  "successfulPerformanceQualities",
  "successfulPerformanceCustomQuality",
  "successfulPerformanceResult",
  "successMantra",
  "successfulPerformanceResultDuration",
  "dwellTimes",
  "linkTriggerType",
  "linkTriggerText",
];

export const HABIT_STEPS: ProfileStep[] = [
  "presenceColor",
  "value",
  "stayMantra",
  "acceptanceMantra",
  "beneficialAction",
  "beneficialActionBodyCue",
  "preventiveActionAsk",
  "preventiveActionDescription",
  "regulationTool",
  "regulationBodyParts",
  "regulationMovementText",
  "regulationMantra",
  "bridgeMantra",
  "negativeActionEnabledAsk",
  "habit",
  "negativeActionDuration",
  "linkTriggerType",
  "linkTriggerText",
];

export function stepOrderFor(target: Target): ProfileStep[] {
  if (target === "state") return STATE_STEPS;
  if (target === "identity") return IDENTITY_STEPS;
  return HABIT_STEPS;
}

const STEP_TITLES: Partial<Record<ProfileStep, string>> = {
  presenceColor: "באיזה צבע היית רוצה לדמיין את האנרגיה שמתפשטת בגופך ומחזירה אותך לנוכחות?",
  value: "מהו הערך שעומד מאחורי הזהות וההרגל הזה? (רשות, למשל בריאות וחופש)",
  supportiveState: "מה המצב הרצוי שתרצה לחוש יותר?",
  challengeContext: "באילו מצבים המצב הרצוי הזה במיוחד רלוונטי? (הקשר האתגר)",
  interferingState: "מה נוטה להפריע למצב הרצוי הזה? (לזיהוי בלבד)",
  internalAction: "מה הפעולה הפנימית שלך? (למשל סריקת גוף)",
  internalActionBodyCue: "איזה עוגן גופני תרצה לשמור בזמן ביצוע הפעולה? (רשות)",
  statePreventiveAction: "יש פעולה מונעת שיכולה לעזור לפני שזה קורה? (רשות)",
  stateEncodingRegulationCueAsk: "באיזה כלי ויסות קצר תרצה להמשיך בזמן הקידוד?",
  stateEncodingRegulationCue: "מהו כלי הוויסות הקצר לקידוד?",
  stateMantra: "יש לך מנטרה למצב הזה? (רשות)",
  stateBodyLanguageCue: "איך תרצה שתהיה שפת הגוף שלך במצב הזה? (רשות, למשל כתפיים משוחררות)",
  stateBarrierType: "המכשול שמפריע הוא בעיקר פנימי או מעשי? (רשות)",
  statePracticalAlternative: "מהו פתרון מעשי, גרסה מצומצמת או פעולה חלופית שיכולים לעזור? (רשות)",
  stateSupportingAction: "יש פעולה תומכת קצרה שיוצרת תנאים טובים יותר לפעולה המרכזית? (רשות, למשל מדיטציה קצרה)",
  stateLimitingBelief: "יש מחשבה שמפריעה לך להתחיל? (רשות)",
  stateBalancedAlternativeInterpretation:
    "מהי דרך נוספת, מאוזנת ומועילה יותר, לפרש את המצב? הפרשנות החלופית אינה צריכה למחוק את המחשבה הקיימת או להיות חיובית בכוח. נסח דרך נוספת להבין את המצב, שתהיה אמינה, מאוזנת ומקדמת. (רשות, לדוגמה \"הקושי שאני מרגיש עכשיו לא אומר שאינני מסוגל; אני יכול להתקדם בהדרגה.\")",
  stateBridgeBelief: "מהי פרשנות מאמינה ומתקדמת יותר למחשבה הזו? (רשות)",
  stateFutureOrientedMantra: "לאיזה כיוון אתה מתקדם עכשיו? (רשות, מנטרה מכוונת עתיד)",

  desiredIdentity: "מה הזהות הרצויה?",
  identityDesiredState: "איך תרצה להרגיש ולפעול כשאתה מבטא את הזהות הזו? (רשות)",
  identityChallengeContext: "באילו מצבים הזהות הרצויה הזו במיוחד רלוונטית? (הקשר האתגר)",
  identityInterferingEmotion: "מה נוטה להפריע לזהות הזו? (לזיהוי בלבד)",
  identityAction: "מה הפעולה שמבטאת את הזהות הזו? (רשות)",
  identityActionBodyCue: "איזה עוגן גופני תרצה לשמור בזמן ביצוע הפעולה? (רשות)",
  identityPreventiveAction: "יש פעולה מונעת שיכולה לעזור לפני שזה קורה? (רשות)",
  identityEncodingRegulationCueAsk: "באיזה כלי ויסות קצר תרצה להמשיך בזמן הקידוד?",
  identityEncodingRegulationCue: "מהו כלי הוויסות הקצר לקידוד?",
  identityMantra: "יש לך מנטרה לזהות הזו? (רשות)",
  identityBodyLanguageCue: "איך תרצה שתהיה שפת הגוף שלך בזהות הזו? (רשות)",
  identityBarrierType: "המכשול שמפריע הוא בעיקר פנימי או מעשי? (רשות)",
  identityPracticalAlternative: "מהו פתרון מעשי, גרסה מצומצמת או פעולה חלופית שיכולים לעזור? (רשות)",
  identitySupportingAction: "יש פעולה תומכת קצרה שיוצרת תנאים טובים יותר לפעולה המרכזית? (רשות, למשל מדיטציה קצרה)",
  identityLimitingBelief: "יש מחשבה שמפריעה לך להתחיל? (רשות)",
  identityBalancedAlternativeInterpretation:
    "מהי דרך נוספת, מאוזנת ומועילה יותר, לפרש את המצב? הפרשנות החלופית אינה צריכה למחוק את המחשבה הקיימת או להיות חיובית בכוח. נסח דרך נוספת להבין את המצב, שתהיה אמינה, מאוזנת ומקדמת. (רשות, לדוגמה \"הקושי שאני מרגיש עכשיו לא אומר שאינני מסוגל; אני יכול להתקדם בהדרגה.\")",
  identityBridgeBelief: "מהי פרשנות מאמינה ומתקדמת יותר למחשבה הזו? (רשות)",
  identityFutureOrientedMantra: "לאיזה כיוון אתה מתקדם עכשיו? (רשות, מנטרה מכוונת עתיד)",

  successfulPerformanceAsk: "האם תרצה להוסיף דמיון ביצוע מוצלח לפעולה הזו? (רשות)",
  successfulPerformanceAction: "איזו פעולה תרצה לדמיין שאתה מבצע? (רשות, ברירת מחדל: הפעולה שהגדרת)",
  successfulPerformanceQualities: "באיזו איכות תרצה לבצע את הפעולה? (רשות, אפשר לבחור כמה)",
  successfulPerformanceCustomQuality: "איכות נוספת משלך? (רשות)",
  successfulPerformanceResult: "מהי התוצאה המוצלחת הרצויה? (רשות)",
  successMantra: "משפט ביטחון להצלחת הפעולה או התוצאה? (רשות)",
  successfulPerformanceResultDuration: "כמה זמן תרצה להישאר בדמיון התוצאה לאחר סיום ההנחיה?",

  beneficialAction: "מה הפעולה המיטיבה שתרצה לבצע? (ההרגל הרצוי)",
  beneficialActionBodyCue: "איזה עוגן גופני תרצה לשמור בזמן ביצוע הפעולה? (רשות)",
  preventiveActionAsk: "יש לך פעולה מונעת מוגדרת מראש?",
  preventiveActionDescription: "תאר את הפעולה המונעת",
  negativeActionEnabledAsk: "האם תרצה להפעיל כלי לצמצום פעולה שלילית? (רשות)",
  habit: "מה הפעולה השלילית שתרצה לצמצם?",
  negativeActionDuration: "כמה זמן, בדקות, לאפשר לפעולה הזו? (1 עד 15 דקות)",

  regulationTool: "מה כלי הוויסות שלך? (למשל נשימה 4-7-8)",
  dwellTimes: "זמן שהייה",

  stayMantra: "משפט קצר שעוזר להישאר בעדינות עם מה שכבר מורגש, בלי להילחם בו ובלי להעצים אותו. (רשות, לדוגמה \"אני יכול להישאר לרגע עם מה שכבר נמצא כאן.\")",
  acceptanceMantra: "משפט קצר שמאפשר לתחושה הקיימת להיות כאן כרגע, בלי צורך לשנות אותה מיד. (רשות, לדוגמה \"מותר למה שאני מרגיש להיות כאן כרגע.\")",
  regulationMantra: "משפט קצר שמלווה את הגוף בזמן ההתייצבות, בלי לדרוש ממנו להירגע או להשתנות. (רשות, לדוגמה \"אני מאפשר לגוף להתייצב בקצב שלו.\")",
  bridgeMantra: "משפט קצר שמגשר לקראת מה שברצונך לחזק בהמשך. (רשות)",

  stateDesiredImageryDescription: "תאר בקצרה את הדימוי (רשות, לדוגמה: הצלחה / חמלה / ביטחון / רוגע / אנרגטיות / משמעת)",
  identityDesiredImageryDescription: "תאר בקצרה את הדימוי (רשות, לדוגמה: הצלחה / חמלה / ביטחון / רוגע / אנרגטיות / משמעת)",

  linkTriggerType: "מתי או אחרי מה תרצה לזכור להתחיל את התרגיל? (רשות)",
  linkTriggerText: "תאר את הטריגר (רשות, למשל \"בשעה 10:00\" או \"אחרי שאני קם מהמיטה\")",
  regulationBodyParts: "באילו חלקי גוף מתרחש כלי הוויסות? (רשות, מופרדים בפסיק)",
  regulationMovementText: "איך הגוף מבצע את כלי הוויסות? (רשות, לדמיון ב-ARC Link)",
  stateEncodingBodyParts: "באילו חלקי גוף מתרחשת שפת הגוף שהגדרת? (רשות, מופרדים בפסיק)",
  stateEncodingMovementText: "איך הגוף מבצע אותה? (רשות, לדמיון ב-ARC Link)",
  identityEncodingBodyParts: "באילו חלקי גוף מתרחשת שפת הגוף שהגדרת? (רשות, מופרדים בפסיק)",
  identityEncodingMovementText: "איך הגוף מבצע אותה? (רשות, לדמיון ב-ARC Link)",
};

const TEXT_STEP_FIELDS: Partial<Record<ProfileStep, keyof ProfileDraft>> = {
  presenceColor: "presenceColor",
  value: "value",
  supportiveState: "supportiveState",
  challengeContext: "challengeContext",
  interferingState: "interferingState",
  statePracticalAlternative: "statePracticalAlternative",
  internalAction: "internalAction",
  internalActionBodyCue: "internalActionBodyCue",
  statePreventiveAction: "statePreventiveAction",
  stateSupportingAction: "stateSupportingAction",
  stateLimitingBelief: "stateLimitingBelief",
  stateBalancedAlternativeInterpretation: "stateBalancedAlternativeInterpretation",
  stateBridgeBelief: "stateBridgeBelief",
  stateFutureOrientedMantra: "stateFutureOrientedMantra",
  stateEncodingRegulationCue: "stateEncodingRegulationCue",
  stateMantra: "stateMantra",
  stateBodyLanguageCue: "stateBodyLanguageCue",

  desiredIdentity: "desiredIdentity",
  identityDesiredState: "identityDesiredState",
  identityChallengeContext: "identityChallengeContext",
  identityInterferingEmotion: "identityInterferingEmotion",
  identityPracticalAlternative: "identityPracticalAlternative",
  identityAction: "identityAction",
  identityActionBodyCue: "identityActionBodyCue",
  identityPreventiveAction: "identityPreventiveAction",
  identitySupportingAction: "identitySupportingAction",
  identityLimitingBelief: "identityLimitingBelief",
  identityBalancedAlternativeInterpretation: "identityBalancedAlternativeInterpretation",
  identityBridgeBelief: "identityBridgeBelief",
  identityFutureOrientedMantra: "identityFutureOrientedMantra",
  identityEncodingRegulationCue: "identityEncodingRegulationCue",
  identityMantra: "identityMantra",
  identityBodyLanguageCue: "identityBodyLanguageCue",

  successfulPerformanceAction: "identitySuccessfulPerformanceAction",
  successfulPerformanceCustomQuality: "identitySuccessfulPerformanceCustomQuality",
  successfulPerformanceResult: "identitySuccessfulPerformanceResult",
  successMantra: "identitySuccessMantra",

  beneficialAction: "beneficialAction",
  beneficialActionBodyCue: "beneficialActionBodyCue",
  preventiveActionDescription: "preventiveActionDescription",
  habit: "habit",

  regulationTool: "regulationTool",
  stayMantra: "stayMantra",
  acceptanceMantra: "acceptanceMantra",
  regulationMantra: "regulationMantra",
  bridgeMantra: "bridgeMantra",
  stateDesiredImageryDescription: "stateDesiredImageryDescription",
  identityDesiredImageryDescription: "identityDesiredImageryDescription",

  linkTriggerText: "linkTriggerText",
  regulationBodyParts: "regulationBodyParts",
  regulationMovementText: "regulationMovementText",
  stateEncodingBodyParts: "stateEncodingBodyParts",
  stateEncodingMovementText: "stateEncodingMovementText",
  identityEncodingBodyParts: "identityEncodingBodyParts",
  identityEncodingMovementText: "identityEncodingMovementText",
};

const ASK_STEP_FIELDS: Partial<Record<ProfileStep, keyof ProfileDraft>> = {
  stateEncodingRegulationCueAsk: "stateWantsShortEncodingRegulationCue",
  identityEncodingRegulationCueAsk: "identityWantsShortEncodingRegulationCue",
};
const YESNO_STEP_FIELDS: Partial<Record<ProfileStep, keyof ProfileDraft>> = {
  preventiveActionAsk: "hasPreventiveAction",
  negativeActionEnabledAsk: "negativeActionReductionEnabled",
  successfulPerformanceAsk: "identityWantsSuccessfulPerformance",
};

const NEGATIVE_ACTION_DURATION_OPTIONS: number[] = Array.from(
  { length: NEGATIVE_ACTION_MAX_DURATION_MINUTES - NEGATIVE_ACTION_MIN_DURATION_MINUTES + 1 },
  (_, index) => NEGATIVE_ACTION_MIN_DURATION_MINUTES + index
);

const DWELL_ROWS: { key: keyof DwellTimes; label: string }[] = [
  { key: "sensationDwellSeconds", label: "תחושה / מודעות" },
  { key: "acceptanceDwellSeconds", label: "קבלה" },
  { key: "regulationDwellSeconds", label: "ויסות" },
  { key: "encodingDwellSeconds", label: "קידוד / שפת גוף" },
  { key: "actionImageryDwellSeconds", label: "דמיון פעולה" },
  { key: "presenceDwellSeconds", label: "נוכחות" },
  { key: "stopImageryDwellSeconds", label: "דמיון עצירה" },
];

/** Maps a dwell category + the chosen target to its ProfileDraft field name -- only meaningful for target "state"/"identity" (habit has no dwellTimes step). */
function dwellDraftFieldFor(target: "state" | "identity", key: keyof DwellTimes): keyof ProfileDraft {
  const capitalized = `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  return `${target}${capitalized}` as keyof ProfileDraft;
}

type SectionId =
  | "foundations"
  | "core"
  | "obstacles"
  | "beliefs"
  | "regulation"
  | "stayAcceptance"
  | "encoding"
  | "imagery"
  | "successfulPerformance"
  | "negativeAction"
  | "dwellTimes"
  | "trigger";

const SECTION_TITLES: Record<SectionId, string> = {
  foundations: "יסודות",
  core: "המוקד",
  obstacles: "מכשולים ופתרונות",
  beliefs: "מחשבות ואמונות",
  regulation: "ויסות",
  stayAcceptance: "מנטרות שהייה וקבלה",
  encoding: "קידוד",
  imagery: "דימוי רצוי",
  successfulPerformance: "דמיון ביצוע מוצלח",
  negativeAction: "פעולה שלילית מוגבלת",
  dwellTimes: "זמן שהייה",
  trigger: "טריגר ל-ARC Link",
};

/** Every section here that is never entirely optional (contains at least one field isTargetDraftComplete actually requires) opens expanded by default; every purely optional/advanced section stays collapsed -- this task's own explicit requirement. */
const SECTION_DEFAULT_EXPANDED: Record<SectionId, boolean> = {
  foundations: true,
  core: true,
  obstacles: false,
  beliefs: false,
  regulation: true,
  stayAcceptance: false,
  encoding: false,
  imagery: false,
  successfulPerformance: false,
  negativeAction: false,
  dwellTimes: false,
  trigger: false,
};

const SECTION_FOR: Partial<Record<ProfileStep, SectionId>> = {
  presenceColor: "foundations",
  value: "foundations",

  supportiveState: "core",
  challengeContext: "core",
  interferingState: "core",
  desiredIdentity: "core",
  identityDesiredState: "core",
  identityChallengeContext: "core",
  identityInterferingEmotion: "core",
  beneficialAction: "core",
  beneficialActionBodyCue: "core",

  stateBarrierType: "obstacles",
  statePracticalAlternative: "obstacles",
  internalAction: "obstacles",
  internalActionBodyCue: "obstacles",
  statePreventiveAction: "obstacles",
  stateSupportingAction: "obstacles",
  identityBarrierType: "obstacles",
  identityPracticalAlternative: "obstacles",
  identityAction: "obstacles",
  identityActionBodyCue: "obstacles",
  identityPreventiveAction: "obstacles",
  identitySupportingAction: "obstacles",
  preventiveActionAsk: "obstacles",
  preventiveActionDescription: "obstacles",

  stateLimitingBelief: "beliefs",
  stateBalancedAlternativeInterpretation: "beliefs",
  stateBridgeBelief: "beliefs",
  stateFutureOrientedMantra: "beliefs",
  identityLimitingBelief: "beliefs",
  identityBalancedAlternativeInterpretation: "beliefs",
  identityBridgeBelief: "beliefs",
  identityFutureOrientedMantra: "beliefs",

  regulationTool: "regulation",
  regulationBodyParts: "regulation",
  regulationMovementText: "regulation",
  regulationMantra: "regulation",
  bridgeMantra: "regulation",

  stayMantra: "stayAcceptance",
  acceptanceMantra: "stayAcceptance",

  stateEncodingRegulationCueAsk: "encoding",
  stateEncodingRegulationCue: "encoding",
  stateMantra: "encoding",
  stateBodyLanguageCue: "encoding",
  stateEncodingBodyParts: "encoding",
  stateEncodingMovementText: "encoding",
  identityEncodingRegulationCueAsk: "encoding",
  identityEncodingRegulationCue: "encoding",
  identityMantra: "encoding",
  identityBodyLanguageCue: "encoding",
  identityEncodingBodyParts: "encoding",
  identityEncodingMovementText: "encoding",

  stateDesiredImageryType: "imagery",
  stateDesiredImageryDescription: "imagery",
  identityDesiredImageryType: "imagery",
  identityDesiredImageryDescription: "imagery",

  successfulPerformanceAsk: "successfulPerformance",
  successfulPerformanceAction: "successfulPerformance",
  successfulPerformanceQualities: "successfulPerformance",
  successfulPerformanceCustomQuality: "successfulPerformance",
  successfulPerformanceResult: "successfulPerformance",
  successMantra: "successfulPerformance",
  successfulPerformanceResultDuration: "successfulPerformance",

  negativeActionEnabledAsk: "negativeAction",
  habit: "negativeAction",
  negativeActionDuration: "negativeAction",

  dwellTimes: "dwellTimes",

  linkTriggerType: "trigger",
  linkTriggerText: "trigger",
};

export function ArcBuildProfileForm({
  target,
  draft,
  setDraft,
  evidenceIndex,
}: {
  target: Target;
  draft: ProfileDraft;
  setDraft: (updater: ProfileDraft | ((current: ProfileDraft) => ProfileDraft)) => void;
  evidenceIndex: EvidenceRecord[];
}) {
  const allSteps = stepOrderFor(target).filter((step) => shouldShowProfileStep(step, draft));

  const sectionsInOrder: SectionId[] = [];
  for (const step of allSteps) {
    const section = SECTION_FOR[step];
    if (section && !sectionsInOrder.includes(section)) sectionsInOrder.push(section);
  }

  const bridgeBeliefHint = selectEncodingEvidence(
    evidenceIndex,
    {
      targetLayer: target as DevelopmentLayer,
      identityLabel: (target === "state" ? draft.supportiveState : draft.desiredIdentity).trim() || null,
      goal: draft.goal.trim() || null,
      habit: draft.habit.trim() || null,
    },
    1
  )[0];

  const sharedImageryHint =
    draft.stateDesiredImageryDescription.trim() && !draft.identityDesiredImageryDescription.trim()
      ? draft.stateDesiredImageryDescription.trim()
      : null;

  function renderField(step: ProfileStep) {
    const textField = TEXT_STEP_FIELDS[step];
    const askField = ASK_STEP_FIELDS[step];
    const yesNoField = YESNO_STEP_FIELDS[step];

    const title =
      step === "stateDesiredImageryType"
        ? `איזה דימוי אמיתי או דמיוני מזכיר לך תחושה של ${draft.supportiveState.trim() || "המצב הרצוי"}?`
        : step === "identityDesiredImageryType"
          ? `איזה דימוי אמיתי או דמיוני מייצג עבורך את הזהות ${draft.desiredIdentity.trim() || "הרצויה"}?`
          : STEP_TITLES[step];

    return (
      <View key={step} style={styles.field}>
        <Text style={styles.question}>{title}</Text>

        {textField && (
          <View>
            <TextInput
              style={styles.textInput}
              value={draft[textField] as string}
              onChangeText={(value) => setDraft({ ...draft, [textField]: value })}
              textAlign="right"
              multiline
            />
            {(step === "stateBridgeBelief" || step === "identityBridgeBelief") && bridgeBeliefHint && (
              <Text style={styles.hint}>{`עדות שמורה שיכולה לעזור: ${bridgeBeliefHint.text}`}</Text>
            )}
            {step === "identityDesiredImageryDescription" && sharedImageryHint && (
              <Pressable onPress={() => setDraft({ ...draft, identityDesiredImageryDescription: sharedImageryHint })}>
                <Text style={styles.hint}>{`הדימוי שנשמר למצב הרצוי: ${sharedImageryHint} (הקש כדי להשתמש באותו דימוי)`}</Text>
              </Pressable>
            )}
          </View>
        )}

        {step === "negativeActionDuration" && (
          <View style={styles.chipRow}>
            {NEGATIVE_ACTION_DURATION_OPTIONS.map((minutes) => (
              <Pressable
                key={minutes}
                style={[styles.chip, draft.negativeActionBaseDurationMinutes === minutes && styles.chipSelected]}
                onPress={() => setDraft({ ...draft, negativeActionBaseDurationMinutes: minutes })}
              >
                <Text style={styles.chipText}>{minutes} דק&apos;</Text>
              </Pressable>
            ))}
          </View>
        )}

        {(step === "stateBarrierType" || step === "identityBarrierType") && (
          <View style={styles.chipRow}>
            {(
              [
                { value: "internal" as const, label: "חסם פנימי" },
                { value: "practical" as const, label: "חסם מעשי" },
              ]
            ).map((option) => {
              const field = step === "stateBarrierType" ? "stateBarrierType" : "identityBarrierType";
              return (
                <Pressable
                  key={option.value}
                  style={[styles.chip, draft[field] === option.value && styles.chipSelected]}
                  onPress={() => setDraft({ ...draft, [field]: draft[field] === option.value ? null : option.value })}
                >
                  <Text style={styles.chipText}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {(step === "stateDesiredImageryType" || step === "identityDesiredImageryType") && (
          <View style={styles.chipRow}>
            {(
              [
                { value: "real" as const, label: "דימוי אמיתי" },
                { value: "imagined" as const, label: "דימוי דמיוני" },
              ]
            ).map((option) => {
              const field = step === "stateDesiredImageryType" ? "stateDesiredImageryType" : "identityDesiredImageryType";
              return (
                <Pressable
                  key={option.value}
                  style={[styles.chip, draft[field] === option.value && styles.chipSelected]}
                  onPress={() => setDraft({ ...draft, [field]: draft[field] === option.value ? null : option.value })}
                >
                  <Text style={styles.chipText}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {step === "successfulPerformanceQualities" && (
          <View style={styles.chipRow}>
            {EXECUTION_QUALITY_PRESETS.map((quality) => {
              const selected = draft.identitySuccessfulPerformanceQualities.includes(quality);
              return (
                <Pressable
                  key={quality}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => {
                    const next = selected
                      ? draft.identitySuccessfulPerformanceQualities.filter((q) => q !== quality)
                      : [...draft.identitySuccessfulPerformanceQualities, quality];
                    setDraft({ ...draft, identitySuccessfulPerformanceQualities: next });
                  }}
                >
                  <Text style={styles.chipText}>{quality}</Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {step === "successfulPerformanceResultDuration" && (
          <View style={styles.dwellRow}>
            <Text style={styles.dwellLabel}>דמיון התוצאה</Text>
            <TextInput
              style={styles.dwellInput}
              value={draft.identityResultImageryDwellSeconds}
              onChangeText={(text) => setDraft({ ...draft, identityResultImageryDwellSeconds: text.replace(/[^0-9]/g, "") })}
              keyboardType="numeric"
              textAlign="center"
            />
            <Text style={styles.dwellUnit}>שניות</Text>
          </View>
        )}

        {step === "linkTriggerType" && (
          <View style={styles.chipRow}>
            {(Object.keys(ARC_LINK_TRIGGER_TYPE_LABELS) as ArcLinkTriggerType[]).map((type) => (
              <Pressable
                key={type}
                style={[styles.chip, draft.linkTriggerType === type && styles.chipSelected]}
                onPress={() => setDraft({ ...draft, linkTriggerType: type })}
              >
                <Text style={styles.chipText}>{ARC_LINK_TRIGGER_TYPE_LABELS[type]}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {yesNoField && (
          <View style={styles.buttonRow}>
            {[true, false].map((answer) => (
              <Pressable
                key={String(answer)}
                style={[styles.smallButton, draft[yesNoField] === answer && styles.smallButtonSelected]}
                onPress={() => setDraft({ ...draft, [yesNoField]: answer })}
              >
                <Text style={styles.smallButtonText}>{answer ? "כן" : "לא"}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {askField && (
          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.smallButton, draft[askField] === false && styles.smallButtonSelected]}
              onPress={() => setDraft({ ...draft, [askField]: false })}
            >
              <Text style={styles.smallButtonText}>השתמש באותו כלי ויסות</Text>
            </Pressable>
            <Pressable
              style={[styles.smallButton, draft[askField] === true && styles.smallButtonSelected]}
              onPress={() => setDraft({ ...draft, [askField]: true })}
            >
              <Text style={styles.smallButtonText}>בחר כלי ויסות קצר לקידוד</Text>
            </Pressable>
          </View>
        )}

        {step === "dwellTimes" && (target === "state" || target === "identity") && (
          <View>
            {DWELL_ROWS.map((row) => {
              const field = dwellDraftFieldFor(target, row.key);
              return (
                <View key={row.key} style={styles.dwellRow}>
                  <Text style={styles.dwellLabel}>{row.label}</Text>
                  <TextInput
                    style={styles.dwellInput}
                    value={draft[field] as string}
                    onChangeText={(text) => setDraft({ ...draft, [field]: text.replace(/[^0-9]/g, "") })}
                    keyboardType="numeric"
                    textAlign="center"
                  />
                  <Text style={styles.dwellUnit}>שניות</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  }

  return (
    <View>
      {sectionsInOrder.map((sectionId) => (
        <CollapsibleSection key={sectionId} title={SECTION_TITLES[sectionId]} defaultExpanded={SECTION_DEFAULT_EXPANDED[sectionId]}>
          <View style={styles.sectionBody}>
            {allSteps.filter((step) => SECTION_FOR[step] === sectionId).map((step) => renderField(step))}
          </View>
        </CollapsibleSection>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionBody: { padding: 14, gap: 4 },
  field: { marginBottom: 18 },
  question: { fontSize: 15, fontWeight: "600", textAlign: "right", marginBottom: 8 },
  hint: { fontSize: 13, textAlign: "right", color: "#666", marginTop: 6 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 14 },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 10 },
  smallButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  smallButtonSelected: { backgroundColor: "#0a7ea4" },
  smallButtonText: { color: "#0a7ea4", fontSize: 14 },
  dwellRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  dwellLabel: { flex: 1, fontSize: 15, textAlign: "right" },
  dwellInput: { width: 56, borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 8, fontSize: 16, marginHorizontal: 8 },
  dwellUnit: { fontSize: 13, color: "#666" },
});
