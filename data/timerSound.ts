/**
 * data/timerSound.ts
 *
 * The one short, neutral completion sound shared by all three of
 * ARCHI's real timed activities (Beneficial Action, Success Focus /
 * Success Coding, Negative Action) when a timer reaches zero while the
 * app is foregrounded -- see arc/actionTimer.ts and live/screens.tsx.
 * Deliberately its own tiny module, architecturally separate from any
 * future background music, meditation audio, instruction voice/TTS, or
 * ambient audio: this file only ever plays assets/sounds/timer-complete.wav,
 * a single short chime, and nothing else.
 *
 * mixWithOthers + shouldPlayInBackground: false is deliberate -- this
 * sound is a foreground-only signal. The background/locked-phone case
 * is covered entirely by data/notifications.ts's scheduled local
 * notification instead (with its own, separately-configured sound),
 * never by this module trying to keep JavaScript audio running while
 * suspended -- see this feature's "do not rely on JS continuing to run
 * in the background" requirement.
 *
 * Like data/storage.ts and data/notifications.ts, this depends on a
 * native module and isn't unit-tested with node --test. Every export
 * here is non-throwing: a blocked/failed sound must never be treated
 * as a failure of the timer itself.
 */

import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

const TIMER_COMPLETION_SOUND = require("../assets/sounds/timer-complete.wav");

let audioModeConfigured = false;

async function ensureAudioModeConfigured(): Promise<void> {
  if (audioModeConfigured) return;
  audioModeConfigured = true;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
      shouldPlayInBackground: false,
    });
  } catch {
    // Best-effort -- playback below still attempts to proceed even if the mode couldn't be set.
  }
}

/**
 * Plays the short completion chime once and releases the player
 * afterward. Fire-and-forget from the caller's perspective (awaiting
 * it only waits for playback to START, not finish) -- callers that
 * need "the sound is done" don't exist today; the timer's own
 * completed state is set independently of whether this resolves.
 */
export async function playTimerCompletionSound(): Promise<void> {
  try {
    await ensureAudioModeConfigured();
    const player = createAudioPlayer(TIMER_COMPLETION_SOUND);
    const subscription = player.addListener("playbackStatusUpdate", (status) => {
      if (status.didJustFinish) {
        subscription.remove();
        player.remove();
      }
    });
    player.play();
  } catch {
    // Best-effort -- a blocked/unavailable sound is never a timer failure.
  }
}
