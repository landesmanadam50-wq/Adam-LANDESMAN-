import test from "node:test";
import assert from "node:assert/strict";

import {
  createArcGoalInnerInitialSession,
  createArcGoalOuterInitialSession,
  createEmptyArcGoalLiveState,
  getGoalActionConfirmCopy,
  getNextGoalUiStage,
  getSupportiveActionConfirmCopy,
  needsGoalInterferenceDetour,
  resolveAfterSupportiveActionConfirmed,
  resolveSelectedMapping,
  shouldInterceptInnerAtAct,
} from "./arcGoalEngine.ts";
import type { ArcGoalLiveState, ArcGoalUiStage } from "./arcGoalEngine.ts";
import { createEmptyArcGoal } from "./types.ts";
import type { ArcBuildProfile, ArcGoal, ArcGoalInterferingMapping, ArcStage } from "./types.ts";
import { advanceLiveSession } from "../live/liveEventAdapter.ts";
import { createEmptyArcBuildProfile } from "./types.ts";

function mapping(overrides: Partial<ArcGoalInterferingMapping> = {}): ArcGoalInterferingMapping {
  return { id: "m1", interferingState: "עייפות", supportiveProtocolId: "state-1", supportiveAction: "לשתות מים", ...overrides };
}

function goal(overrides: Partial<ArcGoal> = {}): ArcGoal {
  return {
    ...createEmptyArcGoal("g1", "מטרה", "2024-01-01T00:00:00.000Z"),
    identityProtocolId: "identity-1",
    goalAction: "לעבוד על השיר",
    desiredResult: "לסיים הקלטה",
    ...overrides,
  };
}

function identityProfile(overrides: Partial<ArcBuildProfile> = {}): ArcBuildProfile {
  return { ...createEmptyArcBuildProfile(), desiredIdentity: "מוזיקאי", identityAction: "להקליט שיר", regulationTool: "נשימה", presenceColor: "כחול", ...overrides };
}

// --- createArcGoalOuterInitialSession / createArcGoalInnerInitialSession

test("createArcGoalOuterInitialSession pre-seeds triggerType=proactive, resolving trigger_selection to presence_check in one hop, with no trigger_selection screen ever shown", () => {
  const session = createArcGoalOuterInitialSession();
  assert.equal(session.triggerType, "proactive");
  const { stage } = advanceLiveSession("trigger_selection", session, identityProfile(), ["identity"]);
  assert.equal(stage, "presence_check");
});

test("createArcGoalInnerInitialSession pre-seeds triggerType=reactive_emotion and selectedTarget=state -- the caller starts it directly at sensation_check, never trigger_selection/presence_check", () => {
  const session = createArcGoalInnerInitialSession();
  assert.equal(session.triggerType, "reactive_emotion");
  assert.equal(session.selectedTarget, "state");
});

// --- needsGoalInterferenceDetour

test("needsGoalInterferenceDetour is true for an unresolved goal with at least one mapping", () => {
  const g = goal({ interferingMappings: [mapping()] });
  assert.equal(needsGoalInterferenceDetour(g, createEmptyArcGoalLiveState()), true);
});

test("needsGoalInterferenceDetour is false once interferenceResolved, even with mappings present", () => {
  const g = goal({ interferingMappings: [mapping()] });
  assert.equal(needsGoalInterferenceDetour(g, { ...createEmptyArcGoalLiveState(), interferenceResolved: true }), false);
});

test("needsGoalInterferenceDetour is false for a goal with zero interfering mappings -- nothing to check for", () => {
  const g = goal({ interferingMappings: [] });
  assert.equal(needsGoalInterferenceDetour(g, createEmptyArcGoalLiveState()), false);
});

// --- shouldInterceptInnerAtAct

test("shouldInterceptInnerAtAct is true only when the inner run's own next stage is 'act'", () => {
  assert.equal(shouldInterceptInnerAtAct("act"), true);
  assert.equal(shouldInterceptInnerAtAct("encode"), false);
  assert.equal(shouldInterceptInnerAtAct("sensation_check"), false);
});

// --- resolveSelectedMapping

test("resolveSelectedMapping returns null before any mapping is selected", () => {
  const g = goal({ interferingMappings: [mapping()] });
  assert.equal(resolveSelectedMapping(g, createEmptyArcGoalLiveState()), null);
});

test("resolveSelectedMapping returns the exact matching mapping by id", () => {
  const m1 = mapping({ id: "m1" });
  const m2 = mapping({ id: "m2", interferingState: "לחץ" });
  const g = goal({ interferingMappings: [m1, m2] });
  const result = resolveSelectedMapping(g, { ...createEmptyArcGoalLiveState(), selectedMappingId: "m2" });
  assert.equal(result, m2);
});

