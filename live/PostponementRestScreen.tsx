import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { Task } from "../arc/tasks.ts";
import { createTaskTimerRun, generateTaskTimerRunId } from "../arc/taskTimer.ts";
import { REST_DURATION_OPTIONS_MINUTES } from "../arc/taskTimerEndChoice.ts";
import { recordInterventionDuration } from "../arc/postponementObstacle.ts";
import { getTask, loadPostponementObstacleOutcomes, saveTaskTimerRun, upsertPostponementObstacleOutcome } from "../data/storage.ts";
import { armTaskTimerEndAlarm } from "../data/taskAlarm.ts";

/**
 * live/PostponementRestScreen.tsx (route /tasks/[id]/postpone-rest)
 *
 * Smart Postponement Flow, requirement 2 (Option 2 -- Need for Rest):
 * pick a rest duration, then hand off entirely to the EXISTING rest
 * mechanism live/ActiveTaskScreen.tsx already has -- the exact same
 * "rest"-kind TaskTimerRun, in the exact same single storage slot, armed
 * through the exact same armTaskTimerEndAlarm notification. Once this
 * screen creates that run and navigates to the task's own screen,
 * ActiveTaskScreen loads it (its own reload already restores a "rest"
 * run into `restRun`, from wherever it was created) and renders its
 * already-existing countdown UI -- "when the timer finishes, notify the
 * user" and "offer the option to start the original task" are both
 * already true of that screen, so neither is reimplemented here.
 */
export default function PostponementRestScreen({ taskId, outcomeId }: { taskId: string; outcomeId: string }) {
  const [task, setTask] = useState<Task | null>(null);

  useFocusEffect(
    useCallback(() => {
      getTask(taskId).then(setTask);
    }, [taskId]),
  );

  async function chooseDuration(minutes: number) {
    const now = new Date();
    const run = createTaskTimerRun(taskId, generateTaskTimerRunId(), minutes, now.toISOString(), "rest");
    const notificationId = await armTaskTimerEndAlarm(taskId, task?.title ?? "", new Date(now.getTime() + minutes * 60 * 1000), "זמן המנוחה הסתיים");
    await saveTaskTimerRun({ ...run, notificationId });

    const outcomes = await loadPostponementObstacleOutcomes();
    const outcome = outcomes.find((candidate) => candidate.id === outcomeId);
    if (outcome) {
      await upsertPostponementObstacleOutcome(recordInterventionDuration(outcome, minutes, now.toISOString()));
    }

    router.replace({ pathname: "/tasks/[id]", params: { id: taskId } });
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.taskName}>{task.title}</Text>
        <Text style={styles.title}>כמה זמן לנוח?</Text>
        {REST_DURATION_OPTIONS_MINUTES.map((minutes) => (
          <Pressable key={minutes} style={styles.optionCard} onPress={() => chooseDuration(minutes)}>
            <Text style={styles.optionTitle}>{minutes} דקות</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, padding: 24, justifyContent: "center" },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  taskName: { fontSize: 15, textAlign: "right", color: "#666", marginBottom: 6 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 20 },
  optionCard: { borderWidth: 2, borderColor: "#0a7ea4", borderRadius: 14, paddingVertical: 20, alignItems: "center", marginBottom: 14 },
  optionTitle: { color: "#0a7ea4", fontSize: 18, fontWeight: "700" },
});
