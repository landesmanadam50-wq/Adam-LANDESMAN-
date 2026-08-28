export type DevelopmentLayer = "state" | "identity" | "habit";

export type TriggerType = "reactive_emotion" | "reactive_urge" | "proactive";

export type ArcStage =
  | "trigger_selection"
  | "presence_check"
  | "arc_thought_awareness"
  | "arc_thought_combined_attention"
  | "arc_thought_expand_presence"
  | "arc_thought_presence_recheck"
  | "preventive_action_check"
  | "preventive_action"
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
  /**
   * @deprecated Legacy two-track ("standard" vs "advanced") signal from
   * before program/ existed. Kept only so old stored profiles still parse
   * and can be migrated. The real source of truth for what a trainee
   * needs is the persisted ArcProgramSelection (program/programTypes.ts)
   * -- new code must not read this field to make decisions.
   */
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
  nextLayersToBuild: DevelopmentLayer[] | null;
  programCompleted: boolean;

  /** Guards completeProgramWeek() against double-crediting the same week. */
  lastCompletedWeek: number | null;
  /** Every LIVE session that reached "act", regardless of daily training credit (max 1/day). */
  liveSessionCount: number;
}

export interface ArcLiveState {
  triggerType: TriggerType | null;
  /**
   * Which DevelopmentLayer's encoding/action this proactive session targets,
   * set explicitly once (auto-picked when only one target is available, or
   * chosen by the trainee when more than one is) rather than left for
   * resolveEncodingTarget() to infer blind -- see arc/arcEngine.ts's
   * needsProactiveTargetSelection(). Always null for reactive sessions,
   * where the target is unambiguous from triggerType/activeLayers.
   */
  selectedTarget: DevelopmentLayer | null;

  /**
   * Which ArcMap this reactive_habit session's Challenge Context/
   * Preventive Action step is about -- set explicitly once (auto-picked
   * when only one ArcMap exists, or chosen by the trainee when more than
   * one does) via arc/arcEngine.ts's getPreventiveActionSubStage(). Never
   * left for the UI to guess.
   */
  selectedArcMapId: string | null;
  /** Whether the trainee confirmed the selected ArcMap's Challenge Context actually matches what's happening now -- null = not yet asked. Preventive Action is only ever offered once this is true (or there was no Challenge Context to recognize). */
  challengeRecognized: boolean | null;

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
  wantsPreventiveAction: boolean | null;

  arcThoughtCompleted: boolean;
  /** Safety cap on the ARC Thought and reactive/proactive re-check loops -- see arc/arcEngine.ts. */
  loopIterationCount: number;
  activeTools: string[];
  currentArcStage: ArcStage;

  /** The protocol reached "act" this session (every completed session does, by construction). */
  actionReached: boolean;
  /** The trainee confirmed they actually performed the real-world action -- the only thing that earns Training Day credit. */
  realActionCompleted: boolean;
}

export function createEmptyLiveState(): ArcLiveState {
  return {
    triggerType: null,
    selectedTarget: null,
    selectedArcMapId: null,
    challengeRecognized: null,
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
    wantsPreventiveAction: null,
    arcThoughtCompleted: false,
    loopIterationCount: 0,
    activeTools: [],
    currentArcStage: "trigger_selection",
    actionReached: false,
    realActionCompleted: false,
  };
}
