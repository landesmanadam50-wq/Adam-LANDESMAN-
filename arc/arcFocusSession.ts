/**
 * arc/arcFocusSession.ts
 *
 * ARC Focus task: the full persisted envelope around arc/arcFocusEngine.ts's
 * pure engine state -- task/mood/preliminary-ARC context, so the
 * check-in -> optional Full/Shortened ARC -> auto-resume chain can
 * restore the SAME planned Focus session with no re-pick (per the spec:
 * "the planned ARC Focus context must be preserved across the whole
 * chain"). No I/O -- data/storage.ts's own loadArcFocusSession/
 * saveArcFocusSession/clearArcFocusSession persist this shape in a
 * single resumable slot, mirroring loadNewArcLiveSession's own
 * single-slot convention.
 */

import {
  createArcFocusEngineState,
  discardThoughtEntry as discardThoughtEntryEngine,
  endEarly as endEarlyEngine,
  getArcFocusHighestStageReached,
  getArcFocusRingCount,
  getArcFocusSessionElapsedSeconds,
  getArcFocusSmileyCount,
  handleBackgroundPause as handleBackgroundPauseEngine,
  pauseManual as pauseManualEngine,
  registerCenterTap as registerCenterTapEngine,
  registerOuterTap as registerOuterTapEngine,
  resolveAttentionCheck as resolveAttentionCheckEngine,
  resumeManual as resumeManualEngine,
  saveThought as saveThoughtEngine,
  startFocusEngine,
  tick as tickEngine,
} from "./arcFocusEngine.ts";
import type { ArcFocusAttentionAnswer, ArcFocusEngineState } from "./arcFocusEngine.ts";
import { normalizeArcFocusSettings } from "./arcFocusSettings.ts";
import type { ArcFocusSettings } from "./arcFocusSettings.ts";

/** Mirrors ArcGymCheckInChoice's own three-way shape (arc/arcGym.ts) -- 😄 "direct" skips any preliminary ARC entirely, same meaning as that module's "visualization_only". */
export type ArcFocusMoodChoice = "full_arc" | "shortened_arc" | "direct";

export type ArcFocusPreliminaryArc = "full" | "shortened" | null;

const CURRENT_ARC_FOCUS_SESSION_SCHEMA_VERSION = 1;

export interface ArcFocusSession {
  practiceId: string;
  /** The real scheduled Task this session is linked to, or null for a standalone/quick-start session opened directly from ARC Gym. */
  taskId: string | null;
  settings: ArcFocusSettings;
  moodChoice: ArcFocusMoodChoice | null;
  /** Which preliminary ARC actually ran, if any -- set once that ARC session completes and this Focus session resumes. */
  preliminaryArc: ArcFocusPreliminaryArc;
  engine: ArcFocusEngineState;
  createdAt: string;
  /** Set exactly once, the moment startFocusSession first starts the clocks -- preliminary ARC time is never counted into Focus duration because this timestamp (and the engine clocks themselves) simply don't exist until this moment. */
  startedAt: string | null;
  completedAt: string | null;
  schemaVersion: number;
}

