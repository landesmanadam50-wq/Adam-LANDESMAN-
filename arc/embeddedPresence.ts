/**
 * arc/embeddedPresence.ts
 *
 * Adaptive ARC architecture task, Phase 12: the short, compact grounding
 * sequence a combined route offers when a trainee remains stuck after
 * Thought/Belief work but full Presence was not explicitly configured
 * (arc/combinedRoute.ts's own PresenceRouteDecision === "embedded").
 *
 * Deliberately NOT the full ARC Presence protocol (arc/presenceLive.ts,
 * completely untouched by this phase, still reachable through its own
 * existing standalone screen) and not ARC Mini Presence either (which
 * still requires a saved MiniArcBuild with its own presenceColor/
 * regulationAnchor/encodingAction/beneficialAction). This module has:
 *   - no Presence rating,
 *   - no loop,
 *   - no saved PresenceArc/MiniArcBuild requirement,
 *   - no full-Presence completion meaning (arc/combinedRoute.ts's own
 *     resolveFinalPresenceMode never maps this onto "full"),
 *   - and never automatically restarts Thought or Belief afterward --
 *     a combined route's own plan (arc/combinedRoute.ts) always
 *     continues straight to beneficial_action_boundary next, never back
 *     to an earlier step.
 *
 * A brand-new, separate module -- never folded into
 * arc/arcStateComposer.ts (the legacy composer stays completely
 * untouched by this phase, per this task's own approved boundary).
 *
 * The natural-breathing step reuses arc/naturalBreathing.ts's own
 * getFreeBreathingLine() verbatim -- never a fourth copy of that exact
 * literal string (already used, hardcoded, in arc/thoughtLive.ts's own
 * "breathing_stay" case and in build/StateProfileEditorScreen.tsx's own
 * guidance text; this module is the first to call the shared function
 * itself rather than repeating the string).
 *
 * Pure logic only -- nothing in this repository calls any of this yet.
 */

import { getFreeBreathingLine } from "./naturalBreathing.ts";

export type EmbeddedPresenceStage = "visual_field" | "body_contact" | "natural_breathing" | "present_environment" | "complete";

export const EMBEDDED_PRESENCE_STAGE_ORDER: EmbeddedPresenceStage[] = ["visual_field", "body_contact", "natural_breathing", "present_environment", "complete"];

export function getFirstEmbeddedPresenceStage(): EmbeddedPresenceStage {
  return "visual_field";
}

/** Pure, total, linear -- never throws, never loops back. Reaching "complete" and calling this again just returns "complete" again. */
export function getNextEmbeddedPresenceStage(current: EmbeddedPresenceStage): EmbeddedPresenceStage {
  switch (current) {
    case "visual_field":
      return "body_contact";
    case "body_contact":
      return "natural_breathing";
    case "natural_breathing":
      return "present_environment";
    case "present_environment":
      return "complete";
    case "complete":
      return "complete";
  }
}

export function isEmbeddedPresenceComplete(stage: EmbeddedPresenceStage): boolean {
  return stage === "complete";
}

/** The exact, fixed instruction line for one stage -- null only for "complete" (nothing left to instruct). No parameters: nothing here is session/profile-specific, matching getFreeBreathingLine's own "fixed text" shape. */
export function getEmbeddedPresenceStageCopy(stage: EmbeddedPresenceStage): string | null {
  switch (stage) {
    case "visual_field":
      return "אפשר למבט להתרחב בעדינות ולשים לב גם למה שנמצא סביבך.";
    case "body_contact":
      return "שים לב לנקודות המגע של הגוף עם הרצפה, הכיסא או המשטח.";
    case "natural_breathing":
      return getFreeBreathingLine();
    case "present_environment":
      return "שים לב לדבר אחד שאתה רואה, לדבר אחד שאתה שומע ולתחושה אחת בגוף.";
    case "complete":
      return null;
  }
}
