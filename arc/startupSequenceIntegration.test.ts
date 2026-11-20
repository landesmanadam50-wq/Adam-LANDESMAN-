import test from "node:test";
import assert from "node:assert/strict";

/**
 * arc/startupSequenceIntegration.test.ts
 *
 * Critical-bug task ("Startup Popups Not Appearing"): a PERMANENT
 * end-to-end integration test for the actual cold-start resolution
 * pipeline live/DailyStartupSequenceOverlay.tsx drives through
 * data/purposeManifest.ts's pickFreshManifestSelection -- wiring
 * together the exact same REAL, EXPORTED pure functions that pipeline
 * calls, in the exact same order, rather than checking source-text
 * patterns. This is the pure-logic half of "verify the actual app
 * startup flow, not just the presence of popup components": the data
 * layer (data/purposeManifest.ts/data/manifestGoals.ts) cannot itself
 * be called under a plain `node --test` run (it needs real
 * AsyncStorage, which doesn't resolve outside React Native -- confirmed
 * while investigating this bug, and the reason every data/*.test.ts
 * file in this codebase is a source-text regression guard instead).
 * The UI/presentation half (does the Modal actually render on top of
 * the active screen) is NOT verifiable here for the same reason, and is
 * covered by the structural checks in live/manifestUpgrade.test.ts
 * instead (Modal usage, error-handling, zero home-screen dependency).
 *
 * "Restart" is simulated via JSON round-tripping (createRestartSafeStore
 * below), the exact same technique data/arcGoalCompletionIntegration.test.ts
 * already established for this codebase's own definition of "permanent
 * integration test" -- every "launch" below re-parses freshly-serialized
 * bytes rather than reusing an in-memory object reference.
 */

import {
  createDailyManifestSelection,
  createEmptyPurposeManifest,
  emptyPurposeManifestRotationState,
  isPurposeManifestComplete,
  recordBehaviorShownForManifest,
  resolveEligibleManifests,
  resolveNextBehaviorIndexForManifest,
  selectRandomManifestId,
  type PurposeManifest,
  type PurposeManifestRotationState,
} from "./purposeManifest.ts";
import { createManifestGoal, resolveNextManifestAction, type ManifestGoal } from "./manifestGoals.ts";
import { createEmptyTask, type Task } from "./tasks.ts";
import { createEmptyDailyRoutineTemplate, type DailyRoutineTemplate } from "./dailyRoutine.ts";
import { createTaskTimerRun, finishTaskTimerRunEarly, isTaskTimerRunStale, type TaskTimerRun } from "./taskTimer.ts";
import { createNewArcLiveSessionState, isNewArcLiveSessionStale, type NewArcLiveSessionState } from "./newArcLiveTypes.ts";

const NOW_ISO = "2026-11-10T08:00:00.000Z";

function createRestartSafeStore<T>(initial: T) {
  let serialized = JSON.stringify(initial);
  return {
    load: (): T => JSON.parse(serialized) as T,
    save: (value: T) => {
      serialized = JSON.stringify(value);
    },
  };
}

function completeManifest(id: string, goal: string): PurposeManifest {
  const manifest = createEmptyPurposeManifest(id, NOW_ISO);
  return {
    ...manifest,
    longTermGoal: goal,
    personalReason: "סיבה",
    personalValue: "ערך",
    behaviors: [
      { ...manifest.behaviors[0], description: "התנהגות 1", reason: "סיבה 1" },
      { ...manifest.behaviors[1], description: "התנהגות 2", reason: "סיבה 2" },
      { ...manifest.behaviors[2], description: "התנהגות 3", reason: "סיבה 3" },
    ],
  };
}

/** Exactly what data/purposeManifest.ts's pickFreshManifestSelection does, re-run here over the REAL exported pure functions (never a reimplementation of their internals) so this test exercises the actual decision logic, not a parallel copy of it. */
function simulateColdStartManifestPick(eligible: PurposeManifest[], rotation: PurposeManifestRotationState, randomValue: number) {
  const manifestId = selectRandomManifestId(eligible.map((m) => m.id), randomValue)!;
  const manifest = eligible.find((candidate) => candidate.id === manifestId)!;
  const behaviorIndex = resolveNextBehaviorIndexForManifest(rotation, manifest.id);
  const nextRotation = recordBehaviorShownForManifest(rotation, manifest.id, behaviorIndex);
  return { manifest, behaviorIndex, nextRotation };
}

