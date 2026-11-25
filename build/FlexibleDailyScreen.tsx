import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Animated, AppState, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";

import { createEmptyTask, ensureTimePlanningTaskInList, generateTaskId, TIME_PLANNING_TASK_ID } from "../arc/tasks.ts";
import type { Task } from "../arc/tasks.ts";
import { applyScheduleMode, reorderDailyPlanEntry, resolveAutoScheduleWriteBacks, resolveDailyPlan } from "../arc/dailyPlan.ts";
import type { ScheduledPlanEntry } from "../arc/dailyPlan.ts";
import { resolveTodoList, resolveWovenDaySections, TODO_PIN_START_OF_DAY } from "../arc/todoList.ts";
import type { TodoPlanEntry } from "../arc/todoList.ts";
import { buildTaskOccurrenceOverride, findTaskOccurrenceOverride, markTaskOccurrenceRemoved } from "../arc/taskOccurrenceOverride.ts";
import { resolveEffectiveScheduleMode, WEEKLY_SPACED_GAP_PRESETS } from "../arc/weeklyScheduleMode.ts";
import type { WeeklyScheduleMode } from "../arc/weeklyScheduleMode.ts";
import { isTaskTimerRunStale } from "../arc/taskTimer.ts";
import type { ArcGymGoal } from "../arc/arcGymGoal.ts";
import type { ArcTrigger } from "../arc/arcSaving.ts";
import {
  deleteTask,
  getTask,
  loadActiveArcTriggerIds,
  loadArcGymGoals,
  loadArcTriggers,
  loadDailyScheduleModeOverrides,
  loadFloatingTimerOverlayPreferences,
  loadShowHomeInsightButtonSetting,
  loadTaskOccurrenceCompletions,
  loadTaskOccurrenceOverrides,
  loadTasks,
  loadTaskStageProgress,
  loadTaskTimerRun,
  loadWeeklyScheduleModeSettings,
  saveFloatingTimerOverlayPreferences,
  upsertDailyScheduleModeOverrideEntry,
  upsertTask,
  upsertTaskOccurrenceOverrideEntry,
} from "../data/storage.ts";
import { deleteContinuousRoutineGroup, loadContinuousRoutineGroupsForDate, saveNewContinuousRoutineGroup } from "../data/continuousRoutineGroup.ts";
import { isConsecutiveSelection, type ContinuousRoutineGroup } from "../arc/continuousRoutineGroup.ts";
import { reconcileTaskAlarms } from "../data/taskAlarm.ts";
import { recomputeTaskNotStartedNotification } from "../data/taskNotStartedNotification.ts";
import { isDailyVisualizationCompletedNow } from "../data/dailyVisualization.ts";
import { isValidCalendarDateString, parseCalendarDate, todayLocalDateString } from "../program/dateUtils.ts";
import PersistentTaskControls from "../live/PersistentTaskControls.tsx";
import { FeelingCube, TaskCube } from "../live/components/HomeCubes.tsx";
import AddInfoMenu from "../live/components/AddInfoMenu.tsx";
import { hasFloatingOverlayPermissionAsync, requestFloatingOverlayPermissionAsync, showFloatingTimerOverlay, showIdleFloatingOverlayPanel } from "../data/floatingTimerOverlay.ts";
import { resolveNextScheduledTaskDisplay } from "../data/dailyPlan.ts";
import { topUpRemindersIfNeeded } from "../data/arcReminderScheduler.ts";
import TimePlanningModal from "./TimePlanningModal.tsx";

/**
 * build/FlexibleDailyScreen.tsx (route /routine-day?date=YYYY-MM-DD)
 *
 * Weekly & Daily Routine Redesign task: the editable, chronological
 * plan for ONE SPECIFIC calendar date -- `date` (defaulting to today
 * when absent, preserving this route's own pre-existing behavior for
 * any caller that doesn't pass one yet) -- arc/dailyPlan.ts's
 * resolveDailyPlan, combining every Fixed Weekly Routine (recurring)
 * task scheduled on that date's weekday with that date's own one-time
 * tasks, applying any per-date override. A change made here NEVER
 * touches the Fixed Weekly Routine template (see
 * arc/taskOccurrenceOverride.ts's own module doc) -- only this one
 * date's override record, or, for a one-time task, the task itself.
 *
 * The day's own effective (continuous/spaced auto-scheduled) start
 * times are computed via applyScheduleMode and immediately written
 * back into storage for any flexible weekly-origin entry
 * (resolveAutoScheduleWriteBacks) -- the ONE place that makes the
 * auto-scheduler's own computed time alarm-visible, by reusing the
 * EXISTING override-aware alarm reconciliation with zero changes to
 * that engine itself.
 *
 * "Add Task" / "Add Break" / "Add ARC" are direct, one-tap actions
 * (calendar design requirement 4) -- none of them opens the full task
 * editor first, and none of them auto-launches anything: a break/ARC
 * entry only ever starts when the trainee later taps IT, on
 * live/ActiveTaskScreen.tsx's own existing Start action (calendarEntryKind,
 * see arc/tasks.ts's own doc on that field).
 *
 * Open Today's Schedule Automatically task: when no `date` prop is
 * passed at all (isTodayMode -- this is exactly app/index.tsx's own
 * mounted Home instance, never any other caller), `dateLocal` is state,
 * not a one-time prop-derived constant, and is re-resolved to the
 * device's own local "today" (a) on every focus (covers navigating
 * away -- e.g. into Task LIVE -- and back) and (b) on every AppState
 * "active" transition (covers midnight passing while the app sat
 * backgrounded/locked, which a focus event alone would never catch,
 * since Home's own navigation focus never changes just because the OS
 * suspended and resumed it). A fixed-date instance (opened from the
 * Weekly screen for one specific calendar date) never re-resolves --
 * its own date is permanent for that instance's lifetime on the stack.
 * Either way this only ever READS existing per-date overrides; nothing
 * about resolving "today" writes or clears one.
 */
