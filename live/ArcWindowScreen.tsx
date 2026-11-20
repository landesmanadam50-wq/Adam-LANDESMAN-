import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { getTask, loadPlannedArcs } from "../data/storage.ts";
import type { Task } from "../arc/tasks.ts";
import { plannedArcsOfKind } from "../arc/plannedArc.ts";
import type { PlannedArc } from "../arc/plannedArc.ts";

/**
 * live/ArcWindowScreen.tsx (route /tasks/[id]/arc-window)
 *
 * ARC-system upgrade task ("ARC ספונטני ויצירת ARC מתוכנן"), Part 2: the
 * chooser shown for a task's own OPTIONAL ARC window
 * (task.arcWindowMinutesBefore) -- never a required gate before the
 * task (the task's own screen is always separately reachable), and
 * never auto-inserted between tasks. Three choices, all available
 * whenever this screen is reached: spontaneous ARC, a saved Full
 * planned ARC (if any exist), or skipping entirely -- skipping never
 * touches the task's own status.
 *
 * ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
 * task: the "Mini ARC מתוכנן" menu entry/list view is gone -- Mini ARC
 * is no longer a user-choosable option anywhere in the app (depth is
 * now decided automatically by the new time rating). `plannedArcsOfKind`
 * itself, and `PlannedArcKind`'s own "mini" value, both stay fully
 * intact (never deleted) -- any pre-existing `kind: "mini"` record
 * stays exactly as it is in storage, simply no longer offered here.
 */
export default function ArcWindowScreen({ taskId, autoStartAfter = false }: { taskId: string; autoStartAfter?: boolean }) {
  const [task, setTask] = useState<Task | null>(null);
  const [fullDrafts, setFullDrafts] = useState<PlannedArc[]>([]);
  const [view, setView] = useState<"menu" | "full_list">("menu");

  const reload = useCallback(() => {
    Promise.all([getTask(taskId), loadPlannedArcs()]).then(([loadedTask, items]) => {
      setTask(loadedTask);
      setFullDrafts(plannedArcsOfKind(items, "full"));
    });
  }, [taskId]);

  useFocusEffect(reload);

  /**
   * Alarm-timer integration task, requirement 4: "the timer will start
   * after ARC completes OR IS SKIPPED" -- autoStartAfter (only ever set
   * when this screen was reached from the real alarm's own "Start Task"
   * button) carries that intent through skipping exactly the same way
   * runPlannedArc/startSpontaneous below carry it through actually
   * running an ARC. Every OTHER entry point into this screen (Today's
   * own optional ARC-window row) never sets it, so skipping there keeps
   * behaving exactly as before -- landing on the plain pre-start screen,
   * never auto-starting anything.
   */
  function skip() {
    router.replace({ pathname: "/tasks/[id]", params: autoStartAfter ? { id: taskId, autoStart: "1" } : { id: taskId } });
  }

  function startSpontaneous() {
    router.push({ pathname: "/tasks/[id]/arc", params: autoStartAfter ? { id: taskId, spontaneous: "1", autoStartAfter: "1" } : { id: taskId, spontaneous: "1" } });
  }

  /**
   * ARC session-resume conflict fix: this screen no longer pre-builds
   * or pre-saves the session itself -- that would silently resume or
   * overwrite whatever unfinished session might already exist for this
   * task, bypassing the one centralized resume/conflict decision now
   * made in NewArcLiveScreen.tsx's own reload(). Passing plannedArcId
   * through lets that screen resolve the draft's prefill fields AND
   * detect a same-type resume vs. a different-type conflict itself.
   */
  function runPlannedArc(item: PlannedArc) {
    router.push({
      pathname: "/tasks/[id]/arc",
      params: autoStartAfter ? { id: taskId, plannedArcId: item.id, autoStartAfter: "1" } : { id: taskId, plannedArcId: item.id },
    });
  }

  if (!task) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (view === "full_list") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>ARC מלא מתוכנן</Text>
          {fullDrafts.map((item) => (
            <Pressable key={item.id} style={styles.card} onPress={() => runPlannedArc(item)}>
              <Text style={styles.cardTitle}>{item.name}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setView("menu")}>
            <Text style={styles.linkText}>חזרה</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>ARC אופציונלי לפני המשימה</Text>
        <Text style={styles.hint}>{task.title}</Text>
        <View style={styles.chipColumn}>
          <Pressable style={styles.optionRow} onPress={startSpontaneous}>
            <Text style={styles.optionText}>ARC ספונטני</Text>
          </Pressable>
          {fullDrafts.length > 0 && (
            <Pressable style={styles.optionRow} onPress={() => setView("full_list")}>
              <Text style={styles.optionText}>ARC מלא מתוכנן</Text>
            </Pressable>
          )}
          <Pressable style={styles.secondaryButton} onPress={skip}>
            <Text style={styles.secondaryButtonText}>דילוג</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  hint: { fontSize: 14, textAlign: "right", color: "#666", marginBottom: 16 },
  chipColumn: { gap: 10 },
  optionRow: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 10, padding: 14, alignItems: "flex-end" },
  optionText: { color: "#0a7ea4", fontSize: 15, fontWeight: "600" },
  secondaryButton: { borderWidth: 1, borderColor: "#999", borderRadius: 10, padding: 14, alignItems: "flex-end", marginTop: 10 },
  secondaryButtonText: { color: "#666", fontSize: 15, fontWeight: "600" },
  card: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 14, marginTop: 10 },
  cardTitle: { fontSize: 16, fontWeight: "700", textAlign: "right" },
  linkText: { color: "#666", fontSize: 14, textAlign: "right", marginTop: 16 },
});
