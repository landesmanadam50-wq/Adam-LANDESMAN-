import test from "node:test";
import assert from "node:assert/strict";

import {
  applyProjectionResultToCounters,
  applyStage3CompletionToCounters,
  createEmptyMappingProgressionCounters,
  evaluateStage3CompoundCompletion,
  getOrCreateMappingProgress,
  isEligibleForProgressionCounters,
  isStage2Unlocked,
  isStage3Unlocked,
  isStage4Unlocked,
  isStageUnlocked,
  isValidStageProjectionCombination,
  resolveHighestUnlockedStage,
  setMappingProgress,
} from "./reactiveProactiveProgression.ts";
import type { ApplyProjectionResultInput, MappingProgressionCounters, MappingProgressionStore } from "./reactiveProactiveProgression.ts";
import type { ProjectionCompletionResult } from "./projectionCompletion.ts";

const COMPLETED: ProjectionCompletionResult = { stateCompleted: true, identityCompleted: null, countsForProgression: true };
const NOT_COMPLETED: ProjectionCompletionResult = { stateCompleted: false, identityCompleted: null, countsForProgression: false };

function applyOne(counters: MappingProgressionCounters, input: ApplyProjectionResultInput): MappingProgressionCounters {
  const outcome = applyProjectionResultToCounters(counters, input);
  assert.equal(outcome.kind, "applied", `expected "applied", got "${outcome.kind}" for session ${input.sessionId}`);
  return outcome.kind === "applied" ? outcome.counters : counters;
}

function applyManyStage1Mini(counters: MappingProgressionCounters, count: number, prefix = "s1mini"): MappingProgressionCounters {
  let result = counters;
  for (let i = 0; i < count; i++) {
    result = applyOne(result, { sessionId: `${prefix}-${i}`, practicedStage: 1, projection: "mini", result: COMPLETED });
  }
  return result;
}

// ---------------------------------------------------------------------------
// isEligibleForProgressionCounters
// ---------------------------------------------------------------------------

test("isEligibleForProgressionCounters is true only for personal_development", () => {
  assert.equal(isEligibleForProgressionCounters("personal_development"), true);
  assert.equal(isEligibleForProgressionCounters("goal_achievement"), false);
});

// ---------------------------------------------------------------------------
// isValidStageProjectionCombination
// ---------------------------------------------------------------------------

test("isValidStageProjectionCombination: Stage 1 accepts full/mini only", () => {
  assert.equal(isValidStageProjectionCombination(1, "full"), true);
  assert.equal(isValidStageProjectionCombination(1, "mini"), true);
  assert.equal(isValidStageProjectionCombination(1, "link"), false);
  assert.equal(isValidStageProjectionCombination(1, "action_only"), false);
});

test("isValidStageProjectionCombination: Stage 2 accepts mini/link only", () => {
  assert.equal(isValidStageProjectionCombination(2, "mini"), true);
  assert.equal(isValidStageProjectionCombination(2, "link"), true);
  assert.equal(isValidStageProjectionCombination(2, "full"), false);
  assert.equal(isValidStageProjectionCombination(2, "action_only"), false);
});

test("isValidStageProjectionCombination: Stage 3 accepts link_plus_action only", () => {
  assert.equal(isValidStageProjectionCombination(3, "link_plus_action"), true);
  assert.equal(isValidStageProjectionCombination(3, "link"), false);
  assert.equal(isValidStageProjectionCombination(3, "action_only"), false);
  assert.equal(isValidStageProjectionCombination(3, "full"), false);
  assert.equal(isValidStageProjectionCombination(3, "mini"), false);
});

test("isValidStageProjectionCombination: Stage 4 accepts action_only only", () => {
  assert.equal(isValidStageProjectionCombination(4, "action_only"), true);
  assert.equal(isValidStageProjectionCombination(4, "mini"), false);
  assert.equal(isValidStageProjectionCombination(4, "link"), false);
  assert.equal(isValidStageProjectionCombination(4, "full"), false);
});

