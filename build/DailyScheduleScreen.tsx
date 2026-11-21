import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { completeTask, ROUTINE_PERIOD_IDS, type RoutinePeriodId, type Task } from "../arc/tasks.ts";
import { createTaskOccurrenceCompletion, isRecurringTaskScheduledOnDate } from "../arc/taskOccurrence.ts";
import type { TaskOccurrenceCompletion } from "../arc/taskOccurrence.ts";
import { buildTodaySections } from "../arc/todaySchedule.ts";
import type { TaskTimerRun } from "../arc/taskTimer.ts";
import { ROUTINE_BREAK_KIND_LABELS, ROUTINE_PERIOD_LABELS, generateDailyRoutineSchedule, type DailyRoutineTemplate } from "../arc/dailyRoutine.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";
import { appendTaskOccurrenceCompletion, loadPlannedArcs, loadTaskOccurrenceCompletions, loadTaskOccurrenceOverrides, loadTasks, loadTaskTimerRun, upsertTask } from "../data/storage.ts";
import type { TaskOccurrenceOverride } from "../arc/taskOccurrenceOverride.ts";
import { loadDailyRoutineTemplate, resolveContinuousRoutineOutcome } from "../data/dailyRoutine.ts";
import { recordSilentTaskCompletionReward } from "../data/postTaskRewards.ts";
import { reconcilePlannedArcAlarms, reconcileTaskAlarms } from "../data/taskAlarm.ts";
import { reconcileDailyVisualizationAlarm } from "../data/dailyVisualizationAlarm.ts";
import { TASK_STATUS_LABELS } from "./TasksListScreen.tsx";
import PersistentTaskControls from "../live/PersistentTaskControls.tsx";

/**
 * build/DailyScheduleScreen.tsx (new Home content, route "/")
 *
 * Automatic Routine Builder, requirement 2: the main screen shown on
 * every entry once a DailyRoutineTemplate exists -- four period
 * sections, in chronological order, each with its own tasks (sorted by
 * their own scheduledTime, already computed onto each Task by
 * data/dailyRoutine.ts's materialization step) and any break that
 * follows a task. Current/next-task highlighting reuses
 * arc/todaySchedule.ts's existing buildTodaySections UNCHANGED -- a
 * routine task IS a real Task, so the exact same logic every other
 * screen already trusts applies here with no new code.
 */
