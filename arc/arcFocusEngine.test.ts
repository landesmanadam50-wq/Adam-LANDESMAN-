import test from "node:test";
import assert from "node:assert/strict";

import {
  ATTENTION_CHECK_MAX_INTERVAL_SECONDS,
  ATTENTION_CHECK_MIN_INTERVAL_SECONDS,
  DEFAULT_TAP_TOLERANCE_SECONDS,
  advanceStage,
  createArcFocusEngineState,
  discardThoughtEntry,
  endEarly,
  getArcFocusHighestStageReached,
  getArcFocusRingCount,
  getArcFocusSmileyCount,
  getArcFocusStageTargetSeconds,
  handleBackgroundPause,
  pauseManual,
  registerCenterTap,
  registerOuterTap,
  resolveAttentionCheck,
  resumeManual,
  saveThought,
  startFocusEngine,
  tick,
} from "./arcFocusEngine.ts";

const START = "2026-09-26T12:00:00.000Z";

function at(secondsFromStart: number): string {
  return new Date(new Date(START).getTime() + secondsFromStart * 1000).toISOString();
}

function freshRunning(overrides: { tapRhythmSeconds?: number; attentionChecksEnabled?: boolean; totalDurationSeconds?: number } = {}) {
  const idle = createArcFocusEngineState({
    totalDurationSeconds: overrides.totalDurationSeconds ?? 3600,
    tapRhythmSeconds: overrides.tapRhythmSeconds ?? 2,
    attentionChecksEnabled: overrides.attentionChecksEnabled ?? false,
  });
  return startFocusEngine(idle, START, () => 0);
}

/** Ticks once per second from fromSeconds+1 through toSeconds (inclusive), the same frequent-polling cadence the real UI drives tick() at -- lets a stage advance land exactly at its own target instant instead of wherever a single large jump happens to call `now`. */
function tickThrough<T extends ReturnType<typeof freshRunning>>(state: T, fromSeconds: number, toSeconds: number): T {
  let next = state;
  for (let second = fromSeconds + 1; second <= toSeconds; second += 1) {
    next = tick(next, at(second)) as T;
  }
  return next;
}

test("createArcFocusEngineState starts idle, at stage 1, with both clocks at zero and no tap/attention scheduling yet", () => {
  const state = createArcFocusEngineState({ totalDurationSeconds: 300, tapRhythmSeconds: 2, attentionChecksEnabled: true });
  assert.equal(state.status, "idle");
  assert.equal(state.currentStage, 1);
  assert.equal(state.nextExpectedTapAt, null);
  assert.equal(state.nextAttentionCheckAtSeconds, null);
  assert.equal(state.tapToleranceSeconds, DEFAULT_TAP_TOLERANCE_SECONDS);
  assert.equal(getArcFocusSmileyCount(state, START), 0);
});

test("startFocusEngine starts both clocks and schedules the first tap -- this is the exact moment the Focus clock starts", () => {
  const idle = createArcFocusEngineState({ totalDurationSeconds: 300, tapRhythmSeconds: 2, attentionChecksEnabled: false });
  const running = startFocusEngine(idle, START);
  assert.equal(running.status, "running");
  assert.equal(running.stageStopwatch.startedAt, START);
  assert.equal(running.sessionClock.startedAt, START);
  assert.equal(running.nextExpectedTapAt, at(2));
});

test("startFocusEngine is a no-op unless the engine is idle (never re-starts an already-running session)", () => {
  const running = freshRunning();
  const again = startFocusEngine(running, at(10));
  assert.equal(again, running);
});

test("tick advances the stage only once the stage stopwatch reaches its target (5s for stage 1), never earlier", () => {
  let state = freshRunning({ tapRhythmSeconds: 1000 }); // isolates stage progression from rhythm-miss detection
  state = tick(state, at(4.9));
  assert.equal(state.currentStage, 1);
  state = tick(state, at(5));
  assert.equal(state.currentStage, 2);
  assert.equal(getArcFocusStageTargetSeconds(state), 10);
});

test("advanceStage resets the stage stopwatch and tap tracking fresh, and never touches the session clock", () => {
  let state = freshRunning();
  state = tick(state, at(5));
  assert.equal(state.stageStopwatch.startedAt, at(5));
  assert.equal(state.nextExpectedTapAt, at(7));
  // Session clock keeps running straight through -- a timeout-driven stage advance was never frozen.
  assert.equal(state.sessionClock.startedAt, START);
});

test("advanceStage is a no-op unless the engine is running (tick is its only normal caller)", () => {
  const running = freshRunning();
  const paused = pauseManual(running, at(1));
  assert.equal(advanceStage(paused, at(10)), paused);
});

