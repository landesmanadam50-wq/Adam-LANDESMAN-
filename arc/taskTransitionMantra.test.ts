import test from "node:test";
import assert from "node:assert/strict";

import { ALL_DONE_TRANSITION_MANTRA, resolveTransitionMantra } from "./taskTransitionMantra.ts";
import { createEmptyTask } from "./tasks.ts";

const NOW = "2026-01-05T12:00:00.000Z";

test("resolveTransitionMantra renders a default 'current now, then next' sentence when neither task has a custom template", () => {
  const current = createEmptyTask("t1", "מתאמן", "a1", NOW);
  const next = createEmptyTask("t2", "מתקלח", "a2", NOW);
  const mantra = resolveTransitionMantra(current, next);
  assert.ok(mantra.includes("מתאמן"));
  assert.ok(mantra.includes("מתקלח"));
});

test("resolveTransitionMantra renders only the current task's own line when there is no next task", () => {
  const current = createEmptyTask("t1", "קורא ספר", "a1", NOW);
  const mantra = resolveTransitionMantra(current, null);
  assert.ok(mantra.includes("קורא ספר"));
  assert.ok(!mantra.includes("undefined"));
});

test("resolveTransitionMantra returns the fixed all-done message when there is no current task at all", () => {
  assert.equal(resolveTransitionMantra(null, null), ALL_DONE_TRANSITION_MANTRA);
  assert.equal(resolveTransitionMantra(null, createEmptyTask("t2", "x", "a", NOW)), ALL_DONE_TRANSITION_MANTRA);
});

test("resolveTransitionMantra uses the current task's own custom transitionMantraTemplate, with {current}/{next} placeholders, instead of the default wording", () => {
  const current = { ...createEmptyTask("t1", "עובד על ARCHI", "a1", NOW), transitionMantraTemplate: "אתה עובד עכשיו על {current}, ולאחר מכן אתה {next}." };
  const next = createEmptyTask("t2", "יוצא להליכה", "a2", NOW);
  const mantra = resolveTransitionMantra(current, next);
  assert.equal(mantra, "אתה עובד עכשיו על עובד על ARCHI, ולאחר מכן אתה יוצא להליכה.");
});

test("resolveTransitionMantra falls back to the default template when the custom one is blank/whitespace-only", () => {
  const current = { ...createEmptyTask("t1", "לומד", "a1", NOW), transitionMantraTemplate: "   " };
  const mantra = resolveTransitionMantra(current, null);
  assert.ok(mantra.includes("לומד"));
});
