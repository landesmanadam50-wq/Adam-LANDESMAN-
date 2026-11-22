import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { resolveMostUrgentScheduledTask } from "../data/dailyPlan.ts";
import { getTaskTimerStatus, type TaskTimerRun } from "../arc/taskTimer.ts";
import { loadTaskTimerRun } from "../data/storage.ts";

/**
 * live/PersistentTaskControls.tsx
 *
 * Unified Task Stages task, requirement 5: originally two persistent
 * controls -- "ARC" and "התחל משימה" -- shown near the top of ARCHI's
 * own main hub screens (build/DailyScheduleScreen.tsx,
 * build/TasksListScreen.tsx, build/FlexibleDailyScreen.tsx,
 * build/WeeklyRoutineScreen.tsx), available throughout ordinary
 * navigation, independently of whether a task timer happens to be
 * running right now.
 *
 * ARCHI -- Consolidated Implementation Request, Part 10 ("Remove
 * standalone ARC button... center 'התחל משימה'"): the standalone "ARC"
 * button (and its own handleArcPress dispatcher) is now gone --
 * "the user should not need a redundant standalone ARC button" given
 * the home screen's own mood-based entry points (😟/🙂/😄) and the
 * existing Thought/Urge shortcut already cover it. "התחל משימה" is the
 * one remaining control here, now centered.
 *
 * "התחל משימה" is a thin DISPATCHER over a mechanism that already
 * exists and is already fully tested elsewhere -- it implements no new
 * start logic of its own: with a task active, simply returns to it (no
 * new timer is ever created just by pressing this). With none active,
 * resolves the next relevant scheduled task via data/dailyPlan.ts's own
 * resolveMostUrgentScheduledTask -- built from the ONE real, resolved
 * flexible-day plan (Task LIVE / To-Do List / Flexible Day sync fix),
 * the exact same "what's next" calculation every other sync-fixed
 * screen in this app already agrees on -- and opens it with
 * autoStart=1, which itself already routes through the Daily
 * Visualization completion/bypass gate (live/ActiveTaskScreen.tsx's
 * own handleStart) before anything actually starts.
 */
export default function PersistentTaskControls() {
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  // Current-task logic fix: kept alongside activeTaskId (never re-loaded a
  // second time in handleStartTaskPress) so the "what's next" fallback
  // below can also exclude/account for this exact run -- a single load
  // per focus, same convention as every other field here.
  const [currentRun, setCurrentRun] = useState<TaskTimerRun | null>(null);

  const reload = useCallback(() => {
    loadTaskTimerRun().then((run) => {
      setCurrentRun(run);
      // Current-task logic fix: a persisted run only means "resume this
      // task" when it is a real task timer (never "rest"), was never
      // explicitly completed/finished-early, and its own real elapsed-time
      // window (getTaskTimerStatus, midnight-safe by construction) hasn't
      // actually elapsed yet -- a "not yet marked complete" run from last
      // night is NOT still active just because nobody closed it out.
      const isGenuinelyActive = run !== null && run.kind !== "rest" && run.completedAt === null && !getTaskTimerStatus(run, Date.now()).complete;
      setActiveTaskId(isGenuinelyActive ? run!.taskId : null);
    });
  }, []);

  useFocusEffect(reload);

  async function handleStartTaskPress() {
    if (activeTaskId) {
      router.push({ pathname: "/tasks/[id]", params: { id: activeTaskId } });
      return;
    }
    const next = await resolveMostUrgentScheduledTask(null, new Date(), currentRun);
    if (next) {
      router.push({ pathname: "/tasks/[id]", params: { id: next.task.id, autoStart: "1" } });
      return;
    }
    router.push("/tasks");
  }

  return (
    <View style={styles.row}>
      <Pressable style={styles.button} onPress={handleStartTaskPress}>
        <Text style={styles.buttonText}>התחל משימה</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Part 10.2: centered horizontally now that it's the row's one
  // remaining control, never stretched -- same button size/color/style
  // as before, just re-centered instead of right-anchored.
  row: { flexDirection: "row-reverse", marginBottom: 12, justifyContent: "center" },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 8, paddingHorizontal: 18, borderRadius: 20 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
