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
import { getStageCopy, getYesNoLabels } from "../arc/stageCopy.ts";
import {
  getAvailableProactiveTargets,
  getAvailableReactiveExperiences,
  needsProactiveTargetSelection,
  needsReactiveStateSelection,
  resolveActionDuration,
  resolveActPhase,
} from "../arc/arcEngine.ts";
import { getSuccessFocusReinforcement } from "../arc/reinforcement.ts";
import {
  AcceptScreen,
  ActionChoiceScreen,
  ActionImageryScreen,
  ActionPreparationScreen,
  ActionScreen,
  CompleteScreen,
  DesiredStateRatingScreen,
  EncodingScreen,
  InstructionScreen,
  PresenceRatingScreen,
  PreventiveActionCheckScreen,
  ProactiveTargetScreen,
  ReactiveStateSelectScreen,
  RegulationScreen,
  SensationRatingScreen,
  StayScreen,
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
  pendingAlternativeAction: string;
  pendingAlternativeActionDuration: number | null;
  onConfirmPlannedAction: () => void;
  onChangeAlternativeAction: (text: string) => void;
  onSelectAlternativeActionDuration: (minutes: number) => void;
  onSubmitAlternativeAction: () => void;
  onActionImageryContinue: () => void;
  onActionPreparationContinue: () => void;
  onActionCompleted: () => void;
  onSelectSuccessFocusMinutes: (minutes: number) => void;
  onSuccessFocusContinue: () => void;
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
    case "arc_thought_expand_presence":
    case "preventive_action":
      // key={stage}: these four adjacent stages all render this same
      // InstructionScreen component -- without a key that changes per
      // stage, React would reuse the same instance across the
      // transition and its internal elapsed-time clock (useElapsedSeconds,
      // in live/screens.tsx) would keep running instead of resetting.
      // See arc/instructionTiming.ts's module doc, #9/#12.
      return <InstructionScreen key={stage} copy={copy} onContinue={props.onGenericContinue} />;

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

    case "accept":
      return <AcceptScreen copy={copy} labels={getYesNoLabels(stage)} onAnswer={props.onYesNoAnswer} />;

    case "reactive_transition_check":
      return <TransitionCheckScreen copy={copy} labels={getYesNoLabels(stage)} onAnswer={props.onYesNoAnswer} />;

    case "regulate":
      return <RegulationScreen key={stage} copy={copy} onContinue={props.onRegulateContinue} />;

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
      // Which of the "act" stage's four sub-phases to show -- same
      // "stay at this ArcStage, render a conditional interstitial"
      // pattern as trigger_selection's reactive chooser /
      // desired_state_check's proactive-target picker, extended to a
      // fixed one-directional sequence. See arc/arcEngine.ts's
      // resolveActPhase doc. Each sub-phase is a distinct component, so
      // switching between them already remounts (resetting any timing
      // state) with no explicit key needed here.
      const actPhase = resolveActPhase(
        session.plannedActionConfirmed,
        session.selectedAction,
        session.actionImageryCompleted,
        session.actionPreparationCompleted
      );

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

      if (actPhase === "preparation") {
        return <ActionPreparationScreen copy={copy} onContinue={props.onActionPreparationContinue} />;
      }

      // actPhase === "performing": the actual timed Action. The Action
      // Timer's duration is resolved independently of `copy` (which only
      // carries display text) -- the same resolver Encoding/Imagery/
      // Preparation never call, since the timer must never start before
      // this phase.
      const durationMinutes = resolveActionDuration(session.selectedActionDuration, profile);
      return <ActionScreen copy={copy} durationMinutes={durationMinutes} onCompleted={props.onActionCompleted} />;
    }

    case "success_focus":
      return (
        <SuccessFocusScreen
          copy={copy}
          minutesOptions={SUCCESS_FOCUS_MINUTES}
          selectedMinutes={props.successFocusMinutes}
          onSelectMinutes={props.onSelectSuccessFocusMinutes}
          reinforcementText={props.successFocusMinutes !== null ? getSuccessFocusReinforcement(props.successFocusMinutes) : ""}
          onContinue={props.onSuccessFocusContinue}
        />
      );

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
