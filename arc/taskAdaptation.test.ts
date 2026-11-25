import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyTask } from "./tasks.ts";
import { MIN_ADAPTED_MINUTES, buildAdaptedTaskDraft, suggestHalvedDuration } from "./taskAdaptation.ts";

const NOW = "2026-11-25T08:00:00.000Z";

test("suggestHalvedDuration halves a normal duration", () => {
  assert.equal(suggestHalvedDuration(60), 30);
  assert.equal(suggestHalvedDuration(40), 20);
});

test("suggestHalvedDuration never degenerates toward ~0 -- floors at MIN_ADAPTED_MINUTES", () => {
  assert.equal(suggestHalvedDuration(6), MIN_ADAPTED_MINUTES);
  assert.equal(suggestHalvedDuration(1), MIN_ADAPTED_MINUTES);
  assert.equal(suggestHalvedDuration(0), MIN_ADAPTED_MINUTES);
});

test("buildAdaptedTaskDraft creates a brand-new task with parentTaskId pointing at the original, and never mutates the original object", () => {
  const original = createEmptyTask("original-1", "ללמוד אנגלית", "להתחיל", NOW);
  const originalCopy = { ...original };
  const draft = buildAdaptedTaskDraft(original, 30, "ללמוד ולתרגל עשר מילים חדשות", NOW);
  assert.equal(draft.parentTaskId, original.id);
  assert.equal(draft.expectedDurationMinutes, 30);
  assert.equal(draft.title, "ללמוד ולתרגל עשר מילים חדשות");
  assert.notEqual(draft.id, original.id, "must be a genuinely new task, never reusing the original's id");
  assert.deepEqual(original, originalCopy, "the original task object must never be mutated");
});

test("buildAdaptedTaskDraft carries the original's own scheduledDate/scheduledTime/routinePeriodId so it slots into the same day", () => {
  const original = { ...createEmptyTask("original-2", "t", "a", NOW), scheduledDate: "2026-11-25", scheduledTime: "09:00", routinePeriodId: "morning" as const };
  const draft = buildAdaptedTaskDraft(original, 15, "פעולה מצומצמת", NOW);
  assert.equal(draft.scheduledDate, "2026-11-25");
  assert.equal(draft.scheduledTime, "09:00");
  assert.equal(draft.routinePeriodId, "morning");
});
