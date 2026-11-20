import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { createEmptyTask, generateTaskId, type Task } from "../arc/tasks.ts";
import { recordInterventionDuration, recordSmallerTaskCreated } from "../arc/postponementObstacle.ts";
import { getTask, loadPostponementObstacleOutcomes, upsertPostponementObstacleOutcome, upsertTask } from "../data/storage.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";

const SMALLER_DURATION_OPTIONS_MINUTES = [2, 5, 10, 15];

/**
 * live/PostponementSmallerTaskScreen.tsx (route /tasks/[id]/postpone-smaller)
 *
 * Smart Postponement Flow, requirement 2 (Option 3 -- Make the Task
 * Smaller): the original task ("Study for 60 minutes") is shown for
 * context, then the trainee types a smaller, more manageable version
 * ("Read two pages") and picks a shorter duration ("5 minutes"). This
 * creates a brand-new, real Task -- parentTaskId pointing back to the
 * original -- so it is immediately startable in Task LIVE through the
 * exact same /tasks/[id] screen every other task uses, with no second
 * "mini task" implementation. The ORIGINAL task is never read-modified-
 * written here at all, so its own status/completedAt/schedule fields
 * are untouched by construction, not by a special case.
 */
export default function PostponementSmallerTaskScreen({ taskId, outcomeId }: { taskId: string; outcomeId: string }) {
  const [task, setTask] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(SMALLER_DURATION_OPTIONS_MINUTES[0]);

  useFocusEffect(
    useCallback(() => {
      getTask(taskId).then(setTask);
    }, [taskId]),
  );

  async function createAndStart() {
    if (!task || !title.trim()) return;
    const now = new Date();
    const nowIso = now.toISOString();
    const base = createEmptyTask(generateTaskId(), title.trim(), title.trim(), nowIso);
    const smallerTask: Task = {
      ...base,
      expectedDurationMinutes: duration,
      scheduledDate: todayLocalDateString(now),
      scheduledTime: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      routinePeriodId: task.routinePeriodId,
      parentTaskId: task.id,
    };
    await upsertTask(smallerTask);

    const outcomes = await loadPostponementObstacleOutcomes();
    const outcome = outcomes.find((candidate) => candidate.id === outcomeId);
    if (outcome) {
      const withDuration = recordInterventionDuration(outcome, duration, nowIso);
      await upsertPostponementObstacleOutcome(recordSmallerTaskCreated(withDuration, smallerTask.id, nowIso));
    }

    router.replace({ pathname: "/tasks/[id]", params: { id: smallerTask.id, autoStart: "1" } });
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
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>המשימה המקורית</Text>
        <Text style={styles.taskName}>{task.title}</Text>
        {!!task.expectedDurationMinutes && <Text style={styles.hint}>{task.expectedDurationMinutes} דק&apos;</Text>}

        <Text style={styles.title}>מה הגרסה הקטנה והניתנת לביצוע?</Text>
        <TextInput
          style={styles.textInput}
          value={title}
          onChangeText={setTitle}
          placeholder="לדוגמה: לקרוא שני עמודים"
          textAlign="right"
        />

        <Text style={styles.label}>משך קצר</Text>
        <View style={styles.chipRow}>
          {SMALLER_DURATION_OPTIONS_MINUTES.map((minutes) => (
            <Pressable key={minutes} style={[styles.chip, duration === minutes && styles.chipSelected]} onPress={() => setDuration(minutes)}>
              <Text style={[styles.chipText, duration === minutes && styles.chipTextSelected]}>{minutes} דק&apos;</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={[styles.primaryButton, !title.trim() && styles.primaryButtonDisabled]} onPress={createAndStart} disabled={!title.trim()}>
          <Text style={styles.primaryButtonText}>יצירה והתחלה עכשיו</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  label: { fontSize: 13, color: "#666", textAlign: "right", marginBottom: 4 },
  taskName: { fontSize: 18, fontWeight: "700", textAlign: "right", marginBottom: 4 },
  title: { fontSize: 18, fontWeight: "700", textAlign: "right", marginTop: 24, marginBottom: 10 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 16 },
  chipRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  chip: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 16, paddingVertical: 8, paddingHorizontal: 14 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 14, fontWeight: "600" },
  chipTextSelected: { color: "#fff" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 17 },
});
