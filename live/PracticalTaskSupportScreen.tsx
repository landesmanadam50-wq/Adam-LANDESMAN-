import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { createEmptyPracticalTaskSupportAnswers, PRACTICAL_TASK_SUPPORT_START_MINUTES_OPTIONS } from "../arc/taskSupportRoutes.ts";
import type { PracticalTaskSupportAnswers } from "../arc/taskSupportRoutes.ts";
import { generateTaskJournalEntryId, setTaskCurrentAction } from "../arc/tasks.ts";
import type { Task } from "../arc/tasks.ts";
import { appendTaskJournalEntry, getTask, upsertTask } from "../data/storage.ts";
import { createTaskJournalEntry } from "../data/taskJournal.ts";

/**
 * live/PracticalTaskSupportScreen.tsx (route /tasks/[id]/factor/practical)
 *
 * Productivity roadmap, Stage U: "task too large or unclear" --
 * practical questions, never routed into an emotional ARC protocol.
 * Answering updates the task's own currentAction (never firstAction,
 * matching arc/tasks.ts's own setTaskCurrentAction doc) and, when a
 * start-time is chosen, its expectedDurationMinutes, then returns to
 * the task with that exact duration.
 */
export default function PracticalTaskSupportScreen({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<Task | null>(null);
  const [answers, setAnswers] = useState<PracticalTaskSupportAnswers>(createEmptyPracticalTaskSupportAnswers());

  useFocusEffect(
    useCallback(() => {
      getTask(taskId).then(setTask);
    }, [taskId])
  );

  if (!task) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  async function finish() {
    if (!task) return;
    const now = new Date().toISOString();
    const narrowed = answers.smallestNextAction.trim() ? setTaskCurrentAction(task, answers.smallestNextAction.trim(), now) : task;
    const updated = answers.startMinutes ? { ...narrowed, expectedDurationMinutes: answers.startMinutes, updatedAt: now } : narrowed;
    await upsertTask(updated);
    await appendTaskJournalEntry(
      createTaskJournalEntry({
        id: generateTaskJournalEntryId(),
        taskId,
        kind: "protocol_run_completed",
        occurredAt: now,
        createdAt: now,
        interferenceCategory: "taskTooLarge",
        returnedToTask: true,
      })
    );
    router.replace({ pathname: "/tasks/[id]", params: { id: taskId, autoStart: "1" } });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>בירור קצר על המשימה</Text>

        <Field label="איזו תוצאה נדרשת?">
          <TextInput style={styles.textInput} value={answers.neededResult} onChangeText={(v) => setAnswers({ ...answers, neededResult: v })} textAlign="right" />
        </Field>
        <Field label="מה לא ברור?">
          <TextInput style={styles.textInput} value={answers.unclearPart} onChangeText={(v) => setAnswers({ ...answers, unclearPart: v })} textAlign="right" />
        </Field>
        <Field label="מה חסר?">
          <TextInput style={styles.textInput} value={answers.missingPart} onChangeText={(v) => setAnswers({ ...answers, missingPart: v })} textAlign="right" />
        </Field>
        <Field label="אפשר לחלק את המשימה?">
          <View style={styles.chipRow}>
            <Pressable style={[styles.chip, answers.canDivide === true && styles.chipSelected]} onPress={() => setAnswers({ ...answers, canDivide: true })}>
              <Text style={styles.chipText}>כן</Text>
            </Pressable>
            <Pressable style={[styles.chip, answers.canDivide === false && styles.chipSelected]} onPress={() => setAnswers({ ...answers, canDivide: false })}>
              <Text style={styles.chipText}>לא</Text>
            </Pressable>
          </View>
        </Field>
        <Field label="מה הפעולה הקטנה הבאה?">
          <TextInput
            style={styles.textInput}
            value={answers.smallestNextAction}
            onChangeText={(v) => setAnswers({ ...answers, smallestNextAction: v })}
            textAlign="right"
          />
        </Field>
        <Field label="לכמה דקות תתחיל?">
          <View style={styles.chipRow}>
            {PRACTICAL_TASK_SUPPORT_START_MINUTES_OPTIONS.map((minutes) => (
              <Pressable
                key={minutes}
                style={[styles.chip, answers.startMinutes === minutes && styles.chipSelected]}
                onPress={() => setAnswers({ ...answers, startMinutes: minutes })}
              >
                <Text style={styles.chipText}>{minutes} דק&apos;</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Pressable style={styles.primaryButton} onPress={finish}>
          <Text style={styles.primaryButtonText}>התחלת המשימה</Text>
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
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  fieldBlock: { marginBottom: 14 },
  fieldLabel: { fontSize: 14, fontWeight: "600", textAlign: "right", marginBottom: 6, color: "#444" },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 14 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 16 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
