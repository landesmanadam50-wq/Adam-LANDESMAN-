import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { resolveEffectiveDueDate, resolveScheduleDueState } from "../../arc/spacedRepetition.ts";
import type { ArcReviewScheduleCore, ArcReviewScheduleMode } from "../../arc/spacedRepetition.ts";
import MonthlyCalendar from "../../live/components/MonthlyCalendar.tsx";

/**
 * build/components/ArcReviewScheduleControls.tsx
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task,
 * section 6 ("editable spaced repetition"): the ONE reusable controls
 * block -- preferred intervals, automatic/manual toggle, edit next
 * review date, postpone, restore automatic -- that ArcLearningInsight's
 * own schedule screen and ArcCreativityConnection's own schedule screen
 * both render, never two separately-authored copies. Pure presentation
 * over arc/spacedRepetition.ts's generic ArcReviewScheduleCore; the
 * caller owns loading/saving the actual schedule record.
 */

const DUE_STATE_LABELS: Record<string, string> = {
  overdue: "⏰ באיחור",
  due_today: "📌 מגיע היום",
  upcoming: "🗓️ בהמשך",
};

export interface ArcReviewScheduleControlsProps {
  schedule: ArcReviewScheduleCore;
  onSetMode: (mode: ArcReviewScheduleMode) => void;
  onSetLadder: (ladder: number[]) => void;
  onPostpone: (newDueAtIso: string) => void;
  onRestoreAutomatic: () => void;
}

export default function ArcReviewScheduleControls({ schedule, onSetMode, onSetLadder, onPostpone, onRestoreAutomatic }: ArcReviewScheduleControlsProps) {
  const [ladderText, setLadderText] = useState(schedule.intervalLadderDays.join(", "));
  const [showCalendar, setShowCalendar] = useState(false);
  const [pendingDate, setPendingDate] = useState<string | null>(null);

  const dueState = resolveScheduleDueState(schedule);
  const effectiveDueDate = resolveEffectiveDueDate(schedule);
  const hasManualOverride = schedule.manualDueOverrideAt !== null || schedule.mode === "manual";

  function saveLadder() {
    const parsed = ladderText
      .split(",")
      .map((part) => Number.parseInt(part.trim(), 10))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (parsed.length) onSetLadder(parsed);
  }

  function confirmPostpone() {
    if (!pendingDate) return;
    onPostpone(`${pendingDate}T00:00:00`);
    setShowCalendar(false);
    setPendingDate(null);
  }

  return (
    <View style={styles.block}>
      <Text style={styles.title}>תזמון סקירה</Text>

      <View style={styles.dueRow}>
        <Text style={styles.dueLabel}>{DUE_STATE_LABELS[dueState]}</Text>
        <Text style={styles.dueDate}>{effectiveDueDate.slice(0, 10)}</Text>
      </View>

      <View style={styles.modeRow}>
        <Pressable
          style={[styles.chip, schedule.mode === "automatic" && styles.chipActive]}
          onPress={() => onSetMode("automatic")}
        >
          <Text style={[styles.chipText, schedule.mode === "automatic" && styles.chipTextActive]}>אוטומטי</Text>
        </Pressable>
        <Pressable style={[styles.chip, schedule.mode === "manual" && styles.chipActive]} onPress={() => onSetMode("manual")}>
          <Text style={[styles.chipText, schedule.mode === "manual" && styles.chipTextActive]}>ידני</Text>
        </Pressable>
      </View>

      <Text style={styles.fieldLabel}>מרווחי סקירה מועדפים (בימים)</Text>
      <View style={styles.ladderRow}>
        <TextInput style={styles.ladderInput} value={ladderText} onChangeText={setLadderText} onBlur={saveLadder} placeholder="1, 3, 7, 14, 30" />
      </View>

      <View style={styles.actionsRow}>
        <Pressable style={styles.actionButton} onPress={() => setShowCalendar(true)}>
          <Text style={styles.actionButtonText}>דחיית תזמון</Text>
        </Pressable>
        {hasManualOverride && (
          <Pressable style={styles.actionButton} onPress={onRestoreAutomatic}>
            <Text style={styles.actionButtonText}>שחזור תזמון אוטומטי</Text>
          </Pressable>
        )}
      </View>

      <Modal visible={showCalendar} transparent animationType="fade" onRequestClose={() => setShowCalendar(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <MonthlyCalendar selectedDate={pendingDate} onSelectDate={setPendingDate} onConfirm={confirmPostpone} onCancel={() => setShowCalendar(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: "#F5FAFD", borderRadius: 12, padding: 14, gap: 10 },
  title: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#0a7ea4" },
  dueRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  dueLabel: { fontSize: 14, fontWeight: "600", textAlign: "right" },
  dueDate: { fontSize: 13, color: "#666" },
  modeRow: { flexDirection: "row-reverse", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 16, paddingVertical: 6, paddingHorizontal: 14 },
  chipActive: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  fieldLabel: { fontSize: 12, color: "#444", textAlign: "right" },
  ladderRow: { flexDirection: "row-reverse" },
  ladderInput: { flex: 1, borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 8, textAlign: "right", backgroundColor: "#fff" },
  actionsRow: { flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" },
  actionButton: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  actionButtonText: { color: "#0a7ea4", fontSize: 13, fontWeight: "600" },
  modalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 20, width: "100%" },
});
