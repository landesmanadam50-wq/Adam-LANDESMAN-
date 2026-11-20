import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { getStepContent } from "../arc/newArcLiveCopy.ts";
import { createNewArcLiveSessionState } from "../arc/newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "../arc/newArcLiveTypes.ts";

/**
 * live/dwellingStage.test.ts
 *
 * ARC-system upgrade task, Part F step 4 (historical): "dwelling" had
 * NO dedicated render case, falling through to the generic `default`
 * case's own dwell-timer-gated Continue button -- but its content
 * never set dwellSeconds, so that timer gate was always a no-op and
 * Continue was always enabled immediately.
 *
 * Final ARC Flow & Body Animation task (current, requirement 4):
 * "dwelling" now has ITS OWN dedicated case, rendering
 * ArcBodyMantraCircle (the body + fixed mantra, inside the one circle)
 * -- tapping the circle itself IS the "continue" action, calling
 * advance() directly and unconditionally, with no dwellSeconds/canContinue
 * timer gate involved at all. The USER-PACED guarantee survives this
 * rewrite in a different, simpler form: nothing in the engine or this
 * screen ever calls advance() for the trainee on its own, so the
 * trainee stays exactly as long as they want, for exactly the same
 * reason as before -- there is still no auto-advance mechanism of any
 * kind for this step.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/NewArcLiveScreen.tsx");
const steps = readSource("arc/newArcLiveSteps.ts");
const types = readSource("arc/newArcLiveTypes.ts");

function fresh(): NewArcLiveSessionState {
  return createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", "2026-01-01T00:00:00.000Z");
}

test("live/NewArcLiveScreen.tsx now has its OWN dedicated 'dwelling' render case, rendering ArcBodyMantraCircle with an unconditional onAdvance -- never the old generic, canContinue-gated default case", () => {
  assert.ok(screen.includes('case "dwelling":'), "dwelling must now render its own body+mantra circle");
  const caseIndex = screen.indexOf('case "dwelling":');
  const caseBody = screen.slice(caseIndex, screen.indexOf("case ", caseIndex + 20));
  assert.ok(caseBody.includes("<ArcBodyMantraCircle"));
  assert.ok(caseBody.includes('stage="dwelling"'));
  assert.ok(caseBody.includes("onAdvance={() => commit(advance(session!, now))}"), "tapping the circle always advances unconditionally -- no canContinue/dwellSeconds gate");
});

test("the generic default case gates its Continue button on canContinue, driven by getStepContent(session).dwellSeconds for whatever the current step is", () => {
  const defaultIndex = screen.indexOf("default:");
  const defaultBody = screen.slice(defaultIndex, defaultIndex + 400);
  assert.ok(defaultBody.includes("disabled={!canContinue}"));
  const dwellEffectIndex = screen.indexOf("const dwellSeconds = getStepContent(session).dwellSeconds;");
  assert.ok(dwellEffectIndex !== -1);
  const dwellEffectBody = screen.slice(dwellEffectIndex, dwellEffectIndex + 200);
  assert.ok(dwellEffectBody.includes("if (!dwellSeconds) {"));
  assert.ok(dwellEffectBody.includes("setCanContinue(true);"));
});

test("integration: dwelling's own content never sets dwellSeconds, so the dwell-timer effect's '!dwellSeconds' branch is always taken -- Continue is enabled immediately, and no setTimeout (hence no auto-advance) is ever scheduled", () => {
  const content = getStepContent({ ...fresh(), currentStep: "dwelling", unpleasantBodyArea: "chest" });
  assert.equal(content.dwellSeconds, undefined, "a defined dwellSeconds here would re-arm the timer gate and contradict user-paced dwelling");
});

test("the trainee can stay on dwelling for as long as they want: there is no timer, interval, or any other auto-advance mechanism anywhere near the dwelling case -- the ONLY way it ever advances is the trainee's own tap on the circle", () => {
  const content = getStepContent({ ...fresh(), currentStep: "dwelling", bodyScanContractionRegions: [{ region: "scanChest", side: null }] });
  assert.equal(content.dwellSeconds, undefined, "dwelling's own content never sets dwellSeconds either, consistent with there being no timer gate anywhere in its new render path");
  const caseIndex = screen.indexOf('case "dwelling":');
  const caseBody = screen.slice(caseIndex, screen.indexOf("case ", caseIndex + 20));
  assert.ok(!caseBody.includes("setTimeout"), "no auto-advance timer must ever be scheduled for dwelling");
});

// ARC LIVE Body Scan and Protocol Restructuring task, section 1/6
// (historical): "dwelling" (along with unpleasant_area_question/
// unpleasant_area_select) was REMOVED from active navigation for a
// time, folded into "acceptance"'s own text instead, then RE-ACTIVATED
// by the ARC Full Sequence Update task, positioned right after
// Presence and before heavy/closed region identification.
//
// Final ARC Flow & Body Animation task (current, requirement 1): the
// EXACT ARC SEQUENCE repositions "Dwelling" to right after "Identify
// Contraction" (body_scan_contraction) instead -- unpleasant_area_question/
// unpleasant_area_select are removed from the active order again (this
// time for good, superseded by body_scan_contraction's own multi-region
// selection), and dwelling's own gate now reads the new, finer
// bodyScanContractionRegions field instead of the old, coarse
// unpleasantBodyArea.
// ARCHI -- Full ARC Body Flow Redesign task: "dwelling" is now
// permanently unreachable outright ("Acceptance Part 1 immediately
// follows Screen One [body_scan_contraction]," with nothing in
// between) -- its own isStepReachable gate no longer reads
// bodyScanContractionRegions (or anything else) at all, it simply
// returns false unconditionally. The step id, its own copy/setters,
// and a dedicated forward-migration for a session saved mid-flight on
// it all stay fully intact (see migrateLegacyNewArcLiveStep), just
// never reached by any new session.
test("'dwelling's own isStepReachable gate is now permanently false -- Acceptance Part 1 follows body_scan_contraction directly, with no contraction-data-based gate any more", () => {
  assert.match(steps, /if \(step === "dwelling"\) return false;/);
  assert.ok(!steps.includes('if (step === "dwelling") return state.bodyScanContractionRegions.length > 0;'), "the old data-gated reachability rule must be gone, not merely re-worded");
  assert.ok(!steps.includes('if (step === "unpleasant_area_select" || step === "dwelling") return state.unpleasantBodyArea !== null;'));
});

test("'dwelling' is positioned right after 'body_scan_contraction' in NEW_ARC_LIVE_STEP_ORDER -- 'unpleasant_area_question'/'unpleasant_area_select' are NOT part of the active order at all any more", () => {
  const orderIndex = steps.indexOf("export const NEW_ARC_LIVE_STEP_ORDER");
  const orderBlock = steps.slice(orderIndex, steps.indexOf("];", orderIndex));
  assert.ok(!orderBlock.includes('"unpleasant_area_question"'));
  assert.ok(!orderBlock.includes('"unpleasant_area_select"'));
  const contractionIdx = orderBlock.indexOf('"body_scan_contraction"');
  const dwellingIdx = orderBlock.indexOf('"dwelling"');
  const closednessIdx = orderBlock.indexOf('"body_scan_closedness"');
  assert.ok(contractionIdx >= 0 && contractionIdx < dwellingIdx && dwellingIdx < closednessIdx);
});

test("'dwelling' is never part of NEW_ARC_MINI_STEP_ORDER -- Mini ARC's own spec already combines this differently (Part G), never duplicated here", () => {
  const miniOrderIndex = steps.indexOf("export const NEW_ARC_MINI_STEP_ORDER");
  const miniOrderBlock = steps.slice(miniOrderIndex, steps.indexOf("];", miniOrderIndex));
  assert.ok(!miniOrderBlock.includes('"dwelling"'));
});

test("'dwelling' is a documented, distinct step id in the type union", () => {
  assert.match(types, /\| "dwelling"/);
});

test("migrateLegacyNewArcLiveStep forward-migrates 'unpleasant_area_question'/'unpleasant_area_select' to 'body_scan_contraction' -- a session persisted mid-flight on either now-removed step resumes on the step that superseded it, never on 'dwelling' itself", () => {
  const migrateIndex = steps.indexOf("export function migrateLegacyNewArcLiveStep");
  const migrateBody = steps.slice(migrateIndex, steps.indexOf("\n}", migrateIndex));
  assert.match(
    migrateBody,
    /case "unpleasant_area_question":\s*\n\s*case "unpleasant_area_select":\s*\n\s*return \{ \.\.\.state, currentStep: "body_scan_contraction", subIndex: 0 \};/
  );
  // The pre-existing sensation/movement migration target stays unchanged.
  assert.match(migrateBody, /case "supportive_sensation_select":\s*\n\s*case "supportive_movement_select":\s*\n\s*return \{ \.\.\.state, currentStep: "acceptance", subIndex: 0 \};/);
});
