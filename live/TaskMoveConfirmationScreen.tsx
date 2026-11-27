import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ScheduledPlanEntry } from "../arc/dailyPlan.ts";
import { formatMinutesToClockTime } from "../arc/dailyRoutine.ts";
import { resolveFreeTimeWindows, resolveFreeTimeWindowsAfter } from "../arc/freeTimeWindow.ts";
import type { FreeTimeWindow } from "../arc/freeTimeWindow.ts";
import { buildTaskOccurrenceOverride, findTaskOccurrenceOverride } from "../arc/taskOccurrenceOverride.ts";
import { resolveTodaysScheduledPlan } from "../data/dailyPlan.ts";
import { recomputeFreeTimeWindowNotification } from "../data/freeTimeWindowNotification.ts";
import { loadTaskOccurrenceOverrides, upsertTask, upsertTaskOccurrenceOverrideEntry } from "../data/storage.ts";
import { recomputeTaskNotStartedNotification } from "../data/taskNotStartedNotification.ts";
import { recomputeReplanTimeNotification } from "../data/replanTimeNotification.ts";
import { recomputeTaskMemoryReminderNotification } from "../data/taskMemoryReminderNotification.ts";

/**
 * live/TaskMoveConfirmationScreen.tsx (route /tasks/[id]/move-confirm)
 *
 * ARCHI -- Dynamic Time Planning & Free-Window Utilization task,
 * section 2/3: reached by tapping the task-not-started notification's
 * own body (data/taskNotStartedNotification.ts) when it offered a
 * move suggestion -- never a 4th notification button. Approving a
 * move writes TODAY'S Flexible Daily schedule ONLY (a
 * TaskOccurrenceOverride for a weekly-origin task, a direct field edit
 * for a one-off one) -- never the weekly template, never a duplicate
 * task, exactly data/taskNotStartedNotification.ts's own
 * finishOrGiveUpTask-adjacent "never touch the template" discipline.
 *
 * Its own `reload()` reuses resolveTodaysScheduledPlan -- the SAME
 * pipeline the notification itself used to find candidates -- so this
 * screen can never disagree with what the notification offered. The
 * candidate list and `selectedIndex` are purely local/ephemeral
 * (no persisted state of their own): "pick a different window" is
 * just moving an index, and cancelling (back, with no write) leaves
 * the notification free to re-offer the exact same move later.
 */
export default function TaskMoveConfirmationScreen({ taskId }: { taskId: string }) {
  const [entry, setEntry] = useState<ScheduledPlanEntry | null>(null);
  const [candidates, setCandidates] = useState<FreeTimeWindow[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [applying, setApplying] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(() => {
    const now = new Date();
    resolveTodaysScheduledPlan(now).then((scheduled) => {
      const found = scheduled.find((candidate) => candidate.task.id === taskId) ?? null;
      setEntry(found);
      if (!found) {
        setCandidates([]);
        setLoaded(true);
        return;
      }
      const windows = resolveFreeTimeWindows(scheduled, found.task.id);
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const after = resolveFreeTimeWindowsAfter(windows, nowMinutes, found.task.expectedDurationMinutes ?? 0);
      setCandidates(after);
      setSelectedIndex(0);
      setLoaded(true);
    });
  }, [taskId]);

  useFocusEffect(reload);

  function handlePickDifferentWindow() {
    if (candidates.length === 0) return;
    setSelectedIndex((index) => (index + 1) % candidates.length);
  }

  function handleCancel() {
    router.back();
  }

  async function handleApplyMove() {
    if (!entry || applying || candidates.length === 0) return;
    setApplying(true);
    const now = new Date();
    const candidate = candidates[selectedIndex];
    const newTime = formatMinutesToClockTime(candidate.startMinutes);

    if (entry.origin === "weekly") {
      const overrides = await loadTaskOccurrenceOverrides();
      const existing = findTaskOccurrenceOverride(entry.task.id, entry.occurrenceDateLocal, overrides);
      await upsertTaskOccurrenceOverrideEntry(
        buildTaskOccurrenceOverride(entry.task, entry.occurrenceDateLocal, existing, { scheduledTime: newTime }, now.toISOString())
      );
    } else {
      await upsertTask({ ...entry.task, scheduledTime: newTime, updatedAt: now.toISOString() });
    }

    const { reconcileTaskAlarms } = await import("../data/taskAlarm.ts");
    await reconcileTaskAlarms(now);
    await recomputeTaskNotStartedNotification(now);
    await recomputeReplanTimeNotification(now);
    await recomputeTaskMemoryReminderNotification(now);
    // The window just filled must stop being offered elsewhere.
    await recomputeFreeTimeWindowNotification(now);
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

  if (!entry) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>המשימה לא נמצאה.</Text>
          <Pressable style={styles.secondaryButton} onPress={handleCancel}>
            <Text style={styles.secondaryButtonText}>ביטול</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (candidates.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.taskName}>{entry.task.title}</Text>
          <Text style={styles.hint}>לא נמצא חלון זמן פנוי מתאים היום.</Text>
          <Pressable style={styles.secondaryButton} onPress={handleCancel}>
            <Text style={styles.secondaryButtonText}>ביטול</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const candidate = candidates[selectedIndex];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>המשימה</Text>
        <Text style={styles.taskName}>{entry.task.title}</Text>
        {!!entry.scheduledTime && <Text style={styles.hint}>{`הזמן המקורי: ${entry.scheduledTime}`}</Text>}

        <Text style={styles.title}>להעביר את המשימה לחלון הזמן הפנוי?</Text>
        <Text style={styles.hint}>היום הגמיש של היום בלבד יתעדכן -- התבנית השבועית לא תשתנה.</Text>

        <Text style={styles.label}>חלון מוצע</Text>
        <Text style={styles.candidateTime}>{formatMinutesToClockTime(candidate.startMinutes)}</Text>
        {candidates.length > 1 && <Text style={styles.hint}>{`אפשרות ${selectedIndex + 1} מתוך ${candidates.length}`}</Text>}

        <Pressable style={[styles.primaryButton, applying && styles.primaryButtonDisabled]} onPress={handleApplyMove} disabled={applying}>
          <Text style={styles.primaryButtonText}>אישור ההעברה</Text>
        </Pressable>
        {candidates.length > 1 && (
          <Pressable style={styles.secondaryButton} onPress={handlePickDifferentWindow} disabled={applying}>
            <Text style={styles.secondaryButtonText}>חלון זמן אחר</Text>
          </Pressable>
        )}
        <Pressable style={styles.secondaryButton} onPress={handleCancel} disabled={applying}>
          <Text style={styles.secondaryButtonText}>ביטול</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  label: { fontSize: 13, color: "#666", textAlign: "right", marginBottom: 4, marginTop: 14 },
  taskName: { fontSize: 18, fontWeight: "700", textAlign: "right", marginBottom: 4 },
  title: { fontSize: 18, fontWeight: "700", textAlign: "right", marginTop: 24, marginBottom: 4 },
  candidateTime: { fontSize: 28, fontWeight: "700", textAlign: "right", color: "#0a7ea4" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 24 },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 17 },
  secondaryButton: { paddingVertical: 14, alignItems: "center", marginTop: 8 },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 15 },
});
