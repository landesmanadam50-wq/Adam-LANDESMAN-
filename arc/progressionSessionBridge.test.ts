import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRegularSessionToProgression,
  applyStage3SessionToProgression,
  resolveAvailablePracticeStages,
  resolveProgressionCadence,
  resolveProgressionMappingKey,
} from "./progressionSessionBridge.ts";
import type { ProgressionMappingContext, RegularSessionBridgeInput, Stage3SessionBridgeInput } from "./progressionSessionBridge.ts";
import { createEmptyStateProfile } from "./stateProfile.ts";
import type { StateProfile } from "./stateProfile.ts";
import { createEmptyIdentityProfile } from "./identityProfile.ts";
import type { IdentityProfile } from "./identityProfile.ts";
import { createEmptyThoughtInterferenceItem } from "./interferenceItem.ts";
import type { InterferenceItem } from "./interferenceItem.ts";
import {
  proactiveStateProgressKeyToString,
  reactiveMappingProgressKeyToString,
} from "./projectionCompletion.ts";
import type { ActionCompletionSignal, IdentityCompletionSignal, LinkCompletionSignal, ProjectionCompletionInput } from "./projectionCompletion.ts";
import { createEmptyMappingProgressionCounters, isStageUnlocked } from "./reactiveProactiveProgression.ts";
import type { MappingProgressionStore } from "./reactiveProactiveProgression.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-02-01T00:00:00.000Z";

function stateProfile(overrides: Partial<StateProfile> = {}): StateProfile {
  return { ...createEmptyStateProfile("state1", "רוגע", "prog1", NOW), ...overrides };
}

function identityProfile(overrides: Partial<IdentityProfile> = {}): IdentityProfile {
  return { ...createEmptyIdentityProfile("identity1", "אדם רגוע", "prog1", NOW), ...overrides };
}

function thoughtItem(overrides: Partial<InterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyThoughtInterferenceItem("item1", "מחשבה", "prog1", NOW), ...overrides } as InterferenceItem;
}

function context(overrides: Partial<ProgressionMappingContext> = {}): ProgressionMappingContext {
  return { state: stateProfile(), item: null, identity: null, ...overrides };
}

const COMPLETED_ACTION: ActionCompletionSignal = { actionReached: true, realActionCompleted: true };
const INCOMPLETE_ACTION: ActionCompletionSignal = { actionReached: true, realActionCompleted: false };
const COMPLETED_LINK: LinkCompletionSignal = { reachedFinalStage: true, requiredDwellsCompleted: true, completionAcknowledged: true };
const INCOMPLETE_LINK: LinkCompletionSignal = { reachedFinalStage: true, requiredDwellsCompleted: false, completionAcknowledged: true };
const COMPLETED_IDENTITY: IdentityCompletionSignal = { selected: true, actionReached: true, realActionCompleted: true };
const INCOMPLETE_IDENTITY: IdentityCompletionSignal = { selected: true, actionReached: true, realActionCompleted: false };

function fullCompletion(sessionId: string, state: ActionCompletionSignal = COMPLETED_ACTION, identity: IdentityCompletionSignal | null = null): ProjectionCompletionInput {
  return { projection: "full", track: "personal_development", sessionId, state, identity };
}

function miniCompletion(sessionId: string, state: ActionCompletionSignal = COMPLETED_ACTION): ProjectionCompletionInput {
  return { projection: "mini", track: "personal_development", sessionId, state, identity: null };
}

function linkCompletion(sessionId: string): ProjectionCompletionInput {
  return { projection: "link", track: "personal_development", sessionId, link: COMPLETED_LINK };
}

function actionOnlyCompletion(sessionId: string, state: ActionCompletionSignal = COMPLETED_ACTION): ProjectionCompletionInput {
  return { projection: "action_only", track: "personal_development", sessionId, state, identity: null };
}

function regularInput(overrides: Partial<RegularSessionBridgeInput> = {}): RegularSessionBridgeInput {
  return {
    sessionId: "s1",
    practicedStage: 1,
    projection: "full",
    track: "personal_development",
    completion: fullCompletion("s1"),
    ...overrides,
  };
}

