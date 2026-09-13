import test from "node:test";
import assert from "node:assert/strict";

import {
  arcLinkPracticeSchedule,
  countCompletionsThisWeek,
  deleteArcLinkFromList,
  deleteRoutineTriggerFromList,
  deleteWeeklyActionFromList,
  describeArcLinkKindAndCategory,
  describeTrigger,
  markWeeklyActionCompletedToday,
  resolveArcLinkKind,
  resolveArcLinkPracticeModeDefault,
  resolveArcLinkTargetType,
  resolveArcLinkTriggerCategory,
  resolveCurrentTriggerLevel,
  resolveLinkTimerStyle,
  resolveRoutineTrigger,
  resolveWeeklyAction,
  upsertArcLinkInList,
  upsertRoutineTriggerInList,
  upsertWeeklyActionInList,
  upsertWeeklyTriggerLevel,
} from "./routineLinks.ts";
import type { ArcLink, ArcLinkTargetType, RoutineTrigger, WeeklyAction, WeeklyTriggerLevel } from "./routineLinks.ts";

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

// ---------------------------------------------------------------------------
// List CRUD -- editing/deleting one entity never touches another
// ---------------------------------------------------------------------------

test("upsertRoutineTriggerInList updates the matching trigger in place by id, never touching another trigger", () => {
  const list = [trigger({ id: "a", text: "טריגר א" }), trigger({ id: "b", text: "טריגר ב" })];
  const updated = upsertRoutineTriggerInList(list, trigger({ id: "a", text: "טריגר א מעודכן" }));
  assert.equal(updated.find((t) => t.id === "a")!.text, "טריגר א מעודכן");
  assert.equal(updated.find((t) => t.id === "b")!.text, "טריגר ב");
  assert.equal(updated.length, 2);
});

test("upsertRoutineTriggerInList appends a new trigger when the id doesn't match any existing one", () => {
  const list = [trigger({ id: "a" })];
  const updated = upsertRoutineTriggerInList(list, trigger({ id: "c" }));
  assert.equal(updated.length, 2);
});

test("deleteRoutineTriggerFromList removes exactly the matching trigger, a no-op for an unknown id", () => {
  const list = [trigger({ id: "a" }), trigger({ id: "b" })];
  assert.equal(deleteRoutineTriggerFromList(list, "a").length, 1);
  assert.equal(deleteRoutineTriggerFromList(list, "nope").length, 2);
});

test("upsertWeeklyActionInList / deleteWeeklyActionFromList mirror the same by-id-only guarantee", () => {
  const list = [weeklyAction({ id: "a", name: "פעולה א" }), weeklyAction({ id: "b", name: "פעולה ב" })];
  const updated = upsertWeeklyActionInList(list, weeklyAction({ id: "a", name: "פעולה א מעודכנת" }));
  assert.equal(updated.find((w) => w.id === "a")!.name, "פעולה א מעודכנת");
  assert.equal(updated.find((w) => w.id === "b")!.name, "פעולה ב");
  assert.equal(deleteWeeklyActionFromList(list, "a").length, 1);
});

// ---------------------------------------------------------------------------
// Routine <-> ARC Goal linking task: WeeklyAction.linkedProtocolType now
// also accepts "arc_goal" (RoutineProtocolType), and
// markWeeklyActionCompletedToday is the one shared completion rule both
// WeeklyActionsSection's own no-linked-protocol plain check-off and a
// routine-launched ARC Goal session (live/ArcGoalSessionScreen.tsx's
// handleGoalActionConfirmDone) now reuse.
// ---------------------------------------------------------------------------

test("a WeeklyAction can be linked to an ARC Goal via the SAME generic linkedProtocolId/linkedProtocolType fields already used for ARC/Mini ARC -- no separate linkedGoalId field needed", () => {
  const action = weeklyAction({ linkedProtocolType: "arc_goal", linkedProtocolId: "arcgoal-1" });
  assert.equal(action.linkedProtocolType, "arc_goal");
  assert.equal(action.linkedProtocolId, "arcgoal-1");
});

