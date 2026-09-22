import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  advanceAwarenessRecognition,
  advanceEmbeddedPresenceStage,
  advanceStep,
  advanceTail,
  answerPresenceOptionalOffer,
  answerReassessment,
  answerStateDecision,
  beginMiniPresenceIntervention,
  chooseTiePrimaryFactor,
  completeFullPresenceSubSession,
  completeSession,
  confirmActionCompleted,
  createCombinedLiveSession,
  markActionReached,
  recordAwarenessRating,
  recordDesiredStateRating,
  recordStepRating,
} from "./combinedLiveSession.ts";
import type { CombinedLiveSessionState, CreateCombinedLiveSessionInput } from "./combinedLiveSession.ts";
import { createEmptyPersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import type { PersonalDevelopmentRouteConfig } from "./personalDevelopmentRouteConfig.ts";
import { createEmptyBeliefInterferenceItem, createEmptyEmotionInterferenceItem, createEmptyThoughtInterferenceItem, createEmptyUrgeInterferenceItem } from "./interferenceItem.ts";
import type { BeliefInterferenceItem, EmotionInterferenceItem, InterferenceItem, ThoughtInterferenceItem, UrgeInterferenceItem } from "./interferenceItem.ts";
import { createEmptyStateProfile } from "./stateProfile.ts";
import type { StateProfile } from "./stateProfile.ts";
import type { PresenceArc } from "./types.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function config(overrides: Partial<PersonalDevelopmentRouteConfig> = {}): PersonalDevelopmentRouteConfig {
  return { ...createEmptyPersonalDevelopmentRouteConfig("route1", "prog1", NOW), ...overrides };
}
function thought(overrides: Partial<ThoughtInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyThoughtInterferenceItem("t1", "מחשבה", null, NOW), schemaVersion: 2, beneficialActionAgainstFactor: "פעולת מחשבה", ...overrides };
}
function belief(overrides: Partial<BeliefInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyBeliefInterferenceItem("b1", "אמונה", null, NOW), schemaVersion: 2, beneficialActionAgainstFactor: "פעולת אמונה", ...overrides };
}
function urge(overrides: Partial<UrgeInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyUrgeInterferenceItem("u1", "דחף", null, NOW), schemaVersion: 2, beneficialActionAgainstFactor: "פעולת דחף", preventiveStoppingAction: "עצור", ...overrides };
}
function emotion(overrides: Partial<EmotionInterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyEmotionInterferenceItem("e1", "רגש", null, NOW), ...overrides };
}
function completeState(overrides: Partial<StateProfile> = {}): StateProfile {
  return { ...createEmptyStateProfile("s1", "מצב", null, NOW), regulationAnchor: "עוגן", encodingCue: "קידוד", action: "פעולת המצב", ...overrides };
}
function presenceArc(overrides: Partial<PresenceArc> = {}): PresenceArc {
  return { id: "p1", name: "נוכחות", createdAt: NOW, updatedAt: NOW, presenceColor: null, presenceDwellSeconds: null, beneficialAction: "פעולת נוכחות", postActionImageryDwellSeconds: null, gratitudePrompt: null, ...overrides };
}

function baseInput(overrides: Partial<CreateCombinedLiveSessionInput> = {}): CreateCombinedLiveSessionInput {
  return {
    mode: "full",
    config: config(),
    items: [],
    stateProfiles: [],
    presenceArcs: [],
    startedAt: NOW,
    generateSessionId: () => "session-1",
    ...overrides,
  };
}

/** Walks a Full session all the way through Awareness for the given factors, feeding the same `value` rating to every factor, and returns the resulting state. Asserts along the way that only "recognition"/"rating_checkpoint" steps are encountered. */
function completeAwareness(state: CombinedLiveSessionState, ratings: { itemId: string; factorType: Parameters<typeof recordAwarenessRating>[2]; value: number }[]): CombinedLiveSessionState {
  let s = state;
  assert.equal(s.phase, "awareness");
  // Walk every recognition step.
  while (s.phase === "awareness" && s.awarenessSteps[s.awarenessIndex]?.kind === "recognition") {
    s = advanceAwarenessRecognition(s);
  }
  for (const r of ratings) {
    if (s.phase !== "awareness") break;
    s = recordAwarenessRating(s, r.itemId, r.factorType, r.value);
  }
  return s;
}

