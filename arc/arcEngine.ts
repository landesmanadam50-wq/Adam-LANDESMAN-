/**
 * arc/arcEngine.ts
 *
 * arc/engine.ts (as given) only has isolated decision helpers
 * (shouldRunArcThought, getRouteAfterPresence, getReactiveStage,
 * getProactiveStage) -- there's no stage sequencer, unlike the old
 * engine/arcEngine.ts's getFirstStage/getNextStage. This file is that
 * sequencer, plus everything layered on top of it: layer-aware trigger
 * availability, the real ARC Thought / reactive / proactive transition
 * loops (with a shared safety cap so no loop can trap a trainee),
 * preventive-action routing, and the single resolver for which
 * DevelopmentLayer's data feeds encode/act -- so that choice lives in
 * exactly one place instead of being repeated across UI screens.
 *
 * ArcStage sequencing, end to end:
 *
 *   trigger_selection
 *     -> (reactive_emotion with 2+ mapped reactive experiences only:
 *        stays at trigger_selection, rendered as the "what's already
 *        present?" chooser -- see needsReactiveStateSelection -- until
 *        selectedTarget is set)
 *     -> target resolved (reactive_urge: always "habit"; reactive_emotion:
 *        selectedTarget, or the one mapped experience if exactly one, or
 *        inferLayerFromTrigger's existing inference if none are mapped;
 *        proactive: resolved later, unchanged)
 *     -> REACTIVE ONLY (reactive_urge/reactive_emotion; proactive skips
 *        straight to presence_check, unchanged -- Preserve Proactive
 *        Separation): reactive-flow-strengthening task --
 *          trigger_context (session-specific "what triggered this right
 *            now" free-text recognition, never overwriting BUILD's
 *            Challenge Context -- see ArcLiveState.triggerContext)
 *          -> observer_pause (brief, recognition-only observer-
 *             perspective + imagined-pause instruction; never asks the
 *             trainee to evoke/intensify the interfering state)
 *     -> (preventive_action_check -> preventive_action, only when that
 *        target's own Preventive Action is configured -- see
 *        resolveTargetPreventiveAction; never a global one, never before
 *        the target itself is resolved; preventive_action_check's own
 *        copy carries the brief "you entered ARCHI and created a pause"
 *        reinforcement, reached only once trigger_context/observer_pause
 *        are behind the trainee)
 *     -> presence_check
 *     -> (ARC Thought, gated purely on presenceRating -- see
 *        shouldRunArcThought; triggerType/activeLayers never affect
 *        whether it runs, only where it returns to afterward) x4,
 *        looping arc_thought_expand_presence <-> arc_thought_presence_recheck
 *        up to ARC_CONFIG.safety.maxLoopIterations times if presence
 *        stays low, then force-continuing regardless
 *     -> routed by resolveLiveRoute(triggerType, activeLayers):
 *          reactive_state_identity / reactive_habit
 *            -> sensation_check -> classified by getReactiveStage(intensity):
 *                 stay    -> stay -> accept -> sensation_check (re-check)
 *                 transit -> reactive_transition_check
 *                              ready    -> regulate
 *                              not yet  -> stay (loop)
 *                 regulate-> regulate -> sensation_check (re-check)
 *                 encode  -> encode
 *               (the sensation_check re-check loop shares the same
 *               safety cap as ARC Thought)
 *          proactive
 *            -> desired_state_check -> classified by getProactiveStage():
 *                 regulate -> regulate -> desired_state_check (re-check, capped)
 *                 encode   -> encode
 *     -> encode -> act -> success_focus -> complete
 *        (unconditionally -- Negative Action reduction task: the
 *        optional Negative Action Timer is never inserted here; it's a
 *        separate, BUILD-configured tool opened intentionally from its
 *        own standalone entry point, app/negative-action.tsx -- see
 *        program/engine.ts's isNegativeActionAvailable)
 */

import {
  getProactiveStage,
  getReactiveStage,
  getRouteAfterPresence,
  shouldRunArcThought,
} from "./engine.ts";
import { ARC_CONFIG } from "./config.ts";
import { createEmptyArcBuildProfile } from "./types.ts";
import type { ArcBuild, ArcBuildProfile, ArcLiveState, ArcStage, DevelopmentLayer, EncodingProfile, TriggerType } from "./types.ts";

export interface ArcStageResult {
  stage: ArcStage;
  loopIterationCount: number;
}

function result(stage: ArcStage, loopIterationCount: number): ArcStageResult {
  return { stage, loopIterationCount };
}

/** Once this many loop-backs have happened, force the session forward instead of looping again. */
function loopCapped(loopIterationCount: number): boolean {
  return loopIterationCount >= ARC_CONFIG.safety.maxLoopIterations;
}

