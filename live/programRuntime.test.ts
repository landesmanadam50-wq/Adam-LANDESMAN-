/**
 * live/programRuntime.test.ts
 *
 * A regression against the actual runtime path LIVE resolves which
 * program (and which week's activeLayers) is active from -- not just
 * program/progress.ts's reconcileProgramProgress() in isolation, but
 * the same sequence live/LiveSessionScreen.tsx's useFocusEffect runs:
 * load profile + program progress + program selection, reconcile the
 * progress against the selection, then hand the resolved
 * activeLayers into the real arc/ engine, exactly as LiveSessionScreen
 * does before rendering.
 *
 * Background: manual testing found that after the 3-week program
 * (arc/ + program/) was restored onto main, it still didn't appear in
 * the real app -- because a stored ArcProgramProgress left over from
 * before the restoration (a different programPath) was loaded as-is
 * and never reconciled against the trainee's current
 * ArcProgramSelection. This file walks that exact load -> reconcile ->
 * route sequence so a regression there fails here, not just silently
 * in the app.
 */

import test from "node:test";
import assert from "node:assert/strict";

import type { ArcBuildProfile, ArcLiveState } from "../arc/types.ts";
import { createEmptyLiveState } from "../arc/types.ts";
import { getFirstArcStage, getNextArcStage, getAvailableLiveTriggers } from "../arc/arcEngine.ts";
import { createInitialProgress, reconcileProgramProgress, recordTrainingDay } from "../program/progress.ts";
import { buildProgramSelection } from "../program/selection.ts";
import { getProgramDefinition } from "../program/engine.ts";

function profile(): ArcBuildProfile {
  return {
    programPath: "standard_3_week",
    identityActionNeeded: false,
    interferingState: "ביקורת עצמית",
    supportiveState: "חמלה",
    stateEncoding: null,
    internalAction: "סריקת גוף",
    desiredIdentity: null,
    identityInterferingEmotion: null,
    identityEncoding: null,
    identityAction: null,
    habit: "לבדוק את הטלפון בכל הפסקה",
    beneficialAction: "לגשת ולפתוח שיחה",
    preventiveAction: null,
    regulationTool: "נשימה 4-7-8",
    actionDuration: null,
    successFocusDuration: null,
  };
}

/**
 * Mirrors LiveSessionScreen.tsx's useFocusEffect load sequence exactly:
 * Promise.all([loadProfile(), loadProgramProgress(), loadProgramSelection()])
 * -> reconcileProgramProgress(storedProgress, selection) -> activeLayers.
 * storedProgress/selection stand in for what data/storage.ts's
 * loadProgramProgress()/loadProgramSelection() would have returned.
 */
function resolveActiveLayersAsLiveDoes(storedProgress: ReturnType<typeof createInitialProgress> | null, selection: ReturnType<typeof buildProgramSelection> | null) {
  const resolvedProgress = reconcileProgramProgress(storedProgress, selection);
  if (!resolvedProgress) return null;
  return resolvedProgress.activeLayers;
}

test("a trainee whose needs assessment resolves to standard_3_week, with no prior program progress on the device, gets the 3-week program's week-1 layers", () => {
  const selection = buildProgramSelection({ needsState: true, needsIdentityImmediately: false });
  assert.equal(selection.programPath, "standard_3_week");

  const activeLayers = resolveActiveLayersAsLiveDoes(null, selection);
  assert.deepEqual(activeLayers, ["state"], "week 1 of standard_3_week is state-only");
});

test("a trainee whose device still carries a stale, never-started program progress from before the restoration still gets the 3-week program routed correctly through the real engine", () => {
  // Simulates exactly the reported scenario: a prior build/test left
  // archi.programProgress.v2 pointing at a different, valid programPath
  // that never actually got any training activity.
  const staleStoredProgress = createInitialProgress("habit_only_1_week");
  const currentSelection = buildProgramSelection({ needsState: true, needsIdentityImmediately: false });

  const activeLayers = resolveActiveLayersAsLiveDoes(staleStoredProgress, currentSelection);
  assert.deepEqual(activeLayers, ["state"], "resynced to standard_3_week's week 1, not left on the stale habit_only_1_week layers");

  // Now drive the real arc/ engine with the resolved activeLayers, the
  // same way LiveSessionScreen.tsx does after loading -- confirms the
  // 3-week program isn't just resolved in data, but actually routes.
  const p = profile();
  const triggers = getAvailableLiveTriggers(activeLayers);
  assert.deepEqual(triggers.sort(), ["proactive", "reactive_emotion"].sort(), "reactive_urge unavailable -- habit isn't active in week 1");

  let state: ArcLiveState = { ...createEmptyLiveState(), triggerType: "reactive_emotion" };
  let stage = getFirstArcStage();
  let iterations = 0;
  while (stage !== "arc_thought_awareness" && iterations < 20) {
    if (stage === "presence_check") state = { ...state, presenceRating: 3 };
    const next = getNextArcStage(stage, state, p);
    stage = next.stage;
    state = { ...state, loopIterationCount: next.loopIterationCount };
    iterations++;
  }
  assert.equal(stage, "arc_thought_awareness", "the real engine actually reaches ARC Thought under the resynced 3-week program");
});

test("a trainee with real, earned progress under a different (but still valid) program is never silently switched to standard_3_week", () => {
  let earnedProgress = createInitialProgress("habit_only_1_week");
  earnedProgress = recordTrainingDay(earnedProgress, "2026-08-03");

  const currentSelection = buildProgramSelection({ needsState: true, needsIdentityImmediately: false });
  const activeLayers = resolveActiveLayersAsLiveDoes(earnedProgress, currentSelection);
  assert.deepEqual(activeLayers, getProgramDefinition("habit_only_1_week").weeks[0].activeLayers, "earned progress under habit_only_1_week is preserved, not overridden by the current selection");
});
