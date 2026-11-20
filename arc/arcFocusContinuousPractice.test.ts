import test from "node:test";
import assert from "node:assert/strict";

/**
 * arc/arcFocusContinuousPractice.test.ts
 *
 * "ARCHI -- ARC Gym Home Navigation and Continuous Practice for All Four
 * Exercise Types" task: pure-logic regression guard confirming the
 * three ARC Focus engine/session guarantees this task's own Restrictions
 * explicitly forbid touching ("Do not redesign ARC Focus. Do not change
 * its focus timing, stage logic or mood routing") still hold exactly as
 * before -- required tests 9 (configured duration preserved), 12
 * (preparatory-ARC/thought-reporting/pause time excluded from active
 * Focus duration), and 13 (thought reporting preserves the current
 * stage). Nothing in arc/arcFocusEngine.ts/arc/arcFocusSession.ts was
 * touched by this task; these tests call the real, unmodified pure
 * functions directly.
 */

import { createArcFocusEngineState, getArcFocusSessionElapsedSeconds, getArcFocusStageElapsedSeconds, getArcFocusStageTargetSeconds, startFocusEngine } from "./arcFocusEngine.ts";
import { discardThoughtEntry, registerOuterTap, saveThought, tick } from "./arcFocusEngine.ts";
import { createDefaultArcFocusSettings } from "./arcFocusSettings.ts";
import { createArcFocusSession, pauseSession, resumeSession, startFocusSession, tick as sessionTick } from "./arcFocusSession.ts";

