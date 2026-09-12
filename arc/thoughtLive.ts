/**
 * arc/thoughtLive.ts
 *
 * Phase 4 (ARC Thought and ARC Mini Thought): a NEW, INDEPENDENT engine
 * for the dedicated Full ARC Thought (disturbing-thought and
 * supportive-thought routes) and ARC Mini Thought real-time routes --
 * deliberately NOT built on arc/arcEngine.ts's shared ArcStage
 * sequencer, mirroring the exact same independence arc/urgeLive.ts
 * (Phase 3) and arc/miniArc.ts already established. This keeps every
 * other protocol completely untouched and at zero regression risk.
 *
 * Written to be reusable later as a shared module (spec section 2:
 * "It must also be reusable later as a shared module inside ARC
 * State/ARC Goal/other parent protocols") -- every function here is
 * pure and total (stage + state in, stage + state/copy out), so a
 * later parent protocol can drive this exact same engine and just
 * decide differently what happens before/after it, never forking or
 * duplicating this file's own routing/content logic.
 *
 * ARC Thought is deliberately distinct from ARC Belief (spec section
 * 2): a particular thought/image/internal sentence occurring NOW, never
 * a broader recurring belief about self/others/the world -- ARC Belief
 * is out of scope for this phase entirely.
 *
 * Reused, never duplicated: arc/mantras.ts's getStayMantraLine/
 * getAcceptanceMantraLine (ThoughtArc's own stayMantra/acceptanceMantra
 * fields are structurally MantraProfile-compatible, exactly like
 * UrgeArc's), and arc/dwellTimes.ts's DEFAULT_DWELL_TIMES (the habit
 * layer's own dwell defaults, reused the same way Urge already does --
 * ARC Thought has no ARC Map of its own either).
 */

import type { MiniArcBuild } from "./miniArc.ts";
import type { ThoughtArc, ThoughtModality, ThoughtRoute, ThoughtTimeOrientation } from "./types.ts";
import { getAcceptanceMantraLine, getStayMantraLine } from "./mantras.ts";
import { getFreeBreathingLine } from "./naturalBreathing.ts";
import { DEFAULT_DWELL_TIMES } from "./dwellTimes.ts";

function safeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

// ---------------------------------------------------------------------------
// Full ARC Thought
// ---------------------------------------------------------------------------

export type ThoughtLiveStage =
  | "opening_decision"
  // disturbing-thought route (spec section 5)
  | "recognition"
  | "modality"
  | "emotion"
  | "time_orientation"
  | "breathing_stay"
  | "acceptance"
  | "flexible_attention_1"
  | "flexible_attention_2"
  | "useful_insight_decision"
  | "useful_insight_entry"
  | "supportive_fallback"
  // supportive-thought route (spec section 19)
  | "supportive_thought_select"
  | "supportive_breathing_attention"
  | "repeat_supportive"
  | "gentle_nod"
  // shared tail (both routes)
  | "encoding"
  | "future_insight_action"
  | "future_imagery"
  | "complete";

/** The exact fixed order for the disturbing-thought route (spec section 5), for tests/callers that need the whole sequence rather than hopping one stage at a time. */
export const THOUGHT_DISTURBING_ROUTE_STAGE_ORDER_WITH_INSIGHT: ThoughtLiveStage[] = [
  "opening_decision",
  "recognition",
  "modality",
  "emotion",
  "time_orientation",
  "breathing_stay",
  "acceptance",
  "flexible_attention_1",
  "flexible_attention_2",
  "useful_insight_decision",
  "useful_insight_entry",
  "encoding",
  "future_insight_action",
  "future_imagery",
  "complete",
];

/** The exact fixed order for the supportive-thought route (spec section 19). */
export const THOUGHT_SUPPORTIVE_ROUTE_STAGE_ORDER: ThoughtLiveStage[] = [
  "opening_decision",
  "supportive_thought_select",
  "modality",
  "supportive_breathing_attention",
  "repeat_supportive",
  "gentle_nod",
  "encoding",
  "future_insight_action",
  "future_imagery",
  "complete",
];

export type UsefulInsightDecision = "yes" | "not_now";

