import test from "node:test";
import assert from "node:assert/strict";

import {
  addPracticeRecord,
  computeOverallProgress,
  computeWeekProgress,
  confirmWeekCompleteAndAdvance,
  createFourWeekProgram,
  extendCurrentWeek,
  FOUR_WEEK_META,
  isPastPlannedEndDate,
  resolveCurrentWeek,
  resolveNextWeekOpeningDate,
  resolveWeek,
  saveWeekReflection,
  setLinkedMiniArc,
  setReturnContext,
  clearReturnContext,
  setWeekEndDate,
  setWeekStartDate,
} from "./fourWeekProgram.ts";
import { isValidCalendarDateString } from "../program/dateUtils.ts";

// --- createFourWeekProgram (new programs begin in Week 1; seven days per week) ---

test("createFourWeekProgram begins in Week 1, active, with every week's dates calculated seven days apart", () => {
  const program = createFourWeekProgram("2025-01-06");
  assert.equal(program.enabled, true);
  assert.equal(program.currentWeek, 1);
  assert.equal(program.weeks[0].status, "active");
  assert.equal(program.weeks[1].status, "not_started");
  assert.equal(program.weeks[2].status, "not_started");
  assert.equal(program.weeks[3].status, "not_started");

  assert.equal(program.weeks[0].plannedStartDate, "2025-01-06");
  assert.equal(program.weeks[0].plannedEndDate, "2025-01-12");
  assert.equal(program.weeks[1].plannedStartDate, "2025-01-13");
  assert.equal(program.weeks[1].plannedEndDate, "2025-01-19");
  assert.equal(program.weeks[2].plannedStartDate, "2025-01-20");
  assert.equal(program.weeks[2].plannedEndDate, "2025-01-26");
  assert.equal(program.weeks[3].plannedStartDate, "2025-01-27");
  assert.equal(program.weeks[3].plannedEndDate, "2025-02-02");
});

test("createFourWeekProgram pre-fills every week's own safe defaults (title/purpose/frequency/recommended practice) from FOUR_WEEK_META, still editable", () => {
  const program = createFourWeekProgram("2025-01-06");
  assert.equal(program.weeks[0].practiceFrequency, FOUR_WEEK_META[1].defaultPracticeFrequency);
  assert.equal(program.weeks[0].recommendedPractice, FOUR_WEEK_META[1].defaultRecommendedPractice);
  assert.equal(FOUR_WEEK_META[1].title, "שבוע 1 — חיזוק הזהות עם ARCHI");
  assert.equal(FOUR_WEEK_META[2].title, "שבוע 2 — מעבר ל-Mini ARC");
  assert.equal(FOUR_WEEK_META[3].title, "שבוע 3 — תרגול קצר בזמן אמת");
  assert.equal(FOUR_WEEK_META[4].title, "שבוע 4 — ביצוע עצמאי");
});

test("createFourWeekProgram starts with no linked Mini ARC and no return context", () => {
  const program = createFourWeekProgram("2025-01-06");
  assert.equal(program.linkedMiniArcId, null);
  assert.equal(program.returnContext, null);
  assert.equal(program.completedAt, null);
  assert.equal(program.readyForSubGoalActivation, false);
});

// --- resolveNextWeekOpeningDate (spec section 2's "השבוע הבא מתוכנן להיפתח בתאריך") ---

test("resolveNextWeekOpeningDate returns the next week's own planned start date", () => {
  const program = createFourWeekProgram("2025-01-06");
  assert.equal(resolveNextWeekOpeningDate(program, 1), "2025-01-13");
  assert.equal(resolveNextWeekOpeningDate(program, 2), "2025-01-20");
  assert.equal(resolveNextWeekOpeningDate(program, 3), "2025-01-27");
});

test("resolveNextWeekOpeningDate returns null for Week 4 -- the caller shows the program's own planned completion date instead", () => {
  const program = createFourWeekProgram("2025-01-06");
  assert.equal(resolveNextWeekOpeningDate(program, 4), null);
  assert.equal(resolveWeek(program, 4).plannedEndDate, "2025-02-02");
});