test("markWeeklyActionCompletedToday adds today's local date once, updating updatedAt", () => {
  const action = weeklyAction({ completedDates: ["2026-01-01"] });
  const result = markWeeklyActionCompletedToday(action, "2026-01-05", "2026-01-05T10:00:00.000Z");
  assert.deepEqual(result.completedDates, ["2026-01-01", "2026-01-05"]);
  assert.equal(result.updatedAt, "2026-01-05T10:00:00.000Z");
});

test("markWeeklyActionCompletedToday is idempotent -- calling it twice for the same local date never adds a duplicate entry", () => {
  const action = weeklyAction({ completedDates: ["2026-01-05"] });
  const result = markWeeklyActionCompletedToday(action, "2026-01-05", "2026-01-05T10:00:00.000Z");
  assert.deepEqual(result.completedDates, ["2026-01-05"]);
});

test("markWeeklyActionCompletedToday never touches any other field of the action", () => {
  const action = weeklyAction({ name: "פעילות", linkedProtocolType: "arc_goal", linkedProtocolId: "arcgoal-1" });
  const result = markWeeklyActionCompletedToday(action, "2026-01-05", "2026-01-05T10:00:00.000Z");
  assert.equal(result.name, "פעילות");
  assert.equal(result.linkedProtocolType, "arc_goal");
  assert.equal(result.linkedProtocolId, "arcgoal-1");
  assert.equal(result.id, action.id);
});

test("markWeeklyActionCompletedToday never mutates the original action object", () => {
  const action = weeklyAction({ completedDates: [] });
  const snapshot = JSON.parse(JSON.stringify(action));
  markWeeklyActionCompletedToday(action, "2026-01-05", "2026-01-05T10:00:00.000Z");
  assert.deepEqual(action, snapshot);
});

test("a legacy WeeklyAction record (linkedProtocolType/linkedProtocolId genuinely absent) still resolves safely -- preserved, never crashing", () => {
  const legacy = { ...weeklyAction(), linkedProtocolType: undefined, linkedProtocolId: undefined } as unknown as WeeklyAction;
  assert.doesNotThrow(() => markWeeklyActionCompletedToday(legacy, "2026-01-05", "2026-01-05T10:00:00.000Z"));
});

test("upsertArcLinkInList / deleteArcLinkFromList mirror the same by-id-only guarantee -- an ARC Link and a Mini ARC Link never collide", () => {
  const list = [arcLink({ id: "a", protocolType: "arc" }), arcLink({ id: "b", protocolType: "mini_arc" })];
  const updated = upsertArcLinkInList(list, arcLink({ id: "a", enabled: false }));
  assert.equal(updated.find((l) => l.id === "a")!.enabled, false);
  assert.equal(updated.find((l) => l.id === "b")!.enabled, true);
  assert.equal(deleteArcLinkFromList(list, "a").length, 1);
});

// ---------------------------------------------------------------------------
// Lookup / describe -- safe for a deleted/missing reference
// ---------------------------------------------------------------------------

test("resolveRoutineTrigger / resolveWeeklyAction return null (never throw) for a missing or deleted reference", () => {
  assert.equal(resolveRoutineTrigger(null, []), null);
  assert.equal(resolveRoutineTrigger("gone", [trigger({ id: "a" })]), null);
  assert.equal(resolveRoutineTrigger("a", [trigger({ id: "a" })])!.id, "a");
  assert.equal(resolveWeeklyAction(undefined, []), null);
  assert.equal(resolveWeeklyAction("gone", [weeklyAction({ id: "a" })]), null);
});

