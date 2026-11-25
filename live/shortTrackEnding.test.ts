import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { resolveActionText } from "../arc/newArcLiveCopy.ts";
import { createNewArcLiveSessionState } from "../arc/newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "../arc/newArcLiveTypes.ts";

/**
 * live/shortTrackEnding.test.ts
 *
 * ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks task:
 * both short-depth tracks end the same way -- straight to action with
 * the timer, reusing the task's own already-known first action, never
 * prompting a new choice. Covers the returnToTask auto-start change
 * (full-depth completions keep today's exact behavior; any short-depth
 * completion auto-starts regardless of autoStartAfter) and confirms
 * resolveActionText's existing fallback chain resolves via firstAction
 * with no action-selector ever shown for short depth.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/NewArcLiveScreen.tsx");

const NOW = "2026-01-05T12:00:00.000Z";

test("the completeConsumedRef effect ORs session.arcPracticeDepth === 'short' into the autoStart argument passed to returnToTask -- short-depth completions always auto-start the timer regardless of autoStartAfter", () => {
  assert.ok(screen.includes('returnToTask(autoStartAfter || session.arcPracticeDepth === "short");'));
});

test("a full-depth completion (arcPracticeDepth 'full' or null -- every existing session) keeps autoStartAfter's exact pre-existing behavior, since 'short' is never true for it", () => {
  const full: NewArcLiveSessionState = createNewArcLiveSessionState("t1", "x", "y", NOW, "plannedFull");
  assert.equal(full.arcPracticeDepth, null);
  // autoStartAfter || (null === "short") === autoStartAfter || false === autoStartAfter, unchanged.
  assert.equal(full.arcPracticeDepth === "short", false);
});

test("resolveActionText resolves via firstAction for a short-depth session with no explicit action selected -- the SAME existing fallback chain every other pathway already uses, never a new one", () => {
  const state: NewArcLiveSessionState = { ...createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "plannedFull"), arcPracticeDepth: "short" };
  assert.equal(resolveActionText(state), "לפתוח את המחשב", "falls through to the task's own already-known first action");
});

test("resolveActionText also resolves correctly for the Active-Task-LIVE origin case, with no action-selector step ever involved for short depth", () => {
  const state: NewArcLiveSessionState = {
    ...createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "shortened"),
    arcPracticeDepth: "short",
    isActiveTaskLiveOrigin: true,
  };
  assert.equal(resolveActionText(state), "לפתוח את המחשב");
});

test("ARCHI -- Adaptive Task Execution & Emotional Persistence task: action_selection/mini_action_selection have no reachability rule at all any more -- both ids are removed from the step-order arrays entirely, so short depth (or any other mode) can never resurrect an action-selector screen", () => {
  const engine = readSource("arc/newArcLiveSteps.ts");
  assert.ok(!engine.includes('if (step === "action_selection" || step === "mini_action_selection")'), "the old dedicated reachability branch for these two ids no longer exists");
  assert.ok(!engine.includes("export function setSelectedAction"), "the setter itself is deleted, never resurrected");
});

test("supportive_area_select's shortened branch ends with a plain, unconditional 'המשך' for every session (ARC GYM, short depth, and ordinary full-depth alike) -- no action-selection section of any kind any more", () => {
  assert.ok(!screen.includes('session!.arcGymSituationId || session!.arcPracticeDepth === "short" ? ('), "the old arcGymSituationId/short-depth ternary that used to gate the action-selection section is gone");
});
