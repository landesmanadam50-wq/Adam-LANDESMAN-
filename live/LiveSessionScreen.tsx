/**
 * live/LiveSessionScreen.tsx
 *
 * The LIVE container. It owns navigation/loading/session-state plumbing
 * only: load real program state, forward each UI event through
 * live/liveEventAdapter.ts (which asks arc/arcEngine.ts what happens
 * next), and render whatever stage comes back via ArcLiveRenderer. It
 * never decides a route, threshold, or target itself.
 *
 * Session safety (#20): ArcLiveState lives only in this component's
 * React state, never persisted mid-session. useFocusEffect reloads
 * real profile/program state and starts a brand-new session every time
 * this screen gains focus -- so leaving LIVE mid-session (back button,
 * navigating away) always terminates it explicitly rather than leaving
 * a partial session lying around, and returning to LIVE never resumes
 * a stale one. Training Day credit is only ever granted from
 * recordValidLiveCompletion() when a session reaches "complete" with a
 * confirmed real action -- an abandoned session never reaches that call.
 *
 * One narrow, explicit exception to "never resumes a stale session":
 * a real timer already in progress -- the Beneficial Action Timer
 * ("act"'s "performing" sub-phase), the Success Focus / Success Coding
 * Timer, or the Negative Action Timer. Each is its own independently
 * persisted data/storage.ts TimerRun (actionStartedAt, plus a snapshot
 * of its exact display text), so any ONE of them surviving navigating
 * away and back, the app backgrounding/locking, or a full close/reopen
 * is a narrow, explicit exception to "session state is never
 * persisted" -- see the three resumedXRun states below and
 * arc/actionTimer.ts's getActionTimerStatusFromStartedAt. Nothing else
 * about the session (ratings, encoding text, routing) is reconstructed
 * or persisted; every other stage still starts over exactly as before.
 * At most one of the three timer types is ever actually running at a
 * time (they're sequential, and each is cleared the moment its stage
 * is left -- see commitAdvance), so finding one during resume is
 * unambiguous.
 */

