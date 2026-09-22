/**
 * arc/combinedFactorPlanCopy.ts
 *
 * Adaptive ARC architecture task, Phase 14B-3: the pure Hebrew content
 * resolver for the per-factor/shared steps arc/combinedFullPlan.ts and
 * arc/combinedMiniPlan.ts produce. Nothing here decides ORDER -- that is
 * each deriver's own job; this module only ever answers "what does step
 * X say," given the already-resolved item(s)/StateProfile.
 *
 * Recovered from WIP commit 60d70d7's own arc/combinedRouteStepCopy.ts,
 * with two corrections for the merged architecture:
 *   - shared_regulation/getBeneficialActionCopy are RETIRED entirely --
 *     the WIP hardcoded unconditional State regulation and a single
 *     StateProfile.action as the only possible final action, both now
 *     wrong (State participation is optional; the final action is the
 *     merged ActionResolutionOutcome, arc/factorAction.ts). Replaced by
 *     getStateRegulationAnchorCopy/getStateDesiredStateEncodingCopy
 *     below, called ONLY when arc/combinedFullPlan.ts/arc/combinedMiniPlan.ts
 *     actually emit a "state_regulation_anchor"/"state_desired_state_encoding"
 *     step (i.e. only when State participates) -- never unconditionally.
 *   - Category-specific processing content no longer reads
 *     item.regulationCue/item.regulationAnchor at all -- Phase 14B-1/14B-2
 *     already established these as legacy, no-longer-BUILD-editable
 *     State-level regulation duplicates, never a factor's own content
 *     (see build/InterferenceItemEditorScreen.tsx's own read-only legacy
 *     section). Urge's own processing content is now its visual/sensory
 *     transformation ALONE. Emotion's own processing content is always
 *     neutral -- its true content lives entirely in the State block
 *     (Emotion's whole purpose is pointing at its supportive State, see
 *     arc/interferenceItem.ts's own EmotionInterferenceItem doc); "support
 *     only where semantically applicable" never means reusing a legacy
 *     field the item no longer owns.
 *
 * Recognition content is deliberately "notice what is already present"
 * framing for every one of the four categories, never an invitation to
 * evoke/intensify/imagine anything not already there -- verified by this
 * module's own tests against arc/instructions.ts's containsInductionPattern
 * (unmodified). Recognition/processing content reads ONLY the item's own
 * fields -- no StateProfile dependency at all, so a no-State route's
 * copy resolves identically to a with-State route's (the two never
 * differ in factor-specific wording).
 */

import type { InterferenceCategory, InterferenceItem } from "./interferenceItem.ts";
import type { StateProfile } from "./stateProfile.ts";
import type { PersonalDevelopmentRouteGoalConnection } from "./personalDevelopmentRouteConfig.ts";

function safeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

// ---------------------------------------------------------------------------
// Recognition -- one per selected factor (Full) or folded into one combined
// line by the caller (Mini, using each factor's own context as source material).
// ---------------------------------------------------------------------------

export interface RecognitionStepCopy {
  framing: string;
  context: string | null;
}

const RECOGNITION_FRAMING: Record<InterferenceCategory, string> = {
  thought: "שים לב למחשבה שעולה עכשיו.",
  belief: "שים לב לאמונה המפריעה שמתעוררת עכשיו.",
  emotion: "שים לב לרגש או לתחושה שנוכחים כרגע.",
  urge: "שים לב לדחף שמופיע כרגע.",
};

function resolveCategoryHeadline(item: InterferenceItem): string | null {
  switch (item.category) {
    case "thought":
      return item.thoughtText;
    case "belief":
      return item.beliefText;
    case "urge":
      return item.urgeName;
    case "emotion":
      return item.emotionName;
  }
}

/** The item's own recognition/context text -- its category headline plus situationContext/triggerInfo/description (common to every category, InterferenceItemBase). Never invents content: a field left unset contributes nothing. null when the item has none of these set at all. Deliberately item-only -- no StateProfile involved (unlike the legacy arc/arcStateComposer.ts's own resolveArcStateEncodingContentFromLibrary, which requires one). */
export function resolveFactorRecognitionContext(item: InterferenceItem): string | null {
  const parts = [resolveCategoryHeadline(item), item.situationContext, item.triggerInfo, item.description].map(safeText).filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join(" ") : null;
}

