/**
 * arc/urgeLive.ts
 *
 * Phase 3 (Full + Mini ARC Urge representation encoding): a NEW,
 * INDEPENDENT engine for the dedicated Full ARC Urge and ARC Mini Urge
 * real-time routes -- deliberately NOT built on arc/arcEngine.ts's
 * shared ArcStage sequencer, mirroring the exact same "independent
 * small engine" precedent arc/miniArc.ts already established for Mini
 * ARC. This keeps every other protocol (State/Identity/regular habit
 * ArcBuild sessions, and the supportive-state route of ARC Goal)
 * completely untouched and at zero regression risk, while giving Full
 * ARC Urge the exact stage order this phase's spec requires (Recognition
 * -> Urge representation -> Preventive stopping action -> Stay ->
 * Acceptance -> Regulation -> Representation-based Encoding ->
 * Beneficial action -> Urge re-rating/check -> completion), which
 * differs from arc/arcEngine.ts's own generic reactive-habit ordering
 * (which has no representation question and, for the ARC-Goal-nested
 * route, showed its stop action BEFORE Recognition instead of after).
 *
 * Reused, never duplicated: arc/mantras.ts's getStayMantraLine/
 * getAcceptanceMantraLine/getRegulationMantraLine/getBridgeMantraLine
 * (UrgeArc's own stayMantra/acceptanceMantra/regulationMantra/
 * bridgeMantra fields are structurally compatible with MantraProfile),
 * arc/naturalBreathing.ts's getFreeBreathingLine, and
 * arc/dwellTimes.ts's DEFAULT_DWELL_TIMES (the habit layer -- which an
 * Urge session always adapts onto -- has no ARC Map of its own and so
 * always resolves to these same defaults; see arc/dwellTimes.ts's own
 * module doc). Never asks the trainee to create, recreate, intensify,
 * or hold the urge longer than necessary -- every recognition-only
 * screen below is worded the same recognition-only way the rest of
 * this app's Awareness/Stay/Accept stages already are.
 */

import type { UrgeArc, UrgeRepresentation } from "./types.ts";
import type { MiniArcBuild } from "./miniArc.ts";
import { getAcceptanceMantraLine, getBridgeMantraLine, getRegulationMantraLine, getStayMantraLine } from "./mantras.ts";
import { getFreeBreathingLine } from "./naturalBreathing.ts";
import { DEFAULT_DWELL_TIMES } from "./dwellTimes.ts";
import {
  createEmptyPostActionCompletionState,
  getMiniPostActionCompletionCopy,
  getNextPostActionCompletionStage,
  getPostActionCompletionCopy,
} from "./postActionCompletion.ts";
import type { PostActionCompletionState } from "./postActionCompletion.ts";

function safeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

// ---------------------------------------------------------------------------
// Full ARC Urge
// ---------------------------------------------------------------------------

export type UrgeLiveStage =
  | "recognition"
  | "representation"
  | "preventive_action"
  | "stay"
  | "accept"
  | "regulate"
  | "encode"
  | "act"
  | "recheck"
  | "action_imagery"
  | "improvement_entry"
  | "improved_action_imagery"
  | "gratitude"
  | "complete";

/** The one fixed order this phase's spec requires (non-looping path -- "recheck" can also loop back to "regulate"/"act", see getNextUrgeLiveStage) -- exported so tests/callers never have to hand-maintain a second copy. Phase 8 (universal post-action completion retrofit) appends action_imagery -> improvement_entry -> improved_action_imagery -> gratitude between "recheck" and "complete". */
export const URGE_LIVE_STAGE_ORDER: UrgeLiveStage[] = [
  "recognition",
  "representation",
  "preventive_action",
  "stay",
  "accept",
  "regulate",
  "encode",
  "act",
  "recheck",
  "action_imagery",
  "improvement_entry",
  "improved_action_imagery",
  "gratitude",
  "complete",
];

export type UrgeRecheckChoice = "repeat_regulation" | "repeat_action" | "alternative_action" | "finish";

