import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assertSupportiveBodySensationRating,
  computeBodySensationRanking,
  isValidSupportiveBodySensationRating,
  recordBodySensationDiscovery,
  recordBodySensationRating,
  recordBodySensationTaskStartedOutcome,
  resolveBodySensationContextKeys,
  resolveSuggestedBodySensations,
  type SupportiveBodySensationUsage,
} from "./supportiveBodySensation.ts";

test("isValidSupportiveBodySensationRating accepts exactly integers 0-10", () => {
  assert.equal(isValidSupportiveBodySensationRating(0), true);
  assert.equal(isValidSupportiveBodySensationRating(10), true);
  assert.equal(isValidSupportiveBodySensationRating(5), true);
  assert.equal(isValidSupportiveBodySensationRating(-1), false);
  assert.equal(isValidSupportiveBodySensationRating(11), false);
  assert.equal(isValidSupportiveBodySensationRating(5.5), false);
});

test("assertSupportiveBodySensationRating throws for an out-of-range value", () => {
  assert.throws(() => assertSupportiveBodySensationRating(11, "field"));
  assert.doesNotThrow(() => assertSupportiveBodySensationRating(0, "field"));
});

test("resolveBodySensationContextKeys excludes the standalone sentinel task id", () => {
  const keys = resolveBodySensationContextKeys({
    taskId: "__standalone__",
    arcGymSituationId: null,
    arcGymMemoryExerciseId: null,
    arcPerspectiveId: null,
    arcFocusPracticeId: null,
  });
  assert.deepEqual(keys, []);
});

test("resolveBodySensationContextKeys returns task:<id> first for a real task", () => {
  const keys = resolveBodySensationContextKeys({
    taskId: "task-1",
    arcGymSituationId: null,
    arcGymMemoryExerciseId: null,
    arcPerspectiveId: null,
    arcFocusPracticeId: null,
  });
  assert.deepEqual(keys, ["task:task-1"]);
});

test("resolveBodySensationContextKeys appends every present origin id", () => {
  const keys = resolveBodySensationContextKeys({
    taskId: "task-1",
    arcGymSituationId: "sit-1",
    arcGymMemoryExerciseId: "mem-1",
    arcPerspectiveId: "persp-1",
    arcFocusPracticeId: "focus-1",
  });
  assert.deepEqual(keys, ["task:task-1", "arcGymSituation:sit-1", "arcGymMemory:mem-1", "arcPerspective:persp-1", "arcFocusPractice:focus-1"]);
});

test("resolveBodySensationContextKeys merges the task's linked ARC Behaviour situation, deduped", () => {
  const keysWithLink = resolveBodySensationContextKeys(
    { taskId: "task-1", arcGymSituationId: null, arcGymMemoryExerciseId: null, arcPerspectiveId: null, arcFocusPracticeId: null },
    "sit-9"
  );
  assert.deepEqual(keysWithLink, ["task:task-1", "arcGymSituation:sit-9"]);

  const keysAlreadyPresent = resolveBodySensationContextKeys(
    { taskId: "task-1", arcGymSituationId: "sit-9", arcGymMemoryExerciseId: null, arcPerspectiveId: null, arcFocusPracticeId: null },
    "sit-9"
  );
  assert.deepEqual(keysAlreadyPresent, ["task:task-1", "arcGymSituation:sit-9"]);
});

test("resolveBodySensationContextKeys returns empty array for a purely spontaneous session with no context", () => {
  const keys = resolveBodySensationContextKeys({
    taskId: "__standalone__",
    arcGymSituationId: null,
    arcGymMemoryExerciseId: null,
    arcPerspectiveId: null,
    arcFocusPracticeId: null,
  });
  assert.deepEqual(keys, []);
});

test("recordBodySensationDiscovery starts with null rating/readiness/taskStarted", () => {
  const usage = recordBodySensationDiscovery("task:task-1", "scanChest", null, "warmth", "deep breath", "full", "2024-01-01T00:00:00.000Z");
  assert.equal(usage.contextKey, "task:task-1");
  assert.equal(usage.region, "scanChest");
  assert.equal(usage.sensationLabel, "warmth");
  assert.equal(usage.sensationEffectivenessRating, null);
  assert.equal(usage.readinessImproved, null);
  assert.equal(usage.taskStarted, null);
  assert.equal(usage.ratedAt, null);
  assert.equal(usage.startedCheckedAt, null);
  assert.ok(usage.id.length > 0);
});

