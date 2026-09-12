import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import type { ArcBuild, ArcLiveState, ArcStage } from "../arc/types.ts";
import { createEmptyLiveState } from "../arc/types.ts";
import { resolveActPhase, resolveEncodingTarget } from "../arc/arcEngine.ts";
import { getStageCopy } from "../arc/stageCopy.ts";
import { buildEvidenceIndex, buildSessionEvidenceContext } from "../arc/evidence.ts";
import type { EvidenceRecord } from "../arc/evidence.ts";
import {
  createIdentityExtensionInitialSession,
  getFirstIdentityExtensionStage,
  getIdentityExtensionActionModeOptions,
  IDENTITY_EXTENSION_ACTION_MODE_QUESTION,
  IDENTITY_EXTENSION_MICRO_DURATION_MINUTES,
  IDENTITY_EXTENSION_SCHEDULED_CONFIRMATION_BODY,
  IDENTITY_EXTENSION_SCHEDULED_CONFIRMATION_TITLE,
  isIdentityExtensionActionScheduledOnly,
  isIdentityExtensionEligible,
  resolveIdentityExtensionActiveLayers,
  resolveIdentityExtensionEntry,
} from "../arc/identityExtension.ts";
import type { IdentityExtensionActionMode, IdentityExtensionTrack } from "../arc/identityExtension.ts";
import { appendSessionLogEntry, getArcBuild, getArcGoal, loadSessionLog, updateLastSessionLogEntryGratitude } from "../data/storage.ts";
import { DEFERRAL_OPTIONS, scheduleFutureSuccessFocus } from "../data/reminders.ts";
import {
  advanceLiveSession,
  applyActionCompletion,
  applyActionImageryCompleted,
  applyAlternativeAction,
  applyBeneficialActionDurationSelected,
  applyCompletedActionImageryFinished,
  applyImprovedActionImageryFinished,
  applyPlannedActionConfirmed,
  applySuccessFocusExtraMinutes,
  applyWantsFutureSuccessFocus,
  hasValidAlternativeAction,
} from "./liveEventAdapter.ts";
import { ArcLiveRenderer } from "./ArcLiveRenderer.tsx";
import { ActionImageryScreen, ActionScreen, BeneficialActionDurationChoiceScreen } from "./screens.tsx";

type Status = "loading" | "notEligible" | "ready" | "scheduled" | "complete";

const ALTERNATIVE_ACTION_DURATION_MINUTES = [5, 10, 15, 20, 30];

/**
 * live/IdentityExtensionScreen.tsx (route: /identity-extension/live)
 *
 * Phase 8 Part 2: the driving screen for arc/identityExtension.ts's
 * resumption adapter. Starts DIRECTLY at "encode" -- never routes
 * through "trigger_selection" -- so Awareness/Stay/Acceptance/Presence/
 * Regulation are structurally never visited (see that module's own doc).
 * From "encode" through "complete" this reuses the EXISTING
 * ArcLiveRenderer/live/liveEventAdapter.ts machinery every other Identity
 * session already runs through -- the only genuinely new UI here is the
 * "act" stage's action-mode chooser (Full/Micro/Alternative/Scheduled)
 * and the "Scheduled" terminal confirmation, both owned entirely by this
 * screen and arc/identityExtension.ts, never by arc/arcEngine.ts.
 *
 * Params: track ("personal_development" | "goal_achievement"),
 * arcBuildId (personal_development -- already resolved by
 * live/IdentityExtensionOfferScreen.tsx's own picker/creation flow),
 * goalId (goal_achievement -- this screen resolves goal.identityProtocolId
 * + the active sub-goal itself, via resolveIdentityExtensionEntry).
 *
 * Scheduled-action requirement: choosing "Scheduled" NEVER advances past
 * the action-mode chooser -- no Action Imagery, no timed Action, no
 * Success Focus, no Gratitude-and-Learning, no completed/improved action
 * imagery, and appendSessionLogEntry is never called (never "complete").
 * Full/Micro/Alternative all continue into the existing act -> ... ->
 * complete tail exactly as any other identity-target session would.
 */