function stage3Input(overrides: Partial<Stage3SessionBridgeInput> = {}): Stage3SessionBridgeInput {
  return {
    sessionId: "s3-1",
    track: "personal_development",
    identitySelected: false,
    link: COMPLETED_LINK,
    state: COMPLETED_ACTION,
    identity: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// [1] Cadence
// ---------------------------------------------------------------------------

test("[1] resolveProgressionCadence: item present is reactive, null is proactive", () => {
  assert.equal(resolveProgressionCadence(thoughtItem()), "reactive");
  assert.equal(resolveProgressionCadence(null), "proactive");
});

// ---------------------------------------------------------------------------
// [2]-[7] Mapping key resolution
// ---------------------------------------------------------------------------

test("[2] resolveProgressionMappingKey: reactive key exactly matches reactiveMappingProgressKeyToString", () => {
  const state = stateProfile({ id: "state-x" });
  const item = thoughtItem({ id: "item-x" } as Partial<InterferenceItem>);
  const identity = identityProfile({ id: "identity-x" });
  const key = resolveProgressionMappingKey({ state, item, identity });
  const expected = reactiveMappingProgressKeyToString({ interferenceItemId: "item-x", linkedStateId: "state-x", linkedIdentityVersion: "identity-x" });
  assert.equal(key, expected);
});

test("[2] resolveProgressionMappingKey: proactive key exactly matches proactiveStateProgressKeyToString", () => {
  const state = stateProfile({ id: "state-y" });
  const identity = identityProfile({ id: "identity-y" });
  const key = resolveProgressionMappingKey({ state, item: null, identity });
  const expected = proactiveStateProgressKeyToString({ stateId: "state-y", linkedIdentityVersion: "identity-y" });
  assert.equal(key, expected);
});

test("[3] Same Identity ID with a changed updatedAt gives the same key", () => {
  const state = stateProfile();
  const item = thoughtItem();
  const identityOld = identityProfile({ id: "identity-shared", updatedAt: NOW });
  const identityEdited = identityProfile({ id: "identity-shared", updatedAt: LATER, identityMantra: "מנטרה חדשה" });
  const keyOld = resolveProgressionMappingKey({ state, item, identity: identityOld });
  const keyEdited = resolveProgressionMappingKey({ state, item, identity: identityEdited });
  assert.equal(keyOld, keyEdited, "routine content edits to the same Identity must never change the key");
});

test("[4] Different Identity ID gives a different key", () => {
  const state = stateProfile();
  const item = thoughtItem();
  const keyA = resolveProgressionMappingKey({ state, item, identity: identityProfile({ id: "identity-a" }) });
  const keyB = resolveProgressionMappingKey({ state, item, identity: identityProfile({ id: "identity-b" }) });
  assert.notEqual(keyA, keyB);
});

test("[5] Null Identity produces linkedIdentityVersion null in the resolved key", () => {
  const state = stateProfile({ id: "state-z" });
  const key = resolveProgressionMappingKey({ state, item: null, identity: null });
  assert.equal(key, proactiveStateProgressKeyToString({ stateId: "state-z", linkedIdentityVersion: null }));
});

test("[6] Reactive and proactive contexts for the same State/Identity never share a key", () => {
  const state = stateProfile();
  const identity = identityProfile();
  const item = thoughtItem();
  const reactiveKey = resolveProgressionMappingKey({ state, item, identity });
  const proactiveKey = resolveProgressionMappingKey({ state, item: null, identity });
  assert.notEqual(reactiveKey, proactiveKey);
});

test("[7] Different InterferenceItem IDs or State IDs remain separate", () => {
  const identity = identityProfile();
  const keyItem1 = resolveProgressionMappingKey({ state: stateProfile({ id: "state1" }), item: thoughtItem({ id: "item1" } as Partial<InterferenceItem>), identity });
  const keyItem2 = resolveProgressionMappingKey({ state: stateProfile({ id: "state1" }), item: thoughtItem({ id: "item2" } as Partial<InterferenceItem>), identity });
  assert.notEqual(keyItem1, keyItem2);

  const keyState1 = resolveProgressionMappingKey({ state: stateProfile({ id: "stateA" }), item: null, identity });
  const keyState2 = resolveProgressionMappingKey({ state: stateProfile({ id: "stateB" }), item: null, identity });
  assert.notEqual(keyState1, keyState2);
});

// ---------------------------------------------------------------------------
// [8]-[11] Regular sessions increment only the explicitly practiced stage
// ---------------------------------------------------------------------------

test("[8] A valid regular session increments only the explicitly practiced stage", () => {
  const outcome = applyRegularSessionToProgression({}, context(), regularInput({ sessionId: "s8", practicedStage: 1, projection: "full", completion: fullCompletion("s8") }));
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") {
    assert.equal(outcome.applyOutcome.kind, "applied");
    const counters = outcome.store[outcome.mappingKey];
    assert.equal(counters.stage1.completedFullCount, 1);
    assert.equal(counters.stage2.completedMiniCount, 0);
    assert.equal(counters.stage2.completedLinkCount, 0);
    assert.equal(counters.stage3.completedLinkPlusActionCount, 0);
    assert.equal(counters.stage4.completedActionOnlyCount, 0);
  }
});

test("[9] Stage 1 Mini increments only Stage 1", () => {
  const outcome = applyRegularSessionToProgression({}, context(), regularInput({ sessionId: "s9", practicedStage: 1, projection: "mini", completion: miniCompletion("s9") }));
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") {
    const counters = outcome.store[outcome.mappingKey];
    assert.equal(counters.stage1.completedMiniCount, 1);
    assert.equal(counters.stage2.completedMiniCount, 0);
  }
});

