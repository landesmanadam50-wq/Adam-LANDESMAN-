import test from "node:test";
import assert from "node:assert/strict";

import { containsInductionPattern } from "./instructions.ts";
import {
  getPredefinedPreparationSteps,
  getPreparationSourceLabel,
  getPreparationStepsForSource,
  getPreparationStepsForStateProfile,
  PREPARATION_STATE_IDS,
  PREPARATION_STATE_LABELS,
  resolvePreparationSource,
} from "./preparationStates.ts";
import { createEmptyStateProfile } from "./stateProfile.ts";

test("there are exactly 8 predefined preparation states, each with a Hebrew label", () => {
  assert.equal(PREPARATION_STATE_IDS.length, 8);
  for (const id of PREPARATION_STATE_IDS) {
    assert.ok(PREPARATION_STATE_LABELS[id].length > 0);
  }
});

test("every predefined state returns exactly 5 non-empty steps", () => {
  for (const id of PREPARATION_STATE_IDS) {
    const steps = getPredefinedPreparationSteps(id, "לפתוח את המחשב");
    assert.equal(steps.length, 5, `state ${id} must have exactly 5 steps`);
    for (const step of steps) assert.ok(step.trim().length > 0);
  }
});

test("every predefined state's final step imagines starting the configured first action, using the exact sanctioned phrasing", () => {
  for (const id of PREPARATION_STATE_IDS) {
    const steps = getPredefinedPreparationSteps(id, "לפתוח את המחשב");
    assert.match(steps[steps.length - 1], /^דמיין את עצמך מתחיל/);
    assert.ok(steps[steps.length - 1].includes("לפתוח את המחשב"));
  }
});

test("no generated line for ANY predefined state trips the safety denylist", () => {
  for (const id of PREPARATION_STATE_IDS) {
    const steps = getPredefinedPreparationSteps(id, "לפתוח את המחשב ולהתחיל לכתוב");
    for (const step of steps) {
      assert.equal(containsInductionPattern(step), false, `state ${id}'s step "${step}" must not trip the induction-pattern denylist`);
    }
  }
});

test("a blank firstAction still produces a safe, grammatical final step (never a dangling colon)", () => {
  const steps = getPredefinedPreparationSteps("focus", "");
  assert.ok(!steps[steps.length - 1].includes(": ."));
  assert.equal(containsInductionPattern(steps[steps.length - 1]), false);
});

test("getPreparationStepsForStateProfile reads only what the profile itself has authored -- a fully blank profile produces just the natural-breathing fallback plus the final imagery step, never invented content", () => {
  const blank = createEmptyStateProfile("sp1", "Blank", null, "2026-01-01T00:00:00.000Z");
  const steps = getPreparationStepsForStateProfile(blank, "התחלת המשימה");
  assert.equal(steps.length, 2, "only the natural-breathing fallback and the final imagery line, nothing invented");
  assert.match(steps[1], /^דמיין את עצמך מתחיל/);
});

test("getPreparationStepsForStateProfile includes the profile's own mantra/posture/regulation/action verbatim when authored", () => {
  const profile = {
    ...createEmptyStateProfile("sp1", "Confidence", null, "2026-01-01T00:00:00.000Z"),
    stateMantra: "אני יכול להתמודד עם זה",
    bodyLanguageCue: "גב ישר",
    regulationAnchor: "הנמכת כתפיים",
    action: "לפתוח את המסמך",
  };
  const steps = getPreparationStepsForStateProfile(profile, "לכתוב פסקה אחת");
  assert.ok(steps.includes("אני יכול להתמודד עם זה"));
  assert.ok(steps.includes("גב ישר"));
  assert.ok(steps.includes("הנמכת כתפיים"));
  assert.ok(steps.includes("לפתוח את המסמך"));
});

test("resolvePreparationSource resolves a predefined id, a saved StateProfile id, null for blank, and null for a deleted/unknown id", () => {
  const profile = createEmptyStateProfile("sp1", "המצב שלי", null, "2026-01-01T00:00:00.000Z");
  assert.deepEqual(resolvePreparationSource("focus", [profile]), { kind: "predefined", id: "focus" });
  assert.deepEqual(resolvePreparationSource("sp1", [profile]), { kind: "profile", profile });
  assert.equal(resolvePreparationSource(null, [profile]), null);
  assert.equal(resolvePreparationSource("sp-deleted", [profile]), null, "a since-deleted linked profile must never crash or invent a default");
});

test("resolvePreparationSource treats a disabled/archived StateProfile exactly like a deleted one -- never silently offered as if still active", () => {
  const disabled = { ...createEmptyStateProfile("sp1", "המצב שלי", null, "2026-01-01T00:00:00.000Z"), status: "disabled" as const };
  assert.equal(resolvePreparationSource("sp1", [disabled]), null);
  const archived = { ...createEmptyStateProfile("sp2", "המצב שלי", null, "2026-01-01T00:00:00.000Z"), status: "archived" as const };
  assert.equal(resolvePreparationSource("sp2", [archived]), null);
});

test("getPreparationStepsForSource/getPreparationSourceLabel dispatch correctly for both source kinds", () => {
  const profile = { ...createEmptyStateProfile("sp1", "המצב שלי", null, "2026-01-01T00:00:00.000Z"), stateMantra: "משפט אישי" };
  assert.equal(getPreparationSourceLabel({ kind: "predefined", id: "calm" }), PREPARATION_STATE_LABELS.calm);
  assert.equal(getPreparationSourceLabel({ kind: "profile", profile }), "המצב שלי");
  assert.deepEqual(getPreparationStepsForSource({ kind: "predefined", id: "calm" }, "פעולה"), getPredefinedPreparationSteps("calm", "פעולה"));
  assert.deepEqual(getPreparationStepsForSource({ kind: "profile", profile }, "פעולה"), getPreparationStepsForStateProfile(profile, "פעולה"));
});

test("getPreparationStepsForStateProfile only includes an energy-color line when the profile actually has one saved", () => {
  const withColor = { ...createEmptyStateProfile("sp1", "Energy", null, "2026-01-01T00:00:00.000Z"), energyColor: "כחול" };
  const withColorSteps = getPreparationStepsForStateProfile(withColor, "להתחיל");
  assert.ok(withColorSteps.some((line) => line.includes("כחול")));

  const withoutColor = createEmptyStateProfile("sp2", "NoColor", null, "2026-01-01T00:00:00.000Z");
  const withoutColorSteps = getPreparationStepsForStateProfile(withoutColor, "להתחיל");
  assert.ok(!withoutColorSteps.some((line) => line.includes("האנרגיה בצבע")));
});
