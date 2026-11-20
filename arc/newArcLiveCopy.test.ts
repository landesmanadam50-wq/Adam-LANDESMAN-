import test from "node:test";
import assert from "node:assert/strict";

import { containsInductionPattern } from "./instructions.ts";
import { getStepContent, resolveEncodingMantra, resolveSupportiveMovementSuggestions } from "./newArcLiveCopy.ts";
import { setSupportiveArea } from "./newArcLiveSteps.ts";
import { createNewArcLiveSessionState } from "./newArcLiveTypes.ts";
import type { EmotionSelection, NewArcLiveSessionState, NewArcLiveStepId } from "./newArcLiveTypes.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function fresh(): NewArcLiveSessionState {
  return createNewArcLiveSessionState("t1", "לכתוב דוח", "לפתוח את המחשב", NOW);
}

/**
 * ARCHI -- Full ARC Body Flow Redesign task: "supportive_area_select"
 * now sits AFTER "acceptance" (Part 1) and "body_scan_opening_region"
 * (Screen Two) in the active order, and is reachable only for
 * Shortened ARC -- for this helper's own non-shortened session,
 * advancing from it lands on "acceptance_part_two" (Part 2), not plain
 * "acceptance" any more. `withUnpleasantArea` sets the LEGACY
 * unpleasantBodyArea field directly (as a migrated/resumed old session
 * would already have it) -- never by walking through a step that no
 * longer exists.
 */
function reachAcceptance(goalType: "action" | "emotion_only" | "combined", withUnpleasantArea: boolean): NewArcLiveSessionState {
  let state: NewArcLiveSessionState = {
    ...fresh(),
    goalType,
    currentStep: "supportive_area_select",
    unpleasantBodyArea: withUnpleasantArea ? "abdomen" : null,
  };
  state = setSupportiveArea(state, "chest", NOW);
  assert.equal(state.currentStep, "acceptance_part_two", "test setup must land exactly on acceptance_part_two -- no separate sensation/movement screen exists anymore");
  return state;
}

test("Final ARC Body Redesign & Flow Fixes task: supportive_area_select interpolates the already-chosen desired feeling (desiredFeelingText, from desired_feeling_select -- the ONE universal place it's captured for every goal type) into its own question text, never re-asking it", () => {
  const state = { ...fresh(), currentStep: "supportive_area_select" as const, desiredFeelingText: "רוגע" };
  const content = getStepContent(state);
  assert.equal(content.primary, "באילו אזורים בגוף היית רוצה לחזק תחושה שתומכת ברוגע?");
});

test("supportive_area_select falls back to a feeling-free question when no desired feeling was ever chosen -- never invents one", () => {
  const state = { ...fresh(), currentStep: "supportive_area_select" as const, desiredFeelingText: null };
  const content = getStepContent(state);
  assert.equal(content.primary, "באילו אזורים בגוף היית רוצה לחזק תחושה תומכת?");
});

test("supportive_movement_select uses the exact spec wording", () => {
  const state = { ...fresh(), currentStep: "supportive_movement_select" as const };
  assert.equal(getStepContent(state).primary, "איזו תנועה גופנית יכולה לתמוך בתחושה הזאת?");
});

// Final ARC Flow & Body Animation task, requirement 5: Acceptance,
// Regulation and Encoding & Action are each now exactly ONE fixed (or,
// for Encoding, computed) mantra -- "the body animation teaches the
// movement; the mantra teaches attention," and NONE of the four
// mantras (dwelling included, tested further below) ever lists an
// anatomical region, a sensation vocabulary word, or a movement
// instruction, regardless of what the session's own selections are --
// a sharp break from the old, selection-interpolated, multi-sub-screen
// wording these tests used to exercise.

// ARCHI -- Final Correction: One Acceptance Stage, Two Parts, Attention
// Transfer During Regulation task: Acceptance Part 2 is ONE continuous
// exercise (simultaneous attention to contraction AND support, plus
// the Blue regions' own initial opening) that must NEVER instruct
// transferring attention away from the contraction -- that gradual
// transfer now happens only during Regulation below.
test("Acceptance Part 2 is exactly the spec's own fixed mantra, with no supporting lines, regardless of any region/feeling selections on the session, and never mentions transferring attention away from the contraction", () => {
  const state = reachAcceptance("action", false);
  const content = getStepContent(state);
  assert.equal(content.primary, "אני שם לב גם לכיווץ וגם לתמיכה, ומתחיל לפתוח ולייצב בעדינות את אזורי התמיכה.");
  assert.deepEqual(content.supporting, []);
  assert.ok(!content.primary.includes("מעביר"), "Acceptance Part 2 must never instruct transferring attention -- that is Regulation's own job now");
  // Even a session with selections never leaks a region/feeling name into the mantra.
  const withSelections = {
    ...state,
    bodyScanContractionRegions: [{ region: "scanAbdomen" as const, side: null }],
    openingBodyScanRegions: [{ region: "scanShoulders" as const, side: "left" as const, role: "opening" as const }],
    desiredFeelingText: "ביטחון",
  };
  assert.equal(getStepContent(withSelections).primary, content.primary);
});