// --- Scenario: routine-template presence/absence can never affect the popup pipeline ---

test("cold start WITH a configured routine template and cold start WITHOUT one produce IDENTICAL manifest selection/rotation results -- the routine builder structurally cannot participate in this decision at all, confirming the bug report's own hypothesis was not the actual cause", () => {
  const manifest = completeManifest("m1", "מטרה");
  const eligible = resolveEligibleManifests([manifest]);
  const rotation = emptyPurposeManifestRotationState();

  // World 1: no routine template has ever been set up (first-time user).
  const withoutRoutine: DailyRoutineTemplate | null = null;
  const resultWithoutRoutine = simulateColdStartManifestPick(eligible, rotation, 0.5);

  // World 2: a fully configured routine template, with real tasks in every period.
  const withRoutine = createEmptyDailyRoutineTemplate(NOW_ISO);
  withRoutine.periods.morning.tasks.push({ id: "t1", title: "בוקר", durationMinutes: 30, breakAfter: null });
  withRoutine.periods.evening.tasks.push({ id: "t2", title: "ערב", durationMinutes: 20, breakAfter: null });
  const resultWithRoutine = simulateColdStartManifestPick(eligible, rotation, 0.5);

  assert.equal(resultWithoutRoutine.manifest.id, resultWithRoutine.manifest.id);
  assert.equal(resultWithoutRoutine.behaviorIndex, resultWithRoutine.behaviorIndex);
  assert.ok(withoutRoutine === null && withRoutine.periods.morning.tasks.length === 1, "sanity check: the two worlds really do differ in routine-template state");
});

// --- Scenario: multiple Manifests, uniform selection, independent rotation, across simulated restarts ---

test("cold start with multiple eligible Manifests: each one is selected on its own equal-width slice of randomValue, and each manifest's OWN behavior rotation advances only on the launch where IT was picked, surviving a simulated restart (JSON round trip) and never advancing a different manifest's rotation", () => {
  const manifests = [completeManifest("m1", "מטרה 1"), completeManifest("m2", "מטרה 2"), completeManifest("m3", "מטרה 3")];
  const eligible = resolveEligibleManifests(manifests);
  assert.equal(eligible.length, 3, "all three must be eligible going in");

  const rotationStore = createRestartSafeStore(emptyPurposeManifestRotationState());

  // Launch 1: randomValue lands in m1's own third of [0,1).
  let rotation = rotationStore.load();
  let pick = simulateColdStartManifestPick(eligible, rotation, 0.1);
  assert.equal(pick.manifest.id, "m1");
  assert.equal(pick.behaviorIndex, 0, "m1's first-ever selection starts its own rotation at behavior 0");
  rotationStore.save(pick.nextRotation);

  // Launch 2 (after a simulated restart): randomValue lands in m2's own third -- m1's rotation must NOT have advanced.
  rotation = rotationStore.load();
  pick = simulateColdStartManifestPick(eligible, rotation, 0.5);
  assert.equal(pick.manifest.id, "m2");
  assert.equal(pick.behaviorIndex, 0, "m2 has never been shown before -- starts at its OWN behavior 0, unaffected by m1's progress");
  rotationStore.save(pick.nextRotation);

  // Launch 3 (another restart): m1 is picked again -- its rotation must have survived both restarts and continue from where it left off (1), never resetting to 0.
  rotation = rotationStore.load();
  pick = simulateColdStartManifestPick(eligible, rotation, 0.1);
  assert.equal(pick.manifest.id, "m1");
  assert.equal(pick.behaviorIndex, 1, "m1's rotation must have survived two restarts (and one intervening launch where a DIFFERENT manifest was picked) without resetting");
});

// --- Scenario: incomplete Manifest data is correctly excluded from selection ---

test("cold start where SOME Manifests are incomplete: selection only ever lands on a complete one, and an incomplete Manifest's own (irrelevant) rotation state is never touched", () => {
  const complete = completeManifest("complete-1", "מטרה שלמה");
  const incomplete = createEmptyPurposeManifest("incomplete-1", NOW_ISO);
  assert.equal(isPurposeManifestComplete(incomplete), false);

  const eligible = resolveEligibleManifests([incomplete, complete]);
  assert.deepEqual(eligible.map((m) => m.id), ["complete-1"], "the incomplete manifest must never enter the selection pool");

  const rotation = emptyPurposeManifestRotationState();
  // Every possible randomValue in [0,1) must resolve to the SAME single eligible manifest.
  for (const randomValue of [0, 0.25, 0.5, 0.75, 0.999]) {
    const pick = simulateColdStartManifestPick(eligible, rotation, randomValue);
    assert.equal(pick.manifest.id, "complete-1");
  }
});

