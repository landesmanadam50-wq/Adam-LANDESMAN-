/**
 * live/ArcGoalSessionScreen.tsx (route: /arc-goal/live/[goalId])
 *
 * ARC Goal Live entry (spec sections 6-7) -- a dedicated screen, kept
 * entirely separate from live/LiveSessionScreen.tsx (regular ARC) and
 * live/MiniArcLiveScreen.tsx/live/ArcLinkScreen.tsx (their own separate
 * modes), matching this codebase's own "new mode = new screen" pattern.
 * Owns the actual React state for BOTH runs arc/arcGoalEngine.ts
 * describes (outer identity run, transient inner supportive-state run)
 * plus the ArcGoal-only orchestration state (ArcGoalLiveState), and
 * renders the existing, completely unmodified ArcLiveRenderer for every
 * normal ArcStage on whichever run is currently active -- this file
 * itself only decides WHICH run/meta-stage to show, via
 * arc/arcGoalEngine.ts's pure helpers.
 *
 * Session safety: exactly like LiveSessionScreen, every piece of state
 * here is reset fresh on every focus (useFocusEffect below) -- ArcGoal
 * Live never resumes a stale session, and (Phase 1 scope) the real
 * Beneficial Action Timer is not persisted/resumed across a
 * backgrounding the way regular ARC's is -- it still works within one
 * uninterrupted session via ActionScreen's own internal timer state.
 */

import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";

import type { ArcBuild, ArcBuildProfile, ArcGoal, ArcLiveState, ArcStage, DevelopmentLayer } from "../arc/types.ts";
import { createEmptyLiveState, IDENTIFIED_NEED_UNKNOWN } from "../arc/types.ts";
import type { UrgeArc } from "../arc/types.ts";
import { getAvailableLiveTriggers, resolveEncodingTarget, resolveTargetLimitingBelief } from "../arc/arcEngine.ts";
import { getStageCopy } from "../arc/stageCopy.ts";
import { buildEvidenceIndex, buildSessionEvidenceContext } from "../arc/evidence.ts";
import type { EvidenceRecord } from "../arc/evidence.ts";
import type { MiniArcBuild } from "../arc/miniArc.ts";
import {
  appendSessionLogEntry,
  clearTimerRun,
  getArcGoal,
  loadArcBuilds,
  loadLifeManifests,
  loadMiniArcBuilds,
  loadSessionLog,
  loadUrgeArcs,
  loadWeeklyActions,
  updateLastSessionLogEntryGratitude,
  upsertWeeklyAction,
} from "../data/storage.ts";
import { resolveLifeManifestContributionForArcGoal } from "../arc/lifeManifest.ts";
import type { LifeManifestContribution } from "../arc/lifeManifest.ts";
import { markWeeklyActionCompletedToday } from "../arc/routineLinks.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";
import {
  createArcGoalInnerInitialSession,
  createArcGoalOuterInitialSession,
  createArcGoalUrgeInnerInitialSession,
  createEmptyArcGoalLiveState,
  findUrgeArcForNeed,
  getGoalActionConfirmCopy,
  getStateClarificationDecisionCopy,
  getSupportiveActionConfirmCopy,
  getThirdPersonImageryCopy,
  getTriggerIdentificationCopy,
  getUrgeActionConfirmCopy,
  getUrgeEncodingCopy,
  getUrgeNeedIdentificationCopy,
  getUrgeRepresentationChoices,
  getUrgeStopActionCopy,
  GOAL_INTERFERING_STATE_SELECT_TITLE,
  needsReassessmentDetour,
  needsTriggerPrefixDetour,
  resolveAfterBridgeConfirmed,
  resolveAfterEmbeddedMiniArcStage,
  resolveAfterExecutionModeChoice,
  resolveAfterReassessment,
  resolveAfterStateClarificationDecision,
  resolveAfterThirdPersonImagery,
  resolveAfterTriggerIdentification,
  resolveAfterUrgeEncoding,
  resolveAfterUrgeNeedIdentification,
  resolveAfterUrgeRepresentation,
  resolveAfterUrgeStopAction,
  resolveExecutionMode,
  resolveSelectedMapping,
  resolveSelectedUrgeMapping,
  selectSupportiveMapping,
  selectUrgeMapping,
  shouldInterceptInnerAfterRegulate,
  shouldInterceptInnerAfterSensationCheck,
  shouldInterceptInnerAtAct,
  URGE_NEED_IDENTIFICATION_PRESETS,
  URGE_REPRESENTATION_QUESTION_BODY,
  URGE_REPRESENTATION_QUESTION_TITLE,
  URGE_SELECT_TITLE,
  URGE_STOP_ACTION_DONE_LABEL,
  urgeArcToProfile,
  getGoalConnectionStepCopy,
  shouldInterceptOuterAtGoalConnection,
} from "../arc/arcGoalEngine.ts";
import type { ArcGoalLiveState, ArcGoalUiStage } from "../arc/arcGoalEngine.ts";
import {
  advanceLiveSession,
  applyAcceptanceWillingnessAnswer,
  applyActionCompletion,
  applyActionImageryCompleted,
  applyAlternativeAction,
  applyBalancedAlternativeInterpretationSeen,
  applyBeneficialActionDurationSelected,
  applyCompletedActionImageryFinished,
  applyFutureLinkAcknowledged,
  applyImprovedActionImageryFinished,
  applyInterferingThoughtAnswer,
  applyNeedIdentificationAnswer,
  applyPlannedActionConfirmed,
  applyRegulationToolUsed,
  applyScaleAnswer,
  applySensationAnswer,
  applySideObservationMode,
  applySuccessFocusExtraMinutes,
  applyTargetSelection,
  applyTriggerContext,
  applyTriggerSelection,
  applyWantsFutureSuccessFocus,
  applyYesNoAnswer,
  hasValidAlternativeAction,
  resolveSensationLocation,
} from "./liveEventAdapter.ts";
import { DEFERRAL_OPTIONS, scheduleFutureSuccessFocus } from "../data/reminders.ts";
import { ArcLiveRenderer } from "./ArcLiveRenderer.tsx";
import type { ArcLiveRendererProps } from "./ArcLiveRenderer.tsx";
import {
  EmbeddedMiniArcScreen,
  ExecutionModeChoiceScreen,
  InstructionScreen,
  NeedIdentificationScreen,
  ReassessmentScreen,
  StateClarificationDecisionScreen,
  TriggerIdentificationScreen,
} from "./screens.tsx";
import { toArcGoalSharedFacts } from "../arc/sharedLiveSessionFacts.ts";
import { recordSharedLiveSessionCompletion } from "../data/sharedLiveSessionCompletion.ts";
import { confirmActionRoleAndPersist, startPendingSharedActionExecution } from "../data/pendingSharedActionExecutionPersistence.ts";
import { shouldInterceptOuterAtSuccessFocus } from "../arc/arcGoalEngine.ts";