// ARCHI -- Full ARC Regulation Fix + Automatic Symmetrical Body
// Highlighting task, sections 1-2: supersedes the earlier "Final
// Correction" task's own wording, which turned out to leak Encoding's
// own whole-body-spreading-feeling phrasing ("<feeling> מתפשטת אצלי")
// into Regulation -- a genuine regression this task corrects.
// Regulation now opens by acknowledging CONTINUED acceptance of the
// contraction, states the spec's own exact required sentence
// verbatim, and closes with the continued-opening/never-disappear
// clause -- with no mention of any feeling spreading, and no region
// name, ever.
// ARCHI -- Simplify the Regulation Stage (Body Image + Short Mantra)
// task: supersedes this test's earlier three-sentence mantra
// assertion with the new, short, fixed mantra -- still fixed
// regardless of any selected feeling or region, still never mentions
// a feeling spreading.
test("Regulation's own mantra is the new short, fixed line -- never interpolates a feeling or region, never mentions a feeling spreading", () => {
  const withoutFeeling = { ...reachAcceptance("action", true), currentStep: "regulation" as const };
  const contentWithoutFeeling = getStepContent(withoutFeeling);
  assert.equal(contentWithoutFeeling.primary, "אני מקבל את הכיווץ ושם לב יותר לתמיכה");
  assert.deepEqual(contentWithoutFeeling.supporting, []);
  assert.ok(!contentWithoutFeeling.primary.includes("מתפשטת"), "Regulation must never use Encoding's own whole-body-spreading-feeling phrasing");

  const withFeeling = {
    ...withoutFeeling,
    selectedSupportiveFeeling: { feeling: "ביטחון", quality: "ביטחון", mantra: "" },
  };
  assert.equal(getStepContent(withFeeling).primary, contentWithoutFeeling.primary, "Regulation's mantra is fixed -- it never interpolates a feeling name, selected or not");
  // A selected body region itself never leaks into the mantra either.
  assert.ok(!getStepContent(withFeeling).primary.includes("scanAbdomen") && !getStepContent(withFeeling).primary.includes("scanShoulders"));
});

// Bug fix: "סbבה" (Shortened ARC) never asks about contraction at all
// (body_scan_contraction is permanently unreachable for that mode), so
// the Full ARC Regulation wording above -- which explicitly names
// "הכיווץ" (the contraction) -- never actually applied to it. Shortened
// ARC's own Regulation page now uses the exact required replacement
// sentence instead, with no mention of contraction; every other
// pathway keeps the original sentence completely unchanged (asserted
// immediately above and in the subIndex-1/withUnpleasantArea variants
// already covered by the existing test just above this one).
test("bug fix: Shortened ARC's own Regulation page uses the exact required replacement wording (no mention of contraction), while Full ARC's Regulation wording stays completely unchanged", () => {
  const shortenedState: NewArcLiveSessionState = {
    ...fresh(),
    arcInvocationMode: "shortened",
    currentStep: "regulation",
    subIndex: 0,
  };
  const shortenedContent = getStepContent(shortenedState);
  assert.equal(shortenedContent.primary, "אני שם לב למה שקורה בגוף ומעמיק את תשומת הלב לתמיכה");
  assert.deepEqual(shortenedContent.supporting, []);
  assert.ok(!shortenedContent.primary.includes("כיווץ"), "the Shortened ARC regulation sentence must never mention contraction -- that step is permanently unreachable for this mode");

  const fullState: NewArcLiveSessionState = { ...fresh(), arcInvocationMode: "plannedFull", currentStep: "regulation", subIndex: 0 };
  assert.equal(
    getStepContent(fullState).primary,
    "אני מקבל את הכיווץ ושם לב יותר לתמיכה",
    "Full ARC's own Regulation wording (now the new short mantra) stays independent of -- and unaffected by -- the Shortened-only wording above"
  );
});

test("bug fix: the Shortened ARC Regulation wording is its own, regardless of subIndex -- ARCHI -- Show Action Selection ON the Regulation Screen task made 'regulation' exactly one sub-screen, so getStepContent no longer branches on subIndex at all for this step", () => {
  const shortened: NewArcLiveSessionState = {
    ...fresh(),
    arcInvocationMode: "shortened",
    currentStep: "regulation",
    subIndex: 0,
    isActiveTaskLiveOrigin: true,
  };
  assert.equal(getStepContent(shortened).primary, "אני שם לב למה שקורה בגוף ומעמיק את תשומת הלב לתמיכה", "Shortened ARC's own Regulation wording, never the generic action-selection prompt (which is now a UI-level section, not part of getStepContent)");
  // A stale subIndex (e.g. restored from an older session) renders identically -- this step has no second content page any more.
  assert.equal(getStepContent({ ...shortened, subIndex: 1 }).primary, getStepContent(shortened).primary);
});

test("resolveEncodingMantra: for 'action'/'combined' goals, appends the trainee's own firstAction in FIRST PERSON ('ומדמיין את עצמי מבצע את [action]'), never inventing or omitting it", () => {
  let state = reachAcceptance("action", false);
  state = { ...state, firstAction: "ללמוד קואוצ'ינג" };
  assert.equal(resolveEncodingMantra(state), "אני נוכח. התחושה התומכת מתפשטת אצלי בכל הגוף, ומדמיין את עצמי מבצע את ללמוד קואוצ'ינג.");

  let combinedState = reachAcceptance("combined", false);
  combinedState = { ...combinedState, firstAction: "לכתוב דוח" };
  assert.equal(resolveEncodingMantra(combinedState), "אני נוכח. התחושה התומכת מתפשטת אצלי בכל הגוף, ומדמיין את עצמי מבצע את לכתוב דוח.");
});

test("Unified ARC & Productivity Update task, requirement 3: resolveEncodingMantra names the trainee's OWN actually-selected desiredFeelingText when one exists, phrased as giving ROOM to the feeling -- never claiming it is already present", () => {
  let state = reachAcceptance("action", false);
  state = { ...state, firstAction: "לכתוב דוח", desiredFeelingText: "רוגע" };
  assert.equal(resolveEncodingMantra(state), "אני נוכח. תחושת רוגע מתפשטת אצלי בכל הגוף, ומדמיין את עצמי מבצע את לכתוב דוח.");
  assert.ok(!resolveEncodingMantra(state).includes("אני מרגיש רוגע"), "must never claim the feeling is already present, only that it is spreading");
});

