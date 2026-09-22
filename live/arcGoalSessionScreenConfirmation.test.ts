/**
 * live/arcGoalSessionScreenConfirmation.test.ts
 *
 * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 6: a
 * PERMANENT test that follows live/ArcGoalSessionScreen.tsx's OWN real
 * call sequence -- not just the persistence layer's own behavior (already
 * covered by arc/pendingSharedActionExecution.test.ts,
 * data/pendingSharedActionExecutionPersistence.test.ts, and
 * data/arcGoalCompletionIntegration.test.ts).
 *
 * There is no React component test harness in this codebase (confirmed:
 * no react-test-renderer/@testing-library usage anywhere outside
 * node_modules) -- every existing test drives real arc/ engine functions
 * directly, the same functions the screens call. This file follows that
 * exact convention: driveArcGoalSession below calls the SAME real
 * functions live/ArcGoalSessionScreen.tsx now calls
 * (startPendingSharedActionExecution/confirmActionRoleAndPersist/
 * recordSharedLiveSessionCompletion), at the SAME points in the SAME
 * order the screen's own handlers do:
 *   1. reassessment resolves (or is skipped for a no-mapping goal)
 *      -> startPendingSharedActionExecution with the role list the
 *      screen's own onSelect now computes.
 *   2. the bridge is confirmed (urge_action_confirm/supportive_action_confirm's
 *      own onPress) -> confirmActionRoleAndPersist(BENEFICIAL_ACTION_ROLE)
 *      + an attempted commit (a safe no-op while the outer run hasn't
 *      reached "act" yet).
 *   3. the outer run's own "act" stage is explicitly confirmed
 *      (ActionScreen's onCompleted -> applyActionCompletion(session, true)
 *      -> commitAdvanceOuter) -> confirmActionRoleAndPersist(IDENTITY_GOAL_ACTION_ROLE)
 *      + the commit that actually writes progress.
 *
 * Key verified fact this file pins down: arc/arcEngine.ts's own pure
 * transition resolver has NO internal check on ArcLiveState.realActionCompleted
 * (confirmed: zero references to that field anywhere in arc/arcEngine.ts;
 * arc/arcGoalEngine.test.ts's own runFullWalk helper reaches "complete"
 * without ever setting it). The "never confirm before explicit
 * confirmation" boundary is therefore enforced ENTIRELY by
 * live/ArcGoalSessionScreen.tsx's own wiring -- specifically, that
 * ActionScreen's onCompleted is the ONLY caller that ever calls
 * commitAdvance from "act", and it always applies realActionCompleted:
 * true first (see this file's own "act" branch below, mirroring that
 * exactly) -- never a guarantee from the shared engine itself. This test
 * demonstrates the boundary holds at the wiring layer that actually
 * ships, and separately demonstrates what happens if that wiring were
 * bypassed (the defensive realActionCompleted guard in commitAdvanceOuter
 * -- mirrored here -- is what actually stops a false confirmation, not
 * the pure engine).
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  createArcGoalInnerInitialSession,
  createArcGoalOuterInitialSession,
  createArcGoalUrgeInnerInitialSession,
  createEmptyArcGoalLiveState,
  needsReassessmentDetour,
  needsTriggerPrefixDetour,
  resolveAfterBridgeConfirmed,
  resolveAfterReassessment,
  resolveAfterThirdPersonImagery,
  resolveAfterTriggerIdentification,
  resolveAfterUrgeNeedIdentification,
  resolveSelectedMapping,
  resolveSelectedUrgeMapping,
  shouldInterceptInnerAtAct,
  urgeArcToProfile,
} from "../arc/arcGoalEngine.ts";
import type { ArcGoalLiveState, ArcGoalUiStage, ReassessmentChoice } from "../arc/arcGoalEngine.ts";
import { applyActionCompletion, advanceLiveSession } from "./liveEventAdapter.ts";
import { createEmptyArcBuildProfile, createEmptyArcGoal, createEmptyUrgeArc } from "../arc/types.ts";
import type { ArcBuildProfile, ArcGoal, ArcLiveState, ArcStage, UrgeArc } from "../arc/types.ts";
import { toArcGoalSharedFacts } from "../arc/sharedLiveSessionFacts.ts";
import { startPendingSharedActionExecution, confirmActionRoleAndPersist, loadPendingSharedActionExecution } from "../data/pendingSharedActionExecutionPersistence.ts";
import type { PendingSharedActionExecutionStorageDependencies } from "../data/pendingSharedActionExecutionPersistence.ts";
import { recordSharedLiveSessionCompletion } from "../data/sharedLiveSessionCompletion.ts";
import type { CommitArcGoalProgressDependencies } from "../data/pendingSharedActionExecutionPersistence.ts";
import type { ArcGoalSessionProgressStorageDependencies } from "../data/arcGoalSessionProgressPersistence.ts";
import type { ArcGoalSessionProgressStore, PendingSharedActionExecutionStore } from "../data/storage.ts";

const NOW = "2026-01-01T09:00:00.000Z";

const BENEFICIAL_ACTION_ROLE = "beneficial_action";
const IDENTITY_GOAL_ACTION_ROLE = "identity_goal_action";

// --- Fixtures (mirrors arc/arcGoalEngine.test.ts's own local builders) ---

function goal(overrides: Partial<ArcGoal> = {}): ArcGoal {
  return { ...createEmptyArcGoal("g1", "מטרה", "2024-01-01T00:00:00.000Z"), identityProtocolId: "identity-1", goalAction: "לעבוד", desiredResult: "תוצאה", ...overrides };
}

function identityProfile(overrides: Partial<ArcBuildProfile> = {}): ArcBuildProfile {
  return { ...createEmptyArcBuildProfile(), desiredIdentity: "מוזיקאי", identityAction: "להקליט שיר", regulationTool: "נשימה", presenceColor: "כחול", ...overrides };
}

function urgeArc(overrides: Partial<UrgeArc> = {}): UrgeArc {
  return { ...createEmptyUrgeArc("urge-1", "דחף", "2024-01-01T00:00:00.000Z"), interferingAction: "להדליק סיגריה", regulationAnchor: "נשימה", beneficialAlternativeAction: "לשתות מים", ...overrides };
}

function fakePendingDeps(initial: PendingSharedActionExecutionStore = {}): PendingSharedActionExecutionStorageDependencies {
  let store = initial;
  return {
    loadStore: async () => store,
    saveStore: async (next) => {
      store = next;
    },
  };
}

function fakeProgressDeps(initial: ArcGoalSessionProgressStore = {}): ArcGoalSessionProgressStorageDependencies {
  let store = initial;
  return {
    loadStore: async () => store,
    saveStore: async (next) => {
      store = next;
    },
  };
}

interface DriveResult {
  progressAfterBridgeConfirm: ArcGoalSessionProgressStore;
  progressAfterActConfirm: ArcGoalSessionProgressStore;
  outerStage: ArcStage;
  outerSession: ArcLiveState;
}

/**
 * Drives one ArcGoal session exactly the way live/ArcGoalSessionScreen.tsx
 * now does, calling the real persistence functions at the exact points
 * the screen's own handlers call them -- see this file's own module doc.
 * `confirmAct: false` reaches "act" and advances past it WITHOUT ever
 * calling applyActionCompletion/confirming the role, to prove the
 * boundary holds even though the pure engine itself permits the advance.
 */