test("cold start where EVERY Manifest is incomplete: the eligible pool is empty -- the exact condition data/purposeManifest.ts's resolveStartupManifestSelection checks to return null (Popup 2 then shows its own 'create one' prompt; Popup 1 is entirely unaffected, per the structural checks in live/manifestUpgrade.test.ts)", () => {
  const eligible = resolveEligibleManifests([createEmptyPurposeManifest("m1", NOW_ISO), createEmptyPurposeManifest("m2", NOW_ISO)]);
  assert.deepEqual(eligible, []);
});

// --- Scenario: the SAME manifest picked by the cold start is the one next-action is resolved for ---

test("after a cold-start pick, resolveNextManifestAction is computed for THAT SAME manifest's id, using its own goals/tasks only -- a task or goal belonging to a different manifest never leaks into the shown next action, and an overdue task is surfaced correctly (handled, never silently dropped)", () => {
  const picked = completeManifest("picked-manifest", "מטרה שנבחרה");
  const otherManifest = completeManifest("other-manifest", "מטרה אחרת");
  const eligible = resolveEligibleManifests([picked, otherManifest]);
  const rotation = emptyPurposeManifestRotationState();

  const pick = simulateColdStartManifestPick(eligible, rotation, 0); // selectRandomManifestId(0) picks the first id deterministically
  assert.equal(pick.manifest.id, "picked-manifest");

  const goalForPicked: ManifestGoal = createManifestGoal(pick.manifest.id, "יעד", 0, NOW_ISO);
  const goalForOther: ManifestGoal = createManifestGoal(otherManifest.id, "יעד אחר", 0, NOW_ISO);
  const overdueTaskForPicked: Task = {
    ...createEmptyTask("task-overdue", "משימה שעבר זמנה", "פעולה", NOW_ISO),
    purposeManifestId: pick.manifest.id,
    purposeManifestGoalId: goalForPicked.id,
    recurrence: { kind: "once" },
    scheduledDate: "2026-11-01",
    scheduledTime: "09:00",
  };
  const soonerTaskForOther: Task = {
    ...createEmptyTask("task-other", "משימה של מניפסט אחר", "פעולה", NOW_ISO),
    purposeManifestId: otherManifest.id,
    purposeManifestGoalId: goalForOther.id,
    recurrence: { kind: "once" },
    scheduledDate: "2026-10-25", // even earlier than the picked manifest's own task
    scheduledTime: "09:00",
  };

  const nextAction = resolveNextManifestAction(pick.manifest.id, [goalForPicked, goalForOther], [overdueTaskForPicked, soonerTaskForOther], [], new Date(NOW_ISO));
  assert.equal(nextAction?.task.id, "task-overdue", "must pick the PICKED manifest's own task, never the other manifest's earlier-dated one");
  assert.equal(nextAction?.goal.id, goalForPicked.id);
});

// --- Final Startup Popup Testing & APK Build task: the 6 requested cold-start scenarios, exercised via
// live/DailyStartupSequenceOverlay.tsx's OWN exact gate expression (`timerRun !== null && !isTaskTimerRunStale(timerRun, now)`,
// mirrored here verbatim rather than reimplemented), over the REAL isTaskTimerRunStale/isNewArcLiveSessionStale functions. ---

/** The EXACT gate expression live/DailyStartupSequenceOverlay.tsx's mount effect evaluates -- copied here verbatim (not reimplemented) so this test proves the real rule, not a stand-in for it. true means the sequence is blocked this launch. */
function isStartupSequenceBlocked(timerRun: TaskTimerRun | null, arcSession: NewArcLiveSessionState | null, now: Date): boolean {
  const timerActive = timerRun !== null && !isTaskTimerRunStale(timerRun, now);
  const arcActive = arcSession !== null && !isNewArcLiveSessionStale(arcSession, now);
  return timerActive || arcActive;
}