test("resolveEncodingMantra: for 'emotion_only', adapts the mantra WITHOUT inventing an action -- ends at the supportive-feeling clause with no action clause appended at all", () => {
  const state = reachAcceptance("emotion_only", false);
  assert.equal(resolveEncodingMantra(state), "אני נוכח. התחושה התומכת מתפשטת אצלי בכל הגוף.");
  assert.ok(!resolveEncodingMantra(state).includes(state.firstAction), "emotion-only encoding must never force the task's own first action into the mantra");
});

test("getEncodingContent renders resolveEncodingMantra's own text verbatim as the one page's primary, with no supporting lines", () => {
  const state = { ...reachAcceptance("action", false), currentStep: "encoding" as const, firstAction: "לפתוח את המחשב" };
  const content = getStepContent(state);
  assert.equal(content.primary, resolveEncodingMantra(state));
  assert.deepEqual(content.supporting, []);
});

test("none of the four body-mantra-circle stages (dwelling/acceptance/regulation/encoding) ever names a body region, for any selection combination -- 'do not verbally list anatomical regions during these stages'", () => {
  let state = reachAcceptance("action", false);
  state = {
    ...state,
    bodyScanContractionRegions: [{ region: "scanAbdomen", side: null }],
    openingBodyScanRegions: [{ region: "scanShoulders", side: "left", role: "opening" }],
    firstAction: "ללמוד קואוצ'ינג",
  };
  for (const step of ["dwelling", "acceptance", "acceptance_part_two", "regulation", "encoding"] as const) {
    const content = getStepContent({ ...state, currentStep: step });
    for (const regionWord of ["בטן", "כתפיים", "כתף", "חזה"]) {
      assert.ok(!content.primary.includes(regionWord), `${step}'s mantra must never name "${regionWord}"`);
    }
  }
});

test("requirement 9 (no verbal movement instructions): none of the four mantras ever contains a movement verb -- 'the animation demonstrates them,' the mantra never describes them in words", () => {
  let state = reachAcceptance("action", false);
  state = { ...state, firstAction: "ללמוד קואוצ'ינג" };
  const movementVerbs = ["פתח", "הרחב", "ישר", "תזוז", "הרם", "הורד", "כפוף"];
  for (const step of ["dwelling", "acceptance", "acceptance_part_two", "regulation", "encoding"] as const) {
    const content = getStepContent({ ...state, currentStep: step });
    for (const verb of movementVerbs) {
      assert.ok(!content.primary.includes(verb), `${step}'s mantra must never contain the movement instruction verb "${verb}"`);
    }
    assert.deepEqual(content.supporting, [], `${step} must have no supporting lines that could carry a movement instruction either`);
  }
});

test("resolveSupportiveMovementSuggestions never offers more than 3 by default, matching the task's own display cap", () => {
  const suggestions = resolveSupportiveMovementSuggestions("shoulders");
  assert.ok(suggestions.length <= 3);
});

test("no generated line across the whole flow trips the safety denylist, for either goal type, with or without an unpleasant area -- Final ARC Flow task: acceptance/regulation/encoding are each exactly ONE page now (subIndex always 0), including the new first-person Encoding mantra (arc/instructions.ts whitelist entry 13)", () => {
  for (const goalType of ["action", "emotion_only", "combined"] as const) {
    for (const withUnpleasant of [true, false]) {
      let state = reachAcceptance(goalType, withUnpleasant);
      state = { ...state, desiredEnding: "התחלתי את הצעד הראשון", firstAction: "ללמוד קואוצ'ינג" };
      const stepsToWalk: NewArcLiveSessionState["currentStep"][] = ["dwelling", "acceptance", "acceptance_part_two", "regulation", "encoding"];
      for (const step of stepsToWalk) {
        const content = getStepContent({ ...state, currentStep: step, subIndex: 0 });
        assert.equal(containsInductionPattern(content.primary), false, `${step} primary line must never trip the safety denylist: "${content.primary}"`);
        for (const line of content.supporting) {
          assert.equal(containsInductionPattern(line), false, `${step} supporting line must never trip the safety denylist: "${line}"`);
        }
      }
    }
  }
});

// ARC-system upgrade task, Part F/H: engine-level content differences
// by invocation mode and track.

test("Fix All Confirmed ARC Android Bugs task, requirement 2: natural_breathing is exactly the fixed first-person Presence mantra, shown inside the circle -- never the old getFreeBreathingLine wording, never forcing deep breathing", () => {
  const content = getStepContent({ ...fresh(), currentStep: "natural_breathing" });
  assert.equal(content.primary, "אני נוכח כאן ועכשיו.");
  assert.deepEqual(content.supporting, []);
  assert.equal(containsInductionPattern(content.primary), false);
  assert.ok(!content.primary.includes("נשום עמוק") && !content.supporting.join(" ").includes("נשום עמוק"));
});

// Final ARC Flow & Body Animation task, requirement 5: Dwelling is now
// the EXACT fixed mantra, verbatim, never interpolating any region or
// mentioning the supportive anchor (that's Acceptance's own, later job).
test("Dwelling is exactly the spec's own fixed mantra, with no supporting lines, and never trips the safety denylist -- regardless of which regions were marked contracted", () => {
  const state = { ...fresh(), currentStep: "dwelling" as const, bodyScanContractionRegions: [{ region: "scanChest" as const, side: null }] };
  const content = getStepContent(state);
  assert.equal(content.primary, "אני נוכח, ונשאר בתחושה הקיימת בגוף.");
  assert.deepEqual(content.supporting, []);
  assert.ok(!content.primary.includes("תומך"), "dwelling must never mention the supportive anchor -- that's acceptance's own, later job");
  assert.equal(containsInductionPattern(content.primary), false);
});

