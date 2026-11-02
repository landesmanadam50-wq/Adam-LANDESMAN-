import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { getNeutralRegulationActionStep, getNeutralRegulationNoticingSteps } from "../arc/neutralRegulation.ts";
import { PREPARATION_STATE_IDS, PREPARATION_STATE_LABELS } from "../arc/preparationStates.ts";
import type { PreparationStateId } from "../arc/preparationStates.ts";
import { generateTaskJournalEntryId } from "../arc/tasks.ts";
import type { Task } from "../arc/tasks.ts";
import { appendTaskJournalEntry, getTask } from "../data/storage.ts";
import { createTaskJournalEntry } from "../data/taskJournal.ts";

type Phase = { step: "notice"; index: number } | { step: "stateChoice" } | { step: "action" };

/**
 * live/NeutralRegulationScreen.tsx (route /tasks/[id]/factor/neutral)
 *
 * Productivity roadmap, Stage O: the neutral, ready-made protocol for
 * when a factor is unidentified, unknown, or declined a name --
 * "do not block the user because an emotion was not identified." Also
 * reused directly as the fallback for Stage Q (new/unmatched urge) and
 * Stages R/S (new/unmatched thought or belief) per the product spec's
 * own repeated instruction, rather than building a near-duplicate
 * screen for each. Content is pure (arc/neutralRegulation.ts); the
 * supportive-state choice step reuses arc/preparationStates.ts's exact
 * 8 predefined chips -- selecting one is optional and informational
 * only (never re-running the full preparation flow, which stays Stage
 * K's own job), just like the spec's own "a supportive state" step.
 */
export default function NeutralRegulationScreen({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<Task | null>(null);
  const [phase, setPhase] = useState<Phase>({ step: "notice", index: 0 });
  const [chosenState, setChosenState] = useState<PreparationStateId | null>(null);

  useFocusEffect(
    useCallback(() => {
      getTask(taskId).then(setTask);
    }, [taskId])
  );

  function openTask() {
    const now = new Date().toISOString();
    appendTaskJournalEntry(
      createTaskJournalEntry({
        id: generateTaskJournalEntryId(),
        taskId,
        kind: "protocol_run_completed",
        occurredAt: now,
        createdAt: now,
        interferenceCategory: "unknown",
        returnedToTask: true,
      })
    );
    router.replace({ pathname: "/tasks/[id]", params: { id: taskId, autoStart: "1" } });
  }

  if (!task) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const noticingSteps = getNeutralRegulationNoticingSteps();

  if (phase.step === "notice") {
    const isLastNoticingStep = phase.index >= noticingSteps.length - 1;
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.body}>{noticingSteps[phase.index]}</Text>
          <Pressable
            style={styles.primaryButton}
            onPress={() => (isLastNoticingStep ? setPhase({ step: "stateChoice" }) : setPhase({ step: "notice", index: phase.index + 1 }))}
          >
            <Text style={styles.primaryButtonText}>המשך</Text>
          </Pressable>
          <Pressable style={styles.skipLink} onPress={openTask}>
            <Text style={styles.skipLinkText}>דלג והתחל</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (phase.step === "stateChoice") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>אפשר לבחור מצב תומך לרגע (רשות)</Text>
          <View style={styles.chipRow}>
            {PREPARATION_STATE_IDS.map((stateId) => (
              <Pressable
                key={stateId}
                style={[styles.chip, chosenState === stateId && styles.chipSelected]}
                onPress={() => setChosenState(stateId)}
              >
                <Text style={styles.chipText}>{PREPARATION_STATE_LABELS[stateId]}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.primaryButton} onPress={() => setPhase({ step: "action" })}>
            <Text style={styles.primaryButtonText}>המשך</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // phase.step === "action"
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.body}>{getNeutralRegulationActionStep(task.currentAction ?? task.firstAction)}</Text>
        <Pressable style={styles.primaryButton} onPress={openTask}>
          <Text style={styles.primaryButtonText}>התחלת המשימה</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, justifyContent: "center" },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  title: { fontSize: 18, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  body: { fontSize: 18, textAlign: "right", lineHeight: 27, marginBottom: 28 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginBottom: 20 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  chipSelected: { backgroundColor: "#0a7ea4" },
  chipText: { color: "#0a7ea4", fontSize: 14 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 12 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  skipLink: { marginTop: 20, alignItems: "center" },
  skipLinkText: { color: "#666", fontSize: 14 },
});
