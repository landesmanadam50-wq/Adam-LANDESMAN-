import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { completeTask } from "../arc/tasks.ts";
import type { Task } from "../arc/tasks.ts";
import { createTaskOccurrenceCompletion } from "../arc/taskOccurrence.ts";
import type { TaskOccurrenceCompletion } from "../arc/taskOccurrence.ts";
import { buildTodaySections } from "../arc/todaySchedule.ts";
import type { TodayTaskEntry } from "../arc/todaySchedule.ts";
import { appendTaskOccurrenceCompletion, loadTaskOccurrenceCompletions, loadTasks, upsertTask } from "../data/storage.ts";
import { TASK_STATUS_LABELS } from "./TasksListScreen.tsx";

/**
 * build/TodayScreen.tsx (route /today)
 *
 * Productivity roadmap, Stage G+I: the new task-centric mode's own
 * dashboard -- reached from Home's third mode button (see app/index.tsx),
 * exactly the same "Home -> mode dashboard -> its own entry points"
 * convention build/SelfDevelopmentDashboardScreen.tsx and
 * build/ReachYourGoalDashboardScreen.tsx already establish, never a
 * second/duplicate home system. All categorization/sorting is pure and
 * separately tested in arc/todaySchedule.ts -- this screen only renders
 * what that module already decided.
 *
 * Card actions are limited to ones with a REAL destination: open
 * details, start (auto-starts the timer on the detail screen via the
 * `autoStart` param -- see live/ActiveTaskScreen.tsx's own doc),
 * postpone (opens the detail screen's existing postpone prompt via
 * `openPostpone`), complete (direct, no navigation -- a one-time task's
 * own completeTask, or a recurring task's TODAY occurrence via
 * arc/taskOccurrence.ts, never the other's completion mechanism), edit
 * (build/TaskEditorScreen.tsx, Stage H), and prepare
 * (live/PreparationScreen.tsx, Stage K).
 */
export default function TodayScreen() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [completions, setCompletions] = useState<TaskOccurrenceCompletion[]>([]);

  const reload = useCallback(() => {
    Promise.all([loadTasks(), loadTaskOccurrenceCompletions()]).then(([loadedTasks, loadedCompletions]) => {
      setTasks(loadedTasks);
      setCompletions(loadedCompletions);
    });
  }, []);

  useFocusEffect(reload);

  async function handleComplete(task: Task) {
    if (task.recurrence.kind === "recurring") {
      const entry = createTaskOccurrenceCompletion(task.id, new Date());
      await appendTaskOccurrenceCompletion(entry);
      setCompletions((previous) => [...previous, entry]);
      return;
    }
    const completed = completeTask(task, new Date().toISOString());
    await upsertTask(completed);
    setTasks((previous) => (previous ? previous.map((existing) => (existing.id === task.id ? completed : existing)) : previous));
  }

  if (tasks === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const sections = buildTodaySections(tasks, completions, new Date());
  const isEmpty =
    sections.overdue.length === 0 &&
    sections.currentOrNext === null &&
    sections.laterToday.length === 0 &&
    sections.unscheduled.length === 0 &&
    sections.completedToday.length === 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>היום</Text>

        {isEmpty && <Text style={styles.hint}>אין משימות עדיין. אפשר להתחיל ב&quot;כל המשימות&quot; למטה.</Text>}

        {sections.currentOrNext && (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>כרגע</Text>
            <TaskCard entry={sections.currentOrNext} emphasized onComplete={handleComplete} />
          </View>
        )}

        <TaskSection title="באיחור" entries={sections.overdue} onComplete={handleComplete} />
        <TaskSection title="מאוחר יותר היום" entries={sections.laterToday} onComplete={handleComplete} />
        <TaskSection title="ללא תזמון" entries={sections.unscheduled} onComplete={handleComplete} />
        <TaskSection title="הושלמו היום" entries={sections.completedToday} onComplete={handleComplete} completedSection />

        <Text style={styles.sectionTitle}>כניסות</Text>
        <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.push("/tasks")}>
          <Text style={styles.buttonText}>כל המשימות</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => router.push("/build")}>
          <Text style={styles.secondaryButtonText}>בניית תרגול ARC (BUILD)</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => router.push("/live/gate")}>
          <Text style={styles.secondaryButtonText}>לפני תרגול -- שאלון קצר</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => router.push("/manifest-meditation")}>
          <Text style={styles.secondaryButtonText}>מדיטציית מניפסט</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => router.push("/tasks/insights")}>
          <Text style={styles.secondaryButtonText}>תובנות</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => router.push("/coaching")}>
          <Text style={styles.secondaryButtonText}>סדנת אימון</Text>
        </Pressable>

        <Pressable style={styles.backButton} onPress={() => router.replace("/")}>
          <Text style={styles.backButtonText}>חזרה לבחירת מצב</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function TaskSection({
  title,
  entries,
  onComplete,
  completedSection,
}: {
  title: string;
  entries: TodayTaskEntry[];
  onComplete: (task: Task) => void;
  completedSection?: boolean;
}) {
  if (entries.length === 0) return null;
  return (
    <View style={styles.sectionBlock}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {entries.map((entry) => (
        <TaskCard key={entry.task.id} entry={entry} onComplete={onComplete} completedSection={completedSection} />
      ))}
    </View>
  );
}