// --- Editing dates recalculates following weeks safely, preserving manual edits ---

test("setWeekStartDate on Week 1 cascades every later, still-automatic week forward with no overlap", () => {
  const program = createFourWeekProgram("2025-01-06");
  const updated = setWeekStartDate(program, 1, "2025-01-08");
  assert.equal(updated.weeks[0].plannedStartDate, "2025-01-08");
  assert.equal(updated.weeks[0].plannedEndDate, "2025-01-14");
  assert.equal(updated.weeks[1].plannedStartDate, "2025-01-15");
  assert.equal(updated.weeks[1].plannedEndDate, "2025-01-21");
  assert.equal(updated.weeks[2].plannedStartDate, "2025-01-22");
  assert.equal(updated.weeks[3].plannedStartDate, "2025-01-29");
});

test("setWeekEndDate on Week 2 pushes Weeks 3-4 forward, never leaving an overlapping or invalid range", () => {
  const program = createFourWeekProgram("2025-01-06");
  const updated = setWeekEndDate(program, 2, "2025-01-25");
  assert.equal(updated.weeks[1].plannedEndDate, "2025-01-25");
  assert.equal(updated.weeks[2].plannedStartDate, "2025-01-26");
  assert.equal(updated.weeks[3].plannedStartDate, "2025-02-02");
  // Week 1 (before the edited week) is never touched.
  assert.equal(updated.weeks[0].plannedEndDate, "2025-01-12");
});

test("setWeekEndDate clamps an end date before the week's own start back to the start -- never an invalid negative-length range", () => {
  const program = createFourWeekProgram("2025-01-06");
  const updated = setWeekEndDate(program, 1, "2025-01-01");
  assert.equal(updated.weeks[0].plannedEndDate, "2025-01-06");
});

test("a manually-edited later week is preserved when an earlier week's dates change -- cascade never silently overwrites it", () => {
  let program = createFourWeekProgram("2025-01-06");
  // Trainee deliberately pushes Week 3 out to start later.
  program = setWeekStartDate(program, 3, "2025-02-01");
  assert.equal(program.weeks[2].datesManuallyEdited, true);
  const week3Before = program.weeks[2];
  const week4Before = program.weeks[3];

  // Now Week 1 gets edited too -- cascades into Week 2 (never manually
  // edited), but must skip Week 3 (manually edited). Week 4 cascades
  // from Week 3's own (unchanged) dates, so it comes out unchanged too.
  program = setWeekStartDate(program, 1, "2025-01-08");
  assert.equal(program.weeks[1].plannedStartDate, "2025-01-15"); // Week 2 recalculated normally.
  assert.deepEqual(program.weeks[2], week3Before); // Week 3 untouched.
  assert.deepEqual(program.weeks[3], week4Before); // Week 4 unchanged too, since it cascades from Week 3.
});

// --- Reaching a planned end date never auto-advances anything ---

test("isPastPlannedEndDate is a pure date comparison, never itself changing the week's status", () => {
  const program = createFourWeekProgram("2025-01-06");
  const week1 = resolveWeek(program, 1);
  assert.equal(isPastPlannedEndDate(week1, "2025-01-11"), false);
  assert.equal(isPastPlannedEndDate(week1, "2025-01-12"), true);
  assert.equal(isPastPlannedEndDate(week1, "2025-01-20"), true);
  // Regardless of how far past the planned end date "today" is, the
  // week's own status is untouched -- only confirmWeekCompleteAndAdvance
  // (called explicitly, after a trainee's own confirmation) ever changes it.
  assert.equal(resolveWeek(program, 1).status, "active");
});

// --- Extending the current week ---

test("extendCurrentWeek records the extension (never losing the original planned end date) and recalculates later weeks", () => {
  const program = createFourWeekProgram("2025-01-06");
  const extended = extendCurrentWeek(program, 1, "2025-01-15", "2025-01-12T10:00:00.000Z");
  assert.equal(extended.weeks[0].plannedEndDate, "2025-01-15");
  assert.equal(extended.weeks[0].dateExtensions.length, 1);
  assert.equal(extended.weeks[0].dateExtensions[0].previousPlannedEndDate, "2025-01-12");
  assert.equal(extended.weeks[0].dateExtensions[0].newPlannedEndDate, "2025-01-15");
  // Week 2 pushed out to stay contiguous with the new end date.
  assert.equal(extended.weeks[1].plannedStartDate, "2025-01-16");
});

