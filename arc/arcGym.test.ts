import test from "node:test";
import assert from "node:assert/strict";

import {
  ARC_GYM_OBSTACLE_OPTIONS,
  clearArcGymBodySensationMemory,
  completeArcGymTrainingRecord,
  createArcGymMemoryExercise,
  createArcGymReminder,
  createArcGymSituation,
  createArcGymTrainingRecord,
  createEmptyArcGymBehaviorObstacles,
  createEmptyArcGymMemory,
  deleteArcGymMemoryExerciseFromList,
  deleteArcGymReminderFromList,
  describeArcGymReminderSchedule,
  findArcGymBehaviorObstacles,
  findArcGymMemory,
  findFutureBehavior,
  findOpenArcGymTrainingRecord,
  isArcGymReminderNotificationInSync,
  isArcGymReminderRecurring,
  listArcGymRemindersForExercise,
  listArcGymSituationsForBehavior,
  listArcGymTrainingRecordsForMemoryExercise,
  listArcGymTrainingRecordsForSituation,
  recordArcGymMemoryFromSession,
  resolveArcGymActionVisualization,
  resolveArcGymBehaviorOptions,
  resolveArcGymMemoryMantraSteps,
  resolveArcGymReminderNextOccurrenceDate,
  resolveArcGymSituationVisualizationPrompts,
  setArcGymObstacleCustomText,
  toggleArcGymObstacle,
  updateArcGymMemoryExercise,
  updateArcGymSituation,
  upsertArcGymBehaviorObstaclesInList,
  upsertArcGymMemoryExerciseInList,
  upsertArcGymMemoryInList,
  upsertArcGymReminderInList,
  upsertArcGymSituationInList,
  upsertArcGymTrainingRecordInList,
} from "./arcGym.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import { createEmptyPurposeManifest } from "./purposeManifest.ts";
import type { FutureBehavior, PurposeManifest } from "./purposeManifest.ts";

const NOW = "2026-09-26T12:00:00.000Z";
const LATER = "2026-09-26T13:00:00.000Z";

function makeBehavior(id: string, description: string): FutureBehavior {
  return { id, description, reason: "" };
}

/** Pads `behaviors` out to the required fixed 3-tuple with blank filler entries -- only the entries the test actually cares about are ever non-blank. */
function makeManifest(id: string, behaviors: FutureBehavior[]): PurposeManifest {
  const padded = [...behaviors];
  while (padded.length < 3) padded.push(makeBehavior(`${id}-filler-${padded.length}`, ""));
  return { ...createEmptyPurposeManifest(id, NOW), behaviors: padded.slice(0, 3) as [FutureBehavior, FutureBehavior, FutureBehavior] };
}

// --- required test 2: loading saved Manifest behaviors --------------------

test("required test 2: resolveArcGymBehaviorOptions flattens every non-blank behavior across every saved manifest, verbatim, never inventing or hardcoding one", () => {
  const manifests = [
    makeManifest("m1", [makeBehavior("b1", "לדבר בבירור עם זרים"), makeBehavior("b2", "   ")]),
    makeManifest("m2", [makeBehavior("b3", "להתחיל משימות בזמן")]),
  ];
  const options = resolveArcGymBehaviorOptions(manifests);
  assert.deepEqual(options, [
    { manifestId: "m1", behaviorId: "b1", text: "לדבר בבירור עם זרים" },
    { manifestId: "m2", behaviorId: "b3", text: "להתחיל משימות בזמן" },
  ]);
});

test("required test 2 continued: a blank-description behavior is never offered as an option (never a hardcoded fallback behavior either)", () => {
  const manifests = [makeManifest("m1", [makeBehavior("b1", "")])];
  assert.deepEqual(resolveArcGymBehaviorOptions(manifests), []);
});

test("findFutureBehavior resolves the exact behavior by (manifestId, behaviorId), or null if either doesn't match", () => {
  const manifests = [makeManifest("m1", [makeBehavior("b1", "טקסט")])];
  assert.equal(findFutureBehavior(manifests, "m1", "b1")?.description, "טקסט");
  assert.equal(findFutureBehavior(manifests, "m1", "nope"), null);
  assert.equal(findFutureBehavior(manifests, "nope", "b1"), null);
});

// --- required test 3: obstacle selection/editing ---------------------------

