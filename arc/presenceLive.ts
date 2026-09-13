/**
 * arc/presenceLive.ts
 *
 * Phase 5 (ARC Presence and ARC Mini Presence) -- deliberately NOT
 * mirroring arc/urgeLive.ts/arc/thoughtLive.ts's own "brand-new
 * independent engine" pattern. Per explicit instruction: "Reuse the
 * existing Presence implementation and preserve its own stages,
 * rating-based routing, dwell times, natural-breathing instruction,
 * Energy Color in the Body and current anchors."
 *
 * Full ARC Presence: presenceArcToProfile below is a pure, never-
 * persisted adapter from a PresenceArc onto the EXISTING, unmodified
 * arc/arcEngine.ts Presence stages (presence_check/presence_grounding/
 * arc_thought_awareness/arc_thought_combined_attention/
 * arc_thought_expand_presence/arc_thought_presence_recheck) --
 * mirroring arc/arcGoalEngine.ts's own urgeArcToProfile exactly. The
 * driving screen (live/PresenceArcLiveScreen.tsx) runs the SAME
 * advanceLiveSession/ArcLiveRenderer machinery every other ARC session
 * already uses, with triggerType "proactive" (the same convention
 * arc/arcGoalEngine.ts's createArcGoalOuterInitialSession already uses
 * to resolve trigger_selection straight into presence_check, unchanged)
 * -- so EVERY existing Presence behavior (the 7-10 vs 1-5 rating split
 * at ARC_CONFIG.presence.threshold, the recheck/loop-back logic capped
 * at ARC_CONFIG.safety.maxLoopIterations, the Energy Color line, the
 * free natural-breathing line, the configurable Presence dwell, the
 * session-only environmental-object-grounding anchor) is inherited
 * automatically, with zero duplicated logic anywhere in this file.
 * This is also exactly what makes Full ARC Presence "reusable later
 * inside ARC State and other parent protocols": a later phase can
 * simply keep advancing the SAME session past PRESENCE_EXIT_STAGE
 * instead of stopping there, through the identical already-working
 * engine.
 *
 * ARC Mini Presence: a genuinely short, separate real-time protocol
 * (spec: "Notice what is present now -> natural breathing -> one
 * selected Presence/attention anchor -> Energy Color or one short
 * Presence cue -> return to the intended action"), reusing
 * MiniArcBuild's own EXISTING required fields (presenceColor --
 * already mandatory on every Mini ARC since its original 5-field
 * design -- regulationAnchor, encodingAction, beneficialAction) with
 * NO new MiniArcBuild fields needed at all.
 */

import type { ArcBuildProfile, ArcLiveState, ArcStage, DevelopmentLayer, DwellTimes, PresenceArc } from "./types.ts";
import { createEmptyArcBuildProfile, createEmptyLiveState } from "./types.ts";
import type { MiniArcBuild } from "./miniArc.ts";
import { safeText } from "./miniArc.ts";
import { getFreeBreathingLine } from "./naturalBreathing.ts";
import { getEnergyColorLine } from "./presenceColor.ts";
import { DEFAULT_DWELL_TIMES } from "./dwellTimes.ts";
import {
  createEmptyPostActionCompletionState,
  getMiniPostActionCompletionCopy,
  getNextPostActionCompletionStage,
  getPostActionCompletionCopy,
} from "./postActionCompletion.ts";
import type { PostActionCompletionState } from "./postActionCompletion.ts";

/**
 * Pure adapter -- every OTHER ArcBuildProfile field is left at
 * createEmptyArcBuildProfile()'s own safe default: the Presence stages
 * never read them, so leaving them null can never leak stray BUILD
 * data into this session (same guarantee arc/arcGoalEngine.ts's own
 * urgeArcToProfile already documents). activeLayers is ["state"],
 * arbitrarily -- resolvePresenceDwellSeconds reads
 * profile.stateDwellTimes first when "state" is active, so the
 * optional dwell override below actually takes effect; the Presence
 * stages themselves never branch on WHICH layer is active. Only the
 * one relevant field (presenceDwellSeconds) is set on stateDwellTimes
 * -- it's a Partial<DwellTimes>, exactly like a real ARC Map's own
 * partially-customized dwell set, so resolveDwellSecondsFor's own
 * per-field DEFAULT_DWELL_TIMES fallback (never called by the Presence
 * stages, which only ever read presenceDwellSeconds here) needs no
 * help from this adapter.
 */
