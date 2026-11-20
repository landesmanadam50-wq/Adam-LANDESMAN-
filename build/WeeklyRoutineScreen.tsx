import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { Task } from "../arc/tasks.ts";
import {
  listWeekOneTimeEvents,
  reorderWeeklyTask,
  resetWeekCompletions,
  resetWeekOccurrenceOverrides,
  resolveWeekDates,
  resolveWeekStartLocalDate,
  resolveWeeklyRoutineByDay,
  WEEKDAY_LABELS_HE,
} from "../arc/weeklyRoutine.ts";
import {
  isCurrentWeek,
  resetWeekScheduleModeOverrides,
  resolveEffectiveScheduleMode,
  setWeekdayScheduleMode,
  shiftWeek,
  WEEKLY_SPACED_GAP_PRESETS,
} from "../arc/weeklyScheduleMode.ts";
import type { WeeklyScheduleMode } from "../arc/weeklyScheduleMode.ts";
import type { ArcGymGoal } from "../arc/arcGymGoal.ts";
import {
  deleteTask,
  loadArcGymGoals,
  loadDailyScheduleModeOverrides,
  loadTaskOccurrenceCompletions,
  loadTaskOccurrenceOverrides,
  loadTasks,
  loadWeeklyScheduleModeSettings,
  saveDailyScheduleModeOverrides,
  saveTaskOccurrenceCompletions,
  saveTaskOccurrenceOverrides,
  saveWeeklyScheduleModeSettings,
  upsertTask,
} from "../data/storage.ts";
import { reconcileTaskAlarms } from "../data/taskAlarm.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";
import PersistentTaskControls from "../live/PersistentTaskControls.tsx";

/**
 * build/WeeklyRoutineScreen.tsx (route "/" -- ARCHI's own Home, and
 * also directly reachable at /routine-week)
 *
 * Weekly & Daily Routine Redesign task, section 2: the permanent
 * Fixed Weekly Routine (every recurring Task, grouped by
 * arc/weeklyRoutine.ts's own resolveWeeklyRoutineByDay -- a
 * vertically-stacked day-by-day list, never 7 literal side-by-side
 * columns, which would be unreadable on a phone) PLUS, for the
 * currently-VIEWED calendar week specifically: real calendar dates per
 * weekday, prev/current/next week navigation, each weekday's own
 * continuous/spaced setting, that week's own one-time events, and a
 * synchronized reset. Tapping a weekday's own date opens the Flexible
 * Daily Routine (build/FlexibleDailyScreen.tsx) for that EXACT date --
 * never a generic weekday template. Create/edit of a permanent
 * recurring task still goes through the exact same
 * build/TaskEditorScreen.tsx every other task already uses -- "one
 * unified task editor," never a competing recurring-task form.
 */
