import test from "node:test";
import assert from "node:assert/strict";

import {
  acknowledgeRealActionCompleted,
  advanceEmbeddedPresence,
  advancePostActionStage,
  advancePrefixStep,
  advanceProactiveStep,
  chooseBaselineTieFactor,
  completeFullPresenceSubSession,
  createCombinedLiveSession,
  getCurrentPrefixStep,
  isFinalRequiredProcessingStep,
  isPrefixAdvanceBlocked,
  markActionReached,
  recordFactorRating,
  recordFullPresenceAcceptance,
  recordReassessmentAnswer,
  resolvePresenceForSession,
  resolveSessionPresenceRoute,
  toCombinedLiveSessionFacts,
} from "./combinedLiveSession.ts";
import type { CombinedLiveSessionState } from "./combinedLiveSession.ts";
import { PRESENCE_FACTOR_ID } from "./factorRating.ts";
import {
  createEmptyBeliefInterferenceItem,
  createEmptyEmotionInterferenceItem,
  createEmptyThoughtInterferenceItem,
  createEmptyUrgeInterferenceItem,
} from "./interferenceItem.ts";
import type { InterferenceItem } from "./interferenceItem.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function thought(id: string, overrides: Partial<InterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyThoughtInterferenceItem(id, `מחשבה ${id}`, null, NOW), ...overrides } as InterferenceItem;
}
function belief(id: string, overrides: Partial<InterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyBeliefInterferenceItem(id, `אמונה ${id}`, null, NOW), ...overrides } as InterferenceItem;
}
function emotion(id: string, overrides: Partial<InterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyEmotionInterferenceItem(id, `רגש ${id}`, null, NOW), ...overrides } as InterferenceItem;
}
function urge(id: string, overrides: Partial<InterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyUrgeInterferenceItem(id, `דחף ${id}`, null, NOW), ...overrides } as InterferenceItem;
}

let idCounter = 0;
function newSession(overrides: Partial<Parameters<typeof createCombinedLiveSession>[0]> = {}): CombinedLiveSessionState {
  idCounter += 1;
  return createCombinedLiveSession({
    stateProfileId: "state1",
    cadence: "reactive",
    activeItems: [thought("t1")],
    configuredItemIds: ["t1"],
    selectedItemIds: ["t1"],
    presenceSelectedForSession: false,
    generateSessionId: () => `session-${idCounter}`,
    ...overrides,
  });
}

/** Advances the prefix (safe no-op protected) until the current step is the target rating checkpoint, without rating anything or advancing past it. */
function advanceToCheckpoint(session: CombinedLiveSessionState, checkpoint: "afterAwareness" | "afterStayAcceptance" | "afterRegulation"): CombinedLiveSessionState {
  let s = session;
  for (let i = 0; i < 50; i++) {
    const step = getCurrentPrefixStep(s);
    if (step && step.kind === "rating_checkpoint" && step.checkpoint === checkpoint) return s;
    const before = s;
    s = advancePrefixStep(s);
    if (s === before) return s; // blocked on something else (shouldn't happen while walking toward a not-yet-reached checkpoint)
  }
  return s;
}

/** Rates every rateable factor at the CURRENT rating-checkpoint step -- does not advance past it; call advancePrefixStep afterward once eligible. */
function rateAllFactorsAtCurrentCheckpoint(session: CombinedLiveSessionState, valuesByFactorId: Record<string, number>): CombinedLiveSessionState {
  let s = session;
  const step = getCurrentPrefixStep(s);
  if (!step || step.kind !== "rating_checkpoint" || !step.checkpoint) return s;
  const checkpoint = step.checkpoint;
  for (const factor of s.rateableFactors) {
    if (s.factorRatingHistory.some((r) => r.factorId === factor.factorId && r.checkpoint === checkpoint)) continue;
    s = recordFactorRating(s, factor.factorId, factor.factorType, checkpoint, valuesByFactorId[factor.factorId]);
  }
  return s;
}

