import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { Task } from "../arc/tasks.ts";
import { buildSplitPlan, sumSplitPlanMinutes } from "../arc/taskSplitPlan.ts";
import { createTaskSplitProgress } from "../arc/taskSplitProgress.ts";
import { resolveFreeMinutesUntilNextTask } from "../arc/dailyPlan.ts";
import { resolveTodaysScheduledPlan } from "../data/dailyPlan.ts";
import { getTask, saveTaskSplitProgress } from "../data/storage.ts";

type Mode = "continuous" | "split";

/**
 * live/TaskDurationSelectionScreen.tsx (route /tasks/[id]/duration)
 *
 * ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry "Cubes"
 * task, section 3/4: the ONLY place a To-Do task's work duration gets
 * chosen -- live/ActiveTaskScreen.tsx's own handleStart() now redirects
 * every isTodoItem start here instead of calling performStart()
 * directly with a silently-derived default. A fixed/scheduled task's
 * own start path is completely untouched -- this screen is reached
 * ONLY for To-Do items.
 *
 * "עבודה רציפה" (continuous) reuses the EXISTING `splitMinutes` route
 * param/prop verbatim -- performStart()'s own `isTodoSplit` branch
 * already treats it as "this session's chosen duration" for ANY To-Do
 * item, so no new backend plumbing is needed for this mode at all.
 * "עבודה מחולקת" (split) is the one case that needs the NEW
 * TaskSplitProgress record (arc/taskSplitProgress.ts): the chosen plan
 * is persisted here, then ActiveTaskScreen's own performStart() reads
 * it back and starts the first segment.
 *
 * Both modes clamp their total requested minutes against
 * resolveFreeMinutesUntilNextTask -- the SAME free-time computation
 * ARC LIVE's own To-Do split suggestion and the temporary-action picker
 * already share -- so a To-Do session chosen here can never run into
 * the next already-scheduled fixed task's own time.
 */
