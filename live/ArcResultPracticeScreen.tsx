import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcResultExercise } from "../arc/arcResult.ts";
import { loadArcResultExercises } from "../data/storage.ts";

/**
 * live/ArcResultPracticeScreen.tsx (route /arc-result-practice/[id])
 *
 * ARCHI -- ARC Result task, section 6: the quick ARC Result practice
 * itself -- one short, timer-free screen showing the exercise's own
 * four saved fields verbatim (focus point, personalized success
 * visualization, success mantra, supportive body language), never a
 * fifth field and never a countdown/dwell mechanism (unlike every
 * timed ARC LIVE stage) -- this is the ONE shared screen both the
 * automatic suggestion (live/ArcResultSuggestionScreen.tsx) and ARC
 * GYM's own "intentional practice" entry point
 * (build/ArcGymResultDetailScreen.tsx) open, never a second,
 * duplicated practice screen.
 *
 * Two distinct "I'm done" destinations, chosen by WHICH caller opened
 * this screen, never guessed:
 * - `origin === "arc-gym"` (ARC GYM's own intentional-practice entry):
 *   returns to the exercise's own detail screen -- mirrors
 *   live/ArcGymVisualizationOnlyScreen.tsx's own situation-screen
 *   return for the Behaviour exercise type.
 * - otherwise (the automatic suggestion): continues to the EXACT SAME
 *   `/tasks/[id]` destination (with `autoStart` forwarded unchanged,
 *   never invented here) the suggestion screen's own "דלג והמשך
 *   למשימה" button uses -- "after completing or skipping the exercise,
 *   continue to the same selected task pathway."
 */
export default function ArcResultPracticeScreen({
  id,
  taskId = null,
  autoStart = false,
  origin = null,
}: {
  id: string;
  taskId?: string | null;
  autoStart?: boolean;
  origin?: "arc-gym" | null;
}) {
  const [exercise, setExercise] = useState<ArcResultExercise | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadArcResultExercises().then((exercises) => setExercise(exercises.find((candidate) => candidate.id === id) ?? null));
    }, [id])
  );

  function finish() {
    if (origin === "arc-gym") {
      router.replace({ pathname: "/arc-gym/result/[id]", params: { id } });
      return;
    }
    if (!taskId) {
      router.replace("/");
      return;
    }
    router.replace(autoStart ? { pathname: "/tasks/[id]", params: { id: taskId, autoStart: "1" } } : { pathname: "/tasks/[id]", params: { id: taskId } });
  }

  if (!exercise) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionLabel}>נקודת מיקוד</Text>
        <Text style={styles.sectionText}>{exercise.focusPoint}</Text>

        <Text style={styles.sectionLabel}>דימיון הצלחה</Text>
        <Text style={styles.sectionText}>{exercise.successVisualization}</Text>

        <Text style={styles.sectionLabel}>משפט הצלחה</Text>
        <Text style={styles.mantraText}>{`"${exercise.successMantra}"`}</Text>

        <Text style={styles.sectionLabel}>שפת גוף תומכת</Text>
        <Text style={styles.sectionText}>{exercise.supportiveBodyLanguage}</Text>

        <Pressable style={styles.primaryButton} onPress={finish}>
          <Text style={styles.primaryButtonText}>סיימתי, להמשיך למשימה</Text>
        </Pressable>
        {/*
         * ARCHI -- ARC Gym Home Navigation and Continuous Practice
         * task, section 1: additive, and only when THIS screen was
         * reached from ARC Gym's own intentional-practice entry point
         * (never for the automatic-suggestion/continue-to-task origin,
         * which has no "ARC Gym Home" to return to) -- same precedent
         * as live/ArcGymVisualizationOnlyScreen.tsx's own gymHomeButton.
         */}
        {origin === "arc-gym" && (
          <Pressable style={styles.gymHomeButton} onPress={() => router.replace("/arc-gym")} accessibilityLabel="בית ARC Gym">
            <Text style={styles.gymHomeButtonText}>🏋️ חזרה ל־ARC Gym</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  sectionLabel: { fontSize: 12, color: "#0a7ea4", textAlign: "right", marginTop: 16, fontWeight: "700" },
  sectionText: { fontSize: 16, textAlign: "right", color: "#333", marginTop: 6, lineHeight: 24 },
  mantraText: { fontSize: 18, fontWeight: "700", textAlign: "right", color: "#0a7ea4", marginTop: 6, lineHeight: 26 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 28 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  gymHomeButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 12 },
  gymHomeButtonText: { color: "#0a7ea4", fontWeight: "700", fontSize: 16 },
});