test("dwelling never sets dwellSeconds -- Continue must be enabled immediately, never timer-gated, never auto-advancing", () => {
  const content = getStepContent({ ...fresh(), currentStep: "dwelling", bodyScanContractionRegions: [{ region: "scanChest", side: null }] });
  assert.equal(content.dwellSeconds, undefined);
});

// Urge-stop task / ARCHI -- Two Mantras for Urge Acceptance correction:
// "stop_and_accept_urge" is now exactly ONE page -- the old five
// preparatory dwell-gated instruction sub-screens are gone entirely,
// replaced by the one animated urge-acceptance screen (the circle's
// own short mantra, plus exactly two below-circle mantras).

test("stop_and_accept_urge is exactly one page: the circle's own short mantra as primary, and exactly the two required below-circle mantras as supporting, regardless of subIndex or urgeText", () => {
  for (const subIndex of [0, 1, 5]) {
    for (const urgeText of ["דחף לפתוח את הטלפון", null]) {
      const content = getStepContent({ ...fresh(), currentStep: "stop_and_accept_urge" as const, subIndex, urgeText });
      assert.equal(content.primary, "אני נותן מקום לדחף.");
      assert.deepEqual(content.supporting, ["אני עוצר לרגע.", "אני מפנה תשומת לב לתחושת הדחף בגוף."]);
      assert.equal(containsInductionPattern(content.primary), false);
      for (const line of content.supporting) assert.equal(containsInductionPattern(line), false);
    }
  }
});

test("stop_and_accept_urge never claims the urge disappeared or was suppressed, and never frames it as a failure", () => {
  const content = getStepContent({ ...fresh(), currentStep: "stop_and_accept_urge" as const, urgeText: "דחף לדחות משימה" });
  const allText = [content.primary, ...content.supporting].join(" ");
  assert.ok(!allText.includes("כישלון"));
  assert.ok(!allText.includes("להעלים"));
});

// ARCHI -- Two Mantras for Urge Acceptance correction: Mini ARC's own
// urge screen now shows the EXACT SAME content as Full ARC's
// "stop_and_accept_urge" (never a second, slightly-different mantra
// for the same moment) -- "apply this change whenever the urge-
// acceptance branch is used, including Full ARC, Mini ARC."
test("mini_stop_accept_urge shows the exact same one-screen content (circle mantra + the two below-circle mantras) as Full ARC's stop_and_accept_urge, never a shortened/different walk, and never trips the safety denylist", () => {
  const content = getStepContent({ ...fresh(), arcInvocationMode: "plannedMini", currentStep: "mini_stop_accept_urge", urgeText: "דחף לקום ולעזוב" });
  assert.equal(content.primary, "אני נותן מקום לדחף.");
  assert.deepEqual(content.supporting, ["אני עוצר לרגע.", "אני מפנה תשומת לב לתחושת הדחף בגוף."]);
  assert.equal(content.dwellSeconds, undefined, "Mini ARC steps are never dwell-gated -- Continue must be available immediately, matching every other mini_* step");
  assert.equal(containsInductionPattern(content.primary), false);
  for (const line of content.supporting) assert.equal(containsInductionPattern(line), false);
});

test("dwelling never instructs the trainee to change, suppress, or accept the sensation -- the fixed mantra only says to remain with what's already there", () => {
  const content = getStepContent({ ...fresh(), currentStep: "dwelling" });
  assert.match(content.primary, /אני נוכח, ונשאר בתחושה הקיימת בגוף\./);
  assert.ok(!content.primary.includes("לשנות") && !content.primary.includes("להעלים") && !content.primary.includes("לקבל"), "must never instruct changing, removing, or accepting -- only remaining present");
});

test("unpleasant_area_select shows side-view imagery only in planned mode, never in a spontaneous session (Part F step 3/H.2)", () => {
  const planned = { ...fresh(), currentStep: "unpleasant_area_select" as const, arcInvocationMode: "plannedFull" as const };
  const spontaneous = { ...fresh(), currentStep: "unpleasant_area_select" as const, arcInvocationMode: "spontaneous" as const };
  assert.match(getStepContent(planned).primary, /מהצד/);
  assert.doesNotMatch(getStepContent(spontaneous).primary, /מהצד/);
  assert.equal(containsInductionPattern(getStepContent(planned).primary), false);
});

test("Fix All Confirmed ARC Android Bugs task, requirement 2: body_scan is exactly the same one fixed Presence mantra for every invocation mode -- spontaneous and planned alike, no per-region labels any more", () => {
  const spontaneous = { ...fresh(), currentStep: "body_scan" as const, arcInvocationMode: "spontaneous" as const, subIndex: 0 };
  const planned = { ...fresh(), currentStep: "body_scan" as const, arcInvocationMode: "plannedFull" as const, subIndex: 0 };
  assert.equal(getStepContent(spontaneous).primary, "אני מרגיש את הגוף שלי.");
  assert.equal(getStepContent(planned).primary, "אני מרגיש את הגוף שלי.");
  assert.deepEqual(getStepContent(spontaneous).supporting, []);
});