/**
 * Whether the Accept stage's "not ready yet" willingness sub-flow (see
 * live/screens.tsx's AcceptScreen: "לא" -> unwillingness-acknowledgment
 * -> configured Acceptance dwell -> readiness-recheck question) has
 * used up its safety-cap rounds. Reuses the exact same cap
 * (ARC_CONFIG.safety.maxLoopIterations) and loopCapped() the ARC
 * Thought / reactive / proactive recheck loops already use, applied to
 * its own dedicated counter (ArcLiveState.acceptanceWillingnessLoopCount)
 * rather than sharing "accept"'s own, unrelated loopIterationCount
 * (which governs a completely different loop -- the accept ->
 * sensation_check intensity recheck once the trainee IS willing -- and
 * must not be perturbed by how many times the trainee said "not yet"
 * here). Once capped, the sub-flow forces forward into the normal
 * Acceptance path automatically -- exactly the same "force forward
 * once capped" behavior every other loop in this file already has --
 * rather than asking the readiness question a further time.
 */
export function isAcceptanceWillingnessLoopCapped(acceptanceWillingnessLoopCount: number): boolean {
  return loopCapped(acceptanceWillingnessLoopCount);
}

export function getFirstArcStage(): ArcStage {
  return "trigger_selection";
}

// ---------------------------------------------------------------------------
// Layer-aware trigger/route availability (#4, #5)
// ---------------------------------------------------------------------------

/**
 * Which of the three general triggers make sense to offer, given which
 * Development Layers are actually active this program week. reactive_urge
 * specifically requires the habit layer -- routing there without it would
 * mean running a habit flow with no habit data configured.
 */
export function getAvailableLiveTriggers(activeLayers: DevelopmentLayer[]): TriggerType[] {
  const triggers: TriggerType[] = [];
  if (activeLayers.length > 0) {
    // General reactive tools (presence, ARC Thought, stay/accept/regulate)
    // work regardless of which specific layer is active.
    triggers.push("reactive_emotion");
  }
  if (activeLayers.includes("habit")) {
    triggers.push("reactive_urge");
  }
  if (activeLayers.length > 0) {
    triggers.push("proactive");
  }
  return triggers;
}

/**
 * The guarded version of engine.ts's getRouteAfterPresence: refuses to
 * route to a trigger that getAvailableLiveTriggers says isn't available
 * for these activeLayers, instead of silently sending the trainee down
 * a path that needs data from a layer that was never built.
 */
export function resolveLiveRoute(
  triggerType: TriggerType,
  activeLayers: DevelopmentLayer[]
): "reactive_state_identity" | "reactive_habit" | "proactive" {
  if (!getAvailableLiveTriggers(activeLayers).includes(triggerType)) {
    throw new Error(`Trigger "${triggerType}" is not available for active layers [${activeLayers.join(", ")}]`);
  }
  return getRouteAfterPresence(triggerType);
}

export interface ProactiveTarget {
  layer: DevelopmentLayer;
  label: string;
}

/** Only offers a proactive target for a layer that's both active AND actually has data to target. */
export function getAvailableProactiveTargets(
  activeLayers: DevelopmentLayer[],
  profile: ArcBuildProfile
): ProactiveTarget[] {
  const targets: ProactiveTarget[] = [];
  if (activeLayers.includes("state") && profile.supportiveState) {
    targets.push({ layer: "state", label: profile.supportiveState });
  }
  if (activeLayers.includes("identity") && profile.desiredIdentity) {
    targets.push({ layer: "identity", label: profile.desiredIdentity });
  }
  if (activeLayers.includes("habit") && profile.beneficialAction) {
    targets.push({ layer: "habit", label: profile.beneficialAction });
  }
  return targets;
}

/**
 * Whether the UI needs to ask the trainee which target a proactive
 * session is about (rather than letting resolveEncodingTarget() infer
 * one blind). Only relevant for proactive: reactive sessions have an
 * unambiguous target already (reactive_urge -> habit; reactive_emotion
 * infers state/identity by priority, matching current behavior). No
 * selection is needed when a target is already recorded, or when there
 * are 0-1 available targets -- 0 falls through to resolveEncodingTarget's
 * own generic fallback, 1 should be auto-selected by the caller instead
 * of prompting.
 */
export function needsProactiveTargetSelection(
  triggerType: TriggerType | null,
  activeLayers: DevelopmentLayer[],
  profile: ArcBuildProfile,
  selectedTarget: DevelopmentLayer | null
): boolean {
  if (triggerType !== "proactive" || selectedTarget !== null) return false;
  return getAvailableProactiveTargets(activeLayers, profile).length > 1;
}

