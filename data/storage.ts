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
import { generateArcBuildId } from "../arc/types.ts";
import type { ArcBuild, ArcBuildProfile, ArcProgramProgress } from "../arc/types.ts";
import { splitProfileIntoArcBuilds } from "../arc/arcEngine.ts";
import { deleteArcBuildFromList, upsertArcBuildInList } from "../arc/arcBuilds.ts";
import type { ArcProgramSelection } from "../program/programTypes.ts";
import { PROGRAM_DEFINITIONS } from "../program/config.ts";
import type { SessionLogEntry } from "./sessionLog.ts";

const PROFILE_KEY = "archi.buildProfile.v2";
const PROGRAM_SELECTION_KEY = "archi.programSelection.v1";
const PROGRAM_PROGRESS_KEY = "archi.programProgress.v2";
const SESSION_LOG_KEY = "archi.sessionLog.v1";
const PILOT_STARTED_AT_KEY = "archi.pilotStartedAt.v1";
const ARC_BUILDS_KEY = "archi.arcBuilds.v1";

function isKnownProgramPath(programPath: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROGRAM_DEFINITIONS, programPath);
}

/**
 * Startup-safety fix: JSON.parse on stored data must never be allowed to
 * throw uncaught -- this is reachable from app/index.tsx's (Home's) very
 * first useFocusEffect on every cold start via loadArcBuilds' migration
 * path below, with no .catch() at any call site. An unguarded throw here
 * became an unhandled promise rejection on the very first screen the app
 * renders, which is exactly the class of very-early fatal failure Expo
 * Updates' rollback-to-previous-update safety net watches for. A
 * corrupted/unparseable PROFILE_KEY record is treated as "no legacy
 * profile" (never crashes, never invents data) -- the raw bytes are left
 * untouched in storage (never deleted/overwritten by this read), so nothing
 * about the trainee's actual data is destroyed, only this one read safely
 * degrades to null.
 */
export async function loadProfile(): Promise<ArcBuildProfile | null> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ArcBuildProfile;
  } catch (error) {
    console.warn("[storage] Stored profile is not valid JSON -- treating as no legacy profile.", error);
    return null;
  }
}

export async function saveProfile(profile: ArcBuildProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

/**
 * ARC Builds task: the standalone collection BUILD and LIVE now operate
 * on, replacing the old single global profile (PROFILE_KEY, above) as
 * the user-facing source of truth. Stored as one plain array, the same
 * "keyed by its own stable id, read-modify-write the whole list" style
 * already used for ScheduledRoutine (loadScheduledRoutines/
 * saveScheduledRoutines, further down) -- appropriate for the same
 * reason: a trainee's own handful of ARC Builds, not an unbounded log.
 *
 * Migration (#10): the OLD BUILD-GOAL -> BUILD-ARC flow persisted
 * exactly one profile (PROFILE_KEY) that could bundle a state target
 * AND an identity target AND a habit target together -- never a list,
 * never one-target-per-build. The very first time this collection is
 * loaded and found empty, if that legacy profile exists, it is split
 * into one standalone ArcBuild PER target actually configured
 * (arc/arcEngine.ts's splitProfileIntoArcBuilds -- never one bundled
 * build covering several targets), each named from that target's own
 * Desired State/Identity/Habit text, and persisted into the new
 * collection -- so an existing trainee's already-configured ARC
 * protocol(s) are carried forward automatically rather than silently
 * discarded, exactly once (every subsequent load just returns the
 * persisted collection as-is, even if it's still empty because the
 * trainee deleted every migrated build or never had legacy data to
 * begin with -- saveArcBuilds always persists the array, even an empty
 * one, so `raw` is truthy on every later load and this branch is never
 * re-entered). The legacy PROFILE_KEY record itself is left
 * untouched/inert -- never deleted -- so program/'s week-based
 * progression and the Stats screen keep reading exactly what they
 * always did for any pre-existing data, unaffected by this migration.
 */
export async function loadArcBuilds(): Promise<ArcBuild[]> {
  const raw = await AsyncStorage.getItem(ARC_BUILDS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as ArcBuild[];
      // Defensive: a stored value that parses but isn't actually an
      // array (e.g. corrupted into an object/null) must not reach
      // callers that immediately call .length/.find/.map on it.
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      // Startup-safety fix: this key already exists (raw is truthy), so
      // re-running migration below would risk creating duplicate builds
      // from the still-present legacy profile -- corruption here must
      // degrade to "no builds visible right now", never to "migrate
      // again". The raw bytes are left in storage untouched; nothing is
      // deleted or overwritten by this read.
      console.warn("[storage] Stored ARC Builds are not valid JSON -- returning an empty list rather than crashing or re-migrating.", error);
      return [];
    }
  }

  // No ARC_BUILDS_KEY at all yet -- migrate once from any legacy profile.
  // Wrapped defensively end to end: any unexpected failure here (a
  // corrupted legacy profile loadProfile() couldn't parse, or the split
  // itself throwing on a truly malformed record) must never crash
  // startup -- it simply resolves to "no builds yet", the same state a
  // trainee with no legacy data already sees, and never writes anything
  // to ARC_BUILDS_KEY, so the migration remains eligible to run again
  // correctly with better data if this call was a transient failure.
  try {
    const legacyProfile = await loadProfile();
    if (!legacyProfile) return [];

    const migrated = splitProfileIntoArcBuilds(legacyProfile, generateArcBuildId, new Date().toISOString());
    await saveArcBuilds(migrated);
    return migrated;
  } catch (error) {
    console.warn("[storage] Legacy-profile migration into ARC Builds failed -- returning an empty list rather than crashing startup.", error);
    return [];
  }
}

