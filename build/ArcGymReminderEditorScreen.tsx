import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { createArcGymReminder, generateArcGymReminderId, updateArcGymReminder } from "../arc/arcGym.ts";
import type { ArcGymReminder, ArcGymReminderExerciseKind } from "../arc/arcGym.ts";
import { reconcileArcGymReminderNotification } from "../data/arcGymReminders.ts";
import { deleteArcGymReminderEntry, loadArcGymReminders, upsertArcGymReminderEntry } from "../data/storage.ts";
import MonthlyCalendar from "../live/components/MonthlyCalendar.tsx";
import { todayLocalDateString } from "../program/dateUtils.ts";

const RECURRENCE_DAY_LABELS = ["יום א׳", "יום ב׳", "יום ג׳", "יום ד׳", "יום ה׳", "יום ו׳", "שבת"];

/**
 * build/ArcGymReminderEditorScreen.tsx (route /arc-gym/reminder/[id]/edit,
 * id === "new" to create -- same convention as every other editor in
 * this app)
 *
 * ARCHI -- Unified Development Specification task, Part 2 ("ARC GYM
 * REMINDERS"): a plain date+time reminder to go train, for EITHER
 * exercise type (exerciseKind/exerciseId, required params on "new" --
 * see build/ArcGymSituationScreen.tsx/build/ArcGymMemoryDetailScreen.tsx's
 * own "+ תזכורת" buttons). "Date+time+optional recurrence": the
 * חד-פעמי/חזרתי toggle below picks which of ArcGymReminder's own two
 * mutually-exclusive shapes is in effect, reusing the EXACT SAME
 * weekday-chip UI build/TaskEditorScreen.tsx already uses for its own
 * recurring tasks, and the EXACT SAME live/components/MonthlyCalendar.tsx
 * every other date-picking flow in this app uses -- never a third,
 * independently-built date/weekday picker.
 *
 * "Never creates a Task LIVE session or imposes a duration": there is
 * no duration field anywhere on this screen, and saving only ever
 * calls reconcileArcGymReminderNotification (data/arcGymReminders.ts),
 * which schedules a plain OS notification -- never a Task, never a
 * timer.
 */
