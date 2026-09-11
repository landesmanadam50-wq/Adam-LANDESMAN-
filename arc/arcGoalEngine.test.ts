import test from "node:test";
import assert from "node:assert/strict";

import {
  createArcGoalInnerInitialSession,
  createArcGoalOuterInitialSession,
  createArcGoalUrgeInnerInitialSession,
  createEmptyArcGoalLiveState,
  findUrgeArcForNeed,
  getGoalActionConfirmCopy,
  getStateClarificationDecisionCopy,
  getSupportiveActionConfirmCopy,
  getThirdPersonImageryCopy,
  getTriggerIdentificationCopy,
  getUrgeActionConfirmCopy,
  getUrgeNeedIdentificationCopy,
  getUrgeStopActionCopy,
  needsReassessmentDetour,
  needsTriggerPrefixDetour,
  resolveAfterBridgeConfirmed,
  resolveAfterEmbeddedMiniArcStage,
  resolveAfterExecutionModeChoice,
  resolveAfterReassessment,
  resolveAfterStateClarificationDecision,
  resolveAfterThirdPersonImagery,
  resolveAfterTriggerIdentification,
  resolveAfterUrgeNeedIdentification,
  resolveAfterUrgeStopAction,
  resolveBridgeEntryUiStage,
  resolveExecutionMode,
  resolveSelectedMapping,
  resolveSelectedUrgeMapping,
  selectSupportiveMapping,
  selectUrgeMapping,
  shouldInterceptInnerAtAct,
  STATE_CLARIFICATION_DECISION_TITLE,
  TRIGGER_DESCRIPTION_UNSPECIFIED,
  URGE_STOP_ACTION_DONE_LABEL,
  URGE_STOP_ACTION_TITLE,
  urgeArcToProfile,
} from "./arcGoalEngine.ts";
import type { ArcGoalLiveState, ArcGoalUiStage } from "./arcGoalEngine.ts";
import { containsInductionPattern } from "./instructions.ts";
import { createEmptyArcGoal, createEmptyUrgeArc, IDENTIFIED_NEED_UNKNOWN } from "./types.ts";
import type { ArcBuildProfile, ArcGoal, ArcGoalInterferingMapping, ArcGoalUrgeMapping, ArcStage, UrgeArc } from "./types.ts";
import { advanceLiveSession } from "../live/liveEventAdapter.ts";
import { createEmptyArcBuildProfile } from "./types.ts";

function mapping(overrides: Partial<ArcGoalInterferingMapping> = {}): ArcGoalInterferingMapping {
  return {
    id: "m1",
    interferingState: "עייפות",
    supportiveProtocolId: "state-1",
    supportiveAction: "לשתות מים",
    miniArcId: null,
    executionMode: "full",
    identityProtocolId: null,
    goalAction: null,
    ...overrides,
  };
}

function urgeMapping(overrides: Partial<ArcGoalUrgeMapping> = {}): ArcGoalUrgeMapping {
  return {
    id: "um1",
    urgeArcId: "urge-1",
    need: null,
    miniArcId: null,
    executionMode: "full",
    identityProtocolId: null,
    goalAction: null,
    ...overrides,
  };
}

function urgeArc(overrides: Partial<UrgeArc> = {}): UrgeArc {
  return {
    ...createEmptyUrgeArc("urge-1", "דחף לעישון", "2024-01-01T00:00:00.000Z"),
    interferingAction: "להדליק סיגריה",
    regulationAnchor: "נשימה עמוקה",
    beneficialAlternativeAction: "לשתות כוס מים",
    ...overrides,
  };
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
  return {
    ...createEmptyArcBuildProfile(),
    desiredIdentity: "מוזיקאי",
    identityAction: "להקליט שיר",
    regulationTool: "נשימה",
    presenceColor: "כחול",
    ...overrides,
  };
}

// --- createArcGoalOuterInitialSession / createArcGoalInnerInitialSession / createArcGoalUrgeInnerInitialSession

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

test("createArcGoalUrgeInnerInitialSession pre-seeds triggerType=reactive_urge and selectedTarget=habit -- the same unambiguous pairing a regular reactive_urge session always resolves to", () => {
  const session = createArcGoalUrgeInnerInitialSession();
  assert.equal(session.triggerType, "reactive_urge");
  assert.equal(session.selectedTarget, "habit");
});

// --- urgeArcToProfile

test("urgeArcToProfile maps habit/beneficialAction/regulationTool from the UrgeArc, leaving preventiveAction null (the Stop already happened in the prefix)", () => {
  const u = urgeArc({ interferingAction: "להדליק סיגריה", beneficialAlternativeAction: "לשתות מים", regulationAnchor: "נשימה" });
  const profile = urgeArcToProfile(u);
  assert.equal(profile.habit, "להדליק סיגריה");
  assert.equal(profile.beneficialAction, "לשתות מים");
  assert.equal(profile.regulationTool, "נשימה");
  assert.equal(profile.preventiveAction, null);
});

test("urgeArcToProfile never persists anything -- every other field stays at createEmptyArcBuildProfile's own safe default", () => {
  const profile = urgeArcToProfile(urgeArc());
  assert.equal(profile.desiredIdentity, null);
  assert.equal(profile.supportiveState, null);
  assert.equal(profile.presenceColor, null);
});

test("the real engine resolves a reactive_urge/habit session driven by urgeArcToProfile exactly like any other habit-target session -- act's own actionLabel is the UrgeArc's beneficialAlternativeAction", () => {
  const profile = urgeArcToProfile(urgeArc({ beneficialAlternativeAction: "לשתות כוס מים" }));
  let session = createArcGoalUrgeInnerInitialSession();
  let stage: ArcStage = "sensation_check";
  session = { ...session, sensationIntensity: 2, sensationLocation: "חזה" };
  let hop = advanceLiveSession(stage, session, profile, ["habit"]);
  session = hop.session;
  stage = hop.stage;
  // Walk forward until "act" (loop-safety cap mirrors other full-walk tests below).
  let iterations = 0;
  while (stage !== "act" && iterations < 20) {
    iterations++;
    hop = advanceLiveSession(stage, session, profile, ["habit"]);
    session = hop.session;
    stage = hop.stage;
  }
  assert.equal(stage, "act");
});

