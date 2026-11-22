/**
 * data/emotionalCheckInRouting.ts
 *
 * Unified Emotional Check-In and Task Postponement System: the ONE
 * shared navigation layer behind all three required entry points --
 * ARCHI Home's own "איך אתה מרגיש כרגע?" bar (build/FlexibleDailyScreen.tsx),
 * the Android Home Screen Widget's three buttons (app/check-in.tsx,
 * opened by the widget's own PendingIntents), and the Postponement
 * intervention screen's own "❤️ מצב רגשי" two-smiley sub-choice
 * (live/PostponementEmotionalScreen.tsx). All three ask the exact same
 * question -- "😟 Full ARC / 🙂 Shortened ARC / 😄 Next Task" -- so the
 * DECISION of where that goes lives here once, never re-implemented
 * per screen.
 *
 * Every function here only ever reuses an EXISTING route/engine:
 * - Full ARC is the existing `/tasks/[id]/arc?spontaneous=1` flow
 *   (arc/newArcLiveTypes.ts's "spontaneous" mode), exactly what
 *   live/SpontaneousArcEntryScreen.tsx's own "standalone" button
 *   already opens.
 * - Shortened ARC is the SAME route with `shortened=1` instead
 *   (arc/newArcLiveTypes.ts's new "shortened" mode) -- same screen,
 *   same resume/conflict handling, same "prevent duplicate ARC
 *   sessions" guarantee (NewArcLiveScreen.tsx's own reload()), never a
 *   second ARC implementation.
 * - "Next Task" reuses arc/tasks.ts's findActiveTask and
 *   arc/dailyPlan.ts's resolveDailyPlan/applyScheduleMode/
 *   resolveCurrentTaskState -- the exact same Flexible Daily
 *   Timetable resolution build/FlexibleDailyScreen.tsx's own reload()
 *   already performs, never a second, parallel "what's next" engine.
 *
 * Linking Full/Shortened ARC to an already-ACTIVE task (never a fresh
 * standalone session while one exists) is what "preserve the existing
 * active task" means here -- opening `/tasks/[id]/arc` for a task whose
 * timer is currently running is already the pre-existing, well-tested
 * "צריך ARC" entry point (available while a task timer runs), so its
 * pause/resume/return-to-task behavior needs no new code at all.
 */

import { router } from "expo-router";

import { findActiveTask } from "../arc/tasks.ts";
import { STANDALONE_ARC_TASK_ID } from "../arc/newArcLiveTypes.ts";
import type { ArcGymCheckInChoice } from "../arc/arcGym.ts";
import type { ArcFocusMoodChoice } from "../arc/arcFocusSession.ts";
import { hasLinkedArcResult } from "../arc/arcResult.ts";
import { applyScheduleMode, resolveCurrentTaskState, resolveDailyPlan } from "../arc/dailyPlan.ts";
import { resolveEffectiveScheduleMode } from "../arc/weeklyScheduleMode.ts";
import { parseCalendarDate, todayLocalDateString } from "../program/dateUtils.ts";
import { loadArcResultExercises, loadDailyScheduleModeOverrides, loadTaskOccurrenceCompletions, loadTaskOccurrenceOverrides, loadTasks, loadWeeklyScheduleModeSettings } from "./storage.ts";

// ARCHI -- Two Additions to the Existing Floating Cube task, addition
// 2: "urge" is a fourth, independent choice -- reuses this exact same
// shared dispatcher/deep-link mechanism (archi://check-in?choice=urge)
// rather than inventing a second decision layer, but is never part of
// the original 3-way "how do you feel" question; its own two UI call
// sites (the Home screen's own "דחף" button, the floating cube's own
// expanded panel) invoke it directly, independent of whichever of the
// three mood buttons (if any) the trainee also sees.
export type EmotionalCheckInChoice = "full_arc" | "shortened_arc" | "next_task" | "urge";

/**
 * Android Home Screen Widget / "Widget navigation when ARCHI is
 * closed" requirement: app/check-in.tsx (the ONE route the widget's
 * PendingIntents deep-link into, archi://check-in?choice=...) passes
 * `{ replace: true }` so its own stub screen is immediately replaced,
 * never left sitting in the navigation history as an extra back-stop
 * -- "navigate to that screen without duplicating navigation history."
 * Every other caller (the Home check-in bar, the Postponement screen's
 * own emotional sub-choice) omits it and gets the ordinary `router.push`
 * every other navigation in this app already uses, so the trainee can
 * still press back to where they actually came from.
 */