test("[10] Stage 2 Mini and Link increment only Stage 2", () => {
  let store: MappingProgressionStore = {};
  const ctx = context();
  const outcome1 = applyRegularSessionToProgression(store, ctx, regularInput({ sessionId: "s10a", practicedStage: 2, projection: "mini", completion: miniCompletion("s10a") }));
  assert.equal(outcome1.kind, "processed");
  if (outcome1.kind === "processed") store = outcome1.store;
  const outcome2 = applyRegularSessionToProgression(store, ctx, regularInput({ sessionId: "s10b", practicedStage: 2, projection: "link", completion: linkCompletion("s10b") }));
  assert.equal(outcome2.kind, "processed");
  if (outcome2.kind === "processed") {
    const counters = outcome2.store[outcome2.mappingKey];
    assert.equal(counters.stage2.completedMiniCount, 1);
    assert.equal(counters.stage2.completedLinkCount, 1);
    assert.equal(counters.stage1.completedMiniCount, 0);
  }
});

test("[11] Stage 4 Action-only increments only Stage 4", () => {
  const outcome = applyRegularSessionToProgression({}, context(), regularInput({ sessionId: "s11", practicedStage: 4, projection: "action_only", completion: actionOnlyCompletion("s11") }));
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") {
    const counters = outcome.store[outcome.mappingKey];
    assert.equal(counters.stage4.completedActionOnlyCount, 1);
    assert.equal(counters.stage3.completedLinkPlusActionCount, 0);
  }
});

// ---------------------------------------------------------------------------
// [12]-[16] Invalid combinations, duplicates, incomplete, ledger sharing
// ---------------------------------------------------------------------------

test("[12] Invalid stage/projection surfaces invalid_combination", () => {
  const outcome = applyRegularSessionToProgression({}, context(), regularInput({ sessionId: "s12", practicedStage: 1, projection: "link", completion: linkCompletion("s12") }));
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") {
    assert.equal(outcome.applyOutcome.kind, "invalid_combination");
    assert.deepEqual(outcome.store, {}, "nothing is written for an invalid combination");
  }
});

test("[13] Duplicate session surfaces duplicate_session", () => {
  let store: MappingProgressionStore = {};
  const ctx = context();
  const first = applyRegularSessionToProgression(store, ctx, regularInput({ sessionId: "dup1", practicedStage: 1, projection: "full", completion: fullCompletion("dup1") }));
  assert.equal(first.kind, "processed");
  if (first.kind === "processed") store = first.store;
  const second = applyRegularSessionToProgression(store, ctx, regularInput({ sessionId: "dup1", practicedStage: 1, projection: "mini", completion: miniCompletion("dup1") }));
  assert.equal(second.kind, "processed");
  if (second.kind === "processed") {
    assert.equal(second.applyOutcome.kind, "duplicate_session");
  }
});