// ---------------------------------------------------------------------------
// 1. Route snapshot stability
// ---------------------------------------------------------------------------

test("route snapshot remains stable after source objects change post-creation", () => {
  const items = [thought()];
  const cfg = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  const state = createCombinedLiveSession(baseInput({ items, config: cfg }));
  assert.equal(state.snapshot.items.length, 1);
  items.push(belief());
  cfg.interferenceItemIds.push("b1");
  assert.equal(state.snapshot.items.length, 1, "later push onto the caller's own items array must not appear in the frozen snapshot");
  assert.deepEqual(state.snapshot.config.interferenceItemIds, ["t1"], "later mutation of the caller's own config array must not appear in the frozen snapshot");
});

// ---------------------------------------------------------------------------
// 2. Session ID stability
// ---------------------------------------------------------------------------

test("session ID remains stable across every transition", () => {
  let state = createCombinedLiveSession(baseInput({ mode: "mini", items: [thought()], config: config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" }) }));
  const id = state.sessionId;
  state = advanceStep(state);
  assert.equal(state.sessionId, id);
  state = markActionReached(state);
  assert.equal(state.sessionId, id);
  state = confirmActionCompleted(state);
  assert.equal(state.sessionId, id);
  state = advanceTail(state);
  assert.equal(state.sessionId, id);
});

// ---------------------------------------------------------------------------
// 3-4. State decision Yes/No, Emotion rejects No-State
// ---------------------------------------------------------------------------

test("decide_in_live State decision: Yes includes the one saved candidate State, No continues without it -- never rewrites the route config", () => {
  const cfg = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "different_actions" } }, stateInclusionPolicy: "decide_in_live", stateProfileId: "s1" });
  const yesState = completeAwareness(
    createCombinedLiveSession(baseInput({ items: [thought()], config: cfg, stateProfiles: [completeState()] })),
    [{ itemId: "t1", factorType: "thought", value: 5 }]
  );
  assert.equal(yesState.phase, "state_decision");
  const afterYes = answerStateDecision(yesState, true);
  assert.equal(afterYes.phase, "steps");
  assert.equal(afterYes.resolvedPlan?.stateIncluded, true);
  assert.equal(cfg.stateInclusionPolicy, "decide_in_live", "the saved route config's own policy is never rewritten");

  const noState = completeAwareness(
    createCombinedLiveSession(baseInput({ items: [thought()], config: cfg, stateProfiles: [completeState()] })),
    [{ itemId: "t1", factorType: "thought", value: 5 }]
  );
  const afterNo = answerStateDecision(noState, false);
  assert.equal(afterNo.phase, "steps");
  assert.equal(afterNo.resolvedPlan?.stateIncluded, false);
});