// --- getNextGoalUiStage: goal_interference_check

test("goal_interference_check stays put until answered", () => {
  const g = goal({ interferingMappings: [mapping()] });
  const { uiStage } = getNextGoalUiStage("goal_interference_check", g, createEmptyArcGoalLiveState());
  assert.equal(uiStage, "goal_interference_check");
});

test("goal_interference_check 'לא' resolves straight to outer, marking interferenceResolved", () => {
  const g = goal({ interferingMappings: [mapping(), mapping({ id: "m2" })] });
  const state = { ...createEmptyArcGoalLiveState(), hasGoalInterference: false };
  const result = getNextGoalUiStage("goal_interference_check", g, state);
  assert.equal(result.uiStage, "outer");
  assert.equal(result.goalState.interferenceResolved, true);
});

test("goal_interference_check 'כן' with exactly one mapping auto-selects it and skips straight to inner", () => {
  const only = mapping({ id: "only-one" });
  const g = goal({ interferingMappings: [only] });
  const state = { ...createEmptyArcGoalLiveState(), hasGoalInterference: true };
  const result = getNextGoalUiStage("goal_interference_check", g, state);
  assert.equal(result.uiStage, "inner");
  assert.equal(result.goalState.selectedMappingId, "only-one");
});

test("goal_interference_check 'כן' with 2+ mappings shows the state-select screen instead of auto-selecting", () => {
  const g = goal({ interferingMappings: [mapping({ id: "a" }), mapping({ id: "b" })] });
  const state = { ...createEmptyArcGoalLiveState(), hasGoalInterference: true };
  const result = getNextGoalUiStage("goal_interference_check", g, state);
  assert.equal(result.uiStage, "goal_interfering_state_select");
  assert.equal(result.goalState.selectedMappingId, null);
});

// --- getNextGoalUiStage: goal_interfering_state_select

test("goal_interfering_state_select stays put until a mapping is selected", () => {
  const g = goal({ interferingMappings: [mapping({ id: "a" }), mapping({ id: "b" })] });
  const { uiStage } = getNextGoalUiStage("goal_interfering_state_select", g, createEmptyArcGoalLiveState());
  assert.equal(uiStage, "goal_interfering_state_select");
});

test("goal_interfering_state_select advances to inner once a mapping is selected", () => {
  const g = goal({ interferingMappings: [mapping({ id: "a" }), mapping({ id: "b" })] });
  const state = { ...createEmptyArcGoalLiveState(), selectedMappingId: "b" };
  const { uiStage } = getNextGoalUiStage("goal_interfering_state_select", g, state);
  assert.equal(uiStage, "inner");
});

test("getNextGoalUiStage returns every other uiStage unchanged -- it is never the source of truth for outer/inner/supportive_action_confirm/goal_action_confirm's own transitions", () => {
  const g = goal({ interferingMappings: [mapping()] });
  for (const uiStage of ["outer", "inner", "supportive_action_confirm", "goal_action_confirm"] as const) {
    const result = getNextGoalUiStage(uiStage, g, createEmptyArcGoalLiveState());
    assert.equal(result.uiStage, uiStage);
  }
});

// --- resolveAfterSupportiveActionConfirmed

test("resolveAfterSupportiveActionConfirmed marks interferenceResolved without touching any other field", () => {
  const state = { ...createEmptyArcGoalLiveState(), hasGoalInterference: true, selectedMappingId: "m1" };
  const result = resolveAfterSupportiveActionConfirmed(state);
  assert.equal(result.interferenceResolved, true);
  assert.equal(result.hasGoalInterference, true);
  assert.equal(result.selectedMappingId, "m1");
});

// --- Full end-to-end orchestration trace: "כן" branch with a single mapping

test("end-to-end: 'כן' branch with a single mapping walks goal_interference_check -> inner -> (act intercepted) -> supportive_action_confirm -> back to outer, never re-asking the identity protocol", () => {
  const only = mapping({ id: "only", supportiveAction: "לשתות מים" });
  const g = goal({ interferingMappings: [only] });
  let goalState = createEmptyArcGoalLiveState();

  // Reached goal_interference_check because desired_state_check would be next and there's something to check.
  assert.equal(needsGoalInterferenceDetour(g, goalState), true);

  goalState = { ...goalState, hasGoalInterference: true };
  let hop = getNextGoalUiStage("goal_interference_check", g, goalState);
  assert.equal(hop.uiStage, "inner");
  goalState = hop.goalState;
  assert.equal(goalState.selectedMappingId, "only");

  const selected = resolveSelectedMapping(g, goalState);
  assert.equal(selected, only);
  const confirmCopy = getSupportiveActionConfirmCopy(selected!);
  assert.equal(confirmCopy.body, "לשתות מים");

  // The inner run's own transition reaching "act" is where the screen intercepts.
  assert.equal(shouldInterceptInnerAtAct("act"), true);

  goalState = resolveAfterSupportiveActionConfirmed(goalState);
  assert.equal(goalState.interferenceResolved, true);

  // The outer run, already paused at "desired_state_check", is never intercepted again this session.
  assert.equal(needsGoalInterferenceDetour(g, goalState), false);
});

