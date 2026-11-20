import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { createEmptyTask, generateTaskId } from "../arc/tasks.ts";
import type { Task } from "../arc/tasks.ts";
import { loadTasks, upsertTask } from "../data/storage.ts";
import PersistentTaskControls from "../live/PersistentTaskControls.tsx";

/**
 * build/TasksListScreen.tsx (route /tasks)
 *
 * Hebrew BUILD/LIVE rework spec, page 4 ("ניהול מטרות ומשימות"): the
 * Today/Tasks list -- create a task (title + first action, the two
 * fields arc/tasks.ts's Task requires) and see every saved task, newest
 * first. Deliberately minimal for this pass: subtasks, recurrence,
 * scheduling, and goal/value/identity/supportive-state links are all
 * already modeled on Task itself (see arc/tasks.ts) but not yet
 * exposed in this creation form -- a later stage can extend this same
 * screen's fields without any data-model change.
 */
export default function TasksListScreen({ noMoreTasksToday = false }: { noMoreTasksToday?: boolean } = {}) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newFirstAction, setNewFirstAction] = useState("");

  const reload = useCallback(() => {
    loadTasks().then((loaded) => setTasks(loaded.filter((task) => task.status !== "archived").reverse()));
  }, []);

  useFocusEffect(reload);

  async function createTask() {
    const title = newTitle.trim();
    const firstAction = newFirstAction.trim();
    if (!title || !firstAction) return;
    const task = createEmptyTask(generateTaskId(), title, firstAction, new Date().toISOString());
    await upsertTask(task);
    setNewTitle("");
    setNewFirstAction("");
    reload();
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>המשימות שלי</Text>
        <PersistentTaskControls />

        {noMoreTasksToday && (
          // ARC-system upgrade task, Part J, action 4: "Next Task"/"Skip
          // Task" land here with this flag when there was nothing left to
          // open -- an explicit message, never a silent/confusing return
          // to this screen.
          <Text style={styles.noMoreTasksHint}>אין משימות נוספות להיום.</Text>
        )}

        <Text style={styles.question}>משימה חדשה</Text>
        <TextInput style={styles.textInput} value={newTitle} onChangeText={setNewTitle} placeholder="מה המשימה?" textAlign="right" />
        <TextInput style={styles.textInput} value={newFirstAction} onChangeText={setNewFirstAction} placeholder="מה הפעולה הפיזית הראשונה?" textAlign="right" />
        <Pressable style={[styles.primaryButton, (!newTitle.trim() || !newFirstAction.trim()) && styles.primaryButtonDisabled]} onPress={createTask}>
          <Text style={styles.primaryButtonText}>הוסף משימה</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => router.push({ pathname: "/tasks/[id]/edit", params: { id: "new" } })}
        >
          <Text style={styles.secondaryButtonText}>+ משימה מלאה (תזמון, חזרתיות, קישורים)</Text>
        </Pressable>
        {/* Fixed Weekly Routine / Flexible Daily Routine task: the two new planning screens, reachable from here alongside every other task-related entry point. */}
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/routine-week")}>
          <Text style={styles.secondaryButtonText}>שבוע קבוע</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/routine-day")}>
          <Text style={styles.secondaryButtonText}>היום הגמיש</Text>
        </Pressable>
        {/* ARC-system upgrade task, Part B: available at any moment, not
            only from within an already-open task. */}
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/arc-spontaneous")}>
          <Text style={styles.secondaryButtonText}>ARC ספונטני</Text>
        </Pressable>
        {/* ARC-system upgrade task, Part D. */}
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/planned-arcs")}>
          <Text style={styles.secondaryButtonText}>ספריית ARC מתוכננים</Text>
        </Pressable>
        {/* Task-start alarm vibration task, requirement 7. */}
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/tasks/alarm-settings")}>
          <Text style={styles.secondaryButtonText}>הגדרות שעון מעורר למשימות</Text>
        </Pressable>
        {/* Floating task timer task, requirement 1's own closing line. */}
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/tasks/floating-timer-settings")}>
          <Text style={styles.secondaryButtonText}>הגדרות טיימר צף</Text>
        </Pressable>
        {/* Nine Functional Improvements task, Improvement 8 / ARCHI Universal
            ARC Routing task, requirement 1: one combined settings entry for
            both the home-screen widget and the lock-screen notification. */}
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/tasks/emotional-checkin-settings")}>
          <Text style={styles.secondaryButtonText}>הוסף כפתורי ARC למסך הבית ולמסך הנעילה</Text>
        </Pressable>
        {/* Nine Functional Improvements task, Improvement 9. */}
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/tasks/morning-alarm-settings")}>
          <Text style={styles.secondaryButtonText}>שעון מעורר להכנה יומית</Text>
        </Pressable>

        <Text style={[styles.question, { marginTop: 24 }]}>כל המשימות</Text>
        {tasks === null && <Text style={styles.hint}>טוען...</Text>}
        {tasks !== null && tasks.length === 0 && <Text style={styles.hint}>אין עדיין משימות שמורות.</Text>}
        {tasks?.map((task) => (
          <Pressable key={task.id} style={styles.taskCard} onPress={() => router.push({ pathname: "/tasks/[id]", params: { id: task.id } })}>
            <Text style={styles.taskTitle}>{task.title}</Text>
            <Text style={styles.taskAction}>{task.currentAction ?? task.firstAction}</Text>
            <Text style={styles.taskStatus}>{TASK_STATUS_LABELS[task.status]}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

export const TASK_STATUS_LABELS: Record<Task["status"], string> = {
  planned: "מתוכנן",
  active: "פעיל",
  paused: "מושהה",
  postponed: "נדחה",
  completed: "הושלם",
  archived: "בארכיון",
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, gap: 4 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  question: { fontSize: 15, fontWeight: "600", textAlign: "right", marginBottom: 8 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  noMoreTasksHint: { fontSize: 14, textAlign: "right", color: "#0a7ea4", marginBottom: 12 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 10 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 12, borderRadius: 10, alignItems: "center", marginTop: 4 },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 10, borderRadius: 10, alignItems: "center", marginTop: 8 },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 14 },
  taskCard: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, marginTop: 10 },
  taskTitle: { fontSize: 16, fontWeight: "700", textAlign: "right" },
  taskAction: { fontSize: 14, color: "#666", textAlign: "right", marginTop: 4 },
  taskStatus: { fontSize: 13, color: "#0a7ea4", textAlign: "right", marginTop: 6 },
});