export interface ThoughtLiveState {
  route: ThoughtRoute | null;
  modality: ThoughtModality | null;
  /** Free-text recognition fields (spec section 6) -- never required, never used to gate progression. */
  thoughtText: string | null;
  internalWordsText: string | null;
  situationText: string | null;
  emotionText: string | null;
  timeOrientation: ThoughtTimeOrientation | null;
  usefulInsightDecision: UsefulInsightDecision | null;
  /** The useful insight the trainee wrote during useful_insight_entry (spec section 13) -- session-local until saveUsefulInsightToThoughtArc (arc/thoughtArcs.ts) persists it. */
  usefulInsightText: string | null;
  /**
   * A balanced supportive thought entered LIVE -- either during
   * supportive_fallback (spec section 14, when BUILD's own
   * supportiveThought is missing) or during supportive_thought_select
   * (spec section 19's own "writing a new supportive thought"). Never
   * written back to the saved ThoughtArc automatically (spec section 3:
   * "Do not overwrite BUILD defaults unless the user explicitly saves a
   * change").
   */
  liveSupportiveThought: string | null;
  futureInsightText: string | null;
  actionText: string | null;
}

export function createEmptyThoughtLiveState(): ThoughtLiveState {
  return {
    route: null,
    modality: null,
    thoughtText: null,
    internalWordsText: null,
    situationText: null,
    emotionText: null,
    timeOrientation: null,
    usefulInsightDecision: null,
    usefulInsightText: null,
    liveSupportiveThought: null,
    futureInsightText: null,
    actionText: null,
  };
}

export function getFirstThoughtLiveStage(): ThoughtLiveStage {
  return "opening_decision";
}

/**
 * Phase 7 (ARC State composition), spec section 9.3 ("Thought Encoding:
 * Reuse only the post-Regulation Thought decision and Encoding. Ask:
 * 'האם אתה יכול למצוא...'"): the entry point a combined ARC State
 * session uses once it has already run its own shared Recognition
 * (which captures the current thought + modality, per that spec's own
 * "Thought recognition" section), combined Awareness/Stay/Acceptance,
 * and shared Regulation -- starts this exact same engine directly at
 * "useful_insight_decision" (the disturbing-route's own "did you find
 * something useful" question, immediately followed by its existing
 * useful_insight_entry/supportive_fallback -> encoding tail), never
 * repeating opening_decision/recognition/modality/emotion/
 * time_orientation/breathing_stay/acceptance/flexible_attention_1/2.
 * Standalone Full ARC Thought is completely unaffected --
 * getFirstThoughtLiveStage above still starts every independent
 * session at "opening_decision".
 */
export function getFirstEmbeddedThoughtLiveStage(): ThoughtLiveStage {
  return "useful_insight_decision";
}

export interface ThoughtLiveStageResult {
  stage: ThoughtLiveStage;
  state: ThoughtLiveState;
}

/**
 * Pure, total stage transition -- never throws. Only stages that
 * genuinely require an answer to route correctly (opening_decision,
 * modality, useful_insight_decision) ever gate progression; every
 * free-text/optional stage always advances (spec's own repeated "never
 * require"/"never force" language).
 */
export function getNextThoughtLiveStage(current: ThoughtLiveStage, state: ThoughtLiveState): ThoughtLiveStageResult {
  switch (current) {
    case "opening_decision":
      if (state.route === null) return { stage: current, state };
      return { stage: state.route === "disturbing" ? "recognition" : "supportive_thought_select", state };

    // --- disturbing-thought route ---
    case "recognition":
      return { stage: "modality", state };
    case "modality":
      if (state.modality === null) return { stage: current, state };
      // The supportive route also passes through "modality" (shared
      // stage id, spec section 19: "Choosing visual, auditory, both or
      // unsure") -- route the tail differently per the ORIGINAL opening
      // decision, never re-asked here.
      return { stage: state.route === "supportive" ? "supportive_breathing_attention" : "emotion", state };
    case "emotion":
      return { stage: "time_orientation", state };
    case "time_orientation":
      // Never gates progression (spec section 7: "allow continuing"
      // even when unsure) -- the trainee's answer (or lack of one) is
      // already recorded by the caller before this hop.
      return { stage: "breathing_stay", state };
    case "breathing_stay":
      return { stage: "acceptance", state };
    case "acceptance":
      return { stage: "flexible_attention_1", state };
    case "flexible_attention_1":
      return { stage: "flexible_attention_2", state };
    case "flexible_attention_2":
      return { stage: "useful_insight_decision", state };
    case "useful_insight_decision":
      if (state.usefulInsightDecision === null) return { stage: current, state };
      return { stage: state.usefulInsightDecision === "yes" ? "useful_insight_entry" : "supportive_fallback", state };
    case "useful_insight_entry":
      return { stage: "encoding", state };
    case "supportive_fallback":
      return { stage: "encoding", state };

    // --- supportive-thought route ---
    case "supportive_thought_select":
      return { stage: "modality", state };
    case "supportive_breathing_attention":
      return { stage: "repeat_supportive", state };
    case "repeat_supportive":
      return { stage: "gentle_nod", state };
    case "gentle_nod":
      return { stage: "encoding", state };

    // --- shared tail ---
    case "encoding":
      return { stage: "future_insight_action", state };
    case "future_insight_action":
      return { stage: "future_imagery", state };
    case "future_imagery":
      return { stage: "complete", state };
    case "complete":
      return { stage: "complete", state };
  }
}

