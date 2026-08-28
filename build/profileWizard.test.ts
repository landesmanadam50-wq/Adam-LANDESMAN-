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
  isDraftComplete,
  resolvesNeedsIdentity,
  PROFILE_STEP_ORDER,
  type ProfileDraft,
} from "./profileWizard.ts";

function filledStateOnlyDraft(overrides: Partial<ProfileDraft> = {}): ProfileDraft {
  // "state" draft, but resolvesNeedsIdentity is always true when needsState is
  // true (program/selection.ts guarantees state programs also build identity),
  // so a complete state draft always carries identity fields too.
  return {
    ...createEmptyDraft(),
    needsState: true,
    needsIdentityImmediately: false,
    supportiveState: "חמלה",
    internalAction: "סריקת גוף",
    desiredIdentity: "אומץ",
    identityInterferingEmotion: "פחד",
    identityAction: "לומר שלום",
    habit: "גלילה ברשת",
    beneficialAction: "לגשת ולפתוח שיחה",
    regulationTool: "נשימה 4-7-8",
    ...overrides,
  };
}

function filledHabitOnlyDraft(overrides: Partial<ProfileDraft> = {}): ProfileDraft {
  return {
    ...createEmptyDraft(),
    needsState: false,
    needsIdentityExplicit: false,
    habit: "גלילה ברשת",
    beneficialAction: "לגשת ולפתוח שיחה",
    regulationTool: "נשימה 4-7-8",
    ...overrides,
  };
}

test("first step is needsState for a fresh draft", () => {
  assert.equal(getFirstProfileStep(createEmptyDraft()), "needsState");
});

test("needsState=true skips needsIdentityExplicit and asks needsIdentityImmediately instead", () => {
  const draft = filledStateOnlyDraft();
  assert.equal(getNextProfileStep("needsState", draft), "needsIdentityImmediately");
});

test("needsState=false skips needsIdentityImmediately and asks needsIdentityExplicit instead", () => {
  const draft = filledHabitOnlyDraft();
  assert.equal(getNextProfileStep("needsState", draft), "needsIdentityExplicit");
});

test("resolvesNeedsIdentity is always true when needsState is true, regardless of needsIdentityExplicit", () => {
  assert.equal(resolvesNeedsIdentity(filledStateOnlyDraft()), true);
});

test("resolvesNeedsIdentity follows needsIdentityExplicit when needsState is false", () => {
  assert.equal(resolvesNeedsIdentity(filledHabitOnlyDraft({ needsIdentityExplicit: false })), false);
  assert.equal(resolvesNeedsIdentity(filledHabitOnlyDraft({ needsIdentityExplicit: true })), true);
});

test("state-only draft skips identity questions entirely when identity isn't needed", () => {
  // needsState true always resolves needsIdentity true (per program/selection.ts), so
  // exercise the one path where identity is genuinely skipped: needsState false, needsIdentityExplicit false.
  const draft = filledHabitOnlyDraft();
  assert.equal(getNextProfileStep("needsIdentityExplicit", draft), "habit");
});

test("state path always continues into identity questions (advanced_2_week / standard_3_week both build identity)", () => {
  const draft = filledStateOnlyDraft();
  assert.equal(getNextProfileStep("internalAction", draft), "stateMantra");
  assert.equal(getNextProfileStep("stateMantra", draft), "desiredIdentity");
});

test("interferingState/preventiveAction steps no longer exist in this wizard -- that's BUILD-ARC's job now", () => {
  assert.equal((PROFILE_STEP_ORDER as string[]).includes("interferingState"), false);
  assert.equal((PROFILE_STEP_ORDER as string[]).includes("preventiveActionAsk"), false);
  assert.equal((PROFILE_STEP_ORDER as string[]).includes("preventiveActionDescription"), false);
});

test("getPreviousProfileStep mirrors getNextProfileStep, skipping hidden steps", () => {
  const draft = filledHabitOnlyDraft();
  assert.equal(getPreviousProfileStep("habit", draft), "needsIdentityExplicit");
  assert.equal(getPreviousProfileStep("needsState", draft), null);
});

test("isDraftComplete is false until every required field for the resolved path is filled", () => {
  assert.equal(isDraftComplete(createEmptyDraft()), false);
  assert.equal(isDraftComplete(filledStateOnlyDraft()), true);
  assert.equal(isDraftComplete(filledHabitOnlyDraft()), true);
});

