/**
 * arc/futureArcLink.ts
 *
 * ARC completion/Link simplification task: "Short Future ARC Link"
 * ("קישור ARC עתידי מקוצר") -- the ONE remaining Link concept, replacing
 * the old Regular ARC Link / ARCHI ARC Link / Mini ARC Link / Mini
 * ARCHI Link / Full Link rehearsal / short-full-fast mode chooser
 * family (arc/arcLink.ts, arc/miniArcLink.ts, arc/bridgingArcLink.ts --
 * all kept, unremoved, for backward-compatible loading of old saved
 * records only; never reachable from any new-creation UI any more).
 *
 * A short memory-and-imagery rehearsal, never a repeat of the full
 * guided protocol: past memory cue -> brief replay -> improvement
 * reminder -> improved imagery -> future trigger -> a brief arrow
 * sequence (4-7 cues, always ending in the real action + its result).
 * Reused in two places:
 *   - Integrated automatically at the end of the Full ARC completion
 *     flow (the new "future_link" ArcStage, arc/arcEngine.ts/
 *     arc/types.ts/live/screens.tsx) -- only the trigger-activation +
 *     cue-arrow-sequence portion, since Gratitude/memory/replay/
 *     improvement already exist as the engine's own preceding stages.
 *   - live/FutureArcLinkScreen.tsx's own standalone practice (route
 *     /future-arc-link/[id]), which runs the FULL sequence including
 *     Gratitude/memory/replay/improvement, without ever running a real
 *     Full ARC or Mini ARC session first.
 *
 * Every resolver here is pure and total: reads directly from the SAME
 * ArcBuildProfile fields the rest of the app already uses (via
 * arc/arcLinkContent.ts's shared resolvers -- never a second,
 * duplicated content model), and never invents content a trainee never
 * configured -- a missing action means resolveFutureArcLinkContent
 * returns null (the caller's own safe-setup-route signal), and every
 * other missing field simply falls back to a short, generic cue label
 * rather than an empty line.
 */

import { resolveActionLabel, resolveEncodingBodyLanguage, resolveIdentityLabel } from "./arcLinkContent.ts";
import type { ArcLinkContentTarget } from "./arcLinkContent.ts";
import type { ArcBuildProfile } from "./types.ts";
import type { ArcLink, RoutineTrigger } from "./routineLinks.ts";

export type FutureArcLinkTarget = ArcLinkContentTarget;

