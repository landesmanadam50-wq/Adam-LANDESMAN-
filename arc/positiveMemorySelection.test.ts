import test from "node:test";
import assert from "node:assert/strict";

import { createPositiveMemory, setPositiveMemoryFeelings, updatePositiveMemory } from "./positiveMemory.ts";
import type { PositiveMemory, PositiveMemoryEventType } from "./positiveMemory.ts";
import { selectPositiveMemoryForFeeling, selectPositiveMemoryForTaskSuccess } from "./positiveMemorySelection.ts";
import { recordPositiveMemorySelection } from "./positiveMemorySelectionHistory.ts";

const NOW = "2026-01-01T00:00:00.000Z";

interface MemoryOpts {
  taskId?: string;
  linkedGoalIds?: string[];
  eventType?: PositiveMemoryEventType;
}

function withFeeling(id: string, feeling: string, moment: string, intensity: number | null, opts: MemoryOpts = {}): PositiveMemory {
  let memory = createPositiveMemory(id, opts.eventType ?? "positive_feeling", id, NOW);
  if (opts.taskId !== undefined) memory = updatePositiveMemory(memory, { taskId: opts.taskId }, NOW);
  if (opts.linkedGoalIds) memory = { ...memory, linkedGoalIds: opts.linkedGoalIds };
  return setPositiveMemoryFeelings(memory, [{ feeling, moment, intensity }], NOW);
}

function successMemory(id: string, opts: MemoryOpts = {}): PositiveMemory {
  let memory = updatePositiveMemory(createPositiveMemory(id, "success", id, NOW), { successDescription: "" }, NOW);
  if (opts.taskId !== undefined) memory = updatePositiveMemory(memory, { taskId: opts.taskId }, NOW);
  if (opts.linkedGoalIds) memory = { ...memory, linkedGoalIds: opts.linkedGoalIds };
  return memory;
}

test("criterion 1: a feeling match is required -- an unrelated feeling word never matches, even if other memories exist", () => {
  const m1 = withFeeling("m1", "ביטחון", "", null);
  assert.equal(selectPositiveMemoryForFeeling([m1], "רוגע", {}, []), null);
});

test("empty library behavior: no memories at all returns null, never throwing", () => {
  assert.equal(selectPositiveMemoryForFeeling([], "ביטחון", {}, []), null);
});

test("criterion 2 (task relevance) outranks criterion 4 (intensity): a highly intense but unrelated memory never outranks a relevant one", () => {
  const unrelatedButIntense = withFeeling("unrelated", "ביטחון", "", 5);
  const relevantButLowIntensity = withFeeling("relevant", "ביטחון", "", 1, { taskId: "task-1" });
  const picked = selectPositiveMemoryForFeeling([unrelatedButIntense, relevantButLowIntensity], "ביטחון", { taskId: "task-1" }, []);
  assert.equal(picked?.id, "relevant");
});

test("criterion 3 (documented detail usefulness) breaks a tie before intensity does", () => {
  const noDetail = withFeeling("no-detail", "ביטחון", "", 5);
  const withDetail = withFeeling("with-detail", "ביטחון", "הרגשתי את זה כשסיימתי", 1);
  const picked = selectPositiveMemoryForFeeling([noDetail, withDetail], "ביטחון", {}, []);
  assert.equal(picked?.id, "with-detail");
});

test("exact recurring-task matching: taskId relevance works identically for a recurring task's own stable id (never a separate template concept)", () => {
  const forRecurringTask = withFeeling("recurring-match", "ביטחון", "", null, { taskId: "recurring-task-1" });
  const unrelated = withFeeling("other", "ביטחון", "", 3);
  const picked = selectPositiveMemoryForFeeling([unrelated, forRecurringTask], "ביטחון", { taskId: "recurring-task-1" }, []);
  assert.equal(picked?.id, "recurring-match");
});

test("goal relevance also counts, below an exact task match but above having no context at all", () => {
  const goalMatch = withFeeling("goal-match", "ביטחון", "", null, { linkedGoalIds: ["goal-1"] });
  const noContext = withFeeling("no-context", "ביטחון", "", 4);
  const picked = selectPositiveMemoryForFeeling([noContext, goalMatch], "ביטחון", { goalIds: ["goal-1"] }, []);
  assert.equal(picked?.id, "goal-match");
});