// --- Bug-fix task: state-clarification decision gate

test("createEmptyArcGoalLiveState now starts at the state-clarification decision gate -- the session's very first screen", () => {
  assert.equal(createEmptyArcGoalLiveState().uiStage, "state_clarification_decision");
});

test("getStateClarificationDecisionCopy returns the exact required Hebrew title", () => {
  assert.equal(getStateClarificationDecisionCopy().title, "האם יש כרגע רגש או דחף שצריך לעבוד עליו?");
  assert.equal(getStateClarificationDecisionCopy().title, STATE_CLARIFICATION_DECISION_TITLE);
});

test("resolveAfterStateClarificationDecision('כן') continues to the existing state-clarification (trigger-identification) screen, leaving reassessment untouched", () => {
  const result = resolveAfterStateClarificationDecision(true, createEmptyArcGoalLiveState());
  assert.equal(result.uiStage, "trigger_identification");
  assert.equal(result.triggerPrefixResolved, false, "not resolved yet -- the prefix is only just starting");
  assert.equal(result.reassessmentResolved, false, "the existing emotion/urge support route must still run normally later");
});

test("resolveAfterStateClarificationDecision('לא') skips straight to the outer run, pre-resolving both the trigger prefix AND the reassessment detour", () => {
  const result = resolveAfterStateClarificationDecision(false, createEmptyArcGoalLiveState());
  assert.equal(result.uiStage, "outer");
  assert.equal(result.triggerPrefixResolved, true, "the state-clarification screen must never appear later this session");
  assert.equal(result.reassessmentResolved, true, "the emotion/urge support route must never appear later this session");
});

test("resolveAfterStateClarificationDecision('לא') resets every temporary state-clarification/emotion-urge field, so stale data cannot leak into the identity route", () => {
  const dirty: ArcGoalLiveState = {
    uiStage: "state_clarification_decision",
    triggerPrefixResolved: false,
    triggerDescription: "מצב ישן",
    identifiedNeed: "רגיעה",
    reassessmentResolved: false,
    reassessmentChoice: "urge",
    selectedMappingId: "m-old",
    selectedUrgeMappingId: "um-old",
    executionMode: "mini",
    miniArcStage: "encoding",
  };
  const result = resolveAfterStateClarificationDecision(false, dirty);
  assert.equal(result.triggerDescription, null);
  assert.equal(result.identifiedNeed, null);
  assert.equal(result.reassessmentChoice, null);
  assert.equal(result.selectedMappingId, null);
  assert.equal(result.selectedUrgeMappingId, null);
  assert.equal(result.executionMode, null);
  assert.equal(result.miniArcStage, null);
});

// --- needsTriggerPrefixDetour

test("needsTriggerPrefixDetour is true the first time presence_check resolves into either ARC Thought entry stage", () => {
  const state = createEmptyArcGoalLiveState();
  assert.equal(needsTriggerPrefixDetour("arc_thought_awareness", state), true);
  assert.equal(needsTriggerPrefixDetour("arc_thought_expand_presence", state), true);
});

test("needsTriggerPrefixDetour is false once triggerPrefixResolved, even for the same next stage", () => {
  const state = { ...createEmptyArcGoalLiveState(), triggerPrefixResolved: true };
  assert.equal(needsTriggerPrefixDetour("arc_thought_awareness", state), false);
  assert.equal(needsTriggerPrefixDetour("arc_thought_expand_presence", state), false);
});

test("needsTriggerPrefixDetour is false for any other next stage -- never intercepts a later ARC-Thought loop-back", () => {
  const state = createEmptyArcGoalLiveState();
  assert.equal(needsTriggerPrefixDetour("arc_thought_presence_recheck", state), false);
  assert.equal(needsTriggerPrefixDetour("desired_state_check", state), false);
});

// --- Trigger-identification prefix transitions

test("resolveAfterTriggerIdentification records the trimmed description and moves to third_person_imagery", () => {
  const result = resolveAfterTriggerIdentification(createEmptyArcGoalLiveState(), "  מצב בעבודה  ");
  assert.equal(result.triggerDescription, "מצב בעבודה");
  assert.equal(result.uiStage, "third_person_imagery");
});

test("resolveAfterTriggerIdentification falls back to the unspecified placeholder for blank text -- never forces the trainee to answer", () => {
  const result = resolveAfterTriggerIdentification(createEmptyArcGoalLiveState(), "   ");
  assert.equal(result.triggerDescription, TRIGGER_DESCRIPTION_UNSPECIFIED);
});

test("resolveAfterThirdPersonImagery routes into urge_need_identification when this goal has any urgeMappings", () => {
  const g = goal({ urgeMappings: [urgeMapping()] });
  const result = resolveAfterThirdPersonImagery(g, createEmptyArcGoalLiveState());
  assert.equal(result.uiStage, "urge_need_identification");
  assert.equal(result.triggerPrefixResolved, false, "not yet resolved -- Urge Need Identification still needs to run");
});

test("resolveAfterThirdPersonImagery resolves the prefix immediately when this goal has zero urgeMappings", () => {
  const g = goal({ urgeMappings: [] });
  const result = resolveAfterThirdPersonImagery(g, createEmptyArcGoalLiveState());
  assert.equal(result.uiStage, "outer");
  assert.equal(result.triggerPrefixResolved, true);
});

test("resolveAfterUrgeNeedIdentification records the identified need and resolves the prefix", () => {
  const result = resolveAfterUrgeNeedIdentification(createEmptyArcGoalLiveState(), "רגיעה");
  assert.equal(result.identifiedNeed, "רגיעה");
  assert.equal(result.uiStage, "outer");
  assert.equal(result.triggerPrefixResolved, true);
});

// --- needsReassessmentDetour

test("needsReassessmentDetour is true for an unresolved goal with at least one urge mapping", () => {
  const g = goal({ urgeMappings: [urgeMapping()], interferingMappings: [] });
  assert.equal(needsReassessmentDetour(g, createEmptyArcGoalLiveState()), true);
});

test("needsReassessmentDetour is true for an unresolved goal with at least one interfering mapping", () => {
  const g = goal({ urgeMappings: [], interferingMappings: [mapping()] });
  assert.equal(needsReassessmentDetour(g, createEmptyArcGoalLiveState()), true);
});

