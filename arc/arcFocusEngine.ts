/**
 * arc/arcFocusEngine.ts
 *
 * ARC Focus task: the pure stage/stopwatch/rhythm/thought/attention-check
 * state machine for the ARC Focus sustained-attention exercise. No I/O,
 * no React, no navigation -- arc/arcFocusSession.ts wraps this with the
 * persisted envelope (task/mood/pre-ARC context); the UI screens only
 * ever call the functions exported here.
 *
 * Reward-system revision (second user message): smileys are a pure
 * DERIVED function of `sessionClock`'s accumulated active seconds
 * (getArcFocusSmileyCount), never a stored/incremented counter -- so
 * there is no counter to double-award after a pause/resume/crash-resume
 * cycle; re-deriving from the same persisted timestamps always yields
 * the same answer. Stage advance happens ONLY on the stage stopwatch
 * reaching its time target (advanceStage, called from tick) -- logging a
 * thought (saveThought/discardThoughtEntry) and resolving an attention
 * check (resolveAttentionCheck) NEVER move currentStage up or down; they
 * either resume exactly where the stage stopwatch was ("focused") or
 * restart the CURRENT stage from zero (every other resolution), both via
 * the shared `restartCurrentStage` exit. Blue ring count is simply
 * `currentStage` -- never a separate counter, since stage never
 * regresses under this design.
 *
 * Two independent timestamp-anchored clocks (stageStopwatch, sessionClock
 * -- the latter IS "active practice time"), following
 * arc/taskTimer.ts's own philosophy: every read recomputes fully from
 * `now`, never an interval/tick accumulator, so backgrounding never
 * desyncs either one. `pausedAt` (top-level, not per-clock) only ever
 * records the wall-clock moment the engine most recently froze (manual
 * pause, background pause, a thought dialog, or an attention check) --
 * used solely to shift `nextExpectedTapAt` forward past the frozen
 * interval on resume, so a pause/dialog can never itself produce a false
 * rhythm-miss the instant the exercise resumes.
 */

export type ArcFocusStatus = "idle" | "running" | "thought_entry" | "attention_check" | "paused" | "completed";

export type ArcFocusThoughtTrigger = "outerTap" | "missedRhythm";

export type ArcFocusPausedReason = "manual" | "background";

export type ArcFocusAttentionAnswer = "focused" | "lostInThought" | "notSure";

export interface ArcFocusThoughtEntry {
  stage: number;
  text: string;
  detectedAt: string;
}

/** `startedAt === null` means frozen -- `accumulatedSeconds` already holds the full elapsed total in that case. */
export interface ArcFocusClock {
  startedAt: string | null;
  accumulatedSeconds: number;
}

export interface ArcFocusEngineState {
  status: ArcFocusStatus;
  /** Starts at 1, only ever increases -- advanceStage (timeout-only) is the sole place this changes. */
  currentStage: number;
  stageStopwatch: ArcFocusClock;
  /** = accumulated ACTIVE practice time. Smiley count is derived from this, never stored separately. */
  sessionClock: ArcFocusClock;
  totalDurationSeconds: number;
  tapRhythmSeconds: number;
  tapToleranceSeconds: number;
  nextExpectedTapAt: string | null;
  thoughtEntryTrigger: ArcFocusThoughtTrigger | null;
  thoughts: ArcFocusThoughtEntry[];
  /** Incremented only by the shared restartCurrentStage exit's countsAsRecovery path -- never for an attention check answered "focused". */
  focusRecoveryCount: number;
  /** sessionClock.accumulatedSeconds at the last recovery (or 0 at session start). */
  streakStartSeconds: number;
  /** Self-reported, not objective proof of continuous attention -- see the summary screen's own labelling requirement. */
  longestFocusStreakSeconds: number;
  attentionChecksEnabled: boolean;
  /** In sessionClock-elapsed-seconds, so pauses never skew it. Null while attention checks are disabled. */
  nextAttentionCheckAtSeconds: number | null;
  /** Wall-clock moment the engine most recently became frozen (paused/thought_entry/attention_check); null while running/idle/completed. */
  pausedAt: string | null;
  pausedReason: ArcFocusPausedReason | null;
}

export const STAGE_TARGET_INCREMENT_SECONDS = 5;
export const DEFAULT_TAP_TOLERANCE_SECONDS = 0.75;
/** Internal safety rail, not a user-facing setting -- the spec asks only for on/off plus "limit frequency" so checks never overly disrupt sustained attention. */
export const ATTENTION_CHECK_MIN_INTERVAL_SECONDS = 45;
export const ATTENTION_CHECK_MAX_INTERVAL_SECONDS = 120;