export interface ReactiveExperience {
  layer: DevelopmentLayer;
  label: string;
}

/**
 * Which mapped "already present" reactive experiences can be offered
 * as explicit recognition choices (#4, #5, #6) -- e.g. "Distraction"
 * (state) vs "Craving" (identity). Deliberately reuses interferingState
 * (state)/identityInterferingEmotion (identity) as the labels rather
 * than a separate schema: each already correlates 1:1 with its own
 * full ARC Map (challengeContext/preventiveAction/regulationTool/
 * encoding all keyed to the same state vs identity field split), so no
 * new "mappedReactiveExperience -> positiveTargetType -> positiveTargetId"
 * structure is needed -- see arc/types.ts's ArcBuildProfile doc. Habit
 * is deliberately excluded: reactive_urge's target is always
 * unambiguous ("habit"), so it never needs a chooser.
 */
export function getAvailableReactiveExperiences(
  activeLayers: DevelopmentLayer[],
  profile: ArcBuildProfile
): ReactiveExperience[] {
  const experiences: ReactiveExperience[] = [];
  if (activeLayers.includes("state") && profile.interferingState) {
    experiences.push({ layer: "state", label: profile.interferingState });
  }
  if (activeLayers.includes("identity") && profile.identityInterferingEmotion) {
    experiences.push({ layer: "identity", label: profile.identityInterferingEmotion });
  }
  return experiences;
}

/**
 * Whether the UI needs to ask which already-present mapped experience
 * the trainee recognizes, mirroring needsProactiveTargetSelection --
 * only for reactive_emotion, only when 2+ mapped experiences exist and
 * none is chosen yet. Recognition-only (#4): this never asks the
 * trainee to generate, imagine, or strengthen anything -- it only
 * identifies which already-mapped label matches what's already present,
 * exactly like presence_check's recognition preamble.
 */
export function needsReactiveStateSelection(
  triggerType: TriggerType | null,
  activeLayers: DevelopmentLayer[],
  profile: ArcBuildProfile,
  selectedTarget: DevelopmentLayer | null
): boolean {
  if (triggerType !== "reactive_emotion" || selectedTarget !== null) return false;
  return getAvailableReactiveExperiences(activeLayers, profile).length > 1;
}

// ---------------------------------------------------------------------------
// Encoding target resolution (#7) -- the one place this decision is made
// ---------------------------------------------------------------------------

export interface EncodingResolution {
  layer: DevelopmentLayer;
  encoding: EncodingProfile | null;
  /**
   * The currentAction for this session -- the BUILD-mapped action for
   * the resolved layer, UNLESS the session recorded its own
   * session-specific action (input.selectedAction, from
   * ArcLiveState.selectedAction: set when the trainee's planned/mapped
   * action can't be performed right now and they entered an
   * alternative one instead), in which case that alternative wins.
   * Action Imagery and the "act" stage both read this single field, so
   * they can never diverge onto two different actions within the same
   * session.
   */
  actionLabel: string | null;
  /**
   * Action Body Cue task: the physical cue the trainee performs and
   * MAINTAINS while actually doing actionLabel -- resolved from the
   * SAME layer as actionLabel (beneficialActionBodyCue/
   * identityActionBodyCue/internalActionBodyCue), never from
   * encoding?.bodyLanguageCue. These are deliberately separate concepts
   * (see arc/types.ts's internalActionBodyCue doc): Encoding's
   * Body-Language Cue is its own embodiment segment, shown once before
   * Identity/Mantra, regardless of what's performed afterward; this one
   * belongs to Action Imagery and the real "act" stage, and is never
   * copied from, or into, encoding?.bodyLanguageCue. Unlike actionLabel,
   * NEVER overridden by a session-specific alternative action (input.
   * selectedAction) -- an Alternative Action still uses this same
   * target's configured Body Cue, exactly as the planned action would.
   */
  actionBodyCue: string | null;
}

/**
 * Central resolver for "which layer's encoding/action feeds this
 * session's encode/act stages" -- UI code should call this rather than
 * re-deriving the answer itself. selectedTarget (e.g. from a proactive
 * target picker) always wins when present; otherwise it's inferred
 * from triggerType AND activeLayers (never a layer that isn't active,
 * even as a fallback -- see inferLayerFromTrigger): reactive_urge ->
 * habit; reactive_emotion -> state if active and configured, else
 * identity, else habit; proactive -> identity if active and
 * configured, else state, else habit.
 */
