import test from "node:test";
import assert from "node:assert/strict";

import {
  adaptIdentityCompletionSignal,
  adaptStateActionCompletionSignal,
  createLiveSessionCoordinatorContext,
  recordCompletedLiveSession,
} from "./liveSessionCoordinator.ts";
import type { CoordinatedLiveProjection, CreateLiveSessionCoordinatorContextInput, LiveSessionCoordinatorContext } from "./liveSessionCoordinator.ts";
import { createEmptyLiveState } from "./types.ts";
import type { ArcLiveState } from "./types.ts";
import { createEmptyStateProfile } from "./stateProfile.ts";
import type { StateProfile } from "./stateProfile.ts";
import { createEmptyIdentityProfile } from "./identityProfile.ts";
import type { IdentityProfile } from "./identityProfile.ts";
import { createEmptyUrgeInterferenceItem } from "./interferenceItem.ts";
import type { InterferenceItem } from "./interferenceItem.ts";
import { resolveProgressionMappingKey } from "./progressionSessionBridge.ts";
import type { ProgressionMappingContext } from "./progressionSessionBridge.ts";
import type { MappingProgressionStore } from "./reactiveProactiveProgression.ts";
import type { ProgressionStorageDependencies } from "../data/progressionSessionPersistence.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function stateProfile(overrides: Partial<StateProfile> = {}): StateProfile {
  return { ...createEmptyStateProfile("state1", "רוגע", "prog1", NOW), ...overrides };
}

function identityProfile(overrides: Partial<IdentityProfile> = {}): IdentityProfile {
  return { ...createEmptyIdentityProfile("identity1", "אדם רגוע", "prog1", NOW), ...overrides };
}

function urgeItem(overrides: Partial<InterferenceItem> = {}): InterferenceItem {
  return { ...createEmptyUrgeInterferenceItem("item1", "דחף", "prog1", NOW), ...overrides } as InterferenceItem;
}

function completeLiveState(overrides: Partial<ArcLiveState> = {}): ArcLiveState {
  return { ...createEmptyLiveState(), currentArcStage: "complete", actionReached: true, realActionCompleted: true, ...overrides };
}

function createContextInput(overrides: Partial<CreateLiveSessionCoordinatorContextInput> = {}): CreateLiveSessionCoordinatorContextInput {
  return {
    state: stateProfile(),
    item: null,
    identity: null,
    practicedStage: 1,
    projection: "full",
    track: "personal_development",
    identitySelected: false,
    ...overrides,
  };
}

/** Same in-memory storage double shape as data/progressionSessionPersistence.test.ts's own fixture -- tracks call counts and the last-saved store. */
function createInMemoryDeps(initial: MappingProgressionStore = {}) {
  let store: MappingProgressionStore = initial;
  let loadCalls = 0;
  let saveCalls = 0;
  const deps: ProgressionStorageDependencies = {
    loadStore: async () => {
      loadCalls += 1;
      return store;
    },
    saveStore: async (next) => {
      saveCalls += 1;
      store = next;
    },
  };
  return { deps, getLoadCalls: () => loadCalls, getSaveCalls: () => saveCalls, getCurrentStore: () => store };
}

// ---------------------------------------------------------------------------
// 1-3: session id lifecycle
// ---------------------------------------------------------------------------

test("createLiveSessionCoordinatorContext mints one sessionId and the returned context carries it", () => {
  const ctx = createLiveSessionCoordinatorContext(createContextInput({ generateSessionId: () => "sid-fixed" }));
  assert.equal(ctx.sessionId, "sid-fixed");
  assert.equal(ctx.sessionId, "sid-fixed", "reading it again returns the exact same, unchanged value");
});

