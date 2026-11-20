/**
 * arc/manifestTaskCopy.ts
 *
 * Productivity & Personal Development upgrade task, requirement 6: the
 * actual Hebrew instruction text for every (step, subIndex) pair of a
 * "manifest"-kind task's guided run. Reuses existing shared content
 * wherever it already exists rather than re-authoring it:
 * getAwarenessInstruction/getCombinedAttentionInstruction (both
 * arc/instructions.ts, already used by the main ARC engine) and
 * getFreeBreathingLine (arc/naturalBreathing.ts) for awareness/
 * presence/regulation; the opening visualize line reuses the EXACT
 * already-sanctioned "דמיין שהמטרה הגדולה שלך כבר הושגה" phrasing
 * arc/instructions.ts's own safety denylist whitelists for
 * arc/lifeManifestVisualization.ts's observer-perspective stage --
 * never a new, unreviewed "imagine" phrasing. Every encoding line
 * about the positive sensation uses the same "notice/allow/let it
 * expand" idiom established throughout this codebase (never "imagine
 * yourself FEELING X", the exact pattern the denylist exists to catch).
 */

import { getAwarenessInstruction, getCombinedAttentionInstruction } from "./instructions.ts";
import { getFreeBreathingLine } from "./naturalBreathing.ts";
import type { ManifestProfile } from "./tasks.ts";
import type { ManifestRunState } from "./manifestTaskSteps.ts";

export interface ManifestStepContent {
  title: string;
  primary: string;
  supporting: string[];
}

function nonEmpty(value: string): value is string {
  return value.trim().length > 0;
}

export function getManifestStepContent(state: ManifestRunState, profile: ManifestProfile): ManifestStepContent {
  switch (state.currentStep) {
    case "visualize":
      return getVisualizeContent(state.subIndex, profile);
    case "awareness":
      return { title: "מודעות", primary: getAwarenessInstruction(), supporting: [] };
    case "presence":
      return { title: "נוכחות", primary: getCombinedAttentionInstruction(), supporting: [] };
    case "acceptance":
      return {
        title: "קבלה",
        primary: "אפשר למה שנמצא עכשיו להיות נוכח, בלי להילחם בו ובלי לנסות להעלים אותו.",
        supporting: [],
      };
    case "regulation":
      return {
        title: "ויסות",
        primary: "אפשר לשים יותר תשומת לב למה שתומך בך כרגע, בלי מאמץ.",
        supporting: [getFreeBreathingLine()],
      };
    case "encoding":
      return getEncodingContent(state.subIndex, profile);
    case "identity_action":
      return {
        title: "פעולה זהותית",
        primary: "בחר או בצע פעולה קטנה שתואמת את הזהות והמטרה שלך.",
        supporting: nonEmpty(profile.desiredIdentity) ? [`הזהות: ${profile.desiredIdentity}`] : [],
      };
    case "complete":
      return { title: "הושלם", primary: "התרגיל הושלם.", supporting: [] };
  }
}

function getVisualizeContent(subIndex: number, profile: ManifestProfile): ManifestStepContent {
  switch (subIndex) {
    case 0:
      return {
        title: "דימוי העצמי העתידי",
        // Verbatim, already-sanctioned observer-perspective phrasing --
        // see arc/lifeManifestVisualization.ts's own "observer_perspective"
        // stage (the Major Goal variant) and arc/instructions.ts's
        // denylist whitelist entry for this exact continuation.
        primary: "דמיין שהמטרה הגדולה שלך כבר הושגה. ראה את עצמך מהצד, כאילו אתה צופה בעצמך בעתיד.",
        supporting: nonEmpty(profile.longTermGoal) ? [`המטרה שהגדרת: ${profile.longTermGoal}`] : [],
      };
    case 1:
      return { title: "דימוי העצמי העתידי", primary: "איך אתה נראה? איך אתה עומד או יושב?", supporting: [] };
    case 2:
      return { title: "דימוי העצמי העתידי", primary: "שים לב לאיך אתה מחזיק את הגוף שלך, ואיך אתה נע ופועל.", supporting: [] };
    case 3:
      return {
        title: "דימוי העצמי העתידי",
        primary: "שים לב לאיך אתה מדבר, ואיזו שפת גוף אתה מבטא.",
        supporting: nonEmpty(profile.bodyLanguageDescription) ? [`שפת הגוף שהגדרת: ${profile.bodyLanguageDescription}`] : [],
      };
    default:
      return {
        title: "דימוי העצמי העתידי",
        primary: "שים לב איך אתה מתנהג במציאות שבה כבר הגעת לתוצאה הרצויה.",
        supporting: [
          ...(nonEmpty(profile.desiredResult) ? [`התוצאה הרצויה: ${profile.desiredResult}`] : []),
          ...(nonEmpty(profile.desiredIdentity) ? [`הזהות שאתה מפתח: ${profile.desiredIdentity}`] : []),
        ],
      };
  }
}

function getEncodingContent(subIndex: number, profile: ManifestProfile): ManifestStepContent {
  switch (subIndex) {
    case 0:
      return { title: "קידוד", primary: "שים לב לתחושה חיובית שמתעוררת כשאתה חושב על המטרה שלך, אם היא נוכחת.", supporting: [] };
    case 1:
      return { title: "קידוד", primary: "אפשר לתחושה הזאת להתפשט בהדרגה בגוף, בקצב טבעי.", supporting: [] };
    case 2:
      return {
        title: "קידוד",
        primary: "במקביל, אפשר בהדרגה לאמץ את שפת הגוף ואת התנועה שדמיינת.",
        supporting: nonEmpty(profile.bodyLanguageDescription) ? [profile.bodyLanguageDescription] : [],
      };
    default:
      return {
        title: "קידוד",
        primary: "אפשר לחבר בין התחושה, שפת הגוף והזהות הרצויה.",
        supporting: nonEmpty(profile.desiredIdentity) ? [`הזהות הרצויה: ${profile.desiredIdentity}`] : [],
      };
  }
}
