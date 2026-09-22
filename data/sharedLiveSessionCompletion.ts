/**
 * data/sharedLiveSessionCompletion.ts
 *
 * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 5: the
 * single, track-neutral entry point a future shared LIVE controller
 * calls to record a session's completion, whichever track it belongs
 * to -- dispatching on arc/sharedLiveSessionFacts.ts's own `track`
 * discriminant to each track's real, separately-owned completion path.
 * "A generalized shared controller + two per-track adapters, each track
 * keeping its own domain records/validation/progress/navigation" (the
 * approved unified architecture's own governing principle) -- this
 * module is exactly that dispatch point, never a merged/rewritten copy
 * of either track's own logic.
 *
 * The Personal Development branch is a pure COMPATIBILITY WRAPPER: it
 * calls data/personalDevelopmentRouteProgressPersistence.ts's own,
 * already-real, already-wired recordCombinedSessionCompletion completely
 * unmodified -- same function, same validation, same idempotency ledger,
 * same storage key. Nothing about PD's existing, live-in-production
 * completion path changes by this module existing.
 *
 * The ArcGoal branch calls Phase 4's commitArcGoalProgressIfReady, the
 * exact code path that performs ArcGoal's own progress write (gated on
 * every required PendingSharedActionExecution role being explicitly
 * confirmed -- see that module's own doc).
 *
 * Nothing in this repository calls this module yet -- no BUILD/LIVE
 * wiring in this phase. No change to arc/combinedLiveSession.ts,
 * arc/arcGoalEngine.ts, or either live screen.
 */

import { recordCombinedSessionCompletion } from "./personalDevelopmentRouteProgressPersistence.ts";
import type { PersonalDevelopmentRouteProgressStorageDependencies } from "./personalDevelopmentRouteProgressPersistence.ts";
import type { RecordCombinedSessionOutcome } from "../arc/personalDevelopmentRouteProgress.ts";
import { commitArcGoalProgressIfReady } from "./pendingSharedActionExecutionPersistence.ts";
import type { CommitArcGoalProgressDependencies, CommitArcGoalProgressOutcome } from "./pendingSharedActionExecutionPersistence.ts";
import type { SharedLiveSessionFacts } from "../arc/sharedLiveSessionFacts.ts";

export interface SharedLiveSessionCompletionDependencies {
  personalDevelopment?: PersonalDevelopmentRouteProgressStorageDependencies;
  arcGoal?: CommitArcGoalProgressDependencies;
}

export type RecordSharedLiveSessionCompletionOutcome =
  | { track: "personal_development"; outcome: RecordCombinedSessionOutcome }
  | { track: "arc_goal"; outcome: CommitArcGoalProgressOutcome };

/**
 * Dispatches on `facts.track` alone -- never inspects any other field to
 * decide which track's path to call, so a caller can never accidentally
 * route a PD session into ArcGoal's path or vice versa. Each branch is a
 * single, direct delegation: no shared logic is inlined here, and no
 * field is translated/renamed between the two tracks' own shapes.
 */
export async function recordSharedLiveSessionCompletion(
  facts: SharedLiveSessionFacts,
  now: string,
  deps: SharedLiveSessionCompletionDependencies = {}
): Promise<RecordSharedLiveSessionCompletionOutcome> {
  if (facts.track === "personal_development") {
    const outcome = await recordCombinedSessionCompletion(facts.facts, now, deps.personalDevelopment);
    return { track: "personal_development", outcome };
  }
  const outcome = await commitArcGoalProgressIfReady(facts.arcGoalId, facts, now, deps.arcGoal);
  return { track: "arc_goal", outcome };
}
