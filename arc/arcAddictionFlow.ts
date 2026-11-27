/**
 * arc/arcAddictionFlow.ts
 *
 * The ARC Addiction session state machine – pure, event driven,
 * time passed in explicitly, so every transition is unit-tested.
 *
 *   intro ─► efficacy_arc ─► wait ─► decision ─┬─ "לא" ─► intensity ─┬ 0    : finish_success | extra_wait
 *              ▲               ▲                │                     ├ 1–4  : continue_routine | extra_wait | extra_arc
 *              │               │                │                     └ 5–10 : extra_arc (offered) | extra_wait | end
 *              └───────────────┴────────────────┘
 *                                               └─ "כן" ─► behavior_log ─► acceptance_arc ─► closing ─► done
 *
 * From any stage the user can: skip an ARC exercise, end the waiting
 * timer early, document that they acted ("ACTED" – also before the wait
 * ended, which still leads to the self-acceptance ARC), or end the whole
 * practice. Invalid events for the current stage return the session
 * unchanged (never throw), which is also what makes duplicate
 * notification presses harmless.
 *
 * The session is persisted as ONE slot (data/arcAddictionStorage.ts),
 * so there can never be two concurrent ARC Addiction sessions, and it
 * survives the app being closed and reopened.
 */

import type {
  AddictionArcRound,
  AddictionEpisode,
  AddictionEpisodeOutcome,
  AddictionIntensityChoice,
  AddictionProfile,
  AddictionWaitRound,
} from "./arcAddiction.ts";
import {
  clampInteger,
  countNotActChoices,
  createAddictionEpisode,
  isValidAddictionRating,
  MAX_DURATION_MINUTES,
  normalizeAddictionEpisode,
  resolveIntensityChoices,
  resolveIntensityRoute,
} from "./arcAddiction.ts";
import type { AddictionArcState } from "./arcAddictionArc.ts";
import { createAddictionArcState } from "./arcAddictionArc.ts";

export type AddictionSessionStage = "intro" | "efficacy_arc" | "wait" | "decision" | "intensity" | "behavior_log" | "acceptance_arc" | "closing" | "done";

export interface AddictionSession {
  version: 1;
  episode: AddictionEpisode;
  /** Snapshot of the profile fields the session needs even when the profile can't be loaded (notification text, harm rule). */
  profileName: string;
  mayCauseBodilyHarm: boolean;
  stage: AddictionSessionStage;
  arc: AddictionArcState | null;
  /** Pending intensity rating on the "intensity" stage. */
  intensityDraft: number | null;
  /** Optional count-up stopwatch while the (non-harmful) behavior happens. */
  stopwatchStartedAt: string | null;
  returnToTaskId: string | null;
  updatedAt: string;
}

export type AddictionSessionEvent =
  | { type: "START"; initialIntensity: number | null }
  | { type: "SKIP_TO_WAIT"; initialIntensity: number | null }
  | { type: "ARC_UPDATE"; arc: AddictionArcState }
  | { type: "ARC_COMPLETE"; arc: AddictionArcState }
  | { type: "ARC_SKIP" }
  | { type: "WAIT_ELAPSED" }
  | { type: "END_WAIT_EARLY" }
  | { type: "ANSWER"; choice: "act" | "not_act"; episodeId?: string }
  | { type: "RATE_INTENSITY"; intensity: number | null }
  | { type: "CHOOSE"; choice: AddictionIntensityChoice }
  | { type: "ACTED" }
  | { type: "START_STOPWATCH" }
  | { type: "STOP_STOPWATCH" }
  | { type: "LOG_BEHAVIOR"; durationMinutes: number | null }
  | { type: "MEMORY_SAVED"; memoryId: string }
  | { type: "END_SESSION" }
  | { type: "CLOSE" };

