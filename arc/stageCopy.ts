/**
 * arc/stageCopy.ts
 *
 * Pure, React-free mapping from ArcStage to display copy and input
 * kind, same role as live/stageCopy.ts played for the old engine/.
 *
 * Which DevelopmentLayer's data (state/identity/habit) feeds a given
 * stage's copy is resolved once, centrally, via arcEngine.ts's
 * resolveEncodingTarget -- this module doesn't re-derive that choice.
 */

import type { ArcBuildProfile, ArcLiveState, ArcStage, DevelopmentLayer } from "./types.ts";
import { resolveEncodingTarget } from "./arcEngine.ts";
import {
  getAwarenessInstruction,
  getCombinedAttentionInstruction,
  getExpandPresenceInstruction,
  getChallengeContextRecognitionPrompt,
  getInterferingStateRecognitionPrompt,
} from "./instructions.ts";

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

export interface YesNoLabels {
  yes: string;
  no: string;
}

/** Per-stage button wording for the three "yesno" stages -- Instruction Layer content, not decision logic. */
export function getYesNoLabels(stage: ArcStage): YesNoLabels {
  switch (stage) {
    case "reactive_transition_check":
      return { yes: "כן, לעבור לוויסות", no: "עוד קצת שהייה" };
    case "accept":
    case "preventive_action_check":
    default:
      return { yes: "כן", no: "לא" };
  }
}