test("required test 3: toggleArcGymObstacle adds an unselected obstacle and removes a selected one, scoped to the one behavior record", () => {
  const record = createEmptyArcGymBehaviorObstacles("m1", "b1", NOW);
  const withFear = toggleArcGymObstacle(record, "fear", LATER);
  assert.deepEqual(withFear.obstacles, ["fear"]);
  assert.equal(withFear.updatedAt, LATER);
  const withoutFear = toggleArcGymObstacle(withFear, "fear", NOW);
  assert.deepEqual(withoutFear.obstacles, []);
});

test("required test 3 continued: every one of the 10 fixed obstacle options plus 'other' toggles independently, never classified as a medical diagnosis (plain string union only)", () => {
  let record = createEmptyArcGymBehaviorObstacles("m1", "b1", NOW);
  for (const option of ARC_GYM_OBSTACLE_OPTIONS) record = toggleArcGymObstacle(record, option, NOW);
  assert.equal(record.obstacles.length, ARC_GYM_OBSTACLE_OPTIONS.length);
  assert.equal(ARC_GYM_OBSTACLE_OPTIONS.length, 10);
});

test("required test 3 continued: setArcGymObstacleCustomText saves the free-typed 'other' obstacle text and auto-includes 'other' in the obstacle list; clearing the text removes neither the selection array shape nor crashes on empty input", () => {
  const record = createEmptyArcGymBehaviorObstacles("m1", "b1", NOW);
  const withCustom = setArcGymObstacleCustomText(record, "  קושי חברתי  ", LATER);
  assert.equal(withCustom.customText, "קושי חברתי");
  assert.ok(withCustom.obstacles.includes("other"));
  const cleared = setArcGymObstacleCustomText(withCustom, "   ", NOW);
  assert.equal(cleared.customText, null);
});

test("required test 3 continued: obstacles are editable later -- findArcGymBehaviorObstacles returns the one existing record for a behavior to continue editing, and upsertArcGymBehaviorObstaclesInList replaces (never duplicates) it", () => {
  const record = toggleArcGymObstacle(createEmptyArcGymBehaviorObstacles("m1", "b1", NOW), "hesitation", NOW);
  const list = upsertArcGymBehaviorObstaclesInList([], record);
  assert.equal(findArcGymBehaviorObstacles(list, "m1", "b1")?.obstacles[0], "hesitation");
  const updated = toggleArcGymObstacle(record, "fear", LATER);
  const relisted = upsertArcGymBehaviorObstaclesInList(list, updated);
  assert.equal(relisted.length, 1);
  assert.deepEqual(relisted[0].obstacles, ["hesitation", "fear"]);
});

// --- required test 4: multiple situations per behavior, saving triggers/desired actions ---

test("required test 4: multiple situations can exist for the SAME behavior, each with its own trigger and desiredAction, never merged or deduplicated into one", () => {
  let situations = upsertArcGymSituationInList([], createArcGymSituation("s1", "m1", "b1", "להיות אסרטיבי", "כשנהג חוסם אותי", "כשאני רואה את הנהג", "לגשת ולדבר בבירור", NOW));
  situations = upsertArcGymSituationInList(situations, createArcGymSituation("s2", "m1", "b1", "להיות אסרטיבי", "כשקולגה מפריע לי בפגישה", "כשהוא מדבר מעליי", "להגיד לו לחכות בתורו", NOW));
  const forBehavior = listArcGymSituationsForBehavior(situations, "m1", "b1");
  assert.equal(forBehavior.length, 2);
  assert.equal(forBehavior[0].trigger, "כשאני רואה את הנהג");
  assert.equal(forBehavior[1].trigger, "כשהוא מדבר מעליי");
});

test("required test 4 continued: listArcGymSituationsForBehavior never leaks a situation belonging to a different behavior or manifest", () => {
  const situations = [
    createArcGymSituation("s1", "m1", "b1", "התנהגות א", "סיטואציה א", "", "פעולה א", NOW),
    createArcGymSituation("s2", "m1", "b2", "התנהגות ב", "סיטואציה ב", "", "פעולה ב", NOW),
    createArcGymSituation("s3", "m2", "b1", "התנהגות ג", "סיטואציה ג", "", "פעולה ג", NOW),
  ];
  assert.deepEqual(listArcGymSituationsForBehavior(situations, "m1", "b1").map((s) => s.id), ["s1"]);
});

