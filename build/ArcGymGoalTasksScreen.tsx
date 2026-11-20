import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { Task } from "../arc/tasks.ts";
import { loadTasks } from "../data/storage.ts";

/**
 * build/ArcGymGoalTasksScreen.tsx (route /arc-gym/goal/[id]/tasks)
 *
 * ARC Gym + ARC Goal Integration task: the goal's own "practical
 * tasks" list -- every Task with this exact arcGymGoalId. Creating one
 * reuses the EXISTING task editor (/tasks/[id]/edit, id=new) with
 * TaskEditorScreen's own initialArcGymGoalId prop prefilling the link
 * -- never a second task-creation form, and the task is only saved
 * once the trainee explicitly confirms there.
 */
export default function ArcGymGoalTasksScreen({ goalId }: { goalId: string }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadTasks().then((all) => setTasks(all.filter((task) => task.arcGymGoalId === goalId && task.status !== "archived")));
    }, [goalId])
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>משימות מעשיות</Text>
          <Pressable
            style={styles.addButton}
            onPress={() => router.push({ pathname: "/tasks/[id]/edit", params: { id: "new", arcGymGoalId: goalId } })}
          >
            <Text style={styles.addButtonText}>+ משימה חדשה</Text>
          </Pressable>
        </View>

        {tasks === null && <Text style={styles.hint}>טוען...</Text>}
        {tasks !== null && tasks.length === 0 && <Text style={styles.hint}>אין עדיין משימות מקושרות למטרה הזו.</Text>}

        {(tasks ?? []).map((task) => (
          <Pressable key={task.id} style={styles.row} onPress={() => router.push({ pathname: "/tasks/[id]/edit", params: { id: task.id } })}>
            <Text style={styles.rowTitle}>{task.title}</Text>
            <Text style={styles.rowStatus}>{task.status === "completed" ? "הושלמה" : "פתוחה"}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20 },
  header: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right" },
  addButton: { backgroundColor: "#0a7ea4", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  addButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  row: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 14, marginBottom: 8, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  rowTitle: { fontSize: 15, fontWeight: "600", textAlign: "right", color: "#222" },
  rowStatus: { fontSize: 12, color: "#777" },
});
