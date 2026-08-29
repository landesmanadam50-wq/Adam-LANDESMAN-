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
import {
  needsCurrentActionResolution,
  needsReactiveStateSelection,
  resolveActionDuration,
  resolveEncodingRegulationCue,
  resolveEncodingTarget,
  resolveTargetPreventiveAction,
} from "./arcEngine.ts";
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
            // Deliberately conditional ("אם אתה מבחין") rather than
            // presuming a location is obvious -- a body-location answer
            // is required before continuing (see live/screens.tsx's
            // SensationRatingScreen), but the trainee is never pushed to
            // invent one: a preset, free text, or "לא ברור לי איפה" all
            // count. Intensity stays a separate question/sentence, never
            // merged into the location answer itself.
            : "אם אתה מבחין בתחושה בגוף, איפה היא מורגשת הכי הרבה? מה העוצמה, בסולם 1 עד 10?",
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
      const { layer, encoding } = resolveEncodingTarget({
        activeLayers,
        triggerType: state.triggerType,
        selectedTarget: state.selectedTarget,
        buildProfile: profile,
      });

      // Final Encoding order: (1) notice the updated sensation --
      // neutrally, no assumption it improved, a large change/small
      // change/no obvious change are all valid -- then (2) the Short
      // Encoding Regulation Cue, this target's own lightweight
      // continuity anchor -- deliberately NOT the full Regulation
      // process/instructions used at the "regulate" stage, just one
      // short carry-over, to avoid overloading attention here -- then
      // (3) the Body-Language Encoding Cue, then (4) Identity/Mantra --
      // intentionally activated only here, never earlier. Action
      // Imagery is deliberately NOT here -- it lives in the "act" stage
      // instead, where the currentAction it imagines is actually
      // resolved (see that case's doc).
      const parts: string[] = ["שים לב לתחושה שלך עכשיו ולכל שינוי שקרה, אם קרה."];
      let hasContinuityContent = false;

      const regulationCue = resolveEncodingRegulationCue(layer, profile);
      if (regulationCue) {
        parts.push(`המשך עם ${regulationCue}.`);
        hasContinuityContent = true;
      }

      if (encoding?.bodyLanguageCue) {
        parts.push(`שמור על ${encoding.bodyLanguageCue}.`);
        hasContinuityContent = true;
      } else if (!encoding?.mantra && encoding?.target) {
        // No explicit body-language cue and no mantra either -- fall
        // back to a generic body-language transition toward the
        // Desired State, independent of whether a regulation cue is
        // also being maintained.
        parts.push(`עבור לשפת הגוף של ${encoding.target}.`);
        hasContinuityContent = true;
      }

      if (encoding?.mantra) {
        parts.push(`חזור לעצמך: "${encoding.mantra}".`);
        hasContinuityContent = true;
      }

      if (!hasContinuityContent) {
        parts.push("קח רגע לקבע את התחושה החדשה.");
      }

      return { title: "קיבוע", body: parts.join(" ") };
    }

    case "act": {
      // Before currentAction is resolved, "act" shows the Action-choice
      // screen instead: the planned/mapped action + "can I perform it
      // now?" -- see arc/arcEngine.ts's needsCurrentActionResolution.
      // Deliberately resolved WITHOUT the selectedAction override here
      // (it's still null at this point by construction), so this always
      // names the true planned action, never a stale/alternative one.
      if (needsCurrentActionResolution(state.plannedActionConfirmed, state.selectedAction)) {
        const { actionLabel: plannedAction } = resolveEncodingTarget({
          activeLayers,
          triggerType: state.triggerType,
          selectedTarget: state.selectedTarget,
          buildProfile: profile,
        });
        return {
          title: "פעולה",
          body: plannedAction ? `הפעולה שתכננת: ${plannedAction}.` : "האם תוכל לבצע את הפעולה שתכננת עכשיו?",
        };
      }

      // The selected Body-Language cue carries over from Encoding into
      // Action Preparation, and stays displayed for the whole time this
      // screen is up (i.e. "during the action") -- same resolution as
      // encode's, from the same current target's own map, so it can
      // never mix Focus's cue into a Discipline-targeted session or vice
      // versa. Omitted entirely (never invented, never an empty
      // placeholder) when the current target has none configured.
      //
      // selectedAction (ArcLiveState) resolves currentAction: the
      // trainee's mapped action, unless they entered a session-specific
      // alternative because the mapped one couldn't be performed right
      // now -- see arc/arcEngine.ts's EncodingResolution doc. Action
      // Imagery below always follows whichever one that resolves to.
      const { actionLabel: currentAction, encoding } = resolveEncodingTarget({
        activeLayers,
        triggerType: state.triggerType,
        selectedTarget: state.selectedTarget,
        buildProfile: profile,
        selectedAction: state.selectedAction,
      });
      const bodyLanguageCue = encoding?.bodyLanguageCue ?? null;

      const parts: string[] = [];
      if (bodyLanguageCue) {
        parts.push(`בזמן הפעולה, שמור על שפת הגוף שבחרת: ${bodyLanguageCue}.`);
      }

      // Action Imagery: strictly of currentAction (only ever sources
      // from positive action fields -- beneficialAction/internalAction/
      // identityAction, or the trainee's own alternative -- never
      // interferingState/identityInterferingEmotion) -- never the
      // Interfering State, craving, distraction, or any other difficult
      // state. See arc/instructions.ts's containsInductionPattern.
      // Carries the SAME Body-Language Cue forward from Encoding, from
      // this target's own map only, when one is configured -- never
      // invented, never an empty placeholder when there isn't one.
      const imagine = currentAction ? `דמיין את עצמך מבצע עכשיו את ${currentAction}` : "דמיין את עצמך מבצע עכשיו את הפעולה שבחרת";
      parts.push(bodyLanguageCue ? `${imagine}, תוך שמירה על ${bodyLanguageCue}.` : `${imagine}.`);

      parts.push(currentAction ? `עכשיו הזמן: ${currentAction}.` : "עכשיו הזמן לפעולה.");

      // The resolved action duration -- the alternative action's own
      // session-specific duration when one was chosen, else the
      // BUILD-level actionDuration -- named explicitly right before the
      // timed Action begins. Never invented: omitted when neither is set.
      const duration = resolveActionDuration(state.selectedActionDuration, profile);
      if (duration !== null) {
        parts.push(`משך הפעולה: ${duration} דקות.`);
      }

      return { title: "פעולה", body: parts.join(" ") };
    }

    case "success_focus":
      return { title: "התמקדות בהצלחה", body: "כמה דקות נוספות המשכת מעבר לפעולה המקורית?" };

    case "complete":
      return { title: "סיום", body: "כל הכבוד על השלמת הסשן." };
  }
}