interface NavigateOptions {
  replace?: boolean;
  /**
   * ARC GYM task: set only by ArcGymTrainingScreen's own check-in
   * (never by Home/widget/Postponement) -- forces openFullArc/
   * openShortenedArc to the SAME standalone (no real task) convention
   * every other no-task ARC session already uses, regardless of
   * whether some UNRELATED task happens to be active right now, and
   * threads the id through to /tasks/[id]/arc so the session carries
   * it from creation (see live/NewArcLiveScreen.tsx's own reload()).
   */
  arcGymSituationId?: string;
  /**
   * Morning Flow Simplification task, section 1: set only by
   * live/DailyStartupSequenceOverlay.tsx's own "checkin" step -- a
   * pure NAVIGATION hint, never persisted on the ARC session itself
   * (unlike arcGymSituationId above, which the engine actually needs
   * to render Encoding content). Threaded through to /tasks/[id]/arc
   * so live/NewArcLiveScreen.tsx's own returnToTask() knows to come
   * back to Home ("/") -- where the overlay, still mounted, resumes
   * the rest of the morning sequence -- instead of its ordinary
   * standalone/task destination.
   */
  morningFlowCheckIn?: boolean;
  /**
   * ARC Focus task: set only by handleArcFocusCheckInChoice below -- a
   * sibling param threaded straight through to /tasks/[id]/arc,
   * persisted on the ARC session itself (its own arcFocusPracticeId field)
   * so live/NewArcLiveScreen.tsx's own returnToTask() can find and
   * resume the SAME planned ArcFocusSession once this ARC finishes.
   * UNLIKE arcGymSituationId above, this never forces `id` to the
   * standalone sentinel -- the caller (handleArcFocusCheckInChoice) has
   * already resolved the correct real-or-standalone taskId itself,
   * since an ARC Focus session can be linked to a real scheduled Task.
   */
  arcFocusPracticeId?: string;
  /**
   * ARC Gym + ARC Goal Integration task: set only by
   * handleArcGymMemoryCheckInChoice below (never by Home/widget/
   * Postponement) -- the ARC Memory equivalent of arcGymSituationId
   * above: forces openFullArc/openShortenedArc to the SAME standalone
   * convention, and threads the id through to /tasks/[id]/arc so the
   * session carries it from creation (see live/NewArcLiveScreen.tsx's
   * own reload()/returnToTask()).
   */
  arcGymMemoryExerciseId?: string;
  /**
   * ARC Perspective task: references the arc/arcPerspective.ts
   * ArcPerspectiveSession this ARC run is the preliminary (😟/🙂) mood
   * check-in step for. A sibling param threaded straight through to
   * /tasks/[id]/arc, persisted on the ARC session itself (its own
   * arcPerspectiveId field) so live/NewArcLiveScreen.tsx's own
   * returnToTask() can find and resume the SAME in-progress
   * ArcPerspectiveSession once this ARC finishes. UNLIKE
   * arcGymSituationId/arcGymMemoryExerciseId above, this never forces
   * `id` to the standalone sentinel -- the caller
   * (handleArcPerspectiveCheckInChoice below) has already resolved the
   * correct real-or-standalone taskId itself, since a real-time
   * practice must keep linking to whichever task was already active.
   */
  arcPerspectiveId?: string;
  /**
   * ARC Saving task: references the arc/arcSaving.ts ArcSavedBodyOption
   * this ARC run should pre-fill from, OR the ArcSavedExercise for a
   * standalone "תרגל שוב" (exactly one of the two is ever set). A
   * sibling param threaded straight through to /tasks/[id]/arc,
   * persisted on the ARC session itself (arcSavingBodyOptionId) so
   * arc/newArcLiveSteps.ts's own isStepReachable can skip the body-
   * region-selection steps. UNLIKE arcGymSituationId/arcGymMemoryExerciseId
   * above, this never forces `id` to the standalone sentinel -- the
   * caller (handleArcSavingCheckInChoice below) has already resolved the
   * correct real-or-standalone taskId itself, since a trigger can be
   * activated mid-task without disturbing it.
   */
  arcSavingBodyOptionId?: string;
  arcSavingExerciseId?: string;
  /** ARC Saving task, spec section 6's own "בחירת אזורי גוף מחדש" path: set only when picking body regions fresh for an already-known trigger (never pre-fills anything -- see arc/newArcLiveTypes.ts's own doc). Mutually exclusive with the two fields above. */
  arcSavingTriggerIdForNewOption?: string;
}

