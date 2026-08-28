import test from "node:test";
import assert from "node:assert/strict";

import {
  applyPreventiveActionRouting,
  createArcMap,
  createGoalModelFromProfile,
  generateStableId,
  getArcMapDisplayLabel,
  removeArcMap,
  resolveActiveArcMap,
  resolveSelectedArcMap,
  upsertArcMap,
} from "./buildTypes.ts";
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

test("resolveSelectedArcMap returns the map matching selectedArcMapId when one is set", () => {
  const maps: ArcMap[] = [
    { id: "map1", desiredStateId: "d1", interferingState: "ביקורת עצמית", challengeContext: "אחרי טעות", preventiveAction: null },
    { id: "map2", desiredStateId: "d1", interferingState: "תסכול", challengeContext: "כשמשהו לא מצליח", preventiveAction: null },
  ];
  assert.equal(resolveSelectedArcMap(maps, "map2")?.id, "map2");
});

test("resolveSelectedArcMap falls back to the first map while nothing is selected yet", () => {
  const maps: ArcMap[] = [
    { id: "map1", desiredStateId: "d1", interferingState: null, challengeContext: null, preventiveAction: null },
    { id: "map2", desiredStateId: "d1", interferingState: null, challengeContext: null, preventiveAction: null },
  ];
  assert.equal(resolveSelectedArcMap(maps, null)?.id, "map1");
});

test("applyPreventiveActionRouting overlays a preventiveAction from any ArcMap that has one", () => {
  const p = profile({ preventiveAction: null });
  const maps: ArcMap[] = [
    { id: "map1", desiredStateId: "d1", interferingState: null, challengeContext: null, preventiveAction: null },
    { id: "map2", desiredStateId: "d1", interferingState: null, challengeContext: null, preventiveAction: "לעצור ולנשום" },
  ];
  const routed = applyPreventiveActionRouting(p, maps);
  assert.equal(routed.preventiveAction, "לעצור ולנשום");
});

test("applyPreventiveActionRouting prefers the profile's own field when it's already set", () => {
  const p = profile({ preventiveAction: "legacy-action" });
  const maps: ArcMap[] = [{ id: "map1", desiredStateId: "d1", interferingState: null, challengeContext: null, preventiveAction: "map-action" }];
  const routed = applyPreventiveActionRouting(p, maps);
  assert.equal(routed.preventiveAction, "legacy-action");
});

test("applyPreventiveActionRouting is a no-op when nothing (profile or any map) has a preventiveAction", () => {
  const p = profile({ preventiveAction: null });
  const maps: ArcMap[] = [{ id: "map1", desiredStateId: "d1", interferingState: null, challengeContext: null, preventiveAction: null }];
  const routed = applyPreventiveActionRouting(p, maps);
  assert.deepEqual(routed, p);
});

test("createArcMap builds a new ArcMap referencing the given desiredStateId with a fresh id", () => {
  const arcMap = createArcMap(
    "d1",
    { interferingState: "תסכול", challengeContext: "כשמשהו לא מצליח", preventiveAction: "לעצור לפני תגובה אוטומטית" },
    () => "new-id"
  );
  assert.equal(arcMap.id, "new-id");
  assert.equal(arcMap.desiredStateId, "d1");
  assert.equal(arcMap.challengeContext, "כשמשהו לא מצליח");
});

test("upsertArcMap appends when the id is new, replaces in place when it already exists", () => {
  const existing: ArcMap = { id: "map1", desiredStateId: "d1", interferingState: "a", challengeContext: null, preventiveAction: null };
  const appended = upsertArcMap([existing], { id: "map2", desiredStateId: "d1", interferingState: "b", challengeContext: null, preventiveAction: null });
  assert.equal(appended.length, 2);

  const updated = upsertArcMap([existing], { ...existing, interferingState: "changed" });
  assert.equal(updated.length, 1);
  assert.equal(updated[0].interferingState, "changed");
});

test("removeArcMap filters out only the matching id", () => {
  const maps: ArcMap[] = [
    { id: "map1", desiredStateId: "d1", interferingState: null, challengeContext: null, preventiveAction: null },
    { id: "map2", desiredStateId: "d1", interferingState: null, challengeContext: null, preventiveAction: null },
  ];
  const next = removeArcMap(maps, "map1");
  assert.deepEqual(next.map((m) => m.id), ["map2"]);
});

test("getArcMapDisplayLabel prefers challengeContext, then interferingState, then a generic fallback", () => {
  assert.equal(
    getArcMapDisplayLabel({ id: "1", desiredStateId: "d1", interferingState: "ביקורת", challengeContext: "אחרי טעות", preventiveAction: null }),
    "אחרי טעות"
  );
  assert.equal(
    getArcMapDisplayLabel({ id: "2", desiredStateId: "d1", interferingState: "ביקורת", challengeContext: null, preventiveAction: null }),
    "ביקורת"
  );
  assert.equal(
    getArcMapDisplayLabel({ id: "3", desiredStateId: "d1", interferingState: null, challengeContext: null, preventiveAction: null }),
    "דפוס ללא תיאור"
  );
});
