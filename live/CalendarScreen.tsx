import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack, useFocusEffect } from "expo-router";

import { loadArcGoalTargetOccurrenceCompletions, loadArcGoalTargets, loadArcGoals } from "../data/storage.ts";
import { buildCalendarItems } from "../arc/calendar.ts";
import type { CalendarItem } from "../arc/calendar.ts";

const ITEM_TYPE_LABELS: Record<CalendarItem["type"], string> = {
  four_week_practice: "תוכנית ארבעת השבועות",
  sub_goal_deadline: "מועד תת־מטרה",
  target: "יעד",
  routine_linked_target: "יעד מקושר לשגרה",
};

/**
 * live/CalendarScreen.tsx (route: /calendar)
 *
 * Sub-goal execution task, spec section 8: ONE calendar screen for
 * everything arc/calendar.ts's buildCalendarItems aggregates -- four-week
 * practices still relevant, sub-goal deadlines, targets (including
 * routine-linked ones), completed and upcoming, across every ArcGoal.
 * Tapping an item deep-links straight to its own most specific screen
 * (a target's own execution screen, never a generic ArcGoal screen, per
 * spec section 8's own "do not route ... to a generic ARC Goal screen
 * when a more specific target context exists").
 */
export default function CalendarScreen() {
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready">("loading");

  const reload = useCallback(async () => {
    const [goals, targets, completions] = await Promise.all([loadArcGoals(), loadArcGoalTargets(), loadArcGoalTargetOccurrenceCompletions()]);
    setItems(buildCalendarItems(goals, targets, completions));
    setStatus("ready");
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  function openItem(item: CalendarItem) {
    if (item.targetId) {
      router.push({ pathname: "/goals/target/[targetId]", params: { targetId: item.targetId, arcGoalId: item.arcGoalId } });
      return;
    }
    // Sub-goal deadlines and four-week items both resolve at the
    // ArcGoal-execution-dashboard granularity -- there is no separate
    // per-sub-goal detail screen beyond BUILD's own editor and this
    // dashboard, which already highlights the active sub-goal.
    if (item.type === "four_week_practice") {
      router.push({ pathname: "/goals/live/[goalId]", params: { goalId: item.arcGoalId } });
      return;
    }
    router.push({ pathname: "/goals/execution/[goalId]", params: { goalId: item.arcGoalId } });
  }

  if (status === "loading") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: "לוח שנה" }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>לוח שנה</Text>
        {items.length === 0 && <Text style={styles.hint}>אין פריטים מתוכננים כרגע.</Text>}
        {items.map((item) => (
          <Pressable key={item.id} style={styles.itemCard} onPress={() => openItem(item)}>
            <Text style={styles.itemTitle}>{item.title}</Text>
            <Text style={styles.itemMeta}>{`${ITEM_TYPE_LABELS[item.type]} -- ${item.scheduledAt}`}</Text>
            <Text style={styles.itemMeta}>{item.completed ? "הושלם" : "לביצוע"}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  itemCard: { borderWidth: 1, borderColor: "#E6F4FE", borderRadius: 10, padding: 12, marginBottom: 10 },
  itemTitle: { fontSize: 15, fontWeight: "700", textAlign: "right", marginBottom: 4 },
  itemMeta: { fontSize: 13, textAlign: "right", color: "#666" },
});
