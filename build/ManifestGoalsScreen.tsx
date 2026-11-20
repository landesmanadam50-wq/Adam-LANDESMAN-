import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ManifestGoal, ManifestGoalProgress } from "../arc/manifestGoals.ts";
import { completeTask, type Task, type TaskRecurrence } from "../arc/tasks.ts";
import { parseClockTimeToMinutes } from "../arc/dailyRoutine.ts";
import { isValidCalendarDateString } from "../program/dateUtils.ts";
import type { ManifestScheduledSlot } from "../arc/manifestTaskScheduling.ts";
import {
  createAndSaveManifestGoal,
  deleteManifestGoal,
  reorderManifestGoals,
  reorderManifestTasksForGoal,
  resolveManifestGoalsWithProgress,
  resolveManifestTasksForGoal,
  scheduleManifestTask,
  upsertManifestGoal,
} from "../data/manifestGoals.ts";
import { deleteTask, upsertTask } from "../data/storage.ts";

const RECURRENCE_DAY_LABELS = ["יום א׳", "יום ב׳", "יום ג׳", "יום ד׳", "יום ה׳", "יום ו׳", "שבת"];

interface GoalWithTasks {
  goal: ManifestGoal;
  progress: ManifestGoalProgress;
  tasks: Task[];
}

/**
 * build/ManifestGoalsScreen.tsx (route /purpose-manifests/[id]/goals)
 *
 * Manifest Goals & Automatic Task Scheduling task, requirements 1-2:
 * "Manifest -> Goals -> Tasks", with every task under a goal
 * automatically scheduled into the trainee's existing daily routine.
 * Goal CRUD/reorder is genuinely new (arc/manifestGoals.ts); a "task
 * under a goal" is never a second task record -- creating one here goes
 * straight through data/manifestGoals.ts's scheduleManifestTask into the
 * exact same Task/storage system build/TaskEditorScreen.tsx and
 * build/TasksListScreen.tsx already use, so it shows up on the daily
 * schedule immediately and "editing/rescheduling" reuses the EXISTING
 * task editor (/tasks/[id]/edit) rather than a second, parallel form --
 * only creation (which needs the new auto-scheduling decision) has its
 * own form here.
 */