export default function WeeklyRoutineScreen() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [weekdaySettings, setWeekdaySettings] = useState<Record<number, WeeklyScheduleMode>>({});
  const [weekStartLocal, setWeekStartLocal] = useState(() => resolveWeekStartLocalDate(todayLocalDateString(new Date())));
  const [customGapDraftByWeekday, setCustomGapDraftByWeekday] = useState<Record<number, string>>({});
  /** ARC Gym + ARC Goal Integration task: read-only, for the additive goal-title badge on each task card below -- never affects scheduling/ordering. */
  const [arcGymGoals, setArcGymGoals] = useState<ArcGymGoal[]>([]);

  const reload = useCallback(() => {
    Promise.all([loadTasks(), loadWeeklyScheduleModeSettings(), loadArcGymGoals()]).then(([loaded, settings, goals]) => {
      setTasks(loaded.filter((task) => task.status !== "archived"));
      setWeekdaySettings(settings);
      setArcGymGoals(goals);
    });
  }, []);

  useFocusEffect(reload);

  if (tasks === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const byDay = resolveWeeklyRoutineByDay(tasks);
  const weekDates = resolveWeekDates(weekStartLocal);
  const weekOneTimeEvents = listWeekOneTimeEvents(tasks, weekStartLocal);

  async function handleReorder(dayTasks: Task[], taskId: string, direction: "up" | "down") {
    const updated = reorderWeeklyTask(dayTasks, taskId, direction);
    if (!updated) return;
    for (const task of updated) await upsertTask(task);
    reload();
  }

  async function handleSetWeekdayMode(weekday: number, mode: WeeklyScheduleMode) {
    const settings = await loadWeeklyScheduleModeSettings();
    await saveWeeklyScheduleModeSettings(setWeekdayScheduleMode(settings, weekday, mode));
    await reconcileTaskAlarms();
    reload();
  }

  function handleOpenDay(dateLocal: string) {
    router.push({ pathname: "/routine-day", params: { date: dateLocal } });
  }

  function handleRemoveOneTimeEvent(task: Task) {
    Alert.alert("הסרת אירוע", `האירוע "${task.title}" יימחק.`, [
      { text: "ביטול", style: "cancel" },
      {
        text: "הסר",
        style: "destructive",
        onPress: async () => {
          await deleteTask(task.id);
          await reconcileTaskAlarms();
          reload();
        },
      },
    ]);
  }

  // Weekly & Daily Routine Redesign task, section 6: the MAIN, always-safe
  // reset -- restores the viewed week back to the permanent template
  // (clears completions, time/duration/order overrides, and mode
  // overrides for these 7 dates only). Never touches the Task records
  // themselves (the template) and never touches a one-time event --
  // those have their own, SEPARATE, explicitly-confirmed clear action
  // below, per section 6's own "one-time events must not be silently
  // deleted" data-safety rule.
  function handleResetWeek() {
    Alert.alert(
      "איפוס השבוע",
      "השבוע הנבחר יחזור לשגרה הקבועה: סימוני ההשלמה, שינויי הזמן/משך/סדר לתאריכים האלה, וההגדרות המיוחדות לרצף/מרווח יימחקו. השגרה הקבועה עצמה והאירועים החד-פעמיים לא יישתנו.",
      [
        { text: "ביטול", style: "cancel" },
        {
          text: "איפוס",
          style: "destructive",
          onPress: async () => {
            const [completions, overrides, modeOverrides] = await Promise.all([
              loadTaskOccurrenceCompletions(),
              loadTaskOccurrenceOverrides(),
              loadDailyScheduleModeOverrides(),
            ]);
            await Promise.all([
              saveTaskOccurrenceCompletions(resetWeekCompletions(completions, weekStartLocal)),
              saveTaskOccurrenceOverrides(resetWeekOccurrenceOverrides(overrides, weekStartLocal)),
              saveDailyScheduleModeOverrides(resetWeekScheduleModeOverrides(modeOverrides, weekStartLocal)),
            ]);
            await reconcileTaskAlarms();
            reload();
          },
        },
      ]
    );
  }

  // Section 6's own SEPARATE, explicitly-confirmed action: "clearing
  // week-specific planning additions" (one-time events) -- lists every
  // affected event by name before deleting any of them, never bundled
  // into the always-safe reset above.
  function handleClearWeekOneTimeEvents() {
    if (weekOneTimeEvents.length === 0) {
      Alert.alert("אין אירועים חד-פעמיים", "לא נמצאו אירועים חד-פעמיים בשבוע זה.");
      return;
    }
    const list = weekOneTimeEvents.map((task) => `• ${task.title} (${task.scheduledDate})`).join("\n");
    Alert.alert("מחיקת אירועים חד-פעמיים לשבוע זה", `האירועים הבאים יימחקו:\n${list}`, [
      { text: "ביטול", style: "cancel" },
      {
        text: "מחק הכל",
        style: "destructive",
        onPress: async () => {
          for (const task of weekOneTimeEvents) await deleteTask(task.id);
          await reconcileTaskAlarms();
          reload();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>שבוע קבוע</Text>
        <PersistentTaskControls />

        <View style={styles.weekNavRow}>
          <Pressable style={styles.weekNavButton} onPress={() => setWeekStartLocal(shiftWeek(weekStartLocal, "prev"))}>
            <Text style={styles.weekNavButtonText}>‹ שבוע קודם</Text>
          </Pressable>
          <Text style={styles.weekRangeText}>
            {weekDates[0]} - {weekDates[6]}
            {isCurrentWeek(weekStartLocal) ? " (השבוע)" : ""}
          </Text>
          <Pressable style={styles.weekNavButton} onPress={() => setWeekStartLocal(shiftWeek(weekStartLocal, "next"))}>
            <Text style={styles.weekNavButtonText}>שבוע הבא ›</Text>
          </Pressable>
        </View>
        {!isCurrentWeek(weekStartLocal) && (
          <Pressable onPress={() => setWeekStartLocal(resolveWeekStartLocalDate(todayLocalDateString(new Date())))}>
            <Text style={styles.linkText}>חזרה לשבוע הנוכחי</Text>
          </Pressable>
        )}

        <View style={styles.resetRow}>
          <Pressable style={styles.secondaryButton} onPress={handleResetWeek}>
            <Text style={styles.secondaryButtonText}>איפוס השבוע</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={handleClearWeekOneTimeEvents}>
            <Text style={styles.secondaryButtonText}>מחיקת אירועים חד-פעמיים</Text>
          </Pressable>
        </View>

        {WEEKDAY_LABELS_HE.map((label, dayIndex) => {
          const dayTasks = byDay[dayIndex];
          const dateLocal = weekDates[dayIndex];
          // This screen only ever shows/edits the PERMANENT per-weekday
          // setting (an empty date-overrides list) -- a date-specific
          // override belongs to one single date, so it is only ever set
          // from that date's own Flexible Daily screen, never from here.
          const mode = resolveEffectiveScheduleMode(dayIndex, dateLocal, weekdaySettings, []);
          const dayEvents = weekOneTimeEvents.filter((task) => task.scheduledDate === dateLocal);
          return (
            <View key={dayIndex} style={styles.daySection}>
              <View style={styles.dayHeaderRow}>
                <Pressable onPress={() => handleOpenDay(dateLocal)}>
                  <Text style={styles.dayHeader}>
                    {label} · {dateLocal}
                  </Text>
                </Pressable>
                <Pressable style={styles.addDayButton} onPress={() => router.push({ pathname: "/tasks/[id]/edit", params: { id: "new" } })}>
                  <Text style={styles.addDayButtonText}>+ משימה קבועה</Text>
                </Pressable>
              </View>

              <View style={styles.modeRow}>
                <Pressable style={[styles.modeChip, mode.mode === "continuous" && styles.modeChipSelected]} onPress={() => handleSetWeekdayMode(dayIndex, { mode: "continuous" })}>
                  <Text style={[styles.modeChipText, mode.mode === "continuous" && styles.modeChipTextSelected]}>רצוף</Text>
                </Pressable>
                {WEEKLY_SPACED_GAP_PRESETS.map((gapMinutes) => {
                  const selected = mode.mode === "spaced" && mode.gapMinutes === gapMinutes;
                  return (
                    <Pressable key={gapMinutes} style={[styles.modeChip, selected && styles.modeChipSelected]} onPress={() => handleSetWeekdayMode(dayIndex, { mode: "spaced", gapMinutes })}>
                      <Text style={[styles.modeChipText, selected && styles.modeChipTextSelected]}>{gapMinutes} דק&apos;</Text>
                    </Pressable>
                  );
                })}
                <TextInput
                  style={styles.customGapInput}
                  placeholder="מותאם"
                  keyboardType="number-pad"
                  value={customGapDraftByWeekday[dayIndex] ?? ""}
                  onChangeText={(text) => setCustomGapDraftByWeekday({ ...customGapDraftByWeekday, [dayIndex]: text })}
                  onBlur={() => {
                    const value = Number(customGapDraftByWeekday[dayIndex]);
                    if (Number.isFinite(value) && value > 0) handleSetWeekdayMode(dayIndex, { mode: "spaced", gapMinutes: value });
                  }}
                />
              </View>

              {dayTasks.length === 0 && <Text style={styles.hint}>אין משימות קבועות ליום זה.</Text>}
              {dayTasks.map((task, position) => (
                <View key={task.id} style={styles.taskCard}>
                  <Pressable style={styles.taskCardMain} onPress={() => router.push({ pathname: "/tasks/[id]/edit", params: { id: task.id } })}>
                    <Text style={styles.taskTitle}>{task.title}</Text>
                    {task.scheduledTime && <Text style={styles.taskMeta}>{task.scheduledTime}</Text>}
                    {task.expectedDurationMinutes !== null && <Text style={styles.taskMeta}>{task.expectedDurationMinutes} דק&apos;</Text>}
                    {task.arcGymGoalId && (
                      <Text style={styles.taskGoalBadge}>🎯 {arcGymGoals.find((goal) => goal.id === task.arcGymGoalId)?.title ?? "מטרת ARC"}</Text>
                    )}
                    {task.linkedArcGymSituationId && <Text style={styles.taskGoalBadge}>🏋️ אימון ARC Gym</Text>}
                  </Pressable>
                  <View style={styles.reorderColumn}>
                    <Pressable disabled={position === 0} onPress={() => handleReorder(dayTasks, task.id, "up")}>
                      <Text style={[styles.reorderArrow, position === 0 && styles.reorderArrowDisabled]}>▲</Text>
                    </Pressable>
                    <Pressable disabled={position === dayTasks.length - 1} onPress={() => handleReorder(dayTasks, task.id, "down")}>
                      <Text style={[styles.reorderArrow, position === dayTasks.length - 1 && styles.reorderArrowDisabled]}>▼</Text>
                    </Pressable>
                  </View>
                </View>
              ))}

              {dayEvents.length > 0 && (
                <View style={styles.eventsSection}>
                  <Text style={styles.eventsSectionTitle}>אירועים חד-פעמיים</Text>
                  {dayEvents.map((task) => (
                    <View key={task.id} style={styles.eventCard}>
                      <Pressable style={styles.eventCardMain} onPress={() => router.push({ pathname: "/tasks/[id]/edit", params: { id: task.id } })}>
                        <Text style={styles.eventTitle}>{task.title}</Text>
                        {task.scheduledTime && <Text style={styles.taskMeta}>{task.scheduledTime}</Text>}
                      </Pressable>
                      <Pressable onPress={() => handleRemoveOneTimeEvent(task)}>
                        <Text style={styles.removeEventText}>הסר</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  hint: { color: "#777", textAlign: "right", marginVertical: 4 },
  linkText: { color: "#666", fontSize: 13, textAlign: "right", marginTop: 4 },
  weekNavRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  weekNavButton: { paddingVertical: 6, paddingHorizontal: 8 },
  weekNavButtonText: { color: "#0a7ea4", fontSize: 14, fontWeight: "600" },
  weekRangeText: { fontSize: 14, color: "#333", fontWeight: "600" },
  resetRow: { flexDirection: "row-reverse", gap: 8, marginVertical: 8 },
  secondaryButton: { flex: 1, borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  secondaryButtonText: { color: "#0a7ea4", fontWeight: "600", fontSize: 13 },
  daySection: { marginTop: 16, borderTopWidth: 1, borderTopColor: "#eee", paddingTop: 12 },
  dayHeaderRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  dayHeader: { fontSize: 16, fontWeight: "700", textAlign: "right", color: "#0a7ea4" },
  addDayButton: { paddingVertical: 4, paddingHorizontal: 8 },
  addDayButtonText: { color: "#0a7ea4", fontSize: 13 },
  modeRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginTop: 6 },
  modeChip: { backgroundColor: "#F0F0F0", borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 },
  modeChipSelected: { backgroundColor: "#0a7ea4" },
  modeChipText: { fontSize: 12, color: "#444" },
  modeChipTextSelected: { color: "#fff" },
  customGapInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, fontSize: 12, width: 60, textAlign: "center" },
  taskCard: { flexDirection: "row-reverse", alignItems: "center", backgroundColor: "#F5FAFD", borderRadius: 10, padding: 10, marginTop: 8 },
  taskCardMain: { flex: 1 },
  taskTitle: { fontSize: 16, fontWeight: "600", textAlign: "right" },
  taskMeta: { fontSize: 13, color: "#555", textAlign: "right" },
  taskGoalBadge: { fontSize: 11, color: "#C2410C", textAlign: "right", marginTop: 2 },
  reorderColumn: { marginRight: 8, alignItems: "center" },
  reorderArrow: { fontSize: 16, color: "#0a7ea4", paddingVertical: 2 },
  reorderArrowDisabled: { color: "#ccc" },
  eventsSection: { marginTop: 8 },
  eventsSectionTitle: { fontSize: 13, color: "#888", textAlign: "right" },
  eventCard: { flexDirection: "row-reverse", alignItems: "center", backgroundColor: "#FFF7E6", borderRadius: 10, padding: 10, marginTop: 6, justifyContent: "space-between" },
  eventCardMain: { flex: 1 },
  eventTitle: { fontSize: 15, fontWeight: "600", textAlign: "right" },
  removeEventText: { color: "#b00020", fontSize: 13, marginRight: 8 },
});
