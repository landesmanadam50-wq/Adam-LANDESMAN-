import test from "node:test";
import assert from "node:assert/strict";

import {
  addPracticeRecord,
  clearReturnContext,
  confirmWeekCompleteAndAdvance,
  createPersonalDevelopmentProgram,
  deletePersonalDevelopmentProgramFromList,
  findProgramsForProtocol,
  isPastPlannedEndDate,
  isSpeedFluencyWeek,
  PERSONAL_DEVELOPMENT_WEEK_META,
  PERSONAL_DEVELOPMENT_WEEK_NUMBERS,
  resolveCompatibleMiniArc,
  resolveCurrentWeek,
  resolvePersonalDevelopmentWeekPlan,
  resolveWeek,
  resolveWeekReminderFireAt,
  setLinkedMiniArc,
  setReturnContext,
  upsertPersonalDevelopmentProgramInList,
} from "./personalDevelopmentProgram.ts";
import type { FourWeekProgramWeekNumber, PersonalDevelopmentProtocolKind } from "./types.ts";
import type { MiniArcBuild } from "./miniArc.ts";

function miniArc(overrides: Partial<MiniArcBuild> = {}): MiniArcBuild {
  return {
    id: "mini-1",
    name: "Mini",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    presenceColor: "כחול",
    regulationAnchor: "עוגן",
    encodingAction: "פעולת קידוד",
    beneficialAction: "פעולה מיטיבה",
    ...overrides,
  };
}

// --- creation / week structure ---

test("createPersonalDevelopmentProgram builds 4 contiguous 7-day weeks starting Week 1 active", () => {
  const program = createPersonalDevelopmentProgram("urge", "urge-1", "הדחף שלי", "2026-01-05", null, "2026-01-01T00:00:00.000Z");
  assert.equal(program.currentWeek, 1);
  assert.equal(program.weeks[0].status, "active");
  assert.equal(program.weeks[1].status, "not_started");
  assert.equal(program.weeks[0].plannedStartDate, "2026-01-05");
  assert.equal(program.weeks[0].plannedEndDate, "2026-01-11");
  assert.equal(program.weeks[1].plannedStartDate, "2026-01-12");
  assert.equal(program.weeks[3].plannedEndDate, "2026-02-01");
});

test("createPersonalDevelopmentProgram carries protocolKind/protocolId/name/linkedMiniArcId through unchanged", () => {
  const program = createPersonalDevelopmentProgram("belief", "belief-1", "אמונה", "2026-01-05", "mini-9", "2026-01-01T00:00:00.000Z");
  assert.equal(program.protocolKind, "belief");
  assert.equal(program.protocolId, "belief-1");
  assert.equal(program.name, "אמונה");
  assert.equal(program.linkedMiniArcId, "mini-9");
});

test("PERSONAL_DEVELOPMENT_WEEK_META provides Hebrew title/purpose for all 4 weeks", () => {
  for (const weekNumber of PERSONAL_DEVELOPMENT_WEEK_NUMBERS) {
    const meta = PERSONAL_DEVELOPMENT_WEEK_META[weekNumber];
    assert.ok(meta.title.length > 0);
    assert.ok(meta.purpose.length > 0);
  }
});

// --- resolveCompatibleMiniArc ---

test("resolveCompatibleMiniArc finds the one Mini matching protocolKind+protocolId, never a different protocol's Mini", () => {
  const minis = [
    miniArc({ id: "m-urge", protocolKind: "urge", parentArcBuildId: "urge-1" }),
    miniArc({ id: "m-thought", protocolKind: "thought", parentArcBuildId: "thought-1" }),
  ];
  assert.equal(resolveCompatibleMiniArc("urge", "urge-1", minis)?.id, "m-urge");
  assert.equal(resolveCompatibleMiniArc("thought", "urge-1", minis), null);
});

test("resolveCompatibleMiniArc returns null, never invents one, when no compatible Mini exists", () => {
  assert.equal(resolveCompatibleMiniArc("state", "state-1", []), null);
});

