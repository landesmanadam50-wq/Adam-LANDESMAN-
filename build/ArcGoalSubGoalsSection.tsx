import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";

import { deleteArcGoalTarget, loadArcGoalTargets, upsertArcGoalTarget } from "../data/storage.ts";
import { cancelArcGoalTargetNotification, reconcileArcGoalTargetNotification } from "../data/arcGoalTargetReminders.ts";
import { createEmptyArcGoalSubGoal, createEmptyArcGoalTarget, reorderSubGoals } from "../arc/subGoalExecution.ts";
import type { ArcGoal, ArcGoalSubGoal, ArcGoalTarget } from "../arc/types.ts";
import CollapsibleSection from "./CollapsibleSection.tsx";

const STATUS_LABELS = { locked: "נעול", active: "פעיל", completed: "הושלם" } as const;

/**
 * build/ArcGoalSubGoalsSection.tsx
 *
 * Sub-goal execution task, spec sections 2-3: BUILD-side add/edit/delete/
 * reorder for an ArcGoal's own ordered execution sub-goals and their
 * targets. Sub-goals are a plain field on ArcGoal (goal.subGoals) so
 * their edits go through the SAME deferred patchGoal/"שמור" flow as
 * every other BUILD field on this screen; ArcGoalTarget is flat-stored
 * (data/storage.ts), so target add/edit/delete/reminder-reconcile save
 * IMMEDIATELY here, exactly mirroring how arc/lifeManifest.ts's own
 * nested SubGoal vs. flat Target split already works. "Reordering...
 * without breaking saved target links" holds automatically: targets
 * reference subGoalId, which reorderSubGoals never touches.
 */
