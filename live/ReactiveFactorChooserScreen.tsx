import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { INTERFERING_FACTOR_CATEGORIES, INTERFERING_FACTOR_CATEGORY_LABELS, resolveReactiveFactorDestination } from "../arc/reactiveFactorChooser.ts";
import type { InterferingFactorCategory } from "../arc/reactiveFactorChooser.ts";
import { generateTaskJournalEntryId } from "../arc/tasks.ts";
import { appendTaskJournalEntry } from "../data/storage.ts";
import { createTaskJournalEntry } from "../data/taskJournal.ts";

/**
 * live/ReactiveFactorChooserScreen.tsx (route /tasks/[id]/factor)
 *
 * Productivity roadmap, Stage L: "what is interfering right now?" --
 * the reactive entry, reached from an active task ("משהו
 * מפריע"/"בוא נעשה ARC עכשיו" on live/ActiveTaskScreen.tsx). The
 * trainee picks ONE of 9 fixed categories; routing is a pure function
 * (arc/reactiveFactorChooser.ts's resolveReactiveFactorDestination) --
 * never free-text classification. This screen only renders the
 * choice and navigates to whichever real screen that function names.
 */
export default function ReactiveFactorChooserScreen({ taskId }: { taskId: string }) {
  function choose(category: InterferingFactorCategory) {
    const now = new Date().toISOString();
    appendTaskJournalEntry(
      createTaskJournalEntry({ id: generateTaskJournalEntryId(), taskId, kind: "interference_reported", occurredAt: now, createdAt: now, interferenceCategory: category })
    );
    const destination = resolveReactiveFactorDestination(category);
    switch (destination.kind) {
      case "savedFactorChooser":
        router.push({ pathname: "/tasks/[id]/factor/saved", params: { id: taskId, factorKind: destination.factorKind } });
        return;
      case "emotionIdentification":
        router.push({ pathname: "/tasks/[id]/factor/emotion", params: { id: taskId } });
        return;
      case "neutralRegulation":
        router.push({ pathname: "/tasks/[id]/factor/neutral", params: { id: taskId } });
        return;
      case "presenceProtocol":
        router.push({ pathname: "/tasks/[id]/factor/presence", params: { id: taskId } });
        return;
      case "lowEnergy":
        router.push({ pathname: "/tasks/[id]/factor/energy", params: { id: taskId } });
        return;
      case "practicalTaskSupport":
        router.push({ pathname: "/tasks/[id]/factor/practical", params: { id: taskId } });
        return;
      case "externalInterruption":
        router.push({ pathname: "/tasks/[id]/factor/interruption", params: { id: taskId } });
        return;
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>מה מפריע לך כרגע?</Text>
        {INTERFERING_FACTOR_CATEGORIES.map((category) => (
          <Pressable key={category} style={styles.optionRow} onPress={() => choose(category)}>
            <Text style={styles.optionText}>{INTERFERING_FACTOR_CATEGORY_LABELS[category]}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 20 },
  optionRow: { borderWidth: 1, borderColor: "#E6F4FE", borderRadius: 10, padding: 14, marginBottom: 10 },
  optionText: { fontSize: 16, textAlign: "right", color: "#0a7ea4" },
});
