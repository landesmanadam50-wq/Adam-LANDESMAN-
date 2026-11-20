import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { completeArcGymTrainingRecord, createArcGymTrainingRecord, generateArcGymTrainingRecordId, resolveArcGymMemoryMantraSteps } from "../arc/arcGym.ts";
import type { ArcGymCheckInChoice, ArcGymMemoryExercise } from "../arc/arcGym.ts";
import { clearArcGymMemoryCheckInProgress, loadArcGymMemoryCheckInProgress, loadArcGymMemoryExercises, upsertArcGymTrainingRecordEntry } from "../data/storage.ts";
import { handleArcGymMemoryCheckInChoice } from "../data/emotionalCheckInRouting.ts";
import EmotionalCheckInButtons from "./components/EmotionalCheckInButtons.tsx";

/**
 * live/ArcGymMemoryVisualizationScreen.tsx (route /arc-gym/memory/[id]/train)
 *
 * ARCHI -- Unified Development Specification task, Part 1: the ARC
 * Memory exercise's own training session -- a user-paced walk through
 * the 4 mantra steps resolveArcGymMemoryMantraSteps generates from
 * this exercise's own saved text (never a fifth step, never inventing
 * detail beyond what that pure function already returns). "Never
 * creates a Task LIVE session or imposes a duration": there is no
 * timer anywhere on this screen, advancing is a plain tap.
 *
 * ARC Gym + ARC Goal Integration task: per the user's own spec --
 * "add to ARC Memory the emotional check after the trigger and before
 * the action" -- an emotional check-in (😟/🙂/😄) is inserted here
 * between step 1 (noticing: "אני שם לב לרגע הזה...") and step 2 (the
 * action recall: "אני נזכר בדיוק מה רציתי לעשות..."), reusing the EXACT
 * same check-in -> ARC LIVE -> return mechanism ARC Behaviour's own
 * check-in already implements (handleArcGymMemoryCheckInChoice mirrors
 * handleArcGymCheckInChoice 1:1) -- never a second, parallel ARC
 * routing/body-selection implementation:
 * - 😄 ("מעולה") never leaves this screen -- it just advances in place
 *   to step 2, exactly like tapping "הבא" on any other step.
 * - 😟/🙂 route through the shared Full/Shortened ARC LIVE engine
 *   (standalone, via arcGymMemoryExerciseId); live/NewArcLiveScreen.tsx's
 *   own finishArcGymMemoryCheckIn writes a single-slot
 *   ArcGymMemoryCheckInProgress resume record on completion, which this
 *   screen reads unconditionally on every focus (same convention as
 *   every other single-slot resumable record in this app) and consumes
 *   exactly once -- resuming directly at step 2, never re-walking
 *   steps 0-1 or re-showing the check-in.
 *
 * finish() now records the ACTUALLY-used choice (defaulting to
 * "visualization_only" when the trainee never left this screen, i.e.
 * picked 😄 or the check-in was otherwise never reached) rather than
 * the old hardcoded "visualization_only" literal -- the training
 * record's own checkInChoice enum already had all three values, so
 * this is backward compatible, never a schema change.
 */
export default function ArcGymMemoryVisualizationScreen({ id }: { id: string }) {
  const [exercise, setExercise] = useState<ArcGymMemoryExercise | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [atCheckIn, setAtCheckIn] = useState(false);
  const [checkInChoice, setCheckInChoice] = useState<ArcGymCheckInChoice>("visualization_only");
  const [done, setDone] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadArcGymMemoryExercises(), loadArcGymMemoryCheckInProgress()]).then(([exercises, progress]) => {
        setExercise(exercises.find((candidate) => candidate.id === id) ?? null);
        setDone(false);
        setAtCheckIn(false);
        if (progress && progress.exerciseId === id) {
          // Consumed exactly once -- resuming directly at the action
          // step, with the real check-in choice that was made, never
          // re-walking trigger/noticing or re-showing the check-in.
          setStepIndex(progress.resumeStepIndex);
          setCheckInChoice(progress.checkInChoice);
          clearArcGymMemoryCheckInProgress();
        } else {
          setStepIndex(0);
          setCheckInChoice("visualization_only");
        }
      });
    }, [id])
  );

  async function finish() {
    const now = new Date().toISOString();
    await upsertArcGymTrainingRecordEntry(completeArcGymTrainingRecord(createArcGymTrainingRecord(generateArcGymTrainingRecordId(), id, checkInChoice, now), now));
    setDone(true);
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

  if (done) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>כל הכבוד!</Text>
          <Text style={styles.prompt}>האימון הושלם. בפעם הבאה שהסיטואציה הזאת תקרה במציאות, יש לך כבר תרגול.</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.replace({ pathname: "/arc-gym/memory/[id]", params: { id } })}>
            <Text style={styles.primaryButtonText}>סיום</Text>
          </Pressable>
          {/*
           * ARCHI -- ARC Gym Home Navigation and Continuous Practice
           * task, section 1: additive to (never replacing) "סיום"
           * above -- same precedent as
           * live/ArcGymVisualizationOnlyScreen.tsx's own gymHomeButton.
           */}
          <Pressable style={styles.gymHomeButton} onPress={() => router.replace("/arc-gym")} accessibilityLabel="בית ARC Gym">
            <Text style={styles.gymHomeButtonText}>🏋️ חזרה ל־ARC Gym</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (atCheckIn) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>איך אתה מרגיש עכשיו כשאתה נזכר בסיטואציה?</Text>
          <EmotionalCheckInButtons
            onFullArc={() => handleArcGymMemoryCheckInChoice("full_arc", id)}
            onShortenedArc={() => handleArcGymMemoryCheckInChoice("shortened_arc", id)}
            onExcellent={() => {
              setAtCheckIn(false);
              setStepIndex(2);
            }}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const steps = resolveArcGymMemoryMantraSteps(exercise);
  const isLastStep = stepIndex === steps.length - 1;
  // The check-in sits between step 1 (noticing) and step 2 (action
  // recall) -- tapping "הבא" on step 1 enters it instead of advancing
  // straight to step 2.
  const entersCheckInNext = stepIndex === 1;

  function handleContinue() {
    if (isLastStep) {
      finish();
      return;
    }
    if (entersCheckInNext) {
      setAtCheckIn(true);
      return;
    }
    setStepIndex((current) => current + 1);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.stepLabel}>{`שלב ${stepIndex + 1} מתוך ${steps.length}`}</Text>
        <Text style={styles.prompt}>{steps[stepIndex]}</Text>
        <Pressable style={styles.primaryButton} onPress={handleContinue}>
          <Text style={styles.primaryButtonText}>{isLastStep ? "סיימתי" : "הבא"}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, justifyContent: "center" },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 20 },
  stepLabel: { fontSize: 13, color: "#888", textAlign: "right", marginBottom: 12 },
  prompt: { fontSize: 18, textAlign: "right", color: "#333", marginBottom: 24, lineHeight: 27 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  gymHomeButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 12 },
  gymHomeButtonText: { color: "#0a7ea4", fontWeight: "700", fontSize: 16 },
});
