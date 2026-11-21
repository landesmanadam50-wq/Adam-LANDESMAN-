import test from "node:test";
import assert from "node:assert/strict";

import {
  type ArcBodyProtocolSnapshot,
  type ArcSavedBodyOption,
  type ArcSavedExercise,
  type ArcTrigger,
  addBodyOptionToTrigger,
  addTriggerToActiveList,
  applyArcBodyProtocolSnapshotToSession,
  areArcBodyProtocolSnapshotsEqual,
  captureArcBodyProtocolSnapshot,
  createArcSavedBodyOption,
  createArcSavedExercise,
  createArcTrigger,
  deleteArcSavedBodyOptionFromList,
  deleteArcSavedExerciseFromList,
  deleteArcTriggerFromList,
  findArcSavedBodyOptionById,
  findArcSavedExerciseById,
  findArcTriggerById,
  generateArcSavedBodyOptionId,
  generateArcSavedExerciseId,
  generateArcTriggerId,
  linkArcGymSituationToTrigger,
  markArcSavedBodyOptionUsed,
  markArcSavedExerciseUsed,
  promoteArcSavedExerciseToBodyOption,
  pruneActiveTriggerList,
  removeBodyOptionFromTrigger,
  removeTriggerFromActiveList,
  reorderActiveTriggerList,
  swapTriggerInActiveList,
  unlinkArcGymSituationFromTrigger,
  updateArcSavedBodyOption,
  updateArcSavedExercise,
  updateArcTrigger,
  upsertArcSavedBodyOptionInList,
  upsertArcSavedExerciseInList,
  upsertArcTriggerInList,
} from "./arcSaving.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";

/**
 * arc/arcSaving.test.ts
 *
 * ARC Saving, Trigger Management & Quick-Action Buttons task: full,
 * directly-executed unit coverage for the pure engine module (no
 * AsyncStorage/React/expo-router involved, same convention as
 * arc/arcDecision.test.ts/arc/arcPerspective.test.ts). Maps to the
 * spec's own 29 required test scenarios (1-16 are engine-level; the
 * remaining UI/native-surface scenarios are covered by
 * build/arcSavingScreens.test.ts's source-text checks).
 */

const NOW = "2025-01-01T00:00:00.000Z";
const LATER = "2025-01-02T00:00:00.000Z";

function sampleSnapshot(overrides: Partial<ArcBodyProtocolSnapshot> = {}): ArcBodyProtocolSnapshot {
  return {
    bodyScanContractionRegions: [{ region: "scanNeck", side: null }],
    openingBodyScanRegions: [{ region: "scanChest", side: null, role: "opening_and_supportive" }],
    supportiveBodyArea: "chest",
    supportiveBodyAreaCustomLabel: null,
    supportiveSensation: "חמימות",
    positiveMovement: "פתיחת בית החזה",
    selectedSupportiveFeeling: null,
    ...overrides,
  };
}

// --- Scenario 1-3: saving a completed exercise's full data ---

test("scenario 1 (saving from the Full ARC route): captureArcBodyProtocolSnapshot projects exactly the 7 reusable fields from a live session, nothing else", () => {
  const session = createNewArcLiveSessionState("task-1", "Title", "Action", NOW, "plannedFull", null, false);
  const withData = {
    ...session,
    bodyScanContractionRegions: [{ region: "scanNeck" as const, side: null }],
    openingBodyScanRegions: [{ region: "scanChest" as const, side: null, role: "opening_and_supportive" as const }],
    supportiveBodyArea: "chest" as const,
    supportiveSensation: "חמימות",
    positiveMovement: "פתיחת בית החזה",
  };
  const snapshot = captureArcBodyProtocolSnapshot(withData);
  assert.deepEqual(snapshot.bodyScanContractionRegions, withData.bodyScanContractionRegions);
  assert.deepEqual(snapshot.openingBodyScanRegions, withData.openingBodyScanRegions);
  assert.equal(snapshot.supportiveBodyArea, "chest");
  assert.equal(snapshot.supportiveSensation, "חמימות");
  assert.equal(snapshot.positiveMovement, "פתיחת בית החזה");
});

