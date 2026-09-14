import test from "node:test";
import assert from "node:assert/strict";

import {
  applyProjectionCompletionToProgress,
  createEmptyProjectionProgressCounters,
  evaluateProjectionCompletion,
  proactiveStateProgressKeyToString,
  reactiveMappingProgressKeyToString,
} from "./projectionCompletion.ts";
import type { ProjectionCompletionInput } from "./projectionCompletion.ts";

// ---------------------------------------------------------------------------
// Full/Mini/Action-only, Self Development track
// ---------------------------------------------------------------------------

test("Self Development, no Identity selected: State action alone is sufficient", () => {
  const input: ProjectionCompletionInput = {
    projection: "full",
    track: "personal_development",
    sessionId: "s1",
    state: { actionReached: true, realActionCompleted: true },
    identity: null,
  };
  const result = evaluateProjectionCompletion(input);
  assert.equal(result.stateCompleted, true);
  assert.equal(result.identityCompleted, null);
  assert.equal(result.countsForProgression, true);
});

test("Self Development, no Identity selected, State action not completed: never counts", () => {
  const input: ProjectionCompletionInput = {
    projection: "mini",
    track: "personal_development",
    sessionId: "s2",
    state: { actionReached: true, realActionCompleted: false },
    identity: { selected: false, actionReached: false, realActionCompleted: false },
  };
  const result = evaluateProjectionCompletion(input);
  assert.equal(result.stateCompleted, false);
  assert.equal(result.countsForProgression, false);
});

test("Self Development, Identity selected and completed: both required and both satisfied -> counts", () => {
  const input: ProjectionCompletionInput = {
    projection: "full",
    track: "personal_development",
    sessionId: "s3",
    state: { actionReached: true, realActionCompleted: true },
    identity: { selected: true, actionReached: true, realActionCompleted: true },
  };
  const result = evaluateProjectionCompletion(input);
  assert.equal(result.stateCompleted, true);
  assert.equal(result.identityCompleted, true);
  assert.equal(result.countsForProgression, true);
});

test("Self Development, Identity selected but abandoned: State completion is preserved separately, but the session does not count", () => {
  const input: ProjectionCompletionInput = {
    projection: "full",
    track: "personal_development",
    sessionId: "s4",
    state: { actionReached: true, realActionCompleted: true },
    identity: { selected: true, actionReached: false, realActionCompleted: false },
  };
  const result = evaluateProjectionCompletion(input);
  assert.equal(result.stateCompleted, true, "State completion must be preserved even though Identity was abandoned");
  assert.equal(result.identityCompleted, false);
  assert.equal(result.countsForProgression, false, "abandoning the optional Identity continuation must not count as a full completion");
});

// ---------------------------------------------------------------------------
// Full/Mini/Action-only, ARC Goal track -- Identity always mandatory
// ---------------------------------------------------------------------------

test("ARC Goal: State + Identity both completed -> counts", () => {
  const input: ProjectionCompletionInput = {
    projection: "full",
    track: "goal_achievement",
    sessionId: "g1",
    state: { actionReached: true, realActionCompleted: true },
    identity: { selected: true, actionReached: true, realActionCompleted: true },
  };
  const result = evaluateProjectionCompletion(input);
  assert.equal(result.countsForProgression, true);
});

test("ARC Goal: State completed but Identity not completed -> a Goal session is NOT fully completed", () => {
  const input: ProjectionCompletionInput = {
    projection: "full",
    track: "goal_achievement",
    sessionId: "g2",
    state: { actionReached: true, realActionCompleted: true },
    identity: { selected: true, actionReached: true, realActionCompleted: false },
  };
  const result = evaluateProjectionCompletion(input);
  assert.equal(result.stateCompleted, true, "partial-progress information (State completion) must still be preserved");
  assert.equal(result.identityCompleted, false);
  assert.equal(result.countsForProgression, false);
});

test("ARC Goal: identity.selected is irrelevant -- Identity is mandatory regardless of the flag", () => {
  // Even if a caller mistakenly marks identity.selected false for a Goal
  // session, Identity completion (not the selected flag) still gates
  // the counter -- Goal never treats Identity as optional.
  const input: ProjectionCompletionInput = {
    projection: "full",
    track: "goal_achievement",
    sessionId: "g3",
    state: { actionReached: true, realActionCompleted: true },
    identity: { selected: false, actionReached: true, realActionCompleted: true },
  };
  const result = evaluateProjectionCompletion(input);
  assert.equal(result.countsForProgression, true);
});

test("ARC Goal: missing identity input degrades safely to 'not completed', never crashes", () => {
  const input: ProjectionCompletionInput = {
    projection: "full",
    track: "goal_achievement",
    sessionId: "g4",
    state: { actionReached: true, realActionCompleted: true },
    identity: null,
  };
  const result = evaluateProjectionCompletion(input);
  assert.equal(result.identityCompleted, false);
  assert.equal(result.countsForProgression, false);
});