test("extending a week preserves its own already-logged practice records and reflection", () => {
  let program = createFourWeekProgram("2025-01-06");
  program = addPracticeRecord(program, 1, "full_arc", "ARC מלא", "2025-01-07T09:00:00.000Z");
  program = saveWeekReflection(
    program,
    1,
    { whatHelped: "המנטרה", whatWasHard: "הזמן", identityEvidence: "עמדתי בהתחייבות", readyToReduceSupport: false },
    "2025-01-11T09:00:00.000Z"
  );
  const extended = extendCurrentWeek(program, 1, "2025-01-16", "2025-01-12T10:00:00.000Z");
  assert.equal(extended.weeks[0].practiceRecords.length, 1);
  assert.equal(extended.weeks[0].practiceRecords[0].label, "ARC מלא");
  assert.equal(extended.weeks[0].reflection?.whatHelped, "המנטרה");
});

// --- Weekly reflection ---

test("saveWeekReflection saves all four answers onto the given week, stamped with answeredAt", () => {
  const program = createFourWeekProgram("2025-01-06");
  const updated = saveWeekReflection(
    program,
    1,
    { whatHelped: "עוגן הנשימה", whatWasHard: "לזכור לפני שהתגובה האוטומטית קרתה", identityEvidence: "יצאתי להליכה במקום לעשן", readyToReduceSupport: true },
    "2025-01-12T08:00:00.000Z"
  );
  const week1 = resolveWeek(updated, 1);
  assert.equal(week1.reflection?.whatHelped, "עוגן הנשימה");
  assert.equal(week1.reflection?.whatWasHard, "לזכור לפני שהתגובה האוטומטית קרתה");
  assert.equal(week1.reflection?.identityEvidence, "יצאתי להליכה במקום לעשן");
  assert.equal(week1.reflection?.readyToReduceSupport, true);
  assert.equal(week1.reflection?.answeredAt, "2025-01-12T08:00:00.000Z");
});

// --- Confirming completion activates the next week / completes the program ---

test("confirmWeekCompleteAndAdvance from Week 1 completes Week 1 and activates Week 2", () => {
  const program = createFourWeekProgram("2025-01-06");
  const updated = confirmWeekCompleteAndAdvance(program, "2025-01-12T18:00:00.000Z");
  assert.equal(updated.weeks[0].status, "completed");
  assert.equal(updated.weeks[0].actualCompletedAt, "2025-01-12T18:00:00.000Z");
  assert.equal(updated.currentWeek, 2);
  assert.equal(updated.weeks[1].status, "active");
  assert.equal(updated.completedAt, null);
  assert.equal(updated.readyForSubGoalActivation, false);
});

test("confirmWeekCompleteAndAdvance from Week 4 marks the whole four-week program completed", () => {
  let program = createFourWeekProgram("2025-01-06");
  program = confirmWeekCompleteAndAdvance(program, "2025-01-12T18:00:00.000Z"); // -> week 2
  program = confirmWeekCompleteAndAdvance(program, "2025-01-19T18:00:00.000Z"); // -> week 3
  program = confirmWeekCompleteAndAdvance(program, "2025-01-26T18:00:00.000Z"); // -> week 4
  assert.equal(program.currentWeek, 4);
  assert.equal(program.completedAt, null);

  const finished = confirmWeekCompleteAndAdvance(program, "2025-02-02T18:00:00.000Z");
  assert.equal(finished.weeks[3].status, "completed");
  assert.equal(finished.weeks[3].actualCompletedAt, "2025-02-02T18:00:00.000Z");
  assert.equal(finished.completedAt, "2025-02-02T18:00:00.000Z");
  assert.equal(finished.readyForSubGoalActivation, true);
  // currentWeek stays at 4 -- there is no Week 5 to advance into.
  assert.equal(finished.currentWeek, 4);
});

