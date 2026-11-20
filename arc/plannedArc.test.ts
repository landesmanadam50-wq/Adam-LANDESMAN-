import test from "node:test";
import assert from "node:assert/strict";

import {
  canUseBeforeTaskAlarmTiming,
  createPlannedArcFromSession,
  defaultPlannedArcName,
  deletePlannedArcFromList,
  hasDraftForExercise,
  normalizePlannedArc,
  plannedArcsOfKind,
  resolvePlannedArcPrefillFields,
  upsertPlannedArcInList,
} from "./plannedArc.ts";
import type { PlannedArc } from "./plannedArc.ts";
import { STANDALONE_ARC_TASK_ID, createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";
import { createLearnedBelief } from "./arcInsightBelief.ts";
import type { ArcBelief } from "./arcInsightBelief.ts";

const NOW = "2026-01-05T12:00:00.000Z";

function sessionFixture(overrides: Partial<NewArcLiveSessionState> = {}): NewArcLiveSessionState {
  return {
    ...createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "spontaneous"),
    goalType: "combined",
    triggerText: "מייל כועס מהבוס",
    selectedEmotion: "frustration",
    supportiveBodyArea: "chest",
    supportiveSensation: "רוגע",
    positiveMovement: "יישור הגב",
    emotionalActionText: "נשימה עמוקה",
    ...overrides,
  };
}

test("defaultPlannedArcName prefers the trigger, then the emotion label, then a generic fallback -- never invents anything else", () => {
  assert.equal(defaultPlannedArcName(sessionFixture(), "full"), "ARC ל־מייל כועס מהבוס");
  assert.equal(defaultPlannedArcName(sessionFixture({ triggerText: null }), "full"), "ARC ל־תסכול");
  assert.equal(defaultPlannedArcName(sessionFixture({ triggerText: null, selectedEmotion: null }), "full"), "ARC ל־תרגיל");
  assert.match(defaultPlannedArcName(sessionFixture(), "mini"), /^Mini ARC ל־/);
});

test("createPlannedArcFromSession carries exactly the six practice data points plus the trigger, frozen from the session", () => {
  const draft = createPlannedArcFromSession(sessionFixture(), "full", "p1", NOW);
  assert.equal(draft.triggerText, "מייל כועס מהבוס");
  assert.equal(draft.selectedEmotion, "frustration");
  assert.equal(draft.supportiveSensation, "רוגע");
  assert.equal(draft.positiveMovement, "יישור הגב");
  assert.equal(draft.emotionalActionText, "נשימה עמוקה");
  assert.equal(draft.identityActionText, "לפתוח את המחשב");
  assert.equal(draft.linkedTaskId, "t1");
  assert.equal(draft.sourceSpontaneousExerciseId, NOW);
  assert.equal(draft.track, "combined");
});

// Required test 8: thought + classification saved in the spontaneous exercise's own generated draft.
test("test 8: createPlannedArcFromSession carries the thought text and its time classification straight through, and null when no thought was identified", () => {
  const withThought = createPlannedArcFromSession(sessionFixture({ currentThought: "אני חושש שאכשל", thoughtTimeOrientation: "future" }), "full", "p1", NOW);
  assert.equal(withThought.thoughtText, "אני חושש שאכשל");
  assert.equal(withThought.thoughtTimeOrientation, "future");

  const withoutThought = createPlannedArcFromSession(sessionFixture({ currentThought: null, thoughtTimeOrientation: null }), "full", "p2", NOW);
  assert.equal(withoutThought.thoughtText, null);
  assert.equal(withoutThought.thoughtTimeOrientation, null);
});

// Unified awareness/urge/thought/interpretation update, required test
// 8/12: interpretationText is a SEPARATE field from thoughtText, saved
// and carried through independently, and NEVER invented for an old
// session/draft that only ever had a thought.
test("test 8/12: createPlannedArcFromSession carries interpretationText straight through, separately from thoughtText, and never invents one for a thought-only session (backward compatibility)", () => {
  const withBoth = createPlannedArcFromSession(sessionFixture({ currentThought: "מחשבה", interpretationText: "הוא לא אוהב אותי" }), "full", "p3", NOW);
  assert.equal(withBoth.thoughtText, "מחשבה");
  assert.equal(withBoth.interpretationText, "הוא לא אוהב אותי");

  const thoughtOnly = createPlannedArcFromSession(sessionFixture({ currentThought: "מחשבה ישנה", interpretationText: null }), "full", "p4", NOW);
  assert.equal(thoughtOnly.thoughtText, "מחשבה ישנה");
  assert.equal(thoughtOnly.interpretationText, null, "an old thought-only session must never have an interpretation invented for it");
});

