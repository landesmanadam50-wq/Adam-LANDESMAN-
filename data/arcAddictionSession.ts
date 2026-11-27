/**
 * data/arcAddictionSession.ts
 *
 * The ONE place an ARC Addiction session changes. The screen, the OS
 * notification handler and app-open reconcile all go through
 * dispatchAddictionEvent, which:
 *
 *   1. serializes every change (in-memory queue) – a notification press
 *      racing an in-app tap can never interleave read-modify-write;
 *   2. loads the single-slot session (closing it first if stale);
 *   3. reduces the event with the pure state machine;
 *   4. commits (history + exactly-once progression at closing);
 *   5. syncs side effects from the resulting state – the end-of-wait
 *      alarm, the ongoing countdown notification and the floating
 *      overlay's second line are all DERIVED from the session, so they
 *      can never drift from it or be duplicated;
 *   6. notifies subscribed screens.
 */

import type { Event } from "@notifee/react-native";
import { EventType } from "@notifee/react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AddictionProfile } from "../arc/arcAddiction.ts";
import { createAddictionProfile, generateAddictionEpisodeId } from "../arc/arcAddiction.ts";
import type { AddictionSession, AddictionSessionEvent } from "../arc/arcAddictionFlow.ts";
import { createAddictionSession, getCurrentWaitRound, reconcileAddictionSession, reduceAddictionSession } from "../arc/arcAddictionFlow.ts";
import { ARC_ADDICTION_WAIT_END_KIND, isArcAddictionNotificationKind, resolveAddictionNotificationAction, resolveAddictionNotificationPlan } from "../arc/arcAddictionWaitPlan.ts";
import { commitAddictionSession, getAddictionProfile, loadActiveAddictionSessionOrCloseStale } from "./arcAddictionStorage.ts";
import { applyArcAddictionNotificationPlan, cancelArcAddictionOngoingNotification } from "./arcAddictionWaitNotification.ts";

export const ARC_ADDICTION_SESSION_ROUTE = "/arc-addiction/session";
const PENDING_OPEN_KEY = "archi.arcAddictionPendingOpen.v1";

// ---------------------------------------------------------------------------
// Serialization + subscribers
// ---------------------------------------------------------------------------

let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.catch(() => undefined);
  return run;
}

type Listener = (session: AddictionSession | null) => void;
const listeners = new Set<Listener>();

/** Screens subscribe so a change made by a notification press while the app is open re-renders immediately. */
export function subscribeAddictionSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(session: AddictionSession | null): void {
  for (const listener of listeners) {
    try {
      listener(session);
    } catch (error) {
      console.warn("[arcAddictionSession] listener failed", error);
    }
  }
}

/** Extra side-effect hooks (e.g. the floating overlay's second line, wired in data/floatingTimerOverlay.ts). */
type SideEffect = (session: AddictionSession | null) => Promise<void> | void;
const sideEffects: SideEffect[] = [];

export function registerAddictionSideEffect(effect: SideEffect): void {
  if (!sideEffects.includes(effect)) sideEffects.push(effect);
}

export async function syncAddictionSideEffects(session: AddictionSession | null): Promise<void> {
  await applyArcAddictionNotificationPlan(resolveAddictionNotificationPlan(session, Date.now()));
  for (const effect of sideEffects) {
    try {
      await effect(session);
    } catch (error) {
      console.warn("[arcAddictionSession] side effect failed", error);
    }
  }
}

// ---------------------------------------------------------------------------
// Profile resolution
// ---------------------------------------------------------------------------