test("describeTrigger never renders 'undefined'/'null' and safely falls back for a missing trigger", () => {
  assert.equal(describeTrigger(null), "לא הוגדר טריגר");
  assert.equal(describeTrigger(trigger({ text: "   " })), "לא הוגדר טריגר");
  assert.equal(describeTrigger(trigger({ text: "אחרי ארוחת הערב" })), "אחרי ארוחת הערב");
});

// ---------------------------------------------------------------------------
// Weekly completion counting -- reuses data/weeklyStats.ts's ISO week key
// ---------------------------------------------------------------------------

test("countCompletionsThisWeek counts only dates in the same ISO week as `now`", () => {
  const now = new Date("2026-03-11T12:00:00.000Z"); // Wednesday
  const dates = [
    "2026-03-09", // Monday, same week
    "2026-03-11", // Wednesday, same week
    "2026-03-08", // previous Sunday, different ISO week
    "2026-03-16", // next Monday, different week
  ];
  assert.equal(countCompletionsThisWeek(dates, now), 2);
});

test("countCompletionsThisWeek safely ignores malformed date entries rather than throwing", () => {
  const now = new Date("2026-03-11T12:00:00.000Z");
  assert.equal(countCompletionsThisWeek(["not-a-date", "", "2026-03-11"], now), 1);
});

test("countCompletionsThisWeek returns 0 for an empty list", () => {
  assert.equal(countCompletionsThisWeek([]), 0);
});

// ---------------------------------------------------------------------------
// arcLinkPracticeSchedule -- adapts to arc/routines.ts's own {hour, minute,
// recurrenceDays} shape; null when no practice time is configured
// ---------------------------------------------------------------------------

test("arcLinkPracticeSchedule returns null when practiceTime or practiceDays is missing/empty -- the practice schedule is optional", () => {
  assert.equal(arcLinkPracticeSchedule({ practiceDays: [], practiceTime: "09:00" }), null);
  assert.equal(arcLinkPracticeSchedule({ practiceDays: [1], practiceTime: null }), null);
});

test("arcLinkPracticeSchedule parses a valid 'HH:MM' practiceTime into {hour, minute, recurrenceDays}", () => {
  const schedule = arcLinkPracticeSchedule({ practiceDays: [1, 3], practiceTime: "09:05" });
  assert.deepEqual(schedule, { hour: 9, minute: 5, recurrenceDays: [1, 3] });
});

test("arcLinkPracticeSchedule returns null (never NaN/garbage) for a malformed practiceTime string", () => {
  assert.equal(arcLinkPracticeSchedule({ practiceDays: [1], practiceTime: "not-a-time" }), null);
  assert.equal(arcLinkPracticeSchedule({ practiceDays: [1], practiceTime: "25:00" }), null);
  assert.equal(arcLinkPracticeSchedule({ practiceDays: [1], practiceTime: "10:70" }), null);
});

// ---------------------------------------------------------------------------
// Extended ARC Link trigger system: kind/triggerCategory -- safe defaults
// for every legacy record (both fields are new and optional)
// ---------------------------------------------------------------------------

test("resolveArcLinkKind defaults to 'standard' for a legacy record with no kind field at all", () => {
  const legacy = arcLink();
  delete (legacy as { kind?: unknown }).kind;
  assert.equal(resolveArcLinkKind(legacy), "standard");
  assert.equal(resolveArcLinkKind(arcLink({ kind: "bridging" })), "bridging");
});

test("resolveArcLinkTriggerCategory defaults to 'scheduled' for a legacy record with no triggerCategory field, and for any unrecognized value", () => {
  const legacy = arcLink();
  delete (legacy as { triggerCategory?: unknown }).triggerCategory;
  assert.equal(resolveArcLinkTriggerCategory(legacy), "scheduled");
  assert.equal(resolveArcLinkTriggerCategory(arcLink({ triggerCategory: "routine" })), "routine");
  assert.equal(resolveArcLinkTriggerCategory(arcLink({ triggerCategory: "preventive" })), "preventive");
  assert.equal(resolveArcLinkTriggerCategory(arcLink({ triggerCategory: "reactive" })), "reactive");
});

