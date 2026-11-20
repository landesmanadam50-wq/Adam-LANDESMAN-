import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  setEmotionSelection,
  setSupportiveFeelingOverride,
  setCustomSupportiveFeelingOverride,
  setMiniAwareness,
  resolveFinalSupportiveFeeling,
} from "./newArcLiveSteps.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { NewArcLiveSessionState } from "./newArcLiveTypes.ts";
import { resolveEncodingMantra } from "./newArcLiveCopy.ts";

const NOW = "2026-01-05T12:00:00.000Z";

function readSource(relativePath: string): string {
  const path = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return readFileSync(path, "utf8");
}

const storage = readSource("data/storage.ts");
const screen = readSource("live/NewArcLiveScreen.tsx");

function fresh(): NewArcLiveSessionState {
  return createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW);
}

/**
 * arc/customSupportiveFeeling.test.ts
 *
 * ARCHI -- Three UX Improvements task, Improvement 1 ("Allow custom
 * positive/supportive emotions in ARC"): regression tests for section
 * 4, points 1-3 (custom supportive-emotion selection/validation/
 * persistence, correct use in later stages, and back-navigation/
 * resume behavior). This is a genuinely new, separate field
 * (customSupportiveFeelingText) and setter (setCustomSupportiveFeelingOverride)
 * -- never confused with the Green/Blue body-sensation system, which
 * lives entirely in openingBodyScanRegions/BodyScanOpeningRole and is
 * untouched by any of this.
 */

// Point 1: selection, validation, persistence.
test("setCustomSupportiveFeelingOverride saves the exact entered value, trimmed, into the session", () => {
  let state = fresh();
  state = setEmotionSelection(state, "fear", null);
  state = setCustomSupportiveFeelingOverride(state, "  ביטחון עצמי  ");
  assert.equal(state.customSupportiveFeelingText, "ביטחון עצמי");
  assert.deepEqual(state.selectedSupportiveFeeling, { feeling: "ביטחון עצמי", quality: "ביטחון עצמי", mantra: "" });
  assert.deepEqual(resolveFinalSupportiveFeeling(state), state.selectedSupportiveFeeling);
});

test("an empty/whitespace-only custom supportive emotion is never saved as a valid selection", () => {
  let state = fresh();
  state = setEmotionSelection(state, "fear", null);
  const before = state;
  state = setCustomSupportiveFeelingOverride(state, "   ");
  assert.equal(state, before, "a blank value must leave the state completely untouched, never saved");
  assert.equal(state.customSupportiveFeelingText, null);
  assert.equal(state.selectedSupportiveFeeling, null);
});

test("picking a LISTED alternative after a custom value clears the custom marker; the custom value never resurfaces as 'current'", () => {
  let state = fresh();
  state = setEmotionSelection(state, "fear", null);
  state = setCustomSupportiveFeelingOverride(state, "אומץ אישי");
  assert.equal(state.customSupportiveFeelingText, "אומץ אישי");
  state = setSupportiveFeelingOverride(state, { feeling: "ביטחון", quality: "יציבות", mantra: "אני יציב." });
  assert.equal(state.customSupportiveFeelingText, null, "picking a listed alternative must clear the stale custom marker");
  assert.deepEqual(state.selectedSupportiveFeeling, { feeling: "ביטחון", quality: "יציבות", mantra: "אני יציב." });
});

test("changing the underlying (main) emotion clears BOTH selectedSupportiveFeeling and the custom marker together -- they always move as a pair", () => {
  let state = fresh();
  state = setEmotionSelection(state, "fear", null);
  state = setCustomSupportiveFeelingOverride(state, "רוגע פנימי");
  assert.equal(state.customSupportiveFeelingText, "רוגע פנימי");
  state = setEmotionSelection(state, "sadness", null);
  assert.equal(state.selectedSupportiveFeeling, null, "a real emotion change must clear the stale override");
  assert.equal(state.customSupportiveFeelingText, null, "...and the stale custom marker along with it");
});

// Point 2: correct use in subsequent ARC stages (Encoding, the one
// real narrative consumer of the resolved supportive feeling).
test("resolveEncodingMantra uses the custom supportive emotion's own text, never a fabricated sentence (the falsy '' mantra never invents wording)", () => {
  let state = fresh();
  state = { ...state, goalType: "action", firstAction: "לכתוב דוח" };
  state = setEmotionSelection(state, "fear", null);
  state = setCustomSupportiveFeelingOverride(state, "ביטחון עצמי");
  const mantra = resolveEncodingMantra(state);
  assert.equal(mantra, "אני נוכח. תחושת ביטחון עצמי מתפשטת אצלי בכל הגוף, ומדמיין את עצמי מבצע את לכתוב דוח.");
});

