import test from "node:test";
import assert from "node:assert/strict";
import { buildAddictionSuccessMemory, scoreAddictionSuccessMemory, selectAddictionSuccessMemory } from "./arcAddictionMemory.ts";
import { createPositiveMemory, normalizePositiveMemory, resolvePositiveMemorySource } from "./positiveMemory.ts";
import type { PositiveMemory } from "./positiveMemory.ts";
import { recordPositiveMemorySelection } from "./positiveMemorySelectionHistory.ts";

const NOW = "2026-11-27T10:00:00.000Z";

test("a saved success moment is a regular 'success' Positive Memory tagged with its profile", () => {
  const memory = buildAddictionSuccessMemory("p1", "חיטוט באוזניים", "  התחושה בכפות הידיים עזרה  ", NOW, "m1");
  assert.equal(memory.eventType, "success");
  assert.equal(memory.title, "בחרתי שלא לפעול לפי הדחף · חיטוט באוזניים");
  assert.equal(memory.successDescription, "התחושה בכפות הידיים עזרה");
  assert.deepEqual(resolvePositiveMemorySource(memory), { kind: "arc_addiction", refId: "p1" });
});

test("an empty description still produces a meaningful memory", () => {
  assert.equal(buildAddictionSuccessMemory("p1", "x", "", NOW).successDescription, "בחרתי שלא לפעול לפי הדחף.");
});

test("backward compatible: memories saved before the source field load with no source", () => {
  const old = createPositiveMemory("old", "success", "ישן", NOW);
  delete (old as Partial<PositiveMemory>).source;
  const normalized = normalizePositiveMemory(old, NOW);
  assert.equal(resolvePositiveMemorySource(normalized), null);
  assert.equal(resolvePositiveMemorySource({ ...old, source: { kind: "other", refId: 3 } as unknown as PositiveMemory["source"] }), null);
});

test("only ARC Addiction success moments are eligible; this profile first", () => {
  const unrelated = createPositiveMemory("u", "success", "הצלחה במשימה", NOW);
  const otherProfile = buildAddictionSuccessMemory("p2", "גלילה", "", NOW, "o");
  const mine = buildAddictionSuccessMemory("p1", "חיטוט", "", NOW, "m");
  assert.equal(scoreAddictionSuccessMemory(unrelated, "p1"), 0);
  assert.equal(selectAddictionSuccessMemory([unrelated], "p1", []), null);
  assert.equal(selectAddictionSuccessMemory([unrelated, otherProfile], "p1", [])?.id, "o");
  assert.equal(selectAddictionSuccessMemory([unrelated, otherProfile, mine], "p1", [])?.id, "m");
});

test("a positive_feeling memory is never offered as a success", () => {
  const feeling = { ...buildAddictionSuccessMemory("p1", "x", "", NOW, "f"), eventType: "positive_feeling" as const };
  assert.equal(selectAddictionSuccessMemory([feeling], "p1", []), null);
});

test("rotation avoids repeating the last pick, and 'another' excludes shown ones", () => {
  const a = buildAddictionSuccessMemory("p1", "x", "", NOW, "a");
  const b = buildAddictionSuccessMemory("p1", "x", "", NOW, "b");
  const history = recordPositiveMemorySelection([], "a", "arc_addiction", "p1", NOW);
  for (let i = 0; i < 10; i += 1) assert.equal(selectAddictionSuccessMemory([a, b], "p1", history)?.id, "b");
  assert.equal(selectAddictionSuccessMemory([a, b], "p1", [], ["a", "b"]), null);
  assert.equal(selectAddictionSuccessMemory([a, b], "p1", [], ["a"])?.id, "b");
});
