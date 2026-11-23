import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, usePathname } from "expo-router";

import { PSYCHOLOGY_FACTS, resolveNextPsychologyFactIndex } from "../arc/psychologyFacts.ts";
import type { PsychologyFact } from "../arc/psychologyFacts.ts";
import { isTaskTimerRunStale } from "../arc/taskTimer.ts";
import { isNewArcLiveSessionStale } from "../arc/newArcLiveTypes.ts";
import { isDailyScheduleSuitable } from "../arc/dailyPlan.ts";
import type { ScheduledPlanEntry } from "../arc/dailyPlan.ts";
import { createEmptyTask, generateTaskId } from "../arc/tasks.ts";
import { buildTaskFromDraft, createEmptyTaskDraft, validateTaskDraft } from "../arc/taskDraft.ts";
import type { TaskDraft } from "../arc/taskDraft.ts";
import {
  loadMorningAlarmConfig,
  loadMorningFlowCheckInState,
  loadNewArcLiveSession,
  loadPsychologyFactProgress,
  loadShowHomeInsightButtonSetting,
  loadTaskTimerRun,
  saveMorningAlarmConfig,
  saveMorningFlowCheckInState,
  savePsychologyFactProgress,
  upsertTask,
} from "../data/storage.ts";
import type { MorningAlarmConfig } from "../data/storage.ts";
import { syncMorningAlarm } from "../data/morningAlarm.ts";
import { resolveStartupManifestSelection, type ResolvedDailyManifest } from "../data/purposeManifest.ts";
import { isDailyVisualizationNeededNow } from "../data/dailyVisualization.ts";
import { resolveTodaysScheduledPlan } from "../data/dailyPlan.ts";
import { scheduleTaskAlarm } from "../data/taskAlarm.ts";
import { handleEmotionalCheckInChoice } from "../data/emotionalCheckInRouting.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";
import ManifestVisualizationCard from "./ManifestVisualizationCard.tsx";
import { FeelingCube, TaskCube } from "./components/HomeCubes.tsx";
import AddInfoMenu from "./components/AddInfoMenu.tsx";

/**
 * Critical-bug task ("Startup Popups Still Not Working After Modal
 * Fix") -- debugging requirement 5: temporary, __DEV__-gated tracing at
 * every step of the startup state machine, so `adb logcat` (or the
 * Metro/dev-client log console) on a real device shows EXACTLY where
 * the sequence stops if it ever silently fails again. Never runs in a
 * production/release build's actual behavior (only its console output
 * -- __DEV__ is false there), and never affects any return value.
 */
function logStartupStep(message: string, data?: unknown): void {
  if (!__DEV__) return;
  if (data !== undefined) console.log(`[DailyStartupSequenceOverlay] ${message}`, data);
  else console.log(`[DailyStartupSequenceOverlay] ${message}`);
}

type Step = "checking" | "none" | "alarmOffer" | "checkin" | "fact" | "manifest" | "planning" | "done";

/** Nine Functional Improvements task, Improvement 9: same day-of-week numbering (0=Sunday..6=Saturday) as everywhere else in this app -- same label precedent as build/TaskEditorScreen.tsx's own RECURRENCE_DAY_LABELS, duplicated here since this is a self-contained Modal, never imported across screens. */
const ALARM_OFFER_DAY_LABELS = ["יום א׳", "יום ב׳", "יום ג׳", "יום ד׳", "יום ה׳", "יום ו׳", "שבת"];

/**
 * Final Manifest & Startup Popup Updates task: "detect a genuine cold
 * start via process initialization, never via Android force-stop or
 * recent-app-removal events" -- this module-scope boolean IS that
 * detector. It is set exactly once per real OS process: module scope is
 * evaluated exactly once when the JS engine initializes (a true cold
 * start, or React Native's Fast Refresh in dev, which is not a concern
 * in a production build), and is NEVER reset by backgrounding,
 * foregrounding, or any in-app navigation, because none of those
 * re-run module-level code -- they all reuse the same already-running
 * JS process. A second mount of this component within the SAME process
 * (which app/_layout.tsx's own single, fixed mount point never actually
 * causes, but this guards the invariant explicitly rather than relying
 * on that alone) sees the flag already set and renders nothing, instead
 * of re-showing the sequence. This is deliberately NOT built on
 * AppState, NOT on any Android-specific "was this a force-stop /
 * removed-from-recents" signal -- those read OS-level app lifecycle
 * state, which this task explicitly says not to rely on.
 */
let hasRunStartupSequenceThisProcess = false;