export default function ArcGymReminderEditorScreen({
  id,
  exerciseKind = "behaviour",
  exerciseId = "",
}: {
  id: string;
  exerciseKind?: ArcGymReminderExerciseKind;
  exerciseId?: string;
}) {
  const isNew = id === "new";
  const [existing, setExisting] = useState<ArcGymReminder | null>(null);
  const [hourText, setHourText] = useState("9");
  const [minuteText, setMinuteText] = useState("0");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [dateLocal, setDateLocal] = useState<string>(todayLocalDateString());
  const [showCalendar, setShowCalendar] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(isNew);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (isNew) {
        setLoaded(true);
        return;
      }
      loadArcGymReminders().then((reminders) => {
        const found = reminders.find((candidate) => candidate.id === id) ?? null;
        setExisting(found);
        if (found) {
          setHourText(String(found.hour));
          setMinuteText(String(found.minute));
          setIsRecurring(found.recurrenceDaysOfWeek !== null);
          setRecurrenceDays(found.recurrenceDaysOfWeek ?? []);
          setDateLocal(found.dateLocal ?? todayLocalDateString());
        }
        setLoaded(true);
      });
    }, [id, isNew])
  );

  function toggleDay(day: number) {
    setRecurrenceDays((current) => (current.includes(day) ? current.filter((candidate) => candidate !== day) : [...current, day].sort()));
  }

  async function save() {
    const validationErrors: string[] = [];
    const hour = Number(hourText);
    const minute = Number(minuteText);
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) validationErrors.push("יש להזין שעה תקינה (0-23).");
    if (!Number.isFinite(minute) || minute < 0 || minute > 59) validationErrors.push("יש להזין דקה תקינה (0-59).");
    if (isRecurring && recurrenceDays.length === 0) validationErrors.push("יש לבחור לפחות יום אחד לתזכורת חזרתית.");
    if (!isRecurring && !dateLocal) validationErrors.push("יש לבחור תאריך לתזכורת חד-פעמית.");
    setErrors(validationErrors);
    if (validationErrors.length > 0) return;

    const now = new Date().toISOString();
    const recurrenceDaysOfWeek = isRecurring ? recurrenceDays : null;
    const saved = existing
      ? updateArcGymReminder(existing, { hour, minute, recurrenceDaysOfWeek, dateLocal: isRecurring ? null : dateLocal }, now)
      : createArcGymReminder(generateArcGymReminderId(), exerciseKind, exerciseId, hour, minute, recurrenceDaysOfWeek, isRecurring ? null : dateLocal, now);
    const reconciled = await reconcileArcGymReminderNotification(saved);
    await upsertArcGymReminderEntry(reconciled);
    router.back();
  }

  async function handleDelete() {
    if (!existing) return;
    await deleteArcGymReminderEntry(existing.id);
    setConfirmDelete(false);
    router.back();
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
        <Text style={styles.title}>{isNew ? "תזכורת אימון חדשה" : "עריכת תזכורת"}</Text>

        {errors.map((error) => (
          <Text key={error} style={styles.errorText}>
            {error}
          </Text>
        ))}

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

        <Text style={styles.fieldLabel}>חזרתיות</Text>
        <View style={styles.chipRow}>
          <Pressable style={[styles.chip, !isRecurring && styles.chipSelected]} onPress={() => setIsRecurring(false)}>
            <Text style={[styles.chipText, !isRecurring && styles.chipTextSelected]}>חד-פעמית</Text>
          </Pressable>
          <Pressable style={[styles.chip, isRecurring && styles.chipSelected]} onPress={() => setIsRecurring(true)}>
            <Text style={[styles.chipText, isRecurring && styles.chipTextSelected]}>חזרתית</Text>
          </Pressable>
        </View>

        {isRecurring ? (
          <View style={styles.chipRow}>
            {RECURRENCE_DAY_LABELS.map((label, dayOfWeek) => (
              <Pressable key={dayOfWeek} style={[styles.chip, recurrenceDays.includes(dayOfWeek) && styles.chipSelected]} onPress={() => toggleDay(dayOfWeek)}>
                <Text style={[styles.chipText, recurrenceDays.includes(dayOfWeek) && styles.chipTextSelected]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Pressable style={styles.calendarLinkButton} onPress={() => setShowCalendar(true)}>
            <Text style={styles.calendarLinkButtonText}>{`תאריך: ${dateLocal}`}</Text>
          </Pressable>
        )}

        <Pressable style={styles.primaryButton} onPress={save}>
          <Text style={styles.primaryButtonText}>{isNew ? "יצירת תזכורת" : "שמירת שינויים"}</Text>
        </Pressable>

        {!isNew && (
          <Pressable style={styles.deleteButton} onPress={() => setConfirmDelete(true)}>
            <Text style={styles.deleteButtonText}>מחיקת תזכורת</Text>
          </Pressable>
        )}
      </ScrollView>

      <Modal visible={showCalendar} transparent animationType="fade" onRequestClose={() => setShowCalendar(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <MonthlyCalendar selectedDate={dateLocal} onSelectDate={setDateLocal} onConfirm={() => setShowCalendar(false)} onCancel={() => setShowCalendar(false)} />
          </View>
        </View>
      </Modal>

      {confirmDelete && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>למחוק את התזכורת הזאת?</Text>
            <View style={styles.modalButtonRow}>
              <Pressable style={[styles.primaryButton, styles.modalButton]} onPress={handleDelete}>
                <Text style={styles.primaryButtonText}>מחיקה</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => setConfirmDelete(false)}>
                <Text style={styles.actionButtonText}>ביטול</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20, gap: 4 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  errorText: { color: "#b00020", textAlign: "right", fontSize: 14, marginBottom: 4 },
  fieldLabel: { fontSize: 14, fontWeight: "600", textAlign: "right", marginBottom: 6, color: "#444", marginTop: 10 },
  row: { flexDirection: "row-reverse", gap: 12 },
  timeField: { flex: 1 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  chipRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  chip: { borderWidth: 1, borderColor: "#ccc", borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipSelected: { backgroundColor: "#0a7ea4", borderColor: "#0a7ea4" },
  chipText: { fontSize: 13, color: "#333" },
  chipTextSelected: { color: "#fff", fontWeight: "600" },
  calendarLinkButton: { alignSelf: "flex-end", marginTop: 6 },
  calendarLinkButtonText: { color: "#0a7ea4", fontSize: 14, textDecorationLine: "underline" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 16 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  deleteButton: { borderWidth: 1, borderColor: "#b00020", paddingVertical: 12, borderRadius: 10, alignItems: "center", marginTop: 12 },
  deleteButtonText: { color: "#b00020", fontSize: 15 },
  modalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 20, width: "100%" },
  modalTitle: { fontSize: 17, fontWeight: "700", textAlign: "right", marginBottom: 12 },
  modalButtonRow: { flexDirection: "row-reverse", justifyContent: "flex-end", alignItems: "center", gap: 12 },
  modalButton: { flex: 0, marginTop: 0, paddingHorizontal: 20 },
  actionButton: { paddingVertical: 6, paddingHorizontal: 10 },
  actionButtonText: { color: "#0a7ea4", fontSize: 14 },
});