test("needsReassessmentDetour is false once reassessmentResolved, even with mappings present", () => {
  const g = goal({ interferingMappings: [mapping()] });
  assert.equal(needsReassessmentDetour(g, { ...createEmptyArcGoalLiveState(), reassessmentResolved: true }), false);
});

test("needsReassessmentDetour is false for a goal with neither urge nor interfering mappings -- nothing to reassess for", () => {
  const g = goal({ urgeMappings: [], interferingMappings: [] });
  assert.equal(needsReassessmentDetour(g, createEmptyArcGoalLiveState()), false);
});

// --- resolveAfterReassessment

test("resolveAfterReassessment 'direct' resumes the outer run immediately -- never assumes the original emotion/urge is still present", () => {
  const g = goal({ urgeMappings: [urgeMapping()], interferingMappings: [mapping()] });
  const result = resolveAfterReassessment("direct", g, createEmptyArcGoalLiveState(), {});
  assert.equal(result.uiStage, "outer");
  assert.equal(result.goalState.reassessmentResolved, true);
  assert.equal(result.goalState.reassessmentChoice, "direct");
  assert.equal(result.goalState.selectedMappingId, null);
  assert.equal(result.goalState.selectedUrgeMappingId, null);
});

test("resolveAfterReassessment 'urge' with exactly one urge mapping auto-selects it and skips straight to inner", () => {
  const only = urgeMapping({ id: "only-urge" });
  const g = goal({ urgeMappings: [only] });
  const result = resolveAfterReassessment("urge", g, createEmptyArcGoalLiveState(), {});
  assert.equal(result.uiStage, "inner");
  assert.equal(result.goalState.selectedUrgeMappingId, "only-urge");
  assert.equal(result.goalState.reassessmentChoice, "urge");
});

test("resolveAfterReassessment 'urge' with 2+ urge mappings shows urge_select instead of auto-selecting", () => {
  const g = goal({ urgeMappings: [urgeMapping({ id: "a" }), urgeMapping({ id: "b" })] });
  const result = resolveAfterReassessment("urge", g, createEmptyArcGoalLiveState(), {});
  assert.equal(result.uiStage, "urge_select");
  assert.equal(result.goalState.selectedUrgeMappingId, null);
});

test("resolveAfterReassessment 'supportive' with exactly one interfering mapping auto-selects it and skips straight to inner", () => {
  const only = mapping({ id: "only-supportive" });
  const g = goal({ interferingMappings: [only] });
  const result = resolveAfterReassessment("supportive", g, createEmptyArcGoalLiveState(), {});
  assert.equal(result.uiStage, "inner");
  assert.equal(result.goalState.selectedMappingId, "only-supportive");
  assert.equal(result.goalState.reassessmentChoice, "supportive");
});

test("resolveAfterReassessment 'supportive' with 2+ interfering mappings shows supportive_state_select instead of auto-selecting", () => {
  const g = goal({ interferingMappings: [mapping({ id: "a" }), mapping({ id: "b" })] });
  const result = resolveAfterReassessment("supportive", g, createEmptyArcGoalLiveState(), {});
  assert.equal(result.uiStage, "supportive_state_select");
  assert.equal(result.goalState.selectedMappingId, null);
});

// --- selectUrgeMapping / selectSupportiveMapping / resolveSelectedUrgeMapping / resolveSelectedMapping

test("selectUrgeMapping records the chosen id and moves straight to inner when the selected urge has no Stop Action configured", () => {
  const g = goal({ urgeMappings: [urgeMapping({ id: "um-2" })] });
  const result = selectUrgeMapping(createEmptyArcGoalLiveState(), "um-2", g, {});
  assert.equal(result.selectedUrgeMappingId, "um-2");
  assert.equal(result.uiStage, "inner");
});

test("selectUrgeMapping routes to urge_stop_action when the selected urge has a Stop Action configured", () => {
  const g = goal({ urgeMappings: [urgeMapping({ id: "um-2", urgeArcId: "urge-2" })] });
  const urgeArcsById = { "urge-2": urgeArc({ id: "urge-2", stopCue: "להניח את הטלפון" }) };
  const result = selectUrgeMapping(createEmptyArcGoalLiveState(), "um-2", g, urgeArcsById);
  assert.equal(result.selectedUrgeMappingId, "um-2");
  assert.equal(result.uiStage, "urge_stop_action");
});

test("selectUrgeMapping falls back to inner when the mapped id doesn't resolve to any urge mapping on the goal", () => {
  const g = goal({ urgeMappings: [] });
  const result = selectUrgeMapping(createEmptyArcGoalLiveState(), "missing", g, {});
  assert.equal(result.uiStage, "inner");
});

test("selectSupportiveMapping records the chosen id and moves straight to inner", () => {
  const result = selectSupportiveMapping(createEmptyArcGoalLiveState(), "m-2");
  assert.equal(result.selectedMappingId, "m-2");
  assert.equal(result.uiStage, "inner");
});

test("resolveSelectedUrgeMapping returns null before any urge mapping is selected, and the exact match once selected", () => {
  const a = urgeMapping({ id: "a" });
  const b = urgeMapping({ id: "b" });
  const g = goal({ urgeMappings: [a, b] });
  assert.equal(resolveSelectedUrgeMapping(g, createEmptyArcGoalLiveState()), null);
  const selected = resolveSelectedUrgeMapping(g, { ...createEmptyArcGoalLiveState(), selectedUrgeMappingId: "b" });
  assert.equal(selected, b);
});

test("resolveSelectedMapping returns null before any mapping is selected, and the exact match once selected", () => {
  const a = mapping({ id: "a" });
  const b = mapping({ id: "b" });
  const g = goal({ interferingMappings: [a, b] });
  assert.equal(resolveSelectedMapping(g, createEmptyArcGoalLiveState()), null);
  const selected = resolveSelectedMapping(g, { ...createEmptyArcGoalLiveState(), selectedMappingId: "b" });
  assert.equal(selected, b);
});

// --- shouldInterceptInnerAtAct (unchanged, shared by both routes)