export function generateArcFocusPracticeId(): string {
  return `arc-focus-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createArcFocusSession(practiceId: string, taskId: string | null, settings: ArcFocusSettings, now: string): ArcFocusSession {
  return {
    practiceId,
    taskId,
    settings,
    moodChoice: null,
    preliminaryArc: null,
    engine: createArcFocusEngineState({
      totalDurationSeconds: settings.durationMinutes * 60,
      tapRhythmSeconds: settings.tapRhythmSeconds,
      attentionChecksEnabled: settings.attentionChecksEnabled,
    }),
    createdAt: now,
    startedAt: null,
    completedAt: null,
    schemaVersion: CURRENT_ARC_FOCUS_SESSION_SCHEMA_VERSION,
  };
}

export function setArcFocusSessionMoodChoice(session: ArcFocusSession, choice: ArcFocusMoodChoice): ArcFocusSession {
  return { ...session, moodChoice: choice };
}

export function setArcFocusSessionPreliminaryArc(session: ArcFocusSession, preliminaryArc: ArcFocusPreliminaryArc): ArcFocusSession {
  return { ...session, preliminaryArc };
}

/** Folds an engine transition's result back onto the session, syncing completedAt exactly once the moment the engine itself reaches "completed" -- never re-set on a later call, so a restored/reloaded session can never re-trigger "just completed" handling a second time. */
function withEngine(session: ArcFocusSession, engine: ArcFocusEngineState, now: string): ArcFocusSession {
  const completedAt = engine.status === "completed" && session.completedAt === null ? now : session.completedAt;
  return { ...session, engine, completedAt };
}

/** The exact moment the Focus clock starts -- no-op if the engine isn't "idle" (e.g. resuming an already-started session must go through tick/resumeSession instead, never a second start). */
export function startFocusSession(session: ArcFocusSession, now: string, randomFn: () => number = Math.random): ArcFocusSession {
  if (session.engine.status !== "idle") return session;
  return { ...withEngine(session, startFocusEngine(session.engine, now, randomFn), now), startedAt: session.startedAt ?? now };
}

export function tick(session: ArcFocusSession, now: string): ArcFocusSession {
  return withEngine(session, tickEngine(session.engine, now), now);
}

export function registerCenterTap(session: ArcFocusSession, now: string): ArcFocusSession {
  return withEngine(session, registerCenterTapEngine(session.engine, now), now);
}

export function registerOuterTap(session: ArcFocusSession, now: string): ArcFocusSession {
  return withEngine(session, registerOuterTapEngine(session.engine, now), now);
}

export function saveThought(session: ArcFocusSession, text: string, now: string, randomFn: () => number = Math.random): ArcFocusSession {
  return withEngine(session, saveThoughtEngine(session.engine, text, now, randomFn), now);
}

export function discardThoughtEntry(session: ArcFocusSession, now: string, randomFn: () => number = Math.random): ArcFocusSession {
  return withEngine(session, discardThoughtEntryEngine(session.engine, now, randomFn), now);
}

export function resolveAttentionCheck(session: ArcFocusSession, answer: ArcFocusAttentionAnswer, now: string, randomFn: () => number = Math.random): ArcFocusSession {
  return withEngine(session, resolveAttentionCheckEngine(session.engine, answer, now, randomFn), now);
}

export function pauseSession(session: ArcFocusSession, now: string): ArcFocusSession {
  return withEngine(session, pauseManualEngine(session.engine, now), now);
}

export function handleSessionBackgroundPause(session: ArcFocusSession, now: string): ArcFocusSession {
  return withEngine(session, handleBackgroundPauseEngine(session.engine, now), now);
}

/** Resumes from either a manual or a background pause -- the engine's own pausedReason already distinguishes them for analytics, both resume identically. */
export function resumeSession(session: ArcFocusSession, now: string): ArcFocusSession {
  return withEngine(session, resumeManualEngine(session.engine, now), now);
}

export function endSessionEarly(session: ArcFocusSession, now: string): ArcFocusSession {
  return withEngine(session, endEarlyEngine(session.engine, now), now);
}

/**
 * Defensive normalizer for a loaded JSON blob -- same "never throw, never
 * block on a stale/partial persisted value" convention as this
 * codebase's other load functions (compare data/storage.ts's own
 * loadNewArcLiveSession backfill). Returns null only when the blob is
 * missing its own practiceId/engine and so cannot be recovered as a
 * resumable session at all; every other missing/invalid field falls
 * back to a safe default so a session started before a later field was
 * added still resumes correctly.
 */
export function migrateLegacyArcFocusSession(raw: unknown, now: string): ArcFocusSession | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.practiceId !== "string" || !value.practiceId) return null;

  const settings = normalizeArcFocusSettings(value.settings as Partial<ArcFocusSettings> | null | undefined);
  const engine = normalizeArcFocusEngineState(value.engine, settings);

  return {
    practiceId: value.practiceId,
    taskId: typeof value.taskId === "string" ? value.taskId : null,
    settings,
    moodChoice: value.moodChoice === "full_arc" || value.moodChoice === "shortened_arc" || value.moodChoice === "direct" ? value.moodChoice : null,
    preliminaryArc: value.preliminaryArc === "full" || value.preliminaryArc === "shortened" ? value.preliminaryArc : null,
    engine,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : now,
    startedAt: typeof value.startedAt === "string" ? value.startedAt : null,
    completedAt: typeof value.completedAt === "string" ? value.completedAt : null,
    schemaVersion: CURRENT_ARC_FOCUS_SESSION_SCHEMA_VERSION,
  };
}

/**
 * The saved, append-only summary of a finished session (data/storage.ts's
 * own loadArcFocusPracticeHistory/saveArcFocusPracticeRecord). The
 * session summary screen presents focusRecoveryCount/
 * longestFocusStreakSeconds explicitly as SELF-REPORTED -- these checks
 * rely on the trainee's own answer and can never objectively prove
 * sustained attention, so this record never flows downstream as an
 * objective attention metric.
 */
export interface ArcFocusPracticeRecord {
  recordId: string;
  practiceId: string;
  taskId: string | null;
  completedAt: string;
  durationMinutes: number;
  /** Total accumulated ACTIVE practice time in seconds -- what smileyCount is itself derived from, surfaced separately since the summary screen presents them as two distinct stats. */
  activeSeconds: number;
  smileyCount: number;
  ringCount: number;
  highestStageReached: number;
  thoughtsLoggedCount: number;
  /** Self-reported -- see this type's own doc comment. */
  focusRecoveryCount: number;
  /** Self-reported -- see this type's own doc comment. */
  longestFocusStreakSeconds: number;
  attentionChecksEnabled: boolean;
}

export function generateArcFocusPracticeRecordId(): string {
  return `arc-focus-record-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Snapshots the session's derived/stored summary fields at completion time. Callers should only build this once the engine has actually reached "completed" (startFocusSession/endSessionEarly's own return value already guarantees that for the call site that triggers saving). */
