import test from "node:test";
import assert from "node:assert/strict";

import {
  applyConfiguredSelectionForState,
  createEmptyCombinedInterferenceSelection,
  dedupeItemIdsPreservingOrder,
  generateCombinedInterferenceSelectionId,
  normalizeCombinedInterferenceSelection,
  resolveCombinedInterferenceSelectionForState,
  upsertCombinedInterferenceSelectionInList,
} from "./combinedInterferenceSelection.ts";
import type { CombinedInterferenceSelection } from "./combinedInterferenceSelection.ts";
import { archiveLibraryItem, disableLibraryItem } from "./libraryItemStatus.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-02T00:00:00.000Z";

function selection(overrides: Partial<CombinedInterferenceSelection> = {}): CombinedInterferenceSelection {
  return { ...createEmptyCombinedInterferenceSelection("sel1", "state1", "prog1", NOW), ...overrides };
}

// --- Create / defaults ---

test("createEmptyCombinedInterferenceSelection produces an empty configuredItemIds, presenceEnabled false, status enabled", () => {
  const s = createEmptyCombinedInterferenceSelection("sel1", "state1", "prog1", NOW);
  assert.equal(s.id, "sel1");
  assert.equal(s.stateProfileId, "state1");
  assert.equal(s.ownerProgramId, "prog1");
  assert.deepEqual(s.configuredItemIds, []);
  assert.equal(s.presenceEnabled, false);
  assert.equal(s.status, "enabled");
  assert.equal(s.schemaVersion, 1);
  assert.equal(s.createdAt, NOW);
  assert.equal(s.updatedAt, NOW);
});

test("generateCombinedInterferenceSelectionId produces distinct ids", () => {
  assert.notEqual(generateCombinedInterferenceSelectionId(), generateCombinedInterferenceSelectionId());
});

// --- dedupeItemIdsPreservingOrder ---

test("dedupeItemIdsPreservingOrder removes duplicates, first-occurrence-wins, preserving order", () => {
  assert.deepEqual(dedupeItemIdsPreservingOrder(["a", "b", "a", "c", "b"]), ["a", "b", "c"]);
});

test("dedupeItemIdsPreservingOrder handles an empty list", () => {
  assert.deepEqual(dedupeItemIdsPreservingOrder([]), []);
});

// --- Create / Read / Update via upsertCombinedInterferenceSelectionInList ---

test("upsertCombinedInterferenceSelectionInList appends a new selection when its id isn't in the list yet", () => {
  const result = upsertCombinedInterferenceSelectionInList([], selection());
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "sel1");
});

test("upsertCombinedInterferenceSelectionInList updates the one matching selection in place, leaving every other row untouched", () => {
  const other = selection({ id: "sel2", stateProfileId: "state2" });
  const updated = selection({ configuredItemIds: ["item1"] });
  const result = upsertCombinedInterferenceSelectionInList([other, selection()], updated);
  assert.equal(result.length, 2);
  assert.equal(result[0], other, "the untouched row is the exact same object");
  assert.deepEqual(result[1].configuredItemIds, ["item1"]);
});

// --- One-per-State invariant ---

test("resolveCombinedInterferenceSelectionForState returns null when none exists yet", () => {
  assert.equal(resolveCombinedInterferenceSelectionForState([], "state1"), null);
});

test("resolveCombinedInterferenceSelectionForState finds the one matching, non-archived selection", () => {
  const s = selection();
  assert.equal(resolveCombinedInterferenceSelectionForState([s], "state1"), s);
});

test("resolveCombinedInterferenceSelectionForState excludes an archived selection for that State", () => {
  const archived = archiveLibraryItem(selection(), LATER);
  assert.equal(resolveCombinedInterferenceSelectionForState([archived], "state1"), null);
});

test("resolveCombinedInterferenceSelectionForState never matches a selection for a different State", () => {
  const s = selection({ stateProfileId: "state2" });
  assert.equal(resolveCombinedInterferenceSelectionForState([s], "state1"), null);
});

