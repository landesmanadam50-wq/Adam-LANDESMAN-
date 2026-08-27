import { ARC_CONFIG } from "./config.ts";
import type { ArcStage, TriggerType } from "./types.ts";

export function shouldRunArcThought(presenceRating: number): boolean {
  return presenceRating < ARC_CONFIG.presence.threshold;
}

export function getRouteAfterPresence(
  triggerType: TriggerType
): "reactive_state_identity" | "reactive_habit" | "proactive" {
  switch (triggerType) {
    case "reactive_emotion":
      return "reactive_state_identity";
    case "reactive_urge":
      return "reactive_habit";
    case "proactive":
      return "proactive";
  }
}

export function getReactiveStage(intensity: number): ArcStage {
  const { stayMinIntensity, transitionMinIntensity, regulationMinIntensity } =
    ARC_CONFIG.reactive;

  if (intensity >= stayMinIntensity) return "stay";
  if (intensity >= transitionMinIntensity) return "reactive_transition_check";
  if (intensity >= regulationMinIntensity) return "regulate";
  return "encode";
}

export function getProactiveStage(desiredStateRating: number): ArcStage {
  if (desiredStateRating < ARC_CONFIG.proactive.regulationThreshold) {
    return "regulate";
  }
  return "encode";
}