// ---------------------------------------------------------------------------
// applyProjectionResultToCounters: invalid combinations increment nothing
// ---------------------------------------------------------------------------

test("applyProjectionResultToCounters rejects invalid stage/projection combinations without incrementing anything", () => {
  const empty = createEmptyMappingProgressionCounters();
  const cases: { stage: 1 | 2 | 3 | 4; projection: ApplyProjectionResultInput["projection"] }[] = [
    { stage: 1, projection: "link" },
    { stage: 2, projection: "full" },
    { stage: 4, projection: "mini" },
  ];
  for (const { stage, projection } of cases) {
    const outcome = applyProjectionResultToCounters(empty, { sessionId: `bad-${stage}-${projection}`, practicedStage: stage, projection, result: COMPLETED });
    assert.equal(outcome.kind, "invalid_combination");
    if (outcome.kind === "invalid_combination") {
      assert.equal(outcome.stage, stage);
      assert.equal(outcome.projection, projection);
    }
  }
  assert.deepEqual(empty, createEmptyMappingProgressionCounters(), "the input counters object was never mutated by any of the rejected attempts");
});

test("applyProjectionResultToCounters: Action-only recorded as Stage 3 is rejected (Stage 3 has no regular-projection path)", () => {
  const empty = createEmptyMappingProgressionCounters();
  const outcome = applyProjectionResultToCounters(empty, { sessionId: "bad-3-action_only", practicedStage: 3, projection: "action_only", result: COMPLETED });
  assert.equal(outcome.kind, "invalid_combination");
});

test("applyProjectionResultToCounters: not-completed results increment nothing and are not recorded in the ledger", () => {
  const empty = createEmptyMappingProgressionCounters();
  const outcome = applyProjectionResultToCounters(empty, { sessionId: "s1", practicedStage: 1, projection: "mini", result: NOT_COMPLETED });
  assert.equal(outcome.kind, "not_completed");
  if (outcome.kind === "not_completed") {
    assert.deepEqual(outcome.counters, empty);
    assert.equal("s1" in outcome.counters.countedSessions, false);
  }
});

// ---------------------------------------------------------------------------
// Regression tests explicitly required by the corrected boundary
// ---------------------------------------------------------------------------

test("[1] Ten reactive Stage 1 Mini completions unlock Stage 2 but leave both Stage 2 counters at zero", () => {
  const counters = applyManyStage1Mini(createEmptyMappingProgressionCounters(), 10);
  assert.equal(counters.stage1.completedMiniCount, 10);
  assert.equal(isStage2Unlocked(counters, "reactive"), true);
  assert.equal(counters.stage2.completedMiniCount, 0);
  assert.equal(counters.stage2.completedLinkCount, 0);
});

test("[2] Five proactive Stage 1 Mini completions unlock Stage 2 but leave both Stage 2 counters at zero", () => {
  const counters = applyManyStage1Mini(createEmptyMappingProgressionCounters(), 5);
  assert.equal(isStage2Unlocked(counters, "proactive"), true);
  assert.equal(counters.stage2.completedMiniCount, 0);
  assert.equal(counters.stage2.completedLinkCount, 0);
});

test("[3] After Stage 2 unlocks, a Mini submitted as Stage 1 increments only Stage 1", () => {
  let counters = applyManyStage1Mini(createEmptyMappingProgressionCounters(), 10);
  assert.equal(isStage2Unlocked(counters, "reactive"), true);
  counters = applyOne(counters, { sessionId: "extra-stage1-mini", practicedStage: 1, projection: "mini", result: COMPLETED });
  assert.equal(counters.stage1.completedMiniCount, 11);
  assert.equal(counters.stage2.completedMiniCount, 0);
  assert.equal(counters.stage2.completedLinkCount, 0);
});

