/**
 * data/timerSound.ts
 *
 * The one short, neutral completion sound shared by all three of
 * ARCHI's real timed activities (Beneficial Action, Success Focus /
 * Success Coding, Negative Action) when a timer reaches zero while the
 * app is foregrounded -- see arc/actionTimer.ts and live/screens.tsx.
 * Deliberately its own tiny module, architecturally separate from any
 * future background music, meditation audio, instruction voice/TTS, or
 * ambient audio: this file only ever plays assets/sounds/timer_complete.wav,
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
import type { AudioPlayer, AudioStatus } from "expo-audio";

const TIMER_COMPLETION_SOUND = require("../assets/sounds/timer_complete.wav");

/**
 * expo-audio's own AudioPlayer type (expo-audio/build/AudioModule.types.d.ts)
 * declares addListener/removeListener only by `extends SharedObject<AudioEvents>`,
 * and SharedObject is imported there from the bare specifier
 * 'expo-modules-core'. In this project's installed dependency tree that
 * package is only present nested under expo's own node_modules (not
 * hoisted to the top level), so TypeScript can't resolve it from
 * expo-audio's .d.ts files -- the extends clause silently collapses, and
 * every member AudioPlayer would otherwise inherit (addListener included)
 * drops out of its type. This is a local type-resolution gap, not an
 * outdated API: player.addListener('playbackStatusUpdate', ...) is still
 * the officially documented, unchanged way to subscribe to playback
 * status (see AudioModule.types.d.ts's own AudioEvents doc comment,
 * and AudioStatus.didJustFinish -- both unchanged in this SDK 57
 * version). PlayableAudioPlayer restates just that one already-real,
 * runtime-unchanged method so this file can call it type-safely without
 * depending on the broken inherited type.
 */
type PlayableAudioPlayer = AudioPlayer & {
  addListener(eventName: "playbackStatusUpdate", listener: (status: AudioStatus) => void): { remove(): void };
};

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
    const player = createAudioPlayer(TIMER_COMPLETION_SOUND) as PlayableAudioPlayer;
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