test("recordBodySensationRating fills rating/readiness/ratedAt and rejects an out-of-range rating", () => {
  const usage = recordBodySensationDiscovery("task:task-1", "scanChest", null, "warmth", null, "full", "2024-01-01T00:00:00.000Z");
  const rated = recordBodySensationRating(usage, 8, true, "2024-01-01T00:10:00.000Z");
  assert.equal(rated.sensationEffectivenessRating, 8);
  assert.equal(rated.readinessImproved, true);
  assert.equal(rated.ratedAt, "2024-01-01T00:10:00.000Z");
  assert.throws(() => recordBodySensationRating(usage, 11, true, "2024-01-01T00:10:00.000Z"));
});

test("recordBodySensationTaskStartedOutcome fills taskStarted/startedCheckedAt without touching the rating", () => {
  const usage = recordBodySensationDiscovery("task:task-1", "scanChest", null, "warmth", null, "full", "2024-01-01T00:00:00.000Z");
  const rated = recordBodySensationRating(usage, 7, false, "2024-01-01T00:10:00.000Z");
  const resolved = recordBodySensationTaskStartedOutcome(rated, true, "2024-01-01T00:20:00.000Z");
  assert.equal(resolved.taskStarted, true);
  assert.equal(resolved.startedCheckedAt, "2024-01-01T00:20:00.000Z");
  assert.equal(resolved.sensationEffectivenessRating, 7);
});

function usage(overrides: Partial<SupportiveBodySensationUsage>): SupportiveBodySensationUsage {
  return {
    id: overrides.id ?? `u-${Math.random()}`,
    contextKey: overrides.contextKey ?? "task:task-1",
    region: overrides.region ?? "scanChest",
    side: overrides.side ?? null,
    sensationLabel: overrides.sensationLabel ?? "warmth",
    movementLabel: overrides.movementLabel ?? null,
    arcTrackChosen: overrides.arcTrackChosen ?? "full",
    sensationEffectivenessRating: overrides.sensationEffectivenessRating ?? null,
    readinessImproved: overrides.readinessImproved ?? null,
    taskStarted: overrides.taskStarted ?? null,
    discoveredAt: overrides.discoveredAt ?? "2024-01-01T00:00:00.000Z",
    ratedAt: overrides.ratedAt ?? null,
    startedCheckedAt: overrides.startedCheckedAt ?? null,
  };
}

test("computeBodySensationRanking excludes usages from other context keys", () => {
  const usages = [usage({ contextKey: "task:other", sensationEffectivenessRating: 10 })];
  const ranked = computeBodySensationRanking(["task:task-1"], usages);
  assert.deepEqual(ranked, []);
});

test("computeBodySensationRanking gives a never-rated discovery score:null, never excluded", () => {
  const usages = [usage({ sensationEffectivenessRating: null })];
  const ranked = computeBodySensationRanking(["task:task-1"], usages);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].score, null);
  assert.equal(ranked[0].tryCount, 1);
});

test("computeBodySensationRanking ranks a consistent high-average/many-try sensation above a single lucky 10", () => {
  const consistent = Array.from({ length: 20 }, () => usage({ sensationLabel: "consistent", sensationEffectivenessRating: 8 }));
  const lucky = [usage({ sensationLabel: "lucky", sensationEffectivenessRating: 10 })];
  const ranked = computeBodySensationRanking(["task:task-1"], [...consistent, ...lucky]);
  assert.equal(ranked[0].sensationLabel, "consistent");
  assert.equal(ranked[1].sensationLabel, "lucky");
});

test("computeBodySensationRanking sorts null-score (unrated) entries after every scored entry", () => {
  const scored = usage({ sensationLabel: "scored", sensationEffectivenessRating: 1 });
  const unrated = usage({ sensationLabel: "unrated", sensationEffectivenessRating: null });
  const ranked = computeBodySensationRanking(["task:task-1"], [scored, unrated]);
  assert.equal(ranked[0].sensationLabel, "scored");
  assert.equal(ranked[1].sensationLabel, "unrated");
});

test("computeBodySensationRanking treats a different region as a distinct entry from the same sensation label on another region", () => {
  const chest = usage({ region: "scanChest", sensationLabel: "warmth", sensationEffectivenessRating: 9 });
  const back = usage({ region: "upperBack", sensationLabel: "warmth", sensationEffectivenessRating: 3 });
  const ranked = computeBodySensationRanking(["task:task-1"], [chest, back]);
  assert.equal(ranked.length, 2);
});

test("resolveSuggestedBodySensations returns an empty list for empty context keys (no context to suggest from)", () => {
  const usages = [usage({ sensationEffectivenessRating: 9 })];
  assert.deepEqual(resolveSuggestedBodySensations([], usages, 3), []);
});

test("resolveSuggestedBodySensations respects the limit", () => {
  const usages = Array.from({ length: 5 }, (_, i) => usage({ sensationLabel: `s${i}`, sensationEffectivenessRating: i }));
  const suggestions = resolveSuggestedBodySensations(["task:task-1"], usages, 2);
  assert.equal(suggestions.length, 2);
});
