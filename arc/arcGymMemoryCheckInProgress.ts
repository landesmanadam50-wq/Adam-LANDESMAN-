/**
 * arc/arcGymMemoryCheckInProgress.ts
 *
 * ARC Gym + ARC Goal Integration task: single-slot resume state for
 * ARC Memory's new emotional check-in step (inserted between the
 * trigger/noticing steps and the action step -- see
 * live/ArcGymMemoryVisualizationScreen.tsx). Written once, right
 * before routing into the shared ARC LIVE engine (😟/🙂 choices only --
 * 😄 never leaves the Memory screen, so it never writes this), and
 * consumed exactly once when live/NewArcLiveScreen.tsx's returnToTask()
 * routes back to the Memory screen afterward.
 *
 * Deliberately its OWN tiny module, kept separate from
 * arc/arcGym.ts's own ArcGymTrainingRecord/ArcGymMemory (the
 * Behaviour-only training-history/historical-sensation records) --
 * Memory's check-in flow must never read or write either of those, to
 * avoid corrupting bookkeeping that assumes a real ArcGymSituation.id.
 *
 * No AsyncStorage, no navigation, no React here -- same split as every
 * other arc/*.ts module; data/storage.ts holds the single-slot
 * load/save/clear wrappers.
 */

export interface ArcGymMemoryCheckInProgress {
  exerciseId: string;
  /** Which step index to resume at once the trainee returns from ARC LIVE -- the Memory screen's own "action" step. */
  resumeStepIndex: number;
  checkInChoice: "full_arc" | "shortened_arc";
  startedAt: string;
}

export function createArcGymMemoryCheckInProgress(
  exerciseId: string,
  resumeStepIndex: number,
  checkInChoice: "full_arc" | "shortened_arc",
  now: string
): ArcGymMemoryCheckInProgress {
  return { exerciseId, resumeStepIndex, checkInChoice, startedAt: now };
}