// ---------------------------------------------------------------------------
// Action-only
// ---------------------------------------------------------------------------

test("Action-only, Self Development, no Identity selected: State action alone counts", () => {
  const input: ProjectionCompletionInput = {
    projection: "action_only",
    track: "personal_development",
    sessionId: "a1",
    state: { actionReached: true, realActionCompleted: true },
    identity: null,
  };
  assert.equal(evaluateProjectionCompletion(input).countsForProgression, true);
});

test("Action-only, ARC Goal: mandatory Identity action must also be completed", () => {
  const incomplete: ProjectionCompletionInput = {
    projection: "action_only",
    track: "goal_achievement",
    sessionId: "a2",
    state: { actionReached: true, realActionCompleted: true },
    identity: { selected: true, actionReached: false, realActionCompleted: false },
  };
  assert.equal(evaluateProjectionCompletion(incomplete).countsForProgression, false);

  const complete: ProjectionCompletionInput = {
    projection: "action_only",
    track: "goal_achievement",
    sessionId: "a3",
    state: { actionReached: true, realActionCompleted: true },
    identity: { selected: true, actionReached: true, realActionCompleted: true },
  };
  assert.equal(evaluateProjectionCompletion(complete).countsForProgression, true);
});

// ---------------------------------------------------------------------------
// ARC Link -- never requires a real-world action
// ---------------------------------------------------------------------------

test("Link: counts on rehearsal completion alone, never requires a real-world action", () => {
  const input: ProjectionCompletionInput = {
    projection: "link",
    track: "personal_development",
    sessionId: "l1",
    link: { reachedFinalStage: true, requiredDwellsCompleted: true, completionAcknowledged: true },
  };
  const result = evaluateProjectionCompletion(input);
  assert.equal(result.stateCompleted, true);
  assert.equal(result.identityCompleted, null);
  assert.equal(result.countsForProgression, true);
});

test("Link: missing any one of the three required signals -> does not count", () => {
  const missingFinalStage: ProjectionCompletionInput = {
    projection: "link",
    track: "personal_development",
    sessionId: "l2",
    link: { reachedFinalStage: false, requiredDwellsCompleted: true, completionAcknowledged: true },
  };
  assert.equal(evaluateProjectionCompletion(missingFinalStage).countsForProgression, false);

  const missingDwells: ProjectionCompletionInput = {
    projection: "link",
    track: "personal_development",
    sessionId: "l3",
    link: { reachedFinalStage: true, requiredDwellsCompleted: false, completionAcknowledged: true },
  };
  assert.equal(evaluateProjectionCompletion(missingDwells).countsForProgression, false);

  const missingAck: ProjectionCompletionInput = {
    projection: "link",
    track: "goal_achievement",
    sessionId: "l4",
    link: { reachedFinalStage: true, requiredDwellsCompleted: true, completionAcknowledged: false },
  };
  assert.equal(evaluateProjectionCompletion(missingAck).countsForProgression, false);
});

// ---------------------------------------------------------------------------
// Progress-counter idempotency and increment routing
// ---------------------------------------------------------------------------

test("applyProjectionCompletionToProgress: increments the correct counter per projection kind", () => {
  const result = evaluateProjectionCompletion({
    projection: "full",
    track: "personal_development",
    sessionId: "s1",
    state: { actionReached: true, realActionCompleted: true },
    identity: null,
  });
  let progress = createEmptyProjectionProgressCounters();
  progress = applyProjectionCompletionToProgress(progress, "s1", "full", result);
  assert.equal(progress.completedFullCount, 1);
  assert.equal(progress.completedMiniCount, 0);
});

test("applyProjectionCompletionToProgress: the same session id can never increment progress twice", () => {
  const result = evaluateProjectionCompletion({
    projection: "mini",
    track: "personal_development",
    sessionId: "s1",
    state: { actionReached: true, realActionCompleted: true },
    identity: null,
  });
  let progress = createEmptyProjectionProgressCounters();
  progress = applyProjectionCompletionToProgress(progress, "s1", "mini", result);
  progress = applyProjectionCompletionToProgress(progress, "s1", "mini", result);
  progress = applyProjectionCompletionToProgress(progress, "s1", "mini", result);
  assert.equal(progress.completedMiniCount, 1, "re-applying the same session id must be a no-op");
  assert.equal(progress.countedSessionIds.length, 1);
});