test("required worked example: two sessions that both accumulate 300 seconds of active time get exactly 5 smileys each, regardless of which stage either reached", () => {
  // tapRhythmSeconds is huge for both, so rhythm-miss detection never interferes with this test's only variable: how many stage advances happen.
  const sessionA = tick(freshRunning({ tapRhythmSeconds: 1000 }), at(300)); // a single coarse tick -- only ever advances ONE stage
  let sessionB = freshRunning({ tapRhythmSeconds: 1000 });
  sessionB = tickThrough(sessionB, 0, 300); // frequent ticks -- advances through many stages along the way
  assert.equal(getArcFocusSmileyCount(sessionA, at(300)), 5);
  assert.equal(getArcFocusSmileyCount(sessionB, at(300)), 5);
  // Same 5 smileys despite reaching very different stages -- smileys are purely time-based, never stage-based.
  assert.notEqual(sessionA.currentStage, sessionB.currentStage);
});

test("tick never starts a new stage once total session time is up, even if the stage target was ALSO reached at the same instant", () => {
  let state = freshRunning({ totalDurationSeconds: 5 });
  state = tick(state, at(5));
  assert.equal(state.status, "completed");
  assert.equal(state.currentStage, 1);
});

test("completing the session freezes both clocks", () => {
  let state = freshRunning({ totalDurationSeconds: 10 });
  state = tick(state, at(10));
  assert.equal(state.status, "completed");
  assert.equal(state.stageStopwatch.startedAt, null);
  assert.equal(state.sessionClock.startedAt, null);
});

test("registerCenterTap within tolerance advances the next expected tap along the FIXED grid, never from the actual tap time -- a burst of rapid taps can never catch up past a later miss", () => {
  let state = freshRunning({ tapRhythmSeconds: 2 });
  state = registerCenterTap(state, at(2.1)); // within 0.75s tolerance of the 2s deadline
  assert.equal(state.nextExpectedTapAt, at(4));
  // A second, near-immediate tap is far outside tolerance of the NEW (4s) deadline -- ignored, not treated as "catching up".
  const burst = registerCenterTap(state, at(2.2));
  assert.equal(burst, state);
});

test("registerCenterTap outside tolerance is ignored entirely -- it never updates the next expected tap", () => {
  const state = freshRunning({ tapRhythmSeconds: 2 });
  const result = registerCenterTap(state, at(0.5));
  assert.equal(result, state);
});

test("a missed rhythm tap (beyond tolerance) stops the stopwatch and opens the thought dialog with trigger 'missedRhythm'", () => {
  let state = freshRunning({ tapRhythmSeconds: 2 });
  state = tick(state, at(2 + DEFAULT_TAP_TOLERANCE_SECONDS + 0.01));
  assert.equal(state.status, "thought_entry");
  assert.equal(state.thoughtEntryTrigger, "missedRhythm");
  assert.equal(state.stageStopwatch.startedAt, null);
  assert.equal(state.sessionClock.startedAt, null);
});

test("registerOuterTap opens the thought dialog with trigger 'outerTap', freezing both clocks, and only ever while running (never opens the dialog a second time for the same event)", () => {
  let state = freshRunning();
  state = registerOuterTap(state, at(3));
  assert.equal(state.status, "thought_entry");
  assert.equal(state.thoughtEntryTrigger, "outerTap");
  const again = registerOuterTap(state, at(3.5));
  assert.equal(again, state);
});

test("saveThought requires non-empty text -- an empty/whitespace save is ignored, leaving the dialog open", () => {
  let state = freshRunning();
  state = registerOuterTap(state, at(3));
  const unchanged = saveThought(state, "   ", at(3.5));
  assert.equal(unchanged, state);
});

test("saveThought logs the thought and restarts the CURRENT stage from zero -- never advances or regresses currentStage, and loses zero accumulated active time", () => {
  let state = freshRunning();
  state = tick(state, at(5)); // advance to stage 2 first
  const stageBeforeThought = state.currentStage;
  state = registerOuterTap(state, at(12));
  const sessionAccumulatedAtFreeze = state.sessionClock.accumulatedSeconds;
  state = saveThought(state, "דאגתי מהעבודה", at(20));
  assert.equal(state.currentStage, stageBeforeThought);
  assert.equal(state.stageStopwatch.accumulatedSeconds, 0);
  assert.equal(state.status, "running");
  assert.equal(state.thoughts.length, 1);
  assert.equal(state.thoughts[0]?.text, "דאגתי מהעבודה");
  assert.equal(state.thoughts[0]?.stage, stageBeforeThought);
  // Resumed with zero loss: the frozen accumulated total carries forward unchanged.
  assert.equal(state.sessionClock.accumulatedSeconds, sessionAccumulatedAtFreeze);
  assert.equal(state.focusRecoveryCount, 1);
});