test("Emotion can never resolve through a No-State branch -- a decide_in_live Emotion route is structurally invalid, never even reaching a state_decision phase", () => {
  const cfg = config({ interferenceItemIds: ["e1"], itemRelationships: { e1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "decide_in_live", stateProfileId: "s1" });
  const state = createCombinedLiveSession(baseInput({ items: [emotion()], config: cfg, stateProfiles: [completeState()] }));
  assert.equal(state.phase, "invalid");
  assert.notEqual(state.phase, "state_decision" as string);
});

// ---------------------------------------------------------------------------
// 5-7. Full baseline ratings, tie, primary frozen
// ---------------------------------------------------------------------------

test("Full: every selected factor gets its own separate afterAwareness rating before the primary factor resolves", () => {
  const cfg = config({
    interferenceItemIds: ["t1", "u1"],
    itemRelationships: { t1: { actionRelationship: "legacy_unspecified" }, u1: { actionRelationship: "legacy_unspecified" } },
    stateInclusionPolicy: "none",
  });
  let state = createCombinedLiveSession(baseInput({ items: [thought(), urge()], config: cfg }));
  while (state.awarenessSteps[state.awarenessIndex]?.kind === "recognition") state = advanceAwarenessRecognition(state);
  state = recordAwarenessRating(state, "t1", "thought", 8);
  assert.equal(state.phase, "awareness", "still awaiting the second factor's own rating");
  assert.equal(state.factorRatingHistory.length, 1);
  state = recordAwarenessRating(state, "u1", "urge", 3);
  assert.equal(state.factorRatingHistory.filter((r) => r.checkpoint === "afterAwareness").length, 2);
  assert.equal(state.primaryFactorId, "t1", "unique winner (8 > 3) resolves silently, no tie question");
});

test("a baseline tie asks the exact required question immediately, before any further step renders", () => {
  const cfg = config({
    interferenceItemIds: ["t1", "u1"],
    itemRelationships: { t1: { actionRelationship: "legacy_unspecified" }, u1: { actionRelationship: "legacy_unspecified" } },
    stateInclusionPolicy: "none",
  });
  const state = completeAwareness(createCombinedLiveSession(baseInput({ items: [thought(), urge()], config: cfg })), [
    { itemId: "t1", factorType: "thought", value: 6 },
    { itemId: "u1", factorType: "urge", value: 6 },
  ]);
  assert.equal(state.phase, "primary_choice");
  assert.deepEqual(state.pendingPrimaryFactorCandidates?.sort(), ["t1", "u1"]);
  assert.equal(state.primaryFactorId, null, "not yet frozen");
});

test("the frozen primary factor is never replaced by a later checkpoint rating", () => {
  const cfg = config({
    interferenceItemIds: ["t1", "u1"],
    itemRelationships: { t1: { actionRelationship: "legacy_unspecified" }, u1: { actionRelationship: "legacy_unspecified" } },
    stateInclusionPolicy: "none",
  });
  let state = completeAwareness(createCombinedLiveSession(baseInput({ items: [thought(), urge()], config: cfg })), [
    { itemId: "t1", factorType: "thought", value: 8 },
    { itemId: "u1", factorType: "urge", value: 2 },
  ]);
  assert.equal(state.primaryFactorId, "t1");
  assert.equal(state.phase, "steps");
  // Walk to the afterStayAcceptance checkpoint and rate Urge far higher than Thought.
  while (state.phase === "steps" && state.remainingSteps[state.stepIndex]?.kind !== "rating_checkpoint") state = advanceStep(state);
  state = recordStepRating(state, "u1", "urge", "afterStayAcceptance", 10);
  state = recordStepRating(state, "t1", "thought", "afterStayAcceptance", 1);
  assert.equal(state.primaryFactorId, "t1", "later ratings never replace the frozen primary factor");
});

// ---------------------------------------------------------------------------
// 8-9. Two- vs three-checkpoint routes
// ---------------------------------------------------------------------------

test("a no-State Full route walks exactly two checkpoints (afterAwareness, afterStayAcceptance) -- never a fabricated afterStateRegulation", () => {
  const cfg = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  let state = completeAwareness(createCombinedLiveSession(baseInput({ items: [thought()], config: cfg })), [{ itemId: "t1", factorType: "thought", value: 7 }]);
  const checkpoints = state.remainingSteps.filter((s) => s.kind === "rating_checkpoint").map((s) => (s as { checkpoint: string }).checkpoint);
  assert.deepEqual(checkpoints, ["afterStayAcceptance"]);
});

test("a with-State Full route walks the third checkpoint (afterStateRegulation) too", () => {
  const cfg = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "different_actions" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  let state = completeAwareness(createCombinedLiveSession(baseInput({ items: [thought()], config: cfg, stateProfiles: [completeState()] })), [{ itemId: "t1", factorType: "thought", value: 7 }]);
  const checkpoints = state.remainingSteps.filter((s) => s.kind === "rating_checkpoint").map((s) => (s as { checkpoint: string }).checkpoint);
  assert.deepEqual(checkpoints, ["afterStayAcceptance", "afterStateRegulation"]);
});

// ---------------------------------------------------------------------------
// 10. Desired-state rating separate
// ---------------------------------------------------------------------------

test("desired-state rating is its own event, unreachable outside the desired_state_rating step, and never merges into factorRatingHistory", () => {
  const cfg = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "different_actions" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  let state = completeAwareness(createCombinedLiveSession(baseInput({ items: [thought()], config: cfg, stateProfiles: [completeState()] })), [{ itemId: "t1", factorType: "thought", value: 7 }]);
  // Not on the desired_state_rating step yet -- must be a no-op.
  const attempted = recordDesiredStateRating(state, 9);
  assert.equal(attempted.desiredStateRating, null);
  // Walk all the way there.
  while (state.phase === "steps" && state.remainingSteps[state.stepIndex]?.kind !== "desired_state_rating") {
    const step = state.remainingSteps[state.stepIndex];
    if (step?.kind === "rating_checkpoint") {
      for (const factor of state.resolvedPlan!.factors) state = recordStepRating(state, factor.itemId, factor.category, step.checkpoint!, 5);
    } else if (step?.kind === "cognitive_reassessment") {
      state = answerReassessment(state, "not_stuck");
    } else {
      state = advanceStep(state);
    }
  }
  assert.equal(state.remainingSteps[state.stepIndex]?.kind, "desired_state_rating");
  state = recordDesiredStateRating(state, 9);
  assert.equal(state.desiredStateRating, 9);
  assert.equal(state.factorRatingHistory.some((r) => r.value === 9 && r.factorId === "t1"), false, "never folded into the per-factor checkpoint history");
});

// ---------------------------------------------------------------------------
// 11-12. Mini never rates, Mini direct primary choice
// ---------------------------------------------------------------------------

test("Mini: recordAwarenessRating/recordStepRating/recordDesiredStateRating are unconditionally inert no-ops -- Mini can never be driven into a rating state by any event", () => {
  const cfg = config({
    interferenceItemIds: ["t1", "u1"],
    itemRelationships: { t1: { actionRelationship: "legacy_unspecified" }, u1: { actionRelationship: "legacy_unspecified" } },
    stateInclusionPolicy: "none",
  });
  let state = createCombinedLiveSession(baseInput({ mode: "mini", items: [thought(), urge()], config: cfg }));
  assert.equal(state.phase, "primary_choice");
  state = chooseTiePrimaryFactor(state, "t1");
  assert.equal(state.phase, "steps");
  const before = state;
  assert.equal(recordAwarenessRating(state, "t1", "thought", 5), before, "no-op: Mini has no Awareness phase to be in");
  assert.equal(recordStepRating(state, "t1", "thought", "afterAwareness", 5).factorRatingHistory.length, 0, "no-op: no rating_checkpoint step ever appears in Mini's own step kinds");
  assert.equal(recordDesiredStateRating(state, 5).desiredStateRating, null, "no-op: Mini has no desired_state_rating step kind");
  assert.equal(state.factorRatingHistory.length, 0);
  assert.equal(state.mode, "mini");
});

test("Mini direct primary choice: several factors ask MINI_PRIMARY_FACTOR_QUESTION immediately; one factor auto-resolves with zero question", () => {
  const tie = config({
    interferenceItemIds: ["t1", "u1"],
    itemRelationships: { t1: { actionRelationship: "legacy_unspecified" }, u1: { actionRelationship: "legacy_unspecified" } },
    stateInclusionPolicy: "none",
  });
  const multi = createCombinedLiveSession(baseInput({ mode: "mini", items: [thought(), urge()], config: tie }));
  assert.equal(multi.phase, "primary_choice");
  assert.equal(multi.pendingPrimaryFactorQuestion, "במה היית רוצה להתמקד עכשיו?");

  const single = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  const oneFactor = createCombinedLiveSession(baseInput({ mode: "mini", items: [thought()], config: single }));
  assert.equal(oneFactor.phase, "steps");
  assert.equal(oneFactor.primaryFactorId, "t1");
});

// ---------------------------------------------------------------------------
// 13. Secondary-factor interventions remain
// ---------------------------------------------------------------------------

test("every selected factor's own intervention step is present regardless of which one is primary -- secondary interventions are never dropped (Full and Mini alike)", () => {
  const cfg = config({
    interferenceItemIds: ["t1", "u1"],
    itemRelationships: { t1: { actionRelationship: "legacy_unspecified" }, u1: { actionRelationship: "legacy_unspecified" } },
    stateInclusionPolicy: "none",
  });
  const fullState = completeAwareness(createCombinedLiveSession(baseInput({ items: [thought(), urge()], config: cfg })), [
    { itemId: "t1", factorType: "thought", value: 9 },
    { itemId: "u1", factorType: "urge", value: 2 },
  ]);
  assert.equal(fullState.primaryFactorId, "t1");
  assert.equal(fullState.remainingSteps.filter((s) => s.kind === "processing").length, 2, "both factors -- primary and secondary -- keep their own processing step");

  const miniState = chooseTiePrimaryFactor(createCombinedLiveSession(baseInput({ mode: "mini", items: [thought(), urge()], config: cfg })), "t1");
  assert.equal(miniState.remainingSteps.filter((s) => s.kind === "factor_intervention").length, 2);
});

// ---------------------------------------------------------------------------
// 15-17. Presence: embedded/full mutual exclusion, Full returns to parent, no standalone sub-engine
// ---------------------------------------------------------------------------

function fullPresenceStuckState(): CombinedLiveSessionState {
  const cfg = config({
    interferenceItemIds: ["t1"],
    itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } },
    stateInclusionPolicy: "none",
    presenceEnabled: true,
    linkedPresenceArcId: "p1",
    presenceActionRelationship: "legacy_unspecified",
  });
  let state = completeAwareness(createCombinedLiveSession(baseInput({ items: [thought()], config: cfg, presenceArcs: [presenceArc()] })), [{ itemId: "t1", factorType: "thought", value: 7 }]);
  let guard = 0;
  while (state.phase === "steps" && state.remainingSteps[state.stepIndex]?.kind !== "cognitive_reassessment" && guard < 20) {
    const step = state.remainingSteps[state.stepIndex];
    state = step?.kind === "rating_checkpoint" ? recordStepRating(state, "t1", "thought", step.checkpoint!, 5) : advanceStep(state);
    guard++;
  }
  state = answerReassessment(state, "still_stuck"); // cognitive work + Presence configured + still stuck -> full_required
  return state;
}