export function resolveEncodingTarget(input: {
  activeLayers: DevelopmentLayer[];
  triggerType: TriggerType | null;
  selectedTarget: DevelopmentLayer | null;
  buildProfile: ArcBuildProfile;
  /** ArcLiveState.selectedAction -- a session-specific alternative action, when the trainee's mapped action can't be performed right now. Overrides the resolved layer's mapped action when set; omitted/null leaves the mapped action as-is (existing behavior, unchanged). Never overrides actionBodyCue -- see that field's doc. */
  selectedAction?: string | null;
}): EncodingResolution {
  const layer = input.selectedTarget ?? inferLayerFromTrigger(input.triggerType, input.activeLayers, input.buildProfile);

  const resolved: EncodingResolution = (() => {
    switch (layer) {
      case "habit":
        return {
          layer: "habit" as const,
          encoding: null,
          actionLabel: input.buildProfile.beneficialAction,
          actionBodyCue: input.buildProfile.beneficialActionBodyCue,
        };
      case "identity":
        return {
          layer: "identity" as const,
          encoding: input.buildProfile.identityEncoding,
          actionLabel: input.buildProfile.identityAction,
          actionBodyCue: input.buildProfile.identityActionBodyCue,
        };
      case "state":
        return {
          layer: "state" as const,
          encoding: input.buildProfile.stateEncoding,
          actionLabel: input.buildProfile.internalAction,
          actionBodyCue: input.buildProfile.internalActionBodyCue,
        };
    }
  })();

  return input.selectedAction ? { ...resolved, actionLabel: input.selectedAction } : resolved;
}

function inferLayerFromTrigger(
  triggerType: TriggerType | null,
  activeLayers: DevelopmentLayer[],
  profile: ArcBuildProfile
): DevelopmentLayer {
  if (triggerType === "reactive_urge") return "habit";

  const hasState = activeLayers.includes("state") && (profile.stateEncoding !== null || profile.internalAction !== null);
  const hasIdentity = activeLayers.includes("identity") && (profile.identityEncoding !== null || profile.identityAction !== null);
  const hasHabit = activeLayers.includes("habit") && profile.beneficialAction !== null;

  const priority: DevelopmentLayer[] =
    triggerType === "proactive" ? ["identity", "state", "habit"] : ["state", "identity", "habit"];
  const available: Record<DevelopmentLayer, boolean> = { state: hasState, identity: hasIdentity, habit: hasHabit };

  for (const layer of priority) {
    if (available[layer]) return layer;
  }
  return "state"; // nothing configured yet -- caller shows generic copy
}

/**
 * ARC Builds task: an ArcBuild has no separate program/week-based
 * ArcProgramProgress.activeLayers to read (that gating belonged to the
 * old BUILD-GOAL -> program/ pairing) -- this derives the equivalent
 * set directly from the build's OWN configured fields, the same
 * has-flag/available logic inferLayerFromTrigger above already uses,
 * minus the "is this layer unlocked yet" check (an ArcBuild has no
 * concept of layers unlocking over weeks: whatever is configured is
 * immediately fully active). A layer with nothing configured for it is
 * simply absent -- never included as a hollow, unusable target.
 */
export function deriveActiveLayersForArcBuild(profile: ArcBuildProfile): DevelopmentLayer[] {
  const layers: DevelopmentLayer[] = [];
  if (profile.stateEncoding !== null || profile.internalAction !== null) layers.push("state");
  if (profile.identityEncoding !== null || profile.identityAction !== null) layers.push("identity");
  if (profile.beneficialAction !== null) layers.push("habit");
  return layers;
}

/**
 * ARC Builds task (#10, migration): splits ONE legacy, target-bundling
 * ArcBuildProfile (the old BUILD-GOAL -> BUILD-ARC model, where a
 * single profile could carry a state target AND an identity target AND
 * a habit target all at once) into one standalone ArcBuild PER target
 * that was actually configured -- never one bundled build covering
 * several targets, matching the corrected architecture where an
 * ArcBuild targets exactly one layer. Each split build's initial name
 * is that target's own Desired State/Identity/Habit text (never a
 * generic "goal" label), and carries ONLY that target's fields --
 * every other target's fields are left at createEmptyArcBuildProfile's
 * defaults (null), so deriveActiveLayersForArcBuild resolves each
 * split build to exactly the one layer it was split from. Global,
 * not-target-specific fields (regulationTool, actionDuration,
 * successFocusDuration) are carried into every resulting build, since
 * they applied to the whole legacy profile and there is no way to
 * attribute them to one target over another -- this loses no
 * configuration, and each is independently editable per build from
 * this point on. Negative Action's own fields (habit/
 * negativeActionReductionEnabled/negativeActionBaseDurationMinutes)
 * travel with the habit split (or their own habit-only build, if the
 * trainee enabled Negative Action without ever configuring a positive
 * beneficialAction target) since Negative Action is the habit-reduction
 * counterpart to the habit layer's positive beneficialAction.
 *
 * Pure and deterministic given its inputs (generateId/now are supplied
 * by the caller, data/storage.ts's loadArcBuilds, rather than read
 * from Date.now()/Math.random() here) -- this is what data/storage.ts's
 * migrate-once-on-first-load logic actually calls; testable directly
 * without any AsyncStorage involved.
 */
