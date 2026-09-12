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
// ARC Mini Presence
// ---------------------------------------------------------------------------

export type MiniPresenceLiveStage = "notice_present" | "natural_breathing" | "attention_anchor" | "energy_color_or_cue" | "return_to_action" | "complete";

export const MINI_PRESENCE_LIVE_STAGE_ORDER: MiniPresenceLiveStage[] = [
  "notice_present",
  "natural_breathing",
  "attention_anchor",
  "energy_color_or_cue",
  "return_to_action",
  "complete",
];

export function getFirstMiniPresenceLiveStage(): MiniPresenceLiveStage {
  return "notice_present";
}

/** Purely linear -- no decision points, no representation/modality branching (unlike Mini Urge/Thought), matching spec's own fixed 5-step order. */
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
    case "complete":
      return { title: "סיום", body: "סיימת את ה-ARC Mini Presence.", secondaryBody: null, buttonLabel: "סיום" };
  }
}
