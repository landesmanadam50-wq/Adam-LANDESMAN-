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
import type { ArcBuildProfile } from "../arc/types.ts";

function filledStateOnlyDraft(overrides: Partial<ProfileDraft> = {}): ProfileDraft {
  // "state" draft, but resolvesNeedsIdentity is always true when needsState is
  // true (program/selection.ts guarantees state programs also build identity),
  // so a complete state draft always carries identity fields too.
  return {
    ...createEmptyDraft(),
    goal: "להגיב לעצמי בצורה בונה יותר",
    presenceColor: "סגול",
    needsState: true,
    needsIdentityImmediately: false,
    supportiveState: "חמלה",
    interferingState: "פחד",
    challengeContext: "אחרי טעות",
    internalAction: "סריקת גוף",
    desiredIdentity: "אומץ",
    identityChallengeContext: "לפני שיחה קשה",
    identityInterferingEmotion: "פחד",
    negativeActionReductionEnabled: true,
    habit: "גלילה ברשת",
    negativeActionBaseDurationMinutes: 10,
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
    presenceColor: "כחול",
    needsState: false,
    needsIdentityExplicit: false,
    negativeActionReductionEnabled: true,
    habit: "גלילה ברשת",
    negativeActionBaseDurationMinutes: 10,
    beneficialAction: "לגשת ולפתוח שיחה",
    regulationTool: "נשימה 4-7-8",
    hasPreventiveAction: false,
    ...overrides,
  };
}

// --- BUILD-GOAL step order ---------------------------------------------

test("first GOAL phase step is presenceColor for a fresh draft -- Presence Color task: asked before anything else, ahead of negativeActionEnabledAsk", () => {
  assert.equal(getFirstProfileStep(createEmptyDraft(), GOAL_STEP_ORDER), "presenceColor");
});

test("answering presenceColor moves to negativeActionEnabledAsk -- ARC Builds task: no standalone 'goal' step any more, the ArcBuild's own name replaces it", () => {
  const draft = { ...createEmptyDraft(), goal: "x", presenceColor: "סגול" };
  assert.equal(getNextProfileStep("presenceColor", draft, GOAL_STEP_ORDER), "negativeActionEnabledAsk");
});

test("answering negativeActionEnabledAsk 'לא' (false) skips both habit and negativeActionDuration entirely, going straight to beneficialAction", () => {
  const draft = { ...createEmptyDraft(), goal: "x", presenceColor: "סגול", negativeActionReductionEnabled: false };
  assert.equal(getNextProfileStep("negativeActionEnabledAsk", draft, GOAL_STEP_ORDER), "beneficialAction");
});

test("answering negativeActionEnabledAsk 'כן' (true) walks habit, then negativeActionDuration, then beneficialAction -- coordinated timer/dwell task (Part 12): negativeActionDuration sits right after habit, the ONE place the current target Habit's real timer duration is configured", () => {
  const draft = { ...createEmptyDraft(), goal: "x", presenceColor: "סגול", negativeActionReductionEnabled: true };
  assert.equal(getNextProfileStep("negativeActionEnabledAsk", draft, GOAL_STEP_ORDER), "habit");
  assert.equal(getNextProfileStep("habit", { ...draft, habit: "x" }, GOAL_STEP_ORDER), "negativeActionDuration");
  assert.equal(
    getNextProfileStep("negativeActionDuration", { ...draft, habit: "x", negativeActionBaseDurationMinutes: 10 }, GOAL_STEP_ORDER),
    "beneficialAction"
  );
  assert.equal(
    getNextProfileStep("beneficialAction", { ...draft, habit: "x", negativeActionBaseDurationMinutes: 10, beneficialAction: "x" }, GOAL_STEP_ORDER),
    "beneficialActionBodyCue",
    "Action Body Cue task: the optional Action Body Cue question sits right after beneficialAction"
  );
  assert.equal(
    getNextProfileStep(
      "beneficialActionBodyCue",
      { ...draft, habit: "x", negativeActionBaseDurationMinutes: 10, beneficialAction: "x" },
      GOAL_STEP_ORDER
    ),
    "needsState"
  );
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
  assert.equal(
    getNextProfileStep("internalAction", draft, GOAL_STEP_ORDER),
    "internalActionBodyCue",
    "Action Body Cue task: the optional Action Body Cue question sits right after internalAction"
  );
  assert.equal(getNextProfileStep("internalActionBodyCue", draft, GOAL_STEP_ORDER), "preventiveActionAsk");
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
  assert.equal(getPreviousProfileStep("habit", draft, GOAL_STEP_ORDER), "negativeActionEnabledAsk");
  assert.equal(
    getPreviousProfileStep("negativeActionEnabledAsk", draft, GOAL_STEP_ORDER),
    "presenceColor",
    "Presence Color task: presenceColor is now the step right before negativeActionEnabledAsk"
  );
  assert.equal(
    getPreviousProfileStep("presenceColor", draft, GOAL_STEP_ORDER),
    null,
    "presenceColor is now the first GOAL phase step -- no 'goal' step precedes it any more"
  );
});