test("[4] A Mini submitted as Stage 2 increments only Stage 2", () => {
  let counters = applyManyStage1Mini(createEmptyMappingProgressionCounters(), 10);
  counters = applyOne(counters, { sessionId: "stage2-mini-1", practicedStage: 2, projection: "mini", result: COMPLETED });
  assert.equal(counters.stage2.completedMiniCount, 1);
  assert.equal(counters.stage1.completedMiniCount, 10, "Stage 1's own count is untouched by a Stage 2 submission");
});

test("[5] Stage 2 thresholds use only fresh Stage 2 Mini and Link completions -- Stage 1's own Mini count never contributes", () => {
  // 10 Stage-1 Minis (unlocks Stage 2) + only 2 Stage-2 Minis + 2 Stage-2
  // Links -- nowhere near Stage 2's own 10-combined/3-and-3 requirement,
  // even though Stage 1 alone already has 10 Mini completions.
  let counters = applyManyStage1Mini(createEmptyMappingProgressionCounters(), 10);
  for (let i = 0; i < 2; i++) {
    counters = applyOne(counters, { sessionId: `s2mini-${i}`, practicedStage: 2, projection: "mini", result: COMPLETED });
    counters = applyOne(counters, { sessionId: `s2link-${i}`, practicedStage: 2, projection: "link", result: COMPLETED });
  }
  assert.equal(isStage3Unlocked(counters, "reactive"), false, "2+2=4 combined, and only 2 of each type -- well short of 10 combined / 3 each");
});

test("[6] Invalid projection/stage combinations increment nothing (duplicate of the general rule, restated per the required regression list)", () => {
  const empty = createEmptyMappingProgressionCounters();
  const outcome = applyProjectionResultToCounters(empty, { sessionId: "bad", practicedStage: 1, projection: "link", result: COMPLETED });
  assert.equal(outcome.kind, "invalid_combination");
});

test("[7] The same session ID cannot count once in Stage 1 and again in Stage 2", () => {
  let counters = createEmptyMappingProgressionCounters();
  counters = applyOne(counters, { sessionId: "shared-session", practicedStage: 1, projection: "mini", result: COMPLETED });
  const secondAttempt = applyProjectionResultToCounters(counters, { sessionId: "shared-session", practicedStage: 2, projection: "mini", result: COMPLETED });
  assert.equal(secondAttempt.kind, "duplicate_session");
  if (secondAttempt.kind === "duplicate_session") {
    assert.deepEqual(secondAttempt.existing, { stage: 1, projection: "mini" });
  }
  assert.equal(counters.stage2.completedMiniCount, 0, "the duplicate attempt never touched Stage 2's own counter");
});

test("[8] The same session ID cannot count once as a regular projection and again as a Stage 3 compound session", () => {
  let counters = createEmptyMappingProgressionCounters();
  counters = applyOne(counters, { sessionId: "shared-session-2", practicedStage: 2, projection: "link", result: COMPLETED });
  const stage3Attempt = applyStage3CompletionToCounters(counters, "shared-session-2", { valid: true });
  assert.equal(stage3Attempt.kind, "duplicate_session");
  assert.equal(counters.stage3.completedLinkPlusActionCount, 0);
});

test("[9] Earlier-stage practice remains countable after later stages unlock, without affecting the later-stage bucket", () => {
  // Fully unlock Stage 2, then Stage 3, then keep practicing Stage 1.
  let counters = applyManyStage1Mini(createEmptyMappingProgressionCounters(), 10);
  for (let i = 0; i < 3; i++) {
    counters = applyOne(counters, { sessionId: `s2mini-full-${i}`, practicedStage: 2, projection: "mini", result: COMPLETED });
    counters = applyOne(counters, { sessionId: `s2link-full-${i}`, practicedStage: 2, projection: "link", result: COMPLETED });
  }
  for (let i = 0; i < 4; i++) {
    counters = applyOne(counters, { sessionId: `s2mixed-${i}`, practicedStage: 2, projection: i % 2 === 0 ? "mini" : "link", result: COMPLETED });
  }
  assert.equal(isStage3Unlocked(counters, "reactive"), true, "10 combined, >=3 mini and >=3 link");

  const stage2Snapshot = { ...counters.stage2 };
  counters = applyOne(counters, { sessionId: "still-stage1", practicedStage: 1, projection: "full", result: COMPLETED });
  assert.equal(counters.stage1.completedFullCount, 1);
  assert.deepEqual(counters.stage2, stage2Snapshot, "Stage 2's own bucket is untouched by a later Stage 1 session");
});