test("re-render-style reuse -- calling recordCompletedLiveSession multiple times against the same context never re-mints the session id", async () => {
  let generateCalls = 0;
  const ctx = createLiveSessionCoordinatorContext(
    createContextInput({
      generateSessionId: () => {
        generateCalls += 1;
        return "sid-once";
      },
    })
  );
  assert.equal(generateCalls, 1, "generateSessionId ran exactly once, at context creation");

  const { deps } = createInMemoryDeps();
  await recordCompletedLiveSession(ctx, completeLiveState(), deps);
  await recordCompletedLiveSession(ctx, completeLiveState(), deps);

  assert.equal(generateCalls, 1, "recordCompletedLiveSession never calls the session-id generator itself -- it only ever reads context.sessionId");
  assert.equal(ctx.sessionId, "sid-once");
});

test("separate session starts (separate createLiveSessionCoordinatorContext calls) generate different ids with the real default generator", () => {
  const first = createLiveSessionCoordinatorContext(createContextInput());
  const second = createLiveSessionCoordinatorContext(createContextInput());
  assert.notEqual(first.sessionId, second.sessionId);
});

// ---------------------------------------------------------------------------
// 4-5: pure adapters
// ---------------------------------------------------------------------------

test("adaptStateActionCompletionSignal maps actionReached/realActionCompleted verbatim, every combination", () => {
  assert.deepEqual(adaptStateActionCompletionSignal(completeLiveState({ actionReached: true, realActionCompleted: true })), {
    actionReached: true,
    realActionCompleted: true,
  });
  assert.deepEqual(adaptStateActionCompletionSignal(completeLiveState({ actionReached: true, realActionCompleted: false })), {
    actionReached: true,
    realActionCompleted: false,
  });
  assert.deepEqual(adaptStateActionCompletionSignal(completeLiveState({ actionReached: false, realActionCompleted: false })), {
    actionReached: false,
    realActionCompleted: false,
  });
});

test("adaptIdentityCompletionSignal never reuses the State action's own actionReached/realActionCompleted as Identity evidence", () => {
  const sessionWithCompletedStateAction = completeLiveState({ actionReached: true, realActionCompleted: true });

  assert.deepEqual(adaptIdentityCompletionSignal(sessionWithCompletedStateAction, false), { kind: "not_selected" });
  assert.deepEqual(
    adaptIdentityCompletionSignal(sessionWithCompletedStateAction, true),
    { kind: "insufficient_identity_signal" },
    "even though the State action's own fields are both true on this session, that is never fabricated into Identity completion"
  );

  // Also true when the State action is INCOMPLETE -- the outcome for
  // identitySelected: true never varies with the State action's own
  // fields at all, proving the two are never conflated in either direction.
  const sessionWithIncompleteStateAction = completeLiveState({ actionReached: false, realActionCompleted: false });
  assert.deepEqual(adaptIdentityCompletionSignal(sessionWithIncompleteStateAction, true), { kind: "insufficient_identity_signal" });
});

// ---------------------------------------------------------------------------
// 6-10: validation / rejection ordering
// ---------------------------------------------------------------------------

test("Self Development without selected Identity records normally", async () => {
  const ctx = createLiveSessionCoordinatorContext(createContextInput({ identitySelected: false, identity: null }));
  const { deps } = createInMemoryDeps();
  const outcome = await recordCompletedLiveSession(ctx, completeLiveState(), deps);
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") assert.equal(outcome.applyOutcome.kind, "applied");
});

test("identitySelected true with no linked IdentityProfile is rejected as inconsistent, before persistence", async () => {
  const ctx = createLiveSessionCoordinatorContext(createContextInput({ identitySelected: true, identity: null }));
  const { deps, getLoadCalls, getSaveCalls } = createInMemoryDeps();
  const outcome = await recordCompletedLiveSession(ctx, completeLiveState(), deps);
  assert.deepEqual(outcome, { kind: "inconsistent_identity_context", reason: "identity_selected_without_profile" });
  assert.equal(getLoadCalls(), 0);
  assert.equal(getSaveCalls(), 0);
});

