import test from "node:test";
import assert from "node:assert/strict";

import {
  archiveLibraryItem,
  disableLibraryItem,
  isLibraryItemEnabled,
  listLibraryItemsForProgram,
  restoreLibraryItem,
  resolveEnabledLibraryItemsForProgram,
} from "./libraryItemStatus.ts";
import type { OwnedLibraryRecord } from "./libraryItemStatus.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-02T00:00:00.000Z";

function record(overrides: Partial<OwnedLibraryRecord> = {}): OwnedLibraryRecord {
  return { id: "r1", status: "enabled", updatedAt: NOW, ownerProgramId: "p1", ...overrides };
}

test("disableLibraryItem sets status to disabled and refreshes updatedAt, touching nothing else", () => {
  const result = disableLibraryItem(record(), LATER);
  assert.equal(result.status, "disabled");
  assert.equal(result.updatedAt, LATER);
  assert.equal(result.id, "r1");
  assert.equal(result.ownerProgramId, "p1");
});

test("archiveLibraryItem sets status to archived and refreshes updatedAt", () => {
  const result = archiveLibraryItem(record(), LATER);
  assert.equal(result.status, "archived");
  assert.equal(result.updatedAt, LATER);
});

test("restoreLibraryItem returns a disabled item to enabled", () => {
  const disabled = disableLibraryItem(record(), NOW);
  const restored = restoreLibraryItem(disabled, LATER);
  assert.equal(restored.status, "enabled");
});

test("restoreLibraryItem returns an archived item to enabled", () => {
  const archived = archiveLibraryItem(record(), NOW);
  const restored = restoreLibraryItem(archived, LATER);
  assert.equal(restored.status, "enabled");
});

test("isLibraryItemEnabled is true only for status 'enabled'", () => {
  assert.equal(isLibraryItemEnabled(record({ status: "enabled" })), true);
  assert.equal(isLibraryItemEnabled(record({ status: "disabled" })), false);
  assert.equal(isLibraryItemEnabled(record({ status: "archived" })), false);
});

test("listLibraryItemsForProgram returns every item owned by the program regardless of status", () => {
  const items = [
    record({ id: "a", ownerProgramId: "p1", status: "enabled" }),
    record({ id: "b", ownerProgramId: "p1", status: "archived" }),
    record({ id: "c", ownerProgramId: "p2", status: "enabled" }),
  ];
  const result = listLibraryItemsForProgram(items, "p1");
  assert.deepEqual(
    result.map((i) => i.id),
    ["a", "b"]
  );
});

test("resolveEnabledLibraryItemsForProgram filters by BOTH program ownership and enabled status", () => {
  const items = [
    record({ id: "a", ownerProgramId: "p1", status: "enabled" }),
    record({ id: "b", ownerProgramId: "p1", status: "disabled" }),
    record({ id: "c", ownerProgramId: "p1", status: "archived" }),
    record({ id: "d", ownerProgramId: "p2", status: "enabled" }),
  ];
  const result = resolveEnabledLibraryItemsForProgram(items, "p1");
  assert.deepEqual(
    result.map((i) => i.id),
    ["a"]
  );
});

test("archiving an item never rewrites another item's own status (program archival must not cascade)", () => {
  const a = record({ id: "a", status: "enabled" });
  const b = record({ id: "b", status: "enabled" });
  const archivedA = archiveLibraryItem(a, LATER);
  assert.equal(b.status, "enabled", "b is never touched by archiving a -- these are pure, single-item functions with no list side effects");
  assert.equal(archivedA.status, "archived");
});