test("setLinkedMiniArc updates only linkedMiniArcId, nothing else", () => {
  const program = createPersonalDevelopmentProgram("state", "state-1", "מצב", "2026-01-05", null, "2026-01-01T00:00:00.000Z");
  const updated = setLinkedMiniArc(program, "mini-5");
  assert.equal(updated.linkedMiniArcId, "mini-5");
  assert.equal(updated.currentWeek, program.currentWeek);
});

// --- practice records / return context ---

test("addPracticeRecord appends to the correct week only, never touching another week's records", () => {
  const program = createPersonalDevelopmentProgram("presence", "presence-1", "נוכחות", "2026-01-05", null, "2026-01-01T00:00:00.000Z");
  const updated = addPracticeRecord(program, 1, "full", "ARC מלא", "2026-01-06T00:00:00.000Z");
  assert.equal(resolveWeek(updated, 1).practiceRecords.length, 1);
  assert.equal(resolveWeek(updated, 2).practiceRecords.length, 0);
  assert.equal(resolveWeek(updated, 1).practiceRecords[0].kind, "full");
});

test("setReturnContext/clearReturnContext round-trip safely", () => {
  const program = createPersonalDevelopmentProgram("urge", "urge-1", "דחף", "2026-01-05", null, "2026-01-01T00:00:00.000Z");
  const withContext = setReturnContext(program, 2, "ARC Mini", "2026-01-10T00:00:00.000Z");
  assert.deepEqual(withContext.returnContext, { week: 2, actionLabel: "ARC Mini", savedAt: "2026-01-10T00:00:00.000Z" });
  assert.equal(clearReturnContext(withContext).returnContext, null);
});

// --- week completion / progression ---

test("confirmWeekCompleteAndAdvance moves Week 1 -> Week 2, activating it, without touching Week 3/4", () => {
  const program = createPersonalDevelopmentProgram("urge", "urge-1", "דחף", "2026-01-05", null, "2026-01-01T00:00:00.000Z");
  const advanced = confirmWeekCompleteAndAdvance(program, "2026-01-12T00:00:00.000Z");
  assert.equal(advanced.currentWeek, 2);
  assert.equal(resolveWeek(advanced, 1).status, "completed");
  assert.equal(resolveWeek(advanced, 2).status, "active");
  assert.equal(resolveWeek(advanced, 3).status, "not_started");
  assert.equal(resolveWeek(advanced, 4).status, "not_started");
});

test("confirmWeekCompleteAndAdvance from Week 4 marks the whole program completed, without a 'Week 5'", () => {
  let program = createPersonalDevelopmentProgram("urge", "urge-1", "דחף", "2026-01-05", null, "2026-01-01T00:00:00.000Z");
  for (let i = 0; i < 3; i++) program = confirmWeekCompleteAndAdvance(program, "2026-01-12T00:00:00.000Z");
  assert.equal(program.currentWeek, 4);
  const finished = confirmWeekCompleteAndAdvance(program, "2026-02-01T00:00:00.000Z");
  assert.equal(finished.currentWeek, 4);
  assert.equal(finished.completedAt, "2026-02-01T00:00:00.000Z");
  assert.equal(resolveWeek(finished, 4).status, "completed");
});

test("reaching the planned end date never by itself advances the program -- isPastPlannedEndDate is informational only", () => {
  const program = createPersonalDevelopmentProgram("urge", "urge-1", "דחף", "2026-01-05", null, "2026-01-01T00:00:00.000Z");
  assert.equal(isPastPlannedEndDate(resolveCurrentWeek(program), "2026-01-11"), true);
  // The program's own currentWeek/status is untouched by merely observing this.
  assert.equal(program.currentWeek, 1);
  assert.equal(resolveWeek(program, 1).status, "active");
});