test("end-to-end: 'לא' branch skips the supportive-state protocol entirely and never shows the state-select screen", () => {
  const g = goal({ interferingMappings: [mapping(), mapping({ id: "m2" })] });
  let goalState: ArcGoalLiveState = { ...createEmptyArcGoalLiveState(), hasGoalInterference: false };
  const hop = getNextGoalUiStage("goal_interference_check", g, goalState);
  assert.equal(hop.uiStage, "outer");
  goalState = hop.goalState;
  assert.equal(goalState.interferenceResolved, true);
  assert.equal(goalState.selectedMappingId, null, "no mapping is ever selected on the 'לא' branch");
});

// --- Copy builders

test("getSupportiveActionConfirmCopy shows exactly the mapping's own supportiveAction, never that protocol's internalAction", () => {
  const m = mapping({ supportiveAction: "נשימה עמוקה אחת" });
  assert.equal(getSupportiveActionConfirmCopy(m).body, "נשימה עמוקה אחת");
});

test("getGoalActionConfirmCopy shows the goal's own action and, when set, the desired result -- distinct from the identity protocol's own action", () => {
  const g = goal({ goalAction: "לעבוד על השיר", desiredResult: "לסיים הקלטה" });
  const copy = getGoalActionConfirmCopy(g);
  assert.match(copy.body, /לעבוד על השיר/);
  assert.match(copy.body, /לסיים הקלטה/);
});

test("getGoalActionConfirmCopy omits the result line entirely when no desired result was set", () => {
  const g = goal({ goalAction: "לעבוד על השיר", desiredResult: "" });
  const copy = getGoalActionConfirmCopy(g);
  assert.equal(copy.body, "לעבוד על השיר");
});

// --- Full-walk integration test: drives the REAL engine (advanceLiveSession,
// the exact function live/ArcGoalSessionScreen.tsx itself calls) through
// both the outer identity run and a transient inner supportive-state
// run, exactly mirroring that screen's own orchestration logic without
// any React involved -- verifies the wiring between
// arc/arcGoalEngine.ts and the completely unmodified arc/arcEngine.ts
// end to end, not just each piece in isolation.

