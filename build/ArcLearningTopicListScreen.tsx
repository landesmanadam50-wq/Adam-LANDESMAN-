import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcLearningTopic } from "../arc/arcLearningTopic.ts";
import { loadArcLearningTopics } from "../data/storage.ts";

/**
 * build/ArcLearningTopicListScreen.tsx (route /arc-learning/topics)
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task,
 * section 2 step 2 / section 11: "נושאי למידה" -- lists every saved
 * ArcLearningTopic (newest first) with a button to add a new one, each
 * row opening its own detail screen.
 */
export default function ArcLearningTopicListScreen() {
  const [topics, setTopics] = useState<ArcLearningTopic[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadArcLearningTopics().then((loaded) => setTopics([...loaded].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))));
    }, [])
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>🗂️ נושאי למידה</Text>
        <Pressable style={styles.addButton} onPress={() => router.push({ pathname: "/arc-learning/topics/[id]/edit", params: { id: "new" } })}>
          <Text style={styles.addButtonText}>+ נושא חדש</Text>
        </Pressable>
      </View>

      {topics === null && <Text style={styles.hint}>טוען...</Text>}
      {topics !== null && topics.length === 0 && <Text style={styles.hint}>עדיין לא נוספו נושאי למידה.</Text>}

      <FlatList
        data={topics ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push({ pathname: "/arc-learning/topics/[id]", params: { id: item.id } })}>
            <Text style={styles.rowTitle}>{item.title}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 16 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right" },
  addButton: { backgroundColor: "#0a7ea4", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  addButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  hint: { fontSize: 14, textAlign: "right", color: "#666", paddingHorizontal: 20, marginTop: 10 },
  listContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24, gap: 8 },
  row: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 14 },
  rowTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#222" },
});