export interface UrgeLiveState {
  /**
   * The LIVE-answered representation, spec section 4: "Store the LIVE
   * selection in the current session without overwriting the BUILD
   * preference unless the user explicitly saves the change" -- this
   * state is entirely session-local (never itself written back to the
   * saved UrgeArc), satisfying that requirement structurally: nothing
   * in this module ever mutates a UrgeArc.
   */
  representation: UrgeRepresentation | null;
  recheckChoice: UrgeRecheckChoice | null;
  /** Neutral information only, spec section 11 -- "not a pass/fail score." Never read by getNextUrgeLiveStage's own routing (recheckChoice alone decides the loop), so an unanswered/skipped rating can never block progression. */
  recheckIntensity: number | null;
  /** Safety cap for the recheck loop, mirroring arc/arcEngine.ts's own loopIterationCount pattern -- prevents an unbounded repeat_regulation/repeat_action loop from trapping the trainee. */
  recheckLoopCount: number;
  /** Phase 8 (universal post-action completion retrofit): the shared action_imagery/improvement_entry/improved_action_imagery/gratitude tail's own local answers -- see arc/postActionCompletion.ts. */
  postAction: PostActionCompletionState;
}

export function createEmptyUrgeLiveState(): UrgeLiveState {
  return { representation: null, recheckChoice: null, recheckIntensity: null, recheckLoopCount: 0, postAction: createEmptyPostActionCompletionState() };
}

export const MAX_URGE_RECHECK_LOOPS = 3;

export function getFirstUrgeLiveStage(): UrgeLiveStage {
  return "recognition";
}

/**
 * Phase 7 (ARC State composition), spec section 9.2 ("Urge Encoding:
 * Reuse only the representation-based Encoding part of ARC Urge... Do
 * not rerun Urge Stay, Acceptance or Regulation"): the entry point a
 * combined ARC State session uses once it has already run its own
 * shared Recognition (which captures the urge + its representation
 * preference, per that spec's own "Urge recognition" section),
 * combined Awareness/Stay/Acceptance, and shared Regulation -- starts
 * this exact same engine directly at "encode", never repeating
 * recognition/representation/preventive_action/stay/accept/regulate.
 * Standalone Full ARC Urge is completely unaffected -- getFirstUrgeLiveStage
 * above still starts every independent session at "recognition".
 */
export function getFirstEmbeddedUrgeLiveStage(): UrgeLiveStage {
  return "encode";
}

export interface UrgeLiveStageResult {
  stage: UrgeLiveStage;
  state: UrgeLiveState;
}

/**
 * Pure, total stage transition -- never throws. An unanswered gated
 * stage (representation/recheck) returns itself unchanged, exactly
 * like arc/arcEngine.ts's own getNextArcStage convention ("stays put
 * until answered").
 */
export function getNextUrgeLiveStage(current: UrgeLiveStage, state: UrgeLiveState): UrgeLiveStageResult {
  switch (current) {
    case "recognition":
      return { stage: "representation", state };
    case "representation":
      if (state.representation === null) return { stage: current, state };
      return { stage: "preventive_action", state };
    case "preventive_action":
      return { stage: "stay", state };
    case "stay":
      return { stage: "accept", state };
    case "accept":
      return { stage: "regulate", state };
    case "regulate":
      return { stage: "encode", state };
    case "encode":
      return { stage: "act", state };
    case "act":
      return { stage: "recheck", state };
    case "recheck": {
      if (state.recheckChoice === null) return { stage: current, state };
      // Phase 8 (universal post-action completion retrofit): "finish"
      // and the safety cap both used to jump straight to "complete" --
      // now they continue into the shared post-action tail instead,
      // since the real action has genuinely been performed by this
      // point. Never re-entered by a repeat_regulation/repeat_action
      // loop-back (those still return to "regulate"/"act" below,
      // exactly as before).
      if (state.recheckChoice === "finish") return { stage: "action_imagery", state };
      if (state.recheckLoopCount >= MAX_URGE_RECHECK_LOOPS) {
        // Safety cap reached -- continue forward rather than being marked
        // failure or trapped in a loop (spec section 11: "Do not treat an
        // unchanged or stronger urge as failure").
        return { stage: "action_imagery", state };
      }
      const advanced: UrgeLiveState = { ...state, recheckChoice: null, recheckLoopCount: state.recheckLoopCount + 1 };
      if (state.recheckChoice === "repeat_regulation") return { stage: "regulate", state: advanced };
      // "repeat_action" and "alternative_action" both return to "act" --
      // the alternative action is still performed as THIS session's
      // beneficial action, never a separate stage of its own.
      return { stage: "act", state: advanced };
    }
    case "action_imagery":
    case "improvement_entry":
    case "improved_action_imagery":
    case "gratitude": {
      const hop = getNextPostActionCompletionStage(current, state.postAction);
      return { stage: hop.stage, state: { ...state, postAction: hop.state } };
    }
    case "complete":
      return { stage: "complete", state };
  }
}

