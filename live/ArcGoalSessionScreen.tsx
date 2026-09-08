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
import { createEmptyLiveState } from "../arc/types.ts";
import { getAvailableLiveTriggers, resolveEncodingTarget } from "../arc/arcEngine.ts";
import { getStageCopy } from "../arc/stageCopy.ts";
import { buildEvidenceIndex, buildSessionEvidenceContext } from "../arc/evidence.ts";
import type { EvidenceRecord } from "../arc/evidence.ts";
import {
  appendSessionLogEntry,
  clearTimerRun,
  getArcGoal,
  loadArcBuilds,
  loadSessionLog,
  updateLastSessionLogEntryGratitude,
} from "../data/storage.ts";
import {
  createArcGoalInnerInitialSession,
  createArcGoalOuterInitialSession,
  createEmptyArcGoalLiveState,
  getGoalActionConfirmCopy,
  getNextGoalUiStage,
  getSupportiveActionConfirmCopy,
  GOAL_INTERFERENCE_CHECK_LABELS,
  GOAL_INTERFERENCE_CHECK_QUESTION,
  GOAL_INTERFERING_STATE_SELECT_TITLE,
  needsGoalInterferenceDetour,
  resolveAfterSupportiveActionConfirmed,
  resolveSelectedMapping,
  shouldInterceptInnerAtAct,
} from "../arc/arcGoalEngine.ts";
import type { ArcGoalLiveState, ArcGoalUiStage } from "../arc/arcGoalEngine.ts";
import {
  advanceLiveSession,
  applyAcceptanceWillingnessAnswer,
  applyActionCompletion,
  applyActionImageryCompleted,
  applyAlternativeAction,
  applyBeneficialActionDurationSelected,
  applyInterferingThoughtAnswer,
  applyNeedIdentificationAnswer,
  applyPlannedActionConfirmed,
  applyRegulationToolUsed,
  applyScaleAnswer,
  applySensationAnswer,
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
  const { goalId } = useLocalSearchParams<{ goalId: string }>();

  const [status, setStatus] = useState<Status>("loading");
  const [goal, setGoal] = useState<ArcGoal | null>(null);
  const [identityProfile, setIdentityProfile] = useState<ArcBuildProfile | null>(null);
  const [arcBuildsById, setArcBuildsById] = useState<Record<string, ArcBuild>>({});
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
    setPendingAlternativeAction("");
    setPendingAlternativeActionDuration(null);
  }

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([getArcGoal(goalId), loadArcBuilds(), loadSessionLog()]).then(([loadedGoal, builds, sessionLog]) => {
        if (cancelled) return;
        if (!loadedGoal) {
          setStatus("notFound");
          return;
        }
        const byId: Record<string, ArcBuild> = {};
        for (const build of builds) byId[build.id] = build;
        setArcBuildsById(byId);
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
        clearPendingFields();
        setGratitudeText("");
        setGratitudeMemoryDetailText("");
        setProgressEvidenceText("");
        setStatus("running");
      });
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
    if (nextStage === "desired_state_check" && needsGoalInterferenceDetour(goal, goalState)) {
      setInnerSession(createArcGoalInnerInitialSession());
      setInnerStage("sensation_check");
      setGoalState((current) => ({ ...current, uiStage: "goal_interference_check" }));
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

  function commitAdvanceInner(patchedSession: ArcLiveState, transitionStage: ArcStage = innerStage) {
    const supportiveProfile = resolveSupportiveProfile();
    if (!supportiveProfile) return;
    const { session: nextSession, stage: nextStage } = advanceLiveSession(transitionStage, patchedSession, supportiveProfile, ["state"]);
    clearPendingFields();
    if (shouldInterceptInnerAtAct(nextStage)) {
      setGoalState((current) => ({ ...current, uiStage: "supportive_action_confirm" }));
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
      onTriggerContextContinue: () => commitAdvance(applyTriggerContext(session, pendingTriggerContext)),
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
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>המטרה לא נמצאה</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/goals")}>
            <Text style={styles.buttonText}>חזרה לרשימת המטרות</Text>
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

  if (goalState.uiStage === "goal_interference_check") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "ARC Goal LIVE" }} />
        <View style={styles.content}>
          <Text style={styles.title}>{GOAL_INTERFERENCE_CHECK_QUESTION}</Text>
          <View style={styles.buttonRow}>
            <Pressable
              style={styles.button}
              onPress={() => applyGoalHop(getNextGoalUiStage("goal_interference_check", goal, { ...goalState, hasGoalInterference: true }))}
            >
              <Text style={styles.buttonText}>{GOAL_INTERFERENCE_CHECK_LABELS.yes}</Text>
            </Pressable>
            <Pressable
              style={styles.button}
              onPress={() =>
                applyGoalHop(getNextGoalUiStage("goal_interference_check", goal, { ...goalState, hasGoalInterference: false }))
              }
            >
              <Text style={styles.buttonText}>{GOAL_INTERFERENCE_CHECK_LABELS.no}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (goalState.uiStage === "goal_interfering_state_select") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "ARC Goal LIVE" }} />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{GOAL_INTERFERING_STATE_SELECT_TITLE}</Text>
          {goal.interferingMappings.map((mapping) => (
            <Pressable
              key={mapping.id}
              style={[styles.button, styles.fullWidthButton]}
              onPress={() =>
                applyGoalHop(
                  getNextGoalUiStage("goal_interfering_state_select", goal, { ...goalState, selectedMappingId: mapping.id })
                )
              }
            >
              <Text style={styles.buttonText}>{mapping.interferingState}</Text>
            </Pressable>
          ))}
        </ScrollView>
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
              const resolved = resolveAfterSupportiveActionConfirmed(goalState);
              setInnerSession(createArcGoalInnerInitialSession());
              setInnerStage("sensation_check");
              setGoalState({ ...resolved, uiStage: "outer" });
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
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.replace("/")}>
            <Text style={styles.buttonText}>סיימתי</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (goalState.uiStage === "inner") {
    const supportiveProfile = resolveSupportiveProfile();
    if (!supportiveProfile) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.content}>
            <Text style={styles.title}>הפרוטוקול התומך לא נמצא</Text>
          </View>
        </SafeAreaView>
      );
    }
    const rendererProps = buildRendererProps(
      {
        session: innerSession,
        stage: innerStage,
        profile: supportiveProfile,
        activeLayers: ["state"],
        setSession: setInnerSession,
        commitAdvance: commitAdvanceInner,
      },
      () => {}
    );
    const copy = getStageCopy(innerStage, supportiveProfile, innerSession, ["state"], evidenceIndex);
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