/**
 * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 6
 * correction: the THREE required PendingSharedActionExecution roles for
 * an ArcGoal session -- corrected from an earlier, wrong two-role model
 * that silently treated the outer run's own "act" confirmation AS the
 * confirmation of ArcGoal.goalAction. getGoalActionConfirmCopy's own doc
 * is explicit that the two are DISTINCT real actions ("distinct from the
 * identity protocol's own identityAction") -- both are now preserved and
 * tracked separately.
 *
 * BENEFICIAL_ACTION_ROLE = the urge/supportive bridge's own action
 * (confirmed at urge_action_confirm/supportive_action_confirm -- see
 * getUrgeActionConfirmCopy/getSupportiveActionConfirmCopy's own doc).
 * Only required when this session actually resolves to an urge/supportive
 * bridge (reassessmentChoice !== "direct", or the goal has no
 * urge/interfering mappings at all -- in either case there is no bridge
 * action to confirm, so this role is never added to the queue).
 *
 * IDENTITY_ACTION_ROLE = the outer (identity) run's own "act" stage
 * confirmation (ArcLiveState.realActionCompleted becoming true via
 * onActionCompleted below) -- the identityProfile's own action content,
 * never the goal's own.
 *
 * GOAL_ACTION_ROLE = the separate, pre-existing "goal_action_confirm"
 * stage's own confirmation (ArcGoal.goalAction + desiredResult, via
 * getGoalActionConfirmCopy). Now RELOCATED (see
 * shouldInterceptOuterAtSuccessFocus's own doc and commitAdvanceOuter
 * below) to fire immediately after the Identity Action is confirmed and
 * BEFORE the outer run is ever allowed to continue into success_focus --
 * so "Success Focus only after explicit Identity/Goal Action
 * confirmation" covers BOTH roles, in order, never either alone. Its own
 * "סיימתי" tap now resumes the outer run (into success_focus) rather than
 * exiting the screen -- the routine-completion marking that used to fire
 * here has moved to the true end of the tail (see handleCompleteContinue's
 * own doc for exactly where and why).
 */
const BENEFICIAL_ACTION_ROLE = "beneficial_action";
const IDENTITY_ACTION_ROLE = "identity_action";
const GOAL_ACTION_ROLE = "goal_action";

function generateArcGoalSessionId(): string {
  return `${new Date().toISOString()}-${Math.random().toString(36).slice(2, 8)}`;
}

type Status = "loading" | "notFound" | "noIdentityProtocol" | "running";

interface RunContext {
  session: ArcLiveState;
  stage: ArcStage;
  profile: ArcBuildProfile;
  activeLayers: DevelopmentLayer[];
  setSession: (session: ArcLiveState) => void;
  commitAdvance: (patchedSession: ArcLiveState, transitionStage?: ArcStage) => void;
}