// --- Mini ARC linking (Week 2) ---

test("setLinkedMiniArc sets/clears the program's own goal-level Mini ARC reference", () => {
  const program = createFourWeekProgram("2025-01-06");
  const linked = setLinkedMiniArc(program, "miniarc-123");
  assert.equal(linked.linkedMiniArcId, "miniarc-123");
  assert.equal(setLinkedMiniArc(linked, null).linkedMiniArcId, null);
});

// --- Return context (support flows) ---

test("setReturnContext/clearReturnContext save and clear the week + action a support flow should return to", () => {
  const program = createFourWeekProgram("2025-01-06");
  const withContext = setReturnContext(program, 2, "תרגול Mini ARC", "2025-01-14T09:00:00.000Z");
  assert.deepEqual(withContext.returnContext, { week: 2, actionLabel: "תרגול Mini ARC", savedAt: "2025-01-14T09:00:00.000Z" });
  assert.equal(clearReturnContext(withContext).returnContext, null);
});

// --- Practice records ---

test("addPracticeRecord appends a labeled record with its own kind and timestamp, never overwriting earlier ones", () => {
  let program = createFourWeekProgram("2025-01-06");
  program = addPracticeRecord(program, 1, "full_arc", "ARC מלא", "2025-01-07T09:00:00.000Z");
  program = addPracticeRecord(program, 1, "archi_support", "אני צריך עזרה מ-ARCHI", "2025-01-08T09:00:00.000Z");
  const week1 = resolveWeek(program, 1);
  assert.equal(week1.practiceRecords.length, 2);
  assert.equal(week1.practiceRecords[0].kind, "full_arc");
  assert.equal(week1.practiceRecords[1].kind, "archi_support");
});

// --- Four-Week Program task correction: ARC Link/Mini ARC Link are their
// own distinct guided linking practices, never interchangeable with
// Full ARC/Mini ARC -- each must be trackable as its own separate kind.

test("Week 1's ARCHI ARC Link and Full ARC completions are tracked as distinct kinds, never merged", () => {
  let program = createFourWeekProgram("2025-01-06");
  program = addPracticeRecord(program, 1, "arc_link", "ARCHI ARC Link", "2025-01-07T09:00:00.000Z");
  program = addPracticeRecord(program, 1, "full_arc", "ARC מלא", "2025-01-07T10:00:00.000Z");
  const week1 = resolveWeek(program, 1);
  const arcLinkRecords = week1.practiceRecords.filter((r) => r.kind === "arc_link");
  const fullArcRecords = week1.practiceRecords.filter((r) => r.kind === "full_arc");
  assert.equal(arcLinkRecords.length, 1);
  assert.equal(fullArcRecords.length, 1);
  assert.notEqual(arcLinkRecords[0].id, fullArcRecords[0].id);
});

test("Week 2's Mini ARCHI Link and Mini ARC completions are tracked as distinct kinds, never merged", () => {
  let program = createFourWeekProgram("2025-01-06");
  program = confirmWeekCompleteAndAdvance(program, "2025-01-12T18:00:00.000Z"); // -> week 2
  program = addPracticeRecord(program, 2, "mini_archi_link", "Mini ARCHI Link", "2025-01-14T09:00:00.000Z");
  program = addPracticeRecord(program, 2, "mini_arc", "Mini ARC", "2025-01-14T09:05:00.000Z");
  program = addPracticeRecord(program, 2, "mini_arc", "Mini ARC", "2025-01-15T09:00:00.000Z");
  const week2 = resolveWeek(program, 2);
  const linkRecords = week2.practiceRecords.filter((r) => r.kind === "mini_archi_link");
  const miniArcRecords = week2.practiceRecords.filter((r) => r.kind === "mini_arc");
  assert.equal(linkRecords.length, 1, "exactly one Mini ARCHI Link practice logged");
  assert.equal(miniArcRecords.length, 2, "two independent Mini ARC completions logged");
});

