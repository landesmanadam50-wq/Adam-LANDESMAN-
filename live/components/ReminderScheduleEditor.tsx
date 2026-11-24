import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { WEEKDAY_LABELS_HE } from "../../arc/weeklyRoutine.ts";
import type { ReminderSchedule, ReminderScheduleMode } from "../../arc/arcReminderSchedule.ts";

/**
 * live/components/ReminderScheduleEditor.tsx
 *
 * ARC Reminders task, Phase 5: the ONE scheduling UI shared by both ARC
 * Mantra reminders and ARC Active Recall reminders, since both families
 * share the exact same `ReminderSchedule` shape (arc/arcReminderSchedule.ts) --
 * never two separate editors for what is mechanically one data shape.
 * A plain controlled component: the caller owns the `ReminderSchedule`
 * value and persists it (through data/arcReminderCrud.ts) -- this
 * component only ever calls `onChange` with a new, fully-valid
 * `ReminderSchedule`, never a partial/invalid one, so every caller can
 * save whatever it's handed without its own extra validation step.
 *
 * HH:mm/YYYY-MM-DD are plain TextInput fields (same convention as
 * build/MorningAlarmSettingsScreen.tsx's own time field) -- no native
 * date/time picker dependency exists in this repo, and introducing one
 * for this single screen would be a second input convention this app
 * doesn't otherwise have.
 */

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default function ReminderScheduleEditor({ schedule, onChange }: { schedule: ReminderSchedule; onChange: (next: ReminderSchedule) => void }) {
  const now = schedule.updatedAt;

  function setMode(mode: ReminderScheduleMode) {
    onChange({ ...schedule, mode, updatedAt: now });
  }

  function setFixedTime(index: number, value: string) {
    const next = [...schedule.fixedTimes];
    next[index] = value;
    onChange({ ...schedule, fixedTimes: next, timesPerDay: next.length, updatedAt: now });
  }

  function addFixedTime() {
    onChange({ ...schedule, fixedTimes: [...schedule.fixedTimes, "09:00"], timesPerDay: schedule.fixedTimes.length + 1, updatedAt: now });
  }

  function removeFixedTime(index: number) {
    const next = schedule.fixedTimes.filter((_, itemIndex) => itemIndex !== index);
    onChange({ ...schedule, fixedTimes: next, timesPerDay: next.length, updatedAt: now });
  }

  function toggleDay(day: number) {
    const has = schedule.daysOfWeek.includes(day);
    const next = has ? schedule.daysOfWeek.filter((item) => item !== day) : [...schedule.daysOfWeek, day].sort();
    onChange({ ...schedule, daysOfWeek: next, updatedAt: now });
  }

  const repeatUntil = schedule.repeat.kind === "until" ? schedule.repeat.endDate : "";

  return (
    <View style={styles.container}>
      <Text style={styles.sectionLabel}>אופן התזמון</Text>
      <View style={styles.modeRow}>
        <Pressable style={[styles.modeChip, schedule.mode === "fixed_times" && styles.modeChipActive]} onPress={() => setMode("fixed_times")}>
          <Text style={[styles.modeChipText, schedule.mode === "fixed_times" && styles.modeChipTextActive]}>שעות קבועות</Text>
        </Pressable>
        <Pressable style={[styles.modeChip, schedule.mode === "times_per_day_spread" && styles.modeChipActive]} onPress={() => setMode("times_per_day_spread")}>
          <Text style={[styles.modeChipText, schedule.mode === "times_per_day_spread" && styles.modeChipTextActive]}>פיזור בטווח שעות</Text>
        </Pressable>
      </View>

      {schedule.mode === "fixed_times" ? (
        <View>
          {schedule.fixedTimes.map((time, index) => (
            <View key={index} style={styles.timeRow}>
              <Pressable style={styles.removeButton} onPress={() => removeFixedTime(index)}>
                <Text style={styles.removeButtonText}>הסר</Text>
              </Pressable>
              <TextInput
                style={[styles.textInput, !TIME_PATTERN.test(time) && styles.textInputInvalid]}
                value={time}
                onChangeText={(value) => setFixedTime(index, value)}
                placeholder="09:00"
                keyboardType="numbers-and-punctuation"
              />
            </View>
          ))}
          <Pressable style={styles.addButton} onPress={addFixedTime}>
            <Text style={styles.addButtonText}>+ הוסף שעה</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>פעמים ביום</Text>
            <TextInput
              style={styles.numberInput}
              value={String(schedule.timesPerDay)}
              onChangeText={(value) => {
                const parsed = Number.parseInt(value, 10);
                onChange({ ...schedule, timesPerDay: Number.isFinite(parsed) && parsed > 0 ? parsed : schedule.timesPerDay, updatedAt: now });
              }}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>מתחילת החלון</Text>
            <TextInput
              style={[styles.textInput, !TIME_PATTERN.test(schedule.windowStart) && styles.textInputInvalid]}
              value={schedule.windowStart}
              onChangeText={(value) => onChange({ ...schedule, windowStart: value, updatedAt: now })}
              placeholder="09:00"
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>עד סוף החלון</Text>
            <TextInput
              style={[styles.textInput, !TIME_PATTERN.test(schedule.windowEnd) && styles.textInputInvalid]}
              value={schedule.windowEnd}
              onChangeText={(value) => onChange({ ...schedule, windowEnd: value, updatedAt: now })}
              placeholder="22:00"
              keyboardType="numbers-and-punctuation"
            />
          </View>
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>מרווח מינימלי (דקות)</Text>
            <TextInput
              style={styles.numberInput}
              value={String(schedule.minGapMinutes)}
              onChangeText={(value) => {
                const parsed = Number.parseInt(value, 10);
                onChange({ ...schedule, minGapMinutes: Number.isFinite(parsed) && parsed >= 0 ? parsed : schedule.minGapMinutes, updatedAt: now });
              }}
              keyboardType="number-pad"
            />
          </View>
        </View>
      )}

      <Text style={styles.sectionLabel}>ימים בשבוע</Text>
      <Text style={styles.hint}>ללא בחירה -- כל יום.</Text>
      <View style={styles.dayRow}>
        {WEEKDAY_LABELS_HE.map((label, day) => (
          <Pressable key={day} style={[styles.dayChip, schedule.daysOfWeek.includes(day) && styles.dayChipActive]} onPress={() => toggleDay(day)}>
            <Text style={[styles.dayChipText, schedule.daysOfWeek.includes(day) && styles.dayChipTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.sectionLabel}>חזרה</Text>
      <View style={styles.modeRow}>
        <Pressable
          style={[styles.modeChip, schedule.repeat.kind === "forever" && styles.modeChipActive]}
          onPress={() => onChange({ ...schedule, repeat: { kind: "forever" }, updatedAt: now })}
        >
          <Text style={[styles.modeChipText, schedule.repeat.kind === "forever" && styles.modeChipTextActive]}>לתמיד</Text>
        </Pressable>
        <Pressable
          style={[styles.modeChip, schedule.repeat.kind === "until" && styles.modeChipActive]}
          onPress={() => onChange({ ...schedule, repeat: { kind: "until", endDate: repeatUntil || now.slice(0, 10) }, updatedAt: now })}
        >
          <Text style={[styles.modeChipText, schedule.repeat.kind === "until" && styles.modeChipTextActive]}>עד תאריך</Text>
        </Pressable>
      </View>
      {schedule.repeat.kind === "until" && (
        <TextInput
          style={[styles.textInput, !DATE_PATTERN.test(repeatUntil) && styles.textInputInvalid]}
          value={repeatUntil}
          onChangeText={(value) => onChange({ ...schedule, repeat: { kind: "until", endDate: value }, updatedAt: now })}
          placeholder="2026-12-31"
          keyboardType="numbers-and-punctuation"
        />
      )}

      <View style={styles.pauseRow}>
        <Switch value={schedule.paused} onValueChange={(value) => onChange({ ...schedule, paused: value, updatedAt: now })} />
        <Text style={styles.fieldLabel}>בהשהיה</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  sectionLabel: { fontSize: 14, fontWeight: "700", textAlign: "right", color: "#333", marginTop: 14, marginBottom: 6 },
  hint: { fontSize: 12, textAlign: "right", color: "#888", marginBottom: 6 },
  modeRow: { flexDirection: "row-reverse", gap: 8, marginBottom: 8 },
  modeChip: { borderWidth: 1, borderColor: "#ccc", borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  modeChipActive: { backgroundColor: "#0a7ea4", borderColor: "#0a7ea4" },
  modeChipText: { fontSize: 13, color: "#333" },
  modeChipTextActive: { color: "#fff", fontWeight: "600" },
  timeRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 8 },
  textInput: { flex: 1, borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, textAlign: "right", fontSize: 15 },
  textInputInvalid: { borderColor: "#c0392b" },
  numberInput: { width: 70, borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, textAlign: "center", fontSize: 15 },
  removeButton: { paddingVertical: 6, paddingHorizontal: 10 },
  removeButtonText: { color: "#c0392b", fontSize: 13 },
  addButton: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 10, padding: 10, alignItems: "center", marginTop: 4 },
  addButtonText: { color: "#0a7ea4", fontSize: 14, fontWeight: "600" },
  fieldRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8 },
  fieldLabel: { fontSize: 14, textAlign: "right", color: "#333" },
  dayRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  dayChip: { borderWidth: 1, borderColor: "#ccc", borderRadius: 14, paddingVertical: 5, paddingHorizontal: 10 },
  dayChipActive: { backgroundColor: "#0a7ea4", borderColor: "#0a7ea4" },
  dayChipText: { fontSize: 12, color: "#333" },
  dayChipTextActive: { color: "#fff", fontWeight: "600" },
  pauseRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginTop: 10 },
});
