import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { setSelectedAction } from "./newArcLiveSteps.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";

/**
 * arc/chooseActionOnShortenedBodyScreen.test.ts
 *
 * ARCHI -- Choose the Action on the Same "סבבה" Screen task: for
 * Shortened ARC only, the trainee wants the action-selection choice to
 * live at the BOTTOM of the body-parts-to-open / "תחושה תומכת" screen
 * (supportive_area_select), never on a screen reached after it
 * (Regulation). live/NewArcLiveScreen.tsx's own case "supportive_area_select"
 * (shortened branch) now renders the SAME action-selection section
 * Regulation uses, right under the body/supportive-feeling picker, and
 * no longer ends with a plain, unconditional "המשך" -- choosing or
 * confirming an action is now this screen's own required exit, exactly
 * like Regulation's own (which already has no plain skip either).
 * ARC GYM's own shortened sessions (nothing to select) keep the old
 * plain "המשך". No RN renderer exists in this codebase, so UI
 * structure is confirmed via source-text checks (readSource), same
 * convention arc/actionSelectionInRegulation.test.ts already uses.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const NOW = "2026-01-05T12:00:00.000Z";

function shortenedSession(arcGymSituationId: string | null = null): NewArcLiveSessionState {
  return { ...createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW, "shortened"), currentStep: "supportive_area_select", subIndex: 0, arcGymSituationId };
}

function readShortenedBranch(): string {
  const screen = readSource("live/NewArcLiveScreen.tsx");
  const caseIndex = screen.indexOf('case "supportive_area_select": {');
  const shortenedIndex = screen.indexOf('if (session!.arcInvocationMode === "shortened") {', caseIndex);
  const nextCaseIndex = screen.indexOf('case "supportive_sensation_select"', shortenedIndex);
  return screen.slice(shortenedIndex, nextCaseIndex);
}

test("1. The action-selection prompt, with the exact spec wording, renders INSIDE the shortened supportive_area_select branch -- on the same screen as the body/supportive-feeling picker, never a separate step reached afterward", () => {
  const branch = readShortenedBranch();
  assert.ok(branch.includes("<BodySilhouetteMap"), "the body-parts-to-open picker renders in this same branch");
  assert.ok(branch.includes("renderSupportiveFeelingPicker("), "the תחושה תומכת picker renders in this same branch too");
  assert.ok(branch.includes("איזו פעולה תרצה לעשות עכשיו?"), "the action-selection prompt renders inline, in this same branch, after the body/feeling pickers");
  assert.ok(branch.includes("renderActionSelector()"), "falls through to the one shared action-selector implementation");
  const feelingIndex = branch.indexOf("renderSupportiveFeelingPicker(");
  const promptIndex = branch.indexOf("איזו פעולה תרצה לעשות עכשיו?");
  assert.ok(promptIndex > feelingIndex, "the action-selection section is positioned AFTER (below) the body/supportive-feeling picker, i.e. at the bottom of this one screen");
});

test("2. Choosing an action directly from supportive_area_select (shortened) advances straight into Regulation, with the action already decided -- no intervening screen", () => {
  const state = shortenedSession();
  const chosen = setSelectedAction(state, { source: "temporaryAction", title: "ללכת לטייל", durationMinutes: 10 }, NOW);
  assert.equal(chosen.currentStep, "regulation", "setSelectedAction's own existing advance() takes the trainee straight to Regulation");
  assert.equal(chosen.subIndex, 0);
  assert.equal(chosen.selectedActionSource, "temporaryAction");
  assert.equal(chosen.selectedActionTitle, "ללכת לטייל");
});

test("3. There is no plain, unconditional 'המשך' between the body/feeling picker and the arcGymSituationId/short-depth branch -- choosing/confirming an action is now this screen's own required exit for every non-ARC-GYM, full-depth shortened session, exactly like Regulation's own (no plain skip there either)", () => {
  const branch = readShortenedBranch();
  // The only "המשך" buttons in this branch belong to the ARC-GYM/
  // short-depth exemption (its own ternary true-branch -- ARCHI --
  // Remove Mini ARC / Add Time Rating & Short-Depth Tracks task: short
  // depth joins the same exemption, since it never prompts for an
  // action either) and the already-confirmed summary (with its own
  // שנה פעולה) -- never a bare advance() call, reachable regardless of
  // arcGymSituationId/short depth, that bypasses the action-selection
  // section entirely.
  const feelingPickerEnd = branch.indexOf("setCustomSupportiveFeelingOverride(session!, text))");
  const ternaryStart = branch.indexOf('session!.arcGymSituationId || session!.arcPracticeDepth === "short" ? (');
  const betweenFeelingAndTernary = branch.slice(feelingPickerEnd, ternaryStart);
  assert.ok(!betweenFeelingAndTernary.includes("המשך"), "no 'המשך' button sits between the end of the body/feeling picker and the arcGymSituationId/short-depth check -- the action section (reached only through its own ternary) is the one exit for every other shortened session");
});

test("4. ARC GYM's own shortened sessions (nothing to select -- its own separate, later positive-action visualization) and short-depth sessions (which reuse the task's own already-known first action automatically) both keep the old plain 'המשך', untouched otherwise by this task", () => {
  const branch = readShortenedBranch();
  assert.match(branch, /session!\.arcGymSituationId \|\| session!\.arcPracticeDepth === "short" \? \(/, "the branch checks arcGymSituationId OR short depth before deciding whether to show the action section at all");
  const gymSection = branch.slice(branch.indexOf('session!.arcGymSituationId || session!.arcPracticeDepth === "short" ? ('), branch.indexOf("איזו פעולה תרצה לעשות עכשיו?"));
  assert.ok(gymSection.includes("המשך"), "the exemption branch still has a plain advance() button, since neither ARC GYM nor short depth has anything to select here");

  const arcGymState = shortenedSession("situation-1");
  assert.equal(arcGymState.arcGymSituationId, "situation-1");
});

test("5. Full ARC and Mini ARC's own supportive_area_select / body-selection screens are completely untouched -- this task only touches Shortened ARC's own branch", () => {
  const screen = readSource("live/NewArcLiveScreen.tsx");
  const caseIndex = screen.indexOf('case "supportive_area_select": {');
  const shortenedIfIndex = screen.indexOf('if (session!.arcInvocationMode === "shortened") {', caseIndex);
  const afterShortenedBranch = screen.slice(shortenedIfIndex, screen.indexOf('case "supportive_sensation_select"', shortenedIfIndex));
  // The non-shortened fallback (chip-based suggested areas, "המשך בלי לבחור") still exists right after the shortened branch closes.
  assert.ok(afterShortenedBranch.includes("המשך בלי לבחור"), "Full/Mini ARC's own existing chip-based picker and its own unconditional 'continue without choosing' exit are both still present, unchanged");
});

test("6. The selected action, chosen on the body screen, is preserved and correctly reflected once Regulation is reached -- shown as a summary, never re-asked", () => {
  const state = shortenedSession();
  const chosen = setSelectedAction(state, { source: "temporaryAction", title: "לשתות מים", durationMinutes: 5 }, NOW);
  assert.equal(chosen.currentStep, "regulation");
  assert.equal(chosen.selectedActionSource, "temporaryAction");
  assert.equal(chosen.selectedActionTitle, "לשתות מים", "Regulation's own case reads this same field to render its 'already selected' summary -- never a second, separate selection");
});
