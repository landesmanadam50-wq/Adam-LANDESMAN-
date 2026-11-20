import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { daysBetweenCalendarDates, parseCalendarDate, todayLocalDateString } from "../../program/dateUtils.ts";

/**
 * live/components/MonthlyCalendar.tsx
 *
 * ARCHI -- Unified Development Specification task, Part 7 ("MONTHLY
 * CALENDAR FOR ALL TASKS"): the ONE reusable monthly date-picker --
 * task creation, task editing, insight-generated tasks, and any other
 * compatible date-selection flow all render this SAME component,
 * never a separately-authored grid per screen. Pure "YYYY-MM-DD"
 * local-date strings in and out (program/dateUtils.ts's own
 * civil-calendar arithmetic, never new Date(string) + millisecond
 * math) -- "handle local dates correctly without timezone-related day
 * shifts" is satisfied structurally: there is no timezone anywhere in
 * this file, only year/month/day integers.
 *
 * Deliberately only EVER emits a date -- never a time, never a
 * duration. Callers that also need those keep them as entirely
 * separate controls (build/TaskEditorScreen.tsx's own existing time/
 * duration fields), exactly as the spec asks.
 */

const WEEKDAY_LABELS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const MONTH_LABELS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

/** 2024-01-07 is a known, verifiable Sunday -- the one fixed reference point every weekday computation below is anchored to, so this file never needs its own copy of daysFromCivil/civilFromDays. Returns 0 (Sunday) through 6 (Saturday). */
function resolveWeekday(localDate: string): number {
  const diff = daysBetweenCalendarDates("2024-01-07", localDate);
  return ((diff % 7) + 7) % 7;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function firstOfMonth(year: number, month: number): string {
  return `${year}-${pad2(month)}-01`;
}

function daysInMonth(year: number, month: number): number {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return daysBetweenCalendarDates(firstOfMonth(year, month), firstOfMonth(nextYear, nextMonth));
}

export interface MonthlyCalendarProps {
  /** The currently-confirmed/pending selection, or null for none yet -- "Today's date highlighted" applies independently of this. */
  selectedDate: string | null;
  /** Fired the instant a day cell is tapped -- never waits for "אישור" to report the tentative pick, so a caller embedding this inline (not behind its own confirm step) still works correctly. */
  onSelectDate: (date: string) => void;
  /** "A simple way to confirm the date" -- omit entirely for a caller that treats onSelectDate itself as final (no separate confirm step needed). */
  onConfirm?: () => void;
  onCancel?: () => void;
}

export default function MonthlyCalendar({ selectedDate, onSelectDate, onConfirm, onCancel }: MonthlyCalendarProps) {
  const today = todayLocalDateString();
  const base = parseCalendarDate(selectedDate && isLikelyValidDate(selectedDate) ? selectedDate : today);
  const [viewYear, setViewYear] = useState(base.year);
  const [viewMonth, setViewMonth] = useState(base.month);

  function goPrevMonth() {
    if (viewMonth === 1) {
      setViewYear((year) => year - 1);
      setViewMonth(12);
    } else {
      setViewMonth((month) => month - 1);
    }
  }

  function goNextMonth() {
    if (viewMonth === 12) {
      setViewYear((year) => year + 1);
      setViewMonth(1);
    } else {
      setViewMonth((month) => month + 1);
    }
  }

  const leadingBlanks = resolveWeekday(firstOfMonth(viewYear, viewMonth));
  const totalDays = daysInMonth(viewYear, viewMonth);
  const cells: (string | null)[] = [...Array.from({ length: leadingBlanks }, () => null), ...Array.from({ length: totalDays }, (_, index) => `${viewYear}-${pad2(viewMonth)}-${pad2(index + 1)}`)];

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Pressable style={styles.navArrow} onPress={goPrevMonth}>
          <Text style={styles.navArrowText}>‹</Text>
        </Pressable>
        <Text style={styles.monthLabel}>
          {MONTH_LABELS[viewMonth - 1]} {viewYear}
        </Text>
        <Pressable style={styles.navArrow} onPress={goNextMonth}>
          <Text style={styles.navArrowText}>›</Text>
        </Pressable>
      </View>
      <View style={styles.weekdayRow}>
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={styles.weekdayLabel}>
            {label}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((cell, index) => (
          <View key={cell ?? `blank-${index}`} style={styles.cell}>
            {cell && (
              <Pressable style={[styles.dayButton, cell === today && styles.todayButton, cell === selectedDate && styles.selectedButton]} onPress={() => onSelectDate(cell)}>
                <Text style={[styles.dayText, cell === today && styles.todayText, cell === selectedDate && styles.selectedDayText]}>{Number(cell.slice(-2))}</Text>
              </Pressable>
            )}
          </View>
        ))}
      </View>
      <View style={styles.footerRow}>
        {onCancel && (
          <Pressable style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>ביטול</Text>
          </Pressable>
        )}
        {onConfirm && (
          <Pressable style={[styles.confirmButton, !selectedDate && styles.disabledButton]} disabled={!selectedDate} onPress={onConfirm}>
            <Text style={styles.confirmButtonText}>אישור</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function isLikelyValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#fff", borderRadius: 12, padding: 14 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  navArrow: { padding: 8 },
  navArrowText: { fontSize: 20, color: "#0a7ea4", fontWeight: "700" },
  monthLabel: { fontSize: 17, fontWeight: "700", color: "#222" },
  weekdayRow: { flexDirection: "row" },
  weekdayLabel: { flex: 1, textAlign: "center", fontSize: 12, color: "#888", marginBottom: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "14.2857%", aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  dayButton: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  todayButton: { borderWidth: 1.5, borderColor: "#0a7ea4" },
  selectedButton: { backgroundColor: "#0a7ea4" },
  dayText: { fontSize: 14, color: "#222" },
  todayText: { color: "#0a7ea4", fontWeight: "700" },
  selectedDayText: { color: "#fff", fontWeight: "700" },
  footerRow: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 12 },
  confirmButton: { backgroundColor: "#0a7ea4", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  disabledButton: { opacity: 0.5 },
  confirmButtonText: { color: "#fff", fontWeight: "600" },
  cancelButton: { paddingVertical: 10, paddingHorizontal: 20 },
  cancelButtonText: { color: "#666" },
});