test("transition names both actions for the Combined track, and only the emotional one for the Emotional track", () => {
  const combined = getStepContent({ ...fresh(), currentStep: "transition", goalType: "combined" });
  assert.match(combined.primary + combined.supporting.join(" "), /לפתוח את המחשב/, "the identity action must still be named");
  assert.match(combined.primary, /פעולה רגשית/);

  const emotionOnly = getStepContent({ ...fresh(), currentStep: "transition", goalType: "emotion_only" });
  assert.match(emotionOnly.primary, /פעולה רגשית/);
});

test("Part F step 10: 'complete' shows a reinforcement + gratitude line, never trips the safety denylist, and never claims a specific emotional outcome", () => {
  const content = getStepContent({ ...fresh(), currentStep: "complete" });
  assert.ok(content.supporting.length > 0);
  assert.equal(containsInductionPattern(content.primary), false);
  for (const line of content.supporting) assert.equal(containsInductionPattern(line), false);
});

test("emotional_action/emotional_insight copy never trips the safety denylist", () => {
  for (const step of ["emotional_action", "emotional_insight"] as const) {
    const content = getStepContent({ ...fresh(), currentStep: step });
    assert.equal(containsInductionPattern(content.primary), false);
    for (const line of content.supporting) assert.equal(containsInductionPattern(line), false);
  }
});

// ARC-system upgrade task, Part G: Mini ARC's own combined-screen copy.

test("mini_awareness shows the outcome/value prompt only when task-linked, never for the Emotional track", () => {
  const taskLinked = getStepContent({ ...fresh(), currentStep: "mini_awareness", goalType: "action" });
  assert.ok(taskLinked.supporting.length > 0);
  const emotional = getStepContent({ ...fresh(), currentStep: "mini_awareness", goalType: "emotion_only" });
  assert.equal(emotional.supporting.length, 0);
});

test("mini_presence always shows the side-view line (Mini ARC is always a PLANNED mode), and never trips the safety denylist", () => {
  const content = getStepContent({ ...fresh(), currentStep: "mini_presence" });
  assert.ok(content.supporting.length > 0);
  assert.equal(containsInductionPattern(content.primary), false);
  for (const line of content.supporting) assert.equal(containsInductionPattern(line), false);
});

// --- Three-levels-of-acceptance task -------------------------------------

// Unified ARC & Productivity Update task, requirement 7: subIndex 1's
// own mantra is now the exact, verbatim Presence-circle text (rendered
// via live/components/ArcBodyMantraCircle.tsx, stage
// "thought_acceptance"), with no supporting text -- replaces the old
// second-person "תנשום... ותסתכל על נקודה" wording and its own
// "this isn't agreement" clarification lines entirely (still true,
// just no longer shown as on-screen text; see this file's own doc
// comment on getRealityAcceptanceContent).
test("reality_acceptance subIndex 0 asks which time the thought concerns; subIndex 1 shows the exact verbatim Presence-circle mantra per time classification, with no supporting text (tests 2-4)", () => {
  const ask = getStepContent({ ...fresh(), currentStep: "reality_acceptance", subIndex: 0, currentThought: "מחשבה", thoughtTimeOrientation: null });
  assert.equal(ask.primary, "לאיזה זמן המחשבה שלך מתייחסת?");

  const past = getStepContent({ ...fresh(), currentStep: "reality_acceptance", subIndex: 1, currentThought: "מחשבה", thoughtTimeOrientation: "past" });
  assert.equal(past.primary, "אני מביט בנקודה ונותן מקום למחשבה על מה שקרה.");
  assert.deepEqual(past.supporting, []);

  const future = getStepContent({ ...fresh(), currentStep: "reality_acceptance", subIndex: 1, currentThought: "מחשבה", thoughtTimeOrientation: "future" });
  assert.equal(future.primary, "אני מביט בנקודה ונותן מקום למחשבה על מה שעשוי לקרות.");
  assert.deepEqual(future.supporting, []);

  const present = getStepContent({ ...fresh(), currentStep: "reality_acceptance", subIndex: 1, currentThought: "מחשבה", thoughtTimeOrientation: "present" });
  assert.equal(present.primary, "אני מביט בנקודה ונותן מקום למחשבה על מה שקורה.");
  assert.deepEqual(present.supporting, []);

  for (const content of [ask, past, future, present]) {
    assert.equal(containsInductionPattern(content.primary), false);
    for (const line of content.supporting) assert.equal(containsInductionPattern(line), false);
  }
});

// Fix All Confirmed ARC Android Bugs task, requirement 2: visual_field is
// now exactly ONE fixed Presence mantra, inside the circle, regardless of
// currentThought/interpretationText -- the old thought-acceptance-weaving
// wording carried no session-state or gating side effect of its own
// (confirmed by reading getVisualFieldContent before it was deleted), so
// dropping it loses no functionality, consistent with "one mantra page at
// a time" already used for Dwelling/Acceptance/Regulation/Encoding.
test("visual_field is the exact fixed mantra regardless of whether a thought/interpretation exists -- the old thought-acceptance weaving no longer applies", () => {
  const withThought = getStepContent({ ...fresh(), currentStep: "visual_field", subIndex: 0, currentThought: "מחשבה" });
  const withoutThought = getStepContent({ ...fresh(), currentStep: "visual_field", subIndex: 0, currentThought: null });
  assert.equal(withThought.primary, "אני מרחיב את שדה הראייה.");
  assert.equal(withoutThought.primary, "אני מרחיב את שדה הראייה.");
  assert.equal(containsInductionPattern(withThought.primary), false);
  assert.deepEqual(withThought.supporting, []);
});

