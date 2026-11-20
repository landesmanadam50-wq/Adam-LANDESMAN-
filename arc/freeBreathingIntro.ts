/**
 * arc/freeBreathingIntro.ts
 *
 * ARCHI -- Free Breathing Intro & Persistent Very Pale Blue Background
 * task: the pure, session-state-only pieces this feature needs --
 * never duplicated inline in live/NewArcLiveScreen.tsx or
 * live/components/FreeBreathingIntro.tsx.
 *
 * Core principle (verbatim from the spec): "Natural breathing, minimal
 * friction, and a continuous calming visual environment." The opening
 * animation never prescribes a rhythm, never requires deep breathing
 * or breath-holding, and never forces synchronization -- it is purely
 * a visual reminder that breathing is already happening naturally.
 */

import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";

/** The exact, verbatim first-person mantra shown on the opening screen. */
export const ARC_FREE_BREATHING_MANTRA = "אני נושם בצורה חופשית.";

/**
 * The one persistent background color -- "extremely light blue --
 * almost white," considerably lighter than every supportive-blue tier
 * already used on the animated body (OPENING_ACCEPTANCE_COLOR
 * #BBDEFB, OPENING_REGULATION_COLOR #4FC3F7, OPENING_ENCODING_COLOR
 * #00B0FF, arc/arcBodyMantraCircleLogic.ts) -- "the trainee must
 * clearly distinguish the animated blue body from the nearly white
 * background."
 */
export const ARC_FREE_BREATHING_BACKGROUND_COLOR = "#F2FAFF";

/**
 * "Keep the background throughout the entire ARC session... never
 * switch back to the default white or dark background between
 * steps." A pure, total function of ONE session field
 * (freeBreathingIntroShown) -- never re-derived from currentStep,
 * arcInvocationMode, or any other field, so it can never drift from
 * the one place that actually sets it (completeFreeBreathingIntro,
 * arc/newArcLiveSteps.ts), and a session resumed mid-flight already
 * carries the correct answer verbatim from storage, with zero
 * re-computation needed to "restore the same background after
 * interruptions."
 *
 * Returns null (meaning "use the screen's own existing default
 * background") before the intro has been shown or skipped. ARCHI --
 * Refine the Shortened ARC / "סבבה" Pathway task, requirement 1:
 * "free_breathing" is now the first screen of a shortened session too
 * (NEW_ARC_LIVE_STEP_ORDER, arc/newArcLiveSteps.ts), so this function
 * needs no mode-specific change at all -- a shortened session now also
 * sets freeBreathingIntroShown true on leaving it, same as every other
 * pathway, and gets the exact same persistent pale-blue background
 * from that point on.
 */
export function resolveArcBackgroundColor(session: Pick<NewArcLiveSessionState, "freeBreathingIntroShown">): string | null {
  return session.freeBreathingIntroShown ? ARC_FREE_BREATHING_BACKGROUND_COLOR : null;
}