test("scenario 2 (saving multiple regions/sensations) + personal name: createArcSavedExercise stores a trainee-given label and the full snapshot, trimmed", () => {
  const snapshot = sampleSnapshot();
  const exercise = createArcSavedExercise(generateArcSavedExerciseId(), "  ARC להרפיית מתח  ", snapshot, "full", "session-1", NOW);
  assert.equal(exercise.label, "ARC להרפיית מתח");
  assert.deepEqual(exercise.snapshot, snapshot);
  assert.equal(exercise.mode, "full");
  assert.equal(exercise.sourceSessionId, "session-1");
  assert.equal(exercise.lastUsedAt, null);
});

test("scenario 3 (saving regulation/encoding movements): the snapshot carries positiveMovement and selectedSupportiveFeeling verbatim, reused unchanged on reapplication", () => {
  const snapshot = sampleSnapshot({ selectedSupportiveFeeling: { feeling: "רוגע", bodyArea: "chest" } as any });
  const session = createNewArcLiveSessionState("task-1", "Title", "Action", NOW, "plannedFull", null, false);
  const applied = applyArcBodyProtocolSnapshotToSession(session, snapshot);
  assert.equal(applied.positiveMovement, "פתיחת בית החזה");
  assert.deepEqual(applied.selectedSupportiveFeeling, snapshot.selectedSupportiveFeeling);
});

// --- Scenario 4-5: loading into regular/shortened routes without re-picking regions ---

test("scenario 4/5 (loading into Full/Shortened ARC, no re-picking): applyArcBodyProtocolSnapshotToSession is the exact inverse of captureArcBodyProtocolSnapshot -- a round trip is lossless and never touches unrelated session fields", () => {
  const session = createNewArcLiveSessionState("task-1", "Title", "Action", NOW, "shortened", null, false);
  const snapshot = sampleSnapshot();
  const applied = applyArcBodyProtocolSnapshotToSession(session, snapshot);
  assert.deepEqual(captureArcBodyProtocolSnapshot(applied), snapshot);
  // Unrelated fields (taskId, arcInvocationMode, currentStep, ...) are untouched.
  assert.equal(applied.taskId, session.taskId);
  assert.equal(applied.arcInvocationMode, session.arcInvocationMode);
  assert.equal(applied.currentStep, session.currentStep);
});

// --- Scenario 6: activation without re-picking regions (session-state marker) ---

test("scenario 6 (activation skips body-region re-selection): the session carries arcSavingBodyOptionId/arcSavingExerciseId defaulted to null, matching the parallel-nullable-id convention used by every other feature entry", () => {
  const session = createNewArcLiveSessionState("task-1", "Title", "Action", NOW, "plannedFull", null, false);
  assert.equal(session.arcSavingBodyOptionId, null);
  assert.equal(session.arcSavingExerciseId, null);
  assert.equal(session.arcSavingTriggerIdForNewOption, null);
});

// --- Scenario 7: changing sensations mid-practice (divergence detection) ---

test("scenario 7 (changing sensations mid-practice): areArcBodyProtocolSnapshotsEqual returns false the moment any one field differs", () => {
  const a = sampleSnapshot();
  assert.ok(areArcBodyProtocolSnapshotsEqual(a, sampleSnapshot()), "identical snapshots must be equal");
  assert.ok(!areArcBodyProtocolSnapshotsEqual(a, sampleSnapshot({ supportiveSensation: "לחץ" })), "a different sensation must diverge");
  assert.ok(!areArcBodyProtocolSnapshotsEqual(a, sampleSnapshot({ positiveMovement: "תנועה אחרת" })), "a different movement must diverge");
  assert.ok(!areArcBodyProtocolSnapshotsEqual(a, sampleSnapshot({ supportiveBodyArea: "abdomen" })), "a different support area must diverge");
});

test("scenario 7 continued: the selection arrays are compared order-insensitively -- re-tapping the same two regions in the opposite order is never a false divergence", () => {
  const a = sampleSnapshot({
    bodyScanContractionRegions: [
      { region: "scanNeck", side: null },
      { region: "scanChest", side: "left" },
    ],
  });
  const b = sampleSnapshot({
    bodyScanContractionRegions: [
      { region: "scanChest", side: "left" },
      { region: "scanNeck", side: null },
    ],
  });
  assert.ok(areArcBodyProtocolSnapshotsEqual(a, b));
});

