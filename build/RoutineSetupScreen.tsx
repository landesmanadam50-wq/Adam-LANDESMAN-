import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import {
  ROUTINE_BREAK_KIND_LABELS,
  ROUTINE_MODE_LABELS,
  ROUTINE_PERIOD_LABELS,
  addTaskToTemplate,
  createEmptyDailyRoutineTemplate,
  generateDailyRoutineSchedule,
  generateRoutineTaskTemplateId,
  removeTaskFromTemplate,
  setBreakAfterTask,
  setPeriodRoutineMode,
  updatePeriodTimes,
  updateTaskInTemplate,
  type DailyRoutineTemplate,
  type GeneratedPeriodSchedule,
  type RoutineMode,
} from "../arc/dailyRoutine.ts";
import { ROUTINE_PERIOD_IDS, type RoutineBreakKind, type RoutinePeriodId } from "../arc/tasks.ts";
import { loadDailyRoutineTemplate, materializeDailyRoutineTemplate, saveDailyRoutineTemplate } from "../data/dailyRoutine.ts";

const BREAK_KIND_CYCLE: (RoutineBreakKind | null)[] = [null, "regular", "mindful", "arc"];
const ROUTINE_MODES: RoutineMode[] = ["spaced", "continuous"];

/**
 * build/RoutineSetupScreen.tsx
 *
 * Automatic Routine Builder, requirement 1: the first-time setup
 * wizard that lets the trainee define their four daily periods
 * (morning/noon/afternoon/evening) -- each with its own start/end time
 * and an ordered list of tasks (with duration + optional break after).
 * Pressing "בניית התכנית שלי" persists the template and materializes
 * it into real Tasks (data/dailyRoutine.ts), then returns to the main
 * schedule (app/index.tsx re-renders build/DailyScheduleScreen.tsx once
 * a template exists).
 *
 * Also doubles as the FULL routine editor reachable later (route
 * /routine-plan/setup) -- same component, pre-filled from the existing
 * template when one is already saved, so there is only ever one
 * "edit the whole routine" UI, never two.
 *
 * Time inputs use the draft+onBlur-commit pattern (never commit on
 * every keystroke) -- same discipline build/PlannedArcEditorScreen.tsx
 * already established, since a partial "20:" string reads as a
 * structurally-valid 20:00 mid-type.
 */
