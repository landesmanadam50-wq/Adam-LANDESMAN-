import test from "node:test";
import assert from "node:assert/strict";

import { applyActiveArcMap, createGoalModelFromProfile, generateStableId, resolveActiveArcMap } from "./buildTypes.ts";
import type { ArcMap } from "./buildTypes.ts";
import type { ArcBuildProfile } from "./types.ts";

function profile(overrides: Partial<ArcBuildProfile> = {}): ArcBuildProfile {
  return {
    programPath: "standard_3_week",
    identityActionNeeded: false,
    interferingState: null,
    supportiveState: null,
    stateEncoding: null,
    internalAction: null,
    desiredIdentity: null,
    identityInterferingEmotion: null,
    identityEncoding: null,
    identityAction: null,
    habit: null,
    beneficialAction: null,
    preventiveAction: null,
    regulationTool: "נשימה 4-7-8",
    actionDuration: null,
    successFocusDuration: null,
    ...overrides,
  };
}

function sequentialIdGenerator(): (kind: "desiredState" | "arcMap") => string {
  let n = 0;
  return (kind) => `${kind}_${++n}`;
}

function generateStableIdForKind(kind: "desiredState" | "arcMap"): string {
  return generateStableId(kind === "desiredState" ? "state" : "arcmap");
}

test("createGoalModelFromProfile returns null when there's no desired state to migrate", () => {
  const p = profile({ habit: "לעצור לרגע", beneficialAction: "לדבר בעדינות" }); // Habit Only, no state layer
  assert.equal(createGoalModelFromProfile(p, generateStableIdForKind), null);
});

test("migrates a full state+identity+habit profile into a goalProfile + one ArcMap", () => {
  const p = profile({
    supportiveState: "חמלה",
    interferingState: "ביקורת עצמית",
    preventiveAction: "לעצור ולשים לב למה שכבר נוכח",
    desiredIdentity: "אדם חומל ומשמעתי",
    habit: "לעצור במקום לבקר את עצמי מיד",
  });
  const generateId = sequentialIdGenerator();
  const model = createGoalModelFromProfile(p, generateId);
  assert.ok(model);
  const { goalProfile, arcMaps } = model!;

  assert.equal(goalProfile.desiredState, "חמלה");
  assert.equal(goalProfile.identity, "אדם חומל ומשמעתי");
  assert.equal(goalProfile.habit, "לעצור במקום לבקר את עצמי מיד");
  assert.equal(goalProfile.goal, null, "no legacy field maps to goal -- must never be invented");

  assert.equal(arcMaps.length, 1);
  assert.equal(arcMaps[0].desiredStateId, goalProfile.desiredStateId);
  assert.equal(arcMaps[0].interferingState, "ביקורת עצמית");
  assert.equal(arcMaps[0].preventiveAction, "לעצור ולשים לב למה שכבר נוכח");
  assert.equal(arcMaps[0].challengeContext, null, "no legacy equivalent -- stays null until added later");
});

test("goalProfile.desiredStateId and the ArcMap's own id are two distinct generated values", () => {
  const p = profile({ supportiveState: "מיקוד" });
  const generateId = sequentialIdGenerator();
  const { goalProfile, arcMaps } = createGoalModelFromProfile(p, generateId)!;
  assert.notEqual(goalProfile.desiredStateId, arcMaps[0].id);
});

test("a state-only profile with no interfering state or preventive action on record migrates with those left null", () => {
  const p = profile({ supportiveState: "מיקוד" });
  const { arcMaps, goalProfile } = createGoalModelFromProfile(p, generateStableIdForKind)!;
  assert.equal(arcMaps[0].interferingState, null);
  assert.equal(arcMaps[0].preventiveAction, null);
  assert.equal(goalProfile.identity, null, "identity layer wasn't built -- stays null, not a placeholder");
  assert.equal(goalProfile.habit, null, "habit layer wasn't built -- stays null, not a placeholder");
});

test("generateStableId produces distinct values across calls", () => {
  const a = generateStableId("state");
  const b = generateStableId("state");
  assert.notEqual(a, b);
  assert.ok(a.startsWith("state_"));
});

test("resolveActiveArcMap picks the first ArcMap when several exist", () => {
  const maps: ArcMap[] = [
    { id: "map1", desiredStateId: "d1", interferingState: "ביקורת עצמית", challengeContext: "אחרי טעות", preventiveAction: null },
    { id: "map2", desiredStateId: "d1", interferingState: "תסכול", challengeContext: "כשמשהו לא מצליח", preventiveAction: null },
  ];
  assert.equal(resolveActiveArcMap(maps)?.id, "map1");
});

test("resolveActiveArcMap returns null for an empty list", () => {
  assert.equal(resolveActiveArcMap([]), null);
});

test("applyActiveArcMap overlays the active map's fields onto the profile", () => {
  const p = profile({ interferingState: "old-legacy-value", preventiveAction: "old-legacy-action", supportiveState: "חמלה" });
  const maps: ArcMap[] = [
    { id: "map1", desiredStateId: "d1", interferingState: "ביקורת עצמית", challengeContext: "אחרי טעות", preventiveAction: "לעצור ולנשום" },
  ];
  const effective = applyActiveArcMap(p, maps);
  assert.equal(effective.interferingState, "ביקורת עצמית");
  assert.equal(effective.preventiveAction, "לעצור ולנשום");
  assert.equal(effective.supportiveState, "חמלה", "fields the ArcMap doesn't own are untouched");
});

test("applyActiveArcMap falls back to the profile's own field when the active map leaves it null", () => {
  const p = profile({ interferingState: "legacy-value", preventiveAction: "legacy-action" });
  const maps: ArcMap[] = [{ id: "map1", desiredStateId: "d1", interferingState: null, challengeContext: null, preventiveAction: null }];
  const effective = applyActiveArcMap(p, maps);
  assert.equal(effective.interferingState, "legacy-value");
  assert.equal(effective.preventiveAction, "legacy-action");
});

test("applyActiveArcMap is a no-op when there are no ArcMaps yet", () => {
  const p = profile({ interferingState: "legacy-value" });
  const effective = applyActiveArcMap(p, []);
  assert.deepEqual(effective, p);
});
