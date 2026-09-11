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
  loadMiniArcBuilds,
  loadSessionLog,
  loadUrgeArcs,
  loadWeeklyActions,
  updateLastSessionLogEntryGratitude,
  upsertWeeklyAction,
} from "../data/storage.ts";
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
  getUrgeNeedIdentificationCopy,
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
  resolveAfterUrgeNeedIdentification,
  resolveExecutionMode,
  resolveSelectedMapping,
  resolveSelectedUrgeMapping,
  selectSupportiveMapping,
  selectUrgeMapping,
  shouldInterceptInnerAtAct,
  URGE_NEED_IDENTIFICATION_PRESETS,
  URGE_SELECT_TITLE,
  urgeArcToProfile,
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
  const [sessionStartedAt, setSessionStartedAt] = useState(() => new Date().toISOString());

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

  function clearPendingFields() {
    setPendingSensationLocation("");
    setPendingCustomSensationLocation("");
    setPendingSensationLocationUnclear(false);
    setPendingTriggerContext("");
    setPendingInterferingThought("");
    setPendingAlternativeAction("");
    setPendingAlternativeActionDuration(null);
  }

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([getArcGoal(goalId), loadArcBuilds(), loadSessionLog(), loadUrgeArcs(), loadMiniArcBuilds()]).then(
        ([loadedGoal, builds, sessionLog, urgeArcs, miniArcBuilds]) => {
        if (cancelled) return;
        if (!loadedGoal) {
          setStatus("notFound");
          return;
        }
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
        setPresenceObjectGroundingDone(false);
        clearPendingFields();
        setGratitudeText("");
        setGratitudeMemoryDetailText("");
        setProgressEvidenceText("");
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

  function commitAdvanceOuter(patchedSession: ArcLiveState, transitionStage: ArcStage = outerStage) {
    if (!identityProfile || !goal) return;
    const { session: nextSession, stage: nextStage } = advanceLiveSession(transitionStage, patchedSession, identityProfile, ["identity"]);
    if (outerStage === "act" && nextStage !== "act") clearTimerRun("beneficialAction");
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
    if (shouldInterceptInnerAtAct(nextStage)) {
      const route: "urge" | "supportive" = goalState.reassessmentChoice === "urge" ? "urge" : "supportive";
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

  function handleCompleteContinue() {
    const trimmedGratitude = gratitudeText.trim();
    const trimmedMemoryDetail = gratitudeMemoryDetailText.trim();
    const trimmedProgressEvidence = progressEvidenceText.trim();
    updateLastSessionLogEntryGratitude(
      trimmedGratitude.length > 0 ? trimmedGratitude : null,
      trimmedMemoryDetail.length > 0 ? trimmedMemoryDetail : null,
      trimmedProgressEvidence.length > 0 ? trimmedProgressEvidence : null
    );
    setGratitudeText("");
    setGratitudeMemoryDetailText("");
    setProgressEvidenceText("");
    setGoalState((current) => ({ ...current, uiStage: "goal_action_confirm" }));
  }

  /**
   * Routine <-> ARC Goal linking task, spec section 3 steps 5-6: "When
   * the ARC Goal session is completed, return automatically to the
   * routine. Mark the routine action as completed only after the
   * connected goal action is completed." -- reached exclusively from
   * goal_action_confirm's own "סיימתי" tap (never earlier: leaving/
   * canceling the session at any point before this, including the whole
   * urge/supportive bridge and the outer run itself, never marks
   * anything complete). Reuses arc/routineLinks.ts's own
   * markWeeklyActionCompletedToday -- the SAME completion rule
   * WeeklyActionsSection's own no-linked-protocol plain check-off
   * already uses, never a separate one. Every other entry point into
   * this screen (weeklyActionId absent) keeps the original "back to
   * Home" behavior unchanged.
   */
  async function handleGoalActionConfirmDone() {
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
      restartLabel,
      onRestart,
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
            onSelect={(choice) => applyGoalHop(resolveAfterReassessment(choice, goal, goalState))}
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
                onPress={() => setGoalState((current) => selectUrgeMapping(current, mapping.id))}
              >
                <Text style={styles.buttonText}>{urgeArc.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
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
              const resolved = resolveAfterBridgeConfirmed(goalState);
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
              const resolved = resolveAfterBridgeConfirmed(goalState);
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
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={handleGoalActionConfirmDone}>
            <Text style={styles.buttonText}>סיימתי</Text>
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
    "המשך לפעולת המטרה"
  );
  const copy = getStageCopy(outerStage, identityProfile, outerSession, ["identity"], evidenceIndex);
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
