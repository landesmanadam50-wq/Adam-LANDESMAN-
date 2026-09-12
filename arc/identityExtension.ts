/**
 * arc/identityExtension.ts
 *
 * Phase 8 -- the shared Identity Extension engine.
 *
 * NOT a rebuild: a thin resumption adapter over the EXISTING,
 * unmodified arc/arcEngine.ts identity-target flow -- reused verbatim,
 * never duplicated, mirroring arc/presenceLive.ts's own "reuse the
 * existing implementation" precedent (Phase 5) and the embedded-entry
 * precedent already established by getFirstEmbeddedBeliefLiveStage/
 * getFirstEmbeddedUrgeLiveStage/getFirstEmbeddedThoughtLiveStage.
 *
 * A driving screen using this module never routes a session through
 * "trigger_selection" (which, for a proactive session, always continues
 * to "presence_check" -- see arc/arcEngine.ts's own trigger_selection
 * case): it sets its own local current-stage state DIRECTLY to
 * getFirstIdentityExtensionStage() ("encode") and starts calling
 * advanceLiveSession from there. This is exactly how it skips
 * Awareness/Stay/Acceptance/Presence/Regulation entirely -- there is no
 * separate "skip" flag or branch inside arc/arcEngine.ts itself, and
 * arc/arcEngine.ts is not modified by this module in any way. From
 * "encode" onward, the EXISTING identity tail already satisfies the
 * global post-action completion requirement in full: encode -> act ->
 * success_focus -> gratitude_and_learning -> completed_action_imagery ->
 * improved_action_imagery -> complete (see arc/postActionCompletion.ts's
 * own module doc for why this existing sequence is never touched/
 * reordered by this phase).
 *
 * Track-specific routing (confirmed with the user before Phase 8 began):
 *
 * - Personal Development / Self Development: OPTIONAL. After a State,
 *   Urge, Presence, Thought or Belief session completes, the driving
 *   screen shows IDENTITY_EXTENSION_OFFER_QUESTION ("האם תרצה להמשיך
 *   לבניית הזהות ולפעולה?"). The trainee may continue into this engine
 *   or finish the protocol normally -- declining is never penalized (no
 *   lost stars/counters/completion record either way; the protocol's
 *   own normal completion already ran before the offer is even shown).
 *
 * - Goal Achievement / ARC Goal: MANDATORY. The driving screen never
 *   shows the offer question -- it always enters this engine
 *   automatically, loading the identity build linked to the CURRENT
 *   ArcGoal (goal.identityProtocolId, the one goal-level field --
 *   ArcGoalSubGoal carries no identity field of its own, confirmed by
 *   inspecting that interface) with the active sub-goal
 *   (resolveActiveSubGoal(goal)?.id) carried along purely as CONTEXT,
 *   never a second identity source. Deliberately NOT integrated with
 *   the separate ArcGoalTarget scheduling system -- an explicit scope
 *   boundary to avoid re-deriving a second "what should the identity
 *   action be" mechanism.
 *
 * Personal Development has no stored per-protocol identity link of its
 * own (confirmed: UrgeArc/ThoughtArc/BeliefArc/PresenceArc/
 * ArcBuildProfile never gained one, and none is added here) -- the
 * caller supplies whichever existing identity-enabled ArcBuild the
 * trainee selects when accepting the offer.
 */

import type { ArcBuild, ArcGoal, ArcLiveState, DevelopmentLayer } from "./types.ts";
import { createEmptyLiveState } from "./types.ts";
import { deriveActiveLayersForArcBuild } from "./arcEngine.ts";
import { resolveActiveSubGoal } from "./subGoalExecution.ts";

export type IdentityExtensionTrack = "personal_development" | "goal_achievement";

export const IDENTITY_EXTENSION_OFFER_QUESTION = "האם תרצה להמשיך לבניית הזהות ולפעולה?";

/** Personal Development shows the offer; Goal Achievement never does -- it is mandatory and auto-enters (see module doc). */
export function shouldShowIdentityExtensionOffer(track: IdentityExtensionTrack): boolean {
  return track === "personal_development";
}

export interface IdentityExtensionEntry {
  /** Which ArcBuild's identity layer to resume into -- null when none is resolvable (Goal Achievement with no identityProtocolId configured yet, or Personal Development with no ArcBuild selected). Callers must handle null by not offering/entering the extension, never by inventing a build. */
  arcBuildId: string | null;
  /** Context only, never a second identity source -- see module doc. Always null for Personal Development. */
  activeSubGoalId: string | null;
}

/**
 * Resolves WHICH ArcBuild's identity layer this extension should
 * continue into, per the track-specific routing above. Pure -- never
 * reads storage itself; the caller loads `goal`/the selected ArcBuild id
 * beforehand.
 */
export function resolveIdentityExtensionEntry(
  track: IdentityExtensionTrack,
  input: { goal?: ArcGoal | null; selectedArcBuildId?: string | null }
): IdentityExtensionEntry {
  if (track === "goal_achievement") {
    const goal = input.goal ?? null;
    return {
      arcBuildId: goal?.identityProtocolId ?? null,
      activeSubGoalId: goal ? resolveActiveSubGoal(goal)?.id ?? null : null,
    };
  }
  return { arcBuildId: input.selectedArcBuildId ?? null, activeSubGoalId: null };
}