export interface ArcFocusEngineConfig {
  totalDurationSeconds: number;
  tapRhythmSeconds: number;
  attentionChecksEnabled: boolean;
  tapToleranceSeconds?: number;
}

function isoToMs(iso: string): number {
  return new Date(iso).getTime();
}

function msToIso(ms: number): string {
  return new Date(ms).toISOString();
}

function addSeconds(iso: string, seconds: number): string {
  return msToIso(isoToMs(iso) + seconds * 1000);
}

function startClock(now: string): ArcFocusClock {
  return { startedAt: now, accumulatedSeconds: 0 };
}

function idleClock(): ArcFocusClock {
  return { startedAt: null, accumulatedSeconds: 0 };
}

/** The one function every elapsed-time read goes through -- recomputed fully from `now`, never an accumulated tick delta. */
function clockElapsedSeconds(clock: ArcFocusClock, now: string): number {
  if (clock.startedAt === null) return clock.accumulatedSeconds;
  return clock.accumulatedSeconds + Math.max(0, (isoToMs(now) - isoToMs(clock.startedAt)) / 1000);
}

/** No-op if already frozen -- never double-banks a frozen interval. */
function freezeClock(clock: ArcFocusClock, now: string): ArcFocusClock {
  if (clock.startedAt === null) return clock;
  return { startedAt: null, accumulatedSeconds: clockElapsedSeconds(clock, now) };
}

/** No-op if already running. Resumes from the banked total with zero loss -- never estimated. */
function unfreezeClock(clock: ArcFocusClock, now: string): ArcFocusClock {
  if (clock.startedAt !== null) return clock;
  return { startedAt: now, accumulatedSeconds: clock.accumulatedSeconds };
}

/** Reset-to-zero-and-run -- used for the stage stopwatch at every stage transition and every thought/attention-check restart. */
function resetClock(now: string): ArcFocusClock {
  return startClock(now);
}

/** Shifts a fixed future tap deadline forward past a just-ended frozen interval, so a pause/dialog never itself produces a false rhythm-miss on resume. */
function shiftTapAnchorPastFreeze(nextExpectedTapAt: string | null, pausedAt: string | null, now: string): string | null {
  if (nextExpectedTapAt === null || pausedAt === null) return nextExpectedTapAt;
  const freezeMs = Math.max(0, isoToMs(now) - isoToMs(pausedAt));
  return msToIso(isoToMs(nextExpectedTapAt) + freezeMs);
}

/** A random future offset (in sessionClock-elapsed-seconds) from the current elapsed active time -- so a check can never immediately re-fire on the next tick. */
function scheduleNextAttentionCheck(sessionElapsedSeconds: number, randomFn: () => number): number {
  const span = ATTENTION_CHECK_MAX_INTERVAL_SECONDS - ATTENTION_CHECK_MIN_INTERVAL_SECONDS;
  return sessionElapsedSeconds + ATTENTION_CHECK_MIN_INTERVAL_SECONDS + randomFn() * span;
}

export function createArcFocusEngineState(config: ArcFocusEngineConfig): ArcFocusEngineState {
  return {
    status: "idle",
    currentStage: 1,
    stageStopwatch: idleClock(),
    sessionClock: idleClock(),
    totalDurationSeconds: config.totalDurationSeconds,
    tapRhythmSeconds: config.tapRhythmSeconds,
    tapToleranceSeconds: config.tapToleranceSeconds ?? DEFAULT_TAP_TOLERANCE_SECONDS,
    nextExpectedTapAt: null,
    thoughtEntryTrigger: null,
    thoughts: [],
    focusRecoveryCount: 0,
    streakStartSeconds: 0,
    longestFocusStreakSeconds: 0,
    attentionChecksEnabled: config.attentionChecksEnabled,
    nextAttentionCheckAtSeconds: null,
    pausedAt: null,
    pausedReason: null,
  };
}

/**
 * Starts the clocks -- this is the exact moment "the Focus clock starts"
 * per the spec (preliminary ARC time, the check-in, and any scheduling
 * all happen before this is ever called). No-op unless status is "idle".
 */
export function startFocusEngine(state: ArcFocusEngineState, now: string, randomFn: () => number = Math.random): ArcFocusEngineState {
  if (state.status !== "idle") return state;
  return {
    ...state,
    status: "running",
    stageStopwatch: startClock(now),
    sessionClock: startClock(now),
    nextExpectedTapAt: addSeconds(now, state.tapRhythmSeconds),
    nextAttentionCheckAtSeconds: state.attentionChecksEnabled ? scheduleNextAttentionCheck(0, randomFn) : null,
  };
}