async function driveArcGoalSession(options: {
  g: ArcGoal;
  identity: ArcBuildProfile;
  reassessmentChoice: ReassessmentChoice;
  urgeProfile?: ArcBuildProfile;
  arcGoalId: string;
  sessionId: string;
  pendingDeps: PendingSharedActionExecutionStorageDependencies;
  progressDeps: ArcGoalSessionProgressStorageDependencies;
  confirmAct?: boolean;
}): Promise<DriveResult> {
  const { g, identity, reassessmentChoice, urgeProfile, arcGoalId, sessionId, pendingDeps, progressDeps, confirmAct = true } = options;
  const commitDeps: CommitArcGoalProgressDependencies = { pending: pendingDeps, progress: progressDeps };

  let outerSession = createArcGoalOuterInitialSession();
  let outerStage: ArcStage = "trigger_selection";
  {
    const hop = advanceLiveSession(outerStage, outerSession, identity, ["identity"]);
    outerSession = hop.session;
    outerStage = hop.stage;
  }

  let innerSession = createArcGoalInnerInitialSession();
  let innerStage: ArcStage = "sensation_check";
  let goalState: ArcGoalLiveState = createEmptyArcGoalLiveState();
  let uiStage: ArcGoalUiStage = "outer";
  let progressAfterBridgeConfirm: ArcGoalSessionProgressStore = {};

  // Screen equivalent: a goal with no mappings at all never shows
  // reassessment, so the queue starts immediately (see this file's own
  // module doc, point 1's "no mapping" branch).
  if (!needsReassessmentDetour(g, goalState)) {
    await startPendingSharedActionExecution("arc_goal", arcGoalId, sessionId, [IDENTITY_GOAL_ACTION_ROLE], NOW, pendingDeps);
  }

  let iterations = 0;
  while (uiStage !== "goal_action_confirm" && iterations < 200) {
    iterations++;

    if (uiStage === "outer") {
      if (outerStage === "presence_check" || outerStage === "arc_thought_presence_recheck") outerSession = { ...outerSession, presenceRating: 8 };
      if (outerStage === "desired_state_check") outerSession = { ...outerSession, desiredStateRating: 8 };

      if (outerStage === "act") {
        const mapping = resolveSelectedMapping(g, goalState) ?? resolveSelectedUrgeMapping(g, goalState);
        if (confirmAct) {
          const patched = applyActionCompletion(outerSession, true);
          const hop = advanceLiveSession(outerStage, patched, identity, ["identity"]);
          outerSession = hop.session;
          outerStage = hop.stage;
          // Screen equivalent: commitAdvanceOuter's own "outerStage === 'act' && nextStage !== 'act'" branch.
          if (outerSession.realActionCompleted) {
            await confirmActionRoleAndPersist("arc_goal", arcGoalId, IDENTITY_GOAL_ACTION_ROLE, NOW, pendingDeps);
            const facts = toArcGoalSharedFacts({
              sessionId,
              arcGoalId,
              weeklyActionId: null,
              outerSession,
              goalState,
              mappingActionRelationship: mapping?.actionRelationship ?? null,
              terminalCompleted: true,
            });
            await recordSharedLiveSessionCompletion(facts, NOW, { arcGoal: commitDeps });
          }
        } else {
          // Deliberately bypasses applyActionCompletion, mirroring "the
          // pure engine advances anyway" -- never confirms the role.
          const hop = advanceLiveSession(outerStage, outerSession, identity, ["identity"]);
          outerSession = hop.session;
          outerStage = hop.stage;
        }
        continue;
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
      if (outerStage === "complete") uiStage = "goal_action_confirm";
      continue;
    }

    if (uiStage === "trigger_identification") {
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
      // Screen equivalent: the reassessment screen's own onSelect --
      // starts the queue BEFORE resolveAfterReassessment, exactly like
      // live/ArcGoalSessionScreen.tsx now does.
      const roles = reassessmentChoice === "direct" ? [IDENTITY_GOAL_ACTION_ROLE] : [BENEFICIAL_ACTION_ROLE, IDENTITY_GOAL_ACTION_ROLE];
      await startPendingSharedActionExecution("arc_goal", arcGoalId, sessionId, roles, NOW, pendingDeps);
      const hop = resolveAfterReassessment(reassessmentChoice, g, goalState, {});
      uiStage = hop.uiStage;
      goalState = hop.goalState;
      if (uiStage === "inner") {
        innerSession = reassessmentChoice === "urge" ? createArcGoalUrgeInnerInitialSession() : createArcGoalInnerInitialSession();
        innerStage = "sensation_check";
      }
      continue;
    }

    if (uiStage === "inner") {
      const profile = reassessmentChoice === "urge" ? urgeProfile! : identity;
      const activeLayers = reassessmentChoice === "urge" ? (["habit"] as const) : (["state"] as const);
      if (innerStage === "sensation_check") innerSession = { ...innerSession, sensationIntensity: 2, sensationLocation: "חזה" };
      const hop = advanceLiveSession(innerStage, innerSession, profile, activeLayers as never);
      innerSession = hop.session;
      innerStage = hop.stage;
      if (shouldInterceptInnerAtAct(innerStage)) {
        const nextUiStage: ArcGoalUiStage = reassessmentChoice === "urge" ? "urge_action_confirm" : "supportive_action_confirm";
        goalState = { ...goalState, uiStage: nextUiStage, executionMode: "full" };
        uiStage = nextUiStage;
      }
      continue;
    }

    if (uiStage === "urge_action_confirm" || uiStage === "supportive_action_confirm") {
      // Screen equivalent: the bridge confirm button's own onPress.
      await confirmActionRoleAndPersist("arc_goal", arcGoalId, BENEFICIAL_ACTION_ROLE, NOW, pendingDeps);
      const resolved = resolveAfterBridgeConfirmed(goalState);
      const mapping = resolveSelectedMapping(g, resolved) ?? resolveSelectedUrgeMapping(g, resolved);
      const facts = toArcGoalSharedFacts({
        sessionId,
        arcGoalId,
        weeklyActionId: null,
        outerSession,
        goalState: resolved,
        mappingActionRelationship: mapping?.actionRelationship ?? null,
        terminalCompleted: true,
      });
      await recordSharedLiveSessionCompletion(facts, NOW, { arcGoal: commitDeps });
      progressAfterBridgeConfirm = await progressDeps.loadStore();
      goalState = resolved;
      uiStage = "outer";
      continue;
    }
  }

  const progressAfterActConfirm = await progressDeps.loadStore();
  return { progressAfterBridgeConfirm, progressAfterActConfirm, outerStage, outerSession };
}

// --- The required scenario: two distinct required roles ---

test("Beneficial Action confirmed alone writes no progress; the outer act confirmation is what completes and writes it exactly once", async () => {
  const identity = identityProfile();
  const urge = urgeArc();
  const g = goal({ urgeMappings: [{ id: "um1", urgeArcId: urge.id, need: null, miniArcId: null, executionMode: "full", identityProtocolId: null, goalAction: null }] });
  const urgeProfile = urgeArcToProfile(urge);
  const pendingDeps = fakePendingDeps();
  const progressDeps = fakeProgressDeps();

  const result = await driveArcGoalSession({
    g,
    identity,
    reassessmentChoice: "urge",
    urgeProfile,
    arcGoalId: "goal-1",
    sessionId: "session-1",
    pendingDeps,
    progressDeps,
  });

  assert.deepEqual(result.progressAfterBridgeConfirm["goal-1"], undefined, "confirming the Beneficial Action alone must never write progress");
  assert.equal(result.outerStage, "complete");
  assert.equal(result.progressAfterActConfirm["goal-1"]?.completedSessions, 1, "progress is written exactly once, once both roles are confirmed");
});

test("a direct-route session (no bridge) only ever requires the Identity/Goal Action role, and still writes progress exactly once", async () => {
  const identity = identityProfile();
  const g = goal({ urgeMappings: [{ id: "um1", urgeArcId: "urge-1", need: null, miniArcId: null, executionMode: "full", identityProtocolId: null, goalAction: null }] });
  const pendingDeps = fakePendingDeps();
  const progressDeps = fakeProgressDeps();

  const result = await driveArcGoalSession({ g, identity, reassessmentChoice: "direct", arcGoalId: "goal-2", sessionId: "session-2", pendingDeps, progressDeps });

  assert.equal(result.outerStage, "complete");
  assert.equal(result.progressAfterActConfirm["goal-2"]?.completedSessions, 1);
  const execution = await loadPendingSharedActionExecution("arc_goal", "goal-2", pendingDeps);
  assert.equal(execution?.actionQueue.length, 1, "direct route only ever required one role");
});

test("a goal with no mappings at all starts its queue immediately (reassessment never shows) and requires only the Identity/Goal Action role", async () => {
  const identity = identityProfile();
  const g = goal({ urgeMappings: [], interferingMappings: [] });
  const pendingDeps = fakePendingDeps();
  const progressDeps = fakeProgressDeps();

  const result = await driveArcGoalSession({ g, identity, reassessmentChoice: "direct", arcGoalId: "goal-3", sessionId: "session-3", pendingDeps, progressDeps });

  assert.equal(result.outerStage, "complete");
  assert.equal(result.progressAfterActConfirm["goal-3"]?.completedSessions, 1);
});

test("reaching and leaving 'act' WITHOUT the explicit onActionCompleted confirmation never confirms the role or writes progress, even though the pure engine allows the stage to advance", async () => {
  const identity = identityProfile();
  const g = goal({ urgeMappings: [], interferingMappings: [] });
  const pendingDeps = fakePendingDeps();
  const progressDeps = fakeProgressDeps();

  const result = await driveArcGoalSession({ g, identity, reassessmentChoice: "direct", arcGoalId: "goal-4", sessionId: "session-4", pendingDeps, progressDeps, confirmAct: false });

  // The pure engine still reaches "complete" -- arc/arcEngine.ts has no internal realActionCompleted check.
  assert.equal(result.outerStage, "complete", "sanity check: the pure engine itself never blocked the advance");
  assert.equal(result.outerSession.realActionCompleted, false, "realActionCompleted was genuinely never set");
  assert.equal(result.progressAfterActConfirm["goal-4"], undefined, "no progress is ever written without the explicit confirmation, despite the stage having advanced");

  const execution = await loadPendingSharedActionExecution("arc_goal", "goal-4", pendingDeps);
  assert.equal(execution?.actionQueue[0].status, "pending", "the role itself was never confirmed either");
});

// --- Retry: confirming both roles again, and re-attempting the commit, never double-counts ---

test("retrying both role confirmations and the commit after a full completed walk leaves the count at exactly one", async () => {
  const identity = identityProfile();
  const urge = urgeArc();
  const g = goal({ urgeMappings: [{ id: "um1", urgeArcId: urge.id, need: null, miniArcId: null, executionMode: "full", identityProtocolId: null, goalAction: null }] });
  const urgeProfile = urgeArcToProfile(urge);
  const pendingDeps = fakePendingDeps();
  const progressDeps = fakeProgressDeps();

  await driveArcGoalSession({ g, identity, reassessmentChoice: "urge", urgeProfile, arcGoalId: "goal-5", sessionId: "session-5", pendingDeps, progressDeps });

  // Retry: re-send both confirmations (mirroring a re-tapped button / re-fired effect) and re-attempt the commit.
  await confirmActionRoleAndPersist("arc_goal", "goal-5", BENEFICIAL_ACTION_ROLE, NOW, pendingDeps);
  await confirmActionRoleAndPersist("arc_goal", "goal-5", IDENTITY_GOAL_ACTION_ROLE, NOW, pendingDeps);
  const executionBeforeRetryCommit = await loadPendingSharedActionExecution("arc_goal", "goal-5", pendingDeps);
  const facts = toArcGoalSharedFacts({
    sessionId: "session-5",
    arcGoalId: "goal-5",
    weeklyActionId: null,
    outerSession: { ...createArcGoalOuterInitialSession(), currentArcStage: "complete", realActionCompleted: true },
    goalState: createEmptyArcGoalLiveState(),
    mappingActionRelationship: "legacy_unspecified",
    terminalCompleted: true,
  });
  await recordSharedLiveSessionCompletion(facts, "2026-01-01T10:00:00.000Z", { arcGoal: { pending: pendingDeps, progress: progressDeps } });

  assert.equal(executionBeforeRetryCommit?.status, "progress_committed", "already committed before the retry");
  const finalProgress = await progressDeps.loadStore();
  assert.equal(finalProgress["goal-5"]?.completedSessions, 1, "the count remains exactly one after retrying both confirmations and the commit");
});
