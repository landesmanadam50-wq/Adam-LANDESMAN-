import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { createEmptyTask, generateTaskId } from "../arc/tasks.ts";
import { upsertTask } from "../data/storage.ts";
import { reconcileTaskAlarms } from "../data/taskAlarm.ts";

/**
 * build/ArcCreativityScreen.tsx (route /arc-creativity)
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task,
 * section 11: ARC Creativity's own home screen -- the four required
 * entries: קשרים מוצעים, יצירתיות בין נושאים, יצירתיות בתוך נושא, שליפת
 * קשרים. Independently reachable, never nested under ARC Learning/ARC
 * Gym/ARC Goal.
 */
export default function ArcCreativityScreen() {
  /**
   * Sections 7+8: the ONE creation entry point for an ARC Creativity
   * review Task -- same scheduleTraining()-style precedent as ARC
   * Learning's own schedule-review screen, but no topic concept here
   * (Mode D has none), so this creates the Task directly and opens the
   * existing generic task editor -- never a second, parallel scheduling
   * form.
   */
  async function scheduleReview() {
    const now = new Date().toISOString();
    const task = {
      ...createEmptyTask(generateTaskId(), "ARC Creativity: שליפת קשרים", "לשלוף קשרים שמורים שהגיע זמנם", now),
      taskKind: "arcCreativityReview" as const,
    };
    await upsertTask(task);
    await reconcileTaskAlarms();
    router.push({ pathname: "/tasks/[id]/edit", params: { id: task.id } });
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>💡 ARC Creativity — יצירתיות</Text>
        <Text style={styles.subtitle}>מצא קשרים בין תובנות, גלה עקרונות חדשים, ושלוף קשרים שגילית בעבר.</Text>

        <Pressable style={styles.card} onPress={() => router.push("/arc-creativity/suggested")}>
          <Text style={styles.cardText}>🔗 קשרים מוצעים</Text>
        </Pressable>

        <Pressable style={styles.card} onPress={() => router.push("/arc-creativity/cross-topic")}>
          <Text style={styles.cardText}>🌐 יצירתיות בין נושאים</Text>
        </Pressable>

        <Pressable style={styles.card} onPress={() => router.push("/arc-creativity/within-topic")}>
          <Text style={styles.cardText}>🧩 יצירתיות בתוך נושא</Text>
        </Pressable>

        <Pressable style={styles.card} onPress={() => router.push("/arc-creativity/recall")}>
          <Text style={styles.cardText}>🔁 שליפת קשרים</Text>
        </Pressable>

        <Pressable style={styles.card} onPress={() => router.push("/arc-creativity/connections")}>
          <Text style={styles.cardText}>📚 קשרים שמורים</Text>
        </Pressable>

        <Pressable style={styles.card} onPress={() => router.push("/arc-creativity/overview")}>
          <Text style={styles.cardText}>📊 סקירות ממתינות</Text>
        </Pressable>

        <Pressable style={styles.card} onPress={scheduleReview}>
          <Text style={styles.cardText}>🗓️ תזמון שליפת קשרים</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20, gap: 12 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 2 },
  subtitle: { fontSize: 14, color: "#666", textAlign: "right", marginBottom: 14 },
  card: { borderWidth: 1, borderColor: "#6A1B9A", borderRadius: 12, padding: 16, alignItems: "flex-end" },
  cardText: { color: "#6A1B9A", fontSize: 15, fontWeight: "600", textAlign: "right" },
});
