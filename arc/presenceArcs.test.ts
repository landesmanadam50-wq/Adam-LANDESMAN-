import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPresenceArcFromDraft,
  createEmptyPresenceArcDraft,
  deletePresenceArcFromList,
  draftFromPresenceArc,
  duplicatePresenceArc,
  isPresenceArcDraftComplete,
  normalizePresenceArc,
  upsertPresenceArcInList,
} from "./presenceArcs.ts";
import type { PresenceArcDraft } from "./presenceArcs.ts";
import { createEmptyPresenceArc } from "./types.ts";
import type { PresenceArc } from "./types.ts";

function presenceArc(overrides: Partial<PresenceArc> = {}): PresenceArc {
  return { ...createEmptyPresenceArc("p1", "נוכחות", "2024-01-01T00:00:00.000Z"), ...overrides };
}

// --- List CRUD ---

test("upsertPresenceArcInList updates the matching PresenceArc in place by id, never touching another", () => {
  const list = [presenceArc({ id: "a", name: "א" }), presenceArc({ id: "b", name: "ב" })];
  const updated = upsertPresenceArcInList(list, presenceArc({ id: "a", name: "א מעודכן" }));
  assert.equal(updated.find((p) => p.id === "a")!.name, "א מעודכן");
  assert.equal(updated.find((p) => p.id === "b")!.name, "ב");
  assert.equal(updated.length, 2);
});

test("upsertPresenceArcInList appends a new PresenceArc when the id doesn't match any existing one", () => {
  const list = [presenceArc({ id: "a" })];
  const updated = upsertPresenceArcInList(list, presenceArc({ id: "new" }));
  assert.equal(updated.length, 2);
});

test("deletePresenceArcFromList removes exactly the matching PresenceArc, leaving every other one untouched", () => {
  const a = presenceArc({ id: "a" });
  const b = presenceArc({ id: "b" });
  const updated = deletePresenceArcFromList([a, b], "a");
  assert.deepEqual(updated, [b]);
});

test("duplicatePresenceArc generates a new unique id, adjusts the name, and never mutates the original", () => {
  const original = presenceArc({ id: "orig", name: "נוכחות" });
  const copy = duplicatePresenceArc(original, "2024-06-01T00:00:00.000Z");
  assert.notEqual(copy.id, original.id);
  assert.equal(copy.name, "נוכחות (עותק)");
  assert.equal(original.name, "נוכחות");
});

// --- Draft ---

test("createEmptyPresenceArcDraft is never itself complete unless a name is filled in -- only name is required", () => {
  assert.equal(isPresenceArcDraftComplete(createEmptyPresenceArcDraft()), false);
  assert.equal(isPresenceArcDraftComplete({ ...createEmptyPresenceArcDraft(), name: "נוכחות" }), true);
});

test("isPresenceArcDraftComplete treats whitespace-only name as incomplete", () => {
  assert.equal(isPresenceArcDraftComplete({ ...createEmptyPresenceArcDraft(), name: "   " }), false);
});

test("buildPresenceArcFromDraft throws for an incomplete draft -- never silently saves a partial PresenceArc", () => {
  assert.throws(() => buildPresenceArcFromDraft(createEmptyPresenceArcDraft(), "p1", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z"));
});

test("buildPresenceArcFromDraft converts blank optional fields to null, never an empty string", () => {
  const draft: PresenceArcDraft = { ...createEmptyPresenceArcDraft(), name: "נוכחות" };
  const built = buildPresenceArcFromDraft(draft, "p1", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");
  assert.equal(built.presenceColor, null);
  assert.equal(built.presenceDwellSeconds, null);
});

test("buildPresenceArcFromDraft persists every filled-in field, trimmed", () => {
  const draft: PresenceArcDraft = { name: "  נוכחות  ", presenceColor: "  כחול  ", presenceDwellSeconds: "12" };
  const built = buildPresenceArcFromDraft(draft, "p1", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");
  assert.equal(built.name, "נוכחות");
  assert.equal(built.presenceColor, "כחול");
  assert.equal(built.presenceDwellSeconds, 12);
});

test("buildPresenceArcFromDraft ignores a non-numeric/zero/negative dwell duration, falling back to null rather than an invalid value", () => {
  for (const value of ["abc", "0", "-5", ""]) {
    const draft: PresenceArcDraft = { ...createEmptyPresenceArcDraft(), name: "נוכחות", presenceDwellSeconds: value };
    const built = buildPresenceArcFromDraft(draft, "p1", "2024-01-01T00:00:00.000Z", "2024-01-01T00:00:00.000Z");
    assert.equal(built.presenceDwellSeconds, null, `value "${value}" must not produce an invalid dwell`);
  }
});

test("draftFromPresenceArc round-trips a saved PresenceArc back into editable text", () => {
  const real = presenceArc({ presenceColor: "ירוק", presenceDwellSeconds: 20 });
  const draft = draftFromPresenceArc(real);
  assert.equal(draft.presenceColor, "ירוק");
  assert.equal(draft.presenceDwellSeconds, "20");
});

test("draftFromPresenceArc safely defaults a malformed/legacy record's missing fields to empty text rather than crashing", () => {
  const malformed = { id: "p1", name: "x", createdAt: "t", updatedAt: "t" } as unknown as PresenceArc;
  assert.doesNotThrow(() => draftFromPresenceArc(malformed));
  const draft = draftFromPresenceArc(malformed);
  assert.equal(draft.presenceColor, "");
  assert.equal(draft.presenceDwellSeconds, "");
});

// --- normalizePresenceArc (backward compatibility) ---

test("normalizePresenceArc backfills every field missing from a genuinely legacy record (JSON.parse'd, fields stripped) to null, never inventing content", () => {
  const full = presenceArc({ presenceColor: "x", presenceDwellSeconds: 10 });
  const { presenceColor, presenceDwellSeconds, ...legacyShape } = full;
  const normalized = normalizePresenceArc(legacyShape as PresenceArc);
  assert.equal(normalized.presenceColor, null);
  assert.equal(normalized.presenceDwellSeconds, null);
});

test("normalizePresenceArc never overwrites an already-configured field", () => {
  const configured = presenceArc({ presenceColor: "סגול", presenceDwellSeconds: 15 });
  const normalized = normalizePresenceArc(configured);
  assert.equal(normalized.presenceColor, "סגול");
  assert.equal(normalized.presenceDwellSeconds, 15);
});

test("a JSON round trip (JSON.stringify then JSON.parse, exactly what data/storage.ts does) preserves every field intact", () => {
  const original = presenceArc({ presenceColor: "x", presenceDwellSeconds: 10 });
  const roundTripped = JSON.parse(JSON.stringify(original)) as PresenceArc;
  assert.deepEqual(roundTripped, original);
});
