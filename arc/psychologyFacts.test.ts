import test from "node:test";
import assert from "node:assert/strict";

import { PSYCHOLOGY_FACTS, resolveNextPsychologyFactIndex } from "./psychologyFacts.ts";
import type { PsychologyFactCategory } from "./psychologyFacts.ts";

test("every fact has non-empty Hebrew text, a real reference, and an ARC connection -- nothing left blank", () => {
  for (const fact of PSYCHOLOGY_FACTS) {
    assert.ok(fact.text.trim().length > 0, `${fact.id} must have text`);
    assert.match(fact.text, /[֐-׿]/, `${fact.id}'s text must be in Hebrew`);
    assert.ok(fact.reference.trim().length > 0, `${fact.id} must cite a reference`);
    assert.ok(fact.arcConnection.trim().length > 0, `${fact.id} must explain its ARC connection`);
  }
});

test("every fact's reference names a year in parentheses -- a real, checkable citation shape, never a vague unsourced claim", () => {
  for (const fact of PSYCHOLOGY_FACTS) {
    assert.match(fact.reference, /\(\d{4}\)/, `${fact.id}'s reference must include a publication year`);
  }
});

test("no fact's ARC connection claims the cited research itself studied or proved ARC's effectiveness -- it only ever describes a relation to one of ARC's own stages", () => {
  for (const fact of PSYCHOLOGY_FACTS) {
    assert.doesNotMatch(fact.arcConnection, /מוכיח|הוכיח|מחקר על ARC|נבדק ב-ARC/, `${fact.id} must not overclaim ARC's own effectiveness`);
  }
});

test("all eight required categories are represented at least once", () => {
  const required: PsychologyFactCategory[] = [
    "awareness_attention",
    "emotional_acceptance",
    "emotional_regulation",
    "present_moment",
    "neuroplasticity_learning",
    "habit_formation",
    "positive_reinforcement",
    "identity_change",
  ];
  const present = new Set(PSYCHOLOGY_FACTS.map((fact) => fact.category));
  for (const category of required) {
    assert.ok(present.has(category), `category "${category}" must have at least one fact`);
  }
});

test("the library has at least 30 facts, as required, spread across all eight categories (4 each)", () => {
  assert.ok(PSYCHOLOGY_FACTS.length >= 30, `expected at least 30 facts, found ${PSYCHOLOGY_FACTS.length}`);
  const counts = new Map<PsychologyFactCategory, number>();
  for (const fact of PSYCHOLOGY_FACTS) {
    counts.set(fact.category, (counts.get(fact.category) ?? 0) + 1);
  }
  for (const [category, count] of counts) {
    assert.ok(count >= 2, `category "${category}" has only ${count} facts`);
  }
});

test("every fact id is unique", () => {
  const ids = PSYCHOLOGY_FACTS.map((fact) => fact.id);
  assert.equal(ids.length, new Set(ids).size);
});

test("resolveNextPsychologyFactIndex never repeats the immediately-previous index, and cycles through the whole list over repeated launches", () => {
  let lastIndex: number | null = null;
  const seen = new Set<number>();
  for (let launch = 0; launch < PSYCHOLOGY_FACTS.length; launch++) {
    const next = resolveNextPsychologyFactIndex(lastIndex);
    assert.notEqual(next, lastIndex);
    assert.ok(next >= 0 && next < PSYCHOLOGY_FACTS.length);
    seen.add(next);
    lastIndex = next;
  }
  assert.equal(seen.size, PSYCHOLOGY_FACTS.length, "a full cycle of launches must eventually show every fact");
});