test("required test 4 continued: createArcGymSituation trims every text field and snapshots behaviorText verbatim at creation time", () => {
  const situation = createArcGymSituation("s1", "m1", "b1", "  להיות אסרטיבי  ", "  כשמישהו חותך אותי  ", "  כשהוא מדבר  ", "  לעצור ולהגיב בבירור  ", NOW);
  assert.equal(situation.behaviorText, "להיות אסרטיבי");
  assert.equal(situation.situationDescription, "כשמישהו חותך אותי");
  assert.equal(situation.trigger, "כשהוא מדבר");
  assert.equal(situation.desiredAction, "לעצור ולהגיב בבירור");
  assert.equal(situation.visualizationDetails, null);
});

test("required test 4 continued: updateArcGymSituation edits only the fields present in the patch, trims them, and leaves behaviorText/manifestId/behaviorId untouched -- 'editable later' never means re-creating the record", () => {
  const original = createArcGymSituation("s1", "m1", "b1", "התנהגות", "סיטואציה ישנה", "טריגר ישן", "פעולה ישנה", NOW);
  const updated = updateArcGymSituation(original, { desiredAction: "  פעולה חדשה ומדויקת  " }, LATER);
  assert.equal(updated.desiredAction, "פעולה חדשה ומדויקת");
  assert.equal(updated.situationDescription, "סיטואציה ישנה", "an untouched field must keep its old value, not be blanked");
  assert.equal(updated.behaviorText, "התנהגות");
  assert.equal(updated.manifestId, "m1");
  assert.equal(updated.updatedAt, LATER);
});

// --- required test 6: personalized situation visualization ----------------

test("required test 6: resolveArcGymSituationVisualizationPrompts personalizes with the trainee's OWN saved situationDescription and trigger text, never generic invented scene details", () => {
  const prompts = resolveArcGymSituationVisualizationPrompts({ situationDescription: "נהג חוסם אותי בכניסה לחניה", trigger: "כשאני רואה אותו מסתכל עליי" });
  assert.ok(prompts[0].includes("נהג חוסם אותי בכניסה לחניה"));
  assert.ok(prompts[prompts.length - 1].includes("כשאני רואה אותו מסתכל עליי"));
  assert.equal(prompts.length, 4);
});

test("required test 6 continued: with no trigger saved, the last prompt falls back to a GENERIC trigger-less phrasing rather than inventing a fake trigger", () => {
  const prompts = resolveArcGymSituationVisualizationPrompts({ situationDescription: "סיטואציה", trigger: "" });
  assert.equal(prompts[prompts.length - 1], "מה קורה בדיוק ברגע שבו אתה רוצה לפעול?");
});

// --- required test 11/14 (part): no generic placeholders; exact saved content; different situations -> different guidance ---

test("required test 11+14: resolveArcGymActionVisualization embeds the EXACT saved situationDescription and desiredAction verbatim, never the banned generic placeholders", () => {
  const text = resolveArcGymActionVisualization({ situationDescription: "נהג חוסם את הרכב שלי", desiredAction: "לצאת, לגשת אליו בנימוס ולהסביר שהוא חוסם" });
  assert.ok(text.includes("נהג חוסם את הרכב שלי"));
  assert.ok(text.includes("לצאת, לגשת אליו בנימוס ולהסביר שהוא חוסם"));
  assert.ok(!text.includes("דמיין את עצמך פועל בהתאם להתנהגות שבחרת"));
  assert.ok(!text.includes("דמיין את עצמך עושה את הפעולה הרצויה"));
});

test("required test 14 continued: two DIFFERENT situations under the same behavior produce two DIFFERENTLY-WORDED visualizations, never the same generic text for both", () => {
  const first = resolveArcGymActionVisualization({ situationDescription: "נהג חוסם אותי", desiredAction: "לדבר איתו" });
  const second = resolveArcGymActionVisualization({ situationDescription: "קולגה מפריע בפגישה", desiredAction: "לבקש ממנו לחכות" });
  assert.notEqual(first, second);
  assert.ok(first.includes("נהג חוסם אותי") && !first.includes("קולגה מפריע בפגישה"));
  assert.ok(second.includes("קולגה מפריע בפגישה") && !second.includes("נהג חוסם אותי"));
});