export function splitProfileIntoArcBuilds(profile: ArcBuildProfile, generateId: () => string, now: string): ArcBuild[] {
  const builds: ArcBuild[] = [];
  const hasState = profile.stateEncoding !== null || profile.internalAction !== null;
  const hasIdentity = profile.identityEncoding !== null || profile.identityAction !== null;
  // profile.habit (the negative/interfering action text) is deliberately
  // NOT its own trigger here -- it's only ever meaningful alongside
  // negativeActionReductionEnabled (see isNegativeActionAvailable's own
  // check), so a legacy profile with stray/leftover habit text but the
  // tool never actually enabled must not spuriously produce a habit
  // build with nothing else configured.
  const hasHabit = profile.beneficialAction !== null || profile.negativeActionReductionEnabled === true;

  if (hasState) {
    builds.push({
      id: generateId(),
      name: profile.supportiveState?.trim() ? profile.supportiveState.trim() : "מצב רצוי",
      createdAt: now,
      updatedAt: now,
      needsState: true,
      needsIdentity: false,
      needsHabit: false,
      needsIdentityImmediately: false,
      profile: {
        ...createEmptyArcBuildProfile(),
        supportiveState: profile.supportiveState,
        challengeContext: profile.challengeContext,
        interferingState: profile.interferingState,
        statePreventiveAction: profile.statePreventiveAction,
        stateEncodingRegulationCue: profile.stateEncodingRegulationCue,
        stateEncoding: profile.stateEncoding,
        internalAction: profile.internalAction,
        internalActionBodyCue: profile.internalActionBodyCue,
        stateDwellTimes: profile.stateDwellTimes,
        regulationTool: profile.regulationTool,
        actionDuration: profile.actionDuration,
        successFocusDuration: profile.successFocusDuration,
      },
    });
  }

  if (hasIdentity) {
    builds.push({
      id: generateId(),
      name: profile.desiredIdentity?.trim() ? profile.desiredIdentity.trim() : "זהות רצויה",
      createdAt: now,
      updatedAt: now,
      needsState: false,
      needsIdentity: true,
      needsHabit: false,
      needsIdentityImmediately: false,
      profile: {
        ...createEmptyArcBuildProfile(),
        desiredIdentity: profile.desiredIdentity,
        identityChallengeContext: profile.identityChallengeContext,
        identityInterferingEmotion: profile.identityInterferingEmotion,
        identityPreventiveAction: profile.identityPreventiveAction,
        identityEncodingRegulationCue: profile.identityEncodingRegulationCue,
        identityEncoding: profile.identityEncoding,
        identityAction: profile.identityAction,
        identityActionBodyCue: profile.identityActionBodyCue,
        identityDwellTimes: profile.identityDwellTimes,
        regulationTool: profile.regulationTool,
        actionDuration: profile.actionDuration,
        successFocusDuration: profile.successFocusDuration,
      },
    });
  }

  if (hasHabit) {
    builds.push({
      id: generateId(),
      name: profile.beneficialAction?.trim() ? profile.beneficialAction.trim() : "הרגל רצוי",
      createdAt: now,
      updatedAt: now,
      needsState: false,
      needsIdentity: false,
      needsHabit: true,
      needsIdentityImmediately: false,
      profile: {
        ...createEmptyArcBuildProfile(),
        beneficialAction: profile.beneficialAction,
        beneficialActionBodyCue: profile.beneficialActionBodyCue,
        preventiveAction: profile.preventiveAction,
        habit: profile.habit,
        negativeActionBaseDurationMinutes: profile.negativeActionBaseDurationMinutes,
        negativeActionReductionEnabled: profile.negativeActionReductionEnabled,
        regulationTool: profile.regulationTool,
        actionDuration: profile.actionDuration,
        successFocusDuration: profile.successFocusDuration,
      },
    });
  }

  return builds;
}

// ---------------------------------------------------------------------------
// Action choice -- planned action vs. a session-specific alternative
// ---------------------------------------------------------------------------

