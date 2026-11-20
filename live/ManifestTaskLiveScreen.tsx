import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { completeTask, createEmptyManifestProfile } from "../arc/tasks.ts";
import type { Task } from "../arc/tasks.ts";
import { createTaskOccurrenceCompletion } from "../arc/taskOccurrence.ts";
import { advanceManifestRun, createManifestRunState, goBackManifestRun, resolveManifestProgress } from "../arc/manifestTaskSteps.ts";
import type { ManifestRunState } from "../arc/manifestTaskSteps.ts";
import { getManifestStepContent } from "../arc/manifestTaskCopy.ts";
import {
  appendTaskOccurrenceCompletion,
  clearManifestRunState,
  getTask,
  loadManifestRunState,
  saveManifestRunState,
  upsertTask,
} from "../data/storage.ts";

/**
 * live/ManifestTaskLiveScreen.tsx (route /tasks/[id]/manifest)
 *
 * Productivity & Personal Development upgrade task, requirement 6: the
 * guided run for a "manifest"-kind task -- visualize the future self
 * (Step B) -> an ARC-adapted sequence (Step C) -> one small identity
 * action (Step D). Step A (longTermGoal/desiredResult/desiredIdentity/
 * bodyLanguageDescription) is the task's own already-saved
 * manifestProfile, set once in build/TaskEditorScreen.tsx -- never
 * re-asked here. All routing lives in arc/manifestTaskSteps.ts, all
 * copy in arc/manifestTaskCopy.ts; this screen only renders what those
 * two pure modules decide, same split as live/NewArcLiveScreen.tsx.
 */
export default function ManifestTaskLiveScreen({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<Task | null>(null);
  const [run, setRun] = useState<ManifestRunState | null>(null);
  const [actionText, setActionText] = useState("");

  const reload = useCallback(() => {
    Promise.all([getTask(taskId), loadManifestRunState()]).then(([loadedTask, existing]) => {
      setTask(loadedTask);
      if (existing && existing.taskId === taskId) {
        setRun(existing);
        return;
      }
      const fresh = createManifestRunState(taskId);
      setRun(fresh);
      saveManifestRunState(fresh);
    });
  }, [taskId]);

  useFocusEffect(reload);

  function commit(next: ManifestRunState) {
    setRun(next);
    saveManifestRunState(next);
  }

  async function finishRun() {
    if (!task) return;
    await clearManifestRunState();
    const now = new Date().toISOString();
    if (task.recurrence.kind === "recurring") {
      await appendTaskOccurrenceCompletion(createTaskOccurrenceCompletion(task.id, new Date()));
    } else {
      await upsertTask(completeTask(task, now));
    }
    router.replace({ pathname: "/tasks/[id]/post-task-reward", params: { id: task.id, source: "tasksList" } });
  }

  if (!task || !run) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const profile = task.manifestProfile ?? createEmptyManifestProfile();
  const content = getManifestStepContent(run, profile);
  const progress = resolveManifestProgress(run);
  const previous = goBackManifestRun(run);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.progress}>{`שלב ${progress.position} מתוך ${progress.total}`}</Text>
        <Text style={styles.taskTitle}>{task.title}</Text>
        <Text style={styles.title}>{content.title}</Text>
        <Text style={styles.primary}>{content.primary}</Text>
        {content.supporting.map((line) => (
          <Text key={line} style={styles.supporting}>
            {line}
          </Text>
        ))}

        {run.currentStep === "identity_action" ? (
          <View>
            <TextInput style={styles.textInput} value={actionText} onChangeText={setActionText} textAlign="right" placeholder="הפעולה שבחרת (רשות)" />
            <Pressable style={styles.primaryButton} onPress={finishRun}>
              <Text style={styles.primaryButtonText}>ביצעתי</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.primaryButton} onPress={() => commit(advanceManifestRun(run))}>
            <Text style={styles.primaryButtonText}>המשך</Text>
          </Pressable>
        )}

        {previous && (
          <Pressable onPress={() => commit(previous)}>
            <Text style={styles.linkText}>חזרה</Text>
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
  progress: { fontSize: 12, textAlign: "right", color: "#999", marginBottom: 6 },
  taskTitle: { fontSize: 14, textAlign: "right", color: "#7A4E2E", fontWeight: "600", marginBottom: 10 },
  title: { fontSize: 18, fontWeight: "700", textAlign: "right", marginBottom: 10 },
  primary: { fontSize: 17, textAlign: "right", color: "#222", lineHeight: 25, marginBottom: 8 },
  supporting: { fontSize: 14, textAlign: "right", color: "#555", lineHeight: 20, marginBottom: 6 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, marginTop: 10 },
  primaryButton: { backgroundColor: "#7A4E2E", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 16 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  linkText: { color: "#666", fontSize: 14, textAlign: "center", marginTop: 16 },
});
