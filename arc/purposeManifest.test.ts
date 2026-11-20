import test from "node:test";
import assert from "node:assert/strict";

import {
  composeFutureMantra,
  createDailyManifestSelection,
  createEmptyPurposeManifest,
  emptyDailyStartupSequenceState,
  emptyPurposeManifestRotationState,
  extractMantraSuffix,
  FOCUS_POINT_COLORS,
  FUTURE_MANTRA_PREFIX,
  generateFutureBehaviorId,
  generatePurposeManifestId,
  hasShownStartupSequenceToday,
  isDailySelectionCurrent,
  isPurposeManifestComplete,
  markStartupSequenceShown,
  normalizePurposeManifest,
  recordBehaviorShownForManifest,
  recordDailyActionTask,
  resolveEligibleManifests,
  resolveFocusPointColor,
  resolveNextBehaviorIndexForManifest,
  selectRandomManifestId,
  upsertPurposeManifestInList,
  type PurposeManifest,
} from "./purposeManifest.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function completeManifest(id: string): PurposeManifest {
  const manifest = createEmptyPurposeManifest(id, NOW);
  return {
    ...manifest,
    longTermGoal: "להיות מאמן אישי מקצועי",
    personalReason: "לעזור לאנשים להבין את עצמם",
    personalValue: "תרומה לאחרים",
    behaviors: [
      { ...manifest.behaviors[0], description: "להקשיב בתשומת לב", reason: "להבין את המתאמן" },
      { ...manifest.behaviors[1], description: "לשאול שאלות מדויקות", reason: "לעזור לגלות תובנות" },
      { ...manifest.behaviors[2], description: "להגיב בסבלנות", reason: "ליצור סביבה בטוחה" },
    ],
  };
}

test("generatePurposeManifestId and generateFutureBehaviorId produce distinct, prefixed ids", () => {
  assert.notEqual(generatePurposeManifestId(), generatePurposeManifestId());
  assert.match(generatePurposeManifestId(), /^purpose-manifest-/);
  assert.notEqual(generateFutureBehaviorId(), generateFutureBehaviorId());
  assert.match(generateFutureBehaviorId(), /^future-behavior-/);
});

test("createEmptyPurposeManifest starts every field blank, with exactly three distinct empty behaviors", () => {
  const manifest = createEmptyPurposeManifest("m1", NOW);
  assert.equal(manifest.longTermGoal, "");
  assert.equal(manifest.personalReason, "");
  assert.equal(manifest.personalValue, "");
  assert.equal(manifest.behaviors.length, 3);
  const ids = manifest.behaviors.map((b) => b.id);
  assert.equal(new Set(ids).size, 3, "the three behaviors must have distinct ids");
  for (const behavior of manifest.behaviors) {
    assert.equal(behavior.description, "");
    assert.equal(behavior.reason, "");
  }
});

test("Final Manifest & Startup Popup Updates task: createEmptyPurposeManifest also starts the three new optional fields blank", () => {
  const manifest = createEmptyPurposeManifest("m1", NOW);
  assert.equal(manifest.futureMantra, "");
  assert.equal(manifest.focusPointColor, "");
  assert.equal(manifest.futureBodyMovement, "");
});

test("composeFutureMantra always prefixes the user's own continuation with the fixed 'אני אצליח' opening, and extractMantraSuffix is its exact inverse", () => {
  const mantra = composeFutureMantra("להיות מאמן שמקשיב בתשומת לב");
  assert.equal(mantra, `${FUTURE_MANTRA_PREFIX} להיות מאמן שמקשיב בתשומת לב`);
  assert.ok(mantra.startsWith(FUTURE_MANTRA_PREFIX));
  assert.equal(extractMantraSuffix(mantra), "להיות מאמן שמקשיב בתשומת לב");
});

test("composeFutureMantra returns '' for a blank/whitespace-only continuation -- 'not set yet', never a bare dangling prefix", () => {
  assert.equal(composeFutureMantra(""), "");
  assert.equal(composeFutureMantra("   "), "");
  assert.equal(extractMantraSuffix(""), "");
});

