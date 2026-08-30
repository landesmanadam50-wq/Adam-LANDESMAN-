/**
 * app/focus-success.tsx
 *
 * The standalone "Focus Success without ARC" entry point (#4): opened
 * either directly from home, or by tapping a deferred Focus Success
 * reminder that was scheduled with "without ARC" (see
 * data/reminders.ts's resolveReminderRoute). Reuses live/screens.tsx's
 * SuccessFocusScreen completely unchanged -- the exact same Success
 * Coding timer (timerType "successCoding", via useTimerRun), the same
 * minutes-chip picker, the same reinforcement copy -- just entered
 * directly rather than via the full ARC protocol. There is no
 * standalone-vs-ARC distinction inside the timer/completion machinery
 * itself: only the entry point differs.
 */

import { useCallback, useState } from "react";
import { useFocusEffect, router, Stack } from "expo-router";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { ArcBuildProfile } from "../arc/types.ts";
import type { ArcStageCopy } from "../arc/stageCopy.ts";
import { loadProfile } from "../data/storage.ts";
import { getSuccessFocusReinforcement } from "../arc/reinforcement.ts";
import { SuccessFocusScreen } from "../live/screens.tsx";

const SUCCESS_FOCUS_MINUTES = [0, 5, 10, 15, 20];
const COPY: ArcStageCopy = { title: "התמקדות בהצלחה", body: "קח רגע להתמקד במה שהלך טוב.", segments: null };

export default function FocusSuccessScreen() {
  const [profile, setProfile] = useState<ArcBuildProfile | null>(null);
  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      loadProfile().then((loaded) => {
        if (!cancelled) setProfile(loaded);
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
          copy={COPY}
          durationMinutes={profile.successFocusDuration}
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
