/**
 * data/timerSound.ts
 *
 * ARCHI's two short, distinct audio cues, both played only while the
 * app is foregrounded -- see arc/actionTimer.ts and live/screens.tsx:
 *
 *   - playTimerCompletionSound: the CLEAR completion bell for all
 *     three of ARCHI's real timed activities (Beneficial Action,
 *     Success Focus / Success Coding, Negative Action) when a timer
 *     reaches zero. Noticeable -- it's telling the trainee a timed
 *     real-world activity has actually ended.
 *   - playContinueAvailableCue: the SUBTLE "you may continue whenever
 *     you're ready" cue for experiential LIVE protocol stages, fired
 *     once Continue becomes available -- see live/screens.tsx's
 *     TimedInstructionBody. Deliberately a different sound file at
 *     lower volume, so the two are never confused: the trainee should
 *     be able to tell, without looking, which one just played.
 *
 * Deliberately its own tiny module, architecturally separate from any
 * future background music, meditation audio, instruction voice/TTS, or
 * ambient audio: this file only ever plays these two short local
 * assets, nothing else. No haptics/vibration dependency was added for
 * the Continue-available cue -- this project has no such native module
 * installed, and the task this cue was built for explicitly calls for
 * reusing the existing audio infrastructure instead of adding one.
 *
 * mixWithOthers + shouldPlayInBackground: false is deliberate -- both
 * sounds are foreground-only signals. The background/locked-phone case
 * is covered entirely by data/notifications.ts's scheduled local
 * notifications instead (each with its own, separately-configured
 * sound), never by this module trying to keep JavaScript audio running
 * while suspended -- see this feature's "do not rely on JS continuing
 * to run in the background" requirement.
 *
 * Like data/storage.ts and data/notifications.ts, this depends on a
 * native module and isn't unit-tested with node --test. Every export
 * here is non-throwing: a blocked/failed sound must never be treated
 * as a failure of the timer/progression itself.
 */

import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import type { AudioPlayer, AudioStatus } from "expo-audio";

const TIMER_COMPLETION_SOUND = require("../assets/sounds/timer_complete.wav");
const CONTINUE_AVAILABLE_SOUND = require("../assets/sounds/continue_available.wav");

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
 * Plays a short one-shot local sound exactly once and releases the
 * player afterward, at the given volume. Fire-and-forget from the
 * caller's perspective (this resolves once playback has STARTED, not
 * finished) -- callers that need "the sound is done" don't exist
 * today; the timer/progression's own completed state is set
 * independently of whether this resolves.
 *
 * Root-cause fix for "the timer sometimes completed without an
 * audible signal": createAudioPlayer() returns a player synchronously,
 * but the native source load it kicks off is asynchronous -- calling
 * .play() immediately, before the player has actually finished
 * loading, can silently no-op on some timing/platform combinations
 * (most likely right after the JS thread resumes from being
 * backgrounded, exactly when a timer is most likely to complete).
 * Never call .play() until player.isLoaded is confirmed true: checked
 * synchronously first (covers the common case of a small, already-
 * bundled local asset loading near-instantly), and via the
 * playbackStatusUpdate listener otherwise (covers the rare slower-load
 * case) -- whichever fires first, guarded by `started` so it can only
 * ever play once.
 */
async function playOneShotSound(source: number, volume: number): Promise<void> {
  await ensureAudioModeConfigured();
  const player = createAudioPlayer(source) as PlayableAudioPlayer;
  player.volume = volume;
  let started = false;
  const subscription = player.addListener("playbackStatusUpdate", (status) => {
    if (!started && status.isLoaded) {
      started = true;
      player.play();
    }
    if (status.didJustFinish) {
      subscription.remove();
      player.remove();
    }
  });
  if (!started && player.isLoaded) {
    started = true;
    player.play();
  }
}

/**
 * The clear timer-completion bell -- shared, unchanged trigger point
 * (arc/actionTimer.ts's completion + live/screens.tsx's useTimerRun)
 * for all three real timed activities. Full volume: this must be
 * noticeably clearer than playContinueAvailableCue below.
 */
export async function playTimerCompletionSound(): Promise<void> {
  try {
    await playOneShotSound(TIMER_COMPLETION_SOUND, 1.0);
  } catch {
    // Best-effort -- a blocked/unavailable sound is never a timer failure.
  }
}

/**
 * The subtle "Continue is available" cue -- a distinct sound file at
 * reduced volume, so it can never be mistaken for the completion bell
 * above. See live/screens.tsx's TimedInstructionBody for the one place
 * this fires (exactly once, the instant Continue becomes enabled).
 */
export async function playContinueAvailableCue(): Promise<void> {
  try {
    await playOneShotSound(CONTINUE_AVAILABLE_SOUND, 0.5);
  } catch {
    // Best-effort -- a missed cue is never a progression failure; Continue is still enabled regardless.
  }
}
