export type DevelopmentLayer = "state" | "identity" | "habit";

export type TriggerType = "reactive_emotion" | "reactive_urge" | "proactive";

export type ArcStage =
  | "trigger_selection"
  | "presence_check"
  | "arc_thought_awareness"
  | "arc_thought_combined_attention"
  | "arc_thought_expand_presence"
  | "arc_thought_presence_recheck"
  | "sensation_check"
  | "stay"
  | "accept"
  | "reactive_transition_check"
  | "regulate"
  | "desired_state_check"
  | "encode"
  | "act"
  | "success_focus"
  | "complete";

export interface EncodingProfile {
  target: string;
  bodySensationCue: string | null;
  breathCue: string | null;
  bodyLanguageCue: string | null;
  gazeCue?: string | null;
  mantra: string | null;
}

export interface ArcBuildProfile {
  programPath: string;
  identityActionNeeded: boolean;

  interferingState: string | null;
  supportiveState: string | null;
  stateEncoding: EncodingProfile | null;
  internalAction: string | null;

  desiredIdentity: string | null;
  identityInterferingEmotion: string | null;
  identityEncoding: EncodingProfile | null;
  identityAction: string | null;

  habit: string | null;
  beneficialAction: string | null;
  preventiveAction: string | null;

  regulationTool: string | null;
  actionDuration: number | null;
  successFocusDuration: number | null;
}

export interface ArcProgramProgress {
  programPath: string;
  currentProgramWeek: number;
  completedProgramWeeks: number;
  activeLayers: DevelopmentLayer[];

  weekStartDate: string | null;
  trainingDatesThisWeek: string[];

  buildExtensionRequired: boolean;
  nextLayerToBuild: DevelopmentLayer[] | null;
  programCompleted: boolean;
}

export interface ArcLiveState {
  triggerType: TriggerType | null;

  presenceRating: number | null;
  sensationLocation: string | null;
  sensationIntensity: number | null;
  desiredStateRating: number | null;

  selectedState: string | null;
  selectedIdentity: string | null;
  selectedAction: string | null;

  acceptanceNeeded: boolean | null;
  regulationReady: boolean | null;
  regulationNeeded: boolean;

  arcThoughtCompleted: boolean;
  activeTools: string[];
  currentArcStage: ArcStage;
}

export function createEmptyLiveState(): ArcLiveState {
  return {
    triggerType: null,
    presenceRating: null,
    sensationLocation: null,
    sensationIntensity: null,
    desiredStateRating: null,
    selectedState: null,
    selectedIdentity: null,
    selectedAction: null,
    acceptanceNeeded: null,
    regulationReady: null,
    regulationNeeded: false,
    arcThoughtCompleted: false,
    activeTools: [],
    currentArcStage: "trigger_selection",
  };
}