test("a draft from a standalone session never carries a linkedTaskId or identityActionText -- there was no real task", () => {
  const standalone = sessionFixture({ taskId: STANDALONE_ARC_TASK_ID, goalType: "emotion_only" });
  const draft = createPlannedArcFromSession(standalone, "mini", "p2", NOW);
  assert.equal(draft.linkedTaskId, null);
  assert.equal(draft.identityActionText, null);
});

// --- ARC alarm task ---------------------------------------------------

test("createPlannedArcFromSession defaults every new alarm field to off/inert -- never auto-enabling an alarm nobody asked for", () => {
  const draft = createPlannedArcFromSession(sessionFixture(), "full", "p1", NOW);
  assert.equal(draft.arcAlarmEnabled, false);
  assert.equal(draft.arcAlarmTimingKind, "standalone");
  assert.equal(draft.arcAlarmTime, null);
  assert.equal(draft.arcAlarmDate, null);
  assert.deepEqual(draft.arcAlarmRecurrence, { kind: "once" });
  assert.equal(draft.arcAlarmNotificationId, null);
  assert.equal(draft.arcAlarmScheduledFor, null);
});

test("canUseBeforeTaskAlarmTiming is true only when linkedTaskId is set -- a standalone-origin draft can never pick 'before_task' timing", () => {
  assert.equal(canUseBeforeTaskAlarmTiming({ linkedTaskId: "t1" }), true);
  assert.equal(canUseBeforeTaskAlarmTiming({ linkedTaskId: null }), false);
});

test("normalizePlannedArc backfills every alarm field a pre-feature record is missing, without touching any field that's already present", () => {
  const legacy = createPlannedArcFromSession(sessionFixture(), "full", "p1", NOW);
  // @ts-expect-error -- simulating a record saved before these fields existed.
  delete legacy.arcAlarmEnabled;
  // @ts-expect-error -- simulating a record saved before these fields existed.
  delete legacy.arcAlarmTimingKind;
  // @ts-expect-error -- simulating a record saved before these fields existed.
  delete legacy.arcAlarmRecurrence;
  const normalized = normalizePlannedArc(legacy);
  assert.equal(normalized.arcAlarmEnabled, false);
  assert.equal(normalized.arcAlarmTimingKind, "standalone");
  assert.deepEqual(normalized.arcAlarmRecurrence, { kind: "once" });
  assert.equal(normalized.name, legacy.name, "fields already present must be left untouched");

  const alreadyEnabled: PlannedArc = { ...createPlannedArcFromSession(sessionFixture(), "full", "p2", NOW), arcAlarmEnabled: true, arcAlarmTimingKind: "before_task" };
  assert.deepEqual(normalizePlannedArc(alreadyEnabled), alreadyEnabled);
});

test("hasDraftForExercise distinguishes by BOTH source exercise id and kind -- a Full draft existing never masks a missing Mini draft for the same exercise", () => {
  const full: PlannedArc = createPlannedArcFromSession(sessionFixture(), "full", "p1", NOW);
  const list = [full];
  assert.equal(hasDraftForExercise(list, NOW, "full"), true);
  assert.equal(hasDraftForExercise(list, NOW, "mini"), false);
  assert.equal(hasDraftForExercise(list, "some-other-exercise", "full"), false);
});

test("upsertPlannedArcInList replaces only the matching id, never drops a different draft's row (editing never cascades)", () => {
  const a = createPlannedArcFromSession(sessionFixture(), "full", "a", NOW);
  const b = createPlannedArcFromSession(sessionFixture(), "mini", "b", NOW);
  let list = upsertPlannedArcInList([a], b);
  assert.equal(list.length, 2);
  const renamed = { ...a, name: "שם חדש" };
  list = upsertPlannedArcInList(list, renamed);
  assert.equal(list.length, 2);
  assert.equal(list.find((item) => item.id === "a")?.name, "שם חדש");
  assert.equal(list.find((item) => item.id === "b")?.name, b.name);
});