export default function TaskDurationSelectionScreen({ taskId, suggestedMinutes = null }: { taskId: string; suggestedMinutes?: number | null }) {
  const [task, setTask] = useState<Task | null>(null);
  const [freeMinutes, setFreeMinutes] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("continuous");
  const [continuousDraft, setContinuousDraft] = useState(suggestedMinutes !== null ? String(suggestedMinutes) : "");
  const [totalDraft, setTotalDraft] = useState(suggestedMinutes !== null ? String(suggestedMinutes) : "30");
  const [partsDraft, setPartsDraft] = useState("2");
  const [breakDraft, setBreakDraft] = useState("5");

  useFocusEffect(
    useCallback(() => {
      getTask(taskId).then((loaded) => {
        setTask(loaded);
        if (!continuousDraft && loaded) setContinuousDraft(String(loaded.expectedDurationMinutes ?? 25));
      });
      resolveTodaysScheduledPlan(new Date()).then((scheduled) => {
        setFreeMinutes(resolveFreeMinutesUntilNextTask(scheduled, new Date(), taskId));
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskId])
  );

  const requestedContinuous = Number(continuousDraft);
  const clampedContinuous =
    Number.isFinite(requestedContinuous) && requestedContinuous > 0
      ? freeMinutes !== null
        ? Math.max(1, Math.min(requestedContinuous, freeMinutes))
        : requestedContinuous
      : null;

  const requestedTotal = Number(totalDraft);
  const requestedParts = Number(partsDraft);
  const requestedBreak = Number(breakDraft);
  const splitPlan =
    Number.isFinite(requestedTotal) && requestedTotal > 0 && Number.isFinite(requestedParts) && requestedParts >= 2 && Number.isFinite(requestedBreak) && requestedBreak >= 0
      ? buildSplitPlan(requestedTotal, requestedParts, requestedBreak)
      : null;
  const splitTotalMinutes = splitPlan ? sumSplitPlanMinutes(splitPlan) : null;
  const splitExceedsFree = splitTotalMinutes !== null && freeMinutes !== null && splitTotalMinutes > freeMinutes;

  async function handleStartContinuous() {
    if (!clampedContinuous) return;
    router.replace({ pathname: "/tasks/[id]", params: { id: taskId, autoStart: "1", splitMinutes: String(clampedContinuous) } });
  }

  async function handleStartSplit() {
    if (!splitPlan || splitExceedsFree) return;
    await saveTaskSplitProgress(createTaskSplitProgress(taskId, splitPlan));
    router.replace({ pathname: "/tasks/[id]", params: { id: taskId, autoStart: "1" } });
  }

  if (!task) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.hint}>טוען...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{task.title}</Text>
        <Text style={styles.subtitle}>כמה זמן מתאים לך לפעול על המשימה הזאת כרגע?</Text>
        {freeMinutes !== null && <Text style={styles.hint}>{`יש ${freeMinutes} דקות עד המשימה המתוזמנת הבאה -- הזמן יוגבל לכך.`}</Text>}

        <View style={styles.modeRow}>
          <Pressable style={[styles.modeChip, mode === "continuous" && styles.modeChipSelected]} onPress={() => setMode("continuous")}>
            <Text style={[styles.modeChipText, mode === "continuous" && styles.modeChipTextSelected]}>עבודה רציפה</Text>
          </Pressable>
          <Pressable style={[styles.modeChip, mode === "split" && styles.modeChipSelected]} onPress={() => setMode("split")}>
            <Text style={[styles.modeChipText, mode === "split" && styles.modeChipTextSelected]}>עבודה מחולקת</Text>
          </Pressable>
        </View>

        {mode === "continuous" ? (
          <View>
            <Text style={styles.fieldLabel}>משך בדקות</Text>
            <TextInput style={styles.input} value={continuousDraft} onChangeText={setContinuousDraft} keyboardType="number-pad" textAlign="right" />
            <Pressable style={[styles.startButton, !clampedContinuous && styles.startButtonDisabled]} disabled={!clampedContinuous} onPress={handleStartContinuous}>
              <Text style={styles.startButtonText}>התחל</Text>
            </Pressable>
          </View>
        ) : (
          <View>
            <Text style={styles.fieldLabel}>זמן עבודה כולל (בדקות)</Text>
            <TextInput style={styles.input} value={totalDraft} onChangeText={setTotalDraft} keyboardType="number-pad" textAlign="right" />
            <Text style={styles.fieldLabel}>מספר חלקי עבודה</Text>
            <TextInput style={styles.input} value={partsDraft} onChangeText={setPartsDraft} keyboardType="number-pad" textAlign="right" />
            <Text style={styles.fieldLabel}>משך ההפסקות בין החלקים (בדקות)</Text>
            <TextInput style={styles.input} value={breakDraft} onChangeText={setBreakDraft} keyboardType="number-pad" textAlign="right" />

            {splitPlan && (
              <View style={styles.previewBox}>
                <Text style={styles.previewTitle}>רצף העבודה וההפסקות:</Text>
                {splitPlan.map((segment, index) => (
                  <Text key={index} style={styles.previewLine}>
                    {segment.kind === "work" ? `חלק ${segment.partIndex + 1}: ${segment.durationMinutes} דק׳` : `הפסקה: ${segment.durationMinutes} דק׳`}
                  </Text>
                ))}
                {splitExceedsFree && <Text style={styles.errorText}>הזמן הכולל חורג מהזמן הפנוי עד המשימה הבאה -- יש לקצר.</Text>}
              </View>
            )}

            <Pressable style={[styles.startButton, (!splitPlan || splitExceedsFree) && styles.startButtonDisabled]} disabled={!splitPlan || splitExceedsFree} onPress={handleStartSplit}>
              <Text style={styles.startButtonText}>התחל</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right" },
  subtitle: { fontSize: 15, textAlign: "right", marginTop: 4, marginBottom: 8 },
  hint: { fontSize: 13, color: "#666", textAlign: "right", marginBottom: 12 },
  modeRow: { flexDirection: "row-reverse", gap: 8, marginBottom: 16 },
  modeChip: { backgroundColor: "#f0f0f0", paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20 },
  modeChipSelected: { backgroundColor: "#0a7ea4" },
  modeChipText: { color: "#333", fontWeight: "600" },
  modeChipTextSelected: { color: "#fff" },
  fieldLabel: { fontSize: 14, textAlign: "right", marginTop: 10, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 10, textAlign: "right" },
  previewBox: { backgroundColor: "#f5fafd", borderRadius: 10, padding: 12, marginTop: 12 },
  previewTitle: { fontWeight: "700", textAlign: "right", marginBottom: 4 },
  previewLine: { textAlign: "right", color: "#333" },
  errorText: { color: "#c0392b", textAlign: "right", marginTop: 6 },
  startButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 20 },
  startButtonDisabled: { opacity: 0.5 },
  startButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