/**
 * Whether the "act" stage needs to show the Action-choice screen
 * (planned action + "can I perform it now?") before the normal
 * Action-Preparation/Imagery/timed-action screen -- mirrors
 * needsProactiveTargetSelection/needsReactiveStateSelection's "stay at
 * this stage, render a conditional interstitial" pattern, so no new
 * ArcStage is needed. True only until the trainee has resolved
 * currentAction for this session: either by confirming the planned
 * action (plannedActionConfirmed), or by entering a valid alternative
 * (selectedAction set). Once resolved, this returns false for the rest
 * of the session -- there's no way back to re-ask.
 */
export function needsCurrentActionResolution(plannedActionConfirmed: boolean, selectedAction: string | null): boolean {
  return !plannedActionConfirmed && selectedAction === null;
}

export type ActPhase = "choice" | "imagery" | "performing";

/**
 * Which of the "act" stage's three sub-phases to show, mirroring
 * needsCurrentActionResolution's "stay at this ArcStage, render a
 * conditional interstitial" pattern -- no new ArcStage was added for
 * any of these. Order is fixed and one-directional (never a way back):
 *
 *   choice      -- currentAction not yet resolved (needsCurrentActionResolution).
 *   imagery     -- currentAction resolved, Action Imagery not yet completed.
 *   performing  -- Imagery completed: the actual timed Action (arc/actionTimer.ts)
 *                  is the only thing left before "act" advances to "success_focus".
 *
 * LIVE-flow-update task: the standalone Action Preparation sub-phase
 * (which used to sit between imagery and performing, only ever
 * repeating the SAME Body-Language Cue Action Imagery had just shown)
 * is removed -- Imagery now goes directly to Performing. Its useful
 * "carry this into the real action" reminder was folded into
 * Encoding's own body-language segment instead (see
 * arc/stageCopy.ts's "encode" case) rather than lost. This is the ONE
 * explicitly allowed change to "act"'s progression; every other
 * ordering here is unchanged.
 *
 * The Action Timer never starts before "performing" is reached -- see
 * arc/actionTimer.ts's module doc and live/screens.tsx's ActionScreen,
 * which is the only screen that reads a duration for actual timing.
 */
export function resolveActPhase(
  plannedActionConfirmed: boolean,
  selectedAction: string | null,
  actionImageryCompleted: boolean
): ActPhase {
  if (needsCurrentActionResolution(plannedActionConfirmed, selectedAction)) return "choice";
  if (!actionImageryCompleted) return "imagery";
  return "performing";
}

/**
 * Resolves the action duration actually in effect for this session, in
 * priority order: (1) a session-specific alternative's own duration
 * (paired with ArcLiveState.selectedAction, from the Action-choice
 * screen's "לא" branch -- unchanged), (2) the trainee's own live,
 * in-session choice for the Beneficial Action Timer specifically
 * (ArcLiveState.beneficialActionDurationMinutes, 5-10 minutes -- see
 * live/screens.tsx's BeneficialActionDurationChoiceScreen; only ever
 * set on the PLANNED-action path, never the alternative one, which
 * already has its own duration via (1)), (3) the BUILD-level
 * actionDuration as a last-resort fallback (kept for callers that
 * never go through the live picker, e.g. a resumed run rendered
 * directly from its persisted TimerRun snapshot). Never invents a
 * duration: null when none of the three is set.
 */
export function resolveActionDuration(
  selectedActionDuration: number | null,
  profile: ArcBuildProfile,
  beneficialActionDurationMinutes: number | null = null
): number | null {
  return selectedActionDuration ?? beneficialActionDurationMinutes ?? profile.actionDuration;
}

// ---------------------------------------------------------------------------
// Preventive action -- resolved per-target, surfaced before ARC Thought
// ---------------------------------------------------------------------------

/**
 * Resolves Preventive Action from the CURRENT target's own map -- never
 * one global field, never mixed between targets (#3, #14, #15): state
 * gets statePreventiveAction, identity gets identityPreventiveAction,
 * habit keeps the original preventiveAction field it always used.
 */
export function resolveTargetPreventiveAction(layer: DevelopmentLayer, profile: ArcBuildProfile): string | null {
  switch (layer) {
    case "state":
      return profile.statePreventiveAction;
    case "identity":
      return profile.identityPreventiveAction;
    case "habit":
      return profile.preventiveAction;
  }
}

// ---------------------------------------------------------------------------
// Encoding regulation -- a lightweight per-target carry-over anchor,
// distinct from the Full Regulation Cue used during Regulation itself
// ---------------------------------------------------------------------------

/**
 * Resolves the lightweight Short Encoding Regulation Cue for the
 * CURRENT target -- never one global field, never mixed between
 * targets (parallel to resolveTargetPreventiveAction): state gets
 * stateEncodingRegulationCue, identity gets identityEncodingRegulationCue.
 * Falls back to the Full Regulation Cue (profile.regulationTool) when
 * the target has none of its own configured -- this is also exactly
 * what every profile stored before this field existed resolves to, so
 * their Encoding copy is unchanged. The habit layer has no short cue
 * of its own: a habit-targeted Encoding session always used
 * regulationTool directly, unchanged.
 */
