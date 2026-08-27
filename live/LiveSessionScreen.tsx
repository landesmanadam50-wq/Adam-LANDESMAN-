import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import type { ArcBuildProfile, ArcLiveState, ArcStage, DevelopmentLayer, TriggerType } from "../arc/types.ts";
import { createEmptyLiveState } from "../arc/types.ts";
import { getAvailableLiveTriggers, getFirstArcStage, getNextArcStage } from "../arc/arcEngine.ts";
import { getStageCopy, getStageInputKind } from "../arc/stageCopy.ts";
import { getSuccessFocusReinforcement } from "../arc/reinforcement.ts";
import { appendSessionLogEntry, loadProfile, loadProgramProgress, saveProgramProgress } from "../data/storage.ts";
import { recordValidLiveCompletion } from "../program/progress.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";

const BODY_LOCATIONS = ["חזה", "בטן", "גרון", "כתפיים", "ראש"];
const SUCCESS_FOCUS_MINUTES = [0, 5, 10, 15, 20];

const TRIGGER_LABELS: Record<TriggerType, string> = {
  reactive_emotion: "רגש קשה כרגע",
  reactive_urge: "דחף כרגע",
  proactive: "תרגול יזום",
};

function applyScale(stage: ArcStage, session: ArcLiveState, value: number): ArcLiveState {
  switch (stage) {
    case "presence_check":
    case "arc_thought_presence_recheck":
      return { ...session, presenceRating: value };
    case "desired_state_check":
      return { ...session, desiredStateRating: value };
    default:
      return session;
  }
}

