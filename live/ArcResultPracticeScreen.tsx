import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcResultExercise } from "../arc/arcResult.ts";
import { getTask, loadArcResultExercises, loadPositiveMemories, loadPositiveMemorySelectionHistory, savePositiveMemorySelectionHistory } from "../data/storage.ts";
// Positive Memory, Success Recall & Quick Capture task, section 9: the
// SAME reusable selection engine encoding's own visualization uses,
// with its success-based ranking strategy -- never a second,
// independently-written matcher.
import { selectPositiveMemoryForTaskSuccess } from "../arc/positiveMemorySelection.ts";
import type { PositiveMemory } from "../arc/positiveMemory.ts";
import { recordPositiveMemorySelection } from "../arc/positiveMemorySelectionHistory.ts";

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
  /**
   * Positive Memory, Success Recall & Quick Capture task, section 9
   * ("automatic success selection in ARC Success"): a real, previously
   * documented success relevant to this exercise's own linked task --
   * additive, never replacing any of the four existing fields above.
   * Defaults to inert/null, so an exercise reached with no linked task
   * (taskId null) or with no relevant documented success renders this
   * screen exactly as before.
   */
  const [pastSuccessMemory, setPastSuccessMemory] = useState<PositiveMemory | null>(null);
  const [pastSuccessDismissed, setPastSuccessDismissed] = useState(false);
  const [pastSuccessExcludedIds, setPastSuccessExcludedIds] = useState<string[]>([]);
  /** Positive Memory Visualization & Gratitude Integration task, section 2: "the associated task" is one of the fields to show when available -- the task's own title, resolved once alongside the exercise/memory load, never fabricated when there is no linked task. */
  const [pastSuccessTaskTitle, setPastSuccessTaskTitle] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadArcResultExercises().then((exercises) => setExercise(exercises.find((candidate) => candidate.id === id) ?? null));
      setPastSuccessDismissed(false);
      setPastSuccessExcludedIds([]);
      if (!taskId) {
        setPastSuccessMemory(null);
        setPastSuccessTaskTitle(null);
        return;
      }
      getTask(taskId).then((task) => setPastSuccessTaskTitle(task?.title ?? null));
      (async () => {
        const [memories, history] = await Promise.all([loadPositiveMemories(), loadPositiveMemorySelectionHistory()]);
        const picked = selectPositiveMemoryForTaskSuccess(memories, taskId, {}, history, []);
        setPastSuccessMemory(picked);
        if (picked) {
          const updatedHistory = recordPositiveMemorySelection(history, picked.id, "arc_success", taskId, new Date().toISOString());
          await savePositiveMemorySelectionHistory(updatedHistory);
        }
      })();
    }, [id, taskId])
  );

  /** "הצלחה אחרת": re-selects among real, non-fabricated past successes, never inventing one. */
  const handlePastSuccessAnother = useCallback(async () => {
    if (!taskId || !pastSuccessMemory) return;
    const [memories, history] = await Promise.all([loadPositiveMemories(), loadPositiveMemorySelectionHistory()]);
    const excludeIds = [...pastSuccessExcludedIds, pastSuccessMemory.id];
    const picked = selectPositiveMemoryForTaskSuccess(memories, taskId, {}, history, excludeIds);
    setPastSuccessExcludedIds(excludeIds);
    setPastSuccessMemory(picked);
    if (picked) {
      const updatedHistory = recordPositiveMemorySelection(history, picked.id, "arc_success", taskId, new Date().toISOString());
      await savePositiveMemorySelectionHistory(updatedHistory);
    }
  }, [taskId, pastSuccessMemory, pastSuccessExcludedIds]);

  /** "דלג": only ever dismisses this additive block -- the original ARC Success practice below continues completely unaffected. */
  const handlePastSuccessSkip = useCallback(() => {
    setPastSuccessDismissed(true);
  }, []);

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
        {pastSuccessMemory && !pastSuccessDismissed && (
          <View style={styles.pastSuccessCard}>
            {/*
             * Positive Memory Visualization & Gratitude Integration
             * task, section 2: the exact required instruction/label/
             * gratitude wording, in the exact required order -- the
             * documented success (successDescription, never a
             * generic/imagined scenario) is shown verbatim beneath
             * its own label, never spliced into another sentence.
             */}
            <Text style={styles.pastSuccessPrompt}>דמיין את הרגע הספציפי שבו הצלחת במשימה הזאת בעבר.</Text>
            <Text style={styles.pastSuccessLabel}>הרגע שבו הצלחת:</Text>
            {pastSuccessMemory.successDescription?.trim() ? <Text style={styles.pastSuccessMoment}>{pastSuccessMemory.successDescription}</Text> : null}
            <Text style={styles.pastSuccessGratitude}>הוקר תודה על ההצלחה הזאת.</Text>
            {pastSuccessTaskTitle && <Text style={styles.pastSuccessDetail}>{pastSuccessTaskTitle}</Text>}
            {(pastSuccessMemory.location && pastSuccessMemory.location.trim()) || pastSuccessMemory.occurredAt.trim() ? (
              <Text style={styles.pastSuccessDetail}>
                {[pastSuccessMemory.location, pastSuccessMemory.occurredAt].filter((part): part is string => !!part && part.trim().length > 0).join(" -- ")}
              </Text>
            ) : null}
            {pastSuccessMemory.whatWasSpecial.trim() ? <Text style={styles.pastSuccessDetail}>{pastSuccessMemory.whatWasSpecial}</Text> : null}
            <View style={styles.pastSuccessActions}>
              <Pressable style={styles.secondaryButton} onPress={handlePastSuccessAnother}>
                <Text style={styles.secondaryButtonText}>הצלחה אחרת</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={handlePastSuccessSkip}>
                <Text style={styles.secondaryButtonText}>דלג</Text>
              </Pressable>
            </View>
          </View>
        )}
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
  pastSuccessCard: { backgroundColor: "#FFF8E1", borderRadius: 14, padding: 20, marginBottom: 12 },
  pastSuccessPrompt: { fontSize: 17, fontWeight: "700", textAlign: "right", color: "#333", marginBottom: 10 },
  pastSuccessLabel: { fontSize: 14, fontWeight: "600", textAlign: "right", color: "#8A6D00", marginBottom: 4 },
  pastSuccessMoment: { fontSize: 16, fontWeight: "600", textAlign: "right", color: "#333", marginBottom: 10 },
  pastSuccessGratitude: { fontSize: 15, fontStyle: "italic", textAlign: "right", color: "#8A6D00", marginBottom: 10 },
  pastSuccessDetail: { fontSize: 14, textAlign: "right", color: "#555", marginBottom: 6 },
  pastSuccessActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 14 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: "center" },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 15 },
});
