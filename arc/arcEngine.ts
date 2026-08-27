/**
 * arc/arcEngine.ts
 *
 * arc/engine.ts (as given) only has isolated decision helpers
 * (shouldRunArcThought, getRouteAfterPresence, getReactiveStage,
 * getProactiveStage) -- there's no stage sequencer, unlike the old
 * engine/arcEngine.ts's getFirstStage/getNextStage. This file is that
 * sequencer, built from those helpers plus the ArcStage list order.
 *
 * The flow below is inferred, not given -- the parts explicitly
 * specified are called out; everything else is a defensible reading
 * of the stage names/order and ArcLiveState's fields, documented
 * inline so it's easy to correct if it doesn't match the real design:
 *
 * - trigger_selection -> presence_check -> (ARC Thought, 4 stages,
 *   only if shouldRunArcThought) -> routed by getRouteAfterPresence:
 *     - reactive (state/identity or habit) -> sensation_check ->
 *       branched by getReactiveStage(intensity):
 *         'stay'                     -> stay -> accept -> reactive_transition_check
 *         'reactive_transition_check'-> reactive_transition_check directly
 *         'regulate'                 -> regulate directly
 *         'encode'                   -> encode directly
 *       reactive_transition_check is a real loop point: if
 *       regulationReady is false, it goes back to "stay" (stay with
 *       the sensation longer) rather than forcing regulation.
 *     - proactive -> desired_state_check -> branched by
 *       getProactiveStage(desiredStateRating): 'regulate' | 'encode'
 * - regulate always continues to encode -> act -> success_focus -> complete.
 *
 * sensationLocation is only asked for the state/identity route, not
 * habit (mirrors the old engine's "BodyLocation skipped for habit"
 * rule) -- that's a UI concern, not a sequencing one, so it isn't
 * reflected here.
 */

import { shouldRunArcThought, getRouteAfterPresence, getReactiveStage, getProactiveStage } from "./engine.ts";
import type { ArcLiveState, ArcStage } from "./types.ts";

export function getFirstArcStage(): ArcStage {
  return "trigger_selection";
}

function afterArcThought(state: ArcLiveState): ArcStage {
  if (state.triggerType === null) return "sensation_check";
  const route = getRouteAfterPresence(state.triggerType);
  return route === "proactive" ? "desired_state_check" : "sensation_check";
}

export function getNextArcStage(current: ArcStage, state: ArcLiveState): ArcStage {
  switch (current) {
    case "trigger_selection":
      return "presence_check";

    case "presence_check":
      if (state.presenceRating === null) return current;
      return shouldRunArcThought(state.presenceRating) ? "arc_thought_awareness" : afterArcThought(state);

    case "arc_thought_awareness":
      return "arc_thought_combined_attention";
    case "arc_thought_combined_attention":
      return "arc_thought_expand_presence";
    case "arc_thought_expand_presence":
      return "arc_thought_presence_recheck";
    case "arc_thought_presence_recheck":
      return afterArcThought(state);

    case "sensation_check":
      if (state.sensationIntensity === null) return current;
      return getReactiveStage(state.sensationIntensity);

    case "stay":
      return "accept";
    case "accept":
      return "reactive_transition_check";
    case "reactive_transition_check":
      return state.regulationReady === true ? "regulate" : "stay";

    case "desired_state_check":
      if (state.desiredStateRating === null) return current;
      return getProactiveStage(state.desiredStateRating);

    case "regulate":
      return "encode";
    case "encode":
      return "act";
    case "act":
      return "success_focus";
    case "success_focus":
      return "complete";
    case "complete":
      return "complete";
  }
}
