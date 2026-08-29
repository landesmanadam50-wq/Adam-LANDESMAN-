import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProfileFromDraft,
  createEmptyDraft,
  draftFromProfileAndSelection,
  selectionFromDraft,
  getFirstProfileStep,
  getNextProfileStep,
  getPreviousProfileStep,
  isGoalDraftComplete,
  isArcDraftComplete,
  resolvesNeedsIdentity,
  GOAL_STEP_ORDER,
  ARC_STEP_ORDER,
  type ProfileDraft,
} from "./profileWizard.ts";

function filledStateOnlyDraft(overrides: Partial<ProfileDraft> = {}): ProfileDraft {
  // "state" draft, but resolvesNeedsIdentity is always true when needsState is
  // true (program/selection.ts guarantees state programs also build identity),
  // so a complete state draft always carries identity fields too.
  return {
    ...createEmptyDraft(),
    goal: "להגיב לעצמי בצורה בונה יותר",
    needsState: true,
    needsIdentityImmediately: false,
    supportiveState: "חמלה",
    interferingState: "פחד",
    challengeContext: "אחרי טעות",
    internalAction: "סריקת גוף",
    desiredIdentity: "אומץ",
    identityInterferingEmotion: "פחד",
    habit: "גלילה ברשת",
    beneficialAction: "לגשת ולפתוח שיחה",
    regulationTool: "נשימה 4-7-8",
    hasPreventiveAction: false,
    ...overrides,
  };
}

function filledHabitOnlyDraft(overrides: Partial<ProfileDraft> = {}): ProfileDraft {
  return {
    ...createEmptyDraft(),
    goal: "ללמוד ביעילות",
    needsState: false,
    needsIdentityExplicit: false,
    habit: "גלילה ברשת",
    beneficialAction: "לגשת ולפתוח שיחה",
    regulationTool: "נשימה 4-7-8",
    hasPreventiveAction: false,
    ...overrides,
  };
}

// --- BUILD-GOAL step order ---------------------------------------------

test("first BUILD-GOAL step is goal for a fresh draft", () => {
  assert.equal(getFirstProfileStep(createEmptyDraft(), GOAL_STEP_ORDER), "goal");
});

test("goal is followed by habit, then beneficialAction, then needsState", () => {
  const draft = { ...createEmptyDraft(), goal: "x" };
  assert.equal(getNextProfileStep("goal", draft, GOAL_STEP_ORDER), "habit");
  assert.equal(getNextProfileStep("habit", { ...draft, habit: "x" }, GOAL_STEP_ORDER), "beneficialAction");
  assert.equal(getNextProfileStep("beneficialAction", { ...draft, habit: "x", beneficialAction: "x" }, GOAL_STEP_ORDER), "needsState");
});

test("needsState=true skips needsIdentityExplicit and asks needsIdentityImmediately instead", () => {
  const draft = filledStateOnlyDraft();
  assert.equal(getNextProfileStep("needsState", draft, GOAL_STEP_ORDER), "needsIdentityImmediately");
});

test("needsState=false skips needsIdentityImmediately and asks needsIdentityExplicit instead", () => {
  const draft = filledHabitOnlyDraft();
  assert.equal(getNextProfileStep("needsState", draft, GOAL_STEP_ORDER), "needsIdentityExplicit");
});

test("resolvesNeedsIdentity is always true when needsState is true, regardless of needsIdentityExplicit", () => {
  assert.equal(resolvesNeedsIdentity(filledStateOnlyDraft()), true);
});

test("resolvesNeedsIdentity follows needsIdentityExplicit when needsState is false", () => {
  assert.equal(resolvesNeedsIdentity(filledHabitOnlyDraft({ needsIdentityExplicit: false })), false);
  assert.equal(resolvesNeedsIdentity(filledHabitOnlyDraft({ needsIdentityExplicit: true })), true);
});

test("habit-only draft (identity not needed) skips straight from needsIdentityExplicit to Desired State/preventiveAction territory", () => {
  const draft = filledHabitOnlyDraft();
  // No identity fields, no state fields (needsState false) -- next visible step is preventiveActionAsk.
  assert.equal(getNextProfileStep("needsIdentityExplicit", draft, GOAL_STEP_ORDER), "preventiveActionAsk");
});

