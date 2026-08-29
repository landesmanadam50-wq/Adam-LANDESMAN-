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
  isStateArcDraftComplete,
  isIdentityArcDraftComplete,
  resolvesNeedsIdentity,
  GOAL_STEP_ORDER,
  STATE_ARC_STEP_ORDER,
  IDENTITY_ARC_STEP_ORDER,
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
    identityChallengeContext: "לפני שיחה קשה",
    identityInterferingEmotion: "פחד",
    habit: "גלילה ברשת",
    beneficialAction: "לגשת ולפתוח שיחה",
    regulationTool: "נשימה 4-7-8",
    hasPreventiveAction: false,
    ...overrides,
  };
}

/** A "2-week program" draft (advanced_2_week): both state ("Focus") and identity ("Discipline") targets active together from week 1 -- see program/config.ts. */
function filledTwoWeekDraft(overrides: Partial<ProfileDraft> = {}): ProfileDraft {
  return filledStateOnlyDraft({
    needsIdentityImmediately: true,
    supportiveState: "מיקוד", // "Focus"
    desiredIdentity: "משמעת עצמית", // "Discipline"
    ...overrides,
  });
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

test("state path continues into identity questions after needsIdentityImmediately, ending BUILD-GOAL with Desired State (internalAction) -- never the identity ARC Map fields", () => {
  const draft = filledStateOnlyDraft();
  assert.equal(getNextProfileStep("needsIdentityImmediately", draft, GOAL_STEP_ORDER), "desiredIdentity");
  assert.equal(getNextProfileStep("desiredIdentity", draft, GOAL_STEP_ORDER), "supportiveState");
  assert.equal(getNextProfileStep("internalAction", draft, GOAL_STEP_ORDER), "preventiveActionAsk");
});

test("BUILD-GOAL never includes either target's ARC Map fields (Challenge Context, Interfering State, Encoding cues)", () => {
  for (const step of ["challengeContext", "interferingState", "stateMantra", "stateBodyLanguageCue", "identityChallengeContext", "identityInterferingEmotion", "identityMantra", "identityBodyLanguageCue"] as const) {
    assert.ok(!GOAL_STEP_ORDER.includes(step), `${step} must never appear in BUILD-GOAL`);
  }
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

// --- BUILD-ARC step orders: two independent targets ----------------------

test("first STATE ARC step is challengeContext; first IDENTITY ARC step is identityChallengeContext", () => {
  assert.equal(getFirstProfileStep(filledTwoWeekDraft(), STATE_ARC_STEP_ORDER), "challengeContext");
  assert.equal(getFirstProfileStep(filledTwoWeekDraft(), IDENTITY_ARC_STEP_ORDER), "identityChallengeContext");
});

test("STATE_ARC_STEP_ORDER walks challengeContext -> interferingState -> statePreventiveAction -> stateMantra -> stateBodyLanguageCue -> review", () => {
  const draft = filledStateOnlyDraft();
  assert.equal(getNextProfileStep("challengeContext", draft, STATE_ARC_STEP_ORDER), "interferingState");
  assert.equal(getNextProfileStep("interferingState", draft, STATE_ARC_STEP_ORDER), "statePreventiveAction");
  assert.equal(getNextProfileStep("statePreventiveAction", draft, STATE_ARC_STEP_ORDER), "stateMantra");
  assert.equal(getNextProfileStep("stateMantra", draft, STATE_ARC_STEP_ORDER), "stateBodyLanguageCue");
  assert.equal(getNextProfileStep("stateBodyLanguageCue", draft, STATE_ARC_STEP_ORDER), "review");
});

test("IDENTITY_ARC_STEP_ORDER walks identityChallengeContext -> identityInterferingEmotion -> identityPreventiveAction -> identityMantra -> identityBodyLanguageCue -> review, independently of STATE_ARC_STEP_ORDER", () => {
  const draft = filledTwoWeekDraft();
  assert.equal(getNextProfileStep("identityChallengeContext", draft, IDENTITY_ARC_STEP_ORDER), "identityInterferingEmotion");
  assert.equal(getNextProfileStep("identityInterferingEmotion", draft, IDENTITY_ARC_STEP_ORDER), "identityPreventiveAction");
  assert.equal(getNextProfileStep("identityPreventiveAction", draft, IDENTITY_ARC_STEP_ORDER), "identityMantra");
  assert.equal(getNextProfileStep("identityMantra", draft, IDENTITY_ARC_STEP_ORDER), "identityBodyLanguageCue");
  assert.equal(getNextProfileStep("identityBodyLanguageCue", draft, IDENTITY_ARC_STEP_ORDER), "review");
});

test("neither BUILD-ARC step order ever asks for the Desired State/Identity itself -- both only reference it", () => {
  assert.ok(!STATE_ARC_STEP_ORDER.includes("supportiveState"), "STATE ARC must reference, not re-ask, the Desired State");
  assert.ok(!IDENTITY_ARC_STEP_ORDER.includes("desiredIdentity"), "IDENTITY ARC must reference, not re-ask, the Desired Identity");
});

test("STATE_ARC_STEP_ORDER and IDENTITY_ARC_STEP_ORDER touch entirely disjoint ProfileDraft fields -- no shared field two targets could fight over", () => {
  const stateFields = new Set(STATE_ARC_STEP_ORDER.filter((s) => s !== "review"));
  const identityFields = new Set(IDENTITY_ARC_STEP_ORDER.filter((s) => s !== "review"));
  for (const field of stateFields) {
    assert.ok(!identityFields.has(field), `"${field}" must not appear in both ARC step orders`);
  }
});

// --- Completeness ---------------------------------------------------------

test("isGoalDraftComplete is false until every BUILD-GOAL field for the resolved path is filled, and never requires either ARC Map's fields", () => {
  assert.equal(isGoalDraftComplete(createEmptyDraft()), false);
  assert.equal(isGoalDraftComplete(filledStateOnlyDraft()), true);
  assert.equal(isGoalDraftComplete(filledHabitOnlyDraft()), true);
  // A fresh two-target draft that hasn't visited BUILD-ARC for either target yet --
  // BUILD-GOAL must still be completable and saveable on its own.
  assert.equal(
    isGoalDraftComplete(
      filledTwoWeekDraft({ challengeContext: "", interferingState: "", identityChallengeContext: "", identityInterferingEmotion: "" })
    ),
    true
  );
});

test("isGoalDraftComplete requires desiredIdentity once resolvesNeedsIdentity is true, but not identityInterferingEmotion/identityChallengeContext (those are BUILD-ARC's job now)", () => {
  assert.equal(isGoalDraftComplete(filledStateOnlyDraft({ desiredIdentity: "" })), false);
  assert.equal(isGoalDraftComplete(filledStateOnlyDraft({ identityInterferingEmotion: "", identityChallengeContext: "" })), true);
});

test("isGoalDraftComplete requires goal regardless of which layers are needed", () => {
  assert.equal(isGoalDraftComplete(filledStateOnlyDraft({ goal: "" })), false);
  assert.equal(isGoalDraftComplete(filledHabitOnlyDraft({ goal: "" })), false);
});

test("isStateArcDraftComplete requires Challenge Context and Interfering State only when the state layer is active", () => {
  assert.equal(isStateArcDraftComplete(filledStateOnlyDraft()), true);
  assert.equal(isStateArcDraftComplete(filledStateOnlyDraft({ challengeContext: "" })), false);
  assert.equal(isStateArcDraftComplete(filledStateOnlyDraft({ interferingState: "" })), false);
  // No state layer -- vacuously complete, nothing to map.
  assert.equal(isStateArcDraftComplete(filledHabitOnlyDraft({ challengeContext: "", interferingState: "" })), true);
});

test("isIdentityArcDraftComplete requires Challenge Context and Interfering Emotion only when identity is needed, independently of isStateArcDraftComplete", () => {
  assert.equal(isIdentityArcDraftComplete(filledTwoWeekDraft()), true);
  assert.equal(isIdentityArcDraftComplete(filledTwoWeekDraft({ identityChallengeContext: "" })), false);
  assert.equal(isIdentityArcDraftComplete(filledTwoWeekDraft({ identityInterferingEmotion: "" })), false);
  // Leaving the state ARC Map incomplete must not affect the identity ARC Map's own completeness, and vice versa.
  assert.equal(isIdentityArcDraftComplete(filledTwoWeekDraft({ challengeContext: "", interferingState: "" })), true);
  assert.equal(isStateArcDraftComplete(filledTwoWeekDraft({ identityChallengeContext: "", identityInterferingEmotion: "" })), true);
});

test("neither *ArcDraftComplete check requires the optional Encoding cues (mantra/body-language)", () => {
  assert.equal(isStateArcDraftComplete(filledStateOnlyDraft({ stateMantra: "", stateBodyLanguageCue: "" })), true);
  assert.equal(isIdentityArcDraftComplete(filledTwoWeekDraft({ identityMantra: "", identityBodyLanguageCue: "" })), true);
});

// --- Multi-target ARC Maps: the actual bug this file guards against -------
//
// "I can edit the ARC Map around Focus, but I cannot separately access/edit
// the ARC Map around Discipline, including when using the 2-week program
// route." Root cause: identityInterferingEmotion lived in BUILD-GOAL (not
// independently editable) and there was no identityChallengeContext field
// at all, so a second, identity-layer ARC Map had nowhere to live. These
// tests prove both targets are now independently mappable and that editing
// one never touches the other.

test("a two-target (advanced_2_week / 2-week route) draft resolves to advanced_2_week and both targets have real, distinct labels", () => {
  const draft = filledTwoWeekDraft();
  const profile = buildProfileFromDraft(draft);
  assert.equal(profile.programPath, "advanced_2_week");
  assert.equal(profile.supportiveState, "מיקוד");
  assert.equal(profile.desiredIdentity, "משמעת עצמית");
  assert.notEqual(profile.supportiveState, profile.desiredIdentity);
});

test("editing the state (Focus) ARC Map does not touch the identity (Discipline) ARC Map's fields", () => {
  const original = filledTwoWeekDraft();
  const editedState = { ...original, interferingState: "עייפות", challengeContext: "בבוקר" };
  const profile = buildProfileFromDraft(editedState);

  assert.equal(profile.interferingState, "עייפות", "the edited field changed");
  assert.equal(profile.identityInterferingEmotion, original.identityInterferingEmotion, "the OTHER target's field is untouched");
  assert.equal(profile.identityChallengeContext, original.identityChallengeContext, "the OTHER target's field is untouched");
  assert.equal(profile.desiredIdentity, original.desiredIdentity, "the OTHER target's Desired State itself is untouched");
});

test("editing the identity (Discipline) ARC Map does not touch the state (Focus) ARC Map's fields", () => {
  const original = filledTwoWeekDraft();
  const editedIdentity = { ...original, identityInterferingEmotion: "דחיינות", identityChallengeContext: "בסוף היום" };
  const profile = buildProfileFromDraft(editedIdentity);

  assert.equal(profile.identityInterferingEmotion, "דחיינות", "the edited field changed");
  assert.equal(profile.interferingState, original.interferingState, "the OTHER target's field is untouched");
  assert.equal(profile.challengeContext, original.challengeContext, "the OTHER target's field is untouched");
  assert.equal(profile.supportiveState, original.supportiveState, "the OTHER target's Desired State itself is untouched");
});

test("both ARC Maps can independently reach a complete state, and completing one does not require or imply completing the other", () => {
  const onlyStateMapped = filledTwoWeekDraft({ identityChallengeContext: "", identityInterferingEmotion: "" });
  assert.equal(isStateArcDraftComplete(onlyStateMapped), true);
  assert.equal(isIdentityArcDraftComplete(onlyStateMapped), false);

  const onlyIdentityMapped = filledTwoWeekDraft({ challengeContext: "", interferingState: "" });
  assert.equal(isStateArcDraftComplete(onlyIdentityMapped), false);
  assert.equal(isIdentityArcDraftComplete(onlyIdentityMapped), true);

  const bothMapped = filledTwoWeekDraft();
  assert.equal(isStateArcDraftComplete(bothMapped), true);
  assert.equal(isIdentityArcDraftComplete(bothMapped), true);
});

test("the identity layer's Encoding carries its own body-language cue and mantra, independent of the state layer's", () => {
  const profile = buildProfileFromDraft(filledTwoWeekDraft({ identityMantra: "אני ממושמע", identityBodyLanguageCue: "גב זקוף", stateMantra: "אני ממוקד", stateBodyLanguageCue: "כתפיים משוחררות" }));
  assert.equal(profile.identityEncoding?.mantra, "אני ממושמע");
  assert.equal(profile.identityEncoding?.bodyLanguageCue, "גב זקוף");
  assert.equal(profile.stateEncoding?.mantra, "אני ממוקד");
  assert.equal(profile.stateEncoding?.bodyLanguageCue, "כתפיים משוחררות");
  assert.notEqual(profile.identityEncoding?.target, profile.stateEncoding?.target, "each Encoding targets its own Desired State");
});

test("draftFromProfileAndSelection round-trips both ARC Maps independently after a two-target save", () => {
  const draft = filledTwoWeekDraft();
  const profile = buildProfileFromDraft(draft);
  const selection = selectionFromDraft(draft);
  const roundTripped = draftFromProfileAndSelection(profile, selection);

  assert.equal(roundTripped.challengeContext, draft.challengeContext);
  assert.equal(roundTripped.interferingState, draft.interferingState);
  assert.equal(roundTripped.identityChallengeContext, draft.identityChallengeContext);
  assert.equal(roundTripped.identityInterferingEmotion, draft.identityInterferingEmotion);
});

test("a profile that predates identityChallengeContext (old data) still loads safely, defaulting the new field to empty rather than crashing", () => {
  const draft = filledTwoWeekDraft();
  const profile = buildProfileFromDraft(draft);
  const selection = selectionFromDraft(draft);

  const legacyProfile = { ...profile } as typeof profile;
  delete (legacyProfile as { identityChallengeContext?: unknown }).identityChallengeContext;
  const migrated = draftFromProfileAndSelection(legacyProfile, selection);
  assert.equal(migrated.identityChallengeContext, "", "missing identityChallengeContext on old data defaults to empty, not a crash");
  assert.equal(migrated.identityInterferingEmotion, draft.identityInterferingEmotion, "the sibling field, which did exist on old data, is unaffected");
});

// --- BUILD-GOAL / BUILD-ARC data relationships -----------------------------

test("buildProfileFromDraft writes goal and Desired Habit (habit/beneficialAction) even before BUILD-ARC is ever visited", () => {
  const freshFromGoalOnly = filledStateOnlyDraft({ challengeContext: "", interferingState: "", identityChallengeContext: "", identityInterferingEmotion: "" });
  const profile = buildProfileFromDraft(freshFromGoalOnly);
  assert.equal(profile.goal, "להגיב לעצמי בצורה בונה יותר");
  assert.equal(profile.supportiveState, "חמלה", "Desired State is a BUILD-GOAL field");
  assert.equal(profile.interferingState, null, "not yet mapped -- null, not an empty string");
  assert.equal(profile.challengeContext, null, "not yet mapped -- null, not an empty string");
  assert.equal(profile.identityChallengeContext, null, "not yet mapped -- null, not an empty string");
  assert.equal(profile.identityInterferingEmotion, null, "not yet mapped -- null, not an empty string");
});

test("buildProfileFromDraft writes the state ARC Map fields once BUILD-ARC has mapped them, without disturbing GOAL fields", () => {
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
    filledHabitOnlyDraft({ needsIdentityExplicit: true, desiredIdentity: "אומץ", identityChallengeContext: "לפני מבחן", identityInterferingEmotion: "פחד" })
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