test("isPastPlannedEndDate is false for an invalid/missing date, never throws", () => {
  const program = createPersonalDevelopmentProgram("urge", "urge-1", "דחף", "2026-01-05", null, "2026-01-01T00:00:00.000Z");
  const week = { ...resolveCurrentWeek(program), plannedEndDate: null };
  assert.doesNotThrow(() => isPastPlannedEndDate(week, "2026-01-11"));
  assert.equal(isPastPlannedEndDate(week, "2026-01-11"), false);
});

// --- reminders ---

test("resolveWeekReminderFireAt returns null when remindersEnabled is false", () => {
  const program = createPersonalDevelopmentProgram("urge", "urge-1", "דחף", "2026-01-05", null, "2026-01-01T00:00:00.000Z");
  assert.equal(resolveWeekReminderFireAt(resolveCurrentWeek(program), new Date("2026-01-01T00:00:00.000Z")), null);
});

test("resolveWeekReminderFireAt fires at 9:00 local on the week's own planned start date when enabled and still in the future", () => {
  const program = createPersonalDevelopmentProgram("urge", "urge-1", "דחף", "2026-01-05", null, "2026-01-01T00:00:00.000Z");
  const week = { ...resolveCurrentWeek(program), remindersEnabled: true };
  const fireAt = resolveWeekReminderFireAt(week, new Date("2026-01-01T00:00:00.000Z"));
  assert.notEqual(fireAt, null);
  assert.equal(fireAt?.getHours(), 9);
});

test("resolveWeekReminderFireAt returns null once that 9:00 moment is already in the past -- never schedules a past reminder", () => {
  const program = createPersonalDevelopmentProgram("urge", "urge-1", "דחף", "2026-01-05", null, "2026-01-01T00:00:00.000Z");
  const week = { ...resolveCurrentWeek(program), remindersEnabled: true };
  assert.equal(resolveWeekReminderFireAt(week, new Date("2026-01-06T00:00:00.000Z")), null);
});

// ---------------------------------------------------------------------------
// Required test 1-9: Personal Development weekly plan
// ---------------------------------------------------------------------------

test("Required test 1: Personal Development Week 1 includes Full ARC", () => {
  const plan = resolvePersonalDevelopmentWeekPlan(1, "state", false);
  assert.ok(plan.recommended.includes("full"));
});

test("Required test 2: Personal Development Week 1 makes ARC Mini immediately available (when a compatible Mini exists)", () => {
  const plan = resolvePersonalDevelopmentWeekPlan(1, "state", true);
  assert.ok(plan.recommended.includes("mini"));
});

test("Required test 3: Personal Development Week 1 includes Full and Mini Link practice", () => {
  const withMini = resolvePersonalDevelopmentWeekPlan(1, "state", true);
  assert.ok(withMini.recommended.includes("archi_link"));
  assert.ok(withMini.recommended.includes("mini_link"));
});

test("Required test 4: Personal Development Week 2 recommends ARC Mini", () => {
  const plan = resolvePersonalDevelopmentWeekPlan(2, "state", true);
  assert.ok(plan.recommended.includes("mini"));
});

test("Required test 5: Personal Development Week 2 removes Full ARC from primary recommendations", () => {
  const plan = resolvePersonalDevelopmentWeekPlan(2, "state", true);
  assert.ok(!plan.recommended.includes("full"));
});

test("Required test 6: Personal Development Week 2 keeps Full ARC manually available", () => {
  const plan = resolvePersonalDevelopmentWeekPlan(2, "state", true);
  assert.ok(plan.manuallyAvailable.includes("full"));
});

test("Required test 7: Personal Development Week 3 emphasizes Mini and Link fluency", () => {
  const plan = resolvePersonalDevelopmentWeekPlan(3, "state", true);
  assert.ok(plan.recommended.includes("mini"));
  assert.ok(plan.recommended.includes("mini_link"));
  assert.equal(isSpeedFluencyWeek(3), true);
});

test("Required test 8: Personal Development Week 4 emphasizes independent action", () => {
  const plan = resolvePersonalDevelopmentWeekPlan(4, "state", true);
  assert.ok(plan.recommended.includes("action_independent"));
});