function navigateTo(target: Parameters<typeof router.push>[0], options: NavigateOptions): void {
  if (options.replace) {
    router.replace(target);
    return;
  }
  router.push(target);
}

/**
 * "If a task is already active, link the ARC session to it; otherwise
 * run it standalone (the existing emotion-only completion path, never
 * inventing a task)." The one shared resolution both openFullArc's and
 * openShortenedArc's own default callers (the Home bar, the widget)
 * use when they don't already know a specific taskId -- the
 * Postponement screen's own emotional sub-choice always passes its
 * OWN real taskId directly instead, since that task is already known
 * and must stay the one ARC returns to.
 */
export async function resolveHomeCheckInTaskId(): Promise<string> {
  const tasks = await loadTasks();
  return findActiveTask(tasks)?.id ?? STANDALONE_ARC_TASK_ID;
}

/** Full ARC == the existing Full Spontaneous ARC LIVE flow -- never a second engine. `taskId: null` means "resolve the active task, or run standalone" (Home/widget); a real id is used verbatim (Postponement, which already knows the exact task to return to). `options.arcGymSituationId` (ArcGymTrainingScreen only) overrides both: always standalone, with the situation id threaded through. */
export async function openFullArc(taskId: string | null, options: NavigateOptions = {}): Promise<void> {
  const id = options.arcGymSituationId || options.arcGymMemoryExerciseId ? STANDALONE_ARC_TASK_ID : taskId ?? (await resolveHomeCheckInTaskId());
  const params: Record<string, string> = { id, spontaneous: "1" };
  if (options.arcGymSituationId) params.arcGymSituationId = options.arcGymSituationId;
  if (options.arcGymMemoryExerciseId) params.arcGymMemoryExerciseId = options.arcGymMemoryExerciseId;
  if (options.arcFocusPracticeId) params.arcFocusPracticeId = options.arcFocusPracticeId;
  if (options.arcPerspectiveId) params.arcPerspectiveId = options.arcPerspectiveId;
  if (options.arcSavingBodyOptionId) params.arcSavingBodyOptionId = options.arcSavingBodyOptionId;
  if (options.arcSavingExerciseId) params.arcSavingExerciseId = options.arcSavingExerciseId;
  if (options.arcSavingTriggerIdForNewOption) params.arcSavingTriggerIdForNewOption = options.arcSavingTriggerIdForNewOption;
  if (options.morningFlowCheckIn) params.morningFlowCheckIn = "1";
  navigateTo({ pathname: "/tasks/[id]/arc", params }, options);
}

/** Shortened ARC == the SAME ARC LIVE screen/engine, "shortened" invocation mode -- never a manually-created Mini ARC, never a second engine. Same `taskId`/`options.arcGymSituationId`/`options.morningFlowCheckIn` contract as openFullArc above. */
export async function openShortenedArc(taskId: string | null, options: NavigateOptions = {}): Promise<void> {
  const id = options.arcGymSituationId || options.arcGymMemoryExerciseId ? STANDALONE_ARC_TASK_ID : taskId ?? (await resolveHomeCheckInTaskId());
  const params: Record<string, string> = { id, shortened: "1" };
  if (options.arcGymSituationId) params.arcGymSituationId = options.arcGymSituationId;
  if (options.arcGymMemoryExerciseId) params.arcGymMemoryExerciseId = options.arcGymMemoryExerciseId;
  if (options.arcFocusPracticeId) params.arcFocusPracticeId = options.arcFocusPracticeId;
  if (options.arcPerspectiveId) params.arcPerspectiveId = options.arcPerspectiveId;
  if (options.arcSavingBodyOptionId) params.arcSavingBodyOptionId = options.arcSavingBodyOptionId;
  if (options.arcSavingExerciseId) params.arcSavingExerciseId = options.arcSavingExerciseId;
  if (options.arcSavingTriggerIdForNewOption) params.arcSavingTriggerIdForNewOption = options.arcSavingTriggerIdForNewOption;
  if (options.morningFlowCheckIn) params.morningFlowCheckIn = "1";
  navigateTo({ pathname: "/tasks/[id]/arc", params }, options);
}