// --- Link practice-mode + timers task: safe defaults for a legacy
// ArcLink saved before these fields existed (test #13-equivalent from
// the modular-ARC spec: "existing older program without new fields").

test("resolveArcLinkPracticeModeDefault defaults to 'full' for a legacy record with no defaultPracticeMode field -- reproducing this app's original unconditional full-rehearsal behavior", () => {
  const legacy = arcLink();
  delete (legacy as { defaultPracticeMode?: unknown }).defaultPracticeMode;
  assert.equal(resolveArcLinkPracticeModeDefault(legacy), "full");
  assert.equal(resolveArcLinkPracticeModeDefault(arcLink({ defaultPracticeMode: "short" })), "short");
  assert.equal(resolveArcLinkPracticeModeDefault(arcLink({ defaultPracticeMode: "fast" })), "fast");
  assert.equal(resolveArcLinkPracticeModeDefault(arcLink({ defaultPracticeMode: "full" })), "full");
  assert.equal(resolveArcLinkPracticeModeDefault(arcLink({ defaultPracticeMode: null })), "full", "null (explicitly configured, then cleared) is treated the same as never-configured");
});

test("resolveLinkTimerStyle defaults to 'guided' for a legacy record with no timerStyle field -- reproducing this app's original no-timer-at-all behavior", () => {
  const legacy = arcLink();
  delete (legacy as { timerStyle?: unknown }).timerStyle;
  assert.equal(resolveLinkTimerStyle(legacy), "guided");
  assert.equal(resolveLinkTimerStyle(arcLink({ timerStyle: "speed" })), "speed");
  assert.equal(resolveLinkTimerStyle(arcLink({ timerStyle: "guided" })), "guided");
  assert.equal(resolveLinkTimerStyle(arcLink({ timerStyle: null })), "guided");
});

test("describeArcLinkKindAndCategory clearly distinguishes all five UI-facing ARC Link types", () => {
  assert.equal(describeArcLinkKindAndCategory(arcLink({ kind: "standard", triggerCategory: "scheduled" })), "ARC Link מתוזמן");
  assert.equal(describeArcLinkKindAndCategory(arcLink({ kind: "standard", triggerCategory: "routine" })), "ARC Link לשגרה");
  assert.equal(describeArcLinkKindAndCategory(arcLink({ kind: "standard", triggerCategory: "preventive" })), "ARC Link מניעתי");
  assert.equal(describeArcLinkKindAndCategory(arcLink({ kind: "standard", triggerCategory: "reactive" })), "ARC Link תגובתי");
  assert.equal(describeArcLinkKindAndCategory(arcLink({ kind: "bridging", triggerCategory: "reactive" })), "ARC Link מגשר");
});

test("a legacy ArcLink (no kind/triggerCategory at all) describes as the original 'ARC Link מתוזמן', never crashing", () => {
  const legacy = arcLink();
  delete (legacy as { kind?: unknown }).kind;
  delete (legacy as { triggerCategory?: unknown }).triggerCategory;
  assert.equal(describeArcLinkKindAndCategory(legacy), "ARC Link מתוזמן");
});

// ---------------------------------------------------------------------------
// Weekly trigger levels
// ---------------------------------------------------------------------------

test("resolveCurrentTriggerLevel defaults to level 1 when no levels are configured", () => {
  assert.equal(resolveCurrentTriggerLevel(null, 3), 1);
  assert.equal(resolveCurrentTriggerLevel(undefined, 1), 1);
  assert.equal(resolveCurrentTriggerLevel([], 5), 1);
});