test("state path continues into identity questions after Desired State (advanced_2_week / standard_3_week both build identity)", () => {
  const draft = filledStateOnlyDraft();
  assert.equal(getNextProfileStep("needsIdentityImmediately", draft, GOAL_STEP_ORDER), "desiredIdentity");
  assert.equal(getNextProfileStep("identityInterferingEmotion", draft, GOAL_STEP_ORDER), "identityMantra");
  assert.equal(getNextProfileStep("identityMantra", draft, GOAL_STEP_ORDER), "supportiveState");
});

test("BUILD-GOAL ends after Desired State (internalAction) into preventiveAction/regulationTool -- never Challenge Context or Interfering State", () => {
  const draft = filledStateOnlyDraft();
  assert.equal(getNextProfileStep("internalAction", draft, GOAL_STEP_ORDER), "preventiveActionAsk");
  assert.ok(!GOAL_STEP_ORDER.includes("challengeContext"), "Challenge Context must never appear in BUILD-GOAL");
  assert.ok(!GOAL_STEP_ORDER.includes("interferingState"), "Interfering State must never appear in BUILD-GOAL");
});

test("declining preventive action skips its description step", () => {
  const draft = filledHabitOnlyDraft({ hasPreventiveAction: false });
  assert.equal(getNextProfileStep("preventiveActionAsk", draft, GOAL_STEP_ORDER), "regulationTool");
});

test("accepting preventive action enters its description step", () => {
  const draft = filledHabitOnlyDraft({ hasPreventiveAction: true, preventiveActionDescription: "לצאת להליכה" });
  assert.equal(getNextProfileStep("preventiveActionAsk", draft, GOAL_STEP_ORDER), "preventiveActionDescription");
});

test("getPreviousProfileStep mirrors getNextProfileStep, skipping hidden steps", () => {
  const draft = filledHabitOnlyDraft();
  assert.equal(getPreviousProfileStep("habit", draft, GOAL_STEP_ORDER), "goal");
  assert.equal(getPreviousProfileStep("goal", draft, GOAL_STEP_ORDER), null);
});

// --- BUILD-ARC step order -----------------------------------------------

test("first BUILD-ARC step is challengeContext", () => {
  assert.equal(getFirstProfileStep(filledStateOnlyDraft(), ARC_STEP_ORDER), "challengeContext");
});

test("BUILD-ARC walks challengeContext -> interferingState -> stateMantra -> stateBodyLanguageCue -> review", () => {
  const draft = filledStateOnlyDraft();
  assert.equal(getNextProfileStep("challengeContext", draft, ARC_STEP_ORDER), "interferingState");
  assert.equal(getNextProfileStep("interferingState", draft, ARC_STEP_ORDER), "stateMantra");
  assert.equal(getNextProfileStep("stateMantra", draft, ARC_STEP_ORDER), "stateBodyLanguageCue");
  assert.equal(getNextProfileStep("stateBodyLanguageCue", draft, ARC_STEP_ORDER), "review");
});

test("BUILD-ARC never asks for the Desired State itself", () => {
  assert.ok(!ARC_STEP_ORDER.includes("supportiveState"), "BUILD-ARC must reference, not re-ask, the Desired State");
});

// --- Completeness ---------------------------------------------------------

test("isGoalDraftComplete is false until every BUILD-GOAL field for the resolved path is filled, and never requires ARC fields", () => {
  assert.equal(isGoalDraftComplete(createEmptyDraft()), false);
  assert.equal(isGoalDraftComplete(filledStateOnlyDraft()), true);
  assert.equal(isGoalDraftComplete(filledHabitOnlyDraft()), true);
  // A fresh state draft that hasn't visited BUILD-ARC yet has no challengeContext/interferingState --
  // BUILD-GOAL must still be completable and saveable on its own.
  assert.equal(isGoalDraftComplete(filledStateOnlyDraft({ challengeContext: "", interferingState: "" })), true);
});

test("isGoalDraftComplete requires identity fields once resolvesNeedsIdentity is true", () => {
  const draft = filledStateOnlyDraft({ desiredIdentity: "", identityInterferingEmotion: "" });
  assert.equal(isGoalDraftComplete(draft), false);
});

test("isGoalDraftComplete requires goal regardless of which layers are needed", () => {
  assert.equal(isGoalDraftComplete(filledStateOnlyDraft({ goal: "" })), false);
  assert.equal(isGoalDraftComplete(filledHabitOnlyDraft({ goal: "" })), false);
});

