/**
 * app/focus-success.tsx
 *
 * The standalone Focus Success entry point: opened either directly
 * from home, or by tapping a scheduled Success Focus's start
 * notification (coordinated timer/dwell task, Part 6 -- see
 * arc/reminders.ts's resolveReminderRoute, which always routes a
 * "focusSuccess" reminder here). Reuses live/screens.tsx's
 * SuccessFocusScreen completely unchanged -- the exact same Success
 * Coding timer (timerType "successCoding", via useTimerRun), the same
 * minutes-chip picker, the same reinforcement copy -- just entered
 * directly rather than via the full ARC protocol. There is no
 * standalone-vs-ARC distinction inside the timer/completion machinery
 * itself: only the entry point differs.
 *
 * Deep-link resume (Part 6-8): on focus, checks for an existing
 * persisted "successCoding" TimerRun FIRST -- this is exactly how a
 * future-scheduled Success Focus (data/reminders.ts's
 * scheduleFutureSuccessFocus) is resolved "by its persisted ID" (the
 * run's own runId) once its start time arrives, restoring its
 * EXACT configured duration/timing rather than starting a fresh one.
 * Absolute timestamps are authoritative throughout -- see
 * arc/actionTimer.ts's getActionTimerStatusFromStartedAt, which
 * useTimerRun/SuccessFocusScreen already call: opening a few minutes
 * late shows the real remaining time; opening after it's already over
 * shows it as complete; neither case ever starts a fresh timer or
 * shifts the run's own endsAt. When no run is persisted (the plain
 * "from Home, right now" entry), falls back to the original,
 * unchanged fresh-start behavior.
 */

import { useCallback, useState } from "react";
import { useFocusEffect, router, Stack } from "expo-router";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { ArcBuildProfile } from "../arc/types.ts";
import type { ArcStageCopy } from "../arc/stageCopy.ts";
import { loadProfile, loadTimerRun } from "../data/storage.ts";
import type { TimerRun } from "../data/storage.ts";
import { getSuccessFocusReinforcement } from "../arc/reinforcement.ts";
import { SuccessFocusScreen } from "../live/screens.tsx";

const SUCCESS_FOCUS_MINUTES = [0, 5, 10, 15, 20];
const COPY: ArcStageCopy = { title: "התמקדות בהצלחה", body: "קח רגע להתמקד במה שהלך טוב.", segments: null };

export default function FocusSuccessScreen() {
  const [profile, setProfile] = useState<ArcBuildProfile | null>(null);
  const [resumedRun, setResumedRun] = useState<TimerRun | null>(null);
  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setSelectedMinutes(null);
      Promise.all([loadProfile(), loadTimerRun("successCoding")]).then(([loadedProfile, run]) => {
        if (cancelled) return;
        setProfile(loadedProfile);
        setResumedRun(run);
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  if (!profile) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "התמקדות בהצלחה" }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: "התמקדות בהצלחה" }} />
      <ScrollView contentContainerStyle={styles.content}>
        <SuccessFocusScreen
          copy={resumedRun ? { title: resumedRun.copyTitle, body: resumedRun.copyBody, segments: null } : COPY}
          durationMinutes={resumedRun ? resumedRun.durationMinutes : profile.successFocusDuration}
          resumedRun={resumedRun}
          minutesOptions={SUCCESS_FOCUS_MINUTES}
          selectedMinutes={selectedMinutes}
          onSelectMinutes={setSelectedMinutes}
          reinforcementText={selectedMinutes !== null ? getSuccessFocusReinforcement(selectedMinutes) : ""}
          onContinue={() => router.replace("/")}
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
    justifyContent: "flex-start",
  },
});
