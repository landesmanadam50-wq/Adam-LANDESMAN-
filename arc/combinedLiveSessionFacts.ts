/**
 * arc/combinedLiveSessionFacts.ts
 *
 * Adaptive ARC architecture task, Phase 14B: the terminal session-facts
 * shape for combined LIVE practice (reactive Full and proactive State
 * strengthening alike). Composes arc/combinedRoute.ts's own
 * CombinedRouteSessionFacts (Phase 12, unmodified -- its own constructor
 * signature is never touched) with the new fields Phase 14B needs.
 * Never persisted by this phase -- no progression write happens here or
 * anywhere in Phase 14B; this is purely the in-memory terminal artifact
 * arc/combinedLiveSession.ts's own controller builds up over a session.
 */

import { createEmptyCombinedRouteSessionFacts } from "./combinedRoute.ts";
import type { CombinedRouteSessionFacts, FinalPresenceMode } from "./combinedRoute.ts";
import type { FactorRating } from "./factorRating.ts";

export type CombinedLiveSessionCadence = "reactive" | "proactive";

export interface CombinedLiveSessionFacts {
  sessionId: string;
  stateProfileId: string;

  // Carried verbatim from CombinedRouteSessionFacts -- see this module's own header doc.
  configuredItemIds: string[];
  selectedItemIds: string[];
  practicedItemIds: string[];
  completedTypes: CombinedRouteSessionFacts["completedTypes"];
  presenceMode: FinalPresenceMode;
  reassessmentAnswer: CombinedRouteSessionFacts["reassessmentAnswer"];

  practicedStage: 1;
  projection: "full";
  cadence: CombinedLiveSessionCadence;

  /** The session's own explicit Presence choice -- distinct from BUILD's presenceEnabled and from presenceMode (what actually ran). See arc/combinedLiveSession.ts's own doc. */
  presenceSelectedForSession: boolean;

  factorRatingHistory: FactorRating[];
  /** Fixed at the afterAwareness checkpoint, never replaced by a later checkpoint's own highest factor. */
  baselinePrimaryFactorId: string | null;
  /** A separate, later-derived report from afterRegulation -- never used to overwrite baselinePrimaryFactorId. */
  latestHighestInterferingFactorIds: string[];

  actionReached: boolean;
  realActionCompleted: boolean;
  terminalCompleted: boolean;
}

/**
 * Builds a fresh CombinedLiveSessionFacts from a freshly-created
 * CombinedRouteSessionFacts (Phase 12's own createEmptyCombinedRouteSessionFacts,
 * called here unmodified) plus the session-identifying fields only
 * arc/combinedLiveSession.ts's controller knows at session start. Every
 * other new field defaults to its own empty/false/1/"full" starting
 * value -- never guessed.
 */
export function createEmptyCombinedLiveSessionFacts(sessionId: string, stateProfileId: string, configuredItemIds: string[], cadence: CombinedLiveSessionCadence): CombinedLiveSessionFacts {
  const routeFacts = createEmptyCombinedRouteSessionFacts(configuredItemIds);
  return {
    sessionId,
    stateProfileId,
    configuredItemIds: routeFacts.configuredItemIds,
    selectedItemIds: routeFacts.selectedItemIds,
    practicedItemIds: routeFacts.practicedItemIds,
    completedTypes: routeFacts.completedTypes,
    presenceMode: routeFacts.presenceMode,
    reassessmentAnswer: routeFacts.reassessmentAnswer,
    practicedStage: 1,
    projection: "full",
    cadence,
    presenceSelectedForSession: false,
    factorRatingHistory: [],
    baselinePrimaryFactorId: null,
    latestHighestInterferingFactorIds: [],
    actionReached: false,
    realActionCompleted: false,
    terminalCompleted: false,
  };
}
