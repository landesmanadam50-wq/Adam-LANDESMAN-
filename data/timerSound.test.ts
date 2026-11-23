import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/timerSound.test.ts
 *
 * ARCHI -- To-Do Bank + Duration/Split Selection + Home/Entry "Cubes"
 * task, section 4: source-text regression guard for the new
 * playBreakStartSound (data/timerSound.ts depends on a native module
 * and isn't actually invoked under node --test, same as the module's
 * own pre-existing convention for playTimerCompletionSound/
 * playContinueAvailableCue) plus the mute-setting wiring into
 * build/SettingsScreen.tsx.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/timerSound.ts");
const settingsScreen = readSource("build/SettingsScreen.tsx");

test("required: playBreakStartSound reuses a DIFFERENT sound asset/volume than playTimerCompletionSound -- the two must never be confused", () => {
  const fnIndex = module_.indexOf("export async function playBreakStartSound(");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("playOneShotSound(CONTINUE_AVAILABLE_SOUND, 0.35)"));
  assert.ok(!fnBody.includes("TIMER_COMPLETION_SOUND"));
});

test("required: playBreakStartSound never plays when the mute preference is false, and the caller is responsible for passing it", () => {
  const fnIndex = module_.indexOf("export async function playBreakStartSound(");
  const fnBody = module_.slice(fnIndex, module_.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("if (!enabled) return;"));
});

test("existing playTimerCompletionSound/playContinueAvailableCue keep their exact, parameterless signatures -- untouched by the new mute setting", () => {
  assert.ok(module_.includes("export async function playTimerCompletionSound(): Promise<void> {"));
  assert.ok(module_.includes("export async function playContinueAvailableCue(): Promise<void> {"));
});

test("required: SettingsScreen offers a mute toggle for the break-start sound, persisted via loadBreakSoundEnabled/saveBreakSoundEnabled", () => {
  assert.ok(settingsScreen.includes("loadBreakSoundEnabled"));
  assert.ok(settingsScreen.includes("saveBreakSoundEnabled(value)"));
  assert.ok(settingsScreen.includes("צליל עדין בתחילת הפסקה"));
});