export interface UrgeLiveStageCopy {
  title: string;
  body: string;
  secondaryBody: string | null;
  hint: string | null;
  buttonLabel: string;
}

const URGE_REPRESENTATION_OPTIONS: { value: UrgeRepresentation; label: string }[] = [
  { value: "visual", label: "כדימוי" },
  { value: "bodily", label: "כתחושה בגוף" },
  { value: "both", label: "גם כדימוי וגם כתחושה" },
  { value: "unsure", label: "לא בטוח" },
];

export function getUrgeRepresentationOptions(): { value: UrgeRepresentation; label: string }[] {
  return URGE_REPRESENTATION_OPTIONS;
}

/**
 * Representation-based Encoding content, spec sections 9.1-9.4 --
 * shared by both the Full engine (below) and, structurally, the Mini
 * engine's own resolver (which reads a MiniArcBuild's fields instead;
 * see resolveMiniUrgeEncoding). Never claims the original image must
 * disappear (9.1); never instructs erasing/suppressing the existing
 * bodily sensation (9.2); never forces a representation classification
 * on "unsure" (9.4).
 */
function resolveFullEncodingCopy(urgeArc: UrgeArc, representation: UrgeRepresentation): { body: string; secondaryBody: string | null } {
  const visualAction = safeText(urgeArc.visualEncodingAction);
  const alternativeImage = safeText(urgeArc.alternativeDesiredImage);
  const bodilyAction = safeText(urgeArc.bodilyEncodingAction);
  const desiredSensation = safeText(urgeArc.desiredBodilySensation);
  const fallback = safeText(urgeArc.standardFallbackEncodingAction) || safeText(urgeArc.regulationAnchor);

  function visualLines(): { body: string; secondaryBody: string | null } {
    const body = visualAction.length > 0 ? `התמונה שכבר נמצאת יכולה להישאר: ${visualAction}` : "התמונה שכבר נמצאת יכולה להישאר, ואפשר לשנות בעדינות את היחס אליה.";
    const secondaryBody = alternativeImage.length > 0 ? `אפשר גם להוסיף תמונה חלופית, לצד המקורית, המחוברת למה שרוצים לחזק: ${alternativeImage}` : null;
    return { body, secondaryBody };
  }

  function bodilyLines(): { body: string; secondaryBody: string | null } {
    const body =
      "אפשר לתחושה הרצויה להתפשט בהדרגה לצד התחושה שכבר קיימת ולשנות את חוויית הגוף." +
      (desiredSensation.length > 0 ? ` ${desiredSensation}` : "");
    const secondaryBody = bodilyAction.length > 0 ? bodilyAction : null;
    return { body, secondaryBody };
  }

  switch (representation) {
    case "visual":
      return visualLines();
    case "bodily":
      return bodilyLines();
    case "both": {
      // 9.3: "If a primary action was configured in BUILD, show it
      // first." Visual is treated as primary when configured (matching
      // BUILD's own field order); otherwise bodily. Both configured
      // sets of content are shown together -- "allow performing both"
      // -- rather than forcing a single-session choice, avoiding an
      // unnecessary duplicate screen.
      const visual = visualLines();
      const bodily = bodilyLines();
      const primaryFirst = visualAction.length > 0 ? [visual, bodily] : [bodily, visual];
      const body = primaryFirst[0].body;
      const secondaryParts = [primaryFirst[0].secondaryBody, primaryFirst[1].body, primaryFirst[1].secondaryBody].filter(
        (part): part is string => part !== null && part.length > 0
      );
      return { body, secondaryBody: secondaryParts.length > 0 ? secondaryParts.join(" ") : null };
    }
    case "unsure":
      // 9.4: never forces a classification -- standard fallback anchor/action.
      return { body: fallback.length > 0 ? fallback : "אפשר להמשיך עם העוגן הקבוע שהגדרת.", secondaryBody: null };
  }
}