function safe(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export const FUTURE_ARC_LINK_TITLE = "קישור ARC עתידי מקוצר";
export const FUTURE_ARC_LINK_PRACTICE_BUTTON_LABEL = "תרגול קישור עתידי מקוצר";

export const FUTURE_ARC_LINK_GRATITUDE_PAST_PROMPT = "על מה אתה מוקיר תודה מתוך המאמץ או ההצלחה הקודמת, גם אם היא לא הייתה מושלמת?";
export const FUTURE_ARC_LINK_MEMORY_CUE_PROMPT = "איזה רגע קטן מהתרגול הקודם יכול להזכיר לך שכבר התחלת או הצלחת?";
export const FUTURE_ARC_LINK_PARTIAL_SUCCESS_PROMPT = "מה כן הצלחת לעשות, אפילו לרגע?";
export const FUTURE_ARC_LINK_IMPROVEMENT_PROMPT = "מה אפשר לשפר בפעם הבאה?";
/** Used whenever no improvement text was written -- never blocks the flow (spec section 6/13: missing written improvement never blocks). */
export const FUTURE_ARC_LINK_IMPROVEMENT_FALLBACK = "דמיין את אותה התמודדות מתרחשת שוב, והפעם אפשר לעצמך לפעול בדרך מעט מדויקת, קלה או מיטיבה יותר.";
export const FUTURE_ARC_LINK_TRIGGER_ACTIVATION_PROMPT = "לפני שממשיכים, דמיין בקצרה את הזמן, המקום או המצב שבו תרצה להשתמש בזה בפעם הבאה.";
export const FUTURE_ARC_LINK_FUTURE_GRATITUDE_PROMPT = "דמיין שסיימת את הפעולה. על מה אתה מוקיר תודה עכשיו?";
export const FUTURE_ARC_LINK_START_ACTION_LABEL = "אני מתחיל עכשיו";
export const FUTURE_ARC_LINK_SCHEDULE_LATER_LABEL = "סיום -- אחזור בזמן שנקבע";
export const FUTURE_ARC_LINK_PRACTICE_AGAIN_LABEL = "תרגול שוב";

export interface FutureArcLinkCue {
  id: string;
  /** A short, already-personalized phrase -- never a full instruction screen (spec section 7: "brief cue labels rather than... complete instructional screens"). */
  text: string;
}

export interface FutureArcLinkContent {
  actionLabel: string;
  /** The brief future-trigger framing line shown before the arrow sequence. */
  triggerCueText: string;
  /** Always 4-7 items; the last "real action" cue and its result are always present (spec section 7: "The real action must appear in the sequence"). */
  cues: FutureArcLinkCue[];
}

const GENERIC_TRIGGER_FALLBACK = "המקום, הזמן או המצב המוכרים לך";

/**
 * Resolves this profile's own short future cue-and-arrow sequence for
 * `target`. Returns null when there is no resolvable real action --
 * the one truly critical field (spec: "The real action must appear in
 * the sequence" -- with no action there is nothing to build a sequence
 * around, and the caller must show a safe setup route rather than
 * invent one). Every other field degrades to a short generic label
 * instead of blocking.
 */
export function resolveFutureArcLinkContent(profile: ArcBuildProfile, target: FutureArcLinkTarget, triggerTextOverride?: string | null): FutureArcLinkContent | null {
  const actionLabel = resolveActionLabel(profile, target);
  if (!actionLabel) return null;
  const triggerCueText = safe(triggerTextOverride) || GENERIC_TRIGGER_FALLBACK;

  if (target === "identity") {
    const identityLabel = resolveIdentityLabel(profile, target);
    const { cue: bodyCue } = resolveEncodingBodyLanguage(profile, target);
    const cues: FutureArcLinkCue[] = [
      { id: "time_place", text: "זמן ומקום מתאימים" },
      { id: "trigger", text: triggerCueText },
      { id: "identity", text: identityLabel ? `נזכר בזהות: ${identityLabel}` : "נזכר בזהות שבחרת" },
      { id: "body_language", text: bodyCue ? `שפת גוף: ${bodyCue}` : "מאמץ שפת גוף תומכת" },
      { id: "action", text: `מתחיל: ${actionLabel}` },
      { id: "success", text: "חווה הצלחה" },
    ];
    return { actionLabel, triggerCueText, cues };
  }

  if (target === "habit") {
    const cues: FutureArcLinkCue[] = [
      { id: "trigger", text: triggerCueText },
      { id: "recognition", text: "שם לב למה שקורה" },
      { id: "action", text: `מתחיל: ${actionLabel}` },
      { id: "result", text: "רואה את התוצאה" },
    ];
    return { actionLabel, triggerCueText, cues };
  }

  // target === "state"
  const { cue: encodingCue } = resolveEncodingBodyLanguage(profile, target);
  const regulationAnchor = safe(profile.regulationTool);
  const cues: FutureArcLinkCue[] = [
    { id: "trigger", text: triggerCueText },
    { id: "recognition", text: "מזהה את המצב" },
    { id: "stop", text: "עוצר לרגע" },
    { id: "regulation", text: regulationAnchor ? `מווסת: ${regulationAnchor}` : "נושם ומווסת" },
    { id: "encoding", text: encodingCue ? `קידוד: ${encodingCue}` : "מקודד את המצב הרצוי" },
    { id: "action", text: `מתחיל: ${actionLabel}` },
    { id: "result", text: "רואה את התוצאה" },
  ];
  return { actionLabel, triggerCueText, cues };
}

/** Joins cues with an arrow for display -- "טריגר → זיהוי → ..." (matches the spec's own examples verbatim, arrow direction unchanged regardless of RTL). */
export function formatFutureArcLinkSequence(content: FutureArcLinkContent): string {
  return content.cues.map((cue) => cue.text).join(" → ");
}

// ---------------------------------------------------------------------------
// Standalone practice (live/FutureArcLinkScreen.tsx) -- its own fixed,
// linear stage order. Mirrors arc/miniIdentity.ts's own "short, linear,
// no branching" shape -- never the full ArcLiveState/arcEngine
// machinery (this practice never asks ratings, never branches).
// ---------------------------------------------------------------------------

export type FutureArcLinkStage =
  | "gratitude_past"
  | "memory_cue"
  | "replay"
  | "improvement_reminder"
  | "improved_imagery"
  | "trigger_activation"
  | "cue_sequence"
  | "begin_action_imagery"
  | "result_imagery"
  | "future_gratitude"
  | "transition";

const FUTURE_ARC_LINK_STAGE_ORDER: FutureArcLinkStage[] = [
  "gratitude_past",
  "memory_cue",
  "replay",
  "improvement_reminder",
  "improved_imagery",
  "trigger_activation",
  "cue_sequence",
  "begin_action_imagery",
  "result_imagery",
  "future_gratitude",
  "transition",
];

export function getFirstFutureArcLinkStage(): FutureArcLinkStage {
  return "gratitude_past";
}

export function getNextFutureArcLinkStage(current: FutureArcLinkStage): FutureArcLinkStage | null {
  const index = FUTURE_ARC_LINK_STAGE_ORDER.indexOf(current);
  if (index === -1 || index === FUTURE_ARC_LINK_STAGE_ORDER.length - 1) return null;
  return FUTURE_ARC_LINK_STAGE_ORDER[index + 1];
}

// ---------------------------------------------------------------------------
// Backward-compatible migration: converts an OLD saved ArcLink record
// (Regular/ARCHI/Bridging/any practiceMode/kind/mode combination) into
// the one thing the new architecture needs from it -- a trigger text to
// seed the future-trigger cue. Never branches UI on the record's own
// old kind/mode/practiceMode/bridging fields; those are read here only
// to recover useful text, then discarded.
// ---------------------------------------------------------------------------

/** Recovers a usable trigger text from an old saved ArcLink + its referenced trigger record, for seeding the new sequence's own trigger cue. Never invents one when both are empty. */
export function resolveFutureArcLinkTriggerTextFromLegacy(link: ArcLink | null, trigger: RoutineTrigger | null): string | null {
  const triggerText = safe(trigger?.text);
  if (triggerText) return triggerText;
  return null;
}