test("deletePlannedArcFromList removes only the matching id", () => {
  const a = createPlannedArcFromSession(sessionFixture(), "full", "a", NOW);
  const b = createPlannedArcFromSession(sessionFixture(), "mini", "b", NOW);
  const list = deletePlannedArcFromList([a, b], "a");
  assert.deepEqual(list.map((item) => item.id), ["b"]);
});

test("editing a draft (changing its name/fields) never touches the originating session -- it is a plain, independent copy", () => {
  const session = sessionFixture();
  const draft = createPlannedArcFromSession(session, "full", "p1", NOW);
  const edited = { ...draft, name: "שם אחר", supportiveSensation: "ביטחון" };
  assert.equal(session.supportiveSensation, "רוגע", "the original session object must be completely untouched");
  assert.equal(edited.supportiveSensation, "ביטחון");
});

// ARC-system upgrade task ("ARC ספונטני ויצירת ARC מתוכנן"), Part 5:
// plannedArcsOfKind / resolvePlannedArcPrefillFields.

test("plannedArcsOfKind filters by kind and sorts most-recently-updated first", () => {
  const fullOld = { ...createPlannedArcFromSession(sessionFixture(), "full", "f1", "2026-01-01T00:00:00.000Z") };
  const fullNew = { ...createPlannedArcFromSession(sessionFixture(), "full", "f2", "2026-01-02T00:00:00.000Z") };
  const mini = createPlannedArcFromSession(sessionFixture(), "mini", "m1", NOW);
  const result = plannedArcsOfKind([fullOld, fullNew, mini], "full");
  assert.deepEqual(result.map((item) => item.id), ["f2", "f1"]);
});

test("resolvePlannedArcPrefillFields carries the continuity trio/trigger/mantra straight through, and resolves the identity belief's TEXT for a non-emotional track", () => {
  const draft = { ...createPlannedArcFromSession(sessionFixture(), "full", "p1", NOW), activeIdentityBeliefId: "b1" };
  const belief = createLearnedBelief("b1", "identity", "אני מסוגל להתמיד", "i1", "ex1", NOW);
  const fields = resolvePlannedArcPrefillFields(draft, new Map<string, ArcBelief>([["b1", belief]]));
  assert.equal(fields.goalType, "combined");
  assert.equal(fields.triggerText, draft.triggerText);
  assert.equal(fields.supportiveBodyArea, draft.supportiveBodyArea);
  assert.equal(fields.mantraText, draft.mantraText);
  assert.equal(fields.beliefText, "אני מסוגל להתמיד");
});

test("resolvePlannedArcPrefillFields uses the EMOTIONAL belief for an emotion_only track, never the identity one", () => {
  const emotionalSession = sessionFixture({ goalType: "emotion_only" });
  const draft = { ...createPlannedArcFromSession(emotionalSession, "full", "p2", NOW), activeEmotionalBeliefId: "eb1", activeIdentityBeliefId: "ib1" };
  const emotionalBelief = createLearnedBelief("eb1", "emotional", "אני יכול להירגע", "i1", "ex1", NOW);
  const identityBelief = createLearnedBelief("ib1", "identity", "אני מתמיד", "i2", "ex1", NOW);
  const fields = resolvePlannedArcPrefillFields(draft, new Map<string, ArcBelief>([["eb1", emotionalBelief], ["ib1", identityBelief]]));
  assert.equal(fields.beliefText, "אני יכול להירגע");
});

test("resolvePlannedArcPrefillFields never invents a belief -- no active belief id means no text, never a guess", () => {
  const draft = createPlannedArcFromSession(sessionFixture(), "full", "p3", NOW);
  const fields = resolvePlannedArcPrefillFields(draft, new Map());
  assert.equal(fields.beliefText, null);
});

