/**
 * data/arcAddictionStorage.ts
 *
 * AsyncStorage persistence for ARC Addiction. Kept in its own module
 * (not appended to data/storage.ts) so this route stays isolated from
 * every other feature's storage code. Same conventions as
 * data/storage.ts: `archi.<name>.v1` keys, defensive JSON parse that
 * never crashes, normalization on every load.
 *
 *   archi.arcAddictionProfiles.v1      – AddictionProfile[]
 *   archi.arcAddictionEpisodes.v1      – AddictionEpisode[] (history)
 *   archi.arcAddictionActiveSession.v1 – the ONE active AddictionSession
 *                                        (single slot => no duplicate
 *                                        sessions, survives app restarts)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AddictionEpisode, AddictionProfile } from "../arc/arcAddiction.ts";
import {
  deleteAddictionProfileFromList,
  normalizeAddictionEpisode,
  normalizeAddictionProfile,
  pruneAddictionEpisodes,
  upsertAddictionEpisodeInList,
  upsertAddictionProfileInList,
} from "../arc/arcAddiction.ts";
import type { AddictionSession } from "../arc/arcAddictionFlow.ts";
import { closeStaleAddictionSession, isAddictionSessionStale, normalizeAddictionSession } from "../arc/arcAddictionFlow.ts";
import { applyEpisodeToProfile } from "../arc/arcAddictionProgression.ts";

export const ARC_ADDICTION_PROFILES_KEY = "archi.arcAddictionProfiles.v1";
export const ARC_ADDICTION_EPISODES_KEY = "archi.arcAddictionEpisodes.v1";
export const ARC_ADDICTION_ACTIVE_SESSION_KEY = "archi.arcAddictionActiveSession.v1";

async function readJson(key: string): Promise<unknown> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`[arcAddictionStorage] ${key} is not valid JSON -- ignoring it rather than crashing.`, error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export async function loadAddictionProfiles(): Promise<AddictionProfile[]> {
  const parsed = await readJson(ARC_ADDICTION_PROFILES_KEY);
  return Array.isArray(parsed) ? parsed.map((entry) => normalizeAddictionProfile(entry as AddictionProfile)) : [];
}

async function saveAddictionProfiles(profiles: AddictionProfile[]): Promise<void> {
  await AsyncStorage.setItem(ARC_ADDICTION_PROFILES_KEY, JSON.stringify(profiles));
}

export async function getAddictionProfile(id: string): Promise<AddictionProfile | null> {
  const profiles = await loadAddictionProfiles();
  return profiles.find((profile) => profile.id === id) ?? null;
}

export async function upsertAddictionProfile(profile: AddictionProfile): Promise<void> {
  const profiles = await loadAddictionProfiles();
  await saveAddictionProfiles(upsertAddictionProfileInList(profiles, profile));
}

/** Deleting a profile keeps its history episodes (they simply stop being shown) – nothing the user documented is silently destroyed. */
export async function deleteAddictionProfile(id: string): Promise<void> {
  const profiles = await loadAddictionProfiles();
  await saveAddictionProfiles(deleteAddictionProfileFromList(profiles, id));
}

// ---------------------------------------------------------------------------
// Episodes (history)
// ---------------------------------------------------------------------------

export async function loadAddictionEpisodes(): Promise<AddictionEpisode[]> {
  const parsed = await readJson(ARC_ADDICTION_EPISODES_KEY);
  return Array.isArray(parsed) ? parsed.map((entry) => normalizeAddictionEpisode(entry as AddictionEpisode)) : [];
}

export async function loadAddictionEpisodesForProfile(profileId: string): Promise<AddictionEpisode[]> {
  const episodes = await loadAddictionEpisodes();
  return episodes.filter((episode) => episode.profileId === profileId);
}

export async function upsertAddictionEpisode(episode: AddictionEpisode): Promise<void> {
  const episodes = await loadAddictionEpisodes();
  await AsyncStorage.setItem(ARC_ADDICTION_EPISODES_KEY, JSON.stringify(pruneAddictionEpisodes(upsertAddictionEpisodeInList(episodes, episode))));
}

// ---------------------------------------------------------------------------
// Active session (single slot)
// ---------------------------------------------------------------------------

export async function loadActiveAddictionSession(): Promise<AddictionSession | null> {
  return normalizeAddictionSession(await readJson(ARC_ADDICTION_ACTIVE_SESSION_KEY));
}

export async function clearActiveAddictionSession(): Promise<void> {
  await AsyncStorage.removeItem(ARC_ADDICTION_ACTIVE_SESSION_KEY);
}

/**
 * Persists a session after every transition:
 *   - stages before "closing": saved to the single slot only;
 *   - "closing": the episode is written to history and progression is
 *     applied to the profile EXACTLY ONCE (progressionAppliedAt guard);
 *   - "done": history updated, slot cleared.
 * Returns the session as stored (with progression fields filled in).
 */
export async function commitAddictionSession(session: AddictionSession, now: string): Promise<AddictionSession> {
  let stored = session;
  if (session.stage === "closing" || session.stage === "done") {
    if (session.episode.progressionAppliedAt === null) {
      const profile = await getAddictionProfile(session.episode.profileId);
      if (profile) {
        const result = applyEpisodeToProfile(profile, session.episode, now);
        if (result.profile !== profile) await upsertAddictionProfile(result.profile);
        stored = { ...session, episode: result.episode };
      } else {
        stored = { ...session, episode: { ...session.episode, progressionAppliedAt: now } };
      }
    }
    await upsertAddictionEpisode(stored.episode);
  }
  if (stored.stage === "done") await clearActiveAddictionSession();
  else await AsyncStorage.setItem(ARC_ADDICTION_ACTIVE_SESSION_KEY, JSON.stringify(stored));
  return stored;
}

/**
 * Loads the active session, closing it first if it is stale (e.g. left
 * open overnight) – a stale session is finalized with everything the
 * user did, never as a failure, and the slot is freed.
 */
export async function loadActiveAddictionSessionOrCloseStale(now: string): Promise<AddictionSession | null> {
  const session = await loadActiveAddictionSession();
  if (!session) return null;
  if (!isAddictionSessionStale(session, now)) return session;
  await commitAddictionSession(closeStaleAddictionSession(session, now), now);
  return null;
}