export interface ThoughtLiveStageCopy {
  title: string;
  body: string;
  secondaryBody: string | null;
  hint: string | null;
  buttonLabel: string;
}

export const THOUGHT_OPENING_DECISION_TITLE = "מה היית רוצה לעשות עכשיו?";
export const THOUGHT_MODALITY_QUESTION = "כיצד המחשבה מופיעה אצלך?";
export const THOUGHT_TIME_ORIENTATION_QUESTION = "לאיזה זמן המחשבה מתייחסת בעיקר?";
export const THOUGHT_USEFUL_INSIGHT_DECISION_QUESTION = "האם אתה יכול למצוא במחשבה הזאת דבר מועיל, חשוב או כזה שאפשר ללמוד ממנו?";
export const THOUGHT_USEFUL_INSIGHT_ENTRY_QUESTION = "מה מועיל או חשוב אתה יכול לקחת מהמחשבה הזאת?";
export const THOUGHT_USEFUL_INSIGHT_HELPER_CATEGORIES = ["צורך שהיא מצביעה עליו", "ערך שחשוב לי", "דבר שאני יכול ללמוד", "פעולה שכדאי לבצע", "משהו שכדאי לבדוק"];
export const THOUGHT_ACCEPTANCE_CLARIFICATION = "קבלת נוכחות המחשבה אינה אומרת שהיא נכונה או שאתה מסכים איתה.";

export function getThoughtOpeningDecisionOptions(): { value: ThoughtRoute; label: string }[] {
  return [
    { value: "disturbing", label: "להתגבר על מחשבה מפריעה" },
    { value: "supportive", label: "לחזק מחשבה תומכת" },
  ];
}

export function getThoughtModalityOptions(): { value: ThoughtModality; label: string }[] {
  return [
    { value: "visual", label: "כתמונה" },
    { value: "auditory", label: "כקול או מילים פנימיות" },
    { value: "both", label: "גם כתמונה וגם כקול" },
    { value: "unsure", label: "לא בטוח" },
  ];
}

export function getThoughtTimeOrientationOptions(): { value: ThoughtTimeOrientation; label: string }[] {
  return [
    { value: "past", label: "עבר" },
    { value: "present", label: "הווה" },
    { value: "future", label: "עתיד" },
  ];
}

export function getThoughtUsefulInsightDecisionOptions(): { value: UsefulInsightDecision; label: string }[] {
  return [
    { value: "yes", label: "כן" },
    { value: "not_now", label: "לא כרגע" },
  ];
}

/**
 * Spec section 15: the time-oriented supportive prompt shown whenever a
 * new supportive thought must be created LIVE (no useful insight, no
 * BUILD supportiveThought). Falls back to the general prompt when time
 * orientation is unknown/unsure -- never requires a "positive" thought
 * the trainee doesn't believe (the prompt itself only ASKS; it never
 * supplies or invents the answer).
 */
export function getTimeOrientedSupportivePromptQuestion(timeOrientation: ThoughtTimeOrientation | null): string {
  switch (timeOrientation) {
    case "past":
      return "איזו פרשנות אחרת, מאוזנת ותומכת יכולה להתאים למה שקרה?";
    case "present":
      return "איזו מחשבה יכולה לעזור לך לפגוש את המצב הנוכחי בצורה מיטיבה יותר?";
    case "future":
      return "איזו מחשבה יכולה לעזור לך לגשת למה שעומד לקרות?";
    case null:
      return "איזו מחשבה מאוזנת ותומכת יכולה לעזור לך לבחור כיצד לפעול?";
  }
}