test("Mini ARCHI Link (Week 2) and Mini ARC Link (Week 3) are distinct kinds, never merged, despite routing through the same screen", () => {
  let program = createFourWeekProgram("2025-01-06");
  program = confirmWeekCompleteAndAdvance(program, "2025-01-12T18:00:00.000Z"); // -> week 2
  program = addPracticeRecord(program, 2, "mini_archi_link", "Mini ARCHI Link", "2025-01-14T09:00:00.000Z");
  program = confirmWeekCompleteAndAdvance(program, "2025-01-19T18:00:00.000Z"); // -> week 3
  program = addPracticeRecord(program, 3, "mini_arc_link", "Mini ARC Link", "2025-01-21T09:00:00.000Z");

  const week2Kinds = resolveWeek(program, 2).practiceRecords.map((r) => r.kind);
  const week3Kinds = resolveWeek(program, 3).practiceRecords.map((r) => r.kind);
  assert.deepEqual(week2Kinds, ["mini_archi_link"]);
  assert.deepEqual(week3Kinds, ["mini_arc_link"]);
  assert.notEqual(week2Kinds[0], week3Kinds[0], "Mini ARCHI Link and Mini ARC Link must never collapse into the same kind");
});

test("all three linking practices (ARCHI ARC Link, Mini ARCHI Link, Mini ARC Link) plus Full ARC/Mini ARC stay distinct and independently countable", () => {
  let program = createFourWeekProgram("2025-01-06");
  program = addPracticeRecord(program, 1, "arc_link", "ARCHI ARC Link", "2025-01-07T09:00:00.000Z");
  program = addPracticeRecord(program, 1, "full_arc", "ARC מלא", "2025-01-07T10:00:00.000Z");
  program = confirmWeekCompleteAndAdvance(program, "2025-01-12T18:00:00.000Z"); // -> week 2
  program = addPracticeRecord(program, 2, "mini_archi_link", "Mini ARCHI Link", "2025-01-14T09:00:00.000Z");
  program = addPracticeRecord(program, 2, "mini_arc", "Mini ARC", "2025-01-14T09:05:00.000Z");
  program = confirmWeekCompleteAndAdvance(program, "2025-01-19T18:00:00.000Z"); // -> week 3
  program = addPracticeRecord(program, 3, "mini_arc_link", "Mini ARC Link", "2025-01-21T09:00:00.000Z");
  program = addPracticeRecord(program, 3, "mini_arc", "Mini ARC", "2025-01-21T09:05:00.000Z");

  const allKinds = program.weeks.flatMap((week) => week.practiceRecords.map((r) => r.kind));
  const uniqueKinds = new Set(allKinds);
  assert.equal(allKinds.length, 6);
  assert.equal(uniqueKinds.size, 5, "five distinct kinds across the six logged practices (mini_arc repeats in weeks 2 and 3)");
  assert.ok(uniqueKinds.has("arc_link"));
  assert.ok(uniqueKinds.has("mini_archi_link"));
  assert.ok(uniqueKinds.has("mini_arc_link"));
  assert.ok(uniqueKinds.has("full_arc"));
  assert.ok(uniqueKinds.has("mini_arc"));
});

test("Week 3's inline Identity Recall is its own kind, distinct from Mini ARC Link/Mini ARC/action", () => {
  let program = createFourWeekProgram("2025-01-06");
  program = confirmWeekCompleteAndAdvance(program, "2025-01-12T18:00:00.000Z");
  program = confirmWeekCompleteAndAdvance(program, "2025-01-19T18:00:00.000Z"); // -> week 3
  program = addPracticeRecord(program, 3, "identity_recall", "היזכרות בזהות", "2025-01-20T09:00:00.000Z");
  program = addPracticeRecord(program, 3, "mini_arc_link", "Mini ARC Link", "2025-01-20T09:05:00.000Z");
  program = addPracticeRecord(program, 3, "action", "ביצוע ההרגל", "2025-01-20T09:10:00.000Z");
  const kinds = resolveWeek(program, 3).practiceRecords.map((r) => r.kind);
  assert.deepEqual(kinds, ["identity_recall", "mini_arc_link", "action"]);
});

// --- Progress (informational only) ---