/**
 * The identity-target ArcStage this extension always resumes at --
 * never trigger_selection/presence_check/arc_thought_awareness/stay/
 * accept/regulate. See module doc for exactly how a driving screen uses
 * this (sets its own local stage state directly to this value, never
 * routes through getNextArcStage("trigger_selection", ...) first).
 */
export function getFirstIdentityExtensionStage(): "encode" {
  return "encode";
}

/**
 * The extension's own starting ArcLiveState -- triggerType "proactive"
 * (mirrors arc/presenceLive.ts's own createPresenceArcInitialSession;
 * never actually read once the driving screen starts at "encode"
 * directly, but kept consistent/truthful for any code that inspects
 * this session's own metadata) and selectedTarget forced to "identity"
 * so arc/arcEngine.ts's resolveEncodingTarget always resolves to the
 * identity layer regardless of what else the linked ArcBuild has
 * active -- the trainee is never asked to re-pick a target here.
 */
export function createIdentityExtensionInitialSession(): ArcLiveState {
  return { ...createEmptyLiveState(), triggerType: "proactive", selectedTarget: "identity" };
}

/** activeLayers for the linked ArcBuild's own profile -- reused verbatim via the SAME resolver every other ArcBuild-driven session already uses, never re-derived a second way. */
export function resolveIdentityExtensionActiveLayers(arcBuild: ArcBuild): DevelopmentLayer[] {
  return deriveActiveLayersForArcBuild(arcBuild.profile);
}

/** Whether `arcBuild` actually has a configured identity layer -- a driving screen must check this before entering (a resolved arcBuildId whose build was since edited to drop needsIdentity must never silently continue with garbage state). */
export function isIdentityExtensionEligible(arcBuild: ArcBuild | null): boolean {
  if (!arcBuild) return false;
  return resolveIdentityExtensionActiveLayers(arcBuild).includes("identity");
}

// ---------------------------------------------------------------------------
// Action mode -- "Full, micro, alternative or scheduled identity/goal
// action" (the user's own spec wording). arc/arcEngine.ts's existing
// "act" stage only ever distinguishes two paths (the planned action via
// plannedActionConfirmed, or ONE session-specific alternative via
// selectedAction/selectedActionDuration -- see resolveActPhase/
// liveEventAdapter.ts's applyPlannedActionConfirmed/applyAlternativeAction).
// This module adds no third engine-level path -- it never touches
// arc/arcEngine.ts. Instead, a driving screen asks the trainee to choose
// ONE of these four modes BEFORE resolveActPhase would otherwise render
// the plain two-option ActionChoiceScreen, then reuses the EXISTING
// mechanism: "full" -> applyPlannedActionConfirmed (unchanged); "micro"
// and "alternative" both -> applyAlternativeAction (unchanged) with the
// trainee's own typed text/duration, differing only in the label/copy
// shown and the duration chip set offered (micro's are short); never a
// new field on ArcLiveState. "scheduled" is the one genuinely new
// behavior: the driving screen must never advance past the "act" stage
// for this mode -- no imagery, no performing, no success_focus, no
// gratitude_and_learning, no completed/improved action imagery, and
// never call appendSessionLogEntry (never "complete"). See each
// screen's own doc for exactly how this is enforced.
// ---------------------------------------------------------------------------

export type IdentityExtensionActionMode = "full" | "micro" | "alternative" | "scheduled";

export const IDENTITY_EXTENSION_ACTION_MODE_QUESTION = "כיצד תרצה לגשת לפעולה הפעם?";

export interface IdentityExtensionActionModeOption {
  value: IdentityExtensionActionMode;
  label: string;
}

export function getIdentityExtensionActionModeOptions(): IdentityExtensionActionModeOption[] {
  return [
    { value: "full", label: "הפעולה המלאה כפי שתוכננה" },
    { value: "micro", label: "גרסה מיקרו וקצרה של הפעולה" },
    { value: "alternative", label: "פעולה חלופית" },
    { value: "scheduled", label: "לתזמן לפעם אחרת, בלי לבצע עכשיו" },
  ];
}

/** Short duration chips for the "micro" mode -- deliberately shorter than the "alternative" mode's own duration set (never the same options, so the UI itself reinforces the distinction). */
export const IDENTITY_EXTENSION_MICRO_DURATION_MINUTES = [1, 2, 3, 5];

/** Whether `mode` is the one mode that must never advance into imagery/performing/success_focus/gratitude or mark the session complete -- see module doc. */
export function isIdentityExtensionActionScheduledOnly(mode: IdentityExtensionActionMode | null): boolean {
  return mode === "scheduled";
}

export const IDENTITY_EXTENSION_SCHEDULED_CONFIRMATION_TITLE = "נקבע לפעם אחרת";
export const IDENTITY_EXTENSION_SCHEDULED_CONFIRMATION_BODY = "הפעולה לא בוצעה עכשיו -- אפשר לחזור אליה כשיתאים.";