// --- BUILD-ARC step orders: two independent targets ----------------------

test("first STATE ARC step is challengeContext; first IDENTITY ARC step is identityChallengeContext", () => {
  assert.equal(getFirstProfileStep(filledTwoWeekDraft(), STATE_ARC_STEP_ORDER), "challengeContext");
  assert.equal(getFirstProfileStep(filledTwoWeekDraft(), IDENTITY_ARC_STEP_ORDER), "identityChallengeContext");
});

test("STATE_ARC_STEP_ORDER walks challengeContext -> interferingState -> statePreventiveAction -> stateEncodingRegulationCueAsk -> stateMantra -> stateBodyLanguageCue -> dwellTimes -> review, skipping the short-cue text step when 'use same cue' (or nothing) was chosen", () => {
  const draft = filledStateOnlyDraft();
  assert.equal(getNextProfileStep("challengeContext", draft, STATE_ARC_STEP_ORDER), "interferingState");
  assert.equal(getNextProfileStep("interferingState", draft, STATE_ARC_STEP_ORDER), "statePreventiveAction");
  assert.equal(getNextProfileStep("statePreventiveAction", draft, STATE_ARC_STEP_ORDER), "stateEncodingRegulationCueAsk");
  assert.equal(getNextProfileStep("stateEncodingRegulationCueAsk", draft, STATE_ARC_STEP_ORDER), "stateMantra");
  assert.equal(getNextProfileStep("stateMantra", draft, STATE_ARC_STEP_ORDER), "stateBodyLanguageCue");
  assert.equal(getNextProfileStep("stateBodyLanguageCue", draft, STATE_ARC_STEP_ORDER), "dwellTimes");
  assert.equal(getNextProfileStep("dwellTimes", draft, STATE_ARC_STEP_ORDER), "review");
});

test("IDENTITY_ARC_STEP_ORDER walks identityChallengeContext -> identityInterferingEmotion -> identityPreventiveAction -> identityEncodingRegulationCueAsk -> identityMantra -> identityBodyLanguageCue -> dwellTimes -> review, independently of STATE_ARC_STEP_ORDER", () => {
  const draft = filledTwoWeekDraft();
  assert.equal(getNextProfileStep("identityChallengeContext", draft, IDENTITY_ARC_STEP_ORDER), "identityInterferingEmotion");
  assert.equal(getNextProfileStep("identityInterferingEmotion", draft, IDENTITY_ARC_STEP_ORDER), "identityPreventiveAction");
  assert.equal(getNextProfileStep("identityPreventiveAction", draft, IDENTITY_ARC_STEP_ORDER), "identityEncodingRegulationCueAsk");
  assert.equal(getNextProfileStep("identityEncodingRegulationCueAsk", draft, IDENTITY_ARC_STEP_ORDER), "identityMantra");
  assert.equal(getNextProfileStep("identityMantra", draft, IDENTITY_ARC_STEP_ORDER), "identityBodyLanguageCue");
  assert.equal(getNextProfileStep("identityBodyLanguageCue", draft, IDENTITY_ARC_STEP_ORDER), "dwellTimes");
  assert.equal(getNextProfileStep("dwellTimes", draft, IDENTITY_ARC_STEP_ORDER), "review");
});