test("embedded and full Presence are mutually exclusive -- entering one never leaves the other's own marker set", () => {
  const state = fullPresenceStuckState();
  assert.equal(state.phase, "presence_full_active");
  assert.equal(state.fullPresenceSessionActive, true);
  assert.equal(state.embeddedPresenceStage, null, "full_required never also sets an embedded stage");
});

test("Full Presence returns to the parent plan (and eventually reaches the combined actions) once its nested sub-session completes -- never restarts the cognitive route", () => {
  let state = fullPresenceStuckState();
  assert.equal(state.phase, "presence_full_active");
  state = completeFullPresenceSubSession(state);
  assert.equal(state.phase, "steps");
  assert.equal(state.fullPresenceSessionActive, false);
  // Continues forward through the SAME spine -- never back to recognition/awareness.
  assert.notEqual(state.remainingSteps[state.stepIndex]?.kind, "recognition" as string);
  let guard = 0;
  while (state.phase === "steps" && guard < 20) {
    const step = state.remainingSteps[state.stepIndex];
    if (step?.kind === "state_action" || step?.kind === "factor_action") break;
    state = advanceStep(state);
    guard++;
  }
  assert.ok(state.remainingSteps[state.stepIndex]?.kind === "state_action" || state.remainingSteps[state.stepIndex]?.kind === "factor_action", "reaches the combined action sequence after returning from Full Presence");
});

