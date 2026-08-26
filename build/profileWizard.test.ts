import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProfileFromDraft,
  createEmptyDraft,
  draftFromProfile,
  getFirstProfileStep,
  getNextProfileStep,
  getPreviousProfileStep,
  isDraftComplete,
} from "./profileWizard.ts";

function filledDraft(overrides: Partial<ReturnType<typeof createEmptyDraft>> = {}) {
  return {
    ...createEmptyDraft(),
    goal: "goal",
    arcType: "identity" as const,
    interferingState: "פחד",
    supportiveState: "חמלה",
    internalAction: "סריקת גוף",
    beneficialAction: "לגשת ולפתוח שיחה",
    regulationTool: "נשימה 4-7-8",
    ...overrides,
  };
}

test("first step is goal for a fresh draft", () => {
  assert.equal(getFirstProfileStep(createEmptyDraft()), "goal");
});

test("declining preventive and interfering action skips their description steps", () => {
  const draft = filledDraft({ hasPreventiveAction: false, hasInterferingAction: false });
  assert.equal(getNextProfileStep("preventiveActionAsk", draft), "interferingActionAsk");
  assert.equal(getNextProfileStep("interferingActionAsk", draft), "review");
});

test("accepting preventive action enters its description step", () => {
  const draft = filledDraft({ hasPreventiveAction: true });
  assert.equal(getNextProfileStep("preventiveActionAsk", draft), "preventiveActionDescription");
});

test("accepting interfering action enters its description then minutes steps", () => {
  const draft = filledDraft({ hasInterferingAction: true });
  assert.equal(getNextProfileStep("interferingActionAsk", draft), "interferingActionDescription");
  assert.equal(getNextProfileStep("interferingActionDescription", draft), "interferingActionMinutes");
  assert.equal(getNextProfileStep("interferingActionMinutes", draft), "review");
});

test("getPreviousProfileStep mirrors getNextProfileStep, skipping hidden steps", () => {
  const draft = filledDraft({ hasPreventiveAction: false, hasInterferingAction: false });
  assert.equal(getPreviousProfileStep("interferingActionAsk", draft), "preventiveActionAsk");
  assert.equal(getPreviousProfileStep("review", draft), "interferingActionAsk");
});

test("getPreviousProfileStep returns null before the first step", () => {
  assert.equal(getPreviousProfileStep("goal", createEmptyDraft()), null);
});

test("isDraftComplete is false until every required field is filled", () => {
  assert.equal(isDraftComplete(createEmptyDraft()), false);
  assert.equal(isDraftComplete(filledDraft()), true);
});

test("isDraftComplete requires the description when an optional action is accepted", () => {
  const draft = filledDraft({ hasPreventiveAction: true, preventiveActionDescription: "" });
  assert.equal(isDraftComplete(draft), false);
  assert.equal(isDraftComplete({ ...draft, preventiveActionDescription: "לצאת להליכה" }), true);
});

test("buildProfileFromDraft throws on an incomplete draft", () => {
  assert.throws(() => buildProfileFromDraft(createEmptyDraft()));
});

test("buildProfileFromDraft omits optional fields the trainee declined", () => {
  const draft = filledDraft({ hasPreventiveAction: false, hasInterferingAction: false, mantra: "" });
  const profile = buildProfileFromDraft(draft);
  assert.equal(profile.preventiveAction, undefined);
  assert.equal(profile.interferingAction, undefined);
  assert.equal(profile.mantra, undefined);
});

test("buildProfileFromDraft includes accepted optional fields", () => {
  const draft = filledDraft({
    hasPreventiveAction: true,
    preventiveActionDescription: "לצאת להליכה",
    hasInterferingAction: true,
    interferingActionDescription: "גלילה ברשת",
    interferingActionAllowedMinutes: 10,
    mantra: "אני בטוח כאן",
  });
  const profile = buildProfileFromDraft(draft);
  assert.equal(profile.preventiveAction?.description, "לצאת להליכה");
  assert.equal(profile.interferingAction?.description, "גלילה ברשת");
  assert.equal(profile.interferingAction?.allowedMinutes, 10);
  assert.equal(profile.mantra, "אני בטוח כאן");
});

test("draftFromProfile round-trips through buildProfileFromDraft", () => {
  const draft = filledDraft({
    hasPreventiveAction: true,
    preventiveActionDescription: "לצאת להליכה",
    hasInterferingAction: true,
    interferingActionDescription: "גלילה ברשת",
    interferingActionAllowedMinutes: 10,
    mantra: "אני בטוח כאן",
  });
  const profile = buildProfileFromDraft(draft);
  const roundTripped = draftFromProfile(profile);
  assert.deepEqual(roundTripped, draft);
});