export default function ArcGoalSubGoalsSection(props: {
  goal: ArcGoal;
  onPatchGoal: (patch: Partial<ArcGoal>) => void;
}) {
  const { goal, onPatchGoal } = props;
  const subGoals = [...(goal.subGoals ?? [])].sort((a, b) => a.order - b.order);
  const [targets, setTargets] = useState<ArcGoalTarget[]>([]);
  const [confirmDeleteSubGoalId, setConfirmDeleteSubGoalId] = useState<string | null>(null);
  const [confirmDeleteTargetId, setConfirmDeleteTargetId] = useState<string | null>(null);

  const reloadTargets = useCallback(() => {
    loadArcGoalTargets().then((all) => setTargets(all.filter((t) => t.arcGoalId === goal.id)));
  }, [goal.id]);

  useEffect(() => {
    reloadTargets();
  }, [reloadTargets]);

  function addSubGoal() {
    const now = new Date().toISOString();
    const newSubGoal = createEmptyArcGoalSubGoal(goal.id, subGoals.length, now);
    onPatchGoal({ subGoals: [...(goal.subGoals ?? []), newSubGoal] });
  }

  function updateSubGoal(id: string, patch: Partial<ArcGoalSubGoal>) {
    onPatchGoal({ subGoals: (goal.subGoals ?? []).map((s) => (s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s)) });
  }

  function deleteSubGoal(id: string) {
    onPatchGoal({ subGoals: (goal.subGoals ?? []).filter((s) => s.id !== id) });
    setConfirmDeleteSubGoalId(null);
    // Orphaned targets under a deleted sub-goal are cleaned up too --
    // never left dangling with a subGoalId that resolves to nothing.
    targets.filter((t) => t.subGoalId === id).forEach((t) => deleteTarget(t, true));
  }

  function moveSubGoal(id: string, direction: -1 | 1) {
    const index = subGoals.findIndex((s) => s.id === id);
    const swapWith = index + direction;
    if (index === -1 || swapWith < 0 || swapWith >= subGoals.length) return;
    const orderedIds = subGoals.map((s) => s.id);
    [orderedIds[index], orderedIds[swapWith]] = [orderedIds[swapWith], orderedIds[index]];
    const reordered = reorderSubGoals(goal, orderedIds, new Date().toISOString());
    onPatchGoal({ subGoals: reordered.subGoals });
  }

  async function addTarget(subGoalId: string) {
    const now = new Date().toISOString();
    const target = createEmptyArcGoalTarget(goal.id, subGoalId, now);
    await upsertArcGoalTarget(target);
    reloadTargets();
  }

  async function updateTarget(target: ArcGoalTarget, patch: Partial<ArcGoalTarget>) {
    const updated = { ...target, ...patch, updatedAt: new Date().toISOString() };
    const reconciled = await reconcileArcGoalTargetNotification(updated);
    await upsertArcGoalTarget(reconciled);
    reloadTargets();
  }

  async function deleteTarget(target: ArcGoalTarget, skipConfirmClear = false) {
    await cancelArcGoalTargetNotification(target);
    await deleteArcGoalTarget(target.id);
    if (!skipConfirmClear) setConfirmDeleteTargetId(null);
    reloadTargets();
  }

  return (
    <View>
      <Text style={styles.hint}>
        תת־מטרות מסודרות עם יעדים קונקרטיים לביצוע לאחר סיום תוכנית ארבעת השבועות. רק תת־מטרה אחת פעילה בכל רגע נתון.
      </Text>
      {subGoals.map((subGoal, index) => (
        <CollapsibleSection key={subGoal.id} title={`${subGoal.name || "תת־מטרה חדשה"} (${STATUS_LABELS[subGoal.status]})`}>
          <View style={styles.sectionBody}>
            <Text style={styles.fieldLabel}>שם תת־המטרה</Text>
            <TextInput style={styles.textInput} value={subGoal.name} onChangeText={(text) => updateSubGoal(subGoal.id, { name: text })} textAlign="right" />
            <Text style={styles.fieldLabel}>תיאור (רשות)</Text>
            <TextInput
              style={styles.textInput}
              value={subGoal.description ?? ""}
              onChangeText={(text) => updateSubGoal(subGoal.id, { description: text.trim().length > 0 ? text : null })}
              textAlign="right"
              multiline
            />
            <Text style={styles.fieldLabel}>תאריך התחלה מתוכנן (YYYY-MM-DD, רשות)</Text>
            <TextInput
              style={styles.textInput}
              value={subGoal.plannedStartDate ?? ""}
              onChangeText={(text) => updateSubGoal(subGoal.id, { plannedStartDate: text.trim().length > 0 ? text : null })}
              textAlign="right"
            />
            <Text style={styles.fieldLabel}>תאריך סיום מתוכנן (YYYY-MM-DD, רשות)</Text>
            <TextInput
              style={styles.textInput}
              value={subGoal.plannedCompletionDate ?? ""}
              onChangeText={(text) => updateSubGoal(subGoal.id, { plannedCompletionDate: text.trim().length > 0 ? text : null })}
              textAlign="right"
            />

            <View style={styles.chipRow}>
              <Pressable style={styles.actionButton} onPress={() => moveSubGoal(subGoal.id, -1)} disabled={index === 0}>
                <Text style={[styles.actionButtonText, index === 0 && styles.disabledText]}>הזז למעלה</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={() => moveSubGoal(subGoal.id, 1)} disabled={index === subGoals.length - 1}>
                <Text style={[styles.actionButtonText, index === subGoals.length - 1 && styles.disabledText]}>הזז למטה</Text>
              </Pressable>
            </View>

            <Text style={styles.subTitle}>יעדים בתת־מטרה זו</Text>
            {targets
              .filter((t) => t.subGoalId === subGoal.id)
              .map((target) => (
                <TargetEditorCard
                  key={target.id}
                  target={target}
                  onUpdate={(patch) => updateTarget(target, patch)}
                  confirmingDelete={confirmDeleteTargetId === target.id}
                  onRequestDelete={() => setConfirmDeleteTargetId(target.id)}
                  onCancelDelete={() => setConfirmDeleteTargetId(null)}
                  onConfirmDelete={() => deleteTarget(target)}
                />
              ))}
            <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => addTarget(subGoal.id)}>
              <Text style={styles.buttonText}>+ הוסף יעד</Text>
            </Pressable>

            {confirmDeleteSubGoalId === subGoal.id ? (
              <View style={styles.confirmRow}>
                <Text style={styles.confirmText}>למחוק את תת־המטרה ואת כל יעדיה?</Text>
                <Pressable style={styles.removeButton} onPress={() => deleteSubGoal(subGoal.id)}>
                  <Text style={styles.deleteText}>כן, למחוק</Text>
                </Pressable>
                <Pressable style={styles.actionButton} onPress={() => setConfirmDeleteSubGoalId(null)}>
                  <Text style={styles.actionButtonText}>ביטול</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={styles.removeButton} onPress={() => setConfirmDeleteSubGoalId(subGoal.id)}>
                <Text style={styles.deleteText}>מחק תת־מטרה</Text>
              </Pressable>
            )}
          </View>
        </CollapsibleSection>
      ))}
      <Pressable style={[styles.button, styles.fullWidthButton]} onPress={addSubGoal}>
        <Text style={styles.buttonText}>+ הוסף תת־מטרה</Text>
      </Pressable>
      {goal.phase === "execution" && (
        <Pressable style={[styles.button, styles.secondaryButton, styles.fullWidthButton]} onPress={() => router.push({ pathname: "/goals/execution/[goalId]", params: { goalId: goal.id } })}>
          <Text style={styles.secondaryButtonText}>ללוח הביצוע</Text>
        </Pressable>
      )}
    </View>
  );
}