test("[10] All operations are immutable -- the original counters/store objects are never mutated", () => {
  const original = createEmptyMappingProgressionCounters();
  const snapshot = JSON.parse(JSON.stringify(original));
  applyProjectionResultToCounters(original, { sessionId: "x", practicedStage: 1, projection: "mini", result: COMPLETED });
  applyStage3CompletionToCounters(original, "y", { valid: true });
  assert.deepEqual(original, snapshot);

  const store: MappingProgressionStore = { "key-a": original };
  const storeSnapshot = JSON.parse(JSON.stringify(store));
  setMappingProgress(store, "key-b", createEmptyMappingProgressionCounters());
  assert.deepEqual(store, storeSnapshot);
});

// ---------------------------------------------------------------------------
// Stage 1 combined counting
// ---------------------------------------------------------------------------

test("Stage 1: Full-only, Mini-only, and mixed sequences all reach the reactive (10) / proactive (5) threshold identically", () => {
  const fullOnly = (() => {
    let c = createEmptyMappingProgressionCounters();
    for (let i = 0; i < 10; i++) c = applyOne(c, { sessionId: `full-${i}`, practicedStage: 1, projection: "full", result: COMPLETED });
    return c;
  })();
  assert.equal(isStage2Unlocked(fullOnly, "reactive"), true);

  const mixed = (() => {
    let c = createEmptyMappingProgressionCounters();
    for (let i = 0; i < 5; i++) c = applyOne(c, { sessionId: `mix-full-${i}`, practicedStage: 1, projection: "full", result: COMPLETED });
    for (let i = 0; i < 5; i++) c = applyOne(c, { sessionId: `mix-mini-${i}`, practicedStage: 1, projection: "mini", result: COMPLETED });
    return c;
  })();
  assert.equal(isStage2Unlocked(mixed, "reactive"), true);
});

test("Stage 1: one short of threshold stays locked", () => {
  const counters = applyManyStage1Mini(createEmptyMappingProgressionCounters(), 9);
  assert.equal(isStage2Unlocked(counters, "reactive"), false);
  const proactiveCounters = applyManyStage1Mini(createEmptyMappingProgressionCounters(), 4);
  assert.equal(isStage2Unlocked(proactiveCounters, "proactive"), false);
});

// ---------------------------------------------------------------------------
// Stage 2 minimums
// ---------------------------------------------------------------------------

test("Stage 2: combined total reached but a sub-minimum missed stays locked (reactive: 9 Mini + 1 Link)", () => {
  let counters = createEmptyMappingProgressionCounters();
  for (let i = 0; i < 9; i++) counters = applyOne(counters, { sessionId: `m-${i}`, practicedStage: 2, projection: "mini", result: COMPLETED });
  counters = applyOne(counters, { sessionId: "l-0", practicedStage: 2, projection: "link", result: COMPLETED });
  assert.equal(counters.stage2.completedMiniCount + counters.stage2.completedLinkCount, 10);
  assert.equal(isStage3Unlocked(counters, "reactive"), false, "only 1 Link -- below the minimum of 3");
});