export type ThoughtEncodingSource = "useful_insight" | "build_supportive_thought" | "live_supportive_thought" | "anchor_fallback";

export interface ThoughtEncodingContent {
  source: ThoughtEncodingSource;
  text: string;
}

/**
 * Spec section 16's own priority order -- the single source of truth
 * both the Full engine's "encoding" copy and (indirectly, via a
 * parent ThoughtArc lookup) ARC Mini Thought's content resolution
 * build on. Never invents content: "anchor_fallback" carries an empty
 * text, and callers must render their own safe generic anchor line in
 * that case rather than an invented sentence.
 */
export function resolveThoughtEncodingContent(thoughtArc: ThoughtArc | null, state: ThoughtLiveState): ThoughtEncodingContent {
  const usefulInsight = safeText(state.usefulInsightText);
  if (usefulInsight.length > 0) return { source: "useful_insight", text: usefulInsight };
  const buildSupportive = safeText(thoughtArc?.supportiveThought);
  if (buildSupportive.length > 0) return { source: "build_supportive_thought", text: buildSupportive };
  const liveSupportive = safeText(state.liveSupportiveThought);
  if (liveSupportive.length > 0) return { source: "live_supportive_thought", text: liveSupportive };
  return { source: "anchor_fallback", text: "" };
}

function resolveModalityEncodingLines(thoughtArc: ThoughtArc | null, modality: ThoughtModality | null, content: ThoughtEncodingContent): { body: string; secondaryBody: string | null } {
  const insightLine = content.text.length > 0 ? content.text : "העוגן הקבוע שהגדרת.";
  const visualImage = safeText(thoughtArc?.visualSupportiveImage);
  const auditoryInstruction = safeText(thoughtArc?.auditorySupportiveVoiceInstruction);
  const encodingAnchor = safeText(thoughtArc?.encodingAnchor);

  if (modality === "visual") {
    const secondary = visualImage.length > 0 ? `דימוי תומך: ${visualImage}` : encodingAnchor.length > 0 ? encodingAnchor : null;
    return { body: insightLine, secondaryBody: secondary };
  }
  if (modality === "auditory") {
    const voiceLine = auditoryInstruction.length > 0 ? auditoryInstruction : "אפשר לשמוע את זה בקול פנימי תומך, בנחת ובבהירות.";
    return { body: insightLine, secondaryBody: voiceLine };
  }
  if (modality === "both") {
    const parts = [
      visualImage.length > 0 ? `דימוי תומך: ${visualImage}` : null,
      auditoryInstruction.length > 0 ? auditoryInstruction : "אפשר לשמוע את זה בקול פנימי תומך.",
    ].filter((part): part is string => part !== null);
    return { body: insightLine, secondaryBody: parts.length > 0 ? parts.join(" ") : null };
  }
  // "unsure"/null -- standard Encoding anchor, never forces a classification.
  return { body: insightLine, secondaryBody: encodingAnchor.length > 0 ? encodingAnchor : null };
}