/**
 * Recomputes elapsed stage/session time from the timestamp anchors and
 * applies at most one state-changing priority per call (falling through
 * to the next check only while still "running"): (1) session time up --
 * no new stage ever starts once this fires; (2) stage time up --
 * advanceStage, the ONLY path that increments currentStage; (3) an
 * attention check becomes due; (4) the rhythm tap was missed beyond
 * tolerance. A no-op while not "running" (idle/paused/thought_entry/
 * attention_check/completed all wait for their own explicit resolution).
 */
export function tick(state: ArcFocusEngineState, now: string): ArcFocusEngineState {
  if (state.status !== "running") return state;
  let next = state;

  if (clockElapsedSeconds(next.sessionClock, now) >= next.totalDurationSeconds) {
    return completeSession(next, now);
  }

  if (clockElapsedSeconds(next.stageStopwatch, now) >= getArcFocusStageTargetSeconds(next)) {
    next = advanceStage(next, now);
  }

  if (next.attentionChecksEnabled && next.nextAttentionCheckAtSeconds !== null && clockElapsedSeconds(next.sessionClock, now) >= next.nextAttentionCheckAtSeconds) {
    return {
      ...next,
      status: "attention_check",
      pausedAt: now,
      stageStopwatch: freezeClock(next.stageStopwatch, now),
      sessionClock: freezeClock(next.sessionClock, now),
    };
  }

  if (next.nextExpectedTapAt !== null && isoToMs(now) > isoToMs(next.nextExpectedTapAt) + next.tapToleranceSeconds * 1000) {
    return {
      ...next,
      status: "thought_entry",
      thoughtEntryTrigger: "missedRhythm",
      pausedAt: now,
      stageStopwatch: freezeClock(next.stageStopwatch, now),
      sessionClock: freezeClock(next.sessionClock, now),
    };
  }

  return next;
}

/** currentStage += 1, new target = currentStage*5, stage stopwatch and tap tracking both restart fresh. sessionClock is never touched -- it was never frozen for a timeout advance, and no smiley/reward bookkeeping happens here at all. No-op unless status is "running" (tick is the only normal caller). */
export function advanceStage(state: ArcFocusEngineState, now: string): ArcFocusEngineState {
  if (state.status !== "running") return state;
  return {
    ...state,
    currentStage: state.currentStage + 1,
    stageStopwatch: resetClock(now),
    nextExpectedTapAt: addSeconds(now, state.tapRhythmSeconds),
  };
}

/**
 * A tap outside tolerance of the fixed grid is simply ignored here, never
 * evaluated as a miss -- that is tick's own job -- and never lets a
 * burst of rapid taps "catch up": the next expected moment always
 * advances from the fixed grid (nextExpectedTapAt + tapRhythmSeconds),
 * never from the actual tap time.
 */
export function registerCenterTap(state: ArcFocusEngineState, now: string): ArcFocusEngineState {
  if (state.status !== "running" || state.nextExpectedTapAt === null) return state;
  const toleranceMs = state.tapToleranceSeconds * 1000;
  if (Math.abs(isoToMs(now) - isoToMs(state.nextExpectedTapAt)) > toleranceMs) return state;
  return { ...state, nextExpectedTapAt: addSeconds(state.nextExpectedTapAt, state.tapRhythmSeconds) };
}

/** Tapping the outer ring to report a thought -- freezes both clocks and opens the thought dialog. No-op unless "running", so the dialog can never open a second time for the same triggering event. */
export function registerOuterTap(state: ArcFocusEngineState, now: string): ArcFocusEngineState {
  if (state.status !== "running") return state;
  return {
    ...state,
    status: "thought_entry",
    thoughtEntryTrigger: "outerTap",
    pausedAt: now,
    stageStopwatch: freezeClock(state.stageStopwatch, now),
    sessionClock: freezeClock(state.sessionClock, now),
  };
}

/** Requires non-empty text (mirrors this codebase's addSubtaskToDraft convention) -- an empty/whitespace-only save is simply ignored, leaving the dialog open. */
export function saveThought(state: ArcFocusEngineState, text: string, now: string, randomFn: () => number = Math.random): ArcFocusEngineState {
  if (state.status !== "thought_entry") return state;
  const trimmed = text.trim();
  if (!trimmed) return state;
  const thoughts = [...state.thoughts, { stage: state.currentStage, text: trimmed, detectedAt: now }];
  return restartCurrentStage({ ...state, thoughts }, now, { countsAsRecovery: true }, randomFn);
}