test("isDraftComplete requires identity fields once resolvesNeedsIdentity is true", () => {
  const draft = filledStateOnlyDraft({ desiredIdentity: "", identityInterferingEmotion: "", identityAction: "" });
  assert.equal(isDraftComplete(draft), false);
});

test("buildProfileFromDraft assigns standard_3_week when state is needed without immediate identity", () => {
  const profile = buildProfileFromDraft(
    filledStateOnlyDraft({ needsIdentityImmediately: false, desiredIdentity: "x", identityInterferingEmotion: "x", identityAction: "x" })
  );
  assert.equal(profile.programPath, "standard_3_week");
});

test("buildProfileFromDraft assigns advanced_2_week when identity is needed immediately", () => {
  const profile = buildProfileFromDraft(
    filledStateOnlyDraft({ needsIdentityImmediately: true, desiredIdentity: "x", identityInterferingEmotion: "x", identityAction: "x" })
  );
  assert.equal(profile.programPath, "advanced_2_week");
});

test("buildProfileFromDraft assigns habit_only_1_week when neither state nor identity is needed", () => {
  const profile = buildProfileFromDraft(filledHabitOnlyDraft());
  assert.equal(profile.programPath, "habit_only_1_week");
  assert.equal(profile.interferingState, null);
  assert.equal(profile.stateEncoding, null);
  assert.equal(profile.desiredIdentity, null);
});

test("buildProfileFromDraft assigns identity_habit_2_week when only identity is explicitly needed", () => {
  const profile = buildProfileFromDraft(
    filledHabitOnlyDraft({ needsIdentityExplicit: true, desiredIdentity: "אומץ", identityInterferingEmotion: "פחד", identityAction: "לומר שלום" })
  );
  assert.equal(profile.programPath, "identity_habit_2_week");
  assert.equal(profile.desiredIdentity, "אומץ");
});

test("buildProfileFromDraft omits the mantra encoding when none was given, includes it when given", () => {
  const withoutMantra = buildProfileFromDraft(filledStateOnlyDraft({ desiredIdentity: "x", identityInterferingEmotion: "x", identityAction: "x", stateMantra: "" }));
  assert.equal(withoutMantra.stateEncoding, null);

  const withMantra = buildProfileFromDraft(
    filledStateOnlyDraft({ desiredIdentity: "x", identityInterferingEmotion: "x", identityAction: "x", stateMantra: "אני בטוח כאן" })
  );
  assert.equal(withMantra.stateEncoding?.mantra, "אני בטוח כאן");
});

test("buildProfileFromDraft throws on an incomplete draft", () => {
  assert.throws(() => buildProfileFromDraft(createEmptyDraft()));
});

test("draftFromProfileAndSelection prefers the persisted selection over the profile", () => {
  const draft = filledHabitOnlyDraft();
  const profile = buildProfileFromDraft(draft);
  const selection = selectionFromDraft(draft);
  const roundTripped = draftFromProfileAndSelection(profile, selection);
  assert.equal(roundTripped.needsState, false);
  assert.equal(roundTripped.needsIdentityExplicit, false);
  assert.equal(roundTripped.habit, draft.habit);
});

test("buildProfileFromDraft never collects interferingState/preventiveAction -- always null, regardless of needsState", () => {
  const stateProfile = buildProfileFromDraft(
    filledStateOnlyDraft({ desiredIdentity: "x", identityInterferingEmotion: "x", identityAction: "x" })
  );
  assert.equal(stateProfile.interferingState, null);
  assert.equal(stateProfile.preventiveAction, null);

  const habitProfile = buildProfileFromDraft(filledHabitOnlyDraft());
  assert.equal(habitProfile.interferingState, null);
  assert.equal(habitProfile.preventiveAction, null);
});

test("buildProfileFromDraft's stateEncoding target is the Desired State, not a discontinued Interfering State field", () => {
  const profile = buildProfileFromDraft(
    filledStateOnlyDraft({
      desiredIdentity: "x",
      identityInterferingEmotion: "x",
      identityAction: "x",
      supportiveState: "חמלה",
      stateMantra: "אני בטוח כאן",
    })
  );
  assert.equal(profile.stateEncoding?.target, "חמלה");
});

test("draftFromProfileAndSelection falls back to the legacy programPath when no selection was ever saved", () => {
  const draft = filledStateOnlyDraft({ desiredIdentity: "x", identityInterferingEmotion: "x", identityAction: "x" });
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