test("identitySelected true with a linked IdentityProfile is still rejected -- ArcLiveState has no independent Identity-completion evidence today", async () => {
  const ctx = createLiveSessionCoordinatorContext(createContextInput({ identitySelected: true, identity: identityProfile() }));
  const { deps, getLoadCalls, getSaveCalls } = createInMemoryDeps();
  const outcome = await recordCompletedLiveSession(ctx, completeLiveState(), deps);
  assert.deepEqual(outcome, { kind: "inconsistent_identity_context", reason: "insufficient_identity_signal" });
  assert.equal(getLoadCalls(), 0);
  assert.equal(getSaveCalls(), 0);
});

test("a missing StateProfile is rejected -- reachable only by bypassing the typed API", async () => {
  const ctx: LiveSessionCoordinatorContext = {
    sessionId: "sid-missing-state",
    state: null as unknown as StateProfile,
    item: null,
    identity: null,
    practicedStage: 1,
    projection: "full",
    track: "personal_development",
    identitySelected: false,
  };
  const { deps, getSaveCalls } = createInMemoryDeps();
  const outcome = await recordCompletedLiveSession(ctx, completeLiveState(), deps);
  assert.deepEqual(outcome, { kind: "missing_state_profile" });
  assert.equal(getSaveCalls(), 0);
});

test("a session that never reached its real terminal 'complete' transition is rejected, even with actionReached/realActionCompleted both true", async () => {
  const ctx = createLiveSessionCoordinatorContext(createContextInput());
  const { deps, getSaveCalls } = createInMemoryDeps();
  const midProtocolSession = completeLiveState({ currentArcStage: "act" });
  const outcome = await recordCompletedLiveSession(ctx, midProtocolSession, deps);
  assert.deepEqual(outcome, { kind: "session_not_complete" });
  assert.equal(getSaveCalls(), 0);
});

test("ARC Goal (goal_achievement) is rejected before any persistence call is made", async () => {
  const ctx = createLiveSessionCoordinatorContext(createContextInput({ track: "goal_achievement" }));
  const { deps, getLoadCalls, getSaveCalls } = createInMemoryDeps();
  const outcome = await recordCompletedLiveSession(ctx, completeLiveState(), deps);
  assert.deepEqual(outcome, { kind: "goal_track_excluded" });
  assert.equal(getLoadCalls(), 0, "rejected before Phase 8's persistence layer is ever reached");
  assert.equal(getSaveCalls(), 0);
});

// ---------------------------------------------------------------------------
// 11-15: supported/unsupported projections
// ---------------------------------------------------------------------------

test("a Full completion calls persistence exactly once", async () => {
  const ctx = createLiveSessionCoordinatorContext(createContextInput({ practicedStage: 1, projection: "full" }));
  const { deps, getSaveCalls } = createInMemoryDeps();
  const outcome = await recordCompletedLiveSession(ctx, completeLiveState(), deps);
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") assert.equal(outcome.applyOutcome.kind, "applied");
  assert.equal(getSaveCalls(), 1);
});

test("a Mini completion calls persistence exactly once", async () => {
  const ctx = createLiveSessionCoordinatorContext(createContextInput({ practicedStage: 1, projection: "mini" }));
  const { deps, getSaveCalls } = createInMemoryDeps();
  const outcome = await recordCompletedLiveSession(ctx, completeLiveState(), deps);
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") assert.equal(outcome.applyOutcome.kind, "applied");
  assert.equal(getSaveCalls(), 1);
});

test("an Action-only completion calls persistence exactly once", async () => {
  const ctx = createLiveSessionCoordinatorContext(createContextInput({ practicedStage: 4, projection: "action_only" }));
  const { deps, getSaveCalls } = createInMemoryDeps();
  const outcome = await recordCompletedLiveSession(ctx, completeLiveState(), deps);
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") assert.equal(outcome.applyOutcome.kind, "applied");
  assert.equal(getSaveCalls(), 1);
});