test("alternative event selection ('אירוע אחר'): excludeIds removes the previous pick, surfacing a different eligible memory", () => {
  const m1 = withFeeling("m1", "ביטחון", "", null);
  const m2 = withFeeling("m2", "ביטחון", "", null);
  const picked = selectPositiveMemoryForFeeling([m1, m2], "ביטחון", {}, [], ["m1"]);
  assert.equal(picked?.id, "m2");
});

test("alternative event selection falls back to the full eligible set when excluding everyone would leave nothing (never returns null just because the only match was excluded)", () => {
  const m1 = withFeeling("m1", "ביטחון", "", null);
  const picked = selectPositiveMemoryForFeeling([m1], "ביטחון", {}, [], ["m1"]);
  assert.equal(picked?.id, "m1");
});

test("variety: among similarly relevant (tied) memories, the one last automatically selected for this exact feeling is avoided when an alternative exists", () => {
  const m1 = withFeeling("m1", "ביטחון", "", null);
  const m2 = withFeeling("m2", "ביטחון", "", null);
  const history = recordPositiveMemorySelection([], "m1", "encoding_feeling", "ביטחון", NOW);
  for (let i = 0; i < 20; i++) {
    const picked = selectPositiveMemoryForFeeling([m1, m2], "ביטחון", {}, history);
    assert.equal(picked?.id, "m2", "the previously-selected tied memory must be skipped in favor of its tied alternative");
  }
});

test("selection stability: calling selectPositiveMemoryForFeeling twice with the exact same inputs and no tie returns the SAME memory both times", () => {
  const relevant = withFeeling("relevant", "ביטחון", "", null, { taskId: "task-1" });
  const unrelated = withFeeling("unrelated", "ביטחון", "", 5);
  const first = selectPositiveMemoryForFeeling([relevant, unrelated], "ביטחון", { taskId: "task-1" }, []);
  const second = selectPositiveMemoryForFeeling([relevant, unrelated], "ביטחון", { taskId: "task-1" }, []);
  assert.equal(first?.id, "relevant");
  assert.equal(second?.id, "relevant");
});

// --- Strategy B: success-based selection (ARC Success) ---

test("success selection requires relevance -- a success with no task/goal/feeling connection to the current task never matches", () => {
  const unrelated = successMemory("unrelated");
  assert.equal(selectPositiveMemoryForTaskSuccess([unrelated], "task-1", {}, []), null);
});

test("success selection never considers a positive_feeling-type memory, even if it happens to carry a matching taskId", () => {
  const feelingOnly = updatePositiveMemory(createPositiveMemory("feeling-only", "positive_feeling", "x", NOW), { taskId: "task-1" }, NOW);
  assert.equal(selectPositiveMemoryForTaskSuccess([feelingOnly], "task-1", {}, []), null);
});

test("exact task relationship outranks goal connection, which outranks a feeling match (never weak text similarity)", () => {
  const exactTask = successMemory("exact-task", { taskId: "task-1" });
  const goalOnly = successMemory("goal-only", { linkedGoalIds: ["goal-1"] });
  const feelingOnly = withFeeling("feeling-only", "ביטחון", "", null, { eventType: "success" });
  const picked = selectPositiveMemoryForTaskSuccess([goalOnly, feelingOnly, exactTask], "task-1", { goalIds: ["goal-1"], feeling: "ביטחון" }, []);
  assert.equal(picked?.id, "exact-task");
});

test("'הצלחה אחרת': excludeIds surfaces a different relevant past success", () => {
  const s1 = successMemory("s1", { taskId: "task-1" });
  const s2 = successMemory("s2", { taskId: "task-1" });
  const picked = selectPositiveMemoryForTaskSuccess([s1, s2], "task-1", {}, [], ["s1"]);
  assert.equal(picked?.id, "s2");
});

test("empty library / no matching success behavior returns null safely, never throwing", () => {
  assert.equal(selectPositiveMemoryForTaskSuccess([], "task-1", {}, []), null);
});
