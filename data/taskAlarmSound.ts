/**
 * data/taskAlarmSound.ts
 *
 * Task-alarm task ("הפיכת התראות המשימות לשעון מעורר אמיתי"): the
 * actual SUSTAINED ring -- a looped sound (expo-audio) and a repeating
 * felt vibration pattern (React Native's own Vibration API, which
 * takes a `repeat` flag for exactly this). This is deliberately
 * separate from any OS notification channel's own sound/vibration
 * (which only ever plays ONCE per notification post, the same Android
 * limitation the previous, now-superseded vibration feature ran into
 * -- see data/notifications.ts's module doc). The sustained ring here
 * is started/stopped entirely by this module, driven by
 * data/taskAlarm.ts's foreground-service handler, and never relies on
 * the OS replaying anything on its own.
 *
 * soundEnabled/vibrationEnabled are independent (requirement: "להפעיל
 * או לכבות צליל ורטט בנפרד") -- either can ring alone.
 *
 * Like data/timerSound.ts and data/notifications.ts, this depends on
 * native modules and isn't unit-tested with node --test. Every export
 * here is non-throwing: a blocked/failed sound must never prevent the
 * vibration half (or vice versa) from ringing, and must never crash
 * the foreground service that's keeping the alarm alive.
 */

import { Vibration } from "react-native";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import type { AudioPlayer } from "expo-audio";

const TASK_ALARM_SOUND = require("../assets/sounds/timer_complete.wav");

/**
 * Three clear, felt pulses (same pattern the previous vibration
 * feature used for its one-shot channel buzz), now looped continuously
 * via Vibration.vibrate's own `repeat` argument instead of firing once.
 */
const TASK_ALARM_VIBRATION_PATTERN = [0, 350, 150, 350, 150, 350];

let currentPlayer: AudioPlayer | null = null;

/**
 * Unlike data/timerSound.ts's foreground-only cues (shouldPlayInBackground: false),
 * the alarm must keep sounding while the app is backgrounded or the
 * screen is locked -- that's the entire point of this feature -- so
 * this explicitly opts into background playback and playing through
 * the device's silent switch (iOS), matching the task's own "let it
 * ring through Do Not Disturb" decision for the alarm specifically.
 */
async function ensureAlarmAudioModeConfigured(): Promise<void> {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
      shouldPlayInBackground: true,
    });
  } catch {
    // Best-effort; playback below still attempts to proceed even if the mode couldn't be set.
  }
}

/**
 * Starts the sustained ring. Idempotent-ish in intent (callers --
 * data/taskAlarm.ts's foreground-service handler -- only ever call
 * this once per armed alarm), but safe to call again: stopRinging()
 * always runs first in practice before any re-arm.
 */
export async function startRinging(soundEnabled: boolean, vibrationEnabled: boolean): Promise<void> {
  if (vibrationEnabled) {
    Vibration.vibrate(TASK_ALARM_VIBRATION_PATTERN, true);
  }
  if (soundEnabled) {
    try {
      await ensureAlarmAudioModeConfigured();
      const player = createAudioPlayer(TASK_ALARM_SOUND);
      player.loop = true;
      player.play();
      currentPlayer = player;
    } catch {
      // A blocked/failed sound must never stop the vibration half above.
    }
  }
}

/**
 * Stops both halves of the ring unconditionally -- safe to call even
 * when one or both were never started (e.g. both preferences were
 * off), and safe to call more than once (e.g. the 2-minute timeout
 * firing a moment after the trainee already pressed "כבה").
 */
export function stopRinging(): void {
  Vibration.cancel();
  if (currentPlayer) {
    try {
      currentPlayer.pause();
      currentPlayer.remove();
    } catch {
      // Already released or failed -- nothing left to clean up.
    }
    currentPlayer = null;
  }
}