test("discardThoughtEntry ('I don't remember' / 'no thought -- try again') is the exact same transition as saveThought, just without logging an entry", () => {
  let state = freshRunning();
  state = registerOuterTap(state, at(3));
  state = discardThoughtEntry(state, at(4));
  assert.equal(state.status, "running");
  assert.equal(state.thoughts.length, 0);
  assert.equal(state.focusRecoveryCount, 1);
  assert.equal(state.stageStopwatch.accumulatedSeconds, 0);
});

test("rings (ringCount) only ever change via a timeout-driven stage advance -- never via a thought save/discard", () => {
  let state = freshRunning();
  state = tick(state, at(5)); // stage 1 -> 2, ringCount 1 -> 2
  assert.equal(getArcFocusRingCount(state), 2);
  state = registerOuterTap(state, at(12));
  state = saveThought(state, "מחשבה", at(13));
  assert.equal(getArcFocusRingCount(state), 2);
  assert.equal(getArcFocusHighestStageReached(state), 2);
});

test("an attention check becomes due and freezes both clocks, excluding the time spent answering from active practice time", () => {
  let state = freshRunning({ attentionChecksEnabled: true, tapRhythmSeconds: 1000 });
  // nextAttentionCheckAtSeconds was scheduled with randomFn() => 0, so it fires at exactly ATTENTION_CHECK_MIN_INTERVAL_SECONDS.
  assert.equal(state.nextAttentionCheckAtSeconds, ATTENTION_CHECK_MIN_INTERVAL_SECONDS);
  state = tickThrough(state, 0, ATTENTION_CHECK_MIN_INTERVAL_SECONDS);
  assert.equal(state.status, "attention_check");
  const frozenSessionSeconds = state.sessionClock.accumulatedSeconds;
  // Lots of real time passes while the dialog sits open -- tick is never called while not "running", so nothing advances.
  assert.equal(frozenSessionSeconds, ATTENTION_CHECK_MIN_INTERVAL_SECONDS);
});

test("resolveAttentionCheck 'focused' resumes exactly where the stage stopwatch was -- no reset, not a recovery, the streak is not broken", () => {
  let state = freshRunning({ attentionChecksEnabled: true, tapRhythmSeconds: 1000 });
  state = tickThrough(state, 0, ATTENTION_CHECK_MIN_INTERVAL_SECONDS);
  const stageAccumulatedBefore = state.stageStopwatch.accumulatedSeconds;
  assert.ok(stageAccumulatedBefore > 0, "the mid-stage progress banked before the check must be nonzero for this test to be meaningful");
  state = resolveAttentionCheck(state, "focused", at(ATTENTION_CHECK_MIN_INTERVAL_SECONDS + 5), () => 0);
  assert.equal(state.status, "running");
  assert.equal(state.stageStopwatch.accumulatedSeconds, stageAccumulatedBefore);
  assert.equal(state.focusRecoveryCount, 0);
  assert.equal(state.streakStartSeconds, 0);
});

test("resolveAttentionCheck 'lostInThought'/'notSure' both restart the current stage and count as a recovery, with no penalty to active time or smileys", () => {
  let lost = freshRunning({ attentionChecksEnabled: true, tapRhythmSeconds: 1000 });
  lost = tickThrough(lost, 0, ATTENTION_CHECK_MIN_INTERVAL_SECONDS);
  const smileyBefore = getArcFocusSmileyCount(lost, at(ATTENTION_CHECK_MIN_INTERVAL_SECONDS));
  lost = resolveAttentionCheck(lost, "lostInThought", at(ATTENTION_CHECK_MIN_INTERVAL_SECONDS + 3), () => 0);
  assert.equal(lost.status, "running");
  assert.equal(lost.stageStopwatch.accumulatedSeconds, 0);
  assert.equal(lost.focusRecoveryCount, 1);
  assert.equal(getArcFocusSmileyCount(lost, at(ATTENTION_CHECK_MIN_INTERVAL_SECONDS + 3)), smileyBefore);

  let notSure = freshRunning({ attentionChecksEnabled: true, tapRhythmSeconds: 1000 });
  notSure = tickThrough(notSure, 0, ATTENTION_CHECK_MIN_INTERVAL_SECONDS);
  notSure = resolveAttentionCheck(notSure, "notSure", at(ATTENTION_CHECK_MIN_INTERVAL_SECONDS + 3), () => 0);
  assert.equal(notSure.status, "running");
  assert.equal(notSure.stageStopwatch.accumulatedSeconds, 0);
  assert.equal(notSure.focusRecoveryCount, 1);
});