export default function ArcGoalSessionScreen() {
  const { goalId, weeklyActionId: weeklyActionIdParam } = useLocalSearchParams<{ goalId: string; weeklyActionId?: string }>();
  // Routine <-> ARC Goal linking task: present only when this session was
  // launched from a routine's own WeeklyAction (app/routines/index.tsx's
  // WeeklyActionsSection.handleStart) -- absent for every other entry
  // point (the Goals list, ARC Goal select screen), which keep behaving
  // exactly as before.
  const weeklyActionId = typeof weeklyActionIdParam === "string" ? weeklyActionIdParam : null;

  const [status, setStatus] = useState<Status>("loading");
  const [goal, setGoal] = useState<ArcGoal | null>(null);
  const [identityProfile, setIdentityProfile] = useState<ArcBuildProfile | null>(null);
  const [arcBuildsById, setArcBuildsById] = useState<Record<string, ArcBuild>>({});
  const [urgeArcsById, setUrgeArcsById] = useState<Record<string, UrgeArc>>({});
  const [miniArcsById, setMiniArcsById] = useState<Record<string, MiniArcBuild>>({});
  const [evidenceIndex, setEvidenceIndex] = useState<EvidenceRecord[]>([]);
  /**
   * Adaptive ARC architecture task (unified PD/ARC Goal), method-completion
   * correction: resolved once per focus, from the already-loaded
   * LifeManifest store + this goal's own lifeManifestSubGoalId -- see
   * arc/lifeManifest.ts's own resolveLifeManifestContributionForArcGoal.
   * null whenever this goal has no Manifest link at all, or the linked
   * Sub-goal was since deleted -- getGoalConnectionStepCopy then simply
   * omits the Manifest-contribution line, never inventing one.
   */
  const [manifestContribution, setManifestContribution] = useState<LifeManifestContribution | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState(() => new Date().toISOString());
  /**
   * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 6: minted
   * once per fresh session (alongside sessionStartedAt, in the same
   * useFocusEffect below) and never regenerated by a retry -- every
   * PendingSharedActionExecution/progress call for this session reuses
   * this exact id, mirroring live/CombinedInterferenceLiveScreen.tsx's
   * own "mint once, reuse for every retry" sessionId pattern. Regenerated
   * on every FOCUS, not just mount, because this screen already resets
   * its whole session on every focus (see this file's own module doc) --
   * there is no cross-restart resume for an in-progress ArcGoal session
   * today, exactly like the PD screen; see the integration report for
   * this finding.
   */
  const [sessionId, setSessionId] = useState(() => generateArcGoalSessionId());

  const [outerSession, setOuterSession] = useState<ArcLiveState>(() => createArcGoalOuterInitialSession());
  const [outerStage, setOuterStage] = useState<ArcStage>("trigger_selection");
  const [innerSession, setInnerSession] = useState<ArcLiveState>(() => createArcGoalInnerInitialSession());
  const [innerStage, setInnerStage] = useState<ArcStage>("sensation_check");
  const [goalState, setGoalState] = useState<ArcGoalLiveState>(() => createEmptyArcGoalLiveState());

  const [pendingSensationLocation, setPendingSensationLocation] = useState("");
  const [pendingCustomSensationLocation, setPendingCustomSensationLocation] = useState("");
  const [pendingSensationLocationUnclear, setPendingSensationLocationUnclear] = useState(false);
  const [pendingTriggerContext, setPendingTriggerContext] = useState("");
  /** Unified Presence/Mantra/Trigger/Imagery spec, section 6: same shape as live/LiveSessionScreen.tsx's own field -- only ever reached by the outer (identity) run, which alone passes through trigger_context; the inner run starts at sensation_check and never touches it. */
  const [pendingInterferingThought, setPendingInterferingThought] = useState("");
  /** Unified Presence/Mantra/Trigger/Imagery spec, section 3: same shape as live/LiveSessionScreen.tsx's own field -- only the outer run ever reaches arc_thought_expand_presence. */
  const [presenceObjectGroundingDone, setPresenceObjectGroundingDone] = useState(false);
  const [pendingAlternativeAction, setPendingAlternativeAction] = useState("");
  const [pendingAlternativeActionDuration, setPendingAlternativeActionDuration] = useState<number | null>(null);
  const [gratitudeText, setGratitudeText] = useState("");
  const [gratitudeMemoryDetailText, setGratitudeMemoryDetailText] = useState("");
  const [progressEvidenceText, setProgressEvidenceText] = useState("");
  /** Post-action reflection/imagery task: same shape as live/LiveSessionScreen.tsx's own field -- only ever reached by the outer (identity) run, which alone can reach gratitude_and_learning/success_focus/complete; the inner run is always intercepted before "act" completes (see shouldInterceptInnerAtAct below) and never renders these stages. */
  const [improvementText, setImprovementText] = useState("");

  function clearPendingFields() {
    setPendingSensationLocation("");
    setPendingCustomSensationLocation("");
    setPendingSensationLocationUnclear(false);
    setPendingTriggerContext("");
    setPendingInterferingThought("");
    setPendingAlternativeAction("");
    setPendingAlternativeActionDuration(null);
  }

  /**
   * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 6: starts
   * (and persists) this session's PendingSharedActionExecution queue --
   * called exactly once per session, either immediately on load (a goal
   * with no urge/interfering mappings at all -- the reassessment screen
   * never shows, so this is the only chance) or from the reassessment
   * screen's own onSelect (see below), never both for the same session.
   * Fire-and-forget, exactly like this screen's own existing
   * appendSessionLogEntry/markWeeklyActionCompletedToday background
   * writes -- a failure here is logged, never blocks rendering.
   */
  function beginPendingActionExecution(freshSessionId: string, roleIds: string[]) {
    startPendingSharedActionExecution("arc_goal", goalId, freshSessionId, roleIds, new Date().toISOString()).catch((error) => {
      console.warn("[ArcGoalSessionScreen] Failed to start pending action execution.", error);
    });
  }

  /** Persists one role's explicit confirmation -- see this file's own BENEFICIAL_ACTION_ROLE/IDENTITY_ACTION_ROLE/GOAL_ACTION_ROLE doc for exactly which UI event calls this with which role. */
  function confirmArcGoalActionRole(roleId: string) {
    confirmActionRoleAndPersist("arc_goal", goalId, roleId, new Date().toISOString()).catch((error) => {
      console.warn("[ArcGoalSessionScreen] Failed to persist action role confirmation.", error);
    });
  }

  /**
   * Attempts the progress write through Phase 5's shared dispatcher --
   * safe to call after EITHER role's confirmation (not just the last
   * one): data/pendingSharedActionExecutionPersistence.ts's own
   * commitArcGoalProgressIfReady gates on the action queue alone and is a
   * silent no-op ("not_ready") until every required role is confirmed,
   * so calling this defensively after both confirm points never risks a
   * premature or duplicate write. Takes the latest outer session/goal
   * state as explicit parameters (never the closed-over state variables)
   * because both call sites below have a freshly-computed local value
   * that React's own state setters have not yet applied.
   */
  function attemptArcGoalProgressCommit(latestOuterSession: ArcLiveState, latestGoalState: ArcGoalLiveState) {
    if (!goal) return;
    const mapping = resolveSelectedMapping(goal, latestGoalState) ?? resolveSelectedUrgeMapping(goal, latestGoalState);
    const facts = toArcGoalSharedFacts({
      sessionId,
      arcGoalId: goalId,
      weeklyActionId,
      outerSession: latestOuterSession,
      goalState: latestGoalState,
      mappingActionRelationship: mapping?.actionRelationship ?? null,
      terminalCompleted: true,
    });
    recordSharedLiveSessionCompletion(facts, new Date().toISOString()).catch((error) => {
      console.warn("[ArcGoalSessionScreen] Failed to record ArcGoal session completion.", error);
    });
  }

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([getArcGoal(goalId), loadArcBuilds(), loadSessionLog(), loadUrgeArcs(), loadMiniArcBuilds(), loadLifeManifests()]).then(
        ([loadedGoal, builds, sessionLog, urgeArcs, miniArcBuilds, manifests]) => {
        if (cancelled) return;
        if (!loadedGoal) {
          setStatus("notFound");
          return;
        }
        setManifestContribution(resolveLifeManifestContributionForArcGoal(manifests, loadedGoal.lifeManifestSubGoalId));
        const byId: Record<string, ArcBuild> = {};
        for (const build of builds) byId[build.id] = build;
        setArcBuildsById(byId);
        const urgeById: Record<string, UrgeArc> = {};
        for (const urgeArc of urgeArcs) urgeById[urgeArc.id] = urgeArc;
        setUrgeArcsById(urgeById);
        const miniById: Record<string, MiniArcBuild> = {};
        for (const miniArc of miniArcBuilds) miniById[miniArc.id] = miniArc;
        setMiniArcsById(miniById);
        setGoal(loadedGoal);
        const identityBuild = loadedGoal.identityProtocolId ? byId[loadedGoal.identityProtocolId] : undefined;
        if (!identityBuild) {
          setStatus("noIdentityProtocol");
          return;
        }
        setIdentityProfile(identityBuild.profile);
        setEvidenceIndex(buildEvidenceIndex(sessionLog));
        setOuterSession(createArcGoalOuterInitialSession());
        setOuterStage("trigger_selection");
        setInnerSession(createArcGoalInnerInitialSession());
        setInnerStage("sensation_check");
        setGoalState(createEmptyArcGoalLiveState());
        setSessionStartedAt(new Date().toISOString());
        const freshSessionId = generateArcGoalSessionId();
        setSessionId(freshSessionId);
        // Adaptive ARC architecture task (unified PD/ARC Goal), Phase 6: a
        // goal with neither urgeMappings nor interferingMappings never
        // shows the reassessment screen at all (needsReassessmentDetour's
        // own doc: "continues straight into desired_state_check, exactly
        // as if the trainee had answered 'direct'") -- this is the ONLY
        // chance to start the queue for such a session, since
        // resolveAfterReassessment's own onSelect (below) will never fire.
        if (loadedGoal.urgeMappings.length === 0 && loadedGoal.interferingMappings.length === 0) {
          beginPendingActionExecution(freshSessionId, [IDENTITY_ACTION_ROLE, GOAL_ACTION_ROLE]);
        }
        setPresenceObjectGroundingDone(false);
        clearPendingFields();
        setGratitudeText("");
        setGratitudeMemoryDetailText("");
        setProgressEvidenceText("");
        setImprovementText("");
        setStatus("running");
        }
      );
      return () => {
        cancelled = true;
      };
    }, [goalId])
  );

  // Kick-starts the outer run: triggerType is already known ("proactive"),
  // so the very first hop (trigger_selection -> presence_check) happens
  // automatically -- no trigger_selection screen is ever rendered for an
  // ArcGoal session (see createArcGoalOuterInitialSession's own doc).
  useEffect(() => {
    if (status !== "running" || !identityProfile) return;
    if (outerStage !== "trigger_selection") return;
    const { session, stage } = advanceLiveSession("trigger_selection", outerSession, identityProfile, ["identity"]);
    setOuterSession(session);
    setOuterStage(stage);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per fresh session (guarded by the outerStage check above), not on every outerSession change.
  }, [status, identityProfile, outerStage]);

  function finalizeOuterSession(finishedSession: ArcLiveState) {
    if (!identityProfile) return;
    const finishedAt = new Date().toISOString();
    const resolution = resolveEncodingTarget({
      activeLayers: ["identity"],
      triggerType: finishedSession.triggerType,
      selectedTarget: finishedSession.selectedTarget,
      buildProfile: identityProfile,
      selectedAction: finishedSession.selectedAction,
    });
    const context = buildSessionEvidenceContext(
      resolution.layer,
      resolution.encoding,
      resolution.actionLabel,
      identityProfile,
      finishedSession.triggerContext,
      finishedSession.triggerKnown
    );
    appendSessionLogEntry({
      id: `${sessionStartedAt}_${finishedAt}`,
      startedAt: sessionStartedAt,
      finishedAt,
      success: finishedSession.realActionCompleted,
      fall: false,
      context,
    });
  }

  function applyGoalHop(hop: { uiStage: ArcGoalUiStage; goalState: ArcGoalLiveState }) {
    setGoalState({ ...hop.goalState, uiStage: hop.uiStage });
  }

  /**
   * Phase 3, spec sections 2-9: resumes the urge inner run once a
   * representation/preventive-stopping-action/encoding detour finishes
   * -- when the hop lands back on "inner", applies the ALREADY-COMPUTED
   * pendingInnerResumeStage as the real innerStage (never re-running
   * advanceLiveSession, since that transition was already resolved at
   * interception time in commitAdvanceInner below) and clears it;
   * otherwise behaves exactly like applyGoalHop (e.g. still routing
   * urge_representation -> urge_stop_action, where the inner run stays
   * paused).
   */
  function resumeInnerAfterDetour(hop: { uiStage: ArcGoalUiStage; goalState: ArcGoalLiveState }) {
    if (hop.uiStage === "inner" && hop.goalState.pendingInnerResumeStage) {
      setInnerStage(hop.goalState.pendingInnerResumeStage);
      setGoalState({ ...hop.goalState, uiStage: "inner", pendingInnerResumeStage: null });
      return;
    }
    applyGoalHop(hop);
  }

  function commitAdvanceOuter(patchedSession: ArcLiveState, transitionStage: ArcStage = outerStage) {
    if (!identityProfile || !goal) return;
    const { session: nextSession, stage: nextStage } = advanceLiveSession(transitionStage, patchedSession, identityProfile, ["identity"]);
    if (outerStage === "act" && nextStage !== "act") {
      clearTimerRun("beneficialAction");
      // Adaptive ARC architecture task (unified PD/ARC Goal), Phase 6
      // correction: the ONLY way the outer run ever leaves "act" is via
      // ActionScreen's own onCompleted (onActionCompleted above applies
      // realActionCompleted: true before ever calling commitAdvance) --
      // so this transition IS the Identity Action role's explicit
      // confirmation. Defensive guard on nextSession.realActionCompleted
      // anyway, mirroring this codebase's general "never trust reached
      // alone" convention. This is NEVER the Goal Action's own
      // confirmation (see IDENTITY_ACTION_ROLE/GOAL_ACTION_ROLE's own
      // doc) and never writes progress by itself -- the attempt below is
      // still a safe no-op, since Goal Action (confirmed later, at
      // goal_action_confirm's own "סיימתי") has not been confirmed yet.
      if (nextSession.realActionCompleted) {
        confirmArcGoalActionRole(IDENTITY_ACTION_ROLE);
        attemptArcGoalProgressCommit(nextSession, goalState);
      }
    }
    setOuterSession(nextSession);
    setOuterStage(nextStage);
    clearPendingFields();
    // Unified Presence/Mantra/Trigger/Imagery spec, section 6: same
    // editable-suggestion prefill as live/LiveSessionScreen.tsx's own
    // commitAdvance -- see that file's doc.
    if (nextStage === "trigger_context" && nextSession.selectedTarget) {
      setPendingInterferingThought(resolveTargetLimitingBelief(nextSession.selectedTarget, identityProfile) ?? "");
    }
    if (needsTriggerPrefixDetour(nextStage, goalState)) {
      setGoalState((current) => ({ ...current, uiStage: "trigger_identification" }));
      return;
    }
    if (nextStage === "desired_state_check" && needsReassessmentDetour(goal, goalState)) {
      setInnerSession(createArcGoalInnerInitialSession());
      setInnerStage("sensation_check");
      setGoalState((current) => ({ ...current, uiStage: "reassessment" }));
      return;
    }
    // Adaptive ARC architecture task (unified PD/ARC Goal), method-completion
    // correction: intercept BEFORE "encode" ever renders -- the approved
    // method's own "Acceptance -> Regulation -> Goal Connection ->
    // Encoding" order, applied one stage boundary earlier than
    // shouldInterceptOuterAtSuccessFocus below. Same already-advanced-
    // underneath pattern: outerSession/outerStage are already updated to
    // the real "encode" above; only goalState.uiStage diverts, and
    // handleGoalConnectionContinue below simply returns uiStage to
    // "outer" once the trainee continues.
    if (shouldInterceptOuterAtGoalConnection(outerStage, nextStage)) {
      // Final-review correction: mark the Future Mantra as already shown
      // this session, the moment goal_connection is reached -- read by
      // the outer getStageCopy call below to suppress its own repeat
      // appearance at the shared "encode" ArcStage.
      setGoalState((current) => ({ ...current, uiStage: "goal_connection", goalConnectionShown: true }));
      return;
    }
    // Adaptive ARC architecture task (unified PD/ARC Goal), Phase 6
    // correction: intercept BEFORE success_focus ever renders -- the Goal
    // Action must be explicitly confirmed first (see
    // shouldInterceptOuterAtSuccessFocus's own doc). outerSession/outerStage
    // are already updated to the real "success_focus" above (mirrors
    // needsTriggerPrefixDetour's own already-advanced-underneath pattern);
    // only goalState.uiStage diverts, and the render logic resumes reading
    // the real outerStage once goal_action_confirm's own handler routes
    // back to "outer" (see handleGoalActionRoleConfirmed below).
    if (shouldInterceptOuterAtSuccessFocus(outerStage, nextStage)) {
      setGoalState((current) => ({ ...current, uiStage: "goal_action_confirm" }));
      return;
    }
    if (nextStage === "complete") {
      finalizeOuterSession(nextSession);
    }
  }

  function resolveSupportiveProfile(): ArcBuildProfile | null {
    if (!goal) return null;
    const mapping = resolveSelectedMapping(goal, goalState);
    if (!mapping) return null;
    return arcBuildsById[mapping.supportiveProtocolId]?.profile ?? null;
  }

  function resolveUrgeProfile(): ArcBuildProfile | null {
    if (!goal) return null;
    const mapping = resolveSelectedUrgeMapping(goal, goalState);
    if (!mapping) return null;
    const urgeArc = urgeArcsById[mapping.urgeArcId];
    if (!urgeArc) return null;
    return urgeArcToProfile(urgeArc);
  }

  function currentInnerContext(): { profile: ArcBuildProfile; activeLayers: DevelopmentLayer[] } | null {
    if (goalState.reassessmentChoice === "urge") {
      const profile = resolveUrgeProfile();
      return profile ? { profile, activeLayers: ["habit"] } : null;
    }
    const profile = resolveSupportiveProfile();
    return profile ? { profile, activeLayers: ["state"] } : null;
  }

  function commitAdvanceInner(patchedSession: ArcLiveState, transitionStage: ArcStage = innerStage) {
    if (!goal) return;
    const ctx = currentInnerContext();
    if (!ctx) return;
    const { session: nextSession, stage: nextStage } = advanceLiveSession(transitionStage, patchedSession, ctx.profile, ctx.activeLayers);
    clearPendingFields();
    const route: "urge" | "supportive" = goalState.reassessmentChoice === "urge" ? "urge" : "supportive";
    // Phase 3, spec sections 2-5: Recognition (sensation_check) has just
    // resolved -- detour into urge_representation (then, when
    // configured, the repositioned urge_stop_action) BEFORE letting the
    // inner run continue toward Stay. nextStage !== transitionStage
    // confirms sensation_check actually resolved (an unanswered/gated
    // hop returns itself unchanged -- never intercept that).
    if (shouldInterceptInnerAfterSensationCheck(route, transitionStage) && nextStage !== transitionStage) {
      setInnerSession(nextSession);
      setGoalState((current) => ({ ...current, uiStage: "urge_representation", pendingInnerResumeStage: nextStage }));
      return;
    }
    // Phase 3, spec section 9: Regulation has just resolved -- detour
    // into the representation-routed urge_encoding screen instead of
    // rendering the generic habit "encode" stage.
    if (shouldInterceptInnerAfterRegulate(route, transitionStage) && nextStage !== transitionStage) {
      setInnerSession(nextSession);
      setGoalState((current) => ({ ...current, uiStage: "urge_encoding", pendingInnerResumeStage: nextStage }));
      return;
    }
    if (shouldInterceptInnerAtAct(nextStage)) {
      const mapping = route === "urge" ? resolveSelectedUrgeMapping(goal, goalState) : resolveSelectedMapping(goal, goalState);
      const configuredMode = mapping?.executionMode ?? "full";
      const miniArcId = mapping?.miniArcId ?? null;
      const hasMiniArc = miniArcId !== null && Boolean(miniArcsById[miniArcId]);
      const resolvedMode = resolveExecutionMode(configuredMode, hasMiniArc);
      if (resolvedMode === "choose") {
        setGoalState((current) => ({ ...current, uiStage: "execution_mode_choice" }));
        return;
      }
      const nextUiStage: ArcGoalUiStage = resolvedMode === "mini" ? "mini_arc_embedded" : route === "urge" ? "urge_action_confirm" : "supportive_action_confirm";
      setGoalState((current) => ({
        ...current,
        uiStage: nextUiStage,
        executionMode: resolvedMode,
        miniArcStage: resolvedMode === "mini" ? "regulation" : null,
      }));
      return;
    }
    setInnerSession(nextSession);
    setInnerStage(nextStage);
  }

  /**
   * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 6
   * correction: this is now the TRUE final exit of the session --
   * goal_action_confirm no longer follows it (it was RELOCATED, see
   * handleGoalActionRoleConfirmed and commitAdvanceOuter's own
   * shouldInterceptOuterAtSuccessFocus branch, to fire before
   * success_focus instead of after this reflection step). Made async
   * because it now also performs the routine-completion side effect that
   * used to live in handleGoalActionConfirmDone.
   */
  async function handleCompleteContinue() {
    const trimmedGratitude = gratitudeText.trim();
    const trimmedMemoryDetail = gratitudeMemoryDetailText.trim();
    const trimmedProgressEvidence = progressEvidenceText.trim();
    // Post-action reflection/imagery task: same star-eligibility
    // computation as live/LiveSessionScreen.tsx's restart() -- this is
    // only ever reached via the OUTER run (see this component's own
    // restartLabel/onRestart wiring below), so outerSession is the
    // exact ArcLiveState finalizeOuterSession() was just called with.
    const trimmedImprovement = improvementText.trim();
    const fullReflectionCreditEarned =
      trimmedImprovement.length > 0 &&
      outerSession.completedActionImageryFinished &&
      outerSession.improvedActionImageryFinished &&
      outerSession.futureLinkAcknowledged;
    updateLastSessionLogEntryGratitude(
      trimmedGratitude.length > 0 ? trimmedGratitude : null,
      trimmedMemoryDetail.length > 0 ? trimmedMemoryDetail : null,
      trimmedProgressEvidence.length > 0 ? trimmedProgressEvidence : null,
      trimmedImprovement.length > 0 ? trimmedImprovement : null,
      fullReflectionCreditEarned
    );
    setGratitudeText("");
    setGratitudeMemoryDetailText("");
    setProgressEvidenceText("");
    setImprovementText("");
    await handleSessionExit();
  }

  /**
   * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 6
   * correction: goal_action_confirm's own "סיימתי" tap, now reached
   * BEFORE success_focus (see commitAdvanceOuter's own
   * shouldInterceptOuterAtSuccessFocus branch) -- this is the Goal
   * Action role's explicit confirmation, distinct from the Identity
   * Action confirmed earlier at "act" itself. Never exits the screen:
   * resumes the outer run by returning goalState.uiStage to "outer",
   * which then renders the ALREADY-ADVANCED outerStage
   * ("success_focus") exactly like every other detour in this file
   * (needsTriggerPrefixDetour's own doc explains the same
   * already-advanced-underneath pattern).
   */
  function handleGoalActionRoleConfirmed() {
    confirmArcGoalActionRole(GOAL_ACTION_ROLE);
    attemptArcGoalProgressCommit(outerSession, goalState);
    setGoalState((current) => ({ ...current, uiStage: "outer" }));
  }

  /**
   * Adaptive ARC architecture task (unified PD/ARC Goal), method-completion
   * correction: goal_connection's own "המשך" tap -- a passive imagery/
   * mantra readthrough, never a confirmation gate (unlike goal_action_confirm's
   * own "סיימתי", which confirms a real action role and writes progress).
   * Simply resumes the outer run by returning uiStage to "outer", which
   * then renders the ALREADY-ADVANCED outerStage ("encode") exactly like
   * every other detour in this file.
   */
  function handleGoalConnectionContinue() {
    setGoalState((current) => ({ ...current, uiStage: "outer" }));
  }

  /**
   * Routine <-> ARC Goal linking task, spec section 3 steps 5-6: "When
   * the ARC Goal session is completed, return automatically to the
   * routine. Mark the routine action as completed only after the
   * connected goal action is completed." -- reached exclusively from
   * handleCompleteContinue above, the screen's own true final step
   * (never earlier: leaving/canceling the session at any point before
   * this, including the whole urge/supportive bridge, the outer run's
   * own Identity Action, and the Goal Action confirmation itself, never
   * marks anything complete). Reuses arc/routineLinks.ts's own
   * markWeeklyActionCompletedToday -- the SAME completion rule
   * WeeklyActionsSection's own no-linked-protocol plain check-off
   * already uses, never a separate one. Every other entry point into
   * this screen (weeklyActionId absent) keeps the original "back to
   * Home" behavior unchanged.
   */
  async function handleSessionExit() {
    if (weeklyActionId) {
      const weeklyActions = await loadWeeklyActions();
      const target = weeklyActions.find((action) => action.id === weeklyActionId);
      if (target) {
        await upsertWeeklyAction(markWeeklyActionCompletedToday(target, todayLocalDateString(), new Date().toISOString()));
      }
      router.replace("/routines");
      return;
    }
    router.replace("/");
  }

  function buildRendererProps(ctx: RunContext, onRestart: () => void, restartLabel?: string): Omit<ArcLiveRendererProps, "stage"> {
    const { session, profile, activeLayers, setSession, commitAdvance } = ctx;
    return {
      session,
      profile,
      activeLayers,
      evidenceIndex,
      availableTriggers: getAvailableLiveTriggers(activeLayers),
      pendingSensationLocation,
      pendingCustomSensationLocation,
      pendingSensationLocationUnclear,
      pendingTriggerContext,
      onChangeTriggerContext: setPendingTriggerContext,
      pendingInterferingThought,
      onChangeInterferingThought: setPendingInterferingThought,
      onTriggerContextContinue: () =>
        commitAdvance(applyTriggerContext(session, pendingTriggerContext, pendingInterferingThought)),
      onSelectSideObservationMode: (mode) => setSession(applySideObservationMode(session, mode)),
      presenceObjectGroundingDone,
      onPresenceObjectGroundingComplete: () => setPresenceObjectGroundingDone(true),
      onSelectTrigger: (trigger) => commitAdvance(applyTriggerSelection(session, trigger)),
      onScaleAnswer: (value) => commitAdvance(applyScaleAnswer(ctx.stage, session, value)),
      onSelectSensationLocation: (location) => {
        setPendingSensationLocation(location);
        setPendingCustomSensationLocation("");
        setPendingSensationLocationUnclear(false);
      },
      onChangeCustomSensationLocation: (text) => {
        setPendingCustomSensationLocation(text);
        setPendingSensationLocation("");
        setPendingSensationLocationUnclear(false);
      },
      onSelectSensationLocationUnclear: () => {
        setPendingSensationLocationUnclear(true);
        setPendingSensationLocation("");
        setPendingCustomSensationLocation("");
      },
      onSubmitSensationIntensity: (value) => {
        const location =
          resolveSensationLocation(pendingSensationLocation, pendingCustomSensationLocation, pendingSensationLocationUnclear) ??
          session.sensationLocation;
        commitAdvance(applySensationAnswer(session, location, value));
      },
      onYesNoAnswer: (yes) => commitAdvance(applyYesNoAnswer(ctx.stage, session, yes)),
      onInterferingThoughtAnswer: (choice, sessionText) => commitAdvance(applyInterferingThoughtAnswer(session, choice, sessionText)),
      onBalancedAlternativeInterpretationContinue: () => commitAdvance(applyBalancedAlternativeInterpretationSeen(session)),
      onNeedIdentificationAnswer: (need) => commitAdvance(applyNeedIdentificationAnswer(session, need)),
      onSelectTarget: (target) => setSession(applyTargetSelection(session, target)),
      onSelectReactiveExperience: (target) => commitAdvance(applyTargetSelection(session, target)),
      onGenericContinue: () => commitAdvance(session),
      onRegulateContinue: () => commitAdvance(applyRegulationToolUsed(session, profile.regulationTool)),
      onPresenceExperienceRating: (value) =>
        commitAdvance(applyScaleAnswer("arc_thought_presence_recheck", session, value), "arc_thought_presence_recheck"),
      onRegulationExperienceRating: (value) => {
        const withToolUsed = applyRegulationToolUsed(session, profile.regulationTool);
        const hop = advanceLiveSession("regulate", withToolUsed, profile, activeLayers);
        const withRating =
          hop.stage === "desired_state_check"
            ? applyScaleAnswer("desired_state_check", hop.session, value)
            : applySensationAnswer(hop.session, hop.session.sensationLocation, value);
        commitAdvance(withRating, hop.stage);
      },
      onAcceptWillingnessAnswer: (yes) => setSession(applyAcceptanceWillingnessAnswer(session, yes)),
      onAcceptIntensityRating: (value) => {
        const hop = advanceLiveSession("accept", session, profile, activeLayers);
        const withRating = applySensationAnswer(hop.session, hop.session.sensationLocation, value);
        commitAdvance(withRating, hop.stage);
      },
      onAcceptContinueWithoutRating: () => commitAdvance(session, "accept"),
      pendingAlternativeAction,
      pendingAlternativeActionDuration,
      onConfirmPlannedAction: () => setSession(applyPlannedActionConfirmed(session)),
      onChangeAlternativeAction: setPendingAlternativeAction,
      onSelectAlternativeActionDuration: setPendingAlternativeActionDuration,
      onSubmitAlternativeAction: () => {
        if (!hasValidAlternativeAction(pendingAlternativeAction, pendingAlternativeActionDuration)) return;
        setSession(applyAlternativeAction(session, pendingAlternativeAction, pendingAlternativeActionDuration));
        setPendingAlternativeAction("");
        setPendingAlternativeActionDuration(null);
      },
      onActionImageryContinue: () => setSession(applyActionImageryCompleted(session)),
      onSelectBeneficialActionDuration: (minutes) => setSession(applyBeneficialActionDurationSelected(session, minutes)),
      onActionCompleted: () => commitAdvance(applyActionCompletion(session, true)),
      onSuccessFocusExtraMinutesSubmit: (minutes) => setSession(applySuccessFocusExtraMinutes(session, minutes)),
      onWantsFutureSuccessFocusAnswer: (yes) => {
        const patched = applyWantsFutureSuccessFocus(session, yes);
        if (yes) setSession(patched);
        else commitAdvance(patched);
      },
      futureSuccessFocusScheduleOptions: DEFERRAL_OPTIONS,
      onScheduleFutureSuccessFocus: (option, durationMinutes) => {
        scheduleFutureSuccessFocus({ option, durationMinutes });
        commitAdvance(session);
      },
      negativeActionDurationMinutes: null,
      onNegativeActionStart: () => {},
      onNegativeActionCompleted: () => commitAdvance(session),
      resumedNegativeActionRun: null,
      gratitudeText,
      onChangeGratitudeText: setGratitudeText,
      gratitudeMemoryDetailText,
      onChangeGratitudeMemoryDetailText: setGratitudeMemoryDetailText,
      progressEvidenceText,
      onChangeProgressEvidenceText: setProgressEvidenceText,
      improvementText,
      onChangeImprovementText: setImprovementText,
      // Post-action reflection/imagery task: reached only by the outer
      // (identity) run -- the inner run is always intercepted before
      // "act" completes (shouldInterceptInnerAtAct above) and so never
      // renders gratitude_and_learning/the two imagery stages/complete
      // at all, even though this shared props builder must still supply
      // them for BOTH ctx calls (ArcLiveRendererProps' own shape).
      onGratitudeAndLearningContinue: () => commitAdvance(session),
      onCompletedActionImageryContinue: () => commitAdvance(applyCompletedActionImageryFinished(session)),
      onImprovedActionImageryContinue: () => commitAdvance(applyImprovedActionImageryFinished(session)),
      onFutureLinkContinue: () => commitAdvance(applyFutureLinkAcknowledged(session)),
      completePrimaryLabel: restartLabel,
      onCompletePrimary: onRestart,
    };
  }

  if (status === "loading") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "ARC Goal LIVE" }} />
      </SafeAreaView>
    );
  }

  if (status === "notFound") {
    // Missing/deleted-goal handling: reached only if this screen was
    // navigated to with an id that no longer resolves (the routines
    // editor's own handleStart already refuses to navigate here for a
    // known-missing goal -- see app/routines/index.tsx -- so this is a
    // defensive fallback, e.g. a stale deep link). Routed back to
    // wherever the trip came from: the routine (so the trainee can
    // immediately fix the link via עריכה) when weeklyActionId is
    // present, the Goals list otherwise -- exactly the original
    // behavior for every non-routine entry point.
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>המטרה לא נמצאה</Text>
          <Pressable
            style={[styles.button, styles.fullWidthButton]}
            onPress={() => router.replace(weeklyActionId ? "/routines" : "/goals")}
          >
            <Text style={styles.buttonText}>{weeklyActionId ? "חזרה לשגרה" : "חזרה לרשימת המטרות"}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (status === "noIdentityProtocol" || !goal) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>למטרה הזאת אין עדיין פרוטוקול זהות מחובר</Text>
          <Pressable
            style={[styles.button, styles.fullWidthButton]}
            onPress={() => router.replace({ pathname: "/goals/[id]", params: { id: goalId } })}
          >
            <Text style={styles.buttonText}>לחיבור פרוטוקול זהות</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (goalState.uiStage === "state_clarification_decision") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "ARC Goal LIVE" }} />
        <ScrollView contentContainerStyle={styles.content}>
          <StateClarificationDecisionScreen
            copy={getStateClarificationDecisionCopy()}
            onAnswer={(hasEmotionOrUrge) => setGoalState((current) => resolveAfterStateClarificationDecision(hasEmotionOrUrge, current))}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (goalState.uiStage === "trigger_identification") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "ARC Goal LIVE" }} />
        <ScrollView contentContainerStyle={styles.content}>
          <TriggerIdentificationScreen
            copy={getTriggerIdentificationCopy()}
            onAnswer={(description) => setGoalState((current) => resolveAfterTriggerIdentification(current, description))}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (goalState.uiStage === "third_person_imagery") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "ARC Goal LIVE" }} />
        <ScrollView contentContainerStyle={styles.content}>
          <InstructionScreen
            copy={getThirdPersonImageryCopy(identityProfile!)}
            onContinue={() => setGoalState((current) => resolveAfterThirdPersonImagery(goal, current))}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (goalState.uiStage === "urge_need_identification") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "ARC Goal LIVE" }} />
        <ScrollView contentContainerStyle={styles.content}>
          <NeedIdentificationScreen
            copy={getUrgeNeedIdentificationCopy()}
            presets={URGE_NEED_IDENTIFICATION_PRESETS}
            onAnswer={(need) => setGoalState((current) => resolveAfterUrgeNeedIdentification(current, need))}
          />
          {(() => {
            if (goalState.identifiedNeed === null) return null;
            const previewUrgeArc = findUrgeArcForNeed(goal, urgeArcsById, goalState.identifiedNeed);
            if (!previewUrgeArc) return null;
            return <Text style={styles.body}>{`פעולה מיטיבה אפשרית: ${previewUrgeArc.beneficialAlternativeAction}`}</Text>;
          })()}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (goalState.uiStage === "reassessment") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "ARC Goal LIVE" }} />
        <ScrollView contentContainerStyle={styles.content}>
          <ReassessmentScreen
            showUrgeOption={goal.urgeMappings.length > 0}
            showSupportiveOption={goal.interferingMappings.length > 0}
            onSelect={(choice) => {
              // Adaptive ARC architecture task (unified PD/ARC Goal),
              // Phase 6: "direct" never runs a bridge this session (no
              // Beneficial Action to confirm); "urge"/"supportive" always
              // will (see resolveAfterReassessment's own doc -- neither
              // choice is ever offered/reachable unless its own mapping
              // list is non-empty). This is the only other place a fresh
              // session's queue is ever started -- see this file's own
              // beginPendingActionExecution doc for the complementary
              // zero-mapping case.
              beginPendingActionExecution(
                sessionId,
                choice === "direct" ? [IDENTITY_ACTION_ROLE, GOAL_ACTION_ROLE] : [BENEFICIAL_ACTION_ROLE, IDENTITY_ACTION_ROLE, GOAL_ACTION_ROLE]
              );
              applyGoalHop(resolveAfterReassessment(choice, goal, goalState, urgeArcsById));
            }}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (goalState.uiStage === "urge_select") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "ARC Goal LIVE" }} />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{URGE_SELECT_TITLE}</Text>
          {goal.urgeMappings.map((mapping) => {
            const urgeArc = urgeArcsById[mapping.urgeArcId];
            if (!urgeArc) return null;
            return (
              <Pressable
                key={mapping.id}
                style={[styles.button, styles.fullWidthButton]}
                onPress={() => setGoalState((current) => selectUrgeMapping(current, mapping.id, goal, urgeArcsById))}
              >
                <Text style={styles.buttonText}>{urgeArc.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (goalState.uiStage === "urge_representation") {
    const mapping = resolveSelectedUrgeMapping(goal, goalState);
    const urgeArc = mapping ? urgeArcsById[mapping.urgeArcId] : undefined;
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "ARC Goal LIVE" }} />
        <View style={styles.content}>
          <Text style={styles.title}>{URGE_REPRESENTATION_QUESTION_TITLE}</Text>
          <Text style={styles.body}>{URGE_REPRESENTATION_QUESTION_BODY}</Text>
          {getUrgeRepresentationChoices().map((option) => (
            <Pressable
              key={option.value}
              style={[styles.button, styles.fullWidthButton]}
              onPress={() => resumeInnerAfterDetour(resolveAfterUrgeRepresentation(goalState, option.value, urgeArc ?? null))}
            >
              <Text style={styles.buttonText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  if (goalState.uiStage === "urge_stop_action") {
    const mapping = resolveSelectedUrgeMapping(goal, goalState);
    const urgeArc = mapping ? urgeArcsById[mapping.urgeArcId] : undefined;
    const copy = urgeArc ? getUrgeStopActionCopy(urgeArc) : { title: "פעולת עצירה", body: "", segments: null };
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "ARC Goal LIVE" }} />
        <View style={styles.content}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>
          <Pressable
            style={[styles.button, styles.fullWidthButton]}
            onPress={() => resumeInnerAfterDetour({ uiStage: "inner", goalState: resolveAfterUrgeStopAction(goalState) })}
          >
            <Text style={styles.buttonText}>{URGE_STOP_ACTION_DONE_LABEL}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (goalState.uiStage === "urge_encoding") {
    const mapping = resolveSelectedUrgeMapping(goal, goalState);
    const urgeArc = mapping ? urgeArcsById[mapping.urgeArcId] : undefined;
    const copy = urgeArc ? getUrgeEncodingCopy(urgeArc, goalState.urgeRepresentation ?? "unsure") : { title: "קידוד מותאם", body: "", secondaryBody: null, hint: null, buttonLabel: "המשך" };
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "ARC Goal LIVE" }} />
        <View style={styles.content}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>
          {copy.secondaryBody && <Text style={styles.body}>{copy.secondaryBody}</Text>}
          <Pressable
            style={[styles.button, styles.fullWidthButton]}
            onPress={() => resumeInnerAfterDetour({ uiStage: "inner", goalState: resolveAfterUrgeEncoding(goalState) })}
          >
            <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (goalState.uiStage === "supportive_state_select") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "ARC Goal LIVE" }} />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{GOAL_INTERFERING_STATE_SELECT_TITLE}</Text>
          {goal.interferingMappings.map((mapping) => (
            <Pressable
              key={mapping.id}
              style={[styles.button, styles.fullWidthButton]}
              onPress={() => setGoalState((current) => selectSupportiveMapping(current, mapping.id))}
            >
              <Text style={styles.buttonText}>{mapping.interferingState}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (goalState.uiStage === "execution_mode_choice") {
    const route: "urge" | "supportive" = goalState.reassessmentChoice === "urge" ? "urge" : "supportive";
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "ARC Goal LIVE" }} />
        <View style={styles.content}>
          <ExecutionModeChoiceScreen
            onSelect={(mode) => applyGoalHop(resolveAfterExecutionModeChoice(route, goalState, mode))}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (goalState.uiStage === "mini_arc_embedded") {
    const route: "urge" | "supportive" = goalState.reassessmentChoice === "urge" ? "urge" : "supportive";
    const mapping = route === "urge" ? resolveSelectedUrgeMapping(goal, goalState) : resolveSelectedMapping(goal, goalState);
    const miniArc = mapping?.miniArcId ? miniArcsById[mapping.miniArcId] : undefined;
    if (!miniArc || goalState.miniArcStage === null) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.content}>
            <Text style={styles.title}>ה־Mini ARC המחובר לא נמצא</Text>
          </View>
        </SafeAreaView>
      );
    }
    const reminderLine =
      route === "urge" && goalState.identifiedNeed !== null && goalState.identifiedNeed !== IDENTIFIED_NEED_UNKNOWN
        ? `הצורך שזיהית: ${goalState.identifiedNeed}`
        : null;
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "ARC Goal LIVE" }} />
        <ScrollView contentContainerStyle={styles.content}>
          <EmbeddedMiniArcScreen
            stage={goalState.miniArcStage}
            build={miniArc}
            reminderLine={reminderLine}
            onContinue={() => applyGoalHop(resolveAfterEmbeddedMiniArcStage(route, goalState))}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (goalState.uiStage === "urge_action_confirm") {
    const mapping = resolveSelectedUrgeMapping(goal, goalState);
    const urgeArc = mapping ? urgeArcsById[mapping.urgeArcId] : undefined;
    const copy = urgeArc ? getUrgeActionConfirmCopy(urgeArc) : { title: "פעולה מיטיבה חלופית", body: "" };
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "ARC Goal LIVE" }} />
        <View style={styles.content}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>
          <Pressable
            style={[styles.button, styles.fullWidthButton]}
            onPress={() => {
              // Adaptive ARC architecture task (unified PD/ARC Goal),
              // Phase 6: this tap IS the Beneficial Action role's
              // explicit confirmation for the urge route.
              confirmArcGoalActionRole(BENEFICIAL_ACTION_ROLE);
              const resolved = resolveAfterBridgeConfirmed(goalState);
              attemptArcGoalProgressCommit(outerSession, resolved);
              setInnerSession(createArcGoalUrgeInnerInitialSession());
              setInnerStage("sensation_check");
              setGoalState(resolved);
            }}
          >
            <Text style={styles.buttonText}>המשך</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (goalState.uiStage === "supportive_action_confirm") {
    const mapping = resolveSelectedMapping(goal, goalState);
    const copy = mapping ? getSupportiveActionConfirmCopy(mapping) : { title: "פעולה תומכת", body: "" };
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "ARC Goal LIVE" }} />
        <View style={styles.content}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>
          <Pressable
            style={[styles.button, styles.fullWidthButton]}
            onPress={() => {
              // Adaptive ARC architecture task (unified PD/ARC Goal),
              // Phase 6: this tap IS the Beneficial Action role's
              // explicit confirmation for the supportive-state route.
              confirmArcGoalActionRole(BENEFICIAL_ACTION_ROLE);
              const resolved = resolveAfterBridgeConfirmed(goalState);
              attemptArcGoalProgressCommit(outerSession, resolved);
              setInnerSession(createArcGoalInnerInitialSession());
              setInnerStage("sensation_check");
              setGoalState(resolved);
            }}
          >
            <Text style={styles.buttonText}>המשך</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (goalState.uiStage === "goal_action_confirm") {
    const copy = getGoalActionConfirmCopy(goal);
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "ARC Goal LIVE" }} />
        <View style={styles.content}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={handleGoalActionRoleConfirmed}>
            <Text style={styles.buttonText}>סיימתי</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (goalState.uiStage === "goal_connection") {
    // Adaptive ARC architecture task (unified PD/ARC Goal), method-completion
    // correction: reached only when identityProfile/goal are both already
    // resolved (this uiStage is only ever set from inside commitAdvanceOuter,
    // which already requires both -- see that function's own early return).
    const copy = getGoalConnectionStepCopy(goal!, identityProfile!, manifestContribution);
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "ARC Goal LIVE" }} />
        <View style={styles.content}>
          <Text style={styles.title}>{copy.title}</Text>
          {copy.lines.map((line, index) => (
            <Text key={index} style={styles.body}>{line}</Text>
          ))}
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={handleGoalConnectionContinue}>
            <Text style={styles.buttonText}>המשך</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (goalState.uiStage === "inner") {
    const innerCtx = currentInnerContext();
    if (!innerCtx) {
      const notFoundText = goalState.reassessmentChoice === "urge" ? "הדחף המחובר לא נמצא" : "הפרוטוקול התומך לא נמצא";
      return (
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.content}>
            <Text style={styles.title}>{notFoundText}</Text>
          </View>
        </SafeAreaView>
      );
    }
    const { profile: innerProfile, activeLayers: innerActiveLayers } = innerCtx;
    const rendererProps = buildRendererProps(
      {
        session: innerSession,
        stage: innerStage,
        profile: innerProfile,
        activeLayers: innerActiveLayers,
        setSession: setInnerSession,
        commitAdvance: commitAdvanceInner,
      },
      () => {}
    );
    const copy = getStageCopy(innerStage, innerProfile, innerSession, innerActiveLayers, evidenceIndex);
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: `ARC Goal LIVE — ${copy.title}` }} />
        <ScrollView contentContainerStyle={styles.content}>
          <ArcLiveRenderer stage={innerStage} {...rendererProps} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // goalState.uiStage === "outer"
  if (!identityProfile) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }
  const rendererProps = buildRendererProps(
    {
      session: outerSession,
      stage: outerStage,
      profile: identityProfile,
      activeLayers: ["identity"],
      setSession: setOuterSession,
      commitAdvance: commitAdvanceOuter,
    },
    handleCompleteContinue,
    // Adaptive ARC architecture task (unified PD/ARC Goal), Phase 6
    // correction: this label used to read "המשך לפעולת המטרה" ("continue
    // to the goal action"), because goal_action_confirm used to follow
    // this exact screen. It no longer does (relocated to before
    // success_focus -- see this file's own module doc) -- handleCompleteContinue
    // is now the screen's true final step, so the label is corrected to
    // match what it actually does.
    weeklyActionId ? "סיום וחזרה לשגרה" : "סיום"
  );
  const copy = getStageCopy(outerStage, identityProfile, outerSession, ["identity"], evidenceIndex, goalState.goalConnectionShown);
  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: `ARC Goal LIVE — ${copy.title}` }} />
      <ScrollView contentContainerStyle={styles.content}>
        <ArcLiveRenderer stage={outerStage} {...rendererProps} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, justifyContent: "flex-start" },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  body: { fontSize: 16, textAlign: "right", marginBottom: 16 },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 12 },
  button: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
  },
  fullWidthButton: { marginTop: 16 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
