import { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { ArcQuestion } from "../arc/arcQuestions.ts";
import { resolveAnsweredArcQuestions, resolveOpenArcQuestions } from "../arc/arcQuestions.ts";
import { loadArcQuestions } from "../data/storage.ts";

/**
 * build/ArcQuestionsHomeScreen.tsx (route /questions)
 *
 * ARC Questions task, section 1: "יש להפריד בין שאלות פתוחות לשאלות
 * שנענו" -- two plain sections, open questions first (the ones still
 * waiting for research/an answer), answered questions below. A row tap
 * opens the composer (`/questions/[id]`) to research/answer an open
 * question or revisit an answered one; "+ שאלה חדשה" opens the SAME
 * composer screen in its "new question" mode (`/questions/new`) --
 * never a second writing screen.
 */
export default function ArcQuestionsHomeScreen({ returnToTaskId = null }: { returnToTaskId?: string | null }) {
  const [questions, setQuestions] = useState<ArcQuestion[]>([]);

  const reload = useCallback(() => {
    loadArcQuestions().then(setQuestions);
  }, []);

  useFocusEffect(reload);

  const open = resolveOpenArcQuestions(questions);
  const answered = resolveAnsweredArcQuestions(questions);

  function openQuestion(id: string) {
    router.push({ pathname: "/questions/[id]", params: { id, ...(returnToTaskId ? { returnToTaskId } : {}) } });
  }

  function renderRow({ item }: { item: ArcQuestion }) {
    return (
      <Pressable style={styles.row} onPress={() => openQuestion(item.id)}>
        <Text style={styles.rowText}>{item.text}</Text>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.title}>ARC Questions</Text>
        <Text style={styles.hint}>שאלות שעולות במהלך היום -- כתוב אותן כאן ותחקור אותן בזמן אחר.</Text>
      </View>
      <FlatList
        data={[...open].reverse()}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={renderRow}
        ListHeaderComponent={<Text style={styles.sectionTitle}>פתוחות ({open.length})</Text>}
        ListEmptyComponent={<Text style={styles.hint}>אין שאלות פתוחות כרגע.</Text>}
        ListFooterComponent={
          <>
            <Text style={styles.sectionTitle}>נענו ({answered.length})</Text>
            {answered.length === 0 && <Text style={styles.hint}>עדיין לא נענתה אף שאלה.</Text>}
            {[...answered].reverse().map((item) => (
              <Pressable key={item.id} style={styles.row} onPress={() => openQuestion(item.id)}>
                <Text style={styles.rowText}>{item.text}</Text>
              </Pressable>
            ))}
          </>
        }
      />
      <Pressable
        style={styles.primaryButton}
        onPress={() => router.push({ pathname: "/questions/new", params: returnToTaskId ? { returnToTaskId } : {} })}
      >
        <Text style={styles.primaryButtonText}>+ שאלה חדשה</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  header: { paddingHorizontal: 20, paddingTop: 16 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right" },
  hint: { fontSize: 13, color: "#666", textAlign: "right", marginTop: 6, marginBottom: 6 },
  sectionTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", color: "#333", marginTop: 14, marginBottom: 6 },
  listContent: { paddingHorizontal: 20, paddingBottom: 100, gap: 6 },
  row: { borderWidth: 1, borderColor: "#eee", borderRadius: 10, padding: 14, marginBottom: 2 },
  rowText: { fontSize: 15, textAlign: "right", color: "#222" },
  primaryButton: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: "#0a7ea4",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