// Required test 6: no separate/unnecessary screen was added for thought acceptance -- visual_field keeps its original sub-screen count.
test("test 6: thought acceptance adds zero sub-screens to visual_field -- it is woven into the existing subIndex 0, never a new screen", () => {
  const withThought = getStepContent({ ...fresh(), currentStep: "visual_field", subIndex: 3, currentThought: "מחשבה" });
  assert.equal(withThought.title, "התרחבות שדה הראייה");
  // subIndex 4 doesn't exist for visual_field -- stepSubCount (arc/newArcLiveSteps.ts) still returns 4 for this step, unchanged by this task.
});

// Required test 11: Mini ARC's own short, combined integration.
// Unified ARC & Productivity Update task, requirement 7: the resolved
// mantra is now the exact, verbatim Presence-circle text, same as
// Full ARC's own reality_acceptance.
test("test 11: mini_reality_acceptance is a single combined screen (ask, then Presence-circle mantra), and mini_presence weaves thought acceptance into its own existing line without a separate transition screen", () => {
  const ask = getStepContent({ ...fresh(), currentStep: "mini_reality_acceptance", currentThought: "מחשבה", thoughtTimeOrientation: null });
  assert.equal(ask.primary, "לאיזה זמן המחשבה שלך מתייחסת?");
  const resolved = getStepContent({ ...fresh(), currentStep: "mini_reality_acceptance", currentThought: "מחשבה", thoughtTimeOrientation: "past" });
  assert.equal(resolved.primary, "אני מביט בנקודה ונותן מקום למחשבה על מה שקרה.");
  assert.deepEqual(resolved.supporting, []);

  const miniPresenceWithThought = getStepContent({ ...fresh(), currentStep: "mini_presence", currentThought: "מחשבה" });
  assert.match(miniPresenceWithThought.primary, /אפשר למחשבה להיות נוכחת בלי להילחם בה/);
  assert.match(miniPresenceWithThought.primary, /הרחב לרגע את שדה הראייה/);
  assert.match(miniPresenceWithThought.primary, /תחושה הלא נעימה/, "body-sensation noticing must stay in the same sentence, not be removed");

  const miniPresenceWithoutThought = getStepContent({ ...fresh(), currentStep: "mini_presence", currentThought: null });
  assert.doesNotMatch(miniPresenceWithoutThought.primary, /מחשבה/);

  for (const content of [ask, resolved, miniPresenceWithThought, miniPresenceWithoutThought]) {
    assert.equal(containsInductionPattern(content.primary), false);
  }
});

test("Unified ARC & Productivity Update task, requirement 3: mini_encoding's primary line is now the SAME auto-computed resolveEncodingMantra Full/Shortened ARC's own encoding step uses (never the trainee's own free-text mantra/belief, removed entirely), with the chosen area/sensation/movement kept as supporting body-focused detail -- never trips the safety denylist, for every track", () => {
  for (const goalType of ["emotion_only", "action", "combined"] as const) {
    const state = {
      ...fresh(),
      currentStep: "mini_encoding" as const,
      goalType,
      supportiveBodyArea: "chest" as const,
      supportiveSensation: "רוגע",
      positiveMovement: "יישור הגב",
      desiredFeelingText: "רוגע",
      firstAction: "לכתוב דוח",
    };
    const content = getStepContent(state);
    assert.equal(content.primary, resolveEncodingMantra(state), "primary must be exactly the shared, auto-computed Encoding mantra");
    assert.match(content.primary, /תחושת רוגע/, "the mantra must name the trainee's own selected feeling");
    assert.ok(content.supporting.some((line) => line.includes("רוגע") && line.includes("יישור הגב")), "the chosen sensation/movement must still appear, as supporting detail");
    assert.equal(containsInductionPattern(content.primary), false);
    for (const line of content.supporting) assert.equal(containsInductionPattern(line), false);
  }
});

test("mini_action names both actions for Combined, only the identity one for Task, and leads into the emotional action for Emotional -- never trips the safety denylist", () => {
  const combined = getStepContent({ ...fresh(), currentStep: "mini_action", goalType: "combined" });
  assert.match(combined.primary + combined.supporting.join(" "), /לפתוח את המחשב/);
  const action = getStepContent({ ...fresh(), currentStep: "mini_action", goalType: "action" });
  assert.match(action.primary, /לפתוח את המחשב/);
  for (const goalType of ["emotion_only", "action", "combined"] as const) {
    const content = getStepContent({ ...fresh(), currentStep: "mini_action", goalType });
    assert.equal(containsInductionPattern(content.primary), false);
  }
});

test("every screen shows at most two supporting instructions, per the task's own display requirement", () => {
  const state = reachAcceptance("action", true);
  for (const step of ["goal_select", "desired_ending", "emotion", "thought", "center_attention", "acceptance", "acceptance_part_two", "regulation"] as const) {
    const content = getStepContent({ ...state, currentStep: step, subIndex: 0 });
    assert.ok(content.supporting.length <= 2, `${step} must show at most two supporting lines, got ${content.supporting.length}`);
  }
});

// --- Unified awareness/urge/thought/interpretation update -----------------

// ARCHI -- Universal ARC Routing, Emotion Identification & Android
// Shortcuts task, requirement 6: 'thought' now captures ONLY the
// thought -- interpretation has its own dedicated 'interpretation'
// step instead, never merged into this one screen any more.
test("'thought' asks only about the thought -- interpretation has moved to its own dedicated 'interpretation' step", () => {
  const content = getStepContent({ ...fresh(), currentStep: "thought" });
  assert.equal(content.title, "מחשבה");
  assert.ok(content.supporting.some((line) => line.includes("מחשבה") && line.includes("רשות")));
  assert.ok(!content.supporting.some((line) => line.includes("פרשנות")), "the thought screen must never ask about interpretation any more");
});

