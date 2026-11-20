import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";

import {
  ROUTINE_BREAK_KIND_LABELS,
  ROUTINE_PERIOD_LABELS,
  addTaskToTemplate,
  computeOneOffInsertionTime,
  generateDailyRoutineSchedule,
  generatePeriodSchedule,
  generateRoutineTaskTemplateId,
  moveTaskBetweenPeriods,
  removeTaskFromTemplate,
  setBreakAfterTask,
  updateTaskInTemplate,
  type DailyRoutineTemplate,
} from "../arc/dailyRoutine.ts";
import { archiveTask, ROUTINE_PERIOD_IDS, type RoutineBreakKind, type RoutineBreakTemplate, type RoutinePeriodId, type Task } from "../arc/tasks.ts";
import { loadPlannedArcs, loadTasks, upsertTask } from "../data/storage.ts";
import { addOneTimeRoutineTask, loadDailyRoutineTemplate, materializeDailyRoutineTemplate, saveDailyRoutineTemplate } from "../data/dailyRoutine.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";
import type { PlannedArc } from "../arc/plannedArc.ts";

const BREAK_KIND_OPTIONS: RoutineBreakKind[] = ["regular", "mindful", "arc"];

/**
 * build/RoutineTaskEditorScreen.tsx (route /routine-plan/task)
 *
 * Automatic Routine Builder, requirement 3: add/edit a single routine
 * task. Three distinct entities this one screen handles -- never a
 * fourth parallel data shape:
 *  - ADD, as a RECURRING template task (RoutineTaskTemplate) -- becomes
 *    part of the daily routine going forward.
 *  - ADD, as a ONE-TIME task for today only -- never written into the
 *    template (data/dailyRoutine.ts's addOneTimeRoutineTask).
 *  - EDIT an existing template task (templateTaskId param) or an
 *    existing one-time task (oneTimeTaskId param) -- rename, change
 *    duration, move between periods, convert its break, or delete.
 */
