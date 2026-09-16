/**
 * arc/proactiveStatePractice.ts
 *
 * Adaptive ARC architecture task, Phase 14B-3: the proactive "nothing is
 * interfering right now -- I want to strengthen this State" pipeline.
 * Recovered from WIP commit 60d70d7 with its one broken dependency fixed
 * (see below) -- otherwise unchanged, since fresh inspection confirms it
 * already matches the approved architecture exactly: State-only, no
 * factor choice, no factor ratings, no factor checkpoints, no
 * Recognition/Stay/Acceptance/cognitive-reassessment step (none has a
 * defined proactive meaning), and it never fabricates a disturbing
 * factor to satisfy arc/combinedFactorPlan.ts's own shape -- this module
 * deliberately does NOT go through that resolver at all, since a
 * ResolvedCombinedFactorPlan always requires at least one factor or
 * Presence, neither of which a proactive session has by definition.
 *
 * Uses only the State's own action (state.action) -- never an
 * ActionRelationship question (arc/factorAction.ts), since there is no
 * factor here for a State action to relate to.
 *
 * If linked Full Presence is selected for a proactive session, it runs
 * through the same in-process reused Presence engine a future LIVE phase
 * wires (out of scope here) -- but that Presence sub-session's own
 * internal rating is never folded into arc/factorRating.ts's checkpoint
 * history (that module's own rating model exists for reactive Full
 * combined practice only).
 */

import type { StateProfile } from "./stateProfile.ts";

export type ProactiveStatePracticeStepKind = "state_intention" | "embodiment" | "state_mantra" | "encoding" | "beneficial_action";

export const PROACTIVE_STATE_PRACTICE_STEP_ORDER: ProactiveStatePracticeStepKind[] = ["state_intention", "embodiment", "state_mantra", "encoding", "beneficial_action"];

export function getFirstProactiveStatePracticeStep(): ProactiveStatePracticeStepKind {
  return "state_intention";
}

/** Pure, total, linear -- never loops back, never branches. null means the fixed sequence is finished (the caller then continues into its own optional Presence step and/or beneficial_action, per a later LIVE phase's own controller). */
export function getNextProactiveStatePracticeStep(current: ProactiveStatePracticeStepKind): ProactiveStatePracticeStepKind | null {
  const index = PROACTIVE_STATE_PRACTICE_STEP_ORDER.indexOf(current);
  return PROACTIVE_STATE_PRACTICE_STEP_ORDER[index + 1] ?? null;
}

function safeText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export interface ProactiveStatePracticeStepCopy {
  title: string;
  body: string;
  durationMinutes: number | null;
}

/** Every line here reads only already-existing StateProfile fields -- never invents new BUILD content. Blank fields fall back to a short generic line, never fabricated specifics. */
export function getProactiveStatePracticeStepCopy(kind: ProactiveStatePracticeStepKind, state: StateProfile): ProactiveStatePracticeStepCopy {
  switch (kind) {
    case "state_intention": {
      const purpose = safeText(state.purpose);
      return { title: "כוונה למצב", body: purpose.length > 0 ? purpose : "הכוונה לחיזוק המצב הזה.", durationMinutes: null };
    }
    case "embodiment": {
      const parts = [state.regulationAnchor, state.bodyLanguageCue, state.gazeCue, state.naturalBreathingAwareness, state.desiredBodySensation, state.bodySensationLocation, state.energyColor]
        .map((part) => safeText(part))
        .filter((part) => part.length > 0);
      return { title: "גוף ותנוחה", body: parts.length > 0 ? parts.join(" ") : "אפשר לשים לב לגוף ולתנוחה התומכת במצב הזה.", durationMinutes: null };
    }
    case "state_mantra": {
      const mantra = safeText(state.stateMantra);
      return { title: "משפט המצב", body: mantra.length > 0 ? mantra : "אפשר לחזור בשקט על משפט המצב שלך.", durationMinutes: null };
    }
    case "encoding": {
      const encoding = safeText(state.encodingCue);
      return { title: "קידוד", body: encoding.length > 0 ? encoding : "אפשר לחזק את הרמז שמסמן עבורך את המצב הזה.", durationMinutes: null };
    }
    case "beneficial_action": {
      // Adaptive ARC architecture task, Phase 14B-3: fixed -- the WIP's
      // own import of the now-retired getBeneficialActionCopy (which
      // hardcoded StateProfile.action as the only possible final action)
      // is replaced by reading state.action directly. That assumption is
      // CORRECT here specifically (unlike the combined-factor case,
      // proactive practice has no factor at all to relate the State
      // action to), so no ActionRelationship/ActionResolutionOutcome
      // machinery is needed.
      const action = safeText(state.action);
      return {
        title: "פעולה מיטיבה",
        body: action.length > 0 ? action : "הפעולה המיטיבה שהגדרת עבור המצב הזה.",
        durationMinutes: state.actionTimerConfig?.durationMinutes ?? null,
      };
    }
  }
}