test("'interpretation' asks only about the interpretation, as its own dedicated optional step", () => {
  const content = getStepContent({ ...fresh(), currentStep: "interpretation" });
  assert.equal(content.title, "פרשנות");
  assert.ok(content.supporting.some((line) => line.includes("פרשנות") && line.includes("רשות")));
});

// Required test 3: an interpretation alone (mode A) -- a single fixed
// line, never the time-classification question, never a reality
// mantra, never claiming agreement with the interpretation's content.
// ARCHI Universal ARC Routing task, requirement 7: mode A's own fixed
// line now lives on its OWN dedicated "interpretation_acceptance" step
// -- never reality_acceptance any more, which is now reachable only
// with a real thought.
test("test 3: interpretation_acceptance shows the fixed Presence-circle interpretation mantra, never the time question or a reality mantra", () => {
  const content = getStepContent({ ...fresh(), currentStep: "interpretation_acceptance", subIndex: 0, currentThought: null, interpretationText: "הוא לא אוהב אותי", thoughtTimeOrientation: null });
  assert.equal(content.title, "קבלת הפרשנות");
  assert.equal(content.primary, "אני מביט בנקודה ונותן מקום לפרשנות שלי.");
  assert.deepEqual(content.supporting, []);
  assert.doesNotMatch(content.primary, /לאיזה זמן/);
  assert.equal(containsInductionPattern(content.primary), false);
});

test("test 9 (Mini): mini_reality_acceptance with an interpretation but NO thought shows the SAME fixed Presence-circle line as Full ARC's own mode-A screen", () => {
  const content = getStepContent({ ...fresh(), currentStep: "mini_reality_acceptance", currentThought: null, interpretationText: "הוא לא אוהב אותי", thoughtTimeOrientation: null });
  assert.equal(content.title, "קבלת הפרשנות");
  assert.equal(content.primary, "אני מביט בנקודה ונותן מקום לפרשנות שלי.");
});

// Required test 5: thought AND interpretation together -- ONE combined
// line during field-widening, never two separate acceptance screens.
test("visual_field's fixed mantra is unaffected by thought+interpretation combinations too (Full ARC) -- the old mode-dependent weaving is gone for Full ARC's visual_field, while Mini ARC's own mini_presence keeps weaving it (test 9 below, a different, unaffected step)", () => {
  const both = getStepContent({ ...fresh(), currentStep: "visual_field", subIndex: 0, currentThought: "מחשבה", interpretationText: "פרשנות" });
  assert.equal(both.primary, "אני מרחיב את שדה הראייה.");
  assert.equal(containsInductionPattern(both.primary), false);

  const interpretationOnly = getStepContent({ ...fresh(), currentStep: "visual_field", subIndex: 0, currentThought: null, interpretationText: "פרשנות" });
  assert.equal(interpretationOnly.primary, "אני מרחיב את שדה הראייה.");
});

test("test 9 (Mini): mini_presence combines thought AND interpretation acceptance into ONE line when both exist, alongside the existing body-sensation line", () => {
  const both = getStepContent({ ...fresh(), currentStep: "mini_presence", currentThought: "מחשבה", interpretationText: "פרשנות" });
  assert.match(both.primary, /אפשר למחשבה להיות נוכחת/);
  assert.match(both.primary, /מפרש כרגע את המציאות/);
  assert.match(both.primary, /תחושה הלא נעימה/);
  assert.equal(containsInductionPattern(both.primary), false);

  const interpretationOnly = getStepContent({ ...fresh(), currentStep: "mini_presence", currentThought: null, interpretationText: "פרשנות" });
  assert.doesNotMatch(interpretationOnly.primary, /פרשנות|מפרש/, "interpretation-only (mode A) adds nothing extra here -- its own acceptance already happened before presence");
});

// Unified ARC & Productivity Update task, requirement 6: 'mini_thought'
// is Mini ARC's own distinctive opening -- "an optional brief
// awareness choice: Thought / Interpretation / Urge... do not force
// completing all three" -- never the old always-both thought AND
// interpretation screen.
test("'mini_thought' frames a single optional awareness choice among thought/interpretation/urge, never forcing all three", () => {
  const content = getStepContent({ ...fresh(), arcInvocationMode: "plannedMini", currentStep: "mini_thought" });
  assert.notEqual(content.title, "מחשבה ופרשנות");
  assert.ok(content.primary.includes("מחשבה") && content.primary.includes("פרשנות") && content.primary.includes("דחף"));
  assert.ok(content.supporting.some((line) => line.includes("לכל היותר אחד")), "must make clear at most one of the three may be chosen");
  assert.equal(containsInductionPattern(content.primary), false);
});

// --- ARC LIVE emotion-based body suggestions task, section 10 test 4/13: exact
// Hebrew wording for the emotion-named body-area question --------------------

test("section 10, test 4/13: unpleasant_area_question names the selected emotion with grammatically correct Hebrew phrasing, for every predefined emotion", () => {
  const expected: Record<Exclude<EmotionSelection, "other">, string> = {
    fear: "איפה בגוף אתה מרגיש את הפחד?",
    frustration: "איפה בגוף אתה מרגיש את התסכול?",
    overwhelm: "איפה בגוף אתה מרגיש את העומס?",
    boredom: "איפה בגוף אתה מרגיש את השעמום?",
    anger: "איפה בגוף אתה מרגיש את הכעס?",
    sadness: "איפה בגוף אתה מרגיש את העצב?",
    shame: "איפה בגוף אתה מרגיש את הבושה?",
    lack_of_motivation: "איפה בגוף אתה מרגיש את חוסר המוטיבציה?",
    tiredness: "איפה בגוף אתה מרגיש את העייפות?",
  };
  for (const [emotion, expectedText] of Object.entries(expected)) {
    const content = getStepContent({ ...fresh(), currentStep: "unpleasant_area_question", selectedEmotion: emotion as EmotionSelection });
    assert.equal(content.primary, expectedText);
  }
});

