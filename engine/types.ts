/**
 * engine/types.ts
 *
 * Pure data types for the ARC Engine. Nothing here imports React,
 * React Native, or any UI concept — this file (and the rest of
 * engine/) must stay usable from LIVE today, and from TRAIN and the
 * meditation-generation module later, without modification.
 */

/** Which layer of ARC this profile is currently calibrated for. */
export type ArcType = "state" | "identity" | "habit";

/** All 15 possible stages in a LIVE session, in their natural order. */
export enum LiveStage {
  PreventiveActionCheck = "PreventiveActionCheck",
  EmotionGate = "EmotionGate",
  PresenceCheck = "PresenceCheck",
  ArcThoughtAwareness = "ArcThoughtAwareness",
  ArcThoughtCombinedAttention = "ArcThoughtCombinedAttention",
  ArcThoughtExpansion = "ArcThoughtExpansion",
  ArcThoughtPresenceRecheck = "ArcThoughtPresenceRecheck",
  BodyLocation = "BodyLocation",
  IntensityCheck = "IntensityCheck",
  AcceptanceCheck = "AcceptanceCheck",
  StayBreathAwareness = "StayBreathAwareness",
  Regulation = "Regulation",
  Encoding = "Encoding",
  BeneficialAction = "BeneficialAction",
  Reward = "Reward",
  SuccessFocus = "SuccessFocus",
  InterferingAction = "InterferingAction",
  Finish = "Finish",
}

/** Fixed canonical order used to walk forward and skip stages. */
export const STAGE_ORDER: LiveStage[] = [
  LiveStage.PreventiveActionCheck,
  LiveStage.EmotionGate,
  LiveStage.PresenceCheck,
  LiveStage.ArcThoughtAwareness,
  LiveStage.ArcThoughtCombinedAttention,
  LiveStage.ArcThoughtExpansion,
  LiveStage.ArcThoughtPresenceRecheck,
  LiveStage.BodyLocation,
  LiveStage.IntensityCheck,
  LiveStage.AcceptanceCheck,
  LiveStage.StayBreathAwareness,
  LiveStage.Regulation,
  LiveStage.Encoding,
  LiveStage.BeneficialAction,
  LiveStage.Reward,
  LiveStage.SuccessFocus,
  LiveStage.InterferingAction,
  LiveStage.Finish,
];

/** A planned action the trainee wants to gradually reduce (spec §29). */
export interface InterferingActionPlan {
  description: string;
  allowedMinutes: number;
  reductionStage: number; // e.g. 20 -> 15 -> 10 -> 5 minutes
}

/** A preventive action defined ahead of time (spec §18). */
export interface PreventiveActionPlan {
  description: string;
}

/** The intensity bands that drive the 10-5-3 principle (spec §20). Tunable. */
export interface IntensityThresholds {
  stayMin: number; // at/above this -> Stay + Breath Awareness
  regulateMin: number; // at/above this (and below stayMin) -> Regulation
  encodeMax: number; // at/below this -> Encoding + Action
}

/**
 * Everything calibrated in BUILD and re-calibrated in "Build Next Week".
 * This is the shared record LIVE, TRAIN, and the meditation module all
 * read from — none of them should duplicate this calibration.
 */
export interface ArcProfile {
  goal: string;
  interferingHabit?: string;
  desiredIdentity?: string;
  interferingState: string;
  supportiveState: string;
  arcType: ArcType;

  actions: {
    internalAction: string; // e.g. body scan
    identityAction?: string; // e.g. say hello
    beneficialAction: string; // e.g. approach and start a conversation
  };

  regulationTool: string;
  mantra?: string; // used in Encoding

  presenceThreshold: number; // default 6, tunable
  intensityThresholds: IntensityThresholds;

  preventiveAction?: PreventiveActionPlan;
  interferingAction?: InterferingActionPlan;
}

/**
 * The live, per-event state that changes on every real-time session
 * and is never persisted long-term (spec §3: Live Data vs Profile Data).
 */
export interface LiveSession {
  hasRelevantEmotionOrUrge: boolean | null;
  wantsPreventiveActionNow: boolean | null;
  presenceLevel: number | null; // 0-10
  bodyLocation: string | null;
  intensityLevel: number | null; // 1-10
  needsAcceptance: boolean | null;
  wantsSuccessFocus: boolean | null;
  wantsToUseInterferingActionWindow: boolean | null;
}

export function createEmptyLiveSession(): LiveSession {
  return {
    hasRelevantEmotionOrUrge: null,
    wantsPreventiveActionNow: null,
    presenceLevel: null,
    bodyLocation: null,
    intensityLevel: null,
    needsAcceptance: null,
    wantsSuccessFocus: null,
    wantsToUseInterferingActionWindow: null,
  };
}
