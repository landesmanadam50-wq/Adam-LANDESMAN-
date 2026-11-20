import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";

import type { PlannedArc } from "../arc/plannedArc.ts";
import { loadPlannedArcs } from "../data/storage.ts";
import { handlePlannedArcAlarmAction } from "../data/taskAlarm.ts";

/**
 * live/ArcAlarmScreen.tsx (route /planned-arcs/[id]/alarm)
 *
 * ARC alarm task: the full-screen UI notifee's own fullScreenAction
 * opens (even over a locked screen) when a planned ARC/Mini ARC
 * exercise's own alarm fires, or that the trainee lands on by tapping
 * the alarm notification itself -- exact mirror of
 * live/TaskAlarmScreen.tsx, for this alarm kind. The three buttons call
 * the exact same handlePlannedArcAlarmAction (data/taskAlarm.ts) a
 * press directly on the notification/lock screen would -- never a
 * second, competing implementation of what each action does.
 */
export default function ArcAlarmScreen({ plannedArcId }: { plannedArcId: string }) {
  const [item, setItem] = useState<PlannedArc | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadPlannedArcs().then((items) => setItem(items.find((candidate) => candidate.id === plannedArcId) ?? null));
    }, [plannedArcId])
  );

  function press(actionId: string) {
    handlePlannedArcAlarmAction(actionId, plannedArcId);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.title}>הגיע הזמן לתרגול ARC</Text>
        <Text style={styles.exerciseName}>{item?.name ?? ""}</Text>

        <Pressable style={styles.primaryButton} onPress={() => press("start_arc")}>
          <Text style={styles.primaryButtonText}>התחל ARC</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => press("snooze_arc")}>
          <Text style={styles.secondaryButtonText}>נודניק 5 דקות</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => press("close_arc")}>
          <Text style={styles.secondaryButtonText}>סגור</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#111" },
  content: { flex: 1, padding: 28, justifyContent: "center", gap: 14 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "center", color: "#fff", marginBottom: 4 },
  exerciseName: { fontSize: 28, fontWeight: "800", textAlign: "center", color: "#fff", marginBottom: 32 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 18, borderRadius: 14, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 18 },
  secondaryButton: { borderWidth: 1, borderColor: "#fff", paddingVertical: 16, borderRadius: 14, alignItems: "center" },
  secondaryButtonText: { color: "#fff", fontSize: 16 },
});
