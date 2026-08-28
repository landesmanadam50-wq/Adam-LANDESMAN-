/**
 * live/liveEventAdapter.test.ts
 *
 * Exercises the LIVE UI integration end to end through the pure adapter
 * -- applyXxx (raw answer -> ArcLiveState patch) followed by
 * advanceLiveSession (which alone decides the next stage, via
 * arc/arcEngine.ts). No React rendering harness exists in this project
 * (node --test, not Jest/RTL), so this is the layer these scenarios are
 * verified at; the underlying per-layer routing rules themselves are
 * already covered by arc/layerAware.test.ts and arc/arcEngine.test.ts,
 * and week/credit rules by program/progress.test.ts -- these tests
 * confirm the *adapter* wires them correctly, not that the rules exist
 * (they do, and are tested there).
 *
 * "Technical titles not visible" (spec item 15) has no pure-function
 * equivalent -- it's verified by app/_layout.tsx's explicit
 * Stack.Screen titles plus a live dev-bundle inspection, not a test
 * here.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { getAvailableLiveTriggers, getAvailableProactiveTargets, getFirstArcStage, resolveLiveRoute } from "../arc/arcEngine.ts";
import { createEmptyLiveState } from "../arc/types.ts";
import type { ArcBuildProfile, ArcLiveState, ArcStage, DevelopmentLayer } from "../arc/types.ts";
import type { ArcMap } from "../arc/buildTypes.ts";
import { applyPreventiveActionRouting } from "../arc/buildTypes.ts";
import { recordValidLiveCompletion } from "../program/progress.ts";
import { createInitialProgress } from "../program/progress.ts";
import {
  advanceLiveSession,
  applyActionCompletion,
  applyArcMapSelection,
  applyChallengeRecognition,
  applyScaleAnswer,
  applySensationAnswer,
  applyTriggerSelection,
} from "./liveEventAdapter.ts";

function profile(overrides: Partial<ArcBuildProfile> = {}): ArcBuildProfile {
  return {
    programPath: "standard_3_week",
    identityActionNeeded: false,
    interferingState: null,
    supportiveState: null,
    stateEncoding: null,
    internalAction: null,
    desiredIdentity: null,
    identityInterferingEmotion: null,
    identityEncoding: null,
    identityAction: null,
    habit: null,
    beneficialAction: null,
    preventiveAction: null,
    regulationTool: "נשימה 4-7-8",
    actionDuration: null,
    successFocusDuration: null,
    ...overrides,
  };
}

function step(stage: ArcStage, session: ArcLiveState, p: ArcBuildProfile, activeLayers: DevelopmentLayer[]) {
  return advanceLiveSession(stage, session, p, activeLayers);
}

// --- 1/2/3: layer-aware trigger/target availability, re-verified at the integration surface ---

test("1. STATE ONLY: reactive_urge is unavailable", () => {
  const activeLayers: DevelopmentLayer[] = ["state"];
  assert.equal(getAvailableLiveTriggers(activeLayers).includes("reactive_urge"), false);
});

test("2. HABIT ONLY: reactive_urge is available", () => {
  const activeLayers: DevelopmentLayer[] = ["habit"];
  assert.equal(getAvailableLiveTriggers(activeLayers).includes("reactive_urge"), true);
});

test("3. IDENTITY ONLY: proactive identity target is available", () => {
  const activeLayers: DevelopmentLayer[] = ["identity"];
  const p = profile({ desiredIdentity: "אומץ" });
  const targets = getAvailableProactiveTargets(activeLayers, p);
  assert.deepEqual(targets, [{ layer: "identity", label: "אומץ" }]);
});

// --- 4: STATE + HABIT does not require identity ---

test("4. STATE + HABIT: a full habit-route session reaches encode without identity data", () => {
  const activeLayers: DevelopmentLayer[] = ["state", "habit"];
  const p = profile({ beneficialAction: "לגשת ולפתוח שיחה" });
  assert.equal(resolveLiveRoute("reactive_urge", activeLayers), "reactive_habit");

  let session = createEmptyLiveState();
  session = { ...session, currentArcStage: "sensation_check" };
  const outcome = step(
    "sensation_check",
    { ...applyTriggerSelection(session, "reactive_urge"), sensationIntensity: 2 },
    p,
    activeLayers
  );
  assert.equal(outcome.stage, "encode");
});

// --- 5/6/7: presence gate + route selection ---

test("5. Low presence: ARC Thought starts regardless of which trigger was chosen", () => {
  const p = profile();
  for (const trigger of ["reactive_emotion", "reactive_urge", "proactive"] as const) {
    const activeLayers: DevelopmentLayer[] = trigger === "reactive_urge" ? ["habit"] : ["state"];
    let session = applyTriggerSelection(createEmptyLiveState(), trigger);
    session = applyScaleAnswer("presence_check", session, 3);
    const outcome = step("presence_check", session, p, activeLayers);
    assert.equal(outcome.stage, "arc_thought_awareness", `trigger ${trigger} should still run ARC Thought at low presence`);
  }
});

test("6. High presence + reactive_emotion: reactive route starts directly", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  let session = applyTriggerSelection(createEmptyLiveState(), "reactive_emotion");
  session = applyScaleAnswer("presence_check", session, 9);
  const outcome = step("presence_check", session, p, activeLayers);
  assert.equal(outcome.stage, "sensation_check");
});

test("7. High presence + reactive_urge: habit route starts only when habit is active", () => {
  const p = profile();
  assert.throws(() => resolveLiveRoute("reactive_urge", ["state"]));

  const activeLayers: DevelopmentLayer[] = ["habit"];
  let session = applyTriggerSelection(createEmptyLiveState(), "reactive_urge");
  session = applyScaleAnswer("presence_check", session, 9);
  const outcome = step("presence_check", session, p, activeLayers);
  assert.equal(outcome.stage, "sensation_check");
});

// --- 8/9: proactive rating threshold ---

test("8. Proactive rating below threshold routes to regulate", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  let session = applyTriggerSelection(createEmptyLiveState(), "proactive");
  session = applyScaleAnswer("desired_state_check", session, 3);
  const outcome = step("desired_state_check", session, p, activeLayers);
  assert.equal(outcome.stage, "regulate");
});

test("9. Proactive rating at/above threshold routes to encode", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  let session = applyTriggerSelection(createEmptyLiveState(), "proactive");
  session = applyScaleAnswer("desired_state_check", session, 7);
  const outcome = step("desired_state_check", session, p, activeLayers);
  assert.equal(outcome.stage, "encode");
});

// --- 10: reactive intensity bands ---

test("10. Reactive ratings classify into the right band", () => {
  const p = profile();
  const activeLayers: DevelopmentLayer[] = ["state"];
  const cases: Array<[number, ArcStage]> = [
    [8, "stay"],
    [6, "reactive_transition_check"],
    [4, "regulate"],
    [3, "encode"],
  ];
  for (const [intensity, expected] of cases) {
    const session = applySensationAnswer(createEmptyLiveState(), null, intensity);
    const outcome = step("sensation_check", session, p, activeLayers);
    assert.equal(outcome.stage, expected, `intensity ${intensity}`);
  }
});

// --- 11: invalid ratings are rejected by the engine, not silently accepted ---

test("11. An out-of-range rating throws instead of silently progressing", () => {
  const p = profile();
  const session = applySensationAnswer(createEmptyLiveState(), null, 20);
  assert.throws(() => step("sensation_check", session, p, ["state"]));
});

// --- 12/13/14: action completion -> daily credit, only when earned ---

test("12. Reaching act and confirming the real action grants Training Day credit", () => {
  let session = createEmptyLiveState();
  const p = profile();
  const outcome = step("encode", session, p, ["state"]); // encode -> act
  assert.equal(outcome.stage, "act");
  assert.equal(outcome.session.actionReached, true);

  const confirmed = applyActionCompletion(outcome.session, true);
  assert.equal(confirmed.realActionCompleted, true);

  const progress = createInitialProgress("state_only_1_week");
  const updated = recordValidLiveCompletion({
    progress,
    reachedAct: confirmed.actionReached,
    actionCompleted: confirmed.realActionCompleted,
    localDate: "2026-01-05",
  });
  assert.equal(updated.trainingDatesThisWeek.length, 1);
});

test("13. Reaching act WITHOUT confirming the real action grants no credit", () => {
  let session = createEmptyLiveState();
  const p = profile();
  const outcome = step("encode", session, p, ["state"]);
  assert.equal(outcome.session.actionReached, true);
  assert.equal(outcome.session.realActionCompleted, false); // never confirmed

  const progress = createInitialProgress("state_only_1_week");
  const updated = recordValidLiveCompletion({
    progress,
    reachedAct: outcome.session.actionReached,
    actionCompleted: outcome.session.realActionCompleted,
    localDate: "2026-01-05",
  });
  assert.equal(updated.trainingDatesThisWeek.length, 0);
  assert.equal(updated.liveSessionCount, 1, "opening/using LIVE is still counted as a session, just not a credited day");
});

test("13b. Abandoning before act is even reached leaves actionReached false", () => {
  const session = createEmptyLiveState(); // never advanced past trigger_selection
  assert.equal(session.actionReached, false);
});

test("14. Two qualifying LIVE completions on the same local date cap at one Training Day credit", () => {
  let progress = createInitialProgress("state_only_1_week");
  progress = recordValidLiveCompletion({ progress, reachedAct: true, actionCompleted: true, localDate: "2026-01-05" });
  progress = recordValidLiveCompletion({ progress, reachedAct: true, actionCompleted: true, localDate: "2026-01-05" });
  assert.equal(progress.trainingDatesThisWeek.length, 1);
  assert.equal(progress.liveSessionCount, 2, "both sessions are counted, only one day is credited");
});

// --- ArcMap selection/recognition, end to end through the adapter ---

const mapA: ArcMap = {
  id: "mapA",
  desiredStateId: "d1",
  interferingState: "ביקורת עצמית",
  challengeContext: "אחרי טעות",
  preventiveAction: "לעצור ולשים לב למה שכבר נוכח",
};
const mapB: ArcMap = {
  id: "mapB",
  desiredStateId: "d1",
  interferingState: "תסכול",
  challengeContext: "כשמשהו לא מצליח",
  preventiveAction: "לעצור לפני תגובה אוטומטית",
};

test("15. A single ArcMap is auto-selected -- no picker needed", () => {
  // Mirrors what LiveSessionScreen actually does: overlay a
  // "does any ArcMap have a preventiveAction" routing signal onto the
  // profile before it reaches the engine, since afterArcThought() only
  // ever checks the plain profile it's given.
  const p = applyPreventiveActionRouting(profile({ preventiveAction: null }), [mapA]);
  const session = applyTriggerSelection(createEmptyLiveState(), "reactive_urge");
  const outcome = advanceLiveSession("presence_check", { ...session, presenceRating: 9 }, p, ["habit"], [mapA]);
  assert.equal(outcome.stage, "preventive_action_check");
  assert.equal(outcome.session.selectedArcMapId, "mapA", "auto-selected since it's the only ArcMap");
});

test("16. Multiple ArcMaps: nothing is auto-selected -- the trainee must pick one", () => {
  const p = applyPreventiveActionRouting(profile({ preventiveAction: null }), [mapA, mapB]);
  const session = applyTriggerSelection(createEmptyLiveState(), "reactive_urge");
  const outcome = advanceLiveSession("presence_check", { ...session, presenceRating: 9 }, p, ["habit"], [mapA, mapB]);
  assert.equal(outcome.stage, "preventive_action_check");
  assert.equal(outcome.session.selectedArcMapId, null);
});

test("17. Selecting an ArcMap is a local choice -- it does not itself advance the stage", () => {
  let session = createEmptyLiveState();
  session = applyArcMapSelection(session, "mapB");
  assert.equal(session.selectedArcMapId, "mapB");
  assert.equal(session.currentArcStage, "trigger_selection", "unchanged -- selection alone never advances a stage");
});

test("18. Recognizing the Challenge Context (yes) reveals the next sub-step without advancing the stage", () => {
  let session = createEmptyLiveState();
  session = applyChallengeRecognition(session, true);
  assert.equal(session.challengeRecognized, true);
  assert.equal(session.wantsPreventiveAction, null, "not decided yet -- the offer_action sub-step still needs its own answer");
});

test("19. NOT recognizing the Challenge Context skips the Preventive Action offer entirely and advances to sensation_check", () => {
  const p = profile({ preventiveAction: null });
  let session = applyArcMapSelection(createEmptyLiveState(), "mapA");
  session = applyChallengeRecognition(session, false);
  assert.equal(session.wantsPreventiveAction, false);
  const outcome = advanceLiveSession("preventive_action_check", session, p, ["habit"], [mapA]);
  assert.equal(outcome.stage, "sensation_check", "Preventive Action was never offered -- the Challenge Context wasn't recognized");
});

test("20. Recognizing the Challenge Context, then accepting the Preventive Action, reaches preventive_action", () => {
  const p = profile({ preventiveAction: null });
  let session = applyArcMapSelection(createEmptyLiveState(), "mapA");
  session = applyChallengeRecognition(session, true);
  session = { ...session, wantsPreventiveAction: true }; // the offer_action sub-step's own yes/no answer
  const outcome = advanceLiveSession("preventive_action_check", session, p, ["habit"], [mapA]);
  assert.equal(outcome.stage, "preventive_action");
});

// --- first stage sanity ---

test("getFirstArcStage is trigger_selection, matching the new LIVE entry question", () => {
  assert.equal(getFirstArcStage(), "trigger_selection");
});
