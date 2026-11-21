import test from "node:test";
import assert from "node:assert/strict";

import { createNewArcLiveSessionState, describeArcSessionConfig, isNewArcLiveSessionStale, sessionMatchesRequest } from "./newArcLiveTypes.ts";
import type { ArcSessionRequest } from "./newArcLiveTypes.ts";

/**
 * arc/newArcLiveTypes.test.ts
 *
 * ARC session-resume conflict fix: the pure comparison/labeling
 * functions that every ARC entry point (the ARC window, the mid-task
 * "צריך ARC"/"Mini ARC" buttons, and running a saved PlannedArc) relies
 * on, via live/NewArcLiveScreen.tsx's own single reload(), to decide
 * resume vs. conflict. sessionMatchesRequest is the one, single-sourced
 * answer to "is this persisted session the SAME type and configuration
 * as what's being requested now?" -- never duplicated per entry point.
 */
const NOW = "2024-01-01T00:00:00.000Z";

// --- Critical-bug task ("Startup Popups Still Not Working After Modal Fix"): isNewArcLiveSessionStale ---

test("isNewArcLiveSessionStale is false for a genuinely in-progress session created earlier TODAY", () => {
  const session = createNewArcLiveSessionState("t1", "כותרת", "פעולה", "2026-11-10T07:00:00.000Z");
  assert.equal(isNewArcLiveSessionStale(session, new Date("2026-11-10T08:00:00.000Z")), false);
});

test("isNewArcLiveSessionStale is true once the session is completed, even if that happened today -- a finished session is never still 'active'", () => {
  const session = { ...createNewArcLiveSessionState("t1", "כותרת", "פעולה", "2026-11-10T07:00:00.000Z"), completedAt: "2026-11-10T07:30:00.000Z" };
  assert.equal(isNewArcLiveSessionStale(session, new Date("2026-11-10T08:00:00.000Z")), true);
});

test("isNewArcLiveSessionStale is true for a session created on an EARLIER calendar day and never cleared -- clearNewArcLiveSession is only ever called on genuine completion, so an abandoned session (backgrounded/force-stopped mid-run) from a previous day must never block today's startup sequence forever", () => {
  const session = createNewArcLiveSessionState("t1", "כותרת", "פעולה", "2026-11-05T07:00:00.000Z");
  assert.equal(isNewArcLiveSessionStale(session, new Date("2026-11-10T08:00:00.000Z")), true);
});

test("createNewArcLiveSessionState defaults sourcePlannedArcId to null -- an ad-hoc session (no specific saved draft) is never silently attributed to one", () => {
  const session = createNewArcLiveSessionState("t1", "כותרת", "פעולה", NOW);
  assert.equal(session.sourcePlannedArcId, null);
});

test("createNewArcLiveSessionState accepts an explicit sourcePlannedArcId, stored as-is", () => {
  const session = createNewArcLiveSessionState("t1", "כותרת", "פעולה", NOW, "plannedFull", "draft-1");
  assert.equal(session.sourcePlannedArcId, "draft-1");
  assert.equal(session.arcInvocationMode, "plannedFull");
});

test("sessionMatchesRequest: identical mode AND identical sourcePlannedArcId (both null) match", () => {
  const session = createNewArcLiveSessionState("t1", "כותרת", "פעולה", NOW, "plannedFull", null);
  const request: ArcSessionRequest = { arcInvocationMode: "plannedFull", sourcePlannedArcId: null, arcGymSituationId: null, arcFocusPracticeId: null, arcGymMemoryExerciseId: null, arcPerspectiveId: null };
  assert.equal(sessionMatchesRequest(session, request), true);
});

test("sessionMatchesRequest: identical mode AND identical specific draft id match", () => {
  const session = createNewArcLiveSessionState("t1", "כותרת", "פעולה", NOW, "plannedMini", "draft-1");
  const request: ArcSessionRequest = { arcInvocationMode: "plannedMini", sourcePlannedArcId: "draft-1", arcGymSituationId: null, arcFocusPracticeId: null, arcGymMemoryExerciseId: null, arcPerspectiveId: null };
  assert.equal(sessionMatchesRequest(session, request), true);
});

test("sessionMatchesRequest: same arcInvocationMode but a DIFFERENT specific draft id never matches", () => {
  const session = createNewArcLiveSessionState("t1", "כותרת", "פעולה", NOW, "plannedFull", "draft-1");
  const request: ArcSessionRequest = { arcInvocationMode: "plannedFull", sourcePlannedArcId: "draft-2", arcGymSituationId: null, arcFocusPracticeId: null, arcGymMemoryExerciseId: null, arcPerspectiveId: null };
  assert.equal(sessionMatchesRequest(session, request), false);
});

test("sessionMatchesRequest: a session tied to a specific draft never matches an ad-hoc (sourcePlannedArcId: null) request of the same mode, and vice versa", () => {
  const draftSession = createNewArcLiveSessionState("t1", "כותרת", "פעולה", NOW, "plannedFull", "draft-1");
  const adHocRequest: ArcSessionRequest = { arcInvocationMode: "plannedFull", sourcePlannedArcId: null, arcGymSituationId: null, arcFocusPracticeId: null, arcGymMemoryExerciseId: null, arcPerspectiveId: null };
  assert.equal(sessionMatchesRequest(draftSession, adHocRequest), false);

  const adHocSession = createNewArcLiveSessionState("t1", "כותרת", "פעולה", NOW, "plannedFull", null);
  const draftRequest: ArcSessionRequest = { arcInvocationMode: "plannedFull", sourcePlannedArcId: "draft-1", arcGymSituationId: null, arcFocusPracticeId: null, arcGymMemoryExerciseId: null, arcPerspectiveId: null };
  assert.equal(sessionMatchesRequest(adHocSession, draftRequest), false);
});

