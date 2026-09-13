import test from "node:test";
import assert from "node:assert/strict";

import {
  buildThoughtArcFromDraft,
  createEmptyThoughtArcDraft,
  deleteThoughtArcFromList,
  draftFromThoughtArc,
  duplicateThoughtArc,
  isThoughtArcDraftComplete,
  normalizeThoughtArc,
  saveUsefulInsightToThoughtArc,
  upsertThoughtArcInList,
} from "./thoughtArcs.ts";
import type { ThoughtArcDraft } from "./thoughtArcs.ts";
import { createEmptyThoughtArc } from "./types.ts";
import type { ThoughtArc } from "./types.ts";

function thoughtArc(overrides: Partial<ThoughtArc> = {}): ThoughtArc {
  return { ...createEmptyThoughtArc("t1", "מחשבה", "2024-01-01T00:00:00.000Z"), ...overrides };
}

// --- List CRUD ---

test("upsertThoughtArcInList updates the matching ThoughtArc in place by id, never touching another", () => {
  const list = [thoughtArc({ id: "a", name: "א" }), thoughtArc({ id: "b", name: "ב" })];
  const updated = upsertThoughtArcInList(list, thoughtArc({ id: "a", name: "א מעודכן" }));
  assert.equal(updated.find((t) => t.id === "a")!.name, "א מעודכן");
  assert.equal(updated.find((t) => t.id === "b")!.name, "ב");
  assert.equal(updated.length, 2);
});

test("upsertThoughtArcInList appends a new ThoughtArc when the id doesn't match any existing one", () => {
  const list = [thoughtArc({ id: "a" })];
  const updated = upsertThoughtArcInList(list, thoughtArc({ id: "new" }));
  assert.equal(updated.length, 2);
});

test("deleteThoughtArcFromList removes exactly the matching ThoughtArc, leaving every other one untouched", () => {
  const a = thoughtArc({ id: "a" });
  const b = thoughtArc({ id: "b" });
  const updated = deleteThoughtArcFromList([a, b], "a");
  assert.deepEqual(updated, [b]);
});

test("duplicateThoughtArc generates a new unique id, adjusts the name, and never mutates the original", () => {
  const original = thoughtArc({ id: "orig", name: "מחשבה" });
  const copy = duplicateThoughtArc(original, "2024-06-01T00:00:00.000Z");
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.name, "מחשבה (עותק)");
  assert.equal(original.name, "מחשבה");
});

// --- Draft ---

test("createEmptyThoughtArcDraft is never itself complete unless a name is filled in -- only name is required", () => {
  assert.equal(isThoughtArcDraftComplete(createEmptyThoughtArcDraft()), false);
  assert.equal(isThoughtArcDraftComplete({ ...createEmptyThoughtArcDraft(), name: "מחשבה" }), true);
});

test("isThoughtArcDraftComplete treats whitespace-only name as incomplete", () => {
  assert.equal(isThoughtArcDraftComplete({ ...createEmptyThoughtArcDraft(), name: "   " }), false);
});

