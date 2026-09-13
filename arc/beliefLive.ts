/**
 * arc/beliefLive.ts
 *
 * Phase 6 (ARC Belief and ARC Mini Belief): a NEW, INDEPENDENT engine
 * for the dedicated Full ARC Belief and ARC Mini Belief real-time
 * routes -- deliberately NOT built on arc/arcEngine.ts's shared
 * ArcStage sequencer, mirroring the exact same independence
 * arc/urgeLive.ts (Phase 3) and arc/thoughtLive.ts (Phase 4) already
 * established. This keeps every other protocol completely untouched
 * and at zero regression risk.
 *
 * ARC Belief is deliberately distinct from ARC Thought (spec section
 * 2): a broader RECURRING belief about self/others/the world that may
 * appear across many situations, never a single current thought/image
 * occurring now.
 *
 * Reused, never duplicated: arc/mantras.ts's getStayMantraLine/
 * getAcceptanceMantraLine/getRegulationMantraLine/getBridgeMantraLine
 * (BeliefArc's own stayMantra/acceptanceMantra/regulationMantra/
 * bridgeMantra fields are structurally MantraProfile-compatible, exactly
 * like UrgeArc's own), arc/naturalBreathing.ts's getFreeBreathingLine,
 * and arc/dwellTimes.ts's DEFAULT_DWELL_TIMES (the habit layer's own
 * dwell defaults -- ARC Belief has no ARC Map of its own either).
 *
 * Post-action completion (Action -> imagery of the action as it
 * actually happened -> optional written improvement -> improved-action
 * imagery -> Gratitude) is built directly into this engine's own
 * shared tail, per spec section 16 and the separately-saved global
 * post-action-completion requirement (Phase 8/10) -- Full ARC Belief is
 * the FIRST protocol in this codebase to carry it end to end; Phase 8
 * is where this same shape gets extracted into one shared component
 * every other real protocol (State, Urge, Thought, Presence) is
 * retrofitted onto, per that saved instruction. ARC Mini Belief's own
 * tail is the compact version (short imagery + short Gratitude, no
 * Success Focus/improvement writing) per spec sections 17-19.
 *
 * Embedded-in-ARC-State prep (spec section 23): getFirstBeliefLiveStage
 * accepts an optional entry-mode so a later Phase 7 ARC State composer
 * can start this exact same engine directly at its post-Regulation
 * belief work (Bridge Mantra only if not already shown -> replacement
 * belief -> Encoding -> future way of acting) instead of repeating the
 * full standalone preparation -- without this phase building the ARC
 * State composer itself.
 */

import type { ArcBuildProfile, BeliefArc } from "./types.ts";
import type { MiniArcBuild } from "./miniArc.ts";
import { getAcceptanceMantraLine, getBridgeMantraLine, getRegulationMantraLine, getStayMantraLine } from "./mantras.ts";
import { getFreeBreathingLine } from "./naturalBreathing.ts";
import { DEFAULT_DWELL_TIMES } from "./dwellTimes.ts";
import { resolveBeliefFallbackBridgeMantra, resolveBeliefFallbackLimitingBelief, resolveBeliefFallbackReplacementBelief } from "./beliefArcs.ts";

function safeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export const BELIEF_GRATITUDE_DEFAULT_QUESTION = "על מה אתה מודה לעצמך בעקבות הפעולה?";
export const BELIEF_ACCEPTANCE_CLARIFICATION = "קבלת נוכחות האמונה אינה אומרת שהיא נכונה או שאתה מסכים איתה.";
export const BELIEF_REGULATION_ANCHORS_LINE = "אפשר לשים לב לכפות הרגליים על הקרקע, לשחרר מעט את הכתפיים ולהרחיב בעדינות את שדה הראייה.";
export const BELIEF_IMPROVED_IMAGERY_FALLBACK = "דמיין את עצמך מבצע שוב את הפעולה, תוך שמירה על מה שעבד היטב.";

// ---------------------------------------------------------------------------
// Full ARC Belief
// ---------------------------------------------------------------------------

export type BeliefLiveStage =
  | "recognition"
  | "stay"
  | "acceptance"
  | "regulate"
  | "bridge_mantra"
  | "replacement_belief"
  | "encoding"
  | "future_insight"
  | "future_action"
  | "future_imagery"
  | "action"
  | "action_imagery"
  | "improvement_entry"
  | "improved_action_imagery"
  | "gratitude"
  | "complete";