export function presenceArcToProfile(presenceArc: PresenceArc): { profile: ArcBuildProfile; activeLayers: DevelopmentLayer[] } {
  const stateDwellTimes: Partial<DwellTimes> | null = presenceArc.presenceDwellSeconds != null ? { presenceDwellSeconds: presenceArc.presenceDwellSeconds } : null;
  const profile: ArcBuildProfile = {
    ...createEmptyArcBuildProfile(),
    presenceColor: presenceArc.presenceColor,
    stateDwellTimes,
  };
  return { profile, activeLayers: ["state"] };
}

/**
 * Every ArcStage the existing Presence implementation can ever produce
 * for a proactive session started directly at presence_check -- used
 * only for documentation/tests; the driving screen's own stopping rule
 * is the simpler, single PRESENCE_EXIT_STAGE check below (proactive
 * sessions only ever leave the Presence set by reaching that one
 * stage).
 */
export const PRESENCE_STAGE_SET: ArcStage[] = [
  "presence_check",
  "presence_grounding",
  "arc_thought_awareness",
  "arc_thought_combined_attention",
  "arc_thought_expand_presence",
  "arc_thought_presence_recheck",
];

/**
 * The exact stage arc/arcEngine.ts's afterArcThought(...) resolves to
 * for a "proactive" session (see that function's own body: proactive
 * always continues to "desired_state_check", never "sensation_check")
 * -- both the 7-10 short route (via presence_grounding) and the 1-5
 * full loop (via arc_thought_presence_recheck, once no longer below
 * threshold or the safety cap is reached) land here. The driving
 * screen never actually renders this stage: reaching it means Presence
 * work is complete, exactly the natural "reusable later inside ARC
 * State" hand-off point a later phase can continue past instead of
 * stopping at.
 */
export const PRESENCE_EXIT_STAGE: ArcStage = "desired_state_check";

export function isPresenceComplete(stage: ArcStage): boolean {
  return stage === PRESENCE_EXIT_STAGE;
}

/**
 * The standalone Presence session's own starting ArcLiveState --
 * triggerType pre-set to "proactive", mirroring
 * arc/arcGoalEngine.ts's own createArcGoalOuterInitialSession exactly
 * (same reasoning: Full ARC Presence is inherently goal-directed here
 * too, never asking the trainee to pick a trigger). The driving
 * screen's very first getNextArcStage("trigger_selection", ...) call
 * against this resolves in one unconditional hop straight to
 * "presence_check" -- trigger_selection itself is never rendered.
 */
export function createPresenceArcInitialSession(): ArcLiveState {
  return { ...createEmptyLiveState(), triggerType: "proactive" };
}

// ---------------------------------------------------------------------------
// Phase 8 (universal post-action completion retrofit): Full ARC Presence
// previously stopped the instant the reused arc/arcEngine.ts session
// reached PRESENCE_EXIT_STAGE -- with no action concept of its own at
// all (unlike Urge/Thought, Presence never asked the trainee to actually
// DO anything). This small, separate, NEW local sub-engine picks up
// exactly where the reused engine leaves off: a genuine "action" stage
// (the trainee actually performs presenceArc.beneficialAction now),
// followed by the shared post-action tail (see
// arc/postActionCompletion.ts's own module doc). It deliberately does
// NOT touch arc/arcEngine.ts or the reused Presence stages themselves --
// the driving screen (live/PresenceArcLiveScreen.tsx) switches from the
// reused engine to THIS one only once isPresenceComplete(...) is true.
// ---------------------------------------------------------------------------

