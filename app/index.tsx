import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * New architecture task, Phase 1 (spec section 1): Home originally
 * offered exactly two primary modes -- "replace the confusing mixed
 * entry experience with two primary choices." Every previous Home entry
 * point (Mini ARC, ARC Goals, Urge ARC, Life Manifest, stats, routines,
 * negative action, the future-reminder scheduler) still exists at its
 * exact original route, unchanged -- see build/SelfDevelopmentDashboardScreen.tsx
 * and build/ReachYourGoalDashboardScreen.tsx, which now host those entry
 * points instead of Home itself (spec section 19's own removal
 * ordering: move the entry BUTTON off the new UI, never delete the
 * underlying screen/route/data).
 *
 * Productivity roadmap, Stage G: a third mode, "משימות ולוח זמנים",
 * added the exact same way -- one more Pressable, same visual/navigation
 * convention, its own dashboard (build/TodayScreen.tsx, route /today)
 * hosting every one of ITS entry points (Tasks, BUILD, the LIVE gate,
 * Manifest Meditation) rather than adding a fourth button here for each.
 */
export default function Home() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.title}>Archi</Text>

        <Link href="/self-development" asChild>
          <Pressable style={[styles.modeButton, styles.selfDevelopmentButton]}>
            <Text style={styles.modeButtonLabel}>התפתחות אישית</Text>
            <Text style={styles.modeButtonHint}>עבודה על רגש, דחף, מחשבה או הרגל מפריע -- ללא מטרה או תהליך ארוך</Text>
            <Text style={styles.modeButtonAction}>כניסה להתפתחות אישית</Text>
          </Pressable>
        </Link>

        <Link href="/reach-your-goal" asChild>
          <Pressable style={[styles.modeButton, styles.reachGoalButton]}>
            <Text style={styles.modeButtonLabel}>השגת מטרה</Text>
            <Text style={styles.modeButtonHint}>מניפסט חיים, חיזוק זהות ותתי־מטרות עם יומן ותזכורות</Text>
            <Text style={styles.modeButtonAction}>השגת מטרה</Text>
          </Pressable>
        </Link>

        <Link href="/today" asChild>
          <Pressable style={[styles.modeButton, styles.todayButton]}>
            <Text style={styles.modeButtonLabel}>משימות ולוח זמנים</Text>
            <Text style={styles.modeButtonHint}>משימות עם טיימר, הכנה לפני פעולה, ותמיכת ARC כשמשהו מפריע</Text>
            <Text style={styles.modeButtonAction}>כניסה להיום</Text>
          </Pressable>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flex: 1, alignItems: "center", justifyContent: "center", gap: 20, padding: 24 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 8 },
  modeButton: {
    width: "100%",
    borderRadius: 14,
    padding: 20,
    alignItems: "flex-end",
  },
  selfDevelopmentButton: { backgroundColor: "#0a7ea4" },
  reachGoalButton: { backgroundColor: "#1a6b4a" },
  todayButton: { backgroundColor: "#7A4E2E" },
  modeButtonLabel: { color: "#fff", fontSize: 22, fontWeight: "700", textAlign: "right" },
  modeButtonHint: { color: "#e6f4fe", fontSize: 13, textAlign: "right", marginTop: 6, marginBottom: 14 },
  modeButtonAction: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "right",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: "flex-end",
  },
});
