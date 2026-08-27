/**
 * arc/stageCopy.ts
 *
 * Pure, React-free mapping from ArcStage to display copy and input
 * kind, same role as live/stageCopy.ts played for the old engine/.
 *
 * One thing the given types don't specify: which DevelopmentLayer
 * (state/identity/habit) a given TriggerType's encode/act content
 * should draw from -- ArcBuildProfile has separate state/identity/
 * habit fields, but nothing ties a TriggerType to one of them.
 * getActiveLayerContent() below makes an explicit, defensible choice
 * (reactive_emotion -> state, reactive_urge -> habit, proactive ->
 * identity if the profile has one, else state) so this is easy to
 * spot and correct if it doesn't match the intended design.
 */

import type { ArcBuildProfile, ArcLiveState, ArcStage, DevelopmentLayer, EncodingProfile } from "./types.ts";

export type ArcStageInputKind =
  | "triggerSelect"
  | "scale0to10"
  | "sensationCheck"
  | "yesno"
  | "info"
  | "successFocus"
  | "finish";

export interface ArcStageCopy {
  title: string;
  body: string;
}

const STAGE_INPUT_KINDS: Record<ArcStage, ArcStageInputKind> = {
  trigger_selection: "triggerSelect",
  presence_check: "scale0to10",
  arc_thought_awareness: "info",
  arc_thought_combined_attention: "info",
  arc_thought_expand_presence: "info",
  arc_thought_presence_recheck: "scale0to10",
  sensation_check: "sensationCheck",
  stay: "info",
  accept: "yesno",
  reactive_transition_check: "yesno",
  regulate: "info",
  desired_state_check: "scale0to10",
  encode: "info",
  act: "info",
  success_focus: "successFocus",
  complete: "finish",
};

export function getStageInputKind(stage: ArcStage): ArcStageInputKind {
  return STAGE_INPUT_KINDS[stage];
}

interface ActiveLayerContent {
  layer: DevelopmentLayer;
  encoding: EncodingProfile | null;
  actionLabel: string | null;
}

export function getActiveLayerContent(profile: ArcBuildProfile, triggerType: ArcLiveState["triggerType"]): ActiveLayerContent {
  if (triggerType === "reactive_urge") {
    return { layer: "habit", encoding: null, actionLabel: profile.beneficialAction };
  }
  if (triggerType === "proactive" && profile.identityEncoding) {
    return { layer: "identity", encoding: profile.identityEncoding, actionLabel: profile.identityAction };
  }
  return { layer: "state", encoding: profile.stateEncoding, actionLabel: profile.internalAction };
}

export function getStageCopy(stage: ArcStage, profile: ArcBuildProfile, state: ArcLiveState): ArcStageCopy {
  switch (stage) {
    case "trigger_selection":
      return { title: "מה מביא אותך לכאן?", body: "בחר את מה שהכי מתאים לרגע הזה." };

    case "presence_check":
      return { title: "בדיקת נוכחות", body: "עד כמה אתה נוכח כרגע, בסולם 0 עד 10?" };

    case "arc_thought_awareness":
      return { title: "מודעות", body: "שים לב לתחושה הפנימית שלך כרגע." };

    case "arc_thought_combined_attention": {
      const s = profile.interferingState ?? "המצב המפריע";
      const support = profile.supportiveState ?? "המצב התומך";
      return { title: "תשומת לב משולבת", body: `החזק בו-זמנית את המודעות ל-${s} וגם ל-${support}.` };
    }

    case "arc_thought_expand_presence":
      return { title: "הרחבה", body: "הרחב את תשומת הלב שלך למרחב הסובב אותך, מעבר לתחושה הפנימית." };

    case "arc_thought_presence_recheck":
      return { title: "בדיקת נוכחות חוזרת", body: "אחרי ההרחבה — עד כמה אתה נוכח עכשיו, בסולם 0 עד 10?" };

    case "sensation_check":
      return {
        title: "בדיקת תחושה",
        body:
          state.triggerType === "reactive_urge"
            ? "מה עוצמת הדחף, בסולם 1 עד 10?"
            : "היכן בגוף אתה מרגיש את זה, ומה העוצמה בסולם 1 עד 10?",
      };

    case "stay":
      return { title: "הישאר עם זה", body: `העוצמה גבוהה — הישאר עם התחושה, ${profile.regulationTool ?? "בעזרת הנשימה"}.` };

    case "accept":
      return { title: "קבלה", body: "האם אתה מוכן לקבל את התחושה הזו כמו שהיא, בלי להילחם בה?" };

    case "reactive_transition_check":
      return { title: "בדיקת מעבר", body: "האם אתה מרגיש מוכן לעבור לוויסות, או שאתה צריך עוד רגע עם התחושה?" };

    case "regulate":
      return { title: "ויסות", body: `השתמש בכלי הוויסות שלך: ${profile.regulationTool ?? "כלי הוויסות שלך"}.` };

    case "desired_state_check":
      return { title: "בדיקת מצב רצוי", body: "עד כמה אתה קרוב למצב הרצוי, בסולם 0 עד 10?" };

    case "encode": {
      const { encoding } = getActiveLayerContent(profile, state.triggerType);
      if (!encoding) return { title: "קיבוע", body: "קח רגע לקבע את התחושה החדשה." };
      const parts = [encoding.bodySensationCue, encoding.breathCue, encoding.bodyLanguageCue, encoding.gazeCue].filter(
        (c): c is string => !!c
      );
      const cueText = parts.length > 0 ? parts.join(" · ") : null;
      return {
        title: "קיבוע",
        body: encoding.mantra ? `חזור על: "${encoding.mantra}".` : cueText ?? "קח רגע לקבע את התחושה החדשה.",
      };
    }

    case "act": {
      const { actionLabel } = getActiveLayerContent(profile, state.triggerType);
      return { title: "פעולה", body: actionLabel ? `עכשיו הזמן: ${actionLabel}.` : "עכשיו הזמן לפעולה." };
    }

    case "success_focus":
      return { title: "התמקדות בהצלחה", body: "כמה דקות נוספות המשכת מעבר לפעולה המקורית?" };

    case "complete":
      return { title: "סיום", body: "כל הכבוד על השלמת הסשן." };
  }
}
