import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyCombinedLiveSessionFacts } from "./combinedLiveSessionFacts.ts";
import { createEmptyCombinedRouteSessionFacts } from "./combinedRoute.ts";

test("createEmptyCombinedLiveSessionFacts: reactive session defaults", () => {
  const facts = createEmptyCombinedLiveSessionFacts("session1", "state1", ["a", "b"], "reactive");
  assert.equal(facts.sessionId, "session1");
  assert.equal(facts.stateProfileId, "state1");
  assert.deepEqual(facts.configuredItemIds, ["a", "b"]);
  assert.deepEqual(facts.selectedItemIds, []);
  assert.deepEqual(facts.practicedItemIds, []);
  assert.equal(facts.practicedStage, 1);
  assert.equal(facts.projection, "full");
  assert.equal(facts.cadence, "reactive");
  assert.equal(facts.presenceSelectedForSession, false);
  assert.deepEqual(facts.factorRatingHistory, []);
  assert.equal(facts.baselinePrimaryFactorId, null);
  assert.deepEqual(facts.latestHighestInterferingFactorIds, []);
  assert.equal(facts.actionReached, false);
  assert.equal(facts.realActionCompleted, false);
  assert.equal(facts.terminalCompleted, false);
});

test("createEmptyCombinedLiveSessionFacts: proactive session -- factorRatingHistory remains empty per Phase 14B scope", () => {
  const facts = createEmptyCombinedLiveSessionFacts("session2", "state1", [], "proactive");
  assert.equal(facts.cadence, "proactive");
  assert.equal(facts.practicedStage, 1);
  assert.equal(facts.projection, "full");
  assert.deepEqual(facts.factorRatingHistory, []);
});

test("createEmptyCombinedLiveSessionFacts reuses createEmptyCombinedRouteSessionFacts's own dedup/backfill behavior verbatim, never re-deriving it", () => {
  const routeFacts = createEmptyCombinedRouteSessionFacts(["a", "a", "b"]);
  const facts = createEmptyCombinedLiveSessionFacts("session1", "state1", ["a", "a", "b"], "reactive");
  assert.deepEqual(facts.configuredItemIds, routeFacts.configuredItemIds);
});

test("createEmptyCombinedLiveSessionFacts never mutates the configuredItemIds array it was given", () => {
  const ids = ["a", "b"];
  const idsCopy = [...ids];
  createEmptyCombinedLiveSessionFacts("session1", "state1", ids, "reactive");
  assert.deepEqual(ids, idsCopy);
});
