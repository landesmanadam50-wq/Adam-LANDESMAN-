import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { resolveTaskCubeData } from "../../data/taskCubeData.ts";
import type { TaskCubeData } from "../../data/taskCubeData.ts";
import { handleEmotionalCheckInChoice } from "../../data/emotionalCheckInRouting.ts";
import { generateArcPerspectiveSessionId } from "../../arc/arcPerspective.ts";

/**
 * live/components/HomeCubes.tsx
 *
 * ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry "Cubes"
 * task, section 5: TWO collapsible cubes, mounted VERBATIM on both
 * build/FlexibleDailyScreen.tsx (the real home screen) and
 * live/DailyStartupSequenceOverlay.tsx's own "planning" step (the
 * real entry screen) -- never two separate implementations. Modeled on
 * live/components/TaskPurposeCard.tsx's own header+chevron+local-
 * collapsed-state+card pattern (collapse state is local/per-mount,
 * never persisted, same as that precedent).
 *
 * TaskCube reads exclusively through data/taskCubeData.ts's
 * resolveTaskCubeData -- the ONE shared data-resolution function both
 * mount points call, which is what guarantees "שתי הקוביות בשני
 * המסכים מציגות את אותו מצב משימות" (both cubes on both screens show
 * the exact same task state) by construction, never a second
 * scheduling computation. Reloads on every focus (useFocusEffect),
 * same convention as every other hub screen in this codebase, so it
 * updates after starting/completing/postponing/adding/removing/
 * reordering a task with zero extra wiring from either host screen.
 */
