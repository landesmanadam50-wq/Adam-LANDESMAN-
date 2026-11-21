import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { completeTask } from "../arc/tasks.ts";
import type { Task } from "../arc/tasks.ts";
import { createTaskOccurrenceCompletion } from "../arc/taskOccurrence.ts";
import type { TaskOccurrenceCompletion } from "../arc/taskOccurrence.ts";
import { buildTodaySections, resolveArcWindowClockTime } from "../arc/todaySchedule.ts";
import type { TodayTaskEntry } from "../arc/todaySchedule.ts";
import type { TaskTimerRun } from "../arc/taskTimer.ts";
import { appendTaskOccurrenceCompletion, loadTaskOccurrenceCompletions, loadTaskOccurrenceOverrides, loadTaskTimerRun, upsertTask } from "../data/storage.ts";
import type { TaskOccurrenceOverride } from "../arc/taskOccurrenceOverride.ts";
import { resolveContinuousRoutineOutcome } from "../data/dailyRoutine.ts";
import { recordSilentTaskCompletionReward } from "../data/postTaskRewards.ts";
import { reconcilePlannedArcAlarms, reconcileTaskAlarms } from "../data/taskAlarm.ts";
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
 *
 * Psychology/Smiling/Positive-Reinforcement task: "after every
 * successfully completed task" applies here too, not only to the full
 * Task LIVE flow -- handleComplete below now opens
 * live/PostTaskRewardScreen.tsx with `source=today` right after
 * persisting the completion, for BOTH the recurring-occurrence and the
 * one-time branch. That screen's own `source=today` behavior returns
 * straight back here when finished/skipped, never pulling the trainee
 * into a different task's own live screen just because they tapped
 * this list's quick-complete button.
 */