test("buildThoughtArcFromDraft throws for an incomplete draft -- never silently saves a partial ThoughtArc", () => {
  assert.throws(() => buildThoughtArcFromDraft(createEmptyThoughtArcDraft(), "t1", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z"));
});

test("buildThoughtArcFromDraft converts blank optional fields to null, never an empty string", () => {
  const draft: ThoughtArcDraft = { ...createEmptyThoughtArcDraft(), name: "מחשבה" };
  const built = buildThoughtArcFromDraft(draft, "t1", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");
  assert.equal(built.currentThought, null);
  assert.equal(built.supportiveThought, null);
  assert.equal(built.usefulInsight, null);
  assert.equal(built.flexibleAttentionDwellSeconds, null);
});

test("buildThoughtArcFromDraft persists every filled-in field, trimmed", () => {
  const draft: ThoughtArcDraft = {
    ...createEmptyThoughtArcDraft(),
    name: "  מחשבה  ",
    defaultRoute: "disturbing",
    currentThought: "  אני אכשל  ",
    modalityPreference: "visual",
    timeOrientationPreference: "future",
    supportiveThought: "אני מוכן",
    usefulInsight: "אני יכול להתכונן",
    flexibleAttentionDwellSeconds: "12",
  };
  const built = buildThoughtArcFromDraft(draft, "t1", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");
  assert.equal(built.name, "מחשבה");
  assert.equal(built.currentThought, "אני אכשל");
  assert.equal(built.defaultRoute, "disturbing");
  assert.equal(built.modalityPreference, "visual");
  assert.equal(built.timeOrientationPreference, "future");
  assert.equal(built.supportiveThought, "אני מוכן");
  assert.equal(built.usefulInsight, "אני יכול להתכונן");
  assert.equal(built.flexibleAttentionDwellSeconds, 12);
});

test("buildThoughtArcFromDraft ignores a non-numeric/zero/negative dwell duration, falling back to null rather than an invalid value", () => {
  for (const value of ["abc", "0", "-5", ""]) {
    const draft: ThoughtArcDraft = { ...createEmptyThoughtArcDraft(), name: "מחשבה", flexibleAttentionDwellSeconds: value };
    const built = buildThoughtArcFromDraft(draft, "t1", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");
    assert.equal(built.flexibleAttentionDwellSeconds, null, `value "${value}" must not produce an invalid dwell`);
  }
});

test("draftFromThoughtArc round-trips a saved ThoughtArc back into editable text/preferences, and defaults preferences to 'decide_in_live' when unset (legacy)", () => {
  const real = thoughtArc({ currentThought: "אני אכשל", modalityPreference: null, defaultRoute: null, timeOrientationPreference: null });
  const draft = draftFromThoughtArc(real);
  assert.equal(draft.currentThought, "אני אכשל");
  assert.equal(draft.modalityPreference, "decide_in_live");
  assert.equal(draft.defaultRoute, "decide_in_live");
  assert.equal(draft.timeOrientationPreference, "decide_in_live");
});

test("draftFromThoughtArc safely defaults a malformed/legacy record's missing fields to empty text rather than crashing", () => {
  const malformed = { id: "t1", name: "x", createdAt: "t", updatedAt: "t" } as unknown as ThoughtArc;
  assert.doesNotThrow(() => draftFromThoughtArc(malformed));
  const draft = draftFromThoughtArc(malformed);
  assert.equal(draft.supportiveThought, "");
  assert.equal(draft.usefulInsight, "");
});

// --- normalizeThoughtArc (backward compatibility) ---

test("normalizeThoughtArc backfills every field missing from a genuinely legacy record (JSON.parse'd, fields stripped) to null, never inventing content", () => {
  const full = thoughtArc({ supportiveThought: "x", usefulInsight: "y" });
  const {
    defaultRoute,
    currentThought,
    modalityPreference,
    timeOrientationPreference,
    situationContext,
    associatedEmotion,
    stayMantra,
    acceptanceMantra,
    externalSoundAnchorEnabled,
    flexibleAttentionDwellSeconds,
    supportiveThought,
    usefulInsight,
    visualSupportiveImage,
    auditorySupportiveVoiceInstruction,
    encodingAnchor,
    gentleNodCue,
    futureInsight,
    shortAction,
    futureImageryDwellSeconds,
    ...legacyShape
  } = full;
  const normalized = normalizeThoughtArc(legacyShape as ThoughtArc);
  assert.equal(normalized.supportiveThought, null);
  assert.equal(normalized.usefulInsight, null);
  assert.equal(normalized.defaultRoute, null);
  assert.equal(normalized.externalSoundAnchorEnabled, null);
});

test("normalizeThoughtArc never overwrites an already-configured field", () => {
  const configured = thoughtArc({ supportiveThought: "מחשבה תומכת", usefulInsight: "תובנה" });
  const normalized = normalizeThoughtArc(configured);
  assert.equal(normalized.supportiveThought, "מחשבה תומכת");
  assert.equal(normalized.usefulInsight, "תובנה");
});

test("a JSON round trip (JSON.stringify then JSON.parse, exactly what data/storage.ts does) preserves every field intact", () => {
  const original = thoughtArc({ supportiveThought: "x", usefulInsight: "y", defaultRoute: "supportive", modalityPreference: "both" });
  const roundTripped = JSON.parse(JSON.stringify(original)) as ThoughtArc;
  assert.deepEqual(roundTripped, original);
});

// --- saveUsefulInsightToThoughtArc ---

test("saveUsefulInsightToThoughtArc records the trimmed insight and bumps updatedAt", () => {
  const arc = thoughtArc({ usefulInsight: null });
  const updated = saveUsefulInsightToThoughtArc(arc, "  אני יכול להתכונן  ", "2024-06-01T00:00:00.000Z");
  assert.equal(updated.usefulInsight, "אני יכול להתכונן");
  assert.equal(updated.updatedAt, "2024-06-01T00:00:00.000Z");
  assert.equal(arc.usefulInsight, null, "original object must be untouched");
});

test("saveUsefulInsightToThoughtArc never overwrites an existing insight with blank text", () => {
  const arc = thoughtArc({ usefulInsight: "תובנה קיימת" });
  const updated = saveUsefulInsightToThoughtArc(arc, "   ", "2024-06-01T00:00:00.000Z");
  assert.equal(updated.usefulInsight, "תובנה קיימת");
});