/** Pure copy generator for one Full ARC Thought stage -- never throws, never renders "undefined"/"null" even for a legacy ThoughtArc missing every field. */
export function getThoughtLiveStageCopy(stage: ThoughtLiveStage, thoughtArc: ThoughtArc | null, state: ThoughtLiveState): ThoughtLiveStageCopy {
  switch (stage) {
    case "opening_decision":
      return { title: THOUGHT_OPENING_DECISION_TITLE, body: "", secondaryBody: null, hint: null, buttonLabel: "המשך" };
    case "recognition":
      return {
        title: "זיהוי המחשבה והמצב",
        body: "שים לב למחשבה ולמצב שכבר נמצאים איתך עכשיו -- בלי ליצור אותם מחדש ובלי להעצים אותם.",
        secondaryBody: null,
        hint: null,
        buttonLabel: "המשך",
      };
    case "modality":
      return { title: "אופן הופעת המחשבה", body: THOUGHT_MODALITY_QUESTION, secondaryBody: null, hint: null, buttonLabel: "המשך" };
    case "emotion":
      return {
        title: "רגש או תחושה",
        body: "אילו רגש או תחושה גופנית מלווים את המחשבה הזאת עכשיו? (רשות)",
        secondaryBody: null,
        hint: null,
        buttonLabel: "המשך",
      };
    case "time_orientation":
      return { title: "עבר/הווה/עתיד", body: THOUGHT_TIME_ORIENTATION_QUESTION, secondaryBody: null, hint: null, buttonLabel: "לא בטוח, להמשיך" };
    case "breathing_stay": {
      const mantraLine = getStayMantraLine(thoughtArc ?? {});
      return {
        title: "נשימה טבעית ושהייה",
        body: "אפשר לנשימה להמשיך בחופשיות. שים לב כיצד היא מתרחשת מעצמה, בלי לנסות לשנות אותה.",
        secondaryBody: mantraLine,
        hint: null,
        buttonLabel: "המשך",
      };
    }
    case "acceptance": {
      const mantraLine = getAcceptanceMantraLine(thoughtArc ?? {});
      return {
        title: "קבלה",
        body: "הנח יד על הלב ואמור בעדינות: אני מקבל שיש בי כרגע את המחשבה הזאת.",
        secondaryBody: mantraLine,
        hint: THOUGHT_ACCEPTANCE_CLARIFICATION,
        buttonLabel: "המשך",
      };
    }
    case "flexible_attention_1": {
      const soundLine =
        thoughtArc?.externalSoundAnchorEnabled && (state.modality === "auditory" || state.modality === "both")
          ? " ולצליל חיצוני אחד."
          : "";
      return {
        title: "הרחבת קשב לצד המחשבה",
        body: `אפשר למחשבה להיות ברקע, ובמקביל לשים לב לנשימה הטבעית, לצבע של אובייקט ולשדה הראייה הרחב.${soundLine}`,
        secondaryBody: null,
        hint: null,
        buttonLabel: "המשך",
      };
    }
    case "flexible_attention_2": {
      const soundLine =
        thoughtArc?.externalSoundAnchorEnabled && (state.modality === "auditory" || state.modality === "both")
          ? " ולצליל חיצוני, אם בחרת בו."
          : "";
      return {
        title: "הפניית קשב לעוגנים",
        body: `הפנה את הקשב לעוגנים הנוכחיים: נשימה טבעית, צבע האובייקט ושדה הראייה הרחב.${soundLine}`,
        secondaryBody: null,
        hint: null,
        buttonLabel: "המשך",
      };
    }
    case "useful_insight_decision":
      return { title: "בדיקת התועלת במחשבה", body: THOUGHT_USEFUL_INSIGHT_DECISION_QUESTION, secondaryBody: null, hint: null, buttonLabel: "המשך" };
    case "useful_insight_entry":
      return { title: "תובנה מועילה", body: THOUGHT_USEFUL_INSIGHT_ENTRY_QUESTION, secondaryBody: null, hint: null, buttonLabel: "המשך" };
    case "supportive_fallback": {
      const supportive = safeText(thoughtArc?.supportiveThought);
      return {
        title: "מחשבה תומכת",
        body: supportive.length > 0 ? "אפשר להיעזר עכשיו במחשבה התומכת שהכנת מראש:" : "עדיין לא הכנת מחשבה תומכת -- אפשר לכתוב אחת עכשיו, או להמשיך עם עוגן קשב/קידוד בלבד.",
        secondaryBody: supportive.length > 0 ? supportive : null,
        hint: null,
        buttonLabel: "המשך",
      };
    }
    case "supportive_thought_select": {
      const saved = safeText(thoughtArc?.supportiveThought);
      return {
        title: "מחשבה תומכת",
        body: saved.length > 0 ? "אפשר לבחור במחשבה התומכת השמורה, או לכתוב אחת חדשה:" : "אפשר לכתוב מחשבה תומכת לחיזוק.",
        secondaryBody: saved.length > 0 ? saved : null,
        hint: null,
        buttonLabel: "המשך",
      };
    }
    case "supportive_breathing_attention":
      return {
        title: "נשימה טבעית וקשב",
        body: "אפשר לנשימה להמשיך בחופשיות, ולשים לב בעדינות לרגע הנוכחי.",
        secondaryBody: null,
        hint: null,
        buttonLabel: "המשך",
      };
    case "repeat_supportive": {
      const content = resolveThoughtEncodingContent(thoughtArc, state);
      const text = content.text.length > 0 ? content.text : "המחשבה התומכת שבחרת.";
      return { title: "חזרה על המחשבה התומכת", body: text, secondaryBody: null, hint: null, buttonLabel: "המשך" };
    }
    case "gentle_nod": {
      const nod = safeText(thoughtArc?.gentleNodCue);
      return {
        title: "הנהון עדין",
        body: nod.length > 0 ? nod : "הנהן בעדינות, כאילו אתה מאשר את המחשבה הזאת עבור עצמך.",
        secondaryBody: null,
        hint: null,
        buttonLabel: "המשך",
      };
    }
    case "encoding": {
      const content = resolveThoughtEncodingContent(thoughtArc, state);
      const { body, secondaryBody } = resolveModalityEncodingLines(thoughtArc, state.modality, content);
      return { title: "קידוד", body, secondaryBody, hint: null, buttonLabel: "המשך" };
    }
    case "future_insight_action":
      return {
        title: "תובנה ופעולה עתידית",
        body: "בפעם הבאה אני אזכור ש...",
        secondaryBody: "כאשר זה יקרה, אפעל כך...",
        hint: null,
        buttonLabel: "המשך",
      };
    case "future_imagery": {
      const action = safeText(thoughtArc?.shortAction) || safeText(state.actionText);
      return {
        title: "דמיון עתידי",
        body: `דמיין מצב דומה בעתיד. המחשבה עשויה להופיע, ובמקביל אתה נזכר בתובנה או במחשבה התומכת ובוחר לבצע את הפעולה שתכננת${action.length > 0 ? `: ${action}` : "."}`,
        secondaryBody: null,
        hint: null,
        buttonLabel: "המשך",
      };
    }
    case "complete":
      return { title: "סיום", body: "סיימת את ה-ARC Thought.", secondaryBody: null, hint: null, buttonLabel: "סיום" };
  }
}