export default function FlexibleDailyScreen({ date = null }: { date?: string | null }) {
  const isTodayMode = date === null;
  const [dateLocal, setDateLocal] = useState<string>(() => (isValidCalendarDateString(date) ? date : todayLocalDateString(new Date())));
  const { year, month, day } = parseCalendarDate(dateLocal);
  const dateObj = new Date(year, month - 1, day);
  const weekday = dateObj.getDay();

  const [scheduled, setScheduled] = useState<ScheduledPlanEntry[] | null>(null);
  const [mode, setMode] = useState<WeeklyScheduleMode>({ mode: "continuous" });
  const [customGapDraft, setCustomGapDraft] = useState("");
  // Nine Functional Improvements task, Improvement 2: the dedicated
  // time-planning Task's own CURRENTLY SAVED duration, read (never
  // created) every reload so the duration field below reflects reality
  // -- timePlanningDraftInitialized ensures that read only ever seeds
  // the editable draft ONCE (the first time the task is seen to exist),
  // so it never stomps a duration the trainee is mid-typing on a later
  // reload (e.g. returning focus to this screen).
  const [timePlanningTask, setTimePlanningTask] = useState<Task | null>(null);
  const [timePlanningDurationDraft, setTimePlanningDurationDraft] = useState("");
  const [startingTimePlanning, setStartingTimePlanning] = useState(false);
  const timePlanningDraftInitialized = useRef(false);
  /**
   * Smart To-Do List task, section 4: today's own To-Do items, held as
   * this screen's own derived state (same "one source, passed down as a
   * prop" convention `scheduled` already uses) -- the תכנון זמן popup
   * (TimePlanningModal) never recomputes this itself, only reads it and
   * calls onChanged (== reload) after every edit so this flows fresh.
   */
  const [todoEntries, setTodoEntries] = useState<TodoPlanEntry[]>([]);
  const [timePlanningModalVisible, setTimePlanningModalVisible] = useState(false);

  /**
   * "גרירה חופשית של השורה במסך" (free dragging): a To-Do row's drag
   * handle (never a fixed/scheduled row -- those keep their own time-
   * based position and ▲▼ reorder, untouched) measures its own and
   * every other visible row's content-relative Y via onLayout into
   * rowLayoutsRef, and on release computes the row it was dropped
   * after, persisting that as Task.todoPinnedAfterTaskId
   * (arc/todoList.ts's resolveWovenDaySections then honors it directly,
   * overriding the automatic free-time weave for that one entry). The
   * outer ScrollView is deliberately disabled for the duration of the
   * drag (scrollEnabled={draggingTodoId === null}) so the drag gesture
   * never has to compete with the ScrollView's own pan responder --
   * the one real touch-conflict risk a free-floating drag over a
   * ScrollView would otherwise have.
   */
  const rowLayoutsRef = useRef<Map<string, { y: number; height: number }>>(new Map());
  const [draggingTodoId, setDraggingTodoId] = useState<string | null>(null);
  const dragTranslateY = useRef(new Animated.Value(0)).current;

  // Unified ARC & Productivity Update task, requirement 9: "select
  // multiple consecutive scheduled tasks and group them as שגרה
  // רצופה." continuousGroups holds every ad-hoc group already saved
  // for THIS date (arc/continuousRoutineGroup.ts's own module doc
  // explains how this differs from the pre-existing per-period
  // routineMode toggle); selectingContinuousGroup/selectedTaskIds are
  // this screen's own transient "picking tasks to group" UI state,
  // never persisted themselves -- only the finished group is.
  const [continuousGroups, setContinuousGroups] = useState<ContinuousRoutineGroup[]>([]);
  const [selectingContinuousGroup, setSelectingContinuousGroup] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  /** ARCHI -- Unified Development Specification task, Part 3/4/11: the Settings toggle controlling whether "הוסף תובנה" shows here -- reloaded on every focus so a change made in Settings is reflected the instant the trainee comes back to this screen. */
  const [showHomeInsightButton, setShowHomeInsightButton] = useState(true);
  /**
   * ARCHI -- Two Additions to the Existing Floating Cube task,
   * addition 1 ("Floating Cube Activation Button"): the SAME
   * FloatingTimerOverlayPreferences.enabled flag build/FloatingTimerSettingsScreen.tsx's
   * own Switch already reads/writes -- one shared source of truth, so
   * this button and that Settings screen can never disagree about
   * whether the overlay is on. Reloaded on every focus (same pattern
   * as showHomeInsightButton above) so toggling it from Settings is
   * reflected here, and toggling it here is reflected there, without
   * either screen needing a live subscription.
   */
  const [overlayActive, setOverlayActive] = useState(false);
  const [togglingOverlay, setTogglingOverlay] = useState(false);
  /** ARC Gym + ARC Goal Integration task: read-only, for the additive goal-title badge on each row below -- never affects scheduling/ordering. */
  const [arcGymGoals, setArcGymGoals] = useState<ArcGymGoal[]>([]);
  /** ARC Saving task, section 11: the trainee's own currently-active trigger shortcuts, in display order -- reloaded on every focus, same convention as showHomeInsightButton above, so a change made via "עריכת טריגרים" is reflected the instant the trainee comes back to Home. */
  const [activeTriggers, setActiveTriggers] = useState<ArcTrigger[]>([]);

  const reload = useCallback(async () => {
    const [tasks, overrides, completions, weekdaySettings, dateModeOverrides, groupsForDate, showInsightButton, overlayPreferences, goals, allTriggers, activeTriggerIds] =
      await Promise.all([
        loadTasks(),
        loadTaskOccurrenceOverrides(),
        loadTaskOccurrenceCompletions(),
        loadWeeklyScheduleModeSettings(),
        loadDailyScheduleModeOverrides(),
        loadContinuousRoutineGroupsForDate(dateLocal),
        loadShowHomeInsightButtonSetting(),
        loadFloatingTimerOverlayPreferences(),
        loadArcGymGoals(),
        loadArcTriggers(),
        loadActiveArcTriggerIds(),
      ]);
    setArcGymGoals(goals);
    setActiveTriggers(activeTriggerIds.map((id) => allTriggers.find((trigger) => trigger.id === id)).filter((trigger): trigger is ArcTrigger => !!trigger));
    setShowHomeInsightButton(showInsightButton);
    setOverlayActive(overlayPreferences.enabled);
    setContinuousGroups(groupsForDate);
    const existingTimePlanningTask = tasks.find((task) => task.id === TIME_PLANNING_TASK_ID) ?? null;
    setTimePlanningTask(existingTimePlanningTask);
    if (!timePlanningDraftInitialized.current && existingTimePlanningTask) {
      timePlanningDraftInitialized.current = true;
      setTimePlanningDurationDraft(existingTimePlanningTask.expectedDurationMinutes != null ? String(existingTimePlanningTask.expectedDurationMinutes) : "");
    }
    const effectiveMode = resolveEffectiveScheduleMode(weekday, dateLocal, weekdaySettings, dateModeOverrides);
    setMode(effectiveMode);
    setTodoEntries(resolveTodoList(tasks, dateLocal));

    const plan = resolveDailyPlan(tasks, overrides, completions, dateLocal, dateObj);
    const computed = applyScheduleMode(plan, effectiveMode);

    const writeBacks = resolveAutoScheduleWriteBacks(computed);
    if (writeBacks.length > 0) {
      const now = new Date().toISOString();
      for (const writeBack of writeBacks) {
        const task = tasks.find((candidate) => candidate.id === writeBack.taskId);
        if (!task) continue;
        const existingOverride = findTaskOccurrenceOverride(writeBack.taskId, writeBack.occurrenceDateLocal, overrides);
        await upsertTaskOccurrenceOverrideEntry(
          buildTaskOccurrenceOverride(task, writeBack.occurrenceDateLocal, existingOverride, { scheduledTime: writeBack.scheduledTime, timeIsManual: false }, now)
        );
      }
      await reconcileTaskAlarms();
    }

    setScheduled(computed);

    // ARCHI -- Unified Floating Overlay & Mini ARC Improvements task,
    // sections 1+2+8: Home keeps the unified panel current on every
    // focus -- the IDLE state (3 moods, next scheduled task, "עבור
    // למשימה הבאה", "הוסף תובנה") when no session is active, or the
    // ACTIVE state (current task's live title/progress) when one is.
    //
    // Task-name sync fix: this used to only ever resync the IDLE state
    // here, on the theory that live/ActiveTaskScreen.tsx alone owns the
    // panel while a session is active (its own
    // showFloatingTimerOverlay/updateFloatingTimerOverlay calls) and
    // Home resyncing too would "fight it for control." In practice
    // that meant renaming the currently-running task from Home's own
    // "ערוך" (without ever revisiting Task LIVE) left the floating
    // overlay, its lock-screen notification, and the home-screen widget
    // all showing the OLD title until the trainee next opened Task
    // LIVE. Home's reload() only ever runs while HOME itself is
    // focused, i.e. Task LIVE is not -- so there is no real screen to
    // "fight," and resyncFloatingOverlayToCurrentState (already used by
    // the activation-button toggle below for exactly this purpose) is
    // safe and idempotent to call unconditionally here too.
    if (isTodayMode) {
      await resyncFloatingOverlayToCurrentState();
      void topUpRemindersIfNeeded();
      void recomputeTaskNotStartedNotification();
    }
  }, [dateLocal, weekday, isTodayMode]);

  const resolveTodayIfNeeded = useCallback(() => {
    if (!isTodayMode) return;
    const current = todayLocalDateString(new Date());
    setDateLocal((prev) => (prev === current ? prev : current));
  }, [isTodayMode]);

  useFocusEffect(
    useCallback(() => {
      resolveTodayIfNeeded();
      reload();
    }, [reload, resolveTodayIfNeeded])
  );

  useEffect(() => {
    if (!isTodayMode) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") resolveTodayIfNeeded();
    });
    return () => subscription.remove();
  }, [isTodayMode, resolveTodayIfNeeded]);

  async function handleAddDirect(kind: "task" | "break" | "arc") {
    const now = new Date().toISOString();
    const titles: Record<typeof kind, string> = { task: "משימה חדשה", break: "הפסקה", arc: "ARC" };
    if (kind === "task") {
      router.push({ pathname: "/tasks/[id]/edit", params: { id: "new", scheduledDate: dateLocal } });
      return;
    }
    const task = {
      ...createEmptyTask(generateTaskId(), titles[kind], kind === "break" ? "לנוח" : "לתרגל ARC", now),
      scheduledDate: dateLocal,
      calendarEntryKind: kind,
      expectedDurationMinutes: kind === "break" ? 10 : null,
    };
    await upsertTask(task);
    await reconcileTaskAlarms();
    reload();
  }

  async function handleRemoveForToday(entry: ScheduledPlanEntry) {
    if (entry.origin === "weekly") {
      const overrides = await loadTaskOccurrenceOverrides();
      await upsertTaskOccurrenceOverrideEntry(markTaskOccurrenceRemoved(entry.task, entry.occurrenceDateLocal, overrides, new Date().toISOString()));
    } else {
      await deleteTask(entry.task.id);
    }
    await reconcileTaskAlarms();
    reload();
  }

  function confirmRemove(entry: ScheduledPlanEntry) {
    const message = entry.origin === "weekly" ? "המשימה תוסר מהיום הזה בלבד -- השבוע הקבוע לא ישתנה." : "המשימה תימחק.";
    Alert.alert("הסרה מהיום", message, [
      { text: "ביטול", style: "cancel" },
      { text: "הסר", style: "destructive", onPress: () => handleRemoveForToday(entry) },
    ]);
  }

  // Weekly & Daily Routine Redesign task, section 3 ("replace existing
  // tasks"): removes this one date's occurrence (never the permanent
  // template, same guarantee as an ordinary remove) and immediately
  // opens the task editor to create its replacement for this exact
  // date -- "replace" IS remove-then-add, reusing both EXISTING
  // primitives rather than inventing a third, competing mechanism.
  function confirmReplace(entry: ScheduledPlanEntry) {
    Alert.alert("החלפת משימה", `"${entry.task.title}" תוסר מהיום הזה, ותוכל להוסיף משימה אחרת במקומה.`, [
      { text: "ביטול", style: "cancel" },
      {
        text: "החלף",
        onPress: async () => {
          await handleRemoveForToday(entry);
          router.push({ pathname: "/tasks/[id]/edit", params: { id: "new", scheduledDate: dateLocal } });
        },
      },
    ]);
  }

  async function handleReorder(taskId: string, direction: "up" | "down") {
    if (!scheduled) return;
    const results = reorderDailyPlanEntry(scheduled, taskId, direction);
    if (!results) return;
    const now = new Date().toISOString();
    const overrides = await loadTaskOccurrenceOverrides();
    for (const result of results) {
      if (result.origin === "weekly") {
        const entry = scheduled.find((candidate) => candidate.task.id === result.taskId)!;
        const existingOverride = findTaskOccurrenceOverride(result.taskId, entry.occurrenceDateLocal, overrides);
        await upsertTaskOccurrenceOverrideEntry(buildTaskOccurrenceOverride(entry.task, entry.occurrenceDateLocal, existingOverride, { order: result.order }, now));
      } else {
        const task = await getTask(result.taskId);
        if (task) await upsertTask({ ...task, order: result.order });
      }
    }
    reload();
  }

  async function handleSetDateMode(nextMode: WeeklyScheduleMode) {
    await upsertDailyScheduleModeOverrideEntry({ occurrenceDateLocal: dateLocal, mode: nextMode, updatedAt: new Date().toISOString() });
    await reconcileTaskAlarms();
    reload();
  }

  // Unified ARC & Productivity Update task, requirement 9.
  function startSelectingContinuousGroup() {
    setSelectedTaskIds([]);
    setSelectingContinuousGroup(true);
  }

  function cancelSelectingContinuousGroup() {
    setSelectedTaskIds([]);
    setSelectingContinuousGroup(false);
  }

  function toggleTaskSelectedForGroup(taskId: string) {
    setSelectedTaskIds((current) => (current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]));
  }

  async function handleConfirmContinuousGroup() {
    if (!scheduled) return;
    const orderedTaskIds = scheduled.map((entry) => entry.task.id);
    if (!isConsecutiveSelection(orderedTaskIds, selectedTaskIds)) {
      Alert.alert("בחירה לא רצופה", "אפשר לקבץ רק משימות עוקבות ברצף, בלי דילוג על משימה שביניהן. נסה לבחור שוב.");
      return;
    }
    // The group's own stored order follows the SAME order the tasks
    // already appear in today's schedule (never the tap order), so
    // resolveNextTaskInContinuousRoutineGroup always walks them
    // front-to-back exactly as displayed.
    const orderedSelection = orderedTaskIds.filter((id) => selectedTaskIds.includes(id));
    await saveNewContinuousRoutineGroup(orderedSelection, dateLocal, new Date());
    setSelectedTaskIds([]);
    setSelectingContinuousGroup(false);
    reload();
  }

  function confirmUngroup(group: ContinuousRoutineGroup) {
    Alert.alert("פירוק השגרה הרצופה", "המשימות עצמן יישארו כפי שהן -- רק הקיבוץ שלהן לשגרה אחת יוסר.", [
      { text: "ביטול", style: "cancel" },
      {
        text: "פרק קיבוץ",
        style: "destructive",
        onPress: async () => {
          await deleteContinuousRoutineGroup(group.id);
          reload();
        },
      },
    ]);
  }

  function handleStart(entry: ScheduledPlanEntry) {
    if (entry.task.calendarEntryKind === "arc") {
      router.push({ pathname: "/tasks/[id]/arc", params: { id: entry.task.id } });
      return;
    }
    router.push({ pathname: "/tasks/[id]", params: { id: entry.task.id, autoStart: "1" } });
  }

  /**
   * "אני רוצה שתהיה אפשרות להעביר את המשימה מה-To-Do ליסט ליום הגמיש
   * בין המשימות הקבועות": the To-Do entries woven into the main list
   * below (resolveWovenDaySections) each get this same direct start
   * action -- autoStart=1 on a To-Do task lands on ActiveTaskScreen's
   * OWN existing isTodoItem redirect to the duration/split-selection
   * screen (live/TaskDurationSelectionScreen.tsx), exactly like every
   * other To-Do start entry point in this app (the cube, ARC LIVE's
   * suggestion) -- never a second, competing start path.
   */
  function handleStartTodo(entry: TodoPlanEntry) {
    router.push({ pathname: "/tasks/[id]", params: { id: entry.task.id, autoStart: "1" } });
  }

  async function handleTodoDragEnd(taskId: string, dy: number) {
    setDraggingTodoId(null);
    dragTranslateY.setValue(0);
    const baseLayout = rowLayoutsRef.current.get(taskId);
    const todoEntry = todoEntries.find((candidate) => candidate.task.id === taskId);
    if (!baseLayout || !todoEntry) return;
    const droppedMidY = baseLayout.y + baseLayout.height / 2 + dy;
    let targetId: string | null = null;
    for (const item of wovenDaySections) {
      if (item.entry.task.id === taskId) continue;
      const layout = rowLayoutsRef.current.get(item.entry.task.id);
      if (!layout) continue;
      if (layout.y + layout.height / 2 < droppedMidY) targetId = item.entry.task.id;
    }
    const newPin = targetId ?? TODO_PIN_START_OF_DAY;
    if (todoEntry.task.todoPinnedAfterTaskId === newPin) return;
    await upsertTask({ ...todoEntry.task, todoPinnedAfterTaskId: newPin, updatedAt: new Date().toISOString() });
    reload();
  }

  function createTodoDragResponder(taskId: string) {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setDraggingTodoId(taskId);
        dragTranslateY.setValue(0);
      },
      onPanResponderMove: Animated.event([null, { dy: dragTranslateY }], { useNativeDriver: false }),
      onPanResponderRelease: (_event, gestureState) => handleTodoDragEnd(taskId, gestureState.dy),
      onPanResponderTerminate: () => {
        setDraggingTodoId(null);
        dragTranslateY.setValue(0);
      },
    });
  }

  function handleEdit(entry: ScheduledPlanEntry) {
    if (entry.origin === "weekly") {
      router.push({ pathname: "/tasks/[id]/edit", params: { id: entry.task.id, occurrenceDate: entry.occurrenceDateLocal } });
    } else {
      router.push({ pathname: "/tasks/[id]/edit", params: { id: entry.task.id } });
    }
  }

  /**
   * ARCHI -- Two Additions to the Existing Floating Cube task,
   * addition 1: pushes whichever payload is ACTUALLY correct right
   * now straight to the native overlay -- the active task's own
   * payload (reusing the exact same reconstruction
   * live/ActiveTaskScreen.tsx's own reload() already does: the
   * persisted TaskTimerRun, its task, its TaskStageProgress scoped to
   * that exact task, and the real next-scheduled-task) when one is
   * genuinely running or paused (same staleness check reload()'s own
   * idle-panel sync above already uses), otherwise the idle panel --
   * never a second "what to show" decision. Used only by the
   * activation button below: the regular on-focus `reload()` keeps
   * deliberately only ever syncing the IDLE state (see that effect's
   * own doc), since the ACTIVE case is normally live/ActiveTaskScreen.tsx's
   * own job to keep current; this one-off, explicitly user-initiated
   * resync is what makes toggling the button here take effect
   * immediately even if a task happens to be running while the
   * trainee is looking at this exact screen.
   */
  async function resyncFloatingOverlayToCurrentState() {
    const activeRun = await loadTaskTimerRun();
    if (activeRun && !isTaskTimerRunStale(activeRun, new Date())) {
      const [task, stageProgress, nextScheduled] = await Promise.all([
        getTask(activeRun.taskId),
        loadTaskStageProgress(),
        resolveNextScheduledTaskDisplay(activeRun.taskId, new Date()),
      ]);
      if (task) {
        const relevantStageProgress = stageProgress && stageProgress.taskId === activeRun.taskId ? stageProgress : null;
        await showFloatingTimerOverlay(
          activeRun,
          task,
          relevantStageProgress,
          nextScheduled
            ? {
                title: nextScheduled.task.title,
                effectiveStartTime: nextScheduled.effectiveStartTime,
                durationMinutes: nextScheduled.task.expectedDurationMinutes,
                isOverdue: nextScheduled.isOverdue,
              }
            : null
        );
        return;
      }
    }
    const nextScheduled = await resolveNextScheduledTaskDisplay(null, new Date());
    await showIdleFloatingOverlayPanel(
      nextScheduled
        ? {
            title: nextScheduled.task.title,
            effectiveStartTime: nextScheduled.effectiveStartTime,
            durationMinutes: nextScheduled.task.expectedDurationMinutes,
            isOverdue: nextScheduled.isOverdue,
          }
        : null
    );
  }

  /**
   * ARCHI -- Two Additions to the Existing Floating Cube task,
   * addition 1 ("Floating Cube Activation Button"):
   * - Activating checks the SYSTEM_ALERT_WINDOW permission first (same
   *   check build/FloatingTimerSettingsScreen.tsx already performs) and,
   *   if missing, opens the SAME OS settings screen that permission's
   *   only grant flow already uses -- the trainee grants it there and
   *   taps the button again; nothing here fakes "active" without it.
   * - Hiding only ever flips the SAME overlayEnabled preference this
   *   button shares with the Settings screen, then resyncs the native
   *   service to the CURRENT state with that preference now false --
   *   never `hideFloatingTimerOverlay()` (which would stop the whole
   *   foreground service/notification too), and never anything that
   *   touches the persisted TaskTimerRun -- "must not stop the current
   *   task timer" is satisfied by this function simply never touching
   *   it at all.
   * - Both directions end by resyncing, so the native overlay reflects
   *   the new state within this one tap, never waiting for some other
   *   screen's own next focus -- and since the native side's own
   *   ensureOverlayAdded() already refuses to add a second view while
   *   one exists, no amount of repeated tapping/toggling can ever
   *   create a duplicate overlay instance.
   */
  async function handleToggleFloatingOverlay() {
    if (togglingOverlay) return;
    setTogglingOverlay(true);
    try {
      if (!overlayActive) {
        if (Platform.OS === "android" && !(await hasFloatingOverlayPermissionAsync())) {
          Alert.alert(
            "הרשאה נדרשת",
            "כדי להציג את הקובייה הצפה מעל אפליקציות אחרות, צריך לאשר למכשיר הרשאה מיוחדת של Android (\"הצגה מעל אפליקציות אחרות\"). אחרי שתאשר/י בהגדרות, חזור/י לכאן ולחצ/י שוב על הכפתור.",
            [
              { text: "ביטול", style: "cancel" },
              { text: "פתיחת הגדרות ההרשאה", onPress: () => requestFloatingOverlayPermissionAsync() },
            ]
          );
          return;
        }
        await saveFloatingTimerOverlayPreferences({ enabled: true });
        setOverlayActive(true);
      } else {
        await saveFloatingTimerOverlayPreferences({ enabled: false });
        setOverlayActive(false);
      }
      await resyncFloatingOverlayToCurrentState();
    } finally {
      setTogglingOverlay(false);
    }
  }

  /**
   * Morning Flow Simplification task, section 4: "prominently
   * accessible at the beginning of each day, even when Manifest
   * actions and daily planning are skipped" -- a persistent entry
   * point on Home itself, independent of the cold-start sequence
   * (live/DailyStartupSequenceOverlay.tsx).
   *
   * Nine Functional Improvements task, Improvement 6: deliberately
   * uses isDailyVisualizationCompletedNow (completed only), NOT
   * isDailyVisualizationNeededNow (completed OR bypassed) -- "skipping
   * means 'not now', never 'completed' or 'never today.'" A trainee who
   * skipped the exercise in the morning overlay must still be able to
   * open and finish it from here later the same day; only an ACTUALLY
   * completed exercise blocks re-opening (re-tapping then would
   * silently restart/discard today's finished state, which is still
   * correctly refused).
   */
  async function handleOpenDailyVisualization() {
    if (!(await isDailyVisualizationCompletedNow())) {
      router.push("/daily-visualization");
      return;
    }
    Alert.alert("ההכנה היומית", "כבר השלמת את ההכנה היומית להיום.");
  }

  /**
   * Nine Functional Improvements task, Improvement 2 ("Fix the
   * Time-Planning Task and Add a Timer"): the dedicated, startable,
   * timed planning task's own single entry point. Reuses every piece
   * of EXISTING infrastructure rather than building a second timer
   * engine --
   *
   *  1/2. "Startable... configurable timer": ensureTimePlanningTaskInList
   *     finds-or-creates the one reserved Task, saving whatever
   *     duration is in the draft field first (same save-then-start
   *     order Improvement 1's Manifest duration field already uses) --
   *     then opens it exactly like any other task's own "start" button
   *     (autoStart=1), which creates the SAME single-slot TaskTimerRun
   *     every other task's timer already uses.
   *  3. "Open daily planning while the timer is active": this screen
   *     (build/FlexibleDailyScreen.tsx, ARCHI's own Home) is already
   *     reachable via ordinary navigation at any time, and already
   *     renders live/PersistentTaskControls.tsx's own component right
   *     below -- its "התחל משימה" button already returns to whichever
   *     task is currently active, so leaving Task LIVE to look at this
   *     exact screen and coming back was already fully supported before
   *     this task; nothing new was needed for that half of the
   *     requirement.
   *  4. "Pause/Resume/Finish": live/ActiveTaskScreen.tsx's own existing
   *     controls, unchanged.
   *  5. "Normal reflection/reward flow": this is an ordinary
   *     "standard"-kind task, so completing it already ends in the
   *     same /tasks/[id]/reflect -> post-task-reward sequence every
   *     other task's completion already does.
   *  6. "Preserve accurate timer progress while navigating": TaskTimerRun
   *     is computed purely from persisted timestamps (arc/taskTimer.ts's
   *     own doc), never an interval counter tied to one screen's mount
   *     -- already correct for any task, including this one.
   * 10. "Prevent duplicate active timers": the single persisted
   *     TaskTimerRun slot can only ever hold ONE run. Before creating or
   *     starting anything, this checks for an already-active run (this
   *     task's own, or any other task's/rest timer's) and, if one
   *     exists, simply RETURNS to it -- the same "already active ->
   *     return to it, never start a second one" precedent
   *     live/PersistentTaskControls.tsx's own handleStartTaskPress uses.
   */
  async function handleStartTimePlanning() {
    if (startingTimePlanning) return;
    setStartingTimePlanning(true);
    try {
      const now = new Date();
      const activeRun = await loadTaskTimerRun();
      if (activeRun && !isTaskTimerRunStale(activeRun, now)) {
        router.push({ pathname: "/tasks/[id]", params: { id: activeRun.taskId } });
        return;
      }
      const tasks = await loadTasks();
      const nowIso = now.toISOString();
      const { task } = ensureTimePlanningTaskInList(tasks, nowIso);
      const parsedDuration = timePlanningDurationDraft.trim() ? Number(timePlanningDurationDraft) : null;
      const taskToSave =
        parsedDuration !== null && Number.isFinite(parsedDuration) && parsedDuration > 0
          ? { ...task, expectedDurationMinutes: parsedDuration, updatedAt: nowIso }
          : task;
      await upsertTask(taskToSave);
      router.push({ pathname: "/tasks/[id]", params: { id: TIME_PLANNING_TASK_ID, autoStart: "1" } });
    } finally {
      setStartingTimePlanning(false);
    }
  }

  function handleBackToWeek() {
    // Weekly & Daily Routine Redesign task, section 7: "Pressing Back
    // returns to the same weekly calendar" -- going back preserves
    // WeeklyRoutineScreen's own already-navigated-to week (its React
    // state is untouched, since that screen was never unmounted), while
    // a fresh push would always reset it back to the current week.
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.push("/routine-week");
  }

  if (scheduled === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <Text style={styles.hint}>טוען...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // "אני רוצה שתהיה אפשרות להעביר את המשימה מה-To-Do ליסט ליום הגמיש
  // בין המשימות הקבועות": a pure display derivation from this screen's
  // own existing scheduled/todoEntries state -- never a second source
  // of truth, never recomputed inside the render loop below.
  const wovenDaySections = resolveWovenDaySections(scheduled, todoEntries);
  const scheduledIndexById = new Map(scheduled.map((entry, index) => [entry.task.id, index]));

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} scrollEnabled={draggingTodoId === null}>
        <Text style={styles.title}>היום הגמיש · {dateLocal}</Text>

        {/* ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry
            "Cubes" task, section 5: replaces the screen's own former
            inline check-in block -- TaskCube/FeelingCube are the SAME
            shared components live/DailyStartupSequenceOverlay.tsx's
            "planning" step mounts, so both the home screen and the
            app's entry screen show the exact same task/feeling state,
            never two separate implementations. FeelingCube itself
            preserves every existing button this block used to render
            (urge/perspective rows included) -- only the 😄 smiley was
            dropped, per spec. */}
        {isTodayMode && (
          <>
            <TaskCube />
            <FeelingCube />
          </>
        )}

        {/* ARCHI -- Two Additions to the Existing Floating Cube task,
            addition 1 ("Floating Cube Activation Button"): the label
            itself is the ONE place this button's current on/off state
            is shown -- "keep the button synchronized with the actual
            native overlay state" via overlayActive, reloaded on every
            focus from the SAME preference the Settings screen's own
            Switch reads/writes. */}
        {isTodayMode && (
          <Pressable
            style={[styles.overlayToggleButton, overlayActive && styles.overlayToggleButtonActive]}
            onPress={handleToggleFloatingOverlay}
            disabled={togglingOverlay}
          >
            <Text style={styles.overlayToggleButtonText}>{overlayActive ? "הסתר קובייה צפה" : "הפעל קובייה צפה"}</Text>
          </Pressable>
        )}

        {/* Morning Flow Simplification task, section 4: the main
            preparation sequence's own persistent, always-reachable
            entry point -- additive to (never replacing) the check-in
            bar above and the ARC GYM/PersistentTaskControls below. */}
        {isTodayMode && (
          <Pressable style={styles.dailyVisualizationCard} onPress={handleOpenDailyVisualization}>
            <Text style={styles.dailyVisualizationTitle}>🧘 הכנה יומית — דמיין את היום שלך</Text>
            <Text style={styles.dailyVisualizationSubtitle}>דמיון המשימות שלך, סריקת גוף, והכנה לסוף היום.</Text>
          </Pressable>
        )}

        {/* Nine Functional Improvements task, Improvement 9: "editable
            later from Home/Settings" -- this Home-level link is
            additive to the identical one in build/TasksListScreen.tsx
            (Settings). */}
        {isTodayMode && (
          <Pressable style={styles.morningAlarmLink} onPress={() => router.push("/tasks/morning-alarm-settings")}>
            <Text style={styles.morningAlarmLinkText}>⏰ שעון מעורר להכנה יומית</Text>
          </Pressable>
        )}

        {/* ARCHI -- Unified 7-Part Update task, Part 7.1/7.3: a clearly
            visible general Settings entry, and a prominent, dedicated
            shortcut-activation button -- both additive to (never
            replacing) every existing link on this screen. The shortcut
            button reuses the existing, already-correct home/lock-
            screen setup screen (/tasks/emotional-checkin-settings)
            verbatim -- "do not create a duplicate settings system." */}
        {/*
         * ARC Saving, Trigger Management & Quick-Action Buttons task,
         * section 7+11: the four quick-action buttons, restyled with a
         * SOLID green background (never a border/text-only look) and
         * shortened labels -- "+ תובנה"/"+ אירוע חיובי" keep their exact
         * existing destinations/gating (showHomeInsightButton) verbatim,
         * "+ משימה" is new here (the same /tasks/[id]/edit route
         * TasksListScreen.tsx's own "הוסף משימה" button already uses),
         * and "+ ARC Save" opens the trigger-activation picker. Pulled
         * out of settingsRow below, which keeps only the view/collection
         * links (⚙️/📱/📜/📚/📖) -- never duplicated, never recreated.
         */}
        {/* ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry
            "Cubes" task, section 6: the four buttons above are
            preserved verbatim (same routes, same showHomeInsightButton
            gating) behind the single, shared "+ להוסיף מידע" menu --
            never deleted, only reorganized. */}
        {isTodayMode && <AddInfoMenu showHomeInsightButton={showHomeInsightButton} />}

        {/* ARC Saving task, section 11: the trainee's own currently-
            active trigger shortcuts -- tapping one opens the SAME
            activate flow "+ ARC Save" opens, pre-selecting that trigger
            so the trainee skips straight to its own body-option/mood
            choice (never auto-starting ARC on its own, per section 8). */}
        {isTodayMode && activeTriggers.length > 0 && (
          <View style={styles.activeTriggersBlock}>
            <Text style={styles.activeTriggersTitle}>הטריגרים שלי כרגע</Text>
            <View style={styles.activeTriggersRow}>
              {activeTriggers.map((trigger) => (
                <Pressable key={trigger.id} style={styles.activeTriggerChip} onPress={() => router.push({ pathname: "/arc-saving/activate", params: { triggerId: trigger.id } })}>
                  <Text style={styles.activeTriggerChipText}>{trigger.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {isTodayMode && (
          <View style={styles.settingsRow}>
            <Pressable style={styles.settingsLink} onPress={() => router.push("/settings")}>
              <Text style={styles.settingsLinkText}>⚙️ הגדרות</Text>
            </Pressable>
            <Pressable style={styles.settingsLink} onPress={() => router.push("/tasks/emotional-checkin-settings")}>
              <Text style={styles.settingsLinkText}>📱 הוסף כפתורי ARC למסך הטלפון</Text>
            </Pressable>
            {/*
             * ARCHI -- Unified Development Specification task, Part 10
             * ("MANIFEST COLLECTION & EXISTING-DATA RECOVERY"): the
             * root cause of "previously created Manifests not
             * visible" was a pure navigation gap -- app/purpose-
             * manifests/index.tsx (titled exactly "המניפסטים שלי"
             * already) has been fully wired and working this whole
             * time, simply unreachable from this screen since it
             * replaced the old home screen without carrying this link
             * forward. No storage change, no migration: every
             * historical PurposeManifest was already there.
             */}
            <Pressable style={styles.settingsLink} onPress={() => router.push("/purpose-manifests")}>
              <Text style={styles.settingsLinkText}>📜 מניפסט</Text>
            </Pressable>
            <Pressable style={styles.settingsLink} onPress={() => router.push("/insights")}>
              <Text style={styles.settingsLinkText}>📚 אוסף תובנות</Text>
            </Pressable>
            <Pressable style={styles.settingsLink} onPress={() => router.push("/positive-memories")}>
              <Text style={styles.settingsLinkText}>📖 אירועים חיוביים</Text>
            </Pressable>
            <Pressable style={styles.settingsLink} onPress={() => router.push("/arc-saving")}>
              <Text style={styles.settingsLinkText}>💾 ARC Saving</Text>
            </Pressable>
          </View>
        )}

        {/* ARC GYM task, section 1: a clearly visible entry card, additive
            to (never replacing) the daily timetable/check-in/Task LIVE/
            smiles/Manifest below and above it. */}
        {isTodayMode && (
          <Pressable style={styles.arcGymCard} onPress={() => router.push("/arc-gym")}>
            <Text style={styles.arcGymTitle}>🏋️ ARC GYM — חדר הכושר של ARC</Text>
            <Text style={styles.arcGymSubtitle}>תרגל את ההתנהגויות שאתה רוצה לפתח.</Text>
          </Pressable>
        )}

        {/* ARC Learning + ARC Creativity + Integrated Spaced Repetition
            task, section 1: a clearly visible, independent entry card --
            never nested under ARC GYM/ARC Goal -- additive to every
            other card on this screen. */}
        {isTodayMode && (
          <Pressable style={styles.arcLearningCard} onPress={() => router.push("/arc-learning")}>
            <Text style={styles.arcLearningTitle}>📚 ARC Learning — למידה</Text>
            <Text style={styles.arcLearningSubtitle}>תפוס תובנות, למד אותן, וחזק את הזיכרון שלך לאורך זמן.</Text>
          </Pressable>
        )}

        {isTodayMode && (
          <Pressable style={styles.arcCreativityCard} onPress={() => router.push("/arc-creativity")}>
            <Text style={styles.arcCreativityTitle}>💡 ARC Creativity — יצירתיות</Text>
            <Text style={styles.arcCreativitySubtitle}>מצא קשרים בין תובנות וגלה עקרונות חדשים.</Text>
          </Pressable>
        )}

        {/* Nine Functional Improvements task, Improvement 2: a clearly
            visible entry card, additive to (never replacing) the
            check-in/Daily Visualization/ARC GYM cards above and
            PersistentTaskControls below -- see handleStartTimePlanning's
            own doc for exactly which existing Task LIVE mechanisms this
            reuses. */}
        {isTodayMode && (
          <View style={styles.timePlanningCard}>
            <Text style={styles.timePlanningTitle}>⏱️ תכנון הזמן שלי</Text>
            <Text style={styles.timePlanningSubtitle}>התחל משימת תכנון עם טיימר, ותוכל להמשיך לתכנן את היום בזמן שהוא רץ.</Text>
            <View style={styles.timePlanningRow}>
              <Text style={styles.timePlanningLabel}>משך זמן לטיימר (בדקות):</Text>
              <TextInput
                style={styles.timePlanningInput}
                value={timePlanningDurationDraft}
                onChangeText={setTimePlanningDurationDraft}
                keyboardType="number-pad"
                placeholder={String(timePlanningTask?.expectedDurationMinutes ?? 15)}
              />
            </View>
            <View style={styles.timePlanningButtonRow}>
              <Pressable style={[styles.actionButton, startingTimePlanning && styles.buttonDisabled]} disabled={startingTimePlanning} onPress={handleStartTimePlanning}>
                <Text style={styles.actionButtonText}>{startingTimePlanning ? "פותח..." : "התחל תכנון"}</Text>
              </Pressable>
              {/* Smart To-Do List task, section 4: the one popup for editing
                  the To-Do list and today's scheduled tasks -- "no new
                  planning screen," so this opens from the SAME existing
                  time-planning card, right beside its own pre-existing
                  timer button, which stays exactly as it was. */}
              <Pressable style={styles.actionButton} onPress={() => setTimePlanningModalVisible(true)}>
                <Text style={styles.actionButtonText}>To-Do ותכנון היום</Text>
              </Pressable>
            </View>
          </View>
        )}

        <PersistentTaskControls />

        <View style={styles.modeRow}>
          <Pressable style={[styles.modeChip, mode.mode === "continuous" && styles.modeChipSelected]} onPress={() => handleSetDateMode({ mode: "continuous" })}>
            <Text style={[styles.modeChipText, mode.mode === "continuous" && styles.modeChipTextSelected]}>רצוף</Text>
          </Pressable>
          {WEEKLY_SPACED_GAP_PRESETS.map((gapMinutes) => {
            const selected = mode.mode === "spaced" && mode.gapMinutes === gapMinutes;
            return (
              <Pressable key={gapMinutes} style={[styles.modeChip, selected && styles.modeChipSelected]} onPress={() => handleSetDateMode({ mode: "spaced", gapMinutes })}>
                <Text style={[styles.modeChipText, selected && styles.modeChipTextSelected]}>{gapMinutes} דק&apos;</Text>
              </Pressable>
            );
          })}
          <TextInput
            style={styles.customGapInput}
            placeholder="מותאם"
            keyboardType="number-pad"
            value={customGapDraft}
            onChangeText={setCustomGapDraft}
            onBlur={() => {
              const value = Number(customGapDraft);
              if (Number.isFinite(value) && value > 0) handleSetDateMode({ mode: "spaced", gapMinutes: value });
            }}
          />
        </View>
        <Text style={styles.hint}>שינוי זה חל רק על התאריך הזה -- ההגדרה הקבועה ליום בשבוע לא משתנה.</Text>

        <View style={styles.actionRow}>
          <Pressable style={styles.actionButton} onPress={() => handleAddDirect("task")}>
            <Text style={styles.actionButtonText}>+ משימה</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={() => handleAddDirect("break")}>
            <Text style={styles.actionButtonText}>+ הפסקה</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={() => handleAddDirect("arc")}>
            <Text style={styles.actionButtonText}>+ ARC</Text>
          </Pressable>
        </View>

        {/* Unified ARC & Productivity Update task, requirement 9. */}
        {!selectingContinuousGroup ? (
          <Pressable style={styles.continuousGroupToggle} onPress={startSelectingContinuousGroup}>
            <Text style={styles.continuousGroupToggleText}>בחר משימות עוקבות לשגרה רצופה</Text>
          </Pressable>
        ) : (
          <View style={styles.continuousGroupBar}>
            <Text style={styles.continuousGroupBarHint}>
              {selectedTaskIds.length === 0 ? "בחר משימות עוקבות ברצימה אחת, ואז קבץ." : `נבחרו ${selectedTaskIds.length} משימות.`}
            </Text>
            <View style={styles.continuousGroupBarButtons}>
              <Pressable style={styles.secondaryButtonSmall} onPress={cancelSelectingContinuousGroup}>
                <Text style={styles.secondaryButtonSmallText}>ביטול</Text>
              </Pressable>
              <Pressable
                style={[styles.actionButton, selectedTaskIds.length < 2 && styles.buttonDisabled]}
                disabled={selectedTaskIds.length < 2}
                onPress={handleConfirmContinuousGroup}
              >
                <Text style={styles.actionButtonText}>קבץ כשגרה רצופה</Text>
              </Pressable>
            </View>
          </View>
        )}

        {scheduled.length === 0 && todoEntries.length === 0 && <Text style={styles.hint}>אין משימות מתוזמנות לתאריך הזה.</Text>}
        {wovenDaySections.map((item) => {
          if (item.kind === "todo") {
            const todoEntry = item.entry;
            const taskId = todoEntry.task.id;
            const isDragging = draggingTodoId === taskId;
            const dragResponder = createTodoDragResponder(taskId);
            return (
              <Animated.View
                key={`todo-${taskId}`}
                onLayout={(event) => rowLayoutsRef.current.set(taskId, { y: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height })}
                style={[
                  styles.entryCard,
                  styles.entryCardTodo,
                  isDragging && { transform: [{ translateY: dragTranslateY }], zIndex: 10, opacity: 0.9, elevation: 6 },
                ]}
              >
                <View {...dragResponder.panHandlers} style={styles.dragHandle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.dragHandleIcon}>⠿</Text>
                </View>
                <View style={styles.entryCardTodoBody}>
                  <Pressable style={styles.entryMain} onPress={() => handleStartTodo(todoEntry)}>
                    <View style={styles.entryHeaderRow}>
                      <Text style={styles.entryTitle}>{todoEntry.task.title}</Text>
                      <Text style={styles.badgeTodo}>To-Do</Text>
                    </View>
                    <Text style={styles.entryMeta}>
                      דחיפות {todoEntry.task.todoUrgency} · חשיבות {todoEntry.task.todoImportance}
                      {todoEntry.remainingMinutes !== null ? ` · ${todoEntry.remainingMinutes} דק'` : ""}
                    </Text>
                  </Pressable>
                  <View style={styles.entryActions}>
                    <Pressable style={styles.entryActionButton} onPress={() => handleStartTodo(todoEntry)}>
                      <Text style={styles.entryActionText}>התחל</Text>
                    </Pressable>
                    <Pressable style={styles.entryActionButton} onPress={() => setTimePlanningModalVisible(true)}>
                      <Text style={styles.entryActionText}>ערוך</Text>
                    </Pressable>
                  </View>
                </View>
              </Animated.View>
            );
          }
          const entry = item.entry;
          const position = scheduledIndexById.get(entry.task.id) ?? 0;
          const group = continuousGroups.find((candidate) => candidate.taskIds.includes(entry.task.id)) ?? null;
          const isSelected = selectedTaskIds.includes(entry.task.id);
          return (
            <View
              key={entry.task.id}
              onLayout={(event) => rowLayoutsRef.current.set(entry.task.id, { y: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height })}
              style={[styles.entryCard, entry.isCompletedToday && styles.entryCardCompleted, isSelected && styles.entryCardSelected]}
            >
              <Pressable
                style={styles.entryMain}
                onPress={() => (selectingContinuousGroup ? toggleTaskSelectedForGroup(entry.task.id) : handleStart(entry))}
              >
                <View style={styles.entryHeaderRow}>
                  {selectingContinuousGroup && <Text style={styles.selectionCheckbox}>{isSelected ? "☑" : "☐"}</Text>}
                  <Text style={styles.entryTitle}>{entry.task.title}</Text>
                  {entry.origin === "oneoff" && <Text style={styles.badgeAdded}>נוסף היום</Text>}
                  {entry.origin === "weekly" && entry.isModifiedForToday && <Text style={styles.badgeModified}>שונה היום</Text>}
                  {entry.origin === "weekly" && !entry.isModifiedForToday && <Text style={styles.badgeInherited}>מהשבועי</Text>}
                  {entry.hasConflict && <Text style={styles.badgeConflict}>התנגשות</Text>}
                  {group && <Text style={styles.badgeContinuous}>שגרה רצופה</Text>}
                  {entry.task.arcGymGoalId && (
                    <Text style={styles.badgeGoal}>🎯 {arcGymGoals.find((goal) => goal.id === entry.task.arcGymGoalId)?.title ?? "מטרת ARC"}</Text>
                  )}
                  {entry.task.linkedArcGymSituationId && <Text style={styles.badgeGoal}>🏋️ אימון ARC Gym</Text>}
                </View>
                {entry.effectiveStartTime && <Text style={styles.entryMeta}>{entry.effectiveStartTime}</Text>}
                {entry.expectedDurationMinutes !== null && <Text style={styles.entryMeta}>{entry.expectedDurationMinutes} דק&apos;</Text>}
              </Pressable>
              {!selectingContinuousGroup && (
                <View style={styles.entryActions}>
                  <Pressable style={styles.entryActionButton} onPress={() => handleEdit(entry)}>
                    <Text style={styles.entryActionText}>ערוך</Text>
                  </Pressable>
                  <Pressable style={styles.entryActionButton} onPress={() => confirmReplace(entry)}>
                    <Text style={styles.entryActionText}>החלף</Text>
                  </Pressable>
                  <Pressable style={styles.entryActionButton} onPress={() => confirmRemove(entry)}>
                    <Text style={styles.entryActionTextRemove}>הסר</Text>
                  </Pressable>
                  {group && (
                    <Pressable style={styles.entryActionButton} onPress={() => confirmUngroup(group)}>
                      <Text style={styles.entryActionTextRemove}>פרק קיבוץ</Text>
                    </Pressable>
                  )}
                  <Pressable disabled={position === 0} onPress={() => handleReorder(entry.task.id, "up")}>
                    <Text style={[styles.reorderArrow, position === 0 && styles.reorderArrowDisabled]}>▲</Text>
                  </Pressable>
                  <Pressable disabled={position === scheduled.length - 1} onPress={() => handleReorder(entry.task.id, "down")}>
                    <Text style={[styles.reorderArrow, position === scheduled.length - 1 && styles.reorderArrowDisabled]}>▼</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}

        <Pressable style={styles.secondaryButton} onPress={handleBackToWeek}>
          <Text style={styles.secondaryButtonText}>לשבוע הקבוע</Text>
        </Pressable>
      </ScrollView>

      <TimePlanningModal
        visible={timePlanningModalVisible}
        dateLocal={dateLocal}
        scheduled={scheduled}
        todoEntries={todoEntries}
        onClose={() => {
          setTimePlanningModalVisible(false);
          reload();
        }}
        onChanged={reload}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "700", textAlign: "right", marginBottom: 8 },
  hint: { color: "#777", textAlign: "right", marginVertical: 4, fontSize: 12 },
  checkInBlock: { backgroundColor: "#F5FAFD", borderRadius: 14, padding: 14, marginBottom: 14 },
  checkInQuestion: { fontSize: 16, fontWeight: "700", textAlign: "right", marginBottom: 10 },
  checkInRow: { flexDirection: "row-reverse", justifyContent: "space-between", gap: 8 },
  urgeRow: { flexDirection: "row-reverse", marginTop: 8 },
  checkInButton: { flex: 1, alignItems: "center", backgroundColor: "#fff", borderRadius: 12, paddingVertical: 12, borderWidth: 1, borderColor: "#dbe8ef" },
  checkInEmoji: { fontSize: 28 },
  checkInLabel: { fontSize: 12, color: "#444", marginTop: 4, fontWeight: "600" },
  arcGymCard: { backgroundColor: "#0a7ea4", borderRadius: 14, padding: 16, marginBottom: 14 },
  arcGymTitle: { color: "#fff", fontSize: 16, fontWeight: "700", textAlign: "right" },
  arcGymSubtitle: { color: "#dff2fb", fontSize: 13, textAlign: "right", marginTop: 4 },
  arcLearningCard: { backgroundColor: "#2E7D32", borderRadius: 14, padding: 16, marginBottom: 14 },
  arcLearningTitle: { color: "#fff", fontSize: 16, fontWeight: "700", textAlign: "right" },
  arcLearningSubtitle: { color: "#DDF2DF", fontSize: 13, textAlign: "right", marginTop: 4 },
  arcCreativityCard: { backgroundColor: "#6A1B9A", borderRadius: 14, padding: 16, marginBottom: 14 },
  arcCreativityTitle: { color: "#fff", fontSize: 16, fontWeight: "700", textAlign: "right" },
  arcCreativitySubtitle: { color: "#EAD9F2", fontSize: 13, textAlign: "right", marginTop: 4 },
  overlayToggleButton: { backgroundColor: "#546E7A", borderRadius: 14, padding: 14, marginBottom: 14, alignItems: "center" },
  overlayToggleButtonActive: { backgroundColor: "#37474F" },
  overlayToggleButtonText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  dailyVisualizationCard: { backgroundColor: "#2e7d4f", borderRadius: 14, padding: 16, marginBottom: 14 },
  dailyVisualizationTitle: { color: "#fff", fontSize: 16, fontWeight: "700", textAlign: "right" },
  dailyVisualizationSubtitle: { color: "#dcf3e4", fontSize: 13, textAlign: "right", marginTop: 4 },
  timePlanningCard: { backgroundColor: "#F5FAFD", borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: "#dbe8ef" },
  timePlanningTitle: { fontSize: 16, fontWeight: "700", textAlign: "right" },
  timePlanningSubtitle: { color: "#555", fontSize: 13, textAlign: "right", marginTop: 4 },
  timePlanningRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginTop: 10 },
  timePlanningLabel: { fontSize: 13, color: "#444" },
  timePlanningButtonRow: { flexDirection: "row-reverse", gap: 8, marginTop: 10 },
  timePlanningInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, fontSize: 13, width: 60, textAlign: "center" },
  buttonDisabled: { opacity: 0.6 },
  morningAlarmLink: { alignItems: "flex-end", marginBottom: 14 },
  morningAlarmLinkText: { color: "#0a7ea4", fontSize: 13, fontWeight: "600" },
  settingsRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  settingsLink: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  settingsLinkText: { color: "#0a7ea4", fontSize: 13, fontWeight: "600" },
  /*
   * ARC Saving, Trigger Management & Quick-Action Buttons task, section
   * 7: the ONE shared solid-green quick-action look -- same background/
   * radius/height/typography/spacing for all four buttons, on all three
   * surfaces (Home here; the cube's OverlayService.kt and the widget's
   * own XML drawable use the SAME #2E7D32 hex, never a different shade).
   * flexWrap lets the row reflow to two lines on a narrow/small screen
   * (section 29) instead of clipping or horizontally scrolling.
   */
  quickActionsRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  quickActionButton: { backgroundColor: "#2E7D32", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, minWidth: 80, alignItems: "center" },
  quickActionButtonText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  activeTriggersBlock: { marginBottom: 14 },
  activeTriggersTitle: { fontSize: 13, fontWeight: "700", color: "#444", textAlign: "right", marginBottom: 6 },
  activeTriggersRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8 },
  activeTriggerChip: { backgroundColor: "#eef7f0", borderWidth: 1, borderColor: "#2E7D32", borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  activeTriggerChipText: { color: "#2E7D32", fontSize: 12, fontWeight: "700" },
  modeRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginTop: 8 },
  modeChip: { backgroundColor: "#F0F0F0", borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 },
  modeChipSelected: { backgroundColor: "#0a7ea4" },
  modeChipText: { fontSize: 12, color: "#444" },
  modeChipTextSelected: { color: "#fff" },
  customGapInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, fontSize: 12, width: 60, textAlign: "center" },
  actionRow: { flexDirection: "row-reverse", gap: 8, marginVertical: 8 },
  actionButton: { flex: 1, backgroundColor: "#0a7ea4", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  actionButtonText: { color: "#fff", fontWeight: "600" },
  entryCard: { backgroundColor: "#F5FAFD", borderRadius: 10, padding: 12, marginTop: 10 },
  entryCardCompleted: { opacity: 0.55 },
  entryMain: {},
  entryHeaderRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
  entryTitle: { fontSize: 16, fontWeight: "600", textAlign: "right" },
  entryMeta: { fontSize: 13, color: "#555", textAlign: "right" },
  badgeInherited: { fontSize: 11, color: "#0a7ea4", borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  badgeModified: { fontSize: 11, color: "#a06a00", borderWidth: 1, borderColor: "#a06a00", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  badgeAdded: { fontSize: 11, color: "#1a7a3a", borderWidth: 1, borderColor: "#1a7a3a", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  entryCardTodo: { borderWidth: 1, borderColor: "#d8c7ea", backgroundColor: "#FAF7FD", flexDirection: "row-reverse", alignItems: "flex-start", gap: 8 },
  entryCardTodoBody: { flex: 1 },
  dragHandle: { paddingTop: 2, paddingHorizontal: 2 },
  dragHandleIcon: { fontSize: 18, color: "#9b7fb8" },
  badgeTodo: { fontSize: 11, color: "#6b3fa0", borderWidth: 1, borderColor: "#6b3fa0", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  badgeConflict: { fontSize: 11, color: "#fff", backgroundColor: "#b00020", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  // Unified ARC & Productivity Update task, requirement 9.
  badgeContinuous: { fontSize: 11, color: "#fff", backgroundColor: "#0a7ea4", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  badgeGoal: { fontSize: 11, color: "#fff", backgroundColor: "#C2410C", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  continuousGroupToggle: { alignItems: "center", paddingVertical: 8, marginTop: 4 },
  continuousGroupToggleText: { color: "#0a7ea4", fontSize: 13, fontWeight: "600" },
  continuousGroupBar: { backgroundColor: "#F5FAFD", borderRadius: 10, padding: 10, marginTop: 4, gap: 8 },
  continuousGroupBarHint: { fontSize: 13, color: "#444", textAlign: "right" },
  continuousGroupBarButtons: { flexDirection: "row-reverse", gap: 8 },
  secondaryButtonSmall: { borderWidth: 1, borderColor: "#999", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, alignItems: "center" },
  secondaryButtonSmallText: { color: "#555", fontWeight: "600" },
  entryCardSelected: { borderWidth: 2, borderColor: "#0a7ea4" },
  selectionCheckbox: { fontSize: 18, color: "#0a7ea4" },
  entryActions: { flexDirection: "row-reverse", gap: 16, marginTop: 8 },
  entryActionButton: { paddingVertical: 4 },
  entryActionText: { color: "#0a7ea4", fontSize: 13 },
  entryActionTextRemove: { color: "#b00020", fontSize: 13 },
  reorderArrow: { fontSize: 15, color: "#0a7ea4", paddingVertical: 2 },
  reorderArrowDisabled: { color: "#ccc" },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", borderRadius: 10, paddingVertical: 10, alignItems: "center", marginTop: 20 },
  secondaryButtonText: { color: "#0a7ea4", fontWeight: "600" },
});