export default function TodayScreen() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [completions, setCompletions] = useState<TaskOccurrenceCompletion[]>([]);
  const [overrides, setOverrides] = useState<TaskOccurrenceOverride[]>([]);
  // Current-task logic fix: the real persisted TaskTimerRun, threaded into
  // buildTodaySections below so an "active" task that is actually a stale
  // overnight run is never promoted to "המשימה עכשיו" here either.
  const [activeRun, setActiveRun] = useState<TaskTimerRun | null>(null);

  const reload = useCallback(() => {
    // Productivity upgrade task, requirement 2: the same "lazily
    // reconcile on next relevant touch" pattern reconcileRoutineNotifications
    // already uses -- every time Today gains focus, each "planned"
    // task's start alarm is brought back in sync with its own
    // freshly-computed next occurrence (advancing a recurring task's
    // alarm to its next qualifying day without requiring a re-save).
    //
    // ARC alarm task, section 7: reconcilePlannedArcAlarms runs
    // alongside it so a "before_task" ARC alarm also stays in sync with
    // its own linked task's time/recurrence/deletion/archival, without
    // waiting for that specific exercise's own editor to be reopened.
    Promise.all([reconcileTaskAlarms(), reconcilePlannedArcAlarms(), loadTaskOccurrenceCompletions(), loadTaskOccurrenceOverrides(), loadTaskTimerRun()]).then(
      ([reconciledTasks, , loadedCompletions, loadedOverrides, loadedRun]) => {
        setTasks(reconciledTasks);
        setCompletions(loadedCompletions);
        setOverrides(loadedOverrides);
        setActiveRun(loadedRun);
      }
    );
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

    // Continuous vs. Spaced Routines task: same mode-aware branch as
    // build/DailyScheduleScreen.tsx's own handleComplete -- see that
    // screen's doc for the full reasoning. Kept here too since Today
    // (/today) is still a fully live, directly-reachable screen a
    // routine task can be quick-completed from.
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

  if (tasks === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const sections = buildTodaySections(tasks, completions, new Date(), overrides, activeRun);
  const isEmpty =
    sections.overdue.length === 0 &&
    sections.current === null &&
    sections.nextTask === null &&
    sections.laterToday.length === 0 &&
    sections.unscheduled.length === 0 &&
    sections.completedToday.length === 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>תכנון משימות</Text>

        {isEmpty && <Text style={styles.hint}>אין משימות עדיין. אפשר להתחיל ב&quot;כל המשימות&quot; למטה.</Text>}

        {/* Task-categorization fix, requirement 1: ONLY an actually-started task -- never a stale overdue/upcoming one falling back into this slot. */}
        {sections.current ? (
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>המשימה עכשיו</Text>
            <TaskCard entry={sections.current} emphasized onComplete={handleComplete} />
          </View>
        ) : (
          // Current-task logic fix, requirement 4: an explicit "nothing is
          // currently planned" state -- never left blank, and never
          // auto-selecting an old/expired task just to avoid an empty
          // screen. The next task's own title/start time are already
          // shown in the "המשימה הבאה" block below; this button is the
          // one addition -- optionally starting it early.
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>אין כרגע משימה מתוכננת</Text>
            {sections.nextTask && (
              <Pressable
                style={styles.taskCard}
                onPress={() => router.push({ pathname: "/tasks/[id]", params: { id: sections.nextTask!.task.id, autoStart: "1" } })}
              >
                <Text style={styles.taskTitle}>התחל את המשימה הבאה מוקדם</Text>
              </Pressable>
            )}
          </View>
        )}

        <TaskSection title="באיחור" entries={sections.overdue} onComplete={handleComplete} />

        {/* Requirement 3: the nearest task whose own scheduled time hasn't
            arrived yet -- shown once, separately from the rest of "מאוחר
            יותר היום", even when it's still a while away (never only a
            due-right-now one). Floating ARC/next-task display task:
            when there is no such task at all, the row becomes an
            explicit prompt to plan one instead of silently
            disappearing -- never an overdue task shown in its place. */}
        <View style={styles.sectionBlock}>
          {sections.nextTask ? (
            <>
              <Text style={styles.sectionTitle}>המשימה הבאה</Text>
              <TaskCard entry={sections.nextTask} onComplete={handleComplete} />
            </>
          ) : (
            <Pressable style={styles.taskCard} onPress={() => router.push({ pathname: "/tasks/[id]/edit", params: { id: "new" } })}>
              <Text style={styles.taskTitle}>תכנון משימה נוספת</Text>
            </Pressable>
          )}
        </View>

        <TaskSection title="מאוחר יותר היום" entries={sections.laterToday} onComplete={handleComplete} />
        <TaskSection title="ללא תזמון" entries={sections.unscheduled} onComplete={handleComplete} />
        <TaskSection title="הושלמו היום" entries={sections.completedToday} onComplete={handleComplete} completedSection />

        <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.push("/tasks")}>
          <Text style={styles.buttonText}>כל המשימות</Text>
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

/** HH:MM, device-local, same convention as Task.scheduledTime's own string shape -- never re-parsed through a locale-sensitive formatter. */
function formatClockTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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
  // ARC-system upgrade task, Part 2: a task's own OPTIONAL ARC window,
  // shown as its own tappable row ABOVE the task -- never required,
  // never auto-added, never blocking the task's own "המשימה" row right
  // below it.
  const arcWindowClock = resolveArcWindowClockTime(task, entry.occurrenceDateLocal);
  return (
    <View>
      {arcWindowClock && (
        <Pressable
          style={styles.arcWindowRow}
          onPress={() => router.push({ pathname: "/tasks/[id]/arc-window", params: { id: task.id } })}
        >
          <Text style={styles.arcWindowText}>
            {`${formatClockTime(arcWindowClock)}–${task.scheduledTime} · ARC אופציונלי`}
          </Text>
        </Pressable>
      )}
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
  arcWindowRow: { borderWidth: 1, borderColor: "#0a7ea4", borderStyle: "dashed", borderRadius: 8, padding: 8, marginBottom: 4 },
  arcWindowText: { color: "#0a7ea4", fontSize: 12, textAlign: "right" },
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
  fullWidthButton: { marginTop: 8 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