test("resolveCurrentTriggerLevel picks the level configured for the highest week <= currentWeek, never a later week's level", () => {
  const levels: WeeklyTriggerLevel[] = [
    { week: 1, level: 1 },
    { week: 3, level: 2 },
    { week: 6, level: 4 },
  ];
  assert.equal(resolveCurrentTriggerLevel(levels, 1), 1);
  assert.equal(resolveCurrentTriggerLevel(levels, 2), 1, "week 2 has no entry of its own -- falls back to the last configured week (1), never invents one");
  assert.equal(resolveCurrentTriggerLevel(levels, 3), 2);
  assert.equal(resolveCurrentTriggerLevel(levels, 5), 2);
  assert.equal(resolveCurrentTriggerLevel(levels, 6), 4);
  assert.equal(resolveCurrentTriggerLevel(levels, 10), 4);
  assert.equal(resolveCurrentTriggerLevel(levels, 0), 1, "before any configured week -- safe default, never a crash");
});

// ---------------------------------------------------------------------------
// End-to-end legacy-data + multi-Bridging-Link coexistence, at the list-CRUD
// level (mirrors exactly what data/storage.ts's loadArcLinks/upsertArcLink do
// -- a plain JSON.parse/JSON.stringify round trip with no field filtering).
// ---------------------------------------------------------------------------

test("a legacy ArcLink parsed from stored JSON (kind/triggerCategory/triggerLevels/bridging genuinely absent) loads, upserts, and describes safely -- never crashing, never silently becoming a Bridging Link", () => {
  const legacyJson = JSON.stringify(arcLink({ id: "legacy-1" }));
  const legacy = JSON.parse(legacyJson) as ArcLink;
  assert.equal("kind" in legacy, false);
  assert.equal(resolveArcLinkKind(legacy), "standard");
  assert.equal(resolveArcLinkTriggerCategory(legacy), "scheduled");
  assert.equal(describeArcLinkKindAndCategory(legacy), "ARC Link מתוזמן");
  assert.equal(resolveCurrentTriggerLevel(legacy.triggerLevels, 3), 1);

  const list = upsertArcLinkInList([], legacy);
  assert.equal(list.length, 1);
  assert.equal(resolveArcLinkKind(list[0]), "standard");
  assert.equal("futureMantraOverride" in legacy, false, "the Updated-ARC-structure task's own new field is also genuinely absent on a legacy record");
});

test("BridgingLinkConfig.futureMantraOverride round-trips through JSON (exactly what data/storage.ts does) and is absent on a Bridging Link that never set one", () => {
  const withOverride = arcLink({
    id: "bridge-with-override",
    kind: "bridging",
    bridging: { supportiveProtocolId: "state-build-1", variant: "full", futureMantraOverride: "מנטרה מותאמת" },
  });
  const roundTripped = JSON.parse(JSON.stringify(withOverride)) as ArcLink;
  assert.equal(roundTripped.bridging!.futureMantraOverride, "מנטרה מותאמת");

  const withoutOverride = arcLink({ id: "bridge-no-override", kind: "bridging", bridging: { supportiveProtocolId: "state-build-1", variant: "full" } });
  assert.equal(withoutOverride.bridging!.futureMantraOverride, undefined);
});

test("multiple Bridging ARC Links (different supportive protocols/variants) coexist in the same list without overwriting one another", () => {
  const bridgingA = arcLink({
    id: "bridge-a",
    kind: "bridging",
    triggerCategory: "reactive",
    bridging: { supportiveProtocolId: "state-build-a", variant: "full" },
  });
  const bridgingB = arcLink({
    id: "bridge-b",
    kind: "bridging",
    triggerCategory: "preventive",
    bridging: { supportiveProtocolId: "state-build-b", variant: "short" },
  });
  let list = upsertArcLinkInList([], bridgingA);
  list = upsertArcLinkInList(list, bridgingB);
  assert.equal(list.length, 2);
  assert.equal(list.find((l) => l.id === "bridge-a")!.bridging!.supportiveProtocolId, "state-build-a");
  assert.equal(list.find((l) => l.id === "bridge-a")!.bridging!.variant, "full");
  assert.equal(list.find((l) => l.id === "bridge-b")!.bridging!.supportiveProtocolId, "state-build-b");
  assert.equal(list.find((l) => l.id === "bridge-b")!.bridging!.variant, "short");

  // Editing one never corrupts the other's bridging config.
  const editedA = upsertArcLinkInList(list, { ...bridgingA, bridging: { supportiveProtocolId: "state-build-a-v2", variant: "short" } });
  assert.equal(editedA.find((l) => l.id === "bridge-a")!.bridging!.supportiveProtocolId, "state-build-a-v2");
  assert.equal(editedA.find((l) => l.id === "bridge-b")!.bridging!.supportiveProtocolId, "state-build-b");

  // Deleting one never touches the other.
  const afterDelete = deleteArcLinkFromList(editedA, "bridge-a");
  assert.equal(afterDelete.length, 1);
  assert.equal(afterDelete[0].id, "bridge-b");
});

