import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import type { ArcProfile, LiveSession } from "../engine/types.ts";
import { LiveStage, createEmptyLiveSession } from "../engine/types.ts";
import { getFirstStage, getNextStage } from "../engine/arcEngine.ts";
import { getBeneficialActionReinforcement, getSuccessFocusReinforcement } from "../engine/reinforcement.ts";
import { appendSessionLogEntry, loadProfile } from "../data/storage.ts";
import { getStageCopy, getStageInputKind } from "./stageCopy.ts";

const BODY_LOCATIONS = ["חזה", "בטן", "גרון", "כתפיים", "ראש"];
const SUCCESS_FOCUS_MINUTES = [5, 10, 15, 20];

type RewardStep = "show" | "askSuccessFocus" | "askInterferingAction";

function applyYesNo(stage: LiveStage, session: LiveSession, answer: boolean): LiveSession {
  switch (stage) {
    case LiveStage.PreventiveActionCheck:
      return { ...session, wantsPreventiveActionNow: answer };
    case LiveStage.EmotionGate:
      return { ...session, hasRelevantEmotionOrUrge: answer };
    case LiveStage.AcceptanceCheck:
      return { ...session, needsAcceptance: answer };
    default:
      return session;
  }
}

function applyScale(stage: LiveStage, session: LiveSession, value: number): LiveSession {
  switch (stage) {
    case LiveStage.PresenceCheck:
    case LiveStage.ArcThoughtPresenceRecheck:
      return { ...session, presenceLevel: value };
    case LiveStage.IntensityCheck:
      return { ...session, intensityLevel: value };
    default:
      return session;
  }
}

