import test from "node:test";
import assert from "node:assert/strict";

import {
  loadAvailablePracticeStagesForMapping,
  recordRegularProgressionSession,
  recordStage3ProgressionSession,
} from "./progressionSessionPersistence.ts";
import type { ProgressionStorageDependencies } from "./progressionSessionPersistence.ts";
import { resolveProgressionMappingKey } from "../arc/progressionSessionBridge.ts";
import type { ProgressionMappingContext, RegularSessionBridgeInput, Stage3SessionBridgeInput } from "../arc/progressionSessionBridge.ts";
import { createEmptyStateProfile } from "../arc/stateProfile.ts";
import type { StateProfile } from "../arc/stateProfile.ts";
import { createEmptyIdentityProfile } from "../arc/identityProfile.ts";
import type { IdentityProfile } from "../arc/identityProfile.ts";
import { createEmptyThoughtInterferenceItem } from "../arc/interferenceItem.ts";
import type { InterferenceItem } from "../arc/interferenceItem.ts";
import type { ActionCompletionSignal, IdentityCompletionSignal, LinkCompletionSignal, ProjectionCompletionInput } from "../arc/projectionCompletion.ts";
import type { MappingProgressionStore } from "../arc/reactiveProactiveProgression.ts";

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

function fullCompletion(sessionId: string, state: ActionCompletionSignal = COMPLETED_ACTION, identity: IdentityCompletionSignal | null = null): ProjectionCompletionInput {
  return { projection: "full", track: "personal_development", sessionId, state, identity };
}

