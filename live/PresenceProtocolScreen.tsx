import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { getEmbeddedPresenceSteps, resolvePresenceStageCount } from "../arc/taskSupportRoutes.ts";
import { generateTaskJournalEntryId } from "../arc/tasks.ts";
import { appendTaskJournalEntry } from "../data/storage.ts";
import { createTaskJournalEntry } from "../data/taskJournal.ts";

type Phase = { step: "rating" } | { step: "steps"; index: number; steps: string[] };

/**
 * live/PresenceProtocolScreen.tsx (route /tasks/[id]/factor/presence)
 *
 * Productivity roadmap, Stage U: presence/focus difficulty. A single
 * 0-10 rating decides how many of the short embedded-Presence steps to
 * run (arc/taskSupportRoutes.ts's resolvePresenceStageCount) --
 * "retain editable dwell times" is tracked as a known scope limit for
 * this pass (fixed safe defaults, no configuration UI yet).
 */
export default function PresenceProtocolScreen({ taskId }: { taskId: string }) {
  const [phase, setPhase] = useState<Phase>({ step: "rating" });

  function openTask() {
    const now = new Date().toISOString();
    appendTaskJournalEntry(
      createTaskJournalEntry({
        id: generateTaskJournalEntryId(),
        taskId,
        kind: "protocol_run_completed",
        occurredAt: now,
        createdAt: now,
        interferenceCategory: "presence",
        returnedToTask: true,
      })
    );
    router.replace({ pathname: "/tasks/[id]", params: { id: taskId, autoStart: "1" } });
  }

  if (phase.step === "rating") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>כמה נוכחות/ריכוז יש לך כרגע? (0 = בכלל לא, 10 = מלא)</Text>
          <View style={styles.chipRow}>
            {Array.from({ length: 11 }, (_, rating) => rating).map((rating) => (
              <Pressable
                key={rating}
                style={styles.chip}
                onPress={() => {
                  const stageCount = resolvePresenceStageCount(rating);
                  const steps = getEmbeddedPresenceSteps(stageCount);
                  if (steps.length === 0) {
                    openTask();
                    return;
                  }
                  setPhase({ step: "steps", index: 0, steps });
                }}
              >
                <Text style={styles.chipText}>{rating}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const { index, steps } = phase;
  const isLastStep = index >= steps.length - 1;
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.body}>{steps[index]}</Text>
        <Pressable style={styles.primaryButton} onPress={() => (isLastStep ? openTask() : setPhase({ step: "steps", index: index + 1, steps }))}>
          <Text style={styles.primaryButtonText}>{isLastStep ? "התחלת המשימה" : "המשך"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  body: { fontSize: 18, textAlign: "right", lineHeight: 27, marginBottom: 28 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 13, paddingHorizontal: 14, borderRadius: 8, minWidth: 44, alignItems: "center" },
  chipText: { color: "#0a7ea4", fontSize: 14, fontWeight: "600" },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 12 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
