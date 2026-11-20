import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { completeArcGymTrainingRecord, createArcGymTrainingRecord, generateArcGymTrainingRecordId, resolveArcGymActionVisualization } from "../arc/arcGym.ts";
import type { ArcGymSituation } from "../arc/arcGym.ts";
import { loadArcGymSituations, upsertArcGymTrainingRecordEntry } from "../data/storage.ts";

/**
 * live/ArcGymVisualizationOnlyScreen.tsx (route /arc-gym/visualize-only/[id])
 *
 * ARC GYM task, section 6, "😄 מעולה": skips Full ARC and Shortened
 * ARC entirely -- never touches the ARC LIVE engine at all. Shows the
 * SAME shared resolveArcGymActionVisualization text Full/Shortened
 * ARC's own Encoding override uses (requirement 7's own "one shared
 * visualization mechanism"), then returns attention to the body and
 * completes the training session -- never opening Task LIVE
 * automatically.
 *
 * Nine Functional Improvements task, Improvement 4: this SAME screen
 * is now also reached after a Full/Shortened ARC exercise finishes
 * (live/NewArcLiveScreen.tsx's returnToTask(), for the 😟/🙂 routes) --
 * the dedicated, strictly-AFTER-the-ARC-exercise step the spec
 * requires, reusing this screen rather than building a second one.
 * `recordAlreadyFinished` distinguishes the two cases: for the 😄
 * route there is no training record yet, so `finish()` creates and
 * completes a fresh "visualization_only" one exactly as before; for
 * the post-ARC case, returnToTask() already completed the REAL
 * "full_arc"/"shortened_arc" record (and recorded ARC GYM memory)
 * before ever navigating here, so `finish()` must not create a
 * second, duplicate completion record for the same training session.
 */
export default function ArcGymVisualizationOnlyScreen({ id, recordAlreadyFinished = false }: { id: string; recordAlreadyFinished?: boolean }) {
  const [situation, setSituation] = useState<ArcGymSituation | null>(null);
  const [done, setDone] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadArcGymSituations().then((situations) => setSituation(situations.find((candidate) => candidate.id === id) ?? null));
      setDone(false);
    }, [id])
  );

  async function finish() {
    if (!recordAlreadyFinished) {
      const now = new Date().toISOString();
      await upsertArcGymTrainingRecordEntry(completeArcGymTrainingRecord(createArcGymTrainingRecord(generateArcGymTrainingRecordId(), id, "visualization_only", now), now));
    }
    setDone(true);
  }

  if (!situation) {
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
          <Text style={styles.prompt}>האימון הושלם. תרצה להחיל את זה בסיטואציה האמיתית, בהזדמנות הבאה שתיווצר?</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.replace({ pathname: "/arc-gym/situation/[id]", params: { id } })}>
            <Text style={styles.primaryButtonText}>סיום</Text>
          </Pressable>
          {/*
           * ARCHI -- ARC Gym Home Navigation and Continuous Practice
           * task, section 1: additive to (never replacing) the "סיום"
           * button above -- that one returns to THIS exercise's own
           * situation screen, this one returns to ARC Gym Home so the
           * trainee can immediately pick a different exercise.
           * router.replace (never push), same "go home" idiom
           * live/ActiveTaskScreen.tsx's own 🏠 button uses, so chaining
           * several exercises in a row never grows the nav stack.
           */}
          <Pressable style={styles.gymHomeButton} onPress={() => router.replace("/arc-gym")} accessibilityLabel="בית ARC Gym">
            <Text style={styles.gymHomeButtonText}>🏋️ חזרה ל־ARC Gym</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>דימיון הפעולה</Text>
        <Text style={styles.prompt}>{resolveArcGymActionVisualization(situation)}</Text>
        <Text style={styles.returnPrompt}>שים לב לתחושת הגוף האמיתית כרגע, ולסביבה שאתה נמצא בה.</Text>
        <Pressable style={styles.primaryButton} onPress={finish}>
          <Text style={styles.primaryButtonText}>סיימתי</Text>
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
  prompt: { fontSize: 17, textAlign: "right", color: "#333", marginBottom: 20, lineHeight: 26 },
  returnPrompt: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 24 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  gymHomeButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 12 },
  gymHomeButtonText: { color: "#0a7ea4", fontWeight: "700", fontSize: 16 },
});
