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
import { needsReactiveStateSelection, resolveEncodingTarget, resolveTargetPreventiveAction } from "./arcEngine.ts";
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
      // Recognition-only chooser copy when 2+ mapped reactive experiences
      // are available (see arc/arcEngine.ts's needsReactiveStateSelection)
      // -- asks which already-present mapped experience the trainee
      // recognizes, never to generate/imagine/strengthen/recall one.
      if (needsReactiveStateSelection(state.triggerType, activeLayers, profile, state.selectedTarget)) {
        return { title: "מה כבר נמצא עכשיו?", body: "בחר את מה שהכי מתאים לרגע הזה." };
      }
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

    case "preventive_action_check": {
      // Resolved from the CURRENT target's own map -- never a single
      // global field, never mixed between targets. See
      // arc/arcEngine.ts's resolveTargetPreventiveAction.
      const { layer } = resolveEncodingTarget({
        activeLayers,
        triggerType: state.triggerType,
        selectedTarget: state.selectedTarget,
        buildProfile: profile,
      });
      const preventiveAction = resolveTargetPreventiveAction(layer, profile);
      return {
        title: "פעולה מונעת",
        body: preventiveAction ? `יש לך פעולה מונעת מוגדרת: ${preventiveAction}. לבצע אותה עכשיו?` : "",
      };
    }

    case "preventive_action": {
      const { layer } = resolveEncodingTarget({
        activeLayers,
        triggerType: state.triggerType,
        selectedTarget: state.selectedTarget,
        buildProfile: profile,
      });
      return { title: "פעולה מונעת", body: resolveTargetPreventiveAction(layer, profile) ?? "" };
    }

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
      // Awareness-adjacent, not Regulation: stay with the sensation
      // exactly as it is. Regulation (and its tool) begins only at the
      // "regulate" stage -- naming a regulation tool here would mix
      // the two, which the Awareness/Regulation instruction layer must
      // keep separate. The breath line is deliberately *awareness* of
      // breath as it happens on its own, never an instruction to
      // change/slow/deepen/extend it -- that's Regulation's job, not
      // Stay/Presence's.
      return {
        title: "הישאר עם זה",
        body: "הישאר עם התחושה כפי שהיא עכשיו, בלי לנסות לשנות אותה. שים לב גם לנשימה כפי שהיא מתרחשת מעצמה.",
      };

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

    case "desired_state_check": {
      // Proactive routing must consume the mapped data, not just ask a
      // generic rating: name whichever target resolveEncodingTarget
      // actually resolved (Desired State / Identity / Desired Habit),
      // and reference the mapped Challenge Context when the target is
      // the state layer -- framed as preparation ("you're preparing
      // for..."), never as a recognition question the way presence_check
      // frames it for reactive_emotion (that's about what's already
      // present; this is about what's coming).
      const question = "עד כמה אתה קרוב למצב הרצוי, בסולם 1 עד 10?";
      const { layer } = resolveEncodingTarget({
        activeLayers,
        triggerType: state.triggerType,
        selectedTarget: state.selectedTarget,
        buildProfile: profile,
      });
      const targetName = layer === "state" ? profile.supportiveState : layer === "identity" ? profile.desiredIdentity : profile.beneficialAction;

      const parts: string[] = [];
      if (layer === "state" && profile.challengeContext) {
        parts.push(`אתה מתכונן למצב: ${profile.challengeContext}.`);
      }
      if (targetName) {
        parts.push(`המטרה: ${targetName}.`);
      }
      parts.push(question);
      return { title: "בדיקת מצב רצוי", body: parts.join(" ") };
    }

    case "encode": {
      const { encoding, actionLabel } = resolveEncodingTarget({
        activeLayers,
        triggerType: state.triggerType,
        selectedTarget: state.selectedTarget,
        buildProfile: profile,
      });

      // Final Encoding order: (1) notice the updated sensation --
      // neutrally, no assumption it improved, a large change/small
      // change/no obvious change are all valid -- then (2) maintain
      // the lightweight Regulation Cue together with the Body-Language
      // Encoding Cue (Encoding doesn't drop Regulation, and doesn't
      // re-list every Regulation mechanism, just this one continuity
      // anchor), then (3) Identity/Mantra -- intentionally activated
      // only here, never earlier -- then (4) Action Imagery, of the
      // DESIRED action only (see below), still before the "act" stage.
      const parts: string[] = ["שים לב לתחושה שלך עכשיו ולכל שינוי שקרה, אם קרה."];

      const maintain: string[] = [];
      if (profile.regulationTool) maintain.push(`המשך עם ${profile.regulationTool}`);
      if (encoding?.bodyLanguageCue) {
        maintain.push(`שמור על ${encoding.bodyLanguageCue}`);
      } else if (!encoding?.mantra && encoding?.target) {
        // No explicit body-language cue and no mantra either -- fall
        // back to a generic body-language transition toward the
        // Desired State, independent of whether a regulation tool is
        // also being maintained.
        maintain.push(`עבור לשפת הגוף של ${encoding.target}`);
      }
      if (maintain.length > 0) parts.push(`${maintain.join(", ו")}.`);

      if (encoding?.mantra) {
        parts.push(`חזור לעצמך: "${encoding.mantra}".`);
      }

      if (maintain.length === 0 && !encoding?.mantra) {
        parts.push("קח רגע לקבע את התחושה החדשה.");
      }

      // Action Imagery: strictly of the desired, beneficial action
      // (actionLabel only ever sources from positive action fields --
      // beneficialAction/internalAction/identityAction, never
      // interferingState/identityInterferingEmotion) -- never the
      // Interfering State, craving, distraction, or any other difficult
      // state. See arc/instructions.ts's containsInductionPattern.
      parts.push(
        actionLabel ? `דמיין את עצמך מבצע עכשיו את ${actionLabel}.` : "דמיין את עצמך מבצע עכשיו את הפעולה שבחרת."
      );

      return { title: "קיבוע", body: parts.join(" ") };
    }

    case "act": {
      // The selected Body-Language cue carries over from Encoding into
      // Action Preparation, and stays displayed for the whole time this
      // screen is up (i.e. "during the action") -- same resolution as
      // encode's, from the same current target's own map, so it can
      // never mix Focus's cue into a Discipline-targeted session or vice
      // versa. Omitted entirely (never invented, never an empty
      // placeholder) when the current target has none configured.
      const { actionLabel, encoding } = resolveEncodingTarget({
        activeLayers,
        triggerType: state.triggerType,
        selectedTarget: state.selectedTarget,
        buildProfile: profile,
      });
      const parts: string[] = [];
      if (encoding?.bodyLanguageCue) {
        parts.push(`בזמן הפעולה, שמור על שפת הגוף שבחרת: ${encoding.bodyLanguageCue}.`);
      }
      parts.push(actionLabel ? `עכשיו הזמן: ${actionLabel}.` : "עכשיו הזמן לפעולה.");
      return { title: "פעולה", body: parts.join(" ") };
    }

    case "success_focus":
      return { title: "התמקדות בהצלחה", body: "כמה דקות נוספות המשכת מעבר לפעולה המקורית?" };

    case "complete":
      return { title: "סיום", body: "כל הכבוד על השלמת הסשן." };
  }
}