test("a JSON round trip (JSON.stringify then JSON.parse, exactly what data/storage.ts does) preserves kind/triggerCategory/bridging/triggerLevels intact", () => {
  const original = arcLink({
    id: "roundtrip-1",
    kind: "bridging",
    triggerCategory: "reactive",
    bridging: { supportiveProtocolId: "state-build-1", variant: "full" },
    triggerLevels: [{ week: 1, level: 2 }],
  });
  const roundTripped = JSON.parse(JSON.stringify(original)) as ArcLink;
  assert.deepEqual(roundTripped, original);
});

test("upsertWeeklyTriggerLevel updates the matching week in place, never touching another week's entry", () => {
  const levels: WeeklyTriggerLevel[] = [{ week: 1, level: 1 }, { week: 2, level: 2 }];
  const updated = upsertWeeklyTriggerLevel(levels, { week: 1, level: 3 });
  assert.equal(updated.find((l) => l.week === 1)!.level, 3);
  assert.equal(updated.find((l) => l.week === 2)!.level, 2);
  assert.equal(updated.length, 2);
  assert.equal(upsertWeeklyTriggerLevel(levels, { week: 5, level: 2 }).length, 3, "appends a new week when it doesn't exist yet");
});

// --- Phase 2 correction: Link target protocols (spec section 3) ---

test("resolveArcLinkTargetType returns 'legacy_generic' for any ArcLink saved before targetType existed, never guessing a specific target", () => {
  assert.equal(resolveArcLinkTargetType(arcLink()), "legacy_generic");
  assert.equal(resolveArcLinkTargetType(arcLink({ targetType: undefined })), "legacy_generic");
  assert.equal(resolveArcLinkTargetType(arcLink({ targetType: null })), "legacy_generic");
});

test("resolveArcLinkTargetType returns the exact stored target for every supported ArcLink target, including direct_action (no protocol)", () => {
  const targets: ArcLinkTargetType[] = ["state", "urge", "thought", "presence", "belief", "direct_action"];
  for (const target of targets) {
    assert.equal(resolveArcLinkTargetType(arcLink({ targetType: target })), target);
  }
});

test("a direct-action Link (targetType direct_action, no protocol) round-trips through JSON exactly like any other Link", () => {
  const direct = arcLink({ targetType: "direct_action", targetRefId: null });
  const roundTripped = JSON.parse(JSON.stringify(direct)) as ArcLink;
  assert.equal(resolveArcLinkTargetType(roundTripped), "direct_action");
});

test("targetRefId is preserved for a Link whose target needs it (urge -> UrgeArc id) and stays optional for every other target", () => {
  const urgeLink = arcLink({ targetType: "urge", targetRefId: "urge-arc-7" });
  assert.equal(urgeLink.targetRefId, "urge-arc-7");
  const stateLink = arcLink({ targetType: "state" });
  assert.equal(resolveArcLinkTargetType(stateLink), "state");
  assert.equal(stateLink.targetRefId, undefined);
});
