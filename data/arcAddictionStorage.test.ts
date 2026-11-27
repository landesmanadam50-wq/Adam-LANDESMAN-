/**
 * data/arcAddictionStorage.ts depends on the native AsyncStorage module,
 * so (like the rest of data/'s storage code) it is verified by source
 * text: keys, the single-slot session, exactly-once progression and
 * stale-session closing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("./arcAddictionStorage.ts", import.meta.url)), "utf8");
const mainStorage = readFileSync(fileURLToPath(new URL("./storage.ts", import.meta.url)), "utf8");

test("versioned archi.* keys, isolated from data/storage.ts", () => {
  assert.match(source, /"archi\.arcAddictionProfiles\.v1"/);
  assert.match(source, /"archi\.arcAddictionEpisodes\.v1"/);
  assert.match(source, /"archi\.arcAddictionActiveSession\.v1"/);
  assert.ok(!mainStorage.includes("arcAddiction"), "ARC Addiction must not add keys to data/storage.ts");
});

test("every load normalizes and never throws on bad JSON", () => {
  assert.match(source, /JSON\.parse\(raw\)/);
  assert.match(source, /catch \(error\)/);
  assert.match(source, /normalizeAddictionProfile/);
  assert.match(source, /normalizeAddictionEpisode/);
  assert.match(source, /normalizeAddictionSession/);
});

test("the active session is ONE slot (setItem on a single key, cleared when done)", () => {
  const commit = source.slice(source.indexOf("export async function commitAddictionSession"));
  assert.match(commit, /AsyncStorage\.setItem\(ARC_ADDICTION_ACTIVE_SESSION_KEY/);
  assert.match(commit, /stored\.stage === "done"\) await clearActiveAddictionSession\(\)/);
});

test("progression is applied once, at closing, guarded by progressionAppliedAt", () => {
  const commit = source.slice(source.indexOf("export async function commitAddictionSession"));
  assert.match(commit, /session\.stage === "closing" \|\| session\.stage === "done"/);
  assert.match(commit, /progressionAppliedAt === null/);
  assert.match(commit, /applyEpisodeToProfile\(profile, session\.episode, now\)/);
  assert.match(commit, /upsertAddictionEpisode\(stored\.episode\)/);
});

test("stale sessions are closed with everything kept, then the slot is freed", () => {
  const fn = source.slice(source.indexOf("export async function loadActiveAddictionSessionOrCloseStale"));
  assert.match(fn, /isAddictionSessionStale\(session, now\)/);
  assert.match(fn, /commitAddictionSession\(closeStaleAddictionSession\(session, now\), now\)/);
});

test("history is pruned per profile so the key cannot grow without bound", () => {
  assert.match(source, /pruneAddictionEpisodes\(upsertAddictionEpisodeInList\(episodes, episode\)\)/);
});

test("deleting a profile never deletes its history", () => {
  const fn = source.slice(source.indexOf("export async function deleteAddictionProfile"), source.indexOf("// Episodes"));
  assert.ok(!fn.includes("EPISODES_KEY"));
});
