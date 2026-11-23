import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";

import { createEmptyTask, generateTaskId } from "../arc/tasks.ts";
import type { ScheduledPlanEntry } from "../arc/dailyPlan.ts";
import { buildTaskOccurrenceOverride, findTaskOccurrenceOverride, markTaskOccurrenceRemoved } from "../arc/taskOccurrenceOverride.ts";
import { resolveEffectiveTodoOrder, reorderTodoEntry, resolveResortByRating } from "../arc/todoList.ts";
import type { TodoPlanEntry } from "../arc/todoList.ts";
import { listActiveTodoBankItems } from "../arc/todoBank.ts";
import type { TodoBankItem } from "../arc/todoBank.ts";
import { deleteTask, getTask, loadTaskOccurrenceOverrides, loadTodoBankItems, upsertTask, upsertTaskOccurrenceOverrideEntry } from "../data/storage.ts";
import { reconcileTaskAlarms } from "../data/taskAlarm.ts";

const TODO_RATING_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SCHEDULED_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * build/TimePlanningModal.tsx
 *
 * Smart To-Do List task, section 4: "all editing happens through the
 * existing תכנון זמן (time planning) popup" -- no new planning screen.
 * This is that popup: opened from build/FlexibleDailyScreen.tsx's own
 * pre-existing "⏱️ תכנון הזמן שלי" card (whose timer-start button stays
 * exactly where it was -- see that screen's own doc). Two tabs:
 *
 *  - "To-Do List": today's To-Do items (arc/todoList.ts), in their
 *    effective priority order, with inline urgency/importance editing,
 *    up/down manual reorder, "מיין מחדש לפי דירוג" (re-sort by rating),
 *    an inline add-form, and delete.
 *  - "משימות מתוזמנות": the SAME scheduled: ScheduledPlanEntry[] the
 *    parent screen already computed and holds as its own state (passed
 *    in as a prop, never recomputed here -- one single source for that
 *    derivation), condensed to inline start-time/duration edits using
 *    the exact SAME persistence path build/FlexibleDailyScreen.tsx's
 *    own handleReorder/handleEdit already rely on: buildTaskOccurrenceOverride
 *    + upsertTaskOccurrenceOverrideEntry for a "weekly"-origin entry,
 *    plain upsertTask for a "oneoff" one. Zero new persistence logic.
 *
 * Every row action persists immediately (this codebase's own existing
 * convention -- no screen here batches edits behind one Save button)
 * and calls onChanged() right away so the parent re-derives its own
 * `scheduled`/`todoEntries` state and this modal re-renders from the
 * freshly-flowed-down props. The footer's "שמירה"/"ביטול" both simply
 * close the modal (everything was already persisted on its own action);
 * neither one is the thing that actually saves anything.
 *
 * Both tabs edit ONLY this one date's own plan -- a "weekly"-origin
 * entry's edit here is a per-date override, never a change to the
 * Fixed Weekly Routine template itself (same guarantee every other
 * edit path on FlexibleDailyScreen.tsx already gives).
 */
export default function TimePlanningModal({
  visible,
  dateLocal,
  scheduled,
  todoEntries,
  onClose,
  onChanged,
}: {
  visible: boolean;
  dateLocal: string;
  scheduled: ScheduledPlanEntry[];
  todoEntries: TodoPlanEntry[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"todo" | "scheduled">("todo");
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [rowDrafts, setRowDrafts] = useState<Record<string, { scheduledTime: string; durationMinutes: string }>>({});
  const [bankItems, setBankItems] = useState<TodoBankItem[]>([]);
  const [showBankPicker, setShowBankPicker] = useState(false);

  useEffect(() => {
    if (!visible) {
      setActiveTab("todo");
      setNewTodoTitle("");
      setEditingTodoId(null);
      setRowDrafts({});
      setShowBankPicker(false);
    } else {
      loadTodoBankItems().then(setBankItems);
    }
  }, [visible]);

  useEffect(() => {
    setRowDrafts((prev) => {
      const next = { ...prev };
      for (const entry of scheduled) {
        if (!(entry.task.id in next)) {
          next[entry.task.id] = {
            scheduledTime: entry.effectiveStartTime ?? "",
            durationMinutes: entry.expectedDurationMinutes !== null ? String(entry.expectedDurationMinutes) : "",
          };
        }
      }
      return next;
    });
  }, [scheduled]);

  const orderedTodoEntries = resolveEffectiveTodoOrder(todoEntries);

  async function handleAddTodo() {
    const title = newTodoTitle.trim();
    if (!title) return;
    const now = new Date().toISOString();
    const task = { ...createEmptyTask(generateTaskId(), title, title, now), isTodoItem: true, scheduledDate: dateLocal };
    await upsertTask(task);
    setNewTodoTitle("");
    onChanged();
  }

  async function handleDeleteTodo(taskId: string) {
    await deleteTask(taskId);
    await reconcileTaskAlarms();
    onChanged();
  }

  /**
   * To-Do Bank + Duration/Split Selection task: places a reusable bank
   * item (arc/todoBank.ts) onto THIS date -- an ORDINARY per-day To-Do
   * Task, exactly like handleAddTodo above, plus the one new
   * todoBankItemId back-reference. Fresh todoUrgency/todoImportance
   * (default 5), same as any other to-do -- rated afterward via the
   * existing rating chips below, same as any other row. Never touches
   * the bank item itself.
   */
  async function handleAddFromBank(bankItem: TodoBankItem) {
    const now = new Date().toISOString();
    const task = { ...createEmptyTask(generateTaskId(), bankItem.title, bankItem.title, now), isTodoItem: true, scheduledDate: dateLocal, todoBankItemId: bankItem.id };
    await upsertTask(task);
    setShowBankPicker(false);
    onChanged();
  }

  async function handleReorderTodo(taskId: string, direction: "up" | "down") {
    const results = reorderTodoEntry(todoEntries, taskId, direction);
    if (!results) return;
    for (const result of results) {
      const task = await getTask(result.taskId);
      if (task) await upsertTask({ ...task, todoOrder: result.todoOrder });
    }
    onChanged();
  }

  async function handleResortByRating() {
    const results = resolveResortByRating(todoEntries);
    for (const result of results) {
      const task = await getTask(result.taskId);
      if (task) await upsertTask({ ...task, todoOrder: null });
    }
    onChanged();
  }

  async function handleSetTodoRating(taskId: string, field: "todoUrgency" | "todoImportance", value: number) {
    const task = await getTask(taskId);
    if (task) await upsertTask({ ...task, [field]: value });
    onChanged();
  }

  async function handleSetTodoSplittable(taskId: string, todoIsSplittable: boolean) {
    const task = await getTask(taskId);
    if (task) await upsertTask({ ...task, todoIsSplittable });
    onChanged();
  }

  async function handleSetTodoDuration(taskId: string, durationDraft: string) {
    const task = await getTask(taskId);
    if (!task) return;
    const parsed = durationDraft.trim() ? Number(durationDraft.trim()) : null;
    const expectedDurationMinutes = parsed !== null && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    await upsertTask({ ...task, expectedDurationMinutes });
    onChanged();
  }

  /**
   * "Add scheduled task" button task: opens the SAME full task editor
   * (/tasks/[id]/edit, id="new") the pre-existing "+ משימה" quick action
   * on build/FlexibleDailyScreen.tsx already uses for this exact date --
   * never a second, cut-down creation form here. `scheduledDate` alone
   * is passed: the editor's own `isTodoItem`/recurrence controls default
   * to a plain one-off task for THIS date only, never touching the Fixed
   * Weekly Routine template unless the trainee explicitly sets a
   * recurrence inside that same editor. The modal itself is left open
   * (never closed here) -- its own `scheduled` prop is recomputed by the
   * parent's reload() the moment focus returns to it, so the new task
   * shows up in this tab immediately with no extra tap.
   */
  function handleAddScheduledTask() {
    router.push({ pathname: "/tasks/[id]/edit", params: { id: "new", scheduledDate: dateLocal } });
  }

  /**
   * "Remove scheduled task" button task: the SAME remove primitive
   * build/FlexibleDailyScreen.tsx's own handleRemoveForToday already
   * uses -- a weekly-origin entry is only ever marked removed for THIS
   * one date (markTaskOccurrenceRemoved -> a per-occurrence override,
   * never touching the Fixed Weekly Routine template), while a oneoff
   * entry (including one just added from this same modal) is deleted
   * outright. Never a second, competing removal mechanism.
   */
  async function handleRemoveScheduled(entry: ScheduledPlanEntry) {
    if (entry.origin === "weekly") {
      const overrides = await loadTaskOccurrenceOverrides();
      await upsertTaskOccurrenceOverrideEntry(markTaskOccurrenceRemoved(entry.task, entry.occurrenceDateLocal, overrides, new Date().toISOString()));
    } else {
      await deleteTask(entry.task.id);
    }
    await reconcileTaskAlarms();
    onChanged();
  }

  function confirmRemoveScheduled(entry: ScheduledPlanEntry) {
    const message = entry.origin === "weekly" ? "המשימה תוסר מהיום הזה בלבד -- השבוע הקבוע לא ישתנה." : "המשימה תימחק.";
    Alert.alert("הסרת משימה", message, [
      { text: "ביטול", style: "cancel" },
      { text: "הסר", style: "destructive", onPress: () => handleRemoveScheduled(entry) },
    ]);
  }

  async function handleSaveScheduledRow(entry: ScheduledPlanEntry) {
    const draft = rowDrafts[entry.task.id];
    if (!draft) return;
    const trimmedTime = draft.scheduledTime.trim();
    if (trimmedTime && !SCHEDULED_TIME_PATTERN.test(trimmedTime)) {
      Alert.alert("שעה לא תקינה", "יש להזין שעה בפורמט HH:MM, לדוגמה 09:30.");
      return;
    }
    const scheduledTime = trimmedTime || null;
    const parsedDuration = draft.durationMinutes.trim() ? Number(draft.durationMinutes.trim()) : null;
    const expectedDurationMinutes = parsedDuration !== null && Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : null;
    const now = new Date().toISOString();

    if (entry.origin === "weekly") {
      const overrides = await loadTaskOccurrenceOverrides();
      const existingOverride = findTaskOccurrenceOverride(entry.task.id, entry.occurrenceDateLocal, overrides);
      await upsertTaskOccurrenceOverrideEntry(
        buildTaskOccurrenceOverride(entry.task, entry.occurrenceDateLocal, existingOverride, { scheduledTime, expectedDurationMinutes, timeIsManual: true }, now)
      );
    } else {
      const task = await getTask(entry.task.id);
      if (task) await upsertTask({ ...task, scheduledTime, expectedDurationMinutes });
    }
    await reconcileTaskAlarms();
    onChanged();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>תכנון הזמן שלי</Text>

          <View style={styles.tabRow}>
            <Pressable style={[styles.tabChip, activeTab === "todo" && styles.tabChipSelected]} onPress={() => setActiveTab("todo")}>
              <Text style={[styles.tabChipText, activeTab === "todo" && styles.tabChipTextSelected]}>To-Do List</Text>
            </Pressable>
            <Pressable style={[styles.tabChip, activeTab === "scheduled" && styles.tabChipSelected]} onPress={() => setActiveTab("scheduled")}>
              <Text style={[styles.tabChipText, activeTab === "scheduled" && styles.tabChipTextSelected]}>משימות מתוזמנות</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.scrollArea}>
            {activeTab === "todo" ? (
              <>
                <Pressable style={styles.resortButton} onPress={handleResortByRating}>
                  <Text style={styles.resortButtonText}>סדר מחדש לפי דירוג</Text>
                </Pressable>

                {orderedTodoEntries.length === 0 && <Text style={styles.hint}>אין פריטי To-Do לתאריך הזה.</Text>}
                {orderedTodoEntries.map((entry, position) => {
                  const isEditing = editingTodoId === entry.task.id;
                  return (
                    <View key={entry.task.id} style={styles.todoRow}>
                      <View style={styles.todoRowHeader}>
                        <Text style={styles.todoOrdinal}>{position + 1}.</Text>
                        <Text style={styles.todoTitle}>{entry.task.title}</Text>
                      </View>
                      <Text style={styles.todoMeta}>
                        דחיפות {entry.task.todoUrgency} · חשיבות {entry.task.todoImportance}
                        {entry.remainingMinutes !== null ? ` · ${entry.remainingMinutes} דק' נותרו` : ""}
                      </Text>
                      <View style={styles.todoActionsRow}>
                        <Pressable
                          style={styles.entryActionButton}
                          onPress={() => {
                            onClose();
                            router.push({ pathname: "/tasks/[id]", params: { id: entry.task.id, autoStart: "1" } });
                          }}
                        >
                          <Text style={styles.entryActionText}>התחל</Text>
                        </Pressable>
                        <Pressable style={styles.entryActionButton} onPress={() => setEditingTodoId(isEditing ? null : entry.task.id)}>
                          <Text style={styles.entryActionText}>{isEditing ? "סגור" : "ערוך"}</Text>
                        </Pressable>
                        <Pressable
                          style={styles.entryActionButton}
                          onPress={() =>
                            Alert.alert("הסרת משימה", `"${entry.task.title}" תימחק.`, [
                              { text: "ביטול", style: "cancel" },
                              { text: "הסר", style: "destructive", onPress: () => handleDeleteTodo(entry.task.id) },
                            ])
                          }
                        >
                          <Text style={styles.entryActionTextRemove}>הסר</Text>
                        </Pressable>
                        <Pressable disabled={position === 0} onPress={() => handleReorderTodo(entry.task.id, "up")}>
                          <Text style={[styles.reorderArrow, position === 0 && styles.reorderArrowDisabled]}>▲</Text>
                        </Pressable>
                        <Pressable disabled={position === orderedTodoEntries.length - 1} onPress={() => handleReorderTodo(entry.task.id, "down")}>
                          <Text style={[styles.reorderArrow, position === orderedTodoEntries.length - 1 && styles.reorderArrowDisabled]}>▼</Text>
                        </Pressable>
                      </View>

                      {isEditing && (
                        <View style={styles.todoEditBlock}>
                          <Text style={styles.todoEditLabel}>דחיפות</Text>
                          <View style={styles.chipRow}>
                            {TODO_RATING_VALUES.map((value) => (
                              <Pressable
                                key={value}
                                style={[styles.chip, entry.task.todoUrgency === value && styles.chipSelected]}
                                onPress={() => handleSetTodoRating(entry.task.id, "todoUrgency", value)}
                              >
                                <Text style={styles.chipText}>{value}</Text>
                              </Pressable>
                            ))}
                          </View>
                          <Text style={styles.todoEditLabel}>חשיבות</Text>
                          <View style={styles.chipRow}>
                            {TODO_RATING_VALUES.map((value) => (
                              <Pressable
                                key={value}
                                style={[styles.chip, entry.task.todoImportance === value && styles.chipSelected]}
                                onPress={() => handleSetTodoRating(entry.task.id, "todoImportance", value)}
                              >
                                <Text style={styles.chipText}>{value}</Text>
                              </Pressable>
                            ))}
                          </View>
                          <Text style={styles.todoEditLabel}>ניתן לפצל?</Text>
                          <View style={styles.chipRow}>
                            <Pressable style={[styles.chip, entry.task.todoIsSplittable && styles.chipSelected]} onPress={() => handleSetTodoSplittable(entry.task.id, true)}>
                              <Text style={styles.chipText}>ניתן לפצל</Text>
                            </Pressable>
                            <Pressable style={[styles.chip, !entry.task.todoIsSplittable && styles.chipSelected]} onPress={() => handleSetTodoSplittable(entry.task.id, false)}>
                              <Text style={styles.chipText}>לא ניתן לפצל</Text>
                            </Pressable>
                          </View>
                          <Text style={styles.todoEditLabel}>משך מוערך בדקות</Text>
                          <TextInput
                            style={styles.textInput}
                            keyboardType="number-pad"
                            defaultValue={entry.task.expectedDurationMinutes !== null ? String(entry.task.expectedDurationMinutes) : ""}
                            onEndEditing={(event) => handleSetTodoDuration(entry.task.id, event.nativeEvent.text)}
                            textAlign="right"
                            placeholder="רשות"
                          />
                        </View>
                      )}
                    </View>
                  );
                })}

                <View style={styles.addTodoRow}>
                  <Pressable style={styles.addButton} onPress={handleAddTodo}>
                    <Text style={styles.addButtonText}>הוספה</Text>
                  </Pressable>
                  <TextInput
                    style={[styles.textInput, styles.flexInput]}
                    value={newTodoTitle}
                    onChangeText={setNewTodoTitle}
                    textAlign="right"
                    placeholder="פריט To-Do חדש"
                  />
                </View>

                <Pressable style={styles.addScheduledButton} onPress={() => setShowBankPicker((shown) => !shown)}>
                  <Text style={styles.addScheduledButtonText}>+ הוסף מהמאגר</Text>
                </Pressable>
                {showBankPicker && (
                  <View>
                    {bankItems.length === 0 && <Text style={styles.hint}>המאגר ריק -- אפשר להוסיף משימות למאגר מהשבוע הקבוע.</Text>}
                    {listActiveTodoBankItems(bankItems).map((bankItem) => (
                      <Pressable key={bankItem.id} style={styles.todoRow} onPress={() => handleAddFromBank(bankItem)}>
                        <Text style={styles.todoTitle}>{bankItem.title}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            ) : (
              <>
                <Pressable style={styles.addScheduledButton} onPress={handleAddScheduledTask}>
                  <Text style={styles.addScheduledButtonText}>+ הוסף משימה מתוזמנת</Text>
                </Pressable>

                {scheduled.length === 0 && <Text style={styles.hint}>אין משימות מתוזמנות לתאריך הזה.</Text>}
                {scheduled.map((entry) => {
                  const draft = rowDrafts[entry.task.id] ?? { scheduledTime: "", durationMinutes: "" };
                  return (
                    <View key={entry.task.id} style={styles.scheduledRow}>
                      <Text style={styles.todoTitle}>{entry.task.title}</Text>
                      <View style={styles.scheduledEditRow}>
                        <Text style={styles.todoEditLabel}>שעה</Text>
                        <TextInput
                          style={styles.timeInput}
                          value={draft.scheduledTime}
                          onChangeText={(text) => setRowDrafts((prev) => ({ ...prev, [entry.task.id]: { ...draft, scheduledTime: text } }))}
                          textAlign="right"
                          placeholder="09:30"
                        />
                        <Text style={styles.todoEditLabel}>דקות</Text>
                        <TextInput
                          style={styles.timeInput}
                          keyboardType="number-pad"
                          value={draft.durationMinutes}
                          onChangeText={(text) => setRowDrafts((prev) => ({ ...prev, [entry.task.id]: { ...draft, durationMinutes: text } }))}
                          textAlign="right"
                          placeholder="30"
                        />
                        <Pressable style={styles.entryActionButton} onPress={() => handleSaveScheduledRow(entry)}>
                          <Text style={styles.entryActionText}>שמור</Text>
                        </Pressable>
                        <Pressable style={styles.entryActionButton} onPress={() => confirmRemoveScheduled(entry)}>
                          <Text style={styles.entryActionTextRemove}>הסר</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>

          <View style={styles.modalButtonRow}>
            <Pressable style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>ביטול</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={onClose}>
              <Text style={styles.actionButtonText}>שמירה</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 16, maxHeight: "85%" },
  modalTitle: { fontSize: 18, fontWeight: "700", textAlign: "right", marginBottom: 10 },
  tabRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginBottom: 10 },
  tabChip: { backgroundColor: "#F0F0F0", borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  tabChipSelected: { backgroundColor: "#0a7ea4" },
  tabChipText: { fontSize: 14, color: "#444" },
  tabChipTextSelected: { color: "#fff", fontWeight: "600" },
  scrollArea: { maxHeight: "70%" },
  hint: { fontSize: 13, color: "#666", textAlign: "right" },
  resortButton: { backgroundColor: "#E6F4FE", borderRadius: 8, paddingVertical: 8, alignItems: "center", marginBottom: 10 },
  resortButtonText: { color: "#0a7ea4", fontSize: 13, fontWeight: "600" },
  todoRow: { borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 10 },
  todoRowHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  todoOrdinal: { fontSize: 14, fontWeight: "700", color: "#0a7ea4" },
  todoTitle: { fontSize: 15, color: "#222", textAlign: "right", flexShrink: 1 },
  todoMeta: { fontSize: 12, color: "#666", textAlign: "right", marginTop: 2 },
  todoActionsRow: { flexDirection: "row-reverse", alignItems: "center", gap: 10, marginTop: 6 },
  entryActionButton: { paddingVertical: 4, paddingHorizontal: 8 },
  entryActionText: { color: "#0a7ea4", fontSize: 13 },
  entryActionTextRemove: { color: "#c0392b", fontSize: 13 },
  reorderArrow: { fontSize: 15, color: "#0a7ea4", paddingVertical: 2 },
  reorderArrowDisabled: { color: "#ccc" },
  todoEditBlock: { marginTop: 8, backgroundColor: "#FAFAFA", borderRadius: 8, padding: 8 },
  todoEditLabel: { fontSize: 12, color: "#444", textAlign: "right", marginTop: 6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 6, marginTop: 4 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 13 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 8, fontSize: 14, marginTop: 4 },
  flexInput: { flex: 1 },
  addTodoRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  addButton: { backgroundColor: "#0a7ea4", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  addButtonText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  addScheduledButton: { backgroundColor: "#0a7ea4", borderRadius: 8, paddingVertical: 10, alignItems: "center", marginBottom: 10 },
  addScheduledButtonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  scheduledRow: { borderBottomWidth: 1, borderBottomColor: "#eee", paddingVertical: 10 },
  scheduledEditRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 6 },
  timeInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 6, fontSize: 13, width: 64 },
  modalButtonRow: { flexDirection: "row-reverse", justifyContent: "flex-start", gap: 10, marginTop: 14 },
  secondaryButton: { paddingVertical: 10, paddingHorizontal: 14 },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 14, fontWeight: "600" },
  actionButton: { backgroundColor: "#0a7ea4", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  actionButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
});