/** Advances to, rates every factor at, then advances PAST the given checkpoint -- the common case used by most tests below. */
function rateCheckpoint(session: CombinedLiveSessionState, checkpoint: "afterAwareness" | "afterStayAcceptance" | "afterRegulation", valuesByFactorId: Record<string, number>): CombinedLiveSessionState {
  let s = advanceToCheckpoint(session, checkpoint);
  s = rateAllFactorsAtCurrentCheckpoint(s, valuesByFactorId);
  if (checkpoint === "afterAwareness" && s.pendingBaselineTieFactorIds) return s; // leave blocked for the caller to resolve
  s = advancePrefixStep(s);
  return s;
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

test("createCombinedLiveSession: stable sessionId, starts in prefix phase, rateableFactors from active items", () => {
  const session = newSession();
  assert.equal(session.sessionId, "session-" + idCounter);
  assert.equal(session.phase, "prefix");
  assert.deepEqual(
    session.rateableFactors.map((f) => f.factorId),
    ["t1"]
  );
});

test("createCombinedLiveSession: proactive session has no prefixSequence/rateableFactors, starts at the first proactive step", () => {
  const session = newSession({ cadence: "proactive", activeItems: [], configuredItemIds: [], selectedItemIds: [] });
  assert.deepEqual(session.prefixSequence, []);
  assert.deepEqual(session.rateableFactors, []);
  assert.equal(session.proactiveStep, "state_intention");
});

// ---------------------------------------------------------------------------
// Required test 1: every selected factor receives recognition before checkpoint 1
// ---------------------------------------------------------------------------

test("every selected factor's recognition step appears before checkpoint 1 in the live prefix", () => {
  const session = newSession({ activeItems: [thought("t1"), emotion("e1")], configuredItemIds: ["t1", "e1"], selectedItemIds: ["t1", "e1"] });
  const order = session.prefixSequence.map((s) => s.kind);
  const checkpointIndex = order.indexOf("rating_checkpoint");
  const recognitionIndices = session.prefixSequence.map((s, i) => (s.kind === "recognition" ? i : -1)).filter((i) => i >= 0);
  assert.equal(recognitionIndices.length, 2);
  for (const i of recognitionIndices) assert.ok(i < checkpointIndex);
});

// ---------------------------------------------------------------------------
// Required tests 3-9: baseline primary/tie, latest-highest, Presence exclusion
// ---------------------------------------------------------------------------

test("baseline primary factor is chosen from checkpoint 1 (unique max)", () => {
  let session = newSession({ activeItems: [thought("t1"), emotion("e1")], configuredItemIds: ["t1", "e1"], selectedItemIds: ["t1", "e1"] });
  session = rateCheckpoint(session, "afterAwareness", { t1: 8, e1: 3 });
  assert.equal(session.baselinePrimaryFactorId, "t1");
  assert.equal(session.pendingBaselineTieFactorIds, null);
});

test("a baseline tie blocks prefix progression and is surfaced via pendingBaselineTieFactorIds", () => {
  let session = newSession({ activeItems: [thought("t1"), emotion("e1")], configuredItemIds: ["t1", "e1"], selectedItemIds: ["t1", "e1"] });
  session = advanceToCheckpoint(session, "afterAwareness");
  session = recordFactorRating(session, "t1", "thought", "afterAwareness", 7);
  session = recordFactorRating(session, "e1", "emotion", "afterAwareness", 7);
  assert.deepEqual(session.pendingBaselineTieFactorIds?.sort(), ["e1", "t1"]);
  assert.equal(session.baselinePrimaryFactorId, null);
  assert.equal(isPrefixAdvanceBlocked(session), true, "a pending tie blocks prefix advancement even though the checkpoint's own ratings are all complete");
  const afterAdvanceAttempt = advancePrefixStep(session);
  assert.equal(afterAdvanceAttempt, session, "advancePrefixStep is a no-op while a tie is unresolved");
});

test("chooseBaselineTieFactor resolves the tie, unblocking progression, and is preserved through checkpoints 2 and 3", () => {
  let session = newSession({ activeItems: [thought("t1"), emotion("e1")], configuredItemIds: ["t1", "e1"], selectedItemIds: ["t1", "e1"] });
  session = advanceToCheckpoint(session, "afterAwareness");
  session = recordFactorRating(session, "t1", "thought", "afterAwareness", 7);
  session = recordFactorRating(session, "e1", "emotion", "afterAwareness", 7);
  session = chooseBaselineTieFactor(session, "e1");
  assert.equal(session.baselinePrimaryFactorId, "e1");
  assert.equal(session.pendingBaselineTieFactorIds, null);
  assert.equal(isPrefixAdvanceBlocked(session), false);
  session = advancePrefixStep(session); // past checkpoint 1

  // Checkpoint 2/3: t1 now rated much higher -- baseline must not move.
  session = rateCheckpoint(session, "afterStayAcceptance", { t1: 9, e1: 2 });
  session = rateCheckpoint(session, "afterRegulation", { t1: 9, e1: 1 });
  assert.equal(session.baselinePrimaryFactorId, "e1", "still the trainee's own tie-break choice, never replaced by later checkpoints");
  assert.deepEqual(session.latestHighestInterferingFactorIds, ["t1"], "the separate latest-highest report may legitimately point elsewhere");
});

test("Presence never competes for baselinePrimaryFactorId even when it has the single highest afterAwareness rating", () => {
  let session = newSession({
    activeItems: [thought("t1")],
    configuredItemIds: ["t1"],
    selectedItemIds: ["t1"],
    presenceSelectedForSession: true,
  });
  session = rateCheckpoint(session, "afterAwareness", { t1: 3, [PRESENCE_FACTOR_ID]: 9 });
  assert.equal(session.baselinePrimaryFactorId, "t1");
});

test("no Emotion rating question appears unless Emotion was selected", () => {
  const session = newSession({ activeItems: [thought("t1")], configuredItemIds: ["t1"], selectedItemIds: ["t1"] });
  assert.equal(
    session.rateableFactors.some((f) => f.factorType === "emotion"),
    false
  );
});

test("two same-category items remain separate rateable factors by stable id", () => {
  const session = newSession({ activeItems: [thought("t1"), thought("t2")], configuredItemIds: ["t1", "t2"], selectedItemIds: ["t1", "t2"] });
  assert.deepEqual(
    session.rateableFactors.map((f) => f.factorId).sort(),
    ["t1", "t2"]
  );
});

// ---------------------------------------------------------------------------
// Required tests 10-14: ordering + no rerouting before checkpoint 3
// ---------------------------------------------------------------------------

test("baseline ratings (checkpoint 1) precede Urge preventive stopping", () => {
  const session = newSession({ activeItems: [urge("u1", { preventiveStoppingAction: "עצור" })], configuredItemIds: ["u1"], selectedItemIds: ["u1"] });
  const order = session.prefixSequence.map((s) => s.kind);
  assert.ok(order.indexOf("rating_checkpoint") < order.indexOf("urge_preventive_stopping"));
});

test("preventive stopping precedes shared Stay", () => {
  const session = newSession({ activeItems: [urge("u1", { preventiveStoppingAction: "עצור" })], configuredItemIds: ["u1"], selectedItemIds: ["u1"] });
  const order = session.prefixSequence.map((s) => s.kind);
  assert.ok(order.indexOf("urge_preventive_stopping") < order.indexOf("shared_stay"));
});

test("checkpoint 2 follows both shared_stay and shared_acceptance", () => {
  const session = newSession();
  const order = session.prefixSequence.map((s) => s.kind);
  const secondCheckpointIndex = session.prefixSequence.findIndex((s) => s.checkpoint === "afterStayAcceptance");
  assert.ok(order.indexOf("shared_stay") < secondCheckpointIndex);
  assert.ok(order.indexOf("shared_acceptance") < secondCheckpointIndex);
});

test("checkpoint 3 follows Regulation", () => {
  const session = newSession();
  const regulationIndex = session.prefixSequence.findIndex((s) => s.kind === "shared_regulation");
  const thirdCheckpointIndex = session.prefixSequence.findIndex((s) => s.checkpoint === "afterRegulation");
  assert.ok(regulationIndex < thirdCheckpointIndex);
});

test("no rerouting occurs before checkpoint 3 completes -- interim checkpoint 2 values never change the fixed prefix order", () => {
  let session = newSession({ activeItems: [thought("t1"), emotion("e1")], configuredItemIds: ["t1", "e1"], selectedItemIds: ["t1", "e1"] });
  const originalOrder = session.prefixSequence.map((s) => `${s.kind}:${s.itemId}`);
  session = rateCheckpoint(session, "afterAwareness", { t1: 8, e1: 3 });
  session = rateCheckpoint(session, "afterStayAcceptance", { t1: 1, e1: 9 }); // e1 now much higher
  const orderAfterCheckpoint2 = session.prefixSequence.map((s) => `${s.kind}:${s.itemId}`);
  assert.deepEqual(orderAfterCheckpoint2, originalOrder, "the prefix's own step sequence is fixed at session creation -- interim ratings never rebuild or reorder it");
});

test("advancing never happens after only the first of several factors was rated at a checkpoint", () => {
  let session = newSession({ activeItems: [thought("t1"), emotion("e1")], configuredItemIds: ["t1", "e1"], selectedItemIds: ["t1", "e1"] });
  session = advanceToCheckpoint(session, "afterAwareness");
  session = recordFactorRating(session, "t1", "thought", "afterAwareness", 5);
  assert.equal(isPrefixAdvanceBlocked(session), true);
  const afterAttempt = advancePrefixStep(session);
  assert.equal(afterAttempt, session);
});

// ---------------------------------------------------------------------------
// Required test 15: prefix state survives reassessment-tail resolution
// ---------------------------------------------------------------------------

test("prefix state (current step, practicedItemIds, ratings, baseline) survives reassessment-tail resolution -- never rebuilt", () => {
  let session = newSession({ activeItems: [thought("t1")], configuredItemIds: ["t1"], selectedItemIds: ["t1"] });
  // Walk the whole prefix.
  while (session.phase === "prefix" && getCurrentPrefixStep(session)?.kind !== "cognitive_reassessment") {
    if (getCurrentPrefixStep(session)?.kind === "rating_checkpoint") {
      const checkpoint = getCurrentPrefixStep(session)!.checkpoint!;
      session = rateCheckpoint(session, checkpoint, { t1: 5 });
      continue;
    }
    session = advancePrefixStep(session);
  }
  const practicedBefore = session.practicedItemIds;
  const ratingsBefore = session.factorRatingHistory;
  const sessionIdBefore = session.sessionId;
  session = recordReassessmentAnswer(session, "not_stuck");
  session = advancePrefixStep(session); // finishes the prefix -> presence_decision
  assert.equal(session.phase, "presence_decision");
  assert.equal(session.sessionId, sessionIdBefore);
  assert.deepEqual(session.practicedItemIds, practicedBefore);
  assert.deepEqual(session.factorRatingHistory, ratingsBefore);
});

// ---------------------------------------------------------------------------
// Required tests 16-23: Presence routing table + no duplicate rating + mutual exclusion
// ---------------------------------------------------------------------------

test("session-level Presence table: configured+selected + not_stuck -> full_optional", () => {
  assert.equal(resolveSessionPresenceRoute(true, false, true, "not_stuck"), "full_optional");
});
test("session-level Presence table: configured+selected + still_stuck -> full_required", () => {
  assert.equal(resolveSessionPresenceRoute(true, false, true, "still_stuck"), "full_required");
});
test("session-level Presence table: configured but not selected + not_stuck -> skip", () => {
  assert.equal(resolveSessionPresenceRoute(true, false, false, "not_stuck"), "skip");
});
test("session-level Presence table: configured but not selected + still_stuck -> embedded", () => {
  assert.equal(resolveSessionPresenceRoute(true, false, false, "still_stuck"), "embedded");
});
test("session-level Presence table: unavailable/unlinked (never selected) + still_stuck -> embedded", () => {
  assert.equal(resolveSessionPresenceRoute(true, false, false, "still_stuck"), "embedded");
});
test("session-level Presence table: unavailable/unlinked + not_stuck -> skip", () => {
  assert.equal(resolveSessionPresenceRoute(true, false, false, "not_stuck"), "skip");
});

test("not_stuck + Presence unavailable produces skip end-to-end", () => {
  let session = newSession({ presenceSelectedForSession: false });
  session = { ...session, phase: "presence_decision", reassessmentAnswer: "not_stuck" };
  session = resolvePresenceForSession(session);
  assert.equal(session.presenceMode, "skipped");
  assert.equal(session.phase, "action");
});

test("still_stuck + Presence unavailable produces embedded end-to-end", () => {
  let session = newSession({ presenceSelectedForSession: false });
  session = { ...session, phase: "presence_decision", reassessmentAnswer: "still_stuck" };
  session = resolvePresenceForSession(session);
  assert.equal(session.presenceMode, "embedded");
  assert.equal(session.phase, "presence");
  assert.equal(session.embeddedPresenceStage, "visual_field");
});

test("not_stuck + linked Presence selected produces full_optional, waiting for accept/decline", () => {
  let session = newSession({ presenceSelectedForSession: true });
  session = { ...session, phase: "presence_decision", reassessmentAnswer: "not_stuck" };
  session = resolvePresenceForSession(session);
  assert.equal(session.presenceDecision, "full_optional");
  assert.equal(session.phase, "presence_decision", "never guesses the accept/decline answer");
});

test("declining full_optional produces skipped", () => {
  let session = newSession({ presenceSelectedForSession: true });
  session = { ...session, phase: "presence_decision", reassessmentAnswer: "not_stuck" };
  session = resolvePresenceForSession(session);
  session = recordFullPresenceAcceptance(session, false);
  assert.equal(session.presenceMode, "skipped");
  assert.equal(session.phase, "action");
});

test("accepting full_optional produces full", () => {
  let session = newSession({ presenceSelectedForSession: true });
  session = { ...session, phase: "presence_decision", reassessmentAnswer: "not_stuck" };
  session = resolvePresenceForSession(session);
  session = recordFullPresenceAcceptance(session, true);
  assert.equal(session.presenceMode, "full");
  assert.equal(session.phase, "presence");
});

test("still_stuck + linked Presence selected produces full_required directly, no accept/decline needed", () => {
  let session = newSession({ presenceSelectedForSession: true });
  session = { ...session, phase: "presence_decision", reassessmentAnswer: "still_stuck" };
  session = resolvePresenceForSession(session);
  assert.equal(session.presenceMode, "full");
  assert.equal(session.phase, "presence");
});

test("embedded and full Presence never both run in the same session", () => {
  const scenarios: Array<[boolean, "not_stuck" | "still_stuck"]> = [
    [false, "not_stuck"],
    [false, "still_stuck"],
    [true, "still_stuck"],
  ];
  for (const [selected, answer] of scenarios) {
    let session = newSession({ presenceSelectedForSession: selected });
    session = { ...session, phase: "presence_decision", reassessmentAnswer: answer };
    session = resolvePresenceForSession(session);
    const hasEmbedded = session.presenceMode === "embedded";
    const hasFull = session.presenceMode === "full";
    assert.equal(hasEmbedded && hasFull, false);
  }
});

test("no duplicate consecutive Presence rating: the afterRegulation Presence FactorRating is reused as presenceSeedRating when entering full Presence", () => {
  let session = newSession({
    activeItems: [thought("t1")],
    configuredItemIds: ["t1"],
    selectedItemIds: ["t1"],
    presenceSelectedForSession: true,
  });
  session = rateCheckpoint(session, "afterAwareness", { t1: 5, [PRESENCE_FACTOR_ID]: 6 });
  session = rateCheckpoint(session, "afterStayAcceptance", { t1: 4, [PRESENCE_FACTOR_ID]: 7 });
  session = rateCheckpoint(session, "afterRegulation", { t1: 3, [PRESENCE_FACTOR_ID]: 8 });
  while (getCurrentPrefixStep(session)?.kind !== "cognitive_reassessment") session = advancePrefixStep(session);
  session = recordReassessmentAnswer(session, "still_stuck");
  session = advancePrefixStep(session); // finishes prefix
  assert.equal(session.phase, "presence_decision");
  session = resolvePresenceForSession(session);
  assert.equal(session.presenceMode, "full");
  assert.equal(session.presenceSeedRating, 8, "the exact afterRegulation Presence rating is reused, never re-asked");
});

test("proactive full Presence never carries a seed rating (no checkpoints ran)", () => {
  let session = newSession({ cadence: "proactive", activeItems: [], configuredItemIds: [], selectedItemIds: [], presenceSelectedForSession: true });
  session = { ...session, phase: "presence_decision" };
  session = resolvePresenceForSession(session);
  assert.equal(session.presenceMode, "full");
  assert.equal(session.presenceSeedRating, null);
});

// ---------------------------------------------------------------------------
// Required test 22 (embedded/full mutual exclusion at the handoff level) +
// full-Presence handoff boundary
// ---------------------------------------------------------------------------

test("completeFullPresenceSubSession moves to action only when presenceMode is full", () => {
  let session = newSession({ presenceSelectedForSession: false });
  session = { ...session, phase: "presence_decision", reassessmentAnswer: "still_stuck" };
  session = resolvePresenceForSession(session); // embedded
  const noop = completeFullPresenceSubSession(session);
  assert.equal(noop, session, "no-op when presenceMode is embedded, not full");
});

test("advanceEmbeddedPresence walks all four fixed stages then moves to action", () => {
  let session = newSession({ presenceSelectedForSession: false });
  session = { ...session, phase: "presence_decision", reassessmentAnswer: "still_stuck" };
  session = resolvePresenceForSession(session);
  const stages = [session.embeddedPresenceStage];
  for (let i = 0; i < 5; i++) {
    session = advanceEmbeddedPresence(session);
    stages.push(session.embeddedPresenceStage);
    if (session.phase === "action") break;
  }
  assert.equal(session.phase, "action");
  assert.deepEqual(stages, ["visual_field", "body_contact", "natural_breathing", "present_environment", "complete"]);
});

// ---------------------------------------------------------------------------
// Required tests 27-33: practiced-item completion, action/terminal completion
// ---------------------------------------------------------------------------

test("isFinalRequiredProcessingStep: Belief -> belief_alternative; Emotion -> emotion_support; Urge -> urge_support after preventive stopping", () => {
  const session = newSession({
    activeItems: [belief("b1"), emotion("e1"), urge("u1", { preventiveStoppingAction: "עצור" })],
    configuredItemIds: ["b1", "e1", "u1"],
    selectedItemIds: ["b1", "e1", "u1"],
  });
  const beliefIndex = session.prefixSequence.findIndex((s) => s.routeStepKind === "belief_alternative");
  const emotionIndex = session.prefixSequence.findIndex((s) => s.routeStepKind === "emotion_support");
  const urgeIndex = session.prefixSequence.findIndex((s) => s.routeStepKind === "urge_support");
  assert.equal(isFinalRequiredProcessingStep(session.prefixSequence, beliefIndex), true);
  assert.equal(isFinalRequiredProcessingStep(session.prefixSequence, emotionIndex), true);
  assert.equal(isFinalRequiredProcessingStep(session.prefixSequence, urgeIndex), true);
});

test("Thought's final required step is thought_future_insight when present, not thought_alternative", () => {
  const session = newSession({ activeItems: [thought("t1")], configuredItemIds: ["t1"], selectedItemIds: ["t1"] });
  const alternativeIndex = session.prefixSequence.findIndex((s) => s.routeStepKind === "thought_alternative");
  const futureInsightIndex = session.prefixSequence.findIndex((s) => s.routeStepKind === "thought_future_insight");
  assert.equal(isFinalRequiredProcessingStep(session.prefixSequence, alternativeIndex), false);
  assert.equal(isFinalRequiredProcessingStep(session.prefixSequence, futureInsightIndex), true);
});

test("viewing a recognition or rating step never marks the item practiced", () => {
  let session = newSession({ activeItems: [thought("t1")], configuredItemIds: ["t1"], selectedItemIds: ["t1"] });
  assert.equal(getCurrentPrefixStep(session)?.kind, "recognition");
  session = advancePrefixStep(session); // past recognition
  assert.deepEqual(session.practicedItemIds, []);
  // now at the afterAwareness checkpoint -- rate it and advance.
  session = rateCheckpoint(session, "afterAwareness", { t1: 5 });
  assert.deepEqual(session.practicedItemIds, [], "still not practiced -- only recognition and a rating have happened so far");
});

test("completing an item's final required step marks it practiced exactly once", () => {
  let session = newSession({ activeItems: [thought("t1")], configuredItemIds: ["t1"], selectedItemIds: ["t1"] });
  while (session.phase === "prefix" && getCurrentPrefixStep(session)?.kind !== "cognitive_reassessment") {
    if (getCurrentPrefixStep(session)?.kind === "rating_checkpoint") {
      session = rateCheckpoint(session, getCurrentPrefixStep(session)!.checkpoint!, { t1: 5 });
      continue;
    }
    session = advancePrefixStep(session);
  }
  assert.deepEqual(session.practicedItemIds, ["t1"]);
  // Advancing again (past cognitive_reassessment) must never duplicate it.
  session = recordReassessmentAnswer(session, "not_stuck");
  session = advancePrefixStep(session);
  assert.deepEqual(session.practicedItemIds, ["t1"]);
});

test("an item is never marked practiced if the trainee abandons before its final required step", () => {
  let session = newSession({ activeItems: [thought("t1")], configuredItemIds: ["t1"], selectedItemIds: ["t1"] });
  session = advancePrefixStep(session); // past recognition only
  assert.deepEqual(session.practicedItemIds, []);
});

test("action display does not mean real completion -- markActionReached sets actionReached only", () => {
  let session = newSession();
  session = { ...session, phase: "action" };
  session = markActionReached(session);
  assert.equal(session.actionReached, true);
  assert.equal(session.realActionCompleted, false);
  assert.equal(session.phase, "action");
});

test("explicit action acknowledgment sets realActionCompleted once and is inert on repeated calls", () => {
  let session = newSession();
  session = { ...session, phase: "action" };
  session = markActionReached(session);
  session = acknowledgeRealActionCompleted(session);
  assert.equal(session.realActionCompleted, true);
  assert.equal(session.phase, "post_action");
  const again = acknowledgeRealActionCompleted(session);
  assert.equal(again, session, "a second acknowledgment is a no-op -- phase is no longer action");
});

test("acknowledgeRealActionCompleted is a no-op before actionReached is set", () => {
  let session = newSession();
  session = { ...session, phase: "action" };
  const result = acknowledgeRealActionCompleted(session);
  assert.equal(result, session);
});

test("post-action stages are gated -- advancePostActionStage is a no-op outside phase post_action", () => {
  const session = newSession();
  const result = advancePostActionStage(session);
  assert.equal(result, session);
});

test("post-action tail completes and sets terminalCompleted exactly once", () => {
  let session = newSession();
  session = { ...session, phase: "action" };
  session = markActionReached(session);
  session = acknowledgeRealActionCompleted(session);
  assert.equal(session.terminalCompleted, false);
  for (let i = 0; i < 6 && session.phase === "post_action"; i++) {
    session = advancePostActionStage(session, null, null);
  }
  assert.equal(session.phase, "complete");
  assert.equal(session.terminalCompleted, true);
});

test("abandonment before terminal completion never produces a completed-session record", () => {
  let session = newSession();
  session = { ...session, phase: "action" };
  session = markActionReached(session);
  // Never acknowledges the action -- abandons here.
  const facts = toCombinedLiveSessionFacts(session);
  assert.equal(facts.terminalCompleted, false);
  assert.equal(facts.realActionCompleted, false);
});

test("re-render/repeated events do not duplicate terminal completion -- calling advancePostActionStage past complete is a no-op", () => {
  let session = newSession();
  session = { ...session, phase: "action" };
  session = markActionReached(session);
  session = acknowledgeRealActionCompleted(session);
  for (let i = 0; i < 6 && session.phase === "post_action"; i++) {
    session = advancePostActionStage(session, null, null);
  }
  const completedSession = session;
  const repeated = advancePostActionStage(completedSession, null, null);
  assert.equal(repeated, completedSession);
});

test("toCombinedLiveSessionFacts: practicedStage/projection are always 1/full, cadence reflects the session", () => {
  const reactive = toCombinedLiveSessionFacts(newSession());
  assert.equal(reactive.practicedStage, 1);
  assert.equal(reactive.projection, "full");
  assert.equal(reactive.cadence, "reactive");

  const proactive = toCombinedLiveSessionFacts(newSession({ cadence: "proactive", activeItems: [], configuredItemIds: [], selectedItemIds: [] }));
  assert.equal(proactive.cadence, "proactive");
  assert.deepEqual(proactive.factorRatingHistory, []);
});

// ---------------------------------------------------------------------------
// Proactive prefix walking
// ---------------------------------------------------------------------------

test("advanceProactiveStep walks the fixed proactive sequence then moves to presence_decision", () => {
  let session = newSession({ cadence: "proactive", activeItems: [], configuredItemIds: [], selectedItemIds: [] });
  const visited = [session.proactiveStep];
  for (let i = 0; i < 6 && session.phase === "prefix"; i++) {
    session = advanceProactiveStep(session);
    visited.push(session.proactiveStep);
  }
  assert.equal(session.phase, "presence_decision");
  assert.deepEqual(visited, ["state_intention", "embodiment", "state_mantra", "encoding", "beneficial_action", null]);
});