test("this module never IMPORTS or CALLS arc/presenceLive.ts's own standalone action/tail sub-engine -- static source guarantee, not just a runtime one (doc-comment mentions of what NOT to do are fine)", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(path.join(here, "combinedLiveSession.ts"), "utf8");
  const codeLines = source
    .split("\n")
    .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("/**") && !line.trim().startsWith("//"))
    .join("\n");
  assert.equal(/\bgetFirstPresenceActionLiveStage\s*\(/.test(codeLines), false, "never CALLED outside documentation");
  assert.equal(/\bgetNextPresenceActionLiveStage\s*\(/.test(codeLines), false, "never CALLED outside documentation");
  assert.equal(/from\s+["']\.\/presenceLive\.ts["']/.test(source), false, "never IMPORTED at all -- the reused nested Full-Presence engine is driven by the SCREEN (live/), never here");
});

// ---------------------------------------------------------------------------
// 18-22. All action-outcome kinds
// ---------------------------------------------------------------------------

function actionKindState(outcomeSetup: { items: InterferenceItem[]; stateProfiles?: StateProfile[]; stateInclusionPolicy?: PersonalDevelopmentRouteConfig["stateInclusionPolicy"]; stateProfileId?: string | null; itemRelationships: PersonalDevelopmentRouteConfig["itemRelationships"] }): CombinedLiveSessionState {
  const cfg = config({
    interferenceItemIds: outcomeSetup.items.map((i) => i.id),
    itemRelationships: outcomeSetup.itemRelationships,
    stateInclusionPolicy: outcomeSetup.stateInclusionPolicy ?? "none",
    stateProfileId: outcomeSetup.stateProfileId ?? null,
  });
  let state = completeAwareness(
    createCombinedLiveSession(baseInput({ items: outcomeSetup.items, config: cfg, stateProfiles: outcomeSetup.stateProfiles ?? [] })),
    outcomeSetup.items.map((i) => ({ itemId: i.id, factorType: i.category, value: 5 }))
  );
  while (state.phase === "steps") {
    const step = state.remainingSteps[state.stepIndex];
    if (!step) break;
    if (step.kind === "state_action" || step.kind === "factor_action") break;
    if (step.kind === "rating_checkpoint") {
      for (const factor of state.resolvedPlan!.factors) state = recordStepRating(state, factor.itemId, factor.category, step.checkpoint!, 5);
    } else if (step.kind === "cognitive_reassessment") {
      state = answerReassessment(state, "not_stuck");
    } else if (step.kind === "desired_state_rating") {
      state = recordDesiredStateRating(state, 5);
    } else {
      state = advanceStep(state);
    }
  }
  return state;
}

test("factor_only: one action, role 'factor'", () => {
  const state = actionKindState({ items: [thought()], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } } });
  assert.equal(state.actionRoleProgress.length, 1);
  assert.equal(state.actionRoleProgress[0].role, "factor");
  assert.equal(state.actionRoleProgress[0].action, "פעולת מחשבה");
});

