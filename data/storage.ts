/**
 * data/storage.ts
 *
 * Thin AsyncStorage wrapper. There's no accounts/auth system yet, so
 * "per tester" persistence means per-device: each pilot tester runs
 * their own install and gets their own local profile + session log.
 *
 * Depends on the native AsyncStorage module, so unlike the rest of
 * data/ this isn't unit-tested with node --test — it's exercised for
 * real by actually running the app.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ArcBuildProfile, ArcProgramProgress } from "../arc/types.ts";
import type { ArcProgramSelection } from "../program/programTypes.ts";
import { PROGRAM_DEFINITIONS } from "../program/config.ts";
import type { SessionLogEntry } from "./sessionLog.ts";

const PROFILE_KEY = "archi.buildProfile.v2";
const PROGRAM_SELECTION_KEY = "archi.programSelection.v1";
const PROGRAM_PROGRESS_KEY = "archi.programProgress.v2";
const SESSION_LOG_KEY = "archi.sessionLog.v1";
const PILOT_STARTED_AT_KEY = "archi.pilotStartedAt.v1";

function isKnownProgramPath(programPath: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROGRAM_DEFINITIONS, programPath);
}

export async function loadProfile(): Promise<ArcBuildProfile | null> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  return raw ? (JSON.parse(raw) as ArcBuildProfile) : null;
}

export async function saveProfile(profile: ArcBuildProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

/**
 * The real source of truth for what a trainee needs (state/identity/
 * habit, and whether identity was wanted immediately) -- BUILD reads
 * this back instead of inferring from ArcBuildProfile.identityActionNeeded,
 * which is legacy-only. Validated the same way loadProgramProgress()
 * is: an unrecognized programPath returns null instead of a value
 * downstream code would crash on.
 */