test("Link is unsupported and performs zero persistence calls -- reachable only by bypassing CoordinatedLiveProjection's own type exclusion", async () => {
  const ctx = createLiveSessionCoordinatorContext(createContextInput({ projection: "link" as unknown as CoordinatedLiveProjection }));
  const { deps, getLoadCalls, getSaveCalls } = createInMemoryDeps();
  const outcome = await recordCompletedLiveSession(ctx, completeLiveState(), deps);
  assert.deepEqual(outcome, { kind: "unsupported_projection", projection: "link" });
  assert.equal(getLoadCalls(), 0);
  assert.equal(getSaveCalls(), 0);
});

test("Stage 3 has no representation this module accepts -- practicedStage 3 with any supported projection is rejected downstream as an invalid combination and never persists a write", async () => {
  // Phase 9 exposes no Stage 3 entry point at all (see CoordinatedLiveProjection's
  // own doc) -- practicedStage: 3 paired with a regular projection is simply
  // an invalid stage/projection pairing under Phase 6's own unmodified rule
  // (arc/reactiveProactiveProgression.ts's isValidStageProjectionCombination:
  // stage 3 only ever accepts "link_plus_action", never a regular ArcProjectionKind),
  // reached via the SAME "processed" -> applyOutcome.kind === "invalid_combination"
  // path as any other invalid pairing -- never a special case in this module.
  const ctx = createLiveSessionCoordinatorContext(createContextInput({ practicedStage: 3, projection: "full" }));
  const { deps, getSaveCalls } = createInMemoryDeps();
  const outcome = await recordCompletedLiveSession(ctx, completeLiveState(), deps);
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") {
    assert.equal(outcome.applyOutcome.kind, "invalid_combination");
  }
  assert.equal(getSaveCalls(), 0, "no persisted write for an invalid combination");
});

// ---------------------------------------------------------------------------
// 16-18: Phase 6/7/8 outcomes pass through unchanged, exactly-once durability
// ---------------------------------------------------------------------------

test("an invalid stage/projection pairing passes Phase 6's own outcome through unchanged", async () => {
  // Stage 1 only accepts full/mini -- action_only is invalid for stage 1.
  const ctx = createLiveSessionCoordinatorContext(createContextInput({ practicedStage: 1, projection: "action_only" }));
  const { deps, getSaveCalls } = createInMemoryDeps();
  const outcome = await recordCompletedLiveSession(ctx, completeLiveState(), deps);
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") {
    assert.deepEqual(outcome.applyOutcome, { kind: "invalid_combination", stage: 1, projection: "action_only" });
  }
  assert.equal(getSaveCalls(), 0);
});

test("re-submitting the same sessionId surfaces Phase 6's duplicate_session outcome unchanged, and does not write a second time", async () => {
  const ctx = createLiveSessionCoordinatorContext(createContextInput({ generateSessionId: () => "sid-dup", practicedStage: 1, projection: "full" }));
  const { deps, getSaveCalls } = createInMemoryDeps();

  const first = await recordCompletedLiveSession(ctx, completeLiveState(), deps);
  assert.equal(first.kind, "processed");
  if (first.kind === "processed") assert.equal(first.applyOutcome.kind, "applied");

  const second = await recordCompletedLiveSession(ctx, completeLiveState(), deps);
  assert.equal(second.kind, "processed");
  if (second.kind === "processed") {
    assert.equal(second.applyOutcome.kind, "duplicate_session");
    if (second.applyOutcome.kind === "duplicate_session") {
      assert.equal(second.applyOutcome.sessionId, "sid-dup");
      assert.deepEqual(second.applyOutcome.existing, { stage: 1, projection: "full" });
    }
  }

  assert.equal(getSaveCalls(), 1, "only the first, genuinely new completion ever persisted a write");
});

