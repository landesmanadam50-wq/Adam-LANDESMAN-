import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ScheduledPlanEntry } from "../arc/dailyPlan.ts";
import type { DynamicPlanningDecision } from "../arc/dynamicPlanning.ts";
import { resolveDynamicPlanningAction } from "../arc/dynamicPlanning.ts";
import { formatMinutesToClockTime, parseClockTimeToMinutes } from "../arc/dailyRoutine.ts";
import { recordFreeTimeWindowDismissal } from "../arc/freeTimeWindowDismissal.ts";
import { resolveTodoList } from "../arc/todoList.ts";
import type { TodoPlanEntry } from "../arc/todoList.ts";
import { TIME_PLANNING_DEFAULT_DURATION_MINUTES } from "../arc/tasks.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";
import { resolveTodaysScheduledPlan } from "../data/dailyPlan.ts";
import { loadFreeTimeWindowDismissals, loadTasks, saveFreeTimeWindowDismissals, upsertTask } from "../data/storage.ts";
import { recomputeDynamicPlanningNotification } from "../data/dynamicPlanningNotification.ts";
import { recomputeFreeTimeWindowNotification } from "../data/freeTimeWindowNotification.ts";
import { recomputeReplanTimeNotification } from "../data/replanTimeNotification.ts";
import { recomputeTaskMemoryReminderNotification } from "../data/taskMemoryReminderNotification.ts";
import { recomputeTaskNotStartedNotification } from "../data/taskNotStartedNotification.ts";