function TaskCard({
  entry,
  onComplete,
  emphasized,
  completedSection,
}: {
  entry: TodayTaskEntry;
  onComplete: (task: Task) => void;
  emphasized?: boolean;
  completedSection?: boolean;
}) {
  const { task } = entry;
  return (
    <View style={[styles.taskCard, emphasized && styles.taskCardEmphasized]}>
      <Pressable onPress={() => router.push({ pathname: "/tasks/[id]", params: { id: task.id } })}>
        <Text style={styles.taskTitle}>{task.title}</Text>
        {!!task.scheduledTime && <Text style={styles.taskMeta}>{task.scheduledTime}</Text>}
        {!!task.expectedDurationMinutes && <Text style={styles.taskMeta}>{task.expectedDurationMinutes} דק&apos;</Text>}
        <Text style={styles.taskAction}>{task.currentAction ?? task.firstAction}</Text>
        {!!task.defaultSupportiveStateId && <Text style={styles.taskMeta}>מצב תומך: {task.defaultSupportiveStateId}</Text>}
        <Text style={styles.taskStatus}>{TASK_STATUS_LABELS[task.status]}</Text>
      </Pressable>
      {!completedSection && (
        <View style={styles.cardButtonRow}>
          <Pressable
            style={styles.cardButton}
            onPress={() => router.push({ pathname: "/tasks/[id]", params: { id: task.id, autoStart: "1" } })}
          >
            <Text style={styles.cardButtonText}>התחל</Text>
          </Pressable>
          <Pressable style={styles.cardButton} onPress={() => router.push({ pathname: "/tasks/[id]/prepare", params: { id: task.id } })}>
            <Text style={styles.cardButtonText}>הכנה</Text>
          </Pressable>
          <Pressable
            style={styles.cardButton}
            onPress={() => router.push({ pathname: "/tasks/[id]", params: { id: task.id, openPostpone: "1" } })}
          >
            <Text style={styles.cardButtonText}>דחייה</Text>
          </Pressable>
          <Pressable style={styles.cardButton} onPress={() => onComplete(task)}>
            <Text style={styles.cardButtonText}>הושלם</Text>
          </Pressable>
          <Pressable style={styles.cardButton} onPress={() => router.push({ pathname: "/tasks/[id]/edit", params: { id: task.id } })}>
            <Text style={styles.cardButtonText}>ערוך</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 24, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  hint: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 16 },
  sectionBlock: { marginBottom: 20 },
  sectionTitle: { fontSize: 17, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  taskCard: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, marginBottom: 10 },
  taskCardEmphasized: { borderColor: "#0a7ea4", borderWidth: 2, backgroundColor: "#f7fbfd" },
  taskTitle: { fontSize: 16, fontWeight: "700", textAlign: "right" },
  taskMeta: { fontSize: 13, color: "#666", textAlign: "right", marginTop: 2 },
  taskAction: { fontSize: 14, color: "#444", textAlign: "right", marginTop: 4 },
  taskStatus: { fontSize: 13, color: "#0a7ea4", textAlign: "right", marginTop: 6 },
  cardButtonRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 10 },
  cardButton: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  cardButtonText: { color: "#0a7ea4", fontSize: 13, fontWeight: "600" },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, alignItems: "center" },
  secondaryButton: { backgroundColor: "#3d8fa8" },
  fullWidthButton: { marginTop: 8 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  backButton: { marginTop: 28, alignItems: "center" },
  backButtonText: { color: "#0a7ea4", fontSize: 15 },
});
