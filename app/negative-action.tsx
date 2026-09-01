/**
 * app/negative-action.tsx
 *
 * Negative Action reduction task: the standalone, OPTIONAL Negative
 * Action Timer entry point -- mirrors app/focus-success.tsx's pattern
 * exactly (a real, existing standalone tool reached directly from Home,
 * never through the main ARC session). The main routine stays ARC ->
 * Success Focus -> completion, completely unaffected: this screen is
 * never opened automatically after ARC or after Success Focus, and
 * completing (or never opening) it has no bearing on finishing a LIVE
 * session -- see live/LiveSessionScreen.tsx, which no longer knows
 * anything about "negative_action" at all.
 *
 * Reuses the existing architecture throughout: live/screens.tsx's
 * NegativeActionStartScreen/NegativeActionScreen (unchanged -- the same
 * components the main flow used to render), timerType "negativeAction"
 * (data/storage.ts's existing TimerRun/TimerType, untouched), and
 * arc/stageCopy.ts's existing "negative_action" copy case (still the
 * one place that copy text is built, from the same profile.habit field
 * it always read). The timer only ever starts when the trainee
 * intentionally taps "התחל" here -- there is no other way into it.
 */

import { useCallback, useState } from "react";
import { useFocusEffect, router, Stack } from "expo-router";
import { ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { ArcBuildProfile, ArcProgramProgress } from "../arc/types.ts";
import { createEmptyLiveState } from "../arc/types.ts";
import { getStageCopy } from "../arc/stageCopy.ts";
import { getProgramDefinition, isNegativeActionAvailable, resolveNegativeActionDuration } from "../program/engine.ts";
import { clearTimerRun, loadProfile, loadProgramProgress, loadTimerRun } from "../data/storage.ts";
import type { TimerRun } from "../data/storage.ts";
import { NegativeActionScreen, NegativeActionStartScreen } from "../live/screens.tsx";

const NOT_AVAILABLE_MESSAGE =
  "כלי הפעולה השלילית אינו זמין כרגע. ניתן להפעיל אותו ולהגדיר פעולה שלילית וזמן מותר במסך בניית המטרה (BUILD).";

export default function NegativeActionTimerScreen() {
  const [profile, setProfile] = useState<ArcBuildProfile | null>(null);
  const [progress, setProgress] = useState<ArcProgramProgress | null>(null);
  const [resumedRun, setResumedRun] = useState<TimerRun | null>(null);
  const [started, setStarted] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setStarted(false);
      Promise.all([loadProfile(), loadProgramProgress(), loadTimerRun("negativeAction")]).then(([loadedProfile, loadedProgress, run]) => {
        if (cancelled) return;
        setProfile(loadedProfile);
        setProgress(loadedProgress);
        setResumedRun(run);
        if (run) setStarted(true);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  if (!profile) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "פעולה שלילית מוגבלת" }} />
      </SafeAreaView>
    );
  }

  if (!isNegativeActionAvailable(profile)) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "פעולה שלילית מוגבלת" }} />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.notAvailableText}>{NOT_AVAILABLE_MESSAGE}</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // A real, currently-permitted duration for THIS week -- never invented,
  // never left as a raw unresolved value; resolveNegativeActionDuration
  // already clamps to the valid 1-15 minute range and safely returns
  // null (never NaN) when nothing can be resolved yet (e.g. progress
  // hasn't loaded). NegativeActionStartScreen/NegativeActionScreen both
  // already treat a null duration as "nothing to gate on" rather than
  // ever rendering "undefined"/"NaN".
  const durationMinutes = progress ? resolveNegativeActionDuration(progress.currentProgramWeek, getProgramDefinition(profile.programPath), profile.negativeActionBaseDurationMinutes) : null;

  const session = { ...createEmptyLiveState(), negativeActionStarted: started };
  const copy = getStageCopy("negative_action", profile, session, [], []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: "פעולה שלילית מוגבלת" }} />
      <ScrollView contentContainerStyle={styles.content}>
        {started ? (
          <NegativeActionScreen
            copy={copy}
            durationMinutes={durationMinutes}
            resumedRun={resumedRun}
            onCompleted={() => {
              clearTimerRun("negativeAction");
              setResumedRun(null);
              router.replace("/");
            }}
          />
        ) : (
          <NegativeActionStartScreen copy={copy} durationMinutes={durationMinutes} onStart={() => setStarted(true)} />
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
    justifyContent: "flex-start",
  },
  notAvailableText: {
    fontSize: 16,
    textAlign: "right",
    lineHeight: 24,
  },
});
