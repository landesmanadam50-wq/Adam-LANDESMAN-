import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { buildPostponedTask, createEmptyPostponementDraft } from "../arc/postponementDraft.ts";
import type { PostponementCategory, PostponementDraft } from "../arc/postponementDraft.ts";
import { PREPARATION_STATE_IDS, PREPARATION_STATE_LABELS } from "../arc/preparationStates.ts";
import { generateTaskJournalEntryId } from "../arc/tasks.ts";
import type { Task } from "../arc/tasks.ts";
import { appendTaskJournalEntry, clearTaskTimerRun, getTask, loadTaskTimerRun, upsertTask } from "../data/storage.ts";
import { createTaskJournalEntry } from "../data/taskJournal.ts";
import { cancelScheduledNotification, scheduleReminderNotification } from "../data/notifications.ts";

const CATEGORY_OPTIONS: PostponementCategory[] = ["practical", "internal"];
const CATEGORY_LABELS: Record<PostponementCategory, string> = { practical: "סיבה מעשית", internal: "סיבה פנימית" };

/**
 * live/PostponementScreen.tsx (route /tasks/[id]/postpone)
 *
 * Productivity roadmap, Stage W: the full postponement question flow,
 * replacing ActiveTaskScreen.tsx's own previous bare "reason text only"
 * prompt. "A postponed task must receive either a defined return
 * date/time or explicit movement to the unscheduled list -- never
 * silently lost" (arc/postponementDraft.ts's own resolvePostponementReturnAt
 * enforces this: "unscheduled" is itself a real, explicit, valid
 * answer, never a fallback for a missed question).
 */
export default function PostponementScreen({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<Task | null>(null);
  const [draft, setDraft] = useState<PostponementDraft>(createEmptyPostponementDraft());

  useFocusEffect(
    useCallback(() => {
      getTask(taskId).then(setTask);
    }, [taskId])
  );

  if (!task) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  async function confirm() {
    if (!task) return;
    const now = new Date().toISOString();
    const existingRun = await loadTaskTimerRun();
    if (existingRun && existingRun.taskId === taskId) {
      await cancelScheduledNotification(existingRun.notificationId);
      await clearTaskTimerRun();
    }
    // A task postponed before can already carry a stale "return" notification (from that earlier postponement) -- cancel it before scheduling the new one, never stacking two.
    await cancelScheduledNotification(task.notificationId);
    const postponedDraft = buildPostponedTask(task, draft, now);
    const notificationId = postponedDraft.returnAt
      ? await scheduleReminderNotification({
          kind: "postponedTaskReturn",
          fireAt: new Date(postponedDraft.returnAt),
          title: "זמן לחזור למשימה",
          body: task.title,
          arcRequested: false,
          taskId,
        })
      : null;
    const postponed = { ...postponedDraft, notificationId, notificationScheduledFor: postponedDraft.returnAt };
    await upsertTask(postponed);
    await appendTaskJournalEntry(
      createTaskJournalEntry({
        id: generateTaskJournalEntryId(),
        taskId,
        kind: "postponed",
        occurredAt: now,
        createdAt: now,
        postponementReason: postponed.postponementReason,
        returnAt: postponed.returnAt,
      })
    );
    if (draft.wantsArcNow) {
      router.replace({ pathname: "/live/select", params: { returnToTaskId: taskId } });
      return;
    }
    router.replace("/tasks");
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>דחיית המשימה</Text>

        <Field label="מדוע אתה דוחה את המשימה? (רשות)">
          <TextInput style={styles.textInput} value={draft.reason} onChangeText={(v) => setDraft({ ...draft, reason: v })} textAlign="right" multiline />
        </Field>

        <Field label="זו סיבה מעשית או פנימית?">
          <View style={styles.chipRow}>
            {CATEGORY_OPTIONS.map((category) => (
              <Pressable
                key={category}
                style={[styles.chip, draft.category === category && styles.chipSelected]}
                onPress={() => setDraft({ ...draft, category })}
              >
                <Text style={styles.chipText}>{CATEGORY_LABELS[category]}</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Field label="מתי תחזור למשימה?">
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, draft.returnChoice === "unscheduled" && styles.chipSelected]}
              onPress={() => setDraft({ ...draft, returnChoice: "unscheduled" })}
            >
              <Text style={styles.chipText}>עדיין לא ידוע -- ללא תזמון</Text>
            </Pressable>
            <Pressable
              style={[styles.chip, draft.returnChoice === "specificTime" && styles.chipSelected]}
              onPress={() => setDraft({ ...draft, returnChoice: "specificTime" })}
            >
              <Text style={styles.chipText}>מועד מוגדר</Text>
            </Pressable>
          </View>
          {draft.returnChoice === "specificTime" && (
            <View style={styles.chipRow}>
              <TextInput
                style={[styles.textInput, styles.inlineInput]}
                value={draft.returnDate}
                onChangeText={(v) => setDraft({ ...draft, returnDate: v })}
                placeholder="2026-01-10"
                textAlign="right"
              />
              <TextInput
                style={[styles.textInput, styles.inlineInput]}
                value={draft.returnTime}
                onChangeText={(v) => setDraft({ ...draft, returnTime: v })}
                placeholder="09:00"
                textAlign="right"
              />
            </View>
          )}
        </Field>

        <Field label="מה הפעולה הראשונה כשתחזור? (רשות)">
          <TextInput
            style={styles.textInput}
            value={draft.firstActionOnReturn}
            onChangeText={(v) => setDraft({ ...draft, firstActionOnReturn: v })}
            textAlign="right"
          />
        </Field>

        <Field label="רוצה לעשות ARC עכשיו?">
          <View style={styles.chipRow}>
            <Pressable style={[styles.chip, draft.wantsArcNow && styles.chipSelected]} onPress={() => setDraft({ ...draft, wantsArcNow: true })}>
              <Text style={styles.chipText}>כן</Text>
            </Pressable>
            <Pressable style={[styles.chip, !draft.wantsArcNow && styles.chipSelected]} onPress={() => setDraft({ ...draft, wantsArcNow: false })}>
              <Text style={styles.chipText}>לא</Text>
            </Pressable>
          </View>
        </Field>

        <Field label="איזה מצב תומך יכול לעזור בפעם הבאה? (רשות)">
          <View style={styles.chipRow}>
            {PREPARATION_STATE_IDS.map((stateId) => (
              <Pressable
                key={stateId}
                style={[styles.chip, draft.supportiveStateForNextTime === stateId && styles.chipSelected]}
                onPress={() => setDraft({ ...draft, supportiveStateForNextTime: stateId })}
              >
                <Text style={styles.chipText}>{PREPARATION_STATE_LABELS[stateId]}</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Pressable style={styles.primaryButton} onPress={confirm}>
          <Text style={styles.primaryButtonText}>אישור דחייה</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 24 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  fieldBlock: { marginBottom: 16 },
  fieldLabel: { fontSize: 14, fontWeight: "600", textAlign: "right", marginBottom: 6, color: "#444" },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  inlineInput: { flex: 1 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginTop: 4 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 14 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 12 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