test("neither BUILD-ARC step order ever asks for the Desired State/Identity itself -- both only reference it", () => {
  assert.ok(!STATE_ARC_STEP_ORDER.includes("supportiveState"), "STATE ARC must reference, not re-ask, the Desired State");
  assert.ok(!IDENTITY_ARC_STEP_ORDER.includes("desiredIdentity"), "IDENTITY ARC must reference, not re-ask, the Desired Identity");
});

test("STATE_ARC_STEP_ORDER and IDENTITY_ARC_STEP_ORDER touch entirely disjoint ProfileDraft fields -- no shared field two targets could fight over", () => {
  // "review" and "dwellTimes" are shared STEP names (both step orders visit
  // a step called "dwellTimes"), but each resolves to its own disjoint set
  // of ProfileDraft fields per target (stateSensationDwellSeconds vs.
  // identitySensationDwellSeconds, etc. -- see build/ArcMapScreen.tsx's
  // dwellDraftFieldFor) -- excluded here the same way "review" already is.
  const stateFields = new Set(STATE_ARC_STEP_ORDER.filter((s) => s !== "review" && s !== "dwellTimes"));
  const identityFields = new Set(IDENTITY_ARC_STEP_ORDER.filter((s) => s !== "review" && s !== "dwellTimes"));
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

// --- Presence Color task ---------------------------------------------------

test("createEmptyDraft defaults presenceColor to an empty string", () => {
  assert.equal(createEmptyDraft().presenceColor, "");
});

test("isGoalDraftComplete requires presenceColor regardless of which layers are needed -- a legacy build missing it (empty draft value) cannot pass completeness until it's filled in", () => {
  assert.equal(isGoalDraftComplete(filledStateOnlyDraft({ presenceColor: "" })), false);
  assert.equal(isGoalDraftComplete(filledHabitOnlyDraft({ presenceColor: "" })), false);
  assert.equal(isGoalDraftComplete(filledStateOnlyDraft({ presenceColor: "   " })), false, "whitespace-only does not count as answered");
});

test("buildProfileFromDraft persists the trimmed presenceColor exactly as entered", () => {
  const profile = buildProfileFromDraft(filledStateOnlyDraft({ presenceColor: "  סגול  " }));
  assert.equal(profile.presenceColor, "סגול");
});

test("draftFromProfileAndSelection round-trips presenceColor, and defaults a legacy profile that predates the field (genuinely absent, not null) to an empty string rather than crashing or rendering a placeholder", () => {
  const draft = filledStateOnlyDraft({ presenceColor: "ירוק" });
  const profile = buildProfileFromDraft(draft);
  const selection = selectionFromDraft(draft);
  const roundTripped = draftFromProfileAndSelection(profile, selection);
  assert.equal(roundTripped.presenceColor, "ירוק");

  const legacyProfile = { ...profile } as typeof profile;
  delete (legacyProfile as { presenceColor?: unknown }).presenceColor;
  const migrated = draftFromProfileAndSelection(legacyProfile, selection);
  assert.equal(migrated.presenceColor, "", "missing presenceColor on old data defaults to empty, not a crash, never the literal string \"undefined\"");
});

test("two different ArcBuild drafts retain two different presenceColor values -- editing one never touches the other", () => {
  const purpleProfile = buildProfileFromDraft(filledStateOnlyDraft({ presenceColor: "סגול" }));
  const greenProfile = buildProfileFromDraft(filledHabitOnlyDraft({ presenceColor: "ירוק" }));
  assert.equal(purpleProfile.presenceColor, "סגול");
  assert.equal(greenProfile.presenceColor, "ירוק");
  assert.notEqual(purpleProfile.presenceColor, greenProfile.presenceColor);
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
});

test("a profile stored before the Short Encoding Regulation Cue fields existed loads safely -- defaults to empty text and an undecided (not 'B') choice, rather than crashing", () => {
  const draft = filledTwoWeekDraft();
  const profile = buildProfileFromDraft(draft);
  const selection = selectionFromDraft(draft);

  const legacyProfile = { ...profile } as typeof profile;
  delete (legacyProfile as { stateEncodingRegulationCue?: unknown }).stateEncodingRegulationCue;
  delete (legacyProfile as { identityEncodingRegulationCue?: unknown }).identityEncodingRegulationCue;
  const migrated = draftFromProfileAndSelection(legacyProfile, selection);
  assert.equal(migrated.stateEncodingRegulationCue, "");
  assert.equal(migrated.identityEncodingRegulationCue, "");
  assert.equal(migrated.stateWantsShortEncodingRegulationCue, null, "never presumed 'A' (same cue) for a trainee who never saw this step");
  assert.equal(migrated.identityWantsShortEncodingRegulationCue, null);
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

// --- Dwell-time task: BUILD-ARC's "זמן שהייה" step (#A, #B, #F) ----------

test("createEmptyDraft's five dwell fields per target default to the exact specified seconds", () => {
  const draft = createEmptyDraft();
  assert.equal(draft.stateSensationDwellSeconds, "8");
  assert.equal(draft.stateAcceptanceDwellSeconds, "8");
  assert.equal(draft.stateRegulationDwellSeconds, "12");
  assert.equal(draft.stateEncodingDwellSeconds, "10");
  assert.equal(draft.stateActionImageryDwellSeconds, "8");
  assert.equal(draft.identitySensationDwellSeconds, "8");
  assert.equal(draft.identityAcceptanceDwellSeconds, "8");
  assert.equal(draft.identityRegulationDwellSeconds, "12");
  assert.equal(draft.identityEncodingDwellSeconds, "10");
  assert.equal(draft.identityActionImageryDwellSeconds, "8");
});

// --- Negative Action reduction task: the optional habit-reduction
// tool -- free-text negative action (habit) + 1-15 minute duration
// (negativeActionBaseDurationMinutes), both gated on the explicit
// negativeActionEnabledAsk opt-in, configured in GOAL BUILD -- the ONE
// place this is set; LIVE never asks for it again.

test("buildProfileFromDraft persists both habit and negativeActionBaseDurationMinutes when the tool is enabled and both are filled in", () => {
  const p = buildProfileFromDraft(filledStateOnlyDraft({ negativeActionReductionEnabled: true, habit: "גלילה ברשת", negativeActionBaseDurationMinutes: 10 }));
  assert.equal(p.negativeActionReductionEnabled, true);
  assert.equal(p.habit, "גלילה ברשת");
  assert.equal(p.negativeActionBaseDurationMinutes, 10);
});

test("buildProfileFromDraft clears both habit and negativeActionBaseDurationMinutes to null when the tool is disabled, even if they were previously filled in", () => {
  const p = buildProfileFromDraft(
    filledStateOnlyDraft({ negativeActionReductionEnabled: false, habit: "גלילה ברשת", negativeActionBaseDurationMinutes: 10 })
  );
  assert.equal(p.negativeActionReductionEnabled, false);
  assert.equal(p.habit, null, "disabling the tool must clear the negative action text, never leave a stale hidden value");
  assert.equal(p.negativeActionBaseDurationMinutes, null, "disabling the tool must clear the duration too");
});

test("isGoalDraftComplete requires an explicit negativeActionReductionEnabled answer, and -- once enabled -- both habit and a chosen duration", () => {
  assert.equal(isGoalDraftComplete(filledStateOnlyDraft({ negativeActionReductionEnabled: null })), false, "must be explicitly answered");
  assert.equal(isGoalDraftComplete(filledStateOnlyDraft({ negativeActionReductionEnabled: true, habit: "" })), false, "enabled but no action written");
  assert.equal(
    isGoalDraftComplete(filledStateOnlyDraft({ negativeActionReductionEnabled: true, habit: "גלילה ברשת", negativeActionBaseDurationMinutes: null })),
    false,
    "enabled but no duration chosen"
  );
  assert.equal(isGoalDraftComplete(filledStateOnlyDraft({ negativeActionReductionEnabled: false })), true, "disabled -- habit/duration are irrelevant");
});

test("buildProfileFromDraft clamps any duration into the valid 1-15 range rather than saving an out-of-range value", () => {
  assert.equal(
    buildProfileFromDraft(filledStateOnlyDraft({ negativeActionReductionEnabled: true, negativeActionBaseDurationMinutes: 30 })).negativeActionBaseDurationMinutes,
    15
  );
  assert.equal(
    buildProfileFromDraft(filledStateOnlyDraft({ negativeActionReductionEnabled: true, negativeActionBaseDurationMinutes: 0 })).negativeActionBaseDurationMinutes,
    1
  );
});

test("draftFromProfileAndSelection round-trips a saved habit/negativeActionBaseDurationMinutes/negativeActionReductionEnabled", () => {
  const savedProfile = buildProfileFromDraft(
    filledStateOnlyDraft({ negativeActionReductionEnabled: true, habit: "גלילה ברשת", negativeActionBaseDurationMinutes: 15 })
  );
  const reloaded = draftFromProfileAndSelection(savedProfile, null);
  assert.equal(reloaded.negativeActionReductionEnabled, true);
  assert.equal(reloaded.habit, "גלילה ברשת");
  assert.equal(reloaded.negativeActionBaseDurationMinutes, 15);

  const disabledProfile = buildProfileFromDraft(filledStateOnlyDraft({ negativeActionReductionEnabled: false }));
  const reloadedDisabled = draftFromProfileAndSelection(disabledProfile, null);
  assert.equal(reloadedDisabled.negativeActionReductionEnabled, false);
  assert.equal(reloadedDisabled.habit, "");
  assert.equal(reloadedDisabled.negativeActionBaseDurationMinutes, null);
});

test("draftFromProfileAndSelection clamps a legacy out-of-range negativeActionBaseDurationMinutes (configured before the 1-15 restriction existed) into the valid range", () => {
  const legacyProfile = { ...buildProfileFromDraft(filledStateOnlyDraft()), negativeActionBaseDurationMinutes: 30 } as ArcBuildProfile;
  const reloaded = draftFromProfileAndSelection(legacyProfile, null);
  assert.equal(reloaded.negativeActionBaseDurationMinutes, 15, "clamped down to the current maximum, never left out of range");
});

// --- REGRESSION (legacy data): a profile saved before
// negativeActionReductionEnabled/negativeActionBaseDurationMinutes ever
// existed as fields at all has them genuinely ABSENT -- `undefined`,
// not `null`/`false` -- once JSON.parse'd, since data/storage.ts's
// loadProfile is a bare parse with no migration step.
// draftFromProfileAndSelection used to check only `!== null` for the
// duration, so an absent field rendered the literal string "undefined"
// in the BUILD wizard's TextInput.

test("REGRESSION: draftFromProfileAndSelection never renders the literal string \"undefined\" for a legacy profile where negativeActionBaseDurationMinutes is genuinely absent (not null)", () => {
  const legacyProfile = {
    ...buildProfileFromDraft(filledStateOnlyDraft({ negativeActionReductionEnabled: true, negativeActionBaseDurationMinutes: 10 })),
  } as ArcBuildProfile;
  delete (legacyProfile as { negativeActionBaseDurationMinutes?: unknown }).negativeActionBaseDurationMinutes;
  assert.equal("negativeActionBaseDurationMinutes" in legacyProfile, false, "sanity: the field is genuinely absent, not present-as-null");

  const draft = draftFromProfileAndSelection(legacyProfile, null);
  assert.equal(draft.negativeActionBaseDurationMinutes, null, "must render as unselected -- never the string \"undefined\", never NaN");
});

test("REGRESSION: re-saving a fully legacy profile (both negativeActionReductionEnabled and negativeActionBaseDurationMinutes genuinely absent, as before this feature existed at all) through the BUILD wizard without touching either step persists null/false, never NaN or the string \"undefined\"", () => {
  const legacyProfile = {
    ...buildProfileFromDraft(filledStateOnlyDraft({ negativeActionReductionEnabled: false })),
  } as ArcBuildProfile;
  delete (legacyProfile as { negativeActionReductionEnabled?: unknown }).negativeActionReductionEnabled;
  delete (legacyProfile as { negativeActionBaseDurationMinutes?: unknown }).negativeActionBaseDurationMinutes;

  const draft = draftFromProfileAndSelection(legacyProfile, null);
  assert.equal(draft.negativeActionReductionEnabled, false, "neither field was ever configured -- defaults to disabled, not silently enabled");
  const resaved = buildProfileFromDraft(draft);
  assert.equal(resaved.negativeActionBaseDurationMinutes, null);
  assert.equal(Number.isNaN(resaved.negativeActionBaseDurationMinutes as unknown as number), false);
});

test("REGRESSION: a legacy profile where negativeActionReductionEnabled is genuinely absent (undefined, not false) falls back to whether a duration was already configured -- a trainee who was already using the tool keeps access to it", () => {
  const legacyProfile = {
    ...buildProfileFromDraft(filledStateOnlyDraft({ negativeActionReductionEnabled: true, habit: "גלילה ברשת", negativeActionBaseDurationMinutes: 10 })),
  } as ArcBuildProfile;
  delete (legacyProfile as { negativeActionReductionEnabled?: unknown }).negativeActionReductionEnabled;

  const draft = draftFromProfileAndSelection(legacyProfile, null);
  assert.equal(draft.negativeActionReductionEnabled, true, "already had a duration configured -- must not silently lose access to the tool");
  assert.equal(draft.habit, "גלילה ברשת");
});

test("buildProfileFromDraft saves the state target's seven dwell values (coordinated timer/dwell task: presence + stop-imagery joined the original five), applying the correct defaults when left unedited", () => {
  const p = buildProfileFromDraft(filledStateOnlyDraft());
  assert.deepEqual(p.stateDwellTimes, {
    sensationDwellSeconds: 8,
    acceptanceDwellSeconds: 8,
    regulationDwellSeconds: 12,
    encodingDwellSeconds: 10,
    actionImageryDwellSeconds: 8,
    presenceDwellSeconds: 8,
    stopImageryDwellSeconds: 8,
  });
});

test("buildProfileFromDraft saves a state target's CUSTOMIZED dwell values exactly as entered -- the spec's own worked example for תשוקה, extended with presence/stop-imagery", () => {
  const p = buildProfileFromDraft(
    filledStateOnlyDraft({
      stateSensationDwellSeconds: "8",
      stateAcceptanceDwellSeconds: "15",
      stateRegulationDwellSeconds: "12",
      stateEncodingDwellSeconds: "10",
      stateActionImageryDwellSeconds: "8",
      statePresenceDwellSeconds: "12",
      stateStopImageryDwellSeconds: "6",
    })
  );
  assert.deepEqual(p.stateDwellTimes, {
    sensationDwellSeconds: 8,
    acceptanceDwellSeconds: 15,
    regulationDwellSeconds: 12,
    encodingDwellSeconds: 10,
    actionImageryDwellSeconds: 8,
    presenceDwellSeconds: 12,
    stopImageryDwellSeconds: 6,
  });
});

test("different targets (state vs identity) can store entirely different dwell values, saved independently -- the spec's own worked example: תשוקה (state) with a 15s Acceptance dwell vs פיזור (identity) left at defaults", () => {
  const p = buildProfileFromDraft(
    filledTwoWeekDraft({
      stateAcceptanceDwellSeconds: "15",
      identityAcceptanceDwellSeconds: "8",
    })
  );
  assert.equal(p.stateDwellTimes?.acceptanceDwellSeconds, 15);
  assert.equal(p.identityDwellTimes?.acceptanceDwellSeconds, 8);
  assert.notEqual(p.stateDwellTimes?.acceptanceDwellSeconds, p.identityDwellTimes?.acceptanceDwellSeconds, "the two targets' dwell configuration is never shared or mixed");
});

test("buildProfileFromDraft clamps an invalid dwell entry (empty/zero/negative/out-of-range text) rather than saving a value that would break the flow", () => {
  const p = buildProfileFromDraft(
    filledStateOnlyDraft({
      stateSensationDwellSeconds: "", // emptied text field
      stateAcceptanceDwellSeconds: "0",
      stateRegulationDwellSeconds: "-5",
      stateEncodingDwellSeconds: "9999",
      stateActionImageryDwellSeconds: "6.7",
    })
  );
  assert.equal(p.stateDwellTimes?.sensationDwellSeconds, 8, "an emptied field falls back to its own default");
  assert.equal(p.stateDwellTimes?.acceptanceDwellSeconds, 1, "zero is clamped up to the minimum, never saved as zero");
  assert.equal(p.stateDwellTimes?.regulationDwellSeconds, 1, "negative is clamped up to the minimum, never saved as negative");
  assert.equal(p.stateDwellTimes?.encodingDwellSeconds, 120, "an absurdly large value is clamped down to the maximum");
  assert.ok(Number.isInteger(p.stateDwellTimes?.actionImageryDwellSeconds), "a fractional entry is rounded to an integer");
});

test("stateDwellTimes/identityDwellTimes are null when that target isn't active at all -- dwell configuration is never invented for an unmapped target", () => {
  const p = buildProfileFromDraft(filledHabitOnlyDraft());
  assert.equal(p.stateDwellTimes, null);
  assert.equal(p.identityDwellTimes, null);
});

test("dwell values persist across a save/load round trip via draftFromProfileAndSelection, exactly as entered", () => {
  const draft = filledTwoWeekDraft({ stateAcceptanceDwellSeconds: "15", identityRegulationDwellSeconds: "20" });
  const profile = buildProfileFromDraft(draft);
  const selection = selectionFromDraft(draft);
  const roundTripped = draftFromProfileAndSelection(profile, selection);
  assert.equal(roundTripped.stateAcceptanceDwellSeconds, "15");
  assert.equal(roundTripped.identityRegulationDwellSeconds, "20");
  // Every field NOT explicitly customized round-trips back to the same default.
  assert.equal(roundTripped.stateSensationDwellSeconds, "8");
  assert.equal(roundTripped.identityEncodingDwellSeconds, "10");
});

test("legacy profile data (stateDwellTimes/identityDwellTimes missing entirely, as after JSON.parse of pre-feature data) receives the defaults safely when loaded into a draft -- no migration step, no broken/invalidated ARC map", () => {
  const draft = filledTwoWeekDraft();
  const legacyProfile = buildProfileFromDraft(draft);
  delete (legacyProfile as { stateDwellTimes?: unknown }).stateDwellTimes;
  delete (legacyProfile as { identityDwellTimes?: unknown }).identityDwellTimes;

  const reloaded = draftFromProfileAndSelection(legacyProfile, selectionFromDraft(draft));
  assert.equal(reloaded.stateSensationDwellSeconds, "8");
  assert.equal(reloaded.stateAcceptanceDwellSeconds, "8");
  assert.equal(reloaded.stateRegulationDwellSeconds, "12");
  assert.equal(reloaded.stateEncodingDwellSeconds, "10");
  assert.equal(reloaded.stateActionImageryDwellSeconds, "8");
  assert.equal(reloaded.identitySensationDwellSeconds, "8");
  // The rest of the legacy profile is completely unaffected/unbroken.
  assert.equal(reloaded.supportiveState, draft.supportiveState);
  assert.equal(reloaded.desiredIdentity, draft.desiredIdentity);
});
