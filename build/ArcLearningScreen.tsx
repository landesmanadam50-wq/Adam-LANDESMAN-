import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

/**
 * build/ArcLearningScreen.tsx (route /arc-learning)
 *
 * ARC Learning + ARC Creativity + Integrated Spaced Repetition task,
 * section 11: ARC Learning's own home screen, independently reachable
 * (never gated behind ARC Gym or ARC Goal) -- the five required entries:
 * הוסף תובנה, נושאי למידה, כל התובנות, המשך למידה, שליפה וחזרה.
 */
export default function ArcLearningScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>📚 ARC Learning — למידה</Text>
        <Text style={styles.subtitle}>תפוס תובנות, למד אותן, וחזק את הזיכרון שלך לאורך זמן.</Text>

        <Pressable style={styles.primaryCard} onPress={() => router.push({ pathname: "/arc-learning/insight/[id]/edit", params: { id: "new" } })}>
          <Text style={styles.primaryCardText}>➕ הוסף תובנה</Text>
        </Pressable>

        <Pressable style={styles.card} onPress={() => router.push("/arc-learning/topics")}>
          <Text style={styles.cardText}>🗂️ נושאי למידה</Text>
        </Pressable>

        <Pressable style={styles.card} onPress={() => router.push("/arc-learning/library")}>
          <Text style={styles.cardText}>📖 כל התובנות</Text>
        </Pressable>

        <Pressable style={styles.card} onPress={() => router.push("/arc-learning/continue")}>
          <Text style={styles.cardText}>⏩ המשך למידה</Text>
        </Pressable>

        <Pressable style={styles.card} onPress={() => router.push("/arc-learning/recall")}>
          <Text style={styles.cardText}>🔁 שליפה וחזרה</Text>
        </Pressable>

        {/* ARC Learning + ARC Creativity + Integrated Spaced Repetition
            task, sections 7+8: lets the trainee add a recurring weekly
            review block (Fixed Weekly Routine) or a one-time review task
            (Flexible Daily) -- both through the SAME creation flow, the
            existing task editor's own recurring/one-time choice. */}
        <Pressable style={styles.card} onPress={() => router.push("/arc-learning/schedule-review")}>
          <Text style={styles.cardText}>🗓️ תזמון סקירה</Text>
        </Pressable>

        <Pressable style={styles.card} onPress={() => router.push("/arc-learning/overview")}>
          <Text style={styles.cardText}>📊 סקירות ממתינות</Text>
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
  primaryCard: { backgroundColor: "#0a7ea4", borderRadius: 12, padding: 16, alignItems: "flex-end" },
  primaryCardText: { color: "#fff", fontSize: 16, fontWeight: "700", textAlign: "right" },
  card: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 12, padding: 16, alignItems: "flex-end" },
  cardText: { color: "#0a7ea4", fontSize: 15, fontWeight: "600", textAlign: "right" },
});
