import test from "node:test";
import assert from "node:assert/strict";

import {
  activateProgram,
  applyReactivationPlan,
  archiveProgram,
  findActiveProgram,
  hasAtMostOneActiveProgram,
  planReactivation,
} from "./activeProgramPolicy.ts";
import type { ProgramActivationRecord } from "./activeProgramPolicy.ts";

interface TestProgram extends ProgramActivationRecord {
  name: string;
  libraryItemStatuses: { id: string; enabled: boolean }[];
}

function program(overrides: Partial<TestProgram> = {}): TestProgram {
  return { id: "p1", name: "תוכנית", isActive: false, archivedAt: null, libraryItemStatuses: [], ...overrides };
}

test("hasAtMostOneActiveProgram: true for zero or one active record", () => {
  assert.equal(hasAtMostOneActiveProgram([]), true);
  assert.equal(hasAtMostOneActiveProgram([program({ id: "a", isActive: false })]), true);
  assert.equal(hasAtMostOneActiveProgram([program({ id: "a", isActive: true })]), true);
});

test("hasAtMostOneActiveProgram: false for two or more active records", () => {
  assert.equal(hasAtMostOneActiveProgram([program({ id: "a", isActive: true }), program({ id: "b", isActive: true })]), false);
});

test("findActiveProgram: returns the one active record, or null when none is active", () => {
  const active = program({ id: "b", isActive: true });
  assert.equal(findActiveProgram([program({ id: "a", isActive: false }), active, program({ id: "c", isActive: false })]), active);
  assert.equal(findActiveProgram([program({ id: "a", isActive: false })]), null);
  assert.equal(findActiveProgram([]), null);
});

test("archiveProgram: sets isActive false and archivedAt to `now`", () => {
  const result = archiveProgram(program({ isActive: true, archivedAt: null }), "2026-01-01T00:00:00.000Z");
  assert.equal(result.isActive, false);
  assert.equal(result.archivedAt, "2026-01-01T00:00:00.000Z");
});

test("archiveProgram: idempotent -- re-archiving an already-archived record never overwrites the original archivedAt", () => {
  const alreadyArchived = program({ isActive: false, archivedAt: "2025-06-01T00:00:00.000Z" });
  const result = archiveProgram(alreadyArchived, "2026-01-01T00:00:00.000Z");
  assert.equal(result.archivedAt, "2025-06-01T00:00:00.000Z", "the original archive timestamp must be preserved");
});

test("activateProgram: sets isActive true and clears archivedAt", () => {
  const result = activateProgram(program({ isActive: false, archivedAt: "2025-06-01T00:00:00.000Z" }));
  assert.equal(result.isActive, true);
  assert.equal(result.archivedAt, null);
});

test("planReactivation: archives the currently active program and activates the target", () => {
  const active = program({ id: "current", isActive: true });
  const target = program({ id: "target", isActive: false });
  const plan = planReactivation([active, target], "target", "2026-01-01T00:00:00.000Z");
  assert.ok(plan);
  assert.equal(plan!.toArchive!.id, "current");
  assert.equal(plan!.toArchive!.isActive, false);
  assert.equal(plan!.toArchive!.archivedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(plan!.toActivate.id, "target");
  assert.equal(plan!.toActivate.isActive, true);
  assert.equal(plan!.toActivate.archivedAt, null);
});

test("planReactivation: toArchive is null when no program was active", () => {
  const target = program({ id: "target", isActive: false });
  const plan = planReactivation([target], "target", "2026-01-01T00:00:00.000Z");
  assert.ok(plan);
  assert.equal(plan!.toArchive, null);
});

test("planReactivation: returns null for an unknown target id, never throws", () => {
  const plan = planReactivation([program({ id: "a" })], "does-not-exist", "2026-01-01T00:00:00.000Z");
  assert.equal(plan, null);
});

test("planReactivation: reactivating the already-active program is a safe no-op shape (toArchive null, toActivate re-affirms active)", () => {
  const alreadyActive = program({ id: "p1", isActive: true });
  const plan = planReactivation([alreadyActive], "p1", "2026-01-01T00:00:00.000Z");
  assert.ok(plan);
  assert.equal(plan!.toArchive, null, "a program is never its own 'currently active other program'");
  assert.equal(plan!.toActivate.isActive, true);
});

test("planReactivation: never touches an embedded library item's own enabled/disabled status (decision 5)", () => {
  const active = program({
    id: "current",
    isActive: true,
    libraryItemStatuses: [
      { id: "state-1", enabled: true },
      { id: "state-2", enabled: false },
    ],
  });
  const target = program({
    id: "target",
    isActive: false,
    libraryItemStatuses: [
      { id: "state-3", enabled: true },
      { id: "state-4", enabled: false },
    ],
  });
  const plan = planReactivation([active, target], "target", "2026-01-01T00:00:00.000Z");
  assert.ok(plan);
  assert.deepEqual(plan!.toArchive!.libraryItemStatuses, active.libraryItemStatuses, "archiving must never touch item-level statuses");
  assert.deepEqual(plan!.toActivate.libraryItemStatuses, target.libraryItemStatuses, "reactivation must restore exactly the previously-enabled subset, never force-enable everything");
});

test("applyReactivationPlan: replaces exactly the two affected records, leaves every other record untouched", () => {
  const active = program({ id: "current", isActive: true });
  const target = program({ id: "target", isActive: false });
  const untouched = program({ id: "other", isActive: false, name: "אחרת" });
  const plan = planReactivation([active, target, untouched], "target", "2026-01-01T00:00:00.000Z")!;
  const result = applyReactivationPlan([active, target, untouched], plan);

  assert.equal(result.length, 3);
  assert.equal(result.find((p) => p.id === "current")!.isActive, false);
  assert.equal(result.find((p) => p.id === "target")!.isActive, true);
  assert.deepEqual(result.find((p) => p.id === "other"), untouched, "a record not involved in the reactivation must be byte-identical");
});

test("applyReactivationPlan + hasAtMostOneActiveProgram: the invariant holds after every reactivation", () => {
  let programs = [program({ id: "a", isActive: true }), program({ id: "b", isActive: false }), program({ id: "c", isActive: false })];
  const plan1 = planReactivation(programs, "b", "2026-01-01T00:00:00.000Z")!;
  programs = applyReactivationPlan(programs, plan1);
  assert.equal(hasAtMostOneActiveProgram(programs), true);
  assert.equal(findActiveProgram(programs)!.id, "b");

  const plan2 = planReactivation(programs, "c", "2026-02-01T00:00:00.000Z")!;
  programs = applyReactivationPlan(programs, plan2);
  assert.equal(hasAtMostOneActiveProgram(programs), true);
  assert.equal(findActiveProgram(programs)!.id, "c");
  // "b" (archived in the second reactivation) must retain its own
  // history (name/libraryItemStatuses) even though it's no longer active.
  assert.equal(programs.find((p) => p.id === "b")!.isActive, false);
  assert.notEqual(programs.find((p) => p.id === "b")!.archivedAt, null);
});