test("state_only: Emotion's action IS the State action, role 'state'", () => {
  const state = actionKindState({ items: [emotion()], itemRelationships: { e1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "linked", stateProfileId: "s1", stateProfiles: [completeState()] });
  assert.equal(state.actionRoleProgress.length, 1);
  assert.equal(state.actionRoleProgress[0].role, "state");
  assert.equal(state.actionRoleProgress[0].action, "פעולת המצב");
});

test("shared_explicit: one action rendered once, role 'shared' -- never double-counted as both state and factor", () => {
  const state = actionKindState({ items: [thought()], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1", stateProfiles: [completeState()] });
  assert.equal(state.actionRoleProgress.length, 1);
  assert.equal(state.actionRoleProgress[0].role, "shared");
});

test("state_then_factor: two actions in the correct order (State first, factor second)", () => {
  const state = actionKindState({ items: [thought()], itemRelationships: { t1: { actionRelationship: "different_actions" } }, stateInclusionPolicy: "linked", stateProfileId: "s1", stateProfiles: [completeState()] });
  assert.equal(state.actionRoleProgress.length, 2);
  assert.equal(state.actionRoleProgress[0].role, "state");
  assert.equal(state.actionRoleProgress[0].action, "פעולת המצב");
  assert.equal(state.actionRoleProgress[1].role, "factor");
  assert.equal(state.actionRoleProgress[1].action, "פעולת מחשבה");
});

test("legacy_shared_state_fallback: one action, rendered as role 'state' (the legacy fallback IS the State's own action) -- never a genuine state_only relationship pretended", () => {
  const v1Thought = thought({ schemaVersion: 1, beneficialActionAgainstFactor: null });
  const state = actionKindState({ items: [v1Thought], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "linked", stateProfileId: "s1", stateProfiles: [completeState()] });
  assert.equal(state.actionRoleProgress.length, 1);
  assert.equal(state.actionRoleProgress[0].role, "state");
  assert.equal(state.actionOutcomeKind, null, "actionOutcomeKind is only ever set once the action is actually confirmed, not merely reached");
});

// ---------------------------------------------------------------------------
// 23-24. Timer/display vs completion, idempotent confirmation
// ---------------------------------------------------------------------------

test("displaying an action (markActionReached) never marks it completed -- reached and completed are independent flags", () => {
  const state = actionKindState({ items: [thought()], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } } });
  const reached = markActionReached(state);
  assert.equal(reached.actionRoleProgress[0].reached, true);
  assert.equal(reached.actionRoleProgress[0].completed, false);
});

test("explicit confirmation is idempotent -- repeated taps never re-advance the step cursor a second time or produce a second completion", () => {
  const state = actionKindState({ items: [thought()], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } } });
  const once = confirmActionCompleted(markActionReached(state));
  assert.equal(once.actionRoleProgress[0].completed, true);
  assert.notEqual(once.phase, "steps", "single-action route advances straight into the tail");
  const twice = confirmActionCompleted(once);
  assert.deepEqual(twice, once, "a second confirmation call on an already-completed action changes nothing at all");
});

