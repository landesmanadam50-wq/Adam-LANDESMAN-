/**
 * app/live/stageCopy.ts
 *
 * Pure, React-free module that maps each LiveStage to what a screen
 * should say and what kind of input it needs. Kept separate from
 * LiveSessionScreen.tsx so it can be unit-tested with node --test the
 * same way engine/ is, instead of requiring a React renderer.
 */

import type { ArcProfile } from "../engine/types.ts";
import { LiveStage } from "../engine/types.ts";

export type StageInputKind =
  | "yesno"
  | "scale0to10"
  | "scale1to10"
  | "bodyLocation"
  | "info"
  | "reward"
  | "successFocus"
  | "interferingAction"
  | "finish";

export interface StageCopy {
  title: string;
  body: string;
}

const STAGE_INPUT_KINDS: Record<LiveStage, StageInputKind> = {
  [LiveStage.PreventiveActionCheck]: "yesno",
  [LiveStage.EmotionGate]: "yesno",
  [LiveStage.PresenceCheck]: "scale0to10",
  [LiveStage.ArcThoughtAwareness]: "info",
  [LiveStage.ArcThoughtCombinedAttention]: "info",
  [LiveStage.ArcThoughtExpansion]: "info",
  [LiveStage.ArcThoughtPresenceRecheck]: "scale0to10",
  [LiveStage.BodyLocation]: "bodyLocation",
  [LiveStage.IntensityCheck]: "scale1to10",
  [LiveStage.AcceptanceCheck]: "yesno",
  [LiveStage.StayBreathAwareness]: "info",
  [LiveStage.Regulation]: "info",
  [LiveStage.Encoding]: "info",
  [LiveStage.BeneficialAction]: "info",
  [LiveStage.Reward]: "reward",
  [LiveStage.SuccessFocus]: "successFocus",
  [LiveStage.InterferingAction]: "interferingAction",
  [LiveStage.Finish]: "finish",
};

export function getStageInputKind(stage: LiveStage): StageInputKind {
  return STAGE_INPUT_KINDS[stage];
}

export function getStageCopy(stage: LiveStage, profile: ArcProfile): StageCopy {
  switch (stage) {
    case LiveStage.PreventiveActionCheck:
      return {
        title: "פעולה מונעת",
        body: `יש לך פעולה מונעת מוגדרת: ${profile.preventiveAction?.description ?? ""}. לבצע אותה עכשיו?`,
      };
    case LiveStage.EmotionGate:
      return {
        title: "בדיקת רגש",
        body: "יש כרגע רגש או דחף רלוונטי שאתה רוצה לעבוד עליו?",
      };
    case LiveStage.PresenceCheck:
      return {
        title: "בדיקת נוכחות",
        body: "עד כמה אתה נוכח כרגע, בסולם 0 עד 10?",
      };
    case LiveStage.ArcThoughtAwareness:
      return {
        title: "מודעות",
        body: `שים לב לתחושה הפנימית — ${profile.actions.internalAction}.`,
      };
    case LiveStage.ArcThoughtCombinedAttention:
      return {
        title: "תשומת לב משולבת",
        body: `החזק בו-זמנית את המודעות ל-${profile.interferingState} וגם ל-${profile.supportiveState}.`,
      };
    case LiveStage.ArcThoughtExpansion:
      return {
        title: "הרחבה",
        body: "הרחב את תשומת הלב שלך למרחב הסובב אותך, מעבר לתחושה הפנימית.",
      };
    case LiveStage.ArcThoughtPresenceRecheck:
      return {
        title: "בדיקת נוכחות חוזרת",
        body: "אחרי ההרחבה — עד כמה אתה נוכח עכשיו, בסולם 0 עד 10?",
      };
    case LiveStage.BodyLocation:
      return {
        title: "מיקום בגוף",
        body: "היכן בגוף אתה מרגיש את זה?",
      };
    case LiveStage.IntensityCheck:
      return {
        title: "בדיקת עוצמה",
        body: "מה עוצמת התחושה, בסולם 1 עד 10?",
      };
    case LiveStage.AcceptanceCheck:
      return {
        title: "קבלה",
        body: "האם אתה מוכן לקבל את התחושה הזו כמו שהיא, בלי להילחם בה?",
      };
    case LiveStage.StayBreathAwareness:
      return {
        title: "הישאר ונשום",
        body: `העוצמה גבוהה — הישאר עם התחושה והשתמש בכלי הוויסות שלך: ${profile.regulationTool}.`,
      };
    case LiveStage.Regulation:
      return {
        title: "ויסות",
        body: `השתמש בכלי הוויסות שלך כדי להוריד את העוצמה: ${profile.regulationTool}.`,
      };
    case LiveStage.Encoding:
      return {
        title: "קיבוע",
        body: profile.mantra
          ? `העוצמה נמוכה — חזור על המנטרה שלך: "${profile.mantra}".`
          : "העוצמה נמוכה — קח רגע לקבע את התחושה החדשה.",
      };
    case LiveStage.BeneficialAction:
      return {
        title: "פעולה מיטיבה",
        body: `עכשיו הזמן: ${profile.actions.beneficialAction}.`,
      };
    case LiveStage.Reward:
      return {
        title: "חיזוק",
        body: "",
      };
    case LiveStage.SuccessFocus:
      return {
        title: "התמקדות בהצלחה",
        body: "כמה דקות נוספות המשכת מעבר לפעולה המקורית?",
      };
    case LiveStage.InterferingAction:
      return {
        title: "חלון לפעולה המפריעה",
        body: profile.interferingAction
          ? `${profile.interferingAction.description} — עד ${profile.interferingAction.allowedMinutes} דקות.`
          : "",
      };
    case LiveStage.Finish:
      return {
        title: "סיום",
        body: "כל הכבוד על השלמת הסשן.",
      };
    default:
      return { title: "", body: "" };
  }
}