/** If the profile was deleted mid-session, a stand-in built from the session's own snapshot keeps the session usable. */
async function resolveProfileForSession(session: AddictionSession): Promise<AddictionProfile> {
  const profile = await getAddictionProfile(session.episode.profileId);
  if (profile) return profile;
  const target = getCurrentWaitRound(session)?.targetMinutes ?? session.episode.waitTargetBefore;
  return {
    ...createAddictionProfile(session.episode.profileId, { name: session.profileName, mayCauseBodilyHarm: session.mayCauseBodilyHarm, initialWaitMinutes: target }, session.episode.startedAt),
    id: session.episode.profileId,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function loadCurrentAddictionSession(): Promise<AddictionSession | null> {
  return serialize(async () => {
    const nowIso = new Date().toISOString();
    const session = await loadActiveAddictionSessionOrCloseStale(nowIso);
    if (!session) {
      await syncAddictionSideEffects(null);
      return null;
    }
    const profile = await resolveProfileForSession(session);
    const reconciled = reconcileAddictionSession(session, profile, nowIso);
    const stored = reconciled === session ? session : await commitAddictionSession(reconciled, nowIso);
    await syncAddictionSideEffects(stored);
    if (stored !== session) emit(stored);
    return stored;
  });
}

export type StartAddictionSessionResult = { status: "started"; session: AddictionSession } | { status: "conflict"; session: AddictionSession } | { status: "missing_profile" };

/**
 * Starts a new session for a profile. If ANY session is already active
 * (same or another profile) nothing is created and the existing one is
 * returned as a conflict – unless `replaceExisting`, in which case the
 * existing one is first ended (keeping everything it recorded).
 */
export async function startAddictionSession(profileId: string, returnToTaskId: string | null, options: { replaceExisting?: boolean } = {}): Promise<StartAddictionSessionResult> {
  return serialize(async () => {
    const nowIso = new Date().toISOString();
    const profile = await getAddictionProfile(profileId);
    if (!profile) return { status: "missing_profile" } as const;
    const existing = await loadActiveAddictionSessionOrCloseStale(nowIso);
    if (existing) {
      if (!options.replaceExisting) return { status: "conflict", session: existing } as const;
      const existingProfile = await resolveProfileForSession(existing);
      const ended = reduceAddictionSession(existing, { type: "END_SESSION" }, { now: nowIso, profile: existingProfile });
      const closed = reduceAddictionSession(ended, { type: "CLOSE" }, { now: nowIso, profile: existingProfile });
      await commitAddictionSession(closed, nowIso);
    }
    const session = await commitAddictionSession(createAddictionSession(generateAddictionEpisodeId(), profile, returnToTaskId, nowIso), nowIso);
    await syncAddictionSideEffects(session);
    emit(session);
    return { status: "started", session } as const;
  });
}

/** Applies one event to the active session. Returns the stored session (null when there is none / it just finished). */
export async function dispatchAddictionEvent(event: AddictionSessionEvent): Promise<AddictionSession | null> {
  return serialize(async () => {
    const nowIso = new Date().toISOString();
    const session = await loadActiveAddictionSessionOrCloseStale(nowIso);
    if (!session) {
      await syncAddictionSideEffects(null);
      emit(null);
      return null;
    }
    const profile = await resolveProfileForSession(session);
    // A wait that ended while nothing was running is advanced first, so the event applies to the real current step.
    const next = reduceAddictionSession(reconcileAddictionSession(session, profile, nowIso), event, { now: nowIso, profile });
    if (next === session) {
      await syncAddictionSideEffects(session);
      return session;
    }
    const stored = await commitAddictionSession(next, nowIso);
    const visible = stored.stage === "done" ? null : stored;
    await syncAddictionSideEffects(visible);
    emit(visible);
    return visible;
  });
}

// ---------------------------------------------------------------------------
// Notification routing (called from data/taskAlarm.ts's shared handleTaskAlarmEvent)
// ---------------------------------------------------------------------------

async function markPendingOpen(): Promise<void> {
  await AsyncStorage.setItem(PENDING_OPEN_KEY, "1");
}

/** Consumed by app/_layout.tsx on cold start / return to foreground: if a notification press asked to open the session, navigate there once. */
export async function consumeArcAddictionPendingOpen(): Promise<boolean> {
  const value = await AsyncStorage.getItem(PENDING_OPEN_KEY);
  if (value !== "1") return false;
  await AsyncStorage.removeItem(PENDING_OPEN_KEY);
  return true;
}

function openSessionScreen(): void {
  try {
    router.replace(ARC_ADDICTION_SESSION_ROUTE);
  } catch (error) {
    // Cold start: the navigator may not be mounted yet – app/_layout.tsx's pending-open check covers it.
    console.warn("[arcAddictionSession] navigation deferred to app open", error);
  }
}

export function isArcAddictionNotificationEvent(event: Event): boolean {
  return isArcAddictionNotificationKind(event.detail.notification?.data?.kind);
}

export async function handleArcAddictionNotificationEvent(event: Event): Promise<void> {
  const data = event.detail.notification?.data;
  const episodeId = typeof data?.episodeId === "string" ? data.episodeId : undefined;

  if (event.type === EventType.DELIVERED) {
    // The end-of-wait alarm fired: retire the countdown and advance the stored session to the decision.
    if (data?.kind === ARC_ADDICTION_WAIT_END_KIND) {
      await cancelArcAddictionOngoingNotification();
      await loadCurrentAddictionSession();
    }
    return;
  }

  if (event.type === EventType.ACTION_PRESS) {
    const mapped = resolveAddictionNotificationAction(event.detail.pressAction?.id);
    if (mapped) {
      // Record the answer BEFORE navigating, so even if navigation is lost on a cold start the app opens on the right step.
      await dispatchAddictionEvent(mapped.type === "ANSWER" ? { ...mapped, episodeId } : mapped);
    }
    await markPendingOpen();
    openSessionScreen();
    return;
  }

  if (event.type === EventType.PRESS) {
    await markPendingOpen();
    openSessionScreen();
  }
}