/** Always the FULL list -- callers read-modify-write, matching loadScheduledRoutines/saveScheduledRoutines' own style. */
export async function saveArcBuilds(builds: ArcBuild[]): Promise<void> {
  await AsyncStorage.setItem(ARC_BUILDS_KEY, JSON.stringify(builds));
}

export async function getArcBuild(id: string): Promise<ArcBuild | null> {
  const builds = await loadArcBuilds();
  return builds.find((build) => build.id === id) ?? null;
}

/** Upserts by id -- see arc/arcBuilds.ts's upsertArcBuildInList (the actual, unit-tested list logic) for the exact guarantee: updates the one matching build in place, never touching any other build's own fields, or appends it as a new build. Never matches by name/Desired State text, only by id -- two builds sharing the same Desired State never collide. */
export async function upsertArcBuild(build: ArcBuild): Promise<void> {
  const builds = await loadArcBuilds();
  await saveArcBuilds(upsertArcBuildInList(builds, build));
}

/** Removes exactly the one matching build (by id) -- see arc/arcBuilds.ts's deleteArcBuildFromList. Every other build is left completely untouched; a no-op if the id doesn't match any build. */
export async function deleteArcBuild(id: string): Promise<void> {
  const builds = await loadArcBuilds();
  await saveArcBuilds(deleteArcBuildFromList(builds, id));
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
 * Attaches an optional Gratitude note -- protocol-linked, per the
 * evidence-encoding task (#4): "על מה אתה מוקיר תודה מתוך מה שקרה עכשיו
 * בתרגול?" -- and, when the trainee also supplied one, ONE concrete
 * memory detail from that SAME experience (#5), to the most recently
 * logged session. Called after appendSessionLogEntry() already logged
 * the session itself (so a completed session is never left unlogged
 * just because the trainee is still on the Gratitude screen), once the
 * trainee submits (or explicitly leaves blank) either field. Both are
 * written together in this ONE call, onto this ONE SessionLogEntry --
 * never two separate writes that could end up describing different
 * sessions (#6/#13's same-source guarantee starts here). `memoryDetail`
 * defaults to null so every pre-existing call site (there were none
 * outside this task, but this keeps the signature backward-compatible
 * regardless) keeps working unchanged. A no-op if the log is empty
 * (defensive; shouldn't happen in practice since this is only ever
 * called right after appendSessionLogEntry).
 */
export async function updateLastSessionLogEntryGratitude(gratitude: string | null, memoryDetail: string | null = null): Promise<void> {
  const existing = await loadSessionLog();
  if (existing.length === 0) return;
  existing[existing.length - 1] = { ...existing[existing.length - 1], gratitude, gratitudeMemoryDetail: memoryDetail };
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
export type TimerType = "beneficialAction" | "successCoding" | "negativeAction" | "routineSuccessFocus";

export interface TimerRun {
  timerType: TimerType;
  runId: string;
  actionStartedAt: string;
  durationMinutes: number | null;
  copyTitle: string;
  copyBody: string;
  notificationId: string | null;
  completedAt: string | null;
  /**
   * Only ever set for timerType "routineSuccessFocus" -- which
   * ScheduledRoutine's post-ARC Success Focus timer this specific run
   * belongs to, so resuming it (surviving backgrounding/locking/a full
   * close-reopen, the same as every other TimerRun) can record
   * completion against the correct routine occurrence. Optional (never
   * present on the other three timer types, and absent on any TimerRun
   * persisted before this field existed) rather than `string | null`,
   * so a legacy record simply parses with it `undefined` -- never a
   * literal "undefined" read as a real id.
   */
  relatedRoutineId?: string | null;
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
 * Two independent kinds -- kind "focusSuccess" is the START ping for a
 * future-scheduled Success Focus (see data/reminders.ts's
 * scheduleFutureSuccessFocus, and TimerRun above for the paired
 * "successCoding" run this ping's own moment feeds into) -- can never
 * overwrite or be confused with a separately-scheduled future ARC
 * session reminder (kind "arc", see app/index.tsx), and vice versa. At
 * most one pending reminder per kind -- scheduling a new one for the
 * same kind (data/reminders.ts's scheduleDeferredReminder/
 * scheduleFutureSuccessFocus) always cancels and replaces whatever was
 * pending for that kind first, so a trainee can never end up with two
 * overlapping reminders of the same kind. notificationId is cleared
 * alongside the record once the reminder is resolved (its notification
 * fires and is handled, or the trainee replaces/cancels it) -- never
 * left dangling to fire a redundant signal later.
 */
export type ReminderKind = "focusSuccess" | "arc" | "routine";

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

/**
 * Multiple Scheduled ARC + Success Focus Routines: a trainee-defined
 * recurring routine (e.g. "08:00 -- Morning Focus"), distinct from
 * PendingReminder above -- that type is deliberately one-per-kind
 * (see its own doc), which cannot represent "any number of independent
 * named routines, each with its own schedule". ScheduledRoutine records
 * are instead stored as a single list (loadScheduledRoutines/
 * saveScheduledRoutines below), each with its own stable `id`, so any
 * number of routines -- including several scheduled for the exact same
 * clock time -- can exist, be edited, and be notified independently,
 * never overwriting one another.
 *
 * hour/minute are the device's LOCAL wall-clock time (never a UTC or
 * elapsed-time value) the routine should begin; recurrenceDays uses
 * JS's own Date.getDay() convention (0 = Sunday .. 6 = Saturday) so the
 * exact same values can be compared directly against a live Date
 * without any extra conversion. nextOccurrenceNotificationId/
 * nextOccurrenceScheduledFor are this routine's OWN currently-scheduled
 * local notification for its next occurrence (see data/routines.ts's
 * rescheduleRoutineNotification/reconcileRoutineNotifications) --
 * always kept in sync with a fresh resolveNextOccurrenceDate result,
 * cancelled and replaced rather than ever left stale or duplicated.
 */
export interface ScheduledRoutine {
  id: string;
  title: string;
  hour: number;
  minute: number;
  /** 0 = Sunday .. 6 = Saturday (Date.getDay() convention). */
  recurrenceDays: number[];
  successFocusDurationMinutes: number;
  notificationsEnabled: boolean;
  enabled: boolean;
  nextOccurrenceNotificationId: string | null;
  /** ISO timestamp this routine's currently-scheduled notification (if any) actually fires at -- lets reconciliation detect a stale schedule without re-deriving it from the notification itself. */
  nextOccurrenceScheduledFor: string | null;
  createdAt: string;
}

/**
 * One completed occurrence of one routine, keyed by the LOCAL calendar
 * date (program/dateUtils.ts's todayLocalDateString -- never an hour-only
 * or UTC-based key, so a trainee near midnight always gets the correct
 * day's occurrence marked, not the wrong one). Completing today's
 * occurrence of routine A can never mark routine B -- or a different
 * day's occurrence of routine A -- complete, since both routineId and
 * occurrenceDateLocal must match. This list only ever grows
 * (appendRoutineOccurrenceCompletion below); nothing in this feature
 * removes a past completion.
 */
export interface RoutineOccurrenceCompletion {
  routineId: string;
  occurrenceDateLocal: string;
  completedAt: string;
}

const SCHEDULED_ROUTINES_KEY = "archi.scheduledRoutines.v1";
const ROUTINE_OCCURRENCE_COMPLETIONS_KEY = "archi.routineOccurrenceCompletions.v1";

export async function loadScheduledRoutines(): Promise<ScheduledRoutine[]> {
  const raw = await AsyncStorage.getItem(SCHEDULED_ROUTINES_KEY);
  return raw ? (JSON.parse(raw) as ScheduledRoutine[]) : [];
}

/** Always the FULL list -- callers read-modify-write (load, change one routine, save the whole array back) rather than a per-id upsert, matching loadSessionLog/appendSessionLogEntry's own simple whole-array persistence style for a list this small (a trainee's own handful of routines, not an unbounded log). */
export async function saveScheduledRoutines(routines: ScheduledRoutine[]): Promise<void> {
  await AsyncStorage.setItem(SCHEDULED_ROUTINES_KEY, JSON.stringify(routines));
}

export async function loadRoutineOccurrenceCompletions(): Promise<RoutineOccurrenceCompletion[]> {
  const raw = await AsyncStorage.getItem(ROUTINE_OCCURRENCE_COMPLETIONS_KEY);
  return raw ? (JSON.parse(raw) as RoutineOccurrenceCompletion[]) : [];
}

/** Records one occurrence as done -- never removes or rewrites any earlier entry, so completion history survives app restarts and one routine's completion can never affect another's. */
export async function appendRoutineOccurrenceCompletion(entry: RoutineOccurrenceCompletion): Promise<void> {
  const existing = await loadRoutineOccurrenceCompletions();
  existing.push(entry);
  await AsyncStorage.setItem(ROUTINE_OCCURRENCE_COMPLETIONS_KEY, JSON.stringify(existing));
}