test("[14] The same session cannot count under another stage", () => {
  let store: MappingProgressionStore = {};
  const ctx = context();
  const first = applyRegularSessionToProgression(store, ctx, regularInput({ sessionId: "dup2", practicedStage: 1, projection: "mini", completion: miniCompletion("dup2") }));
  assert.equal(first.kind, "processed");
  if (first.kind === "processed") store = first.store;
  const second = applyRegularSessionToProgression(store, ctx, regularInput({ sessionId: "dup2", practicedStage: 2, projection: "mini", completion: miniCompletion("dup2") }));
  assert.equal(second.kind, "processed");
  if (second.kind === "processed") {
    assert.equal(second.applyOutcome.kind, "duplicate_session");
    const counters = second.store[second.mappingKey];
    assert.equal(counters.stage2.completedMiniCount, 0, "Stage 2 was never incremented by the duplicate attempt");
  }
});

test("[15] Incomplete completion does not increment counters", () => {
  const outcome = applyRegularSessionToProgression({}, context(), regularInput({ sessionId: "s15", practicedStage: 1, projection: "full", completion: fullCompletion("s15", INCOMPLETE_ACTION) }));
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") {
    assert.equal(outcome.applyOutcome.kind, "not_completed");
    assert.deepEqual(outcome.store, {});
  }
});

test("[16] Earlier-stage practice remains countable after later stages unlock, without incrementing later-stage buckets", () => {
  let store: MappingProgressionStore = {};
  const ctx = context();
  for (let i = 0; i < 10; i++) {
    const outcome = applyRegularSessionToProgression(store, ctx, regularInput({ sessionId: `unlock-${i}`, practicedStage: 1, projection: "mini", completion: miniCompletion(`unlock-${i}`) }));
    if (outcome.kind === "processed") store = outcome.store;
  }
  const key = resolveProgressionMappingKey(ctx);
  assert.equal(isStageUnlocked(store[key], 2, "reactive") || isStageUnlocked(store[key], 2, "proactive"), true);

  const stage2Before = { ...store[key].stage2 };
  const later = applyRegularSessionToProgression(store, ctx, regularInput({ sessionId: "still-stage1", practicedStage: 1, projection: "full", completion: fullCompletion("still-stage1") }));
  assert.equal(later.kind, "processed");
  if (later.kind === "processed") {
    assert.deepEqual(later.store[key].stage2, stage2Before);
    assert.equal(later.store[key].stage1.completedFullCount, 1);
  }
});

// ---------------------------------------------------------------------------
// [17]-[22] Stage 3 compound completion
// ---------------------------------------------------------------------------

test("[17] Valid compound completion increments only Stage 3", () => {
  const outcome = applyStage3SessionToProgression({}, context(), stage3Input({ sessionId: "s17" }));
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") {
    assert.equal(outcome.applyOutcome.kind, "applied");
    const counters = outcome.store[outcome.mappingKey];
    assert.equal(counters.stage3.completedLinkPlusActionCount, 1);
    assert.equal(counters.stage1.completedFullCount, 0);
    assert.equal(counters.stage2.completedMiniCount, 0);
    assert.equal(counters.stage4.completedActionOnlyCount, 0);
  }
});

test("[18] Link-only (State incomplete) does not increment Stage 3", () => {
  const outcome = applyStage3SessionToProgression({}, context(), stage3Input({ sessionId: "s18", state: INCOMPLETE_ACTION }));
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") {
    assert.equal(outcome.completionResult.valid, false);
    assert.equal(outcome.applyOutcome.kind, "not_completed");
  }
});

test("[18] State-only (Link incomplete) does not increment Stage 3", () => {
  const outcome = applyStage3SessionToProgression({}, context(), stage3Input({ sessionId: "s18b", link: INCOMPLETE_LINK }));
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") {
    assert.equal(outcome.completionResult.valid, false);
  }
});

test("[19] Selected but incomplete Identity prevents Stage 3 completion", () => {
  const outcome = applyStage3SessionToProgression({}, context(), stage3Input({ sessionId: "s19", identitySelected: true, identity: INCOMPLETE_IDENTITY }));
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") {
    assert.equal(outcome.completionResult.valid, false);
  }
});

test("[20] Unselected Identity remains optional -- Stage 3 still completes without it", () => {
  const outcome = applyStage3SessionToProgression({}, context(), stage3Input({ sessionId: "s20", identitySelected: false, identity: null }));
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") {
    assert.equal(outcome.completionResult.valid, true);
  }
});

