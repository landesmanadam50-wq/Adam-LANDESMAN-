/**
 * app/routines/index.tsx
 *
 * "השגרה שלי" -- Multiple Scheduled ARC + Success Focus Routines. A
 * single-screen list + inline create/edit form (same "one screen, a
 * few internal views" pattern already used elsewhere in this app,
 * e.g. build/ArcMapScreen.tsx), rather than a second route for the
 * form -- there's no separate flow to navigate away from and back to.
 *
 * Reuses the existing ARCHI architecture throughout: arc/routines.ts's
 * pure status/date-math/sorting, data/routines.ts's notification
 * scheduling (reconciled on every focus, since -- like every other
 * reminder in this app -- a notification firing is never trusted as
 * the sole signal), and navigates into the SAME /live flow every other
 * ARC entry point already uses, just with a routineId param
 * (live/LiveSessionScreen.tsx reads it to run this routine's own
 * post-ARC Success Focus step). No parallel ARC implementation.
 */

import { useCallback, useState } from "react";
import { Link, router, useFocusEffect } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  loadRoutineOccurrenceCompletions,
  loadScheduledRoutines,
  saveScheduledRoutines,
} from "../../data/storage.ts";
import type { RoutineOccurrenceCompletion, ScheduledRoutine } from "../../data/storage.ts";
import { cancelRoutineNotification, reconcileRoutineNotifications, rescheduleRoutineNotification } from "../../data/routines.ts";
import { buildRoutineListItems, generateRoutineId, sortRoutineListItems } from "../../arc/routines.ts";
import type { RoutineListItem, RoutineStatus } from "../../arc/routines.ts";

const DAY_LABELS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"]; // index === Date.getDay()
const DAY_FULL_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const SUCCESS_FOCUS_DURATION_OPTIONS = [5, 10, 15, 20, 30];

