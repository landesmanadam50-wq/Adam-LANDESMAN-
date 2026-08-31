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
  resolveActPhase,
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
import type { InstructionSegment } from "./instructionTiming.ts";
import { INLINE_RATING_REVEAL_DELAY_SECONDS, INSTRUCTION_TIMING } from "./instructionTiming.ts";
import { resolveDwellSecondsFor, withTrailingDwellSegment } from "./dwellTimes.ts";
import type { EvidenceRecord } from "./evidence.ts";
import { resolveEncodingEvidenceContext, selectEncodingEvidence } from "./evidence.ts";

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
  /**
   * Progressive timed-instruction segments for this screen, or null for
   * every screen the timed-reveal system doesn't apply to (unchanged,
   * immediate-Continue behavior -- see arc/instructionTiming.ts). When
   * present, `body` is still the full joined text (for anything that
   * reads it directly, e.g. the Stack header), but the timed screens in
   * live/screens.tsx render progressively from `segments` instead, via
   * getInstructionTimingStatus -- never both at once.
   */
  segments: InstructionSegment[] | null;
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

export type InlineRequiredRatingKind = "presence" | "desiredState" | "intensity";

/**
 * Visual-refinement task: the ONE concise question line shown when each
 * of the three REQUIRED inline ratings reveals -- Presence
 * (arc_thought_expand_presence), Desired State Level (regulate,
 * proactive), and the feeling/urge/interfering-state intensity recheck
 * (regulate reactive branch, and the accept-triggered recheck) -- see
 * live/screens.tsx's RevealedRatingPrompt and live/ArcLiveRenderer.tsx's
 * "arc_thought_expand_presence"/"regulate"/"accept" cases. Deliberately
 * its own fixed, short line, distinct from
 * presence_check/arc_thought_presence_recheck/desired_state_check/
 * sensation_check's own title+body copy (unchanged, still used by
 * every OTHER -- standalone -- entry point into those same stages) --
 * this text is used ONLY by these three specific inline reveals, per
 * spec, never applied to any other rating in the app.
 */
export function getInlineRequiredRatingQuestion(kind: InlineRequiredRatingKind): string {
  switch (kind) {
    case "presence":
      return "מה רמת הנוכחות שלך עכשיו?";
    case "desiredState":
      return "כמה אתה קרוב עכשיו למצב הרצוי?";
    case "intensity":
      return "מה עוצמת התחושה עכשיו?";
  }
}

/**
 * The Accept stage's "לא" sub-flow (see live/screens.tsx's AcceptScreen):
 * acknowledges the trainee's current unwillingness itself, as a thing to
 * notice/accept rather than a failure -- never critical, never asking
 * the trainee to intentionally evoke/strengthen/maintain the interfering
 * sensation. Shown once per unwillingness round (repeated "לא" answers
 * repeat this same line, progressively appended -- never replacing what
 * was already shown -- up to the loop-safety cap; see
 * arc/arcEngine.ts's isAcceptanceWillingnessLoopCapped).
 */
export function getAcceptanceUnwillingnessAcknowledgment(): string {
  return "שים לב לכך שכרגע אינך מוכן לקבל את התחושה. אין צורך לשנות את זה.";
}

/** The readiness re-check asked again after each unwillingness round's own configured Acceptance dwell has completed -- "כן" proceeds into the existing normal Acceptance path; "לא" repeats the unwillingness round, capped. */
export function getAcceptanceReadinessRecheckQuestion(): string {
  return "האם אתה מוכן עכשיו לאפשר לתחושה להיות כפי שהיא?";
}

/**
 * Evidence-encoding task: the natural-language lead-in for a selected
 * personal-evidence/Gratitude item (arc/evidence.ts), never a
 * clinical/argumentative label like "הוכחה שאתה..." (#16). The item's
 * own stored text always follows verbatim, unrephrased -- this
 * function only ever prepends a short, calm lead-in; it never alters
 * the evidence text itself.
 */