export function createAddictionSession(episodeId: string, profile: AddictionProfile, returnToTaskId: string | null, now: string): AddictionSession {
  return {
    version: 1,
    episode: createAddictionEpisode(episodeId, profile, returnToTaskId, now),
    profileName: profile.name,
    mayCauseBodilyHarm: profile.mayCauseBodilyHarm,
    stage: "intro",
    arc: null,
    intensityDraft: null,
    stopwatchStartedAt: null,
    returnToTaskId,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getCurrentWaitRound(session: AddictionSession): AddictionWaitRound | null {
  const rounds = session.episode.waitRounds;
  return rounds.length > 0 ? rounds[rounds.length - 1] : null;
}

/** The running wait round (stage "wait", not yet elapsed/ended) – what the timer, floating overlay and notification all show. */
export function getActiveWaitRound(session: AddictionSession | null): AddictionWaitRound | null {
  if (!session || session.stage !== "wait") return null;
  const round = getCurrentWaitRound(session);
  if (!round || round.endedEarlyAt !== null || round.elapsedAt !== null) return null;
  return round;
}

export function getWaitRemainingSeconds(round: AddictionWaitRound, now: string): number {
  const remainingMs = Date.parse(round.endsAt) - Date.parse(now);
  return Number.isFinite(remainingMs) ? Math.max(0, Math.ceil(remainingMs / 1000)) : 0;
}

export function isWaitDue(round: AddictionWaitRound, now: string): boolean {
  return Date.parse(now) >= Date.parse(round.endsAt);
}

function startWaitRound(session: AddictionSession, targetMinutes: number, now: string): AddictionSession {
  const minutes = clampInteger(targetMinutes, 1, 240);
  const round: AddictionWaitRound = {
    startedAt: now,
    targetMinutes: minutes,
    endsAt: new Date(Date.parse(now) + minutes * 60_000).toISOString(),
    endedEarlyAt: null,
    elapsedAt: null,
    answeredAt: null,
    choice: null,
    intensityAfter: null,
  };
  return { ...session, stage: "wait", intensityDraft: null, episode: { ...session.episode, waitRounds: [...session.episode.waitRounds, round] } };
}

function replaceCurrentWaitRound(session: AddictionSession, patch: Partial<AddictionWaitRound>): AddictionSession {
  const rounds = session.episode.waitRounds;
  if (rounds.length === 0) return session;
  const next = [...rounds];
  next[next.length - 1] = { ...next[next.length - 1], ...patch };
  return { ...session, episode: { ...session.episode, waitRounds: next } };
}

function recordArcRound(session: AddictionSession, arc: AddictionArcState, skipped: boolean, now: string): AddictionSession {
  const round: AddictionArcRound = {
    kind: arc.kind,
    startedAt: arc.startedAt,
    completedAt: now,
    skipped,
    ratingAfter: arc.kind === "efficacy" ? arc.efficacyRating : arc.acceptanceAfter,
    ratingBefore: arc.kind === "acceptance" ? arc.acceptanceBefore : null,
  };
  const reactions = arc.kind === "acceptance" ? Array.from(new Set([...session.episode.acceptanceReactions, ...arc.reactions])) : session.episode.acceptanceReactions;
  return { ...session, arc: null, episode: { ...session.episode, arcRounds: [...session.episode.arcRounds, round], acceptanceReactions: reactions } };
}

function resolveEndOutcome(session: AddictionSession): AddictionEpisodeOutcome {
  if (session.episode.outcome === "acted" || session.episode.behavior !== null) return "acted";
  if (countNotActChoices(session.episode) > 0) return "resisted";
  return "ended_by_user";
}

function toClosing(session: AddictionSession, outcome: AddictionEpisodeOutcome, now: string): AddictionSession {
  return { ...session, stage: "closing", arc: null, stopwatchStartedAt: null, episode: { ...session.episode, outcome, endedAt: session.episode.endedAt ?? now } };
}

function toBehaviorLog(session: AddictionSession): AddictionSession {
  return { ...session, stage: "behavior_log", arc: null, stopwatchStartedAt: null, episode: { ...session.episode, outcome: "acted" } };
}

function sanitizeDuration(minutes: number | null): number | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return null;
  return Math.min(MAX_DURATION_MINUTES, Math.round(minutes));
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export interface AddictionReduceContext {
  now: string;
  /** The live profile – its CURRENT wait target is used for every new wait round. */
  profile: AddictionProfile;
}

export function reduceAddictionSession(session: AddictionSession, event: AddictionSessionEvent, context: AddictionReduceContext): AddictionSession {
  const next = reduceInner(session, event, context);
  return next === session ? session : { ...next, updatedAt: context.now };
}

function reduceInner(session: AddictionSession, event: AddictionSessionEvent, { now, profile }: AddictionReduceContext): AddictionSession {
  const stage = session.stage;
  if (stage === "done") return session;

  switch (event.type) {
    case "START":
    case "SKIP_TO_WAIT": {
      if (stage !== "intro") return session;
      const initialIntensity = isValidAddictionRating(event.initialIntensity) ? event.initialIntensity : null;
      const withIntensity = { ...session, episode: { ...session.episode, initialIntensity } };
      if (event.type === "SKIP_TO_WAIT") return startWaitRound(withIntensity, profile.waitTargetMinutes, now);
      return { ...withIntensity, stage: "efficacy_arc", arc: createAddictionArcState("efficacy", profile, now) };
    }

    case "ARC_UPDATE":
      if ((stage !== "efficacy_arc" && stage !== "acceptance_arc") || !session.arc || event.arc.kind !== session.arc.kind) return session;
      return { ...session, arc: event.arc };

    case "ARC_COMPLETE":
    case "ARC_SKIP": {
      if ((stage !== "efficacy_arc" && stage !== "acceptance_arc") || !session.arc) return session;
      const arc = event.type === "ARC_COMPLETE" && event.arc.kind === session.arc.kind ? event.arc : session.arc;
      const recorded = recordArcRound(session, arc, event.type === "ARC_SKIP", now);
      if (stage === "efficacy_arc") return startWaitRound(recorded, profile.waitTargetMinutes, now);
      return toClosing(recorded, "acted", now);
    }

    case "WAIT_ELAPSED": {
      const round = getActiveWaitRound(session);
      if (!round || !isWaitDue(round, now)) return session;
      return { ...replaceCurrentWaitRound(session, { elapsedAt: round.endsAt }), stage: "decision" };
    }

    case "END_WAIT_EARLY": {
      const round = getActiveWaitRound(session);
      if (!round) return session;
      if (isWaitDue(round, now)) return { ...replaceCurrentWaitRound(session, { elapsedAt: round.endsAt }), stage: "decision" };
      return { ...replaceCurrentWaitRound(session, { endedEarlyAt: now }), stage: "decision" };
    }

    case "ANSWER": {
      if (event.episodeId && event.episodeId !== session.episode.id) return session;
      let current = session;
      // A notification answer can arrive while the app never ticked the timer to its end.
      if (stage === "wait") {
        const elapsed = reduceInner(session, { type: "WAIT_ELAPSED" }, { now, profile });
        if (elapsed.stage !== "decision") return session;
        current = elapsed;
      } else if (stage !== "decision") {
        return session;
      }
      const answered = replaceCurrentWaitRound(current, { answeredAt: now, choice: event.choice });
      if (event.choice === "act") return toBehaviorLog(answered);
      return { ...answered, stage: "intensity", intensityDraft: null };
    }

    case "RATE_INTENSITY": {
      if (stage !== "intensity") return session;
      const intensity = isValidAddictionRating(event.intensity) ? event.intensity : null;
      return { ...replaceCurrentWaitRound(session, { intensityAfter: intensity }), intensityDraft: intensity };
    }

    case "CHOOSE": {
      if (stage !== "intensity") return session;
      const route = resolveIntensityRoute(session.intensityDraft);
      if (!route || !resolveIntensityChoices(route).includes(event.choice)) return session;
      switch (event.choice) {
        case "finish_success":
        case "continue_routine":
        case "end":
          return toClosing(session, "resisted", now);
        case "extra_wait":
          return startWaitRound(session, profile.waitTargetMinutes, now);
        case "extra_arc":
          return { ...session, stage: "efficacy_arc", intensityDraft: null, arc: createAddictionArcState("efficacy", profile, now) };
      }
      return session;
    }

    case "ACTED": {
      if (stage === "intro" || stage === "efficacy_arc" || stage === "decision" || stage === "intensity") {
        const withChoice = stage === "decision" ? replaceCurrentWaitRound(session, { answeredAt: now, choice: "act" }) : session;
        return toBehaviorLog(withChoice);
      }
      if (stage === "wait") {
        const round = getActiveWaitRound(session);
        const patch: Partial<AddictionWaitRound> = round && !isWaitDue(round, now) ? { endedEarlyAt: now } : { elapsedAt: round?.endsAt ?? now };
        return toBehaviorLog(replaceCurrentWaitRound(session, { ...patch, answeredAt: now, choice: "act" }));
      }
      return session;
    }

    case "START_STOPWATCH":
      if (stage !== "behavior_log" || session.mayCauseBodilyHarm || session.stopwatchStartedAt !== null) return session;
      return { ...session, stopwatchStartedAt: now };

    case "STOP_STOPWATCH": {
      if (stage !== "behavior_log" || session.stopwatchStartedAt === null) return session;
      const minutes = Math.max(1, Math.round((Date.parse(now) - Date.parse(session.stopwatchStartedAt)) / 60_000));
      return logBehavior(session, minutes, false, session.stopwatchStartedAt, now, profile);
    }

    case "LOG_BEHAVIOR":
      if (stage !== "behavior_log") return session;
      return logBehavior(session, event.durationMinutes, true, null, now, profile);

    case "MEMORY_SAVED":
      if (stage !== "closing") return session;
      return { ...session, episode: { ...session.episode, savedPositiveMemoryId: event.memoryId } };

    case "END_SESSION": {
      if (stage === "closing") return session;
      if (stage === "acceptance_arc" && session.arc) return toClosing(recordArcRound(session, session.arc, true, now), "acted", now);
      if (stage === "behavior_log") return toClosing(session, "acted", now);
      const round = getActiveWaitRound(session);
      const ended = round ? replaceCurrentWaitRound(session, isWaitDue(round, now) ? { elapsedAt: round.endsAt } : { endedEarlyAt: now }) : session;
      return toClosing(ended, resolveEndOutcome(ended), now);
    }

    case "CLOSE":
      if (stage !== "closing") return session;
      return { ...session, stage: "done" };
  }
}

function logBehavior(
  session: AddictionSession,
  durationMinutes: number | null,
  retrospective: boolean,
  stopwatchStartedAt: string | null,
  now: string,
  profile: AddictionProfile
): AddictionSession {
  const behavior = { durationMinutes: sanitizeDuration(durationMinutes), loggedRetrospectively: retrospective, stopwatchStartedAt, loggedAt: now };
  return {
    ...session,
    stage: "acceptance_arc",
    stopwatchStartedAt: null,
    arc: createAddictionArcState("acceptance", profile, now),
    episode: { ...session.episode, outcome: "acted", behavior },
  };
}

// ---------------------------------------------------------------------------
// Reconcile, staleness, soft limits
// ---------------------------------------------------------------------------

/** Hours of inactivity after which an unfinished session is closed as-is (never as a failure). */
export const ADDICTION_SESSION_STALE_HOURS = 12;

export function isAddictionSessionStale(session: AddictionSession, now: string): boolean {
  if (session.stage === "done") return true;
  const last = Date.parse(session.updatedAt);
  const round = getActiveWaitRound(session);
  const reference = round ? Math.max(last, Date.parse(round.endsAt)) : last;
  return Date.parse(now) - reference > ADDICTION_SESSION_STALE_HOURS * 3_600_000;
}

/** Closes a stale session, keeping everything the user did; outcome "acted" / "resisted" if known, otherwise "abandoned". */
export function closeStaleAddictionSession(session: AddictionSession, now: string): AddictionSession {
  const base = session.arc ? recordArcRound(session, session.arc, true, now) : session;
  const known = resolveEndOutcome(base);
  const outcome: AddictionEpisodeOutcome = known === "ended_by_user" ? "abandoned" : known;
  return { ...base, stage: "done", stopwatchStartedAt: null, episode: { ...base.episode, outcome: base.episode.outcome === "acted" ? "acted" : outcome, endedAt: base.episode.endedAt ?? now }, updatedAt: now };
}

/** Run on app open / focus: advances a wait that ended while the app was closed. */
export function reconcileAddictionSession(session: AddictionSession, profile: AddictionProfile, now: string): AddictionSession {
  return reduceAddictionSession(session, { type: "WAIT_ELAPSED" }, { now, profile });
}

/** After this many waiting rounds in one episode a gentle "you can also stop here" note is shown – the practice must not become another compulsion. */
export const GENTLE_STOP_HINT_AFTER_ROUNDS = 3;

export function shouldShowGentleStopHint(session: AddictionSession): boolean {
  return session.episode.waitRounds.length >= GENTLE_STOP_HINT_AFTER_ROUNDS;
}

export function normalizeAddictionSession(raw: unknown): AddictionSession | null {
  const value = raw as Partial<AddictionSession> | null;
  if (!value || typeof value !== "object" || value.version !== 1 || !value.episode || typeof value.stage !== "string") return null;
  const stages: AddictionSessionStage[] = ["intro", "efficacy_arc", "wait", "decision", "intensity", "behavior_log", "acceptance_arc", "closing", "done"];
  if (!stages.includes(value.stage)) return null;
  return {
    version: 1,
    episode: normalizeAddictionEpisode(value.episode),
    profileName: typeof value.profileName === "string" ? value.profileName : "",
    mayCauseBodilyHarm: value.mayCauseBodilyHarm === true,
    stage: value.stage,
    arc: value.arc ?? null,
    intensityDraft: isValidAddictionRating(value.intensityDraft) ? value.intensityDraft : null,
    // Never trust a stopwatch on a harmful behavior.
    stopwatchStartedAt: value.mayCauseBodilyHarm === true ? null : typeof value.stopwatchStartedAt === "string" ? value.stopwatchStartedAt : null,
    returnToTaskId: typeof value.returnToTaskId === "string" ? value.returnToTaskId : null,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
  };
}
