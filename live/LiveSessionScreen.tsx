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
import { Stack, router, useFocusEffect } from "expo-router";

import type { ArcBuildProfile, ArcLiveState, ArcStage, DevelopmentLayer } from "../arc/types.ts";
import { createEmptyLiveState } from "../arc/types.ts";
import { getFirstArcStage } from "../arc/arcEngine.ts";
import { getStageCopy } from "../arc/stageCopy.ts";
import { getProgramDefinition, resolveNegativeActionDuration } from "../program/engine.ts";
import {
  loadProfile,
  loadProgramProgress,
  loadProgramSelection,
  saveProgramProgress,
  appendSessionLogEntry,
  updateLastSessionLogEntryGratitude,
  loadTimerRun,
  clearTimerRun,
} from "../data/storage.ts";
import type { TimerRun } from "../data/storage.ts";
import { recordValidLiveCompletion } from "../program/progress.ts";
import { todayLocalDateString } from "../program/dateUtils.ts";
import {
  advanceLiveSession,
  applyActionCompletion,
  applyActionImageryCompleted,
  applyAlternativeAction,
  applyBeneficialActionDurationSelected,
  applyNegativeActionStarted,
  applyPlannedActionConfirmed,
  applyRegulationToolUsed,
  applyScaleAnswer,
  applySensationAnswer,
  applySuccessFocusChoice,
  applyTargetSelection,
  applyTriggerSelection,
  applyYesNoAnswer,
  hasValidAlternativeAction,
  resolveSensationLocation,
} from "./liveEventAdapter.ts";
import { getAvailableLiveTriggers } from "../arc/arcEngine.ts";
import { DEFERRAL_OPTIONS, scheduleDeferredReminder } from "../data/reminders.ts";
import type { DeferralOption } from "../data/reminders.ts";
import { ArcLiveRenderer } from "./ArcLiveRenderer.tsx";
import { ActionScreen } from "./screens.tsx";

