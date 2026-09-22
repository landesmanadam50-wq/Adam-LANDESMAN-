/**
 * live/combinedInterferenceLiveScreenCompletion.test.ts
 *
 * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 6: a
 * PERMANENT test that follows live/CombinedInterferenceLiveScreen.tsx's
 * OWN real call sequence, not just data/personalDevelopmentRouteProgressPersistence.ts's
 * own already-tested behavior. Mirrors live/arcGoalSessionScreenConfirmation.test.ts's
 * own approach (no React component test harness exists in this codebase
 * -- see that file's own header doc) by driving the real arc/combinedLiveSession.ts
 * state machine directly, the same functions the screen imports and
 * calls, and only ever building/recording the shared facts once
 * `state.phase === "complete"` -- the EXACT discriminant
 * live/CombinedInterferenceLiveScreen.tsx's own renderBody switch uses
 * (case "complete": return <CombinedSessionCompletionScreen state={state} />)
 * to decide whether to render the component that calls
 * recordSharedLiveSessionCompletion at all.
 *
 * screenWouldCallCompletion below pins that exact boundary as a named,
 * asserted predicate -- if a future change moved the screen's own call
 * site off of `phase === "complete"`, a reviewer diffing this file
 * against that one would immediately see the two boundaries diverge.
 *
 * Material finding from this integration: PersonalDevelopmentRouteConfig.beneficialActionPolicy
 * (required/optional_in_live/none, added in Phase 1) is NOT YET consumed
 * anywhere in arc/combinedLiveSession.ts's own action-outcome resolution
 * -- confirmed by grep: every real reference to that field lives only in
 * arc/personalDevelopmentRouteConfig.ts (the config) and
 * arc/personalDevelopmentRouteProgress.ts (the Phase-1 stage ladder).
 * The live engine's REAL completion boundary today is governed entirely
 * by each action role's own explicit `completed` flag (never `reached`
 * alone) via ActionResolutionOutcome's kind -- exactly the "required
 * action... explicitly confirmed" half of the boundary the unified
 * architecture calls for. There is no live "skipped because optional" or
 * "disabled" outcome kind yet (validateCombinedSessionFactsForCompletion
 * rejects `actionOutcomeKind === "unavailable"` outright, and no other
 * kind represents a policy-driven skip) -- wiring beneficialActionPolicy
 * into that resolution is PD BUILD/LIVE consolidation's own job, not yet
 * done. This file tests the boundary as it is REALLY enforced today
 * (every real actionOutcomeKind reachable from the current engine),
 * rather than asserting behavior for a policy the engine doesn't act on
 * yet.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  advanceAwarenessRecognition,
  advanceStep,
  advanceTail,
  answerReassessment,
  confirmActionCompleted,
  createCombinedLiveSession,
  markActionReached,
  recordAwarenessRating,
  recordDesiredStateRating,
  recordStepRating,
} from "../arc/combinedLiveSession.ts";
import type { CombinedLiveSessionState, CreateCombinedLiveSessionInput } from "../arc/combinedLiveSession.ts";
import { toPersonalDevelopmentSharedFacts } from "../arc/sharedLiveSessionFacts.ts";
import { recordSharedLiveSessionCompletion } from "../data/sharedLiveSessionCompletion.ts";
import type { PersonalDevelopmentRouteProgressStorageDependencies } from "../data/personalDevelopmentRouteProgressPersistence.ts";
import type { PersonalDevelopmentRouteProgressStore } from "../data/storage.ts";
import { createEmptyPersonalDevelopmentRouteConfig } from "../arc/personalDevelopmentRouteConfig.ts";
import type { PersonalDevelopmentRouteConfig } from "../arc/personalDevelopmentRouteConfig.ts";
import { createEmptyThoughtInterferenceItem } from "../arc/interferenceItem.ts";
import type { InterferenceItem, ThoughtInterferenceItem } from "../arc/interferenceItem.ts";
import { createEmptyStateProfile } from "../arc/stateProfile.ts";
import type { StateProfile } from "../arc/stateProfile.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-01T00:05:00.000Z";

function config(overrides: Partial<PersonalDevelopmentRouteConfig> = {}): PersonalDevelopmentRouteConfig {
  return { ...createEmptyPersonalDevelopmentRouteConfig("route1", "prog1", NOW), ...overrides };
}

function thought(overrides: Partial<ThoughtInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyThoughtInterferenceItem("t1", "מחשבה", null, NOW), schemaVersion: 2, beneficialActionAgainstFactor: "פעולת מחשבה", ...overrides };
}

function completeState(overrides: Partial<StateProfile> = {}): StateProfile {
  return { ...createEmptyStateProfile("s1", "מצב", null, NOW), regulationAnchor: "עוגן", encodingCue: "קידוד", action: "פעולת המצב", ...overrides };
}

function baseInput(overrides: Partial<CreateCombinedLiveSessionInput> = {}): CreateCombinedLiveSessionInput {
  return { mode: "full", config: config(), items: [], stateProfiles: [], presenceArcs: [], startedAt: NOW, stageAtStart: 1, generateSessionId: () => "session-1", ...overrides };
}

function fakeDeps(initial: PersonalDevelopmentRouteProgressStore = {}): PersonalDevelopmentRouteProgressStorageDependencies & { savedStores: PersonalDevelopmentRouteProgressStore[] } {
  let store = initial;
  const savedStores: PersonalDevelopmentRouteProgressStore[] = [];
  return {
    savedStores,
    loadStore: async () => store,
    saveStore: async (next) => {
      store = next;
      savedStores.push(next);
    },
  };
}

/**
 * The EXACT boundary live/CombinedInterferenceLiveScreen.tsx's own
 * renderBody switch uses to decide whether to render
 * CombinedSessionCompletionScreen (the only component that ever calls
 * recordSharedLiveSessionCompletion) -- see that file's own `case
 * "complete":` branch. Deliberately trivial; its value is being a named,
 * separately-asserted pin on that exact condition.
 */
