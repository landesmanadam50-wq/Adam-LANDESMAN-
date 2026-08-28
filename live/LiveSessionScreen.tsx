/**
 * live/LiveSessionScreen.tsx
 *
 * The LIVE container. It owns navigation/loading/session-state plumbing
 * only: load real program state, forward each UI event through
 * live/liveEventAdapter.ts (which asks arc/arcEngine.ts what happens
 * next), and render whatever stage comes back via ArcLiveRenderer. It
 * never decides a route, threshold, or target itself.
 *
 * Session safety (#20): ArcLiveState lives only in this component's
 * React state, never persisted mid-session. useFocusEffect reloads
 * real profile/program state and starts a brand-new session every time
 * this screen gains focus -- so leaving LIVE mid-session (back button,
 * navigating away) always terminates it explicitly rather than leaving
 * a partial session lying around, and returning to LIVE never resumes
 * a stale one. Training Day credit is only ever granted from
 * recordValidLiveCompletion() when a session reaches "complete" with a
 * confirmed real action -- an abandoned session never reaches that call.
 */

import { useCallback, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, router, useFocusEffect } from "expo-router";

import type { ArcBuildProfile, ArcLiveState, ArcStage, DevelopmentLayer } from "../arc/types.ts";
import { createEmptyLiveState } from "../arc/types.ts";
import { getFirstArcStage } from "../arc/arcEngine.ts";
import { getStageCopy } from "../arc/stageCopy.ts";
import { loadProfile, loadProgramProgress, loadProgramSelection, loadArcMaps, saveProgramProgress, appendSessionLogEntry } from "../data/storage.ts";
import { applyActiveArcMap } from "../arc/buildTypes.ts";
import { recordValidLiveCompletion } from "../program/progress.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";
import {
  advanceLiveSession,
  applyActionCompletion,
  applyRegulationToolUsed,
  applyScaleAnswer,
  applySensationAnswer,
  applyTargetSelection,
  applyTriggerSelection,
  applyYesNoAnswer,
} from "./liveEventAdapter.ts";
import { getAvailableLiveTriggers } from "../arc/arcEngine.ts";
import { ArcLiveRenderer } from "./ArcLiveRenderer.tsx";

export default function LiveSessionScreen() {
  const [profile, setProfile] = useState<ArcBuildProfile | null>(null);
  const [activeLayers, setActiveLayers] = useState<DevelopmentLayer[]>([]);
  const [session, setSession] = useState<ArcLiveState>(() => createEmptyLiveState());
  const [stage, setStage] = useState<ArcStage>("trigger_selection");
  const [pendingSensationLocation, setPendingSensationLocation] = useState("");
  const [successFocusMinutes, setSuccessFocusMinutes] = useState<number | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState(() => new Date().toISOString());

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      // loadProgramSelection() is loaded for completeness (per the LIVE
      // load contract) even though today's routing only needs
      // activeLayers, which loadProgramProgress() already derives from
      // ProgramDefinition -- see program/engine.ts. loadArcMaps() is a
      // read-only retrieval -- LIVE never creates ArcMaps, only
      // BUILD/Home's getOrCreateGoalModel() does.
      Promise.all([loadProfile(), loadProgramProgress(), loadProgramSelection(), loadArcMaps()]).then(
        ([loadedProfile, loadedProgress, , loadedArcMaps]) => {
          if (cancelled) return;
          if (!loadedProfile || !loadedProgress) {
            router.replace("/build");
            return;
          }
          setProfile(applyActiveArcMap(loadedProfile, loadedArcMaps));
          setActiveLayers(loadedProgress.activeLayers);
          setSession(createEmptyLiveState());
          setStage(getFirstArcStage());
          setPendingSensationLocation("");
          setSuccessFocusMinutes(null);
          setSessionStartedAt(new Date().toISOString());
        }
      );
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const finalizeSession = (finishedSession: ArcLiveState) => {
    const finishedAt = new Date().toISOString();
    appendSessionLogEntry({
      id: `${sessionStartedAt}_${finishedAt}`,
      startedAt: sessionStartedAt,
      finishedAt,
      success: finishedSession.realActionCompleted,
      fall: false, // see README: no interfering-action-window stage exists in this ArcStage list yet
    });

    loadProgramProgress().then((freshProgress) => {
      if (!freshProgress) return;
      const updated = recordValidLiveCompletion({
        progress: freshProgress,
        reachedAct: finishedSession.actionReached,
        actionCompleted: finishedSession.realActionCompleted,
        localDate: todayLocalDateString(),
      });
      saveProgramProgress(updated);
    });
  };

  const commitAdvance = (patchedSession: ArcLiveState) => {
    if (!profile) return;
    const { session: nextSession, stage: nextStage } = advanceLiveSession(stage, patchedSession, profile, activeLayers);
    setSession(nextSession);
    setStage(nextStage);
    setPendingSensationLocation("");
    setSuccessFocusMinutes(null);
    if (nextStage === "complete") {
      finalizeSession(nextSession);
    }
  };

  const restart = () => {
    setSession(createEmptyLiveState());
    setStage(getFirstArcStage());
    setPendingSensationLocation("");
    setSuccessFocusMinutes(null);
    setSessionStartedAt(new Date().toISOString());
  };

  if (!profile) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "ARCHI LIVE" }} />
      </SafeAreaView>
    );
  }

  const copy = getStageCopy(stage, profile, session, activeLayers);
  const availableTriggers = getAvailableLiveTriggers(activeLayers);

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: `ARCHI LIVE — ${copy.title}` }} />
      <ScrollView contentContainerStyle={styles.content}>
        <ArcLiveRenderer
          stage={stage}
          session={session}
          profile={profile}
          activeLayers={activeLayers}
          availableTriggers={availableTriggers}
          pendingSensationLocation={pendingSensationLocation}
          successFocusMinutes={successFocusMinutes}
          onSelectTrigger={(trigger) => commitAdvance(applyTriggerSelection(session, trigger))}
          onScaleAnswer={(value) => commitAdvance(applyScaleAnswer(stage, session, value))}
          onSelectSensationLocation={(location) => setPendingSensationLocation(location)}
          onSubmitSensationIntensity={(value) => {
            const isHabitSensation = session.triggerType === "reactive_urge";
            const location = isHabitSensation ? null : pendingSensationLocation || session.sensationLocation;
            commitAdvance(applySensationAnswer(session, location, value));
          }}
          onYesNoAnswer={(yes) => commitAdvance(applyYesNoAnswer(stage, session, yes))}
          onSelectTarget={(target) => setSession(applyTargetSelection(session, target))}
          onGenericContinue={() => commitAdvance(session)}
          onRegulateContinue={() => commitAdvance(applyRegulationToolUsed(session, profile.regulationTool))}
          onActionCompleted={() => commitAdvance(applyActionCompletion(session, true))}
          onSelectSuccessFocusMinutes={(minutes) => setSuccessFocusMinutes(minutes)}
          onSuccessFocusContinue={() => commitAdvance(session)}
          onRestart={restart}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flexGrow: 1,
    padding: 24,
    justifyContent: "center",
  },
});
