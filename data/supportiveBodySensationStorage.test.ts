import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * data/supportiveBodySensationStorage.test.ts
 *
 * ARCHI -- Body-Sensation Discovery & Four-Component Learning task:
 * source-text regression guard for the new SupportiveBodySensationUsage
 * CRUD in data/storage.ts (depends on AsyncStorage, so it isn't executed
 * directly with `node --test` -- same convention as every other
 * data/*.test.ts file in this app, e.g. data/arcReminderCrud.test.ts).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const module_ = readSource("data/storage.ts");

test("a distinct storage key backs SupportiveBodySensationUsage, never reusing INTERNAL_ACTION_USAGES_KEY", () => {
  assert.ok(module_.includes('const SUPPORTIVE_BODY_SENSATION_USAGES_KEY = "archi.supportiveBodySensationUsages.v1";'));
});

test("appendSupportiveBodySensationUsageEntry appends, never overwrites the existing list", () => {
  const start = module_.indexOf("export async function appendSupportiveBodySensationUsageEntry");
  assert.ok(start !== -1);
  const end = module_.indexOf("export async function updateSupportiveBodySensationUsageEntry");
  const body = module_.slice(start, end);
  assert.ok(body.includes("await loadSupportiveBodySensationUsages();"));
  assert.ok(body.includes("await saveSupportiveBodySensationUsages([...usages, usage]);"));
});

test("updateSupportiveBodySensationUsageEntry replaces by id rather than appending a second row", () => {
  const start = module_.indexOf("export async function updateSupportiveBodySensationUsageEntry");
  assert.ok(start !== -1);
  const end = module_.indexOf("export async function markSupportiveBodySensationUsagesTaskOutcome");
  const body = module_.slice(start, end);
  assert.ok(body.includes("usages.findIndex((existing) => existing.id === usage.id)"));
  assert.ok(body.includes("if (index === -1) return;"));
});

test("markSupportiveBodySensationUsagesTaskOutcome only touches rows still unresolved under one of the given context keys", () => {
  const start = module_.indexOf("export async function markSupportiveBodySensationUsagesTaskOutcome");
  assert.ok(start !== -1);
  const body = module_.slice(start, start + 900);
  assert.ok(body.includes("if (contextKeys.length === 0) return;"));
  assert.ok(body.includes("if (usage.taskStarted !== null || !contextKeys.includes(usage.contextKey)) return usage;"));
  assert.ok(body.includes("return { ...usage, taskStarted: started, startedCheckedAt: now };"));
});

test("loadNewArcLiveSession backfills all four new body-sensation fields for a session saved before this task existed", () => {
  assert.ok(module_.includes("suggestedBodySensations: parsed.suggestedBodySensations ?? [],"));
  assert.ok(module_.includes("bodySensationUsageId: parsed.bodySensationUsageId ?? null,"));
  assert.ok(module_.includes("sensationEffectivenessRating: parsed.sensationEffectivenessRating ?? null,"));
  assert.ok(module_.includes("readinessImprovedAfterSensation: parsed.readinessImprovedAfterSensation ?? null,"));
});
