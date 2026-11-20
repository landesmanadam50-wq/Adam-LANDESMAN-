import test from "node:test";
import assert from "node:assert/strict";

import {
  buildArcFocusPracticeRecord,
  createArcFocusSession,
  discardThoughtEntry,
  endSessionEarly,
  migrateLegacyArcFocusSession,
  pauseSession,
  registerOuterTap,
  resumeSession,
  saveThought,
  setArcFocusSessionMoodChoice,
  setArcFocusSessionPreliminaryArc,
  startFocusSession,
  tick,
} from "./arcFocusSession.ts";
import { createDefaultArcFocusSettings } from "./arcFocusSettings.ts";

const START = "2026-09-26T12:00:00.000Z";

function at(secondsFromStart: number): string {
  return new Date(new Date(START).getTime() + secondsFromStart * 1000).toISOString();
}

function freshSession(taskId: string | null = "task-1") {
  // tapRhythmSeconds: 5 keeps every single-jump tick in this file well inside tolerance of the next tap deadline, so rhythm-miss detection never interferes with what each test actually exercises.
  const settings = { ...createDefaultArcFocusSettings(), durationMinutes: 5, tapRhythmSeconds: 5, attentionChecksEnabled: false };
  return createArcFocusSession("practice-1", taskId, settings, START);
}

test("createArcFocusSession starts idle, with the engine's own totalDurationSeconds derived from settings.durationMinutes", () => {
  const session = freshSession();
  assert.equal(session.engine.status, "idle");
  assert.equal(session.engine.totalDurationSeconds, 5 * 60);
  assert.equal(session.taskId, "task-1");
  assert.equal(session.startedAt, null);
  assert.equal(session.completedAt, null);
});

test("createArcFocusSession preserves a null taskId for a standalone/quick-start practice (never forced to a sentinel at this layer)", () => {
  const session = freshSession(null);
  assert.equal(session.taskId, null);
});

test("startFocusSession is the exact moment the Focus clock starts -- startedAt is set only here, never earlier (preliminary ARC/check-in time is never counted)", () => {
  const session = freshSession();
  const started = startFocusSession(session, at(30));
  assert.equal(started.startedAt, at(30));
  assert.equal(started.engine.status, "running");
  assert.equal(started.engine.sessionClock.startedAt, at(30));
});

test("startFocusSession is a no-op once already started -- never re-starts the clock a second time", () => {
  const session = startFocusSession(freshSession(), at(30));
  const again = startFocusSession(session, at(9999));
  assert.equal(again.startedAt, at(30));
  assert.equal(again, session);
});

test("setArcFocusSessionMoodChoice / setArcFocusSessionPreliminaryArc record the check-in choice without touching anything else", () => {
  const session = freshSession();
  const withMood = setArcFocusSessionMoodChoice(session, "full_arc");
  assert.equal(withMood.moodChoice, "full_arc");
  const withPreliminary = setArcFocusSessionPreliminaryArc(withMood, "full");
  assert.equal(withPreliminary.preliminaryArc, "full");
  assert.equal(withPreliminary.engine, session.engine);
});

test("tick/registerOuterTap/saveThought/discardThoughtEntry/pauseSession/resumeSession/endSessionEarly all thread through to the underlying engine, and completedAt is set exactly once, the moment the engine itself completes", () => {
  let session = startFocusSession(freshSession(), START);
  session = tick(session, at(10));
  assert.equal(session.completedAt, null);

  session = registerOuterTap(session, at(12));
  assert.equal(session.engine.status, "thought_entry");
  session = saveThought(session, "מחשבה לבדיקה", at(14));
  assert.equal(session.engine.thoughts.length, 1);

  session = registerOuterTap(session, at(16));
  session = discardThoughtEntry(session, at(17));
  assert.equal(session.engine.focusRecoveryCount, 2);

  session = pauseSession(session, at(20));
  assert.equal(session.engine.status, "paused");
  session = resumeSession(session, at(25));
  assert.equal(session.engine.status, "running");

  session = endSessionEarly(session, at(30));
  assert.equal(session.engine.status, "completed");
  assert.equal(session.completedAt, at(30));

  // Re-reading/re-applying a transition on an already-completed session changes nothing further.
  const again = endSessionEarly(session, at(999));
  assert.equal(again.completedAt, at(30));
});

test("buildArcFocusPracticeRecord snapshots the derived smiley/ring/highestStage values plus the self-reported recovery/streak stats, labelled as such on the type", () => {
  let session = startFocusSession(freshSession(), START);
  session = tick(session, at(65)); // just over a minute of active time
  const record = buildArcFocusPracticeRecord(session, at(65));
  assert.equal(record.practiceId, "practice-1");
  assert.equal(record.taskId, "task-1");
  assert.equal(record.activeSeconds, 65);
  assert.equal(record.smileyCount, 1);
  assert.ok(record.ringCount >= 1);
  assert.equal(record.highestStageReached, record.ringCount);
  assert.equal(record.thoughtsLoggedCount, 0);
  assert.equal(record.focusRecoveryCount, 0);
});

test("migrateLegacyArcFocusSession returns null for a blob with no recoverable practiceId", () => {
  assert.equal(migrateLegacyArcFocusSession(null, START), null);
  assert.equal(migrateLegacyArcFocusSession({}, START), null);
  assert.equal(migrateLegacyArcFocusSession({ practiceId: "" }, START), null);
});

test("migrateLegacyArcFocusSession backfills every missing/invalid field with a safe default, never throwing on a partial blob", () => {
  const migrated = migrateLegacyArcFocusSession({ practiceId: "practice-9" }, START);
  assert.ok(migrated);
  assert.equal(migrated?.practiceId, "practice-9");
  assert.equal(migrated?.taskId, null);
  assert.equal(migrated?.moodChoice, null);
  assert.equal(migrated?.preliminaryArc, null);
  assert.equal(migrated?.engine.status, "idle");
  assert.equal(migrated?.settings.durationMinutes, createDefaultArcFocusSettings().durationMinutes);
});

test("migrateLegacyArcFocusSession round-trips a real, in-progress session through JSON unchanged (a restored/crashed session resumes with no data loss)", () => {
  let session = startFocusSession(freshSession(), START);
  session = tick(session, at(10));
  const roundTripped = JSON.parse(JSON.stringify(session));
  const migrated = migrateLegacyArcFocusSession(roundTripped, at(10));
  assert.ok(migrated);
  assert.equal(migrated?.engine.status, session.engine.status);
  assert.equal(migrated?.engine.currentStage, session.engine.currentStage);
  assert.equal(migrated?.engine.sessionClock.accumulatedSeconds, session.engine.sessionClock.accumulatedSeconds);
  assert.equal(migrated?.engine.sessionClock.startedAt, session.engine.sessionClock.startedAt);
});

test("migrateLegacyArcFocusSession always re-derives totalDurationSeconds/tapRhythmSeconds/attentionChecksEnabled from this session's OWN settings, never from a possibly-stale persisted engine copy", () => {
  const session = freshSession();
  const tampered = { ...session, engine: { ...session.engine, totalDurationSeconds: 999999, tapRhythmSeconds: 1, attentionChecksEnabled: true } };
  const migrated = migrateLegacyArcFocusSession(tampered, START);
  assert.equal(migrated?.engine.totalDurationSeconds, session.engine.totalDurationSeconds);
  assert.equal(migrated?.engine.tapRhythmSeconds, session.engine.tapRhythmSeconds);
  assert.equal(migrated?.engine.attentionChecksEnabled, session.engine.attentionChecksEnabled);
});