test("[20] Selected and completed Identity also completes Stage 3", () => {
  const outcome = applyStage3SessionToProgression({}, context(), stage3Input({ sessionId: "s20b", identitySelected: true, identity: COMPLETED_IDENTITY }));
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") {
    assert.equal(outcome.completionResult.valid, true);
  }
});

test("[21] A pure Stage 2 Link session never increments Stage 3", () => {
  const outcome = applyRegularSessionToProgression({}, context(), regularInput({ sessionId: "s21", practicedStage: 2, projection: "link", completion: linkCompletion("s21") }));
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") {
    const counters = outcome.store[outcome.mappingKey];
    assert.equal(counters.stage3.completedLinkPlusActionCount, 0);
  }
});

test("[22] A session ID cannot count once regularly and again as Stage 3 (regular first)", () => {
  let store: MappingProgressionStore = {};
  const ctx = context();
  const regular = applyRegularSessionToProgression(store, ctx, regularInput({ sessionId: "cross1", practicedStage: 2, projection: "link", completion: linkCompletion("cross1") }));
  assert.equal(regular.kind, "processed");
  if (regular.kind === "processed") store = regular.store;
  const stage3 = applyStage3SessionToProgression(store, ctx, stage3Input({ sessionId: "cross1" }));
  assert.equal(stage3.kind, "processed");
  if (stage3.kind === "processed") {
    assert.equal(stage3.applyOutcome.kind, "duplicate_session");
  }
});

test("[22] A session ID cannot count once as Stage 3 and again regularly (Stage 3 first)", () => {
  let store: MappingProgressionStore = {};
  const ctx = context();
  const stage3 = applyStage3SessionToProgression(store, ctx, stage3Input({ sessionId: "cross2" }));
  assert.equal(stage3.kind, "processed");
  if (stage3.kind === "processed") store = stage3.store;
  const regular = applyRegularSessionToProgression(store, ctx, regularInput({ sessionId: "cross2", practicedStage: 1, projection: "full", completion: fullCompletion("cross2") }));
  assert.equal(regular.kind, "processed");
  if (regular.kind === "processed") {
    assert.equal(regular.applyOutcome.kind, "duplicate_session");
  }
});

// ---------------------------------------------------------------------------
// [23]-[24] Available stages
// ---------------------------------------------------------------------------

test("[23]/[24] Available stages progress from [1] to [1,2] to [1,2,3] to [1,2,3,4], matching isStageUnlocked", () => {
  let store: MappingProgressionStore = {};
  const ctx = context({ item: thoughtItem() });
  const key = resolveProgressionMappingKey(ctx);

  const fresh = store[key] ?? createEmptyMappingProgressionCounters();
  assert.deepEqual(resolveAvailablePracticeStages(fresh, "reactive"), [1]);

  for (let i = 0; i < 10; i++) {
    const outcome = applyRegularSessionToProgression(store, ctx, {
      sessionId: `avail-s1-${i}`,
      practicedStage: 1,
      projection: "mini",
      track: "personal_development",
      completion: miniCompletion(`avail-s1-${i}`),
    });
    assert.equal(outcome.kind, "processed");
    if (outcome.kind === "processed") store = outcome.store;
  }
  assert.deepEqual(resolveAvailablePracticeStages(store[key], "reactive"), [1, 2]);

  for (let i = 0; i < 3; i++) {
    const outcome = applyRegularSessionToProgression(store, ctx, {
      sessionId: `avail-s2m-${i}`,
      practicedStage: 2,
      projection: "mini",
      track: "personal_development",
      completion: miniCompletion(`avail-s2m-${i}`),
    });
    if (outcome.kind === "processed") store = outcome.store;
  }
  for (let i = 0; i < 3; i++) {
    const outcome = applyRegularSessionToProgression(store, ctx, {
      sessionId: `avail-s2l-${i}`,
      practicedStage: 2,
      projection: "link",
      track: "personal_development",
      completion: linkCompletion(`avail-s2l-${i}`),
    });
    if (outcome.kind === "processed") store = outcome.store;
  }
  for (let i = 0; i < 4; i++) {
    const outcome = applyRegularSessionToProgression(store, ctx, {
      sessionId: `avail-s2extra-${i}`,
      practicedStage: 2,
      projection: "mini",
      track: "personal_development",
      completion: miniCompletion(`avail-s2extra-${i}`),
    });
    if (outcome.kind === "processed") store = outcome.store;
  }
  assert.deepEqual(resolveAvailablePracticeStages(store[key], "reactive"), [1, 2, 3]);

  for (let i = 0; i < 10; i++) {
    const outcome = applyStage3SessionToProgression(store, ctx, stage3Input({ sessionId: `avail-s3-${i}` }));
    if (outcome.kind === "processed") store = outcome.store;
  }
  assert.deepEqual(resolveAvailablePracticeStages(store[key], "reactive"), [1, 2, 3, 4]);
});

