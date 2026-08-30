/**
 * live/ArcLiveRenderer.tsx
 *
 * The one place ArcStage maps to a UI component. LiveSessionScreen.tsx
 * asks "what should I render for this stage" by rendering this
 * component; this component asks the Engine (via needsProactiveTargetSelection)
 * only whether a target-selection interstitial is needed before
 * desired_state_check -- every other stage maps 1:1 to a named screen
 * from live/screens.tsx. No stage transition or threshold decision
 * happens here; every callback just forwards the raw answer to
 * LiveSessionScreen, which runs it through live/liveEventAdapter.ts.
 */

import type { ArcBuildProfile, ArcLiveState, ArcStage, DevelopmentLayer, TriggerType } from "../arc/types.ts";
import type { ArcStageCopy } from "../arc/stageCopy.ts";
import { getInlineRequiredRatingQuestion, getStageCopy, getYesNoLabels } from "../arc/stageCopy.ts";
import {
  getAvailableProactiveTargets,
  getAvailableReactiveExperiences,
  getNextArcStage,
  isAcceptanceWillingnessLoopCapped,
  needsProactiveTargetSelection,
  needsReactiveStateSelection,
  resolveActionDuration,
  resolveActPhase,
  resolveEncodingTarget,
} from "../arc/arcEngine.ts";
import { resolveDwellSecondsFor } from "../arc/dwellTimes.ts";
import { getSuccessFocusReinforcement } from "../arc/reinforcement.ts";
import type { TimerRun } from "../data/storage.ts";
import type { DeferralOption } from "../data/reminders.ts";
import {
  AcceptScreen,
  ActionChoiceScreen,
  ActionImageryScreen,
  ActionScreen,
  BeneficialActionDurationChoiceScreen,
  CompleteScreen,
  DesiredStateRatingScreen,
  EncodingScreen,
  InstructionScreen,
  NegativeActionScreen,
  NegativeActionStartScreen,
  PresenceExperienceScreen,
  PresenceRatingScreen,
  PreventiveActionCheckScreen,
  ProactiveTargetScreen,
  ReactiveStateSelectScreen,
  RegulationScreen,
  SensationRatingScreen,
  StayScreen,
  SuccessFocusChoiceScreen,
  SuccessFocusDeferralScreen,
  SuccessFocusScreen,
  TransitionCheckScreen,
  TriggerSelectScreen,
} from "./screens.tsx";

const BODY_LOCATIONS = ["חזה", "בטן", "גרון", "כתפיים", "ראש"];
const SUCCESS_FOCUS_MINUTES = [0, 5, 10, 15, 20];
const ALTERNATIVE_ACTION_DURATION_MINUTES = [5, 10, 15, 20, 30];

const TRIGGER_LABELS: Record<TriggerType, string> = {
  reactive_emotion: "אני מרגיש משהו שמפריע לי",
  reactive_urge: "יש לי דחף להרגל",
  proactive: "אני רוצה ליצור מצב או להתחיל פעולה",
};

export interface ArcLiveRendererProps {
  stage: ArcStage;
  session: ArcLiveState;
  profile: ArcBuildProfile;
  activeLayers: DevelopmentLayer[];
  availableTriggers: TriggerType[];
  pendingSensationLocation: string;
  pendingCustomSensationLocation: string;
  pendingSensationLocationUnclear: boolean;
  successFocusMinutes: number | null;
  onSelectTrigger: (trigger: TriggerType) => void;
  onScaleAnswer: (value: number) => void;
  onSelectSensationLocation: (location: string) => void;
  onChangeCustomSensationLocation: (text: string) => void;
  onSelectSensationLocationUnclear: () => void;
  onSubmitSensationIntensity: (value: number) => void;
  onYesNoAnswer: (yes: boolean) => void;
  onSelectTarget: (target: DevelopmentLayer) => void;
  onSelectReactiveExperience: (target: DevelopmentLayer) => void;
  onGenericContinue: () => void;
  onRegulateContinue: () => void;
  onPresenceExperienceRating: (value: number) => void;
  onRegulationExperienceRating: (value: number) => void;
  onAcceptWillingnessAnswer: (yes: boolean) => void;
  onAcceptIntensityRating: (value: number) => void;
  onAcceptContinueWithoutRating: () => void;
  pendingAlternativeAction: string;
  pendingAlternativeActionDuration: number | null;
  onConfirmPlannedAction: () => void;
  onChangeAlternativeAction: (text: string) => void;
  onSelectAlternativeActionDuration: (minutes: number) => void;
  onSubmitAlternativeAction: () => void;
  onActionImageryContinue: () => void;
  onSelectBeneficialActionDuration: (minutes: number) => void;
  onActionCompleted: () => void;
  onSuccessFocusChoice: (choice: "now" | "later") => void;
  onSelectSuccessFocusMinutes: (minutes: number) => void;
  onSuccessFocusContinue: () => void;
  deferralOptions: DeferralOption[];
  onDeferSuccessFocus: (option: DeferralOption, withArc: boolean) => void;
  resumedSuccessCodingRun: TimerRun | null;
  negativeActionDurationMinutes: number | null;
  onNegativeActionStart: () => void;
  onNegativeActionCompleted: () => void;
  resumedNegativeActionRun: TimerRun | null;
  gratitudeText: string;
  onChangeGratitudeText: (text: string) => void;
  onRestart: () => void;
}

