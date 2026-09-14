import test from "node:test";
import assert from "node:assert/strict";

import { resolveGoalRequiredIdentity, resolveGoalRequiredState, resolveGoalStateIdentity } from "./goalStateIdentity.ts";
import { createEmptyArcGoal } from "./types.ts";
import type { ArcGoal } from "./types.ts";

function goal(overrides: Partial<ArcGoal> = {}): ArcGoal {
  return { ...createEmptyArcGoal("g1", "מטרה", "2024-01-01T00:00:00.000Z"), ...overrides };
}

test("resolveGoalRequiredState: explicit stateProfileId wins", () => {
  const result = resolveGoalRequiredState(goal({ stateProfileId: "state-1" }));
  assert.deepEqual(result, { source: "explicit", id: "state-1" });
});

test("resolveGoalRequiredState: a legacy goal with no stateProfileId is unresolved -- never guessed from mappings", () => {
  const result = resolveGoalRequiredState(
    goal({
      stateProfileId: null,
      interferingMappings: [{ id: "m1", interferingState: "פחד", supportiveProtocolId: "arcbuild-1", supportiveAction: "פעולה" }],
    })
  );
  assert.deepEqual(result, { source: "unresolved", id: null });
});

test("resolveGoalRequiredState: a brand-new goal (createEmptyArcGoal, no stateProfileId set) is unresolved", () => {
  assert.deepEqual(resolveGoalRequiredState(goal()), { source: "unresolved", id: null });
});

test("resolveGoalRequiredIdentity: explicit identityProfileId wins over the legacy identityProtocolId", () => {
  const result = resolveGoalRequiredIdentity(goal({ identityProfileId: "identity-profile-1", identityProtocolId: "arcbuild-identity-1" }));
  assert.deepEqual(result, { source: "explicit", id: "identity-profile-1" });
});

test("resolveGoalRequiredIdentity: falls back to the legacy identityProtocolId when identityProfileId is unset", () => {
  const result = resolveGoalRequiredIdentity(goal({ identityProfileId: null, identityProtocolId: "arcbuild-identity-1" }));
  assert.deepEqual(result, { source: "legacy", id: "arcbuild-identity-1" });
});

test("resolveGoalRequiredIdentity: unresolved when neither field is set", () => {
  const result = resolveGoalRequiredIdentity(goal({ identityProfileId: null, identityProtocolId: null }));
  assert.deepEqual(result, { source: "unresolved", id: null });
});

test("resolveGoalStateIdentity: isComplete is true only when both State and Identity resolved to a real id", () => {
  const complete = resolveGoalStateIdentity(goal({ stateProfileId: "state-1", identityProfileId: "identity-1" }));
  assert.equal(complete.isComplete, true);

  const missingState = resolveGoalStateIdentity(goal({ stateProfileId: null, identityProtocolId: "arcbuild-identity-1" }));
  assert.equal(missingState.isComplete, false);
  assert.equal(missingState.state.source, "unresolved");
  assert.equal(missingState.identity.source, "legacy");

  const missingBoth = resolveGoalStateIdentity(goal());
  assert.equal(missingBoth.isComplete, false);
  assert.equal(missingBoth.state.source, "unresolved");
  assert.equal(missingBoth.identity.source, "unresolved");
});

test("resolveGoalStateIdentity never mutates the goal it's given", () => {
  const g = goal({ stateProfileId: "state-1", identityProfileId: "identity-1" });
  const snapshot = JSON.parse(JSON.stringify(g));
  resolveGoalStateIdentity(g);
  assert.deepEqual(g, snapshot);
});