/** Dwell durations Full ARC Thought uses -- the habit layer has no ARC Map of its own, so these fall back to the exact same defaults Urge already uses (Phase 3), except where ThoughtArc has its own configured override (flexibleAttentionDwellSeconds/futureImageryDwellSeconds -- spec sections 10, 18, 22). */
export function getThoughtLiveDwellSeconds(stage: ThoughtLiveStage, thoughtArc: ThoughtArc | null): number | null {
  switch (stage) {
    case "breathing_stay":
      return DEFAULT_DWELL_TIMES.sensationDwellSeconds;
    case "acceptance":
      return DEFAULT_DWELL_TIMES.acceptanceDwellSeconds;
    case "flexible_attention_1":
    case "flexible_attention_2":
      return thoughtArc?.flexibleAttentionDwellSeconds ?? DEFAULT_DWELL_TIMES.regulationDwellSeconds;
    case "future_imagery":
      return thoughtArc?.futureImageryDwellSeconds ?? DEFAULT_DWELL_TIMES.actionImageryDwellSeconds;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// ARC Mini Thought -- spec sections 20-21: a genuinely short real-time
// protocol, deliberately excluding Presence rating, three Presence
// stages, a separate Stay stage, a separate Acceptance stage, long
// Awareness, long flexible-attention stages, mandatory writing, long
// future imagery, Success Focus, Gratitude, and post-action reflection.
// ---------------------------------------------------------------------------

export type MiniThoughtLiveStage = "recognition" | "modality" | "attention_anchor" | "insight_or_supportive" | "encoding" | "action" | "complete";

export const MINI_THOUGHT_LIVE_STAGE_ORDER: MiniThoughtLiveStage[] = [
  "recognition",
  "modality",
  "attention_anchor",
  "insight_or_supportive",
  "encoding",
  "action",
  "complete",
];

export interface MiniThoughtLiveState {
  modality: ThoughtModality | null;
}

export function createEmptyMiniThoughtLiveState(): MiniThoughtLiveState {
  return { modality: null };
}

export function getFirstMiniThoughtLiveStage(): MiniThoughtLiveStage {
  return "recognition";
}

export interface MiniThoughtLiveStageResult {
  stage: MiniThoughtLiveStage;
  state: MiniThoughtLiveState;
}

export function getNextMiniThoughtLiveStage(current: MiniThoughtLiveStage, state: MiniThoughtLiveState): MiniThoughtLiveStageResult {
  switch (current) {
    case "recognition":
      return { stage: "modality", state };
    case "modality":
      if (state.modality === null) return { stage: current, state };
      return { stage: "attention_anchor", state };
    case "attention_anchor":
      return { stage: "insight_or_supportive", state };
    case "insight_or_supportive":
      return { stage: "encoding", state };
    case "encoding":
      return { stage: "action", state };
    case "action":
      return { stage: "complete", state };
    case "complete":
      return { stage: "complete", state };
  }
}

export interface MiniThoughtContent {
  source: "useful_insight" | "supportive_thought" | "anchor_fallback";
  text: string;
}

/**
 * Spec section 21's own priority order: 1) a saved useful insight (read
 * from the PARENT ThoughtArc's own current usefulInsight -- always the
 * freshest value, never a stale BUILD-time Mini snapshot), 2) the
 * supportive thought saved in BUILD (the Mini's own supportiveThought,
 * inherited from its parent at BUILD time -- arc/miniArc.ts's
 * createLinkedMiniArcDraft -- falling back to the parent's live value
 * when the Mini's own copy was never customized), 3) a safe
 * attention/Encoding-anchor-only fallback, never invented content.
 * Never requires writing a new insight during the real-time session.
 */
export function resolveMiniThoughtContent(build: MiniArcBuild, parentThoughtArc: ThoughtArc | null): MiniThoughtContent {
  const savedInsight = safeText(parentThoughtArc?.usefulInsight);
  if (savedInsight.length > 0) return { source: "useful_insight", text: savedInsight };
  const supportive = safeText(build.supportiveThought) || safeText(parentThoughtArc?.supportiveThought);
  if (supportive.length > 0) return { source: "supportive_thought", text: supportive };
  return { source: "anchor_fallback", text: "" };
}

export interface MiniThoughtLiveStageCopy {
  title: string;
  body: string;
  secondaryBody: string | null;
  buttonLabel: string;
}

/** Pure copy generator for one ARC Mini Thought stage -- never throws, never renders "undefined"/"null" even for a Mini with every optional field missing and no parent. */
export function getMiniThoughtLiveStageCopy(
  stage: MiniThoughtLiveStage,
  build: MiniArcBuild,
  parentThoughtArc: ThoughtArc | null,
  state: MiniThoughtLiveState
): MiniThoughtLiveStageCopy {
  switch (stage) {
    case "recognition":
      return {
        title: "זיהוי קצר",
        body: "שים לב בקצרה למחשבה שנמצאת עכשיו, בלי ליצור אותה מחדש ובלי להעצים אותה.",
        secondaryBody: null,
        buttonLabel: "המשך",
      };
    case "modality":
      return { title: "אופן הופעת המחשבה", body: THOUGHT_MODALITY_QUESTION, secondaryBody: null, buttonLabel: "המשך" };
    case "attention_anchor": {
      const anchor = safeText(build.regulationAnchor);
      return { title: "עוגן קשב", body: anchor.length > 0 ? anchor : "עוגן הקשב שהגדרת.", secondaryBody: null, buttonLabel: "המשך" };
    }
    case "insight_or_supportive": {
      const content = resolveMiniThoughtContent(build, parentThoughtArc);
      return {
        title: "תובנה מועילה או מחשבה תומכת",
        body: content.text.length > 0 ? content.text : "העוגן הקבוע שהגדרת.",
        secondaryBody: null,
        buttonLabel: "המשך",
      };
    }
    case "encoding": {
      const primary = safeText(build.encodingAction);
      const secondary = safeText(build.secondaryEncodingAction);
      const showSecondary = state.modality === "both" && secondary.length > 0;
      return {
        title: "קידוד קצר",
        body: primary.length > 0 ? primary : "פעולת הקידוד שהגדרת.",
        secondaryBody: showSecondary ? secondary : null,
        buttonLabel: "המשך",
      };
    }
    case "action": {
      const action = safeText(build.beneficialAction);
      return { title: "פעולה קצרה", body: action.length > 0 ? action : "הפעולה הקצרה שהגדרת.", secondaryBody: null, buttonLabel: "סיימתי" };
    }
    case "complete":
      return { title: "סיום", body: "סיימת את ה-ARC Mini Thought.", secondaryBody: null, buttonLabel: "סיום" };
  }
}
