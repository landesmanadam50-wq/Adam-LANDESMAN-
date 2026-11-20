import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { Task } from "../arc/tasks.ts";
import { findLatestOutcomeForTask, recordStartedOriginalTaskAfter } from "../arc/postponementObstacle.ts";
import { getTask, loadPostponementObstacleOutcomes, upsertPostponementObstacleOutcome } from "../data/storage.ts";

/**
 * live/PostponementReturnScreen.tsx (route /tasks/[id]/postpone-return)
 *
 * Smart Postponement Flow, requirement 5: the shared "are you ready to
 * start?" screen reached after the Rest intervention ends, and after a
 * smaller step is completed. (The Emotional-difficulty/ARC path reaches
 * its OWN equivalent instead -- the existing ARC transition menu
 * already offers "start now" / "return without a timer", and changing
 * that shared, heavily-used menu just for this one entry point would
 * risk the ARC flow every other task also depends on; see this
 * feature's own report for that explicit tradeoff.)
 *
 * "Continue with a smaller step" only appears when a still-incomplete
 * smaller task is actually passed in -- never shown for the rest path,
 * and never shown once that smaller task is already done.
 */
export default function PostponementReturnScreen({ taskId, smallerTaskId }: { taskId: string; smallerTaskId?: string | null }) {
  const [task, setTask] = useState<Task | null>(null);
  const [smallerTask, setSmallerTask] = useState<Task | null>(null);

  useFocusEffect(
    useCallback(() => {
      getTask(taskId).then(setTask);
      if (smallerTaskId) getTask(smallerTaskId).then(setSmallerTask);
      else setSmallerTask(null);
    }, [taskId, smallerTaskId]),
  );

  function startOriginal() {
    router.replace({ pathname: "/tasks/[id]", params: { id: taskId, autoStart: "1" } });
  }

  function continueSmaller() {
    if (!smallerTaskId) return;
    router.replace({ pathname: "/tasks/[id]", params: { id: smallerTaskId, autoStart: "1" } });
  }

  async function returnToSchedule() {
    const outcomes = await loadPostponementObstacleOutcomes();
    const latest = findLatestOutcomeForTask(outcomes, taskId);
    if (latest && latest.startedOriginalTaskAfter === null) {
      await upsertPostponementObstacleOutcome(recordStartedOriginalTaskAfter(latest, false, new Date().toISOString()));
    }
    router.replace("/");
  }

  if (!task) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const showContinueSmaller = !!smallerTaskId && !!smallerTask && smallerTask.status !== "completed" && smallerTask.status !== "archived";

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.taskName}>{task.title}</Text>
        <Text style={styles.title}>האם אתה מוכן להתחיל את המשימה?</Text>

        <Pressable style={styles.primaryButton} onPress={startOriginal}>
          <Text style={styles.primaryButtonText}>התחלת המשימה</Text>
        </Pressable>
        {showContinueSmaller && (
          <Pressable style={styles.secondaryButton} onPress={continueSmaller}>
            <Text style={styles.secondaryButtonText}>המשך בצעד הקטן</Text>
          </Pressable>
        )}
        <Pressable style={styles.secondaryButton} onPress={returnToSchedule}>
          <Text style={styles.secondaryButtonText}>חזרה לתכנית</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, padding: 24, justifyContent: "center" },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  taskName: { fontSize: 15, textAlign: "right", color: "#666", marginBottom: 6 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 24 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 16, borderRadius: 12, alignItems: "center", marginBottom: 12 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 17 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 14, borderRadius: 12, alignItems: "center", marginBottom: 12 },
  secondaryButtonText: { color: "#0a7ea4", fontWeight: "600", fontSize: 15 },
});
