import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/purposeManifest.test.ts
 *
 * Manifest Upgrade / Startup-popup tasks: source-text regression guard
 * for this module's AsyncStorage-backed resolution logic -- same
 * convention as data/dailyRoutine.test.ts/data/taskAlarm.test.ts
 * (AsyncStorage isn't a callable mock under a plain `node --test`
 * run). The pure selection/rotation/completeness logic itself is fully
 * exercised in arc/purposeManifest.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/purposeManifest.ts");
const storageModule = readSource("data/storage.ts");

// --- The shared "fresh pick" helper both entry points delegate to ---

test("pickFreshManifestSelection picks uniformly at random via selectRandomManifestId(..., Math.random())", () => {
  const fnIndex = module_.indexOf("async function pickFreshManifestSelection");
  const fnBody = module_.slice(fnIndex, fnIndex + 800);
  assert.ok(fnBody.includes("selectRandomManifestId(eligible.map((m) => m.id), Math.random())"));
});

test("pickFreshManifestSelection advances and persists the per-manifest behavior rotation together with the new selection, in one batch", () => {
  const fnIndex = module_.indexOf("async function pickFreshManifestSelection");
  const fnBody = module_.slice(fnIndex, fnIndex + 800);
  assert.ok(fnBody.includes("resolveNextBehaviorIndexForManifest(rotation, manifest.id)"));
  assert.ok(fnBody.includes("recordBehaviorShownForManifest(rotation, manifest.id, behaviorIndex)"));
  assert.ok(fnBody.includes("Promise.all([savePurposeManifestRotation(nextRotation), saveDailyManifestSelection(selection), resolveManifestNextAction(manifest.id, now)])"));
});

// --- resolveStartupManifestSelection: startup-popup task, ALWAYS fresh ---

test("resolveStartupManifestSelection returns null when there is no eligible manifest -- the overlay then shows only the psychology fact", () => {
  const fnIndex = module_.indexOf("export async function resolveStartupManifestSelection");
  const fnBody = module_.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("if (eligible.length === 0) return null;"));
});

test("resolveStartupManifestSelection NEVER checks for an existing/current selection -- it always delegates straight to pickFreshManifestSelection, satisfying 'randomly select one each time the startup sequence begins'", () => {
  const fnIndex = module_.indexOf("export async function resolveStartupManifestSelection");
  const fnBody = module_.slice(fnIndex, fnIndex + 600);
  assert.ok(!fnBody.includes("isDailySelectionCurrent"), "the startup path must never reuse a prior selection");
  assert.ok(!fnBody.includes("loadDailyManifestSelection"), "the startup path never even loads the existing selection");
  assert.ok(fnBody.includes("return pickFreshManifestSelection(eligible, rotation, todayDateLocal, now);"));
});

// --- resolveTodaysManifestSelection: manual "reopen today" path, reuse-if-current ---

test("resolveTodaysManifestSelection returns null when there is no eligible manifest -- never an empty/broken popup", () => {
  const fnIndex = module_.indexOf("export async function resolveTodaysManifestSelection");
  const fnBody = module_.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("if (eligible.length === 0) return null;"));
});

test("resolveTodaysManifestSelection reuses an already-current selection for today without re-rolling, but only when its manifest is still eligible", () => {
  const fnIndex = module_.indexOf("export async function resolveTodaysManifestSelection");
  const fnBody = module_.slice(fnIndex, fnIndex + 1500);
  assert.ok(fnBody.includes("isDailySelectionCurrent(existingSelection, todayDateLocal)"));
  assert.ok(fnBody.includes("eligible.find((candidate) => candidate.id === existingSelection!.manifestId)"));
});

test("resolveTodaysManifestSelection falls through to the SAME shared fresh-pick helper when there is no current selection", () => {
  const fnIndex = module_.indexOf("export async function resolveTodaysManifestSelection");
  const fnBody = module_.slice(fnIndex, fnIndex + 1600);
  assert.ok(fnBody.includes("return pickFreshManifestSelection(eligible, rotation, todayDateLocal, now);"));
});

// --- Final Manifest & Startup Popup Updates task: backward compatibility at the storage boundary ---

test("data/storage.ts's loadPurposeManifests runs every parsed record through normalizePurposeManifest, so a legacy record missing futureMantra/focusPointColor/futureBodyMovement never crashes downstream code", () => {
  const fnIndex = storageModule.indexOf("export async function loadPurposeManifests");
  const fnBody = storageModule.slice(fnIndex, fnIndex + 500);
  assert.ok(fnBody.includes("parsed.map(normalizePurposeManifest)"));
});

// --- Manifest Goals & Automatic Task Scheduling task: Popup 2 Step 6's data, resolved alongside the rest of the selection ---

test("pickFreshManifestSelection resolves THIS SAME randomly-picked manifest's own nextAction (never a different manifest's), in the same batch as the rest of the selection", () => {
  const fnIndex = module_.indexOf("async function pickFreshManifestSelection");
  const fnBody = module_.slice(fnIndex, fnIndex + 900);
  assert.ok(fnBody.includes("resolveManifestNextAction(manifest.id, now)"));
  assert.ok(fnBody.includes("return { selection, manifest, behavior: manifest.behaviors[behaviorIndex], nextAction };"));
});

test("resolveTodaysManifestSelection's reuse-if-current branch ALSO attaches nextAction (resolved fresh for the reused manifest), so reopening today's visualization never shows a stale or missing next-action reminder", () => {
  const fnIndex = module_.indexOf("export async function resolveTodaysManifestSelection");
  const fnBody = module_.slice(fnIndex, fnIndex + 1600);
  assert.ok(fnBody.includes("resolveManifestNextAction(manifest.id, now)"));
  assert.ok(fnBody.includes("return { selection: existingSelection!, manifest, behavior: manifest.behaviors[existingSelection!.behaviorIndex], nextAction };"));
});