/** Used identically by "I don't remember" and "No thought -- try again" -- both are the same engine transition: restart the current stage, no entry logged, no time or reward lost. */
export function discardThoughtEntry(state: ArcFocusEngineState, now: string, randomFn: () => number = Math.random): ArcFocusEngineState {
  if (state.status !== "thought_entry") return state;
  return restartCurrentStage(state, now, { countsAsRecovery: true }, randomFn);
}

/**
 * "focused" resumes exactly where the stage stopwatch was (no reset, not
 * a recovery, the streak is not broken). "lostInThought"/"notSure" both
 * go through the same shared restart exit as a logged/discarded thought
 * -- counted as a recovery, no penalty beyond restarting the stage. In
 * every case the time spent answering is excluded from active practice
 * time (both clocks were frozen the moment the check fired) and smileys
 * are unaffected (smileyCount only ever reads sessionClock).
 */
export function resolveAttentionCheck(
  state: ArcFocusEngineState,
  answer: ArcFocusAttentionAnswer,
  now: string,
  randomFn: () => number = Math.random
): ArcFocusEngineState {
  if (state.status !== "attention_check") return state;
  if (answer === "focused") {
    const elapsed = clockElapsedSeconds(state.sessionClock, now);
    return {
      ...state,
      status: "running",
      stageStopwatch: unfreezeClock(state.stageStopwatch, now),
      sessionClock: unfreezeClock(state.sessionClock, now),
      nextExpectedTapAt: shiftTapAnchorPastFreeze(state.nextExpectedTapAt, state.pausedAt, now),
      pausedAt: null,
      nextAttentionCheckAtSeconds: state.attentionChecksEnabled ? scheduleNextAttentionCheck(elapsed, randomFn) : null,
    };
  }
  return restartCurrentStage(state, now, { countsAsRecovery: true }, randomFn);
}

/**
 * The shared exit used by saveThought, discardThoughtEntry, and
 * resolveAttentionCheck's "lostInThought"/"notSure" answers: restarts the
 * CURRENT stage's stopwatch from zero (never changes currentStage),
 * restarts tap tracking fresh, and resumes the session clock with zero
 * time lost from the frozen interval. When countsAsRecovery, folds the
 * just-ended streak into longestFocusStreakSeconds and starts a new one
 * from this moment -- this is the only place focusRecoveryCount/
 * longestFocusStreakSeconds are ever mutated, and it fires exactly once
 * per real user action (tick only ever ENTERS thought_entry/
 * attention_check, never resolves them), so a restored/crashed session
 * can never double-apply a resolution that already happened.
 */
function restartCurrentStage(state: ArcFocusEngineState, now: string, options: { countsAsRecovery: boolean }, randomFn: () => number): ArcFocusEngineState {
  const elapsed = clockElapsedSeconds(state.sessionClock, now);
  const focusRecoveryCount = options.countsAsRecovery ? state.focusRecoveryCount + 1 : state.focusRecoveryCount;
  const longestFocusStreakSeconds = options.countsAsRecovery ? Math.max(state.longestFocusStreakSeconds, elapsed - state.streakStartSeconds) : state.longestFocusStreakSeconds;
  const streakStartSeconds = options.countsAsRecovery ? elapsed : state.streakStartSeconds;
  return {
    ...state,
    status: "running",
    thoughtEntryTrigger: null,
    stageStopwatch: resetClock(now),
    sessionClock: unfreezeClock(state.sessionClock, now),
    nextExpectedTapAt: addSeconds(now, state.tapRhythmSeconds),
    pausedAt: null,
    pausedReason: null,
    focusRecoveryCount,
    longestFocusStreakSeconds,
    streakStartSeconds,
    nextAttentionCheckAtSeconds: state.attentionChecksEnabled ? scheduleNextAttentionCheck(elapsed, randomFn) : null,
  };
}

/** No-op unless "running" -- idempotent, mirrors arc/taskTimer.ts's own pauseTaskTimerRun. A pause is never itself a distraction event: focusRecoveryCount/streak fields are untouched. */
export function pauseManual(state: ArcFocusEngineState, now: string): ArcFocusEngineState {
  if (state.status !== "running") return state;
  return {
    ...state,
    status: "paused",
    pausedReason: "manual",
    pausedAt: now,
    stageStopwatch: freezeClock(state.stageStopwatch, now),
    sessionClock: freezeClock(state.sessionClock, now),
  };
}

/** Same freeze as pauseManual -- tagged "background" only so summary/analytics can distinguish it, and so no rhythm-miss/attention-check is ever evaluated across a backgrounded gap (tick is simply never called while not "running"). */
export function handleBackgroundPause(state: ArcFocusEngineState, now: string): ArcFocusEngineState {
  if (state.status !== "running") return state;
  return {
    ...state,
    status: "paused",
    pausedReason: "background",
    pausedAt: now,
    stageStopwatch: freezeClock(state.stageStopwatch, now),
    sessionClock: freezeClock(state.sessionClock, now),
  };
}

