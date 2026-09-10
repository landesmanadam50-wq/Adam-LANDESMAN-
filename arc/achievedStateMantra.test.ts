import test from "node:test";
import assert from "node:assert/strict";

import { getAchievedStateMantraLine } from "./achievedStateMantra.ts";
import type { AchievedStateMantra } from "./lifeManifest.ts";

function mantra(overrides: Partial<AchievedStateMantra> = {}): AchievedStateMantra {
  return { text: null, tense: "present", enabled: false, ...overrides };
}

test("getAchievedStateMantraLine returns null when disabled, even with text set", () => {
  assert.equal(getAchievedStateMantraLine(mantra({ enabled: false, text: "אני מוזיקאי" })), null);
});

test("getAchievedStateMantraLine returns null when enabled but text is null", () => {
  assert.equal(getAchievedStateMantraLine(mantra({ enabled: true, text: null })), null);
});

test("getAchievedStateMantraLine returns null when enabled but text is blank/whitespace", () => {
  assert.equal(getAchievedStateMantraLine(mantra({ enabled: true, text: "   " })), null);
});

test("getAchievedStateMantraLine frames present tense as an existing identity", () => {
  const line = getAchievedStateMantraLine(mantra({ enabled: true, text: "אני מוזיקאי מצליח", tense: "present" }));
  assert.equal(line, 'מי שאתה כבר: "אני מוזיקאי מצליח".');
});

test("getAchievedStateMantraLine frames past tense as an achieved milestone", () => {
  const line = getAchievedStateMantraLine(mantra({ enabled: true, text: "השגתי מאה אלף עוקבים", tense: "past" }));
  assert.equal(line, 'מה שהשגת: "השגתי מאה אלף עוקבים".');
});

test("getAchievedStateMantraLine quotes the trainee's text as-is, never rewriting it to match the chosen tense", () => {
  const line = getAchievedStateMantraLine(mantra({ enabled: true, text: "אני אצליח", tense: "past" }));
  assert.ok(line && line.includes('"אני אצליח"'), "the original text is quoted verbatim");
});

test("getAchievedStateMantraLine trims surrounding whitespace from the trainee's text", () => {
  const line = getAchievedStateMantraLine(mantra({ enabled: true, text: "  אני מוזיקאי  ", tense: "present" }));
  assert.equal(line, 'מי שאתה כבר: "אני מוזיקאי".');
});
