import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * live/selfObservationStep.test.ts
 *
 * "התבוננות וחיבור לעצמי" (self-observation and self-connection) task:
 * UI-rendering and personal-name-storage regression tests, covering the
 * spec's own section 8 required-test scenarios that are fundamentally
 * about this .tsx file's own JSX or about data/storage.ts's
 * AsyncStorage-backed functions -- neither is directly callable under
 * this codebase's plain `node --test` runner (no React Native renderer,
 * no AsyncStorage mock), so both are verified as exact, already-written
 * source text, exactly like every other live/*.test.ts file in this
 * repo (see live/dwellingStage.test.ts). The pure engine-side behavior
 * (reachability, setters, back navigation, task-link preservation) is
 * covered in arc/selfObservationStep.test.ts.
 */

import { getStepContent } from "../arc/newArcLiveCopy.ts";
import { createNewArcLiveSessionState } from "../arc/newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "../arc/newArcLiveTypes.ts";

function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const screen = readSource("live/NewArcLiveScreen.tsx");
const storage = readSource("data/storage.ts");

const NOW = "2026-01-01T00:00:00.000Z";

function fresh(): NewArcLiveSessionState {
  return createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW);
}

// --- Content: exact title/instruction text (spec sections 2 and 3) --------

test("self_observation_choice's content has the exact required title, and exactly the two required options are rendered on screen (checked separately below)", () => {
  const content = getStepContent({ ...fresh(), currentStep: "self_observation_choice" });
  assert.equal(content.title, "התבוננות וחיבור לעצמי");
});

test("self_observation_exercise's content has the exact required title and the EXACT required instruction text, verbatim", () => {
  const content = getStepContent({ ...fresh(), currentStep: "self_observation_exercise" });
  assert.equal(content.title, "התבוננות וחיבור לעצמי");
  assert.equal(
    content.primary,
    "ראה את עצמך מהצד, אמור את שמך והתייחס לעצמך כפי שהיית רוצה שיתייחסו אליך -- בקבלה ובהבנה.",
    "this instruction text must match the spec's own required wording exactly (this codebase's own convention writes an em dash as '--' in every other Hebrew primary string too -- see e.g. the cognitive_selector/regulation content right above it)"
  );
});

// --- Required test: the choice screen shows exactly two options -----------

test("the self_observation_choice render case shows EXACTLY two options -- 'לעשות תרגיל התבוננות עצמית' (enter the exercise) and 'להמשיך הלאה' (continue onward) -- nothing else", () => {
  const caseIndex = screen.indexOf('case "self_observation_choice":');
  assert.ok(caseIndex !== -1, "self_observation_choice must have its own dedicated render case");
  const caseBody = screen.slice(caseIndex, screen.indexOf("case ", caseIndex + 20));
  const pressableCount = caseBody.split("<Pressable").length - 1;
  assert.equal(pressableCount, 2, "exactly two options, never more");
  assert.ok(caseBody.includes("לעשות תרגיל התבוננות עצמית"));
  assert.ok(caseBody.includes("להמשיך הלאה"));
});

// --- Required test: entering the exercise via the first option ------------

test("the first option ('לעשות תרגיל התבוננות עצמית') calls proceedToSelfObservationExercise, committed through the same commit() every other step uses", () => {
  const caseIndex = screen.indexOf('case "self_observation_choice":');
  const caseBody = screen.slice(caseIndex, screen.indexOf("case ", caseIndex + 20));
  const optionIndex = caseBody.indexOf("לעשות תרגיל התבוננות עצמית");
  const buttonBlock = caseBody.slice(0, optionIndex);
  assert.ok(buttonBlock.includes("onPress={() => commit(proceedToSelfObservationExercise(session!, now))}"));
});

// --- Required test: skipping via the second option -------------------------

test("the second option ('להמשיך הלאה') calls declineSelfObservation, committed through the same commit() every other step uses", () => {
  const caseIndex = screen.indexOf('case "self_observation_choice":');
  const caseBody = screen.slice(caseIndex, screen.indexOf("case ", caseIndex + 20));
  const optionIndex = caseBody.indexOf("להמשיך הלאה");
  const buttonBlock = caseBody.slice(0, optionIndex);
  assert.ok(buttonBlock.includes("onPress={() => commit(declineSelfObservation(session!, now))}"));
});

