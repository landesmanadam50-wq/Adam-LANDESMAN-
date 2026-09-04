import test from "node:test";
import assert from "node:assert/strict";

import { buildArcBuildProfileForSave, draftForTarget, inferTarget, isTargetDraftComplete, type Target } from "./arcBuildSave.ts";
import { buildProfileFromDraft, createEmptyDraft, draftFromProfileAndSelection, type ProfileDraft } from "./profileWizard.ts";
import { createEmptyArcBuildProfile } from "../arc/types.ts";
import type { ArcBuildProfile } from "../arc/types.ts";

/** Loads an existing single-target ArcBuild's profile into a draft, exactly like ArcBuildEditorScreen's own load effect. */
function loadDraftFor(profile: ArcBuildProfile, needs: { needsState: boolean; needsIdentity: boolean; needsHabit: boolean; needsIdentityImmediately: boolean }): {
  target: Target;
  draft: ProfileDraft;
} {
  const target = inferTarget(profile);
  assert.ok(target, "sanity: the fixture profile must resolve to a real target");
  const loaded = draftFromProfileAndSelection(profile, { ...needs, programPath: profile.programPath });
  return { target: target as Target, draft: draftForTarget(target as Target, loaded) };
}

// ---------------------------------------------------------------------------
// REGRESSION: editing and saving an existing (state-target) ArcBuild with a
// selected Presence Color must succeed -- reproduces the exact bug report:
// "The summary correctly displays Presence Color. Tap Save. Nothing happens
// and the ARC Build is not saved."
// ---------------------------------------------------------------------------

test("REGRESSION: an existing state-target ArcBuild, already saved once (identity/habit fields cleared to null, exactly as finishAndSave leaves them), can be reopened, edited, and re-saved with a selected Presence Color without buildProfileFromDraft throwing", () => {
  // Exactly the shape a real state-only ArcBuild has after its first save
  // (see build/arcBuildSave.ts's own null-out block): no goal, no
  // desiredIdentity -- neither of which this single-target screen ever
  // asks for.
  const existingProfile: ArcBuildProfile = {
    ...createEmptyArcBuildProfile(),
    supportiveState: "רוגע",
    challengeContext: "בבוקר לפני העבודה",
    interferingState: "לחץ",
    internalAction: "סריקת גוף",
    regulationTool: "נשימה 4-7-8",
    presenceColor: "כחול",
  };
  assert.equal(existingProfile.goal, null, "sanity: goal was never asked by this screen");
  assert.equal(existingProfile.desiredIdentity, null, "sanity: a state-only build has no desired identity");

  const { target, draft } = loadDraftFor(existingProfile, {
    needsState: true,
    needsIdentity: false,
    needsHabit: false,
    needsIdentityImmediately: false,
  });
  assert.equal(target, "state");
  assert.equal(draft.presenceColor, "כחול", "the summary review screen reads this exact field");

  // Before the fix, this exact draft made buildProfileFromDraft throw
  // ("Cannot build an ArcBuildProfile from an incomplete...draft") even
  // though isTargetDraftComplete correctly reports it as ready to save --
  // reproducing "the Save button does nothing."
  assert.equal(isTargetDraftComplete(target, draft), true, "this draft IS complete by this screen's own, correct rules");

  assert.doesNotThrow(() => buildArcBuildProfileForSave(target, draft, "בוקר רגוע", existingProfile.programPath));

  const saved = buildArcBuildProfileForSave(target, draft, "בוקר רגוע", existingProfile.programPath);
  assert.equal(saved.presenceColor, "כחול", "the selected Presence Color is included in the saved payload");
  assert.equal(saved.supportiveState, "רוגע", "existing state-target data is preserved");
  assert.equal(saved.challengeContext, "בבוקר לפני העבודה", "existing state-target data is preserved");
  assert.equal(saved.interferingState, "לחץ", "existing state-target data is preserved");
  assert.equal(saved.regulationTool, "נשימה 4-7-8", "existing state-target data is preserved");
  assert.equal(saved.desiredIdentity, null, "no identity data was invented or leaked into the saved profile");
  assert.equal(saved.identityEncoding, null);
  assert.equal(saved.beneficialAction, null, "no habit data was invented or leaked into the saved profile");
  assert.equal(saved.programPath, existingProfile.programPath, "programPath is preserved from the existing build");
});

test("REGRESSION: buildProfileFromDraft itself still throws for this exact realistic state-target draft -- proves the fix lives in buildArcBuildProfileForSave's shim, not in a change to buildProfileFromDraft's own (still-correct, for its other historical caller) semantics", () => {
  const existingProfile: ArcBuildProfile = {
    ...createEmptyArcBuildProfile(),
    supportiveState: "רוגע",
    challengeContext: "בבוקר",
    interferingState: "לחץ",
    internalAction: "סריקת גוף",
    regulationTool: "נשימה",
    presenceColor: "כחול",
  };
  const { draft } = loadDraftFor(existingProfile, { needsState: true, needsIdentity: false, needsHabit: false, needsIdentityImmediately: false });
  assert.throws(() => buildProfileFromDraft(draft), /incomplete/);
});