export function resolveEncodingRegulationCue(layer: DevelopmentLayer, profile: ArcBuildProfile): string | null {
  switch (layer) {
    case "state":
      return profile.stateEncodingRegulationCue ?? profile.regulationTool;
    case "identity":
      return profile.identityEncodingRegulationCue ?? profile.regulationTool;
    case "habit":
      return profile.regulationTool;
  }
}

/** preventive_action_check if the resolved target has one configured, else straight to presence_check. Reactive only -- see the trigger_selection case; proactive is unaffected (unchanged: desired_state_check first, per "Preserve Proactive Separation"). */
function afterReactiveTargetResolved(layer: DevelopmentLayer, profile: ArcBuildProfile): ArcStage {
  return resolveTargetPreventiveAction(layer, profile) !== null ? "preventive_action_check" : "presence_check";
}

/**
 * The single resolver for which DevelopmentLayer the "observer_pause"
 * stage's Stop-Imagery dwell (coordinated timer/dwell task, Part 20-23)
 * is configured under -- shared by this file's own "observer_pause"
 * transition case below AND arc/stageCopy.ts's "observer_pause" copy
 * case, so the two can never diverge onto different layers for the
 * SAME session. Mirrors exactly what the transition case always
 * computed inline before this task: reactive_urge always resolves to
 * "habit" (unambiguous); every other reactive trigger uses
 * selectedTarget when already chosen, else falls back to
 * inferLayerFromTrigger's own existing inference.
 */
export function resolveObserverPauseLayer(
  triggerType: TriggerType | null,
  selectedTarget: DevelopmentLayer | null,
  activeLayers: DevelopmentLayer[],
  profile: ArcBuildProfile
): DevelopmentLayer {
  return triggerType === "reactive_urge" ? "habit" : (selectedTarget ?? inferLayerFromTrigger(triggerType, activeLayers, profile));
}

function afterArcThought(triggerType: TriggerType | null): ArcStage {
  if (triggerType === null) return "sensation_check";
  return getRouteAfterPresence(triggerType) === "proactive" ? "desired_state_check" : "sensation_check";
}

// ---------------------------------------------------------------------------
// The sequencer (#8, #9, #10, #11)
// ---------------------------------------------------------------------------