export default function ManifestGoalsScreen({ manifestId }: { manifestId: string }) {
  const [goals, setGoals] = useState<GoalWithTasks[] | null>(null);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(null);

  const reload = useCallback(() => {
    resolveManifestGoalsWithProgress(manifestId).then(async (entries) => {
      const withTasks = await Promise.all(entries.map(async ({ goal, progress }) => ({ goal, progress, tasks: await resolveManifestTasksForGoal(goal.id) })));
      setGoals(withTasks);
    });
  }, [manifestId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  async function addGoal() {
    if (!newGoalTitle.trim() || savingGoal) return;
    setSavingGoal(true);
    await createAndSaveManifestGoal(manifestId, newGoalTitle.trim());
    setNewGoalTitle("");
    setSavingGoal(false);
    reload();
  }

  async function renameGoal(goal: ManifestGoal, title: string) {
    await upsertManifestGoal({ ...goal, title, updatedAt: new Date().toISOString() });
    reload();
  }

  async function removeGoal(goal: ManifestGoal) {
    await deleteManifestGoal(goal.id);
    reload();
  }

  async function moveGoal(goal: ManifestGoal, direction: -1 | 1) {
    if (!goals) return;
    const ids = goals.map((entry) => entry.goal.id);
    const index = ids.indexOf(goal.id);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= ids.length) return;
    [ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]];
    await reorderManifestGoals(manifestId, ids);
    reload();
  }

  async function moveTask(goalId: string, task: Task, tasksForGoal: Task[], direction: -1 | 1) {
    const ids = tasksForGoal.map((entry) => entry.id);
    const index = ids.indexOf(task.id);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= ids.length) return;
    [ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]];
    await reorderManifestTasksForGoal(goalId, ids);
    reload();
  }

  async function markTaskComplete(task: Task) {
    await upsertTask(completeTask(task, new Date().toISOString()));
    reload();
  }

  async function removeTask(task: Task) {
    await deleteTask(task.id);
    reload();
  }

  if (!goals) {
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
        <Text style={styles.title}>יעדים ומשימות</Text>

        {goals.length === 0 && <Text style={styles.hint}>עדיין לא נוספו יעדים למניפסט הזה.</Text>}

        {goals.map(({ goal, progress, tasks }, index) => (
          <GoalCard
            key={goal.id}
            goal={goal}
            progress={progress}
            tasks={tasks}
            expanded={expandedGoalId === goal.id}
            onToggleExpanded={() => setExpandedGoalId(expandedGoalId === goal.id ? null : goal.id)}
            onRename={(title) => renameGoal(goal, title)}
            onDelete={() => removeGoal(goal)}
            onMoveUp={index > 0 ? () => moveGoal(goal, -1) : null}
            onMoveDown={index < goals.length - 1 ? () => moveGoal(goal, 1) : null}
            onTaskCreated={reload}
            onCompleteTask={markTaskComplete}
            onDeleteTask={removeTask}
            onMoveTask={(task, direction) => moveTask(goal.id, task, tasks, direction)}
            manifestId={manifestId}
          />
        ))}

        <View style={styles.addGoalBlock}>
          <TextInput style={styles.textInput} value={newGoalTitle} onChangeText={setNewGoalTitle} placeholder="יעד חדש" textAlign="right" />
          <Pressable style={[styles.addButton, (!newGoalTitle.trim() || savingGoal) && styles.addButtonDisabled]} onPress={addGoal} disabled={!newGoalTitle.trim() || savingGoal}>
            <Text style={styles.addButtonText}>+ הוספת יעד</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function GoalCard({
  goal,
  progress,
  tasks,
  expanded,
  onToggleExpanded,
  onRename,
  onDelete,
  onMoveUp,
  onMoveDown,
  onTaskCreated,
  onCompleteTask,
  onDeleteTask,
  onMoveTask,
  manifestId,
}: {
  goal: ManifestGoal;
  progress: ManifestGoalProgress;
  tasks: Task[];
  expanded: boolean;
  onToggleExpanded: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
  onTaskCreated: () => void;
  onCompleteTask: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  onMoveTask: (task: Task, direction: -1 | 1) => void;
  manifestId: string;
}) {
  const [titleDraft, setTitleDraft] = useState(goal.title);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <View style={styles.goalCard}>
      <View style={styles.goalHeaderRow}>
        <Pressable onPress={onToggleExpanded} style={styles.goalTitleTouch}>
          <Text style={styles.goalTitle}>{goal.title}</Text>
          <Text style={styles.goalProgress}>{`${progress.completed}/${progress.total} משימות הושלמו`}</Text>
        </Pressable>
        <View style={styles.goalMoveColumn}>
          <Pressable disabled={!onMoveUp} onPress={onMoveUp ?? undefined} style={styles.moveButton}>
            <Text style={[styles.moveButtonText, !onMoveUp && styles.moveButtonTextDisabled]}>▲</Text>
          </Pressable>
          <Pressable disabled={!onMoveDown} onPress={onMoveDown ?? undefined} style={styles.moveButton}>
            <Text style={[styles.moveButtonText, !onMoveDown && styles.moveButtonTextDisabled]}>▼</Text>
          </Pressable>
        </View>
      </View>

      {expanded && (
        <View style={styles.goalBody}>
          <View style={styles.renameRow}>
            <TextInput style={[styles.textInput, styles.renameInput]} value={titleDraft} onChangeText={setTitleDraft} textAlign="right" />
            <Pressable style={styles.smallButton} onPress={() => onRename(titleDraft.trim())} disabled={!titleDraft.trim()}>
              <Text style={styles.smallButtonText}>שינוי שם</Text>
            </Pressable>
          </View>

          {tasks.map((task, index) => (
            <TaskRow
              key={task.id}
              task={task}
              onComplete={() => onCompleteTask(task)}
              onDelete={() => onDeleteTask(task)}
              onMoveUp={index > 0 ? () => onMoveTask(task, -1) : null}
              onMoveDown={index < tasks.length - 1 ? () => onMoveTask(task, 1) : null}
            />
          ))}

          <AddGoalTaskForm manifestId={manifestId} goalId={goal.id} onCreated={onTaskCreated} />

          {!confirmDelete ? (
            <Pressable style={styles.deleteGoalLink} onPress={() => setConfirmDelete(true)}>
              <Text style={styles.deleteGoalLinkText}>מחיקת היעד</Text>
            </Pressable>
          ) : (
            <View style={styles.confirmDeleteRow}>
              <Text style={styles.confirmDeleteText}>היעד יימחק; המשימות שלו יישארו, ללא קישור ליעד. למחוק?</Text>
              <Pressable style={styles.smallButton} onPress={onDelete}>
                <Text style={styles.smallButtonText}>כן, מחיקה</Text>
              </Pressable>
              <Pressable style={styles.smallButtonSecondary} onPress={() => setConfirmDelete(false)}>
                <Text style={styles.smallButtonSecondaryText}>ביטול</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function formatTaskSchedule(task: Task): string {
  if (!task.scheduledDate) return "עדיין לא נקבע תזמון";
  const date = new Date(`${task.scheduledDate}T00:00:00`).toLocaleDateString("he-IL");
  return task.scheduledTime ? `${date} בשעה ${task.scheduledTime}` : `${date} -- עדיין לא נקבעה שעה`;
}

function TaskRow({
  task,
  onComplete,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  task: Task;
  onComplete: () => void;
  onDelete: () => void;
  onMoveUp: (() => void) | null;
  onMoveDown: (() => void) | null;
}) {
  const isCompleted = task.status === "completed";
  return (
    <View style={styles.taskRow}>
      <View style={styles.taskMoveColumn}>
        <Pressable disabled={!onMoveUp} onPress={onMoveUp ?? undefined} style={styles.moveButton}>
          <Text style={[styles.moveButtonText, !onMoveUp && styles.moveButtonTextDisabled]}>▲</Text>
        </Pressable>
        <Pressable disabled={!onMoveDown} onPress={onMoveDown ?? undefined} style={styles.moveButton}>
          <Text style={[styles.moveButtonText, !onMoveDown && styles.moveButtonTextDisabled]}>▼</Text>
        </Pressable>
      </View>
      <View style={styles.taskInfo}>
        <Text style={[styles.taskTitle, isCompleted && styles.taskTitleCompleted]}>{task.title}</Text>
        <Text style={styles.taskSchedule}>{formatTaskSchedule(task)}</Text>
      </View>
      <View style={styles.taskActions}>
        <Pressable onPress={() => router.push({ pathname: "/tasks/[id]/edit", params: { id: task.id } })} style={styles.smallButtonSecondary}>
          <Text style={styles.smallButtonSecondaryText}>עריכה</Text>
        </Pressable>
        {!isCompleted && (
          <Pressable onPress={onComplete} style={styles.smallButton}>
            <Text style={styles.smallButtonText}>הושלם</Text>
          </Pressable>
        )}
        <Pressable onPress={onDelete} style={styles.smallButtonDanger}>
          <Text style={styles.smallButtonDangerText}>מחיקה</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Creation only -- "editing/rescheduling" reuses the existing /tasks/[id]/edit screen (TaskRow above), since scheduledDate/scheduledTime/duration are already full-featured fields there. This form exists only because CREATING a goal task needs the new automatic-scheduling decision TaskEditorScreen doesn't make. */
function AddGoalTaskForm({ manifestId, goalId, onCreated }: { manifestId: string; goalId: string; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [durationText, setDurationText] = useState("30");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<{ reason: string; alternatives: ManifestScheduledSlot[] } | null>(null);

  function toggleDay(day: number) {
    setRecurrenceDays((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day]));
  }

  async function submit(overridePreferredDateLocal?: string, overridePreferredTime?: string) {
    if (!title.trim() || saving) return;
    const durationMinutes = Number(durationText);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return;

    const preferredDateLocal = overridePreferredDateLocal ?? (isValidCalendarDateString(preferredDate) ? preferredDate : null);
    const validatedPreferredTime = overridePreferredTime ?? (parseClockTimeToMinutes(preferredTime) !== null ? preferredTime : null);
    const recurrence: TaskRecurrence = recurring && recurrenceDays.length > 0 ? { kind: "recurring", daysOfWeek: recurrenceDays } : { kind: "once" };

    setSaving(true);
    setConflict(null);
    const outcome = await scheduleManifestTask({
      manifestId,
      goalId,
      title: title.trim(),
      durationMinutes,
      preferredDateLocal,
      preferredTime: validatedPreferredTime,
      recurrence,
    });
    setSaving(false);

    if (outcome.status === "conflict") {
      setConflict({ reason: outcome.reason, alternatives: outcome.alternatives });
      return;
    }
    setTitle("");
    setPreferredDate("");
    setPreferredTime("");
    setRecurring(false);
    setRecurrenceDays([]);
    setConflict(null);
    onCreated();
  }

  return (
    <View style={styles.addTaskBlock}>
      <Text style={styles.addTaskTitle}>הוספת משימה ליעד</Text>
      <TextInput style={styles.textInput} value={title} onChangeText={setTitle} placeholder="שם המשימה" textAlign="right" />
      <View style={styles.row}>
        <Text style={styles.inlineLabel}>משך בדקות:</Text>
        <TextInput style={[styles.textInput, styles.durationInput]} value={durationText} onChangeText={setDurationText} keyboardType="numeric" textAlign="right" />
      </View>
      <TextInput style={styles.textInput} value={preferredDate} onChangeText={setPreferredDate} placeholder="תאריך מועדף (YYYY-MM-DD, רשות)" textAlign="right" />
      <TextInput style={styles.textInput} value={preferredTime} onChangeText={setPreferredTime} placeholder="שעה מועדפת (HH:MM, רשות)" textAlign="right" />
      <View style={styles.chipRow}>
        <Pressable style={[styles.chip, !recurring && styles.chipSelected]} onPress={() => setRecurring(false)}>
          <Text style={[styles.chipText, !recurring && styles.chipTextSelected]}>חד-פעמי</Text>
        </Pressable>
        <Pressable style={[styles.chip, recurring && styles.chipSelected]} onPress={() => setRecurring(true)}>
          <Text style={[styles.chipText, recurring && styles.chipTextSelected]}>חזרתי</Text>
        </Pressable>
      </View>
      {recurring && (
        <View style={styles.chipRow}>
          {RECURRENCE_DAY_LABELS.map((label, day) => (
            <Pressable key={day} style={[styles.chip, recurrenceDays.includes(day) && styles.chipSelected]} onPress={() => toggleDay(day)}>
              <Text style={[styles.chipText, recurrenceDays.includes(day) && styles.chipTextSelected]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {conflict && (
        <View style={styles.conflictBlock}>
          <Text style={styles.conflictReason}>{conflict.reason}</Text>
          {conflict.alternatives.map((alternative, index) => (
            <Pressable
              key={index}
              style={styles.smallButtonSecondary}
              onPress={() => submit(alternative.dateLocal, alternative.time)}
            >
              <Text style={styles.smallButtonSecondaryText}>
                {`${new Date(`${alternative.dateLocal}T00:00:00`).toLocaleDateString("he-IL")} בשעה ${alternative.time}`}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <Pressable style={[styles.addButton, (!title.trim() || saving) && styles.addButtonDisabled]} onPress={() => submit()} disabled={!title.trim() || saving}>
        <Text style={styles.addButtonText}>תזמון אוטומטי ושיבוץ</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 24 },
  hint: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  goalCard: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12, marginBottom: 12 },
  goalHeaderRow: { flexDirection: "row-reverse", alignItems: "center" },
  goalTitleTouch: { flex: 1 },
  goalTitle: { fontSize: 16, fontWeight: "700", textAlign: "right" },
  goalProgress: { fontSize: 12, color: "#666", textAlign: "right", marginTop: 2 },
  goalMoveColumn: { flexDirection: "column" },
  moveButton: { padding: 4 },
  moveButtonText: { fontSize: 14, color: "#0a7ea4" },
  moveButtonTextDisabled: { color: "#ccc" },
  goalBody: { marginTop: 10, borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 10 },
  renameRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 12 },
  renameInput: { flex: 1 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 15, marginBottom: 8 },
  taskRow: { flexDirection: "row-reverse", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#f0f0f0", paddingVertical: 8, gap: 8 },
  taskMoveColumn: { flexDirection: "column" },
  taskInfo: { flex: 1 },
  taskTitle: { fontSize: 15, fontWeight: "600", textAlign: "right" },
  taskTitleCompleted: { textDecorationLine: "line-through", color: "#888" },
  taskSchedule: { fontSize: 12, color: "#666", textAlign: "right", marginTop: 2 },
  taskActions: { flexDirection: "row-reverse", gap: 6 },
  addGoalBlock: { marginTop: 10 },
  addButton: { backgroundColor: "#0a7ea4", paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  addButtonDisabled: { opacity: 0.5 },
  addButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  addTaskBlock: { marginTop: 10, borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 10 },
  addTaskTitle: { fontSize: 14, fontWeight: "700", textAlign: "right", marginBottom: 8, color: "#444" },
  row: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 8 },
  inlineLabel: { fontSize: 13, color: "#444" },
  durationInput: { width: 70 },
  chipRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 13, fontWeight: "600" },
  chipTextSelected: { color: "#fff" },
  conflictBlock: { backgroundColor: "#fff6e5", borderRadius: 8, padding: 10, marginBottom: 10 },
  conflictReason: { fontSize: 13, color: "#8a5a00", textAlign: "right", marginBottom: 8 },
  smallButton: { backgroundColor: "#0a7ea4", borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10 },
  smallButtonText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  smallButtonSecondary: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 6 },
  smallButtonSecondaryText: { color: "#0a7ea4", fontSize: 12, fontWeight: "600" },
  smallButtonDanger: { borderWidth: 1, borderColor: "#c62828", borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10 },
  smallButtonDangerText: { color: "#c62828", fontSize: 12, fontWeight: "600" },
  deleteGoalLink: { marginTop: 8, alignItems: "flex-end" },
  deleteGoalLinkText: { color: "#c62828", fontSize: 13 },
  confirmDeleteRow: { marginTop: 8, alignItems: "flex-end", gap: 6 },
  confirmDeleteText: { fontSize: 13, color: "#444", textAlign: "right" },
});
