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
import { CHALLENGE_RECOGNITION_LABELS, getStageCopy, getYesNoLabels } from "../arc/stageCopy.ts";
import { getAvailableProactiveTargets, getPreventiveActionSubStage, needsProactiveTargetSelection } from "../arc/arcEngine.ts";
import { getSuccessFocusReinforcement } from "../arc/reinforcement.ts";
import type { ArcMap } from "../arc/buildTypes.ts";
import { resolveSelectedArcMap } from "../arc/buildTypes.ts";
import {
  AcceptScreen,
  ActionScreen,
  ArcMapSelectionScreen,
  ChallengeRecognitionScreen,
  CompleteScreen,
  DesiredStateRatingScreen,
  EncodingScreen,
  InstructionScreen,
  PresenceRatingScreen,
  PreventiveActionCheckScreen,
  ProactiveTargetScreen,
  RegulationScreen,
  SensationRatingScreen,
  StayScreen,
  SuccessFocusScreen,
  TransitionCheckScreen,
  TriggerSelectScreen,
} from "./screens.tsx";

const BODY_LOCATIONS = ["חזה", "בטן", "גרון", "כתפיים", "ראש"];
const SUCCESS_FOCUS_MINUTES = [0, 5, 10, 15, 20];

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
  arcMaps: ArcMap[];
  pendingSensationLocation: string;
  successFocusMinutes: number | null;
  onSelectTrigger: (trigger: TriggerType) => void;
  onScaleAnswer: (value: number) => void;
  onSelectSensationLocation: (location: string) => void;
  onSubmitSensationIntensity: (value: number) => void;
  onYesNoAnswer: (yes: boolean) => void;
  onSelectTarget: (target: DevelopmentLayer) => void;
  onSelectArcMap: (arcMapId: string) => void;
  onChallengeRecognitionAnswer: (yes: boolean) => void;
  onGenericContinue: () => void;
  onRegulateContinue: () => void;
  onActionCompleted: () => void;
  onSelectSuccessFocusMinutes: (minutes: number) => void;
  onSuccessFocusContinue: () => void;
  onRestart: () => void;
}

export function ArcLiveRenderer(props: ArcLiveRendererProps) {
  const { stage, session, profile, activeLayers, arcMaps } = props;
  const copy: ArcStageCopy = getStageCopy(stage, profile, session, activeLayers, arcMaps);

  switch (stage) {
    case "trigger_selection":
      return (
        <TriggerSelectScreen
          copy={copy}
          availableTriggers={props.availableTriggers}
          labels={TRIGGER_LABELS}
          onSelect={props.onSelectTrigger}
        />
      );

    case "presence_check":
    case "arc_thought_presence_recheck":
      return <PresenceRatingScreen copy={copy} onSelect={props.onScaleAnswer} />;

    case "arc_thought_awareness":
    case "arc_thought_combined_attention":
    case "arc_thought_expand_presence":
    case "preventive_action":
      return <InstructionScreen copy={copy} onContinue={props.onGenericContinue} />;

    case "preventive_action_check": {
      const subStage = getPreventiveActionSubStage(arcMaps, session.selectedArcMapId, session.challengeRecognized);

      if (subStage === "select_arc_map") {
        return <ArcMapSelectionScreen copy={copy} arcMaps={arcMaps} onSelect={props.onSelectArcMap} />;
      }
      if (subStage === "recognize_challenge") {
        return <ChallengeRecognitionScreen copy={copy} labels={CHALLENGE_RECOGNITION_LABELS} onAnswer={props.onChallengeRecognitionAnswer} />;
      }

      const activeArcMap = resolveSelectedArcMap(arcMaps, session.selectedArcMapId);
      const preventiveAction = activeArcMap?.preventiveAction ?? profile.preventiveAction;
      if (preventiveAction === null) {
        // Recognized the challenge (or there was nothing to recognize),
        // but this particular ArcMap has no Preventive Action configured
        // -- nothing to offer, so just move on.
        return <InstructionScreen copy={copy} onContinue={props.onGenericContinue} />;
      }
      return <PreventiveActionCheckScreen copy={copy} labels={getYesNoLabels(stage)} onAnswer={props.onYesNoAnswer} />;
    }

    case "sensation_check": {
      const isHabitSensation = session.triggerType === "reactive_urge";
      const isRecheck = session.sensationLocation !== null || session.sensationIntensity !== null;
      return (
        <SensationRatingScreen
          copy={copy}
          showLocationPicker={!isHabitSensation && !isRecheck}
          locations={BODY_LOCATIONS}
          selectedLocation={props.pendingSensationLocation}
          onSelectLocation={props.onSelectSensationLocation}
          onSelectIntensity={props.onSubmitSensationIntensity}
        />
      );
    }

    case "stay":
      return <StayScreen copy={copy} onContinue={props.onGenericContinue} />;

    case "accept":
      return <AcceptScreen copy={copy} labels={getYesNoLabels(stage)} onAnswer={props.onYesNoAnswer} />;

    case "reactive_transition_check":
      return <TransitionCheckScreen copy={copy} labels={getYesNoLabels(stage)} onAnswer={props.onYesNoAnswer} />;

    case "regulate":
      return <RegulationScreen copy={copy} onContinue={props.onRegulateContinue} />;

    case "desired_state_check": {
      if (needsProactiveTargetSelection(session.triggerType, activeLayers, profile, session.selectedTarget)) {
        const targets = getAvailableProactiveTargets(activeLayers, profile);
        return <ProactiveTargetScreen targets={targets} onSelect={props.onSelectTarget} />;
      }
      return <DesiredStateRatingScreen copy={copy} onSelect={props.onScaleAnswer} />;
    }

    case "encode":
      return <EncodingScreen copy={copy} onContinue={props.onGenericContinue} />;

    case "act":
      return <ActionScreen copy={copy} onCompleted={props.onActionCompleted} />;

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
      return <CompleteScreen copy={copy} onRestart={props.onRestart} />;
  }
}