function screenWouldCallCompletion(state: CombinedLiveSessionState): boolean {
  return state.phase === "complete";
}

/**
 * Walks a real combined session forward one controller-driven step at a
 * time (mirrors arc/combinedLiveSessionFacts.test.ts's own runFullToComplete
 * helper), but pauses to let the caller inspect/assert at each step via
 * `onEachState` -- used below to prove screenWouldCallCompletion stays
 * false for every state along the way, only flipping true once, at the
 * very last one.
 */
function walkFullToComplete(cfg: PersonalDevelopmentRouteConfig, items: InterferenceItem[], stateProfiles: StateProfile[], onEachState: (state: CombinedLiveSessionState) => void): CombinedLiveSessionState {
  let state = createCombinedLiveSession(baseInput({ items, config: cfg, stateProfiles }));
  onEachState(state);
  while (state.awarenessSteps[state.awarenessIndex]?.kind === "recognition") {
    state = advanceAwarenessRecognition(state);
    onEachState(state);
  }
  for (const item of items) {
    state = recordAwarenessRating(state, item.id, item.category, 6);
    onEachState(state);
  }
  let guard = 0;
  while (state.phase === "steps" && guard < 30) {
    const step = state.remainingSteps[state.stepIndex];
    if (!step) break;
    if (step.kind === "rating_checkpoint") {
      for (const factor of state.resolvedPlan!.factors) {
        state = recordStepRating(state, factor.itemId, factor.category, step.checkpoint!, 5);
        onEachState(state);
      }
    } else if (step.kind === "cognitive_reassessment") {
      state = answerReassessment(state, "not_stuck");
      onEachState(state);
    } else if (step.kind === "desired_state_rating") {
      state = recordDesiredStateRating(state, 8);
      onEachState(state);
    } else if (step.kind === "state_action" || step.kind === "factor_action") {
      // Explicit reached-then-confirmed, exactly like ActionScreen's own
      // timer-elapsed-then-tap sequence -- never confirmed implicitly.
      state = markActionReached(state);
      onEachState(state);
      state = confirmActionCompleted(state);
      onEachState(state);
    } else {
      state = advanceStep(state);
      onEachState(state);
    }
    guard++;
  }
  guard = 0;
  while (state.phase === "tail" && guard < 10) {
    state = advanceTail(state);
    onEachState(state);
    guard++;
  }
  return state;
}

// --- The completion boundary itself ---

test("the completion boundary (state.phase === 'complete') is never true before the required action is explicitly confirmed -- factor_only route", () => {
  const cfg = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  let sawComplete = false;
  let sawActionReachedButNotComplete = false;
  const state = walkFullToComplete(cfg, [thought()], [], (s) => {
    if (s.phase === "complete") {
      sawComplete = true;
      return;
    }
    assert.equal(screenWouldCallCompletion(s), false, "the screen must never call completion before phase reaches 'complete'");
    const factorAction = s.actionRoleProgress.find((r) => r.role === "factor");
    if (factorAction?.reached && !factorAction.completed) sawActionReachedButNotComplete = true;
  });
  assert.equal(state.phase, "complete");
  assert.equal(sawComplete, true);
  assert.equal(sawActionReachedButNotComplete, true, "sanity check: the walk actually passed through a reached-but-not-yet-confirmed moment");
});