export default function DailyScheduleScreen() {
  const [template, setTemplate] = useState<DailyRoutineTemplate | null | undefined>(undefined);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [completions, setCompletions] = useState<TaskOccurrenceCompletion[]>([]);
  const [overrides, setOverrides] = useState<TaskOccurrenceOverride[]>([]);
  const [plannedArcKindById, setPlannedArcKindById] = useState<Record<string, "full" | "mini">>({});
  // Current-task logic fix: threaded into buildTodaySections below so a
  // stale overnight "active" task is never promoted to "המשימה עכשיו" on
  // this legacy screen either.
  const [activeRun, setActiveRun] = useState<TaskTimerRun | null>(null);

  const reload = useCallback(() => {
    Promise.all([
      loadDailyRoutineTemplate(),
      reconcileTaskAlarms(),
      reconcilePlannedArcAlarms(),
      loadTaskOccurrenceCompletions(),
      loadTaskOccurrenceOverrides(),
      loadPlannedArcs(),
      reconcileDailyVisualizationAlarm(),
      loadTaskTimerRun(),
    ]).then(([loadedTemplate, reconciledTasks, , loadedCompletions, loadedOverrides, plannedArcs, , loadedRun]) => {
      setTemplate(loadedTemplate);
      setTasks(reconciledTasks);
      setCompletions(loadedCompletions);
      setOverrides(loadedOverrides);
      setPlannedArcKindById(Object.fromEntries(plannedArcs.map((item) => [item.id, item.kind])));
      setActiveRun(loadedRun);
    });
  }, []);

  useFocusEffect(reload);

  async function handleComplete(task: Task) {
    if (task.recurrence.kind === "recurring") {
      const entry = createTaskOccurrenceCompletion(task.id, new Date());
      await appendTaskOccurrenceCompletion(entry);
      setCompletions((previous) => [...previous, entry]);
    } else {
      const completed = completeTask(task, new Date().toISOString());
      await upsertTask(completed);
      setTasks((previous) => (previous ? previous.map((existing) => (existing.id === task.id ? completed : existing)) : previous));
    }

    // Continuous vs. Spaced Routines task: a continuous-mode period's
    // own "✓" completion earns its smile silently and simply stays on
    // this screen (the list above already reflects the completion via
    // the state updates above) -- never interrupted by the per-task
    // reflection/smile exercise. Only the LAST remaining task in the
    // period for today opens the one summary reflection. Every other
    // task (not in a continuous period) keeps the exact pre-existing
    // behavior: straight to the smiling-exercise screen.
    const continuousOutcome = await resolveContinuousRoutineOutcome(task, new Date());
    if (continuousOutcome.isContinuous) {
      await recordSilentTaskCompletionReward(task.id, new Date());
      if (!continuousOutcome.nextTaskInPeriod) {
        router.push({ pathname: "/tasks/[id]/reflect", params: { id: task.id, continuousRoutineSummary: "1" } });
      }
      return;
    }
    router.push({ pathname: "/tasks/[id]/post-task-reward", params: { id: task.id, source: "today" } });
  }

  function handleLaunchBreakArc(task: Task) {
    if (!task.breakAfter || task.breakAfter.kind !== "arc") return;
    const plannedArcId = task.breakAfter.plannedArcId;
    if (plannedArcId) {
      const mini = plannedArcKindById[plannedArcId] === "mini" ? "1" : undefined;
      router.push({ pathname: "/tasks/[id]/arc", params: mini ? { id: task.id, plannedArcId, mini } : { id: task.id, plannedArcId } });
      return;
    }
    router.push({ pathname: "/tasks/[id]/arc-window", params: { id: task.id } });
  }

  if (template === undefined || tasks === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (template === null) {
    // No routine built yet -- app/index.tsx itself decides this and
    // would already be showing build/RoutineSetupScreen.tsx instead,
    // but this guard keeps the component safe if ever rendered directly.
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>עדיין לא נבנתה תכנית יומית.</Text>
          <Pressable style={styles.button} onPress={() => router.push("/routine-plan/setup")}>
            <Text style={styles.buttonText}>בניית תכנית יומית</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const now = new Date();
  const todayDateLocal = todayLocalDateString(now);
  const generated = generateDailyRoutineSchedule(template);
  const sections = buildTodaySections(tasks, completions, now, overrides, activeRun);

  const routineTasksToday = tasks.filter((task) => {
    if (task.routinePeriodId === null || task.status === "archived") return false;
    if (task.recurrence.kind === "recurring") return isRecurringTaskScheduledOnDate(task, now);
    return task.scheduledDate === todayDateLocal;
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>התכנית היומית שלי</Text>
        <PersistentTaskControls />

        {sections.current ? (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>המשימה עכשיו</Text>
            <TaskRow task={sections.current.task} emphasized onComplete={handleComplete} onLaunchBreakArc={handleLaunchBreakArc} />
          </View>
        ) : (
          // Current-task logic fix, requirement 4: explicit "nothing
          // currently planned" state -- never left blank, never an old
          // task auto-selected to avoid an empty screen.
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>אין כרגע משימה מתוכננת</Text>
            {sections.nextTask && (
              <Pressable
                style={styles.addTaskButton}
                onPress={() => router.push({ pathname: "/tasks/[id]", params: { id: sections.nextTask!.task.id, autoStart: "1" } })}
              >
                <Text style={styles.addTaskButtonText}>התחל את המשימה הבאה מוקדם</Text>
              </Pressable>
            )}
          </View>
        )}
        {sections.nextTask && sections.nextTask.task.id !== sections.current?.task.id && (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>המשימה הבאה</Text>
            <TaskRow task={sections.nextTask.task} onComplete={handleComplete} onLaunchBreakArc={handleLaunchBreakArc} />
          </View>
        )}

        {ROUTINE_PERIOD_IDS.map((periodId) => {
          const period = template.periods[periodId];
          const conflict = generated.periods.find((p) => p.periodId === periodId)?.conflict ?? null;
          const periodTasks = routineTasksToday.filter((task) => task.routinePeriodId === periodId).sort((a, b) => (a.scheduledTime ?? "").localeCompare(b.scheduledTime ?? ""));
          return (
            <View key={periodId} style={styles.periodBlock}>
              <View style={styles.periodHeader}>
                <Text style={styles.periodTitle}>{ROUTINE_PERIOD_LABELS[periodId]}</Text>
                <Text style={styles.periodTime}>{period.startTime}–{period.endTime}</Text>
              </View>
              {conflict && (
                <Text style={styles.conflictText}>
                  ⚠ חריגה של {conflict.overflowMinutes} דק&apos; מעבר לזמן הפנוי בפרק זה.
                </Text>
              )}
              {periodTasks.length === 0 && <Text style={styles.hint}>אין משימות בפרק זה.</Text>}
              {periodTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  emphasized={task.id === sections.current?.task.id}
                  onComplete={handleComplete}
                  onLaunchBreakArc={handleLaunchBreakArc}
                />
              ))}
              <Pressable style={styles.addTaskButton} onPress={() => router.push({ pathname: "/routine-plan/task", params: { periodId } })}>
                <Text style={styles.addTaskButtonText}>+ הוספת משימה</Text>
              </Pressable>
            </View>
          );
        })}

        <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.push("/routine-plan/setup")}>
          <Text style={styles.buttonText}>עריכת התכנית המלאה</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.secondaryButton]} onPress={() => router.push("/tasks")}>
          <Text style={styles.secondaryButtonText}>כל המשימות</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.secondaryButton]} onPress={() => router.push("/manifest-today")}>
          <Text style={styles.secondaryButtonText}>חזון היום</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.secondaryButton]} onPress={() => router.push("/purpose-manifests")}>
          <Text style={styles.secondaryButtonText}>המניפסטים שלי</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function TaskRow({
  task,
  emphasized,
  onComplete,
  onLaunchBreakArc,
}: {
  task: Task;
  emphasized?: boolean;
  onComplete: (task: Task) => void;
  onLaunchBreakArc: (task: Task) => void;
}) {
  return (
    <View>
      <View style={[styles.taskCard, emphasized && styles.taskCardEmphasized]}>
        <Pressable onPress={() => router.push({ pathname: "/tasks/[id]", params: { id: task.id } })}>
          <Text style={styles.taskTitle}>{task.title}</Text>
          {!!task.scheduledTime && <Text style={styles.taskMeta}>{task.scheduledTime}</Text>}
          {!!task.expectedDurationMinutes && <Text style={styles.taskMeta}>{task.expectedDurationMinutes} דק&apos;</Text>}
          <Text style={styles.taskStatus}>{TASK_STATUS_LABELS[task.status]}</Text>
        </Pressable>
        <View style={styles.cardButtonRow}>
          <Pressable style={styles.cardButton} onPress={() => router.push({ pathname: "/tasks/[id]", params: { id: task.id, autoStart: "1" } })}>
            <Text style={styles.cardButtonText}>התחל</Text>
          </Pressable>
          <Pressable style={styles.cardButton} onPress={() => onComplete(task)}>
            <Text style={styles.cardButtonText}>הושלם</Text>
          </Pressable>
          <Pressable
            style={styles.cardButton}
            onPress={() => router.push({ pathname: "/routine-plan/task", params: { periodId: task.routinePeriodId ?? "", templateTaskId: task.routineTaskTemplateId ?? "", oneTimeTaskId: task.routineTaskTemplateId ? "" : task.id } })}
          >
            <Text style={styles.cardButtonText}>ערוך</Text>
          </Pressable>
        </View>
      </View>
      {task.breakAfter && (
        <View style={styles.breakRow}>
          <Text style={styles.breakText}>
            {ROUTINE_BREAK_KIND_LABELS[task.breakAfter.kind]} · {task.breakAfter.durationMinutes} דק&apos;
          </Text>
          {task.breakAfter.kind === "arc" && (
            <Pressable style={styles.breakButton} onPress={() => onLaunchBreakArc(task)}>
              <Text style={styles.breakButtonText}>התחלת ARC</Text>
            </Pressable>
          )}
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
  periodBlock: { marginBottom: 20, borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 12 },
  periodHeader: { flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 8 },
  periodTitle: { fontSize: 17, fontWeight: "700", textAlign: "right" },
  periodTime: { fontSize: 13, color: "#666" },
  conflictText: { color: "#b35900", fontSize: 13, textAlign: "right", marginBottom: 8 },
  taskCard: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, marginBottom: 6 },
  taskCardEmphasized: { borderColor: "#0a7ea4", borderWidth: 2, backgroundColor: "#f7fbfd" },
  taskTitle: { fontSize: 16, fontWeight: "700", textAlign: "right" },
  taskMeta: { fontSize: 13, color: "#666", textAlign: "right", marginTop: 2 },
  taskStatus: { fontSize: 13, color: "#0a7ea4", textAlign: "right", marginTop: 6 },
  cardButtonRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 10 },
  cardButton: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  cardButtonText: { color: "#0a7ea4", fontSize: 13, fontWeight: "600" },
  breakRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: "#0a7ea4", borderStyle: "dashed", borderRadius: 8, padding: 8, marginBottom: 10 },
  breakText: { color: "#0a7ea4", fontSize: 13 },
  breakButton: { backgroundColor: "#0a7ea4", borderRadius: 8, paddingVertical: 4, paddingHorizontal: 10 },
  breakButtonText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  addTaskButton: { alignSelf: "flex-end", marginTop: 4 },
  addTaskButtonText: { color: "#0a7ea4", fontSize: 14, fontWeight: "600" },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, alignItems: "center" },
  fullWidthButton: { marginTop: 8 },
  secondaryButton: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#0a7ea4", marginTop: 10 },
  secondaryButtonText: { color: "#0a7ea4", fontWeight: "600", fontSize: 16 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
