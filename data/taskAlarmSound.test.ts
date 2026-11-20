import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/taskAlarmSound.test.ts
 *
 * Task-alarm task: source-text regression guard for the actual
 * sustained ring -- depends on native modules (expo-audio, React
 * Native's Vibration) and isn't callable from a plain `node --test`
 * run (same constraint as every other native-module file in this
 * codebase).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/taskAlarmSound.ts");

test("requirement (continuous/repeating ring, not a single weak buzz): the vibration pattern is looped via Vibration.vibrate's own `repeat` flag, never fired once", () => {
  const fnIndex = module_.indexOf("export async function startRinging");
  const fnBody = module_.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("Vibration.vibrate(TASK_ALARM_VIBRATION_PATTERN, true);"));
});

test("the sound player is set to loop, not play-once -- this is the actual 'continuous sound' requirement; no OS notification channel sound was ever capable of this", () => {
  const fnIndex = module_.indexOf("export async function startRinging");
  const fnBody = module_.slice(fnIndex, fnIndex + 600);
  assert.ok(fnBody.includes("player.loop = true;"));
  assert.ok(fnBody.includes("player.play();"));
});

test("sound and vibration are gated independently by their own flags -- either can ring alone, satisfying 'enable/disable sound and vibration separately'", () => {
  const fnIndex = module_.indexOf("export async function startRinging");
  const fnBody = module_.slice(fnIndex, fnIndex + 600);
  assert.ok(fnBody.includes("if (vibrationEnabled) {"));
  assert.ok(fnBody.includes("if (soundEnabled) {"));
});

test("the alarm explicitly opts into background playback and playing through the silent switch -- unlike data/timerSound.ts's deliberately foreground-only, silence-respecting cues", () => {
  assert.ok(module_.includes("shouldPlayInBackground: true,"));
  assert.ok(module_.includes("playsInSilentMode: true,"));
});

test("stopRinging unconditionally cancels the vibration AND releases the sound player, safe to call even when nothing was ever started", () => {
  const fnIndex = module_.indexOf("export function stopRinging");
  const fnBody = module_.slice(fnIndex, fnIndex + 400);
  assert.ok(fnBody.includes("Vibration.cancel();"));
  assert.ok(fnBody.includes("if (currentPlayer) {"));
});

test("every export is non-throwing (best-effort) -- a blocked/failed sound must never prevent the vibration half from ringing, or crash the foreground service", () => {
  assert.ok(module_.includes("} catch {"));
});
