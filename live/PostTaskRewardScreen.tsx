import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import type { Task } from "../arc/tasks.ts";
import { resolveMostUrgentScheduledTask } from "../data/dailyPlan.ts";
import { findOutcomeBySmallerTaskId, recordSmallerStepCompleted } from "../arc/postponementObstacle.ts";
import { loadPostponementObstacleOutcomes, upsertPostponementObstacleOutcome } from "../data/storage.ts";
import { POSITIVE_IMAGERY_PROMPTS, resolveNextPositiveImageryIndex } from "../arc/positiveImagery.ts";
import {
  createInitialPostTaskRewardsState,
  recordTaskCompletion,
  resolveNextStreakReward,
  resolveTaskCompletionEventId,
} from "../arc/postTaskRewards.ts";
import type { TaskCompletionOutcome } from "../arc/postTaskRewards.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";
import {
  getTask,
  loadPositiveImageryProgress,
  loadPostTaskRewardsState,
  loadTaskTimerRun,
  savePositiveImageryProgress,
  savePostTaskRewardsState,
} from "../data/storage.ts";

type SmileStatus = "idle" | "running" | "paused" | "done";
type Phase = "smiling" | "imagery" | "summary";

const ENCOURAGEMENT_LINE = "חיוך קטן יכול לשנות את כל התחושה -- אתה בדרך הנכונה.";

/**
 * live/PostTaskRewardScreen.tsx (route /tasks/[id]/post-task-reward)
 *
 * Psychology/Smiling/Positive-Reinforcement task, features 2+3+4: the
 * ONE shared post-completion experience for every task-completion path
 * in the app -- reached from live/SessionReflectionScreen.tsx's own
 * finish/skip (the Task LIVE flow) and from build/TodayScreen.tsx's
 * quick-complete button (`source=today`), never a second, duplicated
 * screen per path. The actual reward (arc/postTaskRewards.ts's
 * recordTaskCompletion) is recorded ONCE, here, on mount -- guarded by
 * a ref against React re-invoking the effect, and idempotent at the
 * data layer besides (resolveTaskCompletionEventId) -- so it is
 * completely independent of whether the trainee then finishes, pauses,
 * or skips the physical smiling exercise itself (spec: "allow
 * skipping/pausing/ending... without penalties").
 *
 * `source="today"` (TodayScreen's own quick-complete, which never
 * navigated anywhere before this task) returns to Today when finished,
 * never pulling the trainee into a different task's own live screen
 * just because they tapped a checkbox in a list. `source="tasksList"`
 * (live/ManifestTaskLiveScreen.tsx's own finishRun, which used to
 * `router.replace("/tasks")` directly) preserves that exact destination.
 * Every other entry (the full Task LIVE -> reflect -> here flow) keeps
 * the EXACT pre-existing "advance to next task" behavior that used to
 * live directly in SessionReflectionScreen.tsx's own advanceToNextTask.
 */
