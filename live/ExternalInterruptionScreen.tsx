import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { EXTERNAL_INTERRUPTION_CHOICE_LABELS, EXTERNAL_INTERRUPTION_CHOICES } from "../arc/taskSupportRoutes.ts";
import type { ExternalInterruptionChoice } from "../arc/taskSupportRoutes.ts";
import { generateTaskJournalEntryId } from "../arc/tasks.ts";
import { appendTaskJournalEntry } from "../data/storage.ts";
import { createTaskJournalEntry } from "../data/taskJournal.ts";

/**
 * live/ExternalInterruptionScreen.tsx (route /tasks/[id]/factor/interruption)
 *
 * Productivity roadmap, Stage U: an external interruption -- resolve
 * it now, reschedule, protect focus and continue, or return later.
 * "Reschedule"/"return later" both open the task's own existing
 * postpone prompt (`openPostpone=1`, Stage J) rather than a duplicated
 * postponement UI; "protect focus" resumes the task directly
 * (`autoStart=1`); "resolve now" simply opens the task without
 * starting the timer, so the trainee can handle the interruption
 * first.
 */
export default function ExternalInterruptionScreen({ taskId }: { taskId: string }) {
  function choose(choice: ExternalInterruptionChoice) {
    const now = new Date().toISOString();
    appendTaskJournalEntry(
      createTaskJournalEntry({
        id: generateTaskJournalEntryId(),
        taskId,
        kind: "protocol_run_completed",
        occurredAt: now,
        createdAt: now,
        interferenceCategory: "externalInterruption",
        returnedToTask: choice === "resolveNow" || choice === "protectFocus",
      })
    );
    switch (choice) {
      case "resolveNow":
        router.replace({ pathname: "/tasks/[id]", params: { id: taskId } });
        return;
      case "protectFocus":
        router.replace({ pathname: "/tasks/[id]", params: { id: taskId, autoStart: "1" } });
        return;
      case "reschedule":
      case "returnLater":
        router.replace({ pathname: "/tasks/[id]", params: { id: taskId, openPostpone: "1" } });
        return;
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.title}>מה מתאים לך עכשיו?</Text>
        {EXTERNAL_INTERRUPTION_CHOICES.map((choice) => (
          <Pressable key={choice} style={styles.optionRow} onPress={() => choose(choice)}>
            <Text style={styles.optionText}>{EXTERNAL_INTERRUPTION_CHOICE_LABELS[choice]}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  optionRow: { borderWidth: 1, borderColor: "#E6F4FE", borderRadius: 10, padding: 14, marginBottom: 10 },
  optionText: { fontSize: 16, textAlign: "right", color: "#0a7ea4" },
});