export function getRecognitionStepCopy(item: InterferenceItem): RecognitionStepCopy {
  return { framing: RECOGNITION_FRAMING[item.category], context: resolveFactorRecognitionContext(item) };
}

// ---------------------------------------------------------------------------
// Category-specific processing (Full) / factor_intervention (Mini) --
// item-only, category-specific field ONLY, never StateProfile.regulationAnchor.
// ---------------------------------------------------------------------------

export interface ProcessingStepCopy {
  /** null when the item has no content of its own for this step -- the caller shows a short neutral continuation, never a repeat of the State block's own line. */
  text: string | null;
}

export const NEUTRAL_PROCESSING_CONTINUATION_LINE = "אפשר להמשיך הלאה.";

/** Emotion never has its own processing content -- its true content lives entirely in the State block (see this module's own header doc). Always returns null; the caller shows NEUTRAL_PROCESSING_CONTINUATION_LINE. */
export function getEmotionProcessingStepCopy(item: InterferenceItem): ProcessingStepCopy {
  if (item.category !== "emotion") return { text: null };
  return { text: null };
}

/** Urge's own visual/sensory transformation ALONE -- never item.regulationAnchor (legacy, see this module's own header doc). */
export function getUrgeProcessingStepCopy(item: InterferenceItem): ProcessingStepCopy {
  if (item.category !== "urge") return { text: null };
  const encoding = item.representationPreference === "sensory" ? safeText(item.sensoryEncodingConfig) || safeText(item.visualEncodingConfig) : safeText(item.visualEncodingConfig) || safeText(item.sensoryEncodingConfig);
  return { text: encoding.length > 0 ? encoding : null };
}

export function getBeliefProcessingStepCopy(item: InterferenceItem): ProcessingStepCopy {
  if (item.category !== "belief") return { text: null };
  const text = safeText(item.supportiveBelief);
  return { text: text.length > 0 ? text : null };
}

export function getThoughtProcessingStepCopy(item: InterferenceItem): ProcessingStepCopy {
  if (item.category !== "thought") return { text: null };
  const text = safeText(item.alternativeInterpretation);
  return { text: text.length > 0 ? text : null };
}

/**
 * Adaptive ARC architecture task, Phase 14B-3: reworded from the WIP's
 * own fixed line -- "דמיין את עצמך ממשיך הלאה..." trips
 * arc/instructions.ts's containsInductionPattern (its own "imagine"
 * guard only sanctions nine specific continuations, none of which is
 * "ממשיך"/continuing). Rewritten to the same future-insight/continuation
 * meaning without the word "דמיין" at all -- confirmed safe by this
 * module's own tests.
 */
export const THOUGHT_FUTURE_INSIGHT_FIXED_LINE = "אפשר להמשיך הלאה, כשהמחשבה הזו כבר אינה תופסת מקום מרכזי.";

/** The item's own processing content, dispatched by category -- the one entry point arc/combinedFullPlan.ts's/arc/combinedMiniPlan.ts's own "processing"/"factor_intervention" steps use. */
export function getFactorProcessingStepCopy(item: InterferenceItem): ProcessingStepCopy {
  switch (item.category) {
    case "emotion":
      return getEmotionProcessingStepCopy(item);
    case "urge":
      return getUrgeProcessingStepCopy(item);
    case "belief":
      return getBeliefProcessingStepCopy(item);
    case "thought":
      return getThoughtProcessingStepCopy(item);
  }
}

// ---------------------------------------------------------------------------
// Shared Stay -- fixed, generic, never per-item, never State-dependent.
// ---------------------------------------------------------------------------

export type SharedStageKind = "shared_stay";

export function getSharedStageCopy(kind: SharedStageKind): { title: string; body: string } {
  void kind;
  return { title: "שהייה", body: "אפשר להישאר לרגע עם מה שנוכח, בלי למהר להיפטר ממנו." };
}

// ---------------------------------------------------------------------------
// Acceptance -- Adaptive ARC architecture task (unified PD/ARC Goal),
// method-completion correction: names the actual disturbance category
// (or a generic phrase when several are selected at once, mirroring Mini's
// own combined_recognition step's "מה שמפריע" phrasing) alongside a
// neutral anchor, and explicitly frames BOTH as allowed to be present --
// never an instruction to evoke, intensify, suppress, or replace the
// disturbance. The neutral anchor reuses the route's own configured State
// regulation anchor (StateProfile.regulationAnchor) when one is available
// -- the same anchor Regulation itself uses one step later, so Acceptance
// and Regulation reference the identical anchor rather than two
// unrelated ones -- and falls back to a fixed, always-available generic
// anchor (feet-floor contact) when no State participates or none is
// configured, so Acceptance is never blocked on State inclusion.
// ---------------------------------------------------------------------------