test("scenario 7 continued: a genuinely different set of contraction/opening regions (not just reordered) is a real divergence", () => {
  const a = sampleSnapshot();
  const differentContraction = sampleSnapshot({ bodyScanContractionRegions: [{ region: "scanAbdomen", side: null }] });
  assert.ok(!areArcBodyProtocolSnapshotsEqual(a, differentContraction));
  const differentOpening = sampleSnapshot({ openingBodyScanRegions: [{ region: "scanAbdomen", side: null, role: "opening_and_supportive" }] });
  assert.ok(!areArcBodyProtocolSnapshotsEqual(a, differentOpening));
  const differentCount = sampleSnapshot({
    bodyScanContractionRegions: [
      { region: "scanNeck", side: null },
      { region: "scanChest", side: "left" },
    ],
  });
  assert.ok(!areArcBodyProtocolSnapshotsEqual(a, differentCount), "a different-length array is never equal, regardless of overlap");
});

test("scenario 7 continued: null vs empty-string fields never register as a false divergence (normalized to the same empty value)", () => {
  const a = sampleSnapshot({ supportiveSensation: null });
  const b = sampleSnapshot({ supportiveSensation: null });
  assert.ok(areArcBodyProtocolSnapshotsEqual(a, b));
});

// --- Scenario 8-9: creating a trigger + linking, multiple body options per trigger ---

test("scenario 8 (creating a trigger + linking): createArcTrigger starts with an empty bodyOptionIds list and no link; addBodyOptionToTrigger attaches without creating/mutating the option itself", () => {
  const trigger = createArcTrigger(generateArcTriggerId(), "  גירוד באוזן  ", NOW);
  assert.equal(trigger.label, "גירוד באוזן");
  assert.deepEqual(trigger.bodyOptionIds, []);
  assert.equal(trigger.linkedArcGymSituationId, null);
  const withOption = addBodyOptionToTrigger(trigger, "option-1", LATER);
  assert.deepEqual(withOption.bodyOptionIds, ["option-1"]);
  assert.equal(withOption.updatedAt, LATER);
});

test("scenario 9 (multiple body options per trigger): a trigger can hold several distinct option ids, each kept in insertion order", () => {
  let trigger = createArcTrigger(generateArcTriggerId(), "גירוד באוזן", NOW);
  trigger = addBodyOptionToTrigger(trigger, "option-1", NOW);
  trigger = addBodyOptionToTrigger(trigger, "option-2", NOW);
  assert.deepEqual(trigger.bodyOptionIds, ["option-1", "option-2"]);
});

test("addBodyOptionToTrigger is idempotent -- attaching an already-attached option id is a no-op, never a duplicate", () => {
  let trigger = createArcTrigger(generateArcTriggerId(), "trigger", NOW);
  trigger = addBodyOptionToTrigger(trigger, "option-1", NOW);
  const before = trigger;
  trigger = addBodyOptionToTrigger(trigger, "option-1", LATER);
  assert.equal(trigger, before, "a no-op attach must return the exact same object, never a new one with a bumped updatedAt");
});

// --- Scenario 10: choosing between options (data shape only; the UI choice itself is covered in build/arcSavingScreens.test.ts) ---

test("scenario 10 (choosing between body options): each ArcSavedBodyOption carries its own usage stats so the picker can order by frequency/recency, without the engine ever deciding which option is 'correct'", () => {
  const option = createArcSavedBodyOption(generateArcSavedBodyOptionId(), "אפשרות 1 — צוואר וחזה", sampleSnapshot(), null, NOW);
  assert.equal(option.useCount, 0);
  assert.equal(option.lastUsedAt, null);
  const used = markArcSavedBodyOptionUsed(option, LATER);
  assert.equal(used.useCount, 1);
  assert.equal(used.lastUsedAt, LATER);
  const usedAgain = markArcSavedBodyOptionUsed(used, NOW);
  assert.equal(usedAgain.useCount, 2);
});

// --- Scenario 11: adding a new option from a real experience ---