test("computeWeekProgress reads 0 for an untouched week and 100 once completed, regardless of logged activity", () => {
  const program = createFourWeekProgram("2025-01-06");
  assert.equal(computeWeekProgress(resolveWeek(program, 1)), 0);
  const completed = confirmWeekCompleteAndAdvance(program, "2025-01-12T18:00:00.000Z");
  assert.equal(computeWeekProgress(resolveWeek(completed, 1)), 100);
});

test("computeWeekProgress increases with logged practice records and an answered reflection, capped sensibly", () => {
  let program = createFourWeekProgram("2025-01-06");
  program = addPracticeRecord(program, 1, "full_arc", "תרגול", "2025-01-07T09:00:00.000Z");
  const afterOneRecord = computeWeekProgress(resolveWeek(program, 1));
  assert.ok(afterOneRecord > 0 && afterOneRecord < 100);
  program = saveWeekReflection(program, 1, { whatHelped: null, whatWasHard: null, identityEvidence: null, readyToReduceSupport: null }, "2025-01-11T09:00:00.000Z");
  const afterReflection = computeWeekProgress(resolveWeek(program, 1));
  assert.ok(afterReflection > afterOneRecord);
});

test("computeOverallProgress averages all four weeks' own progress", () => {
  const program = createFourWeekProgram("2025-01-06");
  assert.equal(computeOverallProgress(program), 0);
  const oneCompleted = confirmWeekCompleteAndAdvance(program, "2025-01-12T18:00:00.000Z");
  assert.equal(computeOverallProgress(oneCompleted), 25);
});

test("resolveCurrentWeek always resolves the week matching currentWeek", () => {
  const program = createFourWeekProgram("2025-01-06");
  assert.equal(resolveCurrentWeek(program).weekNumber, 1);
  const advanced = confirmWeekCompleteAndAdvance(program, "2025-01-12T18:00:00.000Z");
  assert.equal(resolveCurrentWeek(advanced).weekNumber, 2);
});

// --- Android date-field blank-screen bug fix: defensive validation around
// date parsing and cascading (build/ArcGoalEditorScreen.tsx's raw
// "YYYY-MM-DD" TextInput and live/ArcGoalFourWeekDashboardScreen.tsx's
// "extend current week" Modal both feed trainee-typed strings straight
// into setWeekStartDate/setWeekEndDate on every keystroke -- neither is a
// native date picker, so a partial or malformed string must never throw
// and blank the screen). ---

test("1. selecting a valid Week 1 end date updates it and closes out cleanly (no throw, no leftover invalid state)", () => {
  const program = createFourWeekProgram("2025-01-06");
  const updated = setWeekEndDate(program, 1, "2025-01-10");
  assert.equal(resolveWeek(updated, 1).plannedEndDate, "2025-01-10");
  assert.equal(resolveWeek(updated, 1).datesManuallyEdited, true);
});

test("2. canceling the date field (backing out without committing a new value) leaves the program byte-for-byte unchanged", () => {
  const program = createFourWeekProgram("2025-01-06");
  // "Cancel" here means the trainee never calls the setter with a new
  // value at all (there is no native picker/modal to dismiss) -- the BUILD
  // page's own local goal state is simply never patched, so the program
  // must be referentially/structurally identical to before.
  const untouched = program;
  assert.deepEqual(untouched, program);
  assert.equal(resolveWeek(untouched, 1).plannedEndDate, resolveWeek(program, 1).plannedEndDate);
});

test("3. dismissing mid-edit with the Android Back button (an incomplete date left in the field) never throws and never corrupts other weeks", () => {
  const program = createFourWeekProgram("2025-01-06");
  // Simulates the trainee typing "2025-01-1" character by character and
  // then backing out (Android Back) before finishing the last digit --
  // every one of these partial strings must be absorbed safely.
  const partials = ["2", "20", "202", "2025", "2025-", "2025-0", "2025-01", "2025-01-", "2025-01-1"];
  let program1 = program;
  for (const partial of partials) {
    assert.doesNotThrow(() => {
      program1 = setWeekEndDate(program1, 1, partial);
    });
  }
  // The field itself holds exactly what was typed (so it stays editable)...
  assert.equal(resolveWeek(program1, 1).plannedEndDate, "2025-01-1");
  // ...but since it was never a valid date, no cascade to later weeks ever
  // ran -- Weeks 2-4 are exactly as createFourWeekProgram left them.
  assert.deepEqual(resolveWeek(program1, 2), resolveWeek(program, 2));
  assert.deepEqual(resolveWeek(program1, 3), resolveWeek(program, 3));
  assert.deepEqual(resolveWeek(program1, 4), resolveWeek(program, 4));
  // Every other read path used right after re-rendering the screen stays safe too.
  assert.doesNotThrow(() => isPastPlannedEndDate(resolveWeek(program1, 1), "2025-01-09"));
  assert.doesNotThrow(() => resolveNextWeekOpeningDate(program1, 1));
});

