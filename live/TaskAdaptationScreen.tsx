import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { Task } from "../arc/tasks.ts";
import { buildAdaptedTaskDraft, suggestHalvedDuration } from "../arc/taskAdaptation.ts";
import { resolveFreeMinutesUntilNextTask } from "../arc/dailyPlan.ts";
import { resolveTodaysScheduledPlan } from "../data/dailyPlan.ts";
import { getTask, upsertTask } from "../data/storage.ts";

/**
 * live/TaskAdaptationScreen.tsx (route /tasks/[id]/adapt)
 *
 * ARCHI -- Adaptive Task Execution & Emotional Persistence task, section
 * 6: "shrink the original task" -- reached either from
 * live/SupportiveActionFlowScreen.tsx (after rating an internal action)
 * or directly from live/ActiveTaskScreen.tsx's own Task LIVE
 * continuation loop ("No, but a smaller scope"). Mirrors
 * live/PostponementSmallerTaskScreen.tsx's exact idiom: a brand-new,
 * real Task (buildAdaptedTaskDraft, parentTaskId pointing back) is
 * created and persisted -- the ORIGINAL task is only ever read here,
 * never upserted/mutated, and the weekly-routine template it may come
 * from is never touched either, since buildAdaptedTaskDraft mints a
 * fresh id and never writes back to the original object at all.
 *
 * Three outcomes, exactly as the spec describes: "קיצור" creates the
 * child and starts it (no autoStart param -- Task LIVE's own normal
 * "התחלה" button is still the one thing that ever starts a timer,
 * never a forced auto-start here); "השארה כפי שהיא" leaves the task
 * completely untouched and simply returns to it; there is no third
 * silent outcome -- closing/back is the same as "השארה כפי שהיא."
 */
export default function TaskAdaptationScreen({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<Task | null>(null);
  const [freeMinutes, setFreeMinutes] = useState<number | null>(null);
  const [durationDraft, setDurationDraft] = useState("");
  const [whatExactlyDraft, setWhatExactlyDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getTask(taskId).then((loaded) => {
        setTask(loaded);
        if (loaded) {
          setDurationDraft(String(suggestHalvedDuration(loaded.expectedDurationMinutes ?? 10)));
          setWhatExactlyDraft(loaded.firstAction ?? "");
        }
      });
      resolveTodaysScheduledPlan(new Date()).then((scheduled) => {
        setFreeMinutes(resolveFreeMinutesUntilNextTask(scheduled, new Date(), taskId));
      });
    }, [taskId])
  );

  async function handleShrinkAndStart() {
    if (!task || saving) return;
    const requested = Number(durationDraft) || suggestHalvedDuration(task.expectedDurationMinutes ?? 10);
    const clamped = freeMinutes !== null ? Math.max(5, Math.min(requested, freeMinutes)) : Math.max(5, requested);
    setSaving(true);
    const now = new Date().toISOString();
    const draft = buildAdaptedTaskDraft(task, clamped, whatExactlyDraft.trim() || task.firstAction, now);
    await upsertTask(draft);
    router.replace({ pathname: "/tasks/[id]", params: { id: draft.id } });
  }

  function handleKeepUnchanged() {
    if (!task) return;
    router.replace({ pathname: "/tasks/[id]", params: { id: task.id } });
  }

  if (!task) {
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
        <Text style={styles.label}>המשימה המקורית</Text>
        <Text style={styles.taskName}>{task.title}</Text>
        {!!task.expectedDurationMinutes && <Text style={styles.hint}>{task.expectedDurationMinutes} דק&apos;</Text>}

        <Text style={styles.title}>להקטין את המשימה?</Text>
        <Text style={styles.hint}>המשימה המקורית לא תשתנה -- תיווצר גרסה קטנה יותר שמקושרת אליה.</Text>

        <Text style={styles.label}>משך מוצע (ניתן לשינוי)</Text>
        <TextInput style={styles.textInput} value={durationDraft} onChangeText={setDurationDraft} keyboardType="number-pad" textAlign="right" />
        {freeMinutes !== null && <Text style={styles.hint}>{`זמן פנוי עד המשימה הבאה: ${freeMinutes} דק'`}</Text>}

        <Text style={styles.label}>מה בדיוק יבוצע?</Text>
        <TextInput
          style={styles.textInput}
          value={whatExactlyDraft}
          onChangeText={setWhatExactlyDraft}
          textAlign="right"
          placeholder="לדוגמה: רק הפעולה הראשונה"
        />

        <Pressable style={[styles.primaryButton, saving && styles.primaryButtonDisabled]} onPress={handleShrinkAndStart} disabled={saving}>
          <Text style={styles.primaryButtonText}>יצירת גרסה קטנה</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={handleKeepUnchanged}>
          <Text style={styles.secondaryButtonText}>השארה כפי שהיא</Text>
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
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 12, fontSize: 16, textAlign: "right" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 24 },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 17 },
  secondaryButton: { paddingVertical: 14, alignItems: "center", marginTop: 8 },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 15 },
});