test("required test 13: editing a situation's desiredAction changes what resolveArcGymActionVisualization produces for FUTURE sessions -- the resolver always re-reads the situation's current fields, never a cached/stale copy", () => {
  const original = createArcGymSituation("s1", "m1", "b1", "התנהגות", "סיטואציה", "", "פעולה ישנה שלא מדויקת", NOW);
  const before = resolveArcGymActionVisualization(original);
  const edited = updateArcGymSituation(original, { desiredAction: "פעולה חדשה ומדויקת יותר" }, LATER);
  const after = resolveArcGymActionVisualization(edited);
  assert.ok(before.includes("פעולה ישנה שלא מדויקת"));
  assert.ok(after.includes("פעולה חדשה ומדויקת יותר"));
  assert.ok(!after.includes("פעולה ישנה שלא מדויקת"));
});

test("required test 15 (no invented actions/outcomes): with blank situationDescription or blank desiredAction, resolveArcGymActionVisualization degrades to the ONE other field it actually has, rather than inventing filler content for the missing one", () => {
  assert.equal(resolveArcGymActionVisualization({ situationDescription: "", desiredAction: "לעשות X" }), "דמיין את עצמך עושה את זה כרגע: לעשות X");
  assert.equal(resolveArcGymActionVisualization({ situationDescription: "סיטואציה Y", desiredAction: "" }), "דמיין את הסיטואציה הזאת: סיטואציה Y");
  assert.equal(resolveArcGymActionVisualization({ situationDescription: "", desiredAction: "" }), "");
});

// --- required test 16/17/18: thoughts, body sensations, current vs historical ---

test("required test 16: recordArcGymMemoryFromSession saves the session's own currentThought/interpretationText into memory, reusing already-captured fields rather than asking again", () => {
  const session = { ...createNewArcLiveSessionState("standalone-arc", "", "", NOW, "spontaneous"), currentThought: "אף אחד לא מקשיב לי", interpretationText: "אני לא חשוב" };
  const memory = recordArcGymMemoryFromSession(createEmptyArcGymMemory("s1", NOW), session, LATER);
  assert.equal(memory.lastThought, "אף אחד לא מקשיב לי");
  assert.equal(memory.lastInterpretation, "אני לא חשוב");
  assert.equal(memory.updatedAt, LATER);
});

test("required test 17: recordArcGymMemoryFromSession saves body-scan contraction/heaviness/opening-region/supportive-area fields straight off the session", () => {
  const session = {
    ...createNewArcLiveSessionState("standalone-arc", "", "", NOW, "plannedFull"),
    bodyScanContractionRegions: [{ region: "chest", side: null }],
    bodyScanHeavinessRegions: [{ region: "stomach", side: null }],
    primaryOpeningBodyScanRegion: "chest",
    primaryOpeningBodyScanSide: null,
    supportiveBodyArea: "hands",
    supportiveSensation: "חמימות",
  } as any;
  const memory = recordArcGymMemoryFromSession(createEmptyArcGymMemory("s1", NOW), session, LATER);
  assert.deepEqual(memory.lastContractionRegions, [{ region: "chest", side: null }]);
  assert.deepEqual(memory.lastHeavinessRegions, [{ region: "stomach", side: null }]);
  assert.equal(memory.lastPrimaryOpeningRegion, "chest");
  assert.equal(memory.lastSupportiveBodyArea, "hands");
  assert.equal(memory.lastSupportiveSensation, "חמימות");
});

test("required test 18 (current vs. historical stay distinct): a Shortened-ARC session that never visits body-scan at all (empty arrays/null fields) NEVER blanks out still-relevant PRIOR memory -- each field is only replaced when the session itself actually captured something new for it", () => {
  const priorMemory = {
    ...createEmptyArcGymMemory("s1", NOW),
    lastThought: "מחשבה ישנה",
    lastContractionRegions: [{ region: "chest", side: null }] as any,
    lastPrimaryOpeningRegion: "chest" as any,
    lastSupportiveSensation: "קלילות",
  };
  const shortenedSession = createNewArcLiveSessionState("standalone-arc", "", "", NOW, "shortened");
  const afterShortened = recordArcGymMemoryFromSession(priorMemory, shortenedSession, LATER);
  assert.equal(afterShortened.lastThought, "מחשבה ישנה", "a Shortened ARC session never captured a thought, so the historical one must survive untouched");
  assert.deepEqual(afterShortened.lastContractionRegions, [{ region: "chest", side: null }]);
  assert.equal(afterShortened.lastPrimaryOpeningRegion, "chest");
  assert.equal(afterShortened.lastSupportiveSensation, "קלילות");
  assert.equal(afterShortened.updatedAt, LATER, "the record is still touched/timestamped even when every value carried over unchanged");
});

