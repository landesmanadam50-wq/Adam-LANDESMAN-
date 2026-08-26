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
import type { ArcProfile } from "../engine/types.ts";
import type { SessionLogEntry } from "./sessionLog.ts";

const PROFILE_KEY = "archi.profile.v1";
const SESSION_LOG_KEY = "archi.sessionLog.v1";
const PILOT_STARTED_AT_KEY = "archi.pilotStartedAt.v1";

export async function loadProfile(): Promise<ArcProfile | null> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  return raw ? (JSON.parse(raw) as ArcProfile) : null;
}

export async function saveProfile(profile: ArcProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
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
 * The trainee's pilot clock starts the first time this is called (normally
 * right after BUILD saves their profile) and never moves after that --
 * editing the profile later doesn't reset it. Idempotent, so it's also
 * safe to call defensively wherever pilot progress is displayed.
 */
export async function getOrCreatePilotStartedAt(): Promise<string> {
  const existing = await AsyncStorage.getItem(PILOT_STARTED_AT_KEY);
  if (existing) return existing;
  const now = new Date().toISOString();
  await AsyncStorage.setItem(PILOT_STARTED_AT_KEY, now);
  return now;
}