export function getNextArcStage(
  current: ArcStage,
  state: ArcLiveState,
  profile: ArcBuildProfile,
  activeLayers: DevelopmentLayer[]
): ArcStageResult {
  switch (current) {
    case "trigger_selection": {
      if (state.triggerType === null) return result(current, state.loopIterationCount);

      if (state.triggerType === "reactive_urge") {
        return result("trigger_context", state.loopIterationCount);
      }

      if (state.triggerType === "reactive_emotion") {
        // Stays at trigger_selection -- rendered as the "what's already
        // present?" chooser -- until a target is resolved (#4, #16).
        if (needsReactiveStateSelection(state.triggerType, activeLayers, profile, state.selectedTarget)) {
          return result(current, state.loopIterationCount);
        }
        return result("trigger_context", state.loopIterationCount);
      }

      // proactive -- unaffected by this change, per "Preserve Proactive Separation".
      return result("presence_check", state.loopIterationCount);
    }

    // Reactive-flow-strengthening task: session-specific trigger
    // recognition, always allowed to continue (an optional free-text
    // field -- never blocks progression the way a required rating
    // would). Reachable only from trigger_selection's reactive branches
    // above, so triggerType is guaranteed reactive_urge/reactive_emotion
    // here -- never reached by a proactive session.
    case "trigger_context":
      return result("observer_pause", state.loopIterationCount);

    // Reactive-flow-strengthening task: the observer-perspective +
    // imagined-pause instruction. Its own Continue is gated purely by
    // arc/instructionTiming.ts's segment timing (live/screens.tsx's
    // InstructionScreen, unchanged mechanism) -- this transition itself
    // is unconditional once reached, exactly like "stay"'s own
    // unconditional advance to "accept". Resolves `layer` the exact same
    // way trigger_selection's own (now-removed) inline resolution did,
    // so the target that receives the Preventive Action next is never
    // recomputed differently.
    case "observer_pause": {
      const layer = resolveObserverPauseLayer(state.triggerType, state.selectedTarget, activeLayers, profile);
      return result(afterReactiveTargetResolved(layer, profile), state.loopIterationCount);
    }

    case "presence_check":
      if (state.presenceRating === null) return result(current, state.loopIterationCount);
      // Presence Color task: Presence Stage 3 (arc_thought_expand_presence)
      // must run in EVERY LIVE protocol, never be skipped entirely, since
      // it's the one place the saved Presence Color is activated (see
      // arc/stageCopy.ts's "arc_thought_expand_presence" case). A high
      // presence rating still skips the full ARC Thought sequence
      // (arc_thought_awareness/combined_attention) exactly as before --
      // it now routes directly into arc_thought_expand_presence instead
      // of straight past it. That stage's own unchanged transition into
      // arc_thought_presence_recheck (below), and that stage's own
      // unchanged re-evaluation logic, then exit to afterArcThought on
      // the very next hop once presence is confirmed high again -- no
      // other routing/rating logic changes.
      return result(
        shouldRunArcThought(state.presenceRating) ? "arc_thought_awareness" : "arc_thought_expand_presence",
        state.loopIterationCount
      );

    case "arc_thought_awareness":
      return result("arc_thought_combined_attention", state.loopIterationCount);
    case "arc_thought_combined_attention":
      return result("arc_thought_expand_presence", state.loopIterationCount);
    case "arc_thought_expand_presence":
      return result("arc_thought_presence_recheck", state.loopIterationCount);

    case "arc_thought_presence_recheck": {
      if (state.presenceRating === null) return result(current, state.loopIterationCount);
      if (!shouldRunArcThought(state.presenceRating)) {
        return result(afterArcThought(state.triggerType), state.loopIterationCount);
      }
      // Presence is still low. Loop back to re-expand rather than
      // restarting the whole ARC Thought sequence, up to the safety cap.
      if (loopCapped(state.loopIterationCount)) {
        return result(afterArcThought(state.triggerType), state.loopIterationCount);
      }
      return result("arc_thought_expand_presence", state.loopIterationCount + 1);
    }

    // Reached only before ARC Thought now (from trigger_selection, once
    // the target is resolved) -- both branches continue into
    // presence_check, never back to sensation_check (that ordering is
    // now obsolete; see the module doc).
    case "preventive_action_check":
      return result(state.wantsPreventiveAction === true ? "preventive_action" : "presence_check", state.loopIterationCount);
    case "preventive_action":
      return result("presence_check", state.loopIterationCount);

    case "sensation_check": {
      if (state.sensationIntensity === null) return result(current, state.loopIterationCount);
      return result(getReactiveStage(state.sensationIntensity), state.loopIterationCount);
    }

    case "stay":
      return result("accept", state.loopIterationCount);
    case "accept":
      if (loopCapped(state.loopIterationCount)) {
        return result("regulate", state.loopIterationCount);
      }
      // Re-check intensity after accepting -- sensation_check re-classifies from there.
      return result("sensation_check", state.loopIterationCount + 1);

    case "reactive_transition_check":
      if (state.regulationReady === true) return result("regulate", state.loopIterationCount);
      if (loopCapped(state.loopIterationCount)) {
        return result("regulate", state.loopIterationCount);
      }
      return result("stay", state.loopIterationCount + 1);

    case "regulate":
      if (state.triggerType === "proactive") {
        if (loopCapped(state.loopIterationCount)) return result("encode", state.loopIterationCount);
        return result("desired_state_check", state.loopIterationCount + 1);
      }
      if (loopCapped(state.loopIterationCount)) {
        return result("encode", state.loopIterationCount);
      }
      return result("sensation_check", state.loopIterationCount + 1);

    case "desired_state_check": {
      if (state.desiredStateRating === null) return result(current, state.loopIterationCount);
      return result(getProactiveStage(state.desiredStateRating), state.loopIterationCount);
    }

    case "encode":
      return result("act", state.loopIterationCount);
    case "act":
      return result("success_focus", state.loopIterationCount);
    case "success_focus":
      // Negative Action reduction task: the main routine is always
      // ARC -> Success Focus -> completion -- success_focus continues
      // straight to complete UNCONDITIONALLY now. The optional Negative
      // Action Timer is never inserted here (or anywhere else in the
      // main sequencer): it's a separate, BUILD-configured tool the
      // trainee opens intentionally from its own standalone entry point
      // (app/negative-action.tsx), never required to finish a session.
      // See program/engine.ts's isNegativeActionAvailable.
      return result("complete", state.loopIterationCount);
    // negative_action is never routed to by this sequencer any more (see
    // the "success_focus" case above) -- this case only exists so the
    // switch stays exhaustive over ArcStage; harmless if ever reached.
    case "negative_action":
      return result("complete", state.loopIterationCount);
    case "complete":
      return result("complete", state.loopIterationCount);
  }
}