export default function IdentityExtensionScreen() {
  const { track: trackParam, arcBuildId: arcBuildIdParam, goalId: goalIdParam } = useLocalSearchParams<{
    track?: string;
    arcBuildId?: string;
    goalId?: string;
  }>();
  const track: IdentityExtensionTrack = trackParam === "goal_achievement" ? "goal_achievement" : "personal_development";
  const goalId = typeof goalIdParam === "string" ? goalIdParam : null;

  const [status, setStatus] = useState<Status>("loading");
  const [arcBuild, setArcBuild] = useState<ArcBuild | null>(null);

  const [stage, setStage] = useState<ArcStage>(getFirstIdentityExtensionStage());
  const [session, setSession] = useState<ArcLiveState>(() => createIdentityExtensionInitialSession());
  const [sessionStartedAt, setSessionStartedAt] = useState(() => new Date().toISOString());
  const [evidenceIndex, setEvidenceIndex] = useState<EvidenceRecord[]>([]);

  // "act" stage's own action-mode chooser -- session-local only, never
  // part of ArcLiveState (see arc/identityExtension.ts's own module doc:
  // "full"/"micro" both funnel into the SAME existing engine mechanism
  // "alternative" already uses, differing only in copy/duration options).
  const [actionMode, setActionMode] = useState<IdentityExtensionActionMode | null>(null);
  const [pendingAlternativeAction, setPendingAlternativeAction] = useState("");
  const [pendingAlternativeActionDuration, setPendingAlternativeActionDuration] = useState<number | null>(null);
  const [scheduledNote, setScheduledNote] = useState("");

  const [gratitudeText, setGratitudeText] = useState("");
  const [gratitudeMemoryDetailText, setGratitudeMemoryDetailText] = useState("");
  const [progressEvidenceText, setProgressEvidenceText] = useState("");
  const [improvementText, setImprovementText] = useState("");

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        let resolvedArcBuildId: string | null = null;
        if (track === "goal_achievement") {
          const goal = goalId ? await getArcGoal(goalId) : null;
          resolvedArcBuildId = resolveIdentityExtensionEntry("goal_achievement", { goal }).arcBuildId;
        } else {
          resolvedArcBuildId = typeof arcBuildIdParam === "string" ? arcBuildIdParam : null;
        }
        const build = resolvedArcBuildId ? await getArcBuild(resolvedArcBuildId) : null;
        if (cancelled) return;
        if (!build || !isIdentityExtensionEligible(build)) {
          setStatus("notEligible");
          return;
        }
        setArcBuild(build);
        setStage(getFirstIdentityExtensionStage());
        setSession(createIdentityExtensionInitialSession());
        setSessionStartedAt(new Date().toISOString());
        setActionMode(null);
        setPendingAlternativeAction("");
        setPendingAlternativeActionDuration(null);
        setScheduledNote("");
        setGratitudeText("");
        setGratitudeMemoryDetailText("");
        setProgressEvidenceText("");
        setImprovementText("");
        const log = await loadSessionLog();
        if (cancelled) return;
        setEvidenceIndex(buildEvidenceIndex(log));
        setStatus("ready");
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [track, arcBuildIdParam, goalId])
  );

  const profile = arcBuild?.profile ?? null;
  const activeLayers = arcBuild ? resolveIdentityExtensionActiveLayers(arcBuild) : [];

  function returnAfterExit() {
    if (goalId) {
      router.replace({ pathname: "/goals/live/[goalId]", params: { goalId } });
      return;
    }
    router.replace("/self-development");
  }

  function finalizeCompletion(finishedSession: ArcLiveState) {
    const finishedAt = new Date().toISOString();
    let context = null;
    if (profile) {
      const resolution = resolveEncodingTarget({
        activeLayers,
        triggerType: finishedSession.triggerType,
        selectedTarget: finishedSession.selectedTarget,
        buildProfile: profile,
        selectedAction: finishedSession.selectedAction,
      });
      context = buildSessionEvidenceContext(
        resolution.layer,
        resolution.encoding,
        resolution.actionLabel,
        profile,
        finishedSession.triggerContext,
        finishedSession.triggerKnown
      );
    }
    appendSessionLogEntry({
      id: `identity_ext_${sessionStartedAt}_${finishedAt}`,
      startedAt: sessionStartedAt,
      finishedAt,
      success: finishedSession.realActionCompleted,
      fall: false,
      context,
    }).then(() => {
      const trimmedGratitude = gratitudeText.trim();
      const trimmedMemoryDetail = gratitudeMemoryDetailText.trim();
      const trimmedProgressEvidence = progressEvidenceText.trim();
      const trimmedImprovement = improvementText.trim();
      const fullReflectionCreditEarned =
        trimmedImprovement.length > 0 && finishedSession.completedActionImageryFinished && finishedSession.improvedActionImageryFinished;
      updateLastSessionLogEntryGratitude(
        trimmedGratitude.length > 0 ? trimmedGratitude : null,
        trimmedMemoryDetail.length > 0 ? trimmedMemoryDetail : null,
        trimmedProgressEvidence.length > 0 ? trimmedProgressEvidence : null,
        trimmedImprovement.length > 0 ? trimmedImprovement : null,
        fullReflectionCreditEarned
      );
    });
  }

  function commitAdvance(patchedSession: ArcLiveState, transitionStage: ArcStage = stage) {
    if (!profile) return;
    const { session: nextSession, stage: nextStage } = advanceLiveSession(transitionStage, patchedSession, profile, activeLayers);
    setSession(nextSession);
    setStage(nextStage);
    if (nextStage === "complete") {
      finalizeCompletion(nextSession);
      setStatus("complete");
    }
  }

  function selectActionMode(mode: IdentityExtensionActionMode) {
    setActionMode(mode);
    if (mode === "full") {
      setSession(applyPlannedActionConfirmed(session));
    }
    // "micro"/"alternative": stay put -- the trainee still needs to type
    // the action text and pick a duration below before this session's
    // selectedAction is ever set (see submitAlternativeAction).
    // "scheduled": stay put -- rendered as its own terminal confirmation,
    // see the render section below; session is never patched at all.
  }

  function submitAlternativeAction() {
    if (!hasValidAlternativeAction(pendingAlternativeAction, pendingAlternativeActionDuration)) return;
    setSession(applyAlternativeAction(session, pendingAlternativeAction, pendingAlternativeActionDuration));
  }

  if (status === "loading") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  if (status === "notEligible") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>לא נמצאה זהות מוגדרת להמשך</Text>
          <Text style={styles.body}>
            {track === "goal_achievement"
              ? "למטרה הזו עדיין אין פרוטוקול זהות מקושר, או שאין בו פעולת זהות מוגדרת."
              : "לא נבחרה זהות עם פעולה מוגדרת להמשך."}
          </Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={returnAfterExit}>
            <Text style={styles.buttonText}>חזרה</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (status === "complete") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>סיום</Text>
          <Text style={styles.body}>סיימת את בניית הזהות והפעולה.</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={returnAfterExit}>
            <Text style={styles.buttonText}>{goalId ? "חזרה למטרה" : "חזרה להתפתחות אישית"}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!arcBuild || !profile) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  // status === "ready"
  if (stage === "act") {
    const actPhase = resolveActPhase(session.plannedActionConfirmed, session.selectedAction, session.actionImageryCompleted);

    if (isIdentityExtensionActionScheduledOnly(actionMode)) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>{IDENTITY_EXTENSION_SCHEDULED_CONFIRMATION_TITLE}</Text>
            <Text style={styles.body}>{IDENTITY_EXTENSION_SCHEDULED_CONFIRMATION_BODY}</Text>
            <Text style={styles.question}>מתי תרצה לחזור לזה? (רשות)</Text>
            <TextInput style={styles.textInput} value={scheduledNote} onChangeText={setScheduledNote} textAlign="right" multiline />
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={returnAfterExit}>
              <Text style={styles.buttonText}>סיום</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      );
    }

    // actPhase === "choice" only when neither plannedActionConfirmed nor
    // selectedAction is set yet -- i.e. actionMode is still null, or the
    // trainee chose "micro"/"alternative" but hasn't submitted text+
    // duration yet. Both cases render this screen's own chooser/text
    // entry INSTEAD of ArcLiveRenderer's plain two-option
    // ActionChoiceScreen -- see module doc.
    if (actPhase === "choice") {
      const copy = getStageCopy("act", profile, session, activeLayers, evidenceIndex);
      if (actionMode === null) {
        return (
          <SafeAreaView style={styles.safeArea}>
            <ScrollView contentContainerStyle={styles.content}>
              <Text style={styles.title}>{copy.title}</Text>
              <Text style={styles.body}>{copy.body}</Text>
              <Text style={styles.question}>{IDENTITY_EXTENSION_ACTION_MODE_QUESTION}</Text>
              {getIdentityExtensionActionModeOptions().map((option) => (
                <Pressable key={option.value} style={[styles.button, styles.fullWidthButton]} onPress={() => selectActionMode(option.value)}>
                  <Text style={styles.buttonText}>{option.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </SafeAreaView>
        );
      }
      // actionMode is "micro" or "alternative" -- same underlying
      // mechanism (applyAlternativeAction), different duration chip set
      // and placeholder copy only.
      const durationOptions = actionMode === "micro" ? IDENTITY_EXTENSION_MICRO_DURATION_MINUTES : ALTERNATIVE_ACTION_DURATION_MINUTES;
      return (
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>{actionMode === "micro" ? "גרסה מיקרו של הפעולה" : "פעולה חלופית"}</Text>
            <TextInput
              style={styles.textInput}
              value={pendingAlternativeAction}
              onChangeText={setPendingAlternativeAction}
              textAlign="right"
              multiline
              placeholder={actionMode === "micro" ? "גרסה קצרה וקלה יותר לביצוע עכשיו" : "פעולה אחרת שתבצע עכשיו במקום"}
            />
            <View style={styles.chipRow}>
              {durationOptions.map((minutes) => (
                <Pressable
                  key={minutes}
                  style={[styles.chip, pendingAlternativeActionDuration === minutes && styles.chipSelected]}
                  onPress={() => setPendingAlternativeActionDuration(minutes)}
                >
                  <Text style={styles.chipText}>{minutes} דק'</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[styles.button, styles.fullWidthButton, !hasValidAlternativeAction(pendingAlternativeAction, pendingAlternativeActionDuration) && styles.buttonDisabled]}
              disabled={!hasValidAlternativeAction(pendingAlternativeAction, pendingAlternativeActionDuration)}
              onPress={submitAlternativeAction}
            >
              <Text style={styles.buttonText}>המשך</Text>
            </Pressable>
            <Pressable style={styles.cancelButton} onPress={() => setActionMode(null)}>
              <Text style={styles.cancelButtonText}>בחירה מחדש</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      );
    }

    if (actPhase === "imagery") {
      const copy = getStageCopy("act", profile, session, activeLayers, evidenceIndex);
      const { layer, actionLabel: currentAction, actionBodyCue } = resolveEncodingTarget({
        activeLayers,
        triggerType: session.triggerType,
        selectedTarget: session.selectedTarget,
        buildProfile: profile,
        selectedAction: session.selectedAction,
      });
      return (
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.content}>
            <ActionImageryScreen
              copy={copy}
              profile={profile}
              layer={layer}
              currentAction={currentAction}
              actionBodyCue={actionBodyCue}
              onContinue={() => setSession(applyActionImageryCompleted(session))}
            />
          </ScrollView>
        </SafeAreaView>
      );
    }

    // actPhase === "performing"
    const copy = getStageCopy("act", profile, session, activeLayers, evidenceIndex);
    const needsBeneficialActionDuration = session.selectedAction === null && session.beneficialActionDurationMinutes === null;
    if (needsBeneficialActionDuration) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.content}>
            <BeneficialActionDurationChoiceScreen copy={copy} onSelectDuration={(minutes) => setSession(applyBeneficialActionDurationSelected(session, minutes))} />
          </ScrollView>
        </SafeAreaView>
      );
    }
    const durationMinutes = session.selectedActionDuration ?? session.beneficialActionDurationMinutes ?? profile.actionDuration;
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <ActionScreen copy={copy} durationMinutes={durationMinutes} onCompleted={() => commitAdvance(applyActionCompletion(session, true))} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Every other reachable stage (encode, success_focus,
  // gratitude_and_learning, completed_action_imagery,
  // improved_action_imagery, complete) reuses the existing
  // ArcLiveRenderer verbatim -- see module doc. Every prop below that
  // belongs to a stage this screen never reaches (trigger_selection,
  // sensation/regulation/acceptance ratings, negative_action, the plain
  // act/choice sub-phase handled above, ...) is a safe, never-exercised
  // stub -- ArcLiveRenderer's switch is exhaustive over ArcStage, but
  // this screen's own `stage` state can never actually reach those
  // cases (see arc/identityExtension.ts's own doc on why).
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <ArcLiveRenderer
          stage={stage}
          session={session}
          profile={profile}
          activeLayers={activeLayers}
          evidenceIndex={evidenceIndex}
          availableTriggers={[]}
          pendingSensationLocation=""
          pendingCustomSensationLocation=""
          pendingSensationLocationUnclear={false}
          pendingTriggerContext=""
          onChangeTriggerContext={() => {}}
          pendingInterferingThought=""
          onChangeInterferingThought={() => {}}
          onTriggerContextContinue={() => {}}
          onSelectSideObservationMode={() => {}}
          presenceObjectGroundingDone={false}
          onPresenceObjectGroundingComplete={() => {}}
          onSelectTrigger={() => {}}
          onScaleAnswer={() => {}}
          onSelectSensationLocation={() => {}}
          onChangeCustomSensationLocation={() => {}}
          onSelectSensationLocationUnclear={() => {}}
          onSubmitSensationIntensity={() => {}}
          onYesNoAnswer={() => {}}
          onInterferingThoughtAnswer={() => {}}
          onBalancedAlternativeInterpretationContinue={() => {}}
          onNeedIdentificationAnswer={() => {}}
          onSelectTarget={() => {}}
          onSelectReactiveExperience={() => {}}
          onGenericContinue={() => commitAdvance(session)}
          onRegulateContinue={() => {}}
          onPresenceExperienceRating={() => {}}
          onRegulationExperienceRating={() => {}}
          onAcceptWillingnessAnswer={() => {}}
          onAcceptIntensityRating={() => {}}
          onAcceptContinueWithoutRating={() => {}}
          pendingAlternativeAction=""
          pendingAlternativeActionDuration={null}
          onConfirmPlannedAction={() => {}}
          onChangeAlternativeAction={() => {}}
          onSelectAlternativeActionDuration={() => {}}
          onSubmitAlternativeAction={() => {}}
          onActionImageryContinue={() => {}}
          onSelectBeneficialActionDuration={() => {}}
          onActionCompleted={() => {}}
          onSuccessFocusExtraMinutesSubmit={(minutes) => setSession(applySuccessFocusExtraMinutes(session, minutes))}
          onWantsFutureSuccessFocusAnswer={(yes) => {
            const patched = applyWantsFutureSuccessFocus(session, yes);
            if (yes) {
              setSession(patched);
            } else {
              commitAdvance(patched);
            }
          }}
          futureSuccessFocusScheduleOptions={DEFERRAL_OPTIONS}
          onScheduleFutureSuccessFocus={(option, durationMinutes) => {
            scheduleFutureSuccessFocus({ option, durationMinutes });
            commitAdvance(session);
          }}
          negativeActionDurationMinutes={null}
          onNegativeActionStart={() => {}}
          onNegativeActionCompleted={() => {}}
          resumedNegativeActionRun={null}
          gratitudeText={gratitudeText}
          onChangeGratitudeText={setGratitudeText}
          gratitudeMemoryDetailText={gratitudeMemoryDetailText}
          onChangeGratitudeMemoryDetailText={setGratitudeMemoryDetailText}
          progressEvidenceText={progressEvidenceText}
          onChangeProgressEvidenceText={setProgressEvidenceText}
          improvementText={improvementText}
          onChangeImprovementText={setImprovementText}
          onGratitudeAndLearningContinue={() => commitAdvance(session)}
          onCompletedActionImageryContinue={() => commitAdvance(applyCompletedActionImageryFinished(session))}
          onImprovedActionImageryContinue={() => commitAdvance(applyImprovedActionImageryFinished(session))}
          onRestart={returnAfterExit}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  body: { fontSize: 16, textAlign: "right", marginBottom: 12, lineHeight: 22 },
  question: { fontSize: 15, fontWeight: "600", textAlign: "right", marginTop: 8, marginBottom: 6 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginBottom: 12 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 15 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10, alignItems: "center" },
  buttonDisabled: { opacity: 0.4 },
  fullWidthButton: { marginTop: 10 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  cancelButton: { marginTop: 10, alignItems: "center" },
  cancelButtonText: { color: "#888", fontSize: 14 },
});
