/**
 * arc/desiredImagery.ts
 *
 * Unified Presence/Mantra/Trigger/Imagery spec, section 9: optional
 * imagery representing the desired emotion/state or identity -- kept
 * conceptually separate from Energy Color (supports Presence), side
 * observation (creates distance from the current experience), and
 * Action Imagery (rehearses the beneficial action, arc/successfulPerformance.ts,
 * completely untouched by this module). Begins only during Encoding
 * (arc/stageCopy.ts's "encode" case), never earlier.
 *
 * Per-layer, like stateFutureOrientedMantra/identityFutureOrientedMantra
 * (Encoding IS a per-layer stage, unlike Stay/Accept/Regulate -- see
 * arc/mantras.ts's own doc for that contrast). The habit layer has no
 * imagery concept of its own (the spec only ever describes a "desired
 * emotion/state" or "identity" image, neither of which the habit layer
 * has) -- getDesiredImageryLine returns null for it, same as
 * getFutureOrientedMantraLine already does.
 *
 * "One shared image representing both, if the user prefers" (BUILD
 * section 9's third question) has no separate schema flag -- getStageCopy's
 * "encode" case only ever resolves ONE layer per call, so there's no
 * single LIVE moment that could show two different sentences together
 * anyway. Instead: BUILD prefills the identity-side field with the
 * already-saved state-side description when both exist (see
 * build/ArcBuildEditorScreen.tsx), and if the trainee accepts it
 * unedited (both descriptions end up textually identical), this module
 * detects that and uses the shared-wording template -- referencing both
 * the state and the identity even though only one layer's own "encode"
 * call triggered it, which is correct: the image itself is meant to
 * remind the trainee of both together, regardless of which layer's
 * mechanics happened to surface it right now.
 */

import type { DevelopmentLayer } from "./types.ts";

export type DesiredImageryType = "real" | "imagined";

interface DesiredImageryProfile {
  stateDesiredImageryType?: DesiredImageryType | null;
  stateDesiredImageryDescription?: string | null;
  identityDesiredImageryType?: DesiredImageryType | null;
  identityDesiredImageryDescription?: string | null;
}

function safeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Resolves the desired-imagery line for the CURRENT resolved layer only
 * -- `stateLabel`/`identityLabel` are the already-resolved target names
 * (e.g. profile.supportiveState / profile.desiredIdentity) so this
 * module never re-derives them itself and can never diverge from
 * whatever the rest of "encode" is already naming. Returns null (skip
 * cleanly, no invented/blank line) whenever nothing is configured for
 * the resolved layer.
 */
export function getDesiredImageryLine(
  profile: DesiredImageryProfile,
  layer: DevelopmentLayer,
  stateLabel: string | null,
  identityLabel: string | null
): string | null {
  const stateDescription = safeText(profile.stateDesiredImageryDescription);
  const identityDescription = safeText(profile.identityDesiredImageryDescription);
  const shared = stateDescription !== null && identityDescription !== null && stateDescription === identityDescription;

  if (layer === "state") {
    if (!stateDescription) return null;
    if (shared && identityLabel) {
      return `העלה בדמיונך את ${stateDescription}. שים לב כיצד הוא מזכיר לך את תחושת ${stateLabel ?? ""} ואת הזהות ${identityLabel}.`;
    }
    return `העלה בדמיונך את ${stateDescription}. שים לב כיצד הדימוי מזכיר לך את תחושת ${stateLabel ?? ""}.`;
  }

  if (layer === "identity") {
    if (!identityDescription) return null;
    if (shared && stateLabel) {
      return `העלה בדמיונך את ${identityDescription}. שים לב כיצד הוא מזכיר לך את תחושת ${stateLabel} ואת הזהות ${identityLabel ?? ""}.`;
    }
    return `העלה בדמיונך את ${identityDescription}. שים לב כיצד הדימוי מזכיר לך את הזהות ${identityLabel ?? ""} ואת האדם שאתה מתרגל להיות.`;
  }

  return null;
}
