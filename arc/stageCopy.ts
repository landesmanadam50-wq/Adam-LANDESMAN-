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

import { IDENTIFIED_NEED_UNKNOWN } from "./types.ts";
import type { ArcBuildProfile, ArcLiveState, ArcStage, DevelopmentLayer } from "./types.ts";
import { getEnergyColorLine } from "./presenceColor.ts";
import { getFreeBreathingLine } from "./naturalBreathing.ts";
import { getAcceptanceMantraLine, getBridgeMantraLine, getRegulationMantraLine, getStayMantraLine } from "./mantras.ts";
import { getDesiredImageryLine } from "./desiredImagery.ts";
import { getFutureOrientedMantraLine } from "./futureOrientedMantra.ts";
import {
  needsCurrentActionResolution,
  needsReactiveStateSelection,
  resolveActionDuration,
  resolveActPhase,
  resolveEncodingRegulationCue,
  resolveEncodingTarget,
  resolveObserverPauseLayer,
  resolveTargetBalancedAlternativeInterpretation,
  resolveTargetBridgeBelief,
  resolveTargetLimitingBelief,
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
import { INSTRUCTION_TIMING } from "./instructionTiming.ts";
import { resolveDwellSecondsFor, resolvePresenceDwellSeconds, withTrailingDwellSegment } from "./dwellTimes.ts";
import type { EvidenceRecord } from "./evidence.ts";
import { resolveEncodingEvidenceContext, selectEncodingEvidence } from "./evidence.ts";

export type ArcStageInputKind =
  | "triggerSelect"
  | "triggerContext"
  | "scale0to10"
  | "sensationCheck"
  | "yesno"
  | "info"
  | "successFocus"
  | "finish"
  /** ARC-BUILD-to-LIVE connection task: "interfering_thought_check"'s own three-way choice (present/absent/different), with an optional free-text entry for "different" -- distinct from "yesno" since it isn't binary. */
  | "interferingThoughtCheck"
  /** Urge-check task: "need_identification"'s own multi-preset choice (seven need labels + "אחר" custom text + "אני עדיין לא יודע") -- distinct from "yesno"/"interferingThoughtCheck" since it's neither binary nor three-way. */
  | "needIdentification";

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

/** Per-stage button wording for the "yesno" stages -- Instruction Layer content, not decision logic. */
export function getYesNoLabels(stage: ArcStage): YesNoLabels {
  switch (stage) {
    case "urge_check":
      return { yes: "כן, יש דחף", no: "לא, אין כרגע דחף" };
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

/**
 * Reactive-flow-strengthening task (#5, #6): the brief reinforcement
 * shown on the Preventive Action page -- reached only once the trainee
 * has come through trigger_context/observer_pause, so this is never
 * shown "immediately when the Reactive flow first opens" by
 * construction (it lives on preventive_action_check's own copy, a
 * stage those two always precede). Praises the trained behavior itself
 * -- noticing, pausing, entering ARCHI, creating space before the
 * automatic reaction -- never framed as eliminating/defeating/
 * controlling the feeling or urge.
 */
export function getPreventiveActionReinforcement(): string {
  return "כל הכבוד על שנכנסת ל־ARCHI ויצרת מרווח לפני התגובה.";
}

const STAGE_INPUT_KINDS: Record<ArcStage, ArcStageInputKind> = {
  trigger_selection: "triggerSelect",
  urge_check: "yesno",
  trigger_context: "triggerContext",
  observer_pause: "info",
  presence_check: "scale0to10",
  presence_grounding: "info",
  arc_thought_awareness: "info",
  arc_thought_combined_attention: "info",
  arc_thought_expand_presence: "info",
  arc_thought_presence_recheck: "scale0to10",
  preventive_action_check: "yesno",
  preventive_action: "info",
  need_identification: "needIdentification",
  sensation_check: "sensationCheck",
  stay: "info",
  interfering_thought_check: "interferingThoughtCheck",
  balanced_alternative_interpretation: "info",
  accept: "yesno",
  reactive_transition_check: "yesno",
  regulate: "info",
  desired_state_check: "scale0to10",
  encode: "info",
  act: "info",
  success_focus: "successFocus",
  gratitude_and_learning: "info",
  completed_action_imagery: "info",
  improved_action_imagery: "info",
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

    // Urge-check task: reached only for a reactive_urge (habit) session,
    // before the existing Stop/Preventive-Action sequence. Recognition
    // only -- never asks the trainee to intensify, evoke, or hold the
    // urge, only whether it's already present right now.
    case "urge_check":
      return { title: "בדיקת דחף", body: "האם יש כרגע דחף לבצע את ההרגל המפריע?", segments: null };

    case "trigger_context":
      // Reactive-flow-strengthening task (#1, #8): the session-specific
      // "what triggered this right now" recognition -- a short free-text
      // answer, deliberately distinct from, and never overwriting, the
      // BUILD-configured Challenge Context (profile.challengeContext/
      // identityChallengeContext, untouched by this stage). Optional --
      // the trainee is never forced to elaborate.
      //
      // Unified Presence/Mantra/Trigger/Imagery spec, section 6: this
      // same stage's screen (live/screens.tsx's TriggerContextScreen)
      // now also collects a second, optional field -- the current
      // interfering thought/interpretation/limiting belief/imagined
      // scenario, session-specific
      // (ArcLiveState.currentInterferingThought), never written back to
      // BUILD. Nothing about this stage's placement/routing changes --
      // still strictly before observer_pause and before ARC Thought.
      return { title: "מה קרה עכשיו?", body: "מה הפעיל אצלך עכשיו את הרגש או הדחף?", segments: null };

    case "observer_pause": {
      // Unified Presence/Mantra/Trigger/Imagery spec, sections 7-8:
      // rewritten to fork on ArcLiveState.sideObservationMode ("present"
      // vs "previous" -- set once on a new choice screen shown before
      // this stage's own content, see live/screens.tsx's
      // SideObservationModeScreen) INSTEAD OF the older
      // triggerKnown-based known/unknown fork. triggerKnown itself is
      // untouched structurally (still set by trigger_context); it's
      // simply no longer consulted for this stage's wording, since a
      // trigger can now be imagined/future/thought-only (section 6), so
      // "was a specific trigger named" is no longer the right axis for
      // "should this be observed as present or as a past situation".
      //
      // The urge-only Stop visualization (section 8) is a separate,
      // conditionally-appended THIRD segment -- shown only when
      // state.triggerType === "reactive_urge" (the actual existing
      // urge/non-urge discriminator; there is no separate
      // "protocolType" field on ArcLiveState/ArcBuildProfile). Every
      // other route (reactive_emotion, proactive) never sees a
      // stop-visualization segment at all -- no empty step, nothing to
      // save a response for, since it's pure instruction, not an input.
      //
      // Coordinated timer/dwell task (Part 20-23), preserved unchanged:
      // the trailing, per-trainee configurable Stop-Imagery dwell
      // (stopImageryDwellSeconds, arc/dwellTimes.ts), resolved from the
      // CURRENT reactive session's own layer (arc/arcEngine.ts's
      // resolveObserverPauseLayer) -- and the same underlying
      // progressive-reveal/Continue-cue mechanism -- no new screen, no
      // new timing system. The existing Preventive Action only becomes
      // available once this dwell completes, via the SAME
      // Continue-gating mechanism every other dwell-gated stage already
      // uses.
      const presentModePerspective = "זהה מה הציף אותך. כעת ראה את עצמך מהצד כפי שאתה ברגע הזה — שים לב לתנוחת הגוף, להבעת הפנים ולמה שכבר מתרחש בתוכך.";
      const previousSituationPerspective = "ראה את עצמך מהצד בסיטואציה שהציפה אותך. התבונן במה שהתרחש, בתנוחת הגוף ובהבעת הפנים, בלי לנסות לשנות את החוויה.";
      const urgeStopVisualization = "ראה את עצמך עוצר ולא מבצע כרגע את הפעולה שאליה הדחף מושך.";

      const isPreviousSituation = state.sideObservationMode === "previous";
      const perspectiveText = isPreviousSituation ? previousSituationPerspective : presentModePerspective;
      const instructionSegments: InstructionSegment[] = [
        { text: perspectiveText, durationSeconds: INSTRUCTION_TIMING.observerPerspective },
      ];
      if (state.triggerType === "reactive_urge") {
        instructionSegments.push({ text: urgeStopVisualization, durationSeconds: INSTRUCTION_TIMING.observerPause });
      }

      const observerPauseLayer = resolveObserverPauseLayer(state.triggerType, state.selectedTarget, activeLayers, profile);
      const stopImageryDwellSeconds = resolveDwellSecondsFor("stopImageryDwellSeconds", observerPauseLayer, profile);
      const segments = withTrailingDwellSegment(instructionSegments, stopImageryDwellSeconds);

      return {
        title: "מרחק ועצירה",
        body: segments
          .map((segment) => segment.text)
          .filter((text) => text.length > 0)
          .join(" "),
        segments,
      };
    }

    case "presence_check": {
      const question = "עד כמה אתה נוכח כרגע, בסולם 1 עד 10?";
      const preamble = getRecognitionPreamble(profile, state);
      return { title: "בדיקת נוכחות", body: preamble ? `${preamble} ${question}` : question, segments: null };
    }

    // Unified Presence/Mantra/Trigger/Imagery spec, section 4: the
    // short, untimed grounding line shown ONLY on the 7-10 route --
    // see arc/arcEngine.ts's "presence_check" transition. No segments
    // (no timer, no dwell) -- "do not run Presence timers ... on the
    // 7-10 route".
    case "presence_grounding":
      return { title: "נוכחות", body: "שים לב לנשימה שמתרחשת מעצמה ואמור: אני כאן ועכשיו.", segments: null };

    case "arc_thought_awareness": {
      // Unified Presence/Mantra/Trigger/Imagery spec, section 1: the
      // free natural-breathing line is added to every Presence
      // sub-stage, appended after the existing instruction. Presence
      // stage 1 deliberately never gets the Energy Color line (section
      // 2) -- that starts at stage 2.
      const instruction = getAwarenessInstruction();
      const breathing = getFreeBreathingLine();
      const text = `${instruction} ${breathing}`;
      return {
        title: "מודעות",
        body: text,
        segments: [
          { text: instruction, durationSeconds: INSTRUCTION_TIMING.arcThoughtAwareness },
          { text: breathing, durationSeconds: INSTRUCTION_TIMING.freeBreathing },
        ],
      };
    }

    case "arc_thought_combined_attention": {
      // Deliberately does not name interferingState/supportiveState: holding
      // two named states in awareness simultaneously is an induction-style
      // pattern (see arc/instructions.ts's containsInductionPattern), not
      // present-moment awareness. getCombinedAttentionInstruction() takes
      // no state parameters for exactly this reason.
      //
      // Unified Presence/Mantra/Trigger/Imagery spec, sections 1-2: the
      // Energy Color line now begins here (Presence stage 2) -- shown
      // FIRST, before the existing instruction -- plus the free
      // natural-breathing line, appended after it.
      const instruction = getCombinedAttentionInstruction();
      const breathing = getFreeBreathingLine();
      const energyColorLine = getEnergyColorLine(profile.presenceColor);
      const leading = energyColorLine ? `${energyColorLine} ` : "";
      const text = `${leading}${instruction} ${breathing}`;
      const segments: InstructionSegment[] = [];
      if (energyColorLine) segments.push({ text: energyColorLine, durationSeconds: INSTRUCTION_TIMING.energyColor });
      segments.push({ text: instruction, durationSeconds: INSTRUCTION_TIMING.arcThoughtCombinedAttention });
      segments.push({ text: breathing, durationSeconds: INSTRUCTION_TIMING.freeBreathing });
      return { title: "תשומת לב משולבת", body: text, segments };
    }

    case "arc_thought_expand_presence": {
      // Timing-update task: the Presence Rating that used to live on
      // arc_thought_presence_recheck's own separate page is now shown
      // inline on THIS page instead (see live/screens.tsx's
      // PresenceExperienceScreen) once this instruction's own timing
      // PLUS a trailing dwell have both elapsed -- modeled as one
      // trailing, empty-text segment so getInstructionTimingStatus's
      // existing `complete` flag stays the single source of truth for
      // "reveal the rating now".
      // Coordinated timer/dwell task (Part 16-19): the old flat,
      // fixed 15s placeholder here is replaced by the per-trainee
      // configurable Presence dwell (presenceDwellSeconds,
      // arc/dwellTimes.ts's resolvePresenceDwellSeconds) -- this is the
      // one hard-coded Presence dwell the task's own #19 asked to
      // replace; the instruction's OWN duration
      // (INSTRUCTION_TIMING.arcThoughtExpandPresence, including its
      // separate, unrelated +15s instruction-pacing increase) is left
      // completely untouched, never counted as dwell time.
      //
      // Unified Presence/Mantra/Trigger/Imagery spec, sections 1-3:
      // Presence stage 3's own order is now Energy Color -> free
      // breathing -> existing instruction -- the object-grounding
      // sub-step (section 3) is deliberately NOT built here: it's
      // session-only, local UI state (never ArcLiveState/ArcBuildProfile),
      // rendered as a small sub-phase gate in live/LiveSessionScreen.tsx
      // / live/ArcGoalSessionScreen.tsx wrapping this same stage, before
      // this copy's own PresenceExperienceScreen renders.
      const instruction = getExpandPresenceInstruction();
      const breathing = getFreeBreathingLine();
      const energyColorLine = getEnergyColorLine(profile.presenceColor);
      const leading = energyColorLine ? `${energyColorLine} ` : "";
      const text = `${leading}${instruction} ${breathing}`;
      const instructionSegments: InstructionSegment[] = [];
      if (energyColorLine) instructionSegments.push({ text: energyColorLine, durationSeconds: INSTRUCTION_TIMING.energyColor });
      instructionSegments.push({ text: instruction, durationSeconds: INSTRUCTION_TIMING.arcThoughtExpandPresence });
      instructionSegments.push({ text: breathing, durationSeconds: INSTRUCTION_TIMING.freeBreathing });
      const presenceDwellSeconds = resolvePresenceDwellSeconds(profile, activeLayers);
      const segments = withTrailingDwellSegment(instructionSegments, presenceDwellSeconds);
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

    // Urge-check task: "מה אתה באמת צריך עכשיו?" -- the need belongs to
    // the PERSON, never described as "the habit's need"; the habit is
    // only an attempted way of meeting it. Never forces an answer -- see
    // live/screens.tsx's NeedIdentificationScreen for the preset/custom/
    // "אני עדיין לא יודע" choices themselves.
    case "need_identification":
      return {
        title: "זיהוי הצורך שמאחורי הדחף",
        body: "מה אתה באמת צריך עכשיו? ההרגל הוא דרך שניסתה לענות על צורך. שים לב לצורך שנמצא מאחורי הדחף, בלי לשפוט אותו.",
        segments: null,
      };

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
      const instructionSegments: InstructionSegment[] = [];
      // Unified Presence/Mantra/Trigger/Imagery spec, section 2: Energy
      // Color now leads this stage's content (prepended), instead of
      // being appended to the last segment as before.
      const energyColorLine = getEnergyColorLine(profile.presenceColor);
      if (energyColorLine) instructionSegments.push({ text: energyColorLine, durationSeconds: INSTRUCTION_TIMING.energyColor });
      instructionSegments.push(
        { text: "הישאר עם התחושה כפי שהיא עכשיו, בלי לנסות לשנות אותה.", durationSeconds: INSTRUCTION_TIMING.stayCurrentSensation },
        { text: "שים לב גם לנשימה כפי שהיא מתרחשת מעצמה.", durationSeconds: INSTRUCTION_TIMING.stayNaturalBreath }
      );
      // Unified Presence/Mantra/Trigger/Imagery spec, section 1: the new
      // free-breathing line -- distinct from, and in addition to, the
      // existing natural-breath awareness line just above (neither
      // replaces the other).
      instructionSegments.push({ text: getFreeBreathingLine(), durationSeconds: INSTRUCTION_TIMING.freeBreathing });
      const segments = withTrailingDwellSegment(instructionSegments, dwellSeconds);
      // Unified Presence/Mantra/Trigger/Imagery spec, section 5: Stay
      // Mantra, appended at the very end of Stay -- after the trailing
      // dwell -- only when configured; skipped cleanly (no entry
      // pushed) when empty.
      const stayMantraLine = getStayMantraLine(profile);
      if (stayMantraLine) segments.push({ text: stayMantraLine, durationSeconds: INSTRUCTION_TIMING.mantra });
      return {
        title: "הישאר עם זה",
        body: segments
          .map((segment) => segment.text)
          .filter((text) => text.length > 0)
          .join(" "),
        segments,
      };
    }

    // ARC-BUILD-to-LIVE connection task: Awareness of the interfering
    // thought (Limiting Belief), recognition-only -- reached only when
    // the resolved target has one configured (see arc/arcEngine.ts's
    // resolveBeforeStay, consulted before "stay" itself is ever reached,
    // so this case's own body is never generic/empty in practice). Never
    // an instruction to imagine, evoke, strengthen, or remain inside the
    // thought -- it only asks whether it's already present.
    case "interfering_thought_check": {
      const { layer } = resolveEncodingTarget({
        activeLayers,
        triggerType: state.triggerType,
        selectedTarget: state.selectedTarget,
        buildProfile: profile,
      });
      const limitingBelief = resolveTargetLimitingBelief(layer, profile) ?? "";
      return {
        title: "שים לב למחשבה",
        body: `האם המחשבה הבאה נמצאת כאן עכשיו? "${limitingBelief}" אין צורך לעורר את המחשבה, להסכים איתה או לשנות אותה. רק לשים לב אם היא כבר נוכחת.`,
        segments: null,
      };
    }

    // Balanced Alternative Interpretation task: the third Awareness
    // step -- Identify Thought -> Identify Belief -> Balanced
    // Alternative Interpretation -> Stay -- reached only when the
    // resolved target has one configured (see arc/arcEngine.ts's
    // resolveBeforeStay). Offers another way to understand the
    // situation ALONGSIDE the original thought, never a demand to
    // suppress, erase, reject, or forcibly replace it, and never a
    // requirement to believe it immediately.
    case "balanced_alternative_interpretation": {
      const { layer } = resolveEncodingTarget({
        activeLayers,
        triggerType: state.triggerType,
        selectedTarget: state.selectedTarget,
        buildProfile: profile,
      });
      const alternative = resolveTargetBalancedAlternativeInterpretation(layer, profile) ?? "";
      return {
        title: "פרשנות חלופית ומאוזנת",
        body: `שים לב למחשבה כפי שהיא. היא עדיין יכולה להיות כאן. כעת אפשר להוסיף גם דרך אחרת ומאוזנת להבין את המצב: "${alternative}"`,
        segments: null,
      };
    }

    case "accept": {
      // Unified Presence/Mantra/Trigger/Imagery spec, sections 1-2:
      // Energy Color now leads (prepended) instead of being appended to
      // the question, and the new free-breathing line is appended after
      // it -- Accept's own base question/timing has no `segments` of its
      // own (the actual dwell-bearing segments live in
      // live/screens.tsx's AcceptRatingReveal/AcceptanceUnwillingnessRound
      // -- untouched here), so both new lines are folded into `body`.
      // Acceptance Mantra (section 5) is NOT added here -- it belongs at
      // the very end of Acceptance, once AcceptRatingReveal's own dwell
      // completes, so it's threaded through live/screens.tsx instead
      // (see acceptanceMantraLine prop).
      const energyColorLine = getEnergyColorLine(profile.presenceColor);
      const question = "האם אתה מוכן לקבל את התחושה הזו כמו שהיא, בלי להילחם בה?";
      const parts = [energyColorLine, question, getFreeBreathingLine()].filter((part): part is string => part !== null);
      return { title: "קבלה", body: parts.join(" "), segments: null };
    }

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
      // dedicated dwell category (regulationDwellSeconds), independent
      // of Presence's own separate configurable dwell
      // (presenceDwellSeconds) used only by arc_thought_expand_presence
      // above.
      const { layer } = resolveEncodingTarget({
        activeLayers,
        triggerType: state.triggerType,
        selectedTarget: state.selectedTarget,
        buildProfile: profile,
      });
      const dwellSeconds = resolveDwellSecondsFor("regulationDwellSeconds", layer, profile);
      const baseRegulateText = profile.regulationTool
        ? `שים לב לתחושה שלך עכשיו. השתמש בכלי הוויסות שלך: ${profile.regulationTool}.`
        : "שים לב לתחושה שלך עכשיו.";
      // Unified Presence/Mantra/Trigger/Imagery spec, section 2: Energy
      // Color now leads (prepended) instead of the old appended
      // per-section reminder.
      const energyColorLine = getEnergyColorLine(profile.presenceColor);
      const text = energyColorLine ? `${energyColorLine} ${baseRegulateText}` : baseRegulateText;
      // ARC-BUILD-to-LIVE connection task: the Future-Oriented Mantra
      // moved to Encoding (see arc/futureOrientedMantra.ts's own doc) --
      // no longer read here.
      const instructionSegments: InstructionSegment[] = [];
      if (energyColorLine) instructionSegments.push({ text: energyColorLine, durationSeconds: INSTRUCTION_TIMING.energyColor });
      instructionSegments.push({ text: baseRegulateText, durationSeconds: INSTRUCTION_TIMING.regulate });
      const segments = withTrailingDwellSegment(instructionSegments, dwellSeconds);
      // Unified Presence/Mantra/Trigger/Imagery spec, section 5:
      // Regulation Mantra, then the brand-new Bridge Mantra -- both
      // appended at the very end of Regulation, after the trailing
      // dwell, in that order. Bridge Mantra deliberately belongs HERE,
      // as part of "regulate"'s own copy, never "encode"'s -- this is
      // the one structural guarantee it can never appear twice or drift
      // into Encoding. Either/both skipped cleanly when unset.
      const regulationMantraLine = getRegulationMantraLine(profile);
      if (regulationMantraLine) segments.push({ text: regulationMantraLine, durationSeconds: INSTRUCTION_TIMING.mantra });
      const bridgeMantraLine = getBridgeMantraLine(profile);
      if (bridgeMantraLine) segments.push({ text: bridgeMantraLine, durationSeconds: INSTRUCTION_TIMING.mantra });
      return {
        title: "ויסות",
        body: segments
          .map((segment) => segment.text)
          .filter((t) => t.length > 0)
          .join(" "),
        segments,
      };
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

      // Final Encoding order (evidence-encoding task, corrected): (1)
      // notice the updated sensation -- neutrally, no assumption it
      // improved, a large change/small change/no obvious change are all
      // valid -- then (2) the Short Encoding Regulation Cue, this
      // target's own lightweight continuity anchor -- deliberately NOT
      // the full Regulation process/instructions used at the "regulate"
      // stage, just one short carry-over, to avoid overloading attention
      // here -- then (3) the Body-Language Encoding Cue, the embodiment
      // anchor -- then (4) a relevant real personal-evidence/Gratitude
      // line, when one was selected (arc/evidence.ts), immediately
      // followed by (5) that SAME record's own concrete memory detail,
      // when it has one -- then (6) Identity/Mantra, grounded in
      // whatever embodiment/evidence just preceded it. Body-Language
      // deliberately comes BEFORE evidence/Identity here (the corrected
      // sub-order: embodiment -> real personal evidence -> concrete
      // supporting detail -> identity statement); evidence/memory-detail
      // sit strictly between Body-Language and Identity/Mantra, never
      // before Body-Language, never after Identity/Mantra. Action
      // Imagery is deliberately NOT here -- it lives in the "act" stage
      // instead, where the currentAction it imagines is actually
      // resolved (see that case's doc). Each piece is its own timed
      // segment (arc/instructionTiming.ts) so this order reveals
      // progressively rather than all at once.
      // Unified Presence/Mantra/Trigger/Imagery spec, section 2: Energy
      // Color now leads (prepended as this stage's own first segment)
      // instead of the old three separate appended reminders
      // ("updatedSensation"/"identity"/"encoding").
      const segments: InstructionSegment[] = [];
      const energyColorLine = getEnergyColorLine(profile.presenceColor);
      if (energyColorLine) segments.push({ text: energyColorLine, durationSeconds: INSTRUCTION_TIMING.energyColor });
      segments.push({ text: "שים לב לתחושה שלך עכשיו ולכל שינוי שקרה, אם קרה.", durationSeconds: INSTRUCTION_TIMING.encodeUpdatedSensation });
      let hasContinuityContent = false;

      const regulationCue = resolveEncodingRegulationCue(layer, profile);
      if (regulationCue) {
        segments.push({ text: `המשך עם ${regulationCue}.`, durationSeconds: INSTRUCTION_TIMING.encodeShortRegulationCue });
        hasContinuityContent = true;
      }

      // Unified Presence/Mantra/Trigger/Imagery spec, section 9: optional
      // desired-state/identity imagery -- inserted right here, after
      // Updated Sensation + the Short Encoding Regulation Cue (both
      // preserved in their existing relative order/position) and BEFORE
      // the Body-Language Cue below, matching the spec's own unified
      // transition order exactly. Begins only at Encoding, never
      // earlier. Kept separate from Energy Color/side observation/
      // Action Imagery (arc/successfulPerformance.ts, untouched).
      const desiredImageryLine = getDesiredImageryLine(profile, layer, profile.supportiveState, profile.desiredIdentity);
      if (desiredImageryLine) {
        segments.push({ text: desiredImageryLine, durationSeconds: INSTRUCTION_TIMING.desiredImagery });
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

      // Evidence-encoding task (corrected order): a real past
      // behavioral success or a relevant protocol-linked Gratitude
      // entry, selected from the trainee's OWN existing history
      // (arc/evidence.ts) -- never invented, never shown when nothing
      // sufficiently relevant exists (#17). Comes strictly AFTER
      // Body-Language and BEFORE Identity/Mantra. This never counts
      // toward hasContinuityContent: that flag tracks whether any
      // BUILD-configured Encoding cue exists, a separate question from
      // whether session HISTORY happens to contain relevant evidence.
      const evidenceContext = resolveEncodingEvidenceContext(layer, encoding, profile);
      const selectedEvidence = selectEncodingEvidence(evidenceIndex, evidenceContext);
      for (const item of selectedEvidence) {
        segments.push({ text: getEvidenceLine(item), durationSeconds: INSTRUCTION_TIMING.encodeEvidence });
        if (item.memoryDetail) {
          // #9/#13: the SAME record's own concrete memory detail,
          // immediately after its evidence line and before Identity/
          // Mantra -- never a different record's detail, never invented
          // when absent.
          segments.push({ text: item.memoryDetail, durationSeconds: INSTRUCTION_TIMING.encodeMemoryDetail });
        }
      }

      // ARC-BUILD-to-LIVE connection task: the empowering interpretation
      // (Bridge Belief) -- "עכשיו, מתוך נוכחות, התחבר לפרשנות שבחרת" --
      // never during Awareness/Acceptance, only here, after Body-Language/
      // evidence and before the Identity/Mantra segment below. Presented
      // as the interpretation the trainee chose to practise, never as an
      // objective fact to force themselves to believe.
      const bridgeBelief = resolveTargetBridgeBelief(layer, profile);
      if (bridgeBelief) {
        segments.push({
          text: `עכשיו, מתוך נוכחות, התחבר לפרשנות שבחרת: "${bridgeBelief}".`,
          durationSeconds: INSTRUCTION_TIMING.encodeBridgeBelief,
        });
        hasContinuityContent = true;
      }

      // ARC-BUILD-to-LIVE connection task: the Value -- "the why behind
      // the identity and action" -- build-global (not per-layer), kept
      // completely separate from the empowering interpretation, identity,
      // and mantra text above/below.
      if (profile.value) {
        segments.push({ text: `הערך שמאחורי הזהות והפעולה שלך: ${profile.value}.`, durationSeconds: INSTRUCTION_TIMING.encodeValue });
        hasContinuityContent = true;
      }

      if (encoding?.mantra) {
        segments.push({ text: `חזור לעצמך: "${encoding.mantra}".`, durationSeconds: INSTRUCTION_TIMING.encodeIdentityMantra });
        hasContinuityContent = true;
      }

      // ARC-BUILD-to-LIVE connection task: the Future Mantra -- moved
      // here from "regulate" (see arc/futureOrientedMantra.ts's own doc)
      // -- shown in this existing mantra/identity part of Encoding,
      // after the empowering interpretation, Value, and Identity Mantra.
      // Preserved as its own field/segment, never merged into the
      // Identity Mantra text above.
      const futureOrientedMantraLine = getFutureOrientedMantraLine(profile, layer);
      if (futureOrientedMantraLine) {
        segments.push({ text: futureOrientedMantraLine, durationSeconds: INSTRUCTION_TIMING.encodeFutureMantra });
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
      // between imagery and performing is removed. Action Body Cue
      // task: the "carry a physical cue into the real action" role that
      // sub-phase used to serve is now its own dedicated concept,
      // resolved independently of Encoding (EncodingResolution.
      // actionBodyCue, further down) and shown directly on Action
      // Imagery (when enabled) and the real Action screen below --
      // never on a separate transition screen, and never Encoding's own
      // Body-Language Cue (see the "encode" case above, unchanged).
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
        const actionLine = plannedAction ? `הפעולה שתכננת: ${plannedAction}.` : "האם תוכל לבצע את הפעולה שתכננת עכשיו?";
        // Urge-check task: an identified need, when one was genuinely
        // selected (never the "אני עדיין לא יודע" sentinel), is
        // mentioned here alongside the planned action -- never
        // substituted for it, never changing which action is shown.
        const needLine =
          state.identifiedNeed !== null && state.identifiedNeed !== IDENTIFIED_NEED_UNKNOWN
            ? ` הצורך שזיהית קודם: ${state.identifiedNeed}.`
            : "";
        return {
          title: "פעולה",
          body: `${actionLine}${needLine}`,
          segments: null,
        };
      }

      // From "imagery" onward, currentAction is resolved: the trainee's
      // mapped action, unless they entered a session-specific
      // alternative because the mapped one couldn't be performed right
      // now -- see arc/arcEngine.ts's EncodingResolution doc. Imagery
      // and the actual Action both resolve it (and actionBodyCue) the
      // exact same way, from the same current target's own map, so they
      // can never diverge onto different actions or mix in another
      // target's Action Body Cue.
      const { layer, actionLabel: currentAction, actionBodyCue } = resolveEncodingTarget({
        activeLayers,
        triggerType: state.triggerType,
        selectedTarget: state.selectedTarget,
        buildProfile: profile,
        selectedAction: state.selectedAction,
      });

      if (phase === "imagery") {
        // Action Imagery: strictly of currentAction (only ever sources
        // from positive action fields -- beneficialAction/internalAction/
        // identityAction, or the trainee's own alternative -- never
        // interferingState/identityInterferingEmotion) -- never the
        // Interfering State, craving, distraction, or any other
        // difficult state. See arc/instructions.ts's
        // containsInductionPattern. Naturally includes this target's
        // Action Body Cue (never Encoding's own Body-Language Cue --
        // see EncodingResolution.actionBodyCue's doc) when one is
        // configured -- never invented, never an empty placeholder when
        // there isn't one, and Action Imagery is never required for it
        // to work (see the "act" case's performing phase below, which
        // shows it independently). "מתחיל" + the action text as typed,
        // never "מבצע את X" -- most actions are phrased as infinitives
        // ("ללמוד", "ללכת לפארק"), and "מבצע את ללמוד" reads as broken
        // Hebrew. Has its own configured minimum-practice duration,
        // separate from actionDuration (the real Action Timer, which
        // hasn't started yet -- see arc/actionTimer.ts). Dwell-time
        // task: the "Action Imagery" dwell category -- ONE trailing
        // dwell segment (arc/dwellTimes.ts), sized from the CURRENT
        // target's own configuration, appended once this instruction
        // has finished revealing.
        const imagine = currentAction ? `דמיין את עצמך מתחיל ${currentAction}` : "דמיין את עצמך מתחיל בפעולה שבחרת";
        const baseImageryText = actionBodyCue ? `${imagine} תוך שמירה על ${actionBodyCue}.` : `${imagine}.`;
        // Unified Presence/Mantra/Trigger/Imagery spec, section 2:
        // Energy Color now leads (prepended) instead of being appended.
        const energyColorLine = getEnergyColorLine(profile.presenceColor);
        const text = energyColorLine ? `${energyColorLine} ${baseImageryText}` : baseImageryText;
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
      // ActionScreen starts only once this phase is reached. copy.body
      // (built below) is rendered by that screen's own Title component
      // unconditionally, for as long as ActionScreen stays mounted --
      // so this Action Body Cue line stays visible for the whole time
      // the Action Timer is running, never hidden or replaced once it
      // starts (Action Body Cue's whole purpose: help the trainee
      // remember and maintain the cue DURING the real behavior).
      const parts: string[] = [];
      // Unified Presence/Mantra/Trigger/Imagery spec, section 2: Energy
      // Color now leads (prepended as the first part) instead of being
      // appended at the end.
      const energyColorLine = getEnergyColorLine(profile.presenceColor);
      if (energyColorLine) parts.push(energyColorLine);
      parts.push(currentAction ? `עכשיו הזמן: ${currentAction}.` : "עכשיו הזמן לפעולה.");
      if (actionBodyCue) {
        parts.push(`שמור על ${actionBodyCue} בזמן הפעולה.`);
      }

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
      // Coordinated timer/dwell task (Part 2-3): Success Focus is now
      // the natural, RETROSPECTIVE continuation of the Beneficial
      // Action -- the trainee is never forced to touch ARCHI the moment
      // the Beneficial Action Timer ends; whenever they DO return
      // (tapping "עשיתי את זה"), this is the first thing they see. Exact
      // spec title/question (never "עכשיו"/"מאוחר יותר" here -- see
      // live/screens.tsx's SuccessFocusRetrospectiveScreen/
      // FutureSuccessFocusAskScreen for the rest of this sub-flow).
      return { title: "מיקוד הצלחה", body: "כמה זמן המשכת בפעולה המיטיבה מעבר לזמן שתכננת?", segments: null };

    // Post-action reflection/imagery task: these three stages are all
    // rendered by their own fully custom, dwell-gated components
    // (live/screens.tsx's GratitudeAndLearningScreen/
    // CompletedActionImageryScreen/ImprovedActionImageryScreen) --
    // this copy is used only for the LIVE screen's own header title
    // (ArcLiveRenderer's `ARCHI LIVE — ${copy.title}`), never for body
    // text (each screen writes its own exact spec wording directly).
    case "gratitude_and_learning":
      return { title: "הוקרת תודה ולמידה", body: "", segments: null };
    case "completed_action_imagery":
      return { title: "דמיון הפעולה שקרתה", body: "", segments: null };
    case "improved_action_imagery":
      return { title: "דמיון הפעולה המשופרת", body: "", segments: null };

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

    case "complete": {
      // Unified Presence/Mantra/Trigger/Imagery spec, section 2: Energy
      // Color now leads (prepended) instead of being appended.
      const energyColorLine = getEnergyColorLine(profile.presenceColor);
      const closing = "כל הכבוד על השלמת הסשן.";
      const body = energyColorLine ? `${energyColorLine} ${closing}` : closing;
      return { title: "סיום", body, segments: null };
    }
  }
}