test("Required test 9: ARC Mini remains optional support in Week 4 (recommended, never required/exclusive)", () => {
  const plan = resolvePersonalDevelopmentWeekPlan(4, "state", true);
  assert.ok(plan.recommended.includes("mini"));
  assert.ok(plan.recommended.includes("action_independent"));
});

test("Week 2/3/4 never delete/disable Full ARC -- it always appears somewhere (recommended or manually available), for every Mini-configured state", () => {
  for (const weekNumber of [2, 3, 4] as FourWeekProgramWeekNumber[]) {
    for (const hasMini of [true, false]) {
      const plan = resolvePersonalDevelopmentWeekPlan(weekNumber, "state", hasMini);
      const everywhere = [...plan.recommended, ...plan.manuallyAvailable];
      assert.ok(everywhere.includes("full"), `week ${weekNumber}, hasMini=${hasMini} must still list "full" somewhere`);
    }
  }
});

test("Required test 31 (no Mini content invented): with no compatible Mini, no week ever recommends or lists mini/mini_link -- only full/archi_link/action_independent", () => {
  for (const weekNumber of PERSONAL_DEVELOPMENT_WEEK_NUMBERS) {
    const plan = resolvePersonalDevelopmentWeekPlan(weekNumber, "state", false);
    const everywhere = [...plan.recommended, ...plan.manuallyAvailable];
    assert.ok(!everywhere.includes("mini"));
    assert.ok(!everywhere.includes("mini_link"));
  }
});

test("archi_link is only ever listed for protocolKind 'state' -- live/ArcLinkScreen.tsx (the only existing full guided Link rehearsal) only loads ArcBuild records, with no equivalent for Urge/Thought/Presence/Belief", () => {
  const nonStateKinds: PersonalDevelopmentProtocolKind[] = ["urge", "thought", "presence", "belief"];
  for (const kind of nonStateKinds) {
    for (const weekNumber of PERSONAL_DEVELOPMENT_WEEK_NUMBERS) {
      for (const hasMini of [true, false]) {
        const plan = resolvePersonalDevelopmentWeekPlan(weekNumber, kind, hasMini);
        const everywhere = [...plan.recommended, ...plan.manuallyAvailable];
        assert.ok(!everywhere.includes("archi_link"), `week ${weekNumber}, kind ${kind} must never list archi_link`);
      }
    }
  }
  for (const weekNumber of PERSONAL_DEVELOPMENT_WEEK_NUMBERS) {
    // "state" keeps archi_link available every week (recommended in Week 1, manually available Weeks 2-4).
    const plan = resolvePersonalDevelopmentWeekPlan(weekNumber, "state", true);
    const everywhere = [...plan.recommended, ...plan.manuallyAvailable];
    assert.ok(everywhere.includes("archi_link"), `week ${weekNumber} for state should list archi_link`);
  }
});

test("isSpeedFluencyWeek is true only from Week 3 onward -- Weeks 1-2 stay 'guided'", () => {
  assert.equal(isSpeedFluencyWeek(1), false);
  assert.equal(isSpeedFluencyWeek(2), false);
  assert.equal(isSpeedFluencyWeek(3), true);
  assert.equal(isSpeedFluencyWeek(4), true);
});

// ---------------------------------------------------------------------------
// Required tests 10-14: works for every protocol kind. The plan resolver
// produces the same correct full/mini/mini_link shape for every kind --
// archi_link is the one deliberate exception (state-only, see
// resolvePersonalDevelopmentWeekPlan's own doc comment), confirmed by its
// own dedicated test above.
// ---------------------------------------------------------------------------