test("FOCUS_POINT_COLORS is a fixed, non-empty palette where every option has a distinct id and a Hebrew label, and resolveFocusPointColor looks it up by id", () => {
  assert.ok(FOCUS_POINT_COLORS.length > 0);
  const ids = FOCUS_POINT_COLORS.map((option) => option.id);
  assert.equal(new Set(ids).size, ids.length, "every color id must be distinct");
  for (const option of FOCUS_POINT_COLORS) {
    assert.ok(option.labelHebrew.length > 0);
    assert.ok(/^#[0-9a-fA-F]{6}$/.test(option.hex));
  }
  const first = FOCUS_POINT_COLORS[0];
  assert.deepEqual(resolveFocusPointColor(first.id), first);
});

test("resolveFocusPointColor returns null for '' (not set) or any id no longer in the palette -- the visualization popup treats either as 'skip this step'", () => {
  assert.equal(resolveFocusPointColor(""), null);
  assert.equal(resolveFocusPointColor("not-a-real-color-id"), null);
});

test("normalizePurposeManifest backfills futureMantra/focusPointColor/futureBodyMovement with '' when a legacy record is missing them, without touching any other field", () => {
  const legacy = { ...createEmptyPurposeManifest("legacy-1", NOW), longTermGoal: "מטרה ישנה" } as unknown as Record<string, unknown>;
  delete legacy.futureMantra;
  delete legacy.focusPointColor;
  delete legacy.futureBodyMovement;

  const normalized = normalizePurposeManifest(legacy as unknown as PurposeManifest);
  assert.equal(normalized.futureMantra, "");
  assert.equal(normalized.focusPointColor, "");
  assert.equal(normalized.futureBodyMovement, "");
  assert.equal(normalized.longTermGoal, "מטרה ישנה", "every pre-existing field must survive untouched");
  assert.equal(normalized.id, "legacy-1");
});

test("normalizePurposeManifest leaves an already-complete modern record (with all three new fields already set) completely untouched", () => {
  const modern: PurposeManifest = { ...createEmptyPurposeManifest("m1", NOW), futureMantra: "אני אצליח X", focusPointColor: "blue", futureBodyMovement: "ישר בגב" };
  assert.deepEqual(normalizePurposeManifest(modern), modern);
});

test("isPurposeManifestComplete is unaffected by futureMantra/focusPointColor/futureBodyMovement -- a manifest saved before this task existed stays eligible for daily selection without them", () => {
  const complete = completeManifest("m1");
  assert.equal(complete.futureMantra, "");
  assert.equal(complete.focusPointColor, "");
  assert.equal(complete.futureBodyMovement, "");
  assert.equal(isPurposeManifestComplete(complete), true, "the original four questions plus three behaviors are still the ONLY eligibility criteria");
});

test("isPurposeManifestComplete is false if any of the four top-level questions is blank", () => {
  const complete = completeManifest("m1");
  assert.equal(isPurposeManifestComplete(complete), true);
  assert.equal(isPurposeManifestComplete({ ...complete, longTermGoal: "" }), false);
  assert.equal(isPurposeManifestComplete({ ...complete, personalReason: "   " }), false, "whitespace-only must not count as filled in");
  assert.equal(isPurposeManifestComplete({ ...complete, personalValue: "" }), false);
});

test("isPurposeManifestComplete is false if ANY of the three behaviors is missing its description or reason", () => {
  const complete = completeManifest("m1");
  const missingDescription = { ...complete, behaviors: [{ ...complete.behaviors[0], description: "" }, complete.behaviors[1], complete.behaviors[2]] as PurposeManifest["behaviors"] };
  assert.equal(isPurposeManifestComplete(missingDescription), false);
  const missingReason = { ...complete, behaviors: [complete.behaviors[0], { ...complete.behaviors[1], reason: "" }, complete.behaviors[2]] as PurposeManifest["behaviors"] };
  assert.equal(isPurposeManifestComplete(missingReason), false);
});

test("resolveEligibleManifests keeps only complete manifests, preserving order, never deleting the incomplete ones from the input", () => {
  const complete = completeManifest("m1");
  const incomplete = createEmptyPurposeManifest("m2", NOW);
  const eligible = resolveEligibleManifests([incomplete, complete]);
  assert.deepEqual(eligible.map((m) => m.id), ["m1"]);
});

test("upsertPurposeManifestInList inserts a new manifest and updates an existing one by id without touching any other manifest", () => {
  const m1 = completeManifest("m1");
  const m2 = completeManifest("m2");
  let list = upsertPurposeManifestInList([], m1);
  list = upsertPurposeManifestInList(list, m2);
  assert.equal(list.length, 2);
  const renamed = { ...m1, longTermGoal: "מטרה מעודכנת" };
  list = upsertPurposeManifestInList(list, renamed);
  assert.equal(list.length, 2);
  assert.equal(list.find((m) => m.id === "m1")?.longTermGoal, "מטרה מעודכנת");
  assert.equal(list.find((m) => m.id === "m2")?.longTermGoal, "להיות מאמן אישי מקצועי", "the other manifest must be untouched");
});

test("selectRandomManifestId returns null for an empty list, and the single id for a one-element list regardless of randomValue", () => {
  assert.equal(selectRandomManifestId([], 0.5), null);
  assert.equal(selectRandomManifestId(["only"], 0), "only");
  assert.equal(selectRandomManifestId(["only"], 0.999), "only");
});

test("selectRandomManifestId maps the full [0,1) range across all ids with equal-width slices", () => {
  const ids = ["a", "b", "c", "d"];
  assert.equal(selectRandomManifestId(ids, 0), "a");
  assert.equal(selectRandomManifestId(ids, 0.24), "a");
  assert.equal(selectRandomManifestId(ids, 0.26), "b");
  assert.equal(selectRandomManifestId(ids, 0.49), "b");
  assert.equal(selectRandomManifestId(ids, 0.51), "c");
  assert.equal(selectRandomManifestId(ids, 0.76), "d");
  assert.equal(selectRandomManifestId(ids, 0.999999), "d");
});

test("selectRandomManifestId clamps an out-of-range randomValue instead of throwing or returning undefined", () => {
  const ids = ["a", "b"];
  assert.equal(selectRandomManifestId(ids, -1), "a");
  assert.equal(selectRandomManifestId(ids, 1), "b");
  assert.equal(selectRandomManifestId(ids, 5), "b");
});

test("resolveNextBehaviorIndexForManifest starts at behavior 0 (the first) for a manifest never shown before", () => {
  const rotation = emptyPurposeManifestRotationState();
  assert.equal(resolveNextBehaviorIndexForManifest(rotation, "m1"), 0);
});

test("resolveNextBehaviorIndexForManifest rotates 0 -> 1 -> 2 -> 0 for ONE manifest, independent of any other manifest's own rotation", () => {
  let rotation = emptyPurposeManifestRotationState();
  let next = resolveNextBehaviorIndexForManifest(rotation, "m1");
  assert.equal(next, 0);
  rotation = recordBehaviorShownForManifest(rotation, "m1", next);

  next = resolveNextBehaviorIndexForManifest(rotation, "m1");
  assert.equal(next, 1);
  rotation = recordBehaviorShownForManifest(rotation, "m1", next);

  next = resolveNextBehaviorIndexForManifest(rotation, "m1");
  assert.equal(next, 2);
  rotation = recordBehaviorShownForManifest(rotation, "m1", next);

  next = resolveNextBehaviorIndexForManifest(rotation, "m1");
  assert.equal(next, 0, "must wrap back to the first behavior after the third");

  // A second manifest, never shown yet, still starts at 0 regardless of m1's own progress.
  assert.equal(resolveNextBehaviorIndexForManifest(rotation, "m2"), 0);
});

test("Startup-popup task: rotation progress survives across separate app launches -- simulated here by round-tripping the rotation state through JSON (the same serialization AsyncStorage persistence uses) between each 'launch', never resetting it", () => {
  let rotation = emptyPurposeManifestRotationState();

  // Launch 1: first time this manifest is shown.
  let next = resolveNextBehaviorIndexForManifest(rotation, "m1");
  assert.equal(next, 0);
  rotation = recordBehaviorShownForManifest(rotation, "m1", next);
  rotation = JSON.parse(JSON.stringify(rotation)); // simulates "the app closes, then reopens"

  // Launch 2: must continue from behavior 1, never restart at 0.
  next = resolveNextBehaviorIndexForManifest(rotation, "m1");
  assert.equal(next, 1, "closing and reopening the app must never reset the rotation");
  rotation = recordBehaviorShownForManifest(rotation, "m1", next);
  rotation = JSON.parse(JSON.stringify(rotation));

  // Launch 3.
  next = resolveNextBehaviorIndexForManifest(rotation, "m1");
  assert.equal(next, 2);
});

test("recordBehaviorShownForManifest only ever updates the named manifest's own entry", () => {
  let rotation = emptyPurposeManifestRotationState();
  rotation = recordBehaviorShownForManifest(rotation, "m1", 1);
  rotation = recordBehaviorShownForManifest(rotation, "m2", 2);
  assert.equal(rotation.lastBehaviorIndexByManifestId.m1, 1);
  assert.equal(rotation.lastBehaviorIndexByManifestId.m2, 2);
});

test("isDailySelectionCurrent is true only for a selection whose own dateLocal matches today", () => {
  const selection = createDailyManifestSelection("m1", 0, "2026-01-05");
  assert.equal(isDailySelectionCurrent(selection, "2026-01-05"), true);
  assert.equal(isDailySelectionCurrent(selection, "2026-01-06"), false, "yesterday's selection is stale on a new day");
  assert.equal(isDailySelectionCurrent(null, "2026-01-05"), false);
});

test("recordDailyActionTask sets only dailyActionTaskId, leaving the rest of the selection untouched", () => {
  const selection = createDailyManifestSelection("m1", 2, "2026-01-05");
  const updated = recordDailyActionTask(selection, "task-1");
  assert.equal(updated.dailyActionTaskId, "task-1");
  assert.equal(updated.manifestId, "m1");
  assert.equal(updated.behaviorIndex, 2);
  assert.equal(updated.dateLocal, "2026-01-05");
});

test("hasShownStartupSequenceToday / markStartupSequenceShown round-trip correctly across day transitions", () => {
  let state = emptyDailyStartupSequenceState();
  assert.equal(hasShownStartupSequenceToday(state, "2026-01-05"), false);
  state = markStartupSequenceShown("2026-01-05");
  assert.equal(hasShownStartupSequenceToday(state, "2026-01-05"), true);
  assert.equal(hasShownStartupSequenceToday(state, "2026-01-06"), false, "a new calendar day must show the sequence again");
});