const SCHEDULED_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * live/DynamicPlanningConfirmScreen.tsx (route /tasks/[id]/plan-next, id =
 * the PRECEDING fixed task's own id)
 *
 * ARCHI -- Rolling Dynamic Planning task, spec sections 1-4: reached
 * from the dynamic-planning notification's own "edit" action/body-tap
 * (data/dynamicPlanningNotification.ts), or directly from the start-of-
 * task banner on live/ActiveTaskScreen.tsx. Re-resolves
 * arc/dynamicPlanning.ts's own resolveDynamicPlanningAction completely
 * fresh on every load (never trusts anything the notification carried)
 * -- the exact same "never trust stale alarm-time data" rule
 * live/TaskMoveConfirmationScreen.tsx already documents.
 *
 * Two distinct gap states, same screen:
 *  - "confirm_next_todo": a To-Do is already woven into the gap
 *    (arc/todoList.ts's own resolveWovenDaySections, automatically or
 *    via a manual pin) -- the trainee reviews/edits its start time and
 *    duration, then confirms. Confirming IS spec section 3's own
 *    conversion: a single upsertTask field edit (isTodoItem:false, a
 *    real scheduledTime/expectedDurationMinutes) -- already a full
 *    "oneoff" fixed entry on the FLEXIBLE DAILY SCHEDULE ONLY by
 *    construction (arc/dailyPlan.ts's own resolveDailyPlan), never
 *    touching the weekly template, never a duplicate task. Every
 *    existing capability a fixed task already has (notifications, Task
 *    LIVE, the floating timer, ARC links) carries straight through,
 *    since it is the exact same Task record.
 *  - "plan_gap": nothing has been queued into the gap yet -- the
 *    trainee can move an existing To-Do into it (setting its own
 *    todoPinnedAfterTaskId to this preceding task, reloading in place
 *    so the screen flips straight into "confirm_next_todo" for it,
 *    satisfying spec section 4's rolling chain even for the very first
 *    step) or add a brand-new one (build/TaskEditorScreen.tsx's own
 *    initialIsTodoItem/initialTodoPinnedAfterTaskId props -- never a
 *    second task-creation form).
 *
 * "Skip" (spec section 6's own technical rule: skipping the planning
 * step must always stay possible) records a dismissal through
 * arc/freeTimeWindowDismissal.ts's EXISTING (dateLocal, precedingTaskId,
 * followingTaskId)-keyed list verbatim -- the same list the reactive
 * free-time-window notification already uses for the exact same window,
 * never a second, parallel dismissal mechanism.
 *
 * Reordering the wider To-Do list (manual up/down priority order, not
 * specific to this one gap) is deliberately NOT duplicated here --
 * build/TimePlanningModal.tsx already owns that, reachable from
 * build/FlexibleDailyScreen.tsx exactly as it always was, so this
 * screen never builds a parallel reorder UI for what's already a
 * single existing mechanism.
 */
export default function DynamicPlanningConfirmScreen({ precedingTaskId }: { precedingTaskId: string }) {
  const [scheduled, setScheduled] = useState<ScheduledPlanEntry[]>([]);
  const [todoEntries, setTodoEntries] = useState<TodoPlanEntry[]>([]);
  const [decision, setDecision] = useState<DynamicPlanningDecision | null>(null);
  const [startTimeDraft, setStartTimeDraft] = useState("");
  const [durationDraft, setDurationDraft] = useState("");
  const [applying, setApplying] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const reload = useCallback(() => {
    const now = new Date();
    const dateLocal = todayLocalDateString(now);
    Promise.all([resolveTodaysScheduledPlan(now), loadTasks()]).then(([plan, tasks]) => {
      const preceding = plan.find((candidate) => candidate.task.id === precedingTaskId) ?? null;
      const todos = resolveTodoList(tasks, dateLocal);
      setScheduled(plan);
      setTodoEntries(todos);
      if (!preceding) {
        setDecision(null);
        setLoaded(true);
        return;
      }
      const next = resolveDynamicPlanningAction(plan, todos, preceding, null);
      setDecision(next);
      if (next.action === "confirm_next_todo" && next.candidate && next.window) {
        setStartTimeDraft(formatMinutesToClockTime(next.window.startMinutes));
        const suggested = next.candidate.remainingMinutes ?? Math.min(next.window.durationMinutes ?? TIME_PLANNING_DEFAULT_DURATION_MINUTES, TIME_PLANNING_DEFAULT_DURATION_MINUTES);
        setDurationDraft(String(suggested));
      }
      setErrors([]);
      setLoaded(true);
    });
  }, [precedingTaskId]);

  useFocusEffect(reload);

  async function recomputeEverything(now: Date) {
    const { reconcileTaskAlarms } = await import("../data/taskAlarm.ts");
    await reconcileTaskAlarms(now);
    await recomputeTaskNotStartedNotification(now);
    await recomputeReplanTimeNotification(now);
    await recomputeTaskMemoryReminderNotification(now);
    await recomputeFreeTimeWindowNotification(now);
    await recomputeDynamicPlanningNotification(now);
  }

  async function handleConfirm() {
    if (!decision || decision.action !== "confirm_next_todo" || !decision.candidate || applying) return;
    const time = startTimeDraft.trim();
    const duration = Number(durationDraft.trim());
    const validationErrors: string[] = [];
    if (!SCHEDULED_TIME_PATTERN.test(time)) validationErrors.push("יש להזין שעת התחלה בפורמט HH:MM");
    if (!Number.isFinite(duration) || duration <= 0) validationErrors.push("יש להזין משך חיובי בדקות");
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;

    setApplying(true);
    const now = new Date();
    await upsertTask({ ...decision.candidate.task, isTodoItem: false, scheduledTime: time, expectedDurationMinutes: duration, updatedAt: now.toISOString() });
    await recomputeEverything(now);
    router.replace("/");
  }

  async function handleMoveIntoGap(taskId: string) {
    if (applying) return;
    const todo = todoEntries.find((entry) => entry.task.id === taskId);
    if (!todo) return;
    setApplying(true);
    const now = new Date();
    await upsertTask({ ...todo.task, todoPinnedAfterTaskId: precedingTaskId, updatedAt: now.toISOString() });
    await recomputeDynamicPlanningNotification(now);
    setApplying(false);
    reload();
  }

  function handleAddNewTodo() {
    router.push({ pathname: "/tasks/[id]/edit", params: { id: "new", isTodoItem: "1", todoPinnedAfterTaskId: precedingTaskId } });
  }

  async function handleSkip() {
    if (applying) return;
    if (!decision || !decision.window) {
      router.replace("/");
      return;
    }
    setApplying(true);
    const now = new Date();
    const dateLocal = todayLocalDateString(now);
    const dismissals = await loadFreeTimeWindowDismissals();
    const updated = recordFreeTimeWindowDismissal(
      dismissals,
      dateLocal,
      { precedingTaskId: decision.precedingEntry.task.id, followingTaskId: decision.window.followingTaskId },
      now.toISOString()
    );
    await saveFreeTimeWindowDismissals(updated);
    await recomputeDynamicPlanningNotification(now);
    router.replace("/");
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

  if (!decision || decision.action === "none") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>אין כאן יותר תכנון פתוח -- הפער הזה כבר מתוכנן.</Text>
          <Pressable style={styles.actionButton} onPress={() => router.replace("/")}>
            <Text style={styles.actionButtonText}>חזרה</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const windowDurationText = decision.window?.durationMinutes !== null && decision.window?.durationMinutes !== undefined ? `${decision.window.durationMinutes} דקות` : "זמן פתוח";
  const otherTodoEntries = todoEntries.filter((entry) => entry.task.id !== decision.candidate?.task.id);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>תכנון זמן מתגלגל</Text>
        <Text style={styles.subtitle}>
          {`"${decision.precedingEntry.task.title}" מתחילה ב-${decision.precedingEntry.effectiveStartTime ?? "?"}. יש ${windowDurationText} פנויים אחריה.`}
        </Text>

        {decision.action === "confirm_next_todo" && decision.candidate ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>המשימה הבאה: {decision.candidate.task.title}</Text>
            <Text style={styles.label}>שעת התחלה</Text>
            <TextInput style={styles.input} value={startTimeDraft} onChangeText={setStartTimeDraft} placeholder="HH:MM" />
            <Text style={styles.label}>משך (בדקות)</Text>
            <TextInput style={styles.input} value={durationDraft} onChangeText={setDurationDraft} keyboardType="number-pad" />
            {errors.map((error) => (
              <Text key={error} style={styles.error}>
                {error}
              </Text>
            ))}
            <Pressable style={styles.actionButton} onPress={handleConfirm} disabled={applying}>
              <Text style={styles.actionButtonText}>אשר ותתחיל</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.hint}>עדיין לא תוכנן כלום בפער הזה.</Text>
          </View>
        )}

        {otherTodoEntries.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>הזזת משימת To-Do קיימת לפער הזה</Text>
            {otherTodoEntries.map((entry) => (
              <Pressable key={entry.task.id} style={styles.secondaryButton} onPress={() => handleMoveIntoGap(entry.task.id)} disabled={applying}>
                <Text style={styles.secondaryButtonText}>{entry.task.title}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <Pressable style={styles.secondaryButton} onPress={handleAddNewTodo} disabled={applying}>
          <Text style={styles.secondaryButtonText}>+ הוספת משימת To-Do חדשה</Text>
        </Pressable>

        <Pressable style={styles.skipButton} onPress={handleSkip} disabled={applying}>
          <Text style={styles.skipButtonText}>דלג על התכנון</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#0b1120" },
  content: { padding: 20, gap: 16 },
  title: { color: "#f8fafc", fontSize: 20, fontWeight: "700", textAlign: "right" },
  subtitle: { color: "#cbd5e1", fontSize: 15, textAlign: "right" },
  hint: { color: "#94a3b8", fontSize: 14, textAlign: "right" },
  card: { backgroundColor: "#111827", borderRadius: 14, padding: 16, gap: 10 },
  cardTitle: { color: "#f8fafc", fontSize: 16, fontWeight: "600", textAlign: "right" },
  label: { color: "#94a3b8", fontSize: 13, textAlign: "right" },
  input: { backgroundColor: "#1e293b", color: "#f8fafc", borderRadius: 10, padding: 10, textAlign: "right" },
  error: { color: "#f87171", fontSize: 13, textAlign: "right" },
  actionButton: { backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  actionButtonText: { color: "#f8fafc", fontSize: 15, fontWeight: "700" },
  secondaryButton: { backgroundColor: "#1e293b", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  secondaryButtonText: { color: "#e2e8f0", fontSize: 14, fontWeight: "600" },
  skipButton: { paddingVertical: 10, alignItems: "center" },
  skipButtonText: { color: "#94a3b8", fontSize: 14 },
});