test("required test 18 continued: clearArcGymBodySensationMemory resets ONLY the body-sensation fields, explicitly preserving thought history as a separate, independently-resettable concern", () => {
  const memory = {
    ...createEmptyArcGymMemory("s1", NOW),
    lastThought: "מחשבה שנשארת",
    lastContractionRegions: [{ region: "chest", side: null }] as any,
    lastPrimaryOpeningRegion: "chest" as any,
    lastSupportiveBodyArea: "hands" as any,
    lastSupportiveSensation: "חמימות",
  };
  const cleared = clearArcGymBodySensationMemory(memory, LATER);
  assert.equal(cleared.lastThought, "מחשבה שנשארת");
  assert.deepEqual(cleared.lastContractionRegions, []);
  assert.deepEqual(cleared.lastHeavinessRegions, []);
  assert.equal(cleared.lastPrimaryOpeningRegion, null);
  assert.equal(cleared.lastSupportiveBodyArea, null);
  assert.equal(cleared.lastSupportiveSensation, null);
});

test("findArcGymMemory/upsertArcGymMemoryInList: one memory record per situationId, replaced (never duplicated) on update", () => {
  const list = upsertArcGymMemoryInList([], createEmptyArcGymMemory("s1", NOW));
  assert.equal(findArcGymMemory(list, "s1")?.situationId, "s1");
  assert.equal(findArcGymMemory(list, "s2"), null);
  const updated = upsertArcGymMemoryInList(list, { ...createEmptyArcGymMemory("s1", LATER), lastThought: "עודכן" });
  assert.equal(updated.length, 1);
  assert.equal(updated[0].lastThought, "עודכן");
});

// --- required test 21: training history / session recovery ----------------

test("required test 21: listArcGymTrainingRecordsForSituation returns only this situation's own records, most recent first", () => {
  const records = [
    createArcGymTrainingRecord("r1", "s1", "full_arc", "2026-01-01T00:00:00.000Z"),
    createArcGymTrainingRecord("r2", "s1", "shortened_arc", "2026-01-02T00:00:00.000Z"),
    createArcGymTrainingRecord("r3", "s2", "visualization_only", "2026-01-03T00:00:00.000Z"),
  ];
  const forS1 = listArcGymTrainingRecordsForSituation(records, "s1");
  assert.deepEqual(forS1.map((r) => r.id), ["r2", "r1"]);
});

test("required test 21 continued: findOpenArcGymTrainingRecord finds the still-unfinished (completedAt null) record for a situation to resume, ignoring completed ones, and picks the most recent if more than one is somehow open", () => {
  const records = [
    createArcGymTrainingRecord("r1", "s1", "full_arc", "2026-01-01T00:00:00.000Z"),
    completeArcGymTrainingRecord(createArcGymTrainingRecord("r2", "s1", "full_arc", "2026-01-02T00:00:00.000Z"), LATER),
    createArcGymTrainingRecord("r3", "s1", "shortened_arc", "2026-01-03T00:00:00.000Z"),
  ];
  const open = findOpenArcGymTrainingRecord(records, "s1");
  assert.equal(open?.id, "r3");
});

test("required test 21 continued: findOpenArcGymTrainingRecord returns null once the only record for a situation is completed, and completeArcGymTrainingRecord sets completedAt + trims an optional reflection", () => {
  const completed = completeArcGymTrainingRecord(createArcGymTrainingRecord("r1", "s1", "full_arc", NOW), LATER, "  הלך טוב  ");
  assert.equal(completed.completedAt, LATER);
  assert.equal(completed.reflection, "הלך טוב");
  assert.equal(findOpenArcGymTrainingRecord([completed], "s1"), null);
});