test("scenario 11 (adding a new option from experience): promoteArcSavedExerciseToBodyOption copies the exercise's own snapshot into a brand-new option, never mutating or deleting the source exercise", () => {
  const snapshot = sampleSnapshot();
  const exercise = createArcSavedExercise(generateArcSavedExerciseId(), "ARC להרפיית מתח", snapshot, "full", null, NOW);
  const option = promoteArcSavedExerciseToBodyOption(exercise, generateArcSavedBodyOptionId(), "אפשרות חדשה", LATER);
  assert.deepEqual(option.snapshot, snapshot);
  assert.equal(option.sourceSavedExerciseId, exercise.id);
  assert.equal(option.label, "אפשרות חדשה");
  // The source exercise itself is untouched.
  assert.deepEqual(exercise.snapshot, snapshot);
});

// --- Scenario 12: preventing overwrite without confirmation (pure-setter vs. UI split) ---

test("scenario 12 (preventing overwrite without confirmation): updateArcSavedBodyOption is an UNCONDITIONAL setter -- the engine itself never gates this on a confirmation; that three-way choice is strictly the review SCREEN's own responsibility (build/ArcSavingReviewScreen.tsx)", () => {
  const option = createArcSavedBodyOption(generateArcSavedBodyOptionId(), "label", sampleSnapshot(), null, NOW);
  const newSnapshot = sampleSnapshot({ supportiveSensation: "לחץ" });
  const updated = updateArcSavedBodyOption(option, { snapshot: newSnapshot }, LATER);
  assert.deepEqual(updated.snapshot, newSnapshot);
  assert.equal(updated.updatedAt, LATER);
  // The pure setter takes no "are you sure" flag at all -- there is
  // nothing here to prevent a caller from calling it; the UI itself
  // (not this module) is what gates the call on the Alert choice.
});

// --- Scenario 13: preventing duplicates ---

test("scenario 13 (preventing duplicate body options): upsertArcSavedBodyOptionInList replaces by id rather than appending, so re-saving the same option id is never a duplicate", () => {
  const option = createArcSavedBodyOption(generateArcSavedBodyOptionId(), "label", sampleSnapshot(), null, NOW);
  let list = upsertArcSavedBodyOptionInList([], option);
  assert.equal(list.length, 1);
  const updated = updateArcSavedBodyOption(option, { label: "new label" }, LATER);
  list = upsertArcSavedBodyOptionInList(list, updated);
  assert.equal(list.length, 1, "upserting the same id must never grow the list");
  assert.equal(list[0].label, "new label");
});

test("scenario 13 continued: the same discipline holds for saved exercises and triggers (upsert-by-id, never append-regardless)", () => {
  const exercise = createArcSavedExercise(generateArcSavedExerciseId(), "label", sampleSnapshot(), "full", null, NOW);
  let exercises = upsertArcSavedExerciseInList([], exercise);
  exercises = upsertArcSavedExerciseInList(exercises, markArcSavedExerciseUsed(exercise, LATER));
  assert.equal(exercises.length, 1);
  assert.equal(exercises[0].lastUsedAt, LATER);

  const trigger = createArcTrigger(generateArcTriggerId(), "trigger", NOW);
  let triggers = upsertArcTriggerInList([], trigger);
  triggers = upsertArcTriggerInList(triggers, updateArcTrigger(trigger, { label: "renamed" }, LATER));
  assert.equal(triggers.length, 1);
  assert.equal(triggers[0].label, "renamed");
});

// --- Deleting one option from a trigger without deleting the whole trigger (spec section 15) ---

test("removeBodyOptionFromTrigger detaches ONE option from this trigger only -- the option itself (and any other trigger referencing it) is untouched", () => {
  let trigger = createArcTrigger(generateArcTriggerId(), "trigger", NOW);
  trigger = addBodyOptionToTrigger(trigger, "option-1", NOW);
  trigger = addBodyOptionToTrigger(trigger, "option-2", NOW);
  const after = removeBodyOptionFromTrigger(trigger, "option-1", LATER);
  assert.deepEqual(after.bodyOptionIds, ["option-2"]);
  assert.equal(after.updatedAt, LATER);
});