// Required test 10 (data layer): the thought text and time classification an edited draft carries flow straight into the planned session's own prefill fields -- the editor screen (build/PlannedArcEditorScreen.tsx) is covered separately in build/plannedArcLibrary.test.ts.
test("test 10: resolvePlannedArcPrefillFields carries an edited draft's own thoughtText/thoughtTimeOrientation straight through, never a stale or invented value", () => {
  const draft = { ...createPlannedArcFromSession(sessionFixture({ currentThought: "מחשבה ישנה", thoughtTimeOrientation: "past" }), "full", "p4", NOW), thoughtText: "מחשבה שנערכה", thoughtTimeOrientation: "present" as const };
  const fields = resolvePlannedArcPrefillFields(draft, new Map());
  assert.equal(fields.thoughtText, "מחשבה שנערכה");
  assert.equal(fields.thoughtTimeOrientation, "present");
});

test("test 10: resolvePlannedArcPrefillFields carries an edited draft's own interpretationText straight through too, independently of thoughtText", () => {
  const draft = { ...createPlannedArcFromSession(sessionFixture(), "full", "p5", NOW), interpretationText: "פרשנות שנערכה" };
  const fields = resolvePlannedArcPrefillFields(draft, new Map());
  assert.equal(fields.interpretationText, "פרשנות שנערכה");
});

// Urge-stop task, tests 4+5: an urge identified during a SPONTANEOUS
// session is saved on it, and carried through to BOTH the Full and the
// Mini drafts that session auto-generates -- the exact same single
// mechanism (createPlannedArcFromSession) every other practice data
// point (trigger, emotion, continuity trio) already goes through.
test("an urge identified during the spontaneous session is carried onto both the Full and Mini drafts generated from it", () => {
  const session = sessionFixture({ urgeText: "דחף לפתוח את הטלפון" });
  const full = createPlannedArcFromSession(session, "full", "p1", NOW);
  const mini = createPlannedArcFromSession(session, "mini", "p2", NOW);
  assert.equal(full.urgeText, "דחף לפתוח את הטלפון");
  assert.equal(mini.urgeText, "דחף לפתוח את הטלפון");
});

test("no urge identified means the generated draft's own urgeText is null, never invented", () => {
  const draft = createPlannedArcFromSession(sessionFixture(), "full", "p1", NOW);
  assert.equal(draft.urgeText, null);
});

test("resolvePlannedArcPrefillFields carries the draft's own saved urgeText straight through, unprompted -- the one field that is still re-asked live (never silently skipped), but still worth prefilling as a starting draft (requirement 6)", () => {
  const draft = { ...createPlannedArcFromSession(sessionFixture({ urgeText: "דחף לדחות משימה" }), "full", "p1", NOW) };
  const fields = resolvePlannedArcPrefillFields(draft, new Map());
  assert.equal(fields.urgeText, "דחף לדחות משימה");
});

// Urge-stop task, test 8: a PlannedArc/session saved before this field
// existed has no "urgeText" key at all once parsed from storage (plain
// JSON.parse, no migration -- data/storage.ts's own established
// convention for this exact type). Every function touching the field
// must treat that missing key exactly like an explicit null, never throw.
test("a pre-existing PlannedArc/session record with no urgeText key at all (simulating data saved before this field existed, via a plain JSON.parse with no migration -- data/storage.ts's own existing convention for every field here) never throws, and is treated as falsy/no-urge by every reader, same as an explicit null", () => {
  const legacySession = sessionFixture() as NewArcLiveSessionState;
  delete (legacySession as Partial<NewArcLiveSessionState>).urgeText;
  assert.doesNotThrow(() => createPlannedArcFromSession(legacySession, "full", "p1", NOW));
  const draft = createPlannedArcFromSession(legacySession, "full", "p1", NOW);
  assert.ok(!draft.urgeText, "a missing key must read as falsy/no-urge, never crash");

  const legacyDraft = createPlannedArcFromSession(sessionFixture(), "full", "p2", NOW) as PlannedArc;
  delete (legacyDraft as Partial<PlannedArc>).urgeText;
  assert.doesNotThrow(() => resolvePlannedArcPrefillFields(legacyDraft, new Map()));
  assert.ok(!resolvePlannedArcPrefillFields(legacyDraft, new Map()).urgeText);
});
