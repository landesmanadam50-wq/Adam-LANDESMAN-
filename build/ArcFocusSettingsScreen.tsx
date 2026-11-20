import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import {
  ARC_FOCUS_DURATION_PRESET_MINUTES,
  ARC_FOCUS_TAP_RHYTHM_PRESET_SECONDS,
  isValidArcFocusDurationMinutes,
  validateArcFocusSettings,
} from "../arc/arcFocusSettings.ts";
import type { ArcFocusSettings } from "../arc/arcFocusSettings.ts";
import { createArcFocusSession, generateArcFocusPracticeId } from "../arc/arcFocusSession.ts";
import { buildTaskFromDraft, createEmptyTaskDraft, emptyTaskBase, validateTaskDraft } from "../arc/taskDraft.ts";
import { generateTaskId } from "../arc/tasks.ts";
import type { Task } from "../arc/tasks.ts";
import { STANDALONE_ARC_TASK_ID } from "../arc/newArcLiveTypes.ts";
import { getTask, loadArcFocusSettings, saveArcFocusSession, saveArcFocusSettings, upsertTask } from "../data/storage.ts";
import { reconcileTaskAlarms } from "../data/taskAlarm.ts";
import MonthlyCalendar from "../live/components/MonthlyCalendar.tsx";
import { todayLocalDateString } from "../program/dateUtils.ts";

const RECURRENCE_DAY_LABELS = ["יום א׳", "יום ב׳", "יום ג׳", "יום ד׳", "יום ה׳", "יום ו׳", "שבת"];

/**
 * build/ArcFocusSettingsScreen.tsx (route /arc-gym/arc-focus)
 *
 * ARC Focus task: duration/tap-rhythm/tap-cue/attention-check settings,
 * plus "start now" (standalone, no Task -- same convention as every
 * other ARC GYM exercise's quick practice) vs "schedule" (a real
 * `Task`, `taskKind: "arcFocus"`, created with the exact SAME
 * creation recipe build/FlexibleDailyScreen.tsx's own handleAddDirect
 * already uses -- buildTaskFromDraft + upsertTask + reconcileTaskAlarms
 * -- never a second task-creation mechanism, never a second
 * calendar/record of its own). Once scheduled, this task appears in the
 * existing weekly/flexible-daily views automatically (arc/dailyPlan.ts's
 * resolveDailyPlan is taskKind-agnostic) and is edited/postponed/removed/
 * recurrence-changed through the SAME existing task editor/override
 * mechanism every other task already uses -- this screen only ever owns
 * the exercise's OWN settings (not generic Task fields).
 *
 * `taskId` (optional, from live/ActiveTaskScreen.tsx's own "הגדרות ARC
 * Focus" link): when set, this is an EXISTING scheduled task's own
 * settings being re-opened for editing -- the scheduling fields below
 * are hidden (date/time/recurrence already live on the task and are
 * edited through its own ordinary edit screen) and saving only updates
 * this task's per-task ArcFocusSettings, never creates a second task.
 */