test("the completion boundary holds for a state_then_factor route requiring BOTH actions confirmed -- neither alone is enough", () => {
  const cfg = config({
    interferenceItemIds: ["t1"],
    itemRelationships: { t1: { actionRelationship: "different_actions" } },
    stateInclusionPolicy: "linked",
    stateProfileId: "s1",
  });
  let oneActionCompletedButNotComplete = false;
  const state = walkFullToComplete(cfg, [thought()], [completeState()], (s) => {
    if (s.phase === "complete") return;
    assert.equal(screenWouldCallCompletion(s), false);
    const stateAction = s.actionRoleProgress.find((r) => r.role === "state");
    const factorAction = s.actionRoleProgress.find((r) => r.role === "factor");
    const exactlyOneCompleted = Boolean(stateAction?.completed) !== Boolean(factorAction?.completed) && (stateAction?.completed || factorAction?.completed);
    if (exactlyOneCompleted) oneActionCompletedButNotComplete = true;
  });
  assert.equal(state.phase, "complete");
  assert.equal(oneActionCompletedButNotComplete, true, "sanity check: the walk passed through a state where exactly one of the two required actions was confirmed");
});

// --- Once complete, the screen's own two calls (toPersonalDevelopmentSharedFacts + recordSharedLiveSessionCompletion) ---

test("once phase reaches 'complete', the screen's own two calls record progress exactly once, and a retry with the SAME state/sessionId is idempotent", async () => {
  const cfg = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  const state = walkFullToComplete(cfg, [thought()], [], () => {});
  assert.equal(state.phase, "complete");
  assert.equal(screenWouldCallCompletion(state), true);

  const deps = fakeDeps();
  // Mirrors live/CombinedInterferenceLiveScreen.tsx's own attemptSave() exactly.
  const facts = toPersonalDevelopmentSharedFacts(state);
  const first = await recordSharedLiveSessionCompletion(facts, NOW, { personalDevelopment: deps });
  assert.equal(first.outcome.kind, "applied");
  assert.equal(deps.savedStores[0]["route1"].completedSessions, 1);

  // Retry (e.g. the "נסה לשמור שוב" button re-invoking attemptSave against
  // the SAME closed-over `state` prop) -- same sessionId, no double count.
  const retryFacts = toPersonalDevelopmentSharedFacts(state);
  assert.equal(retryFacts.facts.sessionId, facts.facts.sessionId, "session id preserved across retry -- same closed-over state, never reminted");
  const retry = await recordSharedLiveSessionCompletion(retryFacts, LATER, { personalDevelopment: deps });
  assert.equal(retry.outcome.kind, "duplicate_session");
  const finalStore = deps.savedStores[deps.savedStores.length - 1];
  assert.equal(finalStore["route1"].completedSessions, 1, "count stays at one after the retry");
});

test("a fresh session started after an earlier one was abandoned (never reached 'complete') gets its own independent sessionId and never inherits or double-counts the abandoned one", async () => {
  const cfg = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });

  // Session A: started, never reaches "complete" -- abandoned before any
  // action role's own timer ever began (still "awareness"/"steps"), so
  // nothing was ever persisted for it and there is nothing to resume (see
  // live/CombinedInterferenceLiveScreen.tsx's own module doc). Adaptive
  // ARC architecture task (unified PD/ARC Goal), Phase 6 correction: a
  // restart AFTER an action role's own wall-clock timer has begun IS now
  // recoverable (see live/combinedInterferenceLiveScreenRestart.test.ts) --
  // this test's own scenario is deliberately the case that predates that
  // point and stays genuinely unrecoverable either way.
  const abandoned = createCombinedLiveSession(baseInput({ items: [thought()], config: cfg, generateSessionId: () => "session-A" }));
  assert.notEqual(abandoned.phase, "complete");

  // Session B: a fresh mount after the "restart" -- its own new sessionId, from scratch.
  const deps = fakeDeps();
  const state = walkFullToComplete(cfg, [thought()], [], () => {});
  const facts = toPersonalDevelopmentSharedFacts(state);
  assert.notEqual(facts.facts.sessionId, "session-A", "the fresh session never reuses the abandoned one's id");
  const outcome = await recordSharedLiveSessionCompletion(facts, NOW, { personalDevelopment: deps });
  assert.equal(outcome.outcome.kind, "applied");
  assert.equal(deps.savedStores[0]["route1"].completedSessions, 1, "only the genuinely completed session is ever counted");
});
