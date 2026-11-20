import { useCallback, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcInsight } from "../arc/arcInsightBelief.ts";
import { createEmptyTask, generateTaskId } from "../arc/tasks.ts";
import type { Task } from "../arc/tasks.ts";
import { listTasksScheduledThisWeek } from "../arc/todaySchedule.ts";
import type { WeeklyScheduledTaskEntry } from "../arc/todaySchedule.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";
import { deleteArcInsight, loadArcInsights, loadTaskOccurrenceCompletions, loadTasks, upsertArcInsight, upsertTask } from "../data/storage.ts";
import MonthlyCalendar from "../live/components/MonthlyCalendar.tsx";

const DURATION_OPTIONS_MINUTES = [15, 30, 45, 60];

/**
 * build/InsightDetailScreen.tsx (route /insights/[id])
 *
 * ARCHI -- Unified Development Specification task, Part 5 ("INSIGHT
 * COLLECTION") / Part 6 ("CREATE TASKS FROM INSIGHTS") / Part 8 ("LINK
 * INSIGHTS TO EXISTING TASKS"): the one screen for everything about a
 * SINGLE already-saved insight -- view, edit its text, delete (with
 * confirmation), see its related task (if any), add a brand-new
 * implementation task for it, or link/unlink it to an already-existing
 * task. Insights are stored independently of tasks (arc/arcInsightBelief.ts's
 * own ArcInsight.taskId is the only link, never a second join table) --
 * completing, postponing, or deleting the linked task never deletes
 * this record, and deleting this record never touches the task.
 */