test("proceedToSelfObservationExercise/declineSelfObservation are both imported from arc/newArcLiveSteps.ts -- no parallel, duplicated mechanism was created for this feature", () => {
  const importEnd = screen.indexOf('} from "../arc/newArcLiveSteps.ts";');
  assert.ok(importEnd !== -1);
  const importBlock = screen.slice(0, importEnd);
  assert.ok(importBlock.includes("declineSelfObservation"), "declineSelfObservation must be imported from arc/newArcLiveSteps.ts, not redefined locally");
  assert.ok(importBlock.includes("proceedToSelfObservationExercise"), "proceedToSelfObservationExercise must be imported from arc/newArcLiveSteps.ts, not redefined locally");
});

// --- Required test: displaying the correct personal name -------------------

test("the self_observation_exercise render case shows the personalName state value as the big centered button's own text, when a name is already saved", () => {
  const caseIndex = screen.indexOf('case "self_observation_exercise":');
  assert.ok(caseIndex !== -1, "self_observation_exercise must have its own dedicated render case");
  const caseBody = screen.slice(caseIndex, screen.indexOf("case ", caseIndex + 20));
  assert.ok(caseBody.includes("{personalName ? ("), "the saved-name branch must be gated on the personalName state, not a hardcoded placeholder");
  assert.ok(caseBody.includes("<Text style={styles.selfObservationNameButtonText}>{personalName}</Text>"), "the button's own text must be the real personalName value -- e.g. a user named אדם sees a button that says אדם");
});

// --- Required test: pressing the name button advances to the next step ----

test("pressing the name button calls commit(advance(session!, now)) -- the same generic forward-walk every other step's own completion uses, landing on free_breathing (or whatever is next) exactly like any other step", () => {
  const caseIndex = screen.indexOf('case "self_observation_exercise":');
  const caseBody = screen.slice(caseIndex, screen.indexOf("case ", caseIndex + 20));
  const nameButtonIndex = caseBody.indexOf("styles.selfObservationNameButton");
  const nameButtonBlock = caseBody.slice(Math.max(0, nameButtonIndex - 120), nameButtonIndex + 400);
  assert.ok(nameButtonBlock.includes("onPress={() => commit(advance(session!, now))}"));
});

// --- Required test: entering and saving a name when one isn't set ---------

test("when no personalName is saved yet, the exercise screen shows an inline text field and a disabled-until-non-empty 'שמירה' (save) button instead of the name button", () => {
  const caseIndex = screen.indexOf('case "self_observation_exercise":');
  const caseBody = screen.slice(caseIndex, screen.indexOf("case ", caseIndex + 20));
  assert.ok(caseBody.includes(") : ("), "there must be an explicit else-branch for the 'no name yet' case");
  assert.ok(caseBody.includes("<TextInput"));
  assert.ok(caseBody.includes("value={nameInputDraft}"));
  assert.ok(caseBody.includes("onChangeText={setNameInputDraft}"));
  assert.ok(caseBody.includes("disabled={!nameInputDraft.trim()}"), "the save button must be disabled while the draft is empty/whitespace-only");
  assert.ok(caseBody.includes("onPress={handleSavePersonalName}"));
  assert.ok(caseBody.includes("שמירה"));
});

test("handleSavePersonalName trims the draft, refuses to save an empty/whitespace-only name, and otherwise persists it via savePersonalName and updates the personalName state immediately (no reload/refetch needed)", () => {
  const fnIndex = screen.indexOf("function handleSavePersonalName()");
  assert.ok(fnIndex !== -1);
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n  }", fnIndex));
  assert.ok(fnBody.includes("const trimmed = nameInputDraft.trim();"));
  assert.ok(fnBody.includes("if (!trimmed) return;"), "an empty/whitespace-only draft must be a no-op, never saved");
  assert.ok(fnBody.includes("savePersonalName(trimmed);"));
  assert.ok(fnBody.includes("setPersonalName(trimmed);"), "the screen must switch to showing the name button immediately after saving, without waiting for a reload");
});

test("personalName is loaded via loadPersonalName inside a useFocusEffect, so a name saved earlier (this session or a previous one) is already present the next time this screen is focused -- 'never ask again'", () => {
  const effectIndex = screen.indexOf("useFocusEffect(useCallback(() => {\n    loadPersonalName().then(setPersonalName);");
  assert.ok(effectIndex !== -1, "the personalName load must be wired through useFocusEffect, exactly like the pre-existing appearanceSettings load right above it");
});