function TargetEditorCard(props: {
  target: ArcGoalTarget;
  onUpdate: (patch: Partial<ArcGoalTarget>) => void;
  confirmingDelete: boolean;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const { target, onUpdate, confirmingDelete, onRequestDelete, onCancelDelete, onConfirmDelete } = props;
  return (
    <View style={styles.targetCard}>
      <Text style={styles.fieldLabel}>שם היעד</Text>
      <TextInput style={styles.textInput} value={target.name} onChangeText={(text) => onUpdate({ name: text })} textAlign="right" />
      <Text style={styles.fieldLabel}>תיאור הפעולה (רשות)</Text>
      <TextInput
        style={styles.textInput}
        value={target.actionDescription ?? ""}
        onChangeText={(text) => onUpdate({ actionDescription: text.trim().length > 0 ? text : null })}
        textAlign="right"
        multiline
      />
      <Text style={styles.fieldLabel}>תאריך מתוכנן (YYYY-MM-DD)</Text>
      <TextInput style={styles.textInput} value={target.plannedDate ?? ""} onChangeText={(text) => onUpdate({ plannedDate: text.trim().length > 0 ? text : null })} textAlign="right" />
      <Text style={styles.fieldLabel}>שעה מתוכננת (HH:MM, רשות)</Text>
      <TextInput style={styles.textInput} value={target.plannedTime ?? ""} onChangeText={(text) => onUpdate({ plannedTime: text.trim().length > 0 ? text : null })} textAlign="right" />
      <Text style={styles.fieldLabel}>מיקום (רשות)</Text>
      <TextInput style={styles.textInput} value={target.location ?? ""} onChangeText={(text) => onUpdate({ location: text.trim().length > 0 ? text : null })} textAlign="right" />
      <Text style={styles.fieldLabel}>משך בדקות (רשות)</Text>
      <TextInput
        style={styles.textInput}
        value={target.durationMinutes !== null ? String(target.durationMinutes) : ""}
        onChangeText={(text) => onUpdate({ durationMinutes: text.trim().length > 0 && !Number.isNaN(Number(text)) ? Number(text) : null })}
        textAlign="right"
        keyboardType="number-pad"
      />
      <View style={styles.switchRow}>
        <Pressable style={styles.chip} onPress={() => onUpdate({ remindersEnabled: !target.remindersEnabled })}>
          <Text style={styles.chipText}>{target.remindersEnabled ? "תזכורות: פעיל" : "תזכורות: כבוי"}</Text>
        </Pressable>
      </View>

      {confirmingDelete ? (
        <View style={styles.confirmRow}>
          <Text style={styles.confirmText}>למחוק את היעד?</Text>
          <Pressable style={styles.removeButton} onPress={onConfirmDelete}>
            <Text style={styles.deleteText}>כן, למחוק</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={onCancelDelete}>
            <Text style={styles.actionButtonText}>ביטול</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.removeButton} onPress={onRequestDelete}>
          <Text style={styles.deleteText}>מחק יעד</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, textAlign: "right", color: "#666", marginBottom: 12 },
  sectionBody: { padding: 14, gap: 4 },
  fieldLabel: { fontSize: 13, textAlign: "right", color: "#666", marginTop: 8 },
  subTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", marginTop: 16, marginBottom: 8 },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, alignItems: "center" },
  secondaryButton: { backgroundColor: "#3d8fa8" },
  fullWidthButton: { marginTop: 12 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, alignItems: "center" },
  chipText: { color: "#0a7ea4", fontSize: 14 },
  chipRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  switchRow: { marginTop: 8 },
  targetCard: { borderWidth: 1, borderColor: "#E6F4FE", borderRadius: 10, padding: 12, marginBottom: 12 },
  removeButton: { marginTop: 12, alignItems: "center" },
  deleteText: { color: "#c0392b", fontSize: 14 },
  actionButton: { paddingVertical: 8, paddingHorizontal: 10, marginTop: 4 },
  actionButtonText: { color: "#0a7ea4", fontSize: 14 },
  disabledText: { color: "#ccc" },
  confirmRow: { marginTop: 12, alignItems: "center", gap: 4 },
  confirmText: { fontSize: 13, textAlign: "right", color: "#c0392b" },
});