test("removeBodyOptionFromTrigger is a no-op when the option id isn't actually attached", () => {
  const trigger = createArcTrigger(generateArcTriggerId(), "trigger", NOW);
  const after = removeBodyOptionFromTrigger(trigger, "never-attached", LATER);
  assert.equal(after, trigger);
});

// --- Linking/unlinking an ARC Gym Behaviour situation ---

test("linkArcGymSituationToTrigger/unlinkArcGymSituationFromTrigger set and clear the optional cross-link, independent of the trigger's own bodyOptionIds", () => {
  let trigger = createArcTrigger(generateArcTriggerId(), "trigger", NOW);
  trigger = linkArcGymSituationToTrigger(trigger, "situation-1", NOW);
  assert.equal(trigger.linkedArcGymSituationId, "situation-1");
  trigger = unlinkArcGymSituationFromTrigger(trigger, LATER);
  assert.equal(trigger.linkedArcGymSituationId, null);
  assert.equal(trigger.updatedAt, LATER);
});

test("unlinkArcGymSituationFromTrigger is a no-op (same object) when nothing was linked", () => {
  const trigger = createArcTrigger(generateArcTriggerId(), "trigger", NOW);
  const after = unlinkArcGymSituationFromTrigger(trigger, LATER);
  assert.equal(after, trigger);
});

// --- Deletion from the master lists ---

test("deleteArcSavedExerciseFromList/deleteArcSavedBodyOptionFromList/deleteArcTriggerFromList each remove exactly the matching id, leaving everything else untouched", () => {
  const exerciseA = createArcSavedExercise("ex-a", "A", sampleSnapshot(), "full", null, NOW);
  const exerciseB = createArcSavedExercise("ex-b", "B", sampleSnapshot(), "full", null, NOW);
  assert.deepEqual(deleteArcSavedExerciseFromList([exerciseA, exerciseB], "ex-a"), [exerciseB]);

  const optionA = createArcSavedBodyOption("opt-a", "A", sampleSnapshot(), null, NOW);
  const optionB = createArcSavedBodyOption("opt-b", "B", sampleSnapshot(), null, NOW);
  assert.deepEqual(deleteArcSavedBodyOptionFromList([optionA, optionB], "opt-a"), [optionB]);

  const triggerA = createArcTrigger("trig-a", "A", NOW);
  const triggerB = createArcTrigger("trig-b", "B", NOW);
  assert.deepEqual(deleteArcTriggerFromList([triggerA, triggerB], "trig-a"), [triggerB]);
});

test("findArcSavedExerciseById/findArcSavedBodyOptionById/findArcTriggerById return null for a missing id, never throwing", () => {
  assert.equal(findArcSavedExerciseById([], "missing"), null);
  assert.equal(findArcSavedBodyOptionById([], "missing"), null);
  assert.equal(findArcTriggerById([], "missing"), null);
});

// --- Scenario 17: choosing triggers by situation / swapping without deleting (active-list helpers) ---

test("scenario 17 (choosing/swapping active triggers by situation): addTriggerToActiveList/removeTriggerFromActiveList/swapTriggerInActiveList/reorderActiveTriggerList are plain, idempotent array operations -- never touching the master trigger list", () => {
  let active = addTriggerToActiveList([], "trigger-1");
  active = addTriggerToActiveList(active, "trigger-2");
  assert.deepEqual(active, ["trigger-1", "trigger-2"]);
  assert.deepEqual(addTriggerToActiveList(active, "trigger-1"), active, "adding an already-active trigger is a no-op");

  active = swapTriggerInActiveList(active, "trigger-1", "trigger-3");
  assert.deepEqual(active, ["trigger-3", "trigger-2"]);
  assert.deepEqual(swapTriggerInActiveList(active, "never-active", "trigger-9"), active, "swapping a non-present id is a no-op");

  active = reorderActiveTriggerList(active, 1, 0);
  assert.deepEqual(active, ["trigger-2", "trigger-3"]);

  active = removeTriggerFromActiveList(active, "trigger-2");
  assert.deepEqual(active, ["trigger-3"]);
});

