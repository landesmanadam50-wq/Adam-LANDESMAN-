import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/taskStartedOutcomeWiring.test.ts
 *
 * ARCHI -- Body-Sensation Discovery & Four-Component Learning task:
 * source-text regression guard confirming the "task started" outcome is
 * resolved OUTSIDE the ARC engine itself, from the two real-world signal
 * points (performStart() and the genuine give-up/not-started branch of
 * finishOrGiveUpTask) -- never guessed inside the ARC engine.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

test("ActiveTaskScreen.performStart() marks every unresolved SupportiveBodySensationUsage for this task as started=true", () => {
  const module_ = readSource("live/ActiveTaskScreen.tsx");
  assert.ok(module_.includes('import { markSupportiveBodySensationUsagesTaskOutcome } from "../data/storage.ts";'));
  assert.ok(module_.includes('import { resolveBodySensationContextKeys } from "../arc/supportiveBodySensation.ts";'));
  const start = module_.indexOf("void markSupportiveBodySensationUsagesTaskOutcome(");
  assert.ok(start !== -1);
  const call = module_.slice(start, start + 400);
  assert.ok(call.includes("resolveBodySensationContextKeys("));
  assert.ok(call.includes("true,"));
});

test("finishOrGiveUpTask marks every unresolved SupportiveBodySensationUsage for this task as started=false", () => {
  const module_ = readSource("data/taskNotStartedNotification.ts");
  const start = module_.indexOf("async function finishOrGiveUpTask");
  assert.ok(start !== -1);
  const body = module_.slice(start, start + 3000);
  assert.ok(body.includes('await import("../arc/supportiveBodySensation.ts")'));
  assert.ok(body.includes('await import("./storage.ts")'));
  assert.ok(body.includes("markSupportiveBodySensationUsagesTaskOutcome("));
  assert.ok(body.includes("false,"));
});