/**
 * live/DailyStartupSequenceOverlay.tsx
 *
 * Startup-popup task: "the psychology fact and Manifest visualization
 * must appear every time the user opens ARCHI, not just once per day"
 * -- the once-per-day gate (DailyStartupSequenceState) this component
 * used to check is REMOVED entirely (that type/its storage functions
 * are untouched and still exist in arc/purposeManifest.ts/data/
 * storage.ts, just no longer read/written here -- never deleted).
 *
 * "Every real launch, never on ordinary navigation or a brief
 * background/foreground switch" is satisfied for free by WHERE this
 * component is mounted, not by any flag: it sits as a fixed sibling of
 * the root <Stack> in app/_layout.tsx, which itself only ever mounts
 * once per real app launch -- in-app navigation, backgrounding, and
 * resuming all reuse the same JS instance and never remount it. This
 * is the exact "root only ever mounts once" guarantee
 * live/PsychologyFactLaunchOverlay.tsx's own (now superseded) doc
 * already relied on for its own "every single launch" behavior --
 * restored here for both popups, deliberately. The
 * hasRunStartupSequenceThisProcess guard above makes the SAME
 * "process initialization, not an OS lifecycle event" detection
 * explicit and independently auditable. This component has NO
 * dependency whatsoever on which route/home screen is rendered (it
 * never reads the DailyRoutineTemplate, never imports
 * build/DailyScheduleScreen.tsx or build/RoutineSetupScreen.tsx) --
 * app/index.tsx's own choice between those two is irrelevant to it.
 *
 * Critical-bug task ("Startup Popups Not Appearing"): root cause was
 * TWO real defects, neither of which any earlier source-text test could
 * catch (they check for code patterns, never actually render anything):
 *
 *  1. PRESENTATION: this component used to return a plain,
 *     absolutely-positioned <View> as a sibling of the root <Stack>.
 *     react-native-screens (which expo-router/React Navigation's native
 *     stack is built on) gives each Stack.Screen its OWN native
 *     surface, which can -- and on this build, did -- paint OVER a
 *     plain sibling View regardless of JSX order, especially on
 *     Android. The fix is to present through React Native's own
 *     <Modal>, a true native top-level window that is never subject to
 *     that occlusion -- the EXACT mechanism every other "must appear on
 *     top of whatever screen is active" case in this codebase already
 *     uses (see build/TaskEditorScreen.tsx's own archive-confirmation
 *     Modal). The component's own internal state machine (step/fact/
 *     resolved) was always running correctly; it was simply invisible.
 *  2. SILENT FAILURE: none of the three places that await storage reads
 *     (the mount effect's active-session check, the fact-rotation
 *     effect, continueToManifest's manifest resolution) had any error
 *     handling. A rejected promise in any of them left `step` stuck
 *     wherever it already was -- rendering nothing, forever, with
 *     nothing logged -- exactly "both popups silently skipped". Each
 *     now catches, logs via console.warn, and falls back to the
 *     safest non-stuck state (open rather than stay hidden) instead.
 *
 * Critical-bug task ("Startup Popups Still Not Working After Modal
 * Fix"): the Modal fix above was real, but did not fix the actual
 * report -- because it was never reached. The true root cause: THIRD
 * defect, found by tracing the active-session gate itself rather than
 * assuming the presentation fix was sufficient --
 *  3. STALE "ACTIVE" SESSION: clearTaskTimerRun/clearNewArcLiveSession
 *     are only ever called from an explicit in-app exit path (finish
 *     early, complete, postpone -- live/ActiveTaskScreen.tsx,
 *     live/PostponementScreen.tsx, live/NewArcLiveScreen.tsx). There is
 *     NO handler for backgrounding, force-stopping, or the OS killing
 *     the app mid-session. That leaves a genuinely ABANDONED
 *     TaskTimerRun/NewArcLiveSessionState sitting in storage forever,
 *     and this gate used to treat ANY persisted record as still
 *     "active" -- so one stale run from any earlier day silently
 *     suppressed BOTH popups on every single cold start afterward,
 *     regardless of the Modal fix (which only addressed whether an
 *     already-reached render would be VISIBLE; `step` itself was
 *     getting stuck at "none" before either popup's code path ever
 *     ran). Fixed by isTaskTimerRunStale/isNewArcLiveSessionStale
 *     (arc/taskTimer.ts / arc/newArcLiveTypes.ts): a record only blocks
 *     the sequence when it is NOT already completed AND was actually
 *     started/created TODAY -- "do not interrupt an active task, ARC
 *     exercise, or rest session" still holds for a GENUINELY active
 *     one, but an abandoned record from an earlier day no longer blocks
 *     a brand new day's startup sequence forever.
 *
 * No manifest at all, or none complete -> Popup 2 becomes a small,
 * non-blocking "create one" prompt instead of empty/broken content,
 * never skipping Popup 1.
 */
