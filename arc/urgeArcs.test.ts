import test from "node:test";
import assert from "node:assert/strict";

import {
  buildUrgeArcFromDraft,
  createEmptyUrgeArcDraft,
  deleteUrgeArcFromList,
  draftFromUrgeArc,
  duplicateUrgeArc,
  isUrgeArcDraftComplete,
  normalizeUrgeArc,
  upsertUrgeArcInList,
} from "./urgeArcs.ts";
import type { UrgeArcDraft } from "./urgeArcs.ts";
import { createEmptyUrgeArc } from "./types.ts";
import type { UrgeArc } from "./types.ts";

function urgeArc(overrides: Partial<UrgeArc> = {}): UrgeArc {
  return {
    ...createEmptyUrgeArc("u1", "דחף לעישון", "2024-01-01T00:00:00.000Z"),
    interferingAction: "להדליק סיגריה",
    regulationAnchor: "נשימה עמוקה",
    beneficialAlternativeAction: "לשתות מים",
    ...overrides,
  };
}

// --- upsertUrgeArcInList / deleteUrgeArcFromList / duplicateUrgeArc --
// mirrors arc/arcGoals.test.ts's own coverage of the identical pattern.

test("upsertUrgeArcInList appends a new UrgeArc when its id isn't in the list yet", () => {
  const result = upsertUrgeArcInList([], urgeArc());
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "u1");
});

test("upsertUrgeArcInList updates the one matching UrgeArc in place, leaving every other row's own object untouched", () => {
  const other = urgeArc({ id: "u2", name: "אחר" });
  const original = urgeArc({ name: "ישן" });
  const updated = urgeArc({ name: "חדש" });
  const result = upsertUrgeArcInList([other, original], updated);
  assert.equal(result.length, 2);
  assert.equal(result[0], other, "the untouched row is the exact same object, never copied/rebuilt");
  assert.equal(result[1].name, "חדש");
});

test("upsertUrgeArcInList never reorders the rest of the list", () => {
  const a = urgeArc({ id: "a" });
  const b = urgeArc({ id: "b" });
  const c = urgeArc({ id: "c" });
  const result = upsertUrgeArcInList([a, b, c], urgeArc({ id: "b", name: "עודכן" }));
  assert.deepEqual(
    result.map((u) => u.id),
    ["a", "b", "c"]
  );
});

test("deleteUrgeArcFromList removes exactly the one matching row", () => {
  const a = urgeArc({ id: "a" });
  const b = urgeArc({ id: "b" });
  const result = deleteUrgeArcFromList([a, b], "a");
  assert.deepEqual(
    result.map((u) => u.id),
    ["b"]
  );
});

test("deleteUrgeArcFromList is a no-op for an id that doesn't match any row", () => {
  const a = urgeArc({ id: "a" });
  const result = deleteUrgeArcFromList([a], "nonexistent");
  assert.equal(result.length, 1);
  assert.equal(result[0], a);
});

test("duplicateUrgeArc produces an independent copy under a new id, with a '(עותק)' suffix on the name", () => {
  const original = urgeArc({ name: "דחף לעישון" });
  const copy = duplicateUrgeArc(original, "2024-06-01T00:00:00.000Z");
  assert.equal(copy.name, "דחף לעישון (עותק)");
  assert.equal(copy.createdAt, "2024-06-01T00:00:00.000Z");
  assert.equal(copy.updatedAt, "2024-06-01T00:00:00.000Z");
  assert.notEqual(copy.id, original.id);
});

test("duplicateUrgeArc copies mappedTriggers/underlyingNeeds by value, never by reference", () => {
  const original = urgeArc({ mappedTriggers: ["לחץ"], underlyingNeeds: ["רגיעה"] });
  const copy = duplicateUrgeArc(original, "2024-06-01T00:00:00.000Z");
  assert.deepEqual(copy.mappedTriggers, ["לחץ"]);
  assert.notEqual(copy.mappedTriggers, original.mappedTriggers, "a fresh array, not the same reference");
  copy.mappedTriggers.push("טריגר חדש");
  assert.deepEqual(original.mappedTriggers, ["לחץ"], "mutating the copy's array never touches the original");
});

test("duplicateUrgeArc never mutates the original", () => {
  const original = urgeArc();
  const snapshot = JSON.parse(JSON.stringify(original));
  duplicateUrgeArc(original, "2024-06-01T00:00:00.000Z");
  assert.deepEqual(original, snapshot);
});

test("createEmptyUrgeArc starts with every optional field at its own empty/null default", () => {
  const u = createEmptyUrgeArc("id1", "שם", "2024-01-01T00:00:00.000Z");
  assert.equal(u.interferingAction, "");
  assert.deepEqual(u.mappedTriggers, []);
  assert.deepEqual(u.underlyingNeeds, []);
  assert.equal(u.stopCue, null);
  assert.equal(u.regulationAnchor, "");
  assert.equal(u.acceptanceContent, null);
  assert.equal(u.beneficialAlternativeAction, "");
  assert.equal(u.representationPreference, null, "Representation-based Urge Encoding task: defaults to 'decide in LIVE' (null)");
  assert.equal(u.visualEncodingAction, null);
  assert.equal(u.alternativeDesiredImage, null);
  assert.equal(u.bodilyEncodingAction, null);
  assert.equal(u.desiredBodilySensation, null);
  assert.equal(u.primaryMiniArcEncodingAction, null);
  assert.equal(u.secondaryMiniArcEncodingAction, null);
});

// --- Representation-based Urge Encoding task: backward-compatible
// normalization (test #13 from the modular-ARC spec: "existing older
// urge program without new fields").