export default function LiveSessionScreen() {
  const [profile, setProfile] = useState<ArcProfile | null>(null);
  const [session, setSession] = useState<LiveSession>(() => createEmptyLiveSession());
  const [stage, setStage] = useState<LiveStage>(LiveStage.Finish);
  const [rewardStep, setRewardStep] = useState<RewardStep>("show");
  const [pendingWantsSuccessFocus, setPendingWantsSuccessFocus] = useState<boolean | null>(null);
  const [successFocusMinutes, setSuccessFocusMinutes] = useState<number | null>(null);
  const [bodyLocationText, setBodyLocationText] = useState("");
  const [sessionStartedAt, setSessionStartedAt] = useState(() => new Date().toISOString());
  const [reachedBeneficialAction, setReachedBeneficialAction] = useState(false);
  const [usedInterferingAction, setUsedInterferingAction] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadProfile().then((loaded) => {
      if (cancelled) return;
      if (!loaded) {
        router.replace("/build");
        return;
      }
      setProfile(loaded);
      const fresh = createEmptyLiveSession();
      setSession(fresh);
      setStage(getFirstStage(fresh, loaded));
      setSessionStartedAt(new Date().toISOString());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const advance = useCallback(
    (updatedSession: LiveSession) => {
      if (!profile) return;
      const nextStage = getNextStage(stage, updatedSession, profile);
      const success = stage === LiveStage.BeneficialAction || reachedBeneficialAction;
      const fall = stage === LiveStage.InterferingAction || usedInterferingAction;

      setSession(updatedSession);
      setStage(nextStage);
      setReachedBeneficialAction(success);
      setUsedInterferingAction(fall);
      setRewardStep("show");
      setPendingWantsSuccessFocus(null);
      setSuccessFocusMinutes(null);
      setBodyLocationText("");

      if (nextStage === LiveStage.Finish) {
        const finishedAt = new Date().toISOString();
        appendSessionLogEntry({
          id: `${sessionStartedAt}_${finishedAt}`,
          startedAt: sessionStartedAt,
          finishedAt,
          success,
          fall,
        });
      }
    },
    [profile, stage, reachedBeneficialAction, usedInterferingAction, sessionStartedAt]
  );

  const restart = useCallback(() => {
    if (!profile) return;
    const fresh = createEmptyLiveSession();
    setSession(fresh);
    setStage(getFirstStage(fresh, profile));
    setRewardStep("show");
    setPendingWantsSuccessFocus(null);
    setSuccessFocusMinutes(null);
    setBodyLocationText("");
    setSessionStartedAt(new Date().toISOString());
    setReachedBeneficialAction(false);
    setUsedInterferingAction(false);
  }, [profile]);

  if (!profile) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  const copy = getStageCopy(stage, profile);
  const inputKind = getStageInputKind(stage);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{copy.title}</Text>
        {copy.body.length > 0 && <Text style={styles.body}>{copy.body}</Text>}

        {inputKind === "yesno" && (
          <View style={styles.buttonRow}>
            <Pressable style={styles.button} onPress={() => advance(applyYesNo(stage, session, true))}>
              <Text style={styles.buttonText}>כן</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={() => advance(applyYesNo(stage, session, false))}>
              <Text style={styles.buttonText}>לא</Text>
            </Pressable>
          </View>
        )}

        {(inputKind === "scale0to10" || inputKind === "scale1to10") && (
          <View style={styles.scaleRow}>
            {(inputKind === "scale0to10" ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).map(
              (value) => (
                <Pressable
                  key={value}
                  style={styles.scaleButton}
                  onPress={() => advance(applyScale(stage, session, value))}
                >
                  <Text style={styles.buttonText}>{value}</Text>
                </Pressable>
              )
            )}
          </View>
        )}

        {inputKind === "bodyLocation" && (
          <View>
            <View style={styles.chipRow}>
              {BODY_LOCATIONS.map((location) => (
                <Pressable
                  key={location}
                  style={styles.chip}
                  onPress={() => advance({ ...session, bodyLocation: location })}
                >
                  <Text style={styles.buttonText}>{location}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.textInput}
              placeholder="או תאר במילים שלך"
              value={bodyLocationText}
              onChangeText={setBodyLocationText}
              textAlign="right"
            />
            <Pressable
              style={[styles.button, styles.fullWidthButton]}
              onPress={() => advance({ ...session, bodyLocation: bodyLocationText })}
            >
              <Text style={styles.buttonText}>המשך</Text>
            </Pressable>
          </View>
        )}

        {inputKind === "info" && (
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => advance(session)}>
            <Text style={styles.buttonText}>המשך</Text>
          </Pressable>
        )}

        {inputKind === "reward" && (
          <View>
            {rewardStep === "show" && (
              <View>
                <Text style={styles.body}>{getBeneficialActionReinforcement(profile)}</Text>
                <Pressable
                  style={[styles.button, styles.fullWidthButton]}
                  onPress={() => setRewardStep("askSuccessFocus")}
                >
                  <Text style={styles.buttonText}>המשך</Text>
                </Pressable>
              </View>
            )}
            {rewardStep === "askSuccessFocus" && (
              <View>
                <Text style={styles.body}>האם תרצה להתמקד בהצלחה שלך?</Text>
                <View style={styles.buttonRow}>
                  {[true, false].map((answer) => (
                    <Pressable
                      key={String(answer)}
                      style={styles.button}
                      onPress={() => {
                        if (profile.interferingAction) {
                          setPendingWantsSuccessFocus(answer);
                          setRewardStep("askInterferingAction");
                        } else {
                          advance({ ...session, wantsSuccessFocus: answer });
                        }
                      }}
                    >
                      <Text style={styles.buttonText}>{answer ? "כן" : "לא"}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
            {rewardStep === "askInterferingAction" && profile.interferingAction && (
              <View>
                <Text style={styles.body}>
                  {`להשתמש עכשיו בחלון של ${profile.interferingAction.description} (עד ${profile.interferingAction.allowedMinutes} דקות)?`}
                </Text>
                <View style={styles.buttonRow}>
                  {[true, false].map((answer) => (
                    <Pressable
                      key={String(answer)}
                      style={styles.button}
                      onPress={() =>
                        advance({
                          ...session,
                          wantsSuccessFocus: pendingWantsSuccessFocus ?? false,
                          wantsToUseInterferingActionWindow: answer,
                        })
                      }
                    >
                      <Text style={styles.buttonText}>{answer ? "כן" : "לא"}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>
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

        {inputKind === "interferingAction" && (
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => advance(session)}>
            <Text style={styles.buttonText}>התחל</Text>
          </Pressable>
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
  textInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
  },
});