/**
 * ARCHI -- Unified Final Specification task, section 1 (combined
 * "מחשבה / דחף" shortcut -- supersedes the earlier single-urge-only
 * shortcut this function implemented; the function/choice names below
 * are kept as internal plumbing, unrenamed, since they're never shown
 * to the trainee -- only the visible button label changed): the SAME
 * Full ARC route as openFullArc above (`spontaneous=1`, so it is a
 * fresh, ad-hoc Full ARC session, never a planned draft or a second
 * engine), with exactly one extra param -- `skipEmotionSelection=1` --
 * that live/NewArcLiveScreen.tsx threads into the session-creation
 * engine's own skipEmotionSelection argument. That's what actually
 * skips the emotion screen; "מה מופיע אצלי עכשיו?" (cognitive_selector)
 * stays fully reachable and interactive, letting the trainee check
 * any combination of מחשבה/פרשנות/דחף themselves -- never preselected.
 * This function itself makes no routing decision beyond "which URL."
 * Same `taskId`/`options` contract as openFullArc/openShortenedArc --
 * available regardless of whether a task is active, paused, or not
 * started, exactly like them.
 */
export async function openUrgeArc(taskId: string | null, options: NavigateOptions = {}): Promise<void> {
  const id = options.arcGymSituationId ? STANDALONE_ARC_TASK_ID : taskId ?? (await resolveHomeCheckInTaskId());
  const params: Record<string, string> = { id, spontaneous: "1", skipEmotionSelection: "1" };
  if (options.arcGymSituationId) params.arcGymSituationId = options.arcGymSituationId;
  if (options.morningFlowCheckIn) params.morningFlowCheckIn = "1";
  navigateTo({ pathname: "/tasks/[id]/arc", params }, options);
}

/**
 * ARCHI -- ARC Result: Automatic, Optional Suggestion Without Extra
 * Shortcuts task, section 4: the one shared check resolveAndOpenNextTask
 * runs, for either of its own two real-task destinations, before
 * actually navigating to it -- never a second, independently-filtered
 * lookup. `options.replace` is the only NavigateOptions field forwarded
 * (the other two -- arcGymSituationId/morningFlowCheckIn -- are never
 * set by a caller of resolveAndOpenNextTask, which always resolves its
 * own target fresh), so the suggestion screen (when shown) still obeys
 * whichever navigation history behavior the caller asked for.
 */
async function navigateToTaskOrArcResultSuggestion(taskId: string, options: NavigateOptions): Promise<void> {
  const exercises = await loadArcResultExercises();
  if (hasLinkedArcResult(exercises, taskId)) {
    navigateTo({ pathname: "/arc-result-suggestion", params: { taskId } }, options);
    return;
  }
  navigateTo({ pathname: "/tasks/[id]", params: { id: taskId } }, options);
}

/**
 * "😄 מעולה -- Next Task": an already-active task's own Task LIVE screen
 * if one exists; otherwise today's EFFECTIVE Flexible Daily Timetable's
 * own current-or-nearest-next entry (never auto-started -- no
 * `autoStart` param, exactly the spec's own "open the task without
 * automatically starting its timer"); otherwise today's planning
 * screen (Home itself, which already shows the Flexible Daily
 * Timetable above/below the check-in bar).
 *
 * Weekly/Flexible-Daily/ARC-LIVE task-sync fix: reads through
 * arc/dailyPlan.ts's own resolveCurrentTaskState -- the one central
 * current/next decision every relevant consumer shares -- so this can
 * never propose a task whose own scheduled window has already passed
 * (e.g. an overnight "go to sleep" task still sitting first in the
 * day's own chronological order).
 */