test("normalizeUrgeArc backfills every representation-related field to null for an urge saved before this task existed", () => {
  const legacyUrgeArc = createEmptyUrgeArc("id1", "דחף ישן", "2023-01-01T00:00:00.000Z");
  // Simulate a genuinely legacy record: strip the new fields entirely,
  // as JSON.parse would for anything saved before this task existed.
  const { representationPreference, visualEncodingAction, alternativeDesiredImage, bodilyEncodingAction, desiredBodilySensation, primaryMiniArcEncodingAction, secondaryMiniArcEncodingAction, ...legacyShape } = legacyUrgeArc;
  const normalized = normalizeUrgeArc(legacyShape as UrgeArc);
  assert.equal(normalized.representationPreference, null);
  assert.equal(normalized.visualEncodingAction, null);
  assert.equal(normalized.alternativeDesiredImage, null);
  assert.equal(normalized.bodilyEncodingAction, null);
  assert.equal(normalized.desiredBodilySensation, null);
  assert.equal(normalized.primaryMiniArcEncodingAction, null);
  assert.equal(normalized.secondaryMiniArcEncodingAction, null);
});

test("normalizeUrgeArc never overwrites an already-configured representation field", () => {
  const urgeArc: UrgeArc = {
    ...createEmptyUrgeArc("id1", "דחף", "2024-01-01T00:00:00.000Z"),
    representationPreference: "visual",
    visualEncodingAction: "להקטין את התמונה",
  };
  const normalized = normalizeUrgeArc(urgeArc);
  assert.equal(normalized.representationPreference, "visual");
  assert.equal(normalized.visualEncodingAction, "להקטין את התמונה");
});

// --- Draft/validation pattern -- mirrors arc/miniArc.ts's own
// MiniArcDraft/isMiniArcDraftComplete/buildMiniArcFromDraft coverage.

test("isUrgeArcDraftComplete requires name/interferingAction/regulationAnchor/beneficialAlternativeAction, leaving mappedTriggers/underlyingNeeds/stopCue/acceptanceContent optional", () => {
  const complete: UrgeArcDraft = {
    ...createEmptyUrgeArcDraft(),
    name: "דחף",
    interferingAction: "פעולה",
    regulationAnchor: "עוגן",
    beneficialAlternativeAction: "פעולה מיטיבה",
  };
  assert.equal(isUrgeArcDraftComplete(complete), true, "the four required fields alone are enough -- everything else stays optional");
  assert.equal(isUrgeArcDraftComplete({ ...complete, name: "" }), false);
  assert.equal(isUrgeArcDraftComplete({ ...complete, interferingAction: "  " }), false, "whitespace-only doesn't count as filled in");
  assert.equal(isUrgeArcDraftComplete({ ...complete, regulationAnchor: "" }), false);
  assert.equal(isUrgeArcDraftComplete({ ...complete, beneficialAlternativeAction: "" }), false);
});

test("createEmptyUrgeArcDraft is never itself complete", () => {
  assert.equal(isUrgeArcDraftComplete(createEmptyUrgeArcDraft()), false);
});

test("buildUrgeArcFromDraft splits comma-separated mappedTriggers/underlyingNeeds into trimmed, non-empty arrays", () => {
  const draft: UrgeArcDraft = {
    name: "דחף",
    interferingAction: "פעולה",
    mappedTriggers: "לחץ,  שעת הפסקה ,,",
    underlyingNeeds: "רגיעה, הפוגה",
    stopCue: "",
    regulationAnchor: "עוגן",
    acceptanceContent: "",
    bodyLanguageCue: "",
    encodingMantra: "",
    beneficialAlternativeAction: "פעולה מיטיבה",
  };
  const built = buildUrgeArcFromDraft(draft, "u1", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");
  assert.deepEqual(built.mappedTriggers, ["לחץ", "שעת הפסקה"]);
  assert.deepEqual(built.underlyingNeeds, ["רגיעה", "הפוגה"]);
});

test("buildUrgeArcFromDraft converts blank optional fields (stopCue/acceptanceContent) to null, never an empty string", () => {
  const draft: UrgeArcDraft = {
    name: "דחף",
    interferingAction: "פעולה",
    mappedTriggers: "",
    underlyingNeeds: "",
    stopCue: "   ",
    regulationAnchor: "עוגן",
    acceptanceContent: "",
    bodyLanguageCue: "",
    encodingMantra: "",
    beneficialAlternativeAction: "פעולה מיטיבה",
  };
  const built = buildUrgeArcFromDraft(draft, "u1", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");
  assert.equal(built.stopCue, null);
  assert.equal(built.acceptanceContent, null);
  assert.deepEqual(built.mappedTriggers, []);
  assert.deepEqual(built.underlyingNeeds, []);
});

test("buildUrgeArcFromDraft throws for an incomplete draft -- defense in depth, callers must gate on isUrgeArcDraftComplete first", () => {
  assert.throws(() => buildUrgeArcFromDraft(createEmptyUrgeArcDraft(), "u1", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z"));
});

test("draftFromUrgeArc round-trips a real UrgeArc's fields back into editable text, joining arrays with ', '", () => {
  const real = urgeArc({ mappedTriggers: ["לחץ", "שעת הפסקה"], underlyingNeeds: ["רגיעה"], stopCue: "עצור", acceptanceContent: "זה בסדר" });
  const draft = draftFromUrgeArc(real);
  assert.equal(draft.mappedTriggers, "לחץ, שעת הפסקה");
  assert.equal(draft.underlyingNeeds, "רגיעה");
  assert.equal(draft.stopCue, "עצור");
  assert.equal(draft.acceptanceContent, "זה בסדר");
  assert.equal(draft.name, real.name);
  assert.equal(draft.interferingAction, real.interferingAction);
});
