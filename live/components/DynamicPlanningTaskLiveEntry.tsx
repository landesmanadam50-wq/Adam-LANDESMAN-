/**
 * live/components/DynamicPlanningTaskLiveEntry.tsx
 *
 * ARCHI -- Rolling Dynamic Planning task, spec section 2: "at the start
 * of the fixed task, if not yet confirmed via the notification, an edit
 * panel appears." This is that entry point inside Task LIVE
 * (live/ActiveTaskScreen.tsx) -- a small, non-blocking row, same
 * precedent as ArcAddictionTaskLiveEntry.tsx right above it: it never
 * pauses, stops, or resets the active task's own timer, it only offers
 * a tap-through to live/DynamicPlanningConfirmScreen.tsx
 * (route /tasks/[id]/plan-next).
 *
 * Re-resolves arc/dynamicPlanning.ts's own resolveDynamicPlanningAction
 * completely fresh on every focus (never trusts anything computed
 * earlier) against THIS task's own id as the preceding fixed entry --
 * only ever rendered for a genuinely fixed (non-To-Do) task, since a
 * To-Do item has no "gap after it" of its own until it is itself
 * confirmed into one. Renders nothing at all once the gap has already
 * been planned/confirmed or no real gap exists (arc/dynamicPlanning.ts's
 * own "none" action) -- "never show a useless planning panel" applies
 * here exactly as it does to the notification.
 */

import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { router, useFocusEffect } from "expo-router";

import type { DynamicPlanningDecision } from "../../arc/dynamicPlanning.ts";
import { resolveDynamicPlanningAction } from "../../arc/dynamicPlanning.ts";
import { resolveTodoList } from "../../arc/todoList.ts";
import { resolveTodaysScheduledPlan } from "../../data/dailyPlan.ts";
import { loadTasks } from "../../data/storage.ts";
import { todayLocalDateString } from "../../program/dateUtils.ts";

export default function DynamicPlanningTaskLiveEntry({ taskId }: { taskId: string }) {
  const [decision, setDecision] = useState<DynamicPlanningDecision | null>(null);

  useFocusEffect(
    useCallback(() => {
      const now = new Date();
      Promise.all([resolveTodaysScheduledPlan(now), loadTasks()]).then(([scheduled, tasks]) => {
        const preceding = scheduled.find((entry) => entry.task.id === taskId) ?? null;
        if (!preceding) {
          setDecision(null);
          return;
        }
        const dateLocal = todayLocalDateString(now);
        const todoEntries = resolveTodoList(tasks, dateLocal);
        setDecision(resolveDynamicPlanningAction(scheduled, todoEntries, preceding, null));
      });
    }, [taskId])
  );

  if (!decision || decision.action === "none") return null;

  const label = decision.action === "confirm_next_todo" ? `📋 אישור הזמן הבא -- "${decision.candidate?.task.title ?? ""}"` : "📋 תכנון הזמן הבא";

  return (
    <Pressable accessibilityRole="button" style={styles.row} onPress={() => router.push({ pathname: "/tasks/[id]/plan-next", params: { id: taskId } })}>
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { borderWidth: 1, borderColor: "#1565C0", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, marginTop: 10, alignItems: "center" },
  text: { color: "#1565C0", fontSize: 15, fontWeight: "600" },
});