export default function DailyStartupSequenceOverlay() {
  const [step, setStep] = useState<Step>("checking");
  const [fact, setFact] = useState<PsychologyFact | null>(null);
  const [resolved, setResolved] = useState<ResolvedDailyManifest | null>(null);
  // Morning Flow Simplification task, section 1: true only between
  // picking Full/Shortened ARC on the "checkin" step and actually
  // returning to Home afterward -- the ONE flag the pathname-watcher
  // effect below needs to tell "we just came back from that ARC
  // session" apart from any other, unrelated visit to "/".
  const [awaitingCheckInReturn, setAwaitingCheckInReturn] = useState(false);
  /**
   * Unified ARC & Productivity Update task, requirement 1 (confirmed
   * root cause of "פחות טוב launches Full ARC while simultaneously
   * showing the psychology fact"): `handleCheckInArc` sets
   * `awaitingCheckInReturn(true)` SYNCHRONOUSLY, on the SAME render
   * where `pathname` is still "/" -- the actual navigation
   * (`handleEmotionalCheckInChoice`) is async and has not landed yet.
   * That makes the pathname-watcher effect below re-run on that exact
   * same render with `pathname === "/"` still true, read
   * `loadNewArcLiveSession()` (correctly `null` -- the new session
   * isn't persisted until the ARC screen itself mounts), and
   * misread "no session yet" as "session already finished," firing
   * `step -> "fact"` a split second before the Full ARC screen even
   * exists. A ref (never state -- this must never itself trigger a
   * render) tracks whether the trainee has ACTUALLY left "/" at least
   * once since `awaitingCheckInReturn` was last set true. Reset to
   * false by `handleCheckInArc` itself; flipped true the first time
   * the pathname-watcher effect below observes `pathname !== "/"`.
   * Only once it is true does a RETURN to "/" count as a genuine
   * round trip worth checking for completion -- closing the exact gap
   * above, since on that first race-prone render it is still false.
   */
  const hasLeftHomeSinceCheckInRef = useRef(false);
  /**
   * Final Morning Flow Requirements Audit task, section 4: "having
   * three tasks should not automatically mean the daily schedule is
   * suitable... allow the user to review, edit and confirm the
   * schedule before proceeding" -- holding the REAL entries (not just
   * a suitable/unsuitable boolean) is what lets the render below show
   * an actual reviewable, editable list regardless of which branch it
   * falls into; isDailyScheduleSuitable(planEntries) is still the one
   * place "suitable" is DECIDED, read fresh at render time rather than
   * cached in a second piece of state that could drift from it.
   */
  const [planEntries, setPlanEntries] = useState<ScheduledPlanEntry[] | null>(null);
  /** ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry "Cubes" task, section 5/6: the SAME Settings-controlled preference build/FlexibleDailyScreen.tsx's own showHomeInsightButton reads, loaded once here so AddInfoMenu's gating matches Home's exactly -- never a second, independent setting. */
  const [showHomeInsightButton, setShowHomeInsightButton] = useState(true);
  /**
   * Nine Functional Improvements task, Improvement 7 ("create tasks
   * directly during morning planning" -- a DIFFERENT feature from
   * Improvement 2's own dedicated, timed time-planning TASK, which
   * build/FlexibleDailyScreen.tsx's own "⏱️ תכנון הזמן שלי" card
   * addresses separately): the "תכנון מהיר של היום" button used to
   * just close this Modal (setStep("done")) -- no task creation of any
   * kind. Toggling this inline form, right here in the planning step,
   * is the smallest safe fix: this screen is a Modal (never a stack
   * route), so an inline form avoids re-navigating away and back (and
   * the awaitingCheckInReturn-style machinery that would require) just
   * to create one task. `addingTask` guards against a rapid double-tap
   * creating two tasks from the same submit.
   */
  const [showAddTaskForm, setShowAddTaskForm] = useState(false);
  const [newTaskDraft, setNewTaskDraft] = useState<TaskDraft>(createEmptyTaskDraft());
  const [addTaskError, setAddTaskError] = useState<string | null>(null);
  const [addingTask, setAddingTask] = useState(false);
  /**
   * Nine Functional Improvements task, Improvement 9: the "alarmOffer"
   * step's own draft fields, seeded from the ONE persisted
   * MorningAlarmConfig (data/storage.ts) once loaded by the mount
   * effect below. `morningAlarmConfig` doubles as this step's own
   * "has it loaded yet" gate (never shown before it's ready, exactly
   * like `fact`/`resolved`/`planEntries` already do for their own steps).
   */
  const [morningAlarmConfig, setMorningAlarmConfig] = useState<MorningAlarmConfig | null>(null);
  const [alarmOfferTimeDraft, setAlarmOfferTimeDraft] = useState("07:00");
  const [alarmOfferDays, setAlarmOfferDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const pathname = usePathname();

  useEffect(() => {
    logStartupStep("mount effect starting", { hasRunStartupSequenceThisProcess });
    if (hasRunStartupSequenceThisProcess) {
      logStartupStep("already ran this process -- step -> none");
      setStep("none");
      return;
    }
    hasRunStartupSequenceThisProcess = true;
    const now = new Date();
    (async () => {
      try {
        const [timerRun, arcSession, alarmConfig, morningFlowState] = await Promise.all([
          loadTaskTimerRun(),
          loadNewArcLiveSession(),
          loadMorningAlarmConfig(),
          loadMorningFlowCheckInState(),
        ]);
        const timerActive = timerRun !== null && !isTaskTimerRunStale(timerRun, now);
        const arcActive = arcSession !== null && !isNewArcLiveSessionStale(arcSession, now);
        logStartupStep("active-session check result", {
          timerRunPresent: timerRun !== null,
          timerActive,
          arcSessionPresent: arcSession !== null,
          arcActive,
          morningFlowAwaitingArcCompletion: morningFlowState.awaitingArcCompletion,
        });
        // Unified ARC & Productivity Update task, requirement 1 ("if ARC
        // is interrupted, retain its progress and the pending morning
        // step"): a cold start (new process -- e.g. the OS killed the
        // app mid-ARC) loses `awaitingCheckInReturn`'s own in-memory
        // state entirely, so the persisted flag is the only thing that
        // can tell this mount effect "the trainee already chose
        // Full/Shortened ARC from THIS morning's check-in, before
        // falling back to the ordinary alarmOffer/checkin branches
        // below as if nothing had happened." Three cases:
        //  - the session is still genuinely active (created today, not
        //    completed) -- resume watching for its completion exactly
        //    like the synchronous path does, via awaitingCheckInReturn
        //    (pathname is "/" at this exact point by construction, this
        //    component's one and only mount point, so no race: the
        //    session genuinely already exists from the EARLIER process).
        //  - the session was abandoned from an EARLIER day (stale by
        //    date, not by completion) -- today's mood hasn't been asked
        //    yet at all, so give up waiting and fall through to the
        //    ordinary mount flow for today.
        //  - anything else (session null, or completed) -- the ARC
        //    pathway genuinely finished -- skip "checkin" (already
        //    answered) and resume straight into "fact".
        if (morningFlowState.awaitingArcCompletion) {
          const arcAbandonedFromEarlierDay = arcSession !== null && arcSession.completedAt === null && todayLocalDateString(new Date(arcSession.createdAt)) !== todayLocalDateString(now);
          if (arcActive) {
            logStartupStep("resuming: the morning check-in's own ARC session is still active -- waiting for genuine completion");
            setAwaitingCheckInReturn(true);
            // Require a genuine round trip away from "/" before the
            // pathname-watcher effect below acts on a return to "/" --
            // same invariant handleCheckInArc's own reset relies on, so
            // this resumed wait is never mistaken for an immediate
            // "already back" false positive on this very mount.
            hasLeftHomeSinceCheckInRef.current = false;
            setStep("none");
            return;
          }
          if (arcAbandonedFromEarlierDay) {
            logStartupStep("the morning check-in's own ARC session was abandoned on an earlier day -- giving up waiting, asking again today");
            await saveMorningFlowCheckInState({ awaitingArcCompletion: false });
          } else {
            logStartupStep("resuming: the morning check-in's own ARC pathway already finished -- step -> fact (skipping checkin, already answered)");
            await saveMorningFlowCheckInState({ awaitingArcCompletion: false });
            setStep("fact");
            return;
          }
        }
        if (timerActive || arcActive) {
          logStartupStep("a genuinely active session exists -- step -> none");
          setStep("none");
          return;
        }
        // Nine Functional Improvements task, Improvement 9: "before the
        // FIRST automatic morning preparation popup, offer... ONE-TIME
        // (never repeated every morning)" -- hasOfferedSetup is a
        // permanent, persisted flag (never the per-process
        // hasRunStartupSequenceThisProcess one above), so this branch
        // can only ever be taken once in the app's whole lifetime,
        // regardless of how many times the sequence otherwise runs.
        if (!alarmConfig.hasOfferedSetup) {
          logStartupStep("morning alarm setup never offered -- step -> alarmOffer");
          setMorningAlarmConfig(alarmConfig);
          setAlarmOfferTimeDraft(`${String(alarmConfig.hour).padStart(2, "0")}:${String(alarmConfig.minute).padStart(2, "0")}`);
          setAlarmOfferDays(alarmConfig.recurrenceDays);
          setStep("alarmOffer");
          return;
        }
        logStartupStep("no active (non-stale) session -- step -> checkin");
        setStep("checkin");
      } catch (error) {
        // "Startup errors are logged and handled without silently
        // skipping both popups": we can't confirm there's no active
        // session, but getting stuck on "checking" forever (rendering
        // nothing, with no trace of why) is strictly worse than simply
        // continuing -- so we log and still show the sequence.
        console.warn("[DailyStartupSequenceOverlay] Failed to check for an active task timer/ARC session -- showing the startup sequence anyway.", error);
        setStep("checkin");
      }
    })();
  }, []);

  /**
   * Morning Flow Simplification task, section 1 (CORRECTED by the Full
   * ARC Sequence Update + Morning Flow Navigation Correction task):
   * resumes the rest of the sequence ("continue to the morning
   * preparation sequence") ONLY once the Full/Shortened ARC pathway
   * chosen on "checkin" has GENUINELY finished -- never merely because
   * the trainee is back on "/" for any reason (hardware/gesture back,
   * or any other way to leave the ARC screen without completing it).
   * Deliberately NOT a per-screen focus hook (this overlay is a fixed
   * Stack sibling, not a screen, and must never re-run on ordinary
   * screen focus the way an ordinary screen's own effects do);
   * usePathname is the one signal available to a sibling component for
   * "navigation came back here."
   *
   * Genuine completion is told apart from abandonment by the SAME
   * active-session signal the mount effect above already uses:
   * returnToTask() (live/NewArcLiveScreen.tsx) always clears the
   * persisted ARC session FIRST, before navigating back here -- so a
   * null (or stale/already-completed) session means it genuinely
   * finished, while a still-present, non-stale, not-yet-completed
   * session means the trainee left it mid-way (back button, app
   * switch, etc.) without finishing. In the abandoned case,
   * awaitingCheckInReturn is deliberately left TRUE and `step` is left
   * untouched (rule: "do not silently advance to the psychology fact,"
   * "do not restart the entire morning sequence unnecessarily") -- the
   * session itself is untouched and stays fully resumable through the
   * EXISTING ARC entry points/resume-conflict prompt
   * (live/NewArcLiveScreen.tsx's own reload()); this effect simply
   * re-checks again the next time the trainee returns to "/".
   * Only ever acts when awaitingCheckInReturn was explicitly set by
   * handleCheckInArc below, so an unrelated visit to "/" (before
   * checkin was ever reached, or after the sequence already finished)
   * is always a no-op.
   */
  useEffect(() => {
    if (!awaitingCheckInReturn) return;
    if (pathname !== "/") {
      // Unified ARC & Productivity Update task, requirement 1: the
      // trainee has now genuinely left Home for the ARC screen --
      // ONLY from this point on does a later return to "/" count as a
      // real round trip. Recorded in a ref (never state) so this
      // never itself triggers a render or re-fires this effect.
      hasLeftHomeSinceCheckInRef.current = true;
      return;
    }
    if (!hasLeftHomeSinceCheckInRef.current) {
      // Confirmed root cause of "the psychology fact appears while
      // Full/Shortened ARC is simultaneously launching": handleCheckInArc
      // sets awaitingCheckInReturn(true) synchronously, on the SAME
      // render where pathname is still "/" -- the actual router.push
      // (inside handleEmotionalCheckInChoice, itself async) has not
      // landed yet. Without this guard, THIS exact render would read
      // loadNewArcLiveSession() as `null` (the new session isn't
      // persisted until the ARC screen mounts) and misread "no session
      // yet" as "already finished," firing step -> "fact" a split
      // second before the Full ARC screen even exists. Bailing here
      // until a genuine departure from "/" has been observed closes
      // that gap completely.
      logStartupStep("awaitingCheckInReturn just set but the trainee hasn't actually left '/' yet -- not a genuine return, ignoring (this is the confirmed race fix)");
      return;
    }
    (async () => {
      let arcSession: Awaited<ReturnType<typeof loadNewArcLiveSession>> = null;
      try {
        arcSession = await loadNewArcLiveSession();
      } catch (error) {
        console.warn("[DailyStartupSequenceOverlay] Failed to check the ARC session's own completion status on returning to '/' -- treating it as still active rather than risking a premature advance.", error);
        return;
      }
      const arcStillActive = arcSession !== null && !isNewArcLiveSessionStale(arcSession, new Date());
      if (arcStillActive) {
        logStartupStep("back on '/' but the checkin's ARC session is still unfinished -- NOT advancing, waiting for genuine completion");
        return;
      }
      logStartupStep("back on '/' after the checkin's ARC pathway genuinely finished -- resuming at step -> fact");
      setAwaitingCheckInReturn(false);
      try {
        await saveMorningFlowCheckInState({ awaitingArcCompletion: false });
      } catch (error) {
        console.warn("[DailyStartupSequenceOverlay] Failed to clear the persisted morning-flow pending flag -- a later cold start may re-check it harmlessly.", error);
      }
      setStep("fact");
    })();
  }, [pathname, awaitingCheckInReturn]);

  /**
   * Nine Functional Improvements task, Improvement 9: toggling a day
   * chip on the one-time offer -- local draft state only, exactly the
   * same "edit the draft, commit on save" shape as every other
   * multi-select day picker in this app (e.g. build/TaskEditorScreen.tsx's
   * own recurrenceDays toggle).
   */
  function toggleAlarmOfferDay(dayOfWeek: number) {
    setAlarmOfferDays((days) => (days.includes(dayOfWeek) ? days.filter((day) => day !== dayOfWeek) : [...days, dayOfWeek].sort()));
  }

  /**
   * Leaves the one-time offer, EITHER way (enabled or declined) --
   * hasOfferedSetup is set to true unconditionally, which is exactly
   * what makes this genuinely one-time rather than "repeat until the
   * trainee says yes." A malformed time draft (e.g. cleared by hand)
   * silently falls back to the config's own existing hour/minute
   * rather than blocking the whole morning sequence on a validation
   * error here.
   */
  async function finishAlarmOffer(enabled: boolean) {
    if (!morningAlarmConfig) return;
    const match = alarmOfferTimeDraft.trim().match(/^(\d{1,2}):(\d{2})$/);
    const parsedHour = match ? Number(match[1]) : null;
    const parsedMinute = match ? Number(match[2]) : null;
    const validTime = parsedHour !== null && parsedMinute !== null && parsedHour >= 0 && parsedHour <= 23 && parsedMinute >= 0 && parsedMinute <= 59;
    const next: MorningAlarmConfig = {
      ...morningAlarmConfig,
      hasOfferedSetup: true,
      enabled,
      hour: validTime ? parsedHour! : morningAlarmConfig.hour,
      minute: validTime ? parsedMinute! : morningAlarmConfig.minute,
      recurrenceDays: alarmOfferDays,
    };
    await saveMorningAlarmConfig(next);
    await syncMorningAlarm();
    logStartupStep("alarmOffer finished -- step -> checkin", { enabled });
    setStep("checkin");
  }

  /** "😄 מעולה" -- continues the sequence directly, never resolving a next task the way the Home check-in bar's own third choice does. */
  function handleCheckInContinue() {
    logStartupStep("checkin: continuing directly -- step -> fact");
    setStep("fact");
  }

  /** "😟 פחות טוב" / "🙂 סבבה" -- hides the Modal immediately (never left showing over the ARC screen) and routes through the EXACT same shared openFullArc/openShortenedArc Home's own check-in bar and the widget already use, tagged morningFlowCheckIn so NewArcLiveScreen.tsx's own returnToTask() comes back to "/" instead of its ordinary destination. */
  function handleCheckInArc(choice: "full_arc" | "shortened_arc") {
    logStartupStep("checkin: routing through shared ARC check-in", { choice });
    // Reset BEFORE setAwaitingCheckInReturn(true) -- see that ref's own
    // doc comment and the pathname-watcher effect above for the exact
    // race this closes: the trainee has not left "/" yet at this point.
    hasLeftHomeSinceCheckInRef.current = false;
    setAwaitingCheckInReturn(true);
    setStep("none");
    // Persisted (never just the in-memory state above) so the pending
    // morning step survives the OS killing the app mid-ARC -- see
    // data/storage.ts's own MorningFlowCheckInState doc comment.
    // Fire-and-forget: a failed write here only risks not resuming
    // correctly after a very rare process kill, never the navigation
    // itself, which must never wait on it.
    void saveMorningFlowCheckInState({ awaitingArcCompletion: true }).catch((error) => {
      console.warn("[DailyStartupSequenceOverlay] Failed to persist the pending morning-flow ARC state.", error);
    });
    handleEmotionalCheckInChoice(choice, null, { morningFlowCheckIn: true });
  }

  /** Manifest Upgrade task: Popup 2's own onClose, now continuing into the planning-decision step (section 3) instead of finishing the whole sequence directly -- "preserve the daily psychology fact and Manifest popups," never skipping straight past planning. */
  function continueToPlanning() {
    logStartupStep("continueToPlanning: step -> planning");
    setStep("planning");
  }

  /**
   * Morning Flow Simplification task, section 3: loads TODAY's own
   * effective, auto-scheduled plan (the exact same resolution
   * build/FlexibleDailyScreen.tsx's own reload() performs, via
   * data/dailyPlan.ts's additive resolveTodaysScheduledPlan) to decide
   * which of the two planning-step cards to show. A failed load fails
   * OPEN -- straight to finish(), never stuck on an empty planning
   * card -- same precedent as every other async step in this file.
   */
  useEffect(() => {
    if (step !== "planning") return;
    logStartupStep("step -> planning: resolving today's scheduled plan");
    resolveTodaysScheduledPlan()
      .then((scheduled) => {
        logStartupStep("planning: today's plan resolved", { count: scheduled.length, suitable: isDailyScheduleSuitable(scheduled) });
        setPlanEntries(scheduled);
      })
      .catch((error) => {
        console.warn("[DailyStartupSequenceOverlay] Failed to resolve today's scheduled plan -- skipping the planning step and continuing to preparation.", error);
        finish();
      });
    loadShowHomeInsightButtonSetting().then(setShowHomeInsightButton);
  }, [step]);

  useEffect(() => {
    if (step !== "fact") return;
    logStartupStep("step -> fact: loading psychology-fact rotation");
    loadPsychologyFactProgress()
      .then(async (progress) => {
        const nextIndex = resolveNextPsychologyFactIndex(progress.lastFactIndex);
        await savePsychologyFactProgress({ lastFactIndex: nextIndex });
        logStartupStep("psychology fact resolved", { nextIndex });
        setFact(PSYCHOLOGY_FACTS[nextIndex]);
      })
      .catch((error) => {
        console.warn("[DailyStartupSequenceOverlay] Failed to resolve/persist the psychology-fact rotation -- showing the first fact rather than staying stuck with none.", error);
        setFact(PSYCHOLOGY_FACTS[0]);
      });
  }, [step]);

  async function continueToManifest() {
    logStartupStep("continueToManifest: resolving startup Manifest selection");
    try {
      const startupManifest = await resolveStartupManifestSelection(new Date());
      logStartupStep("Manifest selection resolved", { manifestId: startupManifest?.manifest.id ?? null });
      setResolved(startupManifest);
    } catch (error) {
      console.warn("[DailyStartupSequenceOverlay] Failed to resolve the startup Manifest selection -- falling back to the 'no manifest yet' prompt rather than getting stuck on the fact popup.", error);
      setResolved(null);
    } finally {
      setStep("manifest");
    }
  }

  /**
   * Daily Visualization task: "after these two popups, automatically
   * navigate to the Daily Visualization exercise if it has not yet
   * been completed for the current day... a separate full-screen
   * exercise, not a third popup" -- navigates FIRST (while this Modal
   * is still showing), then closes, so the trainee lands directly on
   * the visualization screen instead of flashing the daily schedule
   * underneath for an instant. A failed check fails open (no
   * navigation, straight to the daily schedule as before) rather than
   * leaving the Modal stuck open.
   */
  async function finish() {
    logStartupStep("finish() -- checking whether the Daily Visualization is needed today");
    try {
      const needed = await isDailyVisualizationNeededNow(new Date());
      logStartupStep("finish(): daily visualization needed?", { needed });
      if (needed) router.push("/daily-visualization");
    } catch (error) {
      console.warn("[DailyStartupSequenceOverlay] Failed to check whether the Daily Visualization is needed -- continuing to the daily schedule without it.", error);
    } finally {
      setStep("done");
    }
  }

  if (step === "checking" || step === "none" || step === "done") {
    logStartupStep("render: nothing to show", { step });
    return null;
  }
  if (step === "fact" && !fact) {
    logStartupStep("render: fact step but fact not loaded yet -- nothing to show");
    return null;
  }
  if (step === "alarmOffer" && !morningAlarmConfig) {
    logStartupStep("render: alarmOffer step but config not loaded yet -- nothing to show");
    return null;
  }
  if (step === "planning" && planEntries === null) {
    logStartupStep("render: planning step but the schedule check hasn't resolved yet -- nothing to show");
    return null;
  }

  /**
   * Final Morning Flow Requirements Audit task, section 4: today's
   * actual scheduled entries, reviewable (title + effective time) and
   * EDITABLE (tapping one closes the overlay and opens the EXISTING
   * /tasks/[id]/edit screen -- never a second, separate editor) --
   * shared by both the suitable and unsuitable planning-step cards
   * below, so reaching 3 tasks never silently skips this review.
   */
  function openEntryForEditing(entry: ScheduledPlanEntry) {
    setStep("done");
    router.push({ pathname: "/tasks/[id]/edit", params: { id: entry.task.id } });
  }
  const planReviewList = planEntries && planEntries.length > 0 && (
    <View style={styles.planReviewList}>
      {planEntries.map((entry) => (
        <Pressable key={entry.task.id} style={styles.planReviewRow} onPress={() => openEntryForEditing(entry)}>
          <Text style={styles.planReviewTitle}>{entry.task.title}</Text>
          {!!entry.effectiveStartTime && <Text style={styles.planReviewTime}>{entry.effectiveStartTime}</Text>}
        </Pressable>
      ))}
    </View>
  );

  /**
   * Nine Functional Improvements task, Improvement 7: saves straight to
   * TODAY's Flexible Daily Routine (a real Task with today's
   * scheduledDate, status "planned") -- never touches the permanent
   * weekly template, exactly like the existing Task Editor's own
   * creation path (arc/taskDraft.ts's buildTaskFromDraft + validateTaskDraft,
   * then data/taskAlarm.ts's scheduleTaskAlarm so a scheduled time
   * actually arms its alarm immediately, same "re-sync right after a
   * relevant state change" discipline TaskEditorScreen's own handleSave
   * already follows). `addingTask` is checked and set synchronously
   * first (same double-tap-guard pattern as live/ActiveTaskScreen.tsx's
   * own taskCompletingRef) so a rapid double-tap can never create two
   * tasks from one submit. Refreshes planEntries from the SAME
   * resolveTodaysScheduledPlan the planning step's own effect already
   * uses, so the new task is immediately visible and immediately
   * available to Daily Visualization -- never a second, stale snapshot.
   * Clears the draft (not the form's visibility) afterward so the
   * trainee can add another task immediately, satisfying "allow users
   * to create several tasks consecutively."
   */
  async function handleAddTaskToToday() {
    if (addingTask) return;
    const draftWithToday: TaskDraft = { ...newTaskDraft, scheduledDate: newTaskDraft.scheduledDate.trim() || todayLocalDateString(new Date()) };
    const errors = validateTaskDraft(draftWithToday);
    if (errors.length > 0) {
      setAddTaskError(errors[0]);
      return;
    }
    setAddingTask(true);
    setAddTaskError(null);
    const now = new Date().toISOString();
    const base = createEmptyTask(generateTaskId(), "", "", now);
    const built = buildTaskFromDraft(draftWithToday, base, now);
    const withAlarm = built.status === "planned" ? await scheduleTaskAlarm(built, new Date()) : built;
    await upsertTask(withAlarm);
    try {
      const scheduled = await resolveTodaysScheduledPlan(new Date());
      setPlanEntries(scheduled);
    } catch (error) {
      console.warn("[DailyStartupSequenceOverlay] Failed to refresh today's scheduled plan after adding a task -- the task was still saved.", error);
    }
    setNewTaskDraft(createEmptyTaskDraft());
    setAddingTask(false);
  }

  const addTaskForm = showAddTaskForm && (
    <View style={styles.addTaskForm}>
      <TextInput
        style={styles.addTaskInput}
        value={newTaskDraft.title}
        onChangeText={(title) => setNewTaskDraft({ ...newTaskDraft, title })}
        textAlign="right"
        placeholder="שם המשימה"
      />
      <TextInput
        style={styles.addTaskInput}
        value={newTaskDraft.scheduledTime}
        onChangeText={(scheduledTime) => setNewTaskDraft({ ...newTaskDraft, scheduledTime })}
        textAlign="right"
        placeholder="שעת התחלה (רשות, לדוגמה 09:30)"
      />
      <TextInput
        style={styles.addTaskInput}
        value={newTaskDraft.expectedDurationMinutes}
        onChangeText={(expectedDurationMinutes) => setNewTaskDraft({ ...newTaskDraft, expectedDurationMinutes })}
        textAlign="right"
        keyboardType="number-pad"
        placeholder="משך בדקות (רשות)"
      />
      <TextInput
        style={styles.addTaskInput}
        value={newTaskDraft.firstAction}
        onChangeText={(firstAction) => setNewTaskDraft({ ...newTaskDraft, firstAction })}
        textAlign="right"
        placeholder="פעולה ראשונה (רשות)"
      />
      <TextInput
        style={styles.addTaskInput}
        value={newTaskDraft.location}
        onChangeText={(location) => setNewTaskDraft({ ...newTaskDraft, location })}
        textAlign="right"
        placeholder="מיקום (רשות)"
      />
      {!!addTaskError && <Text style={styles.addTaskError}>{addTaskError}</Text>}
      <Pressable style={[styles.button, addingTask && styles.buttonDisabled]} disabled={addingTask} onPress={handleAddTaskToToday}>
        <Text style={styles.buttonText}>שמירת המשימה</Text>
      </Pressable>
    </View>
  );

  logStartupStep("render: showing the Modal", { step, hasFact: !!fact, hasResolved: !!resolved });
  return (
    <Modal visible transparent animationType="fade" onRequestClose={finish}>
      <View style={styles.backdrop}>
        {step === "alarmOffer" && (
          <View style={styles.card}>
            <Text style={styles.title}>הגדרת שעון מעורר להכנה היומית</Text>
            <Text style={styles.text}>
              אפשר להגדיר כעת שעון מעורר אמיתי של המכשיר שיזכיר להתחיל את ההכנה היומית -- הצעה חד-פעמית בלבד; ניתן לשנות או לכבות מאוחר יותר
              מההגדרות.
            </Text>
            <Text style={styles.secondaryButtonText}>שעה (HH:MM):</Text>
            <TextInput style={styles.addTaskInput} value={alarmOfferTimeDraft} onChangeText={setAlarmOfferTimeDraft} placeholder="07:00" />
            <View style={styles.alarmOfferDayRow}>
              {ALARM_OFFER_DAY_LABELS.map((label, dayOfWeek) => (
                <Pressable
                  key={label}
                  style={[styles.alarmOfferChip, alarmOfferDays.includes(dayOfWeek) && styles.alarmOfferChipSelected]}
                  onPress={() => toggleAlarmOfferDay(dayOfWeek)}
                >
                  <Text style={[styles.alarmOfferChipText, alarmOfferDays.includes(dayOfWeek) && styles.alarmOfferChipTextSelected]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={styles.button} onPress={() => finishAlarmOffer(true)}>
              <Text style={styles.buttonText}>הפעלת שעון מעורר</Text>
            </Pressable>
            <Pressable style={styles.skipLink} onPress={() => finishAlarmOffer(false)}>
              <Text style={styles.skipLinkText}>לא עכשיו</Text>
            </Pressable>
          </View>
        )}
        {step === "checkin" && (
          <View style={styles.card}>
            <Text style={styles.title}>איך אתה מרגיש כרגע?</Text>
            <View style={styles.checkInRow}>
              <Pressable style={styles.checkInButton} onPress={() => handleCheckInArc("full_arc")}>
                <Text style={styles.checkInEmoji}>😟</Text>
                <Text style={styles.checkInLabel}>פחות טוב</Text>
              </Pressable>
              <Pressable style={styles.checkInButton} onPress={() => handleCheckInArc("shortened_arc")}>
                <Text style={styles.checkInEmoji}>🙂</Text>
                <Text style={styles.checkInLabel}>סבבה</Text>
              </Pressable>
              <Pressable style={styles.checkInButton} onPress={handleCheckInContinue}>
                <Text style={styles.checkInEmoji}>😄</Text>
                <Text style={styles.checkInLabel}>מעולה</Text>
              </Pressable>
            </View>
          </View>
        )}
        {step === "planning" && planEntries &&
          (isDailyScheduleSuitable(planEntries) ? (
            <View style={styles.card}>
              <Text style={styles.title}>התוכנית שלי מוכנה</Text>
              <Text style={styles.text}>אפשר לעבור על התוכנית למטה, לערוך משימה במידת הצורך, ואז להמשיך להכנה המנטלית.</Text>
              <TaskCube />
              <FeelingCube />
              <AddInfoMenu showHomeInsightButton={showHomeInsightButton} />
              {planReviewList}
              <Pressable style={styles.secondaryButton} onPress={() => setShowAddTaskForm((shown) => !shown)}>
                <Text style={styles.secondaryButtonText}>➕ הוסף משימה להיום</Text>
              </Pressable>
              {addTaskForm}
              <Pressable style={styles.button} onPress={finish}>
                <Text style={styles.buttonText}>התוכנית שלי מוכנה — המשך להכנה</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.title}>תכנון קצר ליום</Text>
              <Text style={styles.text}>מומלץ לבחור לפחות 3 משימות להיום.</Text>
              <TaskCube />
              <FeelingCube />
              <AddInfoMenu showHomeInsightButton={showHomeInsightButton} />
              {planReviewList}
              <Pressable style={styles.button} onPress={() => setShowAddTaskForm((shown) => !shown)}>
                <Text style={styles.buttonText}>➕ הוסף משימה להיום</Text>
              </Pressable>
              {addTaskForm}
              <Pressable style={styles.secondaryButton} onPress={finish}>
                <Text style={styles.secondaryButtonText}>המשך לוויזואליזציה</Text>
              </Pressable>
              <Pressable style={styles.skipLink} onPress={finish}>
                <Text style={styles.skipLinkText}>דילוג על התכנון — המשך להכנה</Text>
              </Pressable>
            </View>
          ))}
        {(step === "fact" || step === "manifest") &&
          (step === "fact" && fact ? (
            <View style={styles.card}>
              <Text style={styles.title}>הידעת?</Text>
              <Text style={styles.text}>{fact.text}</Text>
              <Text style={styles.reference}>{fact.reference}</Text>
              <Text style={styles.connection}>{fact.arcConnection}</Text>
              <Pressable style={styles.button} onPress={continueToManifest}>
                <Text style={styles.buttonText}>המשך</Text>
              </Pressable>
            </View>
          ) : resolved ? (
            <ManifestVisualizationCard
              manifest={resolved.manifest}
              behavior={resolved.behavior}
              selection={resolved.selection}
              nextAction={resolved.nextAction}
              onClose={continueToPlanning}
            />
          ) : (
            <View style={styles.card}>
              <Text style={styles.title}>עדיין אין מניפסט</Text>
              <Text style={styles.text}>אפשר להגדיר מניפסט עם מטרה לטווח הארוך, הסיבה שלך לה, והערך שהיא מבטאת -- ואז ARCHI יציג דמיון יומי שמתבסס עליו.</Text>
              <Pressable
                style={styles.button}
                onPress={() => {
                  continueToPlanning();
                  router.push({ pathname: "/purpose-manifests/[id]", params: { id: "new" } });
                }}
              >
                <Text style={styles.buttonText}>יצירת מניפסט</Text>
              </Pressable>
              <Pressable style={styles.skipLink} onPress={continueToPlanning}>
                <Text style={styles.skipLinkText}>לא עכשיו</Text>
              </Pressable>
            </View>
          ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 420 },
  title: { fontSize: 18, fontWeight: "700", textAlign: "right", marginBottom: 10, color: "#0a7ea4" },
  text: { fontSize: 16, textAlign: "right", color: "#222", lineHeight: 23, marginBottom: 10 },
  reference: { fontSize: 12, textAlign: "right", color: "#888", marginBottom: 10 },
  connection: { fontSize: 13, textAlign: "right", color: "#555", lineHeight: 19, marginBottom: 16 },
  button: { backgroundColor: "#0a7ea4", paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  skipLink: { marginTop: 12, alignItems: "center" },
  skipLinkText: { color: "#666", fontSize: 14 },
  checkInRow: { flexDirection: "row-reverse", justifyContent: "space-between", gap: 10, marginTop: 10 },
  checkInButton: { flex: 1, alignItems: "center", backgroundColor: "#F5FAFD", borderRadius: 14, paddingVertical: 18, borderWidth: 1, borderColor: "#dbe8ef" },
  checkInEmoji: { fontSize: 32 },
  checkInLabel: { fontSize: 13, color: "#444", marginTop: 6, fontWeight: "600" },
  planReviewList: { marginTop: 4, marginBottom: 14, gap: 8 },
  planReviewRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: "#eee", borderRadius: 8, padding: 10 },
  planReviewTitle: { fontSize: 14, color: "#222", textAlign: "right", flexShrink: 1 },
  planReviewTime: { fontSize: 13, color: "#0a7ea4", marginLeft: 8 },
  secondaryButton: { borderWidth: 1, borderColor: "#0a7ea4", paddingVertical: 11, borderRadius: 10, alignItems: "center", marginTop: 10 },
  secondaryButtonText: { color: "#0a7ea4", fontWeight: "600", fontSize: 15 },
  buttonDisabled: { opacity: 0.6 },
  addTaskForm: { marginTop: 12, gap: 8 },
  addTaskInput: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, fontSize: 15, textAlign: "right" },
  addTaskError: { color: "#c0392b", fontSize: 13, textAlign: "right" },
  alarmOfferDayRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 8, marginTop: 10, marginBottom: 14 },
  alarmOfferChip: { backgroundColor: "#E6F4FE", paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8 },
  alarmOfferChipSelected: { backgroundColor: "#0a7ea4" },
  alarmOfferChipText: { color: "#0a7ea4", fontSize: 12 },
  alarmOfferChipTextSelected: { color: "#fff" },
});