/** The one fixed order this phase's spec requires (section 4), matching the detailed per-stage sections 5-16 (the authoritative source over section 4's own compressed summary line). */
export const BELIEF_LIVE_STAGE_ORDER: BeliefLiveStage[] = [
  "recognition",
  "stay",
  "acceptance",
  "regulate",
  "bridge_mantra",
  "replacement_belief",
  "encoding",
  "future_insight",
  "future_action",
  "future_imagery",
  "action",
  "action_imagery",
  "improvement_entry",
  "improved_action_imagery",
  "gratitude",
  "complete",
];

/** Embedded-mode entry point (spec section 23): the post-Regulation subsequence Phase 7 can drive directly, skipping the full standalone preparation. */
export const BELIEF_ENCODING_ONLY_STAGE_ORDER: BeliefLiveStage[] = [
  "bridge_mantra",
  "replacement_belief",
  "encoding",
  "future_insight",
  "future_action",
];

export interface BeliefLiveState {
  /** Free-text recognition fields (spec section 5) -- never required, never used to gate progression. */
  limitingBeliefText: string | null;
  situationText: string | null;
  emotionText: string | null;
  /** Written LIVE only when no saved replacement belief exists (spec section 10) -- never written back to the saved BeliefArc automatically. */
  liveReplacementBeliefText: string | null;
  futureInsightText: string | null;
  futureActionText: string | null;
  /** Optional written improvement (spec section 16) -- skippable, never required. */
  improvementText: string | null;
  gratitudeText: string | null;
}

export function createEmptyBeliefLiveState(): BeliefLiveState {
  return {
    limitingBeliefText: null,
    situationText: null,
    emotionText: null,
    liveReplacementBeliefText: null,
    futureInsightText: null,
    futureActionText: null,
    improvementText: null,
    gratitudeText: null,
  };
}

export function getFirstBeliefLiveStage(): BeliefLiveStage {
  return "recognition";
}

/**
 * Spec section 23: when embedded inside a parent ARC State session that
 * has already completed combined Awareness/Stay/Acceptance/Presence/
 * Regulation, start directly at this engine's own post-Regulation
 * belief work -- Bridge Mantra only if the parent hasn't already shown
 * one. Never repeats the full standalone preparation. Does not itself
 * decide anything about ARC State's own composition; the caller (a
 * future Phase 7 composer) passes in what it already knows.
 */
export function getFirstEmbeddedBeliefLiveStage(bridgeMantraAlreadyShown: boolean): BeliefLiveStage {
  return bridgeMantraAlreadyShown ? "replacement_belief" : "bridge_mantra";
}

export interface BeliefLiveStageResult {
  stage: BeliefLiveStage;
  state: BeliefLiveState;
}

/**
 * Pure, total stage transition -- never throws. Every stage here is
 * free-text/optional (spec's own repeated "never require"/"never
 * force" language for Belief, exactly like Urge/Thought), so none of
 * them ever gate progression -- the caller has already recorded
 * whatever answer it has (merged into `state`) before hopping. `state`
 * is threaded through unchanged -- this function only ever decides the
 * next stage, never mutates or resets any recorded answer.
 */
export function getNextBeliefLiveStage(current: BeliefLiveStage, state: BeliefLiveState): BeliefLiveStageResult {
  switch (current) {
    case "recognition":
      return { stage: "stay", state };
    case "stay":
      return { stage: "acceptance", state };
    case "acceptance":
      return { stage: "regulate", state };
    case "regulate":
      return { stage: "bridge_mantra", state };
    case "bridge_mantra":
      return { stage: "replacement_belief", state };
    case "replacement_belief":
      return { stage: "encoding", state };
    case "encoding":
      return { stage: "future_insight", state };
    case "future_insight":
      return { stage: "future_action", state };
    case "future_action":
      return { stage: "future_imagery", state };
    case "future_imagery":
      return { stage: "action", state };
    case "action":
      return { stage: "action_imagery", state };
    case "action_imagery":
      return { stage: "improvement_entry", state };
    case "improvement_entry":
      return { stage: "improved_action_imagery", state };
    case "improved_action_imagery":
      return { stage: "gratitude", state };
    case "gratitude":
      return { stage: "complete", state };
    case "complete":
      return { stage: "complete", state };
  }
}

export interface BeliefLiveStageCopy {
  title: string;
  body: string;
  secondaryBody: string | null;
  hint: string | null;
  buttonLabel: string;
}

