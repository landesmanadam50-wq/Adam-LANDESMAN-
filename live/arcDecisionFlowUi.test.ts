import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/arcDecisionFlowUi.test.ts
 *
 * Source-text regression guard for the ONE shared ARC Decision UI,
 * used identically by both entry points -- same convention as every
 * other React Native screen test in this app (no component renderer
 * exists here). Guards the required 4-step order/copy, the "no
 * ranking/comparison/extra questions" constraints, and that options
 * stay in entry order through editing and choosing.
 *
 * Lives directly under live/ (not live/components/) so npm test's own
 * glob (package.json: "live/*.test.ts", never live/components/*.test.ts)
 * actually runs it.
 */
function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const flow = readSource("live/components/ArcDecisionFlow.tsx");

test("step 1 (options) asks the exact required question, gates advancing on canAdvanceFromArcDecisionOptions, and offers add/edit/delete", () => {
  assert.ok(flow.includes("בין אילו אפשרויות אתה מתלבט?"));
  assert.ok(flow.includes("canAdvanceFromArcDecisionOptions(session)"));
  assert.ok(flow.includes("disabled={!canAdvance}"));
  assert.ok(flow.includes("removeArcDecisionOption(session, option.id)"));
  assert.ok(flow.includes("updateArcDecisionOption(session, editingOptionId, editDraft)"));
  assert.ok(flow.includes("המשך לדמיון"));
});

test("step 2 (imagine_all) shows the exact required instruction, with no ranking/comparison/rating language and no auto-advance", () => {
  const stepIndex = flow.indexOf('session.currentStep === "imagine_all"');
  const stepBody = flow.slice(stepIndex, stepIndex + 500);
  assert.ok(stepBody.includes("עצום את העיניים ודמיין את כל האפשרויות שבחרת ביחד, בו־זמנית."));
  assert.ok(stepBody.includes("המשך לנקודה"));
});

test("step 3 (focus_point) shows a fixed, static point -- no animation/timer, user-paced continue", () => {
  const stepIndex = flow.indexOf('session.currentStep === "focus_point"');
  const stepBody = flow.slice(stepIndex, stepIndex + 600);
  assert.ok(stepBody.includes("פקח את העיניים והסתכל על הנקודה. מקד את תשומת הלב שלך בה."));
  assert.ok(stepBody.includes("styles.focusPoint"));
  assert.ok(stepBody.includes("המשך לבחירה"));
  assert.ok(!stepBody.includes("Animated"), "the focus point must never animate");
  assert.ok(!stepBody.includes("setTimeout") && !stepBody.includes("setInterval"), "nothing may force advancement on a timer");
});

test("step 4 (choose) shows exactly the original-order options, confirms 'בחרת: <text>' once chosen, and the finish action is fully left to the caller (finishLabel/onFinish)", () => {
  const chosenIndex = flow.indexOf("const chosen = resolveChosenArcDecisionOption(session);");
  const chooseBody = flow.slice(chosenIndex, chosenIndex + 1000);
  assert.ok(chooseBody.includes("באיזו אפשרות אתה בוחר?"));
  assert.ok(chooseBody.includes("session.options.map((option) =>"));
  assert.ok(chooseBody.includes("chooseArcDecisionOption(session, option.id)"));
  assert.ok(chooseBody.includes("`בחרת: ${chosen.text}`"));
  assert.ok(chooseBody.includes("onPress={() => onFinish(session, chosen)}"));
  assert.ok(chooseBody.includes("{finishLabel}"));
});

test("back navigation is offered on every step except the first, and cancel is always offered, without ever skipping steps itself", () => {
  assert.ok(flow.includes('session.currentStep !== "options"'));
  assert.ok(flow.includes("goToPreviousArcDecisionStep(session)"));
  assert.ok(flow.includes("onPress={onCancel}"));
});

test("the component never imports a timer, ranking, or comparison helper -- only the exact arc/arcDecision.ts functions the spec allows", () => {
  const importIndex = flow.indexOf('from "../../arc/arcDecision.ts"');
  const importLine = flow.slice(flow.lastIndexOf("import", importIndex), importIndex);
  assert.ok(!importLine.toLowerCase().includes("rank"));
  assert.ok(!flow.includes("prosAndCons") && !flow.includes("compareOption"));
  assert.ok(!flow.includes("setTimeout") && !flow.includes("setInterval"));
});