const ACCEPTANCE_DISTURBANCE_LABEL: Record<InterferenceCategory, string> = {
  thought: "המחשבה המפריעה",
  belief: "האמונה המפריעה",
  urge: "הדחף",
  emotion: "התחושה",
};

const DEFAULT_NEUTRAL_ANCHOR_LINE = "המגע של כפות הרגליים עם הרצפה";

/** The neutral-anchor phrase Acceptance and Regulation both reference -- StateProfile.regulationAnchor when configured, otherwise the fixed, always-available default (feet-floor contact). Never null: an anchor is always available. */
export function resolveNeutralAnchorPhrase(regulationAnchor: string | null | undefined): string {
  const custom = safeText(regulationAnchor);
  return custom.length > 0 ? custom : DEFAULT_NEUTRAL_ANCHOR_LINE;
}

/**
 * `categories` is every DISTINCT category among the session's selected
 * factors (usually one; several when more than one factor was selected
 * for this route) -- a single category is named specifically ("המחשבה
 * המפריעה"/"האמונה המפריעה"/"הדחף"/"התחושה"); more than one falls back
 * to the same generic "מה שמפריע" phrasing arc/combinedFullPlan.ts's own
 * "combined_recognition" step already uses for the identical situation,
 * never inventing a new combined phrase. An empty `categories` array
 * (Presence-only routes with no factor selected) also uses the generic
 * phrase -- there is still a real experience to accept, even without a
 * named disturbing factor.
 */
export function getAcceptanceStepCopy(categories: InterferenceCategory[], regulationAnchor: string | null | undefined): { title: string; body: string } {
  const distinctCategories = [...new Set(categories)];
  const disturbanceLabel = distinctCategories.length === 1 ? ACCEPTANCE_DISTURBANCE_LABEL[distinctCategories[0]] : "מה שמפריע";
  const anchor = resolveNeutralAnchorPhrase(regulationAnchor);
  return {
    title: "קבלה",
    body: `אפשר לשים לב ל${disturbanceLabel}, ובו-זמנית ל${anchor} -- עוגן ניטרלי שנמצא כאן. מותר לשניהם להיות נוכחים יחד, בלי למהר להיפטר מאף אחד מהם.`,
  };
}

// ---------------------------------------------------------------------------
// ARC State block -- ONLY ever called when State genuinely participates
// (arc/combinedFullPlan.ts/arc/combinedMiniPlan.ts only emit these steps
// in that case) -- never a repeat of any factor's own processing content.
// ---------------------------------------------------------------------------

/**
 * Adaptive ARC architecture task (unified PD/ARC Goal), method-completion
 * correction: "full" surfaces StateProfile's own already-real,
 * already-BUILD-configured breathing/posture/gaze content (naturalBreathingAwareness/
 * bodyLanguageCue/gazeCue) alongside the regulation anchor, mirroring
 * regular ARC's own "regulate" ArcStage (arc/stageCopy.ts) reading the
 * equivalent ArcBuildProfile fields -- these StateProfile fields already
 * existed for exactly this purpose (see StateProfile's own doc) but were
 * never actually read here until now. "mini" stays deliberately light --
 * anchor + one merged body-language line, no separate breathing/gaze
 * lines -- mirroring arc/combinedMiniPlan.ts's own documented "no
 * checkpoint or rating of any kind" simplicity for this pair; never the
 * Full richness transplanted onto Mini.
 */
export type CombinedStateCopyMode = "full" | "mini";

export function getStateRegulationAnchorCopy(state: StateProfile, mode: CombinedStateCopyMode = "full"): { title: string; lines: string[] } {
  const anchor = safeText(state.regulationAnchor);
  const bodyLanguage = safeText(state.bodyLanguageCue);
  const lines: string[] = [];
  if (anchor) lines.push(anchor);
  if (mode === "full") {
    const breathing = safeText(state.naturalBreathingAwareness);
    const gaze = safeText(state.gazeCue);
    if (breathing) lines.push(breathing);
    if (bodyLanguage) lines.push(`תנוחת הגוף: ${bodyLanguage}`);
    if (gaze) lines.push(`מבט: ${gaze}`);
  } else if (bodyLanguage) {
    lines.push(bodyLanguage);
  }
  return { title: "ויסות מהמצב הרצוי", lines };
}