test("applyProjectionCompletionToProgress: a non-qualifying result never increments any counter", () => {
  const result = evaluateProjectionCompletion({
    projection: "full",
    track: "goal_achievement",
    sessionId: "s1",
    state: { actionReached: true, realActionCompleted: true },
    identity: { selected: true, actionReached: false, realActionCompleted: false },
  });
  const progress = applyProjectionCompletionToProgress(createEmptyProjectionProgressCounters(), "s1", "full", result);
  assert.equal(progress.completedFullCount, 0);
  assert.equal(progress.countedSessionIds.length, 0, "a non-counting session must not even be recorded as counted");
});

test("applyProjectionCompletionToProgress: different sessions with the same outcome each increment independently", () => {
  const result = evaluateProjectionCompletion({
    projection: "link",
    track: "personal_development",
    sessionId: "irrelevant",
    link: { reachedFinalStage: true, requiredDwellsCompleted: true, completionAcknowledged: true },
  });
  let progress = createEmptyProjectionProgressCounters();
  progress = applyProjectionCompletionToProgress(progress, "l1", "link", result);
  progress = applyProjectionCompletionToProgress(progress, "l2", "link", result);
  assert.equal(progress.completedLinkCount, 2);
});

// ---------------------------------------------------------------------------
// Progress-counter keys: changing the linked State or Identity must never
// silently merge into the same progress record.
// ---------------------------------------------------------------------------

test("reactiveMappingProgressKeyToString: different linkedStateId produces a different key -- no silent merge", () => {
  const keyA = reactiveMappingProgressKeyToString({ interferenceItemId: "item-1", linkedStateId: "state-A", linkedIdentityVersion: null });
  const keyB = reactiveMappingProgressKeyToString({ interferenceItemId: "item-1", linkedStateId: "state-B", linkedIdentityVersion: null });
  assert.notEqual(keyA, keyB);
});

test("reactiveMappingProgressKeyToString: different linkedIdentityVersion produces a different key", () => {
  const keyV1 = reactiveMappingProgressKeyToString({ interferenceItemId: "item-1", linkedStateId: "state-A", linkedIdentityVersion: "v1" });
  const keyV2 = reactiveMappingProgressKeyToString({ interferenceItemId: "item-1", linkedStateId: "state-A", linkedIdentityVersion: "v2" });
  assert.notEqual(keyV1, keyV2);
});

test("reactiveMappingProgressKeyToString: identical inputs always produce the identical key", () => {
  const key1 = reactiveMappingProgressKeyToString({ interferenceItemId: "item-1", linkedStateId: "state-A", linkedIdentityVersion: "v1" });
  const key2 = reactiveMappingProgressKeyToString({ interferenceItemId: "item-1", linkedStateId: "state-A", linkedIdentityVersion: "v1" });
  assert.equal(key1, key2);
});

test("proactiveStateProgressKeyToString: reactive and proactive counters are tracked under structurally different key shapes, never colliding by construction", () => {
  const proactiveKey = proactiveStateProgressKeyToString({ stateId: "state-A", linkedIdentityVersion: "v1" });
  // A reactive key for the same state+identity always carries an extra
  // interferenceItemId segment the proactive key never has -- the two
  // key spaces cannot collide for any input.
  const reactiveKey = reactiveMappingProgressKeyToString({ interferenceItemId: "item-1", linkedStateId: "state-A", linkedIdentityVersion: "v1" });
  assert.notEqual(proactiveKey, reactiveKey);
});

test("changing the linked State starts a fresh progress record while the old key's progress remains untouched (decision 14)", () => {
  const oldKey = reactiveMappingProgressKeyToString({ interferenceItemId: "youtube-urge", linkedStateId: "focus", linkedIdentityVersion: null });
  const newKey = reactiveMappingProgressKeyToString({ interferenceItemId: "youtube-urge", linkedStateId: "energy", linkedIdentityVersion: null });

  const byKey = new Map<string, ReturnType<typeof createEmptyProjectionProgressCounters>>();
  byKey.set(oldKey, applyProjectionCompletionToProgress(createEmptyProjectionProgressCounters(), "s1", "full", { stateCompleted: true, identityCompleted: null, countsForProgression: true }));

  // Re-mapping the same interference item to a different State looks up
  // (and, if absent, creates) a DIFFERENT key -- the old key's own
  // record is never read or mutated by this.
  const newRecord = byKey.get(newKey) ?? createEmptyProjectionProgressCounters();
  const updatedNewRecord = applyProjectionCompletionToProgress(newRecord, "s2", "full", { stateCompleted: true, identityCompleted: null, countsForProgression: true });
  byKey.set(newKey, updatedNewRecord);

  assert.equal(byKey.get(oldKey)!.completedFullCount, 1, "old mapping's history must be preserved untouched");
  assert.equal(byKey.get(newKey)!.completedFullCount, 1, "new mapping starts its own independent count");
  assert.notEqual(oldKey, newKey);
});