export default function InsightDetailScreen({ id }: { id: string }) {
  const [insight, setInsight] = useState<ArcInsight | null | undefined>(undefined);
  const [draftText, setDraftText] = useState("");
  const [linkedTask, setLinkedTask] = useState<Task | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskTitleDraft, setTaskTitleDraft] = useState("");
  const [taskDateDraft, setTaskDateDraft] = useState(todayLocalDateString());
  const [taskTimeDraft, setTaskTimeDraft] = useState("");
  const [taskDurationDraft, setTaskDurationDraft] = useState<number | null>(30);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const [weeklyTasks, setWeeklyTasks] = useState<WeeklyScheduledTaskEntry[]>([]);

  const reload = useCallback(() => {
    (async () => {
      const [insights, tasks] = await Promise.all([loadArcInsights(), loadTasks()]);
      const found = insights.find((candidate) => candidate.id === id) ?? null;
      setInsight(found);
      setDraftText(found?.text ?? "");
      setLinkedTask(found?.taskId ? tasks.find((task) => task.id === found.taskId) ?? null : null);
    })();
  }, [id]);

  useFocusEffect(reload);

  async function handleSaveText() {
    if (!insight) return;
    const trimmed = draftText.trim();
    if (!trimmed) return;
    const updated = { ...insight, text: trimmed };
    setInsight(updated);
    await upsertArcInsight(updated);
  }

  function handleDelete() {
    if (!insight) return;
    Alert.alert("מחיקת תובנה", "האם למחוק את התובנה? פעולה זו אינה הפיכה.", [
      { text: "ביטול", style: "cancel" },
      {
        text: "מחיקה",
        style: "destructive",
        onPress: async () => {
          await deleteArcInsight(insight.id);
          router.back();
        },
      },
    ]);
  }

  async function handleUnlinkTask() {
    if (!insight) return;
    const updated = { ...insight, taskId: null };
    setInsight(updated);
    setLinkedTask(null);
    await upsertArcInsight(updated);
  }

  async function openLinkPicker() {
    const [tasks, completions] = await Promise.all([loadTasks(), loadTaskOccurrenceCompletions()]);
    setWeeklyTasks(listTasksScheduledThisWeek(tasks, completions));
    setShowLinkPicker(true);
  }

  async function handleLinkTask(task: Task) {
    if (!insight) return;
    const updated = { ...insight, taskId: task.id };
    setInsight(updated);
    setLinkedTask(task);
    setShowLinkPicker(false);
    await upsertArcInsight(updated);
  }

  async function handleCreateTask() {
    if (!insight || !taskTitleDraft.trim()) return;
    const now = new Date().toISOString();
    const task = {
      ...createEmptyTask(generateTaskId(), taskTitleDraft.trim(), insight.text, now),
      scheduledDate: taskDateDraft,
      scheduledTime: taskTimeDraft.trim() || null,
      expectedDurationMinutes: taskDurationDraft,
    };
    await upsertTask(task);
    const updated = { ...insight, taskId: task.id };
    setInsight(updated);
    setLinkedTask(task);
    await upsertArcInsight(updated);
    setShowTaskForm(false);
  }

  if (insight === undefined) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.hint}>טוען...</Text>
      </SafeAreaView>
    );
  }

  if (insight === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.hint}>התובנה לא נמצאה.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>תובנה</Text>
        <TextInput style={styles.textInput} value={draftText} onChangeText={setDraftText} textAlign="right" multiline onBlur={handleSaveText} />
        <Pressable style={styles.secondaryButton} onPress={handleSaveText}>
          <Text style={styles.secondaryButtonText}>שמירת שינויים</Text>
        </Pressable>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>משימה מקושרת</Text>
          {linkedTask ? (
            <View style={styles.linkedTaskRow}>
              <Pressable style={styles.linkedTaskInfo} onPress={() => router.push({ pathname: "/tasks/[id]", params: { id: linkedTask.id } })}>
                <Text style={styles.linkedTaskTitle}>{linkedTask.title}</Text>
                {linkedTask.scheduledDate && <Text style={styles.hint}>{linkedTask.scheduledDate} {linkedTask.scheduledTime ?? ""}</Text>}
              </Pressable>
              <Pressable onPress={handleUnlinkTask}>
                <Text style={styles.unlinkText}>הסרת קישור</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.hint}>אין משימה מקושרת.</Text>
          )}
        </View>

        {!linkedTask && !showTaskForm && (
          <Pressable style={styles.secondaryButton} onPress={() => setShowTaskForm(true)}>
            <Text style={styles.secondaryButtonText}>הוסף משימה ליישום התובנה</Text>
          </Pressable>
        )}

        {!linkedTask && showTaskForm && (
          <View style={styles.section}>
            <TextInput style={styles.textInputSingle} value={taskTitleDraft} onChangeText={setTaskTitleDraft} textAlign="right" placeholder="שם המשימה" />
            <Pressable style={styles.secondaryButton} onPress={() => setShowCalendar(true)}>
              <Text style={styles.secondaryButtonText}>תאריך: {taskDateDraft}</Text>
            </Pressable>
            <TextInput style={styles.textInputSingle} value={taskTimeDraft} onChangeText={setTaskTimeDraft} textAlign="right" placeholder="שעה (HH:MM, רשות)" />
            <View style={styles.chipRow}>
              {DURATION_OPTIONS_MINUTES.map((minutes) => (
                <Pressable key={minutes} style={[styles.chip, taskDurationDraft === minutes && styles.chipSelected]} onPress={() => setTaskDurationDraft(minutes)}>
                  <Text style={[styles.chipText, taskDurationDraft === minutes && styles.chipTextSelected]}>{minutes} דק&apos;</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={[styles.primaryButton, !taskTitleDraft.trim() && styles.disabledButton]} disabled={!taskTitleDraft.trim()} onPress={handleCreateTask}>
              <Text style={styles.primaryButtonText}>יצירת משימה</Text>
            </Pressable>
          </View>
        )}

        {!linkedTask && (
          <Pressable style={styles.secondaryButton} onPress={openLinkPicker}>
            <Text style={styles.secondaryButtonText}>קישור למשימה</Text>
          </Pressable>
        )}

        <Pressable style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteButtonText}>מחיקת תובנה</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={showCalendar} transparent animationType="fade" onRequestClose={() => setShowCalendar(false)}>
        <View style={styles.modalOverlay}>
          <MonthlyCalendar
            selectedDate={taskDateDraft}
            onSelectDate={setTaskDateDraft}
            onConfirm={() => setShowCalendar(false)}
            onCancel={() => setShowCalendar(false)}
          />
        </View>
      </Modal>

      <Modal visible={showLinkPicker} transparent animationType="fade" onRequestClose={() => setShowLinkPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.linkPickerCard}>
            <Text style={styles.sectionTitle}>משימות השבוע</Text>
            <ScrollView style={styles.linkPickerList}>
              {weeklyTasks.length === 0 && <Text style={styles.hint}>אין משימות מתוזמנות השבוע.</Text>}
              {weeklyTasks.map((entry) => (
                <Pressable key={entry.task.id} style={styles.weeklyTaskRow} onPress={() => handleLinkTask(entry.task)}>
                  <Text style={styles.linkedTaskTitle}>{entry.task.title}</Text>
                  <Text style={styles.hint}>
                    {entry.occurrenceDateLocal} {entry.task.scheduledTime ?? ""}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.secondaryButton} onPress={() => setShowLinkPicker(false)}>
              <Text style={styles.secondaryButtonText}>ביטול</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 10 },
  hint: { fontSize: 13, color: "#666", textAlign: "right" },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, minHeight: 120, textAlignVertical: "top" },
  textInputSingle: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 15, marginTop: 8, textAlign: "right" },
  section: { marginTop: 18 },
  sectionTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", marginBottom: 6, color: "#333" },
  linkedTaskRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  linkedTaskInfo: { flex: 1 },
  linkedTaskTitle: { fontSize: 15, color: "#222", textAlign: "right" },
  unlinkText: { color: "#c0392b", fontSize: 13 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginTop: 10 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 13 },
  chipTextSelected: { color: "#fff" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 12, borderRadius: 10, alignItems: "center", marginTop: 14 },
  disabledButton: { opacity: 0.5 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  secondaryButton: { paddingVertical: 10, alignItems: "flex-end", marginTop: 10 },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 14, fontWeight: "600" },
  deleteButton: { marginTop: 30, paddingVertical: 12, alignItems: "center" },
  deleteButtonText: { color: "#c0392b", fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 20 },
  linkPickerCard: { backgroundColor: "#fff", borderRadius: 12, padding: 16, maxHeight: "70%" },
  linkPickerList: { marginTop: 6 },
  weeklyTaskRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#eee" },
});
