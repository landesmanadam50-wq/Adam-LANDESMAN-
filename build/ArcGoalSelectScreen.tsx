import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { loadArcGoals } from "../data/storage.ts";
import type { ArcGoal } from "../arc/types.ts";

/**
 * build/ArcGoalSelectScreen.tsx (route: /arc-goal/select)
 *
 * ARC Goal task: the goal picker reached from Live's "ARC Goal" entry
 * (spec section 6) -- mirrors build/LiveModeSelectScreen.tsx's own
 * "auto-pick when exactly one, else show a picker" pattern. Once a goal
 * is resolved, pushes to /arc-goal/live/[goalId] (live/ArcGoalSessionScreen.tsx),
 * which loads that goal's own referenced protocols and runs the real
 * session -- UNCHANGED for any goal without an enabled Four-Week
 * Program.
 *
 * Four-Week Program task ("Core order": Life Manifest -> ARC Goal ->
 * four-week program -> sub-goals in a later phase): a goal WITH an
 * enabled fourWeekProgram routes to /goals/live/[goalId]
 * (live/ArcGoalFourWeekDashboardScreen.tsx) instead -- the program's own
 * hub, from which the trainee reaches the same /arc-goal/live/[goalId]
 * (and Full ARC/Mini ARC/ARC Link) screens for the actual guided
 * practice. Every goal saved before this field existed has
 * fourWeekProgram null and is completely unaffected.
 */
export default function ArcGoalSelectScreen() {
  const [goals, setGoals] = useState<ArcGoal[] | null>(null);

  const reload = useCallback(() => {
    loadArcGoals()
      .then(setGoals)
      .catch((error) => {
        console.warn("[ArcGoalSelectScreen] Failed to load ARC Goals.", error);
        setGoals([]);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  if (!goals) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  if (goals.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.title}>עדיין אין לך ARC Goal</Text>
          <Text style={styles.body}>אפשר ליצור מטרה חדשה ולחבר אליה פרוטוקול זהות ומצבים תומכים.</Text>
          <Pressable style={[styles.button, styles.fullWidthButton]} onPress={() => router.push("/goals")}>
            <Text style={styles.buttonText}>ליצירת מטרה חדשה</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>איזו מטרה תרצה לתרגל?</Text>
        {goals.map((goal) => (
          <Pressable
            key={goal.id}
            style={[styles.button, styles.fullWidthButton]}
            onPress={() =>
              goal.fourWeekProgram?.enabled
                ? router.push({ pathname: "/goals/live/[goalId]", params: { goalId: goal.id } })
                : router.push({ pathname: "/arc-goal/live/[goalId]", params: { goalId: goal.id } })
            }
          >
            <Text style={styles.buttonText}>{goal.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  body: { fontSize: 15, textAlign: "right", color: "#666", marginBottom: 16 },
  button: {
    backgroundColor: "#0a7ea4",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
  },
  fullWidthButton: { marginTop: 16 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