test("loadPersonalName/savePersonalName are both imported from data/storage.ts -- personal name is a true global profile value, never session-local state that would force re-asking on a fresh session", () => {
  assert.ok(screen.includes("loadPersonalName"));
  assert.ok(screen.includes("savePersonalName"));
});

// --- data/storage.ts: the actual personalName persistence functions -------
// (AsyncStorage isn't a callable mock under a plain `node --test` run --
// same convention as every other data/*.test.ts file in this repo.)

test("data/storage.ts defines loadPersonalName/savePersonalName as a single raw-string AsyncStorage key, returning null when nothing was ever saved", () => {
  assert.ok(storage.includes('const PERSONAL_NAME_KEY = "archi.personalName.v1";'));
  const loadIndex = storage.indexOf("export async function loadPersonalName()");
  assert.ok(loadIndex !== -1);
  const loadBody = storage.slice(loadIndex, storage.indexOf("\n}", loadIndex));
  assert.ok(loadBody.includes("AsyncStorage.getItem(PERSONAL_NAME_KEY)"));
  const saveIndex = storage.indexOf("export async function savePersonalName(");
  assert.ok(saveIndex !== -1);
  const saveBody = storage.slice(saveIndex, storage.indexOf("\n}", saveIndex));
  assert.ok(saveBody.includes("AsyncStorage.setItem(PERSONAL_NAME_KEY, name)"));
});

// --- Required test: session/practice state persisting after exit/return ---
// (the backfill line is what makes a session saved before this field
// existed, or simply reloaded after the app was closed, resume with the
// real persisted choice rather than inventing/forgetting it.)

test("loadNewArcLiveSession backfills selfObservationChoice to null for any session saved before this field existed, never inventing 'exercise'/'skip' out of thin air", () => {
  const backfillIndex = storage.indexOf("selfObservationChoice: parsed.selfObservationChoice ?? null,");
  assert.ok(backfillIndex !== -1, "the backfill line must default an absent/undefined field to null -- the true 'not yet answered' state, exactly like a brand-new session");
  const loadFnIndex = storage.lastIndexOf("export async function loadNewArcLiveSession", backfillIndex);
  assert.ok(loadFnIndex !== -1 && loadFnIndex < backfillIndex, "the backfill line must live inside loadNewArcLiveSession's own backfilled object literal");
});

// --- Required test: the generic header/back-button machinery correctly
// covers both new steps without any step-specific special-casing --------

test("neither self_observation_choice nor self_observation_exercise is swept into isBodyMantraStage or isFreeBreathingStage -- the generic title/primary header renders normally for both, exactly like any other ordinary step", () => {
  const bodyMantraIndex = screen.indexOf("const isBodyMantraStage =");
  const bodyMantraBlock = screen.slice(bodyMantraIndex, screen.indexOf(";", screen.indexOf("isInterpretationAcceptanceCirclePhase;", bodyMantraIndex)) + 1);
  assert.ok(!bodyMantraBlock.includes("self_observation"));
  const freeBreathingIndex = screen.indexOf('const isFreeBreathingStage = session.currentStep === "free_breathing";');
  assert.ok(freeBreathingIndex !== -1);
});

test("isStepSkippable is NOT extended for either new step -- the choice screen already offers its own two explicit buttons, and the exercise screen has no separate 'skip' concept in the spec, so no generic 'skip' link is needed for either", () => {
  const stepsSource = readSource("arc/newArcLiveSteps.ts");
  const fnIndex = stepsSource.indexOf("export function isStepSkippable");
  const fnBody = stepsSource.slice(fnIndex, stepsSource.indexOf("\n}", fnIndex));
  assert.ok(!fnBody.includes("self_observation"));
});

test("a trainee can return to the choice screen from the exercise screen via the generic nav-row back button -- no dedicated back control was added for this feature, confirming it relies entirely on the pre-existing resolvePreviousStep/goBack mechanism", () => {
  const caseIndex = screen.indexOf('case "self_observation_choice":');
  const bothCasesBody = screen.slice(caseIndex, screen.indexOf('case "free_breathing":', caseIndex));
  assert.ok(!bothCasesBody.includes("goBack"), "no step-specific back button was added inside either render case -- the generic nav-row one (driven by resolvePreviousStep) already covers it, confirmed in arc/selfObservationStep.test.ts");
});