test("Stage 2: meeting both sub-minimums unlocks Stage 3 (reactive: 3 Mini + 3 Link + 4 more of either)", () => {
  let counters = createEmptyMappingProgressionCounters();
  for (let i = 0; i < 3; i++) counters = applyOne(counters, { sessionId: `m-${i}`, practicedStage: 2, projection: "mini", result: COMPLETED });
  for (let i = 0; i < 3; i++) counters = applyOne(counters, { sessionId: `l-${i}`, practicedStage: 2, projection: "link", result: COMPLETED });
  for (let i = 0; i < 4; i++) counters = applyOne(counters, { sessionId: `extra-${i}`, practicedStage: 2, projection: "mini", result: COMPLETED });
  assert.equal(counters.stage2.completedMiniCount + counters.stage2.completedLinkCount, 10);
  assert.equal(isStage3Unlocked(counters, "reactive"), true);
});

test("Stage 2: proactive minimums are 2 and 2", () => {
  let counters = createEmptyMappingProgressionCounters();
  for (let i = 0; i < 2; i++) counters = applyOne(counters, { sessionId: `m-${i}`, practicedStage: 2, projection: "mini", result: COMPLETED });
  for (let i = 0; i < 2; i++) counters = applyOne(counters, { sessionId: `l-${i}`, practicedStage: 2, projection: "link", result: COMPLETED });
  counters = applyOne(counters, { sessionId: "extra", practicedStage: 2, projection: "mini", result: COMPLETED });
  assert.equal(counters.stage2.completedMiniCount + counters.stage2.completedLinkCount, 5);
  assert.equal(isStage3Unlocked(counters, "proactive"), true);
});

// ---------------------------------------------------------------------------
// Stage 3 compound completion
// ---------------------------------------------------------------------------

test("evaluateStage3CompoundCompletion: valid when Link + State both complete and Identity was not selected", () => {
  const result = evaluateStage3CompoundCompletion({
    sessionId: "s3-1",
    identitySelected: false,
    link: { reachedFinalStage: true, requiredDwellsCompleted: true, completionAcknowledged: true },
    state: { actionReached: true, realActionCompleted: true },
    identity: null,
  });
  assert.equal(result.valid, true);
});

test("evaluateStage3CompoundCompletion: invalid when the State action was never completed", () => {
  const result = evaluateStage3CompoundCompletion({
    sessionId: "s3-2",
    identitySelected: false,
    link: { reachedFinalStage: true, requiredDwellsCompleted: true, completionAcknowledged: true },
    state: { actionReached: true, realActionCompleted: false },
    identity: null,
  });
  assert.equal(result.valid, false);
});

test("evaluateStage3CompoundCompletion: invalid when the Link rehearsal itself was not completed", () => {
  const result = evaluateStage3CompoundCompletion({
    sessionId: "s3-3",
    identitySelected: false,
    link: { reachedFinalStage: true, requiredDwellsCompleted: false, completionAcknowledged: true },
    state: { actionReached: true, realActionCompleted: true },
    identity: null,
  });
  assert.equal(result.valid, false);
});

test("evaluateStage3CompoundCompletion: Identity selected but its own action incomplete -- invalid (Identity remains optional, but once selected it must also complete)", () => {
  const result = evaluateStage3CompoundCompletion({
    sessionId: "s3-4",
    identitySelected: true,
    link: { reachedFinalStage: true, requiredDwellsCompleted: true, completionAcknowledged: true },
    state: { actionReached: true, realActionCompleted: true },
    identity: { selected: true, actionReached: true, realActionCompleted: false },
  });
  assert.equal(result.valid, false);
});

test("evaluateStage3CompoundCompletion: Identity selected and fully completed -- valid", () => {
  const result = evaluateStage3CompoundCompletion({
    sessionId: "s3-5",
    identitySelected: true,
    link: { reachedFinalStage: true, requiredDwellsCompleted: true, completionAcknowledged: true },
    state: { actionReached: true, realActionCompleted: true },
    identity: { selected: true, actionReached: true, realActionCompleted: true },
  });
  assert.equal(result.valid, true);
});