const STAGE_INPUT_KINDS: Record<ArcStage, ArcStageInputKind> = {
  trigger_selection: "triggerSelect",
  presence_check: "scale0to10",
  arc_thought_awareness: "info",
  arc_thought_combined_attention: "info",
  arc_thought_expand_presence: "info",
  arc_thought_presence_recheck: "scale0to10",
  preventive_action_check: "yesno",
  preventive_action: "info",
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

/**
 * A one-time recognition preamble shown alongside the very first
 * presence_check, for a reactive_emotion session only (the general
 * "something is interfering" trigger -- see arc/arcEngine.ts's
 * getAvailableLiveTriggers). Uses the mapped Challenge Context (if any)
 * or Interfering State (if any) purely for recognition, per
 * arc/instructions.ts's getChallengeContextRecognitionPrompt /
 * getInterferingStateRecognitionPrompt -- both phrased as a yes/no
 * question about what may already be present, never an instruction to
 * evoke or hold it. Challenge Context is checked first: if the trainee
 * recognizes the mapped situation, that's the more concrete signal;
 * Interfering State recognition is the fallback when no Challenge
 * Context was mapped. Returns null (no preamble) for every other
 * trigger type, and when neither was mapped.
 */
function getRecognitionPreamble(profile: ArcBuildProfile, state: ArcLiveState): string | null {
  if (state.triggerType !== "reactive_emotion") return null;
  if (profile.challengeContext) return getChallengeContextRecognitionPrompt(profile.challengeContext);
  if (profile.interferingState) return getInterferingStateRecognitionPrompt(profile.interferingState);
  return null;
}

export function getStageCopy(
  stage: ArcStage,
  profile: ArcBuildProfile,
  state: ArcLiveState,
  activeLayers: DevelopmentLayer[]
): ArcStageCopy {
  switch (stage) {
    case "trigger_selection":
      return { title: "מה מביא אותך לכאן?", body: "בחר את מה שהכי מתאים לרגע הזה." };

    case "presence_check": {
      const question = "עד כמה אתה נוכח כרגע, בסולם 1 עד 10?";
      const preamble = getRecognitionPreamble(profile, state);
      return { title: "בדיקת נוכחות", body: preamble ? `${preamble} ${question}` : question };
    }

    case "arc_thought_awareness":
      return { title: "מודעות", body: getAwarenessInstruction() };

    case "arc_thought_combined_attention":
      // Deliberately does not name interferingState/supportiveState: holding
      // two named states in awareness simultaneously is an induction-style
      // pattern (see arc/instructions.ts's containsInductionPattern), not
      // present-moment awareness. getCombinedAttentionInstruction() takes
      // no state parameters for exactly this reason.
      return { title: "תשומת לב משולבת", body: getCombinedAttentionInstruction() };

    case "arc_thought_expand_presence":
      return { title: "הרחבה", body: getExpandPresenceInstruction() };

    case "arc_thought_presence_recheck":
      return { title: "בדיקת נוכחות חוזרת", body: "אחרי ההרחבה — עד כמה אתה נוכח עכשיו, בסולם 1 עד 10?" };

    case "preventive_action_check":
      return {
        title: "פעולה מונעת",
        body: profile.preventiveAction ? `יש לך פעולה מונעת מוגדרת: ${profile.preventiveAction}. לבצע אותה עכשיו?` : "",
      };

    case "preventive_action":
      return { title: "פעולה מונעת", body: profile.preventiveAction ?? "" };

    case "sensation_check":
      if (state.sensationLocation !== null || state.sensationIntensity !== null) {
        return { title: "בדיקת תחושה חוזרת", body: "מה העוצמה עכשיו, בסולם 1 עד 10?" };
      }
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
      // Regulation works with whatever sensation is already, currently
      // present -- never an instruction to recreate or intensify the
      // mapped Interfering State. "Notice current sensation" always
      // comes first; the regulation tool/cue follows.
      return {
        title: "ויסות",
        body: profile.regulationTool
          ? `שים לב לתחושה שלך עכשיו. השתמש בכלי הוויסות שלך: ${profile.regulationTool}.`
          : "שים לב לתחושה שלך עכשיו.",
      };

    case "desired_state_check":
      return { title: "בדיקת מצב רצוי", body: "עד כמה אתה קרוב למצב הרצוי, בסולם 1 עד 10?" };

    case "encode": {
      // The transition into Encoding: notice the sensation again --
      // neutrally, never implying it must be calmer or better than
      // before -- while the regulation tool/cue continues underneath
      // rather than being dropped. This is the one lightweight
      // Regulation Anchor Encoding preserves (see arc/config.ts /
      // program logic for why Encoding doesn't re-list every
      // Regulation mechanism).
      const transition = profile.regulationTool
        ? `המשך עם ${profile.regulationTool}, ושים לב לתחושה שלך עכשיו.`
        : "שים לב לתחושה שלך עכשיו.";

      const { encoding } = resolveEncodingTarget({
        activeLayers,
        triggerType: state.triggerType,
        selectedTarget: state.selectedTarget,
        buildProfile: profile,
      });
      if (!encoding) return { title: "קיבוע", body: `${transition} קח רגע לקבע את התחושה החדשה.` };
      const parts = [encoding.bodySensationCue, encoding.breathCue, encoding.bodyLanguageCue, encoding.gazeCue].filter(
        (c): c is string => !!c
      );
      const cueText = parts.length > 0 ? parts.join(" · ") : null;
      // Desired State / Identity are intentionally activated here, at
      // Encoding -- never earlier. encoding.target is the Desired
      // State (see build/profileWizard.ts's buildProfileFromDraft).
      const anchor =
        encoding.mantra != null
          ? `חזור על: "${encoding.mantra}".`
          : (cueText ?? (encoding.target ? `עבור לשפת הגוף של ${encoding.target}.` : "קח רגע לקבע את התחושה החדשה."));
      return { title: "קיבוע", body: `${transition} ${anchor}` };
    }

    case "act": {
      const { actionLabel } = resolveEncodingTarget({
        activeLayers,
        triggerType: state.triggerType,
        selectedTarget: state.selectedTarget,
        buildProfile: profile,
      });
      return { title: "פעולה", body: actionLabel ? `עכשיו הזמן: ${actionLabel}.` : "עכשיו הזמן לפעולה." };
    }

    case "success_focus":
      return { title: "התמקדות בהצלחה", body: "כמה דקות נוספות המשכת מעבר לפעולה המקורית?" };

    case "complete":
      return { title: "סיום", body: "כל הכבוד על השלמת הסשן." };
  }
}