export default function ArcFocusSettingsScreen({ taskId = null }: { taskId?: string | null }) {
  const isEditingExisting = taskId !== null;
  const [loaded, setLoaded] = useState(false);
  const [existingTask, setExistingTask] = useState<Task | null>(null);

  const [durationMinutes, setDurationMinutes] = useState(5);
  const [useCustomDuration, setUseCustomDuration] = useState(false);
  const [customDurationText, setCustomDurationText] = useState("5");
  const [tapRhythmSeconds, setTapRhythmSeconds] = useState(2);
  const [showTapCue, setShowTapCue] = useState(true);
  const [attentionChecksEnabled, setAttentionChecksEnabled] = useState(true);

  const [startMode, setStartMode] = useState<"now" | "schedule">("now");
  const [recurrenceKind, setRecurrenceKind] = useState<"once" | "recurring">("once");
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [scheduledDate, setScheduledDate] = useState(todayLocalDateString());
  const [hourText, setHourText] = useState("9");
  const [minuteText, setMinuteText] = useState("0");
  const [showCalendar, setShowCalendar] = useState(false);

  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadArcFocusSettings(taskId), taskId ? getTask(taskId) : Promise.resolve(null)]).then(([settings, task]) => {
        setDurationMinutes(settings.durationMinutes);
        setUseCustomDuration(!ARC_FOCUS_DURATION_PRESET_MINUTES.includes(settings.durationMinutes));
        setCustomDurationText(String(settings.durationMinutes));
        setTapRhythmSeconds(settings.tapRhythmSeconds);
        setShowTapCue(settings.showTapCue);
        setAttentionChecksEnabled(settings.attentionChecksEnabled);
        setExistingTask(task);
        setLoaded(true);
      });
    }, [taskId])
  );

  function toggleDay(day: number) {
    setRecurrenceDays((current) => (current.includes(day) ? current.filter((candidate) => candidate !== day) : [...current, day].sort()));
  }

  function resolveSettings(): ArcFocusSettings {
    return {
      durationMinutes: useCustomDuration ? Number(customDurationText.trim()) : durationMinutes,
      tapRhythmSeconds,
      showTapCue,
      attentionChecksEnabled,
    };
  }

  async function handleSaveExistingTaskSettings() {
    const settings = resolveSettings();
    const validationErrors = validateArcFocusSettings(settings);
    setErrors(validationErrors);
    if (validationErrors.length > 0 || !taskId) return;
    setBusy(true);
    try {
      await saveArcFocusSettings(settings, taskId);
      router.back();
    } finally {
      setBusy(false);
    }
  }

  async function handleStartNow() {
    const settings = resolveSettings();
    const validationErrors = validateArcFocusSettings(settings);
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;
    setBusy(true);
    try {
      await saveArcFocusSettings(settings);
      const now = new Date().toISOString();
      const practiceId = generateArcFocusPracticeId();
      await saveArcFocusSession(createArcFocusSession(practiceId, null, settings, now));
      router.push({ pathname: "/tasks/[id]/arc-focus/check-in", params: { id: STANDALONE_ARC_TASK_ID, arcFocusPracticeId: practiceId } });
    } finally {
      setBusy(false);
    }
  }

  async function handleSchedule() {
    const settings = resolveSettings();
    const validationErrors = validateArcFocusSettings(settings);
    if (recurrenceKind === "recurring" && recurrenceDays.length === 0) validationErrors.push("משימה חזרתית חייבת לפחות יום אחד בשבוע.");
    const hour = Number(hourText);
    const minute = Number(minuteText);
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) validationErrors.push("יש להזין שעה תקינה (0-23).");
    if (!Number.isFinite(minute) || minute < 0 || minute > 59) validationErrors.push("יש להזין דקה תקינה (0-59).");
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;

    setBusy(true);
    try {
      const now = new Date().toISOString();
      const newTaskId = generateTaskId();
      const scheduledTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      const draft = {
        ...createEmptyTaskDraft(),
        title: "תרגול ARC Focus",
        firstAction: "להתחיל בתרגול ההקשבה",
        taskKind: "arcFocus" as const,
        recurrenceKind,
        recurrenceDays,
        scheduledDate: recurrenceKind === "once" ? scheduledDate : "",
        scheduledTime,
      };
      const draftErrors = validateTaskDraft(draft);
      if (draftErrors.length > 0) {
        setErrors(draftErrors);
        return;
      }
      const task = buildTaskFromDraft(draft, emptyTaskBase(newTaskId, now), now);
      await upsertTask(task);
      await reconcileTaskAlarms();
      await saveArcFocusSettings(settings, newTaskId);
      router.back();
    } finally {
      setBusy(false);
    }
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>🎯 ARC Focus</Text>
        <Text style={styles.subtitle}>תרגיל קשב מתמשך -- נקודת מיקוד, הקשות קצביות ובדיקות תשומת לב.</Text>

        {errors.map((error) => (
          <Text key={error} style={styles.errorText}>
            {error}
          </Text>
        ))}

        <Text style={styles.fieldLabel}>משך התרגול הכולל</Text>
        <View style={styles.chipRow}>
          {ARC_FOCUS_DURATION_PRESET_MINUTES.map((minutes) => (
            <Pressable
              key={minutes}
              style={[styles.chip, !useCustomDuration && durationMinutes === minutes && styles.chipSelected]}
              onPress={() => {
                setUseCustomDuration(false);
                setDurationMinutes(minutes);
              }}
            >
              <Text style={[styles.chipText, !useCustomDuration && durationMinutes === minutes && styles.chipTextSelected]}>{`${minutes} דק'`}</Text>
            </Pressable>
          ))}
          <Pressable style={[styles.chip, useCustomDuration && styles.chipSelected]} onPress={() => setUseCustomDuration(true)}>
            <Text style={[styles.chipText, useCustomDuration && styles.chipTextSelected]}>מותאם אישית</Text>
          </Pressable>
        </View>
        {useCustomDuration && (
          <TextInput style={styles.textInput} value={customDurationText} onChangeText={setCustomDurationText} keyboardType="number-pad" textAlign="center" placeholder="דקות" />
        )}

        <Text style={styles.fieldLabel}>קצב הקשות</Text>
        <View style={styles.chipRow}>
          {ARC_FOCUS_TAP_RHYTHM_PRESET_SECONDS.map((seconds) => (
            <Pressable key={seconds} style={[styles.chip, tapRhythmSeconds === seconds && styles.chipSelected]} onPress={() => setTapRhythmSeconds(seconds)}>
              <Text style={[styles.chipText, tapRhythmSeconds === seconds && styles.chipTextSelected]}>{`כל ${seconds} שנ'`}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>הצגת רמז חזותי להקשה</Text>
          <Switch value={showTapCue} onValueChange={setShowTapCue} />
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>בדיקות תשומת לב אקראיות</Text>
          <Switch value={attentionChecksEnabled} onValueChange={setAttentionChecksEnabled} />
        </View>

        {isEditingExisting ? (
          <>
            <Text style={styles.fieldLabel}>תזמון</Text>
            <Text style={styles.hint}>
              {existingTask?.recurrence.kind === "recurring" ? "משימה חזרתית" : existingTask?.scheduledDate ? `תאריך: ${existingTask.scheduledDate}` : "ללא תאריך קבוע"}
              {existingTask?.scheduledTime ? ` / שעה: ${existingTask.scheduledTime}` : ""}
            </Text>
            <Pressable style={styles.calendarLinkButton} onPress={() => taskId && router.push({ pathname: "/tasks/[id]/edit", params: { id: taskId } })}>
              <Text style={styles.calendarLinkButtonText}>שינוי תאריך/שעה/חזרתיות במשימה</Text>
            </Pressable>
            <Pressable style={[styles.primaryButton, busy && styles.disabledButton]} onPress={handleSaveExistingTaskSettings} disabled={busy}>
              <Text style={styles.primaryButtonText}>שמירת הגדרות</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.fieldLabel}>מועד התרגול</Text>
            <View style={styles.chipRow}>
              <Pressable style={[styles.chip, startMode === "now" && styles.chipSelected]} onPress={() => setStartMode("now")}>
                <Text style={[styles.chipText, startMode === "now" && styles.chipTextSelected]}>התחלה מיידית</Text>
              </Pressable>
              <Pressable style={[styles.chip, startMode === "schedule" && styles.chipSelected]} onPress={() => setStartMode("schedule")}>
                <Text style={[styles.chipText, startMode === "schedule" && styles.chipTextSelected]}>תזמון</Text>
              </Pressable>
            </View>

            {startMode === "schedule" && (
              <>
                <Text style={styles.fieldLabel}>חזרתיות</Text>
                <View style={styles.chipRow}>
                  <Pressable style={[styles.chip, recurrenceKind === "once" && styles.chipSelected]} onPress={() => setRecurrenceKind("once")}>
                    <Text style={[styles.chipText, recurrenceKind === "once" && styles.chipTextSelected]}>חד-פעמית</Text>
                  </Pressable>
                  <Pressable style={[styles.chip, recurrenceKind === "recurring" && styles.chipSelected]} onPress={() => setRecurrenceKind("recurring")}>
                    <Text style={[styles.chipText, recurrenceKind === "recurring" && styles.chipTextSelected]}>חזרתית</Text>
                  </Pressable>
                </View>

                {recurrenceKind === "recurring" ? (
                  <View style={styles.chipRow}>
                    {RECURRENCE_DAY_LABELS.map((label, dayOfWeek) => (
                      <Pressable key={dayOfWeek} style={[styles.chip, recurrenceDays.includes(dayOfWeek) && styles.chipSelected]} onPress={() => toggleDay(dayOfWeek)}>
                        <Text style={[styles.chipText, recurrenceDays.includes(dayOfWeek) && styles.chipTextSelected]}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Pressable style={styles.calendarLinkButton} onPress={() => setShowCalendar(true)}>
                    <Text style={styles.calendarLinkButtonText}>{`תאריך: ${scheduledDate}`}</Text>
                  </Pressable>
                )}

                <View style={styles.row}>
                  <View style={styles.timeField}>
                    <Text style={styles.fieldLabel}>שעה</Text>
                    <TextInput style={styles.textInput} value={hourText} onChangeText={setHourText} keyboardType="number-pad" textAlign="center" />
                  </View>
                  <View style={styles.timeField}>
                    <Text style={styles.fieldLabel}>דקה</Text>
                    <TextInput style={styles.textInput} value={minuteText} onChangeText={setMinuteText} keyboardType="number-pad" textAlign="center" />
                  </View>
                </View>
              </>
            )}

            <Pressable
              style={[styles.primaryButton, busy && styles.disabledButton]}
              onPress={startMode === "now" ? handleStartNow : handleSchedule}
              disabled={busy}
            >
              <Text style={styles.primaryButtonText}>{startMode === "now" ? "התחלת התרגול" : "תזמון התרגול"}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <Modal visible={showCalendar} transparent animationType="fade" onRequestClose={() => setShowCalendar(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <MonthlyCalendar selectedDate={scheduledDate} onSelectDate={setScheduledDate} onConfirm={() => setShowCalendar(false)} onCancel={() => setShowCalendar(false)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20, gap: 4 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 6 },
  subtitle: { fontSize: 14, color: "#666", textAlign: "right", marginBottom: 16 },
  errorText: { color: "#b00020", textAlign: "right", fontSize: 14, marginBottom: 4 },
  fieldLabel: { fontSize: 14, fontWeight: "600", textAlign: "right", marginBottom: 6, color: "#444", marginTop: 14 },
  row: { flexDirection: "row-reverse", gap: 12 },
  timeField: { flex: 1 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, marginTop: 6 },
  chipRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  chip: { borderWidth: 1, borderColor: "#ccc", borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipSelected: { backgroundColor: "#0a7ea4", borderColor: "#0a7ea4" },
  chipText: { fontSize: 13, color: "#333" },
  chipTextSelected: { color: "#fff", fontWeight: "600" },
  switchRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginTop: 14 },
  switchLabel: { fontSize: 14, color: "#333", textAlign: "right" },
  calendarLinkButton: { alignSelf: "flex-end", marginTop: 6 },
  calendarLinkButtonText: { color: "#0a7ea4", fontSize: 14, textDecorationLine: "underline" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 20 },
  disabledButton: { opacity: 0.6 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  modalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 20, width: "100%" },
});