test("upsertArcGymTrainingRecordInList replaces an existing record by id rather than duplicating it", () => {
  const list = upsertArcGymTrainingRecordInList([], createArcGymTrainingRecord("r1", "s1", "full_arc", NOW));
  const completed = completeArcGymTrainingRecord(list[0], LATER);
  const relisted = upsertArcGymTrainingRecordInList(list, completed);
  assert.equal(relisted.length, 1);
  assert.equal(relisted[0].completedAt, LATER);
});

// --- ARC Memory exercise type (ARCHI -- Unified Development Specification task, Part 1) ---

test("createArcGymMemoryExercise trims both fields and starts with real timestamps on both created/updated", () => {
  const exercise = createArcGymMemoryExercise("m1", "  כשאני נכנס לבית  ", "  להניח מפתחות בקערה  ", NOW);
  assert.equal(exercise.situationText, "כשאני נכנס לבית");
  assert.equal(exercise.actionText, "להניח מפתחות בקערה");
  assert.equal(exercise.createdAt, NOW);
  assert.equal(exercise.updatedAt, NOW);
});

test("updateArcGymMemoryExercise only changes provided fields and always refreshes updatedAt", () => {
  const original = createArcGymMemoryExercise("m1", "סיטואציה", "פעולה", NOW);
  const updated = updateArcGymMemoryExercise(original, { actionText: "פעולה חדשה" }, LATER);
  assert.equal(updated.situationText, original.situationText, "situationText must be left untouched when not patched");
  assert.equal(updated.actionText, "פעולה חדשה");
  assert.equal(updated.updatedAt, LATER);
});

test("resolveArcGymMemoryMantraSteps returns exactly 4 first-person Hebrew steps, embedding situationText/actionText verbatim and never inventing a 5th step", () => {
  const exercise = createArcGymMemoryExercise("m1", "כשאני נכנס לבית", "להניח מפתחות בקערה", NOW);
  const steps = resolveArcGymMemoryMantraSteps(exercise);
  assert.equal(steps.length, 4);
  assert.ok(steps[0].includes("כשאני נכנס לבית"));
  assert.ok(steps[2].includes("להניח מפתחות בקערה"));
  assert.ok(steps[3].includes("להניח מפתחות בקערה"));
});

test("upsertArcGymMemoryExerciseInList replaces only the matching id, appends otherwise; deleteArcGymMemoryExerciseFromList removes only the named id", () => {
  const m1 = createArcGymMemoryExercise("m1", "s1", "a1", NOW);
  const m2 = createArcGymMemoryExercise("m2", "s2", "a2", NOW);
  let list = upsertArcGymMemoryExerciseInList([m1], m2);
  assert.equal(list.length, 2);
  const m1Updated = { ...m1, actionText: "a1-updated" };
  list = upsertArcGymMemoryExerciseInList(list, m1Updated);
  assert.equal(list.length, 2);
  assert.equal(list.find((item) => item.id === "m1")?.actionText, "a1-updated");
  list = deleteArcGymMemoryExerciseFromList(list, "m2");
  assert.deepEqual(list.map((item) => item.id), ["m1"]);
});

test("listArcGymTrainingRecordsForMemoryExercise reuses listArcGymTrainingRecordsForSituation's own id-keyed filter -- never a second history engine", () => {
  const record = completeArcGymTrainingRecord(createArcGymTrainingRecord("r1", "m1", "visualization_only", NOW), LATER);
  const unrelated = createArcGymTrainingRecord("r2", "m2", "visualization_only", NOW);
  const result = listArcGymTrainingRecordsForMemoryExercise([record, unrelated], "m1");
  assert.deepEqual(result.map((entry) => entry.id), ["r1"]);
});

// --- ARC GYM reminders (ARCHI -- Unified Development Specification task, Part 2) ---

test("createArcGymReminder starts enabled, not completed, with no notification armed yet", () => {
  const reminder = createArcGymReminder("rem1", "behaviour", "sit1", 9, 30, null, "2026-01-10", NOW);
  assert.equal(reminder.enabled, true);
  assert.equal(reminder.completed, false);
  assert.equal(reminder.notificationId, null);
  assert.equal(reminder.exerciseKind, "behaviour");
});