test("applyConfiguredSelectionForState creates a new selection when none exists for the State", () => {
  const result = applyConfiguredSelectionForState([], "state1", ["item1", "item2"], true, "prog1", NOW, () => "generated-id");
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "generated-id");
  assert.equal(result[0].stateProfileId, "state1");
  assert.deepEqual(result[0].configuredItemIds, ["item1", "item2"]);
  assert.equal(result[0].presenceEnabled, true);
});

test("applyConfiguredSelectionForState updates the SAME existing record for that State rather than creating a second one", () => {
  const existing = selection({ configuredItemIds: ["item1"], presenceEnabled: false });
  const result = applyConfiguredSelectionForState([existing], "state1", ["item1", "item2"], true, "prog1", LATER, () => "should-not-be-used");
  assert.equal(result.length, 1, "still exactly one record for this State -- never a duplicate");
  assert.equal(result[0].id, "sel1", "the original id is preserved, never regenerated");
  assert.deepEqual(result[0].configuredItemIds, ["item1", "item2"]);
  assert.equal(result[0].presenceEnabled, true);
  assert.equal(result[0].updatedAt, LATER);
});

test("applyConfiguredSelectionForState dedupes configuredItemIds", () => {
  const result = applyConfiguredSelectionForState([], "state1", ["a", "b", "a"], false, null, NOW, () => "id1");
  assert.deepEqual(result[0].configuredItemIds, ["a", "b"]);
});

test("applyConfiguredSelectionForState never mutates the input list", () => {
  const original = [selection()];
  const originalCopy = JSON.parse(JSON.stringify(original));
  applyConfiguredSelectionForState(original, "state1", ["item9"], true, "prog1", LATER);
  assert.deepEqual(original, originalCopy);
});

// --- Status transitions (via the shared generic policy) ---

test("archiveLibraryItem/disableLibraryItem never delete a CombinedInterferenceSelection from a list", () => {
  const s = selection();
  const archived = archiveLibraryItem(s, LATER);
  const list = upsertCombinedInterferenceSelectionInList([s], archived);
  assert.equal(list.length, 1);
  assert.equal(list[0].status, "archived");
  const disabled = disableLibraryItem(s, LATER);
  assert.equal(disabled.status, "disabled");
  assert.equal(disabled.id, "sel1");
});

// --- Safe defaults / normalize ---

test("normalizeCombinedInterferenceSelection backfills missing fields safely and dedupes configuredItemIds", () => {
  const { presenceEnabled, status, schemaVersion, ...legacyShape } = selection({ configuredItemIds: ["a", "a", "b"] });
  const normalized = normalizeCombinedInterferenceSelection(legacyShape as CombinedInterferenceSelection);
  assert.equal(normalized.presenceEnabled, false);
  assert.equal(normalized.status, "enabled");
  assert.equal(normalized.schemaVersion, 1);
  assert.deepEqual(normalized.configuredItemIds, ["a", "b"]);
});

test("normalizeCombinedInterferenceSelection never overwrites an already-configured field", () => {
  const configured = selection({ presenceEnabled: true, status: "archived", schemaVersion: 3 });
  const normalized = normalizeCombinedInterferenceSelection(configured);
  assert.equal(normalized.presenceEnabled, true);
  assert.equal(normalized.status, "archived");
  assert.equal(normalized.schemaVersion, 3);
});

// --- Serialization round trip ---

test("a CombinedInterferenceSelection survives a JSON.stringify/parse round trip with its configuredItemIds and status intact", () => {
  const archived = archiveLibraryItem(selection({ configuredItemIds: ["item1", "item2"], presenceEnabled: true }), LATER);
  const roundTripped = JSON.parse(JSON.stringify(archived)) as CombinedInterferenceSelection;
  const normalized = normalizeCombinedInterferenceSelection(roundTripped);
  assert.equal(normalized.status, "archived");
  assert.deepEqual(normalized.configuredItemIds, ["item1", "item2"]);
  assert.equal(normalized.presenceEnabled, true);
});
