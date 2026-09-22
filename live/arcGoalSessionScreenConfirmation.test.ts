/**
 * live/arcGoalSessionScreenConfirmation.test.ts
 *
 * Adaptive ARC architecture task (unified PD/ARC Goal), Phase 6
 * correction: a PERMANENT test that follows live/ArcGoalSessionScreen.tsx's
 * OWN real, CORRECTED call sequence -- not just the persistence layer's
 * own behavior (already covered by arc/pendingSharedActionExecution.test.ts,
 * data/pendingSharedActionExecutionPersistence.test.ts, and
 * data/arcGoalCompletionIntegration.test.ts).
 *
 * Corrects an earlier, wrong version of this file that silently treated
 * the outer run's own "act" confirmation AS the confirmation of
 * ArcGoal.goalAction. getGoalActionConfirmCopy's own doc is explicit the
 * two are DISTINCT real actions ("distinct from the identity protocol's
 * own identityAction") -- this file now tracks and asserts BOTH,
 * separately, in the corrected order:
 *
 *   1. (optional) reassessment resolves to urge/supportive -> the bridge
 *      runs -> its own confirm screen (urge_action_confirm/
 *      supportive_action_confirm) IS the Beneficial Action role's
 *      explicit confirmation.
 *   2. the outer run's own "act" stage is explicitly confirmed
 *      (ActionScreen's onCompleted -> applyActionCompletion(session, true)
 *      -> commitAdvanceOuter) -- the Identity Action role's own
 *      confirmation. Writes no progress by itself (Goal Action has not
 *      been confirmed yet).
 *   3. commitAdvanceOuter's own shouldInterceptOuterAtSuccessFocus
 *      intercepts the act -> success_focus transition BEFORE it ever
 *      renders, diverting to the (relocated) goal_action_confirm screen.
 *      Its own "סיימתי" tap is the Goal Action role's explicit
 *      confirmation -- the LAST required role, so this is also where
 *      progress is actually written (exactly once).
 *   4. only THEN does the outer run resume into success_focus (and the
 *      rest of the native tail: gratitude_and_learning -> ... -> complete
 *      -> the gratitude/reflection screen -> the screen's own true final
 *      exit, handleCompleteContinue/handleSessionExit).
 *
 * There is no React component test harness in this codebase (confirmed:
 * no react-test-renderer/@testing-library usage anywhere outside
 * node_modules) -- driveArcGoalSession below calls the SAME real
 * functions live/ArcGoalSessionScreen.tsx now calls, at the SAME points
 * in the SAME order the screen's own handlers do.
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
  shouldInterceptOuterAtSuccessFocus,
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
const IDENTITY_ACTION_ROLE = "identity_action";
const GOAL_ACTION_ROLE = "goal_action";

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
  progressAfterIdentityActionConfirm: ArcGoalSessionProgressStore;
  progressAfterGoalActionConfirm: ArcGoalSessionProgressStore;
  visitedGoalActionConfirmBeforeSuccessFocus: boolean;
  outerStage: ArcStage;
  outerSession: ArcLiveState;
}

/**
 * Drives one ArcGoal session exactly the way the CORRECTED
 * live/ArcGoalSessionScreen.tsx now does, calling the real persistence
 * functions at the exact points the screen's own handlers call them --
 * see this file's own module doc. `confirmAct: false` reaches and leaves
 * "act" WITHOUT ever calling applyActionCompletion/confirming the
 * Identity Action role, to prove the boundary holds even though the pure
 * engine itself permits the advance (arc/arcEngine.ts has no internal
 * realActionCompleted check).
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

  async function attemptCommit(latestOuterSession: ArcLiveState, latestGoalState: ArcGoalLiveState) {
    const mapping = resolveSelectedMapping(g, latestGoalState) ?? resolveSelectedUrgeMapping(g, latestGoalState);
    const facts = toArcGoalSharedFacts({
      sessionId,
      arcGoalId,
      weeklyActionId: null,
      outerSession: latestOuterSession,
      goalState: latestGoalState,
      mappingActionRelationship: mapping?.actionRelationship ?? null,
      terminalCompleted: true,
    });
    await recordSharedLiveSessionCompletion(facts, NOW, { arcGoal: commitDeps });
  }

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
  let progressAfterIdentityActionConfirm: ArcGoalSessionProgressStore = {};
  let visitedGoalActionConfirmBeforeSuccessFocus = false;

  // Screen equivalent: a goal with no mappings at all never shows
  // reassessment, so the queue starts immediately.
  if (!needsReassessmentDetour(g, goalState)) {
    await startPendingSharedActionExecution("arc_goal", arcGoalId, sessionId, [IDENTITY_ACTION_ROLE, GOAL_ACTION_ROLE], NOW, pendingDeps);
  }

  let iterations = 0;
  while (outerStage !== "complete" && iterations < 300) {
    iterations++;

    if (uiStage === "outer") {
      if (outerStage === "presence_check" || outerStage === "arc_thought_presence_recheck") outerSession = { ...outerSession, presenceRating: 8 };
      if (outerStage === "desired_state_check") outerSession = { ...outerSession, desiredStateRating: 8 };

      if (outerStage === "act") {
        if (confirmAct) {
          outerSession = applyActionCompletion(outerSession, true);
        }
        const hop = advanceLiveSession(outerStage, outerSession, identity, ["identity"]);
        const previousOuterStage = outerStage;
        outerSession = hop.session;
        outerStage = hop.stage;

        // Screen equivalent: commitAdvanceOuter's own "outerStage === 'act' && nextStage !== 'act'" branch.
        if (outerSession.realActionCompleted) {
          await confirmActionRoleAndPersist("arc_goal", arcGoalId, IDENTITY_ACTION_ROLE, NOW, pendingDeps);
          await attemptCommit(outerSession, goalState);
        }
        progressAfterIdentityActionConfirm = await progressDeps.loadStore();

        if (shouldInterceptOuterAtSuccessFocus(previousOuterStage, outerStage)) {
          uiStage = "goal_action_confirm";
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
      continue;
    }

    if (uiStage === "goal_action_confirm") {
      // Screen equivalent: handleGoalActionRoleConfirmed -- reached
      // BEFORE success_focus (outerStage is already "success_focus"
      // underneath, mirroring the real screen's own already-advanced
      // pattern), never after.
      assert.equal(outerStage, "success_focus", "goal_action_confirm must be visited exactly when outerStage has already advanced to success_focus, before it is ever rendered");
      visitedGoalActionConfirmBeforeSuccessFocus = true;
      await confirmActionRoleAndPersist("arc_goal", arcGoalId, GOAL_ACTION_ROLE, NOW, pendingDeps);
      await attemptCommit(outerSession, goalState);
      uiStage = "outer";
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
      // starts the queue BEFORE resolveAfterReassessment.
      const roles = reassessmentChoice === "direct" ? [IDENTITY_ACTION_ROLE, GOAL_ACTION_ROLE] : [BENEFICIAL_ACTION_ROLE, IDENTITY_ACTION_ROLE, GOAL_ACTION_ROLE];
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
      await attemptCommit(outerSession, resolved);
      progressAfterBridgeConfirm = await progressDeps.loadStore();
      goalState = resolved;
      uiStage = "outer";
      continue;
    }
  }

  const progressAfterGoalActionConfirm = await progressDeps.loadStore();
  return { progressAfterBridgeConfirm, progressAfterIdentityActionConfirm, progressAfterGoalActionConfirm, visitedGoalActionConfirmBeforeSuccessFocus, outerStage, outerSession };
}

// --- The corrected scenario: three distinct required roles, ordered ---

test("Beneficial Action and Identity Action confirmed alone still write no progress; the Goal Action confirmation (before success_focus) is what completes and writes it exactly once", async () => {
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

  assert.deepEqual(result.progressAfterBridgeConfirm["goal-1"], undefined, "Beneficial Action alone must never write progress");
  assert.deepEqual(result.progressAfterIdentityActionConfirm["goal-1"], undefined, "Identity Action alone (with Beneficial Action already confirmed) must still never write progress");
  assert.equal(result.visitedGoalActionConfirmBeforeSuccessFocus, true, "goal_action_confirm was actually visited, before success_focus");
  assert.equal(result.outerStage, "complete");
  assert.equal(result.progressAfterGoalActionConfirm["goal-1"]?.completedSessions, 1, "progress is written exactly once, at the Goal Action confirmation");
});

test("a direct-route session (no bridge) requires Identity Action + Goal Action, and Success Focus is never reached before Goal Action is confirmed", async () => {
  const identity = identityProfile();
  const g = goal({ urgeMappings: [{ id: "um1", urgeArcId: "urge-1", need: null, miniArcId: null, executionMode: "full", identityProtocolId: null, goalAction: null }] });
  const pendingDeps = fakePendingDeps();
  const progressDeps = fakeProgressDeps();

  const result = await driveArcGoalSession({ g, identity, reassessmentChoice: "direct", arcGoalId: "goal-2", sessionId: "session-2", pendingDeps, progressDeps });

  assert.equal(result.visitedGoalActionConfirmBeforeSuccessFocus, true);
  assert.equal(result.outerStage, "complete");
  assert.equal(result.progressAfterGoalActionConfirm["goal-2"]?.completedSessions, 1);
  const execution = await loadPendingSharedActionExecution("arc_goal", "goal-2", pendingDeps);
  assert.equal(execution?.actionQueue.length, 2, "direct route requires exactly Identity Action + Goal Action, no Beneficial Action");
  assert.deepEqual(
    execution?.actionQueue.map((r) => r.roleId),
    [IDENTITY_ACTION_ROLE, GOAL_ACTION_ROLE]
  );
});

test("a goal with no mappings at all starts its queue immediately (reassessment never shows) and requires Identity Action + Goal Action", async () => {
  const identity = identityProfile();
  const g = goal({ urgeMappings: [], interferingMappings: [] });
  const pendingDeps = fakePendingDeps();
  const progressDeps = fakeProgressDeps();

  const result = await driveArcGoalSession({ g, identity, reassessmentChoice: "direct", arcGoalId: "goal-3", sessionId: "session-3", pendingDeps, progressDeps });

  assert.equal(result.outerStage, "complete");
  assert.equal(result.progressAfterGoalActionConfirm["goal-3"]?.completedSessions, 1);
});

test("with a bridge, the queue requires exactly Beneficial Action, Identity Action, and Goal Action, in that order", async () => {
  const identity = identityProfile();
  const urge = urgeArc();
  const g = goal({ urgeMappings: [{ id: "um1", urgeArcId: urge.id, need: null, miniArcId: null, executionMode: "full", identityProtocolId: null, goalAction: null }] });
  const urgeProfile = urgeArcToProfile(urge);
  const pendingDeps = fakePendingDeps();
  const progressDeps = fakeProgressDeps();

  await driveArcGoalSession({ g, identity, reassessmentChoice: "urge", urgeProfile, arcGoalId: "goal-3b", sessionId: "session-3b", pendingDeps, progressDeps });
  const execution = await loadPendingSharedActionExecution("arc_goal", "goal-3b", pendingDeps);
  assert.deepEqual(
    execution?.actionQueue.map((r) => r.roleId),
    [BENEFICIAL_ACTION_ROLE, IDENTITY_ACTION_ROLE, GOAL_ACTION_ROLE]
  );
  assert.equal(execution?.status, "progress_committed");
});

test("leaving 'act' WITHOUT the explicit onActionCompleted confirmation never confirms the Identity Action role or writes progress, even though the pure engine allows the stage to advance -- and Goal Action alone can never complete the set", async () => {
  const identity = identityProfile();
  const g = goal({ urgeMappings: [], interferingMappings: [] });
  const pendingDeps = fakePendingDeps();
  const progressDeps = fakeProgressDeps();

  const result = await driveArcGoalSession({ g, identity, reassessmentChoice: "direct", arcGoalId: "goal-4", sessionId: "session-4", pendingDeps, progressDeps, confirmAct: false });

  // The pure engine still reaches "complete" -- arc/arcEngine.ts has no internal realActionCompleted check.
  assert.equal(result.outerStage, "complete", "sanity check: the pure engine itself never blocked the advance");
  assert.equal(result.outerSession.realActionCompleted, false, "realActionCompleted was genuinely never set");
  // goal_action_confirm is still reached (interception is purely stage-based) and its own role IS confirmed --
  // but the Identity Action role never was, so the set is never complete.
  assert.equal(result.visitedGoalActionConfirmBeforeSuccessFocus, true);
  assert.deepEqual(result.progressAfterGoalActionConfirm["goal-4"], undefined, "no progress is ever written -- Identity Action was never confirmed, so the required set is never complete");

  const execution = await loadPendingSharedActionExecution("arc_goal", "goal-4", pendingDeps);
  assert.equal(execution?.actionQueue.find((r) => r.roleId === IDENTITY_ACTION_ROLE)?.status, "pending", "Identity Action itself was never confirmed");
  assert.equal(execution?.actionQueue.find((r) => r.roleId === GOAL_ACTION_ROLE)?.status, "confirmed", "Goal Action WAS confirmed (its own screen doesn't re-check Identity Action) -- yet the commit still correctly stays not_ready");
});

// --- Retry: confirming all roles again, and re-attempting the commit, never double-counts ---

test("retrying all role confirmations and the commit after a full completed walk leaves the count at exactly one", async () => {
  const identity = identityProfile();
  const urge = urgeArc();
  const g = goal({ urgeMappings: [{ id: "um1", urgeArcId: urge.id, need: null, miniArcId: null, executionMode: "full", identityProtocolId: null, goalAction: null }] });
  const urgeProfile = urgeArcToProfile(urge);
  const pendingDeps = fakePendingDeps();
  const progressDeps = fakeProgressDeps();

  await driveArcGoalSession({ g, identity, reassessmentChoice: "urge", urgeProfile, arcGoalId: "goal-5", sessionId: "session-5", pendingDeps, progressDeps });

  // Retry: re-send all confirmations (mirroring re-tapped buttons / re-fired effects) and re-attempt the commit.
  await confirmActionRoleAndPersist("arc_goal", "goal-5", BENEFICIAL_ACTION_ROLE, NOW, pendingDeps);
  await confirmActionRoleAndPersist("arc_goal", "goal-5", IDENTITY_ACTION_ROLE, NOW, pendingDeps);
  await confirmActionRoleAndPersist("arc_goal", "goal-5", GOAL_ACTION_ROLE, NOW, pendingDeps);
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
  assert.equal(finalProgress["goal-5"]?.completedSessions, 1, "the count remains exactly one after retrying all confirmations and the commit");
});