test("full walk ('כן' branch): reaches goal_action_confirm via the real engine, resuming the identity run at exactly desired_state_check with no re-ask of the identity protocol", () => {
  const identity = identityProfile({
    desiredIdentity: "מוזיקאי",
    identityChallengeContext: "לפני הקלטה",
    identityInterferingEmotion: "פחד",
    identityAction: "להקליט שיר",
  });
  const supportive: ArcBuildProfile = {
    ...createEmptyArcBuildProfile(),
    supportiveState: "אנרגיה",
    challengeContext: "בבוקר",
    interferingState: "עייפות",
    internalAction: "לשתות מים",
    regulationTool: "נשימה",
    presenceColor: "כחול",
  };
  const g = goal({ identityProtocolId: "identity-1", interferingMappings: [mapping({ supportiveProtocolId: "state-1" })] });

  let outerSession = createArcGoalOuterInitialSession();
  let outerStage: ArcStage = "trigger_selection";
  {
    const hop = advanceLiveSession(outerStage, outerSession, identity, ["identity"]);
    outerSession = hop.session;
    outerStage = hop.stage;
  }
  assert.equal(outerStage, "presence_check", "sanity: the very first hop resolves straight to Presence, no trigger_selection screen");

  let innerSession = createArcGoalInnerInitialSession();
  let innerStage: ArcStage = "sensation_check";
  let goalState = createEmptyArcGoalLiveState();
  let uiStage: ArcGoalUiStage = "outer";
  let sawGoalInterferenceCheck = false;
  let sawInnerRun = false;

  let iterations = 0;
  while (uiStage !== "goal_action_confirm" && iterations < 60) {
    iterations++;

    if (uiStage === "outer") {
      if (outerStage === "presence_check" || outerStage === "arc_thought_presence_recheck") {
        outerSession = { ...outerSession, presenceRating: 8 }; // high presence -- skip the full ARC Thought loop
      }
      if (outerStage === "desired_state_check") {
        outerSession = { ...outerSession, desiredStateRating: 8 }; // above the regulation threshold -- straight to encode
      }
      const hop = advanceLiveSession(outerStage, outerSession, identity, ["identity"]);
      outerSession = hop.session;
      outerStage = hop.stage;
      if (outerStage === "desired_state_check" && needsGoalInterferenceDetour(g, goalState)) {
        uiStage = "goal_interference_check";
      } else if (outerStage === "complete") {
        // Mirrors live/ArcGoalSessionScreen.tsx's handleCompleteContinue --
        // the CompleteScreen's own gratitude UI has no further engine
        // logic, so this test moves straight to the final meta-stage.
        uiStage = "goal_action_confirm";
      }
      continue;
    }

    if (uiStage === "goal_interference_check") {
      sawGoalInterferenceCheck = true;
      const hop = getNextGoalUiStage("goal_interference_check", g, { ...goalState, hasGoalInterference: true });
      uiStage = hop.uiStage;
      goalState = hop.goalState;
      if (uiStage === "inner") {
        innerSession = createArcGoalInnerInitialSession();
        innerStage = "sensation_check";
      }
      continue;
    }

    if (uiStage === "inner") {
      sawInnerRun = true;
      if (innerStage === "sensation_check") {
        innerSession = { ...innerSession, sensationIntensity: 2, sensationLocation: "חזה" }; // low intensity -- straight to encode
      }
      const hop = advanceLiveSession(innerStage, innerSession, supportive, ["state"]);
      innerSession = hop.session;
      innerStage = hop.stage;
      if (shouldInterceptInnerAtAct(innerStage)) {
        uiStage = "supportive_action_confirm";
      }
      continue;
    }

    if (uiStage === "supportive_action_confirm") {
      goalState = resolveAfterSupportiveActionConfirmed(goalState);
      uiStage = "outer";
      continue;
    }
  }

  assert.equal(uiStage, "goal_action_confirm", "sanity: the walk must actually reach the final meta-stage");
  assert.equal(sawGoalInterferenceCheck, true, "the interference detour must have been shown at least once");
  assert.equal(sawInnerRun, true, "the inner supportive-state run must have actually executed");
  assert.equal(outerStage, "complete", "the outer identity run reached its own real completion, never short-circuited");
  assert.equal(outerSession.desiredStateRating, 8, "resuming at desired_state_check never re-asked/reset the identity protocol's own rating");
  assert.equal(goalState.interferenceResolved, true);
});

test("full walk ('לא' branch): skips the supportive-state protocol entirely and the outer run never pauses", () => {
  const identity = identityProfile({
    desiredIdentity: "מוזיקאי",
    identityChallengeContext: "לפני הקלטה",
    identityInterferingEmotion: "פחד",
    identityAction: "להקליט שיר",
  });
  const g = goal({ identityProtocolId: "identity-1", interferingMappings: [mapping()] });

  let outerSession = createArcGoalOuterInitialSession();
  let outerStage: ArcStage = "trigger_selection";
  {
    const hop = advanceLiveSession(outerStage, outerSession, identity, ["identity"]);
    outerSession = hop.session;
    outerStage = hop.stage;
  }

  let goalState = createEmptyArcGoalLiveState();
  let uiStage: ArcGoalUiStage = "outer";
  let sawInnerRun = false;

  let iterations = 0;
  while (uiStage !== "goal_action_confirm" && iterations < 60) {
    iterations++;
    if (uiStage === "outer") {
      if (outerStage === "presence_check" || outerStage === "arc_thought_presence_recheck") {
        outerSession = { ...outerSession, presenceRating: 8 };
      }
      if (outerStage === "desired_state_check") {
        outerSession = { ...outerSession, desiredStateRating: 8 };
      }
      const hop = advanceLiveSession(outerStage, outerSession, identity, ["identity"]);
      outerSession = hop.session;
      outerStage = hop.stage;
      if (outerStage === "desired_state_check" && needsGoalInterferenceDetour(g, goalState)) {
        uiStage = "goal_interference_check";
      } else if (outerStage === "complete") {
        uiStage = "goal_action_confirm";
      }
      continue;
    }
    if (uiStage === "goal_interference_check") {
      const hop = getNextGoalUiStage("goal_interference_check", g, { ...goalState, hasGoalInterference: false });
      uiStage = hop.uiStage;
      goalState = hop.goalState;
      continue;
    }
    if (uiStage === "inner") {
      sawInnerRun = true;
      break;
    }
  }

  assert.equal(uiStage, "goal_action_confirm");
  assert.equal(sawInnerRun, false, "the supportive-state protocol must never run on the 'לא' branch");
  assert.equal(goalState.selectedMappingId, null);
});
