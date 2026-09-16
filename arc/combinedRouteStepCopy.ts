/**
 * arc/combinedRouteStepCopy.ts
 *
 * Adaptive ARC architecture task, Phase 14B: the pure Hebrew content
 * resolver for every per-item/per-category CombinedRouteStepKind
 * (arc/combinedRoute.ts, unmodified) plus the new shared Stay/
 * Acceptance/Regulation/beneficial-action content this phase's own
 * combined LIVE sequence needs. Nothing here decides ORDER -- that is
 * arc/combinedLiveSequence.ts's own job; this module only ever answers
 * "what does step X say," given the already-resolved item(s) and
 * StateProfile.
 *
 * Recognition content (getRecognitionStepCopy) is deliberately
 * "notice what is already present" framing for every one of the four
 * categories, never an invitation to evoke/intensify/imagine anything
 * that is not already there -- verified by this module's own test
 * against arc/instructions.ts's containsInductionPattern (unmodified).
 * The raw context text reuses arc/arcStateComposer.ts's own exported
 * resolveArcStateEncodingContentFromLibrary (Phase 4, unmodified) --
 * specifically its recognitionContext output, which is already
 * category-agnostic and never touches regulationCue/preventiveStoppingAction/
 * encoding fields for any category -- never re-derived here.
 *
 * Category-specific processing content (getCategoryProcessingStepCopy)
 * deliberately reads ONLY the item's own field, with NO fallback to
 * StateProfile.regulationAnchor -- unlike the legacy single-item
 * composer's own Mini/item/State fallback chain. shared_regulation
 * (getSharedStageCopy) is the one place StateProfile.regulationAnchor is
 * ever shown; falling back to it here as well would silently repeat the
 * same line a second time whenever an item's own field happens to be
 * blank, which this module never does (see this file's own tests).
 */

import type { InterferenceItem } from "./interferenceItem.ts";
import { resolveArcStateEncodingContentFromLibrary } from "./arcStateComposer.ts";
import type { StateProfile } from "./stateProfile.ts";

function safeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

// ---------------------------------------------------------------------------
// Recognition -- thought_recognition / belief_recognition / emotion_recognition / urge_recognition
// ---------------------------------------------------------------------------

export interface RecognitionStepCopy {
  framing: string;
  context: string | null;
}

const RECOGNITION_FRAMING: Record<"thought" | "belief" | "emotion" | "urge", string> = {
  thought: "שים לב למחשבה שעולה עכשיו.",
  belief: "שים לב לאמונה המפריעה שמתעוררת עכשיו.",
  emotion: "שים לב לרגש או לתחושה שנוכחים כרגע.",
  urge: "שים לב לדחף שמופיע כרגע.",
};

/** `state` is passed only because resolveArcStateEncodingContentFromLibrary requires it -- its own fields are never read for recognition content, only `item`'s own recognitionContext (see this module's own header doc). */
export function getRecognitionStepCopy(category: "thought" | "belief" | "emotion" | "urge", item: InterferenceItem, state: StateProfile): RecognitionStepCopy {
  const content = resolveArcStateEncodingContentFromLibrary(state, item, null);
  return { framing: RECOGNITION_FRAMING[category], context: content.recognitionContext };
}

// ---------------------------------------------------------------------------
// Category-specific processing -- emotion_support / urge_support /
// belief_alternative / thought_alternative / thought_future_insight.
// Item-only, no fallback to StateProfile (see this module's own header doc).
// ---------------------------------------------------------------------------

export interface ProcessingStepCopy {
  /** null when the item has no content of its own for this step -- the caller shows a short neutral continuation, never a repeat of shared_regulation's own line. */
  text: string | null;
}

export function getEmotionSupportStepCopy(item: InterferenceItem): ProcessingStepCopy {
  if (item.category !== "emotion") return { text: null };
  const text = safeText(item.regulationCue);
  return { text: text.length > 0 ? text : null };
}

export function getUrgeSupportStepCopy(item: InterferenceItem): ProcessingStepCopy {
  if (item.category !== "urge") return { text: null };
  const anchor = safeText(item.regulationAnchor);
  const encoding = item.representationPreference === "sensory" ? safeText(item.sensoryEncodingConfig) || safeText(item.visualEncodingConfig) : safeText(item.visualEncodingConfig) || safeText(item.sensoryEncodingConfig);
  const parts = [anchor, encoding].filter((part) => part.length > 0);
  return { text: parts.length > 0 ? parts.join(" ") : null };
}