test("shouldInterceptInnerAtAct is true only when the inner run's own next stage is 'act'", () => {
  assert.equal(shouldInterceptInnerAtAct("act"), true);
  assert.equal(shouldInterceptInnerAtAct("encode"), false);
  assert.equal(shouldInterceptInnerAtAct("sensation_check"), false);
});

// --- resolveExecutionMode / resolveBridgeEntryUiStage / resolveAfterExecutionModeChoice

test("resolveExecutionMode passes 'full' and 'choose' through unchanged", () => {
  assert.equal(resolveExecutionMode("full", true), "full");
  assert.equal(resolveExecutionMode("full", false), "full");
  assert.equal(resolveExecutionMode("choose", true), "choose");
  assert.equal(resolveExecutionMode("choose", false), "choose");
});

test("resolveExecutionMode passes 'mini' through when the referenced Mini ARC still exists", () => {
  assert.equal(resolveExecutionMode("mini", true), "mini");
});

test("resolveExecutionMode falls back 'mini' -> 'full' when the referenced Mini ARC is missing/deleted -- handle deleted/missing referenced protocols safely", () => {
  assert.equal(resolveExecutionMode("mini", false), "full");
});

test("resolveBridgeEntryUiStage routes 'mini' to mini_arc_embedded regardless of route", () => {
  assert.equal(resolveBridgeEntryUiStage("urge", "mini"), "mini_arc_embedded");
  assert.equal(resolveBridgeEntryUiStage("supportive", "mini"), "mini_arc_embedded");
});

test("resolveBridgeEntryUiStage routes 'full' to the route's own confirm screen", () => {
  assert.equal(resolveBridgeEntryUiStage("urge", "full"), "urge_action_confirm");
  assert.equal(resolveBridgeEntryUiStage("supportive", "full"), "supportive_action_confirm");
});

test("resolveAfterExecutionModeChoice 'full' goes straight to the route's confirm screen with no miniArcStage set", () => {
  const result = resolveAfterExecutionModeChoice("urge", createEmptyArcGoalLiveState(), "full");
  assert.equal(result.uiStage, "urge_action_confirm");
  assert.equal(result.goalState.executionMode, "full");
  assert.equal(result.goalState.miniArcStage, null);
});

test("resolveAfterExecutionModeChoice 'mini' goes to mini_arc_embedded, starting at 'regulation'", () => {
  const result = resolveAfterExecutionModeChoice("supportive", createEmptyArcGoalLiveState(), "mini");
  assert.equal(result.uiStage, "mini_arc_embedded");
  assert.equal(result.goalState.executionMode, "mini");
  assert.equal(result.goalState.miniArcStage, "regulation");
});

// --- resolveAfterEmbeddedMiniArcStage

test("resolveAfterEmbeddedMiniArcStage walks 'regulation' -> 'encoding' first", () => {
  const state = { ...createEmptyArcGoalLiveState(), miniArcStage: "regulation" as const };
  const result = resolveAfterEmbeddedMiniArcStage("urge", state);
  assert.equal(result.uiStage, "mini_arc_embedded");
  assert.equal(result.goalState.miniArcStage, "encoding");
});

test("resolveAfterEmbeddedMiniArcStage hands off from 'encoding' to the route's own bridge confirm screen, clearing miniArcStage", () => {
  const state = { ...createEmptyArcGoalLiveState(), miniArcStage: "encoding" as const };
  const urgeResult = resolveAfterEmbeddedMiniArcStage("urge", state);
  assert.equal(urgeResult.uiStage, "urge_action_confirm");
  assert.equal(urgeResult.goalState.miniArcStage, null);
  const supportiveResult = resolveAfterEmbeddedMiniArcStage("supportive", state);
  assert.equal(supportiveResult.uiStage, "supportive_action_confirm");
  assert.equal(supportiveResult.goalState.miniArcStage, null);
});

// --- resolveAfterBridgeConfirmed

test("resolveAfterBridgeConfirmed marks reassessmentResolved, resumes at outer, and clears the bridge-only fields", () => {
  const state: ArcGoalLiveState = {
    ...createEmptyArcGoalLiveState(),
    reassessmentChoice: "urge",
    selectedUrgeMappingId: "um1",
    executionMode: "mini",
    miniArcStage: "encoding",
  };
  const result = resolveAfterBridgeConfirmed(state);
  assert.equal(result.reassessmentResolved, true);
  assert.equal(result.uiStage, "outer");
  assert.equal(result.executionMode, null);
  assert.equal(result.miniArcStage, null);
  // The selection itself is preserved -- only the bridge-only transient fields are cleared.
  assert.equal(result.selectedUrgeMappingId, "um1");
});

// --- Copy builders

test("getSupportiveActionConfirmCopy shows exactly the mapping's own supportiveAction, never that protocol's internalAction", () => {
  const m = mapping({ supportiveAction: "נשימה עמוקה אחת" });
  assert.equal(getSupportiveActionConfirmCopy(m).body, "נשימה עמוקה אחת");
});