export type BeliefEncodingSource = "saved_replacement_belief" | "live_replacement_belief" | "anchor_fallback";

export interface BeliefEncodingContent {
  source: BeliefEncodingSource;
  text: string;
}

/**
 * Spec section 10's own priority order: the saved/resolved replacement
 * belief (BeliefArc's own field, already carrying the
 * resolveBeliefFallbackReplacementBelief chain if the caller applied
 * it before constructing this BeliefArc/passing it in), then a
 * balanced belief entered LIVE, then a safe anchor-only fallback.
 * Never invents content.
 */
export function resolveBeliefEncodingContent(beliefArc: BeliefArc | null, state: BeliefLiveState): BeliefEncodingContent {
  const saved = safeText(beliefArc?.replacementBelief);
  if (saved.length > 0) return { source: "saved_replacement_belief", text: saved };
  const live = safeText(state.liveReplacementBeliefText);
  if (live.length > 0) return { source: "live_replacement_belief", text: live };
  return { source: "anchor_fallback", text: "" };
}

/** Pure copy generator for one Full ARC Belief stage -- never throws, never renders "undefined"/"null" even for a legacy/empty BeliefArc. */
export function getBeliefLiveStageCopy(stage: BeliefLiveStage, beliefArc: BeliefArc | null, state: BeliefLiveState): BeliefLiveStageCopy {
  switch (stage) {
    case "recognition":
      return {
        title: "זיהוי האמונה והמצב",
        body: "שים לב לאמונה, למצב ולרגש או לתחושה שכבר נמצאים איתך עכשיו -- בלי ליצור אותם מחדש ובלי להעצים אותם.",
        secondaryBody: null,
        hint: null,
        buttonLabel: "המשך",
      };
    case "stay": {
      const mantraLine = getStayMantraLine(beliefArc ?? {});
      return {
        title: "נשימה טבעית ושהייה",
        body: "אפשר לנשימה להמשיך בחופשיות. שים לב כיצד היא מתרחשת מעצמה, בלי לנסות לשנות אותה.",
        secondaryBody: mantraLine,
        hint: null,
        buttonLabel: "המשך",
      };
    }
    case "acceptance": {
      const mantraLine = getAcceptanceMantraLine(beliefArc ?? {});
      return {
        title: "קבלה",
        body: "הנח יד על הלב ואמור בעדינות: אני מקבל שיש בי כרגע את המחשבה או האמונה הזאת.",
        secondaryBody: mantraLine,
        hint: BELIEF_ACCEPTANCE_CLARIFICATION,
        buttonLabel: "המשך",
      };
    }
    case "regulate": {
      const anchor = safeText(beliefArc?.regulationAnchor);
      const regulationMantraLine = getRegulationMantraLine(beliefArc ?? {});
      const secondaryParts = [regulationMantraLine, BELIEF_REGULATION_ANCHORS_LINE, getFreeBreathingLine()].filter(
        (part): part is string => part !== null && part.length > 0
      );
      return {
        title: "ויסות",
        body: anchor.length > 0 ? anchor : "עוגן הוויסות שהגדרת.",
        secondaryBody: secondaryParts.length > 0 ? secondaryParts.join(" ") : null,
        hint: null,
        buttonLabel: "המשך",
      };
    }
    case "bridge_mantra": {
      const line = getBridgeMantraLine(beliefArc ?? {});
      return {
        title: "מנטרת גשר",
        body: line ?? "אפשר להמשיך גם בלי מנטרת גשר שמורה.",
        secondaryBody: null,
        hint: null,
        buttonLabel: "המשך",
      };
    }
    case "replacement_belief": {
      const saved = safeText(beliefArc?.replacementBelief);
      return {
        title: "אמונה חלופית ותומכת",
        body: saved.length > 0 ? "אפשר להיעזר עכשיו באמונה התומכת שהכנת מראש:" : "עדיין לא הכנת אמונה תומכת -- אפשר לכתוב אחת עכשיו, או להמשיך עם עוגן קידוד בלבד.",
        secondaryBody: saved.length > 0 ? saved : null,
        hint: null,
        buttonLabel: "המשך",
      };
    }
    case "encoding": {
      const content = resolveBeliefEncodingContent(beliefArc, state);
      const belief = content.text.length > 0 ? content.text : "העוגן הקבוע שהגדרת.";
      const nod = safeText(beliefArc?.gentleNodCue);
      const anchor = safeText(beliefArc?.encodingAnchor);
      const image = safeText(beliefArc?.supportiveImage);
      const voice = safeText(beliefArc?.supportiveVoiceInstruction);
      const parts = [
        nod.length > 0 ? nod : "אפשר להנהן בעדינות, כאילו מאשר את האמונה הזאת עבור עצמך.",
        anchor.length > 0 ? anchor : null,
        image.length > 0 ? `דימוי תומך: ${image}` : null,
        voice.length > 0 ? voice : null,
      ].filter((part): part is string => part !== null);
      return { title: "קידוד", body: belief, secondaryBody: parts.length > 0 ? parts.join(" ") : null, hint: null, buttonLabel: "המשך" };
    }
    case "future_insight": {
      const saved = safeText(beliefArc?.futureInsight);
      return {
        title: "תובנה עתידית",
        body: "מה תרצה לזכור בפעם הבאה שהאמונה הישנה תופיע?",
        secondaryBody: saved.length > 0 ? saved : "בפעם הבאה אני אזכור ש...",
        hint: null,
        buttonLabel: "המשך",
      };
    }
    case "future_action": {
      const saved = safeText(beliefArc?.futureAction);
      return {
        title: "דרך פעולה עתידית",
        body: "כיצד תרצה לפעול בפעם הבאה מתוך האמונה התומכת?",
        secondaryBody: saved.length > 0 ? saved : "כאשר זה יקרה, אפעל כך...",
        hint: null,
        buttonLabel: "המשך",
      };
    }
    case "future_imagery": {
      const action = safeText(beliefArc?.shortAction) || safeText(state.futureActionText);
      return {
        title: "דמיון עתידי",
        body: `דמיין מצב דומה בעתיד. האמונה הישנה עשויה להופיע, ובמקביל אתה נזכר במנטרת הגשר או באמונה התומכת, משתמש בהנהון או בעוגן הקידוד, ובוחר להתחיל ב${action.length > 0 ? action : "פעולה שתכננת"}. דמיין תוצאה אפשרית וריאלית.`,
        secondaryBody: null,
        hint: null,
        buttonLabel: "המשך",
      };
    }
    case "action": {
      const action = safeText(beliefArc?.shortAction);
      return { title: "פעולה עקבית לאמונה", body: action.length > 0 ? action : "הפעולה העקבית לאמונה שהגדרת.", secondaryBody: null, hint: null, buttonLabel: "סיימתי" };
    }
    case "action_imagery":
      return {
        title: "דמיון הפעולה שנעשתה",
        body: "דמיין את עצמך מבצע את הפעולה כפי שבאמת קרתה עכשיו, כולל מה שעבד היטב.",
        secondaryBody: null,
        hint: null,
        buttonLabel: "המשך",
      };
    case "improvement_entry":
      return {
        title: "שיפור אפשרי (רשות)",
        body: "מה אפשר לשפר בפעם הבאה? (רשות -- אפשר גם לדלג)",
        secondaryBody: null,
        hint: null,
        buttonLabel: "המשך",
      };
    case "improved_action_imagery": {
      const improvement = safeText(state.improvementText);
      return {
        title: "דמיון הפעולה המשופרת",
        body: improvement.length > 0 ? `דמיין את עצמך מבצע את הפעולה תוך שילוב השיפור: ${improvement}` : BELIEF_IMPROVED_IMAGERY_FALLBACK,
        secondaryBody: null,
        hint: null,
        buttonLabel: "המשך",
      };
    }
    case "gratitude":
      return {
        title: "הוקרת תודה",
        body: safeText(beliefArc?.gratitudePrompt) || BELIEF_GRATITUDE_DEFAULT_QUESTION,
        secondaryBody: null,
        hint: null,
        buttonLabel: "המשך",
      };
    case "complete":
      return { title: "סיום", body: "סיימת את ה-ARC Belief.", secondaryBody: null, hint: null, buttonLabel: "סיום" };
  }
}