test("isArcGymReminderRecurring is true only for a non-empty recurrenceDaysOfWeek array", () => {
  assert.equal(isArcGymReminderRecurring({ recurrenceDaysOfWeek: null }), false);
  assert.equal(isArcGymReminderRecurring({ recurrenceDaysOfWeek: [] }), false);
  assert.equal(isArcGymReminderRecurring({ recurrenceDaysOfWeek: [1, 3] }), true);
});

test("resolveArcGymReminderNextOccurrenceDate, one-time: returns the exact dateLocal+hour:minute moment only while it's still strictly in the future, and null once completed", () => {
  const now = new Date(2026, 0, 5, 12, 0, 0); // Monday 2026-01-05, 12:00 local
  const future = createArcGymReminder("r1", "behaviour", "s1", 18, 0, null, "2026-01-05", "2026-01-01T00:00:00.000Z");
  const next = resolveArcGymReminderNextOccurrenceDate(future, now);
  assert.ok(next !== null);
  assert.equal(next!.getHours(), 18);

  const past = createArcGymReminder("r2", "behaviour", "s1", 8, 0, null, "2026-01-05", "2026-01-01T00:00:00.000Z");
  assert.equal(resolveArcGymReminderNextOccurrenceDate(past, now), null, "a past one-time moment has no next occurrence");

  const completedButFuture = { ...future, completed: true };
  assert.equal(resolveArcGymReminderNextOccurrenceDate(completedButFuture, now), null, "a completed one-time reminder is never rescheduled");
});

test("resolveArcGymReminderNextOccurrenceDate, recurring: scans forward to the next matching weekday, strictly after now, within 14 days", () => {
  const now = new Date(2026, 0, 5, 12, 0, 0); // Monday
  const reminder = createArcGymReminder("r3", "memory", "m1", 9, 0, [1], null, NOW); // Mondays only
  const next = resolveArcGymReminderNextOccurrenceDate(reminder, now);
  assert.ok(next !== null);
  assert.equal(next!.getDay(), 1);
  assert.ok(next!.getTime() > now.getTime(), "today's own 09:00 has already passed by 12:00, so the next Monday occurrence must be a full week later");
});

test("isArcGymReminderNotificationInSync: true when disabled-and-cleared or when notificationScheduledFor already matches the freshly-computed next occurrence; false otherwise", () => {
  const now = new Date(2026, 0, 5, 12, 0, 0);
  const disabled = { ...createArcGymReminder("r4", "behaviour", "s1", 9, 0, [1], null, NOW), enabled: false };
  assert.equal(isArcGymReminderNotificationInSync(disabled, now), true);

  const stale = createArcGymReminder("r5", "behaviour", "s1", 9, 0, [1], null, NOW);
  assert.equal(isArcGymReminderNotificationInSync(stale, now), false, "enabled with no notification armed yet is never in sync");
});

test("upsertArcGymReminderInList/deleteArcGymReminderFromList/listArcGymRemindersForExercise never cross-contaminate different exercises or kinds", () => {
  const behaviourReminder = createArcGymReminder("r1", "behaviour", "sit1", 9, 0, null, "2026-01-10", NOW);
  const memoryReminder = createArcGymReminder("r2", "memory", "sit1", 9, 0, null, "2026-01-10", NOW); // same exerciseId, different kind
  let list = upsertArcGymReminderInList([], behaviourReminder);
  list = upsertArcGymReminderInList(list, memoryReminder);
  assert.deepEqual(listArcGymRemindersForExercise(list, "behaviour", "sit1").map((r) => r.id), ["r1"]);
  assert.deepEqual(listArcGymRemindersForExercise(list, "memory", "sit1").map((r) => r.id), ["r2"]);
  list = deleteArcGymReminderFromList(list, "r1");
  assert.deepEqual(listArcGymRemindersForExercise(list, "behaviour", "sit1"), []);
});

test("describeArcGymReminderSchedule formats a one-time reminder with its date and a recurring one with its weekday labels, always HH:MM padded", () => {
  const oneTime = createArcGymReminder("r1", "behaviour", "s1", 9, 5, null, "2026-01-10", NOW);
  assert.equal(describeArcGymReminderSchedule(oneTime), "2026-01-10 בשעה 09:05");
  const recurring = createArcGymReminder("r2", "behaviour", "s1", 18, 0, [0, 1], null, NOW);
  assert.equal(describeArcGymReminderSchedule(recurring), "יום א׳, יום ב׳ בשעה 18:00");
});