test("Mini ARC's own custom supportive emotion, committed via setMiniAwareness's 7th argument, is used identically by resolveEncodingMantra", () => {
  let state: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "plannedMini", goalType: "emotion_only" };
  state = setMiniAwareness(state, "sadness", null, "", { feeling: "נחמה", quality: "נחמה", mantra: "" }, NOW, "נחמה");
  assert.equal(state.customSupportiveFeelingText, "נחמה");
  assert.equal(resolveEncodingMantra(state), "אני נוכח. תחושת נחמה מתפשטת אצלי בכל הגוף.");
});

test("setMiniAwareness's new 7th argument defaults to null, so every pre-existing call site (never passing it) is unaffected", () => {
  let state: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "plannedMini" };
  state = setMiniAwareness(state, "fear", null, "רוגע", { feeling: "ביטחון", quality: "יציבות", mantra: "אני יציב." }, NOW);
  assert.equal(state.customSupportiveFeelingText, null);
  assert.deepEqual(state.selectedSupportiveFeeling, { feeling: "ביטחון", quality: "יציבות", mantra: "אני יציב." });
});

// Point 3: back-navigation and session-resume behavior.
test("data/storage.ts's loadNewArcLiveSession backfills customSupportiveFeelingText to null for a session saved before this task existed", () => {
  const fnIndex = storage.indexOf("export async function loadNewArcLiveSession(");
  const fnBody = storage.slice(fnIndex, storage.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("customSupportiveFeelingText: parsed.customSupportiveFeelingText ?? null,"));
});

test("the draft-reset/hydration effect re-seeds the custom supportive-feeling draft (and Mini ARC's own override + draft + is-custom flag) from the session's own customSupportiveFeelingText on every step change -- so resuming mid-flight on a step that already carries a custom value shows it pre-filled, never blank", () => {
  const effectIndex = screen.indexOf("useEffect(() => {", screen.indexOf("const reload = useCallback"));
  const effectBody = screen.slice(effectIndex, screen.indexOf("[session?.currentStep, session?.subIndex]"));
  assert.ok(effectBody.includes("setCustomSupportiveFeelingDraft(session?.customSupportiveFeelingText ?? \"\")"));
  assert.ok(effectBody.includes("setMiniCustomSupportiveFeelingDraft(session?.customSupportiveFeelingText ?? \"\")"));
  assert.ok(effectBody.includes("setMiniSupportiveFeelingIsCustom(!!session?.customSupportiveFeelingText)"));
  assert.ok(effectBody.includes("session?.customSupportiveFeelingText ? resolveFinalSupportiveFeeling(session!) : null"));
});

test("createNewArcLiveSessionState initializes customSupportiveFeelingText to null for a brand-new session", () => {
  assert.equal(fresh().customSupportiveFeelingText, null);
});

// UI/convention checks (source-text assertions, same house convention
// every other NewArcLiveScreen.tsx UI test in this codebase uses).
test("renderSupportiveFeelingPicker's shared implementation offers the exact 'רגש אחר — כתיבה חופשית' option the spec requires, reused by all four call sites (Full ARC's own emotion step AND its new body_scan_opening_region screen, Mini ARC, Shortened ARC) -- never a second, duplicated picker", () => {
  const fnIndex = screen.indexOf("function renderSupportiveFeelingPicker(");
  const fnBody = screen.slice(fnIndex, screen.indexOf("\n}", fnIndex));
  assert.ok(fnBody.includes("רגש אחר — כתיבה חופשית"));
  const callSites = screen.split("renderSupportiveFeelingPicker(").length - 1;
  assert.equal(callSites, 5, "exactly one function definition's own self-reference plus four real call sites -- ARCHI -- Full ARC Body Flow Redesign task added the body_scan_opening_region (Screen Two) call site");
});

test("Shortened ARC's optional supportive-feeling control (never mandatory) still reuses the SAME renderSupportiveFeelingPicker -- custom-text support is never a separate, Shortened-only re-implementation", () => {
  const shortenedBlockIndex = screen.indexOf('if (session!.arcInvocationMode === "shortened")');
  const shortenedBlock = screen.slice(shortenedBlockIndex, shortenedBlockIndex + 8000);
  assert.ok(shortenedBlock.includes("renderSupportiveFeelingPicker("));
  assert.ok(shortenedBlock.includes("setCustomSupportiveFeelingOverride(session!, text)"));
});
