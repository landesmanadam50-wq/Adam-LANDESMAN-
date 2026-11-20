import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { PositiveMemory } from "../arc/positiveMemory.ts";
import { loadPositiveMemories } from "../data/storage.ts";

/**
 * build/PositiveMemoryListScreen.tsx (route /positive-memories)
 *
 * Positive Memory, Success Recall & Quick Capture task, section 2:
 * "allow users to... view events" -- every FINALIZED positive memory
 * (never a draft; drafts live in their own separate collection and
 * screen), newest-documented first.
 */
export default function PositiveMemoryListScreen() {
  const [memories, setMemories] = useState<PositiveMemory[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadPositiveMemories().then((loaded) => {
        setMemories([...loaded].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      });
    }, [])
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        contentContainerStyle={styles.content}
        data={memories}
        keyExtractor={(memory) => memory.id}
        ListEmptyComponent={<Text style={styles.hint}>אין עדיין אירועים מתועדים. לחץ על "הוסף אירוע חיובי" כדי להתחיל.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => router.push({ pathname: "/positive-memories/[id]", params: { id: item.id } })}>
            <Text style={styles.eventTypeLabel}>{item.eventType === "success" ? "💪 הצלחה" : "✨ תחושה חיובית"}</Text>
            <Text style={styles.cardTitle}>{item.title || "אירוע ללא כותרת"}</Text>
            {item.feelings.length > 0 && <Text style={styles.feelingsLine}>{item.feelings.map((f) => f.feeling).join(", ")}</Text>}
          </Pressable>
        )}
      />
      <Pressable style={styles.addButton} onPress={() => router.push("/positive-memories/new")}>
        <Text style={styles.addButtonText}>➕ הוסף אירוע חיובי</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, gap: 12 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  card: { borderWidth: 1, borderColor: "#D98324", borderRadius: 12, padding: 14, gap: 4 },
  eventTypeLabel: { fontSize: 12, color: "#D98324", textAlign: "right", fontWeight: "700" },
  cardTitle: { fontSize: 15, fontWeight: "600", textAlign: "right" },
  feelingsLine: { fontSize: 13, color: "#666", textAlign: "right" },
  addButton: { backgroundColor: "#D98324", paddingVertical: 16, borderRadius: 12, alignItems: "center", margin: 20 },
  addButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
