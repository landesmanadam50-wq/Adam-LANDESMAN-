import test from "node:test";
import assert from "node:assert/strict";

import {
  addArcDecisionOption,
  advanceArcDecisionToChoose,
  advanceArcDecisionToFocusPoint,
  advanceArcDecisionToImagineAll,
  canAdvanceFromArcDecisionOptions,
  chooseArcDecisionOption,
  completeArcDecisionSession,
  createArcDecisionSession,
  goToPreviousArcDecisionStep,
  removeArcDecisionOption,
  resolveChosenArcDecisionOption,
  updateArcDecisionOption,
} from "./arcDecision.ts";

const NOW = "2026-01-05T12:00:00.000Z";

function sessionWithTwoOptions() {
  let session = createArcDecisionSession("arc_gym", null, null, NOW);
  session = addArcDecisionOption(session, "לצאת לרוץ");
  session = addArcDecisionOption(session, "לקרוא ספר");
  return session;
}

test("createArcDecisionSession starts at 'options' with no options, no choice, not completed", () => {
  const session = createArcDecisionSession("arc_gym", null, null, NOW);
  assert.equal(session.currentStep, "options");
  assert.deepEqual(session.options, []);
  assert.equal(session.chosenOptionId, null);
  assert.equal(session.completedAt, null);
  assert.equal(session.createdTaskId, null);
});

test("source/arcSessionId/activeTaskId are preserved exactly as given, for both entry points", () => {
  const fromGym = createArcDecisionSession("arc_gym", null, null, NOW);
  assert.equal(fromGym.source, "arc_gym");
  assert.equal(fromGym.arcSessionId, null);
  const fromArc = createArcDecisionSession("arc", "task-1", "task-1", NOW);
  assert.equal(fromArc.source, "arc");
  assert.equal(fromArc.arcSessionId, "task-1");
  assert.equal(fromArc.activeTaskId, "task-1");
});

test("addArcDecisionOption appends in entry order and ignores a blank entry", () => {
  let session = createArcDecisionSession("arc_gym", null, null, NOW);
  session = addArcDecisionOption(session, "אפשרות א");
  session = addArcDecisionOption(session, "   ");
  session = addArcDecisionOption(session, "אפשרות ב");
  assert.deepEqual(session.options.map((o) => o.text), ["אפשרות א", "אפשרות ב"]);
});

test("updateArcDecisionOption edits text in place, preserving id/order, and ignores a blank edit", () => {
  let session = sessionWithTwoOptions();
  const firstId = session.options[0].id;
  session = updateArcDecisionOption(session, firstId, "לצאת להליכה");
  assert.equal(session.options[0].id, firstId);
  assert.equal(session.options[0].text, "לצאת להליכה");
  session = updateArcDecisionOption(session, firstId, "   ");
  assert.equal(session.options[0].text, "לצאת להליכה");
});

test("removeArcDecisionOption removes the option and clears a matching chosenOptionId", () => {
  let session = sessionWithTwoOptions();
  const firstId = session.options[0].id;
  session = { ...session, chosenOptionId: firstId };
  session = removeArcDecisionOption(session, firstId);
  assert.equal(session.options.length, 1);
  assert.equal(session.chosenOptionId, null);
});

test("removeArcDecisionOption leaves an unrelated chosenOptionId untouched", () => {
  let session = sessionWithTwoOptions();
  const [first, second] = session.options;
  session = { ...session, chosenOptionId: second.id };
  session = removeArcDecisionOption(session, first.id);
  assert.equal(session.chosenOptionId, second.id);
});

test("canAdvanceFromArcDecisionOptions requires at least two options", () => {
  let session = createArcDecisionSession("arc_gym", null, null, NOW);
  assert.equal(canAdvanceFromArcDecisionOptions(session), false);
  session = addArcDecisionOption(session, "אחת");
  assert.equal(canAdvanceFromArcDecisionOptions(session), false);
  session = addArcDecisionOption(session, "שתיים");
  assert.equal(canAdvanceFromArcDecisionOptions(session), true);
});