export function getBeliefAlternativeStepCopy(item: InterferenceItem): ProcessingStepCopy {
  if (item.category !== "belief") return { text: null };
  const text = safeText(item.supportiveBelief);
  return { text: text.length > 0 ? text : null };
}

export function getThoughtAlternativeStepCopy(item: InterferenceItem): ProcessingStepCopy {
  if (item.category !== "thought") return { text: null };
  const text = safeText(item.alternativeInterpretation);
  return { text: text.length > 0 ? text : null };
}

export const THOUGHT_FUTURE_INSIGHT_FIXED_LINE = "דמיין את עצמך ממשיך הלאה, כשהמחשבה הזו כבר אינה תופסת מקום מרכזי.";

export function getThoughtFutureInsightStepCopy(): ProcessingStepCopy {
  return { text: THOUGHT_FUTURE_INSIGHT_FIXED_LINE };
}

export const NEUTRAL_PROCESSING_CONTINUATION_LINE = "אפשר להמשיך הלאה.";

// ---------------------------------------------------------------------------
// Shared Stay / Acceptance / Regulation -- fixed, generic, never per-item.
// StateProfile has no stayMantra/acceptanceMantra/regulationMantra fields
// of its own (unlike arc/mantras.ts's MantraProfile, which does not apply
// here) -- Regulation is the one place state.regulationAnchor is shown.
// ---------------------------------------------------------------------------

export type SharedStageKind = "shared_stay" | "shared_acceptance" | "shared_regulation";

export interface SharedStageCopy {
  title: string;
  body: string;
  /** Only ever populated for shared_regulation, from state.regulationAnchor. */
  anchor: string | null;
}

export function getSharedStageCopy(kind: SharedStageKind, state: StateProfile): SharedStageCopy {
  switch (kind) {
    case "shared_stay":
      return { title: "שהייה", body: "אפשר להישאר לרגע עם מה שנוכח, בלי למהר להיפטר ממנו.", anchor: null };
    case "shared_acceptance":
      return { title: "קבלה", body: "מותר למה שנוכח כרגע להיות כאן, בלי התנגדות מיידית.", anchor: null };
    case "shared_regulation": {
      const anchor = safeText(state.regulationAnchor);
      return { title: "ויסות", body: "תן לגוף להתייצב בקצב שלו.", anchor: anchor.length > 0 ? anchor : null };
    }
  }
}

// ---------------------------------------------------------------------------
// Cognitive reassessment -- exact required Hebrew wording, chosen by
// whether Thought and/or Belief was actually practiced this session.
// ---------------------------------------------------------------------------

export type CognitiveReassessmentVariant = "thought_only" | "belief_present";

export interface CognitiveReassessmentCopy {
  question: string;
  notStuckLabel: string;
  stillStuckLabel: string;
}

export function resolveCognitiveReassessmentVariant(hasThought: boolean, hasBelief: boolean): CognitiveReassessmentVariant {
  return hasBelief ? "belief_present" : "thought_only";
}

export function getCognitiveReassessmentCopy(variant: CognitiveReassessmentVariant): CognitiveReassessmentCopy {
  if (variant === "thought_only") {
    return { question: "האם המחשבה עדיין מושכת את תשומת הלב שלך?", notStuckLabel: "לא, אפשר להמשיך", stillStuckLabel: "כן, אני עדיין תקוע במחשבה" };
  }
  return { question: "האם המחשבה או האמונה עדיין מושכות את תשומת הלב שלך?", notStuckLabel: "לא, אפשר להמשיך", stillStuckLabel: "כן, אני עדיין תקוע בזה" };
}

// ---------------------------------------------------------------------------
// Beneficial State action
// ---------------------------------------------------------------------------

export interface BeneficialActionCopy {
  title: string;
  body: string;
  durationMinutes: number | null;
}

export function getBeneficialActionCopy(state: StateProfile): BeneficialActionCopy {
  const action = safeText(state.action);
  return {
    title: "פעולה מיטיבה",
    body: action.length > 0 ? action : "הפעולה המיטיבה שהגדרת עבור המצב הזה.",
    durationMinutes: state.actionTimerConfig?.durationMinutes ?? null,
  };
}