export type PresenceActionLiveStage = "action" | "action_imagery" | "improvement_entry" | "improved_action_imagery" | "gratitude" | "complete";

export const PRESENCE_ACTION_LIVE_STAGE_ORDER: PresenceActionLiveStage[] = ["action", "action_imagery", "improvement_entry", "improved_action_imagery", "gratitude", "complete"];

export interface PresenceActionLiveState {
  postAction: PostActionCompletionState;
}

export function createEmptyPresenceActionLiveState(): PresenceActionLiveState {
  return { postAction: createEmptyPostActionCompletionState() };
}

export function getFirstPresenceActionLiveStage(): PresenceActionLiveStage {
  return "action";
}

export interface PresenceActionLiveStageResult {
  stage: PresenceActionLiveStage;
  state: PresenceActionLiveState;
}

/** Pure, total, never throws, never gates -- "action" is a real performed-action confirmation (like Urge's own "act"/Thought's own "action"), never blocking progression. */
export function getNextPresenceActionLiveStage(current: PresenceActionLiveStage, state: PresenceActionLiveState): PresenceActionLiveStageResult {
  switch (current) {
    case "action":
      return { stage: "action_imagery", state };
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

export interface PresenceActionLiveStageCopy {
  title: string;
  body: string;
  secondaryBody: string | null;
  buttonLabel: string;
}

/** Pure copy generator -- never throws, never renders "undefined"/"null" even for a legacy PresenceArc missing every Phase 8 field. */
export function getPresenceActionLiveStageCopy(stage: PresenceActionLiveStage, presenceArc: PresenceArc, state: PresenceActionLiveState): PresenceActionLiveStageCopy {
  switch (stage) {
    case "action": {
      const action = safeText(presenceArc.beneficialAction);
      return { title: "פעולה מיטיבה", body: action.length > 0 ? action : "הפעולה המיטיבה שהגדרת.", secondaryBody: null, buttonLabel: "ביצעתי" };
    }
    case "action_imagery":
    case "improvement_entry":
    case "improved_action_imagery":
    case "gratitude": {
      // Phase 8: reuses the ONE shared module -- see
      // arc/postActionCompletion.ts's own module doc.
      const copy = getPostActionCompletionCopy(stage, state.postAction, presenceArc.gratitudePrompt ?? null);
      return copy;
    }
    case "complete":
      return { title: "סיום", body: "סיימת את ה-ARC Presence.", secondaryBody: null, buttonLabel: "סיום" };
  }
}

/** Dwell durations for the two post-action imagery stages -- honors presenceArc.postActionImageryDwellSeconds when configured, otherwise the same shared defaults Urge/Thought already use. */
export function getPresenceActionLiveDwellSeconds(stage: PresenceActionLiveStage, presenceArc: PresenceArc | null): number | null {
  switch (stage) {
    case "action_imagery":
      return presenceArc?.postActionImageryDwellSeconds ?? DEFAULT_DWELL_TIMES.completedActionImageryDwellSeconds;
    case "improved_action_imagery":
      return presenceArc?.postActionImageryDwellSeconds ?? DEFAULT_DWELL_TIMES.improvedActionImageryDwellSeconds;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// ARC Mini Presence
// ---------------------------------------------------------------------------

// Phase 8 (universal post-action completion retrofit): "return_to_action"
// already serves as Mini Presence's own de facto action step (spec
// wording "return to the intended action") -- DOES gain the compact
// tail (action_imagery -> gratitude) right after it, overriding the
// previous rule that Mini ARC always ended immediately after the
// beneficial action, per that phase's own saved requirement. Still no
// written improvement, no improved-action imagery.
export type MiniPresenceLiveStage = "notice_present" | "natural_breathing" | "attention_anchor" | "energy_color_or_cue" | "return_to_action" | "action_imagery" | "gratitude" | "complete";

export const MINI_PRESENCE_LIVE_STAGE_ORDER: MiniPresenceLiveStage[] = [
  "notice_present",
  "natural_breathing",
  "attention_anchor",
  "energy_color_or_cue",
  "return_to_action",
  "action_imagery",
  "gratitude",
  "complete",
];

export function getFirstMiniPresenceLiveStage(): MiniPresenceLiveStage {
  return "notice_present";
}

/** Purely linear -- no decision points, no representation/modality branching (unlike Mini Urge/Thought), matching spec's own fixed order (now extended with Phase 8's compact post-action tail). */
export function getNextMiniPresenceLiveStage(current: MiniPresenceLiveStage): MiniPresenceLiveStage {
  switch (current) {
    case "notice_present":
      return "natural_breathing";
    case "natural_breathing":
      return "attention_anchor";
    case "attention_anchor":
      return "energy_color_or_cue";
    case "energy_color_or_cue":
      return "return_to_action";
    case "return_to_action":
      return "action_imagery";
    case "action_imagery":
      return "gratitude";
    case "gratitude":
      return "complete";
    case "complete":
      return "complete";
  }
}

export interface MiniPresenceLiveStageCopy {
  title: string;
  body: string;
  secondaryBody: string | null;
  buttonLabel: string;
}

/** Pure copy generator for one ARC Mini Presence stage -- never throws, never renders "undefined"/"null" even for a Mini with every optional field missing. Reuses getFreeBreathingLine/getEnergyColorLine verbatim -- never a duplicated wording. */
export function getMiniPresenceLiveStageCopy(stage: MiniPresenceLiveStage, build: MiniArcBuild): MiniPresenceLiveStageCopy {
  switch (stage) {
    case "notice_present":
      return {
        title: "שים לב למה שנמצא",
        body: "שים לב בקצרה למה שכבר נמצא איתך עכשיו, בלי ליצור אותו מחדש ובלי להעצים אותו.",
        secondaryBody: null,
        buttonLabel: "המשך",
      };
    case "natural_breathing":
      return {
        title: "נשימה טבעית",
        body: getFreeBreathingLine(),
        secondaryBody: null,
        buttonLabel: "המשך",
      };
    case "attention_anchor": {
      const anchor = safeText(build.regulationAnchor);
      return { title: "עוגן קשב/נוכחות", body: anchor.length > 0 ? anchor : "עוגן הקשב שהגדרת.", secondaryBody: null, buttonLabel: "המשך" };
    }
    case "energy_color_or_cue": {
      const energyColorLine = getEnergyColorLine(build.presenceColor);
      const cue = safeText(build.encodingAction);
      return {
        title: "צבע האנרגיה",
        body: energyColorLine ?? (cue.length > 0 ? cue : "צבע האנרגיה או רמז הנוכחות שהגדרת."),
        secondaryBody: energyColorLine && cue.length > 0 ? cue : null,
        buttonLabel: "המשך",
      };
    }
    case "return_to_action": {
      const action = safeText(build.beneficialAction);
      return { title: "חזרה לפעולה המיועדת", body: action.length > 0 ? action : "הפעולה המיועדת שהגדרת.", secondaryBody: null, buttonLabel: "סיימתי" };
    }
    case "action_imagery":
    case "gratitude": {
      // Phase 8 (universal post-action completion retrofit): reuses the
      // ONE shared Mini module -- see arc/postActionCompletion.ts.
      const copy = getMiniPostActionCompletionCopy(stage, build.miniGratitudePrompt ?? null);
      return copy;
    }
    case "complete":
      return { title: "סיום", body: "סיימת את ה-ARC Mini Presence.", secondaryBody: null, buttonLabel: "סיום" };
  }
}

/** Phase 8: Mini Presence's own compact post-action imagery dwell -- mirrors getMiniUrgeActionImageryDwellSeconds/getMiniThoughtActionImageryDwellSeconds exactly, reusing the SAME generic MiniArcBuild field (miniActionImageryDwellSeconds), never a second field name. */
export function getMiniPresenceActionImageryDwellSeconds(build: MiniArcBuild): number {
  return build.miniActionImageryDwellSeconds ?? 5;
}