export async function loadProgramSelection(): Promise<ArcProgramSelection | null> {
  const raw = await AsyncStorage.getItem(PROGRAM_SELECTION_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as ArcProgramSelection;
  if (!isKnownProgramPath(parsed.programPath)) {
    console.warn(
      `[storage] Stored program selection has an unknown programPath "${parsed.programPath}" -- discarding it rather than letting downstream code use it.`
    );
    return null;
  }
  return parsed;
}

export async function saveProgramSelection(selection: ArcProgramSelection): Promise<void> {
  await AsyncStorage.setItem(PROGRAM_SELECTION_KEY, JSON.stringify(selection));
}

/**
 * Validates programPath against PROGRAM_DEFINITIONS before returning:
 * every real caller (program/progress.ts, stats/StatsScreen.tsx) calls
 * getProgramDefinition(progress.programPath), which throws on an
 * unrecognized path. Rather than let that throw reach the UI, treat a
 * corrupt/legacy-incompatible programPath as "no progress yet" -- a
 * fresh ArcProgramProgress is created the next time BUILD completes.
 */
export async function loadProgramProgress(): Promise<ArcProgramProgress | null> {
  const raw = await AsyncStorage.getItem(PROGRAM_PROGRESS_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as ArcProgramProgress;
  if (!isKnownProgramPath(parsed.programPath)) {
    console.warn(
      `[storage] Stored program progress has an unknown programPath "${parsed.programPath}" -- discarding it rather than crashing downstream.`
    );
    return null;
  }
  return parsed;
}

export async function saveProgramProgress(progress: ArcProgramProgress): Promise<void> {
  await AsyncStorage.setItem(PROGRAM_PROGRESS_KEY, JSON.stringify(progress));
}

export async function loadSessionLog(): Promise<SessionLogEntry[]> {
  const raw = await AsyncStorage.getItem(SESSION_LOG_KEY);
  return raw ? (JSON.parse(raw) as SessionLogEntry[]) : [];
}

export async function appendSessionLogEntry(entry: SessionLogEntry): Promise<void> {
  const existing = await loadSessionLog();
  existing.push(entry);
  await AsyncStorage.setItem(SESSION_LOG_KEY, JSON.stringify(existing));
}

/**
 * Attaches an optional Gratitude note to the most recently logged
 * session -- called after appendSessionLogEntry() already logged the
 * session itself (so a completed session is never left unlogged just
 * because the trainee is still on the Gratitude screen), once the
 * trainee submits (or explicitly leaves blank) the Gratitude entry.
 * A no-op if the log is empty (defensive; shouldn't happen in practice
 * since this is only ever called right after appendSessionLogEntry).
 */
export async function updateLastSessionLogEntryGratitude(gratitude: string | null): Promise<void> {
  const existing = await loadSessionLog();
  if (existing.length === 0) return;
  existing[existing.length - 1] = { ...existing[existing.length - 1], gratitude };
  await AsyncStorage.setItem(SESSION_LOG_KEY, JSON.stringify(existing));
}

/**
 * The trainee's pilot clock starts the first time this is called (normally
 * right after BUILD saves their profile) and never moves after that --
 * editing the profile later doesn't reset it. Idempotent, so it's also
 * safe to call defensively wherever pilot progress is displayed.
 *
 * Independent of program/ (a trainee's own program can be 1-3 weeks
 * depending on what they need): this is the fixed pilot testing window
 * (data/pilotConfig.ts), not their program length.
 */
export async function getOrCreatePilotStartedAt(): Promise<string> {
  const existing = await AsyncStorage.getItem(PILOT_STARTED_AT_KEY);
  if (existing) return existing;
  const now = new Date().toISOString();
  await AsyncStorage.setItem(PILOT_STARTED_AT_KEY, now);
  return now;
}

/**
 * The shared timer-persistence model behind all three of ARCHI's real
 * timed activities -- the Beneficial Action Timer ("act"'s "performing"
 * sub-phase), the Success Focus / Success Coding Timer, and the
 * Negative Action Timer. Each TimerType gets its OWN storage key
 * (timerRunKey below), so the three timers can never read, overwrite,
 * or complete one another -- starting a new Negative Action Timer run
 * cannot touch a Beneficial Action run's record, even if one happened
 * to still exist. This is deliberately its own storage category,
 * separate from both PROFILE_KEY (persistent BUILD data -- e.g. the
 * planned action/duration/base allowance -- never touched by this) and
 * ArcLiveState (session-only, never persisted -- see
 * live/LiveSessionScreen.tsx's module doc): a narrow, explicit
 * exception to "session state is never persisted," whose only purpose
 * is letting a real timer survive navigating away from LIVE, the app
 * backgrounding/locking, or a full close/reopen, per
 * arc/actionTimer.ts's getActionTimerStatusFromStartedAt.
 *
 * actionStartedAt is the absolute anchor everything is recomputed
 * from; copyTitle/copyBody are a snapshot of the exact screen text at
 * the moment the timer began, so resuming shows the same action/cue
 * the trainee actually started with rather than re-deriving it from a
 * necessarily incomplete reconstructed session. runId distinguishes
 * this specific timer run from any other (past or future) run of the
 * same timerType -- e.g. so a stale notification from an earlier
 * Negative Action Timer run can never be mistaken for completing a
 * newer one. notificationId is the scheduled local notification this
 * run owns (see data/notifications.ts), cancelled once completion is
 * handled so it can never fire a redundant/delayed completion signal.
 * completedAt is the idempotency guard: null until completion has
 * actually been processed (sound played, notification cancelled) --
 * once set, it is never processed a second time for this run.
 */
export type TimerType = "beneficialAction" | "successCoding" | "negativeAction";

export interface TimerRun {
  timerType: TimerType;
  runId: string;
  actionStartedAt: string;
  durationMinutes: number | null;
  copyTitle: string;
  copyBody: string;
  notificationId: string | null;
  completedAt: string | null;
}

function timerRunKey(timerType: TimerType): string {
  return `archi.timerRun.v1.${timerType}`;
}

export async function loadTimerRun(timerType: TimerType): Promise<TimerRun | null> {
  const raw = await AsyncStorage.getItem(timerRunKey(timerType));
  return raw ? (JSON.parse(raw) as TimerRun) : null;
}

/** Persists (or re-persists, e.g. once a notificationId or completedAt is resolved) this timer's current run -- always keyed by its own timerType, so this can never overwrite a different timer type's record. */
export async function saveTimerRun(run: TimerRun): Promise<void> {
  await AsyncStorage.setItem(timerRunKey(run.timerType), JSON.stringify(run));
}

/** Called once a timer's real activity is actually completed and acknowledged (or a brand-new session explicitly restarts) -- never on a routine LIVE-screen focus, which is exactly the event this record needs to survive. Only ever clears the ONE named timerType's record. */
export async function clearTimerRun(timerType: TimerType): Promise<void> {
  await AsyncStorage.removeItem(timerRunKey(timerType));
}

/**
 * A "come back later" reminder -- a distinct concept from TimerRun
 * above (which times an activity already in progress): this persists
 * the trainee's own intention for a FUTURE moment that hasn't happened
 * yet, scheduled via data/notifications.ts's scheduleReminderNotification.
 * Two independent kinds, exactly like TimerType's three independent
 * timers -- deferring Success Focus (see live/screens.tsx's
 * SuccessFocusChoiceScreen) can never overwrite or be confused with a
 * separately-scheduled future ARC session reminder (see app/index.tsx),
 * and vice versa. At most one pending reminder per kind -- scheduling a
 * new one for the same kind (data/reminders.ts's scheduleDeferredReminder)
 * always cancels and replaces whatever was pending for that kind first,
 * so a trainee can never end up with two overlapping reminders of the
 * same kind. notificationId is cleared alongside the record once the
 * reminder is resolved (its notification fires and is handled, or the
 * trainee replaces/cancels it) -- never left dangling to fire a
 * redundant signal later.
 */
export type ReminderKind = "focusSuccess" | "arc";

export interface PendingReminder {
  kind: ReminderKind;
  /** ISO timestamp of when this reminder is scheduled to fire. */
  fireAt: string;
  /**
   * Only meaningful for kind "focusSuccess": true = "Focus Success with
   * ARC" was chosen, false = "Focus Success without ARC". Always true
   * for kind "arc" (a future ARC session is, by construction, "with
   * ARC") -- kept on every record rather than a separate optional field
   * so the shape stays uniform across both kinds.
   */
  arcRequested: boolean;
  notificationId: string | null;
  createdAt: string;
}

function pendingReminderKey(kind: ReminderKind): string {
  return `archi.pendingReminder.v1.${kind}`;
}

export async function loadPendingReminder(kind: ReminderKind): Promise<PendingReminder | null> {
  const raw = await AsyncStorage.getItem(pendingReminderKey(kind));
  return raw ? (JSON.parse(raw) as PendingReminder) : null;
}

/** Always keyed by this reminder's own kind, so saving one kind's reminder can never overwrite the other's. */
export async function savePendingReminder(reminder: PendingReminder): Promise<void> {
  await AsyncStorage.setItem(pendingReminderKey(reminder.kind), JSON.stringify(reminder));
}

/** Called once a reminder's notification has actually fired and been handled, or when it's being replaced by a newly-scheduled one of the same kind. Only ever clears the ONE named kind's record. */
export async function clearPendingReminder(kind: ReminderKind): Promise<void> {
  await AsyncStorage.removeItem(pendingReminderKey(kind));
}