export function TaskCube() {
  const [collapsed, setCollapsed] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [data, setData] = useState<TaskCubeData | null>(null);

  const reload = useCallback(() => {
    resolveTaskCubeData(new Date()).then(setData);
  }, []);

  useFocusEffect(reload);

  const currentTask = data?.current?.task ?? data?.todoSuggestion?.entry?.task ?? null;

  function handlePressCurrent() {
    if (data?.restRun) {
      router.push({ pathname: "/tasks/[id]", params: { id: data.restRun.taskId } });
      return;
    }
    if (data?.activeRun) {
      router.push({ pathname: "/tasks/[id]", params: { id: data.activeRun.taskId } });
      return;
    }
    if (currentTask) {
      router.push({ pathname: "/tasks/[id]", params: { id: currentTask.id, autoStart: "1" } });
    }
  }

  return (
    <View style={styles.card}>
      <Pressable style={styles.headerRow} onPress={() => setCollapsed((previous) => !previous)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
        <Text style={styles.toggleIcon}>{collapsed ? "▸" : "▾"}</Text>
        <Text style={styles.headerTitle}>המשימות שלי</Text>
      </Pressable>
      {!collapsed && (
        <View style={styles.body}>
          <Pressable style={styles.currentRow} onPress={handlePressCurrent}>
            <Text style={styles.currentRowLabel}>המשימה הנוכחית</Text>
            <Text style={styles.currentRowValue}>
              {data?.restRun && currentTask ? `${currentTask.title} · בהפסקה` : currentTask ? currentTask.title : "אין משימה פעילה כרגע"}
            </Text>
          </Pressable>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>המשימה הבאה</Text>
            <Text style={styles.rowValue}>
              {data?.next
                ? `${data.next.task.title}${data.next.effectiveStartTime ? ` · ${data.next.effectiveStartTime}` : ""}${data.next.task.isTodoItem ? " (To-Do)" : ""}`
                : "אין משימה נוספת מתוכננת"}
            </Text>
          </View>
          <Pressable style={styles.tasksToggleRow} onPress={() => setShowTasks((previous) => !previous)}>
            <Text style={styles.tasksToggleText}>{showTasks ? "הסתר משימות ▸" : "המשימות של היום ▾"}</Text>
          </Pressable>
          {showTasks && data && (
            <View style={styles.tasksList}>
              {data.combinedTasksList.scheduled.map((entry) => (
                <Text key={entry.task.id} style={styles.taskListLine}>
                  {`${entry.task.title}${entry.effectiveStartTime ? ` · ${entry.effectiveStartTime}` : ""}`}
                </Text>
              ))}
              {data.combinedTasksList.todo.map((entry) => (
                <Text key={entry.task.id} style={styles.taskListLine}>
                  {`${entry.task.title} (To-Do)`}
                </Text>
              ))}
              {data.combinedTasksList.scheduled.length === 0 && data.combinedTasksList.todo.length === 0 && (
                <Text style={styles.taskListEmpty}>אין משימות ליום הזה</Text>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/**
 * ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry "Cubes"
 * task, section 5: the "מעולה" smiley is deliberately absent from this
 * cube (it only ever appears after an ACTUAL task completion, on Task
 * LIVE's own post-completion button -- live/ActiveTaskScreen.tsx --
 * untouched by this change). handleEmotionalCheckInChoice itself is
 * the same generic dispatcher every other remaining mood entry point
 * already calls (build/FlexibleDailyScreen.tsx's own former
 * handleCheckIn, the floating overlay, the Android widget) -- removing
 * the "מעולה" button here never touches that shared function or any
 * of its other callers.
 */
export function FeelingCube() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <View style={styles.card}>
      <Pressable style={styles.headerRow} onPress={() => setCollapsed((previous) => !previous)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
        <Text style={styles.toggleIcon}>{collapsed ? "▸" : "▾"}</Text>
        <Text style={styles.headerTitle}>ההרגשה שלי</Text>
      </Pressable>
      {!collapsed && (
        <View style={styles.body}>
          <Text style={styles.feelingQuestion}>איך ההרגשה?</Text>
          <View style={styles.feelingRow}>
            <Pressable style={styles.feelingButton} onPress={() => handleEmotionalCheckInChoice("full_arc")}>
              <Text style={styles.feelingEmoji}>😟</Text>
              <Text style={styles.feelingLabel}>פחות טוב</Text>
            </Pressable>
            <Pressable style={styles.feelingButton} onPress={() => handleEmotionalCheckInChoice("shortened_arc")}>
              <Text style={styles.feelingEmoji}>🙂</Text>
              <Text style={styles.feelingLabel}>סבבה</Text>
            </Pressable>
          </View>
          <Pressable style={styles.arcSaveButton} onPress={() => router.push("/arc-saving/activate")}>
            <Text style={styles.arcSaveButtonText}>+ ARC Save</Text>
          </Pressable>
          {/* ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry
              "Cubes" task, section 5: preserved verbatim from the inline
              check-in block this cube replaces -- "אין למחוק פונקציות
              קיימות" (no deleting existing functions), only the "מעולה"
              button itself was dropped per spec. */}
          <Pressable style={styles.secondaryFeelingButton} onPress={() => handleEmotionalCheckInChoice("urge")}>
            <Text style={styles.secondaryFeelingButtonText}>🧠 מחשבה / דחף</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryFeelingButton}
            onPress={() => router.push({ pathname: "/arc-perspective/[id]", params: { id: generateArcPerspectiveSessionId(), mode: "real_time" } })}
          >
            <Text style={styles.secondaryFeelingButtonText}>🔄 שינוי פרספקטיבה</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: "#F5FAFD", borderRadius: 14, borderWidth: 1, borderColor: "#dbe8ef", padding: 12, marginBottom: 12 },
  headerRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  toggleIcon: { fontSize: 13, color: "#0a7ea4" },
  headerTitle: { fontSize: 15, fontWeight: "700", color: "#0a7ea4", textAlign: "right" },
  body: { marginTop: 10, gap: 8 },
  currentRow: { backgroundColor: "#fff", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#dbe8ef" },
  currentRowLabel: { fontSize: 12, color: "#666", textAlign: "right" },
  currentRowValue: { fontSize: 16, fontWeight: "700", color: "#222", textAlign: "right", marginTop: 2 },
  row: { backgroundColor: "#fff", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#dbe8ef" },
  rowLabel: { fontSize: 12, color: "#666", textAlign: "right" },
  rowValue: { fontSize: 14, color: "#333", textAlign: "right", marginTop: 2 },
  tasksToggleRow: { alignItems: "flex-end" },
  tasksToggleText: { fontSize: 13, color: "#0a7ea4", fontWeight: "600" },
  tasksList: { backgroundColor: "#fff", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#dbe8ef", gap: 4 },
  taskListLine: { fontSize: 13, color: "#333", textAlign: "right" },
  taskListEmpty: { fontSize: 13, color: "#888", textAlign: "right" },
  feelingQuestion: { fontSize: 15, fontWeight: "700", textAlign: "right" },
  feelingRow: { flexDirection: "row-reverse", gap: 8 },
  feelingButton: { flex: 1, alignItems: "center", backgroundColor: "#fff", borderRadius: 12, paddingVertical: 12, borderWidth: 1, borderColor: "#dbe8ef" },
  feelingEmoji: { fontSize: 26 },
  feelingLabel: { fontSize: 12, color: "#444", marginTop: 4, fontWeight: "600" },
  arcSaveButton: { backgroundColor: "#2E7D32", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  arcSaveButtonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  secondaryFeelingButton: { backgroundColor: "#fff", borderRadius: 10, paddingVertical: 10, alignItems: "center", borderWidth: 1, borderColor: "#dbe8ef" },
  secondaryFeelingButtonText: { fontSize: 13, color: "#444", fontWeight: "600" },
});