export default function RoutineTaskEditorScreen() {
  const params = useLocalSearchParams<{ periodId?: string; templateTaskId?: string; oneTimeTaskId?: string }>();
  const [template, setTemplate] = useState<DailyRoutineTemplate | null>(null);
  const [oneTimeTask, setOneTimeTask] = useState<Task | null>(null);
  const [plannedArcs, setPlannedArcs] = useState<PlannedArc[]>([]);
  const [loaded, setLoaded] = useState(false);

  const isEditingTemplate = !!params.templateTaskId;
  const isEditingOneTime = !!params.oneTimeTaskId;
  const isAdding = !isEditingTemplate && !isEditingOneTime;

  const [periodId, setPeriodId] = useState<RoutinePeriodId>((params.periodId as RoutinePeriodId) ?? "morning");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState("20");
  const [recurring, setRecurring] = useState(true);
  const [position, setPosition] = useState(0);
  const [breakKind, setBreakKind] = useState<RoutineBreakKind | null>(null);
  const [breakDuration, setBreakDuration] = useState("5");
  const [breakPlannedArcId, setBreakPlannedArcId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadDailyRoutineTemplate(), loadPlannedArcs(), isEditingOneTime ? loadTasks() : Promise.resolve<Task[]>([])]).then(([loadedTemplate, arcs, tasks]) => {
      setTemplate(loadedTemplate);
      setPlannedArcs(arcs);
      if (isEditingTemplate && loadedTemplate) {
        const existing = loadedTemplate.periods[periodId].tasks.find((t) => t.id === params.templateTaskId);
        if (existing) {
          setTitle(existing.title);
          setDuration(String(existing.durationMinutes));
          setBreakKind(existing.breakAfter?.kind ?? null);
          setBreakDuration(String(existing.breakAfter?.durationMinutes ?? 5));
          setBreakPlannedArcId(existing.breakAfter?.plannedArcId ?? null);
        }
      }
      if (isEditingOneTime) {
        const existing = tasks.find((t) => t.id === params.oneTimeTaskId);
        if (existing) {
          setOneTimeTask(existing);
          setTitle(existing.title);
          setDuration(String(existing.expectedDurationMinutes ?? 20));
          setBreakKind(existing.breakAfter?.kind ?? null);
          setBreakDuration(String(existing.breakAfter?.durationMinutes ?? 5));
          setBreakPlannedArcId(existing.breakAfter?.plannedArcId ?? null);
        }
      }
      setLoaded(true);
    });
  }, []);

  if (!loaded || !template) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const period = template.periods[periodId];
  const generatedPeriod = generatePeriodSchedule(period);
  const breakAfter: RoutineBreakTemplate | null = breakKind ? { kind: breakKind, durationMinutes: Number(breakDuration) || 5, plannedArcId: breakKind === "arc" ? breakPlannedArcId : null } : null;

  async function handleSave() {
    if (!template) return;
    const now = new Date();
    const nowIso = now.toISOString();
    const durationMinutes = Number(duration);
    if (!title.trim() || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return;

    if (isEditingOneTime && oneTimeTask) {
      await upsertTask({ ...oneTimeTask, title: title.trim(), expectedDurationMinutes: durationMinutes, breakAfter, updatedAt: nowIso });
      router.back();
      return;
    }

    if (isEditingTemplate && params.templateTaskId) {
      const sourcePeriodId = (params.periodId as RoutinePeriodId) ?? periodId;
      let next = template;
      if (sourcePeriodId !== periodId) {
        next = moveTaskBetweenPeriods(next, sourcePeriodId, periodId, params.templateTaskId, next.periods[periodId].tasks.length, nowIso);
      }
      next = updateTaskInTemplate(next, periodId, params.templateTaskId, { title: title.trim(), durationMinutes }, nowIso);
      next = setBreakAfterTask(next, periodId, params.templateTaskId, breakAfter, nowIso);
      await saveDailyRoutineTemplate(next);
      await materializeDailyRoutineTemplate(next, now);
      router.back();
      return;
    }

    // Adding.
    if (recurring) {
      let next = addTaskToTemplate(template, periodId, position, { id: generateRoutineTaskTemplateId(), title: title.trim(), durationMinutes, breakAfter }, nowIso);
      await saveDailyRoutineTemplate(next);
      await materializeDailyRoutineTemplate(next, now);
    } else {
      const scheduledTime = computeOneOffInsertionTime(generatedPeriod, period.startTime, position);
      await addOneTimeRoutineTask(periodId, title.trim(), durationMinutes, scheduledTime, todayLocalDateString(now), breakAfter, now);
    }
    router.back();
  }

  async function handleDelete() {
    if (!template) return;
    const now = new Date();
    if (isEditingOneTime && oneTimeTask) {
      await upsertTask(archiveTask(oneTimeTask, now.toISOString()));
      router.back();
      return;
    }
    if (isEditingTemplate && params.templateTaskId) {
      const next = removeTaskFromTemplate(template, (params.periodId as RoutinePeriodId) ?? periodId, params.templateTaskId, now.toISOString());
      await saveDailyRoutineTemplate(next);
      await materializeDailyRoutineTemplate(next, now);
      router.back();
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{isAdding ? "הוספת משימה" : "עריכת משימה"}</Text>

        <Text style={styles.label}>שם המשימה</Text>
        <TextInput style={styles.textInput} value={title} onChangeText={setTitle} textAlign="right" />

        <Text style={styles.label}>משך (דקות)</Text>
        <TextInput style={styles.textInput} value={duration} onChangeText={setDuration} keyboardType="number-pad" textAlign="center" />

        <Text style={styles.label}>פרק</Text>
        <View style={styles.chipRow}>
          {ROUTINE_PERIOD_IDS.map((id) => (
            <Pressable key={id} style={[styles.chip, periodId === id && styles.chipSelected]} onPress={() => setPeriodId(id)}>
              <Text style={[styles.chipText, periodId === id && styles.chipTextSelected]}>{ROUTINE_PERIOD_LABELS[id]}</Text>
            </Pressable>
          ))}
        </View>

        {isAdding && (
          <>
            <Text style={styles.label}>מיקום בפרק</Text>
            <View style={styles.chipRow}>
              <Pressable style={[styles.chip, position === 0 && styles.chipSelected]} onPress={() => setPosition(0)}>
                <Text style={[styles.chipText, position === 0 && styles.chipTextSelected]}>בתחילת הפרק</Text>
              </Pressable>
              {generatedPeriod.slots.map((slot, index) => (
                <Pressable key={slot.taskTemplateId} style={[styles.chip, position === index + 1 && styles.chipSelected]} onPress={() => setPosition(index + 1)}>
                  <Text style={[styles.chipText, position === index + 1 && styles.chipTextSelected]}>{`אחרי: ${slot.title}`}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>סוג המשימה</Text>
            <View style={styles.chipRow}>
              <Pressable style={[styles.chip, recurring && styles.chipSelected]} onPress={() => setRecurring(true)}>
                <Text style={[styles.chipText, recurring && styles.chipTextSelected]}>קבוע (כל יום)</Text>
              </Pressable>
              <Pressable style={[styles.chip, !recurring && styles.chipSelected]} onPress={() => setRecurring(false)}>
                <Text style={[styles.chipText, !recurring && styles.chipTextSelected]}>היום בלבד</Text>
              </Pressable>
            </View>
          </>
        )}

        <Text style={styles.label}>הפסקה אחרי המשימה</Text>
        <View style={styles.chipRow}>
          <Pressable style={[styles.chip, breakKind === null && styles.chipSelected]} onPress={() => setBreakKind(null)}>
            <Text style={[styles.chipText, breakKind === null && styles.chipTextSelected]}>ללא הפסקה</Text>
          </Pressable>
          {BREAK_KIND_OPTIONS.map((kind) => (
            <Pressable key={kind} style={[styles.chip, breakKind === kind && styles.chipSelected]} onPress={() => setBreakKind(kind)}>
              <Text style={[styles.chipText, breakKind === kind && styles.chipTextSelected]}>{ROUTINE_BREAK_KIND_LABELS[kind]}</Text>
            </Pressable>
          ))}
        </View>

        {breakKind && (
          <>
            <Text style={styles.label}>משך ההפסקה (דקות)</Text>
            <TextInput style={styles.textInput} value={breakDuration} onChangeText={setBreakDuration} keyboardType="number-pad" textAlign="center" />
          </>
        )}

        {breakKind === "arc" && (
          <>
            <Text style={styles.label}>תרגיל ARC ספציפי (אופציונלי)</Text>
            <View style={styles.chipRow}>
              <Pressable style={[styles.chip, breakPlannedArcId === null && styles.chipSelected]} onPress={() => setBreakPlannedArcId(null)}>
                <Text style={[styles.chipText, breakPlannedArcId === null && styles.chipTextSelected]}>בחירה בזמן ההפסקה</Text>
              </Pressable>
              {plannedArcs.map((arcItem) => (
                <Pressable key={arcItem.id} style={[styles.chip, breakPlannedArcId === arcItem.id && styles.chipSelected]} onPress={() => setBreakPlannedArcId(arcItem.id)}>
                  <Text style={[styles.chipText, breakPlannedArcId === arcItem.id && styles.chipTextSelected]}>{arcItem.name}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <Pressable style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>שמירה</Text>
        </Pressable>

        {!isAdding && (
          <Pressable style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>מחיקת משימה</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  label: { fontSize: 14, color: "#666", textAlign: "right", marginTop: 12, marginBottom: 6 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 15 },
  chipRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#ccc", borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipSelected: { backgroundColor: "#0a7ea4", borderColor: "#0a7ea4" },
  chipText: { fontSize: 13, color: "#333" },
  chipTextSelected: { color: "#fff", fontWeight: "600" },
  saveButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 24 },
  saveButtonText: { color: "#fff", fontWeight: "700", fontSize: 17 },
  deleteButton: { paddingVertical: 14, alignItems: "center", marginTop: 12 },
  deleteButtonText: { color: "#c0392b", fontWeight: "600", fontSize: 15 },
});