/** No-op unless "paused". Resumes both clocks with zero loss and shifts the tap deadline forward past the pause -- never an immediate false rhythm-miss on resume. */
export function resumeManual(state: ArcFocusEngineState, now: string): ArcFocusEngineState {
  if (state.status !== "paused") return state;
  return {
    ...state,
    status: "running",
    pausedReason: null,
    pausedAt: null,
    stageStopwatch: unfreezeClock(state.stageStopwatch, now),
    sessionClock: unfreezeClock(state.sessionClock, now),
    nextExpectedTapAt: shiftTapAnchorPastFreeze(state.nextExpectedTapAt, state.pausedAt, now),
  };
}

/** Finalizes the streak (a distraction-free run to the very end still counts, even with no trailing recovery event), freezes both clocks, and completes. Called only from tick on a natural timeout. */
function completeSession(state: ArcFocusEngineState, now: string): ArcFocusEngineState {
  const elapsed = clockElapsedSeconds(state.sessionClock, now);
  return {
    ...state,
    status: "completed",
    thoughtEntryTrigger: null,
    pausedAt: null,
    pausedReason: null,
    stageStopwatch: freezeClock(state.stageStopwatch, now),
    sessionClock: freezeClock(state.sessionClock, now),
    longestFocusStreakSeconds: Math.max(state.longestFocusStreakSeconds, elapsed - state.streakStartSeconds),
  };
}

/** "סיום מוקדם" -- the trainee ending the session before the timer would naturally complete, valid from any non-completed status. Idempotent: calling it again on an already-completed state leaves it unchanged. */
export function endEarly(state: ArcFocusEngineState, now: string): ArcFocusEngineState {
  if (state.status === "completed") return state;
  const elapsed = clockElapsedSeconds(state.sessionClock, now);
  return {
    ...state,
    status: "completed",
    thoughtEntryTrigger: null,
    pausedAt: null,
    pausedReason: null,
    stageStopwatch: freezeClock(state.stageStopwatch, now),
    sessionClock: freezeClock(state.sessionClock, now),
    longestFocusStreakSeconds: Math.max(state.longestFocusStreakSeconds, elapsed - state.streakStartSeconds),
  };
}

/** Strictly `floor(activeSeconds / 60)` -- completely decoupled from stage count. Two trainees who both practice 5 active minutes get 5 smileys each, regardless of which stage either reached. */
export function getArcFocusSmileyCount(state: ArcFocusEngineState, now: string): number {
  return Math.floor(clockElapsedSeconds(state.sessionClock, now) / 60);
}

/** A direct rendering of currentStage -- never a separately incremented counter. */
export function getArcFocusRingCount(state: ArcFocusEngineState): number {
  return state.currentStage;
}

/** Never different from currentStage under this design (stage never regresses) -- kept as a named getter for the summary stat and defensive clarity. */
export function getArcFocusHighestStageReached(state: ArcFocusEngineState): number {
  return state.currentStage;
}

export function getArcFocusStageTargetSeconds(state: ArcFocusEngineState): number {
  return state.currentStage * STAGE_TARGET_INCREMENT_SECONDS;
}

export function getArcFocusStageElapsedSeconds(state: ArcFocusEngineState, now: string): number {
  return clockElapsedSeconds(state.stageStopwatch, now);
}

export function getArcFocusStageRemainingSeconds(state: ArcFocusEngineState, now: string): number {
  return Math.max(0, getArcFocusStageTargetSeconds(state) - clockElapsedSeconds(state.stageStopwatch, now));
}

export function getArcFocusSessionElapsedSeconds(state: ArcFocusEngineState, now: string): number {
  return clockElapsedSeconds(state.sessionClock, now);
}

export function getArcFocusSessionRemainingSeconds(state: ArcFocusEngineState, now: string): number {
  return Math.max(0, state.totalDurationSeconds - clockElapsedSeconds(state.sessionClock, now));
}

/** The ONGOING self-reported distraction-free stretch (not yet finalized into longestFocusStreakSeconds) -- for a live in-session readout; the summary screen's own figure is the max of this and the stored value, exactly as completeSession/endEarly compute at finalization. */
export function getArcFocusCurrentStreakSeconds(state: ArcFocusEngineState, now: string): number {
  return Math.max(0, clockElapsedSeconds(state.sessionClock, now) - state.streakStartSeconds);
}
