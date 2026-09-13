import test from "node:test";
import assert from "node:assert/strict";

import { buildLinkLibraryEntries, filterLinkLibraryEntries, isGoalAchievementEntry } from "./linkPracticeLibrary.ts";
import type { ArcLink, RoutineTrigger, WeeklyAction } from "./routineLinks.ts";
import type { ArcBuild } from "./types.ts";
import { createEmptyArcBuildProfile } from "./types.ts";
import type { MiniArcBuild } from "./miniArc.ts";

function arcLink(overrides: Partial<ArcLink> = {}): ArcLink {
  return {
    id: "link-1",
    protocolId: "arcbuild-1",
    protocolType: "arc",
    weeklyActionId: "wa-1",
    triggerId: "trig-1",
    mode: "with_archi",
    practiceDays: [0, 2],
    practiceTime: "09:00",
    weeklyTarget: 4,
    completedPracticeDates: [],
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function arcBuild(overrides: Partial<ArcBuild> = {}): ArcBuild {
  return {
    id: "arcbuild-1",
    name: "הפרוטוקול שלי",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    needsState: true,
    needsIdentity: false,
    needsHabit: false,
    needsIdentityImmediately: false,
    profile: createEmptyArcBuildProfile(),
    ...overrides,
  };
}

function miniArcBuild(overrides: Partial<MiniArcBuild> = {}): MiniArcBuild {
  return {
    id: "miniarc-1",
    name: "ה-Mini שלי",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    presenceColor: "סגול",
    regulationAnchor: "עוגן",
    encodingAction: "פעולה",
    beneficialAction: "פעולה מיטיבה",
    linkSettings: { enabled: true, triggerType: "time", triggerText: "בשעה 10:00" },
    ...overrides,
  };
}

function trigger(overrides: Partial<RoutineTrigger> = {}): RoutineTrigger {
  return { id: "trig-1", type: "time", text: "בשעה 10:00", time: "10:00", createdAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

function weeklyAction(overrides: Partial<WeeklyAction> = {}): WeeklyAction {
  return {
    id: "wa-1",
    name: "פעילות גופנית",
    days: [0, 2, 4],
    times: ["18:00"],
    durationMinutes: 10,
    triggerId: "trig-1",
    weeklyTarget: 3,
    completedDates: [],
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("buildLinkLibraryEntries categorizes an ArcLink whose protocolType is 'arc' as 'arc_link' and one whose protocolType is 'mini_arc' as 'mini_arc_link'", () => {
  const links = [arcLink({ id: "l1", protocolType: "arc" }), arcLink({ id: "l2", protocolType: "mini_arc", protocolId: "miniarc-1" })];
  const entries = buildLinkLibraryEntries(
    links,
    { "arcbuild-1": arcBuild() },
    { "miniarc-1": miniArcBuild() },
    { "trig-1": trigger() },
    { "wa-1": weeklyAction() }
  );
  assert.equal(entries.find((e) => e.link.id === "l1")!.category, "arc_link");
  assert.equal(entries.find((e) => e.link.id === "l2")!.category, "mini_arc_link");
});

test("filterLinkLibraryEntries splits entries correctly between 'arc_link' and 'mini_arc_link' categories, never mixing them", () => {
  const links = [arcLink({ id: "l1", protocolType: "arc" }), arcLink({ id: "l2", protocolType: "mini_arc", protocolId: "miniarc-1" })];
  const entries = buildLinkLibraryEntries(
    links,
    { "arcbuild-1": arcBuild() },
    { "miniarc-1": miniArcBuild() },
    { "trig-1": trigger() },
    { "wa-1": weeklyAction() }
  );
  const arcLinks = filterLinkLibraryEntries(entries, "arc_link");
  const miniLinks = filterLinkLibraryEntries(entries, "mini_arc_link");
  assert.equal(arcLinks.length, 1);
  assert.equal(miniLinks.length, 1);
  assert.equal(arcLinks[0].link.id, "l1");
  assert.equal(miniLinks[0].link.id, "l2");
});

test("buildLinkLibraryEntries never drops or hides a Link whose protocol reference is broken/stale -- protocolName falls back to '' instead of crashing", () => {
  const links = [arcLink({ id: "l1", protocolId: "does-not-exist" })];
  const entries = buildLinkLibraryEntries(links, {}, {}, {}, {});
  assert.equal(entries.length, 1);
  assert.equal(entries[0].protocolName, "");
});

test("buildLinkLibraryEntries never mutates or copies the underlying ArcLink record -- entry.link is the exact same object", () => {
  const link = arcLink();
  const entries = buildLinkLibraryEntries([link], { "arcbuild-1": arcBuild() }, {}, { "trig-1": trigger() }, { "wa-1": weeklyAction() });
  assert.equal(entries[0].link, link);
});

test("a Goal Achievement Link (its weekly action linked to an arc_goal) resolves linkedArcGoalId, and isGoalAchievementEntry is true", () => {
  const goalLinkedAction = weeklyAction({ id: "wa-goal", linkedProtocolType: "arc_goal", linkedProtocolId: "goal-1" });
  const link = arcLink({ weeklyActionId: "wa-goal" });
  const entries = buildLinkLibraryEntries([link], { "arcbuild-1": arcBuild() }, {}, { "trig-1": trigger() }, { "wa-goal": goalLinkedAction });
  assert.equal(entries[0].linkedArcGoalId, "goal-1");
  assert.ok(isGoalAchievementEntry(entries[0]));
});

test("a Personal Development Link (its weekly action has no arc_goal link) has linkedArcGoalId null, and isGoalAchievementEntry is false", () => {
  const plainAction = weeklyAction({ id: "wa-plain" });
  const link = arcLink({ weeklyActionId: "wa-plain" });
  const entries = buildLinkLibraryEntries([link], { "arcbuild-1": arcBuild() }, {}, { "trig-1": trigger() }, { "wa-plain": plainAction });
  assert.equal(entries[0].linkedArcGoalId, null);
  assert.ok(!isGoalAchievementEntry(entries[0]));
});

test("buildLinkLibraryEntries resolves targetType via resolveArcLinkTargetType -- 'legacy_generic' for a Link with no targetType, the exact stored value otherwise", () => {
  const legacy = arcLink({ id: "legacy" });
  const withTarget = arcLink({ id: "typed", targetType: "belief" });
  const entries = buildLinkLibraryEntries(
    [legacy, withTarget],
    { "arcbuild-1": arcBuild() },
    {},
    { "trig-1": trigger() },
    { "wa-1": weeklyAction() }
  );
  assert.equal(entries.find((e) => e.link.id === "legacy")!.targetType, "legacy_generic");
  assert.equal(entries.find((e) => e.link.id === "typed")!.targetType, "belief");
});

test("buildLinkLibraryEntries resolves miniArcProtocolKind only for 'mini_arc_link' category entries -- null for a full 'arc_link' entry", () => {
  const arcCategoryLink = arcLink({ id: "l1", protocolType: "arc" });
  const miniCategoryLink = arcLink({ id: "l2", protocolType: "mini_arc", protocolId: "miniarc-1" });
  const entries = buildLinkLibraryEntries(
    [arcCategoryLink, miniCategoryLink],
    { "arcbuild-1": arcBuild() },
    { "miniarc-1": miniArcBuild({ protocolKind: "urge" }) },
    { "trig-1": trigger() },
    { "wa-1": weeklyAction() }
  );
  assert.equal(entries.find((e) => e.link.id === "l1")!.miniArcProtocolKind, null);
  assert.equal(entries.find((e) => e.link.id === "l2")!.miniArcProtocolKind, "urge");
});

test("buildLinkLibraryEntries includes Links from both Personal Development and Goal Achievement in the same list, distinguishable by linkedArcGoalId", () => {
  const goalAction = weeklyAction({ id: "wa-goal", linkedProtocolType: "arc_goal", linkedProtocolId: "goal-1" });
  const plainAction = weeklyAction({ id: "wa-plain" });
  const links = [arcLink({ id: "l1", weeklyActionId: "wa-goal" }), arcLink({ id: "l2", weeklyActionId: "wa-plain" })];
  const entries = buildLinkLibraryEntries(
    links,
    { "arcbuild-1": arcBuild() },
    {},
    { "trig-1": trigger() },
    { "wa-goal": goalAction, "wa-plain": plainAction }
  );
  assert.equal(entries.length, 2);
  assert.equal(entries.find((e) => e.link.id === "l1")!.linkedArcGoalId, "goal-1");
  assert.equal(entries.find((e) => e.link.id === "l2")!.linkedArcGoalId, null);
});

test("buildLinkLibraryEntries never renders 'undefined'/'null' in resolved trigger text, even for a stale/missing triggerId", () => {
  const link = arcLink({ triggerId: "does-not-exist" });
  const entries = buildLinkLibraryEntries([link], { "arcbuild-1": arcBuild() }, {}, {}, { "wa-1": weeklyAction() });
  assert.ok(!entries[0].trigger.includes("undefined"));
  assert.ok(!entries[0].trigger.includes("null"));
});