test("reusing the same sessionId after a persisted completion does not increment the counters a second time", async () => {
  const ctx = createLiveSessionCoordinatorContext(createContextInput({ generateSessionId: () => "sid-once-counted", practicedStage: 1, projection: "full" }));
  const { deps, getCurrentStore } = createInMemoryDeps();

  await recordCompletedLiveSession(ctx, completeLiveState(), deps);
  const mappingContext: ProgressionMappingContext = { state: ctx.state, item: ctx.item, identity: ctx.identity };
  const key = resolveProgressionMappingKey(mappingContext);
  assert.equal(getCurrentStore()[key]?.stage1.completedFullCount, 1);

  await recordCompletedLiveSession(ctx, completeLiveState(), deps);
  assert.equal(getCurrentStore()[key]?.stage1.completedFullCount, 1, "still 1, not 2 -- the duplicate session id never incremented anything further");
});

// ---------------------------------------------------------------------------
// 19-20: reactive vs. proactive context passthrough
// ---------------------------------------------------------------------------

test("a reactive context (InterferenceItem supplied) preserves that exact item and resolves the reactive cadence", async () => {
  const item = urgeItem();
  const ctx = createLiveSessionCoordinatorContext(createContextInput({ item }));
  assert.equal(ctx.item, item, "the exact same object, never a copy or a different item");

  const { deps } = createInMemoryDeps();
  const outcome = await recordCompletedLiveSession(ctx, completeLiveState(), deps);
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") assert.equal(outcome.cadence, "reactive");
});

test("a proactive context (item: null) preserves null and resolves the proactive cadence", async () => {
  const ctx = createLiveSessionCoordinatorContext(createContextInput({ item: null }));
  assert.equal(ctx.item, null);

  const { deps } = createInMemoryDeps();
  const outcome = await recordCompletedLiveSession(ctx, completeLiveState(), deps);
  assert.equal(outcome.kind, "processed");
  if (outcome.kind === "processed") assert.equal(outcome.cadence, "proactive");
});

// ---------------------------------------------------------------------------
// 21-22: immutability + no write on any rejected outcome
// ---------------------------------------------------------------------------

test("recordCompletedLiveSession never mutates its inputs", async () => {
  const ctx = createLiveSessionCoordinatorContext(createContextInput({ item: urgeItem(), identity: null }));
  const session = completeLiveState();
  const ctxSnapshot = JSON.parse(JSON.stringify(ctx));
  const sessionSnapshot = JSON.parse(JSON.stringify(session));

  const { deps } = createInMemoryDeps();
  await recordCompletedLiveSession(ctx, session, deps);

  assert.deepEqual(JSON.parse(JSON.stringify(ctx)), ctxSnapshot);
  assert.deepEqual(JSON.parse(JSON.stringify(session)), sessionSnapshot);
});

test("no coordinator-level rejected outcome ever performs a storage write", async () => {
  const scenarios: Array<{ ctx: LiveSessionCoordinatorContext; session: ArcLiveState }> = [
    { ctx: createLiveSessionCoordinatorContext(createContextInput()), session: completeLiveState({ currentArcStage: "act" }) }, // session_not_complete
    { ctx: createLiveSessionCoordinatorContext(createContextInput({ track: "goal_achievement" })), session: completeLiveState() }, // goal_track_excluded
    {
      ctx: { ...createLiveSessionCoordinatorContext(createContextInput()), state: null as unknown as StateProfile },
      session: completeLiveState(),
    }, // missing_state_profile
    {
      ctx: createLiveSessionCoordinatorContext(createContextInput({ projection: "link" as unknown as CoordinatedLiveProjection })),
      session: completeLiveState(),
    }, // unsupported_projection
    { ctx: createLiveSessionCoordinatorContext(createContextInput({ identitySelected: true, identity: null })), session: completeLiveState() }, // inconsistent_identity_context
  ];

  for (const scenario of scenarios) {
    const { deps, getSaveCalls } = createInMemoryDeps();
    const outcome = await recordCompletedLiveSession(scenario.ctx, scenario.session, deps);
    assert.notEqual(outcome.kind, "processed", "every scenario above is expected to be a coordinator-level rejection, not a processed result");
    assert.equal(getSaveCalls(), 0, `no write for outcome kind "${outcome.kind}"`);
  }
});