const STATUS_LABELS: Record<RoutineStatus, string> = {
  completed: "הושלם ✓",
  dueOrOverdue: "ממתין",
  upcoming: "בהמשך",
  disabled: "מושבת",
  noOccurrenceToday: "אין היום",
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatHm(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

function formatOccurrence(date: Date): string {
  return `יום ${DAY_FULL_NAMES[date.getDay()]}, ${formatHm(date.getHours(), date.getMinutes())}`;
}

interface RoutineFormState {
  id: string | null; // null = creating a new routine
  title: string;
  hourText: string;
  minuteText: string;
  recurrenceDays: number[];
  successFocusDurationMinutes: number;
  notificationsEnabled: boolean;
  enabled: boolean;
}

function emptyForm(): RoutineFormState {
  return {
    id: null,
    title: "",
    hourText: "08",
    minuteText: "00",
    recurrenceDays: [],
    successFocusDurationMinutes: 10,
    notificationsEnabled: true,
    enabled: true,
  };
}

function formFromRoutine(routine: ScheduledRoutine): RoutineFormState {
  return {
    id: routine.id,
    title: routine.title,
    hourText: pad2(routine.hour),
    minuteText: pad2(routine.minute),
    recurrenceDays: routine.recurrenceDays,
    successFocusDurationMinutes: routine.successFocusDurationMinutes,
    notificationsEnabled: routine.notificationsEnabled,
    enabled: routine.enabled,
  };
}

/** Clamps free-typed hour/minute text into a valid wall-clock value -- never NaN, never out of range, so an in-progress or malformed edit can't produce an invalid schedule. */
function parseClampedTimePart(text: string, max: number): number {
  const parsed = Number.parseInt(text, 10);
  if (Number.isNaN(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), max);
}

export default function RoutinesScreen() {
  const [routines, setRoutines] = useState<ScheduledRoutine[]>([]);
  const [completions, setCompletions] = useState<RoutineOccurrenceCompletion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState<RoutineFormState | null>(null);

  const reload = useCallback(() => {
    // reconcileRoutineNotifications both refreshes any stale/missing
    // per-routine notification AND returns the current routine list --
    // one round trip, always the freshest data/notifications state.
    Promise.all([reconcileRoutineNotifications(), loadRoutineOccurrenceCompletions()]).then(([reconciledRoutines, loadedCompletions]) => {
      setRoutines(reconciledRoutines);
      setCompletions(loadedCompletions);
      setLoaded(true);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  async function persistRoutines(next: ScheduledRoutine[]) {
    await saveScheduledRoutines(next);
    setRoutines(next);
  }

  async function handleSaveForm() {
    if (!form) return;
    const title = form.title.trim();
    if (title.length === 0 || form.recurrenceDays.length === 0) return;
    const hour = parseClampedTimePart(form.hourText, 23);
    const minute = parseClampedTimePart(form.minuteText, 59);

    const existing = form.id ? (await loadScheduledRoutines()).find((item) => item.id === form.id) ?? null : null;
    const base: ScheduledRoutine = existing ?? {
      id: generateRoutineId(),
      title,
      hour,
      minute,
      recurrenceDays: form.recurrenceDays,
      successFocusDurationMinutes: form.successFocusDurationMinutes,
      notificationsEnabled: form.notificationsEnabled,
      enabled: form.enabled,
      nextOccurrenceNotificationId: null,
      nextOccurrenceScheduledFor: null,
      createdAt: new Date().toISOString(),
    };
    const updated: ScheduledRoutine = {
      ...base,
      title,
      hour,
      minute,
      recurrenceDays: form.recurrenceDays,
      successFocusDurationMinutes: form.successFocusDurationMinutes,
      notificationsEnabled: form.notificationsEnabled,
      enabled: form.enabled,
    };
    const rescheduled = await rescheduleRoutineNotification(updated);

    const current = await loadScheduledRoutines();
    const next = existing
      ? current.map((item) => (item.id === rescheduled.id ? rescheduled : item))
      : [...current, rescheduled];
    await persistRoutines(next);
    setForm(null);
  }

  async function handleDelete(routine: ScheduledRoutine) {
    await cancelRoutineNotification(routine);
    const current = await loadScheduledRoutines();
    await persistRoutines(current.filter((item) => item.id !== routine.id));
    setForm(null);
  }

  async function handleToggleEnabled(routine: ScheduledRoutine) {
    const updated = await rescheduleRoutineNotification({ ...routine, enabled: !routine.enabled });
    const current = await loadScheduledRoutines();
    await persistRoutines(current.map((item) => (item.id === updated.id ? updated : item)));
  }

  function startRoutineNow(routine: ScheduledRoutine) {
    router.push({ pathname: "/live", params: { routineId: routine.id } });
  }

  const items: RoutineListItem[] = sortRoutineListItems(buildRoutineListItems(routines, completions));

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>השגרה שלי</Text>

        {form ? (
          <RoutineForm
            form={form}
            onChange={setForm}
            onSave={handleSaveForm}
            onCancel={() => setForm(null)}
            onDelete={form.id ? () => handleDelete(routines.find((item) => item.id === form.id)!) : undefined}
          />
        ) : (
          <>
            {loaded && items.length === 0 && <Text style={styles.emptyText}>עדיין לא נוספה שגרה.</Text>}
            {items.map((item) => (
              <RoutineRow
                key={item.routine.id}
                item={item}
                onPress={() => setForm(formFromRoutine(item.routine))}
                onStartNow={() => startRoutineNow(item.routine)}
                onToggleEnabled={() => handleToggleEnabled(item.routine)}
              />
            ))}
            <Pressable style={styles.addButton} onPress={() => setForm(emptyForm())}>
              <Text style={styles.addButtonText}>+ הוסף שגרה</Text>
            </Pressable>
            <Link href="/" style={styles.backLink}>
              <Text style={styles.backLinkText}>חזרה לדף הבית</Text>
            </Link>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function RoutineRow({
  item,
  onPress,
  onStartNow,
  onToggleEnabled,
}: {
  item: RoutineListItem;
  onPress: () => void;
  onStartNow: () => void;
  onToggleEnabled: () => void;
}) {
  const { routine, status } = item;
  const canStartNow = status === "dueOrOverdue" || status === "upcoming";
  return (
    <View style={styles.row}>
      <Pressable style={styles.rowMain} onPress={onPress}>
        <View style={styles.rowHeader}>
          <Text style={styles.rowTime}>{formatHm(routine.hour, routine.minute)}</Text>
          <Text style={styles.rowTitle}>{routine.title}</Text>
          <Text style={styles.rowStatus}>{STATUS_LABELS[status]}</Text>
        </View>
        <Text style={styles.rowNextOccurrence}>
          {item.nextOccurrenceDate ? `הבא בתור: ${formatOccurrence(item.nextOccurrenceDate)}` : "אין מועד קרוב מוגדר"}
        </Text>
      </Pressable>
      <View style={styles.rowActions}>
        {canStartNow && (
          <Pressable style={styles.startButton} onPress={onStartNow}>
            <Text style={styles.startButtonText}>התחל עכשיו</Text>
          </Pressable>
        )}
        <Pressable style={styles.toggleButton} onPress={onToggleEnabled}>
          <Text style={styles.toggleButtonText}>{routine.enabled ? "השבת" : "הפעל"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function RoutineForm({
  form,
  onChange,
  onSave,
  onCancel,
  onDelete,
}: {
  form: RoutineFormState;
  onChange: (form: RoutineFormState) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  function toggleDay(day: number) {
    const has = form.recurrenceDays.includes(day);
    onChange({
      ...form,
      recurrenceDays: has ? form.recurrenceDays.filter((d) => d !== day) : [...form.recurrenceDays, day].sort(),
    });
  }

  const canSave = form.title.trim().length > 0 && form.recurrenceDays.length > 0;

  return (
    <View>
      <Text style={styles.fieldLabel}>שם השגרה</Text>
      <TextInput
        style={styles.textInput}
        value={form.title}
        onChangeText={(text) => onChange({ ...form, title: text })}
        placeholder="לדוגמה: מיקוד בוקר"
        textAlign="right"
      />

      <Text style={styles.fieldLabel}>שעה מקומית</Text>
      <View style={styles.timeRow}>
        <TextInput
          style={styles.timeInput}
          value={form.hourText}
          onChangeText={(text) => onChange({ ...form, hourText: text.replace(/[^0-9]/g, "") })}
          keyboardType="number-pad"
          maxLength={2}
          textAlign="center"
        />
        <Text style={styles.timeSeparator}>:</Text>
        <TextInput
          style={styles.timeInput}
          value={form.minuteText}
          onChangeText={(text) => onChange({ ...form, minuteText: text.replace(/[^0-9]/g, "") })}
          keyboardType="number-pad"
          maxLength={2}
          textAlign="center"
        />
      </View>

      <Text style={styles.fieldLabel}>ימי חזרה</Text>
      <View style={styles.chipRow}>
        {DAY_LABELS.map((label, day) => (
          <Pressable
            key={day}
            style={[styles.chip, form.recurrenceDays.includes(day) && styles.chipSelected]}
            onPress={() => toggleDay(day)}
          >
            <Text style={styles.chipText}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.fieldLabel}>משך התמקדות בהצלחה</Text>
      <View style={styles.chipRow}>
        {SUCCESS_FOCUS_DURATION_OPTIONS.map((minutes) => (
          <Pressable
            key={minutes}
            style={[styles.chip, form.successFocusDurationMinutes === minutes && styles.chipSelected]}
            onPress={() => onChange({ ...form, successFocusDurationMinutes: minutes })}
          >
            <Text style={styles.chipText}>{minutes} דק&apos;</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.fieldLabel}>התראות</Text>
      <View style={styles.chipRow}>
        <Pressable
          style={[styles.chip, form.notificationsEnabled && styles.chipSelected]}
          onPress={() => onChange({ ...form, notificationsEnabled: true })}
        >
          <Text style={styles.chipText}>מופעלות</Text>
        </Pressable>
        <Pressable
          style={[styles.chip, !form.notificationsEnabled && styles.chipSelected]}
          onPress={() => onChange({ ...form, notificationsEnabled: false })}
        >
          <Text style={styles.chipText}>כבויות</Text>
        </Pressable>
      </View>

      <Text style={styles.fieldLabel}>מצב</Text>
      <View style={styles.chipRow}>
        <Pressable style={[styles.chip, form.enabled && styles.chipSelected]} onPress={() => onChange({ ...form, enabled: true })}>
          <Text style={styles.chipText}>פעילה</Text>
        </Pressable>
        <Pressable style={[styles.chip, !form.enabled && styles.chipSelected]} onPress={() => onChange({ ...form, enabled: false })}>
          <Text style={styles.chipText}>מושבתת</Text>
        </Pressable>
      </View>

      <Pressable style={[styles.saveButton, !canSave && styles.buttonDisabled]} onPress={canSave ? onSave : undefined} disabled={!canSave}>
        <Text style={styles.saveButtonText}>שמור</Text>
      </Pressable>
      <Pressable style={styles.cancelButton} onPress={onCancel}>
        <Text style={styles.cancelButtonText}>ביטול</Text>
      </Pressable>
      {onDelete && (
        <Pressable style={styles.deleteButton} onPress={onDelete}>
          <Text style={styles.deleteButtonText}>מחק שגרה</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flexGrow: 1,
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "right",
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 15,
    textAlign: "right",
    color: "#666",
    marginBottom: 16,
  },
  row: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  rowMain: {
    marginBottom: 8,
  },
  rowHeader: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  rowTime: {
    fontSize: 17,
    fontWeight: "700",
  },
  rowTitle: {
    fontSize: 16,
    flex: 1,
    textAlign: "right",
    marginHorizontal: 8,
  },
  rowStatus: {
    fontSize: 14,
    color: "#0a7ea4",
    fontWeight: "600",
  },
  rowNextOccurrence: {
    fontSize: 13,
    color: "#666",
    textAlign: "right",
    marginTop: 4,
  },
  rowActions: {
    flexDirection: "row-reverse",
    gap: 8,
  },
  startButton: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  startButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  toggleButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#0a7ea4",
  },
  toggleButtonText: {
    color: "#0a7ea4",
    fontWeight: "600",
    fontSize: 14,
  },
  addButton: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 8,
  },
  addButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  backLink: {
    marginTop: 20,
    alignSelf: "center",
  },
  backLinkText: {
    color: "#0a7ea4",
    fontSize: 15,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: "600",
    textAlign: "right",
    marginBottom: 6,
    marginTop: 14,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  timeInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    fontSize: 20,
    width: 64,
  },
  timeSeparator: {
    fontSize: 20,
    fontWeight: "700",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  chip: {
    backgroundColor: "#E6F4FE",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  chipSelected: {
    backgroundColor: "#0a7ea4",
  },
  chipText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  saveButton: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 20,
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#0a7ea4",
    fontSize: 15,
  },
  deleteButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  deleteButtonText: {
    color: "#c0392b",
    fontSize: 15,
  },
});
