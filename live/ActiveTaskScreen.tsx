import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import {
  completeTask,
  generateTaskJournalEntryId,
  pauseTask as pauseTaskRecord,
  recordTodoSplitProgress,
  setTaskCurrentAction,
  startTask,
  toggleTaskSubtaskCompletion,
} from "../arc/tasks.ts";
import type { Task } from "../arc/tasks.ts";
// Smart To-Do List task, section 3: the exact same single-slot
// precedent TaskStageProgress already uses -- created alongside the
// TaskTimerRun in performStart below, read (and cleared, via the SAME
// clearTaskTimerRun() every other completion/early-finish/postponement
// call site already calls) in handleComplete.
import { createTodoSplitSession } from "../arc/todoSplitSession.ts";
import { createTaskOccurrenceCompletion } from "../arc/taskOccurrence.ts";
// ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry "Cubes"
// task, section 3/4: the single-slot TaskSplitProgress record a To-Do
// task's own duration-selection screen (live/TaskDurationSelectionScreen.tsx)
// persists BEFORE returning here with autoStart=1 -- read back below to
// start the first segment, and advanced in place as each segment ends.
import { advanceTaskSplitProgress, currentSplitSegment, isTaskSplitProgressComplete } from "../arc/taskSplitProgress.ts";
import type { TaskSplitProgress } from "../arc/taskSplitProgress.ts";
import { createTaskJournalEntry } from "../data/taskJournal.ts";
import { bypassDailyVisualizationForToday, isDailyVisualizationNeededNow } from "../data/dailyVisualization.ts";
import {
  createTaskTimerRun,
  finishTaskTimerRunEarly,
  generateTaskTimerRunId,
  getTaskTimerStatus,
  pauseTaskTimerRun,
  resumeTaskTimerRun,
  shortenTaskTimerRun,
} from "../arc/taskTimer.ts";
import type { TaskTimerRun } from "../arc/taskTimer.ts";
import {
  appendArcInsight,
  appendTaskJournalEntry,
  appendTaskOccurrenceCompletion,
  clearPendingIdentityInsightTaskId,
  clearTaskTimerRun,
  getTask,
  hasSeenNotificationExplanation,
  loadArcInsights,
  loadPendingIdentityInsightTaskId,
  loadBreakSoundEnabled,
  loadTaskOccurrenceOverrides,
  loadTaskSplitProgress,
  loadTaskStageProgress,
  loadTaskTimerRun,
  loadTodoSplitSession,
  markNotificationExplanationSeen,
  saveTaskOccurrenceOverrides,
  saveTaskSplitProgress,
  saveTaskStageProgress,
  saveTaskTimerRun,
  saveTodoSplitSession,
  upsertArcBelief,
  upsertTask,
} from "../data/storage.ts";
import type { ArcInsight } from "../arc/arcInsightBelief.ts";
import { buildTaskOccurrenceOverride, findTaskOccurrenceOverride, resolveEffectiveOccurrence, upsertTaskOccurrenceOverride } from "../arc/taskOccurrenceOverride.ts";
import { createArcInsight, createLearnedBelief, generateArcBeliefId, generateArcInsightId } from "../arc/arcInsightBelief.ts";
import { cancelScheduledNotification } from "../data/notifications.ts";
import { armTaskTimerEndAlarm, cancelAnyAlarmFor, cancelTaskTimerEndAlarm, scheduleTaskAlarm } from "../data/taskAlarm.ts";
import { isScreenLockedOrOffAsync, showFloatingTimerOverlay, showIdleFloatingOverlayPanel, updateFloatingTimerOverlay } from "../data/floatingTimerOverlay.ts";
import { displayProactiveSupportNotification } from "../data/proactiveSupportNotification.ts";
import type { NextScheduledTaskForOverlay } from "../arc/floatingTimerOverlayPayload.ts";
import { playBreakStartSound, playTimerCompletionSound } from "../data/timerSound.ts";
import { resolveTaskClockTime } from "../arc/todaySchedule.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";
import { findLatestOutcomeForTask, recordStartedOriginalTaskAfter } from "../arc/postponementObstacle.ts";
import { loadPostponementObstacleOutcomes, upsertPostponementObstacleOutcome } from "../data/storage.ts";
import { resolveContinuousRoutineOutcome } from "../data/dailyRoutine.ts";
import { formatMinutesToClockTime, parseClockTimeToMinutes } from "../arc/dailyRoutine.ts";
import { resolveMostUrgentScheduledTask, resolveNextScheduledTaskDisplay, resolveTodaysScheduledPlan } from "../data/dailyPlan.ts";
import type { NextScheduledTaskDisplay } from "../data/dailyPlan.ts";
import {
  enterArc,
  enterBreak,
  endTaskContinuationLoop,
  exitArcBackToLoop,
  exitBreak,
  recordSegmentEnd,
  resolveLoopHardStopMinutes,
  startNextSegment,
  startTaskContinuationLoop,
} from "../arc/taskContinuationLoop.ts";
import type { TaskContinuationLoopState } from "../arc/taskContinuationLoop.ts";
import { suggestNextSegmentMinutes } from "../arc/taskContinuationSuggestion.ts";
import { buildAdaptedTaskDraft, suggestHalvedDuration } from "../arc/taskAdaptation.ts";
import {
  appendTaskContinuationLoopHistoryEntry,
  clearTaskContinuationLoop,
  loadSupportiveActionFlowPending,
  loadTaskContinuationLoop,
  saveTaskContinuationLoop,
} from "../data/storage.ts";
import { recordSilentTaskCompletionReward } from "../data/postTaskRewards.ts";
import { loadArcTaskReminderSettings } from "../data/storage.ts";
import { recomputeTaskTransitionNotification } from "../data/taskTransitionNotification.ts";
import { recomputeTaskNotStartedNotification } from "../data/taskNotStartedNotification.ts";
import { recomputeFreeTimeWindowNotification } from "../data/freeTimeWindowNotification.ts";
import { markSupportiveBodySensationUsagesTaskOutcome } from "../data/storage.ts";
import { resolveBodySensationContextKeys } from "../arc/supportiveBodySensation.ts";
import { createArcFocusSession, generateArcFocusPracticeId } from "../arc/arcFocusSession.ts";
import { loadArcFocusSettings, saveArcFocusSession } from "../data/storage.ts";
import type { TaskLinkedAction } from "../arc/taskLinkedAction.ts";
import { resolveLinkedActionStaticRoute } from "../arc/taskLinkedAction.ts";
import { displayTaskMemoryReminderForTask, recomputeTaskMemoryReminderNotification } from "../data/taskMemoryReminderNotification.ts";
import { addPendingContinuousRoutineSmiles, takePendingContinuousRoutineSmiles } from "../data/continuousRoutineGroup.ts";
import { hasConfiguredActionStages, resolveFirstActionStage, resolveNextActionStage, sumActionStageDurations } from "../arc/taskStage.ts";
import { advanceStageProgress, createTaskStageProgress, isStageCompleted, markStageCompleted, resolveCompletedDurationMinutes } from "../arc/taskStageProgress.ts";
import type { TaskStageProgress } from "../arc/taskStageProgress.ts";
import { openFullArc, openShortenedArc, openUrgeArc } from "../data/emotionalCheckInRouting.ts";
import { loadArcGoals, loadArcGymGoals, loadPurposeManifests } from "../data/storage.ts";
import { loadArcBookChapters } from "../data/storage.ts";
import type { ArcGoal } from "../arc/types.ts";
import type { PurposeManifest } from "../arc/purposeManifest.ts";
import type { ArcGymGoal } from "../arc/arcGymGoal.ts";
import { resolveTaskPurposeContext } from "../arc/taskPurposeContext.ts";
import TaskPurposeCard from "./components/TaskPurposeCard.tsx";
import ArcAddictionTaskLiveEntry from "./components/ArcAddictionTaskLiveEntry.tsx";

/**
 * Smart Postponement Flow, requirement 6: the ONE place "did the
 * trainee actually start the task afterward" gets recorded -- every
 * postponement intervention (ARC, rest, or the smaller-task screen's
 * own explicit "start original task" exit) ends, if the trainee
 * continues, by reaching this exact function through whichever path
 * they took, so the signal is captured without threading an outcome id
 * through ARC's own session state or the rest timer. Only touches the
 * MOST RECENT outcome for this task, and only while it's still
 * unresolved (null) -- never overwrites an already-answered one, and a
 * task with no pending postponement at all is a silent no-op.
 */
/** Task Shortening/Rescheduling UI: how many minutes each option reduces/extends by -- deterministic chip choices, never free-text minutes, matching this codebase's own established REST_DURATION_OPTIONS_MINUTES convention. */
const SHORTEN_TASK_OPTIONS_MINUTES = [5, 10, 15];
const RESCHEDULE_NEXT_TASK_OPTIONS_MINUTES = [15, 30, 60];
const ADJUST_NEXT_DURATION_OPTIONS_MINUTES = [15, 30, 45, 60];

