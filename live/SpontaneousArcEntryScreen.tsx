import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { loadTasks } from "../data/storage.ts";
import type { Task } from "../arc/tasks.ts";
import { STANDALONE_ARC_TASK_ID } from "../arc/newArcLiveTypes.ts";

/**
 * live/SpontaneousArcEntryScreen.tsx (route /arc-spontaneous)
 *
 * ARC-system upgrade task, Part B: "ARC ספונטני" is available at any
 * moment, not only from within an already-open task -- this is that
 * global entry point. It asks exactly the one question the spec itself
 * requires before anything else can happen: is this linked to a real
 * task, or a standalone Emotional ARC? Either branch then opens the
 * SAME /tasks/[id]/arc route (never a second, duplicated engine) with
 * `spontaneous=1` -- a real task id for the linked case, or the
 * STANDALONE_ARC_TASK_ID sentinel for the standalone case, which
 * live/NewArcLiveScreen.tsx already knows how to run without ever
 * writing a fake Task record to storage.
 */
export default function SpontaneousArcEntryScreen() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [showTaskPicker, setShowTaskPicker] = useState(false);

  const reload = useCallback(() => {
    loadTasks().then((loaded) => setTasks(loaded.filter((task) => task.status !== "completed" && task.status !== "archived")));
  }, []);

  useFocusEffect(reload);

  function openStandalone() {
    router.push({ pathname: "/tasks/[id]/arc", params: { id: STANDALONE_ARC_TASK_ID, spontaneous: "1" } });
  }

  function openLinkedToTask(taskId: string) {
    router.push({ pathname: "/tasks/[id]/arc", params: { id: taskId, spontaneous: "1" } });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>ARC ספונטני</Text>

        {!showTaskPicker ? (
          <View style={styles.chipColumn}>
            <Text style={styles.question}>האם זה מקושר למשימה קיימת?</Text>
            <Pressable style={styles.optionRow} onPress={() => setShowTaskPicker(true)}>
              <Text style={styles.optionText}>כן, לבחור משימה</Text>
            </Pressable>
            <Pressable style={styles.optionRow} onPress={openStandalone}>
              <Text style={styles.optionText}>לא, ARC רגשי עצמאי</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.chipColumn}>
            <Text style={styles.question}>איזו משימה?</Text>
            {tasks === null && <Text style={styles.hint}>טוען...</Text>}
            {tasks !== null && tasks.length === 0 && <Text style={styles.hint}>אין משימות פתוחות -- אפשר לבחור ARC רגשי עצמאי.</Text>}
            {tasks?.map((task) => (
              <Pressable key={task.id} style={styles.optionRow} onPress={() => openLinkedToTask(task.id)}>
                <Text style={styles.optionText}>{task.title}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setShowTaskPicker(false)}>
              <Text style={styles.linkText}>חזרה</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  question: { fontSize: 16, fontWeight: "600", textAlign: "right", marginBottom: 10 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  chipColumn: { gap: 10 },
  optionRow: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 10, padding: 14, alignItems: "flex-end" },
  optionText: { color: "#0a7ea4", fontSize: 15, fontWeight: "600" },
  linkText: { color: "#666", fontSize: 14, textAlign: "right", marginTop: 8 },
});