import { useCallback, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";

import type { ArcBuildProfile, ArcLiveState, ArcStage, DevelopmentLayer } from "../arc/types.ts";
import { createEmptyLiveState } from "../arc/types.ts";
import { getFirstArcStage, resolveEncodingTarget } from "../arc/arcEngine.ts";
import { getStageCopy } from "../arc/stageCopy.ts";
import { buildEvidenceIndex, buildSessionEvidenceContext } from "../arc/evidence.ts";
import type { EvidenceRecord } from "../arc/evidence.ts";
import { getSuccessFocusReinforcement } from "../arc/reinforcement.ts";
import { getProgramDefinition, resolveNegativeActionDuration } from "../program/engine.ts";
import {
  loadProfile,
  loadProgramProgress,
  loadProgramSelection,
  saveProgramProgress,
  loadSessionLog,
  appendSessionLogEntry,
  updateLastSessionLogEntryGratitude,
  loadTimerRun,
  clearTimerRun,
  loadScheduledRoutines,
  appendRoutineOccurrenceCompletion,
} from "../data/storage.ts";
import type { ScheduledRoutine, TimerRun } from "../data/storage.ts";
import { recordValidLiveCompletion } from "../program/progress.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";
import {
  advanceLiveSession,
  applyAcceptanceWillingnessAnswer,
  applyTriggerContext,
  applyActionCompletion,
  applyActionImageryCompleted,
  applyAlternativeAction,
  applyBeneficialActionDurationSelected,
  applyNegativeActionStarted,
  applyPlannedActionConfirmed,
  applyRegulationToolUsed,
  applyScaleAnswer,
  applySensationAnswer,
  applySuccessFocusExtraMinutes,
  applyWantsFutureSuccessFocus,
  applyTargetSelection,
  applyTriggerSelection,
  applyYesNoAnswer,
  hasValidAlternativeAction,
  resolveSensationLocation,
} from "./liveEventAdapter.ts";
import { getAvailableLiveTriggers } from "../arc/arcEngine.ts";
import { DEFERRAL_OPTIONS, scheduleFutureSuccessFocus } from "../data/reminders.ts";
import type { DeferralOption } from "../data/reminders.ts";
import { ArcLiveRenderer } from "./ArcLiveRenderer.tsx";
import { ActionScreen, SuccessFocusScreen } from "./screens.tsx";

const ROUTINE_SUCCESS_FOCUS_MINUTES = [0, 5, 10, 15, 20];

export default function LiveSessionScreen() {
  const { routineId: routineIdParam } = useLocalSearchParams<{ routineId?: string }>();
  const routineId = typeof routineIdParam === "string" ? routineIdParam : null;
  const [profile, setProfile] = useState<ArcBuildProfile | null>(null);
  const [activeLayers, setActiveLayers] = useState<DevelopmentLayer[]>([]);
  const [currentProgramWeek, setCurrentProgramWeek] = useState(1);
  const [session, setSession] = useState<ArcLiveState>(() => createEmptyLiveState());
  const [stage, setStage] = useState<ArcStage>("trigger_selection");
  const [pendingSensationLocation, setPendingSensationLocation] = useState("");
  const [pendingCustomSensationLocation, setPendingCustomSensationLocation] = useState("");
  const [pendingSensationLocationUnclear, setPendingSensationLocationUnclear] = useState(false);
  const [pendingTriggerContext, setPendingTriggerContext] = useState("");
  const [pendingAlternativeAction, setPendingAlternativeAction] = useState("");
  const [pendingAlternativeActionDuration, setPendingAlternativeActionDuration] = useState<number | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState(() => new Date().toISOString());
  const [gratitudeText, setGratitudeText] = useState("");
  const [gratitudeMemoryDetailText, setGratitudeMemoryDetailText] = useState("");
  /**
   * Evidence-encoding task: derived once per session load from the
   * trainee's EXISTING session log (arc/evidence.ts's buildEvidenceIndex)
   * -- never a second persisted store. Loaded fresh every time this
   * screen gains focus, same as profile/activeLayers, so a Gratitude/
   * memory-detail entry saved at the end of the PREVIOUS session is
   * available as evidence starting with THIS one.
   */
  const [evidenceIndex, setEvidenceIndex] = useState<EvidenceRecord[]>([]);
  // Resumed timer run -- see this file's module doc. Coordinated
  // timer/dwell task: the "successCoding" TimerRun the OLD success_focus
  // "now" flow used to resume mid-protocol no longer exists -- that
  // flow was removed (see live/ArcLiveRenderer.tsx's "success_focus"
  // case); a "successCoding" TimerRun is now created ONLY by the
  // future-scheduling sub-flow (data/reminders.ts's
  // scheduleFutureSuccessFocus), which is exclusively resolved via its
  // own dedicated deep-link screen (app/focus-success.tsx), never by
  // re-entering a fresh LIVE session here -- so LiveSessionScreen no
  // longer checks for or resumes it at all.
  const [resumedBeneficialActionRun, setResumedBeneficialActionRun] = useState<TimerRun | null>(null);
  const [resumedNegativeActionRun, setResumedNegativeActionRun] = useState<TimerRun | null>(null);
  /**
   * Multiple Scheduled ARC + Success Focus Routines: the ONE routine
   * this session is for (resolved from the routineId route param, or --
   * on resuming an in-progress routineSuccessFocus TimerRun -- from
   * that run's own relatedRoutineId, which is authoritative regardless
   * of what param this focus happened to arrive with; see the
   * useFocusEffect below). null for every ordinary, non-routine LIVE
   * session -- everything routine-specific below is gated on this being
   * non-null.
   */
  const [routine, setRoutine] = useState<ScheduledRoutine | null>(null);
  /**
   * "arc": the normal protocol, rendered via ArcLiveRenderer exactly as
   * for any other session, including its own unchanged CompleteScreen.
   * "successFocus": required execution order's final two steps for a
   * routine-launched session -- reached either by resuming an
   * in-progress routineSuccessFocus TimerRun (useFocusEffect below) or
   * by the trainee continuing past CompleteScreen (restart() below) --
   * bypasses ArcLiveRenderer entirely and renders SuccessFocusScreen
   * directly, the same bypass pattern already used for
   * resumedBeneficialActionRun.
   */
  const [routinePhase, setRoutinePhase] = useState<"arc" | "successFocus">("arc");
  const [resumedRoutineSuccessFocusRun, setResumedRoutineSuccessFocusRun] = useState<TimerRun | null>(null);
  const [routineSuccessFocusSelectedMinutes, setRoutineSuccessFocusSelectedMinutes] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      // loadProgramSelection() is loaded for completeness (per the LIVE
      // load contract) even though today's routing only needs
      // activeLayers, which loadProgramProgress() already derives from
      // ProgramDefinition -- see program/engine.ts. The two
      // loadTimerRun() calls are the one exception to "always start
      // fresh" -- see this file's module doc. Coordinated timer/dwell
      // task: loadTimerRun("successCoding") is deliberately NOT among
      // them any more -- a "successCoding" TimerRun now only ever
      // exists as a future-scheduled Success Focus (data/reminders.ts's
      // scheduleFutureSuccessFocus), which is exclusively resumed via
      // its own dedicated deep-link screen (app/focus-success.tsx);
      // treating it as "this LIVE session's own in-progress timer"
      // would incorrectly hijack a brand-new session into that
      // unrelated future run.
      Promise.all([
        loadProfile(),
        loadProgramProgress(),
        loadProgramSelection(),
        loadTimerRun("beneficialAction"),
        loadTimerRun("negativeAction"),
        // Multiple Scheduled ARC + Success Focus Routines: a routine's
        // own post-ARC Success Focus timer, resumed here the same way
        // beneficialAction/negativeAction already are -- see this
        // file's module doc's "narrow, explicit exception" and
        // data/storage.ts's TimerRun.relatedRoutineId. Still deliberately
        // NOT loadTimerRun("successCoding") -- that stays exclusively
        // owned by the future-scheduled deep link (app/focus-success.tsx).
        loadTimerRun("routineSuccessFocus"),
        loadSessionLog(),
        loadScheduledRoutines(),
      ]).then(([loadedProfile, loadedProgress, , beneficialActionRun, negativeActionRun, routineSuccessFocusRun, sessionLog, routines]) => {
        if (cancelled) return;
        if (!loadedProfile || !loadedProgress) {
          router.replace("/build");
          return;
        }
        setProfile(loadedProfile);
        setActiveLayers(loadedProgress.activeLayers);
        setCurrentProgramWeek(loadedProgress.currentProgramWeek);
        setEvidenceIndex(buildEvidenceIndex(sessionLog));
        setPendingSensationLocation("");
        setPendingCustomSensationLocation("");
        setPendingSensationLocationUnclear(false);
        setPendingTriggerContext("");
        setPendingAlternativeAction("");
        setPendingAlternativeActionDuration(null);
        setGratitudeText("");
        setGratitudeMemoryDetailText("");
        setRoutineSuccessFocusSelectedMinutes(null);

        // The persisted run's own relatedRoutineId is authoritative over
        // the routineId this focus happened to arrive with -- e.g.
        // resuming after the app was backgrounded mid-routine-Success-
        // Focus and reopened via Home, with no routineId param at all.
        const resolvedRoutineId = routineSuccessFocusRun?.relatedRoutineId ?? routineId;
        const matchedRoutine = resolvedRoutineId ? (routines.find((item) => item.id === resolvedRoutineId) ?? null) : null;
        setRoutine(matchedRoutine);

        if (routineSuccessFocusRun && matchedRoutine) {
          setResumedRoutineSuccessFocusRun(routineSuccessFocusRun);
          setResumedBeneficialActionRun(null);
          setResumedNegativeActionRun(null);
          setRoutinePhase("successFocus");
          return;
        }
        // A routineSuccessFocus run with no matching routine (the
        // routine was deleted mid-run) has nothing left to resume into
        // -- clear it defensively rather than leaving it persisted
        // forever with no path that will ever pick it back up.
        if (routineSuccessFocusRun) clearTimerRun("routineSuccessFocus");
        setResumedRoutineSuccessFocusRun(null);
        setRoutinePhase("arc");

        if (beneficialActionRun) {
          setResumedBeneficialActionRun(beneficialActionRun);
          setResumedNegativeActionRun(null);
          setSessionStartedAt(beneficialActionRun.actionStartedAt);
          return;
        }

        if (negativeActionRun) {
          setResumedBeneficialActionRun(null);
          setResumedNegativeActionRun(negativeActionRun);
          setSessionStartedAt(negativeActionRun.actionStartedAt);
          setSession({
            ...createEmptyLiveState(),
            currentArcStage: "negative_action",
            negativeActionStarted: true,
            actionReached: true,
            realActionCompleted: true,
          });
          setStage("negative_action");
          return;
        }

        setResumedBeneficialActionRun(null);
        setResumedNegativeActionRun(null);
        setSession(createEmptyLiveState());
        setStage(getFirstArcStage());
        setSessionStartedAt(new Date().toISOString());
      });
      return () => {
        cancelled = true;
      };
    }, [routineId])
  );

  const finalizeSession = (finishedSession: ArcLiveState) => {
    const finishedAt = new Date().toISOString();
    // Evidence-encoding task: this session's own resolved context,
    // captured once here via the SAME resolver Encoding/Act already
    // used throughout this session (arc/arcEngine.ts's
    // resolveEncodingTarget) -- never re-derived or guessed. `profile`
    // is guaranteed non-null by the time finalizeSession is reachable
    // (commitAdvance's own guard above), but this closure doesn't carry
    // that narrowing, so it's re-checked defensively; a null profile
    // (never expected in practice) simply logs no context, same as any
    // legacy entry.
    let context = null;
    if (profile) {
      const resolution = resolveEncodingTarget({
        activeLayers,
        triggerType: finishedSession.triggerType,
        selectedTarget: finishedSession.selectedTarget,
        buildProfile: profile,
        selectedAction: finishedSession.selectedAction,
      });
      context = buildSessionEvidenceContext(
        resolution.layer,
        resolution.encoding,
        resolution.actionLabel,
        profile,
        finishedSession.triggerContext,
        finishedSession.triggerKnown
      );
    }
    appendSessionLogEntry({
      id: `${sessionStartedAt}_${finishedAt}`,
      startedAt: sessionStartedAt,
      finishedAt,
      success: finishedSession.realActionCompleted,
      fall: false, // see README: no interfering-action-window stage exists in this ArcStage list yet
      context,
    });

    loadProgramProgress().then((freshProgress) => {
      if (!freshProgress) return;
      const updated = recordValidLiveCompletion({
        progress: freshProgress,
        reachedAct: finishedSession.actionReached,
        actionCompleted: finishedSession.realActionCompleted,
        localDate: todayLocalDateString(),
      });
      saveProgramProgress(updated);
    });
  };

  /**
   * transitionStage defaults to the current rendered `stage`, matching
   * every pre-existing call site exactly. The two inline-rating merge
   * handlers below (onPresenceExperienceRating/onRegulationExperienceRating)
   * are the only callers that ever pass a different one: they simulate
   * walking through a stage that is no longer separately rendered
   * (arc_thought_presence_recheck / desired_state_check / sensation_check,
   * reached via regulate) by computing that stage's own, completely
   * unchanged getNextArcStage transition here, without ever setting
   * `stage` to it in between.
   */
  const commitAdvance = (patchedSession: ArcLiveState, transitionStage: ArcStage = stage) => {
    if (!profile) return;
    const { session: nextSession, stage: nextStage } = advanceLiveSession(transitionStage, patchedSession, profile, activeLayers);
    // Each real timer's persisted run is cleared the moment its own
    // stage is left -- the only way out of either is its real activity
    // actually completing (act -> success_focus, negative_action ->
    // complete are both unconditional in arc/arcEngine.ts once
    // reached). Never clears a DIFFERENT timer type's run. Coordinated
    // timer/dwell task: success_focus no longer starts a "successCoding"
    // TimerRun during the protocol at all (see this file's module doc
    // and live/ArcLiveRenderer.tsx's "success_focus" case), so there is
    // nothing of that type to clear on leaving this stage any more.
    if (stage === "act" && nextStage !== "act") clearTimerRun("beneficialAction");
    if (stage === "negative_action" && nextStage !== "negative_action") clearTimerRun("negativeAction");
    setSession(nextSession);
    setStage(nextStage);
    setPendingSensationLocation("");
    setPendingCustomSensationLocation("");
    setPendingSensationLocationUnclear(false);
    setPendingTriggerContext("");
    setPendingAlternativeAction("");
    setPendingAlternativeActionDuration(null);
    if (nextStage === "complete") {
      finalizeSession(nextSession);
    }
  };

  const restart = () => {
    // Reinforcement's optional, now protocol-linked Gratitude entry
    // (#10, evidence-encoding task #4/#5): attached to the just-
    // finalized session log entry here, decoupled from finalizeSession()
    // itself so a completed session is always logged immediately on
    // reaching "complete" -- never lost if the trainee navigates away
    // before typing anything. The concrete memory detail is saved in
    // this SAME call, onto this SAME entry, so the two can never end up
    // describing different sessions (#6/#13).
    const trimmedGratitude = gratitudeText.trim();
    const trimmedMemoryDetail = gratitudeMemoryDetailText.trim();
    updateLastSessionLogEntryGratitude(
      trimmedGratitude.length > 0 ? trimmedGratitude : null,
      trimmedMemoryDetail.length > 0 ? trimmedMemoryDetail : null
    ).then(() => {
      // Rebuilds the evidence index so a "סשן חדש" restart within this
      // SAME screen instance (no navigation, so useFocusEffect above
      // doesn't re-run) can immediately surface what was just saved --
      // otherwise it would only appear starting from the NEXT time this
      // screen gains focus.
      loadSessionLog().then((log) => setEvidenceIndex(buildEvidenceIndex(log)));
    });

    // Defensive: by the time restart() is reachable every real timer's
    // anchor should already be cleared (commitAdvance clears each one
    // the moment its own stage is left), but never let a stale one
    // leak into the next session regardless. Never clears "successCoding"
    // here -- that TimerRun (when one exists) belongs to a
    // future-scheduled Success Focus the trainee deliberately set up,
    // owned entirely by data/reminders.ts's scheduleFutureSuccessFocus/
    // cancelFutureSuccessFocus, never by starting a fresh LIVE session.
    clearTimerRun("beneficialAction");
    clearTimerRun("negativeAction");
    setResumedBeneficialActionRun(null);
    setResumedNegativeActionRun(null);

    if (routine) {
      // Multiple Scheduled ARC + Success Focus Routines' required
      // execution order: "ARC completion -> Success Focus -> Success
      // Focus timer -> Routine completed". The ARC protocol itself
      // (including its own unchanged CompleteScreen/Gratitude step) is
      // already done by the time this is reachable for a routine-
      // launched session -- continue into THIS routine's own post-ARC
      // Success Focus timer instead of starting a brand-new session.
      // Occurrence completion isn't recorded until that timer's own
      // "המשך" is pressed (see the routinePhase === "successFocus"
      // render branch below), never here.
      setGratitudeText("");
      setGratitudeMemoryDetailText("");
      setRoutineSuccessFocusSelectedMinutes(null);
      setRoutinePhase("successFocus");
      return;
    }

    setSession(createEmptyLiveState());
    setStage(getFirstArcStage());
    setPendingSensationLocation("");
    setPendingCustomSensationLocation("");
    setPendingSensationLocationUnclear(false);
    setPendingTriggerContext("");
    setPendingAlternativeAction("");
    setPendingAlternativeActionDuration(null);
    setSessionStartedAt(new Date().toISOString());
    setGratitudeText("");
    setGratitudeMemoryDetailText("");
  };

  if (!profile) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "ARCHI LIVE" }} />
      </SafeAreaView>
    );
  }

  // Multiple Scheduled ARC + Success Focus Routines: this routine-
  // launched session has finished its ARC protocol and is now in (or
  // resuming) its own post-ARC Success Focus timer step -- the required
  // execution order's final two steps ("Success Focus -> Success Focus
  // timer -> Routine completed"). Bypasses ArcLiveRenderer entirely,
  // same reasoning as resumedBeneficialActionRun below: nothing about
  // this step depends on the ARC session's own stage/state.
  if (routinePhase === "successFocus" && routine) {
    const routineCopy = { title: "התמקדות בהצלחה", body: `שגרה: ${routine.title}`, segments: null };
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: `ARCHI LIVE — ${routine.title}` }} />
        <ScrollView contentContainerStyle={styles.content}>
          <SuccessFocusScreen
            copy={routineCopy}
            durationMinutes={routine.successFocusDurationMinutes}
            resumedRun={resumedRoutineSuccessFocusRun}
            timerType="routineSuccessFocus"
            relatedRoutineId={routine.id}
            minutesOptions={ROUTINE_SUCCESS_FOCUS_MINUTES}
            selectedMinutes={routineSuccessFocusSelectedMinutes}
            onSelectMinutes={setRoutineSuccessFocusSelectedMinutes}
            reinforcementText={
              routineSuccessFocusSelectedMinutes !== null ? getSuccessFocusReinforcement(routineSuccessFocusSelectedMinutes) : ""
            }
            onContinue={() => {
              // Independent per-occurrence completion (spec: "Completing
              // one routine must never complete another routine" /
              // "Independent completion state for each scheduled
              // occurrence"): keyed by THIS routine's own id and today's
              // local calendar date -- never affects any other routine or
              // any other day's occurrence of this same routine.
              clearTimerRun("routineSuccessFocus");
              appendRoutineOccurrenceCompletion({
                routineId: routine.id,
                occurrenceDateLocal: todayLocalDateString(),
                completedAt: new Date().toISOString(),
              });
              setResumedRoutineSuccessFocusRun(null);
              setRoutinePhase("arc");
              setRoutineSuccessFocusSelectedMinutes(null);
              router.replace("/routines");
            }}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // A real Beneficial Action Timer was already in progress when this
  // screen (re)gained focus -- render it directly from the persisted
  // run, bypassing the normal stage-routing pipeline entirely. There is
  // no faithfully-reconstructed ArcLiveState to hand back into
  // getStageCopy/ArcLiveRenderer (triggerType, selectedTarget, and the
  // rest were never persisted, by design -- see this file's module
  // doc), so this uses the exact display snapshot instead, and only
  // rejoins the normal flow once the trainee actually completes it.
  if (resumedBeneficialActionRun) {
    const run = resumedBeneficialActionRun;
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: `ARCHI LIVE — ${run.copyTitle}` }} />
        <ScrollView contentContainerStyle={styles.content}>
          <ActionScreen
            copy={{ title: run.copyTitle, body: run.copyBody, segments: null }}
            durationMinutes={run.durationMinutes}
            resumedRun={run}
            onCompleted={() => {
              clearTimerRun("beneficialAction");
              setResumedBeneficialActionRun(null);
              // Rejoins the normal flow at success_focus -- the same
              // stage the unconditional act -> success_focus transition
              // would have reached anyway (arc/arcEngine.ts). Neither
              // success_focus's nor complete's copy depends on
              // triggerType/selectedTarget/selectedAction, so this
              // minimal reconstruction is enough to finish the session
              // correctly (Training Day credit included) without ever
              // having persisted the rest of ArcLiveState.
              setSession({
                ...createEmptyLiveState(),
                currentArcStage: "success_focus",
                actionReached: true,
                realActionCompleted: true,
              });
              setStage("success_focus");
            }}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const copy = getStageCopy(stage, profile, session, activeLayers, evidenceIndex);
  const availableTriggers = getAvailableLiveTriggers(activeLayers);
  const negativeActionDurationMinutes = resolveNegativeActionDuration(
    currentProgramWeek,
    getProgramDefinition(profile.programPath),
    profile.negativeActionBaseDurationMinutes
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <Stack.Screen options={{ title: `ARCHI LIVE — ${copy.title}` }} />
      <ScrollView contentContainerStyle={styles.content}>
        <ArcLiveRenderer
          stage={stage}
          session={session}
          profile={profile}
          activeLayers={activeLayers}
          evidenceIndex={evidenceIndex}
          availableTriggers={availableTriggers}
          pendingSensationLocation={pendingSensationLocation}
          pendingCustomSensationLocation={pendingCustomSensationLocation}
          pendingSensationLocationUnclear={pendingSensationLocationUnclear}
          pendingTriggerContext={pendingTriggerContext}
          onChangeTriggerContext={setPendingTriggerContext}
          onTriggerContextContinue={() => commitAdvance(applyTriggerContext(session, pendingTriggerContext))}
          onSelectTrigger={(trigger) => commitAdvance(applyTriggerSelection(session, trigger))}
          onScaleAnswer={(value) => commitAdvance(applyScaleAnswer(stage, session, value))}
          onSelectSensationLocation={(location) => {
            setPendingSensationLocation(location);
            setPendingCustomSensationLocation("");
            setPendingSensationLocationUnclear(false);
          }}
          onChangeCustomSensationLocation={(text) => {
            setPendingCustomSensationLocation(text);
            setPendingSensationLocation("");
            setPendingSensationLocationUnclear(false);
          }}
          onSelectSensationLocationUnclear={() => {
            setPendingSensationLocationUnclear(true);
            setPendingSensationLocation("");
            setPendingCustomSensationLocation("");
          }}
          onSubmitSensationIntensity={(value) => {
            const isHabitSensation = session.triggerType === "reactive_urge";
            const location = isHabitSensation
              ? null
              : (resolveSensationLocation(pendingSensationLocation, pendingCustomSensationLocation, pendingSensationLocationUnclear) ??
                session.sensationLocation);
            commitAdvance(applySensationAnswer(session, location, value));
          }}
          onYesNoAnswer={(yes) => commitAdvance(applyYesNoAnswer(stage, session, yes))}
          onSelectTarget={(target) => setSession(applyTargetSelection(session, target))}
          onSelectReactiveExperience={(target) => commitAdvance(applyTargetSelection(session, target))}
          onGenericContinue={() => commitAdvance(session)}
          onRegulateContinue={() => commitAdvance(applyRegulationToolUsed(session, profile.regulationTool))}
          onPresenceExperienceRating={(value) =>
            commitAdvance(applyScaleAnswer("arc_thought_presence_recheck", session, value), "arc_thought_presence_recheck")
          }
          onRegulationExperienceRating={(value) => {
            // Mirrors onRegulateContinue's own applyRegulationToolUsed
            // side effect first, then simulates the real, unchanged
            // regulate -> desired_state_check/sensation_check hop
            // (respecting the loop-safety cap exactly as
            // arc/arcEngine.ts's "regulate" case always has) to learn
            // which rating field this session is actually mid-way
            // through, before applying the just-selected value to it
            // and continuing through THAT stage's own, also unchanged,
            // transition. See live/ArcLiveRenderer.tsx's "regulate"
            // case, which only ever offers this rating when its own
            // peek already confirmed one of these two outcomes.
            const withToolUsed = applyRegulationToolUsed(session, profile.regulationTool);
            const hop = advanceLiveSession("regulate", withToolUsed, profile, activeLayers);
            const withRating =
              hop.stage === "desired_state_check"
                ? applyScaleAnswer("desired_state_check", hop.session, value)
                : applySensationAnswer(hop.session, hop.session.sensationLocation, value);
            commitAdvance(withRating, hop.stage);
          }}
          onAcceptWillingnessAnswer={(yes) => setSession(applyAcceptanceWillingnessAnswer(session, yes))}
          onAcceptIntensityRating={(value) => {
            // Mirrors onRegulationExperienceRating's shape: simulates
            // the real, unchanged accept -> sensation_check hop
            // (respecting the loop-safety cap exactly as
            // arc/arcEngine.ts's "accept" case always has), then
            // applies the just-selected intensity to that recheck and
            // continues through sensation_check's own, also unchanged,
            // transition. Location is preserved from the initial check
            // (never re-asked here), exactly like the existing
            // onSubmitSensationIntensity recheck path. See
            // live/ArcLiveRenderer.tsx's "accept" case, which only ever
            // offers this rating when its own peek already confirmed
            // sensation_check is next.
            const hop = advanceLiveSession("accept", session, profile, activeLayers);
            const withRating = applySensationAnswer(hop.session, hop.session.sensationLocation, value);
            commitAdvance(withRating, hop.stage);
          }}
          onAcceptContinueWithoutRating={() => commitAdvance(session, "accept")}
          pendingAlternativeAction={pendingAlternativeAction}
          pendingAlternativeActionDuration={pendingAlternativeActionDuration}
          onConfirmPlannedAction={() => setSession(applyPlannedActionConfirmed(session))}
          onChangeAlternativeAction={(text) => setPendingAlternativeAction(text)}
          onSelectAlternativeActionDuration={(minutes) => setPendingAlternativeActionDuration(minutes)}
          onSubmitAlternativeAction={() => {
            if (!hasValidAlternativeAction(pendingAlternativeAction, pendingAlternativeActionDuration)) return;
            setSession(applyAlternativeAction(session, pendingAlternativeAction, pendingAlternativeActionDuration));
            setPendingAlternativeAction("");
            setPendingAlternativeActionDuration(null);
          }}
          onActionImageryContinue={() => setSession(applyActionImageryCompleted(session))}
          onSelectBeneficialActionDuration={(minutes) => setSession(applyBeneficialActionDurationSelected(session, minutes))}
          onActionCompleted={() => commitAdvance(applyActionCompletion(session, true))}
          onSuccessFocusExtraMinutesSubmit={(minutes) => setSession(applySuccessFocusExtraMinutes(session, minutes))}
          onWantsFutureSuccessFocusAnswer={(yes) => {
            const patched = applyWantsFutureSuccessFocus(session, yes);
            // "לא": nothing left to ask -- continue through the existing
            // downstream flow immediately, exactly like every other
            // "stay at this stage" interstitial's terminal "no" branch.
            // "כן": stay on this stage -- FutureSuccessFocusScheduleScreen
            // renders next (see live/ArcLiveRenderer.tsx).
            if (yes) {
              setSession(patched);
            } else {
              commitAdvance(patched);
            }
          }}
          futureSuccessFocusScheduleOptions={DEFERRAL_OPTIONS}
          onScheduleFutureSuccessFocus={(option, durationMinutes) => {
            // Persists+schedules the future run (data/reminders.ts's
            // scheduleFutureSuccessFocus reuses the existing PendingReminder
            // for the start ping and TimerRun for the future-anchored
            // completion timer, cancelling any previously-scheduled one
            // first -- never a duplicate/orphaned notification), then
            // lets the session progress past success_focus exactly as
            // before this task -- scheduling never blocks finishing
            // this session.
            scheduleFutureSuccessFocus({ option, durationMinutes });
            commitAdvance(session);
          }}
          negativeActionDurationMinutes={negativeActionDurationMinutes}
          onNegativeActionStart={() => setSession(applyNegativeActionStarted(session))}
          onNegativeActionCompleted={() => commitAdvance(session)}
          resumedNegativeActionRun={resumedNegativeActionRun}
          gratitudeText={gratitudeText}
          onChangeGratitudeText={setGratitudeText}
          gratitudeMemoryDetailText={gratitudeMemoryDetailText}
          onChangeGratitudeMemoryDetailText={setGratitudeMemoryDetailText}
          restartLabel={routine ? "המשך להתמקדות בהצלחה" : undefined}
          onRestart={restart}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flexGrow: 1,
    padding: 24,
    // Layout-refinement task: top-anchored, NOT vertically centered.
    // Centering (the previous value here) made the ENTIRE content block
    // re-center every time it grew -- e.g. a rating question/scale
    // appearing underneath already-visible protocol text -- which reads
    // as the existing protocol content jumping upward. A top anchor
    // means growing content only ever extends downward from its
    // existing position; the surrounding ScrollView (unchanged) already
    // provides scrolling once content exceeds the viewport, so nothing
    // needs to shrink or recenter to fit.
    justifyContent: "flex-start",
  },
});