export default function PostTaskRewardScreen({
  taskId,
  source = "flow",
  combinedSmiles = null,
}: {
  taskId: string;
  source?: "today" | "tasksList" | "flow";
  /** Unified ARC & Productivity Update task, requirement 9 ("one combined smile-reward experience at the end"): when set, overrides "חיוכים שהרווחת עכשיו" to show the WHOLE continuous routine's combined total instead of outcome.streakRewardSmiles -- which, for the routine's own last task, is correctly 0 here (recordTaskCompletion already processed that exact completion silently, in ActiveTaskScreen.tsx's own handleComplete, before this screen ever mounted; every other number below -- todaySmiles/totalSmiles/newStreak -- is unaffected, since those are the real, already-current running totals regardless of which call recorded them). */
  combinedSmiles?: number | null;
}) {
  const [task, setTask] = useState<Task | null>(null);
  const [outcome, setOutcome] = useState<TaskCompletionOutcome | null>(null);
  const [imageryIndex, setImageryIndex] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("smiling");
  const [smileStatus, setSmileStatus] = useState<SmileStatus>("idle");
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const processedRef = useRef(false);
  const pulse = useRef(new Animated.Value(1)).current;

  useFocusEffect(
    useCallback(() => {
      getTask(taskId).then(setTask);
    }, [taskId])
  );

  // Records the reward exactly once per screen instance -- see this
  // component's own doc above for why that's safe regardless of what
  // the trainee does with the smiling/imagery exercise afterward.
  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;
    (async () => {
      const [storedRewards, imageryProgress] = await Promise.all([loadPostTaskRewardsState(), loadPositiveImageryProgress()]);
      const today = todayLocalDateString();
      const base = storedRewards ?? createInitialPostTaskRewardsState(today);
      const eventId = resolveTaskCompletionEventId(taskId, today);
      const result = recordTaskCompletion(base, eventId, today);
      await savePostTaskRewardsState(result.nextState);
      setOutcome(result);
      setRemainingSeconds(result.smileDurationSeconds);

      const nextImageryIndex = resolveNextPositiveImageryIndex(imageryProgress.lastImageryIndex);
      await savePositiveImageryProgress({ lastImageryIndex: nextImageryIndex });
      setImageryIndex(nextImageryIndex);
    })();
  }, [taskId]);

  // The countdown itself -- a plain 1s interval against React state,
  // the same "re-render tick, never an independent native clock"
  // approach live/ActiveTaskScreen.tsx's own task timer already uses.
  useEffect(() => {
    if (smileStatus !== "running") return;
    if (remainingSeconds <= 0) {
      setSmileStatus("done");
      return;
    }
    const timer = setTimeout(() => setRemainingSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearTimeout(timer);
  }, [smileStatus, remainingSeconds]);

  // A gentle pulse while the countdown is running -- purely decorative, never gates anything.
  useEffect(() => {
    if (smileStatus !== "running") {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [smileStatus, pulse]);

  /**
   * ARC-system upgrade task, Part J (moved here verbatim from
   * live/SessionReflectionScreen.tsx's own former advanceToNextTask):
   * the next task's own timer is never auto-started -- only its screen
   * (or its own optional ARC window) opens, in its normal pre-start
   * state. "No next task" simply returns to the tasks list.
   */
  async function advanceToNextTask() {
    // Smart Postponement Flow, requirement 2 (Option 3): a completed
    // "smaller step" task (parentTaskId set) never falls into the
    // generic "what's next" calculation -- it offers to continue with
    // the ORIGINAL task it was created to make easier to start,
    // instead. The original task itself is never touched here; this
    // only records that its own smaller step is now done.
    if (task?.parentTaskId) {
      const outcomes = await loadPostponementObstacleOutcomes();
      const outcome = findOutcomeBySmallerTaskId(outcomes, taskId);
      if (outcome) {
        await upsertPostponementObstacleOutcome(recordSmallerStepCompleted(outcome, true, new Date().toISOString()));
      }
      router.replace({ pathname: "/tasks/[id]/postpone-return", params: { id: task.parentTaskId } });
      return;
    }
    const activeRun = await loadTaskTimerRun();
    const next = await resolveMostUrgentScheduledTask(taskId, new Date(), activeRun);
    if (!next) {
      router.back();
      return;
    }
    const pathname = next.task.arcWindowMinutesBefore !== null ? "/tasks/[id]/arc-window" : "/tasks/[id]";
    router.replace({ pathname, params: { id: next.task.id } });
  }

  async function finish() {
    if (source === "today") {
      router.back();
      return;
    }
    if (source === "tasksList") {
      router.replace("/tasks");
      return;
    }
    await advanceToNextTask();
  }

  if (!task || !outcome || imageryIndex === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const imageryPrompt = POSITIVE_IMAGERY_PROMPTS[imageryIndex];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>כל הכבוד על השלמת המשימה!</Text>
        <Text style={styles.taskName}>{task.title}</Text>

        {phase === "smiling" && (
          <View style={styles.block}>
            <Animated.Text style={[styles.emoji, { transform: [{ scale: pulse }] }]}>😊</Animated.Text>
            <Text style={styles.question}>תרגיל חיוך של {outcome.smileDurationSeconds} שניות</Text>
            <Text style={styles.encouragement}>{ENCOURAGEMENT_LINE}</Text>

            {smileStatus === "idle" && (
              <Pressable style={styles.primaryButton} onPress={() => setSmileStatus("running")}>
                <Text style={styles.primaryButtonText}>התחל</Text>
              </Pressable>
            )}

            {(smileStatus === "running" || smileStatus === "paused") && (
              <>
                <Text style={styles.countdown}>{remainingSeconds}</Text>
                <View style={styles.buttonRow}>
                  {smileStatus === "running" ? (
                    <Pressable style={styles.secondaryButton} onPress={() => setSmileStatus("paused")}>
                      <Text style={styles.secondaryButtonText}>השהיה</Text>
                    </Pressable>
                  ) : (
                    <Pressable style={styles.secondaryButton} onPress={() => setSmileStatus("running")}>
                      <Text style={styles.secondaryButtonText}>המשך</Text>
                    </Pressable>
                  )}
                  <Pressable style={styles.secondaryButton} onPress={() => setSmileStatus("done")}>
                    <Text style={styles.secondaryButtonText}>סיום</Text>
                  </Pressable>
                </View>
              </>
            )}

            {smileStatus === "done" && (
              <Pressable style={styles.primaryButton} onPress={() => setPhase("imagery")}>
                <Text style={styles.primaryButtonText}>המשך</Text>
              </Pressable>
            )}

            {smileStatus === "idle" && (
              <Pressable style={styles.skipLink} onPress={() => setPhase("imagery")}>
                <Text style={styles.skipLinkText}>דלג על התרגיל</Text>
              </Pressable>
            )}
          </View>
        )}

        {phase === "imagery" && (
          <View style={styles.block}>
            <Text style={styles.question}>רגע של דימוי חיובי</Text>
            <Text style={styles.imageryText}>{imageryPrompt.text}</Text>
            <Pressable style={styles.primaryButton} onPress={() => setPhase("summary")}>
              <Text style={styles.primaryButtonText}>המשך</Text>
            </Pressable>
            <Pressable style={styles.skipLink} onPress={() => setPhase("summary")}>
              <Text style={styles.skipLinkText}>דלג</Text>
            </Pressable>
          </View>
        )}

        {phase === "summary" && (
          <View style={styles.block}>
            <Text style={styles.question}>החיוכים שלך</Text>
            <StatRow label="חיוכים שהרווחת עכשיו" value={`+${combinedSmiles ?? outcome.streakRewardSmiles}`} />
            <StatRow label="רצף משימות נוכחי" value={String(outcome.newStreak)} />
            <StatRow label="חיוכים היום" value={String(outcome.todaySmiles)} />
            <StatRow label="סך כל החיוכים" value={String(outcome.totalSmiles)} />
            <StatRow label="המשימה הבאה תזכה אותך ב" value={`${resolveNextStreakReward(outcome.nextState)} חיוכים`} />
            <Pressable style={styles.primaryButton} onPress={finish}>
              <Text style={styles.primaryButtonText}>{source === "today" ? "חזרה למשימות" : "המשימה הבאה"}</Text>
            </Pressable>
          </View>
        )}

        {phase !== "summary" && (
          <Pressable style={styles.skipAllLink} onPress={finish}>
            <Text style={styles.skipLinkText}>דלג על הכל</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, alignItems: "stretch" },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  title: { fontSize: 20, fontWeight: "700", textAlign: "right", marginBottom: 4 },
  taskName: { fontSize: 15, textAlign: "right", color: "#666", marginBottom: 20 },
  block: { alignItems: "center", gap: 10 },
  emoji: { fontSize: 72, textAlign: "center" },
  question: { fontSize: 17, fontWeight: "600", textAlign: "center" },
  encouragement: { fontSize: 14, color: "#555", textAlign: "center", lineHeight: 20 },
  countdown: { fontSize: 40, fontWeight: "700", color: "#0a7ea4" },
  imageryText: { fontSize: 16, textAlign: "center", color: "#222", lineHeight: 24, paddingHorizontal: 12 },
  buttonRow: { flexDirection: "row", gap: 12 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, paddingHorizontal: 28, borderRadius: 10, alignItems: "center", marginTop: 8 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10 },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 14, fontWeight: "600" },
  skipLink: { marginTop: 6 },
  skipLinkText: { color: "#666", fontSize: 14 },
  skipAllLink: { alignItems: "center", marginTop: 24 },
  statRow: { flexDirection: "row-reverse", justifyContent: "space-between", width: "100%", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#eee" },
  statLabel: { fontSize: 14, color: "#555" },
  statValue: { fontSize: 15, fontWeight: "700", color: "#0a7ea4" },
});
