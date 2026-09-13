import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";

import type { ArcBuild, ArcGoal, ArcLiveState, ArcStage, FourWeekProgramWeekNumber } from "../arc/types.ts";
import { resolveActPhase, resolveEncodingTarget, deriveActiveLayersForArcBuild } from "../arc/arcEngine.ts";
import { getStageCopy } from "../arc/stageCopy.ts";
import { buildEvidenceIndex, buildSessionEvidenceContext } from "../arc/evidence.ts";
import type { EvidenceRecord } from "../arc/evidence.ts";
import {
  createIdentityExtensionInitialSession,
  getIdentityExtensionActionModeOptions,
  IDENTITY_EXTENSION_ACTION_MODE_QUESTION,
  IDENTITY_EXTENSION_MICRO_DURATION_MINUTES,
  IDENTITY_EXTENSION_SCHEDULED_CONFIRMATION_BODY,
  IDENTITY_EXTENSION_SCHEDULED_CONFIRMATION_TITLE,
  isIdentityExtensionActionScheduledOnly,
} from "../arc/identityExtension.ts";
import type { IdentityExtensionActionMode } from "../arc/identityExtension.ts";
import {
  getFirstMiniIdentityStage,
  getMiniIdentityStageCopy,
  getNextMiniIdentityStage,
  MINI_IDENTITY_NO_DATA_BODY,
  MINI_IDENTITY_NO_DATA_TITLE,
  MINI_IDENTITY_TITLE,
  resolveMiniIdentityContent,
  resolveMiniIdentitySteps,
} from "../arc/miniIdentity.ts";
import type { MiniIdentityStage } from "../arc/miniIdentity.ts";
import { addPracticeRecord, clearReturnContext } from "../arc/fourWeekProgram.ts";
import { appendSessionLogEntry, getArcBuild, getArcGoal, loadSessionLog, updateLastSessionLogEntryGratitude, upsertArcGoal } from "../data/storage.ts";
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

type Status = "loading" | "notEligible" | "miniIdentity" | "engine" | "complete";

const ALTERNATIVE_ACTION_DURATION_MINUTES = [5, 10, 15, 20, 30];

/**
 * live/ArcGoalMiniIdentityScreen.tsx (route: /goals/mini-identity/[goalId])
 *
 * ARC Goal four-week correction: the real "ARC Mini Goal" combined route
 * for Weeks 2-3 -- (optional Mini support, launched separately by the
 * dashboard beforehand) -> Mini Identity (arc/miniIdentity.ts's own
 * short, linear sequence) -> real goal action -> full post-action
 * completion. Mini Identity NEVER re-enters the full Identity Extension
 * (arc/identityExtension.ts/live/IdentityExtensionScreen.tsx) and never
 * repeats Awareness/Stay/Acceptance/Presence/Regulation -- this screen's
 * own local `stage` state starts at "identity_recall" (Mini Identity's
 * own first stage) and, once Mini Identity's own last step is done, jumps
 * DIRECTLY to arc/arcEngine.ts's "act" ArcStage (mirroring exactly how
 * live/IdentityExtensionScreen.tsx jumps directly to "encode" -- see that
 * module's own doc). From "act" onward this reuses the SAME existing
 * ArcLiveRenderer/live/liveEventAdapter.ts machinery every other
 * identity-target session already runs through (JSX duplicated here
 * rather than shared, matching this codebase's per-screen-owns-its-
 * rendering convention -- never a risky refactor of the existing,
 * working IdentityExtensionScreen.tsx).
 *
 * Params: goalId (required), fourWeekWeek (optional -- defaults to the
 * goal's own current week). Real completion (reaching "complete") logs a
 * "mini_identity" practice record on that week and returns to the
 * four-week dashboard; choosing "Scheduled" at the action-mode chooser
 * never advances past "act" -- no imagery, no performing, no
 * success_focus, no Gratitude, no practice record, no week/goal update
 * (spec: "if the user only schedules the action... don't mark goal
 * action complete").
 */
