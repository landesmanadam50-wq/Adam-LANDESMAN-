import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import {
  addSubtaskToDraft,
  buildTaskFromDraft,
  createEmptyTaskDraft,
  emptyTaskBase,
  removeSubtaskFromDraft,
  taskDraftFromTask,
  toggleRecurrenceDayInDraft,
  validateTaskDraft,
} from "../arc/taskDraft.ts";
import type { TaskDraft } from "../arc/taskDraft.ts";
import { archiveTask, generateTaskId, type Task } from "../arc/tasks.ts";
import { getTask, loadArcBuilds, loadArcGoals, loadStateProfiles, upsertTask } from "../data/storage.ts";
import { cancelScheduledNotification } from "../data/notifications.ts";
import type { ArcBuild } from "../arc/types.ts";
import type { ArcGoal } from "../arc/types.ts";
import { PREPARATION_STATE_IDS, PREPARATION_STATE_LABELS } from "../arc/preparationStates.ts";
import type { StateProfile } from "../arc/stateProfile.ts";

const RECURRENCE_DAY_LABELS = ["יום א׳", "יום ב׳", "יום ג׳", "יום ד׳", "יום ה׳", "יום ו׳", "שבת"];

/**
 * build/TaskEditorScreen.tsx (route /tasks/[id]/edit, id === "new" to create)
 *
 * Productivity roadmap, Stage H: the full task creation/editing screen,
 * exposing every field arc/tasks.ts's Task already models. Reached from
 * build/TasksListScreen.tsx's own "+ משימה מלאה" button (for a new
 * task) and live/ActiveTaskScreen.tsx's own "ערוך" button (for an
 * existing one) -- never a second task store: every save goes through
 * the exact same data/storage.ts upsertTask as the quick-create path
 * already on TasksListScreen.tsx, which stays untouched.
 *
 * Linked ArcGoal/ArcBuild are chosen from the trainee's own saved
 * records (loadArcGoals/loadArcBuilds) -- a deterministic pick from a
 * real list, never a free-text id field and never inferred.
 */