export function getEvidenceLine(item: EvidenceRecord): string {
  const leadIn = item.sourceType === "beneficial_action" ? "משהו שכבר עשית:" : "משהו שהערכת בעצמך:";
  return `${leadIn} ${item.text}`;
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
  negative_action: "info",
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
  activeLayers: DevelopmentLayer[],
  /**
   * Evidence-encoding task: the trainee's derived personal-evidence
   * index (arc/evidence.ts's buildEvidenceIndex, built once from
   * data/sessionLog.ts's existing history by the I/O layer and passed
   * straight through) -- only ever read by the "encode" case below.
   * Optional and defaults to empty so every other stage, and every
   * existing caller/test of this function, is completely unaffected.
   */
  evidenceIndex: EvidenceRecord[] = []
): ArcStageCopy {
  switch (stage) {
    case "trigger_selection":
      // Recognition-only chooser copy when 2+ mapped reactive experiences
      // are available (see arc/arcEngine.ts's needsReactiveStateSelection)
      // -- asks which already-present mapped experience the trainee
      // recognizes, never to generate/imagine/strengthen/recall one.
      if (needsReactiveStateSelection(state.triggerType, activeLayers, profile, state.selectedTarget)) {
        return { title: "מה כבר נמצא עכשיו?", body: "בחר את מה שהכי מתאים לרגע הזה.", segments: null };
      }
      return { title: "מה מביא אותך לכאן?", body: "בחר את מה שהכי מתאים לרגע הזה.", segments: null };

    case "presence_check": {
      const question = "עד כמה אתה נוכח כרגע, בסולם 1 עד 10?";
      const preamble = getRecognitionPreamble(profile, state);
      return { title: "בדיקת נוכחות", body: preamble ? `${preamble} ${question}` : question, segments: null };
    }

    case "arc_thought_awareness": {
      const text = getAwarenessInstruction();
      return { title: "מודעות", body: text, segments: [{ text, durationSeconds: INSTRUCTION_TIMING.arcThoughtAwareness }] };
    }

    case "arc_thought_combined_attention": {
      // Deliberately does not name interferingState/supportiveState: holding
      // two named states in awareness simultaneously is an induction-style
      // pattern (see arc/instructions.ts's containsInductionPattern), not
      // present-moment awareness. getCombinedAttentionInstruction() takes
      // no state parameters for exactly this reason.
      const text = getCombinedAttentionInstruction();
      return {
        title: "תשומת לב משולבת",
        body: text,
        segments: [{ text, durationSeconds: INSTRUCTION_TIMING.arcThoughtCombinedAttention }],
      };
    }

    case "arc_thought_expand_presence": {
      // Timing-update task: the Presence Rating that used to live on
      // arc_thought_presence_recheck's own separate page is now shown
      // inline on THIS page instead (see live/screens.tsx's
      // PresenceExperienceScreen) once this instruction's own timing
      // PLUS the additional INLINE_RATING_REVEAL_DELAY_SECONDS have
      // both elapsed -- modeled as one trailing, empty-text segment so
      // getInstructionTimingStatus's existing `complete` flag stays the
      // single source of truth for "reveal the rating now". body stays
      // just the spoken instruction text; the trailing segment carries
      // no text of its own.
      const text = getExpandPresenceInstruction();
      const segments: InstructionSegment[] = [
        { text, durationSeconds: INSTRUCTION_TIMING.arcThoughtExpandPresence },
        { text: "", durationSeconds: INLINE_RATING_REVEAL_DELAY_SECONDS },
      ];
      return { title: "הרחבה", body: text, segments };
    }

    case "arc_thought_presence_recheck":
      return {
        title: "בדיקת נוכחות חוזרת",
        body: "אחרי ההרחבה — עד כמה אתה נוכח עכשיו, בסולם 1 עד 10?",
        segments: null,
      };

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
        segments: null,
      };
    }

    case "preventive_action": {
      const { layer } = resolveEncodingTarget({
        activeLayers,
        triggerType: state.triggerType,
        selectedTarget: state.selectedTarget,
        buildProfile: profile,
      });
      return { title: "פעולה מונעת", body: resolveTargetPreventiveAction(layer, profile) ?? "", segments: null };
    }

    case "sensation_check":
      if (state.sensationLocation !== null || state.sensationIntensity !== null) {
        return { title: "בדיקת תחושה חוזרת", body: "מה העוצמה עכשיו, בסולם 1 עד 10?", segments: null };
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
        segments: null,
      };

    case "stay": {
      // Awareness-adjacent, not Regulation: stay with the sensation
      // exactly as it is. Regulation (and its tool) begins only at the
      // "regulate" stage -- naming a regulation tool here would mix
      // the two, which the Awareness/Regulation instruction layer must
      // keep separate. The breath line is deliberately *awareness* of
      // breath as it happens on its own, never an instruction to
      // change/slow/deepen/extend it -- that's Regulation's job, not
      // Stay/Presence's. Two progressive segments, not one: the current
      // sensation is offered first, breath awareness only joins once the
      // trainee has had the configured minimum time with the sensation
      // alone (see arc/instructionTiming.ts). Dwell-time task: this is
      // the "Sensation / Awareness" dwell category -- once both
      // instruction segments above have revealed, ONE trailing dwell
      // segment (arc/dwellTimes.ts) sized from the CURRENT target's own
      // configuration (never another target's) is appended, replacing
      // the flat +15s this stage used to carry on each segment.
      const { layer } = resolveEncodingTarget({
        activeLayers,
        triggerType: state.triggerType,
        selectedTarget: state.selectedTarget,
        buildProfile: profile,
      });
      const dwellSeconds = resolveDwellSecondsFor("sensationDwellSeconds", layer, profile);
      const instructionSegments: InstructionSegment[] = [
        { text: "הישאר עם התחושה כפי שהיא עכשיו, בלי לנסות לשנות אותה.", durationSeconds: INSTRUCTION_TIMING.stayCurrentSensation },
        { text: "שים לב גם לנשימה כפי שהיא מתרחשת מעצמה.", durationSeconds: INSTRUCTION_TIMING.stayNaturalBreath },
      ];
      return {
        title: "הישאר עם זה",
        body: instructionSegments.map((segment) => segment.text).join(" "),
        segments: withTrailingDwellSegment(instructionSegments, dwellSeconds),
      };
    }

    case "accept":
      return { title: "קבלה", body: "האם אתה מוכן לקבל את התחושה הזו כמו שהיא, בלי להילחם בה?", segments: null };

    case "reactive_transition_check":
      return {
        title: "בדיקת מעבר",
        body: "האם אתה מרגיש מוכן לעבור לוויסות, או שאתה צריך עוד רגע עם התחושה?",
        segments: null,
      };

    case "regulate": {
      // Regulation works with whatever sensation is already, currently
      // present -- never an instruction to recreate or intensify the
      // mapped Interfering State. "Notice current sensation" always
      // comes first; the regulation tool/cue follows. Its own timing
      // config (INSTRUCTION_TIMING.regulate), deliberately separate from
      // Stay/Presence's -- see arc/instructionTiming.ts.
      // Timing-update task: the Desired State Level check (proactive) /
      // intensity recheck (reactive) that used to live on its own
      // separate page immediately after Regulation is now shown inline
      // on THIS page instead (see live/screens.tsx's RegulationScreen).
      // Dwell-time task: the rating now reveals once this instruction's
      // own timing PLUS the CURRENT target's own configured Regulation
      // dwell (arc/dwellTimes.ts) have both elapsed -- this stage's own
      // dedicated dwell category, which replaces the flat
      // INLINE_RATING_REVEAL_DELAY_SECONDS this trailing segment used to
      // carry (that constant is now used only by
      // arc_thought_expand_presence above, an unrelated, unchanged
      // Presence concept).
      const { layer } = resolveEncodingTarget({
        activeLayers,
        triggerType: state.triggerType,
        selectedTarget: state.selectedTarget,
        buildProfile: profile,
      });
      const dwellSeconds = resolveDwellSecondsFor("regulationDwellSeconds", layer, profile);
      const text = profile.regulationTool
        ? `שים לב לתחושה שלך עכשיו. השתמש בכלי הוויסות שלך: ${profile.regulationTool}.`
        : "שים לב לתחושה שלך עכשיו.";
      const segments = withTrailingDwellSegment([{ text, durationSeconds: INSTRUCTION_TIMING.regulate }], dwellSeconds);
      return { title: "ויסות", body: text, segments };
    }

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
      return { title: "בדיקת מצב רצוי", body: parts.join(" "), segments: null };
    }

    case "encode": {
      const { layer, encoding } = resolveEncodingTarget({
        activeLayers,
        triggerType: state.triggerType,
        selectedTarget: state.selectedTarget,
        buildProfile: profile,
      });

      // Final Encoding order (evidence-encoding task): (1) notice the
      // updated sensation -- neutrally, no assumption it improved, a
      // large change/small change/no obvious change are all valid --
      // then (2) the Short Encoding Regulation Cue, this target's own
      // lightweight continuity anchor -- deliberately NOT the full
      // Regulation process/instructions used at the "regulate" stage,
      // just one short carry-over, to avoid overloading attention here
      // -- then (3) a relevant real personal-evidence/Gratitude line,
      // when one was selected (arc/evidence.ts), immediately followed
      // by (4) that SAME record's own concrete memory detail, when it
      // has one -- then (5) Identity/Mantra, grounded in whatever
      // evidence just preceded it -- then (6) the Body-Language
      // Encoding Cue. Evidence/memory-detail and Identity/Mantra
      // deliberately now come BEFORE Body-Language (this task's one
      // explicitly requested Encoding sub-order change; Body-Language
      // used to precede Identity/Mantra here). Action Imagery is
      // deliberately NOT here -- it lives in the "act" stage instead,
      // where the currentAction it imagines is actually resolved (see
      // that case's doc). Each piece is its own timed segment
      // (arc/instructionTiming.ts) so this order reveals progressively
      // rather than all at once.
      const segments: InstructionSegment[] = [
        { text: "שים לב לתחושה שלך עכשיו ולכל שינוי שקרה, אם קרה.", durationSeconds: INSTRUCTION_TIMING.encodeUpdatedSensation },
      ];
      let hasContinuityContent = false;

      const regulationCue = resolveEncodingRegulationCue(layer, profile);
      if (regulationCue) {
        segments.push({ text: `המשך עם ${regulationCue}.`, durationSeconds: INSTRUCTION_TIMING.encodeShortRegulationCue });
        hasContinuityContent = true;
      }

      // Evidence-encoding task: a real past behavioral success or a
      // relevant protocol-linked Gratitude entry, selected from the
      // trainee's OWN existing history (arc/evidence.ts) -- never
      // invented, never shown when nothing sufficiently relevant
      // exists (#17). This never counts toward hasContinuityContent:
      // that flag tracks whether any BUILD-configured Encoding cue
      // exists, a separate question from whether session HISTORY
      // happens to contain relevant evidence.
      const evidenceContext = resolveEncodingEvidenceContext(layer, encoding, profile);
      const selectedEvidence = selectEncodingEvidence(evidenceIndex, evidenceContext);
      for (const item of selectedEvidence) {
        segments.push({ text: getEvidenceLine(item), durationSeconds: INSTRUCTION_TIMING.encodeEvidence });
        if (item.memoryDetail) {
          // #9/#13: the SAME record's own concrete memory detail,
          // immediately after its evidence line and before anything
          // else -- never a different record's detail, never invented
          // when absent.
          segments.push({ text: item.memoryDetail, durationSeconds: INSTRUCTION_TIMING.encodeMemoryDetail });
        }
      }

      if (encoding?.mantra) {
        segments.push({ text: `חזור לעצמך: "${encoding.mantra}".`, durationSeconds: INSTRUCTION_TIMING.encodeIdentityMantra });
        hasContinuityContent = true;
      }

      if (encoding?.bodyLanguageCue) {
        // LIVE-flow-update task: folds in the "carry this into the real
        // action" reminder that used to live on its own standalone
        // Action Preparation screen (now removed -- see
        // arc/arcEngine.ts's resolveActPhase) so that instruction is
        // preserved rather than lost, right where the cue is first
        // introduced.
        segments.push({
          text: `שמור על ${encoding.bodyLanguageCue}, גם בהמשך וגם בזמן הפעולה עצמה.`,
          durationSeconds: INSTRUCTION_TIMING.encodeBodyLanguageCue,
        });
        hasContinuityContent = true;
      } else if (!encoding?.mantra && encoding?.target) {
        // No explicit body-language cue and no mantra either -- fall
        // back to a generic body-language transition toward the
        // Desired State, independent of whether a regulation cue is
        // also being maintained.
        segments.push({ text: `עבור לשפת הגוף של ${encoding.target}.`, durationSeconds: INSTRUCTION_TIMING.encodeBodyLanguageCue });
        hasContinuityContent = true;
      }

      if (!hasContinuityContent) {
        segments.push({ text: "קח רגע לקבע את התחושה החדשה.", durationSeconds: INSTRUCTION_TIMING.encodeFallback });
      }

      // Dwell-time task: the "Encoding / Body-Language" dwell category --
      // ONE trailing dwell segment (arc/dwellTimes.ts), sized from the
      // CURRENT target's own configuration, appended after this whole
      // encode instruction sequence finishes revealing (never per
      // sub-piece -- dwell is a single post-instruction period, not
      // added once per segment).
      const dwellSeconds = resolveDwellSecondsFor("encodingDwellSeconds", layer, profile);
      return {
        title: "קיבוע",
        body: segments.map((segment) => segment.text).join(" "),
        segments: withTrailingDwellSegment(segments, dwellSeconds),
      };
    }

    case "act": {
      // Which of the "act" stage's three sub-phases to show -- see
      // arc/arcEngine.ts's resolveActPhase doc for the fixed,
      // one-directional order (choice -> imagery -> performing). Still
      // one ArcStage value throughout; no new stage was added. The
      // standalone Action Preparation sub-phase that used to sit
      // between imagery and performing is removed -- its useful
      // "carry the cue into the real action" reminder now lives on
      // Encoding's own body-language segment instead (see the "encode"
      // case above).
      const phase = resolveActPhase(state.plannedActionConfirmed, state.selectedAction, state.actionImageryCompleted);

      if (phase === "choice") {
        // Deliberately resolved WITHOUT the selectedAction override here
        // (it's still null at this point by construction), so this
        // always names the true planned action, never a stale/
        // alternative one.
        const { actionLabel: plannedAction } = resolveEncodingTarget({
          activeLayers,
          triggerType: state.triggerType,
          selectedTarget: state.selectedTarget,
          buildProfile: profile,
        });
        return {
          title: "פעולה",
          body: plannedAction ? `הפעולה שתכננת: ${plannedAction}.` : "האם תוכל לבצע את הפעולה שתכננת עכשיו?",
          segments: null,
        };
      }

      // From "imagery" onward, currentAction is resolved: the trainee's
      // mapped action, unless they entered a session-specific
      // alternative because the mapped one couldn't be performed right
      // now -- see arc/arcEngine.ts's EncodingResolution doc. Imagery,
      // Preparation, and the actual Action all resolve it the exact same
      // way, from the same current target's own map, so they can never
      // diverge onto different actions or mix in another target's
      // Body-Language Cue.
      const { layer, actionLabel: currentAction, encoding } = resolveEncodingTarget({
        activeLayers,
        triggerType: state.triggerType,
        selectedTarget: state.selectedTarget,
        buildProfile: profile,
        selectedAction: state.selectedAction,
      });
      const bodyLanguageCue = encoding?.bodyLanguageCue ?? null;

      if (phase === "imagery") {
        // Action Imagery: strictly of currentAction (only ever sources
        // from positive action fields -- beneficialAction/internalAction/
        // identityAction, or the trainee's own alternative -- never
        // interferingState/identityInterferingEmotion) -- never the
        // Interfering State, craving, distraction, or any other
        // difficult state. See arc/instructions.ts's
        // containsInductionPattern. Carries the SAME Body-Language Cue
        // forward from Encoding, from this target's own map only, when
        // one is configured -- never invented, never an empty
        // placeholder when there isn't one. Has its own configured
        // minimum-practice duration, separate from actionDuration (the
        // real Action Timer, which hasn't started yet -- see
        // arc/actionTimer.ts). Dwell-time task: the "Action Imagery"
        // dwell category -- ONE trailing dwell segment (arc/dwellTimes.ts),
        // sized from the CURRENT target's own configuration, appended
        // once this instruction has finished revealing.
        const imagine = currentAction
          ? `דמיין את עצמך מבצע עכשיו את ${currentAction}`
          : "דמיין את עצמך מבצע עכשיו את הפעולה שבחרת";
        const text = bodyLanguageCue ? `${imagine}, תוך שמירה על ${bodyLanguageCue}.` : `${imagine}.`;
        const dwellSeconds = resolveDwellSecondsFor("actionImageryDwellSeconds", layer, profile);
        return {
          title: "דמיון הפעולה",
          body: text,
          segments: withTrailingDwellSegment([{ text, durationSeconds: INSTRUCTION_TIMING.actionImagery }], dwellSeconds),
        };
      }

      // phase === "performing": the actual timed Action. No instruction
      // segments here -- this is governed by the separate Action Timer
      // (arc/actionTimer.ts) instead, which live/screens.tsx's
      // ActionScreen starts only once this phase is reached.
      const parts: string[] = [];
      if (bodyLanguageCue) {
        parts.push(`בזמן הפעולה, שמור על שפת הגוף שבחרת: ${bodyLanguageCue}.`);
      }
      parts.push(currentAction ? `עכשיו הזמן: ${currentAction}.` : "עכשיו הזמן לפעולה.");

      // The resolved action duration -- the alternative action's own
      // session-specific duration when one was chosen, else the
      // BUILD-level actionDuration -- named explicitly right before the
      // timed Action begins. Never invented: omitted when neither is set.
      const duration = resolveActionDuration(state.selectedActionDuration, profile);
      if (duration !== null) {
        parts.push(`משך הפעולה: ${duration} דקות.`);
      }

      return { title: "פעולה", body: parts.join(" "), segments: null };
    }

    case "success_focus":
      return { title: "התמקדות בהצלחה", body: "כמה דקות נוספות המשכת מעבר לפעולה המקורית?", segments: null };

    case "negative_action": {
      // The trainee's own predefined interfering/negative behavior
      // (profile.habit) -- never re-asked here, never a new action:
      // this is the intentionally limited, already-mapped behavior the
      // gradual-reduction program permits in controlled amounts. The
      // permitted duration itself is resolved outside this pure
      // function (see program/engine.ts's resolveNegativeActionDuration,
      // which needs the current program week -- not available to
      // getStageCopy's signature) and rendered by the screen component
      // alongside this copy, the same separation "act"'s resolved
      // action duration uses for its own timed screen.
      if (!state.negativeActionStarted) {
        return {
          title: "פעולה שלילית מוגבלת",
          body: profile.habit
            ? `הפעולה השלילית שהוגדרה מראש: ${profile.habit}. מותר לך כמות מוגבלת ומוגדרת מראש, בהתאם לשבוע הנוכחי בתוכנית.`
            : "לא הוגדרה פעולה שלילית.",
          segments: null,
        };
      }
      return {
        title: "פעולה שלילית מוגבלת",
        body: profile.habit ? `בצע את ${profile.habit} במשך הזמן המותר בלבד.` : "בצע את הפעולה המותרת בלבד, במשך הזמן שהוקצב.",
        segments: null,
      };
    }

    case "complete":
      return { title: "סיום", body: "כל הכבוד על השלמת הסשן.", segments: null };
  }
}