export function buildArcFocusPracticeRecord(session: ArcFocusSession, now: string): ArcFocusPracticeRecord {
  return {
    recordId: generateArcFocusPracticeRecordId(),
    practiceId: session.practiceId,
    taskId: session.taskId,
    completedAt: session.completedAt ?? now,
    durationMinutes: session.settings.durationMinutes,
    activeSeconds: getArcFocusSessionElapsedSeconds(session.engine, now),
    smileyCount: getArcFocusSmileyCount(session.engine, now),
    ringCount: getArcFocusRingCount(session.engine),
    highestStageReached: getArcFocusHighestStageReached(session.engine),
    thoughtsLoggedCount: session.engine.thoughts.length,
    focusRecoveryCount: session.engine.focusRecoveryCount,
    longestFocusStreakSeconds: session.engine.longestFocusStreakSeconds,
    attentionChecksEnabled: session.engine.attentionChecksEnabled,
  };
}

function normalizeArcFocusEngineState(raw: unknown, settings: ArcFocusSettings): ArcFocusEngineState {
  const fresh = createArcFocusEngineState({
    totalDurationSeconds: settings.durationMinutes * 60,
    tapRhythmSeconds: settings.tapRhythmSeconds,
    attentionChecksEnabled: settings.attentionChecksEnabled,
  });
  if (typeof raw !== "object" || raw === null) return fresh;
  const value = raw as Record<string, unknown>;
  const status = value.status;
  if (status !== "idle" && status !== "running" && status !== "thought_entry" && status !== "attention_check" && status !== "paused" && status !== "completed") {
    return fresh;
  }
  return {
    ...fresh,
    ...value,
    status,
    // totalDurationSeconds/tapRhythmSeconds/attentionChecksEnabled always come from this session's own settings, never a possibly-stale persisted copy.
    totalDurationSeconds: fresh.totalDurationSeconds,
    tapRhythmSeconds: fresh.tapRhythmSeconds,
    attentionChecksEnabled: fresh.attentionChecksEnabled,
  } as ArcFocusEngineState;
}