test("isArcDraftComplete requires Challenge Context and Interfering State only when the state layer is active", () => {
  assert.equal(isArcDraftComplete(filledStateOnlyDraft()), true);
  assert.equal(isArcDraftComplete(filledStateOnlyDraft({ challengeContext: "" })), false);
  assert.equal(isArcDraftComplete(filledStateOnlyDraft({ interferingState: "" })), false);
  // No state layer -- vacuously complete, nothing to map.
  assert.equal(isArcDraftComplete(filledHabitOnlyDraft({ challengeContext: "", interferingState: "" })), true);
});

test("isArcDraftComplete does not require the optional Encoding cues (mantra/body-language)", () => {
  assert.equal(isArcDraftComplete(filledStateOnlyDraft({ stateMantra: "", stateBodyLanguageCue: "" })), true);
});

// --- BUILD-GOAL / BUILD-ARC data relationships -----------------------------

test("buildProfileFromDraft writes goal and Desired Habit (habit/beneficialAction) even before BUILD-ARC is ever visited", () => {
  const freshFromGoalOnly = filledStateOnlyDraft({ challengeContext: "", interferingState: "" });
  const profile = buildProfileFromDraft(freshFromGoalOnly);
  assert.equal(profile.goal, "להגיב לעצמי בצורה בונה יותר");
  assert.equal(profile.supportiveState, "חמלה", "Desired State is a BUILD-GOAL field");
  assert.equal(profile.interferingState, null, "not yet mapped -- null, not an empty string");
  assert.equal(profile.challengeContext, null, "not yet mapped -- null, not an empty string");
});

test("buildProfileFromDraft writes the ARC Map fields once BUILD-ARC has mapped them, without disturbing GOAL fields", () => {
  const profile = buildProfileFromDraft(filledStateOnlyDraft());
  assert.equal(profile.goal, "להגיב לעצמי בצורה בונה יותר");
  assert.equal(profile.supportiveState, "חמלה");
  assert.equal(profile.interferingState, "פחד");
  assert.equal(profile.challengeContext, "אחרי טעות");
});

test("identityAction is no longer its own question -- it's derived from beneficialAction (the same Desired Habit), never asked twice", () => {
  const profile = buildProfileFromDraft(filledStateOnlyDraft({ beneficialAction: "לגשת ולפתוח שיחה" }));
  assert.equal(profile.identityAction, "לגשת ולפתוח שיחה");
  assert.equal(profile.identityAction, profile.beneficialAction);
});

test("the state-layer encoding target is the Desired State (supportiveState), never the Interfering State", () => {
  const profile = buildProfileFromDraft(filledStateOnlyDraft({ stateMantra: "אני בטוח כאן" }));
  assert.equal(profile.stateEncoding?.target, "חמלה", "target must be supportiveState (Desired State), not interferingState");
  assert.notEqual(profile.stateEncoding?.target, profile.interferingState);
});

test("the state-layer encoding carries the body-language cue BUILD-ARC collects", () => {
  const profile = buildProfileFromDraft(filledStateOnlyDraft({ stateBodyLanguageCue: "כתפיים משוחררות" }));
  assert.equal(profile.stateEncoding?.bodyLanguageCue, "כתפיים משוחררות");
});

test("draftFromProfileAndSelection round-trips goal, challengeContext, and stateBodyLanguageCue, and defaults them safely for old profiles that predate these fields", () => {
  const draft = filledStateOnlyDraft({ stateBodyLanguageCue: "כתפיים משוחררות" });
  const profile = buildProfileFromDraft(draft);
  const selection = selectionFromDraft(draft);
  const roundTripped = draftFromProfileAndSelection(profile, selection);
  assert.equal(roundTripped.goal, draft.goal);
  assert.equal(roundTripped.challengeContext, draft.challengeContext);
  assert.equal(roundTripped.stateBodyLanguageCue, "כתפיים משוחררות");

  // Simulate an old, already-persisted profile from before goal/challengeContext/
  // stateEncoding.bodyLanguageCue existed -- JSON.parse of old stored data has no such keys.
  const legacyProfile = { ...profile } as typeof profile;
  delete (legacyProfile as { goal?: unknown }).goal;
  delete (legacyProfile as { challengeContext?: unknown }).challengeContext;
  const migrated = draftFromProfileAndSelection(legacyProfile, selection);
  assert.equal(migrated.goal, "", "missing goal on old data defaults to empty, not a crash");
  assert.equal(migrated.challengeContext, "", "missing challengeContext on old data defaults to empty, not a crash");
});