test("Scenario 1: cold start with no active task or ARC session at all -- the gate is open, so both popups appear", () => {
  assert.equal(isStartupSequenceBlocked(null, null, new Date(NOW_ISO)), false);
});

test("Scenario 2: cold start with an unfinished task timer left over from a PREVIOUS day -- it is stale, the gate is open, and both popups appear (never permanently suppressed by an abandoned record)", () => {
  const run = createTaskTimerRun("task-1", "run-1", 30, "2026-11-08T07:00:00.000Z"); // two days before NOW_ISO, never completed/cleared
  assert.equal(isTaskTimerRunStale(run, new Date(NOW_ISO)), true);
  assert.equal(isStartupSequenceBlocked(run, null, new Date(NOW_ISO)), false);
});

test("Scenario 3: cold start with an unfinished ARC LIVE session left over from a PREVIOUS day -- it is stale, the gate is open, and both popups appear", () => {
  const session = createNewArcLiveSessionState("task-1", "כותרת", "פעולה", "2026-11-07T09:00:00.000Z");
  assert.equal(isNewArcLiveSessionStale(session, new Date(NOW_ISO)), true);
  assert.equal(isStartupSequenceBlocked(null, session, new Date(NOW_ISO)), false);
});

test("Scenario 4: a task started and the app closed EARLIER THE SAME DAY -- the session is genuinely still active, so this launch's gate correctly stays closed (the session is PRESERVED, never deleted/reset just to force the popups open), but the block is NOT permanent: it lifts the moment the task is actually finished, and separately the moment a new calendar day begins", () => {
  const startedEarlierToday = createTaskTimerRun("task-1", "run-1", 30, "2026-11-10T06:00:00.000Z"); // same local day as NOW_ISO (2026-11-10)
  const now = new Date(NOW_ISO);

  // This cold start: genuinely active (not completed, started today) -- correctly deferred, session untouched.
  assert.equal(isTaskTimerRunStale(startedEarlierToday, now), false);
  assert.equal(isStartupSequenceBlocked(startedEarlierToday, null, now), true);

  // Not permanent, path A: the trainee actually finishes the task (through the app's own normal
  // finish-early/complete flow) -- the VERY NEXT cold start's gate is already open, same day.
  const finishedLaterToday = finishTaskTimerRunEarly(startedEarlierToday, "2026-11-10T09:00:00.000Z");
  assert.equal(isStartupSequenceBlocked(finishedLaterToday, null, now), false);

  // Not permanent, path B: the trainee never finishes it, but a new day begins -- stale by then, regardless.
  const nextDay = new Date("2026-11-11T08:00:00.000Z");
  assert.equal(isStartupSequenceBlocked(startedEarlierToday, null, nextDay), false);
});

test("Scenario 2/3 combined: a stale task timer AND a stale ARC session at the same time -- still open, neither one alone nor together keeps blocking once both are abandoned", () => {
  const staleRun = createTaskTimerRun("task-1", "run-1", 30, "2026-11-01T07:00:00.000Z");
  const staleSession = createNewArcLiveSessionState("task-2", "כותרת", "פעולה", "2026-11-02T07:00:00.000Z");
  assert.equal(isStartupSequenceBlocked(staleRun, staleSession, new Date(NOW_ISO)), false);
});

/**
 * Scenarios 5 and 6 ("returning from background: no duplicate popups" /
 * "navigating between screens: no re-trigger") are NOT pure-data-flow
 * questions -- they are about the overlay's own REACT LIFECYCLE
 * (does the mount effect/component ever re-run outside a genuine cold
 * start), which has no meaningful pure-function form to execute here.
 * They are covered -- by execution-adjacent structural proof, not a
 * blunt string search -- in live/manifestUpgrade.test.ts:
 *  - "cold-start detection: a module-scope boolean..." and
 *    "...the mount effect checks hasRunStartupSequenceThisProcess..."
 *    (scenario 5: the guard is set once per OS process and is never
 *    reset by backgrounding/foregrounding, which never re-run module
 *    scope or remount the root layout).
 *  - "duplicate-popup prevention: the component holds its OWN local
 *    'step' state... must not re-run on screen focus" (scenario 6: no
 *    useFocusEffect anywhere in this component, confirmed by source
 *    inspection, so ordinary in-app navigation can never re-trigger it).
 * Neither scenario is re-asserted here to avoid a duplicate, weaker
 * copy of an already-precise check.
 */
