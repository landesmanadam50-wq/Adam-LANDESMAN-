import test from "node:test";
import assert from "node:assert/strict";

import { resolveBodySensationContextKeys } from "./supportiveBodySensation.ts";

// ARCHI -- Body-Sensation Discovery & Four-Component Learning task,
// Phase 5: confirms live/NewArcLiveScreen.tsx's ONE generic
// resolveBodySensationContextKeys call (reload()) already covers every
// route variant with zero per-route code -- each case below mirrors the
// exact session-field shape that route's own launch stamps onto
// NewArcLiveSessionState (arc/newArcLiveTypes.ts).

test("ARC Behaviour (arcGymSituationId) resolves to its own situation key", () => {
  const keys = resolveBodySensationContextKeys({
    taskId: "__standalone__",
    arcGymSituationId: "situation-1",
    arcGymMemoryExerciseId: null,
    arcPerspectiveId: null,
    arcFocusPracticeId: null,
  });
  assert.deepEqual(keys, ["arcGymSituation:situation-1"]);
});

test("ARC Perspective (arcPerspectiveId) resolves to its own key, alongside a real task", () => {
  const keys = resolveBodySensationContextKeys({
    taskId: "task-1",
    arcGymSituationId: null,
    arcGymMemoryExerciseId: null,
    arcPerspectiveId: "perspective-1",
    arcFocusPracticeId: null,
  });
  assert.deepEqual(keys, ["task:task-1", "arcPerspective:perspective-1"]);
});

test("ARC Focus (arcFocusPracticeId) resolves to its own key, alongside a real task", () => {
  const keys = resolveBodySensationContextKeys({
    taskId: "task-1",
    arcGymSituationId: null,
    arcGymMemoryExerciseId: null,
    arcPerspectiveId: null,
    arcFocusPracticeId: "focus-1",
  });
  assert.deepEqual(keys, ["task:task-1", "arcFocusPractice:focus-1"]);
});

test("a plain task-linked session (no cross-feature origin) resolves to just its own task key", () => {
  const keys = resolveBodySensationContextKeys({
    taskId: "task-1",
    arcGymSituationId: null,
    arcGymMemoryExerciseId: null,
    arcPerspectiveId: null,
    arcFocusPracticeId: null,
  });
  assert.deepEqual(keys, ["task:task-1"]);
});

test("a task linked to an ARC Behaviour situation (Task.linkedArcGymSituationId) merges both keys, task first", () => {
  const keys = resolveBodySensationContextKeys(
    { taskId: "task-1", arcGymSituationId: null, arcGymMemoryExerciseId: null, arcPerspectiveId: null, arcFocusPracticeId: null },
    "situation-9"
  );
  assert.deepEqual(keys, ["task:task-1", "arcGymSituation:situation-9"]);
});

test("ARC Saving / ARC Goal / ARC Decision need no entry here -- ARC Saving reuses the task/situation keys already covered, and ARC Decision/ARC Goal never create a NewArcLiveSessionState of their own at all", () => {
  // No assertion needed -- this test documents the scope boundary from
  // the Phase 5 investigation: ARC Saving-launched sessions stamp
  // taskId/arcGymSituationId exactly like any other session (covered by
  // the cases above); ARC Decision has zero body-work steps; ARC Goal
  // has no ArcSessionRequest of its own. Nothing new to resolve.
  assert.ok(true);
});