test("applyStage3CompletionToCounters: a pure Stage 2 Link completion never increments the Stage 3 compound counter", () => {
  let counters = createEmptyMappingProgressionCounters();
  counters = applyOne(counters, { sessionId: "pure-link", practicedStage: 2, projection: "link", result: COMPLETED });
  assert.equal(counters.stage3.completedLinkPlusActionCount, 0, "Stage 2's own applyProjectionResultToCounters never touches Stage 3");
});

test("applyStage3CompletionToCounters: an invalid compound result increments nothing", () => {
  const empty = createEmptyMappingProgressionCounters();
  const outcome = applyStage3CompletionToCounters(empty, "s3-invalid", { valid: false });
  assert.equal(outcome.kind, "not_completed");
  assert.equal(outcome.counters.stage3.completedLinkPlusActionCount, 0);
});

test("Stage 4 unlocks from 10 (reactive) / 5 (proactive) valid Stage 3 compound completions", () => {
  let counters = createEmptyMappingProgressionCounters();
  for (let i = 0; i < 10; i++) {
    const outcome = applyStage3CompletionToCounters(counters, `s3-${i}`, { valid: true });
    assert.equal(outcome.kind, "applied");
    if (outcome.kind === "applied") counters = outcome.counters;
  }
  assert.equal(isStage4Unlocked(counters, "reactive"), true);

  let proactiveCounters = createEmptyMappingProgressionCounters();
  for (let i = 0; i < 5; i++) {
    const outcome = applyStage3CompletionToCounters(proactiveCounters, `p3-${i}`, { valid: true });
    if (outcome.kind === "applied") proactiveCounters = outcome.counters;
  }
  assert.equal(isStage4Unlocked(proactiveCounters, "proactive"), true);
});

// ---------------------------------------------------------------------------
// Stage 4 terminal
// ---------------------------------------------------------------------------

test("Stage 4 is terminal -- resolveHighestUnlockedStage never exceeds 4", () => {
  let counters = createEmptyMappingProgressionCounters();
  for (let i = 0; i < 20; i++) {
    const outcome = applyStage3CompletionToCounters(counters, `term-${i}`, { valid: true });
    if (outcome.kind === "applied") counters = outcome.counters;
  }
  assert.equal(resolveHighestUnlockedStage(counters, "reactive"), 4);
});

// ---------------------------------------------------------------------------
// isStageUnlocked / resolveHighestUnlockedStage
// ---------------------------------------------------------------------------

test("isStageUnlocked / resolveHighestUnlockedStage: Stage 1 is always available for a fresh mapping", () => {
  const empty = createEmptyMappingProgressionCounters();
  assert.equal(isStageUnlocked(empty, 1, "reactive"), true);
  assert.equal(isStageUnlocked(empty, 2, "reactive"), false);
  assert.equal(resolveHighestUnlockedStage(empty, "reactive"), 1);
});

// ---------------------------------------------------------------------------
// Per-mapping store: separate versioned progress
// ---------------------------------------------------------------------------

test("getOrCreateMappingProgress / setMappingProgress: two mapping keys never share or leak progress", () => {
  let store: MappingProgressionStore = {};
  const keyA = "interference-1::state-1::identity-v1";
  const keyB = "interference-1::state-1::identity-v2"; // same State/interference, different Identity VERSION

  let progressA = getOrCreateMappingProgress(store, keyA);
  progressA = applyManyStage1Mini(progressA, 10);
  store = setMappingProgress(store, keyA, progressA);

  const progressB = getOrCreateMappingProgress(store, keyB);
  assert.equal(progressB.stage1.completedMiniCount, 0, "a different Identity version is a completely separate progress record");
  assert.equal(isStage2Unlocked(progressB, "reactive"), false);
  assert.equal(isStage2Unlocked(getOrCreateMappingProgress(store, keyA), "reactive"), true);
});

test("getOrCreateMappingProgress returns a fresh, empty record for an unknown key rather than throwing", () => {
  const progress = getOrCreateMappingProgress({}, "never-seen-before");
  assert.deepEqual(progress, createEmptyMappingProgressionCounters());
});