export default function LiveSessionScreen() {
  const [profile, setProfile] = useState<ArcBuildProfile | null>(null);
  const [activeLayers, setActiveLayers] = useState<DevelopmentLayer[]>([]);
  const [session, setSession] = useState<ArcLiveState>(() => createEmptyLiveState());
  const [stage, setStage] = useState<ArcStage>("complete");
  const [pendingSensationLocation, setPendingSensationLocation] = useState("");
  const [successFocusMinutes, setSuccessFocusMinutes] = useState<number | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState(() => new Date().toISOString());

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadProfile(), loadProgramProgress()]).then(([loadedProfile, loadedProgress]) => {
      if (cancelled) return;
      if (!loadedProfile || !loadedProgress) {
        router.replace("/build");
        return;
      }
      setProfile(loadedProfile);
      setActiveLayers(loadedProgress.activeLayers);
      setSession(createEmptyLiveState());
      setStage(getFirstArcStage());
      setSessionStartedAt(new Date().toISOString());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const advance = useCallback(
    (updatedSession: ArcLiveState, actionCompleted = false) => {
      if (!profile) return;
      const outcome = getNextArcStage(stage, updatedSession, profile);
      const sessionWithStage: ArcLiveState = {
        ...updatedSession,
        currentArcStage: outcome.stage,
        loopIterationCount: outcome.loopIterationCount,
      };

      setSession(sessionWithStage);
      setStage(outcome.stage);
      setPendingSensationLocation("");
      setSuccessFocusMinutes(null);

      if (outcome.stage === "complete") {
        const finishedAt = new Date().toISOString();
        // success now reflects whether the trainee actually confirmed
        // completing the real action at "act", not just that the
        // session reached the end screen.
        appendSessionLogEntry({
          id: `${sessionStartedAt}_${finishedAt}`,
          startedAt: sessionStartedAt,
          finishedAt,
          success: actionCompleted,
          fall: false, // see README: no interfering-action-window stage exists in this ArcStage list yet
        });

        loadProgramProgress().then((progress) => {
          if (!progress) return;
          const updated = recordValidLiveCompletion({
            progress,
            reachedAct: true, // every path reaches "act" before "complete" is possible
            actionCompleted,
            localDate: todayLocalDateString(),
          });
          saveProgramProgress(updated);
        });
      }
    },
    [profile, stage, sessionStartedAt]
  );

  const restart = useCallback(() => {
    setSession(createEmptyLiveState());
    setStage(getFirstArcStage());
    setPendingSensationLocation("");
    setSuccessFocusMinutes(null);
    setSessionStartedAt(new Date().toISOString());
  }, []);

  if (!profile) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  const copy = getStageCopy(stage, profile, session, activeLayers);
  const inputKind = getStageInputKind(stage);
  const isHabitSensation = session.triggerType === "reactive_urge";
  const isSensationRecheck = session.sensationIntensity !== null;
  const availableTriggers = getAvailableLiveTriggers(activeLayers);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{copy.title}</Text>
        {copy.body.length > 0 && <Text style={styles.body}>{copy.body}</Text>}

        {inputKind === "triggerSelect" && (
          <View style={styles.chipRow}>
            {availableTriggers.map((value) => (
              <Pressable key={value} style={styles.chip} onPress={() => advance({ ...session, triggerType: value })}>
                <Text style={styles.buttonText}>{TRIGGER_LABELS[value]}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {inputKind === "scale0to10" && (
          <View style={styles.scaleRow}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
              <Pressable key={value} style={styles.scaleButton} onPress={() => advance(applyScale(stage, session, value))}>
                <Text style={styles.buttonText}>{value}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {inputKind === "sensationCheck" && (
          <View>
            {!isHabitSensation && !isSensationRecheck && (
              <View style={styles.chipRow}>
                {BODY_LOCATIONS.map((location) => (
                  <Pressable
                    key={location}
                    style={[styles.chip, pendingSensationLocation === location && styles.chipSelected]}
                    onPress={() => setPendingSensationLocation(location)}
                  >
                    <Text style={styles.buttonText}>{location}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <View style={styles.scaleRow}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                <Pressable
                  key={value}
                  style={styles.scaleButton}
                  onPress={() =>
                    advance({
                      ...session,
                      sensationLocation: isHabitSensation ? null : pendingSensationLocation || session.sensationLocation,
                      sensationIntensity: value,
                    })
                  }
                >
                  <Text style={styles.buttonText}>{value}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {inputKind === "yesno" && (
          <View style={styles.buttonRow}>
            <Pressable
              style={styles.button}
              onPress={() =>
                advance(
                  stage === "accept"
                    ? { ...session, acceptanceNeeded: false }
                    : stage === "preventive_action_check"
                      ? { ...session, wantsPreventiveAction: true }
                      : { ...session, regulationReady: true }
                )
              }
            >
              <Text style={styles.buttonText}>כן</Text>
            </Pressable>
            <Pressable
              style={styles.button}
              onPress={() =>
                advance(
                  stage === "accept"
                    ? { ...session, acceptanceNeeded: true }
                    : stage === "preventive_action_check"
                      ? { ...session, wantsPreventiveAction: false }
                      : { ...session, regulationReady: false }
                )
              }
            >
              <Text style={styles.buttonText}>לא</Text>
            </Pressable>
          </View>
        )}

        {inputKind === "info" && stage === "act" && (
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => advance(session, true)}>
            <Text style={styles.buttonText}>עשיתי את זה</Text>
          </Pressable>
        )}

        {inputKind === "info" && stage !== "act" && (
          <Pressable
            style={[styles.button, styles.fullWidthButton]}
            onPress={() =>
              advance(stage === "regulate" ? { ...session, activeTools: [...session.activeTools, profile.regulationTool ?? ""] } : session)
            }
          >
            <Text style={styles.buttonText}>המשך</Text>
          </Pressable>
        )}

        {inputKind === "successFocus" && (
          <View>
            {successFocusMinutes === null ? (
              <View style={styles.chipRow}>
                {SUCCESS_FOCUS_MINUTES.map((minutes) => (
                  <Pressable key={minutes} style={styles.chip} onPress={() => setSuccessFocusMinutes(minutes)}>
                    <Text style={styles.buttonText}>{minutes} דק'</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View>
                <Text style={styles.body}>{getSuccessFocusReinforcement(successFocusMinutes)}</Text>
                <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => advance(session)}>
                  <Text style={styles.buttonText}>המשך</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {inputKind === "finish" && (
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={restart}>
            <Text style={styles.buttonText}>סשן חדש</Text>
          </Pressable>
        )}
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
  title: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "right",
    marginBottom: 12,
  },
  body: {
    fontSize: 17,
    textAlign: "right",
    marginBottom: 24,
    lineHeight: 24,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
  scaleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  scaleButton: {
    backgroundColor: "#E6F4FE",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    minWidth: 44,
    alignItems: "center",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    backgroundColor: "#E6F4FE",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  chipSelected: {
    backgroundColor: "#0a7ea4",
  },
  button: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
  },
  fullWidthButton: {
    marginTop: 4,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
});