/** Dwell durations Full ARC Belief uses -- the habit layer has no ARC Map of its own, so these fall back to the exact same defaults Urge/Thought already use, except where BeliefArc has its own configured override (futureImageryDwellSeconds/postActionImageryDwellSeconds). */
export function getBeliefLiveDwellSeconds(stage: BeliefLiveStage, beliefArc: BeliefArc | null): number | null {
  switch (stage) {
    case "stay":
      return DEFAULT_DWELL_TIMES.sensationDwellSeconds;
    case "acceptance":
      return DEFAULT_DWELL_TIMES.acceptanceDwellSeconds;
    case "regulate":
      return DEFAULT_DWELL_TIMES.regulationDwellSeconds;
    case "future_imagery":
      return beliefArc?.futureImageryDwellSeconds ?? DEFAULT_DWELL_TIMES.actionImageryDwellSeconds;
    case "action_imagery":
      return beliefArc?.postActionImageryDwellSeconds ?? DEFAULT_DWELL_TIMES.completedActionImageryDwellSeconds;
    case "improved_action_imagery":
      return beliefArc?.postActionImageryDwellSeconds ?? DEFAULT_DWELL_TIMES.improvedActionImageryDwellSeconds;
    default:
      return null;
  }
}

/**
 * Applies the documented BUILD-time fallback chain (spec sections 20/26,
 * arc/beliefArcs.ts's own resolveBeliefFallback* functions) onto a
 * BeliefArc for LIVE use, WITHOUT persisting anything -- a purely
 * session-local "effective" view. A saved BeliefArc's own fields always
 * win; this only ever fills a genuine gap from a linked Mini or the
 * trainee's existing regular ARC Map.
 */