export async function resolveAndOpenNextTask(options: NavigateOptions = {}): Promise<void> {
  const tasks = await loadTasks();
  const active = findActiveTask(tasks);
  if (active) {
    await navigateToTaskOrArcResultSuggestion(active.id, options);
    return;
  }

  const [overrides, completions, weekdaySettings, dateModeOverrides] = await Promise.all([
    loadTaskOccurrenceOverrides(),
    loadTaskOccurrenceCompletions(),
    loadWeeklyScheduleModeSettings(),
    loadDailyScheduleModeOverrides(),
  ]);
  const dateLocal = todayLocalDateString(new Date());
  const { year, month, day } = parseCalendarDate(dateLocal);
  const dateObj = new Date(year, month - 1, day);
  const weekday = dateObj.getDay();
  const effectiveMode = resolveEffectiveScheduleMode(weekday, dateLocal, weekdaySettings, dateModeOverrides);
  const plan = resolveDailyPlan(tasks, overrides, completions, dateLocal, dateObj);
  const scheduled = applyScheduleMode(plan, effectiveMode);
  const { current, next } = resolveCurrentTaskState(scheduled, new Date(), null, null);
  const target = current ?? next;

  if (target) {
    await navigateToTaskOrArcResultSuggestion(target.task.id, options);
    return;
  }

  navigateTo("/", options);
}

/**
 * The one shared dispatcher every check-in UI (Home, widget,
 * Postponement, and the unified floating panel -- ARCHI -- Unified
 * Floating Overlay & Mini ARC Improvements task) can call with the
 * trainee's raw choice -- `taskId` is null for Home/widget/the overlay
 * (resolved per openFullArc/openShortenedArc's own shared contract
 * above), or a real id for the Postponement screen. "next_task"
 * ignores `taskId` entirely -- it always resolves its own target
 * fresh.
 *
 * ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks
 * task: "full_arc" opens Full ARC ("פחות טוב") directly again, exactly
 * as it did before the Mini-vs-Full-ARC choice screen ever existed --
 * that screen's own "which depth" question no longer maps onto
 * anything now that depth is decided automatically by the new time
 * rating (see arc/newArcLiveSteps.ts's own confirmActionReadinessCheck),
 * so there is nothing left for a manual choice to usefully do.
 */
export async function handleEmotionalCheckInChoice(choice: EmotionalCheckInChoice, taskId: string | null = null, options: NavigateOptions = {}): Promise<void> {
  if (choice === "full_arc") return openFullArc(taskId, options);
  if (choice === "shortened_arc") return openShortenedArc(taskId, options);
  // ARCHI -- Two Additions to the Existing Floating Cube task.
  if (choice === "urge") return openUrgeArc(taskId, options);
  return resolveAndOpenNextTask(options);
}

/**
 * ARC GYM task, section 6: the SAME check-in, but its third choice
 * means "Personalized Action Visualization Only" -- never "Next Task"
 * (that meaning is specific to Home/the widget). Still routes
 * Full/Shortened ARC through the EXACT same openFullArc/openShortenedArc
 * this module already exposes -- "uses the existing adaptive ARC
 * routing system" -- only the third branch differs, and even that
 * opens a real route rather than inventing a second decision layer.
 */
export async function handleArcGymCheckInChoice(choice: ArcGymCheckInChoice, situationId: string): Promise<void> {
  if (choice === "full_arc") return openFullArc(null, { arcGymSituationId: situationId });
  if (choice === "shortened_arc") return openShortenedArc(null, { arcGymSituationId: situationId });
  router.push({ pathname: "/arc-gym/visualize-only/[id]", params: { id: situationId } });
}

/**
 * ARC Gym + ARC Goal Integration task: the emotional check-in the
 * user's own spec inserted into ARC Memory's flow, between its
 * trigger/noticing steps and its action step -- mirrors
 * handleArcGymCheckInChoice above 1:1 (😟/🙂 route through the EXACT
 * same openFullArc/openShortenedArc, now carrying arcGymMemoryExerciseId
 * instead of arcGymSituationId). 😄 never leaves the Memory screen at
 * all -- it just advances in place to the action step -- so there is no
 * third branch here; live/ArcGymMemoryVisualizationScreen.tsx calls
 * this only for the 😟/🙂 choices.
 */
export async function handleArcGymMemoryCheckInChoice(choice: "full_arc" | "shortened_arc", exerciseId: string): Promise<void> {
  if (choice === "full_arc") return openFullArc(null, { arcGymMemoryExerciseId: exerciseId });
  return openShortenedArc(null, { arcGymMemoryExerciseId: exerciseId });
}

