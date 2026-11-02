import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { completeTask, generateTaskJournalEntryId, pauseTask as pauseTaskRecord, setTaskCurrentAction, startTask, toggleTaskSubtaskCompletion } from "../arc/tasks.ts";
import type { Task } from "../arc/tasks.ts";
import { createTaskJournalEntry } from "../data/taskJournal.ts";
import {
  createTaskTimerRun,
  finishTaskTimerRunEarly,
  generateTaskTimerRunId,
  getTaskTimerStatus,
  pauseTaskTimerRun,
  resumeTaskTimerRun,
} from "../arc/taskTimer.ts";
import type { TaskTimerRun } from "../arc/taskTimer.ts";
import {
  DEFAULT_REST_DURATION_MINUTES,
  REST_DURATION_OPTIONS_MINUTES,
  resolveArcChoiceDestination,
  TASK_TIMER_END_CHOICE_LABELS,
} from "../arc/taskTimerEndChoice.ts";
import type { TaskTimerEndChoice } from "../arc/taskTimerEndChoice.ts";
import {
  appendTaskJournalEntry,
  clearTaskTimerRun,
  getTask,
  hasSeenNotificationExplanation,
  loadTaskTimerRun,
  markNotificationExplanationSeen,
  saveTaskTimerRun,
  upsertTask,
} from "../data/storage.ts";
import { cancelScheduledNotification, scheduleReminderNotification } from "../data/notifications.ts";

/**
 * live/ActiveTaskScreen.tsx (route /tasks/[id])
 *
 * Hebrew BUILD/LIVE rework spec, page 4: a task's own detail/timer
 * screen. The timer itself is computed from real timestamps on every
 * render (arc/taskTimer.ts's getTaskTimerStatus) via a 1s re-render
 * tick -- same "AppState is a responsiveness refinement, not a
 * correctness requirement" philosophy already proven in
 * live/screens.tsx's useNow(), so backgrounding never desyncs the
 * displayed remaining time. On focus, this screen checks for an
 * already-persisted TaskTimerRun for THIS task before doing anything
 * else, resuming it directly rather than starting a fresh one (same
 * "resume, never duplicate" precedent as live/screens.tsx's useTimerRun).
 *
 * Productivity roadmap, Stage K: "הכנה לפני המשימה" opens
 * live/PreparationScreen.tsx (the proactive "strengthen a supportive
 * state before action" route), which itself ends by opening this exact
 * screen again with `autoStart=1`. Stage J: "משהו מפריע"/"בוא נעשה ARC
 * עכשיו" route to the general LIVE chooser (/live/select) WITH a
 * `returnToTaskId` param so the session returns to this exact task on
 * completion (scoped to the ArcBuild "ARC רגיל" path for now -- see
 * live/LiveSessionScreen.tsx's own doc for the other LIVE paths that
 * don't carry this context yet).
 */