test("advanceArcDecisionToImagineAll refuses to advance with fewer than two options", () => {
  let session = createArcDecisionSession("arc_gym", null, null, NOW);
  session = addArcDecisionOption(session, "אחת");
  session = advanceArcDecisionToImagineAll(session);
  assert.equal(session.currentStep, "options");
});

test("the full four-step order advances exactly as specified: options -> imagine_all -> focus_point -> choose", () => {
  let session = sessionWithTwoOptions();
  session = advanceArcDecisionToImagineAll(session);
  assert.equal(session.currentStep, "imagine_all");
  session = advanceArcDecisionToFocusPoint(session);
  assert.equal(session.currentStep, "focus_point");
  session = advanceArcDecisionToChoose(session);
  assert.equal(session.currentStep, "choose");
});

test("goToPreviousArcDecisionStep never goes below 'options'", () => {
  const session = sessionWithTwoOptions();
  assert.equal(goToPreviousArcDecisionStep(session).currentStep, "options");
});

test("goToPreviousArcDecisionStep walks back one step at a time", () => {
  let session = sessionWithTwoOptions();
  session = advanceArcDecisionToImagineAll(session);
  session = advanceArcDecisionToFocusPoint(session);
  session = advanceArcDecisionToChoose(session);
  session = goToPreviousArcDecisionStep(session);
  assert.equal(session.currentStep, "focus_point");
  session = goToPreviousArcDecisionStep(session);
  assert.equal(session.currentStep, "imagine_all");
  session = goToPreviousArcDecisionStep(session);
  assert.equal(session.currentStep, "options");
});

test("landing back on 'options' clears a prior chosenOptionId -- editing the list means choosing again", () => {
  let session = sessionWithTwoOptions();
  session = advanceArcDecisionToImagineAll(session);
  session = advanceArcDecisionToFocusPoint(session);
  session = advanceArcDecisionToChoose(session);
  session = chooseArcDecisionOption(session, session.options[0].id);
  assert.equal(session.chosenOptionId, session.options[0].id);
  session = goToPreviousArcDecisionStep(session);
  session = goToPreviousArcDecisionStep(session);
  session = goToPreviousArcDecisionStep(session);
  assert.equal(session.currentStep, "options");
  assert.equal(session.chosenOptionId, null);
});

test("chooseArcDecisionOption only accepts a real option id", () => {
  let session = sessionWithTwoOptions();
  session = advanceArcDecisionToChoose(advanceArcDecisionToFocusPoint(advanceArcDecisionToImagineAll(session)));
  const unchanged = chooseArcDecisionOption(session, "not-a-real-id");
  assert.equal(unchanged.chosenOptionId, null);
  const chosen = chooseArcDecisionOption(session, session.options[1].id);
  assert.equal(chosen.chosenOptionId, session.options[1].id);
});

test("resolveChosenArcDecisionOption resolves to the real option, or null when nothing is chosen", () => {
  let session = sessionWithTwoOptions();
  assert.equal(resolveChosenArcDecisionOption(session), null);
  session = chooseArcDecisionOption(session, session.options[1].id);
  assert.equal(resolveChosenArcDecisionOption(session)?.text, session.options[1].text);
});

test("completeArcDecisionSession stamps completedAt and the optional createdTaskId", () => {
  let session = sessionWithTwoOptions();
  session = chooseArcDecisionOption(session, session.options[0].id);
  const completed = completeArcDecisionSession(session, "2026-01-05T12:05:00.000Z", "task-99");
  assert.equal(completed.completedAt, "2026-01-05T12:05:00.000Z");
  assert.equal(completed.createdTaskId, "task-99");
});

test("completeArcDecisionSession defaults createdTaskId to null when the trainee never made a task", () => {
  const session = sessionWithTwoOptions();
  const completed = completeArcDecisionSession(session, "2026-01-05T12:05:00.000Z");
  assert.equal(completed.createdTaskId, null);
});
