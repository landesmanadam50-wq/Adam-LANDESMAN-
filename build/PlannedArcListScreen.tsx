import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { getTask, loadPlannedArcs } from "../data/storage.ts";
import type { PlannedArc } from "../arc/plannedArc.ts";
import { resolveNextPlannedArcAlarmOccurrence } from "../arc/plannedArcAlarm.ts";
import type { Task } from "../arc/tasks.ts";
import { EMOTION_OPTION_LABELS } from "../arc/newArcLiveTypes.ts";

function formatNextAlarmTime(date: Date | null): string | null {
  if (!date) return null;
  return `${date.toLocaleDateString("he-IL")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** ARC alarm task, section 8: "אינדיקציה לתרגול חוזר, אם קיימת" -- recurring (daily or chosen weekdays) vs. one-time vs. the auto-computed before-task case, never just a bare time with no context. */
function describeAlarmRecurrence(item: PlannedArc): string {
  if (item.arcAlarmTimingKind === "before_task") return "לפני המשימה";
  if (item.arcAlarmRecurrence.kind === "once") return "חד-פעמי";
  return item.arcAlarmRecurrence.daysOfWeek.length >= 7 ? "כל יום" : "חזרתי";
}

/**
 * build/PlannedArcListScreen.tsx (route /planned-arcs)
 *
 * ARC-system upgrade task, Part D: the trainee's own library of named,
 * editable planned Full/Mini ARCs -- auto-generated from completed
 * spontaneous exercises (Part C), or edited here afterward. Each card
 * shows exactly the fields the spec names (name, trigger, emotion,
 * positive sensation, emotional/identity action); tapping opens the
 * full editor (build/PlannedArcEditorScreen.tsx).
 */
export default function PlannedArcListScreen() {
  const [items, setItems] = useState<PlannedArc[] | null>(null);
  const [tasksById, setTasksById] = useState<Map<string, Task>>(new Map());

  const reload = useCallback(() => {
    loadPlannedArcs().then(async (loaded) => {
      const sorted = [...loaded].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setItems(sorted);
      // ARC alarm task, section 8: resolving a "before_task" item's own
      // next alarm time needs its linked task's schedule -- loaded here,
      // once, for every linked task this list actually needs, never a
      // per-row fetch.
      const linkedTaskIds = [...new Set(sorted.map((item) => item.linkedTaskId).filter((taskId): taskId is string => taskId !== null))];
      const loadedTasks = await Promise.all(linkedTaskIds.map((taskId) => getTask(taskId)));
      setTasksById(new Map(linkedTaskIds.map((taskId, index) => [taskId, loadedTasks[index]]).filter((entry): entry is [string, Task] => entry[1] !== null)));
    });
  }, []);

  useFocusEffect(reload);

  function emotionLabel(item: PlannedArc): string | null {
    if (!item.selectedEmotion) return null;
    return item.selectedEmotion === "other" ? item.customEmotionText : EMOTION_OPTION_LABELS[item.selectedEmotion];
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>ספריית ARC מתוכננים</Text>
        {items === null && <Text style={styles.hint}>טוען...</Text>}
        {items !== null && items.length === 0 && (
          <Text style={styles.hint}>אין עדיין תרגילים מתוכננים. הם נוצרים אוטומטית לאחר ARC ספונטני, או דרך מסך העריכה.</Text>
        )}
        {items?.map((item) => (
          <Pressable key={item.id} style={styles.card} onPress={() => router.push({ pathname: "/planned-arcs/[id]", params: { id: item.id } })}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.kindBadge}>{item.kind === "mini" ? "Mini" : "מלא"}</Text>
              <Text style={styles.cardTitle}>{item.name}</Text>
            </View>
            {item.triggerText && <Text style={styles.cardLine}>טריגר: {item.triggerText}</Text>}
            {emotionLabel(item) && <Text style={styles.cardLine}>רגש: {emotionLabel(item)}</Text>}
            {item.supportiveSensation && <Text style={styles.cardLine}>תחושה חיובית: {item.supportiveSensation}</Text>}
            {item.emotionalActionText && <Text style={styles.cardLine}>פעולה רגשית: {item.emotionalActionText}</Text>}
            {item.identityActionText && <Text style={styles.cardLine}>פעולה זהותית: {item.identityActionText}</Text>}
            {item.arcAlarmEnabled &&
              (() => {
                const linkedTask = item.linkedTaskId ? tasksById.get(item.linkedTaskId) ?? null : null;
                const next = formatNextAlarmTime(resolveNextPlannedArcAlarmOccurrence(item, linkedTask, new Date()));
                return (
                  <Text style={styles.cardLine}>
                    ⏰ {next ?? "ללא תרגול קרוב"} · {describeAlarmRecurrence(item)}
                  </Text>
                );
              })()}
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, gap: 4 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 16 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  card: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, marginTop: 10 },
  cardHeaderRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, justifyContent: "flex-end" },
  kindBadge: { fontSize: 11, color: "#0a7ea4", borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  cardTitle: { fontSize: 16, fontWeight: "700", textAlign: "right" },
  cardLine: { fontSize: 13, color: "#666", textAlign: "right", marginTop: 4 },
});