/**
 * The State Mantra's own repetition instruction -- "full" honors the
 * saved mantraRepetitionMode (StateProfile's own field, already
 * BUILD-configured, never read by this module until now): "fixed_count"
 * names the saved count, "until_change_noticed" instructs repeating
 * until a change is noticed, "once" (and the mini path, unconditionally)
 * states it plainly once. Distinct from Future Mantra
 * (arc/futureOrientedMantra.ts, an ArcBuildProfile-only concept with no
 * StateProfile equivalent yet -- PD has no per-goal Future Mantra field
 * to read) and from Identity Mantra (EncodingProfile.mantra, regular
 * ARC/ArcGoal only) -- this is State Mantra alone, never conflated with
 * either.
 */
function resolveStateMantraLine(state: StateProfile, mode: CombinedStateCopyMode): string | null {
  const text = safeText(state.stateMantra);
  if (!text) return null;
  if (mode === "mini") return `מנטרת המצב: "${text}".`;
  if (state.mantraRepetitionMode === "fixed_count" && state.mantraFixedRepetitionCount) {
    return `חזור על מנטרת המצב ${state.mantraFixedRepetitionCount} פעמים: "${text}".`;
  }
  if (state.mantraRepetitionMode === "until_change_noticed") {
    return `חזור על מנטרת המצב עד שתבחין בשינוי: "${text}".`;
  }
  return `מנטרת המצב: "${text}".`;
}

export function getStateDesiredStateEncodingCopy(state: StateProfile, mode: CombinedStateCopyMode = "full"): { title: string; lines: string[] } {
  const cue = safeText(state.encodingCue);
  const bodyLanguage = safeText(state.bodyLanguageCue);
  const mantraLine = resolveStateMantraLine(state, mode);
  const lines: string[] = [];
  if (cue) lines.push(cue);
  if (mode === "full") {
    const sensation = safeText(state.desiredBodySensation);
    const location = safeText(state.bodySensationLocation);
    if (sensation) lines.push(location ? `${sensation} (${location})` : sensation);
    if (bodyLanguage) lines.push(`תנוחת הגוף: ${bodyLanguage}`);
  } else {
    const sensation = safeText(state.desiredBodySensation);
    if (sensation) lines.push(sensation);
  }
  if (mantraLine) lines.push(mantraLine);
  return { title: "קידוד המצב הרצוי", lines };
}

/**
 * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 7: the
 * "goal_connection" step's own content -- only ever called when
 * arc/combinedFullPlan.ts actually emits that step (i.e. only when a
 * PersonalDevelopmentRouteGoalConnection is genuinely configured on the
 * route). Reads back exactly the coach-authored fields, never inventing
 * or rephrasing them -- the trainee's own desired result, the value it
 * expresses, and their personal reason it matters, in that order,
 * immediately before Encoding (see arc/combinedFullPlan.ts's own header
 * doc, step 11).
 *
 * Final-review correction: valueText/personalReasonText are BUILD-optional
 * (see build/PersonalDevelopmentRouteEditorScreen.tsx's own "(רשות)"
 * labels) -- a blank optional field is omitted entirely, never rendered
 * as an empty "label: " line. Mirrors arc/arcGoalEngine.ts's own
 * getGoalConnectionStepCopy exactly (same {title, lines} shape, same
 * omit-when-blank rule), so the two tracks' Goal Connection screens never
 * drift into two different blank-field behaviors.
 */
export function getGoalConnectionCopy(goalConnection: PersonalDevelopmentRouteGoalConnection): { title: string; lines: string[] } {
  const lines: string[] = [];
  const desiredResult = safeText(goalConnection.desiredResultText);
  if (desiredResult) lines.push(`התוצאה הרצויה: ${desiredResult}`);
  const value = safeText(goalConnection.valueText);
  if (value) lines.push(`הערך שהיא מבטאת: ${value}`);
  const personalReason = safeText(goalConnection.personalReasonText);
  if (personalReason) lines.push(`הסיבה האישית שלך: ${personalReason}`);
  return { title: "חיבור למטרה", lines };
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
