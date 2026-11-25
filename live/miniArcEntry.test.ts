import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/miniArcEntry.test.ts
 *
 * ARC-system upgrade task, Part G: source-text regression guard for the
 * Mini ARC entry point -- the dedicated "Mini ARC" button on Task LIVE,
 * the route's own mini=1 param, and the screen's render cases for the
 * five Mini-only steps. The engine/copy themselves are covered by
 * arc/newArcLiveSteps.test.ts and arc/newArcLiveCopy.test.ts.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");
const route = readSource("app/tasks/[id]/arc.tsx");
const screen = readSource("live/NewArcLiveScreen.tsx");

test("the route reads 'mini'/'spontaneous'/'shortened' params and resolves them to exactly one startMode, never guessing from anything else", () => {
  assert.match(route, /const \{\s*id,\s*mini,\s*spontaneous,\s*shortened,\s*skipEmotionSelection,\s*plannedArcId,\s*autoStartAfter,\s*arcGymSituationId,\s*arcFocusPracticeId,\s*arcGymMemoryExerciseId,\s*arcPerspectiveId,\s*arcSavingBodyOptionId,\s*arcSavingExerciseId,\s*arcSavingTriggerIdForNewOption,\s*morningFlowCheckIn,?\s*\}\s*=\s*useLocalSearchParams/);
  assert.ok(route.includes("startMode={resolveStartMode(mini, spontaneous, shortened)}"));
  assert.match(route, /if \(mini === "1"\) return "plannedMini";/);
  assert.match(route, /if \(spontaneous === "1"\) return "spontaneous";/);
  assert.match(route, /return "plannedFull";/);
});

test("the screen only applies startMode when creating a FRESH session -- an existing, resumed session keeps its own already-persisted arcInvocationMode", () => {
  const reloadIndex = screen.indexOf("const reload = useCallback");
  // BodySensation task: widened (10500 -> 11200) to fit the new
  // bodySensationContextKeys/bodySensationSuggestions resolution reload() grew.
  const reloadBody = screen.slice(reloadIndex, reloadIndex + 11200);
  assert.ok(reloadBody.includes("existing.taskId === taskId && !existing.completedAt"));
  assert.ok(reloadBody.includes("createNewArcLiveSessionState(taskId, task.title, task.firstAction, buildNow, startMode, null, skipEmotionSelection)"));
});

// ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks task:
// Mini ARC is no longer a user-choosable mode anywhere in the app --
// the Mini-vs-Full-ARC choice screen is removed entirely, and "😟 פחות
// טוב" opens Full ARC directly again (depth is now decided
// automatically by the new time rating, never by a manual Mini/Full
// choice). Existing `kind: "mini"` PlannedArc records and every
// mini_* step/setter stay fully intact for legacy in-flight sessions,
// but there is no longer any discovery/creation entry point for a
// fresh one.
test("Task LIVE no longer offers a dedicated 'Mini ARC' button, nor any Mini-vs-Full-ARC choice -- the '😟 פחות טוב' mood button opens Full ARC directly, pausing the timer first", () => {
  assert.ok(!activeTaskScreen.includes(">Mini ARC<"), "the old dedicated Mini ARC button is gone");
  assert.ok(!activeTaskScreen.includes("openMiniOrFullArcChoice"), "the removed choice screen is never dispatched from here");
  const moodButtonIndex = activeTaskScreen.indexOf("openFullArc(task.id)");
  assert.ok(moodButtonIndex !== -1);
  const nearbyBefore = activeTaskScreen.slice(Math.max(0, moodButtonIndex - 300), moodButtonIndex);
  assert.ok(nearbyBefore.includes("await handlePause()"));
});

test("the screen renders dedicated cases for mini_awareness, mini_acceptance_transition, and mini_encoding -- never falling through to the generic single-button default (which would collect no data)", () => {
  for (const step of ['case "mini_awareness":', 'case "mini_acceptance_transition":', 'case "mini_encoding":']) {
    assert.ok(screen.includes(step), `missing render case: ${step}`);
  }
});

// ARCHI -- Consolidated Implementation Request, Part 6 ("Presence:
// Expanding Field of View"): mini_presence now has its OWN dedicated
// case, rendering through ArcBodyMantraCircle (the central point + one
// expanding circle, same as Full ARC's visual_field) instead of the
// generic default -- it still needs no input, so it's a plain
// tap-to-advance circle, not a form. mini_action is unaffected.
test("mini_presence has a dedicated case rendering ArcBodyMantraCircle (stage mini_presence); mini_action is still deliberately left to the generic default render -- its handoff is identical to the shared transition/complete logic", () => {
  assert.ok(screen.includes('case "mini_presence":'));
  const caseIndex = screen.indexOf('case "mini_presence":');
  const caseBody = screen.slice(caseIndex, caseIndex + 500);
  assert.ok(caseBody.includes('stage="mini_presence"'));
  assert.ok(!screen.includes('case "mini_action":'));
});
