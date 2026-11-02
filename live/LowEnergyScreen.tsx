import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { getLowEnergySteps } from "../arc/taskSupportRoutes.ts";
import { generateTaskJournalEntryId } from "../arc/tasks.ts";
import type { Task } from "../arc/tasks.ts";
import { appendTaskJournalEntry, getTask } from "../data/storage.ts";
import { createTaskJournalEntry } from "../data/taskJournal.ts";

/**
 * live/LowEnergyScreen.tsx (route /tasks/[id]/factor/energy)
 *
 * Productivity roadmap, Stage U: low energy -- "do not treat all low
 * energy as an emotion." A brief body check plus 3 concrete options
 * (movement / bounded rest / a smaller action), never a full ARC
 * protocol.
 */
export default function LowEnergyScreen({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<Task | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  useFocusEffect(
    useCallback(() => {
      getTask(taskId).then(setTask);
    }, [taskId])
  );

  function openTask() {
    const now = new Date().toISOString();
    appendTaskJournalEntry(
      createTaskJournalEntry({
        id: generateTaskJournalEntryId(),
        taskId,
        kind: "protocol_run_completed",
        occurredAt: now,
        createdAt: now,
        interferenceCategory: "energy",
        returnedToTask: true,
      })
    );
    router.replace({ pathname: "/tasks/[id]", params: { id: taskId, autoStart: "1" } });
  }

  if (!task) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  const steps = getLowEnergySteps(task.currentAction ?? task.firstAction);
  const isLastStep = stepIndex >= steps.length - 1;
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.body}>{steps[stepIndex]}</Text>
        <Pressable style={styles.primaryButton} onPress={() => (isLastStep ? openTask() : setStepIndex(stepIndex + 1))}>
          <Text style={styles.primaryButtonText}>{isLastStep ? "התחלת המשימה" : "המשך"}</Text>
        </Pressable>
        <Pressable style={styles.skipLink} onPress={openTask}>
          <Text style={styles.skipLinkText}>דלג והתחל</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, justifyContent: "center" },
  body: { fontSize: 18, textAlign: "right", lineHeight: 27, marginBottom: 28 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 12 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  skipLink: { marginTop: 20, alignItems: "center" },
  skipLinkText: { color: "#666", fontSize: 14 },
});