export default function RoutineSetupScreen() {
  const [template, setTemplate] = useState<DailyRoutineTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadDailyRoutineTemplate().then((existing) => {
      setTemplate(existing ?? createEmptyDailyRoutineTemplate(new Date().toISOString()));
    });
  }, []);

  if (!template) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const generated = generateDailyRoutineSchedule(template);

  async function handleBuild() {
    setSaving(true);
    try {
      await saveDailyRoutineTemplate(template!);
      await materializeDailyRoutineTemplate(template!, new Date());
      router.replace("/");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>בניית התכנית היומית שלי</Text>
        <Text style={styles.hint}>
          הגדירו את ארבעת פרקי היום, המשימות שבכל פרק ומשך הזמן שלהן. ניתן לשנות את התכנית הזו בכל עת.
        </Text>

        {ROUTINE_PERIOD_IDS.map((periodId) => (
          <PeriodEditor
            key={periodId}
            periodId={periodId}
            template={template}
            generated={generated.periods.find((p) => p.periodId === periodId)!}
            onChange={setTemplate}
          />
        ))}

        <Pressable style={styles.buildButton} onPress={handleBuild} disabled={saving}>
          <Text style={styles.buildButtonText}>{saving ? "בונה תכנית..." : "בניית התכנית שלי"}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function PeriodEditor({
  periodId,
  template,
  generated,
  onChange,
}: {
  periodId: RoutinePeriodId;
  template: DailyRoutineTemplate;
  generated: GeneratedPeriodSchedule;
  onChange: (next: DailyRoutineTemplate) => void;
}) {
  const period = template.periods[periodId];
  const [startDraft, setStartDraft] = useState<string | null>(null);
  const [endDraft, setEndDraft] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDuration, setNewDuration] = useState("20");
  const now = new Date().toISOString();

  function commitTimes(nextStart: string, nextEnd: string) {
    onChange(updatePeriodTimes(template, periodId, nextStart, nextEnd, now));
  }

  function addTask() {
    const duration = Number(newDuration);
    if (!newTitle.trim() || !Number.isFinite(duration) || duration <= 0) return;
    onChange(addTaskToTemplate(template, periodId, period.tasks.length, { id: generateRoutineTaskTemplateId(), title: newTitle.trim(), durationMinutes: duration, breakAfter: null }, now));
    setNewTitle("");
    setNewDuration("20");
  }

  function cycleBreak(taskId: string, current: typeof period.tasks[number]["breakAfter"]) {
    const currentIndex = BREAK_KIND_CYCLE.indexOf(current?.kind ?? null);
    const nextKind = BREAK_KIND_CYCLE[(currentIndex + 1) % BREAK_KIND_CYCLE.length];
    const nextBreak = nextKind === null ? null : { kind: nextKind, durationMinutes: current?.durationMinutes ?? 5, plannedArcId: current?.kind === "arc" ? current.plannedArcId : null };
    onChange(setBreakAfterTask(template, periodId, taskId, nextBreak, now));
  }

  function setBreakDuration(taskId: string, current: NonNullable<typeof period.tasks[number]["breakAfter"]>, durationMinutes: number) {
    onChange(setBreakAfterTask(template, periodId, taskId, { ...current, durationMinutes }, now));
  }

  return (
    <View style={styles.periodBlock}>
      <Text style={styles.periodTitle}>{ROUTINE_PERIOD_LABELS[periodId]}</Text>
      <View style={styles.timeRow}>
        <TextInput
          style={styles.timeInput}
          value={startDraft ?? period.startTime}
          onChangeText={setStartDraft}
          onBlur={() => {
            if (startDraft === null) return;
            const value = startDraft;
            setStartDraft(null);
            commitTimes(value, period.endTime);
          }}
          placeholder="07:00"
          textAlign="center"
        />
        <Text style={styles.timeSeparator}>–</Text>
        <TextInput
          style={styles.timeInput}
          value={endDraft ?? period.endTime}
          onChangeText={setEndDraft}
          onBlur={() => {
            if (endDraft === null) return;
            const value = endDraft;
            setEndDraft(null);
            commitTimes(period.startTime, value);
          }}
          placeholder="12:00"
          textAlign="center"
        />
      </View>

      <View style={styles.modeRow}>
        {ROUTINE_MODES.map((mode) => (
          <Pressable
            key={mode}
            style={[styles.modeChip, period.routineMode === mode && styles.modeChipSelected]}
            onPress={() => onChange(setPeriodRoutineMode(template, periodId, mode, now))}
          >
            <Text style={[styles.modeChipText, period.routineMode === mode && styles.modeChipTextSelected]}>{ROUTINE_MODE_LABELS[mode]}</Text>
          </Pressable>
        ))}
      </View>

      {generated.conflict && (
        <Text style={styles.conflictText}>
          ⚠ אין מספיק זמן בפרק זה: נדרשות {generated.conflict.neededMinutes} דקות, זמינות {generated.conflict.availableMinutes} דקות (חריגה של {generated.conflict.overflowMinutes} דקות). ניתן לקצר משימות/הפסקות, להאריך את הפרק, או להסיר משימה.
        </Text>
      )}

      {period.tasks.map((task, index) => {
        const slot = generated.slots[index];
        return (
          <View key={task.id} style={styles.taskRow}>
            <View style={styles.taskRowHeader}>
              <Pressable onPress={() => onChange(removeTaskFromTemplate(template, periodId, task.id, now))}>
                <Text style={styles.removeText}>הסרה</Text>
              </Pressable>
              <Text style={styles.taskRowTime}>{slot?.startTime ?? ""}</Text>
            </View>
            <TextInput
              style={styles.textInput}
              value={task.title}
              onChangeText={(value) => onChange(updateTaskInTemplate(template, periodId, task.id, { title: value }, now))}
              textAlign="right"
            />
            <View style={styles.durationRow}>
              <Text style={styles.durationLabel}>משך (דק&apos;):</Text>
              <TextInput
                style={styles.durationInput}
                value={String(task.durationMinutes)}
                onChangeText={(value) => {
                  const duration = Number(value);
                  if (Number.isFinite(duration)) onChange(updateTaskInTemplate(template, periodId, task.id, { durationMinutes: duration }, now));
                }}
                keyboardType="number-pad"
                textAlign="center"
              />
            </View>
            <Pressable style={styles.breakToggle} onPress={() => cycleBreak(task.id, task.breakAfter)}>
              <Text style={styles.breakToggleText}>
                {task.breakAfter ? `הפסקה אחרי: ${ROUTINE_BREAK_KIND_LABELS[task.breakAfter.kind]} (${task.breakAfter.durationMinutes} דק')` : "ללא הפסקה אחרי משימה זו (הקשה להוספה)"}
              </Text>
            </Pressable>
            {task.breakAfter && (
              <View style={styles.durationRow}>
                <Text style={styles.durationLabel}>משך ההפסקה (דק&apos;):</Text>
                <TextInput
                  style={styles.durationInput}
                  value={String(task.breakAfter.durationMinutes)}
                  onChangeText={(value) => {
                    const duration = Number(value);
                    if (Number.isFinite(duration) && task.breakAfter) setBreakDuration(task.id, task.breakAfter, duration);
                  }}
                  keyboardType="number-pad"
                  textAlign="center"
                />
              </View>
            )}
          </View>
        );
      })}

      <View style={styles.addTaskRow}>
        <TextInput style={[styles.textInput, styles.flexInput]} value={newTitle} onChangeText={setNewTitle} placeholder="שם משימה חדשה" textAlign="right" />
        <TextInput style={styles.durationInput} value={newDuration} onChangeText={setNewDuration} keyboardType="number-pad" textAlign="center" />
        <Pressable style={styles.addButton} onPress={addTask}>
          <Text style={styles.addButtonText}>הוספה</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  hint: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 20 },
  periodBlock: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, marginBottom: 16 },
  periodTitle: { fontSize: 17, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  timeRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 8 },
  timeInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 8, width: 72, fontSize: 15 },
  timeSeparator: { fontSize: 15, color: "#666" },
  modeRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  modeChip: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10 },
  modeChipSelected: { backgroundColor: "#0a7ea4" },
  modeChipText: { color: "#0a7ea4", fontSize: 12, fontWeight: "600" },
  modeChipTextSelected: { color: "#fff" },
  conflictText: { color: "#b35900", fontSize: 13, textAlign: "right", marginBottom: 8 },
  taskRow: { borderWidth: 1, borderColor: "#eee", borderRadius: 8, padding: 10, marginBottom: 8, backgroundColor: "#fafafa" },
  taskRowHeader: { flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 4 },
  taskRowTime: { fontSize: 13, color: "#0a7ea4", fontWeight: "600" },
  removeText: { color: "#c0392b", fontSize: 13 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 8, fontSize: 15, marginBottom: 6 },
  flexInput: { flex: 1 },
  durationRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 6 },
  durationLabel: { fontSize: 13, color: "#666" },
  durationInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 8, width: 56, fontSize: 15 },
  breakToggle: { paddingVertical: 4 },
  breakToggleText: { fontSize: 13, color: "#0a7ea4", textAlign: "right" },
  addTaskRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 4 },
  addButton: { backgroundColor: "#0a7ea4", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  addButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  buildButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 8 },
  buildButtonText: { color: "#fff", fontWeight: "700", fontSize: 17 },
});
