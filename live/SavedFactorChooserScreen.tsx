import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { loadBeliefArcs, loadThoughtArcs, loadUrgeArcs } from "../data/storage.ts";
import type { BeliefArc, ThoughtArc, UrgeArc } from "../arc/types.ts";

export type SavedFactorKind = "urge" | "thought" | "belief";

const KIND_TITLES: Record<SavedFactorKind, string> = {
  urge: "אילו דחפים שמורים יש לך?",
  thought: "אילו מחשבות שמורות יש לך?",
  belief: "אילו אמונות שמורות יש לך?",
};

const KIND_EMPTY_HINTS: Record<SavedFactorKind, string> = {
  urge: "אין לך עדיין דחפים שמורים.",
  thought: "אין לך עדיין מחשבות שמורות.",
  belief: "אין לך עדיין אמונות שמורות.",
};

const KIND_LIVE_ROUTE: Record<SavedFactorKind, string> = {
  urge: "/urge-arcs/live/[id]",
  thought: "/thought-arcs/live/[id]",
  belief: "/belief-arcs/live/[id]",
};

type SavedItem = UrgeArc | ThoughtArc | BeliefArc;

/**
 * live/SavedFactorChooserScreen.tsx (route /tasks/[id]/factor/saved)
 *
 * Productivity roadmap, Stages P/R/S: "saved [urge/thought/belief]
 * protocols are personal and should be built in BUILD, then selected
 * in LIVE." One shared screen for all three kinds -- they are
 * structurally identical at this level (load the trainee's own saved
 * list, pick one, practice it, return to the task) -- reusing the
 * EXISTING UrgeArc/ThoughtArc/BeliefArc list/LIVE screens' own data,
 * never a parallel storage or a re-implemented protocol engine. Each
 * kind's own LIVE screen already supports `returnToTaskId` (Stages
 * P/R/S's own wiring in live/UrgeArcLiveScreen.tsx et al.) so
 * completing the saved protocol returns here... directly to the task.
 *
 * "New, not saved yet" always routes to live/NewFactorCaptureScreen.tsx
 * (Stages Q/T) rather than the full BUILD editor -- "do not force a
 * long BUILD process during the task."
 */
export default function SavedFactorChooserScreen({ taskId, factorKind }: { taskId: string; factorKind: SavedFactorKind }) {
  const [items, setItems] = useState<SavedItem[] | null>(null);

  const reload = useCallback(() => {
    const loader = factorKind === "urge" ? loadUrgeArcs : factorKind === "thought" ? loadThoughtArcs : loadBeliefArcs;
    loader().then(setItems);
  }, [factorKind]);

  useFocusEffect(reload);

  if (items === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{KIND_TITLES[factorKind]}</Text>

        {items.length === 0 && <Text style={styles.hint}>{KIND_EMPTY_HINTS[factorKind]}</Text>}

        {items.map((item) => (
          <Pressable
            key={item.id}
            style={styles.optionRow}
            onPress={() => router.push({ pathname: KIND_LIVE_ROUTE[factorKind] as "/urge-arcs/live/[id]", params: { id: item.id, returnToTaskId: taskId } })}
          >
            <Text style={styles.optionText}>{item.name}</Text>
          </Pressable>
        ))}

        <Pressable
          style={styles.secondaryButton}
          onPress={() => router.push({ pathname: "/tasks/[id]/factor/new", params: { id: taskId, factorKind } })}
        >
          <Text style={styles.secondaryButtonText}>משהו חדש, לא שמור</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  hint: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 16 },
  optionRow: { borderWidth: 1, borderColor: "#E6F4FE", borderRadius: 10, padding: 14, marginBottom: 10 },
  optionText: { fontSize: 16, textAlign: "right", color: "#0a7ea4" },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 12, borderRadius: 10, alignItems: "center", marginTop: 16 },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 15 },
});