test("editing an existing ArcBuild's Presence Color and saving preserves every other unrelated field", () => {
  const existingProfile: ArcBuildProfile = {
    ...createEmptyArcBuildProfile(),
    supportiveState: "מיקוד",
    challengeContext: "לפני פגישה",
    interferingState: "פיזור דעת",
    internalAction: "נשימה עמוקה",
    internalActionBodyCue: "כתפיים למטה",
    statePreventiveAction: "לשתות מים",
    stateEncoding: { target: "מיקוד", bodySensationCue: null, breathCue: null, bodyLanguageCue: null, mantra: "אני ממוקד" },
    regulationTool: "נשימה 4-7-8",
    presenceColor: "ירוק",
  };
  const { target, draft } = loadDraftFor(existingProfile, { needsState: true, needsIdentity: false, needsHabit: false, needsIdentityImmediately: false });

  // Trainee edits ONLY the Presence Color on this visit.
  const editedDraft: ProfileDraft = { ...draft, presenceColor: "סגול" };
  assert.equal(isTargetDraftComplete(target, editedDraft), true);

  const saved = buildArcBuildProfileForSave(target, editedDraft, "התמקדות", existingProfile.programPath);
  assert.equal(saved.presenceColor, "סגול", "the edited field changed");
  assert.equal(saved.supportiveState, "מיקוד", "unrelated field untouched");
  assert.equal(saved.challengeContext, "לפני פגישה", "unrelated field untouched");
  assert.equal(saved.interferingState, "פיזור דעת", "unrelated field untouched");
  assert.equal(saved.internalActionBodyCue, "כתפיים למטה", "unrelated field untouched");
  assert.equal(saved.statePreventiveAction, "לשתות מים", "unrelated field untouched");
  assert.equal(saved.stateEncoding?.mantra, "אני ממוקד", "unrelated field untouched");
});

test("a fresh ArcBuild (never saved before, presenceColor never answered) still requires Presence Color -- isTargetDraftComplete stays false, and buildArcBuildProfileForSave still throws for a genuinely incomplete draft", () => {
  const draft = draftForTarget("state", {
    ...createEmptyDraft(),
    supportiveState: "רוגע",
    challengeContext: "בבוקר",
    interferingState: "לחץ",
    internalAction: "סריקה",
    regulationTool: "נשימה",
    presenceColor: "",
  });
  assert.equal(isTargetDraftComplete("state", draft), false, "presenceColor is required, exactly like regulationTool");
  assert.throws(() => buildArcBuildProfileForSave("state", draft, "בוקר", "standard_3_week"));
});

test("identity-target and habit-target existing builds are unaffected by the fix -- they never triggered the desiredIdentity landmine, and continue to save correctly", () => {
  const identityProfile: ArcBuildProfile = {
    ...createEmptyArcBuildProfile(),
    desiredIdentity: "משמעת עצמית",
    identityChallengeContext: "לפני אימון",
    identityInterferingEmotion: "עצלנות",
    identityAction: "ללבוש בגדי ספורט",
    regulationTool: "נשימה",
    presenceColor: "אדום",
  };
  const identityLoaded = loadDraftFor(identityProfile, { needsState: false, needsIdentity: true, needsHabit: false, needsIdentityImmediately: false });
  assert.equal(identityLoaded.target, "identity");
  assert.equal(isTargetDraftComplete("identity", identityLoaded.draft), true);
  const savedIdentity = buildArcBuildProfileForSave("identity", identityLoaded.draft, "משמעת", identityProfile.programPath);
  assert.equal(savedIdentity.presenceColor, "אדום");
  assert.equal(savedIdentity.desiredIdentity, "משמעת עצמית");

  const habitProfile: ArcBuildProfile = {
    ...createEmptyArcBuildProfile(),
    beneficialAction: "לגשת ולפתוח שיחה",
    regulationTool: "נשימה",
    presenceColor: "צהוב",
  };
  const habitLoaded = loadDraftFor(habitProfile, { needsState: false, needsIdentity: false, needsHabit: true, needsIdentityImmediately: false });
  assert.equal(habitLoaded.target, "habit");
  assert.equal(isTargetDraftComplete("habit", habitLoaded.draft), true);
  const savedHabit = buildArcBuildProfileForSave("habit", habitLoaded.draft, "הרגל חדש", habitProfile.programPath);
  assert.equal(savedHabit.presenceColor, "צהוב");
  assert.equal(savedHabit.beneficialAction, "לגשת ולפתוח שיחה");
});

// ---------------------------------------------------------------------------
// Legacy migration: existing/legacy ARC Builds without presenceColor
// ---------------------------------------------------------------------------

test("a legacy state-target ArcBuild with no saved presenceColor (null, pre-dates the field) loads into an empty draft without crashing, and correctly remains incomplete until the trainee explicitly selects one", () => {
  const legacyProfile: ArcBuildProfile = {
    ...createEmptyArcBuildProfile(),
    supportiveState: "רוגע",
    challengeContext: "בבוקר",
    interferingState: "לחץ",
    internalAction: "סריקת גוף",
    regulationTool: "נשימה",
    presenceColor: null,
  };
  const { target, draft } = loadDraftFor(legacyProfile, { needsState: true, needsIdentity: false, needsHabit: false, needsIdentityImmediately: false });
  assert.equal(draft.presenceColor, "", "missing presenceColor on legacy data defaults to empty, not a crash");
  assert.equal(isTargetDraftComplete(target, draft), false, "cannot save again until the trainee explicitly selects a color");
  assert.throws(() => buildArcBuildProfileForSave(target, draft, "בוקר רגוע", legacyProfile.programPath));

  // Once the trainee answers the (now-required) presenceColor step, the
  // exact same legacy build saves cleanly -- never silently blocked,
  // never invents a color on its own.
  const completed: ProfileDraft = { ...draft, presenceColor: "כתום" };
  assert.equal(isTargetDraftComplete(target, completed), true);
  const saved = buildArcBuildProfileForSave(target, completed, "בוקר רגוע", legacyProfile.programPath);
  assert.equal(saved.presenceColor, "כתום");
  assert.equal(saved.supportiveState, "רוגע", "the rest of the legacy build's data survives untouched");
});
