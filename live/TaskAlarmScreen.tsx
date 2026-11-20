import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import type { Task } from "../arc/tasks.ts";
import { getTask } from "../data/storage.ts";
import { handleTaskAlarmAction } from "../data/taskAlarm.ts";

/**
 * live/TaskAlarmScreen.tsx (route /tasks/[id]/alarm)
 *
 * Task-alarm task: the full-screen UI notifee's own fullScreenAction
 * opens (even over a locked screen) when the alarm fires, or that the
 * trainee lands on by tapping the alarm notification itself. Requirement
 * 4: shows the task's own name. The three buttons call the exact same
 * handleTaskAlarmAction (data/taskAlarm.ts) a press directly on the
 * notification/lock screen would -- never a second, competing
 * implementation of what each action does.
 *
 * Smart Postponement Flow, requirement 1: the old "דחה ב-5 דקות" button
 * (a silent, fixed delay) is replaced by "דחייה", which opens
 * live/PostponementObstacleScreen.tsx -- the exact same
 * "postpone_obstacle" action id the notification's own button sends.
 * "כבה" stays (this full-screen UI has no Android action-count limit
 * to respect, unlike the compact notification), as a plain way to
 * silence the ring without entering the postponement flow.
 */
export default function TaskAlarmScreen({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<Task | null>(null);

  useFocusEffect(
    useCallback(() => {
      getTask(taskId).then(setTask);
    }, [taskId])
  );

  function press(actionId: string) {
    handleTaskAlarmAction(actionId, taskId);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.title}>הגיע הזמן למשימה</Text>
        <Text style={styles.taskName}>{task?.title ?? ""}</Text>

        <Pressable style={styles.primaryButton} onPress={() => press("start_task")}>
          <Text style={styles.primaryButtonText}>התחל משימה</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => press("postpone_obstacle")}>
          <Text style={styles.secondaryButtonText}>דחייה</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => press("turn_off")}>
          <Text style={styles.secondaryButtonText}>כבה</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#111" },
  content: { flex: 1, padding: 28, justifyContent: "center", gap: 14 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "center", color: "#fff", marginBottom: 4 },
  taskName: { fontSize: 28, fontWeight: "800", textAlign: "center", color: "#fff", marginBottom: 32 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 18, borderRadius: 14, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 18 },
  secondaryButton: { borderWidth: 1, borderColor: "#fff", paddingVertical: 16, borderRadius: 14, alignItems: "center" },
  secondaryButtonText: { color: "#fff", fontSize: 16 },
});