/**
 * ARC Focus task: the same three-emoji check-in (😟 פחות טוב / 🙂 סבבה /
 * 😄 מעולה), but 😄 means "start ARC Focus directly" (no preliminary ARC
 * at all), never "Next Task" (that meaning is Home/widget-specific) and
 * never ARC GYM's own "visualization only". `returnToTaskId` is the
 * real scheduled Task this practice is linked to, or null for a
 * standalone/quick-start practice opened directly from ARC GYM --
 * resolved to the standalone sentinel here, ONCE, so openFullArc/
 * openShortenedArc below always receive a real, non-null taskId and so
 * never fall back to resolveHomeCheckInTaskId()'s own "whatever task
 * happens to be active right now" resolution, which would be wrong for
 * a practice that isn't linked to any task at all.
 */
export async function handleArcFocusCheckInChoice(choice: ArcFocusMoodChoice, options: { arcFocusPracticeId: string; returnToTaskId: string | null }): Promise<void> {
  const taskId = options.returnToTaskId ?? STANDALONE_ARC_TASK_ID;
  if (choice === "full_arc") return openFullArc(taskId, { arcFocusPracticeId: options.arcFocusPracticeId });
  if (choice === "shortened_arc") return openShortenedArc(taskId, { arcFocusPracticeId: options.arcFocusPracticeId });
  router.replace({ pathname: "/tasks/[id]/arc-focus", params: { id: taskId, arcFocusPracticeId: options.arcFocusPracticeId } });
}

/**
 * ARC Perspective task: the check-in step inserted between ARC
 * Perspective's own "event" step and its "perspective_shift" step --
 * only ever called for 😟/🙂 (😄 "מעולה" never leaves the flow screen at
 * all, same precedent as ARC Memory's own check-in). `options.taskId`
 * is ALWAYS already resolved by the caller (build/ArcPerspectiveFlowScreen.tsx)
 * to either the standalone sentinel (planned/ARC Gym mode) or the
 * session's own captured activeTaskId-or-sentinel (real_time mode, so
 * the active task's own timer/context is preserved) -- this function
 * never re-resolves or overrides it, unlike openFullArc/openShortenedArc's
 * own default `taskId ?? resolveHomeCheckInTaskId()` fallback, which
 * would be wrong here (a null here must never silently resolve to
 * "whichever task happens to be active right now" -- that resolution,
 * when wanted, already happened one level up).
 */
export async function handleArcPerspectiveCheckInChoice(choice: "full_arc" | "shortened_arc", options: { arcPerspectiveId: string; taskId: string }): Promise<void> {
  if (choice === "full_arc") return openFullArc(options.taskId, { arcPerspectiveId: options.arcPerspectiveId });
  return openShortenedArc(options.taskId, { arcPerspectiveId: options.arcPerspectiveId });
}

/**
 * ARC Saving task: the mood-check-in → ARC round-trip for a trigger-
 * driven (or standalone saved-exercise) ARC Saving activation. Exactly
 * one of `arcSavingBodyOptionId`/`arcSavingExerciseId` is ever set by
 * the caller (build/ArcSavingActivateScreen.tsx) -- never both, never
 * neither. `options.taskId` is ALWAYS already resolved by that caller to
 * either the standalone sentinel or the trainee's own real active task
 * (never forced), same contract as handleArcPerspectiveCheckInChoice
 * above, so a trigger activated mid-task never disturbs that task's own
 * timer/context.
 */
export async function handleArcSavingCheckInChoice(
  choice: "full_arc" | "shortened_arc",
  options: { arcSavingBodyOptionId: string | null; arcSavingExerciseId: string | null; arcSavingTriggerIdForNewOption: string | null; taskId: string }
): Promise<void> {
  const navOptions: NavigateOptions = {};
  if (options.arcSavingBodyOptionId) navOptions.arcSavingBodyOptionId = options.arcSavingBodyOptionId;
  if (options.arcSavingExerciseId) navOptions.arcSavingExerciseId = options.arcSavingExerciseId;
  if (options.arcSavingTriggerIdForNewOption) navOptions.arcSavingTriggerIdForNewOption = options.arcSavingTriggerIdForNewOption;
  if (choice === "full_arc") return openFullArc(options.taskId, navOptions);
  return openShortenedArc(options.taskId, navOptions);
}