export default function ActiveTaskScreen({
  taskId,
  autoStart = false,
  openPostpone = false,
}: {
  taskId: string;
  autoStart?: boolean;
  openPostpone?: boolean;
}) {
  const [task, setTask] = useState<Task | null>(null);
  const [timerRun, setTimerRun] = useState<TaskTimerRun | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [endChoice, setEndChoice] = useState<TaskTimerEndChoice | null>(null);
  const [restRun, setRestRun] = useState<TaskTimerRun | null>(null);
  const [showNotificationExplanation, setShowNotificationExplanation] = useState(false);
  const autoActionConsumed = useRef(false);

  const reload = useCallback(() => {
    Promise.all([getTask(taskId), loadTaskTimerRun(), hasSeenNotificationExplanation()]).then(([loadedTask, loadedRun, explanationSeen]) => {
      setTask(loadedTask);
      const matchingRun = loadedRun && loadedRun.taskId === taskId ? loadedRun : null;
      // Stage J: a persisted "rest" run restores into restRun, never timerRun -- the single storage slot is disambiguated by its own kind field, so app-restart mid-rest resumes the REST timer, not the main one.
      setTimerRun(matchingRun && matchingRun.kind === "rest" ? null : matchingRun);
      setRestRun(matchingRun && matchingRun.kind === "rest" ? matchingRun : null);
      // Stage AB: shown once, before the first action that would trigger the real OS permission dialog (starting a timer schedules a notification) -- never shown again once dismissed.
      setShowNotificationExplanation(!explanationSeen);
    });
  }, [taskId]);

  useFocusEffect(reload);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Today screen's own "start"/"postpone" card actions (see this
  // component's own doc comment above) -- fires at most once per screen
  // instance, and never when a timer is already in flight for this task.
  useEffect(() => {
    if (autoActionConsumed.current) return;
    if (!task) return;
    if (timerRun || restRun) {
      autoActionConsumed.current = true;
      return;
    }
    if (autoStart && task.status !== "completed") {
      autoActionConsumed.current = true;
      handleStart();
      return;
    }
    if (openPostpone) {
      autoActionConsumed.current = true;
      router.push({ pathname: "/tasks/[id]/postpone", params: { id: taskId } });
    }
  }, [task, timerRun, restRun, autoStart, openPostpone, taskId]);

  if (!task) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const activeRun = restRun ?? timerRun;
  const status = activeRun ? getTaskTimerStatus(activeRun, now) : null;

  async function persistTask(next: Task) {
    setTask(next);
    await upsertTask(next);
  }

  /**
   * Hebrew BUILD/LIVE rework spec: "כשהיא ברקע או כשהמסך נעול, השתמש
   * בהתראה מקומית" -- scheduled the moment the timer (re)starts, for
   * the exact remaining duration, so it fires whether or not the app
   * stays in the foreground. "אל תבטיח באנר או צליל כשמערכת ההפעלה או
   * הגדרות המכשיר חוסמות אותם" -- scheduleReminderNotification already
   * returns null (never throws) when permission is denied/unavailable;
   * the run is saved with notificationId: null in that case, and
   * nothing in this screen claims a notification will arrive.
   */
  async function scheduleTaskTimerNotification(run: TaskTimerRun, currentTask: Task): Promise<string | null> {
    const status = getTaskTimerStatus(run, Date.now());
    if (status.remainingSeconds <= 0) return null;
    return scheduleReminderNotification({
      kind: "taskTimerEnded",
      fireAt: new Date(Date.now() + status.remainingSeconds * 1000),
      title: "הזמן למשימה הסתיים",
      body: currentTask.title,
      arcRequested: false,
      taskId: currentTask.id,
    });
  }

  /** Productivity roadmap, Stage AB: the exact same pattern as scheduleTaskTimerNotification above, for the "I need rest" sub-timer -- a separate ReminderKind ("restTimerEnded") so a tapped rest notification never gets confused with the main task timer's own one. */
  async function scheduleRestTimerNotification(run: TaskTimerRun, currentTask: Task): Promise<string | null> {
    const status = getTaskTimerStatus(run, Date.now());
    if (status.remainingSeconds <= 0) return null;
    return scheduleReminderNotification({
      kind: "restTimerEnded",
      fireAt: new Date(Date.now() + status.remainingSeconds * 1000),
      title: "זמן המנוחה הסתיים",
      body: currentTask.title,
      arcRequested: false,
      taskId: currentTask.id,
    });
  }

  async function handleStart() {
    if (!task) return;
    // Resuming a postponed task means its own "return reminder" (if one was scheduled, Stage AB) is no longer relevant -- cancel it before anything else, never leaving it to fire later for no reason.
    if (task.notificationId) await cancelScheduledNotification(task.notificationId);
    const durationMinutes = task.expectedDurationMinutes ?? 25;
    const run = createTaskTimerRun(task.id, generateTaskTimerRunId(), durationMinutes, new Date().toISOString());
    const notificationId = await scheduleTaskTimerNotification(run, task);
    const runWithNotification = { ...run, notificationId };
    await saveTaskTimerRun(runWithNotification);
    setTimerRun(runWithNotification);
    await persistTask({ ...startTask(task, new Date().toISOString()), notificationId: null, notificationScheduledFor: null });
    const now = new Date().toISOString();
    await appendTaskJournalEntry(
      createTaskJournalEntry({ id: generateTaskJournalEntryId(), taskId: task.id, kind: "attempt_started", occurredAt: now, createdAt: now, attemptId: run.runId })
    );
  }

  async function handlePause() {
    if (!timerRun || !task) return;
    await cancelScheduledNotification(timerRun.notificationId);
    const paused = { ...pauseTaskTimerRun(timerRun, new Date().toISOString()), notificationId: null };
    await saveTaskTimerRun(paused);
    setTimerRun(paused);
    await persistTask(pauseTaskRecord(task, new Date().toISOString()));
    const now = new Date().toISOString();
    await appendTaskJournalEntry(
      createTaskJournalEntry({
        id: generateTaskJournalEntryId(),
        taskId: task.id,
        kind: "attempt_ended",
        occurredAt: now,
        createdAt: now,
        attemptId: timerRun.runId,
        attemptOutcome: "paused",
      })
    );
  }

  async function handleResume() {
    if (!timerRun || !task) return;
    const resumed = resumeTaskTimerRun(timerRun, new Date().toISOString());
    const notificationId = await scheduleTaskTimerNotification(resumed, task);
    const resumedWithNotification = { ...resumed, notificationId };
    await saveTaskTimerRun(resumedWithNotification);
    setTimerRun(resumedWithNotification);
    await persistTask(startTask(task, new Date().toISOString()));
  }

  async function handleFinishEarly() {
    if (!timerRun || !task) return;
    await cancelScheduledNotification(timerRun.notificationId);
    const finished = { ...finishTaskTimerRunEarly(timerRun, new Date().toISOString()), notificationId: null };
    await saveTaskTimerRun(finished);
    setTimerRun(finished);
    const now = new Date().toISOString();
    await appendTaskJournalEntry(
      createTaskJournalEntry({
        id: generateTaskJournalEntryId(),
        taskId: task.id,
        kind: "attempt_ended",
        occurredAt: now,
        createdAt: now,
        attemptId: timerRun.runId,
        attemptOutcome: "completed",
      })
    );
  }

  async function handleComplete() {
    if (!task) return;
    if (task.notificationId) await cancelScheduledNotification(task.notificationId);
    const now = new Date().toISOString();
    await persistTask({ ...completeTask(task, now), notificationId: null, notificationScheduledFor: null });
    await appendTaskJournalEntry(createTaskJournalEntry({ id: generateTaskJournalEntryId(), taskId: task.id, kind: "task_completed", occurredAt: now, createdAt: now }));
  }

  async function clearEndedTimer() {
    const endedRun = restRun ?? timerRun;
    if (endedRun) await cancelScheduledNotification(endedRun.notificationId);
    await clearTaskTimerRun();
    setTimerRun(null);
    setEndChoice(null);
    setRestRun(null);
  }

  // Hebrew BUILD/LIVE rework spec: "הפרד בין 'הטיימר הסתיים' לבין
  // 'המשימה הושלמה'" -- reaching timerEnded never marks the task
  // complete on its own; "סימון כהושלם" below is its own separate
  // action. "Ended" means either the timer naturally completed OR the
  // trainee finished it early (finishTaskTimerRunEarly sets
  // completedAt independently of elapsed time, so both must be
  // checked -- status.complete alone would miss an early finish that
  // happened before the full duration elapsed).
  const timerRunEnded = timerRun !== null && (timerRun.completedAt !== null || status?.complete === true);
  const restRunEnded = restRun !== null && (restRun.completedAt !== null || status?.complete === true);
  const timerEnded = timerRunEnded && restRun === null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Pressable onPress={() => router.push({ pathname: "/tasks/[id]/edit", params: { id: task.id } })}>
            <Text style={styles.editLink}>ערוך</Text>
          </Pressable>
          <Text style={styles.title}>{task.title}</Text>
        </View>
        <Text style={styles.actionLabel}>{task.currentAction ?? task.firstAction}</Text>

        {showNotificationExplanation && (
          <View style={styles.notificationExplanationBlock}>
            <Text style={styles.notificationExplanationText}>
              ARCHI מבקש הרשאת התראות כדי להזכיר לך כשהזמן למשימה מסתיים, גם אם האפליקציה ברקע. אפשר לשנות זאת בכל עת בהגדרות המכשיר.
            </Text>
            <Pressable
              style={styles.secondaryButton}
              onPress={async () => {
                await markNotificationExplanationSeen();
                setShowNotificationExplanation(false);
              }}
            >
              <Text style={styles.secondaryButtonText}>הבנתי</Text>
            </Pressable>
          </View>
        )}
        {task.subtasks.length > 0 && (
          <View style={styles.subtasksBlock}>
            {task.subtasks.map((subtask) => {
              const isCurrent = task.currentAction === subtask.title;
              return (
                <View key={subtask.id} style={styles.subtaskRow}>
                  <Pressable
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    onPress={() => persistTask(toggleTaskSubtaskCompletion(task, subtask.id, new Date().toISOString()))}
                  >
                    <Text style={styles.subtaskCheckbox}>{subtask.completed ? "✓" : "○"}</Text>
                  </Pressable>
                  <Pressable style={styles.flexOne} onPress={() => persistTask(setTaskCurrentAction(task, subtask.title, new Date().toISOString()))}>
                    <Text style={[styles.subtaskLine, isCurrent && styles.subtaskLineCurrent]}>{subtask.title}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}

        {timerEnded && (
          <View style={styles.endPromptBlock}>
            <Text style={styles.question}>הזמן שהוקצה למשימה הסתיים. מה מתאים לך עכשיו?</Text>
            {(Object.keys(TASK_TIMER_END_CHOICE_LABELS) as TaskTimerEndChoice[]).map((choice) => (
              <Pressable
                key={choice}
                style={styles.primaryButton}
                onPress={() => {
                  if (choice === "start_arc") {
                    clearTaskTimerRun();
                    setTimerRun(null);
                    const destination = resolveArcChoiceDestination(task.linkedArcBuildId);
                    if (destination.kind === "open_linked") {
                      // Productivity roadmap, Stage J: "open the linked practice" means a LIVE session of it, not its BUILD editor -- /live directly, skipping /live/select's own picker entirely since the practice is already known.
                      router.push({ pathname: "/live", params: { buildId: destination.arcBuildId, returnToTaskId: task.id } });
                    } else {
                      router.push({ pathname: "/live/select", params: { returnToTaskId: task.id } });
                    }
                    return;
                  }
                  setEndChoice(choice);
                }}
              >
                <Text style={styles.primaryButtonText}>{TASK_TIMER_END_CHOICE_LABELS[choice]}</Text>
              </Pressable>
            ))}

            {endChoice === "rest" && (
              <View style={styles.chipRow}>
                {REST_DURATION_OPTIONS_MINUTES.map((minutes) => (
                  <Pressable
                    key={minutes}
                    style={styles.chip}
                    onPress={async () => {
                      await clearTaskTimerRun();
                      setTimerRun(null);
                      const rest = createTaskTimerRun(task.id, generateTaskTimerRunId(), minutes, new Date().toISOString(), "rest");
                      const notificationId = await scheduleRestTimerNotification(rest, task);
                      const restWithNotification = { ...rest, notificationId };
                      await saveTaskTimerRun(restWithNotification);
                      setRestRun(restWithNotification);
                      setEndChoice(null);
                    }}
                  >
                    <Text style={styles.chipText}>{minutes} דק&apos;</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {endChoice === "next_task" && (
              <Pressable
                style={styles.primaryButton}
                onPress={() => {
                  clearTaskTimerRun();
                  setTimerRun(null);
                  router.push("/tasks");
                }}
              >
                <Text style={styles.primaryButtonText}>המשימה הבאה</Text>
              </Pressable>
            )}
          </View>
        )}

        {restRun && status && (
          <View style={styles.timerBlock}>
            <Text style={styles.timerText}>מנוחה: {formatRemaining(status.remainingSeconds)}</Text>
            {restRunEnded ? (
              <Pressable style={styles.primaryButton} onPress={clearEndedTimer}>
                <Text style={styles.primaryButtonText}>סיום המנוחה</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.primaryButton}
                onPress={async () => {
                  await cancelScheduledNotification(restRun.notificationId);
                  const finished = { ...finishTaskTimerRunEarly(restRun, new Date().toISOString()), notificationId: null };
                  await saveTaskTimerRun(finished);
                  setRestRun(finished);
                }}
              >
                <Text style={styles.primaryButtonText}>סיום מוקדם</Text>
              </Pressable>
            )}
          </View>
        )}

        {!timerEnded && !restRun && timerRun && !timerRunEnded && status && (
          <View style={styles.timerBlock}>
            <Text style={styles.timerText}>{formatRemaining(status.remainingSeconds)}</Text>
            <View style={styles.buttonRow}>
              {status.paused ? (
                <Pressable style={styles.secondaryButton} onPress={handleResume}>
                  <Text style={styles.secondaryButtonText}>המשך</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.secondaryButton} onPress={handlePause}>
                  <Text style={styles.secondaryButtonText}>השהיה</Text>
                </Pressable>
              )}
              <Pressable style={styles.secondaryButton} onPress={handleFinishEarly}>
                <Text style={styles.secondaryButtonText}>סיום מוקדם</Text>
              </Pressable>
            </View>
            <Pressable style={styles.secondaryButton} onPress={() => router.push({ pathname: "/tasks/[id]/factor", params: { id: task.id } })}>
              <Text style={styles.secondaryButtonText}>משהו מפריע</Text>
            </Pressable>
            <Pressable style={styles.liveButton} onPress={() => router.push({ pathname: "/live/select", params: { returnToTaskId: task.id } })}>
              <Text style={styles.liveButtonText}>בוא נעשה ARC עכשיו</Text>
            </Pressable>
          </View>
        )}

        {!timerRun && !restRun && !timerEnded && (
          <View style={styles.buttonColumn}>
            <Pressable style={styles.primaryButton} onPress={handleStart}>
              <Text style={styles.primaryButtonText}>התחל עכשיו</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => router.push({ pathname: "/tasks/[id]/prepare", params: { id: task.id } })}>
              <Text style={styles.secondaryButtonText}>הכנה לפני המשימה</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => router.push({ pathname: "/tasks/[id]/factor", params: { id: task.id } })}>
              <Text style={styles.secondaryButtonText}>משהו מפריע</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => router.push({ pathname: "/live/select", params: { returnToTaskId: task.id } })}>
              <Text style={styles.secondaryButtonText}>בוא נעשה ARC עכשיו</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => router.push({ pathname: "/tasks/[id]/postpone", params: { id: task.id } })}>
              <Text style={styles.secondaryButtonText}>דחיית המשימה</Text>
            </Pressable>
          </View>
        )}

        {task.status === "completed" ? (
          <>
            <Text style={styles.completedLabel}>המשימה הושלמה</Text>
            <Pressable style={styles.skipLink} onPress={() => router.push({ pathname: "/tasks/[id]/reflect", params: { id: task.id } })}>
              <Text style={styles.skipLinkText}>רפלקציה קצרה (רשות)</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={styles.secondaryButton} onPress={handleComplete}>
            <Text style={styles.secondaryButtonText}>סימון כהושלם</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

function formatRemaining(remainingSeconds: number): string {
  const totalSeconds = Math.ceil(remainingSeconds);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20, gap: 4 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right" },
  editLink: { color: "#0a7ea4", fontSize: 14 },
  actionLabel: { fontSize: 16, textAlign: "right", color: "#444", marginTop: 6, marginBottom: 16 },
  notificationExplanationBlock: { backgroundColor: "#f7fbfd", borderRadius: 10, padding: 14, marginBottom: 16 },
  notificationExplanationText: { fontSize: 13, textAlign: "right", color: "#444", marginBottom: 10, lineHeight: 19 },
  hint: { fontSize: 14, textAlign: "right", color: "#666" },
  subtasksBlock: { marginBottom: 16 },
  subtaskRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  subtaskCheckbox: { fontSize: 16, color: "#0a7ea4", width: 20, textAlign: "center" },
  flexOne: { flex: 1 },
  subtaskLine: { fontSize: 15, textAlign: "right" },
  subtaskLineCurrent: { fontWeight: "700", color: "#0a7ea4" },
  question: { fontSize: 16, fontWeight: "600", textAlign: "right", marginBottom: 10 },
  timerBlock: { alignItems: "center", marginVertical: 24, gap: 12 },
  timerText: { fontSize: 36, fontWeight: "700" },
  buttonRow: { flexDirection: "row", gap: 10 },
  buttonColumn: { gap: 12, marginTop: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  chipText: { color: "#0a7ea4", fontSize: 14 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 8 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10, alignItems: "center" },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 15 },
  liveButton: { backgroundColor: "#7A2E2E", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 12 },
  liveButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  endPromptBlock: { marginVertical: 20 },
  completedLabel: { fontSize: 15, color: "#1a6b4a", textAlign: "center", marginTop: 16, fontWeight: "600" },
  skipLink: { marginTop: 10, alignItems: "center" },
  skipLinkText: { color: "#666", fontSize: 13 },
});
