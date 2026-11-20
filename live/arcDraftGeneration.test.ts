import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/arcDraftGeneration.test.ts
 *
 * ARC-system upgrade task, Part C: source-text regression guard for
 * automatic Full+Mini planned-ARC draft generation, fired exactly once
 * a SPONTANEOUS session finishes -- never for a planned session, and
 * never twice for the same exercise. The pure generation logic itself
 * is covered by arc/plannedArc.test.ts; this file only checks the
 * screen wires it in at every path that actually ends a session.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/NewArcLiveScreen.tsx");
const storage = readSource("data/storage.ts");

test("generateDraftsIfSpontaneous is a no-op for any non-spontaneous session, and checks for an existing draft (by exercise id) before inserting one -- ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks task: only a 'full' draft is generated now, since Mini ARC is no longer a user-choosable kind anywhere", () => {
  const fnIndex = screen.indexOf("async function generateDraftsIfSpontaneous");
  assert.ok(fnIndex !== -1);
  const fnBody = screen.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes('if (finishedSession.arcInvocationMode !== "spontaneous") return;'));
  assert.ok(fnBody.includes('hasDraftForExercise(existingDrafts, finishedSession.createdAt, "full")'));
  assert.ok(fnBody.includes('createPlannedArcFromSession(finishedSession, "full", generatePlannedArcId(), now)'));
  assert.ok(!fnBody.includes('"mini"'), "a 'mini' draft must never be generated any more -- existing kind: \"mini\" records stay intact but no new ones are created");
});

test("every path that actually ends a session calls generateDraftsIfSpontaneous exactly once, via the single automatic completeConsumedRef effect -- ARCHI -- Unified 7-Part Update task, Part 5: the old Task track's own dedicated manual menu is gone entirely, superseded by this one automatic path for every track", () => {
  const autoEffectOccurrences = screen.match(/await generateDraftsIfSpontaneous\(session, completionNow\);/g) ?? [];
  assert.equal(autoEffectOccurrences.length, 1, "the automatic completeConsumedRef effect's own single call site -- the only one left now");
  assert.ok(!screen.includes("await generateDraftsIfSpontaneous(session!, now);"), "the old manual Task-track menu's own call sites are gone");
});

test("the automatic completeConsumedRef effect calls generateDraftsIfSpontaneous BEFORE savePendingIdentityInsightTaskId/returnToTask, never after navigating away", () => {
  const effectIndex = screen.indexOf("const completeConsumedRef = useRef(false);");
  const effectBody = screen.slice(effectIndex, effectIndex + 2400);
  const genIndex = effectBody.indexOf("generateDraftsIfSpontaneous");
  const returnIndex = effectBody.indexOf("returnToTask(autoStartAfter");
  assert.ok(genIndex !== -1 && returnIndex !== -1 && genIndex < returnIndex);
});

test("PlannedArc persistence (loadPlannedArcs/upsertPlannedArc/deletePlannedArc) is exported from data/storage.ts, separate from the legacy ARC_BUILDS_KEY collection", () => {
  for (const fn of ["loadPlannedArcs", "upsertPlannedArc", "deletePlannedArc"]) {
    assert.match(storage, new RegExp(`export async function ${fn}\\(`));
  }
  assert.match(storage, /const PLANNED_ARCS_KEY = "archi\.plannedArcs\.v1";/);
});

test("triggerText is captured inline on goal_select, only for a spontaneous session, merged into the SAME commit as the goalType choice -- never its own extra step", () => {
  const withTriggerIndex = screen.indexOf("const withTrigger =");
  const withTriggerBody = screen.slice(withTriggerIndex, withTriggerIndex + 300);
  assert.ok(withTriggerBody.includes('arcInvocationMode === "spontaneous"'));
  assert.ok(withTriggerBody.includes("triggerText: draftText.trim() || null"));
});