const NOW = "2026-01-01T00:00:00.000Z";
function plusSeconds(iso: string, seconds: number): string {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

// --- Required test 9: ARC Focus preserves its configured duration -------

test("required test 9: createArcFocusSession/startFocusSession carry the EXACT configured durationMinutes through untouched -- a 10-minute practice still targets exactly 600 total seconds, never a different one silently substituted", () => {
  const settings = { ...createDefaultArcFocusSettings(), durationMinutes: 10 };
  let session = createArcFocusSession("practice-1", null, settings, NOW);
  session = startFocusSession(session, NOW);
  assert.equal(session.engine.totalDurationSeconds, 600);
});

test("required test 9 continued: the configured duration is read once, at session creation, from the settings object passed in -- never re-derived from a hardcoded default (5 default) once a custom value was chosen", () => {
  const settings = { ...createDefaultArcFocusSettings(), durationMinutes: 20 };
  const session = createArcFocusSession("practice-2", null, settings, NOW);
  assert.equal(session.engine.totalDurationSeconds, 20 * 60);
  assert.notEqual(session.engine.totalDurationSeconds, createDefaultArcFocusSettings().durationMinutes * 60);
});

// --- Required test 12: preparatory ARC / thought-reporting / pause time
// is excluded from active Focus duration -----------------------------

test("required test 12: the Focus session clock does not exist until startFocusSession is called -- any time spent on the preparatory check-in or a preliminary Full/Shortened ARC (which happens strictly BEFORE this call, per live/ArcFocusLiveScreen.tsx's own mount-time 'idle -> startFocusSession' logic) is never counted, by construction, since there is no persisted elapsed-time anchor before this moment", () => {
  const settings = createDefaultArcFocusSettings();
  const session = createArcFocusSession("practice-3", null, settings, NOW);
  assert.equal(session.engine.status, "idle");
  const started = startFocusSession(session, plusSeconds(NOW, 999));
  assert.equal(getArcFocusSessionElapsedSeconds(started.engine, plusSeconds(NOW, 999)), 0, "the clock starts at exactly zero the moment startFocusSession runs, regardless of how long the preparatory steps before it took");
});

test("required test 12 continued: reporting a thought (outer-ring tap) freezes BOTH the stage and session clocks for the whole duration spent in the thought-entry dialog -- that interval is never added to active elapsed time", () => {
  const config = { totalDurationSeconds: 300, tapRhythmSeconds: 2, attentionChecksEnabled: false };
  let state = startFocusEngine(createArcFocusEngineState(config), NOW);
  state = tick(state, plusSeconds(NOW, 10));
  assert.equal(getArcFocusSessionElapsedSeconds(state, plusSeconds(NOW, 10)), 10);

  state = registerOuterTap(state, plusSeconds(NOW, 10));
  assert.equal(state.status, "thought_entry");
  // 30 seconds pass while the trainee is writing the thought down.
  const afterLongPause = plusSeconds(NOW, 40);
  assert.equal(getArcFocusSessionElapsedSeconds(state, afterLongPause), 10, "elapsed time must stay frozen at 10s while in thought_entry, no matter how much real time passes");

  state = discardThoughtEntry(state, afterLongPause);
  assert.equal(state.status, "running");
  assert.equal(getArcFocusSessionElapsedSeconds(state, afterLongPause), 10, "resuming must not retroactively add the 30s spent reporting the thought");
});

test("required test 12 continued: a manual pause (pauseSession/resumeSession) excludes its own duration from active elapsed time exactly the same way thought-entry does -- tick() never advances the clock while paused", () => {
  const settings = createDefaultArcFocusSettings();
  let session = createArcFocusSession("practice-4", null, settings, NOW);
  session = startFocusSession(session, NOW);
  session = sessionTick(session, plusSeconds(NOW, 5));
  assert.equal(getArcFocusSessionElapsedSeconds(session.engine, plusSeconds(NOW, 5)), 5);

  session = pauseSession(session, plusSeconds(NOW, 5));
  assert.equal(session.engine.status, "paused");
  const stillPaused = sessionTick(session, plusSeconds(NOW, 50));
  assert.equal(stillPaused.engine.status, "paused", "tick() must never auto-resume a paused session");
  assert.equal(getArcFocusSessionElapsedSeconds(stillPaused.engine, plusSeconds(NOW, 50)), 5, "elapsed time must stay frozen at 5s while paused, even after 45 more real seconds pass");

  const resumed = resumeSession(stillPaused, plusSeconds(NOW, 50));
  assert.equal(resumed.engine.status, "running");
  const afterResume = sessionTick(resumed, plusSeconds(NOW, 60));
  assert.equal(getArcFocusSessionElapsedSeconds(afterResume.engine, plusSeconds(NOW, 60)), 15, "only the 10s actually spent running after resume (5s before pause + 10s after) is counted -- never the 45s spent paused");
});

// --- Required test 13: thought reporting preserves the current stage ----

test("required test 13: saving or discarding a reported thought resets the CURRENT stage's own stopwatch to zero but never changes currentStage itself -- the trainee resumes the SAME stage, not a different one", () => {
  const config = { totalDurationSeconds: 300, tapRhythmSeconds: 2, attentionChecksEnabled: false };
  let state = startFocusEngine(createArcFocusEngineState(config), NOW);
  // Advance into stage 2 by ticking past the first stage's own target.
  const firstStageTarget = getArcFocusStageTargetSeconds(state);
  state = tick(state, plusSeconds(NOW, firstStageTarget + 1));
  const stageBeforeThought = state.currentStage;
  assert.ok(stageBeforeThought >= 2, "the engine must have advanced past stage 1 for this test to be meaningful");

  const tapAt = plusSeconds(NOW, firstStageTarget + 1);
  state = registerOuterTap(state, tapAt);
  state = saveThought(state, "חשבתי על הארוחה", plusSeconds(tapAt, 20));
  assert.equal(state.currentStage, stageBeforeThought, "saving a thought must never advance or regress the stage");
  assert.equal(getArcFocusStageElapsedSeconds(state, plusSeconds(tapAt, 20)), 0, "the current stage's own stopwatch must restart from zero after a thought is logged");

  // Same guarantee for the "discard" path (missed-rhythm or outer-tap with nothing to report).
  let discardState = startFocusEngine(createArcFocusEngineState(config), NOW);
  const discardFirstStageTarget = getArcFocusStageTargetSeconds(discardState);
  discardState = tick(discardState, plusSeconds(NOW, discardFirstStageTarget + 1));
  const stageBeforeDiscard = discardState.currentStage;
  const discardTapAt = plusSeconds(NOW, discardFirstStageTarget + 1);
  discardState = registerOuterTap(discardState, discardTapAt);
  discardState = discardThoughtEntry(discardState, plusSeconds(discardTapAt, 15));
  assert.equal(discardState.currentStage, stageBeforeDiscard, "discarding a thought entry must never advance or regress the stage either");
});
