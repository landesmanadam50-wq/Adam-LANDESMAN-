import test from "node:test";
import assert from "node:assert/strict";

import {
  createTaskActionStage,
  findActionStageByKind,
  hasConfiguredActionStages,
  normalizeTaskActionStage,
  orderedActionStages,
  resolveFirstActionStage,
  resolveNextActionStage,
  sumActionStageDurations,
  type TaskActionStage,
} from "./taskStage.ts";

function trigger(): TaskActionStage {
  return createTaskActionStage("s-trigger", "trigger", "לוקח את הספר ומניח אותו על השולחן", 2, "הספר מונח על השולחן");
}
function small(): TaskActionStage {
  return createTaskActionStage("s-small", "small", "פותח את הספר וקורא פסקה אחת", 3);
}
function main(): TaskActionStage {
  return createTaskActionStage("s-main", "main", "ממשיך לקרוא את הספר", 25);
}

// --- Tasks with one, two, or three action stages; correct ordering ---

test("orderedActionStages always sorts trigger -> small -> main, regardless of the array's own input order", () => {
  assert.deepEqual(orderedActionStages([main(), trigger(), small()]).map((stage) => stage.kind), ["trigger", "small", "main"]);
  assert.deepEqual(orderedActionStages([small(), main()]).map((stage) => stage.kind), ["small", "main"]);
  assert.deepEqual(orderedActionStages([main()]).map((stage) => stage.kind), ["main"]);
});

test("createTaskActionStage only ever sets cueDescription for a 'trigger' stage -- a small/main stage's own cueDescription is always null even if one is passed in", () => {
  const stage = createTaskActionStage("id", "small", "תיאור", 5, "לא רלוונטי");
  assert.equal(stage.cueDescription, null);
  const triggerStage = createTaskActionStage("id2", "trigger", "תיאור", 5, "רמז");
  assert.equal(triggerStage.cueDescription, "רמז");
});

test("findActionStageByKind finds the one stage of that kind, or null when none configured", () => {
  const stages = [trigger(), main()];
  assert.equal(findActionStageByKind(stages, "trigger")?.id, "s-trigger");
  assert.equal(findActionStageByKind(stages, "small"), null);
});

// --- "Every task must have a main action" once stages are configured at all ---

test("hasConfiguredActionStages is true only for a non-empty array that includes a main stage -- null, an empty array, or (defensively) a main-less array all count as 'not configured'", () => {
  assert.equal(hasConfiguredActionStages(null), false);
  assert.equal(hasConfiguredActionStages([]), false);
  assert.equal(hasConfiguredActionStages([trigger()]), false, "a trigger with no main is never treated as a valid configured breakdown");
  assert.equal(hasConfiguredActionStages([main()]), true);
  assert.equal(hasConfiguredActionStages([trigger(), small(), main()]), true);
});

// --- Independent stage durations / total planned duration ---

test("sumActionStageDurations adds every stage's own independent duration -- the spec's own worked example (2 + 3 + 25 = 30)", () => {
  assert.equal(sumActionStageDurations([trigger(), small(), main()]), 30);
  assert.equal(sumActionStageDurations([main()]), 25);
  assert.equal(sumActionStageDurations([]), 0);
});

// --- Stage progression (resolveNextActionStage / resolveFirstActionStage) ---

test("resolveFirstActionStage is the first stage in fixed order, whichever stages are actually configured", () => {
  assert.equal(resolveFirstActionStage([trigger(), small(), main()]).kind, "trigger");
  assert.equal(resolveFirstActionStage([small(), main()]).kind, "small");
  assert.equal(resolveFirstActionStage([main()]).kind, "main");
});

test("resolveNextActionStage returns the stage immediately after the given one in fixed order, and null once the given stage is already the last (main) one", () => {
  const stages = [trigger(), small(), main()];
  assert.equal(resolveNextActionStage(stages, "s-trigger")?.id, "s-small");
  assert.equal(resolveNextActionStage(stages, "s-small")?.id, "s-main");
  assert.equal(resolveNextActionStage(stages, "s-main"), null);
});

test("resolveNextActionStage skips a stage kind that was never configured -- trigger directly to main when no small action exists", () => {
  const stages = [trigger(), main()];
  assert.equal(resolveNextActionStage(stages, "s-trigger")?.id, "s-main");
});

// --- Backward compatibility ---

test("normalizeTaskActionStage backfills a missing durationMinutes to 0 and clears cueDescription for any non-trigger stage, without crashing", () => {
  const legacy = { id: "id", kind: "small" } as unknown as TaskActionStage;
  const normalized = normalizeTaskActionStage(legacy);
  assert.equal(normalized.durationMinutes, 0);
  assert.equal(normalized.cueDescription, null);
});

test("normalizeTaskActionStage preserves an existing trigger's own cueDescription", () => {
  const stage = trigger();
  assert.equal(normalizeTaskActionStage(stage).cueDescription, "הספר מונח על השולחן");
});
