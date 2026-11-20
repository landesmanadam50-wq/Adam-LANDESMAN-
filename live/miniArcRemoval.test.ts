import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { migrateLegacyNewArcLiveStep } from "../arc/newArcLiveSteps.ts";
import { createNewArcLiveSessionState } from "../arc/newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "../arc/newArcLiveTypes.ts";
import { plannedArcsOfKind } from "../arc/plannedArc.ts";
import type { PlannedArc } from "../arc/plannedArc.ts";

/**
 * live/miniArcRemoval.test.ts
 *
 * ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks task:
 * Mini ARC is no longer a user-choosable mode anywhere in the app --
 * the Mini-vs-Full-ARC choice screen and every discovery entry point
 * are removed; `handleEmotionalCheckInChoice("full_arc")` reverts to
 * opening Full ARC directly; `generateDraftsIfSpontaneous` no longer
 * creates a "mini" draft; and an in-flight legacy `plannedMini` session
 * is left completely untouched by `migrateLegacyNewArcLiveStep` -- its
 * own step order, content, and setters all stay fully intact, so such
 * a session simply finishes normally on its own unchanged engine.
 * Existing `kind: "mini"` PlannedArc records are never deleted, just
 * no longer surfaced by any UI entry point.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const NOW = "2026-01-05T12:00:00.000Z";

const routing = readSource("data/emotionalCheckInRouting.ts");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const arcWindowScreen = readSource("live/ArcWindowScreen.tsx");
const layout = readSource("app/_layout.tsx");

test("the Mini-vs-Full-ARC choice screen and its route are gone entirely -- no file, no registration, no reference anywhere", () => {
  assert.ok(!layout.includes("arc-mini-or-full-choice"));
  for (const source of [routing, activeTaskScreen, arcWindowScreen]) {
    assert.ok(!source.includes("openMiniOrFullArcChoice"));
    assert.ok(!source.includes("/arc-mini-or-full-choice"));
  }
});

test("handleEmotionalCheckInChoice('full_arc') calls openFullArc directly again -- reverted to pre-choice-screen behavior, depth is now decided automatically by the time rating", () => {
  const fnIndex = routing.indexOf("export async function handleEmotionalCheckInChoice(");
  const fnBody = routing.slice(fnIndex, routing.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes('if (choice === "full_arc") return openFullArc(taskId, options);'));
});

test("ActiveTaskScreen's own '😟 פחות טוב' mood button opens Full ARC directly too, pausing the timer first, same as every other entry point", () => {
  const moodButtonIndex = activeTaskScreen.indexOf("openFullArc(task.id);");
  assert.ok(moodButtonIndex !== -1);
  const nearbyBefore = activeTaskScreen.slice(Math.max(0, moodButtonIndex - 300), moodButtonIndex);
  assert.ok(nearbyBefore.includes("await handlePause()"));
});

test("ArcWindowScreen's chooser no longer offers a 'Mini ARC מתוכנן' option -- only spontaneous, Full planned (when drafts exist), and skip", () => {
  assert.ok(!arcWindowScreen.includes("miniDrafts"));
  assert.ok(!arcWindowScreen.includes("mini_list"));
  assert.ok(arcWindowScreen.includes("fullDrafts"));
});

test("generateDraftsIfSpontaneous generates only a 'full' PlannedArc draft now, never 'mini'", () => {
  const screen = readSource("live/NewArcLiveScreen.tsx");
  const fnIndex = screen.indexOf("async function generateDraftsIfSpontaneous");
  const fnBody = screen.slice(fnIndex, fnIndex + 700);
  assert.ok(fnBody.includes('createPlannedArcFromSession(finishedSession, "full", generatePlannedArcId(), now)'));
  assert.ok(!fnBody.includes('"mini"'));
});

test("existing kind:'mini' PlannedArc records are never deleted -- plannedArcsOfKind still filters and returns them correctly, simply no longer surfaced by any discovery UI", () => {
  const drafts: PlannedArc[] = [
    { id: "p1", kind: "mini", name: "old mini draft", createdAt: NOW, updatedAt: NOW } as unknown as PlannedArc,
    { id: "p2", kind: "full", name: "a full draft", createdAt: NOW, updatedAt: NOW } as unknown as PlannedArc,
  ];
  assert.equal(plannedArcsOfKind(drafts, "mini").length, 1, "the old record is still readable by the underlying data layer, never deleted");
  assert.equal(plannedArcsOfKind(drafts, "full").length, 1);
});

test("an in-flight legacy 'plannedMini' session is left completely untouched by migrateLegacyNewArcLiveStep -- every mini_* step/content/setter stays fully intact for it", () => {
  const engine = readSource("arc/newArcLiveSteps.ts");
  assert.ok(engine.includes("NEW_ARC_MINI_STEP_ORDER"), "the Mini ARC step order itself stays fully intact, never deleted");
  for (const miniStep of ["mini_presence", "mini_awareness", "mini_acceptance_transition", "mini_encoding"]) {
    const state: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "x", "y", NOW, "plannedMini"), currentStep: miniStep as NewArcLiveSessionState["currentStep"] };
    const migrated = migrateLegacyNewArcLiveStep(state);
    assert.equal(migrated.currentStep, miniStep, `a session genuinely parked on ${miniStep} must stay there -- no new migration branch exists for in-flight plannedMini sessions`);
  }
});

test("PlannedArcKind still includes 'mini' as a valid value -- the type itself is never narrowed or deleted, only its discovery UI is removed", () => {
  const plannedArc = readSource("arc/plannedArc.ts");
  assert.match(plannedArc, /export type PlannedArcKind = "full" \| "mini";/);
});