// ---------------------------------------------------------------------------
// 25-26. Tail begins only after required actions; Mini tail stays short
// ---------------------------------------------------------------------------

test("the Full tail never begins before every required action is confirmed", () => {
  const state = actionKindState({ items: [thought()], itemRelationships: { t1: { actionRelationship: "different_actions" } }, stateInclusionPolicy: "linked", stateProfileId: "s1", stateProfiles: [completeState()] });
  assert.equal(state.actionRoleProgress.length, 2);
  const reached = markActionReached(state);
  assert.equal(reached.phase, "steps", "reaching/displaying the first action alone never starts the tail");
  const firstConfirmed = confirmActionCompleted(reached);
  assert.equal(firstConfirmed.phase, "steps", "only the FIRST of two required actions confirmed -- tail still must not start");
  const secondConfirmed = confirmActionCompleted(markActionReached(firstConfirmed));
  assert.equal(secondConfirmed.phase, "tail", "tail begins only once every required action is confirmed");
});

test("Full selects the existing 4-stage tail, Mini selects the existing compact 2-stage tail -- Mini never inherits the Full tail", () => {
  const fullTail = actionKindState({ items: [thought()], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } } });
  const fullTailStarted = confirmActionCompleted(markActionReached(fullTail));
  assert.equal(fullTailStarted.phase, "tail");
  assert.equal(fullTailStarted.tailStage, "action_imagery");
  let s = fullTailStarted;
  const fullStages = [s.tailStage];
  while (s.phase === "tail") {
    s = advanceTail(s);
    if (s.tailStage) fullStages.push(s.tailStage);
  }
  assert.deepEqual(fullStages, ["action_imagery", "improvement_entry", "improved_action_imagery", "gratitude", "complete"]);

  const cfg = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  let miniState = chooseTiePrimaryFactor(createCombinedLiveSession(baseInput({ mode: "mini", items: [thought()], config: cfg })), "t1");
  // "chooseTiePrimaryFactor" is a no-op here (single factor, already auto-resolved) -- walk to the action.
  while (miniState.phase === "steps" && miniState.remainingSteps[miniState.stepIndex]?.kind !== "factor_action") miniState = advanceStep(miniState);
  miniState = confirmActionCompleted(markActionReached(miniState));
  assert.equal(miniState.phase, "tail");
  const miniStages = [miniState.tailStage];
  let m = miniState;
  while (m.phase === "tail") {
    m = advanceTail(m);
    if (m.tailStage) miniStages.push(m.tailStage);
  }
  assert.deepEqual(miniStages, ["action_imagery", "gratitude", "complete"], "Mini's tail stays short -- never the Full 4-stage sequence");
});

// ---------------------------------------------------------------------------
// 27-28. Back/abandonment produce no terminal facts; repeated terminal event inert
// ---------------------------------------------------------------------------

