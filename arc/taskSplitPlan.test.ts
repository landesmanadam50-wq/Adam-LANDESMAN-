import test from "node:test";
import assert from "node:assert/strict";

import { buildSplitPlan, sumSplitPlanMinutes } from "./taskSplitPlan.ts";

test("buildSplitPlan with parts=1 degrades to a single plain work segment, matching continuous mode", () => {
  const segments = buildSplitPlan(30, 1, 5);
  assert.deepEqual(segments, [{ kind: "work", partIndex: 0, durationMinutes: 30 }]);
});

test("buildSplitPlan with breakMinutes=0 degrades to a single plain work segment regardless of parts", () => {
  const segments = buildSplitPlan(30, 3, 0);
  assert.deepEqual(segments, [{ kind: "work", partIndex: 0, durationMinutes: 30 }]);
});

test("buildSplitPlan builds N work segments with a break between every pair, never before the first or after the last", () => {
  const segments = buildSplitPlan(30, 3, 5);
  assert.deepEqual(
    segments.map((s) => s.kind),
    ["work", "break", "work", "break", "work"]
  );
});

test("buildSplitPlan's work minutes sum to EXACTLY the requested total, remainder folded onto the last part", () => {
  const segments = buildSplitPlan(10, 3, 2); // 10/3 = 3 remainder 1
  const workSegments = segments.filter((s) => s.kind === "work");
  assert.deepEqual(workSegments.map((s) => s.durationMinutes), [3, 3, 4]);
  assert.equal(
    workSegments.reduce((total, s) => total + s.durationMinutes, 0),
    10
  );
});

test("buildSplitPlan's partIndex counts work segments and break segments separately, each starting at 0", () => {
  const segments = buildSplitPlan(12, 3, 3);
  assert.deepEqual(
    segments.map((s) => s.partIndex),
    [0, 0, 1, 1, 2]
  );
});

test("sumSplitPlanMinutes adds work AND break minutes together -- the real wall-clock length used for the free-time clamp", () => {
  const segments = buildSplitPlan(30, 3, 5); // 10+5+10+5+10
  assert.equal(sumSplitPlanMinutes(segments), 40);
});

test("buildSplitPlan never throws and always returns a well-formed plan for bad/negative input", () => {
  assert.doesNotThrow(() => buildSplitPlan(-5, -2, -3));
  const segments = buildSplitPlan(-5, -2, -3);
  assert.ok(segments.length >= 1);
  assert.ok(segments.every((s) => s.durationMinutes >= 0));
});
