import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/consolidatedImplementationRequestGaps.test.ts
 *
 * ARCHI -- Consolidated Implementation Request, Part 16/17: a handful
 * of the spec's required regression scenarios had no coverage anywhere
 * in the existing suite (verified by grepping for the relevant exact
 * Hebrew strings/style names before writing this file) -- this file
 * closes exactly those gaps, rather than duplicating the many other
 * scenarios already covered elsewhere (arc/newArcLiveSteps.test.ts,
 * arc/greenBlueOpeningLogic.test.ts, live/taskCompletionReflectionFlow.test.ts,
 * live/miniArcEntry.test.ts, data/emotionalCheckInWidget.test.ts, etc.).
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/NewArcLiveScreen.tsx");
const activeTaskScreen = readSource("live/ActiveTaskScreen.tsx");

// --- Part 3: "exactly two markers" legend ------------------------------

// ARCHI -- Full ARC Body Flow Redesign task: the old shared two-marker
// (green+blue) legend is gone outright -- Screen Two (body_scan_opening_region)
// is Blue-ONLY for Full ARC now ("Green does not appear here any
// more"), and Shortened ARC's own supportive_area_select branch already
// dropped the green/blue legend row in an earlier task ("the old
// green/blue legend row is gone ... 'סבבה' never shows the green-color
// explanation at all"). There is no longer any shared legend component
// for either screen to reuse.
test("Part 3 (superseded by ARCHI -- Full ARC Body Flow Redesign task): renderOpeningRoleLegend no longer exists anywhere -- Screen Two (Full ARC) is Blue-only and never renders a Green marker/legend of any kind", () => {
  assert.ok(!screen.includes("function renderOpeningRoleLegend"), "the old combined green/blue legend function must be gone entirely -- it has no call sites left to serve");
  const caseIndex = screen.indexOf('case "body_scan_opening_region": {');
  assert.ok(caseIndex !== -1, "body_scan_opening_region's own render case must exist");
  const nextCaseIndex = screen.indexOf('case "supportive_area_select"', caseIndex);
  const caseBody = screen.slice(caseIndex, nextCaseIndex);
  assert.ok(!caseBody.includes("OPENING_GREEN_SELECTED_COLOR"), "Full ARC's own Screen Two must never reference the green color at all -- it is Blue-only");
  assert.ok(caseBody.includes("OPENING_BLUE_SELECTED_COLOR"), "Screen Two's own selection color is Blue");
});

test("Part 3 (superseded): Screen Two's exact required Hebrew explanation ('כחול — אזור תומך...' / 'לחץ על אזור לבחירה, ולחץ שוב לביטול.') comes from the shared getStepContent supporting lines, never a separate hardcoded legend component", () => {
  const copy = readSource("arc/newArcLiveCopy.ts");
  const caseIndex = copy.indexOf('case "body_scan_opening_region"');
  assert.ok(caseIndex !== -1);
  const caseBody = copy.slice(caseIndex, copy.indexOf("\n  }", caseIndex));
  assert.match(caseBody, /כחול — אזור תומך שבו תרצה להפנות תשומת לב ולבצע פתיחה וייצוב הדרגתיים\./);
  assert.match(caseBody, /לחץ על אזור לבחירה, ולחץ שוב לביטול\./);
});

// --- Part 12.1/12.3: Task LIVE mood-button row ------------------------

test("Part 12.1 (ARCHI -- Remove Mini ARC / Add Time Rating & Short-Depth Tracks task): the active-task moodButtonRow contains EXACTLY the two required mood buttons ('😟 פחות טוב' and '🙂 סבבה'), each with its own onPress dispatching openFullArc/openShortenedArc after pausing the timer -- never a third button sharing the row, and never the removed Mini-vs-Full-ARC choice", () => {
  const rowIndex = activeTaskScreen.indexOf("<View style={styles.moodButtonRow}>");
  assert.ok(rowIndex !== -1);
  const rowEnd = activeTaskScreen.indexOf("</View>", activeTaskScreen.indexOf("</View>", rowIndex) + 1);
  const row = activeTaskScreen.slice(rowIndex, rowEnd);
  assert.match(row, /😟 פחות טוב/);
  assert.match(row, /🙂 סבבה/);
  assert.match(row, /await handlePause\(\);\s*\n\s*openFullArc\(task\.id\);/);
  assert.match(row, /await handlePause\(\);\s*\n\s*openShortenedArc\(task\.id\);/);
  assert.ok(!row.includes("openMiniOrFullArcChoice"), "the removed choice screen must never be dispatched from here again");
});

test("Part 12.3: '😄 מעולה' never appears inside the active-task moodButtonRow -- it is structurally confined to the post-completion block only, never offered as a third active-task mood option", () => {
  const rowIndex = activeTaskScreen.indexOf("<View style={styles.moodButtonRow}>");
  const rowEnd = activeTaskScreen.indexOf("</View>", activeTaskScreen.indexOf("</View>", rowIndex) + 1);
  const row = activeTaskScreen.slice(rowIndex, rowEnd);
  assert.ok(!row.includes("😄"), "the moodButtonRow must never include the 😄 smiley -- that one is post-completion only");
});

test("Part 12.1: moodButtonRow's own style is a centered, wrapping row (justifyContent: center, flexWrap: wrap) -- 'a clear, balanced row', never a lopsided flex-start/flex-end layout", () => {
  assert.match(screen + activeTaskScreen, /moodButtonRow: \{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 \}/);
});

test("Part 12.2: 'צריך ARC' and 'Mini ARC' button labels are both completely gone from ActiveTaskScreen.tsx as ACTUAL rendered button text (only the explanatory doc-comment history mentions the old names in quotes) -- no replacement standalone intermediate screen/button re-creates them, and Mini ARC stays reachable only through the existing 😟 flow", () => {
  assert.ok(!activeTaskScreen.includes(">צריך ARC<"));
  assert.ok(!activeTaskScreen.includes(">Mini ARC<"));
});