test("buildProfileFromDraft assigns standard_3_week when state is needed without immediate identity", () => {
  const profile = buildProfileFromDraft(filledStateOnlyDraft({ needsIdentityImmediately: false }));
  assert.equal(profile.programPath, "standard_3_week");
});

test("buildProfileFromDraft assigns advanced_2_week when identity is needed immediately", () => {
  const profile = buildProfileFromDraft(filledStateOnlyDraft({ needsIdentityImmediately: true }));
  assert.equal(profile.programPath, "advanced_2_week");
});

test("buildProfileFromDraft assigns habit_only_1_week when neither state nor identity is needed", () => {
  const profile = buildProfileFromDraft(filledHabitOnlyDraft());
  assert.equal(profile.programPath, "habit_only_1_week");
  assert.equal(profile.interferingState, null);
  assert.equal(profile.stateEncoding, null);
  assert.equal(profile.desiredIdentity, null);
  assert.equal(profile.identityAction, null);
});

test("buildProfileFromDraft assigns identity_habit_2_week when only identity is explicitly needed", () => {
  const profile = buildProfileFromDraft(
    filledHabitOnlyDraft({ needsIdentityExplicit: true, desiredIdentity: "אומץ", identityInterferingEmotion: "פחד" })
  );
  assert.equal(profile.programPath, "identity_habit_2_week");
  assert.equal(profile.desiredIdentity, "אומץ");
  assert.equal(profile.identityAction, profile.beneficialAction);
});

test("buildProfileFromDraft omits the state encoding when no mantra or body-language cue was given, includes it when given", () => {
  const withoutEncoding = buildProfileFromDraft(filledStateOnlyDraft({ stateMantra: "", stateBodyLanguageCue: "" }));
  assert.equal(withoutEncoding.stateEncoding, null);

  const withMantra = buildProfileFromDraft(filledStateOnlyDraft({ stateMantra: "אני בטוח כאן" }));
  assert.equal(withMantra.stateEncoding?.mantra, "אני בטוח כאן");

  const withCueOnly = buildProfileFromDraft(filledStateOnlyDraft({ stateMantra: "", stateBodyLanguageCue: "כתפיים משוחררות" }));
  assert.equal(withCueOnly.stateEncoding?.mantra, null);
  assert.equal(withCueOnly.stateEncoding?.bodyLanguageCue, "כתפיים משוחררות");
});

test("buildProfileFromDraft throws on an incomplete BUILD-GOAL draft", () => {
  assert.throws(() => buildProfileFromDraft(createEmptyDraft()));
});

test("draftFromProfileAndSelection prefers the persisted selection over the profile", () => {
  const draft = filledHabitOnlyDraft({ hasPreventiveAction: true, preventiveActionDescription: "לצאת להליכה" });
  const profile = buildProfileFromDraft(draft);
  const selection = selectionFromDraft(draft);
  const roundTripped = draftFromProfileAndSelection(profile, selection);
  assert.equal(roundTripped.needsState, false);
  assert.equal(roundTripped.needsIdentityExplicit, false);
  assert.equal(roundTripped.habit, draft.habit);
  assert.equal(roundTripped.hasPreventiveAction, true);
  assert.equal(roundTripped.preventiveActionDescription, "לצאת להליכה");
});

test("draftFromProfileAndSelection falls back to the legacy programPath when no selection was ever saved", () => {
  const draft = filledStateOnlyDraft();
  const profile = buildProfileFromDraft(draft); // programPath: standard_3_week or advanced_2_week
  const roundTripped = draftFromProfileAndSelection(profile, null);
  assert.equal(roundTripped.needsState, true, "standard/advanced programPath implies needsState");
});

test("selectionFromDraft always sets needsHabit true for the current four presets", () => {
  const selection = selectionFromDraft(filledHabitOnlyDraft());
  assert.equal(selection.needsHabit, true);
  assert.equal(selection.programPath, "habit_only_1_week");
});

test("selectionFromDraft throws on an incomplete draft (no needsState answer yet)", () => {
  assert.throws(() => selectionFromDraft(createEmptyDraft()));
});