test("back/abandonment before terminal completion leaves terminalCompleted false -- nothing about this module ever writes it true except completeSession itself", () => {
  const cfg = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } }, stateInclusionPolicy: "none" });
  const state = createCombinedLiveSession(baseInput({ items: [thought()], config: cfg }));
  assert.equal(state.terminalCompleted, false);
  const afterSomeSteps = advanceAwarenessRecognition(state);
  assert.equal(afterSomeSteps.terminalCompleted, false, "abandoning mid-session (simply never calling another event) leaves terminalCompleted false forever -- there is no separate persistence write to undo");
});

test("a repeated terminal event is inert -- calling completeSession again on an already-terminal state changes nothing", () => {
  const state = actionKindState({ items: [thought()], itemRelationships: { t1: { actionRelationship: "legacy_unspecified" } } });
  let s = confirmActionCompleted(markActionReached(state));
  while (s.phase === "tail") s = advanceTail(s);
  assert.equal(s.phase, "complete");
  assert.equal(s.terminalCompleted, true);
  const again = completeSession(s);
  assert.deepEqual(again, s);
});

// ---------------------------------------------------------------------------
// 29. No persistence/progression dependency imported by the controller
// ---------------------------------------------------------------------------

test("arc/combinedLiveSession.ts imports nothing from data/ or any progression module -- static source guarantee", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(path.join(here, "combinedLiveSession.ts"), "utf8");
  const importLines = source.split("\n").filter((line) => line.trim().startsWith("import"));
  for (const line of importLines) {
    assert.equal(/from\s+["']\.\.\/data\//.test(line), false, `must never import from data/: ${line}`);
    assert.equal(/progression/i.test(line), false, `must never import a progression module: ${line}`);
  }
});

// ---------------------------------------------------------------------------
// 30. Legacy LIVE screens unaffected (structural: this is a brand-new file; nothing pre-existing was modified by it)
// ---------------------------------------------------------------------------

test("this is a brand-new module -- it cannot itself have altered any pre-existing LIVE screen's own behavior", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  assert.ok(fs.existsSync(path.join(here, "combinedLiveSession.ts")));
});

// ---------------------------------------------------------------------------
// 31. Goal Connection threading (Adaptive ARC architecture task, unified
// PD/ARC Goal, Phase 7) -- config.goalConnection reaches the real session's
// own step list unmodified.
// ---------------------------------------------------------------------------

test("createCombinedLiveSession includes goal_connection in the real Full session's own steps when the route has both State and a configured Goal Connection", () => {
  const cfg = config({
    interferenceItemIds: ["t1"],
    itemRelationships: { t1: { actionRelationship: "same_action" } },
    stateInclusionPolicy: "linked",
    stateProfileId: "s1",
    goalConnection: { desiredResultText: "תוצאה", valueText: "ערך", personalReasonText: "סיבה" },
  });
  let state = createCombinedLiveSession(baseInput({ items: [thought()], config: cfg, stateProfiles: [completeState()] }));
  while (state.awarenessSteps[state.awarenessIndex]?.kind === "recognition") state = advanceAwarenessRecognition(state);
  state = recordAwarenessRating(state, "t1", "thought", 6);
  assert.equal(state.phase, "steps");
  const kinds = state.remainingSteps.map((s) => s.kind);
  assert.ok(kinds.includes("goal_connection"), "the real session's own step list includes goal_connection");
});

test("createCombinedLiveSession omits goal_connection when the route's own config.goalConnection is null -- unaffected by default", () => {
  const cfg = config({ interferenceItemIds: ["t1"], itemRelationships: { t1: { actionRelationship: "same_action" } }, stateInclusionPolicy: "linked", stateProfileId: "s1" });
  let state = createCombinedLiveSession(baseInput({ items: [thought()], config: cfg, stateProfiles: [completeState()] }));
  while (state.awarenessSteps[state.awarenessIndex]?.kind === "recognition") state = advanceAwarenessRecognition(state);
  state = recordAwarenessRating(state, "t1", "thought", 6);
  const kinds = state.remainingSteps.map((s) => s.kind);
  assert.equal(kinds.includes("goal_connection"), false);
});