export function resolveEffectiveBeliefArc(beliefArc: BeliefArc | null, linkedMini: MiniArcBuild | null, profile: ArcBuildProfile | null): BeliefArc | null {
  if (!beliefArc) return null;
  return {
    ...beliefArc,
    limitingBelief: resolveBeliefFallbackLimitingBelief(beliefArc, profile),
    replacementBelief: resolveBeliefFallbackReplacementBelief(beliefArc, linkedMini, profile),
    bridgeMantra: resolveBeliefFallbackBridgeMantra(beliefArc, linkedMini),
  };
}

// ---------------------------------------------------------------------------
// ARC Mini Belief -- spec sections 17-19: a genuinely short real-time
// protocol, deliberately excluding Presence rating, three Presence
// stages, a separate Stay stage, a separate Acceptance stage, long
// Awareness, full Regulation, long reflection, mandatory writing, and
// long future imagery. Its own post-action tail (spec section 18/the
// saved global post-action requirement) is the COMPACT version: short
// imagery of the completed action + short Gratitude only -- no Success
// Focus, no improvement writing, no improved-action imagery.
// ---------------------------------------------------------------------------

export type MiniBeliefLiveStage = "recognition" | "bridge_mantra" | "regulate" | "replacement_belief" | "encoding" | "action" | "action_imagery" | "gratitude" | "complete";

export const MINI_BELIEF_LIVE_STAGE_ORDER: MiniBeliefLiveStage[] = [
  "recognition",
  "bridge_mantra",
  "regulate",
  "replacement_belief",
  "encoding",
  "action",
  "action_imagery",
  "gratitude",
  "complete",
];

/** Short, fixed default (never configurable per-second like the Full protocol's own dwell settings) used only when build.miniActionImageryDwellSeconds is unset. */
export const MINI_BELIEF_DEFAULT_ACTION_IMAGERY_SECONDS = 5;

export function getFirstMiniBeliefLiveStage(): MiniBeliefLiveStage {
  return "recognition";
}

export interface MiniBeliefLiveStageResult {
  stage: MiniBeliefLiveStage;
}

/** Purely linear -- no decision points, matching spec section 17's own fixed order. */
export function getNextMiniBeliefLiveStage(current: MiniBeliefLiveStage): MiniBeliefLiveStageResult {
  switch (current) {
    case "recognition":
      return { stage: "bridge_mantra" };
    case "bridge_mantra":
      return { stage: "regulate" };
    case "regulate":
      return { stage: "replacement_belief" };
    case "replacement_belief":
      return { stage: "encoding" };
    case "encoding":
      return { stage: "action" };
    case "action":
      return { stage: "action_imagery" };
    case "action_imagery":
      return { stage: "gratitude" };
    case "gratitude":
      return { stage: "complete" };
    case "complete":
      return { stage: "complete" };
  }
}

/**
 * Spec section 19's own priority order for each piece of Mini Belief
 * content -- MiniArcBuild has no own limitingBelief field (mirroring
 * Mini Thought's precedent exactly), so recognition always reads the
 * parent BeliefArc's, or an explicit session override (spec: "preserve
 * it only for the current session unless explicitly saved"). Never
 * requires writing during the real-time session.
 */