test("scenario 18 (removing from display without deleting from storage): removeTriggerFromActiveList only ever changes the active-id array -- it takes no trigger/master-list argument at all, so it is structurally incapable of deleting a trigger", () => {
  const active = removeTriggerFromActiveList(["trigger-1", "trigger-2"], "trigger-1");
  assert.deepEqual(active, ["trigger-2"]);
});

test("reorderActiveTriggerList clamps out-of-range indices instead of throwing or corrupting the list", () => {
  const active = ["a", "b", "c"];
  assert.deepEqual(reorderActiveTriggerList(active, 0, 99), ["b", "c", "a"]);
  assert.deepEqual(reorderActiveTriggerList(active, -1, 0), active, "an invalid fromIndex is a no-op");
  assert.deepEqual(reorderActiveTriggerList(active, 10, 0), active, "an out-of-range fromIndex is a no-op");
});

// --- Pruning stale active ids (spec section 14) ---

test("pruneActiveTriggerList drops ids that no longer resolve to a real trigger, preserving the order of the remaining ones", () => {
  const triggers: ArcTrigger[] = [createArcTrigger("trig-a", "A", NOW), createArcTrigger("trig-b", "B", NOW)];
  const pruned = pruneActiveTriggerList(["trig-a", "trig-deleted", "trig-b"], triggers);
  assert.deepEqual(pruned, ["trig-a", "trig-b"]);
});

// --- Generators produce unique, non-empty, prefixed ids ---

test("the three id generators each produce unique, distinctly-prefixed, non-empty ids", () => {
  const exerciseId = generateArcSavedExerciseId();
  const optionId = generateArcSavedBodyOptionId();
  const triggerId = generateArcTriggerId();
  assert.ok(exerciseId.startsWith("arc-saved-exercise-"));
  assert.ok(optionId.startsWith("arc-saved-body-option-"));
  assert.ok(triggerId.startsWith("arc-trigger-"));
  assert.notEqual(generateArcSavedExerciseId(), exerciseId, "two calls must never collide");
});

// --- updateArcTrigger's null-handling (regression for the earlier description-trim bug) ---

test("updateArcTrigger: an empty/whitespace-only description patch normalizes to null, never an empty string; omitting the patch key leaves the existing description untouched", () => {
  const trigger = createArcTrigger(generateArcTriggerId(), "trigger", NOW);
  const withDescription = updateArcTrigger(trigger, { description: "  תיאור  " }, NOW);
  assert.equal(withDescription.description, "תיאור");
  const cleared = updateArcTrigger(withDescription, { description: "   " }, LATER);
  assert.equal(cleared.description, null);
  const unspecified = updateArcTrigger(cleared, { label: "renamed" }, NOW);
  assert.equal(unspecified.description, null);
  assert.equal(unspecified.label, "renamed");
});

test("updateArcSavedExercise/updateArcSavedBodyOption trim a patched label but leave an unspecified one untouched", () => {
  const exercise = createArcSavedExercise(generateArcSavedExerciseId(), "label", sampleSnapshot(), "full", null, NOW);
  const renamed = updateArcSavedExercise(exercise, { label: "  new name  " }, LATER);
  assert.equal(renamed.label, "new name");
  const untouchedSnapshot = updateArcSavedExercise(exercise, {}, LATER);
  assert.equal(untouchedSnapshot.label, "label");
  assert.deepEqual(untouchedSnapshot.snapshot, exercise.snapshot);

  const option: ArcSavedBodyOption = createArcSavedBodyOption(generateArcSavedBodyOptionId(), "label", sampleSnapshot(), null, NOW);
  const renamedOption = updateArcSavedBodyOption(option, { label: "  renamed  " }, LATER);
  assert.equal(renamedOption.label, "renamed");
});

test("markArcSavedExerciseUsed only ever sets lastUsedAt -- it never touches the snapshot or label", () => {
  const exercise: ArcSavedExercise = createArcSavedExercise(generateArcSavedExerciseId(), "label", sampleSnapshot(), "full", null, NOW);
  const used = markArcSavedExerciseUsed(exercise, LATER);
  assert.equal(used.lastUsedAt, LATER);
  assert.deepEqual(used.snapshot, exercise.snapshot);
  assert.equal(used.label, exercise.label);
});