async function markOriginalTaskStartedIfPending(taskId: string, now: string): Promise<void> {
  const outcomes = await loadPostponementObstacleOutcomes();
  const latest = findLatestOutcomeForTask(outcomes, taskId);
  if (!latest || latest.startedOriginalTaskAfter !== null) return;
  await upsertPostponementObstacleOutcome(recordStartedOriginalTaskAfter(latest, true, now));
}

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
 *
 * Floating ARC button task: the native floating overlay's own ARC
 * button (modules/floating-timer-overlay) deep-links here with
 * `needArc=1` (archi://tasks/<id>?needArc=1) -- consumed once, by the
 * auto-action effect below, via handleNeedArc.
 *
 * Unified Task Stages task: the floating overlay's own new ✓ button
 * deep-links here with `completeStage=1` (archi://tasks/<id>?completeStage=1),
 * consumed once by the exact same auto-action effect, via
 * handleCompleteStage -- the SAME function the full screen's own ✓
 * button calls, so "completed from the overlay" and "completed from
 * Task LIVE" are never two different code paths.
 */
export default function ActiveTaskScreen({
  taskId,
  autoStart = false,
  openPostpone = false,
  needArc = false,
  completeStage = false,
  nextTask = false,
  addInsight = false,
  addQuestion = false,
  addPositiveEvent = false,
  splitMinutes = null,
}: {
  taskId: string;
  autoStart?: boolean;
  openPostpone?: boolean;
  needArc?: boolean;
  completeStage?: boolean;
  /** ARCHI -- Unified Floating Overlay & Mini ARC Improvements task: the unified floating panel's own "עבור למשימה הבאה" button, while a task session is active/paused, deep-links here with nextTask=1 -- consumed once by the auto-action effect below, calling the EXACT SAME handleNextTask() the in-screen "המשימה הבאה" button already uses. */
  nextTask?: boolean;
  /** ARCHI -- Unified Floating Overlay & Mini ARC Improvements task: the unified floating panel's own "💡 הוסף תובנה" button, while a task session is active/paused, deep-links here with addInsight=1 -- opens the existing insight editor with this task as its return context, never a second insight editor. */
  addInsight?: boolean;
  /** ARC Questions task, section 2: the floating timer's own "+ שאלה" button, while a task session is active/paused, deep-links here with addQuestion=1 -- opens the ARC Questions composer with this task as its return context, never finishing/canceling/resetting the active task or timer. */
  addQuestion?: boolean;
  /** Positive Memory, Success Recall & Quick Capture task, section 3A: the floating cube's/Android widget's own "✨ הוסף אירוע חיובי" button, while a task session is active/paused, deep-links here with addPositiveEvent=1 -- opens the positive-event documentation entry screen with this task as its return context, never finishing/canceling/resetting the active task or timer. */
  addPositiveEvent?: boolean;
  /**
   * Smart To-Do List task, section 6: set ONLY when ARC LIVE's
   * returnToTask (or the Time Planning popup) sent the trainee here
   * after they explicitly accepted a To-Do split suggestion -- the
   * chosen split's own minute count. null for every ordinary open,
   * including every pre-existing call site. performStart below reads
   * it ONLY for an isTodoItem task (never overriding an ordinary
   * scheduled task's own duration).
   */
  splitMinutes?: number | null;
}) {
  const [task, setTask] = useState<Task | null>(null);
  /**
   * Flexible Daily Routine task, integration fix: `task` state above is
   * today's EFFECTIVE occurrence (template + today's override merged)
   * -- the source of truth for display and execution. This ref holds
   * the RAW, un-merged Task exactly as stored, so persistTask below can
   * always write back the template's own scheduledTime/
   * expectedDurationMinutes/order, never today's overridden values --
   * without this, starting/pausing/completing/toggling a subtask on an
   * overridden occurrence would silently overwrite the Fixed Weekly
   * Routine template itself with today's one-off numbers, the exact
   * "must not overwrite date-specific changes... onto the template"
   * failure this whole feature exists to prevent, just in the other
   * direction.
   */
  const rawTaskRef = useRef<Task | null>(null);
  const [timerRun, setTimerRun] = useState<TaskTimerRun | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [restRun, setRestRun] = useState<TaskTimerRun | null>(null);
  const [showNotificationExplanation, setShowNotificationExplanation] = useState(false);
  /** Daily Visualization task, requirement 5: "before the user begins their first scheduled task... direct them to complete the Daily Visualization" -- shown instead of actually starting, from handleStart below. */
  const [showVisualizationGate, setShowVisualizationGate] = useState(false);
  const [visualizationGateBusy, setVisualizationGateBusy] = useState(false);
  /** Unified Task Stages task: null for a task with no configured stage breakdown, or whenever no stage-aware run is currently in flight -- every stage-specific rendering/behavior below is gated on this being non-null, so a legacy task's screen is completely unaffected. */
  const [stageProgress, setStageProgress] = useState<TaskStageProgress | null>(null);
  /**
   * ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry "Cubes"
   * task, section 4: null for a legacy/non-split task, or once every
   * segment of a chosen "עבודה מחולקת" plan has ended -- every
   * split-specific effect/rendering below is gated on this being
   * non-null AND matching this task, so an ordinary task/To-Do start
   * is completely unaffected.
   */
  const [splitProgress, setSplitProgress] = useState<TaskSplitProgress | null>(null);
  /** Guards the segment-advance effect below against firing twice for the SAME ended run (a re-render before the next segment's own fresh TaskTimerRun is visible in state) -- the exact same per-runId guard pattern already used for the completion-sound effect. */
  const segmentAdvancedForRunId = useRef<string | null>(null);
  /**
   * ARCHI -- Adaptive Task Execution & Emotional Persistence task,
   * sections 6-10: Task LIVE's own continuation loop -- null whenever
   * no loop is in progress for this task (every pre-existing behavior
   * on this screen is completely unaffected). Scoped deliberately to
   * the ORDINARY case only: a split To-Do segment or a configured-
   * stages task already has its own, separately-tested adaptive
   * continuation (advanceToNextSplitSegment/handleCompleteStage above)
   * -- this loop is a different, additive mechanism for the general
   * case the spec describes, never a replacement for either, so both
   * are explicitly excluded from entering it (see the natural-end
   * effect below).
   */
  const [continuationLoop, setContinuationLoop] = useState<TaskContinuationLoopState | null>(null);
  const continuationHandledForRunId = useRef<string | null>(null);
  const loopBreakExitedForRunId = useRef<string | null>(null);
  const loopHardStopHandledRef = useRef(false);
  const supportiveActionRedirectChecked = useRef(false);
  const [showContinuationDurationInput, setShowContinuationDurationInput] = useState(false);
  const [continuationDurationDraft, setContinuationDurationDraft] = useState("");
  const [showContinuationShrink, setShowContinuationShrink] = useState(false);
  const [continuationShrinkMinutesDraft, setContinuationShrinkMinutesDraft] = useState("");
  const [continuationShrinkTextDraft, setContinuationShrinkTextDraft] = useState("");
  /** Guards handleCompleteStage against a rapid double-tap (or the overlay's own deep-link racing a manual tap) within the same render -- the PURE markStageCompleted/advanceStageProgress functions are already idempotent once state has caught up, but this closes the window between two calls firing before a re-render. */
  const [completingStage, setCompletingStage] = useState(false);
  /**
   * Task Completion Navigation fix: `taskCompleting` (state, below)
   * drives the render -- the very next render (even before
   * persistTask/the reflect navigation actually land) already hides
   * the end-of-timer prompt block (ARC/rest/"המשימה הבאה") and the
   * complete/next/skip button row below it. But a `useState` setter's
   * effect is NOT visible to the next synchronous call into this same
   * closure -- React batches it for the next render, so two rapid taps
   * on "השלמת משימה" (both calling handleComplete before React has
   * re-rendered even once) would both still read `taskCompleting` as
   * false and both proceed, each appending its own duplicate
   * task_completed journal entry / TaskOccurrenceCompletion record.
   * `taskCompletingRef` is the actual idempotency guard: a plain
   * mutable ref is updated the instant it's assigned, so the SECOND
   * call -- however soon after the first -- reads `true` immediately
   * and returns, with no dependency on any render having happened.
   */
  const taskCompletingRef = useRef(false);
  const [taskCompleting, setTaskCompleting] = useState(false);
  /** Part I: this task's own identity-insight prompt, shown ONLY when live/NewArcLiveScreen.tsx marked it pending (Task/Combined track, right before handing back for the identity action) -- never for a task that never went through that ARC path. */
  const [showIdentityInsightPrompt, setShowIdentityInsightPrompt] = useState(false);
  const [identityInsightDraft, setIdentityInsightDraft] = useState("");
  const [identityBeliefDraft, setIdentityBeliefDraft] = useState("");
  /** Task Completion Navigation fix (follow-up hardening): same reasoning as taskCompletingRef above -- appendArcInsight/appendArcBelief have no data-layer dedupe of their own, and setShowIdentityInsightPrompt(false) isn't visible until the next render, so a rapid double-tap on "המשך למשימה הבאה" needs a ref, not state, to actually block the second call. */
  const identityInsightFinishingRef = useRef(false);
  const autoActionConsumed = useRef(false);
  /** Productivity upgrade task, requirement 3: which run id the foreground completion sound has already played for -- a plain ref, not state, since it must never itself trigger a re-render; guards against playing it again on every subsequent 1s re-render tick while the end-of-timer prompt stays on screen. */
  const soundPlayedForRunId = useRef<string | null>(null);
  /** ARC Reminders task: guards the auto-complete-on-timer-end effect below against firing more than once for the exact same run (handleComplete's own taskCompletingRef already makes a second call a safe no-op regardless -- this just avoids calling it redundantly on every 1s tick). */
  const autoCompletedForRunId = useRef<string | null>(null);
  /**
   * Lock-Screen Timer, Next-Task Schedule and Smart Alarm Conflict
   * Management task, requirement 2: today's EFFECTIVE next scheduled
   * task after THIS one -- resolved via the one shared
   * resolveNextScheduledTaskDisplay (data/dailyPlan.ts), never a second
   * "what's scheduled today" algorithm. Shown on both the pre-start
   * (Task Details) and active (Task LIVE) renders below; also fed into
   * the lock-screen notification payload.
   */
  const [nextScheduledTask, setNextScheduledTask] = useState<NextScheduledTaskDisplay | null>(null);
  /** Lets reload()'s own stable (taskId-only-dependent) useCallback closure always read the LATEST resolved next-task, never a stale snapshot captured when that closure was last created. Every other handler below is a plain function recreated on every render, so it reads `nextScheduledTask` state directly instead -- this ref exists only for reload's sake. */
  const nextScheduledTaskForOverlayRef = useRef<NextScheduledTaskForOverlay | null>(null);
  /** Task Shortening/Rescheduling UI, option D ("Continue the current task unchanged"): dismisses the contextual adjust section for THIS specific next-task conflict only -- a genuinely new conflict (a different next task, or this same one recomputed after a reschedule) shows the section again. */
  const [dismissedAdjustSectionForTaskId, setDismissedAdjustSectionForTaskId] = useState<string | null>(null);
  /**
   * ARCHI -- Unified Development Specification task, Part 9 ("DISPLAY
   * LINKED INSIGHTS IN TASK LIVE"): every ArcInsight whose own taskId
   * matches THIS task, reloaded on every focus -- never a cross-task
   * leak, since the filter below is a strict equality on taskId.
   * `expandedInsightIds` is a plain per-insight collapse/expand set so
   * a long insight's text never forces the whole block open at once;
   * collapsed by default, so multiple linked insights never clutter
   * this screen, and nothing here is ever a modal/interruption.
   */
  const [linkedInsights, setLinkedInsights] = useState<ArcInsight[]>([]);
  const [expandedInsightIds, setExpandedInsightIds] = useState<Set<string>>(new Set());
  /**
   * Task LIVE Purpose Card task: the three collections
   * resolveTaskPurposeContext (arc/taskPurposeContext.ts) reads from --
   * reloaded on every focus alongside everything else in reload() below,
   * so editing a goal's manifest (or this task's own reason/value/
   * identity) elsewhere and returning to Task LIVE always shows the
   * current data, never a stale snapshot from when this screen first
   * mounted.
   */
  const [purposeManifests, setPurposeManifests] = useState<PurposeManifest[]>([]);
  const [purposeArcGymGoals, setPurposeArcGymGoals] = useState<ArcGymGoal[]>([]);
  const [purposeArcGoals, setPurposeArcGoals] = useState<ArcGoal[]>([]);

  const refreshNextScheduledTask = useCallback(async () => {
    // Task sync fix (floating-timer/next-task desync): the real,
    // globally active run (whichever task it belongs to -- NOT
    // necessarily this screen's own taskId, e.g. when manually viewing
    // a different/future task while another one is genuinely running)
    // is threaded through so resolveCurrentTaskState's own
    // isActiveTaskStillCurrent check can correctly defer ANY other
    // task's leftover stale `status === "active"` field to its ordinary
    // clock-window check, instead of letting it silently win the
    // "next" slot regardless of its own scheduled time.
    const run = await loadTaskTimerRun();
    const activeRun = run && run.kind !== "rest" ? run : null;
    const next = await resolveNextScheduledTaskDisplay(taskId, new Date(), activeRun);
    setNextScheduledTask(next);
  }, [taskId]);

  useEffect(() => {
    nextScheduledTaskForOverlayRef.current = nextScheduledTask
      ? {
          title: nextScheduledTask.task.title,
          effectiveStartTime: nextScheduledTask.effectiveStartTime,
          durationMinutes: nextScheduledTask.task.expectedDurationMinutes,
          isOverdue: nextScheduledTask.isOverdue,
        }
      : null;
  }, [nextScheduledTask]);

  const reload = useCallback(() => {
    Promise.all([
      getTask(taskId),
      loadTaskTimerRun(),
      hasSeenNotificationExplanation(),
      loadTaskStageProgress(),
      loadTaskOccurrenceOverrides(),
      loadPendingIdentityInsightTaskId(),
      loadArcInsights(),
      loadPurposeManifests(),
      loadArcGymGoals(),
      loadArcGoals(),
      loadTaskSplitProgress(),
    ]).then(([loadedTask, loadedRun, explanationSeen, loadedStageProgress, overrides, pendingInsightTaskId, allInsights, manifests, arcGymGoals, arcGoals, loadedSplitProgress]) => {
      setLinkedInsights(allInsights.filter((insight) => insight.taskId === taskId));
      setPurposeManifests(manifests);
      setPurposeArcGymGoals(arcGymGoals);
      setPurposeArcGoals(arcGoals);
      // Reflection-before-completion fix: `showIdentityInsightPrompt` is
      // re-derived HERE, from the persisted pending marker, every time
      // this screen loads or regains focus -- never left as a bare
      // "set once in handleComplete, cleared once in
      // finishIdentityInsight" flag that could otherwise still read
      // `true` on a later visit to this exact screen instance (e.g.
      // after Android Back, or after the identity-insight prompt was
      // abandoned without being answered) even though THIS load found
      // no genuinely pending insight for THIS task. Comparing against
      // `taskId` (not the possibly-stale `task.id` closure) also means
      // a persisted marker belonging to a DIFFERENT task can never leak
      // into this one's own screen.
      const stillPendingForThisTask = pendingInsightTaskId === taskId;
      setShowIdentityInsightPrompt(stillPendingForThisTask);
      if (!stillPendingForThisTask) {
        setIdentityInsightDraft("");
        setIdentityBeliefDraft("");
      }
      // Same reasoning for the two completion-in-flight guards: a
      // reload always means "establish the correct ground truth for
      // this task right now" -- no completion from an earlier visit is
      // still genuinely in flight by the time a NEW focus/mount reaches
      // this point, so both are reset here rather than ever risking a
      // stale `true` suppressing (or a stale ref blocking) a real,
      // later completion on what the trainee experiences as a fresh
      // screen.
      taskCompletingRef.current = false;
      setTaskCompleting(false);
      identityInsightFinishingRef.current = false;
      // Flexible Daily Routine task, integration fix: the effective
      // daily occurrence (today's own per-date override, if any) is the
      // source of truth for execution -- Task LIVE's own `task` state is
      // merged here, ONCE, right at load, so every downstream reader
      // (performStart's duration calc, the "starts in X" display, the
      // floating overlay payload built from this same state) agrees
      // with the Flexible Daily Routine screen on today's actual
      // time/duration, never the Fixed Weekly Routine template's raw
      // values. A date whose occurrence was explicitly removed for
      // today falls back to the template's own values here (unchanged
      // from before this task) -- "removed" only ever hides it from the
      // daily calendar's own list, it was never a reason to refuse
      // running the task if it's still opened directly.
      const todayLocal = todayLocalDateString(new Date());
      const effective = loadedTask && loadedTask.recurrence.kind === "recurring" ? resolveEffectiveOccurrence(loadedTask, todayLocal, overrides) : null;
      const effectiveTask =
        effective && !effective.removed
          ? { ...loadedTask!, scheduledTime: effective.scheduledTime, expectedDurationMinutes: effective.expectedDurationMinutes, order: effective.order }
          : loadedTask;
      rawTaskRef.current = loadedTask;
      setTask(effectiveTask);
      const matchingRun = loadedRun && loadedRun.taskId === taskId ? loadedRun : null;
      // Stage J: a persisted "rest" run restores into restRun, never timerRun -- the single storage slot is disambiguated by its own kind field, so app-restart mid-rest resumes the REST timer, not the main one.
      const restMatch = matchingRun && matchingRun.kind === "rest" ? matchingRun : null;
      const taskMatch = matchingRun && matchingRun.kind === "rest" ? null : matchingRun;
      setTimerRun(taskMatch);
      setRestRun(restMatch);
      // Unified Task Stages task: stage progress only ever applies to the
      // MAIN task run, never the rest sub-timer -- restored here so a
      // process restart mid-stage resumes at the correct active stage.
      setStageProgress(taskMatch && loadedStageProgress && loadedStageProgress.taskId === taskId ? loadedStageProgress : null);
      setSplitProgress(loadedSplitProgress && loadedSplitProgress.taskId === taskId ? loadedSplitProgress : null);
      // Stage AB: shown once, before the first action that would trigger the real OS permission dialog (starting a timer schedules a notification) -- never shown again once dismissed.
      setShowNotificationExplanation(!explanationSeen);
      // Floating task timer task, requirement 7: restores the floating
      // overlay/ongoing notification after ARCHI itself was reopened --
      // the native service's own in-memory state never survives the app
      // process being killed, only the persisted TaskTimerRun does, so
      // this is re-synced on every focus of this screen (a cheap, fully
      // idempotent no-op when nothing actually changed).
      if (effectiveTask && (taskMatch || restMatch)) {
        const relevantStageProgress = taskMatch && loadedStageProgress && loadedStageProgress.taskId === taskId ? loadedStageProgress : null;
        showFloatingTimerOverlay(restMatch ?? taskMatch!, effectiveTask, relevantStageProgress, nextScheduledTaskForOverlayRef.current);
      }
    });
    refreshNextScheduledTask();
    // ARCHI -- Adaptive Task Execution & Emotional Persistence task,
    // sections 9+11: loaded alongside everything else on every
    // focus/reload, matching the "full synchronization... loop state
    // must survive app close/reopen" requirement -- a task reached with
    // no pending loop at all sees `continuationLoop` stay null, exactly
    // as every pre-existing task already does. `activeTaskId` is
    // checked too (not just `taskId`), so the loop still resumes on the
    // SHRUNK child task's own screen after "No -> להקטין" navigates
    // there (see handleContinuationShrinkConfirm below).
    loadTaskContinuationLoop().then((loop) => {
      if (!loop || loop.phase === "ended" || (loop.taskId !== taskId && loop.activeTaskId !== taskId)) {
        setContinuationLoop(null);
        return;
      }
      if (loop.phase === "arc") {
        // ARC-context-passing fallback: returning from the existing
        // Full/Shortened ARC route always lands back on THIS screen
        // (/tasks/[id]) -- exitArcBackToLoop's own no-op-if-not-"arc"
        // guard makes this safe even if this effect somehow ran twice.
        const exited = exitArcBackToLoop(loop, new Date().toISOString());
        saveTaskContinuationLoop(exited).then(() => setContinuationLoop(exited));
        return;
      }
      setContinuationLoop(loop);
    });
  }, [taskId, refreshNextScheduledTask]);

  useFocusEffect(reload);

  // ARCHI -- Adaptive Task Execution & Emotional Persistence task,
  // section 4: live/SupportiveActionFlowScreen.tsx's own ARC-return
  // fallback -- that screen persists `awaitingArcReturn: true` right
  // before navigating to the existing Full/Shortened ARC route, since
  // ARC's own return path always lands here (/tasks/[id]), never back
  // on that screen directly (this task must not touch
  // live/NewArcLiveScreen.tsx's own returnToTask() to make it do
  // otherwise). This is the one place that notices the flag and routes
  // straight back -- an ordinary visit to this task with no pending
  // flow (the overwhelming majority of visits) is completely
  // unaffected, since the flag is false/absent for every one of them.
  useEffect(() => {
    if (supportiveActionRedirectChecked.current || !task) return;
    supportiveActionRedirectChecked.current = true;
    loadSupportiveActionFlowPending().then((pending) => {
      if (pending && pending.taskId === task.id && pending.awaitingArcReturn) {
        router.replace({ pathname: "/tasks/[id]/supportive-action", params: { id: task.id } });
      }
    });
  }, [task]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Productivity upgrade task, requirement 3: a clear, foreground
  // completion sound exactly once per run -- the background/locked-
  // phone case is already covered by the run's own scheduled OS
  // notification (its own separately-configured sound); this is the
  // SAME foreground-only signal data/timerSound.ts's own doc describes
  // for every other real timed activity in this app, just never wired
  // up for the task timer specifically until now.
  useEffect(() => {
    if (!timerRun || restRun) return;
    const statusNow = getTaskTimerStatus(timerRun, Date.now());
    const ended = timerRun.completedAt !== null || statusNow.complete === true;
    if (ended && soundPlayedForRunId.current !== timerRun.runId) {
      soundPlayedForRunId.current = timerRun.runId;
      // ARC Reminders task, requirement 9: this completion cue is now
      // one of the independent settings toggles
      // (ArcTaskReminderSettings.completionSoundEnabled) instead of
      // always playing -- gates ONLY this sound, never the auto-
      // complete/auto-advance behavior itself (handleComplete below
      // checks soundPlayedForRunId.current, set synchronously right
      // here regardless of the setting, so it never plays a SECOND
      // completion sound for the exact same run once handleComplete's
      // own auto-trigger fires moments later).
      loadArcTaskReminderSettings().then((settings) => {
        if (settings.completionSoundEnabled) playTimerCompletionSound();
      });
    }
  }, [timerRun, restRun, now]);

  /**
   * ARC Reminders task, requirement 5 ("a normally-ending task timer
   * auto-completes the task... ZERO mandatory screens"): the ONLY
   * place that fires now when the main task timer naturally reaches
   * 0 -- no 3-choice prompt (ARC/rest/"המשימה הבאה"), no tap required.
   * Recomputes "ended" itself the same way the completion-sound effect
   * above already does (never the later `timerEnded` const, which is
   * computed after this component's own `if (!task) return` branch and
   * so cannot be a dependency of a hook that must run on every render).
   * Declared right after that sound effect so, within the same commit,
   * its ref write (soundPlayedForRunId.current) is already visible to
   * handleComplete's own soundAlreadyPlayedForThisRun check the instant
   * it runs here. Calls the EXACT SAME handleComplete() the manual
   * "השלמת משימה" button already calls -- per the user's own
   * clarification, both completion paths converge on one automatic
   * behavior, never two separate implementations. handleComplete's own
   * taskCompletingRef guard makes this safe even if this effect were to
   * ever fire twice for the same run.
   */
  useEffect(() => {
    if (!timerRun || restRun) return;
    // Cubes task's own split-segment-advance effect (right below this
    // one) owns every segment-end EXCEPT the last: when this task is
    // mid-split with a real next segment still ahead, that effect's
    // own advanceToNextSplitSegment is what must run, never this one --
    // computed the IDENTICAL way that function itself decides
    // "is there a next segment", since splitProgress's own
    // isTaskSplitProgressComplete only flips true AFTER that effect
    // persists the advanced state, which it deliberately never does on
    // the last segment (see its own doc) -- checking it here would
    // never distinguish "last segment" from "mid-split" at the exact
    // moment both effects fire.
    if (task && task.isTodoItem && splitProgress && splitProgress.taskId === task.id) {
      const hasNextSegment = currentSplitSegment(advanceTaskSplitProgress(splitProgress)) !== null;
      if (hasNextSegment) return;
    }
    const statusNow = getTaskTimerStatus(timerRun, Date.now());
    const ended = timerRun.completedAt !== null || statusNow.complete === true;
    if (!ended || autoCompletedForRunId.current === timerRun.runId) return;
    // ARCHI -- Adaptive Task Execution & Emotional Persistence task,
    // section 7 ("behavior reversal"): a configured-stages task or a
    // mid-split To-Do segment keeps its own already-tested adaptive
    // continuation (handleCompleteStage/advanceToNextSplitSegment) --
    // every OTHER task's natural timer end now enters the continuation
    // loop instead of auto-completing, exactly as the spec requires.
    const stageActive = !!(stageProgress && task && stageProgress.taskId === task.id);
    const splitActive = !!(task && task.isTodoItem && splitProgress && splitProgress.taskId === task.id);
    if (task && !stageActive && !splitActive && continuationHandledForRunId.current !== timerRun.runId) {
      continuationHandledForRunId.current = timerRun.runId;
      void handleTimerNaturalEndForContinuationLoop(statusNow.elapsedSeconds);
      return;
    }
    autoCompletedForRunId.current = timerRun.runId;
    handleComplete();
  }, [task, splitProgress, stageProgress, timerRun, restRun, now]);

  /**
   * ARCHI -- Adaptive Task Execution & Emotional Persistence task,
   * section 7: records the just-ended segment's REAL elapsed seconds
   * (never lost, per section 12's own "never lose already-completed
   * work time") into the persisted loop -- starting a fresh one via
   * startTaskContinuationLoop if this is the first segment, or closing
   * the loop's own already-open segment (opened by startNextSegment
   * when this segment began) otherwise. Plays the completion sound via
   * the SAME gated effect every other run already uses (unchanged
   * above) -- this only stops the auto-handleComplete() that used to
   * follow it, replacing it with the continuation menu below.
   */
  async function handleTimerNaturalEndForContinuationLoop(elapsedSeconds: number) {
    if (!task) return;
    const nowIso = new Date().toISOString();
    const existing = await loadTaskContinuationLoop();
    const base =
      existing && existing.phase !== "ended" && (existing.taskId === task.id || existing.activeTaskId === task.id) ? existing : startTaskContinuationLoop(task.id, nowIso);
    const loop = recordSegmentEnd(base, elapsedSeconds, nowIso);
    await saveTaskContinuationLoop(loop);
    setContinuationLoop(loop);
    await clearEndedTimer();
  }

  /** Clamps a requested segment length against the real free time before the next scheduled task -- the SAME resolveFreeMinutesUntilNextTask-backed computation (via resolveLoopHardStopMinutes) every other adaptive-duration screen in this codebase already shares, never a second one. null (nothing else scheduled today) means no clamp. */
  async function resolveContinuationFreeMinutes(loop: TaskContinuationLoopState): Promise<number | null> {
    const scheduled = await resolveTodaysScheduledPlan(new Date());
    return resolveLoopHardStopMinutes(loop, scheduled, new Date());
  }

  function lastLoopSegmentMinutes(loop: TaskContinuationLoopState): number {
    const last = loop.segments[loop.segments.length - 1];
    if (last && last.minutes > 0) return Math.max(1, Math.round(last.minutes));
    return task?.expectedDurationMinutes ?? 10;
  }

  /** Every "yes" continuation option (continue-same/suggested-shorter/custom-duration/another-segment) funnels into this one call -- differing only in the requested minutes -- so there is exactly one place that starts the next real TaskTimerRun for the loop's own `activeTaskId` (the original task, or the shrunk child once "No -> להקטין" has run). */
  async function startLoopSegment(requestedMinutes: number) {
    if (!task || !continuationLoop) return;
    const freeMinutes = await resolveContinuationFreeMinutes(continuationLoop);
    const clamped = freeMinutes !== null ? Math.max(1, Math.min(requestedMinutes, freeMinutes)) : Math.max(1, requestedMinutes);
    const nowIso = new Date().toISOString();
    const advanced = startNextSegment(continuationLoop, continuationLoop.activeTaskId, nowIso);
    await saveTaskContinuationLoop(advanced);
    setContinuationLoop(advanced);
    const run = createTaskTimerRun(continuationLoop.activeTaskId, generateTaskTimerRunId(), clamped, nowIso);
    const notificationId = await scheduleTaskTimerNotification(run, task);
    const runWithNotification = { ...run, notificationId };
    await saveTaskTimerRun(runWithNotification);
    setTimerRun(runWithNotification);
    await updateFloatingTimerOverlay(runWithNotification, task, null, nextScheduledTaskForOverlay);
  }

  async function handleContinuationContinueSame() {
    if (!continuationLoop) return;
    await startLoopSegment(lastLoopSegmentMinutes(continuationLoop));
  }

  async function handleContinuationSuggestedShorter() {
    if (!continuationLoop) return;
    await startLoopSegment(suggestNextSegmentMinutes(lastLoopSegmentMinutes(continuationLoop)));
  }

  async function handleContinuationAnotherSegment() {
    if (!continuationLoop) return;
    await startLoopSegment(lastLoopSegmentMinutes(continuationLoop));
  }

  async function handleContinuationCustomDuration() {
    const minutes = Number(continuationDurationDraft);
    if (!continuationLoop || !minutes || minutes <= 0) return;
    setShowContinuationDurationInput(false);
    setContinuationDurationDraft("");
    await startLoopSegment(minutes);
  }

  /** "No -> הפסקה": the loop's own `enterBreak`, plus a real "rest"-kind TaskTimerRun -- the exact same createTaskTimerRun(..., "rest")/playBreakStartSound pair every other "I need rest" entry point in this screen already uses. */
  async function handleContinuationBreak(restMinutes: number) {
    if (!task || !continuationLoop) return;
    const nowIso = new Date().toISOString();
    const entered = enterBreak(continuationLoop, nowIso);
    await saveTaskContinuationLoop(entered);
    setContinuationLoop(entered);
    const run = createTaskTimerRun(continuationLoop.activeTaskId, generateTaskTimerRunId(), restMinutes, nowIso, "rest");
    const notificationId = await scheduleRestTimerNotification(run, task);
    const runWithNotification = { ...run, notificationId };
    await saveTaskTimerRun(runWithNotification);
    setRestRun(runWithNotification);
    await playBreakStartSound(await loadBreakSoundEnabled());
    await updateFloatingTimerOverlay(runWithNotification, task, null, nextScheduledTaskForOverlay);
  }

  /** Reached either by a manual tap on the break timer's own end button (clearEndedTimer already ran by the time either JSX branch calls this) or automatically once the rest run ends naturally (the effect below) -- either way, `exitBreak` always returns to the SAME menu, never losing the loop's own context, per the spec's own "in-loop breaks... never losing task context." */
  async function handleExitLoopBreak() {
    await clearEndedTimer();
    if (!continuationLoop) return;
    const nowIso = new Date().toISOString();
    const exited = exitBreak(continuationLoop, nowIso);
    await saveTaskContinuationLoop(exited);
    setContinuationLoop(exited);
  }

  /** "No -> ARC": `enterArc`'s own no-op-if-already-"arc" guard (arc/taskContinuationLoop.ts) makes this safe to call even if something fires it twice. "urge" reuses the existing openUrgeArc entry point (the floating cube's own "מחשבה/דחף" shortcut) while still recording the SAME "full" track the ordinary "😟 פחות טוב" button already does, since ArcTrackChosen only models full/shortened/none and the urge entry is the Full-ARC engine in its spontaneous+skipEmotionSelection mode -- documented in the final report as the closest-fit mapping. */
  async function handleContinuationArc(track: "full" | "shortened" | "urge") {
    if (!continuationLoop) return;
    const nowIso = new Date().toISOString();
    const entered = enterArc(continuationLoop, track === "urge" ? "full" : track, nowIso);
    await saveTaskContinuationLoop(entered);
    setContinuationLoop(entered);
    if (track === "full") await openFullArc(continuationLoop.activeTaskId);
    else if (track === "urge") await openUrgeArc(continuationLoop.activeTaskId);
    else await openShortenedArc(continuationLoop.activeTaskId);
  }

  /** "No -> להקטין": mirrors live/TaskAdaptationScreen.tsx's own buildAdaptedTaskDraft+clamp+upsertTask idiom inline (never navigating away mid-loop, so no already-accumulated segment/worked-time context is ever at risk of being lost in a round trip) -- the ORIGINAL task (continuationLoop.taskId) is never mutated; `activeTaskId` becomes the new shrunk child's id, and this screen navigates to ITS OWN route for that child id (autoStart=1) so every existing reader that keys off `task.id`/the single-slot TaskTimerRun's own `taskId` (the floating overlay, the alarm-conflict checks, isActiveTaskStillCurrent) stays internally consistent -- never a timer whose `taskId` disagrees with the mounted screen's own `task.id`, the exact class of bug already fixed once in this codebase (see arc/taskTimer.ts's own isAnotherTaskActive doc). */
  async function handleContinuationShrinkConfirm() {
    if (!task || !continuationLoop) return;
    const requested = Number(continuationShrinkMinutesDraft) || suggestHalvedDuration(task.expectedDurationMinutes ?? 10);
    const freeMinutes = await resolveContinuationFreeMinutes(continuationLoop);
    const clamped = freeMinutes !== null ? Math.max(5, Math.min(requested, freeMinutes)) : Math.max(5, requested);
    const nowIso = new Date().toISOString();
    const draft = buildAdaptedTaskDraft(task, clamped, continuationShrinkTextDraft.trim() || task.firstAction, nowIso);
    await upsertTask(draft);
    const advanced = startNextSegment(continuationLoop, draft.id, nowIso);
    await saveTaskContinuationLoop(advanced);
    setShowContinuationShrink(false);
    setContinuationShrinkMinutesDraft("");
    setContinuationShrinkTextDraft("");
    router.replace({ pathname: "/tasks/[id]", params: { id: draft.id, autoStart: "1" } });
  }

  /** "סיום": the REAL handleComplete() -- the loop ends with reason "completed" (section 12's tri-state: fully-completed), archived to history BEFORE the single live slot is cleared so its real segments/worked-time are never deleted, only ever the live loop. */
  async function handleContinuationFinish() {
    if (!continuationLoop) return;
    const nowIso = new Date().toISOString();
    const ended = endTaskContinuationLoop(continuationLoop, "completed", nowIso);
    await appendTaskContinuationLoopHistoryEntry(ended);
    await clearTaskContinuationLoop();
    setContinuationLoop(null);
    await handleComplete();
  }

  /** The no-next-task case's own explicit manual end -- reason "user_stopped" (tri-state: user-stopped, never read as failure), same archive-before-clear discipline as handleContinuationFinish above. Never calls handleComplete: the trainee explicitly stopped without finishing. */
  async function handleContinuationUserStop() {
    if (!task || !continuationLoop) return;
    const nowIso = new Date().toISOString();
    const ended = endTaskContinuationLoop(continuationLoop, "user_stopped", nowIso);
    await appendTaskContinuationLoopHistoryEntry(ended);
    await clearTaskContinuationLoop();
    setContinuationLoop(null);
    router.replace("/tasks");
  }

  /** The hard stop (section 10): "the moment the next scheduled task's time arrives... hands off to the existing next-task mechanism" -- reason "next_task_boundary" (tri-state: partial, never failure), the SAME navigateToNextOrTasksList this screen's own "המשימה הבאה" button already uses. Every "yes" segment is already clamped against this exact free-time computation at the moment it starts (startLoopSegment above), so an active segment is never itself running past this boundary -- this check only ever needs to fire while the menu is idle (phase "choosing_action"), which is where the effect below calls it. */
  async function handleContinuationHardStop() {
    if (!continuationLoop) return;
    const nowIso = new Date().toISOString();
    const ended = endTaskContinuationLoop(continuationLoop, "next_task_boundary", nowIso);
    await appendTaskContinuationLoopHistoryEntry(ended);
    await clearTaskContinuationLoop();
    const activeTaskId = continuationLoop.activeTaskId;
    setContinuationLoop(null);
    await navigateToNextOrTasksList(activeTaskId);
  }

  // Auto-exits an in-loop break the moment the rest timer ends
  // naturally, returning to the SAME continuation menu with no tap
  // required -- a manual tap on the rest block's own end button below
  // calls the exact same handleExitLoopBreak directly.
  useEffect(() => {
    if (!restRun || !continuationLoop || continuationLoop.phase !== "break") return;
    const statusNow = getTaskTimerStatus(restRun, Date.now());
    const ended = restRun.completedAt !== null || statusNow.complete === true;
    if (ended && loopBreakExitedForRunId.current !== restRun.runId) {
      loopBreakExitedForRunId.current = restRun.runId;
      void handleExitLoopBreak();
    }
  }, [restRun, continuationLoop, now]);

  // The hard stop itself -- checked only while the continuation menu is
  // idle (see handleContinuationHardStop's own doc for why that is
  // enough), via the exact same resolveLoopHardStopMinutes computation
  // every segment-start already clamps against.
  useEffect(() => {
    if (!continuationLoop || continuationLoop.phase !== "choosing_action") return;
    if (loopHardStopHandledRef.current) return;
    let cancelled = false;
    resolveContinuationFreeMinutes(continuationLoop).then((freeMinutes) => {
      if (cancelled || loopHardStopHandledRef.current) return;
      if (freeMinutes !== null && freeMinutes <= 0) {
        loopHardStopHandledRef.current = true;
        void handleContinuationHardStop();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [continuationLoop, now]);

  // ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry "Cubes"
  // task, section 4: mirrors the completion-sound effect directly above
  // -- recomputes "ended" itself from timerRun/restRun/now (never the
  // timerRunEnded/restRunEnded consts further down, which this effect
  // must run BEFORE in render order, ahead of the `if (!task) return`
  // below) so a work segment or break ending, whether by natural
  // countdown or an early finish (both already converge on the same
  // completedAt/status.complete signal), advances the SAME persisted
  // TaskSplitProgress to its next segment with NO manual tap, before
  // the existing (double-tap-hardened) end-of-timer JSX further down
  // ever gets a chance to render the ordinary end-of-timer prompt for
  // it. Only the LAST segment (always a work segment -- buildSplitPlan
  // never ends on a break) is deliberately left alone: advanceToNextSplitSegment
  // below no-ops once there is no next segment, so it falls through to
  // the real, completely unmodified handleComplete() path exactly like
  // an ordinary (non-split) task.
  useEffect(() => {
    if (!task || !task.isTodoItem || !splitProgress || splitProgress.taskId !== task.id) return;
    if (isTaskSplitProgressComplete(splitProgress)) return;
    const endedRun = restRun ?? timerRun;
    if (!endedRun) return;
    const statusNow = getTaskTimerStatus(endedRun, Date.now());
    const ended = endedRun.completedAt !== null || statusNow.complete === true;
    if (!ended || segmentAdvancedForRunId.current === endedRun.runId) return;
    segmentAdvancedForRunId.current = endedRun.runId;
    advanceToNextSplitSegment(endedRun);
  }, [task, splitProgress, timerRun, restRun, now]);

  /**
   * ARCHI -- Proactive Support During Task LIVE task, section 2: "אם
   * המשתמש יוצא מהאפליקציה כאשר מסך הטלפון דולק" -- active only while
   * timerRun && !restRun, the exact same visibility gate the live
   * moodButtonRow below already uses, so a planned break or an idle
   * screen never arms this (section 4's own "לא לשלוח בהפסקה מתוכננת" /
   * "אין משימה פעילה" requirements fall out of this gate for free, with
   * no extra check needed), and the listener tears down the instant
   * that condition stops holding. In-app navigation (e.g. opening ARC
   * from this same screen, section 4's "כבר בתרגיל ARC") never changes
   * AppState at all -- it's a React Navigation push within the same
   * foregrounded app -- so only a genuine OS-level backgrounding
   * (home button, app switcher, an incoming call, the phone being
   * locked) reaches this listener in the first place.
   *
   * The native screen-lock/off query (section 2's own explicit
   * carve-out -- "אם המשתמש מכבה או נועל את מסך הטלפון, אין לשלוח את
   * ההתראה") is checked here, before ever displaying anything.
   * taskIsOnPhone (section 3) is NOT checked here -- per the user's
   * own explicit clarification, that gate lives entirely inside
   * displayProactiveSupportNotification itself (data/proactiveSupportNotification.ts),
   * the ONE place that decides whether a notification is sent for
   * EITHER trigger, so it is never duplicated/drifted across call
   * sites. Neither check, nor this effect itself, ever reads or writes
   * TaskTimerRun -- backgrounding stays completely irrelevant to the
   * timer's own correctness, unchanged.
   */
  useEffect(() => {
    if (!timerRun || restRun || !task) return;
    const activeTaskId = task.id;
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "background" && nextState !== "inactive") return;
      isScreenLockedOrOffAsync().then((lockedOrOff) => {
        if (lockedOrOff) return;
        void displayProactiveSupportNotification(activeTaskId, new Date());
      });
    });
    return () => subscription.remove();
  }, [timerRun, restRun, task]);

  // Today screen's own "start"/"postpone" card actions (see this
  // component's own doc comment above) -- fires at most once per screen
  // instance, and never when a timer is already in flight for this task.
  useEffect(() => {
    if (autoActionConsumed.current) return;
    if (!task) return;
    // Floating ARC button task: the native overlay's own ARC button
    // deep-links here with needArc=1. Checked FIRST (before the
    // "a timer is already running" early-return right below, which
    // exists for autoStart -- here we WANT to act specifically because a
    // timer is running). handleNeedArc (defined further down, once
    // status/timerRunEnded are resolvable, the same hoisting precedent
    // handleStart already relies on from this exact effect) pauses the
    // work timer first, then opens this task's existing ARC chooser.
    // autoActionConsumed is set synchronously, before the async pause
    // even starts, so a second deep-link into this same screen instance
    // (e.g. a double tap) can never trigger it twice.
    if (needArc) {
      autoActionConsumed.current = true;
      handleNeedArc();
      return;
    }
    // Unified Task Stages task: the floating overlay's own ✓ button
    // deep-links here with completeStage=1 -- checked here for the
    // exact same reason needArc is checked above a running timer: this
    // action is only ever meaningful WHILE a timer is already running
    // for this task, so it must act before the generic "timer already
    // running" early-return right below would otherwise just mark it
    // consumed and do nothing.
    if (completeStage) {
      autoActionConsumed.current = true;
      handleCompleteStage();
      return;
    }
    // ARCHI -- Unified Floating Overlay & Mini ARC Improvements task,
    // section 4: the unified panel's own "עבור למשימה הבאה" button --
    // checked here for the exact same reason needArc/completeStage are
    // checked above a running timer: this is only ever meaningful
    // WHILE a task session already exists for this screen, so it must
    // act before the generic "timer already running" early-return right
    // below would otherwise just mark it consumed and do nothing.
    // Reuses handleNextTask() verbatim -- the SAME pause-then-advance
    // the in-screen "המשימה הבאה" button already calls, never a second
    // transition implementation.
    if (nextTask) {
      autoActionConsumed.current = true;
      handleNextTask();
      return;
    }
    // Section 7: the unified panel's own "💡 הוסף תובנה" button, while a
    // task session is active/paused -- opens the EXISTING insight
    // editor (build/InsightWriteScreen.tsx) with this task's own id as
    // its return context, never a second insight editor/database.
    // Never pauses/touches the timer itself: writing a quick insight is
    // comparatively instantaneous, and the timer's own anchor-timestamp
    // model (arc/taskTimer.ts) is already correct regardless of how
    // long the trainee spends on the insight screen.
    if (addInsight) {
      autoActionConsumed.current = true;
      router.push({ pathname: "/insights/new", params: { returnToTaskId: task.id } });
      return;
    }
    // ARC Questions task, section 2: the SAME convention as addInsight
    // right above -- the floating timer's own "+ שאלה" button, while a
    // task session is active/paused, opens the ARC Questions composer
    // with this task's own id as its return context. Never
    // pauses/touches the timer.
    if (addQuestion) {
      autoActionConsumed.current = true;
      router.push({ pathname: "/questions/new", params: { returnToTaskId: task.id } });
      return;
    }
    // Positive Memory, Success Recall & Quick Capture task, section 3A:
    // the SAME convention as addInsight right above -- the floating
    // cube's/Android widget's own "✨ הוסף אירוע חיובי" button, while a
    // task session is active/paused, opens the documentation entry
    // screen with this task's own id as its return context. Never
    // pauses/touches the timer: the entry screen only asks which event
    // type to document, exactly like the insight editor's own
    // instantaneous-write assumption above.
    if (addPositiveEvent) {
      autoActionConsumed.current = true;
      router.push({ pathname: "/positive-memories/new", params: { returnToTaskId: task.id } });
      return;
    }
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
      // Unified Emotional Check-In and Task Postponement System,
      // section 4: EVERY "דחייה" entry point (this one included --
      // Today's card action and ExternalInterruptionScreen's own
      // "reschedule"/"return later" both funnel through this SAME
      // openPostpone param) now opens the intervention screen FIRST,
      // never the old detailed reason/category/return-time form
      // directly -- that form (live/PostponementScreen.tsx) remains
      // fully intact and still reachable from inside this same flow.
      router.push({ pathname: "/tasks/[id]/postpone-obstacle", params: { id: taskId } });
    }
  }, [task, timerRun, restRun, autoStart, openPostpone, needArc, completeStage, nextTask, addInsight, addQuestion, addPositiveEvent, taskId]);

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
  /** Lock-Screen Timer task, requirement 1: the shape the native overlay/notification payload expects -- derived fresh every render from `nextScheduledTask` state, so every handler below (all plain functions recreated on every render) always threads the LATEST resolved next task through to showFloatingTimerOverlay/updateFloatingTimerOverlay. */
  const nextScheduledTaskForOverlay: NextScheduledTaskForOverlay | null = nextScheduledTask
    ? {
        title: nextScheduledTask.task.title,
        effectiveStartTime: nextScheduledTask.effectiveStartTime,
        durationMinutes: nextScheduledTask.task.expectedDurationMinutes,
        isOverdue: nextScheduledTask.isOverdue,
      }
    : null;

  async function persistTask(next: Task) {
    setTask(next);
    // Flexible Daily Routine task, integration fix: `next` was derived
    // from the EFFECTIVE (merged) task state, so its own scheduledTime/
    // expectedDurationMinutes/order may be today's override, not the
    // Fixed Weekly Routine template's own values. Writing it to the
    // shared Task record as-is would permanently overwrite the
    // template with today's one-off numbers the first time the trainee
    // starts/pauses/completes/toggles anything on an overridden
    // occurrence -- restored back to the raw template's own values
    // (everything else about `next`, e.g. status, is still persisted)
    // before the single shared Task record is ever written.
    const raw = rawTaskRef.current;
    const toPersist = raw && raw.id === next.id ? { ...next, scheduledTime: raw.scheduledTime, expectedDurationMinutes: raw.expectedDurationMinutes, order: raw.order } : next;
    rawTaskRef.current = toPersist;
    await upsertTask(toPersist);
  }

  /**
   * Floating task timer task, requirement 4: the work timer's own
   * end-of-timer signal is now the real ~10s notifee ring (data/
   * taskAlarm.ts's armTaskTimerEndAlarm) -- a mechanism SEPARATE from
   * the task-START alarm, but the SAME proven native mechanism, armed/
   * canceled through this exact function's own long-standing call sites
   * (handleStart/handleResume arm it; handlePause/handleFinishEarly/
   * clearEndedTimer cancel it) so every existing sync point keeps
   * working unchanged. This REPLACES the old one-shot expo-notifications
   * reminder that used to live here (requirement: "אין להפעיל כפולה" --
   * the two must never both fire for the same ending). Still never
   * throws/claims a ring will arrive: armTaskTimerEndAlarm's own
   * honest-failure contract (null on any native error) is unchanged.
   */
  async function scheduleTaskTimerNotification(run: TaskTimerRun, currentTask: Task): Promise<string | null> {
    const status = getTaskTimerStatus(run, Date.now());
    if (status.remainingSeconds <= 0) return null;
    return armTaskTimerEndAlarm(currentTask.id, currentTask.title, new Date(Date.now() + status.remainingSeconds * 1000));
  }

  /** The exact same pattern as scheduleTaskTimerNotification above, for the "I need rest" sub-timer -- its own notification title ("זמן המנוחה הסתיים") so the ring is never confused for the main task timer's own one, even though both reuse the exact same underlying native mechanism and the exact same TaskTimerRun.notificationId slot (never both armed at once). */
  async function scheduleRestTimerNotification(run: TaskTimerRun, currentTask: Task): Promise<string | null> {
    const status = getTaskTimerStatus(run, Date.now());
    if (status.remainingSeconds <= 0) return null;
    return armTaskTimerEndAlarm(currentTask.id, currentTask.title, new Date(Date.now() + status.remainingSeconds * 1000), "זמן המנוחה הסתיים");
  }

  /**
   * Daily Visualization task, requirement 5: the one gate every path
   * that actually begins a task funnels through -- the manual
   * "התחלה" button below AND the autoStart effect above (the alarm's
   * own "Start Task" action, and returning here with autoStart=1 after
   * completing/bypassing the visualization itself) both call
   * handleStart(), never a second, separate "start" entry point that
   * could bypass this check. Once today's exercise is done or
   * explicitly bypassed, every later handleStart() call this same day
   * proceeds straight to performStart() -- "do not repeatedly request
   * the visualization after it has already been completed that day."
   */
  async function handleStart() {
    if (!task) return;
    // ARCHI -- To-Do Bank + Duration/Split Selection task, section 3: a
    // To-Do task's duration is decided ONLY when started -- redirects to
    // the duration-selection screen, UNLESS this call is the return trip
    // from it (splitMinutes handed back, or a matching TaskSplitProgress
    // already persisted there) -- checking both avoids a redirect loop.
    // A non-To-Do task's own start path below is completely untouched.
    const hasPendingSplitPlan = splitProgress !== null && splitProgress.taskId === task.id && !isTaskSplitProgressComplete(splitProgress);
    if (task.isTodoItem && splitMinutes === null && !hasPendingSplitPlan) {
      router.push({ pathname: "/tasks/[id]/duration", params: { id: task.id } });
      return;
    }
    if (await isDailyVisualizationNeededNow()) {
      setShowVisualizationGate(true);
      return;
    }
    await performStart();
  }

  function handleOpenVisualizationFromGate() {
    if (!task) return;
    setShowVisualizationGate(false);
    router.push({ pathname: "/daily-visualization", params: { returnToTaskId: task.id } });
  }

  /** "Preserve a clearly labeled option to bypass the exercise when necessary, without deleting tasks or blocking access to essential app functions" -- records the bypass, then proceeds to actually start THIS task immediately, exactly as if the gate had never appeared. */
  async function handleBypassVisualizationFromGate() {
    if (visualizationGateBusy) return;
    setVisualizationGateBusy(true);
    try {
      await bypassDailyVisualizationForToday();
      setShowVisualizationGate(false);
      await performStart();
    } finally {
      setVisualizationGateBusy(false);
    }
  }

  async function performStart() {
    if (!task) return;
    await markOriginalTaskStartedIfPending(task.id, new Date().toISOString());
    // ARCHI -- Adaptive Task Execution & Emotional Persistence task,
    // section 2: starting a task through ANY path here (this normal
    // button, the alarm's own "Start Task" action, or autoStart=1)
    // must immediately retire the "task not started" notification/
    // alarm for it, same "update/remove itself the instant the user
    // starts another way" guarantee recomputeTaskNotStartedNotification
    // already encodes -- never a second, separate cancel call here.
    void recomputeTaskNotStartedNotification();
    // ARCHI -- Dynamic Time Planning & Free-Window Utilization task,
    // section 1/4: starting a task through ANY path here also closes
    // off whatever free window it was just started into -- recomputed
    // fresh, never left armed/displayed for a slot that's no longer
    // actually free.
    void recomputeFreeTimeWindowNotification();
    // Action-Based Tasks task, section 4: starting a task through ANY
    // path here re-arms the ARC-Memory reminder for whichever
    // today-scheduled task now has the soonest upcoming one -- same
    // "called from the exact same mutation sites" discipline as the two
    // recomputes above. For a To-Do task with no scheduledTime (so no
    // "5 minutes before" moment can ever be resolved for it), the
    // reminder is shown immediately instead, right when the task
    // itself starts.
    if (task.isTodoItem && !task.scheduledTime && task.linkedArcGymMemoryExerciseIds.length > 0) {
      void displayTaskMemoryReminderForTask(task.id);
    } else {
      void recomputeTaskMemoryReminderNotification();
    }
    // Resolves "was the task actually started" the moment a real start happens.
    void markSupportiveBodySensationUsagesTaskOutcome(
      resolveBodySensationContextKeys({ taskId: task.id, arcGymSituationId: null, arcGymMemoryExerciseId: null, arcPerspectiveId: null, arcFocusPracticeId: null }, task.linkedArcGymSituationId ?? null),
      true,
      new Date().toISOString()
    );
    // Productivity & Personal Development upgrade task, requirement 6: a
    // "manifest"-kind task has no work timer at all -- "starting" it
    // always opens its own guided run (visualize -> ARC -> identity
    // action) instead of creating a TaskTimerRun. Guarded here, not just
    // in the button label, so even an auto-start (Today's own "start"
    // card action, or returning with autoStart=1) can never create an
    // inappropriate timer for a Manifest task.
    if (task.taskKind === "manifest") {
      router.push({ pathname: "/tasks/[id]/manifest", params: { id: task.id } });
      return;
    }
    // ARC Focus task: an "arcFocus"-kind task has no work timer either --
    // "starting" it always opens the mood check-in first (never skipped
    // just because this is a schedule-triggered start, since the alarm's
    // own "Start Task" action already routes generically to
    // /tasks/[id]?autoStart=1, which calls this exact function). A fresh
    // "planned" ArcFocusSession (status idle) is persisted here, ONCE,
    // so the check-in -> optional preliminary ARC -> ArcFocusLiveScreen
    // chain all resumes the SAME practice context, never re-picking
    // settings or creating a second session.
    if (task.taskKind === "arcFocus") {
      const now = new Date().toISOString();
      const settings = await loadArcFocusSettings(task.id);
      const practiceId = generateArcFocusPracticeId();
      await saveArcFocusSession(createArcFocusSession(practiceId, task.id, settings, now));
      router.push({ pathname: "/tasks/[id]/arc-focus/check-in", params: { id: task.id, arcFocusPracticeId: practiceId } });
      return;
    }
    // ARC Learning + ARC Creativity + Integrated Spaced Repetition task:
    // same early-branch precedent as arcFocus above -- opens the shared
    // recall screen (build/ArcLearningRecallScreen.tsx /
    // build/ArcCreativityRecallScreen.tsx) with THIS task's real id, so
    // finishing the recall queue can land back on /tasks/[id] and let
    // the ordinary "השלמת משימה" button invoke the real, unmodified
    // handleComplete() below -- never a parallel completion mechanism.
    // Neither branch creates a TaskTimerRun: due items are resolved
    // fresh by the recall screen itself, never baked into this Task.
    if (task.taskKind === "arcLearningReview") {
      router.push({ pathname: "/tasks/[id]/arc-learning-review", params: { id: task.id, topicId: task.arcLearningReviewTopicId ?? undefined } });
      return;
    }
    if (task.taskKind === "arcCreativityReview") {
      router.push({ pathname: "/tasks/[id]/arc-creativity-review", params: { id: task.id } });
      return;
    }
    // ARC Gym + ARC Goal Integration task: the Behaviour+Success
    // COMBINED scheduled practice (build/ArcGymSituationScreen.tsx's
    // own "תזמן אימון" action) -- opens Full/Shortened ARC with THIS
    // real taskId (never the standalone sentinel, unlike every other
    // arcGymSituationId entry point), so live/NewArcLiveScreen.tsx's
    // own returnToTask() can find the paired Success (if any) and
    // practice it next, before finally returning to this exact task.
    if (task.calendarEntryKind === "arc_gym" && task.linkedArcGymSituationId) {
      router.push({ pathname: "/tasks/[id]/arc", params: { id: task.id, arcGymSituationId: task.linkedArcGymSituationId } });
      return;
    }
    // Fixed Weekly Routine / Flexible Daily Routine task, direct Break/ARC
    // calendar actions: a standalone ARC calendar entry never starts a
    // work timer at all -- it goes straight to the existing ARC flow,
    // preserving this real task's own id as ARC's task context, exactly
    // like the pre-existing breakAfter.kind === "arc" destination.
    if (task.calendarEntryKind === "arc") {
      router.push({ pathname: "/tasks/[id]/arc", params: { id: task.id } });
      return;
    }
    // A standalone break calendar entry starts its OWN rest timer
    // immediately -- the exact same createTaskTimerRun(..., "rest") +
    // scheduleRestTimerNotification + restRun slot every post-task "I
    // need a break" choice below already uses, never a second timer
    // implementation. Its own expectedDurationMinutes (set when the
    // break was added to the calendar) is the rest length.
    if (task.calendarEntryKind === "break") {
      const restMinutes = task.expectedDurationMinutes ?? 5;
      const rest = createTaskTimerRun(task.id, generateTaskTimerRunId(), restMinutes, new Date().toISOString(), "rest");
      const restNotificationId = await scheduleRestTimerNotification(rest, task);
      const restWithNotification = { ...rest, notificationId: restNotificationId };
      await saveTaskTimerRun(restWithNotification);
      setRestRun(restWithNotification);
      await updateFloatingTimerOverlay(restWithNotification, task, null, nextScheduledTaskForOverlay);
      return;
    }
    // Resuming a postponed task means its own "return reminder" (if one was scheduled, Stage AB) is no longer relevant -- cancel it before anything else, never leaving it to fire later for no reason.
    if (task.notificationId) await cancelScheduledNotification(task.notificationId);
    // Task-alarm task: starting a task through this NORMAL button (not the alarm's own "Start Task" action) must also silence an alarm that's currently ringing/pending for it -- cancelScheduledNotification above only knows about expo-notifications' own reminders (e.g. the postponed-return one), never notifee's.
    await cancelAnyAlarmFor(task.id);
    // Unified Task Stages task: a task with a configured stage
    // breakdown starts its FIRST stage's own timer (never the whole
    // task's total duration at once) -- the exact same single
    // TaskTimerRun slot every other task already uses, just seeded
    // with that one stage's own planned duration. A legacy task (no
    // configured stages) is completely unaffected: durationMinutes and
    // stageProgress below resolve exactly as they always have.
    const staged = hasConfiguredActionStages(task.actionStages);
    const firstStage = staged ? resolveFirstActionStage(task.actionStages!) : null;
    // Smart To-Do List task, section 6 (optional task splitting): a
    // split's own chosen duration overrides the task's full remaining
    // duration -- ONLY for a To-Do item, ONLY when splitMinutes was
    // actually passed (an ordinary scheduled task's own start is
    // completely unaffected, since neither condition holds for it).
    const isTodoSplit = task.isTodoItem && splitMinutes !== null;
    // ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry "Cubes"
    // task, section 3/4: "עבודה מחולקת" -- the duration-selection screen
    // already persisted a fresh TaskSplitProgress (activeSegmentIndex 0)
    // before returning here with autoStart=1 and no splitMinutes; this
    // starts ONLY that first segment's own duration -- every LATER
    // segment is started by the segment-advance effect above, never by
    // this function again.
    const pendingSplitSegment = task.isTodoItem && splitProgress && splitProgress.taskId === task.id ? currentSplitSegment(splitProgress) : null;
    const durationMinutes = firstStage
      ? firstStage.durationMinutes
      : pendingSplitSegment
      ? pendingSplitSegment.durationMinutes
      : isTodoSplit
      ? splitMinutes
      : task.expectedDurationMinutes ?? 25;
    const run = createTaskTimerRun(task.id, generateTaskTimerRunId(), durationMinutes, new Date().toISOString());
    const notificationId = await scheduleTaskTimerNotification(run, task);
    const runWithNotification = { ...run, notificationId };
    await saveTaskTimerRun(runWithNotification);
    setTimerRun(runWithNotification);
    // The single-slot TodoSplitSession record -- read back in
    // handleComplete below to know this chunk's own progress should be
    // recorded against the task rather than marking it fully done, and
    // cleared by the SAME clearTaskTimerRun() every completion/early-
    // finish/postponement call site already calls.
    if (isTodoSplit) await saveTodoSplitSession(createTodoSplitSession(task.id, splitMinutes));
    const freshStageProgress = firstStage ? createTaskStageProgress(task.id, firstStage.id) : null;
    if (freshStageProgress) await saveTaskStageProgress(freshStageProgress);
    setStageProgress(freshStageProgress);
    // Floating task timer task, requirements 1+6: appears the instant a
    // timer starts, whether that's a plain "התחלה" tap or the task-alarm's
    // own "Start Task" action auto-starting it.
    await showFloatingTimerOverlay(runWithNotification, task, freshStageProgress, nextScheduledTaskForOverlay);
    await persistTask({ ...startTask(task, new Date().toISOString()), notificationId: null, notificationScheduledFor: null });
    const now = new Date().toISOString();
    await appendTaskJournalEntry(
      createTaskJournalEntry({ id: generateTaskJournalEntryId(), taskId: task.id, kind: "attempt_started", occurredAt: now, createdAt: now, attemptId: run.runId })
    );
    // ARC Writing & ARC Book task: unlike every OTHER special taskKind
    // above, "arcWriting" never early-returns -- it falls all the way
    // through the normal path above, creating the REAL TaskTimerRun
    // exactly like a standard task. Only once that's done do we also
    // open the target text/chapter, via a plain router.push (never
    // replace) so the floating timer overlay keeps running underneath
    // and back-navigation returns here, where the secondary "פתח את
    // הכתיבה" button (below) can reopen it without restarting the task.
    if (task.taskKind === "arcWriting") {
      await openArcWritingTarget(task);
    }
    // Action-Based Tasks task, section 3/9: the ONE central, extensible
    // "task -> internal action" mechanism (arc/taskLinkedAction.ts) --
    // checked LAST, after every existing taskKind/calendarEntryKind
    // branch above, so a task that never sets linkedAction (every task
    // today) is completely unaffected. By this point the REAL work
    // timer has already been created above (same fall-through pattern
    // "arcWriting" already uses right above) -- requirement 3.1's "the
    // task's own timer starts" always holds, then we additionally
    // navigate to the linked internal action via router.push (never
    // replace), so Task LIVE stays on the nav stack underneath and the
    // floating overlay keeps running, exactly like every other
    // special-kind branch in this function.
    if (task.linkedAction && task.linkedAction.kind !== "none") {
      await openLinkedAction(task, task.linkedAction);
    }
  }

  async function openLinkedAction(targetTask: Task, linkedAction: TaskLinkedAction) {
    // arc_focus: the one kind whose existing taskKind==="arcFocus" path
    // also creates a fresh ArcFocusSession first (see that branch above)
    // -- mirrored here exactly, since a linked-action task never sets
    // taskKind to "arcFocus" itself.
    if (linkedAction.kind === "arc_focus") {
      const now = new Date().toISOString();
      const settings = await loadArcFocusSettings(targetTask.id);
      const practiceId = generateArcFocusPracticeId();
      await saveArcFocusSession(createArcFocusSession(practiceId, targetTask.id, settings, now));
      router.push({ pathname: "/tasks/[id]/arc-focus/check-in", params: { id: targetTask.id, arcFocusPracticeId: practiceId } } as never);
      return;
    }
    // arc_book: itemId is a specific ArcBookChapter id -- resolving its
    // owning book id needs a lookup, exactly like openArcWritingTarget's
    // own arcWritingChapterId branch above, so it can't live in the
    // pure resolveLinkedActionStaticRoute table.
    if (linkedAction.kind === "arc_book" && linkedAction.itemId) {
      const chapters = await loadArcBookChapters();
      const chapter = chapters.find((candidate) => candidate.id === linkedAction.itemId);
      if (chapter) {
        router.push({ pathname: "/arc-gym/book/[id]/chapter/[chapterId]", params: { id: chapter.bookId, chapterId: chapter.id } } as never);
        return;
      }
    }
    const route = resolveLinkedActionStaticRoute(linkedAction, targetTask.id);
    if (route) {
      router.push({ pathname: route.pathname, params: route.params } as never);
    }
  }

  async function openArcWritingTarget(targetTask: Task) {
    if (targetTask.arcWritingChapterId) {
      const chapters = await loadArcBookChapters();
      const chapter = chapters.find((candidate) => candidate.id === targetTask.arcWritingChapterId);
      if (chapter) {
        router.push({ pathname: "/arc-gym/book/[id]/chapter/[chapterId]", params: { id: chapter.bookId, chapterId: chapter.id } });
        return;
      }
    }
    if (targetTask.arcWritingTextId) {
      router.push({ pathname: "/arc-gym/writing/[id]", params: { id: targetTask.arcWritingTextId } });
    }
  }

  /**
   * ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry "Cubes"
   * task, section 4: called ONLY from the segment-advance effect above,
   * the instant a split segment ends. Advances the persisted
   * TaskSplitProgress and, when there IS a next segment, silently
   * starts its own fresh TaskTimerRun (work -> kind "task", break ->
   * kind "rest") in the SAME single storage slot every other run
   * already uses -- `endedRun` is left exactly as it is (nothing here
   * clears/re-clears it; the new run simply supersedes it in storage
   * and in whichever of timerRun/restRun state now holds it), so this
   * never disturbs taskCompletingRef's own guard ordering. A break
   * segment also plays the new break-start sound, gated by the mute
   * setting, exactly once per segment (the per-runId ref guard in the
   * calling effect already ensures this function itself only ever runs
   * once per ended run). When there is NO next segment (the split's own
   * last, always-work segment just ended), this is a deliberate no-op
   * -- the real, completely unmodified handleComplete() path below
   * takes over via the ordinary end-of-timer UI, exactly as it already
   * does for a non-split task.
   */
  async function advanceToNextSplitSegment(endedRun: TaskTimerRun) {
    if (!task || !splitProgress) return;
    await cancelTaskTimerEndAlarm(endedRun.notificationId);
    const advanced = advanceTaskSplitProgress(splitProgress);
    const nextSegment = currentSplitSegment(advanced);
    if (!nextSegment) return;
    await saveTaskSplitProgress(advanced);
    setSplitProgress(advanced);
    const kind = nextSegment.kind === "break" ? "rest" : "task";
    const nextRun = createTaskTimerRun(task.id, generateTaskTimerRunId(), nextSegment.durationMinutes, new Date().toISOString(), kind);
    const notificationId = kind === "rest" ? await scheduleRestTimerNotification(nextRun, task) : await scheduleTaskTimerNotification(nextRun, task);
    const nextRunWithNotification = { ...nextRun, notificationId };
    await saveTaskTimerRun(nextRunWithNotification);
    if (kind === "rest") {
      setRestRun(nextRunWithNotification);
      setTimerRun(null);
      await playBreakStartSound(await loadBreakSoundEnabled());
    } else {
      setTimerRun(nextRunWithNotification);
      setRestRun(null);
    }
    await updateFloatingTimerOverlay(nextRunWithNotification, task, stageProgress, nextScheduledTaskForOverlay);
  }

  async function handlePause() {
    if (!timerRun || !task) return;
    await cancelTaskTimerEndAlarm(timerRun.notificationId);
    const paused = { ...pauseTaskTimerRun(timerRun, new Date().toISOString()), notificationId: null };
    await saveTaskTimerRun(paused);
    setTimerRun(paused);
    // Floating task timer task, requirement 5: pausing for ARC/rest shows
    // the pause icon on the overlay and keeps it visible (never hidden) --
    // the exact same TaskTimerRun single source of truth every other
    // reader of this run already uses.
    await updateFloatingTimerOverlay(paused, task, stageProgress, nextScheduledTaskForOverlay);
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

  /**
   * ARCHI -- Proactive Support During Task LIVE task, section 1: "כאשר
   * המשתמש לוחץ על כפתור השהיית הטיימר" -- the EXPLICIT "השהיה" button
   * only, never handlePause() itself (which is also called internally
   * by the 😟/🙂 mood buttons below and by the continuation-loop's own
   * pause-before-transition calls -- none of those are the trainee
   * pressing "pause," so none of them should also pop this notification).
   * Never gated by screen state here (the exit listener's own concern,
   * not an explicit pause's). taskIsOnPhone IS still checked -- but
   * centrally, inside displayProactiveSupportNotification itself, per
   * the user's own explicit clarification that it must suppress the
   * notification for every trigger, this one included.
   */
  async function handlePauseButtonPress() {
    await handlePause();
    if (task) await displayProactiveSupportNotification(task.id, new Date());
  }

  async function handleResume() {
    if (!timerRun || !task) return;
    const resumed = resumeTaskTimerRun(timerRun, new Date().toISOString());
    const notificationId = await scheduleTaskTimerNotification(resumed, task);
    const resumedWithNotification = { ...resumed, notificationId };
    await saveTaskTimerRun(resumedWithNotification);
    setTimerRun(resumedWithNotification);
    await updateFloatingTimerOverlay(resumedWithNotification, task, stageProgress, nextScheduledTaskForOverlay);
    await persistTask(startTask(task, new Date().toISOString()));
  }

  async function handleFinishEarly() {
    if (!timerRun || !task) return;
    await cancelTaskTimerEndAlarm(timerRun.notificationId);
    const finished = { ...finishTaskTimerRunEarly(timerRun, new Date().toISOString()), notificationId: null };
    await saveTaskTimerRun(finished);
    setTimerRun(finished);
    // Requirement 1: an early finish is also an "end" state -- the
    // overlay shows 00:00 immediately, same as naturally reaching zero.
    await updateFloatingTimerOverlay(finished, task, stageProgress, nextScheduledTaskForOverlay);
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

  /**
   * Unified Task Stages task, requirement 4: the ✓ "Complete Action"
   * button's own handler -- reachable identically from the full Task
   * LIVE screen's own button and, via the `completeStage` prop/auto-
   * action effect above, from the floating overlay's own ✓ button
   * (archi://tasks/<id>?completeStage=1), so there is only ever ONE
   * completion path, never two.
   *
   * Idempotent: `completingStage` blocks a second call from firing
   * before this one's own state updates land (closes the rapid-double-
   * tap window); markStageCompleted itself is ALSO idempotent once
   * state has caught up, so even a late-arriving duplicate call can
   * never complete more than one stage.
   *
   * "The user may complete a stage before its planned duration
   * expires" -- this never checks the timer's own remaining time at
   * all, unlike the end-of-timer prompt. Completing the trigger or
   * small action only ever advances to the NEXT stage's own fresh
   * timer (same single TaskTimerRun slot, never a second/competing
   * one) -- only completing the FINAL (main) stage enters the exact
   * same handleComplete() the "השלמת משימה" button already uses, so
   * every existing reflection/smile-reinforcement rule applies exactly
   * as it already does for every other task, never a second/competing
   * reward system.
   */
  async function handleCompleteStage() {
    if (!task || !timerRun || !stageProgress || completingStage) return;
    const stages = task.actionStages;
    if (!stages) return;
    if (isStageCompleted(stageProgress, stageProgress.activeStageId)) return;
    setCompletingStage(true);
    try {
      await cancelTaskTimerEndAlarm(timerRun.notificationId);
      const completedProgress = markStageCompleted(stageProgress, stageProgress.activeStageId);
      const nextStage = resolveNextActionStage(stages, stageProgress.activeStageId);

      if (!nextStage) {
        await saveTaskStageProgress(completedProgress);
        setStageProgress(completedProgress);
        await handleComplete();
        return;
      }

      const advancedProgress = advanceStageProgress(completedProgress, nextStage.id);
      await saveTaskStageProgress(advancedProgress);
      setStageProgress(advancedProgress);
      const nextRun = createTaskTimerRun(task.id, generateTaskTimerRunId(), nextStage.durationMinutes, new Date().toISOString());
      const notificationId = await scheduleTaskTimerNotification(nextRun, task);
      const nextRunWithNotification = { ...nextRun, notificationId };
      await saveTaskTimerRun(nextRunWithNotification);
      setTimerRun(nextRunWithNotification);
      await updateFloatingTimerOverlay(nextRunWithNotification, task, advancedProgress, nextScheduledTaskForOverlay);
    } finally {
      setCompletingStage(false);
    }
  }

  async function handleComplete() {
    // Task Completion Navigation fix: guards against a rapid double-tap
    // on "השלמת משימה" (never previously guarded, unlike
    // handleCompleteStage's own completingStage) -- the REF is checked
    // and set first and is what actually makes a second, near-
    // simultaneous call return immediately (a useState setter's value
    // is only visible starting the next render, so checking the STATE
    // here would let two taps that both fire before that render land
    // right through). The occurrence is never marked completed twice
    // and reflection is never opened more than once for the same
    // completion. `setTaskCompleting(true)` right after is purely for
    // rendering: the very next render hides the end-of-timer prompt
    // block and the complete/next/skip row below it (both read the
    // `taskCompleting` STATE directly), WITHOUT waiting for the async
    // work below or the navigation itself to land.
    if (!task || taskCompletingRef.current) return;
    taskCompletingRef.current = true;
    setTaskCompleting(true);
    // ARC Reminders task: true only when the completion-sound effect
    // above has ALREADY played the completion cue for this exact timer
    // run (the natural-timer-reaching-0 case, which now auto-triggers
    // this very function -- see the timerEnded effect below) -- read
    // from the closure-captured `timerRun` BEFORE clearEndedTimer()
    // clears it, so a manual "השלמת משימה" tap while the timer is still
    // running (that effect never having fired) still gets its own
    // completion sound, while the auto-triggered natural-end path never
    // plays a SECOND one for the same run.
    const soundAlreadyPlayedForThisRun = timerRun !== null && soundPlayedForRunId.current === timerRun.runId;
    // Smart To-Do List task, section 6 (optional task splitting): read
    // BEFORE clearEndedTimer() below, since its own clearTaskTimerRun()
    // (data/storage.ts) clears this exact single slot alongside the
    // timer run -- reading it after would always see "none."
    const todoSplitSession = await loadTodoSplitSession();
    if (task.notificationId) await cancelScheduledNotification(task.notificationId);
    // Alarm-automation task, requirement 4 ("השלמת משימה לפני זמנה --
    // ביטול השעון"): cancelScheduledNotification above only knows about
    // expo-notifications' own reminders -- the real native alarm needs
    // its own cancellation, same as handleStart's own fix, or it stays
    // armed and fires later for a task that's already done.
    await cancelAnyAlarmFor(task.id);
    // Task Completion Navigation fix: stops and finalizes whichever
    // timer run (work or rest) was actually active -- the SAME
    // cancel-alarm/clear-run/clear-overlay sequence the rest timer's
    // own "סיום המנוחה" button already uses (clearEndedTimer), reused
    // here rather than duplicated. Without this, timerRun stayed
    // persisted with completedAt set, so `timerEnded` (and the stale
    // ARC/rest/"המשימה הבאה" end-prompt block it gates) remained true
    // forever -- the actual root cause of the overlapping controls bug.
    await clearEndedTimer();
    const now = new Date().toISOString();
    // Smart To-Do List task, section 6: a split-started To-Do item's
    // own completion records progress against its REAL elapsed time
    // (status, read from this same render's closure -- clearEndedTimer
    // above only clears the PERSISTED run/state, never this local
    // const) instead of marking the whole task done outright. Never a
    // duplicate task, never resetting what's already been done.
    // recordTodoSplitProgress itself decides whether this chunk still
    // leaves the task incomplete -- persisted here, with NO reflection/
    // reward for a partial split, this function returning immediately
    // and the task staying in the To-Do list exactly as section 6
    // requires -- or whether it finally finishes the task, in which
    // case completedTask below is already that finished task and
    // everything after falls through to the EXACT same completion flow
    // (journal entry, identity-insight check, continuous-routine check,
    // reflect navigation) every other task already uses, unchanged.
    let completedTask: Task;
    if (todoSplitSession && todoSplitSession.taskId === task.id) {
      const elapsedMinutes = status ? status.elapsedSeconds / 60 : 0;
      const progressed = recordTodoSplitProgress(task, elapsedMinutes, now);
      if (progressed.status !== "completed") {
        await persistTask(progressed);
        router.replace("/tasks");
        return;
      }
      completedTask = { ...progressed, notificationId: null, notificationScheduledFor: null };
    } else if (task.recurrence.kind === "recurring") {
      // Flexible Daily Routine task, integration fix (requirement 5):
      // a RECURRING task's completion must record only TODAY's own
      // occurrence (the separate, append-only TaskOccurrenceCompletion
      // collection build/TodayScreen.tsx's own handleComplete already
      // uses for exactly this reason) and return the shared Task
      // record to "planned" -- never "completed". Before this fix,
      // completing a recurring task through this full Task LIVE
      // screen (reached, e.g., via the Flexible Daily Routine's own
      // "Start" action) set Task.status to "completed"
      // unconditionally, which resolveNextTaskStartOccurrence/
      // reconcileTaskAlarms both treat as terminal -- permanently
      // disarming every FUTURE occurrence's own alarm, not just
      // today's. A one-time task's own single completion is
      // unaffected, exactly as before.
      await appendTaskOccurrenceCompletion(createTaskOccurrenceCompletion(task.id, new Date(now)));
      completedTask = { ...task, status: "planned", postponementReason: null, returnAt: null, notificationId: null, notificationScheduledFor: null, updatedAt: now };
    } else {
      completedTask = { ...completeTask(task, now), notificationId: null, notificationScheduledFor: null };
    }
    await persistTask(completedTask);
    // Re-syncs the alarm for the recurring task's own NEXT occurrence
    // immediately, rather than waiting for Today's next lazy reconcile
    // -- the same "re-sync right after a relevant state change"
    // discipline build/TaskEditorScreen.tsx's own handleSave/
    // handleOverrideSave already follow. Reads the RAW (template)
    // values persistTask just restored via rawTaskRef, never today's
    // now-stale overridden scheduledTime still sitting in the local
    // `completedTask`/`task` variables.
    if (task.recurrence.kind === "recurring" && rawTaskRef.current) {
      const reconciled = await scheduleTaskAlarm(rawTaskRef.current, new Date());
      await persistTask(reconciled);
    }
    await appendTaskJournalEntry(createTaskJournalEntry({ id: generateTaskJournalEntryId(), taskId: task.id, kind: "task_completed", occurredAt: now, createdAt: now }));
    // ARC-system upgrade task, Part I: only a task whose identity action
    // was actually set up through the ARC LIVE flow (Task/Combined
    // track) was marked pending -- an ordinary task completion never
    // shows this prompt. The question appears only AFTER the action is
    // actually done, never before (spec: "אם ARC ספונטני מקושר למשימה
    // שעדיין מתבצעת, שאלת אמונת הזהות תופיע רק לאחר שהמשימה הושלמה
    // בפועל").
    const pendingTaskId = await loadPendingIdentityInsightTaskId();
    if (pendingTaskId === task.id) {
      // ARC Reminders task, decision 6: recordTaskCompletion fires here
      // too (via the SAME recordSilentTaskCompletionReward wrapper the
      // continuous-routine branch below already uses, idempotent by
      // (taskId, dateLocal) regardless of which call site reaches it
      // first) -- so smile/streak credit is never lost just because
      // this prompt interrupts before the normal "done" state renders.
      // Mirrors handleComplete's own soundAlreadyPlayedForThisRun guard.
      await recordSilentTaskCompletionReward(task.id, new Date());
      if (!soundAlreadyPlayedForThisRun) {
        const settings = await loadArcTaskReminderSettings();
        if (settings.completionSoundEnabled) await playTimerCompletionSound();
      }
      setShowIdentityInsightPrompt(true);
      return;
    }
    // Continuous vs. Spaced Routines task, extended by the Unified ARC
    // & Productivity Update task's own requirement 9: a continuous-
    // mode task (period-wide OR an ad-hoc selected group, see
    // data/dailyRoutine.ts's own resolveContinuousRoutineOutcome)
    // skips the per-task reflection/smile-exercise interruption
    // entirely -- its own reward is recorded silently here, and
    // navigation goes straight to the next task in the routine, or
    // (the last task) to the ONE summary reflection instead of the
    // normal per-task one. Every other task (not in any continuous
    // routine) falls through to the exact pre-existing behavior below,
    // unchanged. Requirement 9: "accumulate eligible smiles (not
    // points) silently... one combined smile-reward experience at the
    // end" -- each task's own just-earned streakRewardSmiles is added
    // to the routine's own running total (pendingSmilesGroupKey);
    // reaching the LAST task reads back that total (plus this task's
    // own share) and passes it through to the summary screen, never
    // shown or consumed anywhere in between.
    const continuousOutcome = await resolveContinuousRoutineOutcome(task, new Date());
    if (continuousOutcome.isContinuous) {
      const rewardResult = await recordSilentTaskCompletionReward(task.id, new Date());
      if (continuousOutcome.nextTaskInPeriod) {
        if (continuousOutcome.pendingSmilesGroupKey) {
          await addPendingContinuousRoutineSmiles(continuousOutcome.pendingSmilesGroupKey, rewardResult.streakRewardSmiles);
        }
        router.replace({ pathname: "/tasks/[id]", params: { id: continuousOutcome.nextTaskInPeriod.id } });
      } else {
        const priorPendingSmiles = continuousOutcome.pendingSmilesGroupKey ? await takePendingContinuousRoutineSmiles(continuousOutcome.pendingSmilesGroupKey) : 0;
        const combinedSmiles = priorPendingSmiles + rewardResult.streakRewardSmiles;
        router.replace({ pathname: "/tasks/[id]/reflect", params: { id: task.id, continuousRoutineSummary: "1", combinedSmiles: String(combinedSmiles) } });
      }
      return;
    }
    // ARC Reminders task, requirement 8 ("automatic advance as the new
    // default with ZERO mandatory screens"): the forced
    // reflect -> post-task-reward navigation (Alarm-timer integration
    // task, requirement 6's own prior behavior) is retired for this,
    // the ordinary completion path -- recordTaskCompletion (moved here
    // per decision 6, via the same idempotent recordSilentTaskCompletionReward
    // wrapper, so a LATER optional visit to post-task-reward can never
    // double-count) and the completion sound both fire unconditionally,
    // then this screen simply stays put: taskCompleting is already
    // true, so the render below already shows "המשימה הושלמה" + "😄
    // מעולה · המשימה הבאה" in place, with NO forced screen. The optional
    // reflect/smile/ARC exercise is reachable ONLY via the new
    // persistent transition notification's own actions, recomputed here
    // (recomputeTaskTransitionNotification resolves the fresh current/
    // next pair itself -- the exact same pipeline every other sync-fixed
    // consumer already reads through -- so this never re-derives
    // "what's next" a second, competing way).
    await recordSilentTaskCompletionReward(task.id, new Date());
    if (!soundAlreadyPlayedForThisRun) {
      const settings = await loadArcTaskReminderSettings();
      if (settings.completionSoundEnabled) await playTimerCompletionSound();
    }
    await recomputeTaskTransitionNotification(task.id);
    await recomputeTaskNotStartedNotification();
    await recomputeTaskMemoryReminderNotification();
    await recomputeFreeTimeWindowNotification();
  }

  /**
   * Part I/E: finalizes the identity-insight prompt -- "skip" (never
   * forced) and "continue" both clear the pending marker and advance;
   * only "continue" with real text persists an ArcInsight, and only
   * when a belief was ALSO typed does it additionally persist a
   * "learned" ArcBelief (never invented, never required).
   */
  async function finishIdentityInsight(skip: boolean) {
    if (!task || identityInsightFinishingRef.current) return;
    identityInsightFinishingRef.current = true;
    await clearPendingIdentityInsightTaskId();
    if (!skip && identityInsightDraft.trim()) {
      const now = new Date().toISOString();
      const insightId = generateArcInsightId();
      await appendArcInsight(
        createArcInsight({ id: insightId, sourceExerciseId: task.id, taskId: task.id, beliefKind: "identity", text: identityInsightDraft, occurredAt: now, createdAt: now })
      );
      if (identityBeliefDraft.trim()) {
        await upsertArcBelief(createLearnedBelief(generateArcBeliefId(), "identity", identityBeliefDraft, insightId, task.id, now));
      }
    }
    setShowIdentityInsightPrompt(false);
    setIdentityInsightDraft("");
    setIdentityBeliefDraft("");
    // See handleComplete's own matching comment above -- same ARC
    // Reminders requirement-8 reasoning: no forced navigation.
    // taskCompleting is already true (set at the top of handleComplete
    // and never reset since), so clearing showIdentityInsightPrompt
    // alone is enough for this screen's own render to now show the
    // "המשימה הושלמה" state in place.
    await recomputeTaskTransitionNotification(task.id);
    await recomputeTaskNotStartedNotification();
    await recomputeTaskMemoryReminderNotification();
    await recomputeFreeTimeWindowNotification();
  }

  /**
   * ARC-system upgrade task, Part J: shared "move to whatever's next, or
   * back to the tasks list if nothing is left today" navigation, used by
   * both "Next Task" and "Skip Task" below.
   *
   * Task LIVE / To-Do List / Flexible Day sync fix: never a second,
   * competing calculation of "what's next" -- always
   * resolveMostUrgentScheduledTask (data/dailyPlan.ts), built from the
   * ONE real, resolved flexible-day plan every other sync-fixed screen
   * already reads, replacing the old arc/todaySchedule.ts
   * resolveNextTaskEntry call, which independently recomputed "today"
   * straight from raw Task fields and could surface a To-Do item never
   * placed into the flexible day, or disagree with the flexible day's
   * own chained/auto-scheduled times. "No next task" returns to the
   * tasks list with an explicit flag so it can show the "nothing left
   * today" message, instead of navigating nowhere.
   */
  async function navigateToNextOrTasksList(excludeTaskId: string) {
    const next = await resolveMostUrgentScheduledTask(excludeTaskId, new Date(), timerRun);
    if (!next) {
      router.push({ pathname: "/tasks", params: { noMoreTasks: "1" } });
      return;
    }
    router.push({ pathname: "/tasks/[id]", params: { id: next.task.id } });
  }

  /**
   * ARC-system upgrade task, Part J, action 1 ("המשימה הבאה"): a plain
   * PEEK forward -- opens the next task directly in Task LIVE without
   * marking the current one complete or skipped. If a work timer is
   * still actively running (not already paused, not already ended),
   * it's paused first -- the exact same handlePause() the explicit
   * "השהיה"/"צריך ARC" actions use, never a duplicated pause path and
   * never a reset -- so its remaining time is preserved and it stays
   * available to resume later; the next task's own timer is never
   * auto-started by this navigation.
   */
  async function handleNextTask() {
    if (!task) return;
    if (timerRun && !restRun && status && !status.paused && !timerRunEnded) await handlePause();
    await navigateToNextOrTasksList(task.id);
  }

  /**
   * Floating ARC button task: reached only via the native floating
   * overlay's own ARC button (its deep link sets needArc=1, consumed by
   * the auto-action effect above). Pauses the work timer first -- the
   * exact same handlePause() condition handleNextTask uses just above,
   * never a duplicated pause path and never a reset -- then opens this
   * task's own EXISTING ARC chooser (live/ArcWindowScreen.tsx: spontaneous
   * ARC, or a saved Full/Mini draft already linked to this task), never a
   * second, new chooser and never hardcoding Full or Mini itself.
   */
  async function handleNeedArc() {
    if (!task) return;
    if (timerRun && !restRun && status && !status.paused && !timerRunEnded) await handlePause();
    router.push({ pathname: "/tasks/[id]/arc-window", params: { id: task.id } });
  }

  /**
   * ARC-system upgrade task, Part J, action 3 ("דלג על משימה"): records
   * that the task was explicitly skipped as a plain, append-only journal
   * entry (data/taskJournal.ts) -- never a new Task.status value, so
   * every existing status-based bucket/sort/label elsewhere stays
   * exactly as it is. Never marks the task complete, never touches its
   * timer run, and -- the whole point of keeping this separate from
   * handleComplete -- never triggers an identity-insight/belief prompt,
   * since no identity action was actually performed.
   */
  async function handleSkipTask() {
    if (!task) return;
    const now = new Date().toISOString();
    await appendTaskJournalEntry(createTaskJournalEntry({ id: generateTaskJournalEntryId(), taskId: task.id, kind: "task_skipped", occurredAt: now, createdAt: now }));
    // Alarm-automation task, requirement 4 ("דילוג על משימה -- ביטול
    // השעון לאותו מועד"): cancels the native alarm for THIS occurrence
    // and clears its own bookkeeping -- status/timer/identity-prompt
    // behavior above is still completely untouched, matching this
    // function's own long-standing "skip is never completion" contract;
    // a recurring task's NEXT occurrence is still armed normally by the
    // next reconcileTaskAlarms pass, exactly like any other task.
    if (task.notificationId) {
      await cancelAnyAlarmFor(task.id);
      await persistTask({ ...task, notificationId: null, notificationScheduledFor: null });
    }
    // Floating task timer task: skipping leaves this task with no active
    // timer either -- same "no active task" state as handleComplete
    // above, so the unified panel switches to IDLE (see
    // showIdleFloatingOverlayPanel's own doc) instead of disappearing.
    await showIdleFloatingOverlayPanel(nextScheduledTaskForOverlay);
    await navigateToNextOrTasksList(task.id);
  }

  function confirmAsync(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      Alert.alert("אישור", message, [
        { text: "ביטול", style: "cancel", onPress: () => resolve(false) },
        { text: "אישור", onPress: () => resolve(true) },
      ]);
    });
  }

  /**
   * Task Shortening/Rescheduling UI, option A ("Shorten the current
   * task"): reduces the ACTIVE run's own total duration by `minutesToRemove`
   * via shortenTaskTimerRun -- elapsed time is never reset, never a new
   * TaskTimerRun. The timer-end alarm (if one was armed) is re-armed
   * for the NEW remaining time, the exact same cancel+rearm discipline
   * handleResume already uses for any change to a run's own timing.
   * Requirement: "require explicit user decision if the new end time
   * has already passed" -- confirmed via confirmAsync before applying,
   * never silently auto-completed.
   */
  async function handleShortenCurrentTask(minutesToRemove: number) {
    if (!timerRun || !task || !status || restRun) return;
    const newDuration = Math.max(0, timerRun.durationMinutes - minutesToRemove);
    if (status.elapsedSeconds >= newDuration * 60) {
      const confirmed = await confirmAsync("קיצור המשימה לפי הבחירה הזו יסיים את הזמן שהוקצה לה כבר עכשיו, כי הזמן שחלף עובר על משך הזמן החדש. להמשיך?");
      if (!confirmed) return;
    }
    await cancelTaskTimerEndAlarm(timerRun.notificationId);
    const shortened = shortenTaskTimerRun(timerRun, newDuration);
    const notificationId = await scheduleTaskTimerNotification(shortened, task);
    const shortenedWithNotification = { ...shortened, notificationId };
    await saveTaskTimerRun(shortenedWithNotification);
    setTimerRun(shortenedWithNotification);
    await updateFloatingTimerOverlay(shortenedWithNotification, task, stageProgress, nextScheduledTaskForOverlay);
    setDismissedAdjustSectionForTaskId(null);
  }

  /**
   * Task Shortening/Rescheduling UI, option B ("Reschedule the next
   * task"): updates ONLY today's effective schedule -- a recurring
   * task gets a TaskOccurrenceOverride for today's date (the permanent
   * weekly template, read fresh via `target` below, is never touched);
   * a one-time task's own scheduledTime is updated directly (it has no
   * separate template to protect). Either way, scheduleTaskAlarm
   * cancels the obsolete alarm and arms a new one for the new time
   * through its own single deterministic native id -- never a
   * duplicate.
   */
  async function handleRescheduleNextTask(addMinutesFromNow: number) {
    if (!nextScheduledTask) return;
    const target = nextScheduledTask.task;
    const nowDate = new Date();
    const newTime = formatMinutesToClockTime((((nowDate.getHours() * 60 + nowDate.getMinutes() + addMinutesFromNow) % 1440) + 1440) % 1440);
    const todayLocal = todayLocalDateString(nowDate);
    let taskForAlarm = target;
    if (target.recurrence.kind === "recurring") {
      const overrides = await loadTaskOccurrenceOverrides();
      const existing = findTaskOccurrenceOverride(target.id, todayLocal, overrides);
      const override = buildTaskOccurrenceOverride(target, todayLocal, existing, { scheduledTime: newTime }, nowDate.toISOString());
      await saveTaskOccurrenceOverrides(upsertTaskOccurrenceOverride(overrides, override));
    } else {
      taskForAlarm = { ...target, scheduledTime: newTime };
      await upsertTask(taskForAlarm);
    }
    const rescheduled = await scheduleTaskAlarm(taskForAlarm, nowDate);
    await upsertTask(rescheduled);
    setDismissedAdjustSectionForTaskId(null);
    await refreshNextScheduledTask();
  }

  /**
   * Task Shortening/Rescheduling UI, option C ("Adjust the next task's
   * planned duration"): the exact same today-only override mechanism
   * as option B, patching expectedDurationMinutes instead of
   * scheduledTime -- never touches the alarm (a duration change alone
   * never changes WHEN the next task's own alarm should fire).
   */
  async function handleAdjustNextTaskDuration(newDurationMinutes: number) {
    if (!nextScheduledTask) return;
    const target = nextScheduledTask.task;
    const nowDate = new Date();
    const todayLocal = todayLocalDateString(nowDate);
    if (target.recurrence.kind === "recurring") {
      const overrides = await loadTaskOccurrenceOverrides();
      const existing = findTaskOccurrenceOverride(target.id, todayLocal, overrides);
      const override = buildTaskOccurrenceOverride(target, todayLocal, existing, { expectedDurationMinutes: newDurationMinutes }, nowDate.toISOString());
      await saveTaskOccurrenceOverrides(upsertTaskOccurrenceOverride(overrides, override));
    } else {
      await upsertTask({ ...target, expectedDurationMinutes: newDurationMinutes });
    }
    setDismissedAdjustSectionForTaskId(null);
    await refreshNextScheduledTask();
  }

  /** Task Shortening/Rescheduling UI, option D ("Continue the current task unchanged"): a pure dismissal -- touches no data, no alarm, no timer. Never forces a postponement/shortening/completion. */
  function handleDismissAdjustSection() {
    if (nextScheduledTask) setDismissedAdjustSectionForTaskId(nextScheduledTask.task.id);
  }

  async function clearEndedTimer() {
    const endedRun = restRun ?? timerRun;
    if (endedRun) await cancelTaskTimerEndAlarm(endedRun.notificationId);
    await clearTaskTimerRun();
    setTimerRun(null);
    setRestRun(null);
    // clearTaskTimerRun() above already clears the persisted TaskStageProgress alongside the run (data/storage.ts's own doc) -- this just keeps local state in sync with it.
    setStageProgress(null);
    // ARCHI -- Unified Floating Overlay & Mini ARC Improvements task,
    // sections 2+4: no current task session remains the instant this
    // runs -- the unified panel switches to its IDLE state (3 mood
    // buttons, the freshly-resolved next scheduled task) rather than
    // disappearing outright, "the interface must update automatically
    // without requiring the user to restart the app."
    await showIdleFloatingOverlayPanel(nextScheduledTaskForOverlay);
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

  // Lock-Screen Timer, Next-Task Schedule and Smart Alarm Conflict
  // Management task, requirements 2+4: `nextStartMinutes`/`nowMinutes`
  // are the one clock-minute comparison both the "overdue" indicator
  // and the shorten/reschedule section's own visibility are derived
  // from -- never two separate re-derivations of "is the next task's
  // time here yet."
  const nextStartMinutes = nextScheduledTask?.effectiveStartTime ? parseClockTimeToMinutes(nextScheduledTask.effectiveStartTime) : null;
  const nowDateForSchedule = new Date(now);
  const nowMinutes = nowDateForSchedule.getHours() * 60 + nowDateForSchedule.getMinutes();
  const nextTaskIsOverdue = nextStartMinutes !== null && nowMinutes > nextStartMinutes;
  // requirement 4: "when the active task approaches/exceeds the next
  // task's start" -- the active (non-rest, not-yet-ended) task's own
  // CURRENT remaining time projects its expected end; the section also
  // shows once the next task's own time has simply already arrived,
  // even if the active task would still finish before it supposedly
  // "expected" to (a manual fixed time can be earlier than the running
  // cursor would suggest).
  const activeExpectedEndMinutes = status && !restRun && !status.paused ? nowMinutes + Math.ceil(status.remainingSeconds / 60) : null;
  const showAdjustSection =
    !restRun &&
    timerRun !== null &&
    !timerRunEnded &&
    nextScheduledTask !== null &&
    nextStartMinutes !== null &&
    dismissedAdjustSectionForTaskId !== nextScheduledTask.task.id &&
    (nowMinutes >= nextStartMinutes || (activeExpectedEndMinutes !== null && activeExpectedEndMinutes >= nextStartMinutes));

  // Productivity upgrade task, requirement 5: "if the next task's time
  // hasn't arrived yet, the remaining time until it starts may be
  // shown" -- the exact same clock reading arc/todaySchedule.ts's own
  // overdue/laterToday bucketing already uses, never a second
  // re-derivation of "is this task due yet."
  const scheduledClock = task.status === "planned" ? resolveTaskClockTime(task, todayLocalDateString(new Date(now))) : null;
  const secondsUntilStart = scheduledClock ? (scheduledClock.getTime() - now) / 1000 : null;

  // Unified Task Stages task: resolved once per render, from the one
  // persisted stageProgress record -- every rendering decision below
  // reads these, never re-deriving "which stage/what's next" its own
  // way. All null/0 for a legacy (no configured stages) task, so its
  // own screen renders exactly as it always has.
  const activeStage = stageProgress && task.actionStages ? task.actionStages.find((stage) => stage.id === stageProgress.activeStageId) ?? null : null;
  const nextStageAfterActive = stageProgress && task.actionStages && activeStage ? resolveNextActionStage(task.actionStages, activeStage.id) : null;
  const completedStageMinutes = stageProgress && task.actionStages ? resolveCompletedDurationMinutes(task.actionStages, stageProgress) : 0;
  const totalStageMinutes = task.actionStages ? sumActionStageDurations(task.actionStages) : 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* ARCHI -- Unified 7-Part Update task, Part 1 ("FIX TASK LIVE
          SCROLLING"): the whole screen's content now scrolls as ONE
          area -- "do not introduce a second independently scrolling
          area." Everything that used to sit in a plain, non-scrolling
          View (including the bottommost "קיצור המשימה הנוכחית" chips)
          is reachable by scrolling on short screens or with larger
          accessibility font sizes; the native floating ARC overlay is
          a system-level overlay outside this screen entirely, so it
          was never able to intercept this ScrollView's own gestures. */}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.titleRow}>
          <View style={styles.titleRowActions}>
            <Pressable onPress={() => router.push({ pathname: "/tasks/[id]/edit", params: { id: task.id } })}>
              <Text style={styles.editLink}>ערוך</Text>
            </Pressable>
            {/* ARCHI -- Three UX Improvements task, Improvement 2 ("Add a
                Home button to the Task LIVE timer screen"): a plain navigation
                action -- it never touches timerRun/restRun, never calls
                handlePause/handleFinishEarly/clearTaskTimerRun, and never
                shows/hides the floating overlay. The persisted TaskTimerRun
                (data/storage.ts) and the native floating overlay/foreground
                service both already keep the active/paused timer correct
                independent of whether this screen is mounted at all --
                exactly as leaving via any other existing path (backgrounding
                the app, tapping the ongoing notification) already does
                today. router.replace("/") (never push/back/dismissTo) is
                the established "go home" idiom used throughout this
                codebase, since Task LIVE can be reached from many
                unpredictable origins (notifications, alarms, the floating
                overlay's own deep links) with no reliable "back" target. */}
            <Pressable onPress={() => router.replace("/")}>
              <Text style={styles.homeButton}>🏠</Text>
            </Pressable>
          </View>
          <Text style={styles.title}>{task.title}</Text>
        </View>
        <Pressable onPress={() => router.push({ pathname: "/tasks/[id]/reflections", params: { id: task.id } })}>
          <Text style={styles.editLink}>מה שלמדתי במשימה הזאת</Text>
        </Pressable>
        <Text style={styles.fieldLabel}>{activeStage ? "הפעולה הנוכחית" : "הפעולה הראשונה"}</Text>
        <Text style={styles.actionLabel}>{activeStage ? activeStage.description : task.currentAction ?? task.firstAction}</Text>
        {activeStage && (
          <>
            {nextStageAfterActive && <Text style={styles.hint}>{`הפעולה הבאה: ${nextStageAfterActive.description}`}</Text>}
            <Text style={styles.hint}>{`התקדמות במשימה: ${completedStageMinutes} מתוך ${totalStageMinutes} דקות`}</Text>
          </>
        )}

        {/* Task LIVE Purpose Card task: "goal -> reason -> value ->
            identity" above the timer, below the current action -- see
            arc/taskPurposeContext.ts/live/components/TaskPurposeCard.tsx.
            Renders nothing at all when this task has no linked goal and
            no task-level reason/value/identity of its own. */}
        <TaskPurposeCard context={resolveTaskPurposeContext(task, purposeManifests, purposeArcGymGoals, purposeArcGoals)} />

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

        {/* ARC Reminders task, requirement 8: this end-of-timer prompt
            (ARC/rest/"המשימה הבאה") is retired -- `timerEnded` now
            auto-triggers handleComplete() directly (see the effect
            below), so by the time a render could ever reach this
            branch, taskCompleting is already true and the "המשימה
            הושלמה" block further down is what actually renders. Zero
            mandatory screens: reflecting, resting, or starting ARC
            before moving on are all reachable only via the new
            persistent transition notification's own optional actions. */}

        {restRun && status && (
          <View style={styles.timerBlock}>
            <Text style={styles.timerText}>מנוחה: {formatRemaining(status.remainingSeconds)}</Text>
            {restRunEnded ? (
              <Pressable
                style={styles.primaryButton}
                onPress={async () => {
                  // ARCHI -- Adaptive Task Execution & Emotional
                  // Persistence task, section 8: an in-loop break always
                  // returns to the SAME continuation menu -- checked
                  // first, before the pre-existing postponement-rest
                  // redirect below, which only ever applies to an
                  // ordinary (non-loop) rest.
                  if (continuationLoop && continuationLoop.phase === "break") {
                    await handleExitLoopBreak();
                    return;
                  }
                  await clearEndedTimer();
                  // Smart Postponement Flow, requirement 5: a rest
                  // started from the postponement flow (an unresolved
                  // "rest" outcome still pending for this task) lands
                  // on the shared "are you ready to start?" screen
                  // instead of silently falling back to this screen's
                  // own plain pre-start view -- an ordinary end-of-task
                  // rest (no pending postponement) is unaffected.
                  const outcomes = await loadPostponementObstacleOutcomes();
                  const pending = findLatestOutcomeForTask(outcomes, task!.id);
                  if (pending && pending.reason === "rest" && pending.startedOriginalTaskAfter === null) {
                    router.replace({ pathname: "/tasks/[id]/postpone-return", params: { id: task!.id } });
                  }
                }}
              >
                <Text style={styles.primaryButtonText}>סיום המנוחה</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.primaryButton}
                onPress={async () => {
                  await cancelTaskTimerEndAlarm(restRun.notificationId);
                  const finished = { ...finishTaskTimerRunEarly(restRun, new Date().toISOString()), notificationId: null };
                  await saveTaskTimerRun(finished);
                  setRestRun(finished);
                  if (continuationLoop && continuationLoop.phase === "break") {
                    await handleExitLoopBreak();
                    return;
                  }
                  await updateFloatingTimerOverlay(finished, task, null, nextScheduledTaskForOverlay);
                }}
              >
                <Text style={styles.primaryButtonText}>סיום מוקדם</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* ARCHI -- Adaptive Task Execution & Emotional Persistence
            task, sections 7-10: the continuation menu -- shown once a
            plain task's natural timer end entered the loop instead of
            auto-completing (handleTimerNaturalEndForContinuationLoop
            above). Never shown during an in-loop break (the rest block
            above already covers that) or an in-loop ARC session
            (navigated away entirely while that lasts). */}
        {continuationLoop && continuationLoop.phase === "choosing_action" && !restRun && (
          <View style={styles.timerBlock}>
            <Text style={styles.question}>הקטע הסתיים -- מה הלאה?</Text>
            <Text style={styles.hint}>להמשיך במשימה?</Text>
            <View style={styles.chipRow}>
              <Pressable style={styles.chip} onPress={handleContinuationContinueSame}>
                <Text style={styles.chipText}>להמשיך באותו משך</Text>
              </Pressable>
              <Pressable style={styles.chip} onPress={handleContinuationSuggestedShorter}>
                <Text style={styles.chipText}>המשך קצר יותר (מוצע)</Text>
              </Pressable>
              <Pressable style={styles.chip} onPress={() => setShowContinuationDurationInput(true)}>
                <Text style={styles.chipText}>לקבוע משך אחר</Text>
              </Pressable>
              <Pressable style={styles.chip} onPress={handleContinuationAnotherSegment}>
                <Text style={styles.chipText}>קטע עבודה נוסף</Text>
              </Pressable>
            </View>
            {showContinuationDurationInput && (
              <View style={styles.addRow}>
                <Pressable style={styles.addButton} onPress={handleContinuationCustomDuration}>
                  <Text style={styles.addButtonText}>התחלה</Text>
                </Pressable>
                <TextInput
                  style={[styles.textInput, styles.flexInput]}
                  value={continuationDurationDraft}
                  onChangeText={setContinuationDurationDraft}
                  keyboardType="number-pad"
                  textAlign="right"
                  placeholder="דקות"
                />
              </View>
            )}

            <Text style={styles.hint}>לא כרגע?</Text>
            <View style={styles.chipRow}>
              {[5, 10, 15].map((minutes) => (
                <Pressable key={minutes} style={styles.chip} onPress={() => handleContinuationBreak(minutes)}>
                  <Text style={styles.chipText}>{`הפסקה ${minutes} דק'`}</Text>
                </Pressable>
              ))}
              <Pressable style={styles.chip} onPress={() => setShowContinuationShrink(true)}>
                <Text style={styles.chipText}>להקטין את המשימה</Text>
              </Pressable>
              <Pressable style={styles.chip} onPress={() => handleContinuationArc("full")}>
                <Text style={styles.chipText}>ARC פחות טוב</Text>
              </Pressable>
              <Pressable style={styles.chip} onPress={() => handleContinuationArc("shortened")}>
                <Text style={styles.chipText}>ARC סבבה</Text>
              </Pressable>
              <Pressable style={styles.chip} onPress={() => handleContinuationArc("urge")}>
                <Text style={styles.chipText}>מחשבה / דחף</Text>
              </Pressable>
              <Pressable style={styles.chip} onPress={handleContinuationFinish}>
                <Text style={styles.chipText}>סיום המשימה</Text>
              </Pressable>
            </View>

            {showContinuationShrink && (
              <View style={styles.adjustSectionBlock}>
                <TextInput
                  style={styles.textInput}
                  value={continuationShrinkMinutesDraft}
                  onChangeText={setContinuationShrinkMinutesDraft}
                  keyboardType="number-pad"
                  textAlign="right"
                  placeholder={`דקות (מוצע: ${suggestHalvedDuration(task.expectedDurationMinutes ?? 10)})`}
                />
                <TextInput
                  style={styles.textInput}
                  value={continuationShrinkTextDraft}
                  onChangeText={setContinuationShrinkTextDraft}
                  textAlign="right"
                  placeholder="מה בדיוק יבוצע?"
                />
                <Pressable style={styles.primaryButton} onPress={handleContinuationShrinkConfirm}>
                  <Text style={styles.primaryButtonText}>יצירה והתחלה</Text>
                </Pressable>
              </View>
            )}

            {/* The no-next-task case's own explicit manual end (section 10) -- only shown when there is genuinely nothing else scheduled today. */}
            {!nextScheduledTask && (
              <Pressable style={styles.secondaryButton} onPress={handleContinuationUserStop}>
                <Text style={styles.secondaryButtonText}>סיום ההפעלה</Text>
              </Pressable>
            )}
          </View>
        )}

        {!timerEnded && !restRun && timerRun && !timerRunEnded && status && (
          <View style={styles.timerBlock}>
            <Text style={styles.timerText}>{formatRemaining(status.remainingSeconds)}</Text>
            {/* Lock-Screen Timer, Next-Task Schedule and Smart Alarm Conflict Management task, requirement 2: shown on Task LIVE too, mirroring the Task Details screen above. */}
            {nextScheduledTask ? (
              <Text style={styles.hint}>
                {`המשימה הבאה: ${nextScheduledTask.task.title}${nextScheduledTask.effectiveStartTime ? ` / שעת התחלה: ${nextScheduledTask.effectiveStartTime}` : ""}`}
                {nextTaskIsOverdue ? " (באיחור)" : ""}
              </Text>
            ) : (
              <Text style={styles.hint}>אין משימה נוספת מתוכננת</Text>
            )}
            <View style={styles.buttonRow}>
              {status.paused ? (
                <Pressable style={styles.secondaryButton} onPress={handleResume}>
                  <Text style={styles.secondaryButtonText}>המשך</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.secondaryButton} onPress={handlePauseButtonPress}>
                  <Text style={styles.secondaryButtonText}>השהיה</Text>
                </Pressable>
              )}
              <Pressable style={styles.secondaryButton} onPress={handleFinishEarly}>
                <Text style={styles.secondaryButtonText}>סיום מקטע</Text>
              </Pressable>
              {/* Unified Task Stages task, requirement 4: only ever shown for a task with a configured stage breakdown -- a legacy task's screen is completely unaffected. "The user may complete a stage before its planned duration expires." */}
              {activeStage && (
                <Pressable style={[styles.primaryButton, completingStage && styles.disabledButton]} onPress={handleCompleteStage} disabled={completingStage}>
                  <Text style={styles.primaryButtonText}>✓ סיום הפעולה</Text>
                </Pressable>
              )}
            </View>
            {/* ARCHI -- Consolidated Implementation Request, Part 12.1/12.2:
                the old "צריך ARC"/"Mini ARC" pair is replaced by the SAME
                two mood-based entry points Home/the widget/the floating
                cube already use -- "😟 פחות טוב" and "🙂 סבבה" (the
                updated Shortened ARC, directly). Never "😄 מעולה" here --
                that one only ever appears after actual completion
                (Part 12.3/12.4, below). Same pause-first discipline the
                old buttons already used (the exact same handlePause() the
                explicit "השהיה" button uses, never a duplicated pause
                path), and the real task id is passed through explicitly
                (never null), so no second/duplicate ARC session is ever
                created and the active task/timer context is preserved --
                returning lands back here with the timer already paused,
                ready for an explicit "המשך" tap.
                ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth
                Tracks task: "😟 פחות טוב" now opens Full ARC directly
                (openFullArc) instead of the removed Mini-vs-Full-ARC
                choice screen -- depth is decided automatically by the
                new time rating, so there is no manual choice left to
                make here. */}
            <View style={styles.moodButtonRow}>
              <Pressable
                style={styles.secondaryButton}
                onPress={async () => {
                  await handlePause();
                  openFullArc(task.id);
                }}
              >
                <Text style={styles.secondaryButtonText}>😟 פחות טוב</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={async () => {
                  await handlePause();
                  openShortenedArc(task.id);
                }}
              >
                <Text style={styles.secondaryButtonText}>🙂 סבבה</Text>
              </Pressable>
            </View>

            {/* ARC Addiction: open the route for this task (returns here),
                or show the running urge-waiting timer -- independent of
                the task timer, which is never paused by it. */}
            <ArcAddictionTaskLiveEntry taskId={task.id} />

            {/*
              Proactive Support During Task LIVE task: live toggle for
              Task.taskIsOnPhone -- same persistTask(...) call shape
              handlePause/handleResume already use, just flipping one
              different field. Shown in the same gate (!restRun &&
              timerRun) as the app-exit proactive-support listener this
              flag governs, so it's reachable exactly while it matters.
            */}
            <Pressable
              style={styles.secondaryButton}
              onPress={() => persistTask({ ...task, taskIsOnPhone: !task.taskIsOnPhone, updatedAt: new Date().toISOString() })}
            >
              <Text style={styles.secondaryButtonText}>{task.taskIsOnPhone ? "✓ המשימה היא בטלפון" : "המשימה היא בטלפון"}</Text>
            </Pressable>

            {/* Task Shortening/Rescheduling UI, section 5: a nonintrusive,
                contextual section -- never an automatic replacement of
                the current task, never a forced postponement/shortening/
                completion. Shown only once the active task genuinely
                approaches/exceeds the next task's own start. */}
            {showAdjustSection && nextScheduledTask && (
              <View style={styles.adjustSectionBlock}>
                <Text style={styles.question}>
                  {`המשימה הנוכחית מתקרבת (או עברה) את שעת ההתחלה של "${nextScheduledTask.task.title}". מה מתאים לך?`}
                </Text>
                <Text style={styles.hint}>קיצור המשימה הנוכחית:</Text>
                <View style={styles.chipRow}>
                  {SHORTEN_TASK_OPTIONS_MINUTES.map((minutes) => (
                    <Pressable key={minutes} style={styles.chip} onPress={() => handleShortenCurrentTask(minutes)}>
                      <Text style={styles.chipText}>{`קצר ב-${minutes} דק'`}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.hint}>דחיית המשימה הבאה:</Text>
                <View style={styles.chipRow}>
                  {RESCHEDULE_NEXT_TASK_OPTIONS_MINUTES.map((minutes) => (
                    <Pressable key={minutes} style={styles.chip} onPress={() => handleRescheduleNextTask(minutes)}>
                      <Text style={styles.chipText}>{`דחה ב-${minutes} דק'`}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.hint}>עדכון משך המשימה הבאה:</Text>
                <View style={styles.chipRow}>
                  {ADJUST_NEXT_DURATION_OPTIONS_MINUTES.map((minutes) => (
                    <Pressable key={minutes} style={styles.chip} onPress={() => handleAdjustNextTaskDuration(minutes)}>
                      <Text style={styles.chipText}>{`${minutes} דק'`}</Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable style={styles.secondaryButton} onPress={handleDismissAdjustSection}>
                  <Text style={styles.secondaryButtonText}>המשך במשימה הנוכחית</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/*
         * ARCHI -- Unified Development Specification task, Part 9
         * ("DISPLAY LINKED INSIGHTS IN TASK LIVE"): shown below the
         * timer block(s) above -- never a modal, never auto-opened,
         * simply part of this screen's own scroll content. Each
         * insight is collapsed by default (a long text never pushes
         * the timer/controls off-screen); tapping toggles that ONE
         * insight only, via the expandedInsightIds set, so several
         * linked insights never clutter each other's state.
         */}
        {linkedInsights.length > 0 && (
          <View style={styles.linkedInsightsBlock}>
            <Text style={styles.linkedInsightsTitle}>תובנות מקושרות למשימה זו</Text>
            {linkedInsights.map((insight) => {
              const isExpanded = expandedInsightIds.has(insight.id);
              return (
                <Pressable
                  key={insight.id}
                  style={styles.linkedInsightCard}
                  onPress={() =>
                    setExpandedInsightIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(insight.id)) next.delete(insight.id);
                      else next.add(insight.id);
                      return next;
                    })
                  }
                >
                  <Text style={styles.linkedInsightText} numberOfLines={isExpanded ? undefined : 2}>
                    {insight.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Reflection-before-completion fix: `!showIdentityInsightPrompt`
            -- every OTHER post-completion block in this screen
            (the "המשימה הושלמה" label, the complete/next/skip row) was
            already guarded against rendering alongside the identity-
            insight prompt; this Start/Postpone block was the one
            exception, so right after handleComplete clears the timer
            (timerRun/restRun/timerEnded all become false/falsy) and
            marks the insight pending, this block and the reflection
            prompt below both rendered at once -- a fresh Start/Postpone
            row ABOVE the very reflection questions for the task that
            was just finished. */}
        {!showIdentityInsightPrompt && !timerRun && !restRun && !timerEnded && !continuationLoop && (
          <View style={styles.buttonColumn}>
            {secondsUntilStart !== null && secondsUntilStart > 0 && (
              <Text style={styles.hint}>{`מתחיל בעוד ${formatTimeUntilStart(secondsUntilStart)}`}</Text>
            )}
            {/* Lock-Screen Timer, Next-Task Schedule and Smart Alarm
                Conflict Management task, requirement 2: shown on the
                Task Details screen too, not only Task LIVE -- never
                modifies the schedule merely by displaying it. */}
            {nextScheduledTask ? (
              <Text style={styles.hint}>
                {`המשימה הבאה: ${nextScheduledTask.task.title}${nextScheduledTask.effectiveStartTime ? ` / שעת התחלה: ${nextScheduledTask.effectiveStartTime}` : ""}`}
                {nextTaskIsOverdue ? " (באיחור)" : ""}
              </Text>
            ) : (
              <Text style={styles.hint}>אין משימה נוספת מתוכננת</Text>
            )}
            <Pressable style={styles.primaryButton} onPress={handleStart}>
              <Text style={styles.primaryButtonText}>
                {task.taskKind === "manifest"
                  ? "התחלת תרגול Manifest"
                  : task.taskKind === "arcFocus"
                    ? "התחלת ARC Focus"
                    : task.taskKind === "arcLearningReview"
                      ? "התחלת שליפה"
                      : task.taskKind === "arcCreativityReview"
                        ? "התחלת שליפת קשרים"
                        : task.taskKind === "arcWriting"
                          ? "התחלת כתיבה"
                          : "התחלה"}
              </Text>
            </Pressable>
            {/* ARC Focus task: duration/tap-rhythm/attention-check settings
                aren't generic Task fields (arc/arcFocusSettings.ts, keyed
                by this task's own id) -- reopens the SAME settings screen
                ARC GYM's own "ARC Focus" card uses, pre-filled, rather
                than a second, task-specific settings screen. Date/time/
                recurrence edits still go through this task's ordinary
                edit/postpone/override screens, completely unchanged. */}
            {task.taskKind === "arcFocus" && (
              <Pressable style={styles.secondaryButton} onPress={() => router.push({ pathname: "/arc-gym/arc-focus", params: { taskId: task.id } })}>
                <Text style={styles.secondaryButtonText}>הגדרות ARC Focus</Text>
              </Pressable>
            )}
            {/* ARC Writing & ARC Book task: unlike the arcFocus settings
                link above, this task DOES use the real work timer -- this
                button never gates or replaces "התחלה," it just reopens
                the same text/chapter performStart() already navigated to
                once the timer was created, so the trainee can get back to
                writing after following an ARC-mid-task detour or simply
                switching screens. */}
            {task.taskKind === "arcWriting" && (
              <Pressable style={styles.secondaryButton} onPress={() => openArcWritingTarget(task)}>
                <Text style={styles.secondaryButtonText}>פתח את הכתיבה</Text>
              </Pressable>
            )}
            {/* ARC-system upgrade task, Part 2: an OPTIONAL window, never a
                required gate -- "התחלה" above always remains available
                without ever going through this. */}
            {task.arcWindowMinutesBefore !== null && (
              <Pressable style={styles.secondaryButton} onPress={() => router.push({ pathname: "/tasks/[id]/arc-window", params: { id: task.id } })}>
                <Text style={styles.secondaryButtonText}>ARC אופציונלי לפני המשימה</Text>
              </Pressable>
            )}
            {/* Unified Emotional Check-In and Task Postponement System,
                section 4: Task LIVE's own "דחייה" button now opens the
                intervention screen -- "מה מונע ממך להתחיל את המשימה?"
                (rest / emotional / reduce-task) -- before anything is
                ever actually postponed, exactly like the alarm
                notification's own "דחייה" action already does. */}
            <Pressable style={styles.secondaryButton} onPress={() => router.push({ pathname: "/tasks/[id]/postpone-obstacle", params: { id: task.id } })}>
              <Text style={styles.secondaryButtonText}>דחיית המשימה</Text>
            </Pressable>
          </View>
        )}

        {showIdentityInsightPrompt && (
          <View style={styles.identityInsightBlock}>
            {/* Part F step 10 / Part A: every track ends with
                reinforcement + gratitude, including the Task track's own
                identity action -- captured here, right after the action
                actually happened, never before. */}
            <Text style={styles.hint}>שווה לשים לב שהפעולה הזו קרה. על מה אתה מודה לעצמך כרגע?</Text>
            <Text style={styles.question}>מה התובנה שלמדת על עצמך מהפעולה שביצעת?</Text>
            <TextInput
              style={[styles.textInput, styles.multilineInput]}
              value={identityInsightDraft}
              onChangeText={setIdentityInsightDraft}
              textAlign="right"
              multiline
              placeholder="כתוב במילים שלך"
            />
            <TextInput
              style={styles.textInput}
              value={identityBeliefDraft}
              onChangeText={setIdentityBeliefDraft}
              textAlign="right"
              placeholder="אמונת זהות מחזקת (רשות) -- אפשר להשאיר ריק"
            />
            <Pressable
              style={[styles.primaryButton, !identityInsightDraft.trim() && styles.disabledButton]}
              disabled={!identityInsightDraft.trim()}
              onPress={() => finishIdentityInsight(false)}
            >
              <Text style={styles.primaryButtonText}>המשך למשימה הבאה</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => finishIdentityInsight(true)}>
              <Text style={styles.secondaryButtonText}>דלג</Text>
            </Pressable>
          </View>
        )}

        {/* Task Completion Navigation fix: `|| taskCompleting` --
            task.status alone is not enough to detect "just completed"
            here, since a RECURRING task's own completedTask.status is
            deliberately kept "planned" (never "completed") so future
            occurrences stay unaffected; taskCompleting is the one flag
            that is true immediately upon pressing "השלמת משימה"
            regardless of recurrence, hiding this button row (and the
            end-of-timer prompt above) without needing another tap. */}
        {!showIdentityInsightPrompt && (task.status === "completed" || taskCompleting) ? (
          <View>
            <Text style={styles.completedLabel}>המשימה הושלמה</Text>
            {/* ARCHI -- Consolidated Implementation Request, Part 12.3/
                12.4: "😄 מעולה" never appears as a THIRD active-task mood
                button (it's absent from the moodButtonRow above) -- it
                only shows up here, combined with the existing Next Task
                action, once the task is ACTUALLY completed (not the
                pre-completion end-of-timer prompt). Reuses handleNextTask()
                verbatim -- the exact same pause-then-peek-forward
                navigation every other "המשימה הבאה" button already calls,
                never a second next-task mechanism -- so the next task's
                timer is never auto-started, and (via its own
                navigateToNextOrTasksList) a day with nothing left to do
                next shows the existing "no more tasks" state rather than
                inventing one. Nothing here touches taskCompleting/
                task.status or the reward/reflection recording that already
                ran inside handleComplete just before this state became
                true, so completion records/rewards/reflections are
                neither duplicated nor re-triggered by pressing it. */}
            <Pressable style={styles.secondaryButton} onPress={handleNextTask}>
              <Text style={styles.secondaryButtonText}>😄 מעולה · המשימה הבאה</Text>
            </Pressable>
          </View>
        ) : !showIdentityInsightPrompt && (
          // ARC-system upgrade task, Part J: three distinct, separately
          // labeled actions -- completing never happens as a side effect
          // of navigating or skipping, and navigating/skipping never mark
          // the task complete.
          <View style={styles.buttonRow}>
            <Pressable style={styles.secondaryButton} onPress={handleComplete}>
              <Text style={styles.secondaryButtonText}>השלמת משימה</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={handleNextTask}>
              <Text style={styles.secondaryButtonText}>המשימה הבאה</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={handleSkipTask}>
              <Text style={styles.secondaryButtonText}>דלג על משימה</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <Modal visible={showVisualizationGate} transparent animationType="fade" onRequestClose={() => setShowVisualizationGate(false)}>
        <View style={styles.visualizationGateOverlay}>
          <View style={styles.visualizationGateCard}>
            <Text style={styles.visualizationGateText}>לפני שנתחיל במשימות היום, נשלים את הוויזואליזציה היומית.</Text>
            <Pressable style={styles.primaryButton} onPress={handleOpenVisualizationFromGate}>
              <Text style={styles.primaryButtonText}>התחל ויזואליזציה</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryButton, styles.visualizationGateBypassButton]}
              onPress={handleBypassVisualizationFromGate}
              disabled={visualizationGateBusy}
            >
              <Text style={styles.secondaryButtonText}>דילוג להיום</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function formatRemaining(remainingSeconds: number): string {
  const totalSeconds = Math.ceil(remainingSeconds);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Productivity upgrade task, requirement 5: a plain "X hours Y minutes" / "Y minutes" reading for a task that isn't due yet -- never the mm:ss countdown style formatRemaining uses above, which only reads naturally for an active run already under an hour. */
function formatTimeUntilStart(totalSeconds: number): string {
  const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} דק'`;
  if (minutes === 0) return `${hours} שע'`;
  return `${hours} שע' ו-${minutes} דק'`;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 20, gap: 4 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  titleRowActions: { flexDirection: "row", alignItems: "center", gap: 14 },
  homeButton: { fontSize: 20 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right" },
  editLink: { color: "#0a7ea4", fontSize: 14 },
  fieldLabel: { fontSize: 12, textAlign: "right", color: "#888", marginTop: 10 },
  actionLabel: { fontSize: 16, textAlign: "right", color: "#444", marginBottom: 16 },
  notificationExplanationBlock: { backgroundColor: "#f7fbfd", borderRadius: 10, padding: 14, marginBottom: 16 },
  notificationExplanationText: { fontSize: 13, textAlign: "right", color: "#444", marginBottom: 10, lineHeight: 19 },
  visualizationGateOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  visualizationGateCard: { backgroundColor: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 420 },
  visualizationGateText: { fontSize: 16, textAlign: "right", color: "#222", lineHeight: 23, marginBottom: 16 },
  visualizationGateBypassButton: { marginTop: 10 },
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
  // Part 12.1: "both buttons in a clear, balanced row" -- same
  // row/gap convention as chipRow above.
  moodButtonRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  chip: { backgroundColor: "#E6F4FE", paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  chipText: { color: "#0a7ea4", fontSize: 14 },
  primaryButton: { backgroundColor: "#0a7ea4", paddingVertical: 14, borderRadius: 10, alignItems: "center", marginTop: 8 },
  primaryButtonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10, alignItems: "center" },
  secondaryButtonText: { color: "#0a7ea4", fontSize: 15 },
  endPromptBlock: { marginVertical: 20 },
  completedLabel: { fontSize: 15, color: "#1a6b4a", textAlign: "center", marginTop: 16, fontWeight: "600" },
  identityInsightBlock: { marginVertical: 16, gap: 8 },
  adjustSectionBlock: { backgroundColor: "#fff7e6", borderRadius: 10, padding: 14, marginTop: 16, gap: 8, width: "100%" },
  textInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16 },
  flexInput: { flex: 1 },
  addRow: { flexDirection: "row", gap: 8, width: "100%" },
  addButton: { backgroundColor: "#0a7ea4", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, justifyContent: "center" },
  addButtonText: { color: "#fff", fontWeight: "600" },
  multilineInput: { minHeight: 70, textAlignVertical: "top" },
  disabledButton: { opacity: 0.5 },
  linkedInsightsBlock: { marginVertical: 12, gap: 8 },
  linkedInsightsTitle: { fontSize: 13, fontWeight: "600", textAlign: "right", color: "#888" },
  linkedInsightCard: { backgroundColor: "#FFF9E6", borderRadius: 10, padding: 12 },
  linkedInsightText: { fontSize: 14, textAlign: "right", color: "#444", lineHeight: 20 },
});