export function resolveMiniBeliefLimitingBelief(parentBeliefArc: BeliefArc | null, sessionOverride: string | null): string | null {
  const override = safeText(sessionOverride);
  if (override.length > 0) return override;
  const parent = safeText(parentBeliefArc?.limitingBelief);
  return parent.length > 0 ? parent : null;
}

export function resolveMiniBeliefBridgeMantra(build: MiniArcBuild, parentBeliefArc: BeliefArc | null): string | null {
  const own = safeText(build.bridgeMantraText);
  if (own.length > 0) return own;
  const parent = safeText(parentBeliefArc?.bridgeMantra);
  return parent.length > 0 ? parent : null;
}

export function resolveMiniBeliefReplacementBelief(build: MiniArcBuild, parentBeliefArc: BeliefArc | null): string | null {
  const own = safeText(build.replacementBelief);
  if (own.length > 0) return own;
  const parent = safeText(parentBeliefArc?.replacementBelief);
  return parent.length > 0 ? parent : null;
}

export interface MiniBeliefLiveStageCopy {
  title: string;
  body: string;
  secondaryBody: string | null;
  buttonLabel: string;
}

/** Pure copy generator for one ARC Mini Belief stage -- never throws, never renders "undefined"/"null" even for a Mini with every optional field missing and no parent. */
export function getMiniBeliefLiveStageCopy(
  stage: MiniBeliefLiveStage,
  build: MiniArcBuild,
  parentBeliefArc: BeliefArc | null,
  sessionBeliefOverride: string | null = null
): MiniBeliefLiveStageCopy {
  switch (stage) {
    case "recognition": {
      const belief = resolveMiniBeliefLimitingBelief(parentBeliefArc, sessionBeliefOverride);
      return {
        title: "זיהוי קצר",
        body: belief ?? "שים לב בקצרה לאמונה שנמצאת עכשיו, בלי להתייחס אליה כאל אמת.",
        secondaryBody: null,
        buttonLabel: "המשך",
      };
    }
    case "bridge_mantra": {
      const line = resolveMiniBeliefBridgeMantra(build, parentBeliefArc);
      return { title: "מנטרת גשר", body: line ?? "אפשר להמשיך גם בלי מנטרת גשר שמורה.", secondaryBody: null, buttonLabel: "המשך" };
    }
    case "regulate": {
      const anchor = safeText(build.regulationAnchor);
      return { title: "ויסות קצר", body: anchor.length > 0 ? anchor : "עוגן הוויסות שהגדרת.", secondaryBody: null, buttonLabel: "המשך" };
    }
    case "replacement_belief": {
      const belief = resolveMiniBeliefReplacementBelief(build, parentBeliefArc);
      return { title: "אמונה תומכת", body: belief ?? "העוגן הקבוע שהגדרת.", secondaryBody: null, buttonLabel: "המשך" };
    }
    case "encoding": {
      const anchor = safeText(build.encodingAction);
      return { title: "קידוד קצר", body: anchor.length > 0 ? anchor : "פעולת הקידוד שהגדרת.", secondaryBody: null, buttonLabel: "המשך" };
    }
    case "action": {
      const action = safeText(build.beneficialAction);
      return { title: "פעולה קצרה", body: action.length > 0 ? action : "הפעולה הקצרה שהגדרת.", secondaryBody: null, buttonLabel: "סיימתי" };
    }
    case "action_imagery":
      return {
        title: "דמיון הפעולה שנעשתה",
        body: "דמיין בקצרה את עצמך מבצע את הפעולה כפי שבאמת קרתה עכשיו.",
        secondaryBody: null,
        buttonLabel: "המשך",
      };
    case "gratitude":
      return { title: "הוקרת תודה", body: safeText(build.miniGratitudePrompt) || BELIEF_GRATITUDE_DEFAULT_QUESTION, secondaryBody: null, buttonLabel: "המשך" };
    case "complete":
      return { title: "סיום", body: "סיימת את ה-ARC Mini Belief.", secondaryBody: null, buttonLabel: "סיום" };
  }
}

/** Mini Belief's own single configurable dwell (spec section 21) -- the compact tail's ONLY duration setting, never a per-stage array like the Full protocol's own dwell settings. */
export function getMiniBeliefActionImageryDwellSeconds(build: MiniArcBuild): number {
  return build.miniActionImageryDwellSeconds ?? MINI_BELIEF_DEFAULT_ACTION_IMAGERY_SECONDS;
}