/**
 * Pure copy generator for one Full ARC Urge stage -- never throws,
 * never renders "undefined"/"null"/"[object Object]" even for a
 * legacy UrgeArc missing every Phase-3 field (every field read here is
 * optional/nullable and safely defaulted via safeText).
 */
export function getUrgeLiveStageCopy(stage: UrgeLiveStage, urgeArc: UrgeArc, state: UrgeLiveState): UrgeLiveStageCopy {
  switch (stage) {
    case "recognition": {
      const trigger = urgeArc.mappedTriggers.length > 0 ? urgeArc.mappedTriggers.join(", ") : null;
      return {
        title: "זיהוי",
        body: "שים לב למה שכבר נמצא איתך עכשיו -- בלי ליצור אותו מחדש, בלי להעצים אותו ובלי להישאר איתו יותר מהנדרש.",
        secondaryBody: trigger ? `טריגרים אפשריים: ${trigger}` : null,
        hint: null,
        buttonLabel: "המשך",
      };
    }
    case "representation":
      return {
        title: "אופן הופעת הדחף",
        body: "כיצד הדחף מופיע אצלך עכשיו?",
        secondaryBody: null,
        hint: null,
        buttonLabel: "המשך",
      };
    case "preventive_action": {
      const stopCue = safeText(urgeArc.stopCue);
      return {
        title: "פעולת עצירה מונעת",
        body: stopCue.length > 0 ? stopCue : "אפשר להמשיך גם ללא פעולת עצירה מוגדרת.",
        secondaryBody: null,
        hint: "לדוגמה: הנחת הטלפון בצד, התרחקות מהטריגר, סגירת האפליקציה, שינוי מקום, הנחת חפץ מהיד.",
        buttonLabel: "ביצעתי את פעולת העצירה",
      };
    }
    case "stay": {
      const mantraLine = getStayMantraLine(urgeArc);
      return {
        title: "שהייה",
        body: "אפשר לנשימה להמשיך בחופשיות. שים לב כיצד היא מתרחשת מעצמה, בלי לנסות לשנות אותה.",
        secondaryBody: mantraLine,
        hint: null,
        buttonLabel: "המשך",
      };
    }
    case "accept": {
      const mantraLine = getAcceptanceMantraLine(urgeArc);
      return {
        title: "קבלה",
        body: "אפשר לדחף להיות נוכח לרגע, בלי להילחם בו ובלי לפעול מתוכו.",
        secondaryBody: mantraLine,
        hint: null,
        buttonLabel: "המשך",
      };
    }
    case "regulate": {
      const anchor = safeText(urgeArc.regulationAnchor);
      const regulationMantraLine = getRegulationMantraLine(urgeArc);
      const bridgeMantraLine = getBridgeMantraLine(urgeArc);
      const secondaryParts = [regulationMantraLine, getFreeBreathingLine(), bridgeMantraLine].filter(
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
    case "encode": {
      const representation = state.representation ?? "unsure";
      const { body, secondaryBody } = resolveFullEncodingCopy(urgeArc, representation);
      return { title: "קידוד מותאם", body, secondaryBody, hint: null, buttonLabel: "המשך" };
    }
    case "act": {
      const action = safeText(urgeArc.beneficialAlternativeAction);
      return {
        title: "פעולה מיטיבה",
        body: action.length > 0 ? action : "הפעולה המיטיבה שהגדרת.",
        secondaryBody: null,
        hint: null,
        buttonLabel: "ביצעתי",
      };
    }
    case "recheck":
      return {
        title: "בדיקה חוזרת",
        body: "מה עוצמת הדחף עכשיו?",
        secondaryBody: null,
        hint: null,
        buttonLabel: "המשך",
      };
    case "action_imagery":
    case "improvement_entry":
    case "improved_action_imagery":
    case "gratitude": {
      // Phase 8 (universal post-action completion retrofit): reuses the
      // ONE shared module rather than duplicating this copy -- see
      // arc/postActionCompletion.ts's own module doc.
      const copy = getPostActionCompletionCopy(stage, state.postAction, urgeArc.gratitudePrompt ?? null);
      return { ...copy, hint: null };
    }
    case "complete":
      return { title: "סיום", body: "סיימת את ה-ARC Urge.", secondaryBody: null, hint: null, buttonLabel: "סיום" };
  }
}

/** Every dwell duration Full ARC Urge uses -- the habit layer has no ARC Map of its own, so it always resolves to these exact defaults, unchanged from before this phase (arc/dwellTimes.ts's own module doc), except the two Phase 8 post-action imagery stages, which honor urgeArc.postActionImageryDwellSeconds when configured. Exposed here so a caller never hard-codes its own copy. */
export function getUrgeLiveDwellSeconds(stage: UrgeLiveStage, urgeArc: UrgeArc | null = null): number | null {
  switch (stage) {
    case "stay":
      return DEFAULT_DWELL_TIMES.sensationDwellSeconds;
    case "accept":
      return DEFAULT_DWELL_TIMES.acceptanceDwellSeconds;
    case "regulate":
      return DEFAULT_DWELL_TIMES.regulationDwellSeconds;
    case "encode":
      return DEFAULT_DWELL_TIMES.encodingDwellSeconds;
    case "action_imagery":
      return urgeArc?.postActionImageryDwellSeconds ?? DEFAULT_DWELL_TIMES.completedActionImageryDwellSeconds;
    case "improved_action_imagery":
      return urgeArc?.postActionImageryDwellSeconds ?? DEFAULT_DWELL_TIMES.improvedActionImageryDwellSeconds;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// ARC Mini Urge -- spec sections 13-18: a genuinely short real-time
// protocol, deliberately excluding Presence rating, three Presence
// stages, a separate Stay stage, a separate Acceptance stage, long
// Awareness, Updated Sensation as its own stage, long Action Imagery,
// Success Focus, and additional writing screens. Phase 8 (universal
// post-action completion retrofit) DOES add its own compact tail
// (action_imagery -> gratitude, arc/postActionCompletion.ts's own
// Mini shape) -- overriding the previous rule that Mini ARC always
// ended immediately after the beneficial action, per that phase's own
// saved requirement. Still no Success Focus, no written improvement,
// no improved-action imagery -- Mini stays lightweight by design.
// ---------------------------------------------------------------------------

export type MiniUrgeLiveStage = "recognition" | "representation" | "preventive_action" | "regulate" | "encode" | "act" | "action_imagery" | "gratitude" | "complete";

export const MINI_URGE_LIVE_STAGE_ORDER: MiniUrgeLiveStage[] = [
  "recognition",
  "representation",
  "preventive_action",
  "regulate",
  "encode",
  "act",
  "action_imagery",
  "gratitude",
  "complete",
];

export interface MiniUrgeLiveState {
  representation: UrgeRepresentation | null;
}

export function createEmptyMiniUrgeLiveState(): MiniUrgeLiveState {
  return { representation: null };
}

export function getFirstMiniUrgeLiveStage(): MiniUrgeLiveStage {
  return "recognition";
}

export interface MiniUrgeLiveStageResult {
  stage: MiniUrgeLiveStage;
  state: MiniUrgeLiveState;
}

export function getNextMiniUrgeLiveStage(current: MiniUrgeLiveStage, state: MiniUrgeLiveState): MiniUrgeLiveStageResult {
  switch (current) {
    case "recognition":
      return { stage: "representation", state };
    case "representation":
      if (state.representation === null) return { stage: current, state };
      return { stage: "preventive_action", state };
    case "preventive_action":
      return { stage: "regulate", state };
    case "regulate":
      return { stage: "encode", state };
    case "encode":
      return { stage: "act", state };
    case "act":
      return { stage: "action_imagery", state };
    case "action_imagery":
      return { stage: "gratitude", state };
    case "gratitude":
      return { stage: "complete", state };
    case "complete":
      return { stage: "complete", state };
  }
}

export interface MiniUrgeEncodingCopy {
  body: string;
  /** Only present when representation is "both" and a secondary action is configured -- an optional quick-switch line, never required (spec section 17: "do not require both"). */
  secondaryAction: string | null;
}

/**
 * Spec section 17: exactly one primary preconfigured Encoding action,
 * with an optional quick-switch secondary only for "both". The trainee
 * never configures this choice live -- it must come from BUILD (the
 * Mini's own encodingAction/secondaryEncodingAction/representationPreference,
 * inheriting compatible values from its parent UrgeArc at BUILD time
 * only, per arc/miniArc.ts's createLinkedMiniArcDraft).
 */
export function resolveMiniUrgeEncoding(build: MiniArcBuild, representation: UrgeRepresentation): MiniUrgeEncodingCopy {
  const primary = safeText(build.encodingAction);
  const secondary = safeText(build.secondaryEncodingAction);
  if (representation === "both") {
    return { body: primary.length > 0 ? primary : "פעולת הקידוד שהגדרת.", secondaryAction: secondary.length > 0 ? secondary : null };
  }
  // "visual"/"bodily"/"unsure" all use the one primary action -- Mini
  // Urge never asks the trainee to classify further than BUILD already
  // did (spec section 17's own "unsure -> standard Mini fallback" is
  // satisfied by the same primary action every other representation
  // already uses, since Mini has only one preconfigured action, not a
  // separate visual/bodily pair like the Full protocol).
  return { body: primary.length > 0 ? primary : "פעולת הקידוד שהגדרת.", secondaryAction: null };
}

export interface MiniUrgeLiveStageCopy {
  title: string;
  body: string;
  secondaryBody: string | null;
  buttonLabel: string;
}

/** Pure copy generator for one ARC Mini Urge stage -- never throws, never renders "undefined"/"null" even for a Mini with every optional field missing. */
export function getMiniUrgeLiveStageCopy(stage: MiniUrgeLiveStage, build: MiniArcBuild, state: MiniUrgeLiveState): MiniUrgeLiveStageCopy {
  switch (stage) {
    case "recognition":
      return { title: "זיהוי קצר", body: "שים לב בקצרה לדחף שנמצא עכשיו, בלי ליצור אותו מחדש ובלי להעצים אותו.", secondaryBody: null, buttonLabel: "המשך" };
    case "representation":
      return { title: "אופן הופעת הדחף", body: "כיצד הדחף מופיע אצלך עכשיו?", secondaryBody: null, buttonLabel: "המשך" };
    case "preventive_action": {
      const stopCue = safeText(build.preventiveStoppingAction);
      return {
        title: "פעולת עצירה מונעת",
        body: stopCue.length > 0 ? stopCue : "אפשר להמשיך גם ללא פעולת עצירה מוגדרת.",
        secondaryBody: null,
        buttonLabel: "ביצעתי",
      };
    }
    case "regulate": {
      const anchor = safeText(build.regulationAnchor);
      return { title: "ויסות קצר", body: anchor.length > 0 ? anchor : "עוגן הוויסות שהגדרת.", secondaryBody: null, buttonLabel: "המשך" };
    }
    case "encode": {
      const representation = state.representation ?? "unsure";
      const { body, secondaryAction } = resolveMiniUrgeEncoding(build, representation);
      return { title: "קידוד קצר", body, secondaryBody: secondaryAction, buttonLabel: "המשך" };
    }
    case "act": {
      const action = safeText(build.beneficialAction);
      return { title: "פעולה מיטיבה", body: action.length > 0 ? action : "הפעולה המיטיבה שהגדרת.", secondaryBody: null, buttonLabel: "סיימתי" };
    }
    case "action_imagery":
    case "gratitude": {
      // Phase 8 (universal post-action completion retrofit): reuses the
      // ONE shared Mini module -- see arc/postActionCompletion.ts.
      const copy = getMiniPostActionCompletionCopy(stage, build.miniGratitudePrompt ?? null);
      return copy;
    }
    case "complete":
      return { title: "סיום", body: "סיימת את ה-ARC Mini Urge.", secondaryBody: null, buttonLabel: "סיום" };
  }
}

/** Phase 8: Mini Urge's own compact post-action imagery dwell -- mirrors arc/beliefLive.ts's getMiniBeliefActionImageryDwellSeconds exactly, reusing the SAME generic MiniArcBuild field (miniActionImageryDwellSeconds) Belief Mini already established, never a second field name. */
export function getMiniUrgeActionImageryDwellSeconds(build: MiniArcBuild): number {
  return build.miniActionImageryDwellSeconds ?? 5;
}
