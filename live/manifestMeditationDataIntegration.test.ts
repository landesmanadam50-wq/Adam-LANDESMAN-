import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/manifestMeditationDataIntegration.test.ts
 *
 * Productivity roadmap, Stage AA: source-text regression guard for
 * connecting Manifest Meditation to saved values/identities/habits/
 * personal statements/today's action, and for "the final chosen
 * action may become a task with user confirmation." The pure
 * suggestion logic is covered separately in
 * arc/manifestMeditationDataSources.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/ManifestMeditationScreen.tsx");

test("every suggestion is appended to the existing text, never overwriting what the trainee already typed", () => {
  const matches = screen.match(/setValuesText\(appendLine\(valuesText,|setIdentitiesText\(appendLine\(identitiesText,|setGoalsText\(appendLine\(goalsText,|setSentencesText\(appendLine\(sentencesText,/g) ?? [];
  assert.equal(matches.length, 4, "all 4 free-text fields with a saved-data source must append, never replace");
});

test("the suggestions are read from real saved records (IdentityProfile, recurring Tasks) via the pure arc/manifestMeditationDataSources.ts functions, never invented", () => {
  assert.match(screen, /import\s*\{[\s\S]*?suggestValuesFromIdentityProfiles[\s\S]*?\}\s*from\s*["']\.\.\/arc\/manifestMeditationDataSources\.ts["']/);
  assert.ok(screen.includes("loadIdentityProfiles()"));
});

test("today's action can be set from the real current/next task (Stage I's own buildTodaySections), never a guessed one", () => {
  assert.match(screen, /import\s*\{[\s\S]*?buildTodaySections[\s\S]*?\}\s*from\s*["']\.\.\/arc\/todaySchedule\.ts["']/);
  assert.ok(screen.includes("today.currentOrNext?.task ?? null"));
});

test("turning today's action into a task requires an explicit confirmation step -- never created on a single tap", () => {
  const fnIndex = screen.indexOf("async function createTaskFromTodaysAction()");
  assert.ok(fnIndex !== -1);
  assert.ok(screen.includes("createdTaskConfirm ? ("), "a confirm step must gate the actual creation button");
  assert.ok(screen.includes("onPress={createTaskFromTodaysAction}"));
});

test("the created task is saved through the same upsertTask as every other task-creation path, never a parallel store", () => {
  assert.match(screen, /import\s*\{[\s\S]*?upsertTask[\s\S]*?\}\s*from\s*["']\.\.\/data\/storage\.ts["']/);
  const fnIndex = screen.indexOf("async function createTaskFromTodaysAction()");
  assert.ok(screen.slice(fnIndex, fnIndex + 300).includes("await upsertTask(task)"));
});

test("the screen still never claims or uses text-to-speech/audio", () => {
  assert.ok(!screen.includes("expo-speech") && !screen.includes("Speech.") && !screen.includes("expo-av"));
});