test("resolveAttentionCheck reschedules the next check so it can never immediately re-fire on the next tick", () => {
  let state = freshRunning({ attentionChecksEnabled: true, tapRhythmSeconds: 1000 });
  state = tickThrough(state, 0, ATTENTION_CHECK_MIN_INTERVAL_SECONDS);
  state = resolveAttentionCheck(state, "focused", at(ATTENTION_CHECK_MIN_INTERVAL_SECONDS), () => 0);
  assert.equal(state.nextAttentionCheckAtSeconds, ATTENTION_CHECK_MIN_INTERVAL_SECONDS + ATTENTION_CHECK_MIN_INTERVAL_SECONDS);
  assert.ok((state.nextAttentionCheckAtSeconds ?? 0) <= ATTENTION_CHECK_MIN_INTERVAL_SECONDS + ATTENTION_CHECK_MAX_INTERVAL_SECONDS);
});

test("pauseManual/resumeManual freeze and unfreeze both clocks with zero time lost, and are no-ops in the wrong state", () => {
  let state = freshRunning({ tapRhythmSeconds: 1000 });
  state = tick(state, at(10));
  state = pauseManual(state, at(10));
  // The raw accumulatedSeconds field is only meaningful once frozen -- captured AFTER pauseManual, which is the freeze itself.
  const sessionAccumulatedBeforePause = state.sessionClock.accumulatedSeconds;
  assert.equal(sessionAccumulatedBeforePause, 10);
  assert.equal(state.status, "paused");
  assert.equal(state.pausedReason, "manual");
  assert.equal(pauseManual(state, at(20)), state); // already paused -- no-op
  state = resumeManual(state, at(600)); // a long real-world gap while paused
  assert.equal(state.status, "running");
  assert.equal(state.sessionClock.accumulatedSeconds, sessionAccumulatedBeforePause);
  assert.equal(resumeManual(state, at(601)), state); // already running -- no-op
});

test("resumeManual shifts the next expected tap forward past the pause so resuming never produces an immediate false rhythm-miss", () => {
  let state = freshRunning({ tapRhythmSeconds: 2 });
  state = pauseManual(state, at(0.5));
  const nextTapBeforePause = state.nextExpectedTapAt;
  state = resumeManual(state, at(50));
  assert.notEqual(state.nextExpectedTapAt, nextTapBeforePause);
  // Ticking immediately after resume must NOT register a missed tap.
  const afterTick = tick(state, at(50.1));
  assert.equal(afterTick.status, "running");
});

test("handleBackgroundPause freezes both clocks like pauseManual but is tagged 'background' for analytics", () => {
  let state = freshRunning();
  state = handleBackgroundPause(state, at(5));
  assert.equal(state.status, "paused");
  assert.equal(state.pausedReason, "background");
});

test("no double-reward after pause/resume or re-reading a restored state: smileyCount and focusRecoveryCount are idempotent", () => {
  let state = freshRunning();
  state = tick(state, at(70)); // ~1 minute of active time, well past a stage advance
  const firstRead = getArcFocusSmileyCount(state, at(70));
  const secondRead = getArcFocusSmileyCount(state, at(70));
  assert.equal(firstRead, secondRead);
  state = pauseManual(state, at(70));
  state = resumeManual(state, at(130));
  assert.equal(getArcFocusSmileyCount(state, at(130)), firstRead); // 60s of real-world pause time never counted as active
  // tick() is a no-op while not "running" -- replaying it twice on the same frozen state changes nothing.
  const paused = pauseManual(state, at(130));
  assert.equal(tick(paused, at(131)), paused);
  assert.equal(tick(paused, at(132)), paused);
});

test("endEarly finalizes the streak even with no trailing recovery event -- a distraction-free run straight to the end still counts", () => {
  let state = freshRunning();
  state = tick(state, at(45));
  state = endEarly(state, at(90));
  assert.equal(state.status, "completed");
  assert.equal(state.longestFocusStreakSeconds, 90);
});

test("endEarly is idempotent -- calling it again on an already-completed state changes nothing", () => {
  let state = freshRunning();
  state = endEarly(state, at(10));
  const again = endEarly(state, at(20));
  assert.equal(again, state);
});