export function ArcLiveRenderer(props: ArcLiveRendererProps) {
  const { stage, session, profile, activeLayers } = props;
  const copy: ArcStageCopy = getStageCopy(stage, profile, session, activeLayers);

  switch (stage) {
    case "trigger_selection": {
      // Reactive recognition chooser: stays at trigger_selection (same
      // interstitial pattern as desired_state_check's proactive-target
      // picker below) while 2+ mapped reactive experiences exist and
      // none is chosen yet -- see needsReactiveStateSelection.
      if (needsReactiveStateSelection(session.triggerType, activeLayers, profile, session.selectedTarget)) {
        const experiences = getAvailableReactiveExperiences(activeLayers, profile);
        return <ReactiveStateSelectScreen copy={copy} experiences={experiences} onSelect={props.onSelectReactiveExperience} />;
      }
      return (
        <TriggerSelectScreen
          copy={copy}
          availableTriggers={props.availableTriggers}
          labels={TRIGGER_LABELS}
          onSelect={props.onSelectTrigger}
        />
      );
    }

    case "presence_check":
    case "arc_thought_presence_recheck":
      return <PresenceRatingScreen copy={copy} onSelect={props.onScaleAnswer} />;

    case "arc_thought_awareness":
    case "arc_thought_combined_attention":
    case "preventive_action":
      // key={stage}: these three adjacent stages all render this same
      // InstructionScreen component -- without a key that changes per
      // stage, React would reuse the same instance across the
      // transition and its internal elapsed-time clock (useElapsedSeconds,
      // in live/screens.tsx) would keep running instead of resetting.
      // See arc/instructionTiming.ts's module doc, #9/#12.
      return <InstructionScreen key={stage} copy={copy} onContinue={props.onGenericContinue} />;

    case "arc_thought_expand_presence": {
      // Timing-update task: the Presence Rating that used to live on
      // its own separate arc_thought_presence_recheck page is now shown
      // inline on this same page instead (see live/screens.tsx's
      // PresenceExperienceScreen) -- arc_thought_presence_recheck is
      // never itself rendered as the current stage anymore, but its own
      // getNextArcStage transition (loop-back-if-still-low, capped by
      // ARC_CONFIG.safety.maxLoopIterations, or continue) is still
      // exactly what decides what happens after the rating is selected
      // -- see live/LiveSessionScreen.tsx's onPresenceExperienceRating.
      // Visual-refinement task: the inline prompt itself is the fixed,
      // concise getInlineRequiredRatingQuestion("presence") line, not
      // arc_thought_presence_recheck's own title+body copy -- that
      // copy is untouched and still used by its OTHER, standalone entry
      // point (presence_check). key incorporates loopIterationCount
      // (not just stage) so a loop-back -- which re-enters this exact
      // same stage value -- still remounts and resets the timing/rating
      // reveal from scratch, the same way key={stage} alone already
      // does for every OTHER pair of genuinely different adjacent
      // stages above.
      return (
        <PresenceExperienceScreen
          key={`${stage}-${session.loopIterationCount}`}
          copy={copy}
          question={getInlineRequiredRatingQuestion("presence")}
          onSelectRating={props.onPresenceExperienceRating}
        />
      );
    }

    case "preventive_action_check":
      return <PreventiveActionCheckScreen copy={copy} labels={getYesNoLabels(stage)} onAnswer={props.onYesNoAnswer} />;

    case "sensation_check": {
      const isHabitSensation = session.triggerType === "reactive_urge";
      const isRecheck = session.sensationLocation !== null || session.sensationIntensity !== null;
      return (
        <SensationRatingScreen
          copy={copy}
          showLocationPicker={!isHabitSensation && !isRecheck}
          locations={BODY_LOCATIONS}
          selectedLocation={props.pendingSensationLocation}
          customLocation={props.pendingCustomSensationLocation}
          locationUnclear={props.pendingSensationLocationUnclear}
          onSelectLocation={props.onSelectSensationLocation}
          onChangeCustomLocation={props.onChangeCustomSensationLocation}
          onSelectLocationUnclear={props.onSelectSensationLocationUnclear}
          onSelectIntensity={props.onSubmitSensationIntensity}
        />
      );
    }

    case "stay":
      return <StayScreen key={stage} copy={copy} onContinue={props.onGenericContinue} />;

    case "accept": {
      // Timing-update task: the intensity recheck that used to live on
      // its own separate sensation_check page immediately after Accept
      // is now shown inline on this same page instead (see
      // live/screens.tsx's AcceptScreen). Peeking the engine's own real
      // "accept" transition (unchanged, same getNextArcStage case) is
      // what decides whether a rating is even expected next: it isn't
      // once the loop-safety cap has been reached (accept's own
      // transition goes straight to "regulate" in that case, exactly as
      // it always has) -- question stays null then, and the screen
      // falls back to a plain Continue once the dwell elapses.
      // Otherwise the inline prompt is the fixed, concise
      // getInlineRequiredRatingQuestion("intensity") line, not
      // sensation_check's own title+body copy -- that copy is untouched
      // and still used by its other, standalone entry points.
      // sensation_check's own getNextArcStage transition still decides
      // what happens after the rating is selected -- see
      // live/LiveSessionScreen.tsx's onAcceptIntensityRating. Answering
      // yes/no never itself advances the ArcStage anymore -- only the
      // rating (or the no-rating Continue) does, so key={stage} alone
      // (not loopIterationCount) is enough here: unlike
      // Presence/Regulation, "accept" is never the stage looped back TO
      // (its own loop-back target is "stay", a different stage value,
      // which already remounts on its own) -- the NEW unwillingness
      // sub-flow's own rounds instead remount individually via
      // AcceptanceUnwillingnessRound's own key, inside the same
      // AcceptScreen mount (see live/screens.tsx).
      //
      // Dwell-time task: the CURRENT target's own configured Acceptance
      // dwell (arc/dwellTimes.ts) governs both the normal "כן" path and
      // every round of the "לא" unwillingness sub-flow -- resolved once
      // here, from the SAME layer resolution every other stage uses
      // (never another target's configuration), and passed straight
      // through to AcceptScreen.
      const { layer } = resolveEncodingTarget({
        activeLayers,
        triggerType: session.triggerType,
        selectedTarget: session.selectedTarget,
        buildProfile: profile,
      });
      const acceptanceDwellSeconds = resolveDwellSecondsFor("acceptanceDwellSeconds", layer, profile);
      const peek = getNextArcStage("accept", session, profile, activeLayers);
      const question = peek.stage === "sensation_check" ? getInlineRequiredRatingQuestion("intensity") : null;
      return (
        <AcceptScreen
          key={stage}
          copy={copy}
          labels={getYesNoLabels(stage)}
          question={question}
          acceptanceDwellSeconds={acceptanceDwellSeconds}
          willingnessLoopCount={session.acceptanceWillingnessLoopCount}
          willingnessCapped={isAcceptanceWillingnessLoopCapped(session.acceptanceWillingnessLoopCount)}
          onWillingnessAnswer={props.onAcceptWillingnessAnswer}
          onSelectRating={props.onAcceptIntensityRating}
          onContinueWithoutRating={props.onAcceptContinueWithoutRating}
        />
      );
    }

    case "reactive_transition_check":
      return <TransitionCheckScreen copy={copy} labels={getYesNoLabels(stage)} onAnswer={props.onYesNoAnswer} />;

    case "regulate": {
      // Timing-update task: the Desired State Level check (proactive)
      // or intensity recheck (reactive) that used to live on its own
      // separate page immediately after Regulation is now shown inline
      // on this same page instead (see live/screens.tsx's
      // RegulationScreen). Peeking the engine's own real "regulate"
      // transition (unchanged, same getNextArcStage case) is what
      // decides whether a rating is even expected next: it isn't once
      // the loop-safety cap has been reached (regulate's own transition
      // goes straight to "encode" in that case, exactly as it always
      // has) -- question stays null then, and the screen falls back to
      // the same plain Continue regulate always had. Otherwise the
      // inline prompt is the fixed, concise
      // getInlineRequiredRatingQuestion("desiredState"/"intensity")
      // line, not desired_state_check's/sensation_check's own
      // title+body copy -- that copy is untouched and still used by
      // their other, standalone entry points. The peeked stage's own
      // getNextArcStage transition (getProactiveStage/getReactiveStage,
      // loop-back capped the same way) still decides what happens
      // after the rating is selected -- see
      // live/LiveSessionScreen.tsx's onRegulationExperienceRating. key
      // incorporates loopIterationCount for the same reason as
      // arc_thought_expand_presence above: a loop back to "regulate"
      // re-enters this exact same stage value and must still remount.
      const peek = getNextArcStage("regulate", session, profile, activeLayers);
      const question =
        peek.stage === "desired_state_check"
          ? getInlineRequiredRatingQuestion("desiredState")
          : peek.stage === "sensation_check"
            ? getInlineRequiredRatingQuestion("intensity")
            : null;
      return (
        <RegulationScreen
          key={`${stage}-${session.loopIterationCount}`}
          copy={copy}
          question={question}
          onContinue={props.onRegulateContinue}
          onSelectRating={props.onRegulationExperienceRating}
        />
      );
    }

    case "desired_state_check": {
      if (needsProactiveTargetSelection(session.triggerType, activeLayers, profile, session.selectedTarget)) {
        const targets = getAvailableProactiveTargets(activeLayers, profile);
        return <ProactiveTargetScreen targets={targets} onSelect={props.onSelectTarget} />;
      }
      return <DesiredStateRatingScreen copy={copy} onSelect={props.onScaleAnswer} />;
    }

    case "encode":
      return <EncodingScreen key={stage} copy={copy} onContinue={props.onGenericContinue} />;

    case "act": {
      // Which of the "act" stage's three sub-phases to show -- same
      // "stay at this ArcStage, render a conditional interstitial"
      // pattern as trigger_selection's reactive chooser /
      // desired_state_check's proactive-target picker, extended to a
      // fixed one-directional sequence. See arc/arcEngine.ts's
      // resolveActPhase doc. Each sub-phase is a distinct component, so
      // switching between them already remounts (resetting any timing
      // state) with no explicit key needed here. The standalone Action
      // Preparation sub-phase that used to sit between imagery and
      // performing is removed -- imagery goes straight to performing.
      const actPhase = resolveActPhase(session.plannedActionConfirmed, session.selectedAction, session.actionImageryCompleted);

      if (actPhase === "choice") {
        return (
          <ActionChoiceScreen
            copy={copy}
            alternativeText={props.pendingAlternativeAction}
            alternativeDuration={props.pendingAlternativeActionDuration}
            durationOptions={ALTERNATIVE_ACTION_DURATION_MINUTES}
            onConfirmPlanned={props.onConfirmPlannedAction}
            onChangeAlternativeText={props.onChangeAlternativeAction}
            onSelectAlternativeDuration={props.onSelectAlternativeActionDuration}
            onSubmitAlternative={props.onSubmitAlternativeAction}
          />
        );
      }

      if (actPhase === "imagery") {
        return <ActionImageryScreen copy={copy} onContinue={props.onActionImageryContinue} />;
      }

      // actPhase === "performing": the actual timed Action. Timer-update
      // task: the Beneficial Action Timer now uses a trainee-chosen
      // duration (5-10 minutes) rather than silently reusing whatever
      // was configured in BUILD -- but only on the PLANNED-action path
      // (session.selectedAction === null); the alternative-action path
      // already has its own session-specific duration, chosen back on
      // ActionChoiceScreen, and is left completely alone. Until that
      // choice is made, show BeneficialActionDurationChoiceScreen
      // instead of starting the timer -- mirrors the established
      // "stay at this ArcStage, render a conditional interstitial"
      // pattern used throughout this switch, so no new ArcStage/timer
      // system is introduced.
      const needsBeneficialActionDuration = session.selectedAction === null && session.beneficialActionDurationMinutes === null;
      if (needsBeneficialActionDuration) {
        return <BeneficialActionDurationChoiceScreen copy={copy} onSelectDuration={props.onSelectBeneficialActionDuration} />;
      }
      // The Action Timer's duration is resolved independently of `copy`
      // (which only carries display text) -- the same resolver
      // Encoding/Imagery never call, since the timer must never start
      // before this phase.
      const durationMinutes = resolveActionDuration(session.selectedActionDuration, profile, session.beneficialActionDurationMinutes);
      // resumedRun is never passed here: a resumed Beneficial Action
      // Timer bypasses ArcLiveRenderer entirely (see
      // live/LiveSessionScreen.tsx's module doc) since reconstructing
      // this specific copy's triggerType/selectedTarget/selectedAction
      // with full fidelity isn't reliably possible -- the resume path
      // renders ActionScreen directly, from the persisted copy snapshot.
      return <ActionScreen copy={copy} durationMinutes={durationMinutes} onCompleted={props.onActionCompleted} />;
    }

    case "success_focus": {
      // Reminder/timer-update task: Success Focus is no longer forced
      // immediately -- see live/screens.tsx's SuccessFocusChoiceScreen/
      // SuccessFocusDeferralScreen. session.successFocusChoice is
      // pre-set to "now" when resuming an already-in-progress Success
      // Coding timer (see live/LiveSessionScreen.tsx's resume handling)
      // so a resumed run never re-asks the now/later question.
      if (session.successFocusChoice === null) {
        return <SuccessFocusChoiceScreen copy={copy} onChoose={props.onSuccessFocusChoice} />;
      }
      if (session.successFocusChoice === "later") {
        return <SuccessFocusDeferralScreen copy={copy} options={props.deferralOptions} onConfirm={props.onDeferSuccessFocus} />;
      }
      // "now": the existing, completely unchanged flow. Unlike "act"'s
      // Beneficial Action Timer, this stage's copy never depends on
      // triggerType/selectedTarget/selectedAction -- so a resumed run
      // can safely flow through the normal pipeline here (see
      // live/LiveSessionScreen.tsx's resume handling), rather than
      // needing its own bypass.
      return (
        <SuccessFocusScreen
          copy={copy}
          durationMinutes={profile.successFocusDuration}
          resumedRun={props.resumedSuccessCodingRun}
          minutesOptions={SUCCESS_FOCUS_MINUTES}
          selectedMinutes={props.successFocusMinutes}
          onSelectMinutes={props.onSelectSuccessFocusMinutes}
          reinforcementText={props.successFocusMinutes !== null ? getSuccessFocusReinforcement(props.successFocusMinutes) : ""}
          onContinue={props.onSuccessFocusContinue}
        />
      );
    }

    case "negative_action": {
      // The trainee's own predefined negative/interfering action
      // (profile.habit, via copy) -- see arc/arcEngine.ts's
      // needsNegativeAction for when this stage is even reached, and
      // arc/types.ts's ArcLiveState.negativeActionStarted for why this
      // stage (unlike Beneficial Action/Success Focus) needs an
      // explicit "begin" screen: the Negative Action Timer never
      // auto-starts. Same resume reasoning as success_focus: this
      // stage's copy never depends on triggerType/selectedTarget/
      // selectedAction, so a resumed run flows through normally.
      if (!session.negativeActionStarted) {
        return (
          <NegativeActionStartScreen
            copy={copy}
            durationMinutes={props.negativeActionDurationMinutes}
            onStart={props.onNegativeActionStart}
          />
        );
      }
      return (
        <NegativeActionScreen
          copy={copy}
          durationMinutes={props.negativeActionDurationMinutes}
          resumedRun={props.resumedNegativeActionRun}
          onCompleted={props.onNegativeActionCompleted}
        />
      );
    }

    case "complete":
      return (
        <CompleteScreen
          copy={copy}
          gratitudeText={props.gratitudeText}
          onChangeGratitudeText={props.onChangeGratitudeText}
          onRestart={props.onRestart}
        />
      );
  }
}
