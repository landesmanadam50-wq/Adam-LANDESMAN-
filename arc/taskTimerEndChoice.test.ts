import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_REST_DURATION_MINUTES,
  REST_DURATION_OPTIONS_MINUTES,
  resolveArcChoiceDestination,
  TASK_TIMER_END_CHOICE_LABELS,
} from "./taskTimerEndChoice.ts";

test("TASK_TIMER_END_CHOICE_LABELS has exactly the three spec-named choices", () => {
  assert.deepEqual(Object.keys(TASK_TIMER_END_CHOICE_LABELS).sort(), ["next_task", "rest", "start_arc"]);
});

test("resolveArcChoiceDestination opens the linked practice directly when one exists", () => {
  const result = resolveArcChoiceDestination("build-1");
  assert.deepEqual(result, { kind: "open_linked", arcBuildId: "build-1" });
});

test("resolveArcChoiceDestination asks the trainee to choose a practice when none is linked -- never silently picking one", () => {
  const result = resolveArcChoiceDestination(null);
  assert.deepEqual(result, { kind: "choose_one" });
});

test("REST_DURATION_OPTIONS_MINUTES includes the default option", () => {
  assert.ok(REST_DURATION_OPTIONS_MINUTES.includes(DEFAULT_REST_DURATION_MINUTES));
});