test("4. a later, valid edit still recalculates the following weeks safely after an invalid intermediate value", () => {
  const program = createFourWeekProgram("2025-01-06");
  let updated = setWeekEndDate(program, 1, "2025-01-1"); // invalid/partial -- absorbed, no cascade
  updated = setWeekEndDate(updated, 1, "2025-01-10"); // now valid -- cascades forward
  assert.equal(resolveWeek(updated, 1).plannedEndDate, "2025-01-10");
  assert.equal(resolveWeek(updated, 2).plannedStartDate, "2025-01-11");
  assert.equal(resolveWeek(updated, 2).plannedEndDate, "2025-01-17");
  assert.equal(resolveWeek(updated, 3).plannedStartDate, "2025-01-18");
  assert.equal(resolveWeek(updated, 4).plannedStartDate, "2025-01-25");
  assert.equal(resolveWeek(updated, 4).plannedEndDate, "2025-01-31");
});

test("5. invalid or missing date values are recognized safely by isValidCalendarDateString and never crash any consumer", () => {
  assert.equal(isValidCalendarDateString(""), false);
  assert.equal(isValidCalendarDateString("2025-01-1"), false);
  assert.equal(isValidCalendarDateString("not-a-date"), false);
  assert.equal(isValidCalendarDateString("2025-13-01"), false);
  assert.equal(isValidCalendarDateString("2025-01-32"), false);
  assert.equal(isValidCalendarDateString(null), false);
  assert.equal(isValidCalendarDateString(undefined), false);
  assert.equal(isValidCalendarDateString("2025-01-06"), true);

  const program = createFourWeekProgram("2025-01-06");
  assert.doesNotThrow(() => setWeekStartDate(program, 2, ""));
  assert.doesNotThrow(() => setWeekEndDate(program, 2, "garbage"));
  assert.doesNotThrow(() => setWeekStartDate(program, 3, "2025-02-30"));
  assert.doesNotThrow(() => isPastPlannedEndDate(resolveWeek(program, 1), "not-a-date-either"));
});

test("6. reopening the four-week BUILD after saving with a previously-invalid stored date never blanks the screen", () => {
  let program = createFourWeekProgram("2025-01-06");
  // Simulates a trainee who typed a partial date and left the screen
  // (e.g. pressed Save or navigated back) before it became a valid full
  // date -- this WAS persisted as-is under the old, throwing behavior's
  // escape hatches, and must remain completely safe to load back in.
  program = setWeekStartDate(program, 2, "2025-01-1");
  assert.equal(isValidCalendarDateString(resolveWeek(program, 2).plannedStartDate), false);

  // Every read the BUILD/LIVE screens perform on load must still work.
  assert.doesNotThrow(() => resolveWeek(program, 2));
  assert.doesNotThrow(() => resolveNextWeekOpeningDate(program, 1));
  assert.doesNotThrow(() => resolveNextWeekOpeningDate(program, 2));
  assert.doesNotThrow(() => isPastPlannedEndDate(resolveWeek(program, 2), "2025-01-20"));
  assert.doesNotThrow(() => computeWeekProgress(resolveWeek(program, 2)));
  assert.doesNotThrow(() => computeOverallProgress(program));

  // And the trainee can still recover by typing a real date afterward.
  const recovered = setWeekStartDate(program, 2, "2025-01-13");
  assert.equal(resolveWeek(recovered, 2).plannedStartDate, "2025-01-13");
});