export default function TaskEditorScreen({ id }: { id: string }) {
  const isNew = id === "new";
  const [existingTask, setExistingTask] = useState<Task | null>(null);
  const [draft, setDraft] = useState<TaskDraft>(createEmptyTaskDraft());
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [arcGoals, setArcGoals] = useState<ArcGoal[]>([]);
  const [arcBuilds, setArcBuilds] = useState<ArcBuild[]>([]);
  const [stateProfiles, setStateProfiles] = useState<StateProfile[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(isNew);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const reload = useCallback(() => {
    Promise.all([isNew ? Promise.resolve(null) : getTask(id), loadArcGoals(), loadArcBuilds(), loadStateProfiles()]).then(([task, goals, builds, profiles]) => {
      setArcGoals(goals);
      setArcBuilds(builds);
      setStateProfiles(profiles);
      if (task) {
        setExistingTask(task);
        setDraft(taskDraftFromTask(task));
      }
      setLoaded(true);
    });
  }, [id, isNew]);

  useFocusEffect(reload);

  async function handleSave() {
    const validationErrors = validateTaskDraft(draft);
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;
    const base = existingTask ?? emptyTaskBase(generateTaskId(), new Date().toISOString());
    const saved = buildTaskFromDraft(draft, base, new Date().toISOString());
    await upsertTask(saved);
    router.replace({ pathname: "/tasks/[id]", params: { id: saved.id } });
  }

  async function handleArchive() {
    if (!existingTask) return;
    if (existingTask.notificationId) await cancelScheduledNotification(existingTask.notificationId);
    const now = new Date().toISOString();
    await upsertTask({ ...archiveTask(existingTask, now), notificationId: null, notificationScheduledFor: null });
    setConfirmArchive(false);
    router.replace("/tasks");
  }

  if (!loaded) {
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
        <Text style={styles.title}>{isNew ? "משימה חדשה" : "עריכת משימה"}</Text>

        {errors.map((error) => (
          <Text key={error} style={styles.errorText}>
            {error}
          </Text>
        ))}

        <Field label="כותרת">
          <TextInput style={styles.textInput} value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} textAlign="right" />
        </Field>

        <Field label="תיאור (רשות)">
          <TextInput
            style={styles.textInput}
            value={draft.description}
            onChangeText={(description) => setDraft({ ...draft, description })}
            textAlign="right"
            multiline
          />
        </Field>

        <Field label="פעולה פיזית ראשונה">
          <TextInput
            style={styles.textInput}
            value={draft.firstAction}
            onChangeText={(firstAction) => setDraft({ ...draft, firstAction })}
            textAlign="right"
          />
        </Field>

        <Field label="תאריך מתוכנן (YYYY-MM-DD, רשות)">
          <TextInput
            style={styles.textInput}
            value={draft.scheduledDate}
            onChangeText={(scheduledDate) => setDraft({ ...draft, scheduledDate })}
            textAlign="right"
            placeholder="2026-01-15"
          />
        </Field>

        <Field label="שעה מתוכננת (HH:MM, רשות)">
          <TextInput
            style={styles.textInput}
            value={draft.scheduledTime}
            onChangeText={(scheduledTime) => setDraft({ ...draft, scheduledTime })}
            textAlign="right"
            placeholder="09:30"
          />
        </Field>

        <Field label="משך מתוכנן בדקות (רשות)">
          <TextInput
            style={styles.textInput}
            value={draft.expectedDurationMinutes}
            onChangeText={(expectedDurationMinutes) => setDraft({ ...draft, expectedDurationMinutes })}
            textAlign="right"
            keyboardType="number-pad"
          />
        </Field>

        <Field label="חזרתיות">
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, draft.recurrenceKind === "once" && styles.chipSelected]}
              onPress={() => setDraft({ ...draft, recurrenceKind: "once" })}
            >
              <Text style={styles.chipText}>חד-פעמית</Text>
            </Pressable>
            <Pressable
              style={[styles.chip, draft.recurrenceKind === "recurring" && styles.chipSelected]}
              onPress={() => setDraft({ ...draft, recurrenceKind: "recurring" })}
            >
              <Text style={styles.chipText}>חזרתית</Text>
            </Pressable>
          </View>
          {draft.recurrenceKind === "recurring" && (
            <View style={styles.chipRow}>
              {RECURRENCE_DAY_LABELS.map((label, dayOfWeek) => (
                <Pressable
                  key={dayOfWeek}
                  style={[styles.chip, draft.recurrenceDays.includes(dayOfWeek) && styles.chipSelected]}
                  onPress={() => setDraft(toggleRecurrenceDayInDraft(draft, dayOfWeek))}
                >
                  <Text style={styles.chipText}>{label}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </Field>

        <Field label="תתי-משימות (רשות)">
          {draft.subtasks.map((subtask) => (
            <View key={subtask.id} style={styles.subtaskRow}>
              <Pressable onPress={() => setDraft(removeSubtaskFromDraft(draft, subtask.id))}>
                <Text style={styles.removeLink}>הסרה</Text>
              </Pressable>
              <Text style={styles.subtaskRowText}>{subtask.title}</Text>
            </View>
          ))}
          <View style={styles.addRow}>
            <Pressable
              style={styles.addButton}
              onPress={() => {
                setDraft(addSubtaskToDraft(draft, newSubtaskTitle));
                setNewSubtaskTitle("");
              }}
            >
              <Text style={styles.addButtonText}>הוספה</Text>
            </Pressable>
            <TextInput style={[styles.textInput, styles.flexInput]} value={newSubtaskTitle} onChangeText={setNewSubtaskTitle} textAlign="right" />
          </View>
        </Field>

        <Field label="ערך (רשות)">
          <TextInput style={styles.textInput} value={draft.value} onChangeText={(value) => setDraft({ ...draft, value })} textAlign="right" />
        </Field>

        <Field label="זהות (רשות)">
          <TextInput style={styles.textInput} value={draft.identity} onChangeText={(identity) => setDraft({ ...draft, identity })} textAlign="right" />
        </Field>

        <Field label="מצב תומך מועדף להכנה לפני המשימה (רשות)">
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, !draft.defaultSupportiveStateId && styles.chipSelected]}
              onPress={() => setDraft({ ...draft, defaultSupportiveStateId: "" })}
            >
              <Text style={styles.chipText}>ללא</Text>
            </Pressable>
            {PREPARATION_STATE_IDS.map((stateId) => (
              <Pressable
                key={stateId}
                style={[styles.chip, draft.defaultSupportiveStateId === stateId && styles.chipSelected]}
                onPress={() => setDraft({ ...draft, defaultSupportiveStateId: stateId })}
              >
                <Text style={styles.chipText}>{PREPARATION_STATE_LABELS[stateId]}</Text>
              </Pressable>
            ))}
            {stateProfiles.map((profile) => (
              <Pressable
                key={profile.id}
                style={[styles.chip, draft.defaultSupportiveStateId === profile.id && styles.chipSelected]}
                onPress={() => setDraft({ ...draft, defaultSupportiveStateId: profile.id })}
              >
                <Text style={styles.chipText}>{profile.name}</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Field label="מטרת ARC Goal מקושרת (רשות)">
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, draft.linkedArcGoalId === null && styles.chipSelected]}
              onPress={() => setDraft({ ...draft, linkedArcGoalId: null })}
            >
              <Text style={styles.chipText}>ללא</Text>
            </Pressable>
            {arcGoals.map((goal) => (
              <Pressable
                key={goal.id}
                style={[styles.chip, draft.linkedArcGoalId === goal.id && styles.chipSelected]}
                onPress={() => setDraft({ ...draft, linkedArcGoalId: goal.id })}
              >
                <Text style={styles.chipText}>{goal.name}</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Field label="תרגול ARC מקושר (רשות)">
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, draft.linkedArcBuildId === null && styles.chipSelected]}
              onPress={() => setDraft({ ...draft, linkedArcBuildId: null })}
            >
              <Text style={styles.chipText}>ללא</Text>
            </Pressable>
            {arcBuilds.map((build) => (
              <Pressable
                key={build.id}
                style={[styles.chip, draft.linkedArcBuildId === build.id && styles.chipSelected]}
                onPress={() => setDraft({ ...draft, linkedArcBuildId: build.id })}
              >
                <Text style={styles.chipText}>{build.name}</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Pressable style={styles.primaryButton} onPress={handleSave}>
          <Text style={styles.primaryButtonText}>{isNew ? "יצירת משימה" : "שמירת שינויים"}</Text>
        </Pressable>

        {!isNew && (
          <Pressable style={styles.archiveButton} onPress={() => setConfirmArchive(true)}>
            <Text style={styles.archiveButtonText}>העברה לארכיון</Text>
          </Pressable>
        )}
      </ScrollView>

      <Modal visible={confirmArchive} transparent animationType="fade" onRequestClose={() => setConfirmArchive(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>להעביר את המשימה לארכיון?</Text>
            <Text style={styles.hint}>המשימה תוסתר מהרשימות, אך לא תימחק -- ההיסטוריה שלה תישמר.</Text>
            <View style={styles.modalButtonRow}>
              <Pressable style={[styles.primaryButton, styles.modalButton, styles.archiveConfirmButton]} onPress={handleArchive}>
                <Text style={styles.primaryButtonText}>העברה לארכיון</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => setConfirmArchive(false)}>
                <Text style={styles.actionButtonText}>ביטול</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, gap: 4 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  errorText: { color: "#b00020", textAlign: "right", fontSize: 14, marginBottom: 4 },
  fieldBlock: { marginBottom: 16 },
  fieldLabel: { fontSize: 14, fontWeight: "600", textAlign: "right", marginBottom: 6, color: "#444" },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  flexInput: { flex: 1 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginTop: 4 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 13 },
  subtaskRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 8, marginBottom: 6 },
  subtaskRowText: { fontSize: 15, textAlign: "right" },
  removeLink: { color: "#b00020", fontSize: 13 },
  addRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  addButton: { backgroundColor: "#0a7ea4", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, justifyContent: "center" },
  addButtonText: { color: "#fff", fontWeight: "600" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 12 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  archiveButton: { borderWidth: 1, borderColor: "#b00020", paddingVertical: 12, borderRadius: 10, alignItems: "center", marginTop: 12 },
  archiveButtonText: { color: "#b00020", fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 20, width: "100%" },
  modalTitle: { fontSize: 18, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  modalButtonRow: { flexDirection: "row-reverse", justifyContent: "flex-end", alignItems: "center", gap: 12, marginTop: 16 },
  modalButton: { flex: 0, marginTop: 0, paddingHorizontal: 20 },
  archiveConfirmButton: { backgroundColor: "#b00020" },
  actionButton: { paddingVertical: 6, paddingHorizontal: 10 },
  actionButtonText: { color: "#0a7ea4", fontSize: 14 },
});