export default function LiveSessionScreen() {
  const [profile, setProfile] = useState<ArcBuildProfile | null>(null);
  const [activeLayers, setActiveLayers] = useState<DevelopmentLayer[]>([]);
  const [currentProgramWeek, setCurrentProgramWeek] = useState(1);
  const [session, setSession] = useState<ArcLiveState>(() => createEmptyLiveState());
  const [stage, setStage] = useState<ArcStage>("trigger_selection");
  const [pendingSensationLocation, setPendingSensationLocation] = useState("");
  const [pendingCustomSensationLocation, setPendingCustomSensationLocation] = useState("");
  const [pendingSensationLocationUnclear, setPendingSensationLocationUnclear] = useState(false);
  const [pendingAlternativeAction, setPendingAlternativeAction] = useState("");
  const [pendingAlternativeActionDuration, setPendingAlternativeActionDuration] = useState<number | null>(null);
  const [successFocusMinutes, setSuccessFocusMinutes] = useState<number | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState(() => new Date().toISOString());
  const [gratitudeText, setGratitudeText] = useState("");
  // Resumed timer runs -- see this file's module doc. At most one is
  // ever non-null at a time. resumedBeneficialActionRun bypasses the
  // normal render pipeline entirely (below); the other two flow
  // through the normal ArcLiveRenderer pipeline instead, since
  // success_focus/negative_action's copy never depends on
  // triggerType/selectedTarget/selectedAction the way "act"'s does.
  const [resumedBeneficialActionRun, setResumedBeneficialActionRun] = useState<TimerRun | null>(null);
  const [resumedSuccessCodingRun, setResumedSuccessCodingRun] = useState<TimerRun | null>(null);
  const [resumedNegativeActionRun, setResumedNegativeActionRun] = useState<TimerRun | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      // loadProgramSelection() is loaded for completeness (per the LIVE
      // load contract) even though today's routing only needs
      // activeLayers, which loadProgramProgress() already derives from
      // ProgramDefinition -- see program/engine.ts. The three
      // loadTimerRun() calls are the one exception to "always start
      // fresh" -- see this file's module doc.
      Promise.all([
        loadProfile(),
        loadProgramProgress(),
        loadProgramSelection(),
        loadTimerRun("beneficialAction"),
        loadTimerRun("successCoding"),
        loadTimerRun("negativeAction"),
      ]).then(([loadedProfile, loadedProgress, , beneficialActionRun, successCodingRun, negativeActionRun]) => {
        if (cancelled) return;
        if (!loadedProfile || !loadedProgress) {
          router.replace("/build");
          return;
        }
        setProfile(loadedProfile);
        setActiveLayers(loadedProgress.activeLayers);
        setCurrentProgramWeek(loadedProgress.currentProgramWeek);
        setPendingSensationLocation("");
        setPendingCustomSensationLocation("");
        setPendingSensationLocationUnclear(false);
        setPendingAlternativeAction("");
        setPendingAlternativeActionDuration(null);
        setSuccessFocusMinutes(null);
        setGratitudeText("");

        if (beneficialActionRun) {
          setResumedBeneficialActionRun(beneficialActionRun);
          setResumedSuccessCodingRun(null);
          setResumedNegativeActionRun(null);
          setSessionStartedAt(beneficialActionRun.actionStartedAt);
          return;
        }

        if (successCodingRun) {
          setResumedBeneficialActionRun(null);
          setResumedSuccessCodingRun(successCodingRun);
          setResumedNegativeActionRun(null);
          setSessionStartedAt(successCodingRun.actionStartedAt);
          // Rejoins the normal pipeline at success_focus, the same
          // stage the unconditional act -> success_focus transition
          // would have already reached. actionReached/realActionCompleted
          // are asserted true because success_focus is only reachable
          // after "act" genuinely completed -- Training Day credit
          // stays correct if this resumed session goes on to complete.
          // successFocusChoice is pre-set to "now" -- a real Success
          // Coding timer is already running, so the now/later choice
          // (only relevant before the timer starts) must never be
          // re-asked here.
          setSession({
            ...createEmptyLiveState(),
            currentArcStage: "success_focus",
            actionReached: true,
            realActionCompleted: true,
            successFocusChoice: "now",
          });
          setStage("success_focus");
          return;
        }

        if (negativeActionRun) {
          setResumedBeneficialActionRun(null);
          setResumedSuccessCodingRun(null);
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
        setResumedSuccessCodingRun(null);
        setResumedNegativeActionRun(null);
        setSession(createEmptyLiveState());
        setStage(getFirstArcStage());
        setSessionStartedAt(new Date().toISOString());
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const finalizeSession = (finishedSession: ArcLiveState) => {
    const finishedAt = new Date().toISOString();
    appendSessionLogEntry({
      id: `${sessionStartedAt}_${finishedAt}`,
      startedAt: sessionStartedAt,
      finishedAt,
      success: finishedSession.realActionCompleted,
      fall: false, // see README: no interfering-action-window stage exists in this ArcStage list yet
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
    // Each timer's persisted run is cleared the moment its own stage is
    // left -- the only way out of any of the three is its real activity
    // actually completing (act -> success_focus, success_focus ->
    // negative_action/complete, negative_action -> complete are all
    // unconditional in arc/arcEngine.ts once reached). Never clears a
    // DIFFERENT timer type's run.
    if (stage === "act" && nextStage !== "act") clearTimerRun("beneficialAction");
    if (stage === "success_focus" && nextStage !== "success_focus") clearTimerRun("successCoding");
    if (stage === "negative_action" && nextStage !== "negative_action") clearTimerRun("negativeAction");
    setSession(nextSession);
    setStage(nextStage);
    setPendingSensationLocation("");
    setPendingCustomSensationLocation("");
    setPendingSensationLocationUnclear(false);
    setPendingAlternativeAction("");
    setPendingAlternativeActionDuration(null);
    setSuccessFocusMinutes(null);
    if (nextStage === "complete") {
      finalizeSession(nextSession);
    }
  };

  const restart = () => {
    // Reinforcement's optional Gratitude entry (#10): attached to the
    // just-finalized session log entry here, decoupled from
    // finalizeSession() itself so a completed session is always logged
    // immediately on reaching "complete" -- never lost if the trainee
    // navigates away before typing anything.
    const trimmedGratitude = gratitudeText.trim();
    updateLastSessionLogEntryGratitude(trimmedGratitude.length > 0 ? trimmedGratitude : null);

    // Defensive: by the time restart() is reachable every timer's
    // anchor should already be cleared (commitAdvance clears each one
    // the moment its own stage is left), but never let a stale one
    // leak into the next session regardless.
    clearTimerRun("beneficialAction");
    clearTimerRun("successCoding");
    clearTimerRun("negativeAction");
    setResumedBeneficialActionRun(null);
    setResumedSuccessCodingRun(null);
    setResumedNegativeActionRun(null);
    setSession(createEmptyLiveState());
    setStage(getFirstArcStage());
    setPendingSensationLocation("");
    setPendingCustomSensationLocation("");
    setPendingSensationLocationUnclear(false);
    setPendingAlternativeAction("");
    setPendingAlternativeActionDuration(null);
    setSuccessFocusMinutes(null);
    setSessionStartedAt(new Date().toISOString());
    setGratitudeText("");
  };

  if (!profile) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Stack.Screen options={{ title: "ARCHI LIVE" }} />
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

  const copy = getStageCopy(stage, profile, session, activeLayers);
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
          availableTriggers={availableTriggers}
          pendingSensationLocation={pendingSensationLocation}
          pendingCustomSensationLocation={pendingCustomSensationLocation}
          pendingSensationLocationUnclear={pendingSensationLocationUnclear}
          successFocusMinutes={successFocusMinutes}
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
          onAcceptAnswer={(yes) => setSession(applyYesNoAnswer("accept", session, yes))}
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
          onSuccessFocusChoice={(choice) => setSession(applySuccessFocusChoice(session, choice))}
          onSelectSuccessFocusMinutes={(minutes) => setSuccessFocusMinutes(minutes)}
          onSuccessFocusContinue={() => commitAdvance(session)}
          deferralOptions={DEFERRAL_OPTIONS}
          onDeferSuccessFocus={(option, withArc) => {
            // Schedules exactly one reminder for this kind
            // (data/reminders.ts's scheduleDeferredReminder replaces
            // any previously-pending "focusSuccess" reminder first, so
            // this can never create a duplicate) and lets the session
            // progress past success_focus exactly as choosing "now" and
            // finishing the timer flow would have -- the Success Coding
            // timer itself is never started for this session.
            scheduleDeferredReminder({
              kind: "focusSuccess",
              option,
              arcRequested: withArc,
              title: "התמקדות בהצלחה",
              body: withArc ? "זמן להתמקדות בהצלחה עם ARC." : "זמן להתמקדות בהצלחה.",
            });
            commitAdvance(session);
          }}
          resumedSuccessCodingRun={resumedSuccessCodingRun}
          negativeActionDurationMinutes={negativeActionDurationMinutes}
          onNegativeActionStart={() => setSession(applyNegativeActionStarted(session))}
          onNegativeActionCompleted={() => commitAdvance(session)}
          resumedNegativeActionRun={resumedNegativeActionRun}
          gratitudeText={gratitudeText}
          onChangeGratitudeText={setGratitudeText}
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