test("section 10, test 4/13: unpleasant_area_question uses the trainee's own custom emotion text when 'other' was chosen, and the neutral fallback when no emotion was ever selected", () => {
  const custom = getStepContent({ ...fresh(), currentStep: "unpleasant_area_question", selectedEmotion: "other", customEmotionText: "קנאה" });
  assert.equal(custom.primary, "איפה בגוף אתה מרגיש את התחושה של קנאה?");

  const none = getStepContent({ ...fresh(), currentStep: "unpleasant_area_question", selectedEmotion: null });
  assert.equal(none.primary, "איפה בגוף אתה מרגיש תחושה לא נעימה, אם קיימת?");
});

// --- ARC Full Sequence Update task, Part 1 steps 4-5 (Choose/Locate the Desired Feeling) ---
//
// Final ARC Flow & Body Animation task: "desired_feeling_locate" is no
// longer part of the active step order (superseded by "Select Opening
// Regions") -- its own content function and tests below stay, unchanged,
// as dead-but-correct code for a session that might still resume there
// from an old build; see migrateLegacyNewArcLiveStep's own forward
// migration to "body_scan_opening_region" for every session that reaches
// this step going forward.

test("desired_feeling_select asks the exact required question, with no interpolation and no preset text baked into the primary line itself", () => {
  const content = getStepContent({ ...fresh(), currentStep: "desired_feeling_select" });
  assert.equal(content.primary, "מה היית רוצה להרגיש?");
});

test("desired_feeling_locate's question names the exact chosen feeling, for every DESIRED_FEELING_OPTIONS preset, verbatim as the spec's own examples require", () => {
  const expected: Record<string, string> = {
    רוגע: "איפה בגוף אתה מרגיש כרגע את תחושת הרוגע?",
    ביטחון: "איפה בגוף אתה מרגיש כרגע את תחושת הביטחון?",
    קלילות: "איפה בגוף אתה מרגיש כרגע את תחושת הקלילות?",
    חופש: "איפה בגוף אתה מרגיש כרגע את תחושת החופש?",
    נינוחות: "איפה בגוף אתה מרגיש כרגע את תחושת הנינוחות?",
    שמחה: "איפה בגוף אתה מרגיש כרגע את תחושת השמחה?",
    יציבות: "איפה בגוף אתה מרגיש כרגע את תחושת היציבות?",
  };
  for (const [feeling, question] of Object.entries(expected)) {
    const content = getStepContent({ ...fresh(), currentStep: "desired_feeling_locate", desiredFeelingText: feeling });
    assert.equal(content.primary, question, `preset '${feeling}' must produce exactly the spec's own personalized question`);
  }
});

test("desired_feeling_locate falls back to a safe generic phrasing for a free-typed custom feeling, never guessing broken Hebrew grammar", () => {
  const content = getStepContent({ ...fresh(), currentStep: "desired_feeling_locate", desiredFeelingText: "התרחבות" });
  assert.equal(content.primary, "איפה בגוף אתה מרגיש כרגע את התחושה של התרחבות?");
});

// Final ARC Flow & Body Animation task, requirement 5: Acceptance/
// Regulation/Encoding no longer interpolate the chosen desired feeling
// or its confirmed body location AT ALL -- each is now a fixed (or,
// for Encoding, action-computed) mantra that never varies with
// desiredFeelingText/desiredFeelingBodyAreas. The continuity these old
// tests checked for ("the same feeling/location referenced
// consistently across all three stages") still holds, but trivially
// now: the SAME fixed/computed text is returned regardless of those
// fields, verified directly above ("Acceptance is exactly the spec's
// own fixed mantra... regardless of any region/feeling selections").

// --- Fix All Confirmed ARC Android Bugs task, requirement 2: the exact 5 given Presence mantras, one per page, verbatim ---

test("the 5 Presence steps each show their own exact, verbatim first-person mantra, with no supporting lines (requirement 2's exact given wording, one per page)", () => {
  const exactMantraByStep: Record<string, string> = {
    center_attention: "אני ממקד את המבט בנקודה.",
    visual_field: "אני מרחיב את שדה הראייה.",
    sound_awareness: "אני מקשיב לצלילים סביבי.",
    body_scan: "אני מרגיש את הגוף שלי.",
    natural_breathing: "אני נוכח כאן ועכשיו.",
  };
  for (const [step, mantra] of Object.entries(exactMantraByStep)) {
    const content = getStepContent({ ...fresh(), currentStep: step as NewArcLiveStepId });
    assert.equal(content.primary, mantra, `${step} must show exactly "${mantra}"`);
    assert.deepEqual(content.supporting, [], `${step} must show no supporting lines -- the mantra is the whole page, inside the circle`);
  }
  // "focus_color" is deliberately EXCLUDED from this mantra set -- it stays its own real color-selection screen.
  const focusColor = getStepContent({ ...fresh(), currentStep: "focus_color" });
  assert.notEqual(focusColor.primary, "אני ממקד את המבט בנקודה.");
  assert.ok(!Object.values(exactMantraByStep).includes(focusColor.primary), "focus_color must never show one of the 5 Presence mantras -- it is a genuine selection screen, never mantra-ified");
});
