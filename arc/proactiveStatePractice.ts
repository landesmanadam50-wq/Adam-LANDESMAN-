/**
 * arc/proactiveStatePractice.ts
 *
 * Adaptive ARC architecture task, Phase 14B: the proactive "nothing is
 * interfering right now -- I want to strengthen this State" pipeline.
 * Deliberately NOT routed through arc/combinedRoute.ts at all --
 * buildCombinedRoutePlan/buildCombinedRouteCoreSteps short-circuit the
 * instant selectedItems is empty, so this is a genuinely separate, fixed
 * linear sequence built only from existing StateProfile fields. No
 * Recognition, Stay, Acceptance, cognitive reassessment, or Embedded
 * Presence step exists here -- none has a defined proactive meaning, and
 * the three reactive Full rating checkpoints (arc/factorRating.ts) are
 * defined entirely around Awareness/Stay+Acceptance/Regulation, none of
 * which occurs in this route, so they are never fabricated here either.
 *
 * If linked Full Presence is selected for a proactive session, it runs
 * through the exact same in-process reused Presence engine as reactive
 * practice (arc/combinedLiveSession.ts's own controller) -- but that
 * Presence sub-session's own internal rating is never folded into
 * arc/factorRating.ts's three-checkpoint FactorRating history (see that
 * module's own doc: "no checkpoint semantics that did not occur").
 */

import { getBeneficialActionCopy } from "./combinedRouteStepCopy.ts";
import type { BeneficialActionCopy } from "./combinedRouteStepCopy.ts";
import type { StateProfile } from "./stateProfile.ts";

export type ProactiveStatePracticeStepKind = "state_intention" | "embodiment" | "state_mantra" | "encoding" | "beneficial_action";

export const PROACTIVE_STATE_PRACTICE_STEP_ORDER: ProactiveStatePracticeStepKind[] = ["state_intention", "embodiment", "state_mantra", "encoding", "beneficial_action"];

export function getFirstProactiveStatePracticeStep(): ProactiveStatePracticeStepKind {
  return "state_intention";
}

/** Pure, total, linear -- never loops back, never branches. null means the fixed sequence is finished (the caller then continues into its own optional Presence step and/or beneficial_action, per arc/combinedLiveSession.ts's own controller). */
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
      const action: BeneficialActionCopy = getBeneficialActionCopy(state);
      return { title: action.title, body: action.body, durationMinutes: action.durationMinutes };
    }
  }
}