function linkCompletion(sessionId: string): ProjectionCompletionInput {
  return { projection: "link", track: "personal_development", sessionId, link: COMPLETED_LINK };
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

/** A simple in-memory storage double -- tracks call counts and the last-saved store, for tests that don't need to simulate an app restart. */
function createInMemoryDeps(initial: MappingProgressionStore = {}) {
  let store: MappingProgressionStore = initial;
  let loadCalls = 0;
  let saveCalls = 0;
  let lastSaved: MappingProgressionStore | null = null;
  const deps: ProgressionStorageDependencies = {
    loadStore: async () => {
      loadCalls += 1;
      return store;
    },
    saveStore: async (next) => {
      saveCalls += 1;
      lastSaved = next;
      store = next;
    },
  };
  return {
    deps,
    getLoadCalls: () => loadCalls,
    getSaveCalls: () => saveCalls,
    getLastSaved: () => lastSaved,
    getCurrentStore: () => store,
  };
}

/** Simulates a real, disk-backed store: each call to loadStore/saveStore round-trips through JSON, and successive `makeDeps()` calls represent separate "app sessions" reading/writing the same underlying persisted value -- the closest thing to a real AsyncStorage restart this test suite can model without a native runtime. */
function createPersistedBackend(initial: MappingProgressionStore = {}) {
  let persisted: MappingProgressionStore = JSON.parse(JSON.stringify(initial));
  return {
    makeDeps(): ProgressionStorageDependencies {
      return {
        loadStore: async () => JSON.parse(JSON.stringify(persisted)),
        saveStore: async (next) => {
          persisted = JSON.parse(JSON.stringify(next));
        },
      };
    },
    getPersisted: () => persisted,
  };
}

// ---------------------------------------------------------------------------
// [1]/[2] One load and one save for a valid session
// ---------------------------------------------------------------------------

test("[1] A valid regular session performs exactly one load and one save", async () => {
  const mem = createInMemoryDeps();
  const outcome = await recordRegularProgressionSession(context(), regularInput({ sessionId: "r1", completion: fullCompletion("r1") }), mem.deps);
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") assert.equal(outcome.applyOutcome.kind, "applied");
  assert.equal(mem.getLoadCalls(), 1);
  assert.equal(mem.getSaveCalls(), 1);
});

test("[2] A valid Stage 3 compound session performs exactly one load and one save", async () => {
  const mem = createInMemoryDeps();
  const outcome = await recordStage3ProgressionSession(context(), stage3Input({ sessionId: "r2" }), mem.deps);
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") assert.equal(outcome.applyOutcome.kind, "applied");
  assert.equal(mem.getLoadCalls(), 1);
  assert.equal(mem.getSaveCalls(), 1);
});

// ---------------------------------------------------------------------------
// [3] Saved store contains the correct mapping and stage bucket
// ---------------------------------------------------------------------------

test("[3] The saved store contains the correct mapping key and stage bucket", async () => {
  const mem = createInMemoryDeps();
  const ctx = context();
  const outcome = await recordRegularProgressionSession(ctx, regularInput({ sessionId: "r3", practicedStage: 1, projection: "mini", completion: { projection: "mini", track: "personal_development", sessionId: "r3", state: COMPLETED_ACTION, identity: null } }), mem.deps);
  assert.equal(outcome.kind, "processed");
  const key = resolveProgressionMappingKey(ctx);
  const saved = mem.getLastSaved();
  assert.ok(saved);
  assert.equal(saved?.[key]?.stage1.completedMiniCount, 1);
  assert.equal(saved?.[key]?.stage2.completedMiniCount, 0);
});

// ---------------------------------------------------------------------------
// [4]-[7] No save for non-applied outcomes
// ---------------------------------------------------------------------------

test("[4] not_completed performs no save", async () => {
  const mem = createInMemoryDeps();
  const outcome = await recordRegularProgressionSession(context(), regularInput({ sessionId: "r4", completion: fullCompletion("r4", INCOMPLETE_ACTION) }), mem.deps);
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") assert.equal(outcome.applyOutcome.kind, "not_completed");
  assert.equal(mem.getSaveCalls(), 0);
});

test("[5] invalid_combination performs no save", async () => {
  const mem = createInMemoryDeps();
  const outcome = await recordRegularProgressionSession(context(), regularInput({ sessionId: "r5", practicedStage: 1, projection: "link", completion: linkCompletion("r5") }), mem.deps);
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") assert.equal(outcome.applyOutcome.kind, "invalid_combination");
  assert.equal(mem.getSaveCalls(), 0);
});

test("[6] duplicate_session performs no second save", async () => {
  const mem = createInMemoryDeps();
  const ctx = context();
  const first = await recordRegularProgressionSession(ctx, regularInput({ sessionId: "r6", completion: fullCompletion("r6") }), mem.deps);
  assert.equal(first.kind, "processed");
  if (first.kind === "processed") assert.equal(first.applyOutcome.kind, "applied");
  assert.equal(mem.getSaveCalls(), 1);

  const second = await recordRegularProgressionSession(ctx, regularInput({ sessionId: "r6", practicedStage: 2, projection: "mini", completion: { projection: "mini", track: "personal_development", sessionId: "r6", state: COMPLETED_ACTION, identity: null } }), mem.deps);
  assert.equal(second.kind, "processed");
  if (second.kind === "processed") assert.equal(second.applyOutcome.kind, "duplicate_session");
  assert.equal(mem.getSaveCalls(), 1, "the duplicate attempt never triggers a second save");
});

test("[7] Goal exclusion performs no save", async () => {
  const mem = createInMemoryDeps();
  const outcome = await recordRegularProgressionSession(context(), regularInput({ track: "goal_achievement", completion: { ...fullCompletion("g1"), track: "goal_achievement" } }), mem.deps);
  assert.deepEqual(outcome, { kind: "not_eligible", reason: "goal_track_excluded" });
  assert.equal(mem.getSaveCalls(), 0);
});

test("[7] Goal exclusion for Stage 3 performs no save", async () => {
  const mem = createInMemoryDeps();
  const outcome = await recordStage3ProgressionSession(context(), stage3Input({ track: "goal_achievement" }), mem.deps);
  assert.deepEqual(outcome, { kind: "not_eligible", reason: "goal_track_excluded" });
  assert.equal(mem.getSaveCalls(), 0);
});

// ---------------------------------------------------------------------------
// [8] Idempotency across a simulated reload
// ---------------------------------------------------------------------------

test("[8] Save -> reload -> duplicate submission remains idempotent, with no second write", async () => {
  const backend = createPersistedBackend();
  const ctx = context();

  const first = await recordRegularProgressionSession(ctx, regularInput({ sessionId: "reload-dup", completion: fullCompletion("reload-dup") }), backend.makeDeps());
  assert.equal(first.kind, "processed");
  if (first.kind === "processed") assert.equal(first.applyOutcome.kind, "applied");

  const key = resolveProgressionMappingKey(ctx);
  const afterFirstWrite = backend.getPersisted()[key]?.stage1.completedFullCount;
  assert.equal(afterFirstWrite, 1);

  // Simulate an application reload -- a fresh deps object reading the same underlying persisted value.
  const reloadedDeps = backend.makeDeps();
  const second = await recordRegularProgressionSession(
    ctx,
    regularInput({ sessionId: "reload-dup", practicedStage: 2, projection: "mini", completion: { projection: "mini", track: "personal_development", sessionId: "reload-dup", state: COMPLETED_ACTION, identity: null } }),
    reloadedDeps
  );
  assert.equal(second.kind, "processed");
  if (second.kind === "processed") assert.equal(second.applyOutcome.kind, "duplicate_session");

  const finalCounters = backend.getPersisted()[key];
  assert.equal(finalCounters?.stage1.completedFullCount, 1, "unchanged");
  assert.equal(finalCounters?.stage2.completedMiniCount, 0, "the duplicate was never counted under Stage 2 either");
});

// ---------------------------------------------------------------------------
// [9]-[11] Separation after persistence
// ---------------------------------------------------------------------------

test("[9] Reactive and proactive mappings for the same State remain separate after persistence", async () => {
  const mem = createInMemoryDeps();
  const reactiveCtx = context({ item: thoughtItem() });
  const proactiveCtx = context({ item: null });

  await recordRegularProgressionSession(reactiveCtx, regularInput({ sessionId: "reactive-1", completion: fullCompletion("reactive-1") }), mem.deps);
  await recordRegularProgressionSession(proactiveCtx, regularInput({ sessionId: "proactive-1", completion: fullCompletion("proactive-1") }), mem.deps);

  const reactiveKey = resolveProgressionMappingKey(reactiveCtx);
  const proactiveKey = resolveProgressionMappingKey(proactiveCtx);
  assert.notEqual(reactiveKey, proactiveKey);

  const store = mem.getCurrentStore();
  assert.equal(store[reactiveKey]?.stage1.completedFullCount, 1);
  assert.equal(store[proactiveKey]?.stage1.completedFullCount, 1);
});

test("[10] Two different Identity IDs remain separate after persistence", async () => {
  const mem = createInMemoryDeps();
  const ctxA = context({ identity: identityProfile({ id: "identity-a" }) });
  const ctxB = context({ identity: identityProfile({ id: "identity-b" }) });

  await recordRegularProgressionSession(ctxA, regularInput({ sessionId: "ida-1", completion: fullCompletion("ida-1") }), mem.deps);
  await recordRegularProgressionSession(ctxB, regularInput({ sessionId: "idb-1", completion: fullCompletion("idb-1") }), mem.deps);

  const keyA = resolveProgressionMappingKey(ctxA);
  const keyB = resolveProgressionMappingKey(ctxB);
  assert.notEqual(keyA, keyB);
  const store = mem.getCurrentStore();
  assert.equal(store[keyA]?.stage1.completedFullCount, 1);
  assert.equal(store[keyB]?.stage1.completedFullCount, 1);
});

test("[11] The same Identity ID with a changed updatedAt retains its progress under one key", async () => {
  const mem = createInMemoryDeps();
  const ctxOld = context({ identity: identityProfile({ id: "identity-shared", updatedAt: NOW }) });
  await recordRegularProgressionSession(ctxOld, regularInput({ sessionId: "shared-1", completion: fullCompletion("shared-1") }), mem.deps);

  const ctxEdited = context({ identity: identityProfile({ id: "identity-shared", updatedAt: LATER, identityMantra: "מנטרה חדשה" }) });
  const outcome = await recordRegularProgressionSession(ctxEdited, regularInput({ sessionId: "shared-2", practicedStage: 1, projection: "mini", completion: { projection: "mini", track: "personal_development", sessionId: "shared-2", state: COMPLETED_ACTION, identity: null } }), mem.deps);
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") assert.equal(outcome.applyOutcome.kind, "applied");

  const key = resolveProgressionMappingKey(ctxOld);
  assert.equal(key, resolveProgressionMappingKey(ctxEdited), "same key despite the Identity content edit");
  const counters = mem.getCurrentStore()[key];
  assert.equal(counters?.stage1.completedFullCount, 1, "the earlier session's progress is retained");
  assert.equal(counters?.stage1.completedMiniCount, 1, "the new session accumulated onto the SAME record, not a fresh one");
});

// ---------------------------------------------------------------------------
// [12]-[14] Availability
// ---------------------------------------------------------------------------

test("[12] Availability returns [1] for a mapping with no saved progress", async () => {
  const mem = createInMemoryDeps();
  const stages = await loadAvailablePracticeStagesForMapping(context(), mem.deps);
  assert.deepEqual(stages, [1]);
});

test("[13] Availability reads existing persisted progress correctly", async () => {
  const mem = createInMemoryDeps();
  const ctx = context({ item: thoughtItem() });
  for (let i = 0; i < 10; i++) {
    await recordRegularProgressionSession(ctx, regularInput({ sessionId: `avail-${i}`, practicedStage: 1, projection: "mini", completion: { projection: "mini", track: "personal_development", sessionId: `avail-${i}`, state: COMPLETED_ACTION, identity: null } }), mem.deps);
  }
  const stages = await loadAvailablePracticeStagesForMapping(ctx, mem.deps);
  assert.deepEqual(stages, [1, 2]);
});

test("[14] Availability performs no write, even for an existing mapping", async () => {
  const mem = createInMemoryDeps();
  const ctx = context();
  await recordRegularProgressionSession(ctx, regularInput({ sessionId: "no-write-check", completion: fullCompletion("no-write-check") }), mem.deps);
  const savesBefore = mem.getSaveCalls();
  await loadAvailablePracticeStagesForMapping(ctx, mem.deps);
  assert.equal(mem.getSaveCalls(), savesBefore, "querying availability never triggers a save");
});

test("[14] Availability never creates a store entry for a fresh mapping", async () => {
  const mem = createInMemoryDeps();
  await loadAvailablePracticeStagesForMapping(context({ state: stateProfile({ id: "never-saved" }) }), mem.deps);
  assert.equal(mem.getSaveCalls(), 0);
  assert.deepEqual(mem.getCurrentStore(), {});
});

// ---------------------------------------------------------------------------
// [15] No mutation
// ---------------------------------------------------------------------------

test("[15] No context, input, loaded store, or saved store is mutated", async () => {
  const state = stateProfile();
  const item = thoughtItem();
  const identity = identityProfile();
  const ctx: ProgressionMappingContext = { state, item, identity };
  const input = regularInput({ sessionId: "immut-1", completion: fullCompletion("immut-1") });

  const stateCopy = JSON.parse(JSON.stringify(state));
  const itemCopy = JSON.parse(JSON.stringify(item));
  const identityCopy = JSON.parse(JSON.stringify(identity));
  const inputCopy = JSON.parse(JSON.stringify(input));

  const initialStore: MappingProgressionStore = {};
  const mem = createInMemoryDeps(initialStore);
  await recordRegularProgressionSession(ctx, input, mem.deps);

  assert.deepEqual(state, stateCopy);
  assert.deepEqual(item, itemCopy);
  assert.deepEqual(identity, identityCopy);
  assert.deepEqual(input, inputCopy);
  assert.deepEqual(initialStore, {}, "the store object originally passed to the in-memory backend's constructor is never mutated in place");
});

// ---------------------------------------------------------------------------
// [16] Storage failures propagate rather than fabricating success
// ---------------------------------------------------------------------------

test("[16] A save failure propagates as a rejected promise -- never silently returns as if it had applied", async () => {
  const failingDeps: ProgressionStorageDependencies = {
    loadStore: async () => ({}),
    saveStore: async () => {
      throw new Error("simulated AsyncStorage write failure");
    },
  };
  await assert.rejects(
    () => recordRegularProgressionSession(context(), regularInput({ sessionId: "fail-1", completion: fullCompletion("fail-1") }), failingDeps),
    /simulated AsyncStorage write failure/
  );
});

test("[16] A load failure also propagates rather than being swallowed", async () => {
  const failingDeps: ProgressionStorageDependencies = {
    loadStore: async () => {
      throw new Error("simulated AsyncStorage read failure");
    },
    saveStore: async () => {},
  };
  await assert.rejects(
    () => recordRegularProgressionSession(context(), regularInput({ sessionId: "fail-2", completion: fullCompletion("fail-2") }), failingDeps),
    /simulated AsyncStorage read failure/
  );
});