test("sessionMatchesRequest: different arcInvocationMode never matches, even with the same sourcePlannedArcId", () => {
  const session = createNewArcLiveSessionState("t1", "כותרת", "פעולה", NOW, "plannedFull", "draft-1");
  const request: ArcSessionRequest = { arcInvocationMode: "plannedMini", sourcePlannedArcId: "draft-1", arcGymSituationId: null, arcFocusPracticeId: null, arcGymMemoryExerciseId: null, arcPerspectiveId: null };
  assert.equal(sessionMatchesRequest(session, request), false);
});

test("sessionMatchesRequest: spontaneous vs. a planned mode never matches", () => {
  const session = createNewArcLiveSessionState("t1", "כותרת", "פעולה", NOW, "spontaneous", null);
  const request: ArcSessionRequest = { arcInvocationMode: "plannedFull", sourcePlannedArcId: null, arcGymSituationId: null, arcFocusPracticeId: null, arcGymMemoryExerciseId: null, arcPerspectiveId: null };
  assert.equal(sessionMatchesRequest(session, request), false);
});

test("describeArcSessionConfig names the specific saved draft when one is given, distinguishing Full from Mini", () => {
  assert.equal(describeArcSessionConfig({ arcInvocationMode: "plannedFull", sourcePlannedArcId: "draft-1", arcGymSituationId: null, arcFocusPracticeId: null, arcGymMemoryExerciseId: null, arcPerspectiveId: null }, "לפני פגישה"), "ARC מלא מתוכנן: לפני פגישה");
  assert.equal(describeArcSessionConfig({ arcInvocationMode: "plannedMini", sourcePlannedArcId: "draft-1", arcGymSituationId: null, arcFocusPracticeId: null, arcGymMemoryExerciseId: null, arcPerspectiveId: null }, "לפני פגישה"), "Mini ARC מתוכנן: לפני פגישה");
});

test("describeArcSessionConfig falls back to a generic mode label when no draft name is known (ad-hoc, or a deleted draft)", () => {
  assert.equal(describeArcSessionConfig({ arcInvocationMode: "spontaneous", sourcePlannedArcId: null, arcGymSituationId: null, arcFocusPracticeId: null, arcGymMemoryExerciseId: null, arcPerspectiveId: null }, null), "ARC ספונטני");
  assert.equal(describeArcSessionConfig({ arcInvocationMode: "plannedFull", sourcePlannedArcId: null, arcGymSituationId: null, arcFocusPracticeId: null, arcGymMemoryExerciseId: null, arcPerspectiveId: null }, null), "ARC מלא");
  assert.equal(describeArcSessionConfig({ arcInvocationMode: "plannedMini", sourcePlannedArcId: null, arcGymSituationId: null, arcFocusPracticeId: null, arcGymMemoryExerciseId: null, arcPerspectiveId: null }, null), "Mini ARC");
});

// --- ARC Perspective task, scenario 23: prevent duplicate/colliding sessions ---

test("23. sessionMatchesRequest distinguishes two DIFFERENT ArcPerspectiveSessions requested one after another -- never silently resuming session A's unfinished preliminary ARC in place of session B's new request", () => {
  const base = createNewArcLiveSessionState("t1", "כותרת", "פעולה", NOW, "spontaneous", null);
  const sessionForA = { ...base, arcPerspectiveId: "perspective-A" };
  const requestForA: ArcSessionRequest = { arcInvocationMode: "spontaneous", sourcePlannedArcId: null, arcGymSituationId: null, arcFocusPracticeId: null, arcGymMemoryExerciseId: null, arcPerspectiveId: "perspective-A" };
  const requestForB: ArcSessionRequest = { arcInvocationMode: "spontaneous", sourcePlannedArcId: null, arcGymSituationId: null, arcFocusPracticeId: null, arcGymMemoryExerciseId: null, arcPerspectiveId: "perspective-B" };
  assert.equal(sessionMatchesRequest(sessionForA, requestForA), true);
  assert.equal(sessionMatchesRequest(sessionForA, requestForB), false);
});

test("describeArcSessionConfig names the preliminary-ARC-before-ARC-Perspective case before falling through to the plain mode label", () => {
  assert.equal(
    describeArcSessionConfig({ arcInvocationMode: "spontaneous", sourcePlannedArcId: null, arcGymSituationId: null, arcFocusPracticeId: null, arcGymMemoryExerciseId: null, arcPerspectiveId: "perspective-1" }, null),
    "ARC מלא לפני שינוי פרספקטיבה"
  );
  assert.equal(
    describeArcSessionConfig({ arcInvocationMode: "shortened", sourcePlannedArcId: null, arcGymSituationId: null, arcFocusPracticeId: null, arcGymMemoryExerciseId: null, arcPerspectiveId: "perspective-1" }, null),
    "ARC מקוצר לפני שינוי פרספקטיבה"
  );
});