test("getUrgeActionConfirmCopy shows exactly the UrgeArc's own beneficialAlternativeAction", () => {
  const u = urgeArc({ beneficialAlternativeAction: "לצאת להליכה קצרה" });
  assert.equal(getUrgeActionConfirmCopy(u).body, "לצאת להליכה קצרה");
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

test("getTriggerIdentificationCopy uses the exact spec wording and never asks the trainee to evoke/intensify anything", () => {
  const copy = getTriggerIdentificationCopy();
  assert.equal(copy.title, "מה הפעיל אצלך את הרגש או את הדחף?");
  assert.equal(containsInductionPattern(copy.title), false);
});

test("getThirdPersonImageryCopy's segments use the exact spec wording, pass the induction-pattern safety check, and carry a trailing dwell segment", () => {
  const copy = getThirdPersonImageryCopy(identityProfile());
  assert.ok(copy.segments && copy.segments.length >= 2, "at least the two spec lines, plus the trailing dwell segment");
  assert.match(copy.body, /דמיין את המצב מהצד/);
  assert.match(copy.body, /דמיין שאתה מזהה את הרגע/);
  assert.equal(containsInductionPattern(copy.body), false);
  for (const segment of copy.segments!) {
    assert.equal(containsInductionPattern(segment.text), false, `segment "${segment.text}" must never trip the induction-pattern denylist`);
  }
});

test("getThirdPersonImageryCopy never instructs the trainee to intensify the feeling or urge", () => {
  const copy = getThirdPersonImageryCopy(identityProfile());
  assert.match(copy.body, /בלי לנסות להגביר אותו/);
});

test("getUrgeNeedIdentificationCopy uses the exact spec wording", () => {
  const copy = getUrgeNeedIdentificationCopy();
  assert.equal(copy.title, "על איזה צורך הדחף מנסה לענות?");
  assert.equal(containsInductionPattern(copy.title), false);
});

// --- findUrgeArcForNeed

test("findUrgeArcForNeed resolves the first urge mapping whose own need matches, via urgeArcsById", () => {
  const u = urgeArc({ id: "urge-1" });
  const g = goal({ urgeMappings: [urgeMapping({ urgeArcId: "urge-1", need: "רגיעה" })] });
  const result = findUrgeArcForNeed(g, { "urge-1": u }, "רגיעה");
  assert.equal(result, u);
});

test("findUrgeArcForNeed returns null when no mapping matches the need, or the reference no longer resolves", () => {
  const g = goal({ urgeMappings: [urgeMapping({ urgeArcId: "urge-1", need: "רגיעה" })] });
  assert.equal(findUrgeArcForNeed(g, { "urge-1": urgeArc() }, "שליטה"), null, "no mapping matches this need");
  assert.equal(findUrgeArcForNeed(g, {}, "רגיעה"), null, "the referenced UrgeArc was deleted");
});

test("findUrgeArcForNeed never invents a preview for the 'still don't know' sentinel", () => {
  const g = goal({ urgeMappings: [urgeMapping({ urgeArcId: "urge-1", need: IDENTIFIED_NEED_UNKNOWN })] });
  assert.equal(findUrgeArcForNeed(g, { "urge-1": urgeArc() }, IDENTIFIED_NEED_UNKNOWN), null);
});

// ---------------------------------------------------------------------------
// Full-walk integration tests: drive the REAL engine (advanceLiveSession,
// the exact function live/ArcGoalSessionScreen.tsx itself calls) through
// the outer identity run plus a transient inner run, exactly mirroring
// that screen's own orchestration logic without any React involved.
// Covers all five post-reassessment route combinations: urge/full,
// urge/mini, supportive/full, supportive/mini, and direct.
// ---------------------------------------------------------------------------

interface WalkResult {
  uiStage: ArcGoalUiStage;
  goalState: ArcGoalLiveState;
  outerStage: ArcStage;
  outerSession: ReturnType<typeof createArcGoalOuterInitialSession>;
  sawTriggerPrefix: boolean;
  sawReassessment: boolean;
  sawInnerRun: boolean;
}

function runFullWalk(options: {
  g: ArcGoal;
  identity: ArcBuildProfile;
  reassessmentChoice: "urge" | "supportive" | "direct";
  supportiveProfile?: ArcBuildProfile;
  urgeProfile?: ArcBuildProfile;
  executionModePick?: "full" | "mini";
  miniArcSteps?: number; // how many mini_arc_embedded continues to apply (regulation, encoding)
}): WalkResult {
  const { g, identity, reassessmentChoice, supportiveProfile, urgeProfile, executionModePick, miniArcSteps = 2 } = options;

  let outerSession = createArcGoalOuterInitialSession();
  let outerStage: ArcStage = "trigger_selection";
  {
    const hop = advanceLiveSession(outerStage, outerSession, identity, ["identity"]);
    outerSession = hop.session;
    outerStage = hop.stage;
  }
  assert.equal(outerStage, "presence_check");

  let innerSession = createArcGoalInnerInitialSession();
  let innerStage: ArcStage = "sensation_check";
  let goalState = createEmptyArcGoalLiveState();
  let uiStage: ArcGoalUiStage = "outer";
  let sawTriggerPrefix = false;
  let sawReassessment = false;
  let sawInnerRun = false;
  let miniStepsApplied = 0;

  let iterations = 0;
  while (uiStage !== "goal_action_confirm" && iterations < 120) {
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

      if (needsTriggerPrefixDetour(outerStage, goalState)) {
        uiStage = "trigger_identification";
        continue;
      }
      if (outerStage === "desired_state_check" && needsReassessmentDetour(g, goalState)) {
        uiStage = "reassessment";
        continue;
      }
      if (outerStage === "complete") {
        uiStage = "goal_action_confirm";
      }
      continue;
    }

    if (uiStage === "trigger_identification") {
      sawTriggerPrefix = true;
      goalState = resolveAfterTriggerIdentification(goalState, "מצב לדוגמה");
      uiStage = goalState.uiStage;
      continue;
    }

    if (uiStage === "third_person_imagery") {
      goalState = resolveAfterThirdPersonImagery(g, goalState);
      uiStage = goalState.uiStage;
      continue;
    }

    if (uiStage === "urge_need_identification") {
      goalState = resolveAfterUrgeNeedIdentification(goalState, "רגיעה");
      uiStage = goalState.uiStage;
      continue;
    }

    if (uiStage === "reassessment") {
      sawReassessment = true;
      const hop = resolveAfterReassessment(reassessmentChoice, g, goalState, {});
      uiStage = hop.uiStage;
      goalState = hop.goalState;
      if (uiStage === "inner") {
        innerSession = reassessmentChoice === "urge" ? createArcGoalUrgeInnerInitialSession() : createArcGoalInnerInitialSession();
        innerStage = "sensation_check";
      }
      continue;
    }

    if (uiStage === "urge_select") {
      const only = g.urgeMappings[0];
      goalState = selectUrgeMapping(goalState, only.id, g, {});
      uiStage = goalState.uiStage;
      innerSession = createArcGoalUrgeInnerInitialSession();
      innerStage = "sensation_check";
      continue;
    }

    if (uiStage === "supportive_state_select") {
      const only = g.interferingMappings[0];
      goalState = selectSupportiveMapping(goalState, only.id);
      uiStage = goalState.uiStage;
      innerSession = createArcGoalInnerInitialSession();
      innerStage = "sensation_check";
      continue;
    }

    if (uiStage === "inner") {
      sawInnerRun = true;
      const profile = reassessmentChoice === "urge" ? urgeProfile! : supportiveProfile!;
      const activeLayers = reassessmentChoice === "urge" ? (["habit"] as const) : (["state"] as const);
      if (innerStage === "sensation_check") {
        innerSession = { ...innerSession, sensationIntensity: 2, sensationLocation: "חזה" };
      }
      const hop = advanceLiveSession(innerStage, innerSession, profile, activeLayers as never);
      innerSession = hop.session;
      innerStage = hop.stage;
      if (shouldInterceptInnerAtAct(innerStage)) {
        const route = reassessmentChoice === "urge" ? "urge" : "supportive";
        const configuredMode = (route === "urge" ? resolveSelectedUrgeMapping(g, goalState)! : resolveSelectedMapping(g, goalState)!).executionMode!;
        const hasMiniArc = (route === "urge" ? resolveSelectedUrgeMapping(g, goalState)! : resolveSelectedMapping(g, goalState)!).miniArcId !== null;
        const resolvedMode = resolveExecutionMode(configuredMode, hasMiniArc);
        if (resolvedMode === "choose") {
          uiStage = "execution_mode_choice";
        } else {
          const nextUiStage = resolveBridgeEntryUiStage(route, resolvedMode);
          goalState = { ...goalState, uiStage: nextUiStage, executionMode: resolvedMode, miniArcStage: resolvedMode === "mini" ? "regulation" : null };
          uiStage = nextUiStage;
        }
      }
      continue;
    }

    if (uiStage === "execution_mode_choice") {
      const route = reassessmentChoice === "urge" ? "urge" : "supportive";
      const hop = resolveAfterExecutionModeChoice(route, goalState, executionModePick!);
      uiStage = hop.uiStage;
      goalState = hop.goalState;
      continue;
    }

    if (uiStage === "mini_arc_embedded") {
      const route = reassessmentChoice === "urge" ? "urge" : "supportive";
      if (miniStepsApplied < miniArcSteps) {
        miniStepsApplied++;
      }
      const hop = resolveAfterEmbeddedMiniArcStage(route, goalState);
      uiStage = hop.uiStage;
      goalState = hop.goalState;
      continue;
    }

    if (uiStage === "urge_action_confirm" || uiStage === "supportive_action_confirm") {
      goalState = resolveAfterBridgeConfirmed(goalState);
      uiStage = "outer";
      continue;
    }
  }

  return { uiStage, goalState, outerStage, outerSession, sawTriggerPrefix, sawReassessment, sawInnerRun };
}

test("full walk (direct route): trigger prefix runs once, reassessment offers 'direct', and the outer run reaches completion with no inner run at all", () => {
  const identity = identityProfile();
  const g = goal({ urgeMappings: [urgeMapping()], interferingMappings: [mapping()] });
  const result = runFullWalk({ g, identity, reassessmentChoice: "direct" });
  assert.equal(result.uiStage, "goal_action_confirm");
  assert.equal(result.sawTriggerPrefix, true);
  assert.equal(result.sawReassessment, true);
  assert.equal(result.sawInnerRun, false, "the direct route never touches urge/supportive protocols");
  assert.equal(result.outerStage, "complete");
  assert.equal(result.goalState.reassessmentChoice, "direct");
});

test("full walk (urge/full route): reaches goal_action_confirm via the real urge inner run and the urge_action_confirm bridge", () => {
  const identity = identityProfile();
  const urge = urgeArc({ beneficialAlternativeAction: "לשתות כוס מים" });
  const g = goal({ urgeMappings: [urgeMapping({ urgeArcId: urge.id, executionMode: "full" })] });
  const urgeProfile = urgeArcToProfile(urge);
  const result = runFullWalk({ g, identity, reassessmentChoice: "urge", urgeProfile });
  assert.equal(result.uiStage, "goal_action_confirm");
  assert.equal(result.sawInnerRun, true);
  assert.equal(result.outerStage, "complete");
  assert.equal(result.goalState.reassessmentResolved, true);
  assert.equal(result.goalState.executionMode, null, "cleared once the bridge is confirmed");
});

test("full walk (urge/mini route): the embedded Mini ARC's regulation/encoding steps run before handing off to the SAME urge_action_confirm bridge", () => {
  const identity = identityProfile();
  const urge = urgeArc();
  const g = goal({ urgeMappings: [urgeMapping({ urgeArcId: urge.id, executionMode: "mini", miniArcId: "mini-1" })] });
  const urgeProfile = urgeArcToProfile(urge);
  const result = runFullWalk({ g, identity, reassessmentChoice: "urge", urgeProfile });
  assert.equal(result.uiStage, "goal_action_confirm");
  assert.equal(result.outerStage, "complete");
});

test("full walk (supportive/full route): reaches goal_action_confirm via the real supportive-state inner run and the supportive_action_confirm bridge", () => {
  const identity = identityProfile();
  const supportive: ArcBuildProfile = {
    ...createEmptyArcBuildProfile(),
    supportiveState: "אנרגיה",
    interferingState: "עייפות",
    internalAction: "לשתות מים",
    regulationTool: "נשימה",
    presenceColor: "כחול",
  };
  const g = goal({ interferingMappings: [mapping({ supportiveProtocolId: "state-1", executionMode: "full" })] });
  const result = runFullWalk({ g, identity, reassessmentChoice: "supportive", supportiveProfile: supportive });
  assert.equal(result.uiStage, "goal_action_confirm");
  assert.equal(result.sawInnerRun, true);
  assert.equal(result.outerStage, "complete");
});

test("full walk (supportive/mini route): the embedded Mini ARC's steps run before handing off to the SAME supportive_action_confirm bridge", () => {
  const identity = identityProfile();
  const supportive: ArcBuildProfile = {
    ...createEmptyArcBuildProfile(),
    supportiveState: "אנרגיה",
    interferingState: "עייפות",
    internalAction: "לשתות מים",
    regulationTool: "נשימה",
    presenceColor: "כחול",
  };
  const g = goal({ interferingMappings: [mapping({ supportiveProtocolId: "state-1", executionMode: "mini", miniArcId: "mini-1" })] });
  const result = runFullWalk({ g, identity, reassessmentChoice: "supportive", supportiveProfile: supportive });
  assert.equal(result.uiStage, "goal_action_confirm");
  assert.equal(result.outerStage, "complete");
});

test("full walk (urge/choose route): a 'choose' mapping prompts execution_mode_choice live, and picking 'full' reaches the same bridge", () => {
  const identity = identityProfile();
  const urge = urgeArc();
  const g = goal({ urgeMappings: [urgeMapping({ urgeArcId: urge.id, executionMode: "choose" })] });
  const urgeProfile = urgeArcToProfile(urge);
  const result = runFullWalk({ g, identity, reassessmentChoice: "urge", urgeProfile, executionModePick: "full" });
  assert.equal(result.uiStage, "goal_action_confirm");
});

test("full walk: a mapping configured for 'mini' whose Mini ARC was deleted (miniArcId null) falls back safely to the full bridge", () => {
  const identity = identityProfile();
  const urge = urgeArc();
  // executionMode "mini" but no miniArcId configured -- resolveExecutionMode must fall back to "full".
  const g = goal({ urgeMappings: [urgeMapping({ urgeArcId: urge.id, executionMode: "mini", miniArcId: null })] });
  const urgeProfile = urgeArcToProfile(urge);
  const result = runFullWalk({ g, identity, reassessmentChoice: "urge", urgeProfile });
  assert.equal(result.uiStage, "goal_action_confirm");
  assert.equal(result.goalState.reassessmentResolved, true);
});

// ---------------------------------------------------------------------------
// Bug-fix task: full-walk integration tests for the state-clarification
// decision gate, driving the REAL engine (advanceLiveSession) exactly
// like the full-walk tests above, but starting from the session's actual
// first screen (the decision gate) instead of assuming it's already
// resolved. Confirms Presence rating is required and appears in BOTH
// routes, the state-clarification screen appears ONLY for "כן", and the
// existing emotion/urge support route (reassessment) fires ONLY for
// "כן" -- never for "לא", even when the goal has mappings configured.
// ---------------------------------------------------------------------------

test("full walk from the decision gate ('כן'): Presence rating is required, the state-clarification screen runs, and the existing emotion/urge support route still fires afterward", () => {
  const identity = identityProfile();
  const g = goal({ urgeMappings: [urgeMapping()], interferingMappings: [mapping()] });

  // The outer run's own presence_check hop already runs silently in the
  // background the moment the session mounts (live/ArcGoalSessionScreen.tsx's
  // own kick-start effect), completely independent of the decision gate.
  let outerSession = createArcGoalOuterInitialSession();
  let outerStage: ArcStage = "trigger_selection";
  {
    const hop = advanceLiveSession(outerStage, outerSession, identity, ["identity"]);
    outerSession = hop.session;
    outerStage = hop.stage;
  }
  assert.equal(outerStage, "presence_check");

  let goalState = createEmptyArcGoalLiveState();
  assert.equal(goalState.uiStage, "state_clarification_decision", "the decision gate is the session's very first RENDERED screen -- before Presence rating is ever shown");

  goalState = resolveAfterStateClarificationDecision(true, goalState);
  assert.equal(goalState.uiStage, "trigger_identification", "'כן' continues to the existing state-clarification screen");

  goalState = resolveAfterTriggerIdentification(goalState, "מצב לדוגמה");
  assert.equal(goalState.uiStage, "third_person_imagery");

  goalState = resolveAfterThirdPersonImagery(g, goalState);
  assert.equal(goalState.uiStage, "urge_need_identification", "this goal has urge mappings, so Urge Need Identification still runs once, unchanged");

  goalState = resolveAfterUrgeNeedIdentification(goalState, "רגיעה");
  assert.equal(goalState.uiStage, "outer", "the state-clarification prefix resolves and hands back to the outer run");
  assert.equal(goalState.triggerPrefixResolved, true);

  // Presence rating is what renders next -- the outer run's own stage
  // was never touched by any of the state-clarification steps above.
  assert.equal(outerStage, "presence_check", "Presence rating is required in this route and appears right after the state-clarification screen");

  outerSession = { ...outerSession, presenceRating: 8 };
  let uiStage: "outer" | "reassessment" = "outer";
  let iterations = 0;
  while (uiStage === "outer" && iterations < 20) {
    iterations++;
    const hop = advanceLiveSession(outerStage, outerSession, identity, ["identity"]);
    outerSession = hop.session;
    outerStage = hop.stage;
    assert.equal(needsTriggerPrefixDetour(outerStage, goalState), false, "the trigger prefix must never re-intercept once triggerPrefixResolved is true");
    if (outerStage === "desired_state_check" && needsReassessmentDetour(g, goalState)) {
      uiStage = "reassessment";
    }
  }
  assert.equal(outerStage, "desired_state_check", "the existing Presence-rating-based ARC Thought routing runs unmodified before the identity-and-habit protocol's own first stage");
  assert.equal(uiStage, "reassessment", "the existing emotion/urge support route still fires after Presence + ARC Thought, since this goal has mappings configured");
});

test("full walk from the decision gate ('לא'): Presence rating is required and its existing rating-based routing runs, but the state-clarification screen and the emotion/urge support route are both skipped", () => {
  const identity = identityProfile();
  const g = goal({ urgeMappings: [urgeMapping()], interferingMappings: [mapping()] });

  let outerSession = createArcGoalOuterInitialSession();
  let outerStage: ArcStage = "trigger_selection";
  {
    const hop = advanceLiveSession(outerStage, outerSession, identity, ["identity"]);
    outerSession = hop.session;
    outerStage = hop.stage;
  }
  assert.equal(outerStage, "presence_check");

  let goalState = createEmptyArcGoalLiveState();
  assert.equal(goalState.uiStage, "state_clarification_decision");

  goalState = resolveAfterStateClarificationDecision(false, goalState);
  assert.equal(goalState.uiStage, "outer", "'לא' skips the state-clarification screen entirely -- it never appears");
  assert.equal(goalState.triggerPrefixResolved, true);
  assert.equal(goalState.reassessmentResolved, true);

  // Presence rating still renders next, unconditionally, in this route too.
  assert.equal(outerStage, "presence_check", "Presence rating is required in this route too, immediately after the decision (with no state-clarification screen in between)");

  outerSession = { ...outerSession, presenceRating: 8 };
  let sawReassessment = false;
  let iterations = 0;
  while (outerStage !== "desired_state_check" && iterations < 20) {
    iterations++;
    const hop = advanceLiveSession(outerStage, outerSession, identity, ["identity"]);
    outerSession = hop.session;
    outerStage = hop.stage;
    assert.equal(needsTriggerPrefixDetour(outerStage, goalState), false, "the state-clarification screen must never appear on this route, at any point");
    if (outerStage === "desired_state_check" && needsReassessmentDetour(g, goalState)) {
      sawReassessment = true;
    }
  }
  assert.equal(outerStage, "desired_state_check", "the existing Presence-rating-based ARC Thought routing still runs unmodified, leading straight into the identity-and-habit protocol's own first stage");
  assert.equal(
    sawReassessment,
    false,
    "the emotion/urge support route must never fire on this route, even though this goal has urge/interfering mappings configured"
  );
});

// ---------------------------------------------------------------------------
// ARC Urge Stop Action/Encoding task
// ---------------------------------------------------------------------------

test("getUrgeStopActionCopy shows the urge's own configured Stop Action plus the existing free-breathing safety line", () => {
  const u = urgeArc({ stopCue: "להניח את הטלפון" });
  const copy = getUrgeStopActionCopy(u);
  assert.equal(copy.title, URGE_STOP_ACTION_TITLE);
  assert.match(copy.body, /להניח את הטלפון/);
  assert.match(copy.body, /נשימה/, "the existing natural-breathing safety line is preserved");
});

test("getUrgeStopActionCopy never asks the trainee to evoke, intensify, or hold the urge", () => {
  const u = urgeArc({ stopCue: "לצאת מהאפליקציה" });
  const copy = getUrgeStopActionCopy(u);
  assert.equal(containsInductionPattern(copy.body), false);
});

test("resolveAfterUrgeStopAction moves straight into the inner run's own first stage", () => {
  const result = resolveAfterUrgeStopAction(createEmptyArcGoalLiveState());
  assert.equal(result.uiStage, "inner");
});

test("resolveAfterReassessment (urge, single mapping) routes to urge_stop_action when the resolved UrgeArc has a configured Stop Action", () => {
  const u = urgeArc({ id: "urge-1", stopCue: "להניח את הטלפון" });
  const g = goal({ urgeMappings: [urgeMapping({ id: "only-urge", urgeArcId: "urge-1" })] });
  const result = resolveAfterReassessment("urge", g, createEmptyArcGoalLiveState(), { "urge-1": u });
  assert.equal(result.uiStage, "urge_stop_action");
  assert.equal(result.goalState.selectedUrgeMappingId, "only-urge");
});

test("resolveAfterReassessment (urge, single mapping) goes straight to inner when the resolved UrgeArc has no Stop Action configured -- safe continuation for legacy programs", () => {
  const u = urgeArc({ id: "urge-1", stopCue: null });
  const g = goal({ urgeMappings: [urgeMapping({ id: "only-urge", urgeArcId: "urge-1" })] });
  const result = resolveAfterReassessment("urge", g, createEmptyArcGoalLiveState(), { "urge-1": u });
  assert.equal(result.uiStage, "inner");
});

test("resolveAfterReassessment (urge, single mapping) goes straight to inner when the referenced UrgeArc no longer resolves -- handles a deleted reference safely", () => {
  const g = goal({ urgeMappings: [urgeMapping({ id: "only-urge", urgeArcId: "deleted-urge" })] });
  const result = resolveAfterReassessment("urge", g, createEmptyArcGoalLiveState(), {});
  assert.equal(result.uiStage, "inner");
});

test("selectUrgeMapping routes to urge_stop_action when the picked urge has a configured Stop Action", () => {
  const u = urgeArc({ id: "urge-2", stopCue: "לעצור לרגע במקום" });
  const g = goal({ urgeMappings: [urgeMapping({ id: "um-a" }), urgeMapping({ id: "um-b", urgeArcId: "urge-2" })] });
  const result = selectUrgeMapping(createEmptyArcGoalLiveState(), "um-b", g, { "urge-2": u });
  assert.equal(result.uiStage, "urge_stop_action");
  assert.equal(result.selectedUrgeMappingId, "um-b");
});

test("selectUrgeMapping goes straight to inner when the picked urge has no Stop Action configured", () => {
  const u = urgeArc({ id: "urge-2", stopCue: null });
  const g = goal({ urgeMappings: [urgeMapping({ id: "um-b", urgeArcId: "urge-2" })] });
  const result = selectUrgeMapping(createEmptyArcGoalLiveState(), "um-b", g, { "urge-2": u });
  assert.equal(result.uiStage, "inner");
});

test("urgeArcToProfile builds habitEncoding from the urge's own bodyLanguageCue/encodingMantra when either is configured", () => {
  const u = urgeArc({ bodyLanguageCue: "כתפיים רפויות", encodingMantra: "אני בוחר", beneficialAlternativeAction: "לשתות מים" });
  const profile = urgeArcToProfile(u);
  assert.notEqual(profile.habitEncoding, null);
  assert.equal(profile.habitEncoding?.bodyLanguageCue, "כתפיים רפויות");
  assert.equal(profile.habitEncoding?.mantra, "אני בוחר");
  assert.equal(profile.habitEncoding?.target, "לשתות מים");
});

test("urgeArcToProfile leaves habitEncoding null when the urge configured neither bodyLanguageCue nor encodingMantra -- the habit layer's Encoding stage falls back to its existing generic line, unchanged", () => {
  const u = urgeArc({ bodyLanguageCue: null, encodingMantra: null });
  const profile = urgeArcToProfile(u);
  assert.equal(profile.habitEncoding, null);
});

test("urgeArcToProfile builds habitEncoding when only ONE of bodyLanguageCue/encodingMantra is configured, leaving the other field null", () => {
  const u = urgeArc({ bodyLanguageCue: "מבט קדימה", encodingMantra: null });
  const profile = urgeArcToProfile(u);
  assert.notEqual(profile.habitEncoding, null);
  assert.equal(profile.habitEncoding?.bodyLanguageCue, "מבט קדימה");
  assert.equal(profile.habitEncoding?.mantra, null);
});