// ---------------------------------------------------------------------------
// [25]-[27] Goal exclusion
// ---------------------------------------------------------------------------

test("[25] Goal regular session returns goal_track_excluded", () => {
  const outcome = applyRegularSessionToProgression({}, context(), regularInput({ track: "goal_achievement", completion: { ...fullCompletion("g1"), track: "goal_achievement" } }));
  assert.deepEqual(outcome, { kind: "not_eligible", reason: "goal_track_excluded" });
});

test("[25] Goal Stage 3 session returns goal_track_excluded", () => {
  const outcome = applyStage3SessionToProgression({}, context(), stage3Input({ track: "goal_achievement" }));
  assert.deepEqual(outcome, { kind: "not_eligible", reason: "goal_track_excluded" });
});

test("[26] Goal leaves the exact store reference untouched", () => {
  const originalStore: MappingProgressionStore = { "existing-key": createEmptyMappingProgressionCounters() };
  const outcome = applyRegularSessionToProgression(originalStore, context(), regularInput({ track: "goal_achievement", completion: { ...fullCompletion("g2"), track: "goal_achievement" } }));
  assert.equal(outcome.kind, "not_eligible");
  assert.equal(originalStore["existing-key"].stage1.completedFullCount, 0, "the pre-existing entry is untouched");
});

test("[27] Goal exclusion happens before key resolution/counter creation -- the store gains no new key", () => {
  const store: MappingProgressionStore = {};
  applyRegularSessionToProgression(store, context({ state: stateProfile({ id: "goal-state" }) }), regularInput({ track: "goal_achievement", completion: { ...fullCompletion("g3"), track: "goal_achievement" } }));
  assert.deepEqual(store, {}, "no key was ever created for the Goal-track attempt");
});

// ---------------------------------------------------------------------------
// [28] Public APIs do not accept a caller-supplied key
// ---------------------------------------------------------------------------

test("[28] applyRegularSessionToProgression and applyStage3SessionToProgression take a ProgressionMappingContext, not a key string", () => {
  assert.equal(applyRegularSessionToProgression.length, 3, "(store, context, input) -- no key parameter");
  assert.equal(applyStage3SessionToProgression.length, 3);
});

// ---------------------------------------------------------------------------
// [29] Immutability
// ---------------------------------------------------------------------------

test("[29] No StateProfile, IdentityProfile, InterferenceItem, counters, or store input is mutated", () => {
  const state = stateProfile();
  const item = thoughtItem();
  const identity = identityProfile();
  const ctx: ProgressionMappingContext = { state, item, identity };
  const store: MappingProgressionStore = {};

  const stateCopy = JSON.parse(JSON.stringify(state));
  const itemCopy = JSON.parse(JSON.stringify(item));
  const identityCopy = JSON.parse(JSON.stringify(identity));
  const storeCopy = JSON.parse(JSON.stringify(store));

  applyRegularSessionToProgression(store, ctx, regularInput({ sessionId: "immut1", completion: fullCompletion("immut1") }));
  applyStage3SessionToProgression(store, ctx, stage3Input({ sessionId: "immut2" }));
  resolveAvailablePracticeStages(createEmptyMappingProgressionCounters(), "reactive");

  assert.deepEqual(state, stateCopy);
  assert.deepEqual(item, itemCopy);
  assert.deepEqual(identity, identityCopy);
  assert.deepEqual(store, storeCopy, "the original store object passed in is never mutated -- a new object is always returned");
});