export default function ArcGoalMiniIdentityScreen() {
  const { goalId: goalIdParam, fourWeekWeek: fourWeekWeekParam } = useLocalSearchParams<{ goalId: string; fourWeekWeek?: string }>();
  const goalId = typeof goalIdParam === "string" ? goalIdParam : null;

  const [status, setStatus] = useState<Status>("loading");
  const [goal, setGoal] = useState<ArcGoal | null>(null);
  const [identityBuild, setIdentityBuild] = useState<ArcBuild | null>(null);

  const [miniStage, setMiniStage] = useState<MiniIdentityStage>(getFirstMiniIdentityStage());

  const [stage, setStage] = useState<ArcStage>("act");
  const [session, setSession] = useState<ArcLiveState>(() => createIdentityExtensionInitialSession());
  const [sessionStartedAt, setSessionStartedAt] = useState(() => new Date().toISOString());
  const [evidenceIndex, setEvidenceIndex] = useState<EvidenceRecord[]>([]);

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
        const loadedGoal = goalId ? await getArcGoal(goalId) : null;
        const build = loadedGoal?.identityProtocolId ? await getArcBuild(loadedGoal.identityProtocolId) : null;
        if (cancelled) return;
        if (!loadedGoal || !resolveMiniIdentityContent(loadedGoal, build)) {
          setStatus("notEligible");
          return;
        }
        setGoal(loadedGoal);
        setIdentityBuild(build);
        setMiniStage(getFirstMiniIdentityStage());
        setStage("act");
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
        setStatus("miniIdentity");
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [goalId])
  );

  const profile = identityBuild?.profile ?? null;
  const activeLayers = identityBuild ? deriveActiveLayersForArcBuild(identityBuild.profile) : [];
  const content = goal ? resolveMiniIdentityContent(goal, identityBuild) : null;
  const miniSteps = content ? resolveMiniIdentitySteps(content) : [];

  function returnToDashboard() {
    if (goalId) {
      router.replace({ pathname: "/goals/live/[goalId]", params: { goalId } });
      return;
    }
    router.replace("/reach-your-goal");
  }

  function finalizeCompletion(finishedSession: ArcLiveState) {
    const finishedAt = new Date().toISOString();
    let evidenceContext = null;
    if (profile) {
      const resolution = resolveEncodingTarget({
        activeLayers,
        triggerType: finishedSession.triggerType,
        selectedTarget: finishedSession.selectedTarget,
        buildProfile: profile,
        selectedAction: finishedSession.selectedAction,
      });
      evidenceContext = buildSessionEvidenceContext(
        resolution.layer,
        resolution.encoding,
        resolution.actionLabel,
        profile,
        finishedSession.triggerContext,
        finishedSession.triggerKnown
      );
    }
    appendSessionLogEntry({
      id: `mini_identity_${sessionStartedAt}_${finishedAt}`,
      startedAt: sessionStartedAt,
      finishedAt,
      success: finishedSession.realActionCompleted,
      fall: false,
      context: evidenceContext,
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

    // Real ARC Mini Goal completion only -- reaching "complete" is only
    // possible via a real (full/micro/alternative) action, never
    // "scheduled" (see module doc), so this is exactly the moment the
    // spec requires the goal/week progress + a "mini_identity" practice
    // record to update, never earlier.
    if (goal && goal.fourWeekProgram && content) {
      const now = new Date().toISOString();
      const week = (Number(fourWeekWeekParam) || goal.fourWeekProgram.currentWeek) as FourWeekProgramWeekNumber;
      const updatedProgram = clearReturnContext(addPracticeRecord(goal.fourWeekProgram, week, "mini_identity", `${MINI_IDENTITY_TITLE} -- ${content.actionLabel}`, now));
      upsertArcGoal({ ...goal, fourWeekProgram: updatedProgram, updatedAt: now });
    }
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
  }

  function submitAlternativeAction() {
    if (!hasValidAlternativeAction(pendingAlternativeAction, pendingAlternativeActionDuration)) return;
    setSession(applyAlternativeAction(session, pendingAlternativeAction, pendingAlternativeActionDuration));
  }

  function advanceMiniIdentity() {
    const next = getNextMiniIdentityStage(miniStage, miniSteps);
    if (next === null) {
      setStatus("engine");
      return;
    }
    setMiniStage(next);
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
          <Text style={styles.title}>{MINI_IDENTITY_NO_DATA_TITLE}</Text>
          <Text style={styles.body}>{MINI_IDENTITY_NO_DATA_BODY}</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => (goalId ? router.replace({ pathname: "/goals/[id]", params: { id: goalId } }) : router.replace("/reach-your-goal"))}>
            <Text style={styles.buttonText}>לעריכת המטרה (BUILD)</Text>
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
          <Text style={styles.body}>סיימת את הזהות הקצרה והפעולה.</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={returnToDashboard}>
            <Text style={styles.buttonText}>חזרה למטרה</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!goal || !profile || !content) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  if (status === "miniIdentity") {
    const copy = getMiniIdentityStageCopy(miniStage, content);
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.eyebrow}>{MINI_IDENTITY_TITLE}</Text>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={advanceMiniIdentity}>
            <Text style={styles.buttonText}>{copy.buttonLabel}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // status === "engine" -- Mini Identity's own sequence is done; from
  // here on this is EXACTLY live/IdentityExtensionScreen.tsx's own
  // "act"-stage-onward rendering, duplicated verbatim (see module doc).
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
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={returnToDashboard}>
              <Text style={styles.buttonText}>סיום</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      );
    }

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
          onRestart={returnToDashboard}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  eyebrow: { fontSize: 13, fontWeight: "600", textAlign: "right", color: "#0a7ea4", marginBottom: 6 },
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
