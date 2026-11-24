import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveArcMemoryMantra,
  resolveDesiredFeelingMantra,
  resolveFirstIncompleteObjectiveMantra,
  resolveFutureIdentityMantra,
  resolvePresentIdentityMantra,
} from "./arcMantraContent.ts";
import { createEmptyDailyVisualizationProfile } from "./dailyVisualization.ts";
import { createArcGymMemoryExercise } from "./arcGym.ts";
import type { ArcInsight } from "./arcInsightBelief.ts";
import { createArcGymGoal, createArcGymGoalObjective, toggleArcGymGoalObjectiveCompleted } from "./arcGymGoal.ts";

const NOW = "2026-01-05T12:00:00.000Z";

function insight(overrides: Partial<ArcInsight> = {}): ArcInsight {
  return {
    id: "ins-1",
    sourceExerciseId: "ex-1",
    taskId: null,
    beliefKind: "identity",
    text: "אתה אדם אמיץ כי פעלת למרות הפחד.",
    occurredAt: NOW,
    createdAt: NOW,
    arcLearningTopicIds: [],
    classification: null,
    classificationNote: null,
    ...overrides,
  };
}

test("resolveDesiredFeelingMantra returns a sentence built from the real saved desiredFeeling, and null when it's still the default empty string", () => {
  assert.equal(resolveDesiredFeelingMantra(null), null);
  assert.equal(resolveDesiredFeelingMantra(createEmptyDailyVisualizationProfile(NOW)), null);
  const profile = { ...createEmptyDailyVisualizationProfile(NOW), desiredFeeling: "סיפוק, ביטחון וגאווה" };
  assert.ok(resolveDesiredFeelingMantra(profile)?.includes("סיפוק, ביטחון וגאווה"));
});

test("resolveArcMemoryMantra reads actionText back verbatim, never inventing or rewording it, and is null when the exercise is missing or actionText is blank", () => {
  assert.equal(resolveArcMemoryMantra(null), null);
  const memory = createArcGymMemoryExercise("mem-1", "כשאני מרגיש לחץ", "לקבל את הרגש לפני שאני בוחר כיצד לפעול", NOW);
  const mantra = resolveArcMemoryMantra(memory);
  assert.ok(mantra?.includes("לקבל את הרגש לפני שאני בוחר כיצד לפעול"));
  assert.equal(resolveArcMemoryMantra(createArcGymMemoryExercise("mem-2", "סיטואציה", "", NOW)), null);
});

test("resolvePresentIdentityMantra uses the insight's own verbatim text, only for beliefKind === 'identity', never inventing an 'you are X because Y' structure the raw text doesn't have", () => {
  assert.equal(resolvePresentIdentityMantra(null), null);
  const identityInsight = insight();
  assert.ok(resolvePresentIdentityMantra(identityInsight)?.includes(identityInsight.text));
  assert.equal(resolvePresentIdentityMantra(insight({ beliefKind: "general" })), null);
  assert.equal(resolvePresentIdentityMantra(insight({ text: "" })), null);
});

test("resolveFutureIdentityMantra wraps getFutureOrientedMantraLine unchanged -- null when unset, a framed sentence when set", () => {
  assert.equal(resolveFutureIdentityMantra(null), null);
  assert.equal(resolveFutureIdentityMantra({ identityFutureOrientedMantra: null }), null);
  const line = resolveFutureIdentityMantra({ identityFutureOrientedMantra: "מאמן מוצלח" });
  assert.ok(line?.includes("מאמן מוצלח"));
});

test("resolveFirstIncompleteObjectiveMantra names the goal and its first not-yet-completed objective, and is null once the goal has no objectives left or none at all", () => {
  assert.equal(resolveFirstIncompleteObjectiveMantra(null, []), null);
  const goal = createArcGymGoal("g1", "קורס אימון אישי", null, "m1", NOW);
  assert.equal(resolveFirstIncompleteObjectiveMantra(goal, []), null);

  let objectives = [createArcGymGoalObjective("g1", "לסיים את המודול הראשון", 0, NOW)];
  const mantra = resolveFirstIncompleteObjectiveMantra(goal, objectives);
  assert.ok(mantra?.includes("קורס אימון אישי"));
  assert.ok(mantra?.includes("לסיים את המודול הראשון"));

  objectives = toggleArcGymGoalObjectiveCompleted(objectives, objectives[0].id, NOW);
  assert.equal(resolveFirstIncompleteObjectiveMantra(goal, objectives), null);
});