test("Required tests 10-14: the weekly plan resolver produces the identical correct shape for every protocol kind (State/Urge/Thought/Presence/Belief)", () => {
  const kinds: PersonalDevelopmentProtocolKind[] = ["state", "urge", "thought", "presence", "belief"];
  for (const kind of kinds) {
    const program = createPersonalDevelopmentProgram(kind, `${kind}-1`, kind, "2026-01-05", "mini-1", "2026-01-01T00:00:00.000Z");
    assert.equal(program.protocolKind, kind);
    const plan1 = resolvePersonalDevelopmentWeekPlan(1, kind, true);
    assert.deepEqual(plan1.recommended.filter((task) => task !== "archi_link"), ["full", "mini", "mini_link"]);
  }
});

// ---------------------------------------------------------------------------
// List CRUD + no-duplicate-program creation (spec section 2: "Do not
// create duplicate protocol or Link records merely to display them in
// the weekly program" -- applied here to the PROGRAM itself, never two
// programs silently tracking the same saved record).
// ---------------------------------------------------------------------------

test("upsertPersonalDevelopmentProgramInList adds a new program and updates an existing one by id, never duplicating", () => {
  const p1 = createPersonalDevelopmentProgram("urge", "urge-1", "Urge Program", "2026-01-05", null, "2026-01-01T00:00:00.000Z");
  let list = upsertPersonalDevelopmentProgramInList([], p1);
  assert.equal(list.length, 1);
  const renamed = { ...p1, name: "Renamed" };
  list = upsertPersonalDevelopmentProgramInList(list, renamed);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "Renamed");
});

test("deletePersonalDevelopmentProgramFromList removes only the matching id", () => {
  const p1 = createPersonalDevelopmentProgram("urge", "urge-1", "A", "2026-01-05", null, "2026-01-01T00:00:00.000Z");
  const p2 = createPersonalDevelopmentProgram("thought", "thought-1", "B", "2026-01-05", null, "2026-01-01T00:00:00.000Z");
  const list = deletePersonalDevelopmentProgramFromList([p1, p2], p1.id);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, p2.id);
});

test("findProgramsForProtocol locates the one existing program tracking a given protocolKind+protocolId -- a driving screen uses this to avoid creating a duplicate program for the same saved record", () => {
  const p1 = createPersonalDevelopmentProgram("urge", "urge-1", "A", "2026-01-05", null, "2026-01-01T00:00:00.000Z");
  const p2 = createPersonalDevelopmentProgram("thought", "urge-1", "B", "2026-01-05", null, "2026-01-01T00:00:00.000Z");
  const list = [p1, p2];
  assert.deepEqual(findProgramsForProtocol(list, "urge", "urge-1").map((p) => p.id), [p1.id]);
  assert.deepEqual(findProgramsForProtocol(list, "state", "no-such-id"), []);
});

// ---------------------------------------------------------------------------
// Week progression edge case: Week 4 completion marks the whole program
// complete (never advances past Week 4, never re-activates Week 1).
// ---------------------------------------------------------------------------

test("confirming Week 4 marks the whole program completedAt, and currentWeek stays 4 (never wraps)", () => {
  let program = createPersonalDevelopmentProgram("belief", "belief-1", "Belief Program", "2026-01-05", null, "2026-01-01T00:00:00.000Z");
  for (let i = 0; i < 3; i++) {
    program = confirmWeekCompleteAndAdvance(program, "2026-01-10T00:00:00.000Z");
  }
  assert.equal(program.currentWeek, 4);
  assert.equal(program.completedAt, null);
  const now = "2026-02-01T00:00:00.000Z";
  const completed = confirmWeekCompleteAndAdvance(program, now);
  assert.equal(completed.currentWeek, 4);
  assert.equal(completed.completedAt, now);
  assert.equal(resolveWeek(completed, 4).status, "completed");
});

// ---------------------------------------------------------------------------
// Section 10 regression confirmation (reused from the existing suite, not
// re-implemented here): arc/miniArcLink.test.ts and arc/arcLink.test.ts
// already cover the State/Mini-State Link preventive-action-optional
// behavior this program's own "mini_link"/"archi_link" tasks route into --
// this module intentionally builds no second copy of that logic, so no
// second copy of those tests belongs here either.
// ---------------------------------------------------------------------------
